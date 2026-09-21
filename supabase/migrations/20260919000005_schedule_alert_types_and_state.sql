-- Migration: 20260919000005_schedule_alert_types_and_state.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 1, item 1.6 — widen
--          task_alerts.alert_type with schedule-specific alert types, allow
--          project-level (non-task) alerts, and add plan_schedule_state to
--          persist the last-known critical/near-critical task sets so the
--          alert-evaluation route can diff against them.
-- Depends on:
--   public.task_alerts (20260527000024_create_task_alerts.sql,
--                        CHECK constraint most recently updated in
--                        20260608000003_update_alert_trigger.sql)
--   public.projects    (20260527000008_create_projects.sql)
--
-- Schema verification notes:
--   - The current alert_type CHECK (confirmed against
--     20260608000003_update_alert_trigger.sql) allows: task_assigned,
--     task_reassigned, task_assignment_accepted, task_assignment_rejected,
--     task_submitted, task_approved, task_rejected, task_progress_updated,
--     task_overdue. All nine are preserved below; nine new schedule-specific
--     values are added exactly as specified in the completion plan.
--   - task_alerts.wbs_task_id/task_code/task_name were confirmed `not null`
--     in 20260527000024_create_task_alerts.sql (wbs_task_id also
--     `references public.wbs_tasks(id) on delete cascade`). The new
--     schedule alert types (schedule_critical_path_changed, schedule_overrun,
--     baseline_set, programme_revision_submitted, etc.) are project-level
--     events with no single associated task, so all three columns are
--     relaxed to nullable below. Dropping NOT NULL does not require touching
--     the foreign key itself — a nullable FK column is valid in Postgres and
--     ON DELETE CASCADE simply never fires for NULL values. The existing
--     index idx_task_alerts_task on (wbs_task_id) continues to work
--     unchanged with nulls present (they are just not matched by equality
--     lookups, which is the desired behavior for project-level rows).

-- ── 1. Widen alert_type CHECK ──────────────────────────────────────────────
alter table public.task_alerts drop constraint if exists task_alerts_alert_type_check;

alter table public.task_alerts
  add constraint task_alerts_alert_type_check
  check (alert_type in (
    'task_assigned',
    'task_reassigned',
    'task_assignment_accepted',
    'task_assignment_rejected',
    'task_submitted',
    'task_approved',
    'task_rejected',
    'task_progress_updated',
    'task_overdue',
    'schedule_critical_path_changed',
    'schedule_overrun',
    'schedule_float_consumed',
    'progress_review_requested',
    'progress_review_decided',
    'programme_revision_submitted',
    'programme_revision_decided',
    'baseline_set',
    'monthly_report_ready'
  ));

-- ── 2. Allow project-level (non-task) alerts ───────────────────────────────
alter table public.task_alerts
  alter column wbs_task_id drop not null,
  alter column task_code drop not null,
  alter column task_name drop not null;

-- ── 3. plan_schedule_state ─────────────────────────────────────────────────
create table public.plan_schedule_state (
  project_id uuid primary key references public.projects(id) on delete cascade,
  critical_task_ids uuid[] not null default '{}',
  near_critical_task_ids uuid[] not null default '{}',
  project_finish date,
  computed_at timestamptz not null default now()
);

alter table public.plan_schedule_state enable row level security;

-- Permissive for Phase 1 — Phase 2 tightens with is_project_member()/has_permission().
create policy "plan_schedule_state_select_authenticated"
  on public.plan_schedule_state for select to authenticated using (true);

create policy "plan_schedule_state_insert_authenticated"
  on public.plan_schedule_state for insert to authenticated with check (true);

create policy "plan_schedule_state_update_authenticated"
  on public.plan_schedule_state for update to authenticated using (true) with check (true);

create policy "plan_schedule_state_delete_authenticated"
  on public.plan_schedule_state for delete to authenticated using (true);

-- ── 4. upsert_plan_schedule_state() ────────────────────────────────────────
create or replace function public.upsert_plan_schedule_state(
  p_project_id uuid,
  p_critical uuid[],
  p_near_critical uuid[],
  p_project_finish date
)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.plan_schedule_state (
    project_id, critical_task_ids, near_critical_task_ids, project_finish, computed_at
  ) values (
    p_project_id, coalesce(p_critical, '{}'), coalesce(p_near_critical, '{}'), p_project_finish, now()
  )
  on conflict (project_id) do update set
    critical_task_ids = coalesce(p_critical, '{}'),
    near_critical_task_ids = coalesce(p_near_critical, '{}'),
    project_finish = p_project_finish,
    computed_at = now();
end;
$$;

grant execute on function public.upsert_plan_schedule_state(uuid, uuid[], uuid[], date) to authenticated;
