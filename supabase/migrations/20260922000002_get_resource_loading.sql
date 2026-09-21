-- Migration: 20260922000002_get_resource_loading.sql
-- Purpose: Productivity & Resource-Costing Plan, Phase 0 — a calendar-aware, hours-aware
--          replacement for get_resource_allocation for the dashboards and Resource Loading.
-- Depends on:
--   public.plan_resources, public.plan_task_assignments (20260905000004_create_plan_resources.sql)
--   public.plan_calendars, public.plan_calendar_exceptions (20260531000045_planning_scheduling.sql)
--   public.plan_calendars.hours_per_day (20260922000001)
--
-- Why a new function instead of changing get_resource_allocation:
--   get_resource_allocation spreads every assignment over EVERY calendar day, Sundays and
--   holidays included, and knows nothing about hours. That inflates the manpower histogram
--   and mis-states over-allocation on a Mon-Sat programme. It is left untouched so nothing
--   that still calls it changes behaviour.
--
-- Semantics:
--   * One row per (resource, working day) with the summed allocation_percent of every
--     assignment whose task spans that day (100 = one worker / one machine).
--   * A day is "working" per the resource's own calendar (plan_resources.calendar_id) or, if it
--     has none, the project's default calendar (is_default first, then oldest). Exceptions
--     (plan_calendar_exceptions) override the weekday flags either way.
--   * A project with no calendar at all falls back to Mon-Fri and 8 hours, matching the
--     client-side default (DEFAULT_CALENDAR in lib/planning/work-calendar.ts).
--   * work_hours = total_allocation / 100 * hours_per_day  (man-hours for that day).
--   * p_from / p_to optionally clip the window; NULL = the tasks' full span.
--   * Ordered by resource name, date, resource id so callers can page with .range() —
--     PostgREST caps a response at max_rows (1000) and a real project needs several pages.
--
-- security invoker: the caller's RLS applies to plan_resources / plan_task_assignments /
-- wbs_tasks / plan_calendars, exactly as for get_resource_allocation.

create or replace function public.get_resource_loading(
  p_project_id uuid,
  p_from       date default null,
  p_to         date default null
)
returns table (
  resource_id      uuid,
  resource_name    text,
  resource_type    text,
  work_date        date,
  total_allocation numeric,
  max_units        numeric,
  is_overallocated boolean,
  hours_per_day    numeric,
  work_hours       numeric
)
language sql
security invoker
stable
as $$
  with project_calendar as (
    select c.id
    from public.plan_calendars c
    where c.project_id = p_project_id
    order by c.is_default desc, c.created_at
    limit 1
  ),
  expanded as (
    select
      a.resource_id,
      a.allocation_percent,
      coalesce(r.calendar_id, (select id from project_calendar)) as calendar_id,
      gs.d::date as work_date
    from public.plan_task_assignments a
    join public.wbs_tasks      t on t.id = a.task_id
    join public.plan_resources r on r.id = a.resource_id
    cross join lateral generate_series(
      greatest(t.start_date, coalesce(p_from, t.start_date)),
      least(t.end_date,      coalesce(p_to,   t.end_date)),
      interval '1 day'
    ) as gs(d)
    where t.project_id = p_project_id
      and r.project_id = p_project_id
      and t.start_date is not null
      and t.end_date   is not null
  ),
  working as (
    select
      e.resource_id,
      e.allocation_percent,
      e.work_date,
      coalesce(c.hours_per_day, 8) as hours_per_day
    from expanded e
    left join public.plan_calendars c
           on c.id = e.calendar_id
    left join public.plan_calendar_exceptions x
           on x.calendar_id = e.calendar_id
          and x.exception_date = e.work_date
    where coalesce(
            x.is_working,
            case
              when c.id is null then extract(isodow from e.work_date) between 1 and 5
              else case extract(isodow from e.work_date)::int
                     when 1 then c.monday
                     when 2 then c.tuesday
                     when 3 then c.wednesday
                     when 4 then c.thursday
                     when 5 then c.friday
                     when 6 then c.saturday
                     when 7 then c.sunday
                   end
            end
          )
  ),
  summed as (
    select
      w.resource_id,
      w.work_date,
      sum(w.allocation_percent) as total_allocation,
      max(w.hours_per_day)      as hours_per_day
    from working w
    group by w.resource_id, w.work_date
  )
  select
    s.resource_id,
    r.name                                   as resource_name,
    r.resource_type,
    s.work_date,
    s.total_allocation,
    r.max_units,
    s.total_allocation > r.max_units         as is_overallocated,
    s.hours_per_day,
    round(s.total_allocation / 100 * s.hours_per_day, 2) as work_hours
  from summed s
  join public.plan_resources r on r.id = s.resource_id
  order by r.name, s.work_date, s.resource_id
$$;

grant execute on function public.get_resource_loading(uuid, date, date) to authenticated;

comment on function public.get_resource_loading(uuid, date, date) is
  'Working-day, hours-aware resource loading (replaces get_resource_allocation for the dashboards). See 16-Productivity-and-Resource-Costing-Plan.md.';
