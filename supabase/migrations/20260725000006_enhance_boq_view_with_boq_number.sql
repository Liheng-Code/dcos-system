-- Add boq_number and boq_type columns to the BOQ requisition status view
-- so the PR picker can distinguish Main Works vs Preliminaries items.

CREATE OR REPLACE VIEW qs_v_boq_requisition_status AS
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
  bi.quantity - COALESCE(req.requisitioned_qty, 0) AS remaining_quantity
FROM qs_boq_items bi
JOIN qs_boq_sections s ON s.id = bi.boq_section_id
JOIN qs_boq b ON b.id = s.boq_id
LEFT JOIN LATERAL (
  SELECT SUM(pi.quantity) AS requisitioned_qty
  FROM procurement_pr_items pi
  JOIN procurement_prs pr ON pr.id = pi.pr_id
  WHERE pi.boq_item_id = bi.id
    AND pr.approval_status NOT IN ('cancelled', 'rejected')
) req ON true;
