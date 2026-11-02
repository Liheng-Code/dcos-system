-- Phase R1 follow-up (doc 35): workflows that already carry their own approval may stamp progress
-- and actual dates past the schedule-write guard (trg_wbs_tasks_schedule_guard):
--   * task_transition: starting a task stamps its actual start; completing it after the task
--     reviewer's approval sets 100% and the actual finish.
--   * review_task: the reviewer's approval completes the task (100%, actual finish).
--   * dr_sync_version_to_planning: runs only after the project manager has verified the daily
--     report. Physical progress still goes through submit_progress, so it waits for planner
--     approval when the project requires it.
-- The guard recognises these callers from the call stack (PG_CONTEXT), which a client cannot set.
-- They may only change the progress columns this way; schedule dates still need schedule edit.

create or replace function public.wbs_tasks_schedule_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ctx     text;
  v_trusted boolean;
begin
  if auth.uid() is null
     or coalesce(current_setting('dcos.schedule_write', true), '') = 'on'
     or public.is_admin(auth.uid()) then
    return new;
  end if;

  if (new.start_date, new.end_date, new.duration_days, new.duration_unit,
      new.dependency_task_ids, new.dependency_types, new.dependency_lag_days,
      new.dependency_task_id, new.dependency_type, new.lag_days,
      new.constraint_type, new.constraint_date, new.is_milestone, new.manually_scheduled,
      new.baseline_start_date, new.baseline_finish_date, new.baseline_cost)
     is distinct from
     (old.start_date, old.end_date, old.duration_days, old.duration_unit,
      old.dependency_task_ids, old.dependency_types, old.dependency_lag_days,
      old.dependency_task_id, old.dependency_type, old.lag_days,
      old.constraint_type, old.constraint_date, old.is_milestone, old.manually_scheduled,
      old.baseline_start_date, old.baseline_finish_date, old.baseline_cost)
     and not public.has_permission('planning', 'schedule', 'edit') then
    raise exception 'Changing schedule dates, links or baselines needs Planning schedule edit permission'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.progress, new.actual_start_date, new.actual_finish_date)
     is distinct from (old.progress, old.actual_start_date, old.actual_finish_date)
     and not public.has_permission('planning', 'schedule', 'edit') then
    get diagnostics v_ctx = pg_context;
    v_trusted := v_ctx ~ 'function (public\.)?(task_transition|review_task|dr_sync_version_to_planning)\(';
    if v_trusted then
      return new;
    elsif public.progress_review_required(new.project_id) then
      raise exception 'Progress on this project is approved by a planner: submit it for review instead'
        using errcode = 'insufficient_privilege';
    elsif not public.has_permission('task_management', 'update_progress', 'edit') then
      raise exception 'Updating progress needs Tasks update-progress or Planning schedule edit permission'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;
