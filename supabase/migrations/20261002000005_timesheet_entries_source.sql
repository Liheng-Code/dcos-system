-- Timesheet generation from attendance_daily (docs/04-Business-Modules/04-18-HR/04-18-0-HR-Auto-Match-Design.md §5)
--   timesheet_entries.source   'auto' = generated from attendance (safe to regenerate),
--                              'manual' = entered or edited by a person (never overwritten).
--                              Existing rows default to 'manual' because they cannot be told apart.
--   ot_type check dropped      OT types are HR-configured in overtime_rates (weekday, weekend,
--                              public_holiday, ...), no longer the fixed 1.5x / 2.0x / holiday list.
-- Convention (unchanged, used by plan_productivity_log_from_timesheet): hours_worked is the entry's
-- total hours and ot_hours is the overtime part of it.
-- Safe to re-run.

alter table public.timesheet_entries
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'timesheet_entries_source_check') then
    alter table public.timesheet_entries
      add constraint timesheet_entries_source_check check (source in ('auto', 'manual'));
  end if;
end $$;

alter table public.timesheet_entries drop constraint if exists timesheet_entries_ot_type_check;

comment on column public.timesheet_entries.source is
  'auto = generated from attendance_daily and replaced on regeneration; manual = entered/edited by a person and kept.';
comment on column public.timesheet_entries.ot_type is
  'overtime_rates.ot_type of the OT hours in this entry (free text, HR-configured); null when there is no OT.';
