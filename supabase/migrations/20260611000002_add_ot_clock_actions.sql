-- Add clock_in and clock_out actions to overtime_audit_log constraint
-- NOTE: clock_in/clock_out are now included in the CREATE TABLE in 20260617000001
-- This migration is kept as a no-op for environments where the table already exists
-- without these actions.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'overtime_audit_log') then
    alter table public.overtime_audit_log
      drop constraint if exists overtime_audit_log_action_check;

    alter table public.overtime_audit_log
      add constraint overtime_audit_log_action_check
        check (action in (
          'created', 'edited', 'submitted', 'approved', 'rejected',
          'verified', 'completed', 'paid', 'cancelled', 'cost_allocated',
          'payroll_transfer', 'clock_in', 'clock_out'
        ));
  end if;
end
$$;
