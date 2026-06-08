-- ============================================================
-- Payroll Workflow Extension (R2.3-A)
-- Adds 8-step workflow fields to payroll_periods,
-- TOS/NSSF breakdown fields to payroll_entries,
-- and creates the payroll_audit_log table.
-- ============================================================

-- 1. Extend payroll_periods with full 8-step workflow ─────────────

ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS reviewed_by          uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by          uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at          timestamptz,
  ADD COLUMN IF NOT EXISTS director_approved_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS director_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by            uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS locked_at            timestamptz,
  ADD COLUMN IF NOT EXISTS exported_at          timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_comment    text;

-- Replace status check to support 8-step workflow
-- (DROP old constraint, ADD new one)
ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS payroll_periods_status_check;
ALTER TABLE payroll_periods
  ADD CONSTRAINT payroll_periods_status_check
  CHECK (status IN (
    'open', 'draft', 'calculated', 'hr_reviewed',
    'finance_verified', 'director_approved', 'locked', 'exported', 'paid', 'processing', 'approved', 'closed'
  ));

-- 2. Extend payroll_entries with TOS/NSSF breakdown columns ──────

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS total_tos        numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_nssf_ee    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_nssf_er    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_relief_khr   numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_income   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_rate    numeric(8,2)  NOT NULL DEFAULT 4000,
  ADD COLUMN IF NOT EXISTS tax_snapshot     jsonb,   -- snapshot of TOS brackets used
  ADD COLUMN IF NOT EXISTS nssf_snapshot    jsonb;   -- snapshot of NSSF rules used

-- Migrate existing entries: move PIT into total_tos column
-- (best-effort: the old total_deductions included both NSSF and PIT)
-- No-op — existing entries keep 0 until next payroll recalculation.

-- 3. Create payroll_audit_log ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id        uuid REFERENCES payroll_periods(id) ON DELETE SET NULL,
  payroll_entry_id uuid REFERENCES payroll_entries(id) ON DELETE SET NULL,
  user_id          uuid NOT NULL REFERENCES profiles(id),
  role_at_time     text,
  action           text NOT NULL,   -- e.g. 'submitted_for_review', 'locked', 'rejected'
  record_type      text NOT NULL,   -- 'period', 'entry', 'employee_profile', 'salary_structure'
  record_id        uuid,
  old_value        jsonb,
  new_value        jsonb,
  reason           text,
  ip_address       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pal_period   ON payroll_audit_log(period_id);
CREATE INDEX idx_pal_user     ON payroll_audit_log(user_id);
CREATE INDEX idx_pal_action   ON payroll_audit_log(action, created_at DESC);

ALTER TABLE payroll_audit_log ENABLE ROW LEVEL SECURITY;

-- HR Manager and above can read full log; Finance sees finance-related records
CREATE POLICY "audit_log_hr_read" ON payroll_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin'))
    OR (
      -- Finance users can see their own actions and verification events
      auth.uid() = user_id
    )
  );

CREATE POLICY "audit_log_write" ON payroll_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
