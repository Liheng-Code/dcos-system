-- Payroll can deduct unpaid leave and absence using attendance_daily, but only when HR switches it on.
-- Default is OFF so adopting the daily attendance feed does not change anyone's pay by itself.
--   payroll_settings key 'attendance_deduction'
--     enabled              master switch
--     deduct_unpaid_leave  deduct days of unpaid leave types
--     deduct_absence       deduct days recorded as ABSENT
-- The deduction per day is basic salary / working_time.days_per_month, taken off gross and the
-- tax/NSSF base, and booked on the UNPAID_LEAVE component.
-- Safe to re-run.

insert into public.payroll_settings (key, value)
values ('attendance_deduction', '{"enabled": false, "deduct_unpaid_leave": true, "deduct_absence": true}'::jsonb)
on conflict (key) do nothing;
