-- Phase R5 (doc 35; doc 22 P0.4, P0.5, F4/F5).
-- 1. The six NOT VALID checks on wbs_tasks are validated (0 violating rows on 2026-11-02), so
--    they now hold for every row, not only for new ones. Rows that break one fail the migration
--    and must be fixed first.
-- 2. Server-side step lock: once a step has started (progress > 0) its weight and duration basis
--    cannot change, matching the client rule in activity-step-spread.ts. Planners still update
--    its progress and dates.
-- Step weights adding up to 100 stay a warning: steps are saved one row at a time, so a database
-- rule would fail between saves. The schedule QA/QC checks (doc 35, Q1) will report it.

alter table public.wbs_tasks validate constraint wbs_tasks_dep_arrays_len;
alter table public.wbs_tasks validate constraint wbs_tasks_dep_no_self;
alter table public.wbs_tasks validate constraint wbs_tasks_dep_types_valid;
alter table public.wbs_tasks validate constraint wbs_tasks_hours_nonneg;
alter table public.wbs_tasks validate constraint wbs_tasks_progress_method_check;
alter table public.wbs_tasks validate constraint wbs_tasks_reviewer_independent;

create or replace function public.wbs_task_steps_started_lock()
returns trigger
language plpgsql
as $$
begin
  if coalesce(old.progress, 0) > 0
     and (new.weight, new.duration_basis, new.duration_share_pct)
         is distinct from (old.weight, old.duration_basis, old.duration_share_pct)
     and not public.is_admin(auth.uid()) then
    raise exception 'Step "%" has started: its weight and duration basis are locked', old.step_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wbs_task_steps_started_lock on public.wbs_task_steps;
create trigger trg_wbs_task_steps_started_lock
  before update on public.wbs_task_steps
  for each row execute function public.wbs_task_steps_started_lock();
