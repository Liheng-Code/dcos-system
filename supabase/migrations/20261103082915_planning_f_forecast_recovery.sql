-- Phase F (doc 35; PRD MOD-11 FR-109..FR-118): forecast and recovery.
--   F1  plan_whatif_scenarios: saved what-if comparisons of Generate (method per activity, productivity %, level link).
--   F2  plan_adopt_recovery: adopting a recovery scenario creates a DRAFT programme revision (the scenario's dates) that
--       goes through the normal submit / approve chain; plan_apply_recovery writes the scenario's changes into the live
--       programme only once that revision is approved internally. The live programme is untouched until then.
--   F3  apply records the forecast finish just before the change, so achieved recovery can be measured against planned.
--   F4  calendar levers (extra working days) are applied as working exceptions on the project calendar.
--   F5  plan_forecast_snapshots: a forecast recorded with its assumptions, data date and calculation; never changed.
-- Additive only.

-- ───────────────────────────────────────────────────────────── F1 saved what-if scenarios
create table if not exists public.plan_whatif_scenarios (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  template_id       uuid,
  node_ids          uuid[] not null default '{}',
  name              text not null check (btrim(name) <> '' and length(name) <= 120),
  variant           jsonb not null,
  metrics           jsonb not null default '{}'::jsonb,
  reference_metrics jsonb not null default '{}'::jsonb,
  note              text,
  created_by        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_plan_whatif_scenarios_project on public.plan_whatif_scenarios (project_id, created_at desc);
comment on table public.plan_whatif_scenarios is
  'A saved what-if of Generate (variant = lib/planning/activity-library/scenario-compare.ts ScenarioVariant) with the metrics it gave against the reference when saved.';

alter table public.plan_whatif_scenarios enable row level security;
drop policy if exists plan_whatif_scenarios_select on public.plan_whatif_scenarios;
create policy plan_whatif_scenarios_select on public.plan_whatif_scenarios for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'));
drop policy if exists plan_whatif_scenarios_insert on public.plan_whatif_scenarios;
create policy plan_whatif_scenarios_insert on public.plan_whatif_scenarios for insert to authenticated
  with check (created_by = auth.uid() and public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));
drop policy if exists plan_whatif_scenarios_delete on public.plan_whatif_scenarios;
create policy plan_whatif_scenarios_delete on public.plan_whatif_scenarios for delete to authenticated
  using (public.is_project_member(project_id)
         and (created_by = auth.uid() or public.has_permission('planning', 'schedule', 'delete')));
revoke all on public.plan_whatif_scenarios from anon;
grant select, insert, delete on public.plan_whatif_scenarios to authenticated;

-- ───────────────────────────────────────────────────────────── F2 / F3 recovery through approval
alter table public.plan_act_recovery_scenarios
  add column if not exists revision_id             uuid references public.plan_schedule_revisions(id) on delete set null,
  add column if not exists applied_at              timestamptz,
  add column if not exists applied_by              uuid references auth.users(id) on delete set null,
  add column if not exists applied_forecast_finish date,
  add column if not exists applied_result          jsonb;

comment on column public.plan_act_recovery_scenarios.revision_id is 'Draft programme revision created when the scenario was adopted (doc 35 F2).';
comment on column public.plan_act_recovery_scenarios.applied_forecast_finish is 'Live forecast finish just before the changes were applied: achieved recovery is measured from it (F3).';

-- Adoption and application go through the RPCs below only: a direct write (the table's RLS lets Schedule editors update
-- rows) may not adopt, link a revision, mark a scenario applied, or move an adopted scenario on. The RPCs set
-- dcos.recovery_rpc for their own transaction.
create or replace function public.plan_recovery_scenario_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('dcos.recovery_rpc', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'proposed' or new.revision_id is not null or new.applied_at is not null
       or new.applied_by is not null or new.applied_forecast_finish is not null or new.applied_result is not null then
      raise exception 'A recovery scenario is saved as proposed; adopt it from Recovery Scenarios' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.revision_id is distinct from old.revision_id
     or new.applied_at is distinct from old.applied_at or new.applied_by is distinct from old.applied_by
     or new.applied_forecast_finish is distinct from old.applied_forecast_finish or new.applied_result is distinct from old.applied_result
     or (new.status = 'adopted' and old.status is distinct from 'adopted')
     or (old.status = 'adopted' and old.revision_id is not null and new.status is distinct from old.status)
     or new.levers is distinct from old.levers then
    raise exception 'Adopt or apply a recovery scenario from Recovery Scenarios (its revision must be approved)' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.plan_recovery_scenario_guard() from public, anon, authenticated;
drop trigger if exists plan_recovery_scenario_guard on public.plan_act_recovery_scenarios;
create trigger plan_recovery_scenario_guard before insert or update on public.plan_act_recovery_scenarios
  for each row execute function public.plan_recovery_scenario_guard();

-- Adopt: the scenario's dates become a draft revision of the project's internal stream. p_snapshot = {tasks: [{id,
-- start_date, end_date}]} calculated by the app with the scheduling engine (the same engine that measured the scenario).
create or replace function public.plan_adopt_recovery(p_scenario_id uuid, p_snapshot jsonb, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s        public.plan_act_recovery_scenarios%rowtype;
  v_stream uuid;
  v_next   integer;
  v_rev    uuid;
begin
  select * into s from public.plan_act_recovery_scenarios where id = p_scenario_id for update;
  if not found then raise exception 'Recovery scenario not found' using errcode = 'P0002'; end if;
  if not (public.is_project_member(s.project_id)
          and public.has_permission('planning', 'schedule', 'edit')
          and public.has_permission('planning', 'programme', 'edit')) then
    raise exception 'Adopting a recovery needs Schedule edit and Programme edit permission' using errcode = '42501';
  end if;
  if s.status <> 'proposed' then
    raise exception 'Only a proposed scenario can be adopted (this one is %)', s.status;
  end if;
  if jsonb_typeof(p_snapshot -> 'tasks') is distinct from 'array' or jsonb_array_length(p_snapshot -> 'tasks') = 0 then
    raise exception 'The scenario has no calculated dates';
  end if;

  select id into v_stream from public.plan_schedule_streams
   where project_id = s.project_id and stream_type = 'internal' order by created_at limit 1;
  if v_stream is null then
    insert into public.plan_schedule_streams (project_id, stream_type, name, created_by)
    values (s.project_id, 'internal', 'Internal Working Schedule', auth.uid()) returning id into v_stream;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_next from public.plan_schedule_revisions where stream_id = v_stream;
  insert into public.plan_schedule_revisions (stream_id, revision_number, note, snapshot_data, created_by)
  values (v_stream, v_next,
          coalesce(nullif(btrim(p_note), ''), 'Recovery: ' || s.name),
          jsonb_build_object(
            'captured_at', now(), 'source', 'recovery', 'scenario_id', s.id, 'scenario_name', s.name,
            'target_finish', s.target_finish, 'forecast_finish', s.forecast_finish, 'scenario_finish', s.scenario_finish,
            'recovered_wd', s.recovered_wd, 'levers', s.levers, 'tasks', p_snapshot -> 'tasks'),
          auth.uid())
  returning id into v_rev;

  perform set_config('dcos.recovery_rpc', 'on', true);
  update public.plan_act_recovery_scenarios
     set status = 'adopted', revision_id = v_rev, decided_by = auth.uid(), decided_at = now(),
         decision_note = coalesce(nullif(btrim(p_note), ''), decision_note)
   where id = s.id;
  perform set_config('dcos.recovery_rpc', '', true);

  insert into public.wbs_audit_log (project_id, user_id, action, field_name, old_value, new_value)
  values (s.project_id, auth.uid(), 'Recovery Adopted', 'revision', s.name, 'R' || v_next || ' (draft)');

  return jsonb_build_object('revision_id', v_rev, 'revision_number', v_next, 'stream_id', v_stream);
end;
$$;
revoke all on function public.plan_adopt_recovery(uuid, jsonb, text) from public, anon;
grant execute on function public.plan_adopt_recovery(uuid, jsonb, text) to authenticated;

-- Apply: once the revision is approved internally, write the changes into the live programme.
--   duration levers (crew, expedite, method, overtime): duration_days := toWd (working days)
--   fasttrack: the finish-to-start link to predId becomes start-to-start + lag
--   calendar: the listed dates become working exceptions on the project's default calendar
-- An activity that started, or sits under a locked WBS node (unless the user is a WBS manager), is skipped and
-- reported. The app recalculates the dates afterwards. Each change is written to wbs_audit_log.
create or replace function public.plan_apply_recovery(p_scenario_id uuid, p_forecast_finish date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s          public.plan_act_recovery_scenarios%rowtype;
  v_status   text;
  v_manager  boolean := public.is_wbs_manager();
  l          jsonb;
  t          record;
  v_i        integer;
  v_applied  jsonb := '[]'::jsonb;
  v_skipped  jsonb := '[]'::jsonb;
  v_cal      uuid;
  v_days     integer;
  v_kind     text;
begin
  select * into s from public.plan_act_recovery_scenarios where id = p_scenario_id for update;
  if not found then raise exception 'Recovery scenario not found' using errcode = 'P0002'; end if;
  if not (public.is_project_member(s.project_id) and public.has_permission('planning', 'schedule', 'edit')) then
    raise exception 'Applying a recovery needs Schedule edit permission' using errcode = '42501';
  end if;
  if s.applied_at is not null then raise exception 'This recovery was already applied'; end if;
  if s.status <> 'adopted' or s.revision_id is null then
    raise exception 'Adopt the scenario first: it creates the revision that has to be approved';
  end if;
  select status into v_status from public.plan_schedule_revisions where id = s.revision_id;
  if v_status is null or v_status not in ('approved_internal', 'submitted_client', 'approved_client') then
    raise exception 'The recovery revision is %: it must be approved internally before the programme changes', coalesce(v_status, 'missing');
  end if;

  for l in select * from jsonb_array_elements(s.levers) loop
    v_kind := l ->> 'kind';
    if v_kind = 'calendar' then
      if not public.has_permission('planning', 'calendars', 'edit') then
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'label', l ->> 'label', 'reason', 'needs Calendars edit permission');
        continue;
      end if;
      select id into v_cal from public.plan_calendars where project_id = s.project_id order by is_default desc, created_at limit 1;
      if v_cal is null then
        -- the project runs on the built-in Mon-Sat calendar: store it (the column defaults are that calendar) so the
        -- extra days have a calendar to live in
        insert into public.plan_calendars (project_id, name, is_default)
        values (s.project_id, 'Mon–Sat (default)', true) returning id into v_cal;
      end if;
      insert into public.plan_calendar_exceptions (calendar_id, exception_date, is_working, reason)
      select v_cal, d::date, true, 'Recovery: ' || s.name
        from jsonb_array_elements_text(coalesce(l -> 'dates', '[]'::jsonb)) d
      on conflict (calendar_id, exception_date) do nothing;
      get diagnostics v_days = row_count;
      v_applied := v_applied || jsonb_build_object('kind', v_kind, 'label', l ->> 'label', 'days', v_days);
      insert into public.wbs_audit_log (project_id, user_id, action, field_name, old_value, new_value)
      values (s.project_id, auth.uid(), 'Recovery Applied', 'calendar', null, v_days || ' extra working days');
      continue;
    end if;

    select wt.id, wt.wbs_node_id, wt.progress, wt.actual_start_date, wt.duration_days, wt.duration_unit,
           wt.dependency_task_ids, wt.dependency_types, wt.dependency_lag_days
      into t
      from public.wbs_tasks wt where wt.id = (l ->> 'taskId')::uuid and wt.project_id = s.project_id;
    if t.id is null then
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'code', l ->> 'code', 'reason', 'the activity no longer exists');
      continue;
    end if;
    if coalesce(t.progress, 0) > 0 or t.actual_start_date is not null then
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'code', l ->> 'code', 'reason', 'the activity has started');
      continue;
    end if;
    if not v_manager and t.wbs_node_id is not null and public.wbs_node_effectively_locked(t.wbs_node_id) then
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'code', l ->> 'code', 'reason', 'the WBS node is locked');
      continue;
    end if;

    if v_kind in ('crew', 'expedite', 'method', 'overtime') then
      update public.wbs_tasks set duration_days = (l ->> 'toWd')::numeric, duration_unit = 'wd' where id = t.id;
      v_applied := v_applied || jsonb_build_object('kind', v_kind, 'code', l ->> 'code', 'from', t.duration_days, 'to', (l ->> 'toWd')::numeric);
      insert into public.wbs_audit_log (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
      values (s.project_id, t.id, t.wbs_node_id, auth.uid(), 'Recovery Applied', 'duration_days',
              t.duration_days || ' ' || coalesce(t.duration_unit, 'wd'), (l ->> 'toWd') || ' wd');
    elsif v_kind = 'fasttrack' then
      v_i := array_position(t.dependency_task_ids, (l ->> 'predId')::uuid);
      if l ->> 'lag' is null or v_i is null then
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'code', l ->> 'code', 'reason',
                       case when v_i is null then 'the link no longer exists' else 'saved before overlaps were recorded: overlap it by hand' end);
        continue;
      end if;
      if lower(coalesce(t.dependency_types[v_i], 'fs')) <> 'fs' then
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'code', l ->> 'code', 'reason', 'the link was changed since');
        continue;
      end if;
      update public.wbs_tasks
         set dependency_types[v_i] = 'ss', dependency_lag_days[v_i] = (l ->> 'lag')::integer
       where id = t.id;
      v_applied := v_applied || jsonb_build_object('kind', v_kind, 'code', l ->> 'code', 'lag', (l ->> 'lag')::integer);
      insert into public.wbs_audit_log (project_id, wbs_task_id, wbs_node_id, user_id, action, field_name, old_value, new_value)
      values (s.project_id, t.id, t.wbs_node_id, auth.uid(), 'Recovery Applied', 'dependency', 'FS',
              'SS +' || (l ->> 'lag') || ' wd');
    else
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'code', l ->> 'code', 'reason', 'unknown change');
    end if;
  end loop;

  perform set_config('dcos.recovery_rpc', 'on', true);
  update public.plan_act_recovery_scenarios
     set applied_at = now(), applied_by = auth.uid(), applied_forecast_finish = p_forecast_finish,
         applied_result = jsonb_build_object('applied', v_applied, 'skipped', v_skipped)
   where id = s.id;
  perform set_config('dcos.recovery_rpc', '', true);

  return jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
end;
$$;
revoke all on function public.plan_apply_recovery(uuid, date) from public, anon;
grant execute on function public.plan_apply_recovery(uuid, date) to authenticated;

-- ───────────────────────────────────────────────────────────── F5 forecast snapshots
create table if not exists public.plan_forecast_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  period              text not null,
  label               text,
  data_date           date,
  forecast_finish     date,
  baseline_finish     date,
  contract_finish     date,
  variance_wd         integer,
  progress_pct        numeric,
  planned_pct         numeric,
  critical_count      integer,
  task_count          integer,
  open_delays         integer,
  open_delay_days     numeric,
  assumptions         text not null check (length(btrim(assumptions)) >= 10),
  basis               jsonb not null default '{}'::jsonb,
  milestones          jsonb not null default '[]'::jsonb,
  tasks               jsonb not null default '[]'::jsonb,
  captured_by         uuid default auth.uid() references auth.users(id) on delete set null,
  captured_at         timestamptz not null default now()
);
create index if not exists idx_plan_forecast_snapshots_project on public.plan_forecast_snapshots (project_id, captured_at desc);
comment on table public.plan_forecast_snapshots is
  'A forecast as it stood when recorded (doc 35 F5): dates, progress, the assumptions written by the planner and the calculation it came from. Written only by plan_capture_forecast; never updated or deleted.';

alter table public.plan_forecast_snapshots enable row level security;
drop policy if exists plan_forecast_snapshots_select on public.plan_forecast_snapshots;
create policy plan_forecast_snapshots_select on public.plan_forecast_snapshots for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'));
revoke all on public.plan_forecast_snapshots from anon, authenticated;
grant select on public.plan_forecast_snapshots to authenticated;

create or replace function public.plan_forecast_snapshot_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- a project delete cascades; anything else is refused
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = old.project_id) then
    return old;
  end if;
  raise exception 'A recorded forecast cannot be changed or deleted' using errcode = '42501';
end;
$$;
revoke all on function public.plan_forecast_snapshot_immutable() from public, anon, authenticated;
drop trigger if exists plan_forecast_snapshot_immutable on public.plan_forecast_snapshots;
create trigger plan_forecast_snapshot_immutable before update or delete on public.plan_forecast_snapshots
  for each row execute function public.plan_forecast_snapshot_immutable();

create or replace function public.plan_capture_forecast(p_project_id uuid, p_assumptions text, p_label text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id        uuid;
  v_dd        date;
  v_contract  date;
  v_finish    date;
  v_base      date;
  v_var       integer;
  v_calc      record;
  v_changed   timestamptz;
begin
  if not (public.is_project_member(p_project_id) and public.has_permission('planning', 'schedule', 'edit')) then
    raise exception 'Recording a forecast needs Schedule edit permission' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_assumptions, ''))) < 10 then
    raise exception 'Write the assumptions behind this forecast (at least 10 characters)';
  end if;

  select p.data_date, p.end_date into v_dd, v_contract from public.projects p where p.id = p_project_id;
  select max(end_date), max(baseline_finish_date), max(updated_at) into v_finish, v_base, v_changed
    from public.wbs_tasks where project_id = p_project_id;
  if v_finish is not null and v_base is not null then
    select case when v_finish >= v_base then count(*) - 1 else -(count(*) - 1) end::integer into v_var
      from public.plan_project_workdays(p_project_id, least(v_finish, v_base), greatest(v_finish, v_base));
  end if;
  select c.id, c.created_at, c.engine_version, c.input_hash, c.project_finish, c.critical_count, c.data_date
    into v_calc
    from public.plan_schedule_calculations c where c.project_id = p_project_id order by c.created_at desc limit 1;

  insert into public.plan_forecast_snapshots (
    project_id, period, label, data_date, forecast_finish, baseline_finish, contract_finish, variance_wd,
    progress_pct, planned_pct, critical_count, task_count, open_delays, open_delay_days, assumptions, basis, milestones, tasks)
  select
    p_project_id,
    to_char(coalesce(v_dd, current_date), 'YYYY-MM'),
    nullif(btrim(coalesce(p_label, '')), ''),
    v_dd, v_finish, v_base, v_contract, v_var,
    -- actual % complete, weighted by duration
    (select round(sum(coalesce(progress, 0) * greatest(coalesce(duration_days, 1), 1)) / nullif(sum(greatest(coalesce(duration_days, 1), 1)), 0), 2)
       from public.wbs_tasks where project_id = p_project_id and not coalesce(is_milestone, false)),
    -- planned % at the data date: the baseline's elapsed share of each activity, weighted the same way
    (select round(100 * sum(greatest(coalesce(duration_days, 1), 1) *
                             least(1, greatest(0, (coalesce(v_dd, current_date) - baseline_start_date + 1)::numeric
                                                  / nullif(baseline_finish_date - baseline_start_date + 1, 0))))
                  / nullif(sum(greatest(coalesce(duration_days, 1), 1)), 0), 2)
       from public.wbs_tasks
      where project_id = p_project_id and not coalesce(is_milestone, false)
        and baseline_start_date is not null and baseline_finish_date is not null),
    v_calc.critical_count,
    (select count(*) from public.wbs_tasks where project_id = p_project_id),
    (select count(*) from public.delay_register where project_id = p_project_id and status in ('open', 'disputed')),
    (select coalesce(sum(impact_days), 0) from public.delay_register where project_id = p_project_id and status in ('open', 'disputed')),
    btrim(p_assumptions),
    jsonb_build_object(
      'calculation_id', v_calc.id, 'calculated_at', v_calc.created_at, 'engine_version', v_calc.engine_version,
      'input_hash', v_calc.input_hash, 'calculated_finish', v_calc.project_finish, 'calculation_data_date', v_calc.data_date,
      -- false: activities changed after the last calculation, so the dates may not be the engine's
      'calculation_current', v_calc.id is not null and (v_changed is null or v_changed <= v_calc.created_at + interval '5 seconds'),
      'calendar', (select jsonb_build_object('name', c.name, 'hours_per_day', c.hours_per_day,
                     'week', concat_ws(',', case when c.monday then 'Mon' end, case when c.tuesday then 'Tue' end,
                                       case when c.wednesday then 'Wed' end, case when c.thursday then 'Thu' end,
                                       case when c.friday then 'Fri' end, case when c.saturday then 'Sat' end,
                                       case when c.sunday then 'Sun' end))
                     from public.plan_calendars c where c.project_id = p_project_id order by c.is_default desc, c.created_at limit 1),
      'recoveries_applied', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'applied_at', r.applied_at) order by r.applied_at)
                                        from public.plan_act_recovery_scenarios r where r.project_id = p_project_id and r.applied_at is not null), '[]'::jsonb)),
    coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', task_code, 'name', task_name,
                                'forecast', end_date, 'baseline', baseline_finish_date) order by end_date nulls last)
                from (select * from public.wbs_tasks where project_id = p_project_id and coalesce(is_milestone, false)
                       order by end_date nulls last limit 100) m), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_array(id, start_date, end_date, progress) order by id)
                from public.wbs_tasks where project_id = p_project_id), '[]'::jsonb)
  returning id into v_id;

  insert into public.wbs_audit_log (project_id, user_id, action, field_name, old_value, new_value)
  values (p_project_id, auth.uid(), 'Forecast Recorded', 'forecast_finish', null, v_finish::text);
  return v_id;
end;
$$;
revoke all on function public.plan_capture_forecast(uuid, text, text) from public, anon;
grant execute on function public.plan_capture_forecast(uuid, text, text) to authenticated;
