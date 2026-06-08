-- QS Module Phase 1: BOQ sections, BOQ items, budget revision log

CREATE TABLE IF NOT EXISTS public.qs_boq_sections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL DEFAULT 0,
  title      TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.qs_boq_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_section_id  UUID NOT NULL REFERENCES public.qs_boq_sections(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  cost_item_id    UUID REFERENCES public.qs_cost_items(id) ON DELETE SET NULL,
  seq             INTEGER NOT NULL DEFAULT 0,
  description     TEXT NOT NULL,
  unit            TEXT NOT NULL,
  quantity        NUMERIC(15,3) NOT NULL DEFAULT 0,
  unit_rate       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_rate) STORED,
  contingency_pct NUMERIC(5,2)  NOT NULL DEFAULT 0,
  is_provisional  BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.qs_budget_revisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_item_id  UUID NOT NULL REFERENCES public.qs_boq_items(id) ON DELETE CASCADE,
  prev_quantity NUMERIC(15,3),
  new_quantity  NUMERIC(15,3),
  prev_unit_rate NUMERIC(12,2),
  new_unit_rate  NUMERIC(12,2),
  prev_total    NUMERIC(15,2),
  new_total     NUMERIC(15,2),
  reason        TEXT,
  revised_by    UUID REFERENCES auth.users(id),
  revised_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.qs_boq_sections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qs_boq_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qs_budget_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qs_boq_sec_auth" ON public.qs_boq_sections    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qs_boq_itm_auth" ON public.qs_boq_items       TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qs_bud_rev_auth" ON public.qs_budget_revisions TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_qs_boq_sections_project  ON public.qs_boq_sections(project_id);
CREATE INDEX idx_qs_boq_items_project     ON public.qs_boq_items(project_id);
CREATE INDEX idx_qs_boq_items_section     ON public.qs_boq_items(boq_section_id);
CREATE INDEX idx_qs_budget_rev_item       ON public.qs_budget_revisions(boq_item_id);
