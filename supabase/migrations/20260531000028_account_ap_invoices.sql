-- Account/Finance Phase 1: Accounts Payable (supplier invoices)

CREATE TABLE IF NOT EXISTS public.account_ap_invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  supplier_id      UUID NOT NULL REFERENCES public.procurement_suppliers(id) ON DELETE RESTRICT,
  invoice_no       TEXT NOT NULL,
  invoice_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE NOT NULL,
  amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  withholding_tax_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  net_amount       NUMERIC(15,2) GENERATED ALWAYS AS (amount + tax_amount) STORED,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected','paid')),
  po_id            UUID REFERENCES public.procurement_pos(id) ON DELETE SET NULL,
  gr_id            UUID REFERENCES public.procurement_goods_receipts(id) ON DELETE SET NULL,
  approved_by      UUID REFERENCES auth.users(id),
  approved_at      TIMESTAMPTZ,
  payment_voucher_id UUID,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_ap_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_ap_auth" ON public.account_ap_invoices TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_account_ap_project   ON public.account_ap_invoices(project_id);
CREATE INDEX idx_account_ap_supplier  ON public.account_ap_invoices(supplier_id);
CREATE INDEX idx_account_ap_status    ON public.account_ap_invoices(status);
CREATE INDEX idx_account_ap_due_date  ON public.account_ap_invoices(due_date);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_account_ap_audit') THEN
    CREATE TRIGGER trg_account_ap_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_ap_invoices
    FOR EACH ROW EXECUTE FUNCTION public.trg_account_audit();
  END IF;
END $$;
