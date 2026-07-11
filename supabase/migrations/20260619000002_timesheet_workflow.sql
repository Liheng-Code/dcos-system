-- Timesheet workflow fixes
-- Allow OT verification to create OT-only timesheet entries. Regular hours can
-- be zero when the row exists only to carry verified overtime into payroll.

alter table public.timesheet_entries
  drop constraint if exists timesheet_entries_hours_worked_check;

alter table public.timesheet_entries
  add constraint timesheet_entries_hours_worked_check
  check (hours_worked >= 0);
