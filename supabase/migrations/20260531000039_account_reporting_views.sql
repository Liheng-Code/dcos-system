-- Account/Finance Phase 3: Reporting Views & Cash Flow Table

-- 1. TRIAL BALANCE
CREATE OR REPLACE VIEW public.account_trial_balance AS
SELECT
  ac.id AS account_id,
  ac.code,
  ac.name,
  ac.type,
  ac.normal_balance,
  ac.parent_id,
  ac.sort_order,
  COALESCE(SUM(jl.debit_amount), 0) AS total_debit,
  COALESCE(SUM(jl.credit_amount), 0) AS total_credit,
  CASE
    WHEN ac.normal_balance = 'debit' THEN COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)
    ELSE COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0)
  END AS balance
FROM public.account_coa ac
LEFT JOIN public.account_journal_lines jl ON jl.account_id = ac.id
GROUP BY ac.id, ac.code, ac.name, ac.type, ac.normal_balance, ac.parent_id, ac.sort_order;

-- 2. PROFIT & LOSS STATEMENT
CREATE OR REPLACE VIEW public.account_profit_loss AS
SELECT
  'income' AS section,
  ac.id AS account_id,
  ac.code,
  ac.name,
  ac.sort_order,
  CASE WHEN ac.normal_balance = 'credit' THEN COALESCE(SUM(jl.credit_amount), 0) ELSE COALESCE(SUM(jl.debit_amount), 0) END AS amount
FROM public.account_coa ac
LEFT JOIN public.account_journal_lines jl ON jl.account_id = ac.id
WHERE ac.type IN ('income', 'revenue')
GROUP BY ac.id, ac.code, ac.name, ac.type, ac.normal_balance, ac.sort_order
UNION ALL
SELECT
  'expense' AS section,
  ac.id AS account_id,
  ac.code,
  ac.name,
  ac.sort_order,
  CASE WHEN ac.normal_balance = 'debit' THEN COALESCE(SUM(jl.debit_amount), 0) ELSE COALESCE(SUM(jl.credit_amount), 0) END AS amount
FROM public.account_coa ac
LEFT JOIN public.account_journal_lines jl ON jl.account_id = ac.id
WHERE ac.type IN ('expense', 'cost_of_goods_sold')
GROUP BY ac.id, ac.code, ac.name, ac.type, ac.normal_balance, ac.sort_order;

-- 3. BALANCE SHEET
CREATE OR REPLACE VIEW public.account_balance_sheet AS
SELECT
  ac.type AS section,
  ac.id AS account_id,
  ac.code,
  ac.name,
  ac.normal_balance,
  ac.parent_id,
  ac.sort_order,
  CASE
    WHEN ac.normal_balance = 'debit' THEN COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)
    ELSE COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0)
  END AS balance
FROM public.account_coa ac
LEFT JOIN public.account_journal_lines jl ON jl.account_id = ac.id
WHERE ac.type IN ('asset', 'liability', 'equity')
GROUP BY ac.id, ac.code, ac.name, ac.type, ac.normal_balance, ac.parent_id, ac.sort_order;

-- 4. AP AGING
CREATE OR REPLACE VIEW public.account_ap_aging AS
SELECT
  api.id AS invoice_id,
  api.invoice_no,
  api.invoice_date,
  api.due_date,
  api.net_amount,
  api.supplier_id,
  ps.supplier_name,
  api.status,
  api.payment_voucher_id,
  CASE WHEN api.payment_voucher_id IS NOT NULL THEN 'paid' ELSE api.status END AS payment_status,
  CURRENT_DATE - api.due_date AS days_overdue,
  CASE
    WHEN api.payment_voucher_id IS NOT NULL THEN 'current'
    WHEN CURRENT_DATE <= api.due_date THEN 'current'
    WHEN CURRENT_DATE - api.due_date BETWEEN 1 AND 30 THEN '1-30'
    WHEN CURRENT_DATE - api.due_date BETWEEN 31 AND 60 THEN '31-60'
    WHEN CURRENT_DATE - api.due_date BETWEEN 61 AND 90 THEN '61-90'
    ELSE '90+'
  END AS aging_bucket
FROM public.account_ap_invoices api
LEFT JOIN public.procurement_suppliers ps ON ps.id = api.supplier_id;

-- 5. AR AGING
CREATE OR REPLACE VIEW public.account_ar_aging AS
SELECT
  ari.id AS invoice_id,
  ari.invoice_no,
  ari.invoice_date,
  ari.due_date,
  ari.net_amount,
  ari.client_id,
  s.organization_name AS client_name,
  ari.status,
  ari.payment_voucher_id,
  CASE WHEN ari.payment_voucher_id IS NOT NULL THEN 'paid' ELSE ari.status END AS payment_status,
  CURRENT_DATE - ari.due_date AS days_overdue,
  CASE
    WHEN ari.payment_voucher_id IS NOT NULL THEN 'current'
    WHEN CURRENT_DATE <= ari.due_date THEN 'current'
    WHEN CURRENT_DATE - ari.due_date BETWEEN 1 AND 30 THEN '1-30'
    WHEN CURRENT_DATE - ari.due_date BETWEEN 31 AND 60 THEN '31-60'
    WHEN CURRENT_DATE - ari.due_date BETWEEN 61 AND 90 THEN '61-90'
    ELSE '90+'
  END AS aging_bucket
FROM public.account_ar_invoices ari
LEFT JOIN public.stakeholders s ON s.id = ari.client_id;

-- 6. BUDGET VS ACTUAL (aggregated per project from BOQ item revisions vs GL actuals)
CREATE OR REPLACE VIEW public.account_budget_vs_actual AS
SELECT
  p.id AS project_id,
  p.project_name,
  COALESCE(br_total.budget_total, 0) AS total_budget,
  COALESCE(gl_actual.actual_total, 0) AS total_actual,
  COALESCE(br_total.budget_total, 0) - COALESCE(gl_actual.actual_total, 0) AS variance,
  CASE WHEN COALESCE(br_total.budget_total, 0) > 0
    THEN (COALESCE(gl_actual.actual_total, 0) / br_total.budget_total * 100)
    ELSE 0
  END AS pct_used
FROM public.projects p
LEFT JOIN (
  SELECT project_id, SUM(new_total) AS budget_total
  FROM public.qs_budget_revisions GROUP BY project_id
) br_total ON br_total.project_id = p.id
LEFT JOIN (
  SELECT project_id, SUM(CASE WHEN normal_balance = 'debit' THEN debit_amount ELSE credit_amount END) AS actual_total
  FROM public.account_journal_lines jl
  JOIN public.account_coa ac ON ac.id = jl.account_id
  WHERE ac.type IN ('expense', 'cost_of_goods_sold')
  GROUP BY project_id
) gl_actual ON gl_actual.project_id = p.id;

-- 7. CASH FLOW FORECAST TABLE
CREATE TABLE IF NOT EXISTS public.account_cash_forecast (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  forecast_date   DATE NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('inflow_ar','inflow_other','outflow_ap','outflow_payroll','outflow_other')),
  description     TEXT,
  amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  probability_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
  expected_amount NUMERIC(15,2) GENERATED ALWAYS AS (amount * probability_pct / 100) STORED,
  reference_type  TEXT,
  reference_id    TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_cash_forecast ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_cf_auth" ON public.account_cash_forecast TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_account_cf_date     ON public.account_cash_forecast(forecast_date);
CREATE INDEX idx_account_cf_category ON public.account_cash_forecast(category);
CREATE INDEX idx_account_cf_project  ON public.account_cash_forecast(project_id);

-- Cash flow forecast summary view
CREATE OR REPLACE VIEW public.account_cash_flow_summary AS
SELECT
  forecast_date,
  SUM(CASE WHEN category LIKE 'inflow_%' THEN expected_amount ELSE 0 END) AS total_inflow,
  SUM(CASE WHEN category LIKE 'outflow_%' THEN expected_amount ELSE 0 END) AS total_outflow,
  SUM(CASE WHEN category LIKE 'inflow_%' THEN expected_amount ELSE -expected_amount END) AS net_flow
FROM public.account_cash_forecast
GROUP BY forecast_date
ORDER BY forecast_date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_account_cf_audit') THEN
    CREATE TRIGGER trg_account_cf_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_cash_forecast
    FOR EACH ROW EXECUTE FUNCTION public.trg_account_audit();
  END IF;
END $$;
