-- doc 22 P0.2 / P0.3 gaps found by the release checks (supabase/tests/planning/planning_release_checks.sql):
-- 1. Step writes need project access, not only the permission (P0.2 design: insert / update / delete =
--    schedule edit AND project access). Reading stays as it was: a project member, or Planning schedule view.
-- 2. Someone who records progress through Tasks update-progress (not Planning schedule edit) may change a step's
--    progress, its dates and its notes, and nothing else (name, weight, order, duration basis, hold point).
-- 3. Progress written directly through Tasks update-progress on a project without progress review needs project
--    membership too (schedule guard). Planners with schedule edit, admins and the trusted workflow functions are
--    unchanged.

drop policy if exists wbs_task_steps_insert on public.wbs_task_steps;
create policy wbs_task_steps_insert on public.wbs_task_steps for insert to authenticated
  with check (
    public.has_permission('planning', 'schedule', 'edit')
    and exists (select 1 from public.wbs_tasks t where t.id = wbs_task_steps.task_id and public.is_project_member(t.project_id)));

drop policy if exists wbs_task_steps_update on public.wbs_task_steps;
create policy wbs_task_steps_update on public.wbs_task_steps for update to authenticated
  using (
    exists (select 1 from public.wbs_tasks t where t.id = wbs_task_steps.task_id and public.is_project_member(t.project_id)
            and (public.has_permission('planning', 'schedule', 'edit')
                 or (public.has_permission('task_management', 'update_progress', 'edit') and not public.progress_review_required(t.project_id)))))
  with check (
    exists (select 1 from public.wbs_tasks t where t.id = wbs_task_steps.task_id and public.is_project_member(t.project_id)
            and (public.has_permission('planning', 'schedule', 'edit')
                 or (public.has_permission('task_management', 'update_progress', 'edit') and not public.progress_review_required(t.project_id)))));

drop policy if exists wbs_task_steps_delete on public.wbs_task_steps;
create policy wbs_task_steps_delete on public.wbs_task_steps for delete to authenticated
  using (
    public.has_permission('planning', 'schedule', 'edit')
    and exists (select 1 from public.wbs_tasks t where t.id = wbs_task_steps.task_id and public.is_project_member(t.project_id)));

create or replace function public.wbs_task_steps_field_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service role, jobs, trusted definer workflows run without a user, or with Planning edit
  if auth.uid() is null or public.is_admin(auth.uid()) or public.has_permission('planning', 'schedule', 'edit') then
    return new;
  end if;
  if (to_jsonb(new) - array['progress', 'start_date', 'end_date', 'notes', 'updated_at'])
     is distinct from (to_jsonb(old) - array['progress', 'start_date', 'end_date', 'notes', 'updated_at']) then
    raise exception 'Without Planning schedule edit you can record a step''s progress, dates and notes only'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke all on function public.wbs_task_steps_field_guard() from public, anon, authenticated;
drop trigger if exists trg_wbs_task_steps_field_guard on public.wbs_task_steps;
create trigger trg_wbs_task_steps_field_guard before update on public.wbs_task_steps
  for each row execute function public.wbs_task_steps_field_guard();

CREATE OR REPLACE FUNCTION public.wbs_tasks_schedule_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ctx     text;
  v_trusted boolean;
begin
  if coalesce(current_setting('dcos.schedule_write', true), '') = 'on' then
    return new;
  end if;
  if auth.uid() is null then
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'Sign in to change the schedule' using errcode = 'insufficient_privilege';
    end if;
    return new; -- service role, jobs, migrations
  end if;

  -- Baseline fields come from the approved baseline only (approve / activate / clear).
  if (new.baseline_start_date, new.baseline_finish_date, new.baseline_cost)
     is distinct from (old.baseline_start_date, old.baseline_finish_date, old.baseline_cost) then
    raise exception 'Baseline dates and cost change only by approving or activating a baseline'
      using errcode = 'insufficient_privilege';
  end if;

  if public.is_admin(auth.uid()) then
    return new;
  end if;

  if (new.start_date, new.end_date, new.duration_days, new.duration_unit,
      new.dependency_task_ids, new.dependency_types, new.dependency_lag_days,
      new.dependency_task_id, new.dependency_type, new.lag_days,
      new.constraint_type, new.constraint_date, new.is_milestone, new.manually_scheduled, new.calendar_id)
     is distinct from
     (old.start_date, old.end_date, old.duration_days, old.duration_unit,
      old.dependency_task_ids, old.dependency_types, old.dependency_lag_days,
      old.dependency_task_id, old.dependency_type, old.lag_days,
      old.constraint_type, old.constraint_date, old.is_milestone, old.manually_scheduled, old.calendar_id)
     and not public.has_permission('planning', 'schedule', 'edit') then
    raise exception 'Changing schedule dates, links or calendars needs Planning schedule edit permission'
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
    elsif not public.is_project_member(new.project_id) then
      -- doc 22 P0.3 / D1: progress without Planning edit needs project access as well
      raise exception 'Updating progress on this project needs project membership (Planning > Members)'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$function$;
