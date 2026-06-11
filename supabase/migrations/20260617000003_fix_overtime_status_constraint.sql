-- Fix overtime_requests status CHECK to include 'cancelled'
alter table public.overtime_requests
  drop constraint if exists overtime_requests_status_check;

alter table public.overtime_requests
  add constraint overtime_requests_status_check
  check (status in (
    'draft', 'submitted', 'approved', 'rejected', 'cancelled',
    'in_progress', 'completed', 'verified', 'paid'
  ));
