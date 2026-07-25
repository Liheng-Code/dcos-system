-- Link PR items to BOQ baseline items and track requisitioned quantities.

-- 1. Add FK from PR items to BOQ items
ALTER TABLE procurement_pr_items
  ADD COLUMN IF NOT EXISTS boq_item_id UUID REFERENCES qs_boq_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pr_items_boq_item ON procurement_pr_items(boq_item_id);

-- 2. View: BOQ items with requisitioned / remaining quantities
CREATE OR REPLACE VIEW qs_v_boq_requisition_status AS
SELECT
  bi.id            AS boq_item_id,
  bi.project_id,
  bi.boq_section_id,
  bi.seq,
  bi.item_no,
  bi.item_code,
  bi.description,
  bi.unit,
  bi.quantity      AS boq_quantity,
  bi.unit_rate,
  bi.total_amount,
  bi.elemental_category,
  COALESCE(req.requisitioned_qty, 0) AS requisitioned_quantity,
  bi.quantity - COALESCE(req.requisitioned_qty, 0) AS remaining_quantity
FROM qs_boq_items bi
LEFT JOIN LATERAL (
  SELECT SUM(pi.quantity) AS requisitioned_qty
  FROM procurement_pr_items pi
  JOIN procurement_prs pr ON pr.id = pi.pr_id
  WHERE pi.boq_item_id = bi.id
    AND pr.approval_status NOT IN ('cancelled', 'rejected')
) req ON true;
