-- Account/Finance Phase 2: Journal Entries & General Ledger

CREATE TABLE IF NOT EXISTS public.account_journal_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no        TEXT NOT NULL,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  period_id       UUID REFERENCES public.account_financial_periods(id) ON DELETE SET NULL,
  description     TEXT,
  source          TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','ap_invoice','ar_invoice','payment','revaluation','closing','other')),
  source_id       TEXT,
  is_approved     BOOLEAN NOT NULL DEFAULT false,
  approved_by     UUID REFERENCES auth.users(id),
  approved_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_journal_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        UUID NOT NULL REFERENCES public.account_journal_entries(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES public.account_coa(id) ON DELETE RESTRICT,
  debit_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  description     TEXT,
  project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_journal_lines  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_je_auth"   ON public.account_journal_entries TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "account_jl_auth"   ON public.account_journal_lines  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_account_je_date     ON public.account_journal_entries(entry_date);
CREATE INDEX idx_account_je_period   ON public.account_journal_entries(period_id);
CREATE INDEX idx_account_je_source   ON public.account_journal_entries(source);
CREATE INDEX idx_account_jl_entry    ON public.account_journal_lines(entry_id);
CREATE INDEX idx_account_jl_account  ON public.account_journal_lines(account_id);
CREATE INDEX idx_account_jl_project  ON public.account_journal_lines(project_id);

-- Constraint: each line must have either debit OR credit, not both or neither
ALTER TABLE public.account_journal_lines ADD CONSTRAINT chk_jl_amount CHECK (
  (debit_amount > 0 AND credit_amount = 0) OR
  (credit_amount > 0 AND debit_amount = 0)
);

-- View: GL Ledger with running balance per account
CREATE OR REPLACE VIEW public.account_gl_ledger AS
SELECT
  jl.id AS line_id,
  jl.entry_id,
  je.entry_no,
  je.entry_date,
  je.description AS entry_description,
  je.source,
  jl.account_id,
  ac.code AS account_code,
  ac.name AS account_name,
  ac.type AS account_type,
  ac.normal_balance,
  jl.debit_amount,
  jl.credit_amount,
  CASE
    WHEN ac.normal_balance = 'debit' THEN jl.debit_amount - jl.credit_amount
    ELSE jl.credit_amount - jl.debit_amount
  END AS net_amount,
  jl.project_id,
  jl.wbs_node_id,
  jl.description AS line_description,
  jl.created_at
FROM public.account_journal_lines jl
JOIN public.account_journal_entries je ON je.id = jl.entry_id
JOIN public.account_coa ac ON ac.id = jl.account_id;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_account_je_audit') THEN
    CREATE TRIGGER trg_account_je_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.trg_account_audit();
  END IF;
END $$;
