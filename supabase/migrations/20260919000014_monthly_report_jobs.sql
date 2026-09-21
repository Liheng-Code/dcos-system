-- Migration: 20260919000014_monthly_report_jobs.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 2, item 2.8 —
--          plan_report_jobs queue table + extend advance_data_date() to
--          enqueue a monthly report job whenever the data date crosses into
--          a new month.
-- Depends on:
--   public.advance_data_date (20260919000003_advance_data_date.sql — read in
--     full below; its existing body is reproduced unchanged except for the
--     new report-job block and the added `report_job_id` return key)
--   public.projects (data_date column)
--
-- Schema verification notes:
--   - advance_data_date()'s exact current body was read in full from
--     20260919000003_advance_data_date.sql and is reproduced unchanged
--     below other than: (a) a new v_report_job_id declaration, (b) the new
--     report-job insert block after the existing progress_snapshots.source
--     update, and (c) `report_job_id` added to the returned jsonb. No other
--     branch, check, or side effect is altered.
--   - The plan's month-changed condition is stated as
--     `date_trunc('month', p_new_date) <> date_trunc('month', coalesce(v_old_date, p_new_date))
--     OR v_old_date is null`. Written below as the logically equivalent (and
--     simpler) `v_old_date is null or date_trunc('month', p_new_date) <>
--     date_trunc('month', v_old_date)` — when v_old_date is null the first
--     branch of the OR already fires, so the coalesce in the plan's version
--     was only ever relevant when v_old_date is NOT null, in which case
--     coalesce(v_old_date, p_new_date) = v_old_date anyway. No behavior
--     difference.

-- ── 1. plan_report_jobs ─────────────────────────────────────────────────────
create table public.plan_report_jobs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  data_date    date not null,
  status       text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  document_id  uuid,
  error        text,
  created_at   timestamptz not null default now()
);

create index idx_plan_report_jobs_project on public.plan_report_jobs(project_id);

alter table public.plan_report_jobs enable row level security;

create policy "plan_report_jobs_select" on public.plan_report_jobs for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'view'));

-- The real writer is the report-generation API route's admin client
-- (service role, bypasses RLS entirely). These insert/update policies exist
-- for consistency with the rest of this migration set and as
-- defense-in-depth only — harmless since the actual writer never goes
-- through them.
create policy "plan_report_jobs_insert" on public.plan_report_jobs for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'edit'));
create policy "plan_report_jobs_update" on public.plan_report_jobs for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'schedule', 'edit'));
create policy "plan_report_jobs_delete" on public.plan_report_jobs for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'schedule', 'delete'));

-- ── 2. advance_data_date(): enqueue a monthly report job on month change ───
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
  v_report_job_id uuid;
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

  if v_old_date is null
     or date_trunc('month', p_new_date) <> date_trunc('month', v_old_date) then
    insert into public.plan_report_jobs (project_id, data_date, status)
    values (p_project_id, p_new_date, 'queued')
    returning id into v_report_job_id;
  end if;

  return jsonb_build_object(
    'old_date', v_old_date,
    'new_date', p_new_date,
    'snapshot_captured', true,
    'report_job_id', v_report_job_id
  );
end;
$$;

grant execute on function public.advance_data_date(uuid, date, text) to authenticated;
