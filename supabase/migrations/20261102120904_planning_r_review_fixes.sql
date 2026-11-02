-- Phase R review fixes (doc 35). A read-only review of R1–R5 found these, confirmed on the local DB:
--  1. Baselines could be inserted / updated directly through the table API (bypassing set_baseline,
--     e.g. set_by = null to dodge the four-eyes check). Now every write to wbs_baselines goes through
--     the baseline RPCs (flag dcos.baseline_decide); approve_baseline refuses a missing set_by.
--  2. The R2 auto-add triggers on wbs_tasks (owner / assignee / reviewer) and projects (manager
--     fields) let a user add themselves to any project, because those tables' update policies are
--     open. Both triggers are removed; Planning resources and Daily Report approvers (already
--     membership / admin gated) still add members.
--  3. Anonymous calls: definer RPCs that write the schedule were executable by anon (default PUBLIC
--     grant) and the guard let a missing user through. The guard now refuses anon / signed-in
--     requests without a user, and these RPCs are revoked from PUBLIC and anon.
--  4. Baseline fields on tasks (baseline_start/finish/cost) only change through the baseline RPCs
--     (flag dcos.schedule_write), so move_project's "shift baseline" and set_project_baseline can no
--     longer alter an approved baseline.
--  5. decide_progress_review runs as definer so step updates are not silently filtered by RLS for an
--     approver who lacks schedule edit.

-- 2. ------------------------------------------------------------------------------------------
drop trigger if exists trg_project_members_from_task on public.wbs_tasks;
drop trigger if exists trg_project_members_from_project on public.projects;

-- 1. ------------------------------------------------------------------------------------------
create or replace function public.wbs_baselines_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return coalesce(new, old); -- service role, jobs, migrations
  end if;
  if coalesce(current_setting('dcos.baseline_decide', true), '') <> 'on' then
    raise exception 'Baselines are changed only with set_baseline, approve_baseline, reject_baseline, activate_baseline and clear_baseline'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'approved' and not public.is_admin(auth.uid()) then
      raise exception 'An approved baseline cannot be deleted' using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved'
     and (new.snapshot_data, new.baseline_type, new.baseline_name, new.reason, new.baseline_number,
          new.project_id, new.set_by, new.created_by, new.status)
         is distinct from
         (old.snapshot_data, old.baseline_type, old.baseline_name, old.reason, old.baseline_number,
          old.project_id, old.set_by, old.created_by, old.status) then
    raise exception 'An approved baseline cannot be changed: set a new baseline instead'
      using errcode = 'insufficient_privilege';
  end if;

  if new.is_active and new.status <> 'approved' then
    raise exception 'Only an approved baseline can be active' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- set_baseline: same body as R3, writing under the baseline flag
create or replace function public.set_baseline(
  p_project_id uuid, p_number integer, p_task_ids uuid[],
  p_name text default null, p_type text default 'current', p_reason text default null)
returns void
language plpgsql
as $$
declare
  v_whole    boolean := (p_task_ids is null or array_length(p_task_ids, 1) is null);
  v_existing public.wbs_baselines%rowtype;
  v_new      jsonb;
  v_kept     jsonb := '[]'::jsonb;
  v_prev     text := coalesce(current_setting('dcos.baseline_decide', true), '');
begin
  if not public.has_permission('planning', 'baseline', 'edit') or not public.is_project_member(p_project_id) then
    raise exception 'Setting a baseline needs Planning baseline edit permission on this project'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing from public.wbs_baselines
   where project_id = p_project_id and baseline_number = p_number;
  if v_existing.id is not null and v_existing.status = 'approved' then
    raise exception 'Baseline % is approved and cannot be changed. Choose an empty number to set a new baseline', p_number;
  end if;

  if p_type = 'revised' and (p_reason is null or length(trim(p_reason)) < 10) then
    raise exception 'A reason is required to create a revised baseline';
  end if;
  if p_type = 'contract' and exists (select 1 from public.wbs_baselines
                                      where project_id = p_project_id and baseline_type = 'contract'
                                        and status = 'approved') then
    raise exception 'This project already has an approved contract baseline: set a revised baseline instead';
  end if;

  v_new := public.baseline_task_snapshot(p_project_id, case when v_whole then null else p_task_ids end);

  if not v_whole then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_kept
      from public.wbs_baselines b,
           lateral jsonb_array_elements(coalesce(b.snapshot_data -> 'tasks', '[]'::jsonb)) e
     where b.project_id = p_project_id and b.is_active and b.status = 'approved'
       and not ((e ->> 'id')::uuid = any (p_task_ids));
  end if;

  perform set_config('dcos.baseline_decide', 'on', true);
  if v_existing.id is not null then
    delete from public.wbs_baselines where id = v_existing.id;
  end if;

  insert into public.wbs_baselines
    (project_id, baseline_number, baseline_name, baseline_type, baseline_date, snapshot_data,
     is_active, set_by, created_by, reason, locked, status)
  values
    (p_project_id, p_number,
     coalesce(p_name, case when p_number = 0 then 'Baseline' else 'Baseline ' || p_number end),
     p_type, current_date,
     jsonb_build_object('set_at', now(), 'scope', case when v_whole then 'all' else 'selected' end,
                        'tasks', v_kept || v_new,
                        'calendar', public.baseline_calendar_snapshot(p_project_id)),
     false, auth.uid(), auth.uid(), p_reason, false, 'pending');
  perform set_config('dcos.baseline_decide', v_prev, true);

  insert into public.wbs_audit_log (project_id, user_id, action, field_name, old_value, new_value)
  values (p_project_id, auth.uid(), 'Baseline Submitted', 'baseline', null, p_number::text);
end;
$$;

create or replace function public.apply_baseline_approval(p_baseline_id uuid, p_comment text)
returns void
language plpgsql
as $$
declare
  v_b    public.wbs_baselines%rowtype;
  v_prev text := coalesce(current_setting('dcos.schedule_write', true), '');
begin
  if coalesce(current_setting('dcos.baseline_decide', true), '') <> 'on' then
    raise exception 'Use approve_baseline to approve a baseline' using errcode = 'insufficient_privilege';
  end if;
  select * into v_b from public.wbs_baselines where id = p_baseline_id;

  perform set_config('dcos.schedule_write', 'on', true);

  update public.wbs_baselines set is_active = false
   where project_id = v_b.project_id and id <> v_b.id and is_active;

  update public.wbs_baselines
     set status = 'approved', locked = true, is_active = true,
         decided_by = auth.uid(), decided_at = now(), decision_comment = p_comment
   where id = v_b.id;

  update public.wbs_tasks set baseline_start_date = null, baseline_finish_date = null, baseline_cost = null
   where project_id = v_b.project_id
     and (baseline_start_date is not null or baseline_finish_date is not null or baseline_cost is not null);

  update public.wbs_tasks t set
     baseline_start_date  = (e ->> 'start_date')::date,
     baseline_finish_date = (e ->> 'end_date')::date,
     baseline_cost        = (e ->> 'budget_cost')::numeric,
     baseline_set_at      = now(),
     baseline_set_by      = v_b.set_by
    from jsonb_array_elements(coalesce(v_b.snapshot_data -> 'tasks', '[]'::jsonb)) e
   where t.id = (e ->> 'id')::uuid and t.project_id = v_b.project_id;

  perform set_config('dcos.schedule_write', v_prev, true);

  insert into public.wbs_audit_log (project_id, user_id, action, field_name, old_value, new_value)
  values (v_b.project_id, auth.uid(), 'Baseline Approved', 'baseline', 'pending', v_b.baseline_number::text);
end;
$$;

create or replace function public.approve_baseline(p_baseline_id uuid, p_comment text default null)
returns void
language plpgsql
as $$
declare
  v_b    public.wbs_baselines%rowtype;
  v_prev text := coalesce(current_setting('dcos.baseline_decide', true), '');
begin
  select * into v_b from public.wbs_baselines where id = p_baseline_id for update;
  if v_b.id is null then
    raise exception 'Baseline not found';
  end if;
  if v_b.status <> 'pending' then
    raise exception 'Only a baseline waiting for approval can be approved';
  end if;
  if not public.has_permission('planning', 'baseline', 'approve') or not public.is_project_member(v_b.project_id) then
    raise exception 'Approving a baseline needs Planning baseline approve permission on this project'
      using errcode = 'insufficient_privilege';
  end if;
  if v_b.set_by is null or v_b.set_by = auth.uid() then
    raise exception 'Four-eyes check: the person who set a baseline cannot approve it'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('dcos.baseline_decide', 'on', true);
  perform public.apply_baseline_approval(p_baseline_id, p_comment);
  perform set_config('dcos.baseline_decide', v_prev, true);
end;
$$;

create or replace function public.activate_baseline(p_project_id uuid, p_number integer)
returns void
language plpgsql
as $$
declare
  v_prev_b text := coalesce(current_setting('dcos.baseline_decide', true), '');
  v_prev_s text := coalesce(current_setting('dcos.schedule_write', true), '');
begin
  if not public.has_permission('planning', 'baseline', 'edit') or not public.is_project_member(p_project_id) then
    raise exception 'Changing the active baseline needs Planning baseline edit permission on this project'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.wbs_baselines
                  where project_id = p_project_id and baseline_number = p_number and status = 'approved') then
    raise exception 'Only an approved baseline can be made active';
  end if;

  perform set_config('dcos.baseline_decide', 'on', true);
  perform set_config('dcos.schedule_write', 'on', true);

  update public.wbs_baselines set is_active = (baseline_number = p_number)
   where project_id = p_project_id and is_active is distinct from (baseline_number = p_number);

  update public.wbs_tasks set baseline_start_date = null, baseline_finish_date = null, baseline_cost = null
   where project_id = p_project_id;

  update public.wbs_tasks t set
     baseline_start_date  = (e ->> 'start_date')::date,
     baseline_finish_date = (e ->> 'end_date')::date,
     baseline_cost        = (e ->> 'budget_cost')::numeric,
     baseline_set_at      = now(),
     baseline_set_by      = auth.uid()
    from public.wbs_baselines b,
         lateral jsonb_array_elements(coalesce(b.snapshot_data -> 'tasks', '[]'::jsonb)) e
   where b.project_id = p_project_id and b.baseline_number = p_number
     and t.id = (e ->> 'id')::uuid and t.project_id = p_project_id;

  perform set_config('dcos.schedule_write', v_prev_s, true);
  perform set_config('dcos.baseline_decide', v_prev_b, true);
end
$$;

create or replace function public.clear_baseline(p_project_id uuid, p_number integer, p_task_ids uuid[])
returns void
language plpgsql
as $$
declare
  v_whole  boolean := (p_task_ids is null or array_length(p_task_ids, 1) is null);
  v_b      public.wbs_baselines%rowtype;
  v_prev_b text := coalesce(current_setting('dcos.baseline_decide', true), '');
  v_prev_s text := coalesce(current_setting('dcos.schedule_write', true), '');
begin
  if not public.has_permission('planning', 'baseline', 'delete') or not public.is_project_member(p_project_id) then
    raise exception 'Clearing a baseline needs Planning baseline delete permission on this project'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_b from public.wbs_baselines where project_id = p_project_id and baseline_number = p_number;
  if v_b.id is null then
    return;
  end if;
  if v_b.status = 'approved' and not v_whole then
    raise exception 'An approved baseline cannot be partly cleared: set a new baseline instead';
  end if;

  perform set_config('dcos.baseline_decide', 'on', true);
  perform set_config('dcos.schedule_write', 'on', true);
  if v_whole then
    delete from public.wbs_baselines where id = v_b.id; -- the guard keeps approved ones for admins only
    if v_b.is_active then
      update public.wbs_tasks set
         baseline_start_date = null, baseline_finish_date = null, baseline_cost = null,
         baseline_set_at = null, baseline_set_by = null
       where project_id = p_project_id;
    end if;
  else
    update public.wbs_baselines set snapshot_data = jsonb_set(snapshot_data, '{tasks}', coalesce(
             (select jsonb_agg(e)
                from jsonb_array_elements(coalesce(snapshot_data -> 'tasks', '[]'::jsonb)) e
               where not ((e ->> 'id')::uuid = any (p_task_ids))), '[]'::jsonb))
     where id = v_b.id;
  end if;
  perform set_config('dcos.schedule_write', v_prev_s, true);
  perform set_config('dcos.baseline_decide', v_prev_b, true);
end
$$;

create or replace function public.accept_baseline_by_client(p_baseline_id uuid)
returns void
language plpgsql
as $$
declare
  v_prev text := coalesce(current_setting('dcos.baseline_decide', true), '');
begin
  if not public.has_permission('planning', 'programme', 'approve') then
    raise exception 'Recording client acceptance needs Planning programme approve permission'
      using errcode = 'insufficient_privilege';
  end if;
  perform set_config('dcos.baseline_decide', 'on', true);
  update public.wbs_baselines
     set client_accepted = true, client_accepted_at = now(), client_accepted_by = auth.uid()
   where id = p_baseline_id and status = 'approved';
  if not found then
    raise exception 'Only an approved baseline can be accepted by the client';
  end if;
  perform set_config('dcos.baseline_decide', v_prev, true);
end;
$$;

-- reject_baseline (R3) already sets the flag; transition_revision calls set_baseline and
-- apply_baseline_approval, both covered above.

-- 3 + 4. ----------------------------------------------------------------------------------------
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
      new.constraint_type, new.constraint_date, new.is_milestone, new.manually_scheduled)
     is distinct from
     (old.start_date, old.end_date, old.duration_days, old.duration_unit,
      old.dependency_task_ids, old.dependency_types, old.dependency_lag_days,
      old.dependency_task_id, old.dependency_type, old.lag_days,
      old.constraint_type, old.constraint_date, old.is_milestone, old.manually_scheduled)
     and not public.has_permission('planning', 'schedule', 'edit') then
    raise exception 'Changing schedule dates or links needs Planning schedule edit permission'
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

-- 5. ------------------------------------------------------------------------------------------
alter function public.decide_progress_review(uuid, text, text) security definer;
alter function public.decide_progress_review(uuid, text, text) set search_path = public;

-- 3. ------------------------------------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  foreach f in array array[
    'public.set_project_baseline(uuid)',
    'public.generate_recurring_tasks()',
    'public.generate_wbs_from_master_library_items(uuid,jsonb,uuid)',
    'public.apply_schedule_dates(uuid,jsonb)',
    'public.apply_wbs_codes(uuid,jsonb)',
    'public.clear_baseline(uuid,integer,uuid[])',
    'public.activate_baseline(uuid,integer)',
    'public.move_project(uuid,integer,boolean,boolean)',
    'public.import_master_wbs(uuid,jsonb,text)',
    'public.set_baseline(uuid,integer,uuid[],text,text,text)',
    'public.accept_baseline_by_client(uuid)',
    'public.submit_progress(uuid,numeric,text)',
    'public.decide_progress_review(uuid,text,text)',
    'public.apply_levelling_constraints(uuid,jsonb)',
    'public.sync_daily_report_to_planning(uuid)',
    'public.plan_act_commit_generation(jsonb)',
    'public.publish_team_plan(uuid,text,jsonb)',
    'public.task_transition(uuid,text,text)',
    'public.record_task_progress(uuid,numeric,numeric,numeric,text,date,text)',
    'public.review_task(uuid,text,text,text)',
    'public.set_task_planning(uuid,jsonb)'
  ]::regprocedure[]
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- the legacy whole-project baseline writer bypasses approval; nothing in the app calls it
revoke execute on function public.set_project_baseline(uuid) from authenticated;
