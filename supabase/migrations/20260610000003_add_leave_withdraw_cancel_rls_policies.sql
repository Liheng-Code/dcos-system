-- Allow employees to withdraw their own submitted requests
-- and request cancellation on their own approved requests
create policy "Employees can withdraw or cancel own requests"
  on public.leave_requests for update to authenticated
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());
