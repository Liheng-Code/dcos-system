-- Seed data: Price List, Unit Rates, and Tender BOQ for ARC / STR / MEP
-- IMPORTANT: Change the tender_id below to your actual tender UUID before running.

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-0000-0000-000000000000';
  v_tender_id uuid := 'b92fe2f1-504a-4198-b07c-2fc30c9f8a2d';
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- PRICE LIST ITEMS (29 resources across STR, ARC, MEP)
-- ══════════════════════════════════════════════════════════════════════════════

-- STR — Structural resources
INSERT INTO public.tender_price_list_items (tenant_id, tender_id, code, description, category, unit, unit_price, currency, supplier_name) VALUES
  (v_tenant_id, v_tender_id, 'PL-CEM-01', 'Cement, bag 50kg',         'material', 'bag',  4.20,   'USD', 'KH Cement Co'),
  (v_tenant_id, v_tender_id, 'PL-SND-01', 'Sand, river washed',       'material', 'm3',   12.00,  'USD', 'Mekong Aggregates'),
  (v_tenant_id, v_tender_id, 'PL-AGG-01', 'Aggregate 20mm',           'material', 'm3',   14.00,  'USD', 'Mekong Aggregates'),
  (v_tenant_id, v_tender_id, 'PL-REB-01', 'Rebar HD deformed',        'material', 'kg',   0.72,   'USD', 'Steel Trading Ltd'),
  (v_tenant_id, v_tender_id, 'PL-BWR-01', 'Binding wire',             'material', 'kg',   1.10,   'USD', 'Steel Trading Ltd'),
  (v_tenant_id, v_tender_id, 'PL-PLY-01', 'Plywood 18mm formply',     'material', 'sheet', 18.00,  'USD', 'Timber House'),
  (v_tenant_id, v_tender_id, 'PL-TMB-01', 'Timber support 50x100',    'material', 'm',    0.60,   'USD', 'Timber House'),
  (v_tenant_id, v_tender_id, 'PL-NLS-01', 'Nails and form ties',      'material', 'kg',   2.20,   'USD', 'Hardware Mart'),
  (v_tenant_id, v_tender_id, 'PL-LAB-03', 'Concrete crew',            'labor',    'hour', 22.00,  'USD', NULL),
  (v_tenant_id, v_tender_id, 'PL-LAB-04', 'Steel fixer crew',         'labor',    'hour', 18.00,  'USD', NULL),
  (v_tenant_id, v_tender_id, 'PL-LAB-05', 'Carpenter crew',           'labor',    'hour', 16.00,  'USD', NULL),
  (v_tenant_id, v_tender_id, 'PL-PLT-02', 'Mixer 350L',               'plant',    'hour', 15.00,  'USD', NULL);

-- ARC — Architectural resources
INSERT INTO public.tender_price_list_items (tenant_id, tender_id, code, description, category, unit, unit_price, currency, supplier_name) VALUES
  (v_tenant_id, v_tender_id, 'PL-BLK-01', 'Concrete block 150mm',     'material', 'pc',   0.55,   'USD', 'Block Factory PP'),
  (v_tenant_id, v_tender_id, 'PL-TIL-01', 'Porcelain tile 600x600',   'material', 'm2',   9.50,   'USD', 'Ceramic World'),
  (v_tenant_id, v_tender_id, 'PL-ADH-01', 'Tile adhesive, bag 20kg',   'material', 'bag',  6.80,   'USD', 'Ceramic World'),
  (v_tenant_id, v_tender_id, 'PL-GRT-01', 'Tile grout',               'material', 'kg',   3.50,   'USD', 'Ceramic World'),
  (v_tenant_id, v_tender_id, 'PL-LAB-06', 'Mason crew',               'labor',    'hour', 14.00,  'USD', NULL),
  (v_tenant_id, v_tender_id, 'PL-LAB-07', 'Plasterer crew',           'labor',    'hour', 14.00,  'USD', NULL),
  (v_tenant_id, v_tender_id, 'PL-LAB-08', 'Tiler crew',               'labor',    'hour', 16.00,  'USD', NULL);

-- MEP — Mechanical / Electrical / Plumbing resources
INSERT INTO public.tender_price_list_items (tenant_id, tender_id, code, description, category, unit, unit_price, currency, supplier_name) VALUES
  (v_tenant_id, v_tender_id, 'PL-CND-01', 'PVC conduit 20mm',         'material', 'm',    0.45,   'USD', 'Elec Supply KH'),
  (v_tenant_id, v_tender_id, 'PL-CBL-01', 'Cable 2.5mm2 Cu',          'material', 'm',    0.38,   'USD', 'Elec Supply KH'),
  (v_tenant_id, v_tender_id, 'PL-BOX-01', 'Back box, galvanised',     'material', 'ea',   0.55,   'USD', 'Elec Supply KH'),
  (v_tenant_id, v_tender_id, 'PL-SWT-01', 'Switch, 1-gang',           'material', 'ea',   2.80,   'USD', 'Elec Supply KH'),
  (v_tenant_id, v_tender_id, 'PL-PPR-01', 'PPR pipe 25mm PN20',       'material', 'm',    1.20,   'USD', 'Pipe Center'),
  (v_tenant_id, v_tender_id, 'PL-PFT-01', 'PPR fittings, average',    'material', 'ea',   0.85,   'USD', 'Pipe Center'),
  (v_tenant_id, v_tender_id, 'PL-TRY-01', 'Cable tray 200mm galv.',   'material', 'm',    4.50,   'USD', 'Elec Supply KH'),
  (v_tenant_id, v_tender_id, 'PL-TRS-01', 'Tray support set',         'material', 'set',  1.80,   'USD', 'Elec Supply KH'),
  (v_tenant_id, v_tender_id, 'PL-LAB-09', 'Electrician',              'labor',    'hour', 15.00,  'USD', NULL),
  (v_tenant_id, v_tender_id, 'PL-LAB-10', 'Plumber',                  'labor',    'hour', 14.00,  'USD', NULL);

-- ══════════════════════════════════════════════════════════════════════════════
-- UNIT RATES (9 build-up rates, 3 per discipline)
-- ══════════════════════════════════════════════════════════════════════════════

-- STR rates
INSERT INTO public.tender_unit_rates (tenant_id, tender_id, code, description, trade, unit, mode, productivity_factor, net_rate, is_active) VALUES
  (v_tenant_id, v_tender_id, 'UR-CON-001', 'C25/30 concrete in slab, m3',          'Concrete', 'm3', 'buildup', 1.00,  71.87,  true),
  (v_tenant_id, v_tender_id, 'UR-REB-001', 'Rebar cut, bend, fix, kg',             'Rebar',    'kg', 'buildup', 1.00,  0.97,   true),
  (v_tenant_id, v_tender_id, 'UR-FWK-001', 'Formwork to soffit, 4 reuses, m2',     'Formwork', 'm2', 'buildup', 0.90,  9.81,   true);

-- ARC rates
INSERT INTO public.tender_unit_rates (tenant_id, tender_id, code, description, trade, unit, mode, productivity_factor, net_rate, is_active) VALUES
  (v_tenant_id, v_tender_id, 'UR-BLK-001', 'Blockwork 150mm in mortar, m2',        'Masonry',  'm2', 'buildup', 1.00,  14.02,  true),
  (v_tenant_id, v_tender_id, 'UR-PLA-001', 'Cement plaster 15mm internal, m2',     'Plaster',  'm2', 'buildup', 0.95,  4.78,   true),
  (v_tenant_id, v_tender_id, 'UR-TIL-001', 'Porcelain floor tile 600x600, m2',     'Tiling',   'm2', 'buildup', 0.85,  21.33,  true);

-- MEP rates
INSERT INTO public.tender_unit_rates (tenant_id, tender_id, code, description, trade, unit, mode, productivity_factor, net_rate, is_active) VALUES
  (v_tenant_id, v_tender_id, 'UR-MEP-001', 'Lighting point complete, ea',           'Electrical', 'ea', 'buildup', 1.00,  27.74,  true),
  (v_tenant_id, v_tender_id, 'UR-MEP-002', 'PPR pipe 25mm installed, m',           'Plumbing',  'm',  'buildup', 1.00,  3.90,   true),
  (v_tenant_id, v_tender_id, 'UR-MEP-003', 'Cable tray 200mm installed, m',        'Electrical', 'm',  'buildup', 1.00,  10.55,  true);

-- ══════════════════════════════════════════════════════════════════════════════
-- UNIT RATE LINES (build-up composition)
-- ══════════════════════════════════════════════════════════════════════════════

-- UR-CON-001: C25/30 concrete in slab (expected net_rate = 71.87)
INSERT INTO public.tender_unit_rate_lines (tenant_id, unit_rate_id, category, price_list_item_id, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-CON-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-CEM-01'),
   7.0, 5.0, 30.87, 1),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-CON-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-SND-01'),
   0.45, 5.0, 5.67, 2),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-CON-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-AGG-01'),
   0.90, 5.0, 13.23, 3),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-CON-001'),
   'labor',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-LAB-03'),
   0.80, 0, 17.60, 4),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-CON-001'),
   'plant',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-PLT-02'),
   0.30, 0, 4.50, 5);

-- UR-REB-001: Rebar cut, bend, fix (expected net_rate = 0.97)
INSERT INTO public.tender_unit_rate_lines (tenant_id, unit_rate_id, category, price_list_item_id, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-REB-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-REB-01'),
   1.0, 3.0, 0.7416, 1),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-REB-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-BWR-01'),
   0.015, 3.0, 0.0165, 2),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-REB-001'),
   'labor',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-LAB-04'),
   0.012, 0, 0.216, 3);

-- UR-FWK-001: Formwork to soffit (expected net_rate = 9.81)
INSERT INTO public.tender_unit_rate_lines (tenant_id, unit_rate_id, category, price_list_item_id, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-FWK-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-PLY-01'),
   0.09, 10.0, 1.782, 1),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-FWK-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-TMB-01'),
   2.5, 5.0, 1.575, 2),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-FWK-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-NLS-01'),
   0.10, 5.0, 0.231, 3),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-FWK-001'),
   'labor',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-LAB-05'),
   0.35, 0, 5.60, 4);

-- UR-BLK-001: Blockwork 150mm (expected net_rate = 14.02)
INSERT INTO public.tender_unit_rate_lines (tenant_id, unit_rate_id, category, price_list_item_id, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-BLK-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-BLK-01'),
   12.5, 5.0, 7.1875, 1),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-BLK-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-CEM-01'),
   0.20, 5.0, 0.882, 2),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-BLK-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-SND-01'),
   0.025, 5.0, 0.315, 3),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-BLK-001'),
   'labor',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-LAB-06'),
   0.40, 0, 5.60, 4);

-- UR-PLA-001: Cement plaster 15mm (expected net_rate = 4.78)
INSERT INTO public.tender_unit_rate_lines (tenant_id, unit_rate_id, category, price_list_item_id, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-PLA-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-CEM-01'),
   0.11, 8.0, 0.49696, 1),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-PLA-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-SND-01'),
   0.012, 8.0, 0.15456, 2),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-PLA-001'),
   'labor',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-LAB-07'),
   0.28, 0, 3.92, 3);

-- UR-TIL-001: Porcelain floor tile (expected net_rate = 21.33)
INSERT INTO public.tender_unit_rate_lines (tenant_id, unit_rate_id, category, price_list_item_id, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-TIL-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-TIL-01'),
   1.0, 7.0, 10.165, 1),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-TIL-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-ADH-01'),
   0.22, 5.0, 1.5708, 2),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-TIL-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-GRT-01'),
   0.05, 5.0, 0.18375, 3),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-TIL-001'),
   'labor',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-LAB-08'),
   0.50, 0, 8.00, 4);

-- UR-MEP-001: Lighting point complete (expected net_rate = 27.74)
INSERT INTO public.tender_unit_rate_lines (tenant_id, unit_rate_id, category, price_list_item_id, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-CND-01'),
   8.0, 5.0, 3.78, 1),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-CBL-01'),
   18.0, 3.0, 7.0332, 2),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-BOX-01'),
   1.0, 2.0, 0.561, 3),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-001'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-SWT-01'),
   1.0, 2.0, 2.856, 4),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-001'),
   'labor',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-LAB-09'),
   0.90, 0, 13.50, 5);

-- UR-MEP-002: PPR pipe 25mm (expected net_rate = 3.90)
INSERT INTO public.tender_unit_rate_lines (tenant_id, unit_rate_id, category, price_list_item_id, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-002'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-PPR-01'),
   1.0, 5.0, 1.26, 1),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-002'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-PFT-01'),
   0.6, 5.0, 0.5355, 2),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-002'),
   'labor',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-LAB-10'),
   0.15, 0, 2.10, 3);

-- UR-MEP-003: Cable tray 200mm (expected net_rate = 10.55)
INSERT INTO public.tender_unit_rate_lines (tenant_id, unit_rate_id, category, price_list_item_id, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-003'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-TRY-01'),
   1.0, 5.0, 4.725, 1),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-003'),
   'material',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-TRS-01'),
   0.7, 5.0, 1.323, 2),
  (v_tenant_id,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-003'),
   'labor',
   (SELECT id FROM public.tender_price_list_items WHERE tender_id = v_tender_id AND code = 'PL-LAB-09'),
   0.30, 0, 4.50, 3);

-- ══════════════════════════════════════════════════════════════════════════════
-- TENDER BOQ ITEMS (10 items: 9 linked + 1 manual subcon)
-- ══════════════════════════════════════════════════════════════════════════════

-- STR section
INSERT INTO public.tender_boq_items (tender_id, section, item_code, description, unit, quantity, unit_rate, unit_rate_id, is_manual_rate, sourcing) VALUES
  (v_tender_id, 'STR — Structure', 'STR-001', 'Concrete C25/30 to slabs, L1-L10',      'm3', 500,  71.87,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-CON-001'),
   false, 'self'),
  (v_tender_id, 'STR — Structure', 'STR-002', 'Rebar to slabs and beams',               'kg', 45000, 0.97,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-REB-001'),
   false, 'self'),
  (v_tender_id, 'STR — Structure', 'STR-003', 'Formwork to slab soffits',               'm2', 3200, 9.81,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-FWK-001'),
   false, 'self');

-- ARC section
INSERT INTO public.tender_boq_items (tender_id, section, item_code, description, unit, quantity, unit_rate, unit_rate_id, is_manual_rate, sourcing) VALUES
  (v_tender_id, 'ARC — Architecture', 'ARC-001', 'Blockwork 150mm internal walls',       'm2', 2800, 14.02,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-BLK-001'),
   false, 'self'),
  (v_tender_id, 'ARC — Architecture', 'ARC-002', 'Cement plaster to internal walls',     'm2', 5600, 4.78,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-PLA-001'),
   false, 'self'),
  (v_tender_id, 'ARC — Architecture', 'ARC-003', 'Porcelain floor tiling',               'm2', 1900, 21.33,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-TIL-001'),
   false, 'self');

-- MEP section (8 linked + 1 manual subcon)
INSERT INTO public.tender_boq_items (tender_id, section, item_code, description, unit, quantity, unit_rate, unit_rate_id, is_manual_rate, sourcing) VALUES
  (v_tender_id, 'MEP — Services', 'MEP-001', 'Lighting points complete',                'ea', 850,  27.74,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-001'),
   false, 'self'),
  (v_tender_id, 'MEP — Services', 'MEP-002', 'PPR pipe 25mm, cold water',               'm',  2400, 3.90,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-002'),
   false, 'self'),
  (v_tender_id, 'MEP — Services', 'MEP-003', 'Cable tray 200mm',                        'm',  1100, 10.55,
   (SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id AND code = 'UR-MEP-003'),
   false, 'self'),
  (v_tender_id, 'MEP — Services', 'MEP-004', 'Fire fighting installation (sub quote FS-Q2)', 'lot', 1, 18500.00,
   NULL, true, 'subcon');

END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION: Expected totals
-- Direct  (Σ self items)   = 262,072.00
-- Subcon  (Σ subcon items) =  18,500.00
-- ══════════════════════════════════════════════════════════════════════════════
