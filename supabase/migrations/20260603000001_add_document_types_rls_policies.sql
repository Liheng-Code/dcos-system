-- Add INSERT / UPDATE / DELETE RLS policies for document_types
-- Only admin roles (L0, L1, L2, DC) with configure_document_types permission may mutate.

CREATE POLICY "document_types_insert_admin"
  ON public.document_types FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_code IN ('L0', 'L1', 'L2', 'DC'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "document_types_update_admin"
  ON public.document_types FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_code IN ('L0', 'L1', 'L2', 'DC'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_code IN ('L0', 'L1', 'L2', 'DC'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "document_types_delete_admin"
  ON public.document_types FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role_code IN ('L0', 'L1', 'L2', 'DC'))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
