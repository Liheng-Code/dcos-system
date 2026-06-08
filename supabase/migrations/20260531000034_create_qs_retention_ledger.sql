-- QS Module Phase 2: Retention Ledger

CREATE TABLE IF NOT EXISTS public.qs_retention_ledger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  claim_id         UUID REFERENCES public.qs_progress_claims(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deduction','release')),
  amount           NUMERIC(15,2) NOT NULL,
  release_trigger  TEXT CHECK (release_trigger IN ('practical_completion','dlp_completion','other')),
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.qs_retention_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qs_retention_auth" ON public.qs_retention_ledger TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_qs_retention_project ON public.qs_retention_ledger(project_id);
CREATE INDEX idx_qs_retention_claim   ON public.qs_retention_ledger(claim_id);
