-- Migration: 20260919000018_tia_scenarios.sql
-- Purpose: Planning & Scheduling Completion Plan Continuation, 3.1 — persists
--          Time Impact Analysis scenarios (the pure engine lives in
--          apps/web/lib/planning/time-impact-analysis.ts; the database only
--          stores input/output and RLS-scopes them). A scenario never mutates
--          the live programme — it is a saved bundle of (fragnet input json,
--          computed result json, base/impacted finish, slip).
-- Depends on:
--   public.delay_register (20260609000002, extended by 20260919000011)
--   public.is_project_member(uuid), public.has_permission(text,text,text)
--     (20260919000001)
--   public.role_permissions action 'tia' (seeded 20260919000007)
--
-- Schema verification notes:
--   - delay_register.id exists (20260609000002). delay_id is nullable: a
--     scenario may be exploratory (no linked delay event yet).
--   - input_json holds the fragnet bundle the engine consumed:
--     { fragnet: { activities: EngineTask[], links: EngineDep[] },
--       tasks: (id, code, name, start, finish, progress)[], dataDate }.
--     result_json holds runTia()'s TiaResult. Both are stored verbatim so a
--     saved scenario can be re-rendered or re-run without re-querying the
--     live schedule.

create table public.plan_tia_scenarios (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  delay_id       uuid references public.delay_register(id) on delete set null,
  name           text not null,
  data_date      date not null,
  base_finish    date,
  impacted_finish date,
  slip_wd        int,
  input_json     jsonb not null default '{}'::jsonb,
  result_json    jsonb not null default '{}'::jsonb,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_plan_tia_scenarios_project on public.plan_tia_scenarios(project_id, created_at desc);

alter table public.plan_tia_scenarios enable row level security;

create policy "plan_tia_scenarios_select" on public.plan_tia_scenarios for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'tia', 'view'));
create policy "plan_tia_scenarios_insert" on public.plan_tia_scenarios for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'tia', 'edit'));
create policy "plan_tia_scenarios_update" on public.plan_tia_scenarios for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'tia', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'tia', 'edit'));
create policy "plan_tia_scenarios_delete" on public.plan_tia_scenarios for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'tia', 'delete'));