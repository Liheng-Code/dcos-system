-- WBS Templates: a reusable full project WBS (nodes + activities) COPIED into a project.
--
-- Rules (plan: "WBS Templates"):
--   * wbs_templates.content holds one template document (validated in apps/web/lib/project/wbs/wbs-template.ts):
--       { schema: 1,
--         sections:            {nodes, tasks}   -- fixed tree (Design, Procurement, Construction, ...)
--         building_anchor_key: text | null     -- where buildings are created (null = project root)
--         floor_blocks:        {basement?, ground?, typical?, roof?: {nodes, tasks}} }
--     Each level of a building gets the block for its level type (fallback: typical).
--   * Applying = the app expands the document into an import_master_wbs payload and calls
--     apply_wbs_template(), which runs import_master_wbs in 'merge' mode (anything already in the
--     project is skipped) and sets level attributes on the level nodes it created.
--   * The copy is independent: template edits never reach projects; project edits never reach
--     the template. projects.wbs_template_id only records which template was used.
--   * Managed by admins / master_libraries editors (can_manage_master_libraries()); each save
--     through save_wbs_template() bumps the version once.
-- Replaces the old node-tree templates: the 5 seeded samples are removed; wbs_template_nodes and
-- generate_wbs_from_master_template(s)() are deprecated and no longer used by the app.
-- Idempotent.

alter table public.wbs_templates add column if not exists content jsonb not null default '{}'::jsonb;
alter table public.wbs_templates add column if not exists version integer not null default 1;
alter table public.wbs_templates add column if not exists default_level_template_id uuid;
alter table public.wbs_templates add column if not exists source text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'wbs_templates_default_level_template_id_fkey') then
    alter table public.wbs_templates add constraint wbs_templates_default_level_template_id_fkey
      foreign key (default_level_template_id) references public.level_naming_templates(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wbs_templates_source_check') then
    alter table public.wbs_templates add constraint wbs_templates_source_check
      check (source is null or source in ('project', 'excel', 'manual'));
  end if;
end $$;

comment on table public.wbs_template_nodes is
  'Deprecated (20261003000004): WBS templates are stored in wbs_templates.content. Not used by the app.';

-- Remove the seeded sample templates (old node-tree format, never used by a project).
delete from public.wbs_templates
 where content = '{}'::jsonb
   and template_name in ('High-Rise Building', 'Infrastructure', 'Factory / Industrial', 'Residential Tower', 'Hospital')
   and not exists (select 1 from public.projects p where p.wbs_template_id = wbs_templates.id);

drop policy if exists "Admins can manage wbs_templates" on public.wbs_templates;
drop policy if exists "WBS templates managed by master library editors" on public.wbs_templates;
create policy "WBS templates managed by master library editors" on public.wbs_templates
  for all to authenticated
  using (public.can_manage_master_libraries())
  with check (public.can_manage_master_libraries());

-- ── Save (create or replace) a template; bumps version once per save ───────
-- p: {id?, template_name, template_desc?, template_category?, is_active?, source?,
--     default_level_template_id?, content}. Returns the template id.
create or replace function public.save_wbs_template(p jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if coalesce(btrim(p->>'template_name'), '') = '' then
    raise exception 'Template name is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p->'content') is distinct from 'object' then
    raise exception 'Template content is required' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.wbs_templates
      (template_name, template_desc, template_category, is_active, source, default_level_template_id, content, version, created_by)
    values
      (btrim(p->>'template_name'), nullif(p->>'template_desc', ''), nullif(p->>'template_category', ''),
       coalesce((p->>'is_active')::boolean, true), nullif(p->>'source', ''),
       nullif(p->>'default_level_template_id', '')::uuid, p->'content', 1, auth.uid())
    returning id into v_id;
  else
    update public.wbs_templates
       set template_name             = btrim(p->>'template_name'),
           template_desc             = nullif(p->>'template_desc', ''),
           template_category         = nullif(p->>'template_category', ''),
           is_active                 = coalesce((p->>'is_active')::boolean, is_active),
           source                    = coalesce(nullif(p->>'source', ''), source),
           default_level_template_id = nullif(p->>'default_level_template_id', '')::uuid,
           content                   = p->'content',
           version                   = version + 1,
           updated_at                = now()
     where id = v_id;
    if not found then
      raise exception 'Template not found or not permitted' using errcode = '42501';
    end if;
  end if;
  return v_id;
end $$;

-- ── Apply an expanded template to a project ─────────────────────────────────
-- p_payload: import_master_wbs payload {nodes, tasks} produced by the app from the template.
-- p_levels:  [{key, level_type, floor_height_m, typical_gfa_m2, source_level_template_id?}]
--            attributes for level nodes; applied only to levels created by this call.
-- Returns the import summary plus levels_updated.
create or replace function public.apply_wbs_template(
  p_project_id uuid, p_template_id uuid, p_payload jsonb, p_levels jsonb default '[]'::jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_before  text[];
  v_result  jsonb;
  v_lvl     jsonb;
  v_node    uuid;
  v_type    text;
  v_gfa     numeric;
  v_ver     integer;
  v_updated integer := 0;
begin
  if p_project_id is null then
    raise exception 'Project is required' using errcode = '22023';
  end if;

  with recursive chain as (
    select id, wbs_code::text as k from public.wbs_nodes where project_id = p_project_id and parent_id is null
    union all
    select n.id, c.k || '.' || n.wbs_code from public.wbs_nodes n join chain c on n.parent_id = c.id
  )
  select coalesce(array_agg(k), '{}') into v_before from chain;

  v_result := public.import_master_wbs(p_project_id, p_payload, 'merge');

  for v_lvl in select e from jsonb_array_elements(coalesce(p_levels, '[]'::jsonb)) e loop
    continue when (v_lvl->>'key') = any(v_before);
    with recursive chain as (
      select id, wbs_code::text as k from public.wbs_nodes where project_id = p_project_id and parent_id is null
      union all
      select n.id, c.k || '.' || n.wbs_code from public.wbs_nodes n join chain c on n.parent_id = c.id
    )
    select id into v_node from chain where k = v_lvl->>'key' limit 1;
    continue when v_node is null;

    v_type := coalesce(nullif(v_lvl->>'level_type', ''), 'typical');
    v_ver := null;
    if nullif(v_lvl->>'source_level_template_id', '') is not null then
      select version into v_ver from public.level_naming_templates where id = (v_lvl->>'source_level_template_id')::uuid;
    end if;
    update public.wbs_nodes
       set level_type     = v_type,
           floor_height_m = nullif(v_lvl->>'floor_height_m', '')::numeric,
           is_basement    = v_type = 'basement',
           is_below_ground = v_type = 'basement' or is_below_ground,
           source_level_template_id      = case when v_ver is not null then (v_lvl->>'source_level_template_id')::uuid end,
           source_level_template_version = v_ver
     where id = v_node and node_type = 'level';

    v_gfa := nullif(v_lvl->>'typical_gfa_m2', '')::numeric;
    if v_gfa is not null and v_gfa > 0 then
      insert into public.wbs_node_quantities (wbs_node_id, project_id, metric_code, value, unit, source, created_by)
      values (v_node, p_project_id, 'GFA', v_gfa, 'm2', 'WBS template', auth.uid())
      on conflict (wbs_node_id, metric_code) do nothing;
    end if;
    v_updated := v_updated + 1;
  end loop;

  if p_template_id is not null then
    update public.projects set wbs_template_id = p_template_id where id = p_project_id;
  end if;

  return v_result || jsonb_build_object('levels_updated', v_updated);
end $$;

grant execute on function public.save_wbs_template(jsonb) to authenticated;
grant execute on function public.apply_wbs_template(uuid, uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.save_wbs_template(jsonb) from anon, public;
revoke execute on function public.apply_wbs_template(uuid, uuid, jsonb, jsonb) from anon, public;
