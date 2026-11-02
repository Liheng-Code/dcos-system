-- Phase R1 (doc 35; doc 22 P0.2, P0.3 / D8-A): stop any signed-in user from rewriting the schedule.
-- wbs_tasks keeps its open read policy (every module reads tasks); a guard trigger protects the
-- scheduling and progress columns instead of rewriting its RLS. wbs_task_steps gets real policies.
--
--   scheduling columns (dates, duration, links, constraints, milestone flag, baseline fields)
--       -> Planning schedule edit
--   progress columns (progress, actual start / finish)
--       -> Planning schedule edit, or Tasks "update progress" when the project does not require
--          progress approval (R4); with approval on, progress goes through submit_progress / review
--
-- Trusted server paths (approval decisions, daily-report sync, baseline approval) set the
-- transaction-local flag dcos.schedule_write = 'on' around their own writes. Requests without a
-- user (service role, jobs, migrations) are not guarded.

-- Whether progress on a project must be approved by a planner before it reaches the schedule.
-- An explicit project setting wins; otherwise awarded projects require it and tenders do not (D2).
create or replace function public.progress_review_required(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.progress_review_enabled from public.plan_schedule_settings s where s.project_id = p_project_id),
    (select p.project_type = 'awarded' from public.projects p where p.id = p_project_id),
    false);
$$;

revoke all on function public.progress_review_required(uuid) from public, anon;
grant execute on function public.progress_review_required(uuid) to authenticated;

create or replace function public.wbs_tasks_schedule_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
    if public.progress_review_required(new.project_id) then
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

drop trigger if exists trg_wbs_tasks_schedule_guard on public.wbs_tasks;
create trigger trg_wbs_tasks_schedule_guard
  before update on public.wbs_tasks
  for each row execute function public.wbs_tasks_schedule_guard();

-- Step progress rolls up into wbs_tasks.progress; the roll-up is derived, so it may write past the
-- guard (who may change a step is decided by the step policies below).
create or replace function public.recalc_task_progress_from_steps()
returns trigger
language plpgsql
as $$
declare
  v_task_id uuid := coalesce(new.task_id, old.task_id);
  v_weighted numeric;
  v_total_weight numeric;
  v_progress numeric;
  v_prev text := coalesce(current_setting('dcos.schedule_write', true), '');
begin
  select sum(progress * weight), sum(weight)
    into v_weighted, v_total_weight
  from public.wbs_task_steps
  where task_id = v_task_id;

  if v_total_weight is not null and v_total_weight > 0 then
    v_progress := round(v_weighted / v_total_weight, 2);
    -- Plain UPDATE so trg_task_collect_dirty / trg_task_flush_dirty cascade the
    -- roll-up (see 20260918000001). Skipped when nothing changes.
    perform set_config('dcos.schedule_write', 'on', true);
    update public.wbs_tasks
    set progress = v_progress
    where id = v_task_id
      and progress is distinct from v_progress;
    perform set_config('dcos.schedule_write', v_prev, true);
  end if;

  return coalesce(new, old);
end;
$$;

-- wbs_task_steps: replace the open ALL policy
drop policy if exists "wbs_task_steps authenticated all" on public.wbs_task_steps;
drop policy if exists wbs_task_steps_select on public.wbs_task_steps;
drop policy if exists wbs_task_steps_insert on public.wbs_task_steps;
drop policy if exists wbs_task_steps_update on public.wbs_task_steps;
drop policy if exists wbs_task_steps_delete on public.wbs_task_steps;

create policy wbs_task_steps_select on public.wbs_task_steps
  for select to authenticated
  using (
    public.has_permission('planning', 'schedule', 'view')
    or public.has_permission('task_management', 'update_progress', 'view')
    or exists (select 1 from public.wbs_tasks t where t.id = task_id and public.is_project_member(t.project_id))
  );

create policy wbs_task_steps_insert on public.wbs_task_steps
  for insert to authenticated
  with check (public.has_permission('planning', 'schedule', 'edit'));

create policy wbs_task_steps_delete on public.wbs_task_steps
  for delete to authenticated
  using (public.has_permission('planning', 'schedule', 'edit'));

create policy wbs_task_steps_update on public.wbs_task_steps
  for update to authenticated
  using (
    public.has_permission('planning', 'schedule', 'edit')
    or (public.has_permission('task_management', 'update_progress', 'edit')
        and exists (select 1 from public.wbs_tasks t
                    where t.id = task_id and not public.progress_review_required(t.project_id)))
  )
  with check (
    public.has_permission('planning', 'schedule', 'edit')
    or (public.has_permission('task_management', 'update_progress', 'edit')
        and exists (select 1 from public.wbs_tasks t
                    where t.id = task_id and not public.progress_review_required(t.project_id)))
  );
