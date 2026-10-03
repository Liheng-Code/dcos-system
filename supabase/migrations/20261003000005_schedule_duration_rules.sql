-- Duration / start / finish / dependency rules
--
--  * Duration is the input; start and finish are calculated by the schedule engine from
--    the project start, durations and links. The DB keeps wbs_tasks.duration_days in step
--    with the dates whichever screen writes them (trigger below).
--  * Duration unit per activity: 'wd' working days (default) or 'cd' calendar days
--    (curing, lead times). Calendar days run straight through non-working days.
--  * Default working week is Mon–Sat (new plan_calendars rows, and projects without one).
--  * Links live only in dependency_task_ids / dependency_types / dependency_lag_days.
--    The old single-link columns are copied in and marked deprecated.
--  * Existing data: where both dates are set, the dates are kept and duration_days is
--    recalculated from them (dates came from the client programmes).

-- 1. Working week default ---------------------------------------------------------------
alter table public.plan_calendars alter column saturday set default true;

-- 2. Duration unit ---------------------------------------------------------------------
alter table public.wbs_tasks add column if not exists duration_unit text not null default 'wd';
alter table public.wbs_tasks drop constraint if exists wbs_tasks_duration_unit_check;
alter table public.wbs_tasks
  add constraint wbs_tasks_duration_unit_check check (duration_unit in ('wd', 'cd'));
comment on column public.wbs_tasks.duration_unit is
  'wd = working days on the project calendar (default); cd = calendar days.';
comment on column public.wbs_tasks.duration_days is
  'Activity duration in duration_unit. Kept in step with start_date/end_date by trg_wbs_tasks_sync_duration.';

-- 3. Calendar helpers (mirror apps/web/lib/planning/work-calendar.ts) -------------------
create or replace function public.plan_project_calendar_id(p_project_id uuid)
returns uuid
language sql
stable
set search_path = public
as $$
  select c.id
    from public.plan_calendars c
   where c.project_id = p_project_id
   order by c.is_default desc, c.created_at
   limit 1
$$;

-- No calendar → Mon–Sat.
create or replace function public.plan_is_working_day(p_calendar_id uuid, p_day date)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select x.is_working
       from public.plan_calendar_exceptions x
      where x.calendar_id = p_calendar_id and x.exception_date = p_day
      limit 1),
    (select case extract(isodow from p_day)::int
              when 1 then c.monday    when 2 then c.tuesday  when 3 then c.wednesday
              when 4 then c.thursday  when 5 then c.friday   when 6 then c.saturday
              when 7 then c.sunday
            end
       from public.plan_calendars c
      where c.id = p_calendar_id),
    extract(isodow from p_day) <> 7
  )
$$;

-- Inclusive span of start..end in the unit; a calendar with no working days counts calendar days.
create or replace function public.plan_duration_between(
  p_calendar_id uuid, p_start date, p_end date, p_unit text default 'wd')
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_start is null or p_end is null or p_end < p_start then
    return null;
  end if;
  if p_unit = 'cd' then
    return p_end - p_start + 1;
  end if;
  select count(*)::int into v_count
    from generate_series(p_start, p_end, interval '1 day') g(d)
   where public.plan_is_working_day(p_calendar_id, g.d::date);
  if v_count = 0 then
    return p_end - p_start + 1;
  end if;
  return v_count;
end $$;

-- Finish of an activity lasting p_days from p_start (start snaps to a working day).
create or replace function public.plan_finish_from_start(
  p_calendar_id uuid, p_start date, p_days integer, p_unit text default 'wd')
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  d date := p_start;
  remaining integer;
  guard integer := 0;
begin
  if p_start is null or p_days is null then
    return null;
  end if;
  while not public.plan_is_working_day(p_calendar_id, d) and guard < 3650 loop
    d := d + 1;
    guard := guard + 1;
  end loop;
  if guard >= 3650 then
    return p_start + greatest(p_days - 1, 0);
  end if;
  if p_days <= 0 then
    return d;
  end if;
  if p_unit = 'cd' then
    return d + (p_days - 1);
  end if;
  remaining := p_days - 1;
  guard := 0;
  while remaining > 0 and guard < 3650 loop
    d := d + 1;
    guard := guard + 1;
    if public.plan_is_working_day(p_calendar_id, d) then
      remaining := remaining - 1;
    end if;
  end loop;
  return d;
end $$;

-- 4. Existing data: keep the dates, recalculate duration_days from them ------------------
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_wbs_tasks_lock_guard'
              and tgrelid = 'public.wbs_tasks'::regclass) then
    alter table public.wbs_tasks disable trigger trg_wbs_tasks_lock_guard;
  end if;

  update public.wbs_tasks t
     set duration_days = s.days
    from (
      select w.id,
             case when coalesce(w.is_milestone, false) then 0
                  else greatest(1, public.plan_duration_between(
                         public.plan_project_calendar_id(w.project_id), w.start_date, w.end_date, w.duration_unit))
             end as days
        from public.wbs_tasks w
       where w.start_date is not null and w.end_date is not null and w.end_date >= w.start_date
    ) s
   where t.id = s.id
     and t.duration_days is distinct from s.days;

  -- 5. Old single-link columns → link arrays (padding types/lags to the ids' length).
  update public.wbs_tasks t
     set dependency_task_ids = coalesce(t.dependency_task_ids, '{}') || t.dependency_task_id,
         dependency_types = (
           select coalesce(array_agg(coalesce(t.dependency_types[i], 'fs') order by i), '{}')
             from generate_series(1, coalesce(cardinality(t.dependency_task_ids), 0)) i
         ) || lower(coalesce(nullif(t.dependency_type, ''), 'fs')),
         dependency_lag_days = (
           select coalesce(array_agg(coalesce(t.dependency_lag_days[i], 0) order by i), '{}')
             from generate_series(1, coalesce(cardinality(t.dependency_task_ids), 0)) i
         ) || coalesce(t.lag_days, 0)::numeric
   where t.dependency_task_id is not null
     and t.dependency_task_id <> t.id
     and not (t.dependency_task_id = any (coalesce(t.dependency_task_ids, '{}')));

  if exists (select 1 from pg_trigger where tgname = 'trg_wbs_tasks_lock_guard'
              and tgrelid = 'public.wbs_tasks'::regclass) then
    alter table public.wbs_tasks enable trigger trg_wbs_tasks_lock_guard;
  end if;
end $$;

comment on column public.wbs_tasks.dependency_task_id is
  'DEPRECATED: copied into dependency_task_ids (20261003000005). Read and write the link arrays.';
comment on column public.wbs_tasks.dependency_type is
  'DEPRECATED: use dependency_types.';
comment on column public.wbs_tasks.lag_days is
  'DEPRECATED: use dependency_lag_days.';
comment on column public.wbs_tasks.dependency_text is
  'Predecessor text as imported (Excel / MS Project), kept for reference only. Links are dependency_task_ids.';

-- 6. Keep duration_days and the dates in step on every write ------------------------------
--  * only the duration changed → end_date recalculated from start + duration
--  * otherwise, with both dates → duration_days recalculated from the dates (dates win, also
--    when an import writes dates and a disagreeing duration together)
create or replace function public.wbs_tasks_sync_duration()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cal uuid;
  v_dates_changed boolean;
  v_dur_changed boolean;
begin
  if tg_op = 'UPDATE' then
    v_dates_changed := new.start_date is distinct from old.start_date
                    or new.end_date is distinct from old.end_date;
    v_dur_changed := new.duration_days is distinct from old.duration_days
                  or new.duration_unit is distinct from old.duration_unit;
    if not v_dates_changed and not v_dur_changed
       and not (new.is_milestone is distinct from old.is_milestone) then
      return new;
    end if;
  else
    v_dates_changed := new.start_date is not null and new.end_date is not null;
    v_dur_changed := not v_dates_changed;
  end if;

  if coalesce(new.is_milestone, false) then
    if new.start_date is not null then
      new.duration_days := 0;
    end if;
    return new;
  end if;

  v_cal := public.plan_project_calendar_id(new.project_id);

  if v_dur_changed and not v_dates_changed then
    if new.start_date is not null and new.duration_days is not null then
      new.end_date := public.plan_finish_from_start(
                        v_cal, new.start_date, ceil(new.duration_days)::int, new.duration_unit);
    end if;
  elsif new.start_date is not null and new.end_date is not null and new.end_date >= new.start_date then
    new.duration_days := greatest(1, public.plan_duration_between(
                           v_cal, new.start_date, new.end_date, new.duration_unit));
  end if;
  return new;
end $$;

drop trigger if exists trg_wbs_tasks_sync_duration on public.wbs_tasks;
create trigger trg_wbs_tasks_sync_duration
  before insert or update of start_date, end_date, duration_days, duration_unit, is_milestone
  on public.wbs_tasks
  for each row execute function public.wbs_tasks_sync_duration();
