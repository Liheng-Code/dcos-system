-- QS Data Integrity & Schema Hardening
-- Fixes: C4, M1, M5, M7, M9, N2, M6 (partial audit expansion)

-- ──────────────────────────────────────────────────────────────────
-- C4: Fix account_budget_vs_actual view to use only the latest
-- revision per BOQ item (not sum of ALL revisions)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.account_budget_vs_actual AS
SELECT
  p.id AS project_id,
  p.project_name,
  COALESCE(br_total.budget_total, 0) AS total_budget,
  COALESCE(gl_actual.actual_total, 0) AS total_actual,
  COALESCE(br_total.budget_total, 0) - COALESCE(gl_actual.actual_total, 0) AS variance,
  CASE WHEN COALESCE(br_total.budget_total, 0) > 0
    THEN (COALESCE(gl_actual.actual_total, 0) / br_total.budget_total * 100)
    ELSE 0
  END AS pct_used
FROM public.projects p
LEFT JOIN (
  -- Use DISTINCT ON to grab only the latest revision per BOQ item
  SELECT q.project_id, SUM(q.new_total) AS budget_total
  FROM (
    SELECT DISTINCT ON (br.boq_item_id)
      br.project_id,
      br.new_total
    FROM public.qs_budget_revisions br
    ORDER BY br.boq_item_id, br.revised_at DESC
  ) q
  GROUP BY q.project_id
) br_total ON br_total.project_id = p.id
LEFT JOIN (
  SELECT project_id, SUM(CASE WHEN normal_balance = 'debit' THEN debit_amount ELSE credit_amount END) AS actual_total
  FROM public.account_journal_lines jl
  JOIN public.account_coa ac ON ac.id = jl.account_id
  WHERE ac.type IN ('expense', 'cost_of_goods_sold')
  GROUP BY project_id
) gl_actual ON gl_actual.project_id = p.id;

-- ──────────────────────────────────────────────────────────────────
-- M1: Add missing index on qs_budget_revisions(project_id)
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_qs_budget_revisions_project
  ON public.qs_budget_revisions(project_id);

-- ──────────────────────────────────────────────────────────────────
-- M5: Add revision_number to qs_budget_revisions for sequencing
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.qs_budget_revisions
  ADD COLUMN IF NOT EXISTS revision_number INTEGER;

-- Backfill revision numbers based on revised_at order per boq_item_id
DO $$
DECLARE
  r RECORD;
  seq INTEGER;
BEGIN
  FOR r IN
    SELECT id, boq_item_id, revised_at
    FROM public.qs_budget_revisions
    WHERE revision_number IS NULL
    ORDER BY boq_item_id, revised_at
  LOOP
    SELECT COALESCE(MAX(revision_number), 0) + 1
    INTO seq
    FROM public.qs_budget_revisions
    WHERE boq_item_id = r.boq_item_id;

    UPDATE public.qs_budget_revisions
    SET revision_number = seq
    WHERE id = r.id;
  END LOOP;
END $$;

-- Make revision_number NOT NULL after backfill
ALTER TABLE public.qs_budget_revisions
  ALTER COLUMN revision_number SET NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- M7: Fix qs_claim_items unique constraint to handle NULL properly
-- PostgreSQL allows multiple NULLs in a UNIQUE constraint, so we
-- replace the table-level constraint with a partial unique index.
-- ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Drop the table-level UNIQUE constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'qs_claim_items_claim_id_boq_item_id_key'
      AND conrelid = 'public.qs_claim_items'::regclass
  ) THEN
    ALTER TABLE public.qs_claim_items
      DROP CONSTRAINT qs_claim_items_claim_id_boq_item_id_key;
  END IF;
END $$;

-- Create partial unique index that excludes NULL boq_item_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_qs_claim_items_unique
  ON public.qs_claim_items(claim_id, boq_item_id)
  WHERE boq_item_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- M9: Add vo_id FK to qs_contingency_drawdowns for traceability
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.qs_contingency_drawdowns
  ADD COLUMN IF NOT EXISTS vo_id UUID REFERENCES public.qs_variation_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_qs_contingency_vo
  ON public.qs_contingency_drawdowns(vo_id);

-- ──────────────────────────────────────────────────────────────────
-- N2: Add CHECK constraint to qs_cost_items ensuring cost
-- breakdown percentages don't exceed 100%
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE public.qs_cost_items
  DROP CONSTRAINT IF EXISTS qs_cost_items_pct_check;

ALTER TABLE public.qs_cost_items
  ADD CONSTRAINT qs_cost_items_pct_check
  CHECK (
    labor_pct >= 0
    AND material_pct >= 0
    AND equipment_pct >= 0
    AND labor_pct + material_pct + equipment_pct <= 100
  );

-- ──────────────────────────────────────────────────────────────────
-- M6: Expand audit triggers to remaining critical QS tables
-- ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'qs_boq',
    'qs_boq_sections',
    'qs_boq_items',
    'qs_cost_transactions',
    'qs_vo_items',
    'qs_claim_items',
    'qs_cost_baseline'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS qs_audit_%1$s ON public.%1$s;
      CREATE TRIGGER qs_audit_%1$s
        AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
        FOR EACH ROW EXECUTE FUNCTION public.qs_audit_trigger_fn();
    ', t);
  END LOOP;
END;
$$;
