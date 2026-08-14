-- Migration: 20260805000003_seed_qto_data.sql
-- Purpose: Realistic QTO seed data — Tower (BA) / Podium (BB) / External (BX)
--          demo tender with documents, drawings + revisions, QTO items with
--          calculations and add/deduct lines.
-- Depends on: 20260805000001_create_qto_tables.sql

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Demo tender
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO public.tender_register (tender_no, title, description, tender_type, status, currency, notes)
VALUES ('TND-QTO-2026-001', 'QTO Demo Tender — Tower + Podium + External Works',
        'Demo tender used to demonstrate the Quantity Takeoff module.',
        'open', 'evaluation', 'USD', 'Seed data for QTO module demo')
ON CONFLICT (tender_no) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Documents
-- ──────────────────────────────────────────────────────────────────────────
WITH t AS (SELECT id FROM public.tender_register WHERE tender_no = 'TND-QTO-2026-001')
INSERT INTO public.qto_document_register
  (tender_id, document_no, title, document_type, discipline, building, revision, issue_date, received_date, source, status)
SELECT t.id, doc.document_no, doc.title, doc.document_type, doc.discipline, doc.building,
       doc.revision, doc.issue_date, doc.received_date, doc.source, doc.status
FROM t CROSS JOIN (VALUES
  ('SPEC-STR-001', 'Structural Specification Volume 1', 'specification', 'STR', 'BA', 'C', '2026-01-08'::date, '2026-01-10'::date, 'Client', 'registered'),
  ('BOQ-0001',     'Tender Bill of Quantities',        'boq',           'GEN', NULL, 'A',  '2026-01-12'::date, '2026-01-12'::date, 'Consultant', 'registered'),
  ('ADD-001',      'Addendum No. 1 — Foundation detail', 'addendum',    'STR', 'BA', 'B',  '2026-02-01'::date, '2026-02-02'::date, 'Client', 'registered')
) AS doc(document_no, title, document_type, discipline, building, revision, issue_date, received_date, source, status)
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Drawings
-- ──────────────────────────────────────────────────────────────────────────
WITH t AS (SELECT id FROM public.tender_register WHERE tender_no = 'TND-QTO-2026-001')
INSERT INTO public.qto_drawing_register
  (tender_id, drawing_no, title, discipline, building, drawing_type, status)
SELECT t.id, d.drawing_no, d.title, d.discipline, d.building, d.drawing_type, d.status
FROM t CROSS JOIN (VALUES
  ('S-101', 'Foundation Layout',      'STR', 'BA', 'layout',   'current'),
  ('S-203', 'Pile Cap Details',       'STR', 'BA', 'detail',   'current'),
  ('S-301', 'Column Schedule',        'STR', 'BA', 'schedule', 'current'),
  ('A-101', 'Ground Floor Plan',      'ARC', 'BA', 'layout',   'current'),
  ('A-204', 'Wall Finishes Plan',     'ARC', 'BA', 'layout',   'current'),
  ('B-101', 'Podium Structure Plan',  'STR', 'BB', 'layout',   'current'),
  ('X-201', 'External Drainage Layout','CIV', 'BX', 'layout',  'current')
) AS d(drawing_no, title, discipline, building, drawing_type, status)
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Drawing revisions (old revisions preserved, never overwritten)
-- ──────────────────────────────────────────────────────────────────────────
WITH t AS (SELECT id FROM public.tender_register WHERE tender_no = 'TND-QTO-2026-001')
INSERT INTO public.qto_drawing_revisions
  (drawing_id, revision, revision_date, status, scale, units)
SELECT dr.id, r.revision, r.revision_date, r.status, r.scale, 'mm'
FROM t
JOIN public.qto_drawing_register dr ON dr.tender_id = t.id
JOIN (VALUES
  ('S-203', 'P01', '2026-01-10'::date, 'superseded', '1:100'),
  ('S-203', 'P02', '2026-01-25'::date, 'superseded', '1:100'),
  ('S-203', 'P03', '2026-02-08'::date, 'current',    '1:100'),
  ('S-301', 'P01', '2026-01-15'::date, 'superseded', '1:50'),
  ('S-301', 'P02', '2026-02-01'::date, 'current',    '1:50'),
  ('A-204', 'P01', '2026-01-18'::date, 'superseded', '1:100'),
  ('A-204', 'P02', '2026-02-05'::date, 'current',    '1:100')
) AS r(drawing_no, revision, revision_date, status, scale)
  ON r.drawing_no = dr.drawing_no
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 5. QTO packages
-- ──────────────────────────────────────────────────────────────────────────
WITH t AS (SELECT id FROM public.tender_register WHERE tender_no = 'TND-QTO-2026-001')
INSERT INTO public.qto_packages (tender_id, building, discipline, work_section, package_code, status, progress_pct)
SELECT t.id, p.building, p.discipline, p.work_section, p.package_code, p.status, p.progress_pct
FROM t CROSS JOIN (VALUES
  ('BA', 'STR', 'Concrete Works',  'BA-STR-CON-01', 'in_progress', 85),
  ('BA', 'ARC', 'Wall Finishes',   'BA-ARC-WAL-01', 'self_checked', 100),
  ('BB', 'STR', 'Concrete Works',  'BB-STR-CON-01', 'submitted', 95),
  ('BX', 'CIV', 'Drainage',        'BX-CIV-DRN-01', 'in_progress', 60)
) AS p(building, discipline, work_section, package_code, status, progress_pct)
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. QTO items
-- ──────────────────────────────────────────────────────────────────────────
-- QTO-000001: PC-01 pile cap concrete (55.296 m3) — Approved
-- QTO-000002: internal wall painting (415 m2)     — QS CHECKED
-- QTO-000003: column concrete C-01 (32.400 m3)    — DRAFT
-- QTO-000004: external drainage 900mm (2400 m)    — Approved
WITH t AS (SELECT id FROM public.tender_register WHERE tender_no = 'TND-QTO-2026-001')
INSERT INTO public.qto_items
  (tender_id, qto_no, building, discipline, work_section, element, item_code, description, unit,
   quantity, measurement_method, source_type, confidence, drawing_id, drawing_revision_id, page_no,
   grid_location, status, revision_no, prepared_by, prepared_date, checked_by, checked_date,
   approved_by, approved_date, assumption)
SELECT t.id,
       i.qto_no, i.building, i.discipline, i.work_section, i.element, i.item_code, i.description, i.unit,
       i.quantity, i.measurement_method, i.source_type, i.confidence,
       dr.id, rev.id, i.page_no, i.grid_location,
       i.status, 1, NULL, NULL, NULL, NULL, NULL, NULL, i.assumption
FROM t CROSS JOIN (VALUES
  ('QTO-000001', 'BA', 'STR', 'Concrete Works', 'Pile Cap', 'PC-01',
   'Reinforced concrete pile cap PC-01', 'm3', 55.296, 'formula', 'D1', 'HIGH',
   'S-203', 'P03', 1, 'Grid B-2', 'APPROVED',
   'Wall height taken as per typical floor-to-floor height where wall elevations are not provided.'),
  ('QTO-000002', 'BA', 'ARC', 'Wall Finishes', 'Painting', 'WF-01',
   'Internal wall painting to blockwork', 'm2', 415.00, 'formula', 'A1', 'MEDIUM',
   'A-204', 'P02', 1, 'Grid A-1 to D-6', 'QS CHECKED',
   'Openings deducted per door and window schedule.'),
  ('QTO-000003', 'BB', 'STR', 'Concrete Works', 'Column', 'C-01',
   'Reinforced concrete column C-01 (ground to L1)', 'm3', 32.400, 'formula', 'D1', 'MEDIUM',
   'S-301', 'P02', 1, 'Grid B-1', 'DRAFT',
   'Column height from section 3.0m + 0.6m lap.'),
  ('QTO-000004', 'BX', 'CIV', 'Drainage', 'External Drain', 'DR-01',
   '900mm dia. external drainage including excavation and backfill', 'm', 2400.00, 'measure', 'D1', 'HIGH',
   'X-201', NULL, 1, 'Perimeter BX', 'APPROVED',
   'Length measured along drawing centreline.')
) AS i(qto_no, building, discipline, work_section, element, item_code, description, unit,
       quantity, measurement_method, source_type, confidence,
       drawing_no, revision, page_no, grid_location, status, assumption)
JOIN public.qto_drawing_register dr ON dr.tender_id = t.id AND dr.drawing_no = i.drawing_no
LEFT JOIN public.qto_drawing_revisions rev ON rev.drawing_id = dr.id AND rev.revision = i.revision
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. Calculations
-- ──────────────────────────────────────────────────────────────────────────
-- QTO-000001: 2.40 × 2.40 × 0.80 × 12 = 55.296
-- QTO-000002: 500.00 - 35.00 - 50.00 = 415.00
-- QTO-000003: 1.20 × 1.20 × 3.00 × 7.5 = 32.400
WITH t AS (SELECT id FROM public.tender_register WHERE tender_no = 'TND-QTO-2026-001')
INSERT INTO public.qto_calculations (qto_item_id, formula, display_text, result, method)
SELECT qi.id, c.formula, c.display_text, c.result, c.method
FROM t CROSS JOIN (VALUES
  ('QTO-000001', '2.40*2.40*0.80*12',   '2.40 × 2.40 × 0.80 × 12', 55.296, 'formula'),
  ('QTO-000002', '500.00-35.00-50.00',  '500.00 - 35.00 - 50.00',  415.00, 'formula'),
  ('QTO-000003', '1.20*1.20*3.00*7.5',  '1.20 × 1.20 × 3.00 × 7.5', 32.400, 'formula')
) AS c(qto_no, formula, display_text, result, method)
JOIN public.qto_items qi ON qi.tender_id = t.id AND qi.qto_no = c.qto_no
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. Calculation lines (add / deduct)
-- ──────────────────────────────────────────────────────────────────────────
WITH t AS (SELECT id FROM public.tender_register WHERE tender_no = 'TND-QTO-2026-001')
INSERT INTO public.qto_calculation_lines (calculation_id, seq, sign, description, amount, unit, source)
SELECT c.id, l.seq, l.sign, l.description, l.amount, l.unit, l.source
FROM t CROSS JOIN (VALUES
  ('QTO-000001', 1,  '+', 'Pile cap volume PC-01 (2.4 × 2.4 × 0.8 × 12)', 55.296, 'm3', 'dimension'),
  ('QTO-000002', 1,  '+', 'Gross internal wall area',                     500.00, 'm2', 'measure'),
  ('QTO-000002', 2,  '-', 'Door openings',                                 35.00, 'm2', 'deduction'),
  ('QTO-000002', 3,  '-', 'Window openings',                               50.00, 'm2', 'deduction'),
  ('QTO-000003', 1,  '+', 'Column C-01 volume (1.2 × 1.2 × 3.0 × 7.5)',   32.400, 'm3', 'dimension')
) AS l(qto_no, seq, sign, description, amount, unit, source)
JOIN public.qto_items qi ON qi.tender_id = t.id AND qi.qto_no = l.qto_no
JOIN public.qto_calculations c ON c.qto_item_id = qi.id
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 9. Assumptions & clarifications
-- ──────────────────────────────────────────────────────────────────────────
WITH t AS (SELECT id FROM public.tender_register WHERE tender_no = 'TND-QTO-2026-001')
INSERT INTO public.qto_assumptions (tender_id, qto_item_id, assumption_no, description, reason, risk_level, status)
SELECT t.id, qi.id, a.assumption_no, a.description, a.reason, a.risk_level, a.status
FROM t CROSS JOIN (VALUES
  ('QTO-000002', 'QTO-ASM-001',
   'Wall height taken as 3.60m based on typical floor-to-floor height.',
   'Architectural wall elevation not provided.', 'MEDIUM', 'OPEN')
) AS a(qto_no, assumption_no, description, reason, risk_level, status)
JOIN public.qto_items qi ON qi.tender_id = t.id AND qi.qto_no = a.qto_no
ON CONFLICT DO NOTHING;

WITH t AS (SELECT id FROM public.tender_register WHERE tender_no = 'TND-QTO-2026-001')
INSERT INTO public.qto_clarifications (tender_id, qto_item_id, clarification_no, description, reason, status, risk_level, rfi_no)
SELECT t.id, qi.id, c.clarification_no, c.description, c.reason, c.status, c.risk_level, c.rfi_no
FROM t CROSS JOIN (VALUES
  ('QTO-000003', 'QTO-CL-001',
   'Confirm column C-01 height at podium transfer level (3.6m vs 3.0m).',
   'Discrepancy between structural section and column schedule.', 'OPEN', 'HIGH', 'RFI-STR-014')
) AS c(qto_no, clarification_no, description, reason, status, risk_level, rfi_no)
JOIN public.qto_items qi ON qi.tender_id = t.id AND qi.qto_no = c.qto_no
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 10. Review history (QTO-000001)
-- ──────────────────────────────────────────────────────────────────────────
WITH t AS (SELECT id FROM public.tender_register WHERE tender_no = 'TND-QTO-2026-001')
INSERT INTO public.qto_reviews (qto_item_id, reviewer_id, decision, comment, from_status, to_status)
SELECT qi.id, NULL, r.decision, r.comment, r.from_status, r.to_status
FROM t CROSS JOIN (VALUES
  ('QTO-000001', 'approve', 'Verified against S-203 Rev P03. Calculation and deductions correct.', 'SUBMITTED FOR CHECK', 'APPROVED')
) AS r(qto_no, decision, comment, from_status, to_status)
JOIN public.qto_items qi ON qi.tender_id = t.id AND qi.qto_no = r.qto_no
ON CONFLICT DO NOTHING;
