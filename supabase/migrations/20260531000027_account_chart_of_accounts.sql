-- Account/Finance Phase 1: Chart of Accounts

CREATE TABLE IF NOT EXISTS public.account_coa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  parent_id       UUID REFERENCES public.account_coa(id) ON DELETE SET NULL,
  normal_balance  TEXT NOT NULL DEFAULT 'debit' CHECK (normal_balance IN ('debit','credit')),
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_coa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_coa_auth" ON public.account_coa TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_account_coa_code      ON public.account_coa(code);
CREATE INDEX idx_account_coa_type      ON public.account_coa(type);
CREATE INDEX idx_account_coa_parent    ON public.account_coa(parent_id);
CREATE INDEX idx_account_coa_sort      ON public.account_coa(sort_order);

-- Seed: standard construction COA groups
INSERT INTO public.account_coa (code, name, type, normal_balance, sort_order) VALUES
  ('1',     'Current Assets',          'asset',     'debit',  10),
  ('1.1',   'Cash & Bank',             'asset',     'debit',  20),
  ('1.2',   'Accounts Receivable',      'asset',     'debit',  30),
  ('1.3',   'Work in Progress',         'asset',     'debit',  40),
  ('1.4',   'Inventory & Materials',    'asset',     'debit',  50),
  ('1.5',   'Prepayments & Deposits',   'asset',     'debit',  60),
  ('2',     'Non-Current Assets',       'asset',     'debit',  70),
  ('2.1',   'Fixed Assets',             'asset',     'debit',  80),
  ('2.2',   'Accumulated Depreciation', 'asset',     'credit', 90),
  ('3',     'Current Liabilities',      'liability', 'credit', 100),
  ('3.1',   'Accounts Payable',         'liability', 'credit', 110),
  ('3.2',   'Accrued Expenses',         'liability', 'credit', 120),
  ('3.3',   'Retention Payable',        'liability', 'credit', 130),
  ('3.4',   'Withholding Tax Payable',  'liability', 'credit', 140),
  ('4',     'Non-Current Liabilities',  'liability', 'credit', 150),
  ('4.1',   'Long-Term Loans',          'liability', 'credit', 160),
  ('5',     'Equity',                   'equity',    'credit', 170),
  ('5.1',   'Retained Earnings',        'equity',    'credit', 180),
  ('5.2',   'Current Year P&L',         'equity',    'credit', 190),
  ('6',     'Revenue',                  'income',    'credit', 200),
  ('6.1',   'Contract Revenue',         'income',    'credit', 210),
  ('6.2',   'Variation Revenue',        'income',    'credit', 220),
  ('7',     'Direct Costs',             'expense',   'debit',  230),
  ('7.1',   'Materials',                'expense',   'debit',  240),
  ('7.2',   'Labour',                   'expense',   'debit',  250),
  ('7.3',   'Subcontractor',            'expense',   'debit',  260),
  ('7.4',   'Equipment',                'expense',   'debit',  270),
  ('8',     'Indirect Costs',           'expense',   'debit',  280),
  ('8.1',   'Project Overhead',         'expense',   'debit',  290),
  ('8.2',   'Site Administration',      'expense',   'debit',  300),
  ('9',     'Overhead & Admin',         'expense',   'debit',  310),
  ('9.1',   'Office Expenses',          'expense',   'debit',  320),
  ('9.2',   'Staff Salaries',           'expense',   'debit',  330),
  ('9.3',   'Depreciation',             'expense',   'debit',  340)
ON CONFLICT DO NOTHING;

-- Audit trigger
CREATE OR REPLACE FUNCTION public.trg_account_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.procurement_audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, row_to_json(OLD), row_to_json(NEW), auth.uid());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_account_coa_audit') THEN
    CREATE TRIGGER trg_account_coa_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_coa
    FOR EACH ROW EXECUTE FUNCTION public.trg_account_audit();
  END IF;
END $$;
