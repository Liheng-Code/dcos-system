-- Fix employee payroll profile RLS policies: replace level-based checks with is_hr_admin()
-- Same pattern as 20260601000051 and 20260602000058.

-- ── employee_payroll_profiles ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "epp_own_read" ON employee_payroll_profiles;
DROP POLICY IF EXISTS "epp_hr_write" ON employee_payroll_profiles;

CREATE POLICY "epp_own_read" ON employee_payroll_profiles
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR is_hr_admin());

CREATE POLICY "epp_hr_write" ON employee_payroll_profiles
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- ── employee_tax_profiles ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "etp_own_read" ON employee_tax_profiles;
DROP POLICY IF EXISTS "etp_hr_write" ON employee_tax_profiles;

CREATE POLICY "etp_own_read" ON employee_tax_profiles
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR is_hr_admin());

CREATE POLICY "etp_hr_write" ON employee_tax_profiles
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- ── employee_nssf_profiles ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "enp_own_read" ON employee_nssf_profiles;
DROP POLICY IF EXISTS "enp_hr_write" ON employee_nssf_profiles;

CREATE POLICY "enp_own_read" ON employee_nssf_profiles
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR is_hr_admin());

CREATE POLICY "enp_hr_write" ON employee_nssf_profiles
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());
