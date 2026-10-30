-- Migration: 20261030164500_design_schedule_links_and_rls.sql
-- Purpose: Design MEP Commissioning, MEP Material Submittal and the Design Coordination Log become project records
--          linked to the Planning / QS catalogues:
--            design_mep_commissioning.tc_item_id               -> plan_act_tc_items            (Planning T&C item)
--            design_mep_material_submittal.resource_id         -> dwl_resources                (QS material)
--            design_coordination_log.coordination_item_id      -> plan_act_coordination_items  (Planning coordination item)
--          and their RLS changes from "any authenticated user, any project" (using true) to project members.
--          Design has no role_permissions rows (lib/modules/manifests/design.ts), so the check is is_project_member()
--          only; it is true for admins.
-- Depends on: the three design tables, plan_act_tc_items, plan_act_coordination_items, dwl_resources,
--             is_project_member(uuid) (all exist)
-- Additive columns. The three old "using (true)" policies are replaced: the tables held no rows (the UI inserted a
-- random project_id, which the projects FK rejected), so no existing access is lost. The other 16 design_* tables
-- keep their open policies until Design gets its own permission rows.

alter table public.design_mep_commissioning
  add column if not exists tc_item_id uuid references public.plan_act_tc_items(id) on delete set null;
alter table public.design_mep_material_submittal
  add column if not exists resource_id uuid references public.dwl_resources(id) on delete set null;
alter table public.design_coordination_log
  add column if not exists coordination_item_id uuid references public.plan_act_coordination_items(id) on delete set null;

create index if not exists design_mep_commissioning_project_id_idx on public.design_mep_commissioning (project_id);
create index if not exists design_mep_commissioning_tc_item_id_idx on public.design_mep_commissioning (tc_item_id);
create index if not exists design_mep_material_submittal_project_id_idx on public.design_mep_material_submittal (project_id);
create index if not exists design_mep_material_submittal_resource_id_idx on public.design_mep_material_submittal (resource_id);
create index if not exists design_coordination_log_project_id_idx on public.design_coordination_log (project_id);
create index if not exists design_coordination_log_coordination_item_id_idx on public.design_coordination_log (coordination_item_id);

comment on column public.design_mep_commissioning.tc_item_id is 'Planning T&C item (plan_act_tc_items) this commissioning record carries out.';
comment on column public.design_mep_material_submittal.resource_id is 'QS material (dwl_resources, category material) this submittal is for.';
comment on column public.design_coordination_log.coordination_item_id is 'Planning coordination item (plan_act_coordination_items) this log entry addresses.';

-- RLS: project members only ------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['design_mep_commissioning', 'design_mep_material_submittal', 'design_coordination_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists mep_cms_auth on public.%I', t);
    execute format('drop policy if exists mep_sub_auth on public.%I', t);
    execute format('drop policy if exists design_coord_auth on public.%I', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_project_member(project_id))', t || '_member_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_project_member(project_id))', t || '_member_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_project_member(project_id)) with check (public.is_project_member(project_id))', t || '_member_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_project_member(project_id))', t || '_member_delete', t);
  end loop;
end $$;
