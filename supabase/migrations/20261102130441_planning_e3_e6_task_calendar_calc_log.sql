-- Phase E3 + E6 (doc 35).
-- E3: an activity can run on its own calendar (wbs_tasks.calendar_id, a plan_calendars row of the
--     project). The engine (@dcos/scheduling-engine) uses it for the activity's duration and float;
--     lag counts in the predecessor's calendar. Changing it is a scheduling change, so the
--     schedule-write guard covers it, and baselines snapshot it.
-- E6: plan_schedule_calculations records every saved calculation: engine version, input
--     fingerprint, data date, finish, diagnostics and warnings. Append-only.

alter table public.wbs_tasks
  add column if not exists calendar_id uuid references public.plan_calendars(id) on delete set null;
create index if not exists idx_wbs_tasks_calendar on public.wbs_tasks(calendar_id) where calendar_id is not null;

-- the calendar must belong to the task's project
create or replace function public.wbs_tasks_calendar_project_check()
returns trigger
language plpgsql
as $$
begin
  if new.calendar_id is not null and not exists (
    select 1 from public.plan_calendars c where c.id = new.calendar_id and c.project_id = new.project_id) then
    raise exception 'The activity calendar must be one of this project''s calendars' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wbs_tasks_calendar_project_check on public.wbs_tasks;
create trigger trg_wbs_tasks_calendar_project_check
  before insert or update of calendar_id, project_id on public.wbs_tasks
  for each row when (new.calendar_id is not null)
  execute function public.wbs_tasks_calendar_project_check();

-- schedule-write guard (as 20261102120904) plus calendar_id in the scheduling columns
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
    end if;
  end if;

  return new;
end;
$$;

-- baselines snapshot the activity calendar too
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
           'calendar_id', calendar_id,
           'wbs_node_id', wbs_node_id)
         order by id), '[]'::jsonb)
  from public.wbs_tasks
  where project_id = p_project_id
    and start_date is not null and end_date is not null
    and (p_task_ids is null or id = any (p_task_ids));
$$;

-- E6 ------------------------------------------------------------------------------------------
create table if not exists public.plan_schedule_calculations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  engine_version  text not null,
  input_hash      text not null,
  source          text not null default 'sheet' check (source in ('sheet', 'wbs_builder', 'other')),
  project_start   date,
  data_date       date,
  project_finish  date,
  task_count      integer not null default 0,
  changed_count   integer not null default 0,
  critical_count  integer not null default 0,
  settings        jsonb not null default '{}'::jsonb,
  diagnostics     jsonb not null default '{}'::jsonb,
  warnings        jsonb not null default '[]'::jsonb,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_plan_schedule_calculations_project
  on public.plan_schedule_calculations(project_id, created_at desc);

alter table public.plan_schedule_calculations enable row level security;

drop policy if exists plan_schedule_calculations_select on public.plan_schedule_calculations;
create policy plan_schedule_calculations_select on public.plan_schedule_calculations
  for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'));

drop policy if exists plan_schedule_calculations_insert on public.plan_schedule_calculations;
create policy plan_schedule_calculations_insert on public.plan_schedule_calculations
  for insert to authenticated
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit')
              and created_by = auth.uid());
-- no update / delete policies: the log is append-only

revoke all on public.plan_schedule_calculations from anon;
grant select, insert on public.plan_schedule_calculations to authenticated;
