-- ============================================================
-- Payroll Enhancements (HR-04 gap closure)
-- 1. New component types: SENIORITY, BONUS, UNPAID_LEAVE,
--    WARNING_DEDUCTION, ADVANCE_SALARY, LEAVE_REVERSAL
-- 2. payroll_seniority_rules (Cambodia twice-yearly seniority payment)
-- 3. payroll_adjustments (per-period one-off earnings/deductions)
-- 4. payroll_notifications (workflow event queue)
-- 5. Lock enforcement trigger (no entry writes once period locked)
-- 6. payroll_audit_log.severity
-- 7. payroll_settings (OT multipliers, working days)
-- 8. payroll_entries seniority/unpaid-leave breakdown columns
-- ============================================================

-- 1. New component types ---------------------------------------------------
INSERT INTO payroll_component_types (code, name, category, is_taxable, is_system, sort_order) VALUES
  ('SENIORITY',         'Seniority Payment',        'earning',   false, true,  75),
  ('BONUS',             'Bonus',                    'earning',   true,  false, 45),
  ('LEAVE_REVERSAL',    'Leave Reversal Credit',    'earning',   false, true,  78),
  ('UNPAID_LEAVE',      'Unpaid Leave Deduction',   'deduction', false, true,  85),
  ('WARNING_DEDUCTION', 'Warning Letter Deduction', 'deduction', false, false, 95),
  ('ADVANCE_SALARY',    'Advance Salary Repayment', 'deduction', false, false, 105)
ON CONFLICT (code) DO NOTHING;

-- 2. Seniority payment rules (Cambodia Labor Law / Prakas 443) -------------
CREATE TABLE IF NOT EXISTS payroll_seniority_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  days_per_payment   numeric(4,1) NOT NULL DEFAULT 7.5,  -- days of wage per payment
  payment_months     int[]        NOT NULL DEFAULT '{6,12}',  -- months when paid
  min_service_months int          NOT NULL DEFAULT 1,    -- minimum service to qualify
  effective_date     date         NOT NULL,
  status             text         NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','active','archived')),
  notes              text,
  created_by         uuid REFERENCES profiles(id),
  created_at         timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO payroll_seniority_rules (days_per_payment, payment_months, min_service_months, effective_date, status, notes)
VALUES (7.5, '{6,12}', 1, '2026-01-01', 'active', 'Cambodia seniority payment: 7.5 days of wages every June and December (15 days/year)');

ALTER TABLE payroll_seniority_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seniority_rules_read" ON payroll_seniority_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "seniority_rules_hr_write" ON payroll_seniority_rules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

-- 3. Per-period one-off adjustments ----------------------------------------
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id          uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  component_type_id  uuid NOT NULL REFERENCES payroll_component_types(id),
  amount             numeric(12,2) NOT NULL,
  note               text,
  created_by         uuid REFERENCES profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_padj_period   ON payroll_adjustments(period_id);
CREATE INDEX idx_padj_employee ON payroll_adjustments(employee_id);

ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adjustments_own_read" ON payroll_adjustments
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "adjustments_hr_write" ON payroll_adjustments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

-- 4. Payroll notifications queue (mirrors overtime_notifications) ----------
CREATE TABLE IF NOT EXISTS payroll_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid REFERENCES payroll_periods(id) ON DELETE CASCADE,
  event_type      text NOT NULL CHECK (event_type IN (
                    'period_created', 'payroll_calculated', 'submitted_to_finance',
                    'submitted_to_director', 'director_approved', 'payroll_locked',
                    'payroll_exported', 'payroll_paid', 'payroll_rejected'
                  )),
  recipient_id    uuid NOT NULL REFERENCES profiles(id),
  recipient_email text,
  recipient_name  text,
  subject         text,
  body            text,
  queued_at       timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  error_message   text
);

CREATE INDEX idx_pnotif_period    ON payroll_notifications(period_id);
CREATE INDEX idx_pnotif_recipient ON payroll_notifications(recipient_id);
CREATE INDEX idx_pnotif_sent      ON payroll_notifications(sent_at) WHERE sent_at IS NULL;

ALTER TABLE payroll_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pnotif_own_read" ON payroll_notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() OR
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "pnotif_hr_write" ON payroll_notifications
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

-- 5. Lock enforcement: block entry writes once period is locked ------------
CREATE OR REPLACE FUNCTION payroll_block_locked_period_entries()
RETURNS trigger AS $$
DECLARE
  v_period_id uuid;
  v_status    text;
BEGIN
  v_period_id := COALESCE(NEW.period_id, OLD.period_id);
  SELECT status INTO v_status FROM payroll_periods WHERE id = v_period_id;
  IF v_status IN ('locked','exported','paid','closed') THEN
    RAISE EXCEPTION 'Payroll period is % — entries can no longer be modified', v_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_payroll_entries_lock
  BEFORE INSERT OR UPDATE OR DELETE ON payroll_entries
  FOR EACH ROW EXECUTE FUNCTION payroll_block_locked_period_entries();

CREATE OR REPLACE FUNCTION payroll_block_locked_period_lines()
RETURNS trigger AS $$
DECLARE
  v_entry_id uuid;
  v_status   text;
BEGIN
  v_entry_id := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT pp.status INTO v_status
  FROM payroll_entries pe JOIN payroll_periods pp ON pp.id = pe.period_id
  WHERE pe.id = v_entry_id;
  IF v_status IN ('locked','exported','paid','closed') THEN
    RAISE EXCEPTION 'Payroll period is % — entry lines can no longer be modified', v_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_payroll_entry_lines_lock
  BEFORE INSERT OR UPDATE OR DELETE ON payroll_entry_lines
  FOR EACH ROW EXECUTE FUNCTION payroll_block_locked_period_lines();

-- Adjustments are also frozen once the period is locked
CREATE TRIGGER trg_payroll_adjustments_lock
  BEFORE INSERT OR UPDATE OR DELETE ON payroll_adjustments
  FOR EACH ROW EXECUTE FUNCTION payroll_block_locked_period_entries();

-- 6. Audit severity (plan §17: Low / Medium / High / Critical) -------------
ALTER TABLE payroll_audit_log
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'low'
  CHECK (severity IN ('low','medium','high','critical'));

-- 7. Payroll settings (OT multipliers / working time, configurable) --------
CREATE TABLE IF NOT EXISTS payroll_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO payroll_settings (key, value) VALUES
  ('ot_multipliers',  '{"ot150": 1.5, "ot200": 2.0, "holiday": 2.0}'),
  ('working_time',    '{"days_per_month": 26, "hours_per_day": 8}')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psettings_read" ON payroll_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "psettings_hr_write" ON payroll_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

-- 8. Entry breakdown columns for seniority / unpaid leave ------------------
ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS total_seniority        numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_leave_days      numeric(5,1)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_leave_deduction numeric(12,2) NOT NULL DEFAULT 0;
