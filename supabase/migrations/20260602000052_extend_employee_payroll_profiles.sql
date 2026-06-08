-- ============================================================
-- Employee Payroll Extension Tables (R2.1-A)
-- Adds tax profile, NSSF profile, and payroll profile tables
-- per DCOS_HR_Payroll_UI_Screen_Design_R2 sections 4.6–4.8
-- ============================================================

-- 1. Employee Payroll Profile ----------------------------------------
CREATE TABLE employee_payroll_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payroll_type        text NOT NULL DEFAULT 'monthly' CHECK (payroll_type IN ('monthly')),
  currency            text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'KHR')),
  payroll_group       text NOT NULL DEFAULT 'staff' CHECK (payroll_group IN ('staff', 'site_staff', 'management')),
  ot_eligible         boolean NOT NULL DEFAULT true,
  tax_applicable      boolean NOT NULL DEFAULT true,
  nssf_applicable     boolean NOT NULL DEFAULT true,
  effective_date      date NOT NULL DEFAULT CURRENT_DATE,
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_epp_employee ON employee_payroll_profiles(employee_id);

-- 2. Employee Tax Profile -------------------------------------------
CREATE TABLE employee_tax_profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tax_residency       text NOT NULL DEFAULT 'resident' CHECK (tax_residency IN ('resident', 'non_resident')),
  marital_status      text NOT NULL DEFAULT 'single' CHECK (marital_status IN ('single', 'married')),
  spouse_dependent    boolean NOT NULL DEFAULT false,
  num_children        int NOT NULL DEFAULT 0 CHECK (num_children >= 0),
  tax_id              text,
  effective_date      date NOT NULL DEFAULT CURRENT_DATE,
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_etp_employee ON employee_tax_profiles(employee_id);

-- 3. Employee NSSF Profile ------------------------------------------
CREATE TABLE employee_nssf_profiles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                 uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nssf_applicable             boolean NOT NULL DEFAULT true,
  nssf_number                 text,
  pension_applicable          boolean NOT NULL DEFAULT true,
  healthcare_applicable       boolean NOT NULL DEFAULT true,
  occupational_risk_applicable boolean NOT NULL DEFAULT true,
  effective_date              date NOT NULL DEFAULT CURRENT_DATE,
  created_by                  uuid REFERENCES profiles(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enp_employee ON employee_nssf_profiles(employee_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE employee_payroll_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_tax_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_nssf_profiles      ENABLE ROW LEVEL SECURITY;

-- Helper: reuse the HR admin check pattern from existing payroll tables
-- employee sees own row; HR admin sees all

CREATE POLICY "epp_own_read" ON employee_payroll_profiles
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "epp_hr_write" ON employee_payroll_profiles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                      AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "etp_own_read" ON employee_tax_profiles
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "etp_hr_write" ON employee_tax_profiles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                      AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "enp_own_read" ON employee_nssf_profiles
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "enp_hr_write" ON employee_nssf_profiles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                      AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));
