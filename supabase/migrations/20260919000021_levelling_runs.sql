-- Migration: 20260919000021_levelling_runs.sql
-- Purpose: Planning & Scheduling Completion Plan Continuation, 3.2 — persists
--          resource levelling runs (the pure engine lives in
--          apps/web/lib/planning/resource-levelling.ts, function
--          levelResources(); the database only stores input/output and
--          RLS-scopes them, exactly like public.plan_tia_scenarios does for
--          3.1's TIA engine). A run never mutates the live programme by
--          itself — it is a saved preview of the shifted starts the engine
--          computed; only when a planner explicitly "applies" it (setting
--          applied = true / applied_at) do the resulting start-date shifts
--          get written to wbs_tasks, via the normal applySchedule path
--          described in Doc 14 section 3.2 — this migration does not
--          implement that write, only the flag recording that it happened.
-- Depends on:
--   public.projects            (20260527000008_create_projects.sql)
--   public.profiles            (20260526_0001_create_profiles.sql)
--   public.is_project_member(uuid), public.has_permission(text,text,text)
--     (20260919000001_project_members_and_permission_helpers.sql)
--   public.role_permissions action 'levelling' (seeded 20260919000007
--     planning_role_permissions_seed.sql — verified present verbatim in that
--     file before writing this migration, so no permission seeding is
--     needed here)
--
-- Schema verification notes:
--   - public.plan_resources and public.plan_task_assignments
--     (20260905000004_create_plan_resources.sql) are the resource/assignment
--     tables the engine's LevelTask[] input is derived from client-side; this
--     table does not reference either directly because a levelling run spans
--     an arbitrary set of tasks/resources for one project and, like
--     plan_tia_scenarios.input_json, stores that input verbatim rather than
--     via foreign keys.
--   - public.wbs_tasks (20260527000016_create_wbs_enterprise_tables.sql) is
--     never written by this migration — applying a run's shifted starts to
--     wbs_tasks happens through the existing applySchedule path in
--     application code, not here.
--   - Mirrors public.plan_tia_scenarios (20260919000018_tia_scenarios.sql)
--     column-for-column in spirit: direct project_id FK, jsonb input/output
--     stored verbatim, created_by -> public.profiles(id), the same 4-policy
--     is_project_member() + has_permission('planning','levelling',<field>)
--     RLS pattern the 2.1(part 2) migration (20260919000008) standardised
--     across every other planning table.
--   - rule is constrained to exactly the one rule the engine implements
--     today ('priority_first' — lowest-priority task within float moves
--     first, per resource-levelling.ts's header comment). Do not add more
--     values here until the engine actually supports them.

create table public.plan_levelling_runs (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  rule                text not null default 'priority_first'
                        check (rule in ('priority_first')),
  result              jsonb not null default '{}'::jsonb,
  residual_conflicts  jsonb not null default '[]'::jsonb,
  applied             boolean not null default false,
  applied_at          timestamptz,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now()
);

create index idx_plan_levelling_runs_project on public.plan_levelling_runs(project_id, created_at desc);

alter table public.plan_levelling_runs enable row level security;

create policy "plan_levelling_runs_select" on public.plan_levelling_runs for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'levelling', 'view'));
create policy "plan_levelling_runs_insert" on public.plan_levelling_runs for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'levelling', 'edit'));
create policy "plan_levelling_runs_update" on public.plan_levelling_runs for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'levelling', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'levelling', 'edit'));
create policy "plan_levelling_runs_delete" on public.plan_levelling_runs for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'levelling', 'delete'));
