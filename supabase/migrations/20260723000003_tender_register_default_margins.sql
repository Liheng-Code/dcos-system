ALTER TABLE public.tender_register
  ADD COLUMN default_labor_margin_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN default_material_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tender_register.default_labor_margin_pct IS 'Standard labor margin % applied when pulling items from Element Library';
COMMENT ON COLUMN public.tender_register.default_material_margin_pct IS 'Standard material margin % applied when pulling items from Element Library';
