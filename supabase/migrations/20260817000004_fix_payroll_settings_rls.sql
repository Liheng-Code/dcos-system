-- Migration: 20260817000004_fix_payroll_settings_rls.sql
-- Purpose: several RLS policies added in 20260618000004_payroll_enhancements.sql check
--          only profiles.level IN ('HR_Manager','HR_Admin','Super_Admin','Admin'), which
--          returns 403 for admins whose "adminness" is expressed via profiles.role='admin'
--          or a user_roles row instead of a populated level column (e.g. profiles.level
--          is null but role='admin' — confirmed on a real account: 403 writing
--          payroll_settings from the new Payroll Config UI). Every other payroll table
--          already had this exact bug fixed by switching to the shared is_hr_admin()
--          helper (see 20260601000051_fix_payroll_rls_policies.sql, 20260602000058,
--          20260602000059) — these four tables were added afterward and missed that fix.
-- is_hr_admin(): profiles.role = 'admin' OR user_roles.role_code IN ('admin','HR_Manager').

-- payroll_settings
DROP POLICY IF EXISTS "psettings_hr_write" ON payroll_settings;
CREATE POLICY "psettings_hr_write" ON payroll_settings
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- payroll_seniority_rules
DROP POLICY IF EXISTS "seniority_rules_hr_write" ON payroll_seniority_rules;
CREATE POLICY "seniority_rules_hr_write" ON payroll_seniority_rules
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- payroll_adjustments
DROP POLICY IF EXISTS "adjustments_own_read" ON payroll_adjustments;
CREATE POLICY "adjustments_own_read" ON payroll_adjustments
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR is_hr_admin());

DROP POLICY IF EXISTS "adjustments_hr_write" ON payroll_adjustments;
CREATE POLICY "adjustments_hr_write" ON payroll_adjustments
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- payroll_notifications
DROP POLICY IF EXISTS "pnotif_own_read" ON payroll_notifications;
CREATE POLICY "pnotif_own_read" ON payroll_notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR is_hr_admin());

DROP POLICY IF EXISTS "pnotif_hr_write" ON payroll_notifications;
CREATE POLICY "pnotif_hr_write" ON payroll_notifications
  FOR INSERT TO authenticated
  WITH CHECK (is_hr_admin());
