-- Migration: 20261027081636_boq_programme_phase3.sql
-- Purpose: doc 24 Phase 3, cost loading and manpower histogram from the BOQ-driven programme.
--   1. plan_project_workdays(project, from, to): the project's working days (default plan_calendars row +
--      exceptions; Mon–Sat when the project has no calendar), the same rules as lib/planning/work-calendar.ts.
--   2. plan_period_start(date, period): first day of the day / ISO week (Monday) / month the date falls in.
--   3. plan_trade_label(text): a resource description reduced to its trade ("Steel fixer crew" → "Steel Fixer").
--   4. plan_cost_loading(project, period, basis): wbs_tasks.budget_cost spread evenly over each task's working
--      days, per period and per CSI division, plus a labour-cost margin check (plan_task_resource_hours × rate).
--   5. plan_manpower_histogram(project, period, group, basis): plan_task_resource_hours spread the same way,
--      as hours and average headcount per period, grouped by resource, trade or CSI division.
-- All read-only and SECURITY INVOKER, so wbs_tasks / plan_task_resource_hours RLS applies to the caller.
-- Additive only: new functions, nothing altered.

-- 1. working days ------------------------------------------------------------------------------
create or replace function public.plan_project_workdays(p_project_id uuid, p_from date, p_to date)
returns table (work_date date)
language sql
stable
security invoker
set search_path = public
as $$
  with cal as (
    select c.id, c.monday, c.tuesday, c.wednesday, c.thursday, c.friday, c.saturday, c.sunday
      from public.plan_calendars c
     where c.project_id = p_project_id
     order by c.is_default desc
     limit 1
  )
  select g::date
    from generate_series(p_from, p_to, interval '1 day') g
    left join cal on true
    left join public.plan_calendar_exceptions e on e.calendar_id = cal.id and e.exception_date = g::date
   where p_from is not null and p_to is not null
     and p_to - p_from <= 3650                       -- same ~10 year bound as work-calendar.ts MAX_SCAN
     and coalesce(
           e.is_working,
           case when cal.id is null then extract(isodow from g)::int <> 7
                else case extract(isodow from g)::int
                       when 1 then cal.monday    when 2 then cal.tuesday when 3 then cal.wednesday
                       when 4 then cal.thursday  when 5 then cal.friday  when 6 then cal.saturday
                       else cal.sunday end
           end)
$$;

-- 2. period start --------------------------------------------------------------------------------
create or replace function public.plan_period_start(p_date date, p_period text)
returns date
language sql
immutable
set search_path = public
as $$
  select case p_period
           when 'day'  then p_date
           when 'week' then date_trunc('week', p_date)::date
           else date_trunc('month', p_date)::date
         end
$$;

-- 3. trade label ---------------------------------------------------------------------------------
-- Migrated rows read "Migrated from company_rate_library_lines, desc='Steel fixer crew'": use the quoted part.
create or replace function public.plan_trade_label(p_description text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(initcap(trim(regexp_replace(
           regexp_replace(
             coalesce(substring(p_description from 'desc=''([^'']+)'''), p_description, ''),
             '\s*\((un|semi-?)?skilled\)\s*', ' ', 'gi'),
           '\s+(crew|gang|team)$', '', 'i'))), '')
$$;

-- 4. cost loading --------------------------------------------------------------------------------
create or replace function public.plan_cost_loading(
  p_project_id uuid,
  p_period text default 'month',
  p_basis text default 'current'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_period text := case when p_period in ('day', 'week', 'month') then p_period else 'month' end;
  v_hpd    numeric;
  v_out    jsonb;
begin
  if coalesce(p_basis, 'current') not in ('current', 'baseline') then
    raise exception 'plan_cost_loading: basis must be current or baseline';
  end if;

  select coalesce(nullif(c.hours_per_day, 0), 8) into v_hpd
    from public.plan_calendars c where c.project_id = p_project_id order by c.is_default desc limit 1;
  v_hpd := coalesce(v_hpd, 8);

  with t as (
    select wt.id,
           coalesce(wt.budget_cost, 0)::numeric as budget,
           case when p_basis = 'baseline' then wt.baseline_start_date  else wt.start_date end as s,
           case when p_basis = 'baseline' then wt.baseline_finish_date else wt.end_date   end as f,
           coalesce(nullif(m.csi_division_code, ''), '--') as div
      from public.wbs_tasks wt
      left join public.plan_act_masters m on m.id = wt.activity_master_id
     where wt.project_id = p_project_id
       and coalesce(wt.budget_cost, 0) <> 0
  ),
  dated as (select * from t where s is not null and f is not null and f >= s),
  span  as (select min(s) as lo, max(f) as hi from dated),
  wd    as (select w.work_date from span, public.plan_project_workdays(p_project_id, span.lo, span.hi) w where span.lo is not null),
  td    as (select d.id, d.budget, d.div, w.work_date from dated d join wd w on w.work_date between d.s and d.f),
  n     as (select id, count(*)::numeric as c from td group by id),
  alloc as (
    select td.div, td.work_date, td.budget / n.c as v from td join n using (id)
    union all  -- no working day inside the task (e.g. a Sunday-only span): book it on its start date
    select d.div, d.s, d.budget from dated d where not exists (select 1 from n where n.id = d.id)
  ),
  cells as (
    select public.plan_period_start(work_date, v_period) as p, div, sum(v) as v
      from alloc group by 1, 2
  ),
  periods as (
    select gs::date as p
      from span, generate_series(public.plan_period_start(span.lo, v_period), span.hi,
                                 case v_period when 'day' then interval '1 day'
                                               when 'week' then interval '7 days'
                                               else interval '1 month' end) gs
     where span.lo is not null
  ),
  per as (
    select pr.p, coalesce(sum(c.v), 0) as v
      from periods pr left join cells c on c.p = pr.p
     group by pr.p
  ),
  per_cum as (select p, v, sum(v) over (order by p) as cum from per),
  divs as (
    select c.div, sum(c.v) as total
      from cells c group by c.div
  ),
  lab as (
    select h.hours, r.daily_rate, r.currency
      from public.plan_task_resource_hours h
      join public.wbs_tasks wt on wt.id = h.task_id
      left join lateral public.plan_resolve_labor_rate(h.dwl_resource_id) r on true
     where h.project_id = p_project_id and h.kind = 'labor'
  )
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'period',              v_period,
      'basis',               coalesce(p_basis, 'current'),
      'hours_per_day',       v_hpd,
      'start',               (select lo from span),
      'finish',              (select hi from span),
      'task_count',          (select count(*) from t),
      'total_budget',        (select round(coalesce(sum(budget), 0), 2) from t),
      'scheduled_budget',    (select round(coalesce(sum(budget), 0), 2) from dated),
      'unscheduled_budget',  (select round(coalesce(sum(budget), 0), 2) from t where not exists (select 1 from dated d where d.id = t.id)),
      'unscheduled_tasks',   (select count(*) from t where not exists (select 1 from dated d where d.id = t.id))
    ),
    'periods', coalesce((select jsonb_agg(jsonb_build_object('period', p, 'value', round(v, 2), 'cumulative', round(cum, 2)) order by p) from per_cum), '[]'::jsonb),
    'divisions', coalesce((
      select jsonb_agg(jsonb_build_object('code', d.div, 'name', coalesce(cd.name, 'Unclassified'), 'total', round(d.total, 2))
                       order by coalesce(cd.sort_order, 9999), d.div)
        from divs d left join public.csi_divisions cd on cd.code = d.div), '[]'::jsonb),
    'cells', coalesce((select jsonb_agg(jsonb_build_object('period', p, 'division', div, 'value', round(v, 2)) order by p, div) from cells), '[]'::jsonb),
    'margin', jsonb_build_object(
      'labour_hours',        (select round(coalesce(sum(hours), 0), 2) from lab),
      'priced_hours',        (select round(coalesce(sum(hours), 0), 2) from lab where daily_rate is not null),
      'labour_cost',         (select round(coalesce(sum(hours * daily_rate / v_hpd), 0), 2) from lab where daily_rate is not null),
      'currency',            (select min(currency) from lab where currency is not null)
    )
  ) into v_out;

  return v_out;
end;
$$;

-- 5. manpower histogram --------------------------------------------------------------------------
create or replace function public.plan_manpower_histogram(
  p_project_id uuid,
  p_period text default 'week',
  p_group text default 'trade',
  p_basis text default 'current'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_period text := case when p_period in ('day', 'week', 'month') then p_period else 'week' end;
  v_group  text := case when p_group in ('resource', 'trade', 'division') then p_group else 'trade' end;
  v_hpd    numeric;
  v_out    jsonb;
begin
  if coalesce(p_basis, 'current') not in ('current', 'baseline') then
    raise exception 'plan_manpower_histogram: basis must be current or baseline';
  end if;

  select coalesce(nullif(c.hours_per_day, 0), 8) into v_hpd
    from public.plan_calendars c where c.project_id = p_project_id order by c.is_default desc limit 1;
  v_hpd := coalesce(v_hpd, 8);

  with h as (
    select h.task_id, h.kind, h.hours::numeric as hours,
           case when p_basis = 'baseline' then wt.baseline_start_date  else wt.start_date end as s,
           case when p_basis = 'baseline' then wt.baseline_finish_date else wt.end_date   end as f,
           case v_group
             when 'resource' then r.id::text
             when 'trade'    then coalesce(public.plan_trade_label(r.description), r.code)
             else coalesce(nullif(m.csi_division_code, ''), '--')
           end as k,
           case v_group
             when 'resource' then coalesce(nullif(public.plan_trade_label(r.description), ''), r.code)
             when 'trade'    then coalesce(public.plan_trade_label(r.description), r.code)
             else coalesce(nullif(m.csi_division_code, ''), '--')
           end as label
      from public.plan_task_resource_hours h
      join public.wbs_tasks wt on wt.id = h.task_id
      join public.dwl_resources r on r.id = h.dwl_resource_id
      left join public.plan_act_masters m on m.id = wt.activity_master_id
     where h.project_id = p_project_id and h.hours > 0
  ),
  dated as (select * from h where s is not null and f is not null and f >= s),
  span  as (select min(s) as lo, max(f) as hi from dated),
  -- working days over whole periods, so a period's headcount divides by all of its working days
  wd    as (
    select w.work_date
      from span,
           public.plan_project_workdays(
             p_project_id,
             public.plan_period_start(span.lo, v_period),
             (public.plan_period_start(span.hi, v_period)
               + case v_period when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end
               - interval '1 day')::date) w
     where span.lo is not null
  ),
  tasks as (select distinct task_id, s, f from dated),
  tdays as (select t.task_id, w.work_date from tasks t join wd w on w.work_date between t.s and t.f),
  n     as (select task_id, count(*)::numeric as c from tdays group by task_id),
  alloc as (
    select d.k, d.label, d.kind, td.work_date, d.hours / n.c as v
      from dated d join tdays td on td.task_id = d.task_id join n on n.task_id = d.task_id
    union all
    select d.k, d.label, d.kind, d.s, d.hours
      from dated d where not exists (select 1 from n where n.task_id = d.task_id)
  ),
  daily as (select kind, work_date, sum(v) as v from alloc group by 1, 2),
  periods as (
    select gs::date as p
      from span, generate_series(public.plan_period_start(span.lo, v_period), span.hi,
                                 case v_period when 'day' then interval '1 day'
                                               when 'week' then interval '7 days'
                                               else interval '1 month' end) gs
     where span.lo is not null
  ),
  pwd as (
    select pr.p, (select count(*) from wd where public.plan_period_start(wd.work_date, v_period) = pr.p) as days
      from periods pr
  ),
  cells as (
    select public.plan_period_start(work_date, v_period) as p, k, kind, sum(v) as v
      from alloc group by 1, 2, 3
  ),
  per as (
    select pw.p, pw.days,
           coalesce((select sum(v) from daily d where d.kind = 'labor'     and public.plan_period_start(d.work_date, v_period) = pw.p), 0) as lab,
           coalesce((select sum(v) from daily d where d.kind = 'equipment' and public.plan_period_start(d.work_date, v_period) = pw.p), 0) as eqp,
           coalesce((select max(v) from daily d where d.kind = 'labor'     and public.plan_period_start(d.work_date, v_period) = pw.p), 0) as lab_peak,
           coalesce((select max(v) from daily d where d.kind = 'equipment' and public.plan_period_start(d.work_date, v_period) = pw.p), 0) as eqp_peak
      from pwd pw
  ),
  series as (
    select k, min(label) as label, kind, sum(hours) as total
      from dated group by k, kind
  )
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'period',            v_period,
      'group',             v_group,
      'basis',             coalesce(p_basis, 'current'),
      'hours_per_day',     v_hpd,
      'start',             (select lo from span),
      'finish',            (select hi from span),
      'labour_hours',      (select round(coalesce(sum(hours), 0), 2) from h where kind = 'labor'),
      'equipment_hours',   (select round(coalesce(sum(hours), 0), 2) from h where kind = 'equipment'),
      'unscheduled_hours', (select round(coalesce(sum(hours), 0), 2) from h where not (s is not null and f is not null and f >= s)),
      'task_count',        (select count(distinct task_id) from h)
    ),
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object(
               'period',              p,
               'working_days',        days,
               'labor_hours',         round(lab, 2),
               'equipment_hours',     round(eqp, 2),
               'labor_headcount',     round(case when days > 0 then lab / (v_hpd * days) else 0 end, 2),
               'equipment_headcount', round(case when days > 0 then eqp / (v_hpd * days) else 0 end, 2),
               'labor_peak',          round(lab_peak / v_hpd, 2),
               'equipment_peak',      round(eqp_peak / v_hpd, 2)
             ) order by p)
        from per), '[]'::jsonb),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', s.k,
               'label', case when v_group = 'division' then coalesce(cd.code || ' ' || cd.name, 'Unclassified') else s.label end,
               'kind', s.kind,
               'total_hours', round(s.total, 2)) order by s.kind, s.total desc)
        from series s left join public.csi_divisions cd on v_group = 'division' and cd.code = s.k), '[]'::jsonb),
    'cells', coalesce((
      select jsonb_agg(jsonb_build_object(
               'period', c.p, 'key', c.k, 'kind', c.kind,
               'hours', round(c.v, 2),
               'headcount', round(case when pw.days > 0 then c.v / (v_hpd * pw.days) else 0 end, 2)) order by c.p, c.kind, c.k)
        from cells c join pwd pw on pw.p = c.p), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

-- grants -----------------------------------------------------------------------------------------
revoke all on function public.plan_project_workdays(uuid, date, date) from public, anon;
revoke all on function public.plan_cost_loading(uuid, text, text) from public, anon;
revoke all on function public.plan_manpower_histogram(uuid, text, text, text) from public, anon;
grant execute on function public.plan_project_workdays(uuid, date, date) to authenticated;
grant execute on function public.plan_cost_loading(uuid, text, text) to authenticated;
grant execute on function public.plan_manpower_histogram(uuid, text, text, text) to authenticated;
grant execute on function public.plan_period_start(date, text) to authenticated;
grant execute on function public.plan_trade_label(text) to authenticated;
