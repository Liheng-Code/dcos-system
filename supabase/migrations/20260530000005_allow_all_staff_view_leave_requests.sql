-- Allow all authenticated staff to view approved and submitted leave requests.
-- This makes the "Who's on Leave" page functional for every employee, not just
-- HR Managers. Own records at any status are already covered by the existing
-- "Users can view own leave requests" policy (RLS policies OR together).
create policy "All staff can view approved and submitted leave requests"
  on public.leave_requests for select to authenticated
  using (status in ('approved', 'submitted', 'pending_cancellation'));
