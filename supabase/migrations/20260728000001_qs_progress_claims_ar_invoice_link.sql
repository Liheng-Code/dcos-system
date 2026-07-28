-- QS <-> Account integration: link progress claims (IPC) to real AR invoices.
-- Fixes: certifying an IPC never created an account_ar_invoices row, and the
-- "paid" branch of updateClaimStatus() wrote account_pv_links.invoice_id as the
-- claim's own id (a dangling reference — that id never exists in
-- account_ar_invoices), presenting a fake AR link to Finance.

ALTER TABLE public.qs_progress_claims
  ADD COLUMN IF NOT EXISTS ar_invoice_id UUID REFERENCES public.account_ar_invoices(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qs_progress_claims_ar_invoice_id_key'
  ) THEN
    ALTER TABLE public.qs_progress_claims
      ADD CONSTRAINT qs_progress_claims_ar_invoice_id_key UNIQUE (ar_invoice_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qs_progress_claims_ar_invoice ON public.qs_progress_claims(ar_invoice_id);

-- account_ar_invoices.claim_id already existed but was never populated/enforced.
-- This fix is the first code path to populate it, so make it a real FK now
-- (safe: nullable, and no rows currently reference it) and index it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_ar_invoices_claim_id_fkey'
  ) THEN
    ALTER TABLE public.account_ar_invoices
      ADD CONSTRAINT account_ar_invoices_claim_id_fkey
      FOREIGN KEY (claim_id) REFERENCES public.qs_progress_claims(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_account_ar_claim ON public.account_ar_invoices(claim_id);
