-- Fix TOS config RLS policies: replace level-based checks with is_hr_admin()
-- See 20260601000051 for the same pattern applied to other payroll tables.

-- ── tos_brackets ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tos_brackets_hr_write" ON tos_brackets;

CREATE POLICY "tos_brackets_hr_write" ON tos_brackets
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- ── tos_dependent_relief ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tos_relief_hr_write" ON tos_dependent_relief;

CREATE POLICY "tos_relief_hr_write" ON tos_dependent_relief
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- ── tos_flat_rates ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tos_flat_rates_hr_write" ON tos_flat_rates;

CREATE POLICY "tos_flat_rates_hr_write" ON tos_flat_rates
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());

-- ── tos_exchange_rates ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tos_exchange_rates_hr_write" ON tos_exchange_rates;

CREATE POLICY "tos_exchange_rates_hr_write" ON tos_exchange_rates
  FOR ALL TO authenticated
  USING (is_hr_admin())
  WITH CHECK (is_hr_admin());
