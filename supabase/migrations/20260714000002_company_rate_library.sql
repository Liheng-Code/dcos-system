-- Company Rate Library
-- Migration: Create company-wide rate library for cross-tender reuse
-- Adds: company_rate_library, company_rate_library_lines
-- Modifies: tender_unit_rates (add FK on library_rate_id)

-- ══════════════════════════════════════════════════════════════════════════════
-- A. company_rate_library — enterprise-wide rate definitions
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.company_rate_library (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  code                  text NOT NULL,
  description           text NOT NULL,
  trade                 text,
  unit                  text NOT NULL,
  mode                  text NOT NULL DEFAULT 'flat' CHECK (mode IN ('flat','buildup')),
  base_rate             numeric(14,4),
  wastage_pct           numeric(6,3) DEFAULT 0,
  productivity_factor   numeric(6,3) DEFAULT 1 CHECK (productivity_factor > 0),
  net_rate              numeric(14,4) NOT NULL DEFAULT 0,
  category_tags         text[],
  region                text,
  source_project_id     uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  is_active             boolean NOT NULL DEFAULT true,
  notes                 text,
  created_by            uuid REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_crl_tenant ON public.company_rate_library(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crl_trade ON public.company_rate_library(tenant_id, trade);
CREATE INDEX IF NOT EXISTS idx_crl_tags ON public.company_rate_library USING gin(category_tags);

ALTER TABLE public.company_rate_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view company rate library"
  ON public.company_rate_library FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert company rate library"
  ON public.company_rate_library FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update company rate library"
  ON public.company_rate_library FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete company rate library"
  ON public.company_rate_library FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- B. company_rate_library_lines — build-up composition for library rates
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.company_rate_library_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  library_rate_id       uuid NOT NULL REFERENCES public.company_rate_library(id) ON DELETE CASCADE,
  category              text NOT NULL CHECK (category IN ('material','labor','plant','subcon')),
  price_list_item_code  text,
  price_list_item_desc  text NOT NULL,
  unit_price            numeric(14,4) NOT NULL DEFAULT 0,
  qty_per_unit          numeric(14,6) NOT NULL DEFAULT 0,
  wastage_pct           numeric(6,3) DEFAULT 0,
  line_total            numeric(14,4) NOT NULL DEFAULT 0,
  sort_order            integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_crll_rate ON public.company_rate_library_lines(library_rate_id);

ALTER TABLE public.company_rate_library_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view company rate library lines"
  ON public.company_rate_library_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert company rate library lines"
  ON public.company_rate_library_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update company rate library lines"
  ON public.company_rate_library_lines FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete company rate library lines"
  ON public.company_rate_library_lines FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- C. FK on tender_unit_rates.library_rate_id → company_rate_library
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tur_library_rate'
  ) THEN
    ALTER TABLE public.tender_unit_rates
      ADD CONSTRAINT fk_tur_library_rate
      FOREIGN KEY (library_rate_id) REFERENCES public.company_rate_library(id) ON DELETE SET NULL;
  END IF;
END $$;
