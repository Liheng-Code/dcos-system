-- Task Team Planning, slice 5: manager workspace support.
-- * is_department_manager(): department head of the department or of any ancestor.
-- * set_task_planning(): one controlled way to set owner, reviewer, approver, estimate and dates.
-- * Publishing or reopening a plan requires being an admin or the department manager.
-- See docs/04-Business-Modules/04-04-Task-Management/13-Team-Planning-Addendum.md

create or replace function public.is_department_manager(p_dept uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin(auth.uid()) or coalesce((
    with recursive up as (
      select d.id, d.parent_id, d.department_head from public.departments d where d.id = p_dept
      union
      select d.id, d.parent_id, d.department_head
        from public.departments d join up on d.id = up.parent_id
    )
    select bool_or(up.department_head = auth.uid()) from up
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- set_task_planning: p_changes holds only the keys to change; a null value clears the field.
--   keys: owner_id, reviewer_id, approver_id, estimated_hours, start_date, end_date
-- ---------------------------------------------------------------------------
create or replace function public.set_task_planning(p_task uuid, p_changes jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  t public.wbs_tasks%rowtype;
  v_owner uuid; v_reviewer uuid; v_approver uuid;
  v_est numeric; v_start date; v_end date;
  v_owner_name text; v_status text;
  v_key text;
  v_old jsonb; v_new jsonb;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'No changes given'; end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('owner_id','reviewer_id','approver_id','estimated_hours','start_date','end_date') then
      raise exception 'Field "%" cannot be changed here', v_key;
    end if;
  end loop;

  select * into t from public.wbs_tasks where id = p_task for update;
  if not found then raise exception 'Task not found'; end if;
  if not public.is_project_member(t.project_id)
     or not public.has_permission('task_management', 'plan_team', 'edit') then
    raise exception 'You are not allowed to plan this task';
  end if;
  if t.department_id is not null and not public.is_department_manager(t.department_id) then
    raise exception 'Only the manager of the responsible department can plan this task';
  end if;
  if t.status in ('closed','cancelled','completed','approved') then
    raise exception 'A % task cannot be re-planned', t.status;
  end if;
  if exists (
    select 1 from public.weekly_plan_tasks wpt
      join public.weekly_plans wp on wp.id = wpt.weekly_plan_id
     where wpt.wbs_task_id = p_task and wp.status = 'published'
  ) then
    raise exception 'This task is in a published team plan. Reopen the plan with a reason before changing it.';
  end if;

  v_owner    := case when p_changes ? 'owner_id'    then nullif(p_changes->>'owner_id','')::uuid    else t.owner_id end;
  v_reviewer := case when p_changes ? 'reviewer_id' then nullif(p_changes->>'reviewer_id','')::uuid else t.reviewer_id end;
  v_approver := case when p_changes ? 'approver_id' then nullif(p_changes->>'approver_id','')::uuid else t.approver_id end;
  v_est      := case when p_changes ? 'estimated_hours' then nullif(p_changes->>'estimated_hours','')::numeric else t.estimated_hours end;
  v_start    := case when p_changes ? 'start_date' then nullif(p_changes->>'start_date','')::date else t.start_date end;
  v_end      := case when p_changes ? 'end_date'   then nullif(p_changes->>'end_date','')::date   else t.end_date end;

  if v_est is not null and v_est < 0 then raise exception 'Estimated hours cannot be negative'; end if;
  if v_start is not null and v_end is not null and v_end < v_start then
    raise exception 'The finish date cannot be before the start date';
  end if;
  if v_owner is not null and not exists (select 1 from public.profiles where id = v_owner and status = 'active') then
    raise exception 'The responsible person is not an active employee';
  end if;
  if v_reviewer is not null and not exists (select 1 from public.profiles where id = v_reviewer and status = 'active') then
    raise exception 'The reviewer is not an active employee';
  end if;
  if v_approver is not null and not exists (select 1 from public.profiles where id = v_approver and status = 'active') then
    raise exception 'The approver is not an active employee';
  end if;
  if v_reviewer is not null and v_reviewer = v_owner then
    raise exception 'The reviewer must be a different person from the responsible person';
  end if;
  if v_approver is not null and v_approver = v_owner then
    raise exception 'The approver must be a different person from the responsible person';
  end if;

  v_status := t.status;
  if v_owner is distinct from t.owner_id then
    if v_owner is not null and t.status = 'open' then v_status := 'assigned'; end if;
    if v_owner is null and t.status = 'assigned' then v_status := 'open'; end if;
    select full_name into v_owner_name from public.profiles where id = v_owner;
  else
    v_owner_name := t.owner_name;
  end if;

  v_old := jsonb_build_object('owner_id', t.owner_id, 'reviewer_id', t.reviewer_id, 'approver_id', t.approver_id,
                              'estimated_hours', t.estimated_hours, 'start_date', t.start_date, 'end_date', t.end_date);
  v_new := jsonb_build_object('owner_id', v_owner, 'reviewer_id', v_reviewer, 'approver_id', v_approver,
                              'estimated_hours', v_est, 'start_date', v_start, 'end_date', v_end);

  update public.wbs_tasks
     set owner_id = v_owner,
         owner_name = v_owner_name,
         reviewer_id = v_reviewer,
         approver_id = v_approver,
         estimated_hours = v_est,
         start_date = v_start,
         end_date = v_end,
         status = v_status,
         assigned_by = case when v_owner is distinct from t.owner_id then v_actor else assigned_by end,
         assigned_at = case when v_owner is distinct from t.owner_id then now() else assigned_at end
   where id = p_task;

  if v_owner is distinct from t.owner_id then
    insert into public.wbs_audit_log (wbs_task_id, wbs_node_id, project_id, user_id, action, field_name, old_value, new_value)
    values (p_task, t.wbs_node_id, t.project_id, v_actor, 'Assignee Changed', 'owner_name',
            coalesce(t.owner_name, ''), coalesce(v_owner_name, ''));
  end if;
  if v_start is distinct from t.start_date then
    insert into public.wbs_audit_log (wbs_task_id, wbs_node_id, project_id, user_id, action, field_name, old_value, new_value)
    values (p_task, t.wbs_node_id, t.project_id, v_actor, 'Plan Start Changed', 'start_date',
            coalesce(t.start_date::text, ''), coalesce(v_start::text, ''));
  end if;
  if v_end is distinct from t.end_date then
    insert into public.wbs_audit_log (wbs_task_id, wbs_node_id, project_id, user_id, action, field_name, old_value, new_value)
    values (p_task, t.wbs_node_id, t.project_id, v_actor, 'Plan Finish Changed', 'end_date',
            coalesce(t.end_date::text, ''), coalesce(v_end::text, ''));
  end if;
  if v_old is distinct from v_new then
    perform public.task_write_audit(p_task, 'planning_change', v_old, v_new, null);
  end if;

  return jsonb_build_object('status', v_status);
end $$;

revoke all on function public.set_task_planning(uuid, jsonb) from public;
grant execute on function public.set_task_planning(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Publishing and reopening are manager decisions: admin or the department manager only.
-- ---------------------------------------------------------------------------
create or replace function public.require_plan_manager()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (new.status = 'published' and old.status is distinct from 'published')
     or (old.status = 'published' and new.status is distinct from 'published') then
    if new.department_id is not null and not public.is_department_manager(new.department_id) then
      raise exception 'Only the department manager can publish or reopen this team plan';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists weekly_plans_require_manager on public.weekly_plans;
create trigger weekly_plans_require_manager
  before update of status on public.weekly_plans
  for each row execute function public.require_plan_manager();
