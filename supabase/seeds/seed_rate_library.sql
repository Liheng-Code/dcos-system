-- Company Rate Library seed data (idempotent — safe to re-run)
-- IMPORTANT: Change v_tenant_id to match your tenant before running.
-- This populates the shared company library with 9 build-up rates that can be imported into any tender.

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-0000-0000-000000000000';
  v_rate_id   uuid;
BEGIN

-- ══════════════════════════════════════════════════════════════════════════════
-- STRUCTURAL RATES
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.company_rate_library (tenant_id, code, description, trade, discipline, unit, mode, productivity_factor, net_rate, category_tags, is_active)
VALUES (v_tenant_id, 'LIB-CON-001', 'C25/30 concrete in slab, m3', 'Concrete', 'Structural', 'm3', 'buildup', 1.00, 71.87, ARRAY['structural','concrete'], true)
ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
RETURNING id INTO v_rate_id;

DELETE FROM public.company_rate_library_lines WHERE tenant_id = v_tenant_id AND library_rate_id = v_rate_id;
INSERT INTO public.company_rate_library_lines (tenant_id, library_rate_id, category, price_list_item_desc, unit_price, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id, v_rate_id, 'material', 'Cement, bag 50kg',          4.20,  7.0,   5.0, 30.87,  1),
  (v_tenant_id, v_rate_id, 'material', 'Sand, river washed',       12.00, 0.45,  5.0, 5.67,   2),
  (v_tenant_id, v_rate_id, 'material', 'Aggregate 20mm',           14.00, 0.90,  5.0, 13.23,  3),
  (v_tenant_id, v_rate_id, 'labor',    'Concrete crew',            22.00, 0.80,  0,   17.60,  4),
  (v_tenant_id, v_rate_id, 'plant',    'Mixer 350L',               15.00, 0.30,  0,   4.50,   5);

INSERT INTO public.company_rate_library (tenant_id, code, description, trade, discipline, unit, mode, productivity_factor, net_rate, category_tags, is_active)
VALUES (v_tenant_id, 'LIB-REB-001', 'Rebar cut, bend, fix, kg', 'Rebar', 'Structural', 'kg', 'buildup', 1.00, 0.97, ARRAY['structural','rebar'], true)
ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
RETURNING id INTO v_rate_id;

DELETE FROM public.company_rate_library_lines WHERE tenant_id = v_tenant_id AND library_rate_id = v_rate_id;
INSERT INTO public.company_rate_library_lines (tenant_id, library_rate_id, category, price_list_item_desc, unit_price, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id, v_rate_id, 'material', 'Rebar HD deformed',  0.72, 1.0,    3.0, 0.7416, 1),
  (v_tenant_id, v_rate_id, 'material', 'Binding wire',       1.10, 0.015,  3.0, 0.0165, 2),
  (v_tenant_id, v_rate_id, 'labor',    'Steel fixer crew',   18.00, 0.012, 0,   0.216,  3);

INSERT INTO public.company_rate_library (tenant_id, code, description, trade, discipline, unit, mode, productivity_factor, net_rate, category_tags, is_active)
VALUES (v_tenant_id, 'LIB-FWK-001', 'Formwork to soffit, 4 reuses, m2', 'Formwork', 'Structural', 'm2', 'buildup', 0.90, 9.81, ARRAY['structural','formwork'], true)
ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
RETURNING id INTO v_rate_id;

DELETE FROM public.company_rate_library_lines WHERE tenant_id = v_tenant_id AND library_rate_id = v_rate_id;
INSERT INTO public.company_rate_library_lines (tenant_id, library_rate_id, category, price_list_item_desc, unit_price, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id, v_rate_id, 'material', 'Plywood 18mm formply',     18.00, 0.09, 10.0, 1.782, 1),
  (v_tenant_id, v_rate_id, 'material', 'Timber support 50x100',    0.60,  2.5,  5.0,  1.575, 2),
  (v_tenant_id, v_rate_id, 'material', 'Nails and form ties',      2.20,  0.10, 5.0,  0.231, 3),
  (v_tenant_id, v_rate_id, 'labor',    'Carpenter crew',           16.00, 0.35, 0,    5.60,  4);

-- ══════════════════════════════════════════════════════════════════════════════
-- ARCHITECTURAL RATES
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.company_rate_library (tenant_id, code, description, trade, discipline, unit, mode, productivity_factor, net_rate, category_tags, is_active)
VALUES (v_tenant_id, 'LIB-BLK-001', 'Blockwork 150mm in mortar, m2', 'Masonry', 'Architecture', 'm2', 'buildup', 1.00, 14.02, ARRAY['architectural','masonry'], true)
ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
RETURNING id INTO v_rate_id;

DELETE FROM public.company_rate_library_lines WHERE tenant_id = v_tenant_id AND library_rate_id = v_rate_id;
INSERT INTO public.company_rate_library_lines (tenant_id, library_rate_id, category, price_list_item_desc, unit_price, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id, v_rate_id, 'material', 'Concrete block 150mm',  0.55, 12.5, 5.0, 7.1875, 1),
  (v_tenant_id, v_rate_id, 'material', 'Cement, bag 50kg',      4.20, 0.20, 5.0, 0.882,  2),
  (v_tenant_id, v_rate_id, 'material', 'Sand, river washed',    12.00, 0.025, 5.0, 0.315, 3),
  (v_tenant_id, v_rate_id, 'labor',    'Mason crew',            14.00, 0.40, 0,   5.60,   4);

INSERT INTO public.company_rate_library (tenant_id, code, description, trade, discipline, unit, mode, productivity_factor, net_rate, category_tags, is_active)
VALUES (v_tenant_id, 'LIB-PLA-001', 'Cement plaster 15mm internal, m2', 'Plaster', 'Architecture', 'm2', 'buildup', 0.95, 4.78, ARRAY['architectural','plaster'], true)
ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
RETURNING id INTO v_rate_id;

DELETE FROM public.company_rate_library_lines WHERE tenant_id = v_tenant_id AND library_rate_id = v_rate_id;
INSERT INTO public.company_rate_library_lines (tenant_id, library_rate_id, category, price_list_item_desc, unit_price, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id, v_rate_id, 'material', 'Cement, bag 50kg',      4.20,  0.11,  8.0, 0.49696, 1),
  (v_tenant_id, v_rate_id, 'material', 'Sand, river washed',    12.00, 0.012, 8.0, 0.15456, 2),
  (v_tenant_id, v_rate_id, 'labor',    'Plasterer crew',        14.00, 0.28,  0,   3.92,   3);

INSERT INTO public.company_rate_library (tenant_id, code, description, trade, discipline, unit, mode, productivity_factor, net_rate, category_tags, is_active)
VALUES (v_tenant_id, 'LIB-TIL-001', 'Porcelain floor tile 600x600, m2', 'Tiling', 'Architecture', 'm2', 'buildup', 0.85, 21.33, ARRAY['architectural','tiling'], true)
ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
RETURNING id INTO v_rate_id;

DELETE FROM public.company_rate_library_lines WHERE tenant_id = v_tenant_id AND library_rate_id = v_rate_id;
INSERT INTO public.company_rate_library_lines (tenant_id, library_rate_id, category, price_list_item_desc, unit_price, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id, v_rate_id, 'material', 'Porcelain tile 600x600',   9.50, 1.0,  7.0, 10.165, 1),
  (v_tenant_id, v_rate_id, 'material', 'Tile adhesive, bag 20kg',  6.80, 0.22, 5.0, 1.5708, 2),
  (v_tenant_id, v_rate_id, 'material', 'Tile grout',               3.50, 0.05, 5.0, 0.18375, 3),
  (v_tenant_id, v_rate_id, 'labor',    'Tiler crew',               16.00, 0.50, 0,   8.00,   4);

-- ══════════════════════════════════════════════════════════════════════════════
-- MEP RATES
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.company_rate_library (tenant_id, code, description, trade, discipline, unit, mode, productivity_factor, net_rate, category_tags, is_active)
VALUES (v_tenant_id, 'LIB-MEP-001', 'Lighting point complete, ea', 'Electrical', 'MEP', 'ea', 'buildup', 1.00, 27.74, ARRAY['mep','electrical'], true)
ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
RETURNING id INTO v_rate_id;

DELETE FROM public.company_rate_library_lines WHERE tenant_id = v_tenant_id AND library_rate_id = v_rate_id;
INSERT INTO public.company_rate_library_lines (tenant_id, library_rate_id, category, price_list_item_desc, unit_price, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id, v_rate_id, 'material', 'PVC conduit 20mm',        0.45, 8.0,  5.0, 3.78,   1),
  (v_tenant_id, v_rate_id, 'material', 'Cable 2.5mm2 Cu',         0.38, 18.0, 3.0, 7.0332, 2),
  (v_tenant_id, v_rate_id, 'material', 'Back box, galvanised',    0.55, 1.0,  2.0, 0.561,  3),
  (v_tenant_id, v_rate_id, 'material', 'Switch, 1-gang',          2.80, 1.0,  2.0, 2.856,  4),
  (v_tenant_id, v_rate_id, 'labor',    'Electrician',             15.00, 0.90, 0,   13.50,  5);

INSERT INTO public.company_rate_library (tenant_id, code, description, trade, discipline, unit, mode, productivity_factor, net_rate, category_tags, is_active)
VALUES (v_tenant_id, 'LIB-MEP-002', 'PPR pipe 25mm installed, m', 'Plumbing', 'MEP', 'm', 'buildup', 1.00, 3.90, ARRAY['mep','plumbing'], true)
ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
RETURNING id INTO v_rate_id;

DELETE FROM public.company_rate_library_lines WHERE tenant_id = v_tenant_id AND library_rate_id = v_rate_id;
INSERT INTO public.company_rate_library_lines (tenant_id, library_rate_id, category, price_list_item_desc, unit_price, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id, v_rate_id, 'material', 'PPR pipe 25mm PN20',       1.20, 1.0,  5.0, 1.26,   1),
  (v_tenant_id, v_rate_id, 'material', 'PPR fittings, average',    0.85, 0.6,  5.0, 0.5355, 2),
  (v_tenant_id, v_rate_id, 'labor',    'Plumber',                  14.00, 0.15, 0,   2.10,   3);

INSERT INTO public.company_rate_library (tenant_id, code, description, trade, discipline, unit, mode, productivity_factor, net_rate, category_tags, is_active)
VALUES (v_tenant_id, 'LIB-MEP-003', 'Cable tray 200mm installed, m', 'Electrical', 'MEP', 'm', 'buildup', 1.00, 10.55, ARRAY['mep','electrical'], true)
ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
RETURNING id INTO v_rate_id;

DELETE FROM public.company_rate_library_lines WHERE tenant_id = v_tenant_id AND library_rate_id = v_rate_id;
INSERT INTO public.company_rate_library_lines (tenant_id, library_rate_id, category, price_list_item_desc, unit_price, qty_per_unit, wastage_pct, line_total, sort_order) VALUES
  (v_tenant_id, v_rate_id, 'material', 'Cable tray 200mm galv.',  4.50, 1.0,  5.0, 4.725, 1),
  (v_tenant_id, v_rate_id, 'material', 'Tray support set',        1.80, 0.7,  5.0, 1.323, 2),
  (v_tenant_id, v_rate_id, 'labor',    'Electrician',             15.00, 0.30, 0,   4.50,  3);

END $$;
