-- Fix payroll RLS policies: replace level-based checks with actual role values
-- profiles.role values: 'admin', 'department_manager', 'project_manager', 'viewer'
-- HR admin = profiles.role = 'admin' OR user_roles.role_code IN ('admin','HR_Manager')

-- Helper: returns true if the calling user is an HR admin
CREATE OR REPLACE FUNCTION is_hr_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('admin','HR_Manager')
  );
$$;

-- ── employee_salary_structures ───────────────────────────────────────────────
DROP POLICY IF EXISTS "salary_structure_own_read"  ON employee_salary_structures;
DROP POLICY IF EXISTS "salary_structure_hr_write"  ON employee_salary_structures;

CREATE POLICY "salary_structure_read" ON employee_salary_structures
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR is_hr_admin());

CREATE POLICY "salary_structure_write" ON employee_salary_structures
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- ── employee_bank_accounts ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "bank_account_own" ON employee_bank_accounts;

CREATE POLICY "bank_account_access" ON employee_bank_accounts
  FOR ALL TO authenticated
  USING (employee_id = auth.uid() OR is_hr_admin())
  WITH CHECK (employee_id = auth.uid() OR is_hr_admin());

-- ── payroll_periods ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "periods_hr_full" ON payroll_periods;

CREATE POLICY "periods_hr_full" ON payroll_periods
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- ── payroll_entries ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "entries_own_read" ON payroll_entries;
DROP POLICY IF EXISTS "entries_hr_write" ON payroll_entries;

CREATE POLICY "entries_read" ON payroll_entries
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR is_hr_admin());

CREATE POLICY "entries_write" ON payroll_entries
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- ── payroll_entry_lines ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "entry_lines_own_read"  ON payroll_entry_lines;
DROP POLICY IF EXISTS "entry_lines_hr_write"  ON payroll_entry_lines;

CREATE POLICY "entry_lines_read" ON payroll_entry_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM payroll_entries pe
      WHERE pe.id = entry_id
        AND (pe.employee_id = auth.uid() OR is_hr_admin())
    )
  );

CREATE POLICY "entry_lines_write" ON payroll_entry_lines
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());
