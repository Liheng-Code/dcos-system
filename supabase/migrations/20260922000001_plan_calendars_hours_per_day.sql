-- Migration: 20260922000001_plan_calendars_hours_per_day.sql
-- Purpose: Productivity & Resource-Costing Plan (docs/04-Business-Modules/06-Planning-Scheduling/
--          16-Productivity-and-Resource-Costing-Plan.md), Phase 0.
--          Calendars know which DAYS are working but not how many HOURS a working day has.
--          Productivity maths (man-hours -> duration/crew) needs it, and so does hours-aware
--          resource loading (get_resource_loading, next migration).
-- Depends on: public.plan_calendars (20260531000045_planning_scheduling.sql)
--
-- Purely additive and safe to re-run: existing calendars get the default of 8 hours.

alter table public.plan_calendars
  add column if not exists hours_per_day numeric not null default 8;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.plan_calendars'::regclass
      and conname  = 'plan_calendars_hours_per_day_check'
  ) then
    alter table public.plan_calendars
      add constraint plan_calendars_hours_per_day_check
      check (hours_per_day > 0 and hours_per_day <= 24);
  end if;
end $$;

comment on column public.plan_calendars.hours_per_day is
  'Productive hours in one working day (default 8). Used to convert man-hours <-> man-days and by get_resource_loading.';
