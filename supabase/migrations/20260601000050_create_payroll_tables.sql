-- ============================================================
-- Payroll Module: 6 tables
-- ============================================================

-- 1. Component type lookup -----------------------------------------------
CREATE TABLE payroll_component_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  name        text NOT NULL,
  category    text NOT NULL CHECK (category IN ('earning', 'deduction', 'employer_contribution')),
  is_taxable  boolean NOT NULL DEFAULT false,
  is_system   boolean NOT NULL DEFAULT false,  -- system-managed (OT auto-calc, PIT auto-calc)
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO payroll_component_types (code, name, category, is_taxable, is_system, sort_order) VALUES
  ('BASIC',              'Basic Salary',            'earning',                true,  false, 10),
  ('HOUSING_ALLOWANCE',  'Housing Allowance',       'earning',                false, false, 20),
  ('TRANSPORT_ALLOWANCE','Transport Allowance',     'earning',                false, false, 30),
  ('MEAL_ALLOWANCE',     'Meal Allowance',          'earning',                false, false, 40),
  ('OT_150',             'Overtime (1.5×)',         'earning',                true,  true,  50),
  ('OT_200',             'Overtime (2.0×)',         'earning',                true,  true,  60),
  ('OT_HOLIDAY',         'Holiday OT',             'earning',                true,  true,  70),
  ('NSSF_EE',            'NSSF (Employee)',         'deduction',              false, true,  80),
  ('PIT',                'Income Tax (PIT)',        'deduction',              false, true,  90),
  ('LOAN_DEDUCTION',     'Loan Repayment',          'deduction',              false, false, 100),
  ('OTHER_DEDUCTION',    'Other Deduction',         'deduction',              false, false, 110),
  ('NSSF_ER',            'NSSF (Employer Share)',   'employer_contribution',  false, true,  120);

-- 2. Per-employee salary structure with effective dating ------------------
CREATE TABLE employee_salary_structures (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  component_type_id   uuid NOT NULL REFERENCES payroll_component_types(id),
  amount              numeric(12,2) NOT NULL DEFAULT 0,
  effective_from      date NOT NULL,
  effective_to        date,        -- NULL = currently active
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ess_employee ON employee_salary_structures(employee_id);
CREATE INDEX idx_ess_active   ON employee_salary_structures(employee_id, effective_to) WHERE effective_to IS NULL;

-- 3. Bank accounts for salary disbursement --------------------------------
CREATE TABLE employee_bank_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name      text NOT NULL,
  account_number text NOT NULL,
  account_name   text NOT NULL,
  branch         text,
  is_primary     boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eba_employee ON employee_bank_accounts(employee_id);

-- 4. Payroll periods (one row per calendar month) -------------------------
CREATE TABLE payroll_periods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year  int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  label        text,             -- e.g. "June 2026"
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  cutoff_date  date,
  status       text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','processing','approved','paid','closed')),
  created_by   uuid REFERENCES profiles(id),
  approved_by  uuid REFERENCES profiles(id),
  approved_at  timestamptz,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_year, period_month)
);

-- 5. Payroll entries — one row per employee per period --------------------
CREATE TABLE payroll_entries (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id             uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES profiles(id),
  gross_salary          numeric(12,2) NOT NULL DEFAULT 0,
  total_deductions      numeric(12,2) NOT NULL DEFAULT 0,
  employer_contributions numeric(12,2) NOT NULL DEFAULT 0,
  net_salary            numeric(12,2) NOT NULL DEFAULT 0,
  working_days          int NOT NULL DEFAULT 0,
  present_days          int NOT NULL DEFAULT 0,
  leave_days            int NOT NULL DEFAULT 0,
  ot_hours              numeric(6,2) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','reviewed','approved','paid')),
  calculated_at         timestamptz,
  calculated_by         uuid REFERENCES profiles(id),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_id, employee_id)
);

CREATE INDEX idx_pe_period   ON payroll_entries(period_id);
CREATE INDEX idx_pe_employee ON payroll_entries(employee_id);

-- 6. Payroll entry lines — individual component amounts -------------------
CREATE TABLE payroll_entry_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id            uuid NOT NULL REFERENCES payroll_entries(id) ON DELETE CASCADE,
  component_type_id   uuid NOT NULL REFERENCES payroll_component_types(id),
  amount              numeric(12,2) NOT NULL DEFAULT 0,
  note                text,         -- e.g. "8.5 OT hrs × $3.50"
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pel_entry ON payroll_entry_lines(entry_id);

-- ============================================================
-- Row-level security: HR admins can manage; employees see own
-- ============================================================
ALTER TABLE payroll_component_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_structures  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_bank_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entry_lines         ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read component types (public lookup)
CREATE POLICY "component_types_read" ON payroll_component_types
  FOR SELECT TO authenticated USING (true);

-- Salary structures: employee sees own; HR admin sees all
CREATE POLICY "salary_structure_own_read" ON employee_salary_structures
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "salary_structure_hr_write" ON employee_salary_structures
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

-- Bank accounts: employee manages own; HR admin reads all
CREATE POLICY "bank_account_own" ON employee_bank_accounts
  FOR ALL TO authenticated
  USING (employee_id = auth.uid() OR
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (employee_id = auth.uid() OR
              EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

-- Payroll periods: HR admin full access; others read only
CREATE POLICY "periods_hr_full" ON payroll_periods
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

-- Payroll entries: employee reads own; HR admin full access
CREATE POLICY "entries_own_read" ON payroll_entries
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "entries_hr_write" ON payroll_entries
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

-- Entry lines inherit entry access
CREATE POLICY "entry_lines_own_read" ON payroll_entry_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM payroll_entries pe
    WHERE pe.id = entry_id
    AND (pe.employee_id = auth.uid() OR
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  ));

CREATE POLICY "entry_lines_hr_write" ON payroll_entry_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));
