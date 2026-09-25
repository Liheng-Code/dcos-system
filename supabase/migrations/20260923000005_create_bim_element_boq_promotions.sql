-- Migration: 20260923000005_create_bim_element_boq_promotions.sql
-- Purpose: Phase 1a "Bridge BIM Takeoff into QTO/BOQ" -- records which staged
--          bim_element_takeoff rows were promoted into which real BOQ line.
--          Many BIM elements can aggregate into ONE BOQ line (e.g. every
--          column on a floor promoted into a single "Columns - Grade 40
--          Concrete" BOQ item), so this is a many-(takeoff rows)-to-one-(BOQ
--          item) link table, not a 1:1 mapping. Supports both the
--          pre-contract tender_boq_items target and the post-contract
--          qs_boq_items target -- exactly one of the two FK columns must be
--          set per row (CHECK below).
--
--          Known follow-up NOT solved by this migration: bulkUpsertElementTakeoff
--          upserts bim_element_takeoff on (model_id, global_id), so re-running
--          "Extract for Takeoff" on a model can silently overwrite a staged
--          row's quantity/unit even after that row has already been promoted
--          into a BOQ line. quantity_contributed on this table is a snapshot
--          taken at promotion time specifically so that later drift in
--          bim_element_takeoff does not retroactively change BOQ history --
--          but nothing currently warns a user in the UI when they re-extract
--          an element that already has a promotion row. A future migration/
--          feature should surface that warning; out of scope here.
--
-- Depends on: bim_element_takeoff (20260717000004_create_bim_element_takeoff.sql),
--             tender_boq_items (20260531000055_tender_cost_estimation.sql),
--             qs_boq_items (20260531000023_create_qs_boq_tables.sql),
--             profiles (pre-existing).
--
-- Conventions mirrored from bim_element_wbs_map / bim_element_takeoff
-- (20260717000001 / 20260717000004): tenant_id uuid not null with no FK,
-- permissive single RLS policy "FOR ALL TO authenticated USING (true) WITH
-- CHECK (true)" consistent with the rest of the bim_* tables (tightening RLS
-- here alone would be inconsistent with siblings and is out of scope).
-- One-of-two-FKs CHECK idiom mirrored from
-- 20260722000002_tender_boq_dwl_assembly_link.sql's one-library-source guard
-- style, adapted to the "exactly one, not at most one" requirement here.

CREATE TABLE IF NOT EXISTS public.bim_element_boq_promotions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  takeoff_id            uuid NOT NULL REFERENCES public.bim_element_takeoff(id) ON DELETE CASCADE,
  tender_boq_item_id    uuid REFERENCES public.tender_boq_items(id) ON DELETE CASCADE,
  qs_boq_item_id        uuid REFERENCES public.qs_boq_items(id) ON DELETE CASCADE,
  quantity_contributed  numeric(18,4) NOT NULL,
  promoted_by           uuid NOT NULL REFERENCES public.profiles(id),
  promoted_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(takeoff_id),
  CONSTRAINT bim_element_boq_promotions_one_target CHECK (
    (tender_boq_item_id IS NOT NULL AND qs_boq_item_id IS NULL)
    OR (tender_boq_item_id IS NULL AND qs_boq_item_id IS NOT NULL)
  )
);

ALTER TABLE public.bim_element_boq_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bim_element_boq_promotions_auth_all" ON public.bim_element_boq_promotions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- takeoff_id is already indexed via the UNIQUE(takeoff_id) constraint above
-- (Postgres auto-creates a unique index for it) -- no redundant index added.
CREATE INDEX IF NOT EXISTS idx_bim_boq_promotions_tender_boq_item ON public.bim_element_boq_promotions(tender_boq_item_id);
CREATE INDEX IF NOT EXISTS idx_bim_boq_promotions_qs_boq_item     ON public.bim_element_boq_promotions(qs_boq_item_id);
CREATE INDEX IF NOT EXISTS idx_bim_boq_promotions_tenant          ON public.bim_element_boq_promotions(tenant_id);
