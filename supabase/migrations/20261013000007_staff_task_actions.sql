-- Task Team Planning, slice 4: staff and reviewer task actions as transactional functions.
-- See docs/04-Business-Modules/04-04-Task-Management/13-Team-Planning-Addendum.md §5
-- The transition rules mirror lib/project/tasks/task-workflow.ts; each function validates the actor,
-- the current state and the rules, then writes the change, history, audit event and alerts together.
-- Progress on wbs_tasks is 0-100 (not 0-1); task_progress_history follows the same scale.

-- task_progress_history was created with a 0..1 check; wbs_tasks uses percent. The table is new and empty.
alter table public.task_progress_history drop constraint if exists task_progress_history_new_progress_check;
alter table public.task_progress_history
  add constraint task_progress_history_new_progress_check check (new_progress >= 0 and new_progress <= 100);

-- ---------------------------------------------------------------------------
-- internal helper: write an audit event
-- ---------------------------------------------------------------------------
create or replace function public.task_write_audit(p_task uuid, p_action text, p_old jsonb, p_new jsonb, p_reason text)
returns void language sql security definer set search_path = public
as $$
  insert into public.task_audit_events (wbs_task_id, actor_id, action, old_value, new_value, reason)
  values (p_task, auth.uid(), p_action, p_old, p_new, p_reason);
$$;
revoke all on function public.task_write_audit(uuid, text, jsonb, jsonb, text) from public;

-- internal helper: de-duplicated alert
create or replace function public.task_notify(p_task public.wbs_tasks, p_recipient uuid, p_type text,
                                              p_title text, p_body text, p_key text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_name text;
begin
  if p_recipient is null or p_recipient = auth.uid() then return; end if;
  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.task_alerts
    (project_id, wbs_task_id, actor_id, actor_name, recipient_id, source_key, alert_type, title, body, task_code, task_name)
  values (p_task.project_id, p_task.id, auth.uid(), v_name, p_recipient, p_key, p_type, p_title, p_body,
          p_task.task_code, p_task.task_name)
  on conflict do nothing;
end $$;
revoke all on function public.task_notify(public.wbs_tasks, uuid, text, text, text, text) from public;

-- internal helper: is review required, and are required deliverables complete?
create or replace function public.task_review_required(p_task public.wbs_tasks)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select tt.review_required from public.task_types tt where tt.id = p_task.task_type_id),
                  p_task.reviewer_id is not null);
$$;

create or replace function public.task_deliverables_ok(p_task public.wbs_tasks)
returns text language plpgsql stable security definer set search_path = public
as $$
declare v_missing integer; v_total integer; v_needed boolean;
begin
  select count(*) filter (where is_required and status not in ('submitted','accepted')),
         count(*)
    into v_missing, v_total
    from public.task_deliverables where wbs_task_id = p_task.id;
  select coalesce(tt.deliverable_required, false) into v_needed
    from public.task_types tt where tt.id = p_task.task_type_id;
  if coalesce(v_needed, false) and v_total = 0 then
    return 'This task type requires at least one deliverable.';
  end if;
  if v_missing > 0 then
    return v_missing || ' required deliverable(s) are not submitted yet.';
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- task_transition: owner-driven status changes
--   start (assigned/open -> in_progress), pause, resume, submit (-> review), complete (no review needed)
-- ---------------------------------------------------------------------------
create or replace function public.task_transition(p_task uuid, p_to text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  t public.wbs_tasks%rowtype;
  v_round integer;
  v_problem text;
  v_snapshot jsonb;
  v_final text;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  select * into t from public.wbs_tasks where id = p_task for update;
  if not found then raise exception 'Task not found'; end if;
  if t.owner_id is distinct from v_actor then
    raise exception 'Only the person in charge of this task can change its status';
  end if;
  if not public.task_in_scope(p_task) then raise exception 'You do not have access to this task'; end if;
  if not public.has_permission('task_management', 'update_progress', 'edit') then
    raise exception 'You are not allowed to update task progress';
  end if;

  if p_to = 'in_progress' and t.status in ('open','assigned','paused') then
    update public.wbs_tasks
       set status = 'in_progress',
           started_at = coalesce(started_at, now()),
           actual_start_date = coalesce(actual_start_date, current_date),
           paused_at = null
     where id = p_task;
    v_final := 'in_progress';

  elsif p_to = 'paused' and t.status = 'in_progress' then
    update public.wbs_tasks set status = 'paused', paused_at = now() where id = p_task;
    v_final := 'paused';

  elsif p_to = 'submitted' and t.status = 'in_progress' then
    if not public.has_permission('task_management', 'submit_task', 'submit') then
      raise exception 'You are not allowed to submit tasks';
    end if;
    if not public.task_review_required(t) then
      raise exception 'This task does not need review; complete it instead';
    end if;
    if t.reviewer_id is null then raise exception 'No reviewer is assigned to this task'; end if;
    if t.reviewer_id = t.owner_id then raise exception 'The reviewer must be independent of the task owner'; end if;
    v_problem := public.task_deliverables_ok(t);
    if v_problem is not null then raise exception '%', v_problem; end if;

    select coalesce(max(round), 0) + 1 into v_round from public.task_submissions where wbs_task_id = p_task;
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status,
                                                 'revision', revision, 'document_revision_id', document_revision_id)), '[]'::jsonb)
      into v_snapshot from public.task_deliverables where wbs_task_id = p_task;
    insert into public.task_submissions (wbs_task_id, round, submitted_by, note, deliverables_snapshot)
    values (p_task, v_round, v_actor, nullif(btrim(coalesce(p_note, '')), ''), v_snapshot);

    perform public.task_write_audit(p_task, 'status_change',
      jsonb_build_object('status', t.status), jsonb_build_object('status', 'submitted', 'round', v_round), p_note);
    update public.wbs_tasks set status = 'review', paused_at = null where id = p_task;
    perform public.task_notify(t, t.reviewer_id, 'task_submitted', 'Work submitted for your review',
      coalesce(p_note, 'A task is waiting for your review.'), 'ts:' || p_task || ':r' || v_round || ':reviewer');
    v_final := 'review';

  elsif p_to = 'completed' and t.status = 'in_progress' then
    if public.task_review_required(t) then
      raise exception 'This task type requires review before completion; submit it instead';
    end if;
    if not public.has_permission('task_management', 'submit_task', 'submit') then
      raise exception 'You are not allowed to complete tasks';
    end if;
    v_problem := public.task_deliverables_ok(t);
    if v_problem is not null then raise exception '%', v_problem; end if;
    update public.wbs_tasks
       set status = 'completed', progress = 100, actual_finish_date = current_date, paused_at = null
     where id = p_task;
    v_final := 'completed';

  else
    raise exception 'Cannot move a task from "%" to "%"', t.status, p_to;
  end if;

  if v_final <> 'review' then
    perform public.task_write_audit(p_task, 'status_change',
      jsonb_build_object('status', t.status), jsonb_build_object('status', v_final), p_note);
  end if;
  return jsonb_build_object('status', v_final);
end $$;

-- ---------------------------------------------------------------------------
-- record_task_progress: progress update + optional actual hours, history is kept
-- ---------------------------------------------------------------------------
create or replace function public.record_task_progress(
  p_task uuid,
  p_progress numeric,
  p_hours numeric default null,
  p_remaining_hours numeric default null,
  p_comment text default null,
  p_work_date date default current_date,
  p_evidence_url text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  t public.wbs_tasks%rowtype;
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

  update public.wbs_tasks
     set progress = p_progress,
         remaining_hours = coalesce(p_remaining_hours, remaining_hours)
   where id = p_task;

  perform public.task_write_audit(p_task, 'progress_update',
    jsonb_build_object('progress', t.progress), jsonb_build_object('progress', p_progress, 'hours', p_hours), p_comment);
  return jsonb_build_object('progress', p_progress);
end $$;

-- ---------------------------------------------------------------------------
-- review_task: reviewer / approver decision on the latest submission
-- ---------------------------------------------------------------------------
create or replace function public.review_task(
  p_task uuid,
  p_decision text,
  p_comments text default null,
  p_corrections text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  t public.wbs_tasks%rowtype;
  v_sub public.task_submissions%rowtype;
  v_reviewer_ok boolean;
  v_approver_ok boolean;
  v_final text;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_decision not in ('approved','returned') then raise exception 'Decision must be approved or returned'; end if;
  select * into t from public.wbs_tasks where id = p_task for update;
  if not found then raise exception 'Task not found'; end if;
  if not public.has_permission('task_management', 'approve_task', 'approve') then
    raise exception 'You are not allowed to review tasks';
  end if;
  if v_actor is not distinct from t.owner_id then raise exception 'You cannot review your own work'; end if;
  if v_actor is distinct from t.reviewer_id and v_actor is distinct from t.approver_id then
    raise exception 'Only the assigned reviewer or approver can decide this review';
  end if;
  if t.status <> 'review' then raise exception 'This task is not awaiting review (status is %)', t.status; end if;

  select * into v_sub from public.task_submissions where wbs_task_id = p_task order by round desc limit 1;
  if not found then raise exception 'There is no submission to review'; end if;
  if exists (select 1 from public.task_reviews where submission_id = v_sub.id and reviewer_id = v_actor) then
    raise exception 'You have already decided this submission';
  end if;
  if p_decision = 'returned'
     and coalesce(length(btrim(p_comments)), 0) + coalesce(length(btrim(p_corrections)), 0) < 5 then
    raise exception 'Comments or required corrections are needed when returning work';
  end if;

  insert into public.task_reviews (wbs_task_id, submission_id, reviewer_id, decision, comments, required_corrections)
  values (p_task, v_sub.id, v_actor, p_decision, nullif(btrim(coalesce(p_comments, '')), ''),
          nullif(btrim(coalesce(p_corrections, '')), ''));

  if p_decision = 'returned' then
    update public.task_deliverables set status = 'returned' where wbs_task_id = p_task and status = 'submitted';
    update public.wbs_tasks set status = 'in_progress' where id = p_task;
    perform public.task_write_audit(p_task, 'review_returned', jsonb_build_object('status', 'review'),
      jsonb_build_object('status', 'in_progress', 'round', v_sub.round), coalesce(p_comments, p_corrections));
    perform public.task_notify(t, t.owner_id, 'task_rejected', 'Work returned for revision',
      coalesce(p_corrections, p_comments, 'See the review comments.'), 'tr:' || v_sub.id || ':' || v_actor);
    v_final := 'in_progress';
  else
    v_reviewer_ok := t.reviewer_id is null or exists (
      select 1 from public.task_reviews where submission_id = v_sub.id and reviewer_id = t.reviewer_id and decision = 'approved');
    v_approver_ok := t.approver_id is null or exists (
      select 1 from public.task_reviews where submission_id = v_sub.id and reviewer_id = t.approver_id and decision = 'approved');
    if v_reviewer_ok and v_approver_ok then
      update public.task_deliverables set status = 'accepted' where wbs_task_id = p_task and status = 'submitted';
      update public.wbs_tasks
         set status = 'completed', progress = 100, actual_finish_date = current_date
       where id = p_task;
      perform public.task_write_audit(p_task, 'review_approved', jsonb_build_object('status', 'review'),
        jsonb_build_object('status', 'completed', 'round', v_sub.round), p_comments);
      perform public.task_notify(t, t.owner_id, 'task_approved', 'Work approved',
        coalesce(p_comments, 'Your submission was approved.'), 'ta:' || v_sub.id);
      v_final := 'completed';
    else
      perform public.task_write_audit(p_task, 'review_partial_approval', null,
        jsonb_build_object('by', v_actor, 'round', v_sub.round), p_comments);
      perform public.task_notify(t, t.approver_id, 'task_submitted', 'Reviewed work awaits your approval',
        coalesce(p_comments, 'The reviewer approved this submission.'), 'ts:' || v_sub.id || ':approver');
      v_final := 'review';
    end if;
  end if;
  return jsonb_build_object('status', v_final);
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'public.task_transition(uuid, text, text)',
    'public.record_task_progress(uuid, numeric, numeric, numeric, text, date, text)',
    'public.review_task(uuid, text, text, text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
