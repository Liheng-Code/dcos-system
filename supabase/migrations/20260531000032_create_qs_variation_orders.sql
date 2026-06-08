-- QS Module Phase 2: Variation Orders (Change Orders)

CREATE TABLE IF NOT EXISTS public.qs_variation_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vo_number            TEXT NOT NULL,
  title                TEXT NOT NULL,
  vo_type              TEXT NOT NULL DEFAULT 'client_request'
    CHECK (vo_type IN ('client_request','design_change','site_condition','regulatory','other')),
  description          TEXT,
  total_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  schedule_impact_days INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected','implemented')),
  rejection_reason     TEXT,
  submitted_by         UUID REFERENCES auth.users(id),
  submitted_at         TIMESTAMPTZ,
  approved_by          UUID REFERENCES auth.users(id),
  approved_at          TIMESTAMPTZ,
  created_by           UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.qs_vo_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vo_id        UUID NOT NULL REFERENCES public.qs_variation_orders(id) ON DELETE CASCADE,
  boq_item_id  UUID REFERENCES public.qs_boq_items(id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  unit         TEXT NOT NULL,
  quantity     NUMERIC(15,3) NOT NULL DEFAULT 0,
  unit_rate    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_rate) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VO approval steps (for multi-step workflow — Phase 3 will wire roles)
CREATE TABLE IF NOT EXISTS public.qs_vo_approvals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vo_id          UUID NOT NULL REFERENCES public.qs_variation_orders(id) ON DELETE CASCADE,
  step           INTEGER NOT NULL,
  approver_role  TEXT NOT NULL,
  user_id        UUID REFERENCES auth.users(id),
  decision       TEXT NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending','approved','rejected')),
  comments       TEXT,
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.qs_variation_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qs_vo_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qs_vo_approvals     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qs_vo_auth"      ON public.qs_variation_orders TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qs_vo_itm_auth"  ON public.qs_vo_items         TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qs_vo_appr_auth" ON public.qs_vo_approvals     TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_qs_vo_project ON public.qs_variation_orders(project_id);
CREATE INDEX idx_qs_vo_status  ON public.qs_variation_orders(status);
CREATE INDEX idx_qs_vo_items   ON public.qs_vo_items(vo_id);
