-- Account/Finance Phase 1: Payment Vouchers

CREATE TABLE IF NOT EXISTS public.account_payment_vouchers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_no      TEXT NOT NULL,
  voucher_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  type            TEXT NOT NULL DEFAULT 'payment'
    CHECK (type IN ('payment','receipt','transfer')),
  payee_type      TEXT NOT NULL DEFAULT 'supplier'
    CHECK (payee_type IN ('supplier','client','employee','other')),
  payee_id        UUID,
  payee_name      TEXT NOT NULL,
  amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  payment_method  TEXT DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer','cheque','cash','credit_card')),
  bank_account_id TEXT,
  reference       TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','paid','cancelled')),
  approved_by     UUID REFERENCES auth.users(id),
  approved_at     TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Junction: links payment vouchers to AP/AR invoices
CREATE TABLE IF NOT EXISTS public.account_pv_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id   UUID NOT NULL REFERENCES public.account_payment_vouchers(id) ON DELETE CASCADE,
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('ap','ar')),
  invoice_id   UUID NOT NULL,
  amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (voucher_id, invoice_type, invoice_id)
);

ALTER TABLE public.account_payment_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_pv_links         ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_pv_auth"    ON public.account_payment_vouchers TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "account_pv_link_auth" ON public.account_pv_links       TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_account_pv_status   ON public.account_payment_vouchers(status);
CREATE INDEX idx_account_pv_date     ON public.account_payment_vouchers(voucher_date);
CREATE INDEX idx_account_pv_links_v  ON public.account_pv_links(voucher_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_account_pv_audit') THEN
    CREATE TRIGGER trg_account_pv_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_payment_vouchers
    FOR EACH ROW EXECUTE FUNCTION public.trg_account_audit();
  END IF;
END $$;
