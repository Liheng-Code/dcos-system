-- Allow RBAC users with task_management/delete_task/delete permission to delete WBS tasks.

create policy "Users with delete_task permission can delete wbs_tasks"
  on public.wbs_tasks for delete to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_code = ur.role_code
      where ur.user_id = auth.uid()
        and rp.module = 'task_management'
        and rp.action = 'delete_task'
        and rp.delete = true
    )
  );
