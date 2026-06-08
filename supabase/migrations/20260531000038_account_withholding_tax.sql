-- Account/Finance Phase 2: Withholding Tax Register

CREATE TABLE IF NOT EXISTS public.account_withholding_tax (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ap_invoice_id    UUID REFERENCES public.account_ap_invoices(id) ON DELETE SET NULL,
  supplier_id      UUID REFERENCES public.procurement_suppliers(id) ON DELETE SET NULL,
  tax_cert_no      TEXT,
  invoice_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_rate_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','remitted','cancelled')),
  remitted_at      TIMESTAMPTZ,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_withholding_tax ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_wht_auth" ON public.account_withholding_tax TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_account_wht_project  ON public.account_withholding_tax(project_id);
CREATE INDEX idx_account_wht_status   ON public.account_withholding_tax(status);
CREATE INDEX idx_account_wht_date     ON public.account_withholding_tax(tax_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_account_wht_audit') THEN
    CREATE TRIGGER trg_account_wht_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_withholding_tax
    FOR EACH ROW EXECUTE FUNCTION public.trg_account_audit();
  END IF;
END $$;
