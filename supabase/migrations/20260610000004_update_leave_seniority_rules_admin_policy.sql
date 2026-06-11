-- Allow HR/admin users recognized by either RBAC roles or profile fields to
-- manage seniority rules from the E-Leave admin UI.

DROP POLICY IF EXISTS "leave_seniority_rules_manage" ON public.leave_seniority_rules;

CREATE POLICY "leave_seniority_rules_manage"
  ON public.leave_seniority_rules FOR ALL TO authenticated
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
        AND (
          role IN ('admin', 'HR_Manager', 'hr_manager')
          OR level IN ('HR_Manager', 'HR_Admin', 'Super_Admin', 'Admin')
        )
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
        AND (
          role IN ('admin', 'HR_Manager', 'hr_manager')
          OR level IN ('HR_Manager', 'HR_Admin', 'Super_Admin', 'Admin')
        )
    )
  );
