-- Phase 4: PO BOQ References
-- Add direct boq_item_id reference on PO items and
-- include PO numbers in the requisition status view.

ALTER TABLE procurement_po_items
  ADD COLUMN IF NOT EXISTS boq_item_id UUID REFERENCES qs_boq_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_items_boq_item ON procurement_po_items(boq_item_id);

-- Recreate view to add po_ids per BOQ item
DROP VIEW IF EXISTS qs_v_boq_requisition_status CASCADE;

CREATE VIEW qs_v_boq_requisition_status AS
SELECT
  bi.id            AS boq_item_id,
  bi.project_id,
  bi.boq_section_id,
  b.id             AS boq_id,
  b.boq_number,
  b.boq_type,
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
  COALESCE(po.ordered_qty, 0)        AS ordered_quantity,
  COALESCE(po.delivered_qty, 0)      AS delivered_quantity,
  bi.quantity - COALESCE(req.requisitioned_qty, 0) AS remaining_quantity,
  po.po_ids
FROM qs_boq_items bi
JOIN qs_boq_sections s ON s.id = bi.boq_section_id
JOIN qs_boq b ON b.id = s.boq_id
LEFT JOIN LATERAL (
  SELECT SUM(pi.quantity) AS requisitioned_qty
  FROM procurement_pr_items pi
  JOIN procurement_prs pr ON pr.id = pi.pr_id
  WHERE pi.boq_item_id = bi.id
    AND pr.approval_status NOT IN ('cancelled', 'rejected')
) req ON true
LEFT JOIN LATERAL (
  SELECT
    SUM(poi.quantity_ordered)   AS ordered_qty,
    SUM(poi.quantity_delivered) AS delivered_qty,
    string_agg(DISTINCT po.po_number, ', ' ORDER BY po.po_number) AS po_ids
  FROM procurement_po_items poi
  JOIN procurement_pos po ON po.id = poi.po_id AND po.status != 'cancelled'
  WHERE poi.pr_item_id IN (
    SELECT pi2.id FROM procurement_pr_items pi2
    WHERE pi2.boq_item_id = bi.id
  )
  OR poi.boq_item_id = bi.id
) po ON true;
