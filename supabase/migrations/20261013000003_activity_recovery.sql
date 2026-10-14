-- Activity Library - Phase 3.6: recovery scenarios.
-- Recovery is ADVISORY: the engine proposes scenarios (crews, method changes, overlapping) measured with the CPM engine and the
-- planner compares them. Nothing here changes a programme. A saved scenario is a record for discussion; the planner marks it
-- adopted (after changing the programme by hand) or dismissed.
-- Also lets the AI assistant explain / recommend among scenarios (tool suggest_recovery_plan, kind 'recovery', target 'project').
-- Depends on 20261006000001-8, 20261013000001-2.

create table if not exists public.plan_act_recovery_scenarios (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  family_key text not null,                       -- A..D, the lever family
  target_finish date,
  forecast_finish date,
  scenario_finish date,
  recovered_wd integer not null default 0,
  remaining_gap_wd integer not null default 0,
  meets_target boolean not null default false,
  risk text not null check (risk in ('low','medium','high')),
  settings jsonb not null default '{}'::jsonb,    -- compression cap, minimum duration, fast-track allowed
  levers jsonb not null default '[]'::jsonb,      -- the ordered changes, with the days each recovered when chosen
  resource_note text,
  ai_suggestion_id uuid references public.plan_act_ai_suggestions(id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed','adopted','dismissed')),
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_act_recovery_project on public.plan_act_recovery_scenarios(project_id, created_at desc);

alter table public.plan_act_recovery_scenarios enable row level security;
drop policy if exists plan_act_recovery_select on public.plan_act_recovery_scenarios;
create policy plan_act_recovery_select on public.plan_act_recovery_scenarios for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists plan_act_recovery_write on public.plan_act_recovery_scenarios;
create policy plan_act_recovery_write on public.plan_act_recovery_scenarios for all to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'))
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));

-- AI: one more tool, one more kind, one more target
alter table public.plan_act_ai_runs drop constraint if exists plan_act_ai_runs_tool_check;
alter table public.plan_act_ai_runs add constraint plan_act_ai_runs_tool_check
  check (tool in ('find_activity_master','suggest_quantity_mapping','suggest_productivity','detect_schedule_conflict','explain_generation','suggest_recovery_plan'));
alter table public.plan_act_ai_suggestions drop constraint if exists plan_act_ai_suggestions_kind_check;
alter table public.plan_act_ai_suggestions add constraint plan_act_ai_suggestions_kind_check
  check (kind in ('match_master','quantity_mapping','productivity','conflict','explanation','recovery'));
alter table public.plan_act_ai_suggestions drop constraint if exists plan_act_ai_suggestions_target_type_check;
alter table public.plan_act_ai_suggestions add constraint plan_act_ai_suggestions_target_type_check
  check (target_type in ('query','generation_item','generation_run','standard','project'));
