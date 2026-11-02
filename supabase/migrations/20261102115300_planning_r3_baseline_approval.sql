-- Phase R3 (doc 35; doc 22 P1.1 / P1.2, F6): baselines are immutable and take effect only after
-- approval by a second person.
--   * set_baseline never overwrites an approved baseline. It creates a numbered version with status
--     'pending' and a full snapshot: per task dates, duration, links, constraints, milestone flag
--     and cost, plus the project calendar and its exceptions.
--   * approve_baseline (planning baseline approve; approver <> the person who set it) makes it
--     'approved', locks it, makes it the active baseline and writes the baseline fields on tasks.
--   * reject_baseline returns a reason. A pending or rejected version can be replaced or deleted.
--   * Only approved baselines can be activated. An approved baseline cannot be edited, and only an
--     admin can delete it.
--   * A client-approved programme revision (transition_revision) becomes an approved baseline
--     directly; its approval chain already ran.
-- Existing baselines are in use, so they are recorded as approved.

alter table public.wbs_baselines
  add column if not exists status text not null default 'approved',
  add column if not exists decided_by uuid references public.profiles(id),
  add column if not exists decided_at timestamptz,
  add column if not exists decision_comment text;

alter table public.wbs_baselines alter column status set default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wbs_baselines_status_check') then
    alter table public.wbs_baselines
      add constraint wbs_baselines_status_check check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Guard: status changes only through approve / reject (flag dcos.baseline_decide), approved
-- baselines are frozen, only approved baselines can be active, approved ones are deleted by admins only.
create or replace function public.wbs_baselines_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deciding boolean := coalesce(current_setting('dcos.baseline_decide', true), '') = 'on';
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'approved' and not public.is_admin(auth.uid()) then
      raise exception 'An approved baseline cannot be deleted' using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending' and not v_deciding then
      raise exception 'A new baseline starts as pending approval' using errcode = 'insufficient_privilege';
    end if;
  else
    if new.status is distinct from old.status and not v_deciding then
      raise exception 'Baselines are approved or rejected with approve_baseline / reject_baseline'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'approved'
       and (new.snapshot_data, new.baseline_type, new.baseline_name, new.reason, new.baseline_number, new.project_id)
           is distinct from
           (old.snapshot_data, old.baseline_type, old.baseline_name, old.reason, old.baseline_number, old.project_id) then
      raise exception 'An approved baseline cannot be changed: set a new baseline instead'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.is_active and new.status <> 'approved' then
    raise exception 'Only an approved baseline can be active' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wbs_baselines_status_guard on public.wbs_baselines;
create trigger trg_wbs_baselines_status_guard
  before insert or update or delete on public.wbs_baselines
  for each row execute function public.wbs_baselines_status_guard();

-- ---------------------------------------------------------------------------------------------
-- Snapshot of tasks (all when p_task_ids is null)
create or replace function public.baseline_task_snapshot(p_project_id uuid, p_task_ids uuid[])
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'start_date', start_date, 'end_date', end_date,
           'duration_days', duration_days, 'duration_unit', duration_unit,
           'budget_cost', budget_cost, 'is_milestone', is_milestone,
           'dependency_task_ids', dependency_task_ids, 'dependency_types', dependency_types,
           'dependency_lag_days', dependency_lag_days,
           'constraint_type', constraint_type, 'constraint_date', constraint_date,
           'wbs_node_id', wbs_node_id)
         order by id), '[]'::jsonb)
  from public.wbs_tasks
  where project_id = p_project_id
    and start_date is not null and end_date is not null
    and (p_task_ids is null or id = any (p_task_ids));
$$;

create or replace function public.baseline_calendar_snapshot(p_project_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
           'calendar', to_jsonb(c),
           'exceptions', coalesce((select jsonb_agg(jsonb_build_object(
                             'date', e.exception_date, 'is_working', e.is_working, 'reason', e.reason)
                             order by e.exception_date)
                           from public.plan_calendar_exceptions e where e.calendar_id = c.id), '[]'::jsonb))
  from public.plan_calendars c
  where c.project_id = p_project_id
  order by c.is_default desc, c.created_at
  limit 1;
$$;

-- ---------------------------------------------------------------------------------------------
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

  -- Part of the programme: the other tasks keep the values of the active approved baseline.
  if not v_whole then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into v_kept
      from public.wbs_baselines b,
           lateral jsonb_array_elements(coalesce(b.snapshot_data -> 'tasks', '[]'::jsonb)) e
     where b.project_id = p_project_id and b.is_active and b.status = 'approved'
       and not ((e ->> 'id')::uuid = any (p_task_ids));
  end if;

  -- A pending or rejected version in this number is replaced (it never took effect).
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

  insert into public.wbs_audit_log (project_id, user_id, action, field_name, old_value, new_value)
  values (p_project_id, auth.uid(), 'Baseline Submitted', 'baseline', null, p_number::text);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Makes a baseline approved and active and writes the baseline fields on tasks. Callers must set
-- dcos.baseline_decide = 'on' first (approve_baseline, transition_revision); users cannot set it.
create or replace function public.apply_baseline_approval(p_baseline_id uuid, p_comment text)
returns void
language plpgsql
as $$
declare
  v_b public.wbs_baselines%rowtype;
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

  perform set_config('dcos.schedule_write', '', true);

  insert into public.wbs_audit_log (project_id, user_id, action, field_name, old_value, new_value)
  values (v_b.project_id, auth.uid(), 'Baseline Approved', 'baseline', 'pending', v_b.baseline_number::text);
end;
$$;

create or replace function public.approve_baseline(p_baseline_id uuid, p_comment text default null)
returns void
language plpgsql
as $$
declare
  v_b public.wbs_baselines%rowtype;
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
  if v_b.set_by = auth.uid() then
    raise exception 'Four-eyes check: the person who set a baseline cannot approve it'
      using errcode = 'insufficient_privilege';
  end if;

  perform set_config('dcos.baseline_decide', 'on', true);
  perform public.apply_baseline_approval(p_baseline_id, p_comment);
  perform set_config('dcos.baseline_decide', '', true);
end;
$$;

create or replace function public.reject_baseline(p_baseline_id uuid, p_comment text)
returns void
language plpgsql
as $$
declare
  v_b public.wbs_baselines%rowtype;
begin
  select * into v_b from public.wbs_baselines where id = p_baseline_id for update;
  if v_b.id is null then
    raise exception 'Baseline not found';
  end if;
  if v_b.status <> 'pending' then
    raise exception 'Only a baseline waiting for approval can be rejected';
  end if;
  if not public.has_permission('planning', 'baseline', 'approve') or not public.is_project_member(v_b.project_id) then
    raise exception 'Rejecting a baseline needs Planning baseline approve permission on this project'
      using errcode = 'insufficient_privilege';
  end if;
  if p_comment is null or length(trim(p_comment)) < 5 then
    raise exception 'Give a reason for rejecting the baseline';
  end if;

  perform set_config('dcos.baseline_decide', 'on', true);
  update public.wbs_baselines
     set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_comment = trim(p_comment)
   where id = p_baseline_id;
  perform set_config('dcos.baseline_decide', '', true);

  insert into public.wbs_audit_log (project_id, user_id, action, field_name, old_value, new_value)
  values (v_b.project_id, auth.uid(), 'Baseline Rejected', 'baseline', 'pending', v_b.baseline_number::text);
end;
$$;

create or replace function public.activate_baseline(p_project_id uuid, p_number integer)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from public.wbs_baselines
                  where project_id = p_project_id and baseline_number = p_number and status = 'approved') then
    raise exception 'Only an approved baseline can be made active';
  end if;

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
end
$$;

create or replace function public.clear_baseline(p_project_id uuid, p_number integer, p_task_ids uuid[])
returns void
language plpgsql
as $$
declare
  v_whole boolean := (p_task_ids is null or array_length(p_task_ids, 1) is null);
  v_b     public.wbs_baselines%rowtype;
begin
  select * into v_b from public.wbs_baselines where project_id = p_project_id and baseline_number = p_number;
  if v_b.id is null then
    return;
  end if;
  if v_b.status = 'approved' and not v_whole then
    raise exception 'An approved baseline cannot be partly cleared: set a new baseline instead';
  end if;

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
end
$$;

create or replace function public.accept_baseline_by_client(p_baseline_id uuid)
returns void
language plpgsql
as $$
begin
  if not public.has_permission('planning', 'programme', 'approve') then
    raise exception 'Recording client acceptance needs Planning programme approve permission'
      using errcode = 'insufficient_privilege';
  end if;
  update public.wbs_baselines
     set client_accepted = true, client_accepted_at = now(), client_accepted_by = auth.uid()
   where id = p_baseline_id and status = 'approved';
  if not found then
    raise exception 'Only an approved baseline can be accepted by the client';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- transition_revision: a client-approved revision becomes an approved baseline in the next free number.
create or replace function public.transition_revision(p_revision_id uuid, p_action text, p_comment text default null)
returns jsonb
language plpgsql
as $function$
declare
  v_project_id         uuid;
  v_stream_name        text;
  v_status             text;
  v_old_status         text;
  v_submitted_by       uuid;
  v_role_chain         jsonb;
  v_step               int;
  v_pending_approval_id uuid;
  v_total_steps        int;
  v_approved_steps     int;
  v_baseline_slot      int;
  v_baseline_type      text;
  v_baseline_id        uuid;
begin
  select pss.project_id, pss.name, pr.status, pr.submitted_by
    into v_project_id, v_stream_name, v_status, v_submitted_by
  from public.plan_schedule_revisions pr
  join public.plan_schedule_streams pss on pss.id = pr.stream_id
  where pr.id = p_revision_id;

  if v_project_id is null then
    raise exception 'Revision % not found', p_revision_id;
  end if;

  v_old_status := v_status;

  if p_action = 'submit' then
    if v_status <> 'draft' then
      raise exception 'Cannot submit a revision that is not in draft status';
    end if;
    if not public.has_permission('planning', 'programme', 'submit') then
      raise exception 'You do not have permission to submit a programme revision';
    end if;

    update public.plan_schedule_revisions
    set status = 'submitted_internal', submitted_by = auth.uid(), submitted_at = now()
    where id = p_revision_id;

    select role_chain into v_role_chain
    from public.project_approval_flows
    where project_id = v_project_id and flow_type = 'programme_revision';

    if v_role_chain is not null and jsonb_array_length(v_role_chain) > 0 then
      for v_step in 1..jsonb_array_length(v_role_chain) loop
        insert into public.plan_revision_approvals (revision_id, step, approver_role)
        values (p_revision_id, v_step, v_role_chain ->> (v_step - 1));
      end loop;
    else
      insert into public.plan_revision_approvals (revision_id, step, approver_role)
      values (p_revision_id, 1, 'PE');
    end if;

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Submitted', 'status', v_old_status, 'submitted_internal');

    return jsonb_build_object('status', 'submitted_internal');

  elsif p_action = 'approve' then
    if v_status <> 'submitted_internal' then
      raise exception 'Cannot approve a revision that is not submitted for internal review';
    end if;
    if auth.uid() = v_submitted_by then
      raise exception 'Four-eyes check failed: the submitter cannot also approve this revision';
    end if;
    if not public.has_permission('planning', 'programme', 'approve') then
      raise exception 'You do not have permission to approve a programme revision';
    end if;

    select id into v_pending_approval_id
    from public.plan_revision_approvals
    where revision_id = p_revision_id and decision = 'pending'
    order by step
    limit 1;

    if v_pending_approval_id is null then
      raise exception 'No pending approval step found for this revision';
    end if;

    update public.plan_revision_approvals
    set decision = 'approved', user_id = auth.uid(), decided_at = now(), comments = p_comment
    where id = v_pending_approval_id;

    select count(*), count(*) filter (where decision = 'approved')
      into v_total_steps, v_approved_steps
    from public.plan_revision_approvals
    where revision_id = p_revision_id;

    if v_approved_steps = v_total_steps then
      update public.plan_schedule_revisions set status = 'approved_internal' where id = p_revision_id;
      v_status := 'approved_internal';
    end if;

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Approved', 'status', v_old_status, v_status);

    return jsonb_build_object('status', v_status);

  elsif p_action = 'reject' then
    if v_status <> 'submitted_internal' then
      raise exception 'Cannot reject a revision that is not submitted for internal review';
    end if;
    if auth.uid() = v_submitted_by then
      raise exception 'Four-eyes check failed: the submitter cannot also reject this revision';
    end if;
    if not public.has_permission('planning', 'programme', 'approve') then
      raise exception 'You do not have permission to reject a programme revision';
    end if;

    update public.plan_schedule_revisions
    set status = 'rejected', decision_comment = p_comment
    where id = p_revision_id;

    update public.plan_revision_approvals
    set decision = 'rejected', user_id = auth.uid(), decided_at = now(), comments = p_comment
    where revision_id = p_revision_id and decision = 'pending';

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Rejected', 'status', v_old_status, 'rejected');

    return jsonb_build_object('status', 'rejected');

  elsif p_action = 'submit_client' then
    if v_status <> 'approved_internal' then
      raise exception 'Cannot submit to client a revision that is not approved_internal';
    end if;
    if not public.has_permission('planning', 'programme', 'submit') then
      raise exception 'You do not have permission to submit a programme revision to the client';
    end if;

    update public.plan_schedule_revisions set status = 'submitted_client' where id = p_revision_id;

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Submitted', 'status', v_old_status, 'submitted_client');

    return jsonb_build_object('status', 'submitted_client');

  elsif p_action = 'client_approve' then
    if v_status <> 'submitted_client' then
      raise exception 'Cannot record client approval on a revision that is not submitted_client';
    end if;
    if not public.has_permission('planning', 'programme', 'approve') then
      raise exception 'You do not have permission to record client approval of a programme revision';
    end if;

    select coalesce(max(baseline_number) + 1, 0) into v_baseline_slot
    from public.wbs_baselines where project_id = v_project_id;

    select case
             when not exists (
               select 1 from public.wbs_baselines
               where project_id = v_project_id and baseline_type = 'contract' and status = 'approved'
             ) then 'contract'
             else 'revised'
           end
      into v_baseline_type;

    begin
      perform public.set_baseline(
        v_project_id, v_baseline_slot, null,
        p_name   => coalesce(v_stream_name, 'Client-approved revision'),
        p_type   => v_baseline_type,
        p_reason => case when v_baseline_type = 'revised'
                         then coalesce(p_comment, 'Client-approved programme revision')
                         else null end
      );
    exception when others then
      if sqlerrm ilike '%reason is required%' then
        raise exception 'A longer description (at least 10 characters) is required to record this client-approved revision as a baseline — please provide more detail in the comment and try again.';
      else
        raise exception 'Failed to create the client-approved baseline: %', sqlerrm;
      end if;
    end;

    -- The revision's own approval chain already ran, so the baseline is approved directly.
    select id into v_baseline_id from public.wbs_baselines
     where project_id = v_project_id and baseline_number = v_baseline_slot;
    perform set_config('dcos.baseline_decide', 'on', true);
    perform public.apply_baseline_approval(v_baseline_id, coalesce(p_comment, 'Client-approved programme revision'));
    perform set_config('dcos.baseline_decide', '', true);

    update public.plan_schedule_revisions set status = 'approved_client' where id = p_revision_id;

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Approved', 'status', v_old_status, 'approved_client');

    return jsonb_build_object('status', 'approved_client', 'baseline_number', v_baseline_slot, 'baseline_type', v_baseline_type);

  elsif p_action = 'client_reject' then
    if v_status <> 'submitted_client' then
      raise exception 'Cannot record client rejection on a revision that is not submitted_client';
    end if;

    update public.plan_schedule_revisions
    set status = 'rejected', decision_comment = p_comment
    where id = p_revision_id;

    insert into public.wbs_audit_log
      (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
    values
      (v_project_id, null, null, auth.uid(), 'Revision Rejected', 'status', v_old_status, 'rejected');

    return jsonb_build_object('status', 'rejected');

  else
    raise exception 'Unknown transition_revision action: %', p_action;
  end if;
end;
$function$;

revoke all on function public.apply_baseline_approval(uuid, text) from public, anon;
grant execute on function public.apply_baseline_approval(uuid, text) to authenticated;
revoke all on function public.approve_baseline(uuid, text) from public, anon;
grant execute on function public.approve_baseline(uuid, text) to authenticated;
revoke all on function public.reject_baseline(uuid, text) from public, anon;
grant execute on function public.reject_baseline(uuid, text) to authenticated;
revoke execute on function public.accept_baseline_by_client(uuid) from anon;
