-- IPC Certification screen (submodule 07): captures why a certified quantity
-- differs from what was claimed. Free text, matching the sibling
-- adjustment_reason column's existing convention on the same table.

ALTER TABLE public.qs_claim_items
  ADD COLUMN IF NOT EXISTS certified_variance_reason TEXT;
