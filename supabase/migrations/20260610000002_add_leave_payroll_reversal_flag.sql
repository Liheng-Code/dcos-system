-- Add payroll reversal flag to leave_requests for Phase 3 of Withdraw & Cancel flow
alter table public.leave_requests
  add column if not exists payroll_reversal_needed boolean not null default false;

-- Index for payroll processing queries
create index if not exists idx_leave_requests_payroll_reversal
  on public.leave_requests(payroll_reversal_needed)
  where payroll_reversal_needed = true;
