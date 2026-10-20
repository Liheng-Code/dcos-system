-- Migration: 20261020000003_planning_qs_bridge.sql
-- Purpose: Planning <-> QS bridge, Phase 1 (standards). See
--          docs/04-Business-Modules/06-Planning-Scheduling/21-Planning-QS-Bridge-Design.md.
--   1. plan_work_groups + wbs_nodes.work_group_code: the Work Group level under each
--      floor (ST, AR, M1, M2, QA ...) from the Standard Planning WBS (sheet 01, level 4).
--   2. plan_act_masters planning attributes: duration_basis (quantity / fixed /
--      programme), default_work_group, default_step_template_id. Not part of the
--      versioned content guarded by plan_act_master_guard (that guard lists its columns).
--   3. plan_act_qs_bridge: company rules saying which QS Element Library entries
--      (Sub Section > Sub Element, optional Discipline / Section / unit) feed which
--      quantity metric, with a unit factor; or are excluded as non-driving lines.
-- Data (masters, quantity rules, bridge rows, workbook norms) is seeded by
-- supabase/seeds/seed_planning_qs_bridge.sql.
-- Depends on: 20261006000001_activity_library_core.sql, 20260918000001_activity_step_templates.sql

-- ── 1. Work groups ─────────────────────────────────────────────────────────
create table if not exists public.plan_work_groups (
  code text primary key,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plan_work_groups is
  'Standard Work Group codes (level 4 of the Standard Planning WBS): the group of activities under a floor/area, e.g. ST Structural Works. Planning Type Code = building code + level code + work group code (e.g. BA-L03-ST).';

insert into public.plan_work_groups (code, name, description, sort_order) values
  ('EW', 'Earthwork',            'Excavation, support, dewatering, formation', 10),
  ('FD', 'Foundation',           'Piles, pile caps, ground beams', 20),
  ('ST', 'Structural Works',     'Columns, walls, beams, slabs, stairs', 30),
  ('WP', 'Waterproofing',        'Foundation, retaining, slab and roof waterproofing', 40),
  ('AR', 'Architectural Works',  'Blockwork, plaster, finishes, doors, windows, paint', 50),
  ('M1', 'MEP First Fix',        'Conduits, trays, pipes, ducts', 60),
  ('M2', 'MEP Second Fix',       'Cables, fixtures, equipment, devices', 70),
  ('ME', 'MEP',                  'MEP of basement / roof areas without a first/second fix split', 80),
  ('QA', 'Testing & Inspection', 'Inspection, testing, snagging, floor completion', 90)
on conflict (code) do nothing;

alter table public.plan_work_groups enable row level security;
drop policy if exists "plan_work_groups view" on public.plan_work_groups;
drop policy if exists "plan_work_groups manage" on public.plan_work_groups;
create policy "plan_work_groups view" on public.plan_work_groups for select to authenticated using (true);
create policy "plan_work_groups manage" on public.plan_work_groups for all to authenticated
  using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

drop trigger if exists set_plan_work_groups_updated_at on public.plan_work_groups;
create trigger set_plan_work_groups_updated_at before update on public.plan_work_groups
  for each row execute function public.set_updated_at();

alter table public.wbs_nodes
  add column if not exists work_group_code text references public.plan_work_groups(code) on update cascade;

comment on column public.wbs_nodes.work_group_code is
  'Work Group of this node (ST, AR, M1 ...) when it is a work group under a floor/area. Activities generated from an Activity Master land in the node whose work group matches the master''s default_work_group.';

create index if not exists idx_wbs_nodes_work_group on public.wbs_nodes(project_id, work_group_code)
  where work_group_code is not null;

-- ── 2. Activity Master planning attributes ─────────────────────────────────
alter table public.plan_act_masters
  add column if not exists duration_basis text not null default 'quantity',
  add column if not exists default_work_group text references public.plan_work_groups(code) on update cascade,
  add column if not exists default_step_template_id uuid references public.activity_step_template_master(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_act_masters_duration_basis_chk') then
    alter table public.plan_act_masters
      add constraint plan_act_masters_duration_basis_chk
        check (duration_basis in ('quantity', 'fixed', 'programme'));
  end if;
end $$;

comment on column public.plan_act_masters.duration_basis is
  'quantity = duration from QS quantity x productivity standard; fixed = standard days (inspection, testing); programme = planner-entered (design, procurement lead time, handover). Workbook "Duration Driver?" column.';
comment on column public.plan_act_masters.default_work_group is
  'Work Group (plan_work_groups) an activity of this master belongs to under a floor, e.g. ST.';
comment on column public.plan_act_masters.default_step_template_id is
  'Activity Step Template assigned to activities generated from this master; its steps share the calculated duration.';

-- ── 3. QS bridge rules ─────────────────────────────────────────────────────
create table if not exists public.plan_act_qs_bridge (
  id uuid primary key default gen_random_uuid(),
  role text not null default 'driver',
  -- target (drivers only)
  metric_code text,
  metric_unit text,
  unit_factor numeric not null default 1,
  -- match on the BOQ line's Element Library classification; null = any
  match_discipline text,
  match_section text,
  match_sub_section text,
  match_sub_element text,
  match_unit text,
  note text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_act_qs_bridge_role_chk check (role in ('driver', 'excluded')),
  constraint plan_act_qs_bridge_target_chk check (role = 'excluded' or (metric_code is not null and metric_unit is not null)),
  constraint plan_act_qs_bridge_factor_chk check (unit_factor > 0),
  constraint plan_act_qs_bridge_match_chk check (match_sub_section is not null or match_sub_element is not null)
);

comment on table public.plan_act_qs_bridge is
  'Company Planning<->QS bridge (doc 21). A BOQ line whose Element Library classification matches a rule feeds the rule''s metric (quantity x unit_factor), which Activity Master quantity rules consume per WBS level. Matching is case/space-insensitive; the most specific matching rule wins; role excluded marks non-driving lines (tie wire, water stop). Owned by Project Controls.';
comment on column public.plan_act_qs_bridge.unit_factor is
  'BOQ quantity x unit_factor = metric quantity, e.g. 0.001 for kg -> t, or 0.5 to give half of one line to each of two metrics (an assumption that must be stated in note).';
comment on column public.plan_act_qs_bridge.match_unit is
  'Expected BOQ unit (e.g. kg). A line in another unit does not match this rule, so a unit change in the BOQ shows up as unmapped instead of being converted wrongly.';

create index if not exists idx_plan_act_qs_bridge_metric on public.plan_act_qs_bridge(metric_code);
create index if not exists idx_plan_act_qs_bridge_match
  on public.plan_act_qs_bridge(lower(coalesce(match_sub_section, '')), lower(coalesce(match_sub_element, '')));

alter table public.plan_act_qs_bridge enable row level security;
drop policy if exists "plan_act_qs_bridge view" on public.plan_act_qs_bridge;
drop policy if exists "plan_act_qs_bridge manage" on public.plan_act_qs_bridge;
create policy "plan_act_qs_bridge view" on public.plan_act_qs_bridge for select to authenticated using (true);
create policy "plan_act_qs_bridge manage" on public.plan_act_qs_bridge for all to authenticated
  using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

drop trigger if exists set_plan_act_qs_bridge_updated_at on public.plan_act_qs_bridge;
create trigger set_plan_act_qs_bridge_updated_at before update on public.plan_act_qs_bridge
  for each row execute function public.set_updated_at();
