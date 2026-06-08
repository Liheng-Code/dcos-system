-- QS Module Phase 2: Progress Claims / IPC (Interim Payment Certificates)

CREATE TABLE IF NOT EXISTS public.qs_progress_claims (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  claim_number            INTEGER NOT NULL,
  period_start            DATE NOT NULL,
  period_end              DATE NOT NULL,
  -- Contract value
  original_contract_sum   NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_vo_amount           NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Amounts (stored, computed by app from claim items)
  total_completed_stored  NUMERIC(15,2) NOT NULL DEFAULT 0,
  retention_pct           NUMERIC(5,2)  NOT NULL DEFAULT 5,
  retention_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  prev_certificates_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_payment_due     NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Status
  status                  TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','certified','paid')),
  submitted_by            UUID REFERENCES auth.users(id),
  submitted_at            TIMESTAMPTZ,
  certified_by            UUID REFERENCES auth.users(id),
  certified_at            TIMESTAMPTZ,
  certified_amount        NUMERIC(15,2),
  paid_at                 TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, claim_number)
);

CREATE TABLE IF NOT EXISTS public.qs_claim_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id         UUID NOT NULL REFERENCES public.qs_progress_claims(id) ON DELETE CASCADE,
  boq_section_id   UUID REFERENCES public.qs_boq_sections(id) ON DELETE SET NULL,
  boq_item_id      UUID REFERENCES public.qs_boq_items(id) ON DELETE SET NULL,
  description      TEXT NOT NULL,
  unit             TEXT NOT NULL DEFAULT '',
  scheduled_value  NUMERIC(15,2) NOT NULL DEFAULT 0,
  prev_completed   NUMERIC(15,2) NOT NULL DEFAULT 0,
  this_period      NUMERIC(15,2) NOT NULL DEFAULT 0,
  materials_stored NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_to_date    NUMERIC(15,2) GENERATED ALWAYS AS (prev_completed + this_period + materials_stored) STORED,
  pct_complete     NUMERIC(6,2)  GENERATED ALWAYS AS (
    CASE WHEN scheduled_value > 0
    THEN ROUND((prev_completed + this_period + materials_stored) / scheduled_value * 100, 2)
    ELSE 0 END
  ) STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (claim_id, boq_item_id)
);

ALTER TABLE public.qs_progress_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qs_claim_items     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qs_claim_auth"      ON public.qs_progress_claims TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qs_claim_item_auth" ON public.qs_claim_items     TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_qs_claims_project  ON public.qs_progress_claims(project_id);
CREATE INDEX idx_qs_claim_items     ON public.qs_claim_items(claim_id);
CREATE INDEX idx_qs_claim_boq_item  ON public.qs_claim_items(boq_item_id);
