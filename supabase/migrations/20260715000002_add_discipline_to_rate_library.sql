-- Add discipline column to company_rate_library
-- Discipline categorises rates into top-level groups: Structural, Architecture, MEP

ALTER TABLE public.company_rate_library
  ADD COLUMN IF NOT EXISTS discipline text;

CREATE INDEX IF NOT EXISTS idx_crl_discipline ON public.company_rate_library(tenant_id, discipline);

COMMENT ON COLUMN public.company_rate_library.discipline IS 'Top-level discipline grouping: Structural, Architecture, MEP';
