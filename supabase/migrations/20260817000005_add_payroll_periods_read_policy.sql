-- Migration: 20260817000005_add_payroll_periods_read_policy.sql
-- Purpose: payroll_periods has only one RLS policy ("periods_hr_full", FOR ALL,
--          gated by is_hr_admin()) — meaning non-admin employees cannot SELECT
--          payroll_periods at all. my-payslip/page.tsx fetches all payroll_periods
--          and intersects them with the employee's own payroll_entries to decide
--          what to show; for a non-admin employee that first fetch returns zero
--          rows, so no payslip is ever visible regardless of whether they have
--          valid paid entries. Only HR admins (who pass is_hr_admin()) could see
--          anything. Fix: add an open read policy for period metadata (label,
--          dates, status — not sensitive financial data), matching the existing
--          pattern already used for payroll_component_types ("component_types_read").
--          Write access remains admin-only via the existing periods_hr_full policy.

CREATE POLICY "periods_read" ON payroll_periods
  FOR SELECT TO authenticated
  USING (true);
