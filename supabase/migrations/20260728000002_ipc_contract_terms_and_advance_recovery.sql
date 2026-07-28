-- IPC Phase A: contract terms wiring + advance recovery tracking.
-- Fixes: the IPC create-claim form had no source of truth for contract sum /
-- retention (users retyped original_contract_sum on every claim, risking drift),
-- and advance payment recovery had no tracking mechanism at all (unlike
-- retention, which already has qs_retention_ledger).

ALTER TABLE public.contract_register
  ADD COLUMN IF NOT EXISTS payment_terms text;

CREATE TABLE IF NOT EXISTS public.qs_advance_recovery_ledger (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  claim_id    uuid references public.qs_progress_claims(id) on delete set null,
  amount      numeric(15,2) not null,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_qs_advance_recovery_project ON public.qs_advance_recovery_ledger(project_id);
CREATE INDEX IF NOT EXISTS idx_qs_advance_recovery_claim   ON public.qs_advance_recovery_ledger(claim_id);

ALTER TABLE public.qs_advance_recovery_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qs_advance_recovery_auth" ON public.qs_advance_recovery_ledger
  TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.qs_progress_claims
  ADD COLUMN IF NOT EXISTS advance_recovery_this_period numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_recovery_cumulative  numeric(15,2) NOT NULL DEFAULT 0;
