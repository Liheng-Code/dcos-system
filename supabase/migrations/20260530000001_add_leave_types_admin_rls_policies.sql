-- Add INSERT / UPDATE / DELETE RLS policies for leave_types
-- Only HR_Manager / admin users (by RBAC or profile role) may mutate leave types.

CREATE POLICY "leave_types_insert_admin"
  ON public.leave_types FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "leave_types_update_admin"
  ON public.leave_types FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "leave_types_delete_admin"
  ON public.leave_types FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

