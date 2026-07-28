-- Fixed 2-step internal approval chain for IPCs (QS Manager review, then PM
-- endorsement) — mirrors qs_vo_approvals's shape and delete-then-insert
-- decision pattern exactly, but steps are NOT amount-scaled (always exactly
-- 2, unlike VO's 1/2/3-step scaling): the module's original design intent is
-- every claim gets both reviews regardless of size.

CREATE TABLE IF NOT EXISTS public.qs_claim_approvals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id       UUID NOT NULL REFERENCES public.qs_progress_claims(id) ON DELETE CASCADE,
  step           INTEGER NOT NULL,
  approver_role  TEXT NOT NULL,
  user_id        UUID REFERENCES auth.users(id),
  decision       TEXT NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending','approved','rejected')),
  comments       TEXT,
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (claim_id, step)
);

ALTER TABLE public.qs_claim_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qs_claim_appr_auth" ON public.qs_claim_approvals TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_qs_claim_approvals_claim ON public.qs_claim_approvals(claim_id);

ALTER TABLE public.qs_progress_claims
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Widen the status lifecycle: draft -> internal_review -> pm_endorsed ->
-- submitted -> client_reviewed -> certified -> paid, with 'rejected'
-- reachable (terminal, with a reset-to-draft escape hatch) from
-- internal_review or pm_endorsed.
ALTER TABLE public.qs_progress_claims
  DROP CONSTRAINT IF EXISTS qs_progress_claims_status_check;
ALTER TABLE public.qs_progress_claims
  ADD CONSTRAINT qs_progress_claims_status_check
  CHECK (status IN ('draft','internal_review','pm_endorsed','submitted','client_reviewed','certified','paid','rejected'));
