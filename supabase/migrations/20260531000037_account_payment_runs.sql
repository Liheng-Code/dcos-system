-- Account/Finance Phase 2: Payment Runs (batch payment processing)

CREATE TABLE IF NOT EXISTS public.account_payment_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_no          TEXT NOT NULL,
  run_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT,
  total_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  voucher_count   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','completed','cancelled')),
  approved_by     UUID REFERENCES auth.users(id),
  approved_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Junction: links payment runs to payment vouchers
CREATE TABLE IF NOT EXISTS public.account_payment_run_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES public.account_payment_runs(id) ON DELETE CASCADE,
  voucher_id   UUID NOT NULL REFERENCES public.account_payment_vouchers(id) ON DELETE RESTRICT,
  amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, voucher_id)
);

ALTER TABLE public.account_payment_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_payment_run_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_pr_auth"      ON public.account_payment_runs     TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "account_pri_auth"     ON public.account_payment_run_items TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_account_pr_date   ON public.account_payment_runs(run_date);
CREATE INDEX idx_account_pr_status ON public.account_payment_runs(status);
CREATE INDEX idx_account_pri_run   ON public.account_payment_run_items(run_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_account_pr_audit') THEN
    CREATE TRIGGER trg_account_pr_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_payment_runs
    FOR EACH ROW EXECUTE FUNCTION public.trg_account_audit();
  END IF;
END $$;
