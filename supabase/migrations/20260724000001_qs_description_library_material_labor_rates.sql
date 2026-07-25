-- Migration: 20260724000001_qs_description_library_material_labor_rates.sql
-- Purpose: Replace category + current_rate with material_rate + labor_rate columns
--          in qs_description_library so each description can carry both a material
--          cost and a labor cost simultaneously.
-- Depends on: public.qs_description_library

BEGIN;

-- ── Add new columns ──────────────────────────────────────────────────────────
ALTER TABLE public.qs_description_library
  ADD COLUMN material_rate NUMERIC DEFAULT NULL,
  ADD COLUMN labor_rate    NUMERIC DEFAULT NULL;

-- ── Migrate existing data ────────────────────────────────────────────────────
UPDATE public.qs_description_library
SET material_rate = current_rate
WHERE category = 'material' AND current_rate IS NOT NULL;

UPDATE public.qs_description_library
SET labor_rate = current_rate
WHERE category = 'labor' AND current_rate IS NOT NULL;

-- ── Drop old columns ─────────────────────────────────────────────────────────
ALTER TABLE public.qs_description_library
  DROP COLUMN category,
  DROP COLUMN current_rate;

COMMIT;
