-- Add clock_in and clock_out actions to overtime_audit_log constraint
alter table public.overtime_audit_log
  drop constraint if exists overtime_audit_log_action_check;

alter table public.overtime_audit_log
  add constraint overtime_audit_log_action_check
    check (action in (
      'created', 'edited', 'submitted', 'approved', 'rejected',
      'verified', 'completed', 'paid', 'cancelled', 'cost_allocated',
      'payroll_transfer', 'clock_in', 'clock_out'
    ));
