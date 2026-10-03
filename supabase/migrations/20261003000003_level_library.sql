-- Level Library: company level templates that are COPIED into a building's WBS.
--
-- Rules (plan: "Level Library"):
--   * A template (level_naming_templates header + level_template_items rows) is an ordered set of
--     levels: code, name, type, floor-to-floor height, typical GFA.
--   * Applying a template to a building copies the (user-edited) list into wbs_nodes level rows
--     and GFA into wbs_node_quantities. The copy is independent: later template edits never
--     reach the project, and project edits never reach the template. The level row only records
--     which template + version it came from (reference only).
--   * Templates are managed by admins / master_libraries editors (can_manage_master_libraries()).
--     Each save through save_level_template() bumps the template version once.
-- level_naming_templates.config (jsonb) is superseded by level_template_items and no longer read.
-- Idempotent; existing data is kept.

-- ── Single-level library ────────────────────────────────────────────────────
alter table public.level_master add column if not exists default_floor_height_m numeric(6,2);

-- ── Template header ─────────────────────────────────────────────────────────
alter table public.level_naming_templates add column if not exists version integer not null default 1;
alter table public.level_naming_templates add column if not exists building_type text;
comment on column public.level_naming_templates.config is
  'Deprecated: superseded by level_template_items (20261003000003). Not read by the app.';

drop policy if exists "Authenticated users can manage level naming templates" on public.level_naming_templates;
drop policy if exists "Level templates managed by master library editors" on public.level_naming_templates;
create policy "Level templates managed by master library editors" on public.level_naming_templates
  for all to authenticated
  using (public.can_manage_master_libraries())
  with check (public.can_manage_master_libraries());

-- ── Template items ──────────────────────────────────────────────────────────
create table if not exists public.level_template_items (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references public.level_naming_templates(id) on delete cascade,
  sort_order      integer not null default 0,
  level_code      text not null check (btrim(level_code) <> ''),
  level_name      text not null check (btrim(level_name) <> ''),
  level_type      text not null default 'typical'
                  check (level_type in ('basement','ground','mezzanine','podium','typical','penthouse','roof','other')),
  floor_height_m  numeric(6,2) check (floor_height_m is null or floor_height_m > 0),
  typical_gfa_m2  numeric(14,2) check (typical_gfa_m2 is null or typical_gfa_m2 >= 0),
  source_level_id uuid references public.level_master(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (template_id, level_code)
);
create index if not exists idx_level_template_items_template on public.level_template_items (template_id, sort_order);

alter table public.level_template_items enable row level security;
drop policy if exists "Level template items viewable" on public.level_template_items;
create policy "Level template items viewable" on public.level_template_items
  for select to authenticated using (true);
drop policy if exists "Level template items managed by master library editors" on public.level_template_items;
create policy "Level template items managed by master library editors" on public.level_template_items
  for all to authenticated
  using (public.can_manage_master_libraries())
  with check (public.can_manage_master_libraries());
grant select, insert, update, delete on public.level_template_items to authenticated;
revoke all on public.level_template_items from anon;

-- Level type from a code: B1 / B01 / LVL-B1 / 00.UG -> basement, GF / G00 -> ground, ...
-- Mirrors inferLevelType() in apps/web/lib/level-library.ts.
create or replace function public.infer_level_type(p_code text)
returns text language sql immutable as $$
  select case
    when c ~ '^(B\d|BASEMENT|UG|LG|BSM)' then 'basement'
    when c ~ '^(G$|GF|G\d|GROUND)' then 'ground'
    when c ~ '^(M\d|M$|MZ|MEZZ)' then 'mezzanine'
    when c ~ '^(P\d|POD)' then 'podium'
    when c ~ '^PH' then 'penthouse'
    when c ~ '^(R\d|R$|RF|RT|ROOF)' then 'roof'
    else 'typical' end
  from (select regexp_replace(regexp_replace(upper(btrim(coalesce(p_code, ''))), '^LVL-', ''), '^\d+\.', '') as c) t
$$;

-- Backfill items from the old jsonb config (only for templates that have no items yet).
insert into public.level_template_items (template_id, sort_order, level_code, level_name, level_type)
select t.id, e.ord::int, e.v->>'code', coalesce(nullif(e.v->>'name', ''), e.v->>'code'), public.infer_level_type(e.v->>'code')
from public.level_naming_templates t
cross join lateral jsonb_array_elements(case when jsonb_typeof(t.config) = 'array' then t.config else '[]'::jsonb end)
  with ordinality as e(v, ord)
where coalesce(btrim(e.v->>'code'), '') <> ''
  and not exists (select 1 from public.level_template_items i where i.template_id = t.id)
on conflict (template_id, level_code) do nothing;

-- ── Project copy: provenance + level attributes on wbs_nodes ────────────────
alter table public.wbs_nodes add column if not exists level_type text;
alter table public.wbs_nodes add column if not exists floor_height_m numeric(6,2);
alter table public.wbs_nodes add column if not exists source_level_template_id uuid;
alter table public.wbs_nodes add column if not exists source_level_template_version integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'wbs_nodes_source_level_template_id_fkey') then
    alter table public.wbs_nodes add constraint wbs_nodes_source_level_template_id_fkey
      foreign key (source_level_template_id) references public.level_naming_templates(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wbs_nodes_level_type_check') then
    alter table public.wbs_nodes add constraint wbs_nodes_level_type_check check (level_type is null or
      level_type in ('basement','ground','mezzanine','podium','typical','penthouse','roof','other'));
  end if;
end $$;

-- ── Save a template (header + items) atomically; bumps version once per save ──
-- p: {id?, template_name, description?, building_type?, is_active?, items:[{level_code, level_name,
--     level_type?, floor_height_m?, typical_gfa_m2?, source_level_id?}]}. Returns the template id.
create or replace function public.save_level_template(p jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if coalesce(btrim(p->>'template_name'), '') = '' then
    raise exception 'Template name is required' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.level_naming_templates (template_name, description, building_type, is_active, config, version)
    values (btrim(p->>'template_name'), nullif(p->>'description', ''), nullif(p->>'building_type', ''),
            coalesce((p->>'is_active')::boolean, true), '[]'::jsonb, 1)
    returning id into v_id;
  else
    update public.level_naming_templates
       set template_name = btrim(p->>'template_name'),
           description   = nullif(p->>'description', ''),
           building_type = nullif(p->>'building_type', ''),
           is_active     = coalesce((p->>'is_active')::boolean, is_active),
           version       = version + 1,
           updated_at    = now()
     where id = v_id;
    if not found then
      raise exception 'Template not found or not permitted' using errcode = '42501';
    end if;
    delete from public.level_template_items where template_id = v_id;
  end if;

  insert into public.level_template_items
    (template_id, sort_order, level_code, level_name, level_type, floor_height_m, typical_gfa_m2, source_level_id)
  select v_id, e.ord::int, upper(btrim(e.v->>'level_code')), btrim(e.v->>'level_name'),
         coalesce(nullif(e.v->>'level_type', ''), public.infer_level_type(e.v->>'level_code')),
         nullif(e.v->>'floor_height_m', '')::numeric, nullif(e.v->>'typical_gfa_m2', '')::numeric,
         nullif(e.v->>'source_level_id', '')::uuid
  from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) with ordinality as e(v, ord);

  return v_id;
end $$;

-- ── Apply a (user-edited) level list to a building ──────────────────────────
-- Copies p_items under the building as level nodes (+ GFA). Codes already present under the
-- building are skipped, never overwritten. p_template_id only records provenance; the template
-- itself is not read or changed. Returns {created:[codes], skipped:[codes]}.
create or replace function public.apply_level_template(p_building_id uuid, p_template_id uuid, p_items jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_project uuid;
  v_type    text;
  v_version integer;
  v_tname   text;
  v_sort    bigint;
  v_item    jsonb;
  v_code    text;
  v_ltype   text;
  v_node    uuid;
  v_gfa     numeric;
  v_created text[] := '{}';
  v_skipped text[] := '{}';
begin
  select project_id, node_type into v_project, v_type from public.wbs_nodes where id = p_building_id;
  if v_project is null then
    raise exception 'Building not found' using errcode = 'P0002';
  end if;
  if v_type <> 'building' then
    raise exception 'Levels can only be applied to a building node' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
       where coalesce(btrim(e->>'level_code'), '') = '' or coalesce(btrim(e->>'level_name'), '') = '') > 0 then
    raise exception 'Every level needs a code and a name' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct upper(btrim(e->>'level_code')))
        from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e) then
    raise exception 'Level codes must be unique' using errcode = '23505';
  end if;

  if p_template_id is not null then
    select version, template_name into v_version, v_tname from public.level_naming_templates where id = p_template_id;
  end if;

  select coalesce(max(sort_order), 0) into v_sort from public.wbs_nodes where parent_id = p_building_id;

  for v_item in select e from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e loop
    v_code := upper(btrim(v_item->>'level_code'));
    if exists (select 1 from public.wbs_nodes
                where parent_id = p_building_id and upper(wbs_code) = v_code) then
      v_skipped := v_skipped || v_code;
      continue;
    end if;
    v_ltype := coalesce(nullif(v_item->>'level_type', ''), public.infer_level_type(v_code));
    v_sort := v_sort + 1;
    insert into public.wbs_nodes
      (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status,
       is_basement, is_below_ground, level_type, floor_height_m,
       source_level_template_id, source_level_template_version)
    values
      (v_project, p_building_id, 'level', v_code, btrim(v_item->>'level_name'), v_sort, 'active',
       v_ltype = 'basement', v_ltype = 'basement', v_ltype,
       nullif(v_item->>'floor_height_m', '')::numeric,
       case when v_version is not null then p_template_id end, v_version)
    returning id into v_node;

    v_gfa := nullif(v_item->>'typical_gfa_m2', '')::numeric;
    if v_gfa is not null and v_gfa > 0 then
      insert into public.wbs_node_quantities (wbs_node_id, project_id, metric_code, value, unit, source, created_by)
      values (v_node, v_project, 'GFA', v_gfa, 'm2',
              coalesce('Level template: ' || v_tname, 'Level list'), auth.uid());
    end if;
    v_created := v_created || v_code;
  end loop;

  return jsonb_build_object('created', to_jsonb(v_created), 'skipped', to_jsonb(v_skipped));
end $$;

grant execute on function public.save_level_template(jsonb) to authenticated;
grant execute on function public.apply_level_template(uuid, uuid, jsonb) to authenticated;
grant execute on function public.infer_level_type(text) to authenticated;
revoke execute on function public.save_level_template(jsonb) from anon, public;
revoke execute on function public.apply_level_template(uuid, uuid, jsonb) from anon, public;
