-- Fix: production wbs_node_quantities has a NOT NULL project_id column that
-- no prior migration declared, so inserts from upsertWbsNodeGfa() (which only
-- sends wbs_node_id/metric_code/value) fail with:
--   null value in column "project_id" of relation "wbs_node_quantities" violates not-null constraint
-- Fully idempotent — safe to run multiple times.

-- 1. Add the column if missing (nullable first so backfill can run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wbs_node_quantities' AND column_name='project_id') THEN
    ALTER TABLE public.wbs_node_quantities ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- 2. Backfill any existing/orphaned rows from their wbs_node
UPDATE public.wbs_node_quantities q
SET project_id = n.project_id
FROM public.wbs_nodes n
WHERE q.wbs_node_id = n.id AND q.project_id IS NULL;

-- 3. Auto-populate on insert so client code never needs to know about this
--    column — it's fully derivable from wbs_node_id.
CREATE OR REPLACE FUNCTION public.set_wbs_node_quantities_project_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    SELECT project_id INTO NEW.project_id FROM public.wbs_nodes WHERE id = NEW.wbs_node_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_wbs_node_quantities_project_id_trigger ON public.wbs_node_quantities;
CREATE TRIGGER set_wbs_node_quantities_project_id_trigger
  BEFORE INSERT ON public.wbs_node_quantities
  FOR EACH ROW EXECUTE FUNCTION public.set_wbs_node_quantities_project_id();

-- 4. Now that every row is backfilled and future inserts auto-populate, enforce NOT NULL
ALTER TABLE public.wbs_node_quantities ALTER COLUMN project_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_node_quantities_project_id ON public.wbs_node_quantities(project_id);
