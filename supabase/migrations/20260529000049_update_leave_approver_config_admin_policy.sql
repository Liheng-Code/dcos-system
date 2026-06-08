-- Allow both HR Manager role holders and profile-based admins to manage leave approval chains.
DROP POLICY IF EXISTS "leave_approver_config_manage" ON public.leave_approver_config;

CREATE POLICY "leave_approver_config_manage"
  ON public.leave_approver_config FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role_code IN ('HR_Manager', 'admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role_code IN ('HR_Manager', 'admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );
