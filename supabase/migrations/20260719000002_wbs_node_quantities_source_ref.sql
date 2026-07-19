-- Fix: production wbs_node_quantities also has a NOT NULL source_ref column
-- (CHECK length(source_ref) > 0) that no migration in this repo declares.
-- upsertWbsNodeGfa() only writes to the `source` column, so once project_id
-- is fixed (20260719000001) the very next insert would fail with:
--   null value in column "source_ref" of relation "wbs_node_quantities" violates not-null constraint
-- source_ref and source hold the same drawing-reference value under two
-- names from two schema iterations; keep them in sync via trigger so client
-- code only ever needs to write `source`. Fully idempotent.

UPDATE public.wbs_node_quantities
SET source_ref = source
WHERE source_ref IS NULL AND source IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_wbs_node_quantities_source_ref()
RETURNS trigger AS $$
BEGIN
  IF NEW.source_ref IS NULL AND NEW.source IS NOT NULL THEN
    NEW.source_ref := NEW.source;
  ELSIF NEW.source IS NULL AND NEW.source_ref IS NOT NULL THEN
    NEW.source := NEW.source_ref;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_wbs_node_quantities_source_ref_trigger ON public.wbs_node_quantities;
CREATE TRIGGER sync_wbs_node_quantities_source_ref_trigger
  BEFORE INSERT OR UPDATE ON public.wbs_node_quantities
  FOR EACH ROW EXECUTE FUNCTION public.sync_wbs_node_quantities_source_ref();
