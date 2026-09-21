-- Migration: 20260919000003_advance_data_date.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 1, items F2 / 1.2 —
--          advance_data_date() RPC that moves a project's schedule data date
--          forward, captures a progress snapshot tagged with its source, and
--          writes a project-level audit row.
-- Depends on:
--   public.projects              (20260527000008_create_projects.sql,
--                                  data_date added in 20260902000005_project_data_date.sql)
--   public.progress_snapshots    (20260531000003_create_progress_snapshots.sql)
--   public.capture_progress_snapshot(uuid)
--                                 (20260531000009_create_snapshot_rpc.sql)
--   public.wbs_audit_log         (20260527000016_create_wbs_enterprise_tables.sql)
--
-- Schema verification notes:
--   - progress_snapshots' actual columns (20260531000003): id, project_id,
--     wbs_node_id, snapshot_date, planned_progress, actual_progress,
--     planned_cost, actual_cost, created_by, created_at — no `source` column
--     yet, added below exactly as specified.
--   - capture_progress_snapshot(p_project_id uuid) (20260531000009) RETURNS
--     UUID (the snapshot row's id) and is SECURITY INVOKER — matches the
--     plan's assumed signature exactly. It upserts on (project_id,
--     snapshot_date) but does not accept a `source` argument, so `source` is
--     set with a follow-up UPDATE keyed on the returned id, as the plan
--     anticipated.
--   - wbs_audit_log columns (20260527000016): project_id is NOT NULL;
--     wbs_node_id, wbs_task_id, user_id are nullable — a project-level event
--     with wbs_task_id/wbs_node_id both null is valid, per the plan.

-- ── 1. progress_snapshots.source ───────────────────────────────────────────
alter table public.progress_snapshots
  add column if not exists source text not null default 'manual'
  constraint progress_snapshots_source_check check (source in ('manual', 'data_date', 'monthly'));

-- ── 2. advance_data_date() ─────────────────────────────────────────────────
-- security invoker: runs as the calling user so RLS on projects/wbs_audit_log/
-- progress_snapshots still applies. p_note is accepted for API forward-
-- compatibility (e.g. a future audit metadata column) but is not persisted
-- anywhere in this pass — wbs_audit_log has no metadata column and the plan
-- did not specify where else to store it.
create or replace function public.advance_data_date(
  p_project_id uuid,
  p_new_date date,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_old_date date;
  v_snapshot_id uuid;
begin
  select data_date into v_old_date
  from public.projects
  where id = p_project_id;

  if v_old_date is not null and p_new_date <= v_old_date then
    raise exception 'New data date (%) must be after the current data date (%)', p_new_date, v_old_date;
  end if;

  update public.projects
  set data_date = p_new_date
  where id = p_project_id;

  v_snapshot_id := public.capture_progress_snapshot(p_project_id);

  insert into public.wbs_audit_log (
    project_id, wbs_task_id, wbs_node_id, user_id,
    action, field_name, old_value, new_value
  ) values (
    p_project_id, null, null, auth.uid(),
    'Data Date Advanced', 'data_date',
    v_old_date::text, p_new_date::text
  );

  update public.progress_snapshots
  set source = 'data_date'
  where id = v_snapshot_id;

  return jsonb_build_object(
    'old_date', v_old_date,
    'new_date', p_new_date,
    'snapshot_captured', true
  );
end;
$$;

grant execute on function public.advance_data_date(uuid, date, text) to authenticated;
