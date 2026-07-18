-- Recreate tender_price_list table (was dropped by a remote migration).
-- Uses IF NOT EXISTS for safety.

CREATE TABLE IF NOT EXISTS public.tender_price_list (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id           UUID NOT NULL REFERENCES public.tender_register(id) ON DELETE CASCADE,
  item_code           TEXT NOT NULL,
  section             TEXT,
  sub_section         TEXT,
  sub_element         TEXT,
  description         TEXT NOT NULL,
  unit                TEXT NOT NULL DEFAULT 'ea',
  labor_net_cost      NUMERIC(15,2) NOT NULL DEFAULT 0,
  labor_margin_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  labor_rate          NUMERIC(15,2) GENERATED ALWAYS AS (labor_net_cost * (1 + labor_margin_pct / 100)) STORED,
  material_net_cost   NUMERIC(15,2) NOT NULL DEFAULT 0,
  material_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  material_rate       NUMERIC(15,2) GENERATED ALWAYS AS (material_net_cost * (1 + material_margin_pct / 100)) STORED,
  total_rate          NUMERIC(15,2) GENERATED ALWAYS AS (
                        (labor_net_cost * (1 + labor_margin_pct / 100)) +
                        (material_net_cost * (1 + material_margin_pct / 100))
                      ) STORED,
  basis_source        TEXT,
  match_key           TEXT GENERATED ALWAYS AS (description || '|' || unit) STORED,
  budget_code_id      UUID REFERENCES public.budget_codes(id) ON DELETE SET NULL,
  source_unit_rate_id UUID REFERENCES public.unit_rate_library(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tender_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_tpl_tender ON public.tender_price_list(tender_id);
CREATE INDEX IF NOT EXISTS idx_tpl_match_key ON public.tender_price_list(tender_id, match_key);
CREATE INDEX IF NOT EXISTS idx_tpl_budget_code ON public.tender_price_list(budget_code_id);

ALTER TABLE public.tender_price_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tender price list: auth read" ON public.tender_price_list
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tender price list: auth insert" ON public.tender_price_list
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Tender price list: auth update" ON public.tender_price_list
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Tender price list: auth delete" ON public.tender_price_list
  FOR DELETE TO authenticated USING (true);
