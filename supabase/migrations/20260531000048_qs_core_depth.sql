-- QS Core Depth: BOQ lifecycle, commercial summaries, IPC certification, retention release controls

ALTER TABLE public.qs_boq_sections
  ADD COLUMN IF NOT EXISTS baseline_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

ALTER TABLE public.qs_boq_items
  ADD COLUMN IF NOT EXISTS baseline_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_reason TEXT,
  ADD COLUMN IF NOT EXISTS effective_date DATE;

ALTER TABLE public.qs_budget_revisions
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS effective_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qs_boq_sections_baseline_status_check'
  ) THEN
    ALTER TABLE public.qs_boq_sections
      ADD CONSTRAINT qs_boq_sections_baseline_status_check
      CHECK (baseline_status IN ('draft','approved','locked','revised'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qs_boq_items_baseline_status_check'
  ) THEN
    ALTER TABLE public.qs_boq_items
      ADD CONSTRAINT qs_boq_items_baseline_status_check
      CHECK (baseline_status IN ('draft','approved','locked','revised'));
  END IF;
END $$;

ALTER TABLE public.qs_claim_items
  ADD COLUMN IF NOT EXISTS client_adjustment NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS certified_this_period NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS certified_materials_stored NUMERIC(15,2);

ALTER TABLE public.qs_progress_claims
  ADD COLUMN IF NOT EXISTS client_reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS client_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_adjustment_total NUMERIC(15,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE public.qs_progress_claims
    DROP CONSTRAINT IF EXISTS qs_progress_claims_status_check;
  ALTER TABLE public.qs_progress_claims
    ADD CONSTRAINT qs_progress_claims_status_check
    CHECK (status IN ('draft','submitted','client_reviewed','certified','paid'));
END $$;

ALTER TABLE public.qs_retention_ledger
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS expected_release_date DATE,
  ADD COLUMN IF NOT EXISTS actual_release_date DATE,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qs_retention_approval_status_check'
  ) THEN
    ALTER TABLE public.qs_retention_ledger
      ADD CONSTRAINT qs_retention_approval_status_check
      CHECK (approval_status IN ('pending','approved','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qs_boq_sections_status ON public.qs_boq_sections(project_id, baseline_status);
CREATE INDEX IF NOT EXISTS idx_qs_boq_items_status ON public.qs_boq_items(project_id, baseline_status);
CREATE INDEX IF NOT EXISTS idx_qs_cost_tx_wbs_node ON public.qs_cost_transactions(wbs_node_id);
