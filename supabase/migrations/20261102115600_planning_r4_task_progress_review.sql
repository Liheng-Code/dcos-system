-- Phase R4 follow-up (doc 35): progress recorded in Tasks (record_task_progress, by the task's
-- person in charge) follows the same approval rule as the Planning sheet and daily reports. When
-- the project requires progress approval and the person is not a planner, the update becomes a
-- pending planner review instead of changing wbs_tasks.progress. The history, hours and remaining
-- hours are still recorded. Returns mode 'pending' (with review_id) or 'direct'.

create or replace function public.record_task_progress(
  p_task uuid, p_progress numeric, p_hours numeric default null, p_remaining_hours numeric default null,
  p_comment text default null, p_work_date date default current_date, p_evidence_url text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  t public.wbs_tasks%rowtype;
  v_review jsonb;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  select * into t from public.wbs_tasks where id = p_task for update;
  if not found then raise exception 'Task not found'; end if;
  if t.owner_id is distinct from v_actor then
    raise exception 'Only the person in charge of this task can record its progress';
  end if;
  if not public.task_in_scope(p_task) then raise exception 'You do not have access to this task'; end if;
  if not public.has_permission('task_management', 'update_progress', 'edit') then
    raise exception 'You are not allowed to update task progress';
  end if;
  if t.status <> 'in_progress' then
    raise exception 'Start the task before recording progress (status is %)', t.status;
  end if;
  if p_progress is null or p_progress < 0 or p_progress > 100 then
    raise exception 'Progress must be between 0 and 100';
  end if;
  if p_progress < coalesce(t.progress, 0) and coalesce(length(btrim(p_comment)), 0) < 5 then
    raise exception 'A comment is required when progress is reduced';
  end if;
  if p_hours is not null and p_hours < 0 then raise exception 'Hours cannot be negative'; end if;
  if p_hours is not null and p_hours > 24 then raise exception 'Hours for one day cannot exceed 24'; end if;
  if p_hours > 0 and (p_work_date > current_date or p_work_date < current_date - 31) then
    raise exception 'Work date must be within the last 31 days and not in the future';
  end if;
  if p_remaining_hours is not null and p_remaining_hours < 0 then raise exception 'Remaining hours cannot be negative'; end if;

  insert into public.task_progress_history
    (wbs_task_id, previous_progress, new_progress, hours, remaining_hours, comment, evidence_url, created_by)
  values (p_task, t.progress, p_progress, nullif(p_hours, 0), p_remaining_hours,
          nullif(btrim(coalesce(p_comment, '')), ''), nullif(btrim(coalesce(p_evidence_url, '')), ''), v_actor);

  if p_hours is not null and p_hours > 0 then
    insert into public.task_effort_log (wbs_task_id, profile_id, work_date, hours, note)
    values (p_task, v_actor, p_work_date, p_hours, nullif(btrim(coalesce(p_comment, '')), ''));
  end if;

  if p_remaining_hours is not null then
    update public.wbs_tasks set remaining_hours = p_remaining_hours where id = p_task;
  end if;

  if public.progress_review_required(t.project_id) and not public.has_permission('planning', 'schedule', 'edit') then
    v_review := public.submit_progress(p_task, p_progress, coalesce(nullif(btrim(coalesce(p_comment, '')), ''), 'Progress recorded in Tasks'));
    perform public.task_write_audit(p_task, 'progress_submitted',
      jsonb_build_object('progress', t.progress), jsonb_build_object('progress', p_progress, 'hours', p_hours), p_comment);
    return jsonb_build_object('progress', t.progress, 'mode', 'pending', 'review_id', v_review ->> 'review_id');
  end if;

  update public.wbs_tasks set progress = p_progress where id = p_task;

  perform public.task_write_audit(p_task, 'progress_update',
    jsonb_build_object('progress', t.progress), jsonb_build_object('progress', p_progress, 'hours', p_hours), p_comment);
  return jsonb_build_object('progress', p_progress, 'mode', 'direct');
end $function$;
