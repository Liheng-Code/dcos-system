-- Account/Finance Phase 1: Accounts Receivable (client invoices)

CREATE TABLE IF NOT EXISTS public.account_ar_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES public.stakeholders(id) ON DELETE RESTRICT,
  invoice_no       TEXT NOT NULL,
  invoice_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE NOT NULL,
  amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_amount       NUMERIC(15,2) GENERATED ALWAYS AS (amount + tax_amount) STORED,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected','paid')),
  claim_id         UUID,
  approved_by      UUID REFERENCES auth.users(id),
  approved_at      TIMESTAMPTZ,
  payment_voucher_id UUID,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_ar_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_ar_auth" ON public.account_ar_invoices TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_account_ar_project   ON public.account_ar_invoices(project_id);
CREATE INDEX idx_account_ar_client    ON public.account_ar_invoices(client_id);
CREATE INDEX idx_account_ar_status    ON public.account_ar_invoices(status);
CREATE INDEX idx_account_ar_due_date  ON public.account_ar_invoices(due_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_account_ar_audit') THEN
    CREATE TRIGGER trg_account_ar_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_ar_invoices
    FOR EACH ROW EXECUTE FUNCTION public.trg_account_audit();
  END IF;
END $$;
