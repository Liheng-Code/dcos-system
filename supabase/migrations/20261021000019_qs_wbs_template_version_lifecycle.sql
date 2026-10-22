-- Give QS estimate scaffolds an explicit draft/published/superseded/archive lifecycle.
-- Published templates and their child rows are immutable; new versions use a new row.

alter table public.qs_wbs_templates
  drop constraint if exists qs_wbs_templates_template_code_key;

alter table public.qs_wbs_templates
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists published_snapshot jsonb,
  add column if not exists supersedes_template_id uuid references public.qs_wbs_templates(id) on delete set null,
  add column if not exists superseded_by_template_id uuid references public.qs_wbs_templates(id) on delete set null,
  add column if not exists archived_at timestamptz;

alter table public.qs_wbs_templates
  add constraint qs_wbs_templates_lifecycle_status_chk
  check (lifecycle_status in ('draft', 'published', 'superseded', 'archived'));

create unique index if not exists uq_qs_wbs_templates_code_version
  on public.qs_wbs_templates(template_code, version)
  where lifecycle_status <> 'draft';
create index if not exists idx_qs_wbs_templates_lifecycle
  on public.qs_wbs_templates(lifecycle_status, is_active, sort_order);

-- Preserve current production behavior by treating existing active templates as
-- published, and freeze the exact header/items/location content they represent.
update public.qs_wbs_templates t
set lifecycle_status = case when t.is_active then 'published' else 'archived' end,
    published_at = case when t.is_active then coalesce(t.updated_at, now()) else null end,
    published_snapshot = case when t.is_active then jsonb_build_object(
      'header', to_jsonb(t),
      'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order, i.item_code)
        from public.qs_wbs_template_items i where i.template_id = t.id and i.is_active), '[]'::jsonb),
      'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.sort_order, l.level_code)
        from public.qs_wbs_template_locations l where l.template_id = t.id), '[]'::jsonb)
    ) else null end
where t.lifecycle_status = 'draft';

create or replace function public.enforce_qs_wbs_template_immutability()
returns trigger
language plpgsql
as $$
declare
  v_template_id uuid;
  v_status text;
begin
  if tg_table_name = 'qs_wbs_templates' then
    if tg_op = 'DELETE' then
      if old.lifecycle_status <> 'draft' then
        raise exception 'Only draft QS WBS templates may be deleted; archive published versions instead';
      end if;
      return old;
    end if;
    if old.lifecycle_status <> 'draft' and (
      new.template_code is distinct from old.template_code or
      new.title is distinct from old.title or
      new.building_type is distinct from old.building_type or
      new.standard_framework is distinct from old.standard_framework or
      new.description is distinct from old.description or
      new.template_category is distinct from old.template_category or
      new.building_types is distinct from old.building_types or
      new.template_family is distinct from old.template_family or
      new.location_model is distinct from old.location_model or
      new.published_snapshot is distinct from old.published_snapshot
    ) then
      raise exception 'Published QS WBS template content is immutable; create a new version';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_template_id := old.template_id;
  else
    v_template_id := new.template_id;
  end if;
  select lifecycle_status into v_status from public.qs_wbs_templates where id = v_template_id;
  if v_status is distinct from 'draft' then
    raise exception 'Only draft QS WBS template items and locations may be edited';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists qs_wbs_template_header_immutable on public.qs_wbs_templates;
create trigger qs_wbs_template_header_immutable
  before update or delete on public.qs_wbs_templates
  for each row execute function public.enforce_qs_wbs_template_immutability();
drop trigger if exists qs_wbs_template_items_immutable on public.qs_wbs_template_items;
create trigger qs_wbs_template_items_immutable
  before insert or update or delete on public.qs_wbs_template_items
  for each row execute function public.enforce_qs_wbs_template_immutability();
drop trigger if exists qs_wbs_template_locations_immutable on public.qs_wbs_template_locations;
create trigger qs_wbs_template_locations_immutable
  before insert or update or delete on public.qs_wbs_template_locations
  for each row execute function public.enforce_qs_wbs_template_immutability();

create or replace function public.publish_qs_wbs_template(p_template_id uuid)
returns public.qs_wbs_templates
language plpgsql
as $$
declare
  v_template public.qs_wbs_templates;
  v_snapshot jsonb;
  v_next_version integer;
begin
  if not public.can_manage_master_libraries() then
    raise exception 'You do not have permission to publish QS WBS templates';
  end if;
  select * into v_template from public.qs_wbs_templates where id = p_template_id for update;
  if not found then raise exception 'QS WBS template not found'; end if;
  if v_template.lifecycle_status <> 'draft' then
    raise exception 'Only draft QS WBS templates can be published';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_template.template_code, 0));
  select coalesce(max(version), 0) + 1 into v_next_version
    from public.qs_wbs_templates
    where template_code = v_template.template_code and lifecycle_status <> 'draft';
  v_snapshot := jsonb_build_object(
    'header', to_jsonb(v_template) - 'published_snapshot',
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order, i.item_code)
      from public.qs_wbs_template_items i where i.template_id = v_template.id and i.is_active), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.sort_order, l.level_code)
      from public.qs_wbs_template_locations l where l.template_id = v_template.id), '[]'::jsonb)
  );

  update public.qs_wbs_templates
  set lifecycle_status = 'superseded', superseded_by_template_id = p_template_id,
      is_active = false, updated_at = now()
  where template_code = v_template.template_code and lifecycle_status = 'published';

  update public.qs_wbs_templates
  set version = v_next_version, lifecycle_status = 'published', is_active = true,
      published_at = now(), published_by = auth.uid(), published_snapshot = v_snapshot,
      archived_at = null, updated_at = now()
  where id = p_template_id returning * into v_template;
  return v_template;
end;
$$;

create or replace function public.archive_qs_wbs_template(p_template_id uuid)
returns void
language plpgsql
as $$
begin
  if not public.can_manage_master_libraries() then
    raise exception 'You do not have permission to archive QS WBS templates';
  end if;
  update public.qs_wbs_templates
  set lifecycle_status = 'archived', is_active = false, archived_at = now(), updated_at = now()
  where id = p_template_id and lifecycle_status in ('published', 'superseded');
  if not found then raise exception 'Published or superseded QS WBS template not found'; end if;
end;
$$;

comment on column public.qs_wbs_templates.published_snapshot is
  'Frozen header, active items, and locations captured at publication; applications use the referenced version snapshot.';
comment on function public.publish_qs_wbs_template(uuid) is
  'Publishes a draft as the next template-code version, snapshots content, and supersedes the prior published version.';
