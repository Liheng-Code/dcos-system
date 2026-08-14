-- Simplify Budget Confirmation item budget comparison columns.
-- Approved PTB Amount (B) and Committed Amount (D) have no live data source
-- anywhere in DCOS and are removed rather than left as unused manual-entry
-- fields. Remaining Work (E) is redefined as a derived value, E = A - C
-- (Contract Target Budget - Estimated), so total_up_to_date/savings_up_to_date
-- (which depended on B/D) are dropped as well.

ALTER TABLE public.procurement_budget_confirmation_items
  DROP COLUMN IF EXISTS approved_ptb_amount,
  DROP COLUMN IF EXISTS committed_amount,
  DROP COLUMN IF EXISTS total_up_to_date,
  DROP COLUMN IF EXISTS savings_up_to_date;
