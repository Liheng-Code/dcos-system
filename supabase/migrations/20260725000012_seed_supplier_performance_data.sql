-- Migration: 20260725000012_seed_supplier_performance_data.sql
-- Purpose: Seed procurement_pos, procurement_delivery_notes,
--          procurement_goods_receipts, procurement_rfqs, and
--          procurement_rfq_suppliers with realistic mock data so the
--          Supplier Performance dashboard has meaningful content.
--
-- Depends on: procurement tables (20260531000005, 20260531000006)

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0. ENSURE SUPPLIERS EXIST (idempotent — safe to re-run)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO procurement_suppliers (supplier_code, supplier_name, supplier_type, contact_person, email, status)
VALUES
  ('SUP-001', 'ABC Construction Corp', 'contractor', 'John Tan', 'john@abcconstruction.com', 'active'),
  ('SUP-002', 'MEP Solutions Ltd', 'subcontractor', 'Sarah Lim', 'sarah@mePsolutions.com', 'active'),
  ('SUP-003', 'SteelMaster Pte Ltd', 'subcontractor', 'David Chen', 'david@steelmaster.com', 'active'),
  ('SUP-006', 'Premium Finishes Co', 'subcontractor', 'Emily Wong', 'emily@premiumfinishes.com', 'active'),
  ('SUP-007', 'TechLift Elevators', 'subcontractor', 'Michael Ng', 'michael@techlift.com', 'active')
ON CONFLICT (supplier_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. PURCHASE ORDERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- SUP-001: ABC Construction Corp — 3 POs (delivered, delivered, approved)
INSERT INTO procurement_pos (id, po_number, supplier_id, issued_date, delivery_date_expected, grand_total, status, currency)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'PO-2026-001',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-001'),
   '2026-05-01', '2026-05-20', 125000.00, 'delivered', 'USD'),
  ('a1000000-0000-0000-0000-000000000002', 'PO-2026-002',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-001'),
   '2026-05-15', '2026-06-05', 87500.00, 'delivered', 'USD'),
  ('a1000000-0000-0000-0000-000000000003', 'PO-2026-003',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-001'),
   '2026-06-10', '2026-07-01', 210000.00, 'approved', 'USD');

-- SUP-007: TechLift Elevators — 2 POs (delivered, delivered)
INSERT INTO procurement_pos (id, po_number, supplier_id, issued_date, delivery_date_expected, grand_total, status, currency)
VALUES
  ('a1000000-0000-0000-0000-000000000004', 'PO-2026-004',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-007'),
   '2026-04-20', '2026-05-15', 340000.00, 'delivered', 'USD'),
  ('a1000000-0000-0000-0000-000000000005', 'PO-2026-005',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-007'),
   '2026-06-01', '2026-06-25', 195000.00, 'delivered', 'USD');

-- SUP-002: MEP Solutions Ltd — 1 PO (submitted)
INSERT INTO procurement_pos (id, po_number, supplier_id, issued_date, delivery_date_expected, grand_total, status, currency)
VALUES
  ('a1000000-0000-0000-0000-000000000006', 'PO-2026-006',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-002'),
   '2026-06-20', '2026-07-15', 62000.00, 'submitted', 'USD');

-- SUP-003: SteelMaster Pte Ltd — 1 PO (draft)
INSERT INTO procurement_pos (id, po_number, supplier_id, issued_date, delivery_date_expected, grand_total, status, currency)
VALUES
  ('a1000000-0000-0000-0000-000000000007', 'PO-2026-007',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-003'),
   '2026-07-01', '2026-07-30', 48000.00, 'draft', 'USD');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. PO ITEMS (for delivered POs that need goods receipts)
-- ═══════════════════════════════════════════════════════════════════════════════

-- PO-2026-001 items (SUP-001)
INSERT INTO procurement_po_items (id, po_id, line_no, item_description, unit, quantity_ordered, unit_price, total_price)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 1, 'Structural Steel Beams', 'pcs', 50, 1500.00, 75000.00),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 2, 'High-Strength Bolts M20', 'set', 200, 250.00, 50000.00);

-- PO-2026-002 items (SUP-001)
INSERT INTO procurement_po_items (id, po_id, line_no, item_description, unit, quantity_ordered, unit_price, total_price)
VALUES
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 1, 'Reinforcement Mesh A393', 'pcs', 100, 350.00, 35000.00),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 2, 'Welding Electrodes E7018', 'kg', 500, 105.00, 52500.00);

-- PO-2026-004 items (SUP-007)
INSERT INTO procurement_po_items (id, po_id, line_no, item_description, unit, quantity_ordered, unit_price, total_price)
VALUES
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000004', 1, 'Passenger Elevator 1600kg', 'unit', 2, 150000.00, 300000.00),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000004', 2, 'Elevator Spare Parts Kit', 'set', 2, 20000.00, 40000.00);

-- PO-2026-005 items (SUP-007)
INSERT INTO procurement_po_items (id, po_id, line_no, item_description, unit, quantity_ordered, unit_price, total_price)
VALUES
  ('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000005', 1, 'Service Elevator 2500kg', 'unit', 1, 175000.00, 175000.00),
  ('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000005', 2, 'Installation & Commissioning', 'ls', 1, 20000.00, 20000.00);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. DELIVERY NOTES
-- ═══════════════════════════════════════════════════════════════════════════════

-- SUP-001: PO-2026-001 — ON-TIME delivery (expected May 20, delivered May 18)
INSERT INTO procurement_delivery_notes (id, po_id, supplier_id, delivery_note_ref, delivery_date, status)
VALUES
  ('c1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-001'),
   'DN-001', '2026-05-18', 'accepted');

-- SUP-001: PO-2026-002 — LATE delivery (expected Jun 5, delivered Jun 10)
INSERT INTO procurement_delivery_notes (id, po_id, supplier_id, delivery_note_ref, delivery_date, status)
VALUES
  ('c1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000002',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-001'),
   'DN-002', '2026-06-10', 'accepted');

-- SUP-007: PO-2026-004 — ON-TIME delivery (expected May 15, delivered May 14)
INSERT INTO procurement_delivery_notes (id, po_id, supplier_id, delivery_note_ref, delivery_date, status)
VALUES
  ('c1000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000004',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-007'),
   'DN-003', '2026-05-14', 'accepted');

-- SUP-007: PO-2026-005 — ON-TIME delivery (expected Jun 25, delivered Jun 24)
INSERT INTO procurement_delivery_notes (id, po_id, supplier_id, delivery_note_ref, delivery_date, status)
VALUES
  ('c1000000-0000-0000-0000-000000000004',
   'a1000000-0000-0000-0000-000000000005',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-007'),
   'DN-004', '2026-06-24', 'delivered');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. GOODS RECEIPTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- PO-2026-001 items (SUP-001) — all accepted
INSERT INTO procurement_goods_receipts (id, delivery_note_id, po_item_id, quantity_received, quantity_accepted, quantity_rejected, inspection_result)
VALUES
  ('d1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001',
   50, 50, 0, 'passed'),
  ('d1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000002',
   200, 195, 5, 'conditional');

-- PO-2026-002 items (SUP-001) — some rejected
INSERT INTO procurement_goods_receipts (id, delivery_note_id, po_item_id, quantity_received, quantity_accepted, quantity_rejected, rejection_reason, inspection_result)
VALUES
  ('d1000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000003',
   100, 92, 8, 'Damaged sheets', 'failed'),
  ('d1000000-0000-0000-0000-000000000004',
   'c1000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000004',
   500, 490, 10, 'Wet packaging', 'conditional');

-- PO-2026-004 items (SUP-007) — all accepted
INSERT INTO procurement_goods_receipts (id, delivery_note_id, po_item_id, quantity_received, quantity_accepted, quantity_rejected, inspection_result)
VALUES
  ('d1000000-0000-0000-0000-000000000005',
   'c1000000-0000-0000-0000-000000000003',
   'b1000000-0000-0000-0000-000000000005',
   2, 2, 0, 'passed'),
  ('d1000000-0000-0000-0000-000000000006',
   'c1000000-0000-0000-0000-000000000003',
   'b1000000-0000-0000-0000-000000000006',
   2, 2, 0, 'passed');

-- PO-2026-005 items (SUP-007) — all accepted
INSERT INTO procurement_goods_receipts (id, delivery_note_id, po_item_id, quantity_received, quantity_accepted, quantity_rejected, inspection_result)
VALUES
  ('d1000000-0000-0000-0000-000000000007',
   'c1000000-0000-0000-0000-000000000004',
   'b1000000-0000-0000-0000-000000000007',
   1, 1, 0, 'passed'),
  ('d1000000-0000-0000-0000-000000000008',
   'c1000000-0000-0000-0000-000000000004',
   'b1000000-0000-0000-0000-000000000008',
   1, 1, 0, 'passed');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. RFQs
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO procurement_rfqs (id, rfq_number, issue_date, response_deadline, evaluation_method, status)
VALUES
  ('e1000000-0000-0000-0000-000000000001', 'RFQ-2026-001', '2026-04-01', '2026-04-15', 'lowest_price', 'awarded'),
  ('e1000000-0000-0000-0000-000000000002', 'RFQ-2026-002', '2026-05-10', '2026-05-24', 'weighted', 'awarded'),
  ('e1000000-0000-0000-0000-000000000003', 'RFQ-2026-003', '2026-06-15', '2026-06-30', 'technical_commercial', 'quotations_received');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. RFQ SUPPLIERS (invitations & responses)
-- ═══════════════════════════════════════════════════════════════════════════════

-- RFQ-2026-001: invited 3, 2 responded
INSERT INTO procurement_rfq_suppliers (rfq_id, supplier_id, responded)
VALUES
  ('e1000000-0000-0000-0000-000000000001',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-001'), true),
  ('e1000000-0000-0000-0000-000000000001',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-007'), true),
  ('e1000000-0000-0000-0000-000000000001',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-002'), false);

-- RFQ-2026-002: invited 3, 3 responded
INSERT INTO procurement_rfq_suppliers (rfq_id, supplier_id, responded)
VALUES
  ('e1000000-0000-0000-0000-000000000002',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-001'), true),
  ('e1000000-0000-0000-0000-000000000002',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-007'), true),
  ('e1000000-0000-0000-0000-000000000002',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-003'), true);

-- RFQ-2026-003: invited 2, 1 responded
INSERT INTO procurement_rfq_suppliers (rfq_id, supplier_id, responded)
VALUES
  ('e1000000-0000-0000-0000-000000000003',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-007'), true),
  ('e1000000-0000-0000-0000-000000000003',
   (SELECT id FROM procurement_suppliers WHERE supplier_code = 'SUP-006'), false);
