-- Backfill procurement_prs.total_estimated_cost for existing rows.
-- pr-form.tsx never wrote this column on create/edit, only the individual
-- procurement_pr_items rows, so every existing PR shows a blank "Total" in
-- the list/detail views. Populate it as the sum of each PR's item totals.

UPDATE public.procurement_prs pr
SET total_estimated_cost = sub.total
FROM (
  SELECT pr_id, SUM(COALESCE(estimated_total, 0)) AS total
  FROM public.procurement_pr_items
  GROUP BY pr_id
) sub
WHERE sub.pr_id = pr.id;
