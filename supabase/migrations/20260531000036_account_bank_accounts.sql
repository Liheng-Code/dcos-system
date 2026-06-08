-- Account/Finance Phase 2: Bank Account Register

CREATE TABLE IF NOT EXISTS public.account_bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name       TEXT NOT NULL,
  account_name    TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.account_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "account_bank_auth" ON public.account_bank_accounts TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_account_bank_active ON public.account_bank_accounts(is_active);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_account_bank_audit') THEN
    CREATE TRIGGER trg_account_bank_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION public.trg_account_audit();
  END IF;
END $$;
