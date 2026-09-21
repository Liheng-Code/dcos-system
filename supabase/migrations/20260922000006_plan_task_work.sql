-- Migration: 20260922000006_plan_task_work.sql
-- Purpose: Productivity & Resource-Costing Plan, Phase 1 — quantity + norm per task, and the work
--          calculation that turns them into MAN-HOURS, CREW and DURATION.
--
--   plan_task_work           1:1 with wbs_tasks (a separate table, plan decision #4: wbs_tasks is a hot table
--                            with progress/lock triggers, and already overloads budget_cost)
--   plan_compute_work()      the formulas as ONE pure SQL function; lib/planning/work-engine.ts mirrors it and a
--                            parity test keeps the two identical
--   trigger                  fills the computed columns whenever a row is written
--   recompute_task_work()    re-runs the calculation for a project / task (after norms, dates or calendars change)
--
-- Formulas (W = quantity x labour constant; f = norm efficiency x task adjustment; H = calendar hours/day):
--   work_hours          = W / f
--   crew_required       = ceil( work_hours / (current working-day duration x H) )        workers to hit today's dates
--   duration_derived    = ceil( work_hours / (crews x workers-per-crew x H) )            days for the planned crew
--   crews_required      = crew_required / workers-per-crew
--
-- Depends on: 20260922000001 (calendar hours), 20260922000005 (norms), public.wbs_tasks, plan_calendars(+exceptions).
-- planned_cost is reserved for Phase 4 (cost loading) and stays NULL until then.
-- Safe to re-run.

-- ── 1. unit normalisation (must match normalizeUnit in work-engine.ts) ───────
create or replace function public.plan_norm_unit(p_unit text)
returns text
language sql
immutable
as $$
  select case u
           when 'sqm'    then 'm2'   when 'sqmt'   then 'm2'   when 'sqmtr'  then 'm2'
           when 'cum'    then 'm3'   when 'cbm'    then 'm3'   when 'cubm'   then 'm3'
           when 'nos'    then 'no'   when 'pcs'    then 'no'   when 'pc'     then 'no'
           when 'ea'     then 'no'   when 'each'   then 'no'   when 'unit'   then 'no'  when 'units' then 'no'
           when 'tonne'  then 't'    when 'tonnes' then 't'    when 'ton'    then 't'   when 'tons'  then 't'  when 'mt' then 't'
           when 'rm'     then 'm'    when 'lm'     then 'm'    when 'mtr'    then 'm'   when 'meter' then 'm'  when 'metre' then 'm'
           when 'kgs'    then 'kg'
           when 'lot'    then 'ls'   when 'lumpsum' then 'ls'  when 'sum'    then 'ls'
           when 'hrs'    then 'hr'   when 'hour'   then 'hr'   when 'hours'  then 'hr'
           else nullif(u, '')
         end
  from (select translate(lower(btrim(coalesce(p_unit, ''))), '²³ .', '23') as u) x
$$;

-- ── 2. working-day helpers ──────────────────────────────────────────────────
create or replace function public.plan_project_calendar(p_project_id uuid)
returns uuid
language sql
stable
as $$
  select c.id
  from public.plan_calendars c
  where c.project_id = p_project_id
  order by c.is_default desc, c.created_at
  limit 1
$$;

-- Inclusive count of working days between two dates on a calendar (NULL calendar = Mon-Fri).
-- Same rules as get_resource_loading and workingDaysBetween() in lib/planning/work-calendar.ts.
create or replace function public.plan_working_days(p_calendar_id uuid, p_from date, p_to date)
returns integer
language sql
stable
as $$
  select coalesce(count(*), 0)::int
  from generate_series(p_from, p_to, interval '1 day') as g(d)
  left join public.plan_calendars c on c.id = p_calendar_id
  left join public.plan_calendar_exceptions x
         on x.calendar_id = p_calendar_id and x.exception_date = g.d::date
  where p_from is not null and p_to is not null and p_to >= p_from
    and coalesce(
          x.is_working,
          case
            when c.id is null then extract(isodow from g.d) between 1 and 5
            else case extract(isodow from g.d)::int
                   when 1 then c.monday   when 2 then c.tuesday  when 3 then c.wednesday
                   when 4 then c.thursday when 5 then c.friday   when 6 then c.saturday
                   when 7 then c.sunday
                 end
          end
        )
$$;

-- ── 3. the calculation (pure) ───────────────────────────────────────────────
-- Status order: missing_quantity -> missing_unit -> missing_norm -> unit_mismatch -> invalid_input -> ok | no_duration
create or replace function public.plan_compute_work(
  p_quantity        numeric,
  p_task_unit       text,
  p_norm_unit       text,
  p_lc              numeric,     -- norm labour constant, man-hours per unit (NULL = no norm)
  p_norm_eff_pct    numeric,     -- norm efficiency %
  p_adjust_pct      numeric,     -- task productivity adjustment %
  p_crew_workers    numeric,     -- labour workers in ONE standard crew of the norm
  p_crews           numeric,     -- number of crews working in parallel
  p_hours_per_day   numeric,     -- calendar hours per working day
  p_duration_wd     integer      -- current scheduled duration in working days (NULL / 0 = none)
)
returns table (
  work_hours          numeric,
  productivity_factor numeric,
  crew_required       numeric,
  crews_required      numeric,
  duration_wd_derived integer,
  calc_status         text,
  calc_message        text
)
language plpgsql
immutable
as $$
declare
  eps constant numeric := 1e-9;
  f numeric;
  h numeric;
  w numeric;
  total_workers numeric;
  v_crew numeric;
  v_dur  integer;
begin
  if p_quantity is null then
    return query select null::numeric, null::numeric, null::numeric, null::numeric, null::integer,
                        'missing_quantity'::text, 'No quantity entered'::text;
    return;
  end if;
  if p_task_unit is null or btrim(p_task_unit) = '' then
    return query select null::numeric, null::numeric, null::numeric, null::numeric, null::integer,
                        'missing_unit'::text, 'The quantity has no unit'::text;
    return;
  end if;
  if p_lc is null then
    return query select null::numeric, null::numeric, null::numeric, null::numeric, null::integer,
                        'missing_norm'::text, 'No productivity norm selected'::text;
    return;
  end if;
  if public.plan_norm_unit(p_task_unit) is distinct from public.plan_norm_unit(p_norm_unit) then
    return query select null::numeric, null::numeric, null::numeric, null::numeric, null::integer,
                        'unit_mismatch'::text,
                        format('Quantity is in %s but the norm is per %s', p_task_unit, p_norm_unit);
    return;
  end if;

  f := (coalesce(p_norm_eff_pct, 100) / 100.0) * (coalesce(p_adjust_pct, 100) / 100.0);
  if p_quantity < 0 or p_lc <= 0 or f <= 0 then
    return query select null::numeric, null::numeric, null::numeric, null::numeric, null::integer,
                        'invalid_input'::text, 'Quantity, labour constant and efficiency must be positive'::text;
    return;
  end if;

  h := case when p_hours_per_day is null or p_hours_per_day <= 0 then 8 else p_hours_per_day end;
  w := p_quantity * p_lc / f;

  -- crew needed to finish inside the CURRENT scheduled duration
  v_crew := case
              when p_duration_wd is not null and p_duration_wd > 0
                then case when w = 0 then 0 else greatest(1, ceil(w / (p_duration_wd * h) - eps)) end
              else null
            end;

  -- duration for the PLANNED crew (crews x workers per crew)
  total_workers := coalesce(p_crew_workers, 0) * coalesce(p_crews, 1);
  v_dur := case
             when total_workers > 0 then (case when w = 0 then 0 else greatest(1, ceil(w / (total_workers * h) - eps)) end)::integer
             else null
           end;

  return query select
    round(w, 2),
    round(f, 4),
    v_crew,
    case when v_crew is not null and coalesce(p_crew_workers, 0) > 0 then round(v_crew / p_crew_workers, 2) else null end,
    v_dur,
    case when v_crew is null and v_dur is null then 'no_duration' else 'ok' end,
    case
      when v_crew is null and v_dur is null then 'Task has no working-day duration and the norm has no labour crew'
      when v_dur is null then 'The norm has no labour crew lines, so a duration for a planned crew cannot be derived'
      when v_crew is null then 'Task has no working-day duration (milestone or no dates)'
      else null
    end;
end $$;

-- ── 4. task work table ──────────────────────────────────────────────────────
create table if not exists public.plan_task_work (
  task_id               uuid primary key references public.wbs_tasks(id) on delete cascade,
  project_id            uuid not null references public.projects(id) on delete cascade,   -- set from the task by trigger
  -- inputs
  quantity              numeric check (quantity is null or quantity >= 0),
  quantity_unit         text,
  quantity_source       text not null default 'manual'
                          check (quantity_source in ('manual', 'boq', 'tender_boq', 'qto', 'import')),
  quantity_reason       text,
  norm_id               uuid references public.plan_productivity_norms(id) on delete set null,
  crews                 numeric not null default 1   check (crews > 0),
  productivity_adjust_pct numeric not null default 100 check (productivity_adjust_pct > 0 and productivity_adjust_pct <= 300),
  duration_mode         text not null default 'manual'
                          check (duration_mode in ('manual', 'fixed_duration', 'fixed_crew')),
  -- computed by trigger / recompute_task_work()
  work_hours            numeric,
  productivity_factor   numeric,
  crew_workers_std      numeric,      -- labour workers in one standard crew of the chosen norm
  crew_required         numeric,      -- workers needed to finish inside the current scheduled duration
  crews_required        numeric,
  duration_wd_current   integer,      -- scheduled working days (from the task's dates and calendar)
  duration_wd_derived   integer,      -- working days for the planned crew
  hours_per_day_used    numeric,
  planned_cost          numeric,      -- Phase 4 (cost loading); NULL until then
  calc_status           text not null default 'missing_quantity',
  calc_message          text,
  calc_at               timestamptz,
  created_by            uuid references auth.users(id) default auth.uid(),
  updated_by            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_plan_task_work_project on public.plan_task_work (project_id);
create index if not exists idx_plan_task_work_status  on public.plan_task_work (project_id, calc_status);
create index if not exists idx_plan_task_work_norm    on public.plan_task_work (norm_id) where norm_id is not null;

comment on table public.plan_task_work is 'Quantity + productivity norm per task, and the derived man-hours / crew / duration. See 16-Productivity-and-Resource-Costing-Plan.md.';

-- ── 5. compute trigger ──────────────────────────────────────────────────────
-- SECURITY DEFINER on purpose: the derived numbers must NOT depend on what the person saving is allowed to
-- READ. A QS user may edit task work but has no view right on calendars; under invoker rights the trigger
-- would not see the project calendar and silently fall back to Mon-Fri / 8 h. Write access to the row itself
-- is still enforced by the plan_task_work policies. The norm check below stops a task from borrowing a norm
-- that belongs to a different project, so this cannot be used to read another project's norm values.
create or replace function public.plan_task_work_compute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_project  uuid;
  t_start    date;
  t_end      date;
  t_mile     boolean;
  v_cal      uuid;
  v_hours    numeric;
  v_dur      integer;
  n_lc       numeric;
  n_eff      numeric;
  n_unit     text;
  n_project  uuid;
  v_crew     numeric;
  r          record;
  inputs_changed boolean;
begin
  select w.project_id, w.start_date, w.end_date, coalesce(w.is_milestone, false)
    into t_project, t_start, t_end, t_mile
  from public.wbs_tasks w where w.id = new.task_id;
  if not found then
    raise exception 'Task % not found', new.task_id using errcode = '23503';
  end if;
  new.project_id := t_project;

  v_cal   := public.plan_project_calendar(t_project);
  v_hours := coalesce((select c.hours_per_day from public.plan_calendars c where c.id = v_cal), 8);
  v_dur   := case
               when t_start is null or t_end is null or t_mile then null
               else public.plan_working_days(v_cal, t_start, t_end)
             end;

  if new.norm_id is not null then
    select n.labour_constant_hr_per_unit, n.efficiency_pct, n.unit, n.project_id
      into n_lc, n_eff, n_unit, n_project
    from public.plan_productivity_norms n where n.id = new.norm_id;
    if not found then
      raise exception 'Productivity norm % not found', new.norm_id using errcode = '23503';
    end if;
    -- a norm is either company-wide (project_id null) or belongs to THIS task's project
    if n_project is not null and n_project is distinct from t_project then
      raise exception 'That productivity norm belongs to a different project' using errcode = '42501';
    end if;
    select coalesce(sum(nr.workers_per_crew), 0) into v_crew
    from public.plan_productivity_norm_resources nr
    where nr.norm_id = new.norm_id and nr.kind = 'labor';
  end if;

  select * into r
  from public.plan_compute_work(new.quantity, new.quantity_unit, n_unit, n_lc, n_eff,
                                new.productivity_adjust_pct, v_crew, new.crews, v_hours, v_dur);

  new.work_hours          := r.work_hours;
  new.productivity_factor := r.productivity_factor;
  new.crew_workers_std    := case when new.norm_id is not null then v_crew end;
  new.crew_required       := r.crew_required;
  new.crews_required      := r.crews_required;
  new.duration_wd_current := v_dur;
  new.duration_wd_derived := r.duration_wd_derived;
  new.hours_per_day_used  := v_hours;
  new.calc_status         := r.calc_status;
  new.calc_message        := r.calc_message;
  new.calc_at             := now();

  inputs_changed := tg_op = 'INSERT' or (
       new.quantity is distinct from old.quantity
    or new.quantity_unit is distinct from old.quantity_unit
    or new.norm_id is distinct from old.norm_id
    or new.crews is distinct from old.crews
    or new.productivity_adjust_pct is distinct from old.productivity_adjust_pct
    or new.duration_mode is distinct from old.duration_mode
    or new.quantity_source is distinct from old.quantity_source);
  if inputs_changed then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_plan_task_work_compute on public.plan_task_work;
create trigger trg_plan_task_work_compute
  before insert or update on public.plan_task_work
  for each row execute function public.plan_task_work_compute();

-- ── 6. recompute ────────────────────────────────────────────────────────────
-- Touching the rows re-fires the compute trigger, so stored values follow changes to norms, task dates,
-- calendars and calendar hours (none of which the row itself can see).
create or replace function public.recompute_task_work(
  p_project_id uuid default null,
  p_task_id    uuid default null
)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  if p_project_id is null and p_task_id is null then
    raise exception 'recompute_task_work needs a project or a task';
  end if;
  update public.plan_task_work
     set calc_at = now()
   where (p_task_id    is null or task_id    = p_task_id)
     and (p_project_id is null or project_id = p_project_id);
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.recompute_task_work(uuid, uuid) to authenticated;

-- ── 7. RLS (plan decision: project membership + planning/task_work permissions) ─
alter table public.plan_task_work enable row level security;

drop policy if exists plan_task_work_select on public.plan_task_work;
create policy plan_task_work_select on public.plan_task_work for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'task_work', 'view'));

drop policy if exists plan_task_work_insert on public.plan_task_work;
create policy plan_task_work_insert on public.plan_task_work for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'task_work', 'can_create'));

drop policy if exists plan_task_work_update on public.plan_task_work;
create policy plan_task_work_update on public.plan_task_work for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'task_work', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'task_work', 'edit'));

drop policy if exists plan_task_work_delete on public.plan_task_work;
create policy plan_task_work_delete on public.plan_task_work for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'task_work', 'delete'));
