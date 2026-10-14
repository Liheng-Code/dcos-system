-- Task Team Planning, slice 3: team-plan publication, revisions and capacity overrides.
-- See docs/04-Business-Modules/04-04-Task-Management/13-Team-Planning-Addendum.md §6-7
-- Idempotent and additive. Existing draft/submitted/approved plan rows are untouched.

-- ---------------------------------------------------------------------------
-- weekly_plans: published state and revision counter
-- ---------------------------------------------------------------------------
alter table public.weekly_plans
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles(id) on delete set null,
  add column if not exists revision_no integer not null default 0,
  add column if not exists archived_at timestamptz;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'weekly_plans_status_check') then
    alter table public.weekly_plans drop constraint weekly_plans_status_check;
  end if;
  alter table public.weekly_plans add constraint weekly_plans_status_check
    check (status in ('draft','submitted','approved','published','archived'));
end $$;

-- ---------------------------------------------------------------------------
-- New notification types (task_alerts is the existing in-app notification table)
-- ---------------------------------------------------------------------------
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conname = 'task_alerts_alert_type_check' and conrelid = 'public.task_alerts'::regclass;
  if v_def is not null and v_def not like '%plan_published%' then
    alter table public.task_alerts drop constraint task_alerts_alert_type_check;
    alter table public.task_alerts add constraint task_alerts_alert_type_check
      check (alert_type = any (array[
        'baseline_set','dr_correction_overdue','dr_delay_notice','dr_info_requested','dr_report_approved',
        'dr_report_missing','dr_report_returned','dr_report_submitted','dr_requires_review','dr_review_overdue',
        'dr_review_required','dr_safety_incident','dr_summary_published','dr_telegram_migrated','dr_telegram_suspended',
        'monthly_report_ready','programme_revision_decided','programme_revision_submitted','progress_review_decided',
        'progress_review_requested','schedule_critical_path_changed','schedule_float_consumed','schedule_overrun',
        'task_approved','task_assigned','task_assignment_accepted','task_assignment_rejected','task_overdue',
        'task_progress_updated','task_reassigned','task_rejected','task_submitted',
        'plan_published','plan_revised']::text[]));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- team_plan_revisions (append-only) and capacity_overrides (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.team_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  revision_no integer not null,
  action text not null check (action in ('published','reopened','archived')),
  reason text,
  items_snapshot jsonb not null default '[]'::jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists team_plan_revisions_plan_idx on public.team_plan_revisions (weekly_plan_id, created_at);

create table if not exists public.capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  period_start date not null,
  period_end date not null,
  planned_hours numeric,
  available_hours numeric,
  utilization_pct numeric,
  reason text not null check (length(btrim(reason)) >= 5),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists capacity_overrides_plan_idx on public.capacity_overrides (weekly_plan_id);
create index if not exists capacity_overrides_profile_idx on public.capacity_overrides (profile_id, period_start);

alter table public.team_plan_revisions enable row level security;
alter table public.capacity_overrides enable row level security;

-- readable by members of the plan's project who can plan or view department work; written only by the RPCs
drop policy if exists team_plan_revisions_select on public.team_plan_revisions;
create policy team_plan_revisions_select on public.team_plan_revisions for select to authenticated
  using (exists (select 1 from public.weekly_plans p
                  where p.id = weekly_plan_id and public.is_project_member(p.project_id))
         and (public.has_permission('task_management', 'plan_team', 'edit')
              or public.has_permission('task_management', 'view_department', 'view')));
drop policy if exists capacity_overrides_select on public.capacity_overrides;
create policy capacity_overrides_select on public.capacity_overrides for select to authenticated
  using (exists (select 1 from public.weekly_plans p
                  where p.id = weekly_plan_id and public.is_project_member(p.project_id))
         and (public.has_permission('task_management', 'plan_team', 'edit')
              or public.has_permission('task_management', 'view_department', 'view')));

-- ---------------------------------------------------------------------------
-- A published plan cannot be edited or deleted silently: change it through
-- reopen_team_plan (reason required) and publish_team_plan.
-- ---------------------------------------------------------------------------
create or replace function public.guard_published_plan()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_plan uuid; v_status text;
begin
  if current_setting('dcos.team_plan_rpc', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'weekly_plans' then
    v_status := old.status;
    if tg_op = 'DELETE' and v_status = 'published' then
      raise exception 'A published team plan cannot be deleted; archive it instead.';
    end if;
    if tg_op = 'UPDATE' and v_status = 'published' and new.status = 'published'
       and (new.title is distinct from old.title or new.week_start_date is distinct from old.week_start_date
            or new.department_id is distinct from old.department_id or new.project_id is distinct from old.project_id) then
      raise exception 'A published team plan cannot be edited; reopen it with a reason first.';
    end if;
    return coalesce(new, old);
  end if;
  v_plan := coalesce(new.weekly_plan_id, old.weekly_plan_id);
  select status into v_status from public.weekly_plans where id = v_plan;
  if v_status = 'published' then
    raise exception 'This team plan is published. Reopen it with a reason before changing its tasks.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists weekly_plan_tasks_guard_published on public.weekly_plan_tasks;
create trigger weekly_plan_tasks_guard_published
  before insert or update or delete on public.weekly_plan_tasks
  for each row execute function public.guard_published_plan();
drop trigger if exists weekly_plans_guard_published on public.weekly_plans;
create trigger weekly_plans_guard_published
  before update or delete on public.weekly_plans
  for each row execute function public.guard_published_plan();

-- ---------------------------------------------------------------------------
-- reopen_team_plan: published -> draft, with a recorded reason
-- ---------------------------------------------------------------------------
create or replace function public.reopen_team_plan(p_plan_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_plan public.weekly_plans%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_plan from public.weekly_plans where id = p_plan_id for update;
  if not found then raise exception 'Team plan not found'; end if;
  if not public.is_project_member(v_plan.project_id)
     or not public.has_permission('task_management', 'plan_team', 'edit') then
    raise exception 'You are not allowed to change this team plan';
  end if;
  if v_plan.status <> 'published' then raise exception 'Only a published plan can be reopened'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A reason (at least 5 characters) is required to reopen a published plan';
  end if;

  perform set_config('dcos.team_plan_rpc', 'on', true);
  update public.weekly_plans set status = 'draft' where id = p_plan_id;
  insert into public.team_plan_revisions (weekly_plan_id, revision_no, action, reason, items_snapshot, changed_by)
  values (p_plan_id, v_plan.revision_no, 'reopened', btrim(p_reason), '[]'::jsonb, auth.uid());
  perform set_config('dcos.team_plan_rpc', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- publish_team_plan: one transaction -> assignments, audit, notifications, revision record.
-- p_overrides: [{"profile_id": "...", "period_start": "...", "period_end": "...",
--                "planned_hours": n, "available_hours": n, "utilization_pct": n, "reason": "..."}]
-- Capacity itself is computed server-side by the caller (lib/project/tasks/capacity.ts);
-- this function enforces permissions, plan state, data validity, reasons and atomicity.
-- ---------------------------------------------------------------------------
create or replace function public.publish_team_plan(
  p_plan_id uuid,
  p_reason text default null,
  p_overrides jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_plan public.weekly_plans%rowtype;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_rev integer;
  v_item record;
  v_prev jsonb;
  v_prev_item jsonb;
  v_snapshot jsonb;
  v_assigned integer := 0;
  v_notified integer := 0;
  v_ov jsonb;
  v_old_owner uuid;
  v_task public.wbs_tasks%rowtype;
  v_resp_name text;
  v_key text;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;

  select * into v_plan from public.weekly_plans where id = p_plan_id for update;
  if not found then raise exception 'Team plan not found'; end if;
  if not public.is_project_member(v_plan.project_id)
     or not public.has_permission('task_management', 'plan_team', 'edit') then
    raise exception 'You are not allowed to publish this team plan';
  end if;

  if v_plan.status = 'published' then raise exception 'This plan is already published; reopen it to revise'; end if;
  if v_plan.status = 'archived' then raise exception 'An archived plan cannot be published'; end if;
  -- A separate approval step is required unless the publisher can also approve.
  if v_plan.status in ('draft','submitted')
     and not public.has_permission('task_management', 'approve_task', 'approve') then
    raise exception 'The plan must be approved before publication (status is %)', v_plan.status;
  end if;

  v_rev := v_plan.revision_no + 1;
  if v_rev > 1 and (p_reason is null or length(btrim(p_reason)) < 5) then
    raise exception 'A reason (at least 5 characters) is required to republish a revised plan';
  end if;

  if not exists (select 1 from public.weekly_plan_tasks where weekly_plan_id = p_plan_id) then
    raise exception 'The plan has no tasks';
  end if;

  -- Serialise concurrent publications that touch the same employee.
  for v_item in
    select distinct responsible_id from public.weekly_plan_tasks
     where weekly_plan_id = p_plan_id and responsible_id is not null order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_item.responsible_id::text, 0));
  end loop;

  -- Validate every item before changing anything.
  for v_item in
    select wpt.wbs_task_id, wpt.responsible_id, t.status, t.reviewer_id, t.project_id, t.task_code,
           p.status as profile_status
      from public.weekly_plan_tasks wpt
      join public.wbs_tasks t on t.id = wpt.wbs_task_id
      left join public.profiles p on p.id = wpt.responsible_id
     where wpt.weekly_plan_id = p_plan_id
  loop
    if v_item.responsible_id is null then
      raise exception 'Task % has no responsible person', v_item.task_code;
    end if;
    if v_item.profile_status is distinct from 'active' then
      raise exception 'The responsible person for task % is not an active employee', v_item.task_code;
    end if;
    if v_item.project_id <> v_plan.project_id then
      raise exception 'Task % belongs to a different project', v_item.task_code;
    end if;
    if v_item.status in ('closed','cancelled','completed','approved') then
      raise exception 'Task % is % and cannot be planned', v_item.task_code, v_item.status;
    end if;
    if v_item.reviewer_id is not null and v_item.reviewer_id = v_item.responsible_id then
      raise exception 'Task %: the reviewer cannot also be the responsible person', v_item.task_code;
    end if;
  end loop;

  -- Overrides need a reason each.
  for v_ov in select * from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb))
  loop
    if coalesce(length(btrim(v_ov->>'reason')), 0) < 5 then
      raise exception 'Every capacity override needs a reason (at least 5 characters)';
    end if;
  end loop;

  select full_name into v_actor_name from public.profiles where id = v_actor;

  -- Previous published snapshot (for notifying people who lose or change a task).
  select items_snapshot into v_prev from public.team_plan_revisions
   where weekly_plan_id = p_plan_id and action = 'published'
   order by revision_no desc limit 1;

  perform set_config('dcos.team_plan_rpc', 'on', true);

  for v_item in
    select wpt.wbs_task_id, wpt.responsible_id, wpt.target_progress from public.weekly_plan_tasks wpt
     where wpt.weekly_plan_id = p_plan_id
  loop
    select * into v_task from public.wbs_tasks where id = v_item.wbs_task_id for update;
    v_old_owner := v_task.owner_id;
    select full_name into v_resp_name from public.profiles where id = v_item.responsible_id;

    if v_old_owner is distinct from v_item.responsible_id then
      update public.wbs_tasks
         set owner_id = v_item.responsible_id,
             owner_name = v_resp_name,
             assigned_by = v_actor,
             assigned_at = now(),
             status = case when status = 'open' then 'assigned' else status end
       where id = v_task.id;
      insert into public.wbs_audit_log (wbs_task_id, wbs_node_id, project_id, user_id, action, field_name, old_value, new_value)
      values (v_task.id, v_task.wbs_node_id, v_task.project_id, v_actor, 'Assignee Changed', 'owner_name',
              coalesce(v_task.owner_name, ''), coalesce(v_resp_name, ''));
      v_assigned := v_assigned + 1;
    end if;

    -- Notify the responsible person (once per plan revision and task).
    if v_item.responsible_id <> v_actor then
      v_key := 'plan:' || p_plan_id || ':r' || v_rev || ':' || v_task.id || ':' || v_item.responsible_id;
      insert into public.task_alerts
        (project_id, wbs_task_id, actor_id, actor_name, recipient_id, source_key, alert_type, title, body,
         task_code, task_name, metadata)
      values
        (v_task.project_id, v_task.id, v_actor, v_actor_name, v_item.responsible_id, v_key,
         case when v_rev > 1 then 'plan_revised' else 'plan_published' end,
         case when v_rev > 1 then 'Team plan revised' else 'Team plan published' end,
         case when v_rev > 1 then 'A task in your team plan was assigned or updated.' else 'You have a task in a published team plan.' end,
         v_task.task_code, v_task.task_name,
         jsonb_build_object('weekly_plan_id', p_plan_id, 'revision_no', v_rev, 'target_progress', v_item.target_progress))
      on conflict do nothing;
      v_notified := v_notified + 1;
    end if;
  end loop;

  -- Tell people who were on the previous snapshot but lost the task or changed.
  if v_prev is not null then
    for v_prev_item in select * from jsonb_array_elements(v_prev)
    loop
      if not exists (
        select 1 from public.weekly_plan_tasks w
         where w.weekly_plan_id = p_plan_id
           and w.wbs_task_id = (v_prev_item->>'task_id')::uuid
           and w.responsible_id = (v_prev_item->>'responsible_id')::uuid
      ) and (v_prev_item->>'responsible_id')::uuid <> v_actor then
        select * into v_task from public.wbs_tasks where id = (v_prev_item->>'task_id')::uuid;
        if found then
          insert into public.task_alerts
            (project_id, wbs_task_id, actor_id, actor_name, recipient_id, source_key, alert_type, title, body,
             task_code, task_name, metadata)
          values
            (v_task.project_id, v_task.id, v_actor, v_actor_name, (v_prev_item->>'responsible_id')::uuid,
             'plan:' || p_plan_id || ':r' || v_rev || ':removed:' || v_task.id || ':' || (v_prev_item->>'responsible_id'),
             'plan_revised', 'Task removed from your plan', 'The team plan was revised and this task is no longer assigned to you.',
             v_task.task_code, v_task.task_name,
             jsonb_build_object('weekly_plan_id', p_plan_id, 'revision_no', v_rev))
          on conflict do nothing;
          v_notified := v_notified + 1;
        end if;
      end if;
    end loop;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'task_id', wbs_task_id, 'responsible_id', responsible_id, 'target_progress', target_progress)), '[]'::jsonb)
    into v_snapshot from public.weekly_plan_tasks where weekly_plan_id = p_plan_id;

  insert into public.capacity_overrides
    (weekly_plan_id, profile_id, period_start, period_end, planned_hours, available_hours, utilization_pct, reason, created_by)
  select p_plan_id, (o->>'profile_id')::uuid, (o->>'period_start')::date, (o->>'period_end')::date,
         nullif(o->>'planned_hours','')::numeric, nullif(o->>'available_hours','')::numeric,
         nullif(o->>'utilization_pct','')::numeric, btrim(o->>'reason'), v_actor
    from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) o;

  insert into public.team_plan_revisions (weekly_plan_id, revision_no, action, reason, items_snapshot, changed_by)
  values (p_plan_id, v_rev, 'published', nullif(btrim(coalesce(p_reason, '')), ''), v_snapshot, v_actor);

  update public.weekly_plans
     set status = 'published', published_at = now(), published_by = v_actor, revision_no = v_rev
   where id = p_plan_id;

  perform set_config('dcos.team_plan_rpc', 'off', true);
  return jsonb_build_object('revision_no', v_rev, 'tasks_assigned', v_assigned, 'notifications', v_notified);
end $$;

revoke all on function public.publish_team_plan(uuid, text, jsonb) from public;
revoke all on function public.reopen_team_plan(uuid, text) from public;
grant execute on function public.publish_team_plan(uuid, text, jsonb) to authenticated;
grant execute on function public.reopen_team_plan(uuid, text) to authenticated;
