-- Migration: 20261004000013_dr_hardening.sql
-- Purpose: Module 10-01 Daily Reporting, Phase 1A — fixes from the security
--          review of 20261004000010/11.
--   1. projects.dr_enabled could be flipped by any signed-in user, because the
--      projects UPDATE policy is `using (true)`. Guard that one column.
--   2. A reporting schedule with an unknown time zone would make
--      dr_run_schedule() fail for every project. Reject it at write time.
-- Depends on: 20261004000010_dr_core_schema.sql

-- ── 1. Only a Daily Reporting admin of the project may switch it on or off ──
create or replace function public.dr_guard_project_switch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dr_enabled is distinct from old.dr_enabled
     -- auth.uid() is null for the service role and for migrations.
     and auth.uid() is not null
     and not dr_can_admin(new.id) then
    raise exception 'DR_FORBIDDEN: only the project manager or an administrator can switch Daily Reporting on or off'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dr_guard_project_switch on public.projects;
create trigger trg_dr_guard_project_switch
  before update of dr_enabled on public.projects
  for each row execute function public.dr_guard_project_switch();

-- ── 2. Schedule time zone must be one Postgres knows ────────────────────────
create or replace function public.dr_validate_schedule()
returns trigger
language plpgsql
as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'DR_REQ_FIELD: unknown time zone "%"', new.timezone using errcode = '22023';
  end if;
  if new.reminder_time >= new.deadline_time then
    raise exception 'DR_REQ_FIELD: the reminder must be earlier than the deadline' using errcode = '22023';
  end if;
  if coalesce(array_length(new.working_days, 1), 0) = 0
     or exists (select 1 from unnest(new.working_days) d where d not between 1 and 7) then
    raise exception 'DR_REQ_FIELD: working days must be one or more of 1 (Monday) to 7 (Sunday)' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_dr_validate_schedule on public.dr_reporting_schedules;
create trigger trg_dr_validate_schedule
  before insert or update on public.dr_reporting_schedules
  for each row execute function public.dr_validate_schedule();
