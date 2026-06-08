-- Enable RLS on core tables that were previously fully exposed.
-- Policy: authenticated users (logged-in via JWT) get full CRUD access.
-- Anonymous (unauthenticated anon key) is blocked entirely.
-- Tighten to role-specific checks once RBAC policies are finalised.

ALTER TABLE public.roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_thresholds ENABLE ROW LEVEL SECURITY;

-- roles: system lookup table — any signed-in user can read; admins manage via app
CREATE POLICY "roles_authenticated_all" ON public.roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- role_permissions: permission matrix — readable by all authenticated; writable by admins via app
CREATE POLICY "role_permissions_authenticated_all" ON public.role_permissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- user_roles: HR admins assign roles from the frontend; all authenticated can read
CREATE POLICY "user_roles_authenticated_all" ON public.user_roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- profiles: HR admins create/update any employee profile from the frontend
CREATE POLICY "profiles_authenticated_all" ON public.profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- approval_thresholds: org-level config readable and manageable by authenticated users
CREATE POLICY "approval_thresholds_authenticated_all" ON public.approval_thresholds
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
