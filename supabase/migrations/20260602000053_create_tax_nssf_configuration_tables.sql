-- ============================================================
-- Tax on Salary (TOS) and NSSF Configuration Tables (R2.2-A)
-- Cambodia-specific tax rules, effective-dated for audit trail
-- ============================================================

-- 1. Cambodia TOS Brackets ----------------------------------------
-- KHR-based progressive brackets. from_khr is inclusive, to_khr is exclusive.
-- NULL to_khr means "unlimited" (top bracket).
CREATE TABLE tos_brackets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_khr       numeric(14,0) NOT NULL,
  to_khr         numeric(14,0),          -- NULL = unlimited (last bracket)
  rate_percent   numeric(5,2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  effective_date date NOT NULL,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by     uuid REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tos_brackets_effective ON tos_brackets(effective_date, status);

-- Seed current Cambodia TOS brackets (effective 01-Jan-2026)
INSERT INTO tos_brackets (from_khr, to_khr, rate_percent, effective_date, status) VALUES
  (0,          1500000,  0.00, '2026-01-01', 'active'),
  (1500001,    2000000,  5.00, '2026-01-01', 'active'),
  (2000001,    8500000, 10.00, '2026-01-01', 'active'),
  (8500001,   12500000, 15.00, '2026-01-01', 'active'),
  (12500001,  NULL,     20.00, '2026-01-01', 'active');

-- 2. TOS Dependent Relief ----------------------------------------
CREATE TABLE tos_dependent_relief (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relief_type    text NOT NULL CHECK (relief_type IN ('spouse', 'child')),
  amount_khr     numeric(12,0) NOT NULL,
  effective_date date NOT NULL,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by     uuid REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Seed current Cambodia dependent relief amounts
INSERT INTO tos_dependent_relief (relief_type, amount_khr, effective_date, status) VALUES
  ('spouse', 150000, '2026-01-01', 'active'),
  ('child',  150000, '2026-01-01', 'active');

-- 3. Non-Resident and Fringe Benefit Tax Rates --------------------
CREATE TABLE tos_flat_rates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type      text NOT NULL CHECK (rate_type IN ('non_resident', 'fringe_benefit')),
  rate_percent   numeric(5,2) NOT NULL,
  effective_date date NOT NULL,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by     uuid REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tos_flat_rates (rate_type, rate_percent, effective_date, status) VALUES
  ('non_resident',   20.00, '2026-01-01', 'active'),
  ('fringe_benefit', 20.00, '2026-01-01', 'active');

-- 4. Monthly Exchange Rates (USD ↔ KHR) --------------------------
CREATE TABLE tos_exchange_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year     int NOT NULL,
  period_month    int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  rate_khr_per_usd numeric(10,2) NOT NULL DEFAULT 4000,
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')),
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_year, period_month)
);

-- 5. NSSF Rules ---------------------------------------------------
-- Contribution rates per type and contributor, effective-dated.
CREATE TABLE nssf_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_type   text NOT NULL CHECK (contribution_type IN ('pension', 'healthcare', 'occupational_risk')),
  contributor         text NOT NULL CHECK (contributor IN ('employee', 'employer')),
  rate_percent        numeric(5,2) NOT NULL CHECK (rate_percent >= 0),
  min_wage_base       numeric(12,2),   -- NULL = no minimum
  max_wage_base       numeric(12,2),   -- NULL = no cap
  apply_cap           boolean NOT NULL DEFAULT false,
  effective_date      date NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nssf_rules_effective ON nssf_rules(contribution_type, contributor, effective_date, status);

-- Seed current Cambodia NSSF rates (effective 01-Jan-2026)
INSERT INTO nssf_rules (contribution_type, contributor, rate_percent, max_wage_base, apply_cap, effective_date, status) VALUES
  ('pension',           'employee', 2.00,  450.00, true,  '2026-01-01', 'active'),
  ('pension',           'employer', 2.00,  450.00, true,  '2026-01-01', 'active'),
  ('healthcare',        'employer', 0.00,  NULL,   false, '2026-01-01', 'active'),
  ('occupational_risk', 'employer', 0.80,  NULL,   false, '2026-01-01', 'active');

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE tos_brackets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tos_dependent_relief ENABLE ROW LEVEL SECURITY;
ALTER TABLE tos_flat_rates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tos_exchange_rates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE nssf_rules           ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read config (needed for payroll calculation)
CREATE POLICY "tos_brackets_read" ON tos_brackets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tos_brackets_hr_write" ON tos_brackets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "tos_relief_read" ON tos_dependent_relief
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tos_relief_hr_write" ON tos_dependent_relief
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "tos_flat_rates_read" ON tos_flat_rates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tos_flat_rates_hr_write" ON tos_flat_rates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "tos_exchange_rates_read" ON tos_exchange_rates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tos_exchange_rates_hr_write" ON tos_exchange_rates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));

CREATE POLICY "nssf_rules_read" ON nssf_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "nssf_rules_hr_write" ON nssf_rules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND level IN ('HR_Manager','HR_Admin','Super_Admin','Admin')));
