-- =============================================================================
-- Seed: development demo project (fictional data)
-- =============================================================================
-- Gives a freshly started local stack something to open: one awarded project
-- with a small WBS and a handful of scheduled tasks. Everything here is made
-- up; it is the starting point for developers who do not have (and must not be
-- given) a copy of real company data.
--
-- Applied automatically on a fresh `supabase start` (see [db.seed] in
-- supabase/config.toml), after staff_list-seed.sql, which creates the demo
-- users (password for all of them: dcosdemo#2026).
--
-- Idempotent: does nothing if project DEMO-001 already exists. Module-specific
-- sample data belongs in a separate seed owned by that module.

do $$
declare
  v_project uuid;
  v_pm      uuid;
  v_admin   uuid;
  v_bld     uuid;
  v_sub     uuid;
  v_l1      uuid;
  v_l2      uuid;
  v_group   uuid;
begin
  if exists (select 1 from public.projects where project_code = 'DEMO-001') then
    return;
  end if;

  select id into v_pm from public.profiles where email = 'vuthy@dcos.com';
  select id into v_admin from public.profiles where email = 'liheng@dcos.com';

  insert into public.projects (
    project_code, project_name, short_name, project_type, project_status,
    category, building_type, contract_type, contract_value, currency,
    start_date, end_date, location, description, project_manager_id
  ) values (
    'DEMO-001', 'Demo Office Building', 'Demo Office', 'awarded', 'active',
    'commercial', 'office_building', 'lump_sum', 2500000, 'USD',
    date '2026-11-02', date '2027-10-29', 'Phnom Penh',
    'Fictional project for local development. Safe to edit or delete.', v_pm
  ) returning id into v_project;

  insert into public.project_members (project_id, user_id, role_code)
  select v_project, u, r
  from (values (v_pm, 'L3'), (v_admin, 'L1')) as m(u, r)
  where u is not null
  on conflict do nothing;

  -- WBS: building > substructure / levels > work packages
  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, wbs_outline_code)
  values (v_project, null, 'building', 'B01', 'Main Building', 1, '01')
  returning id into v_bld;

  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, wbs_outline_code, is_below_ground)
  values (v_project, v_bld, 'level', 'L00', 'Substructure', 1, '01.01', true)
  returning id into v_sub;

  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, wbs_outline_code)
  values (v_project, v_bld, 'level', 'L01', 'Ground Floor', 2, '01.02')
  returning id into v_l1;

  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, wbs_outline_code)
  values (v_project, v_bld, 'level', 'L02', 'First Floor', 3, '01.03')
  returning id into v_l2;

  -- Substructure
  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, wbs_outline_code, discipline)
  values (v_project, v_sub, 'task_group', 'T01', 'Foundations', 1, '01.01.01', 'Structural')
  returning id into v_group;

  insert into public.wbs_tasks (project_id, wbs_node_id, task_code, task_name, discipline, status, progress, start_date, end_date, sort_order, wbs_outline_code)
  values
    (v_project, v_group, 'DEMO-T001', 'Site clearance and setting out', 'Structural', 'completed',   100, date '2026-11-02', date '2026-11-13', 1, '01.01.01.01'),
    (v_project, v_group, 'DEMO-T002', 'Excavation',                     'Structural', 'in_progress',  60, date '2026-11-16', date '2026-12-04', 2, '01.01.01.02'),
    (v_project, v_group, 'DEMO-T003', 'Pad footings and ground beams',  'Structural', 'open',          0, date '2026-12-07', date '2027-01-15', 3, '01.01.01.03');

  -- Ground floor
  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, wbs_outline_code, discipline)
  values (v_project, v_l1, 'task_group', 'T02', 'Structure', 1, '01.02.01', 'Structural')
  returning id into v_group;

  insert into public.wbs_tasks (project_id, wbs_node_id, task_code, task_name, discipline, status, progress, start_date, end_date, sort_order, wbs_outline_code)
  values
    (v_project, v_group, 'DEMO-T004', 'Columns and walls', 'Structural', 'open', 0, date '2027-01-18', date '2027-02-12', 1, '01.02.01.01'),
    (v_project, v_group, 'DEMO-T005', 'Slab and beams',    'Structural', 'open', 0, date '2027-02-15', date '2027-03-12', 2, '01.02.01.02');

  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, wbs_outline_code, discipline)
  values (v_project, v_l1, 'task_group', 'T03', 'Architectural Finishes', 2, '01.02.02', 'Architectural')
  returning id into v_group;

  insert into public.wbs_tasks (project_id, wbs_node_id, task_code, task_name, discipline, status, progress, start_date, end_date, sort_order, wbs_outline_code)
  values
    (v_project, v_group, 'DEMO-T006', 'Blockwork and plastering', 'Architectural', 'open', 0, date '2027-03-15', date '2027-04-23', 1, '01.02.02.01'),
    (v_project, v_group, 'DEMO-T007', 'Floor and wall tiling',    'Architectural', 'open', 0, date '2027-04-26', date '2027-05-28', 2, '01.02.02.02');

  -- First floor
  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, wbs_outline_code, discipline)
  values (v_project, v_l2, 'task_group', 'T04', 'MEP First Fix', 1, '01.03.01', 'MEP')
  returning id into v_group;

  insert into public.wbs_tasks (project_id, wbs_node_id, task_code, task_name, discipline, status, progress, start_date, end_date, sort_order, wbs_outline_code, is_milestone)
  values
    (v_project, v_group, 'DEMO-T008', 'Electrical conduits and containment', 'MEP', 'open', 0, date '2027-03-15', date '2027-04-09', 1, '01.03.01.01', false),
    (v_project, v_group, 'DEMO-T009', 'Plumbing and drainage first fix',     'MEP', 'open', 0, date '2027-03-22', date '2027-04-16', 2, '01.03.01.02', false),
    (v_project, v_group, 'DEMO-T010', 'Practical completion',                'MEP', 'open', 0, date '2027-10-29', date '2027-10-29', 3, '01.03.01.03', true);
end;
$$;
