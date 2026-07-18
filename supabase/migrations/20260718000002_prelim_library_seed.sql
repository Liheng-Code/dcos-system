-- Seed data for Preliminaries Cost Library.
-- Source: Budget_Code_Updated.xlsx — Preliminaries build-up sheets.
-- Formula references P01-P12 correspond to Site Data parameters.

-- ─── Library Items ──────────────────────────────────────────────────────────

-- Top-level sections (parent_code = NULL)
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  (NULL, 'Z.01', 'TEMPORARY WORKS', 'Sum', 'sum_children', 1, NULL, 1, 'temporary_works'),
  (NULL, 'Z.30', 'SITE STAFF & OVERHEADS', 'Sum', 'sum_children', 1, NULL, 2, 'staff'),
  (NULL, 'Z.50', 'DESIGN EXPENSES', 'Sum', 'sum_children', 1, NULL, 3, 'design'),
  (NULL, 'Z.70', 'RISKS AND OPPORTUNITIES', 'Sum', 'sum_children', 0, NULL, 4, 'risk')
on conflict (code) do nothing;

-- Z.01 subsections
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.01', 'Z.01.01', 'Site Preparation', 'Sum', 'sum_children', 1, NULL, 1, 'temporary_works'),
  ('Z.01', 'Z.01.02', 'General Protection', 'Sum', 'sum_children', 1, NULL, 2, 'temporary_works'),
  ('Z.01', 'Z.01.03', 'Temporary Building', 'Sum', 'sum_children', 1, NULL, 3, 'temporary_works'),
  ('Z.01', 'Z.01.04', 'Temporary Site Labor', 'Sum', 'sum_children', 1, NULL, 4, 'temporary_works'),
  ('Z.01', 'Z.01.05', 'Machinery & Vertical Transport', 'Sum', 'sum_children', 1, NULL, 5, 'temporary_works'),
  ('Z.01', 'Z.01.06', 'Light Equipment & Hand Tools', 'Sum', 'sum_children', 1, NULL, 6, 'temporary_works'),
  ('Z.01', 'Z.01.07', 'Temporary Electrical / Plumbing / Drainage', 'Sum', 'sum_children', 1, NULL, 7, 'temporary_works'),
  ('Z.01', 'Z.01.08', 'Safety & Environment Control', 'Sum', 'sum_children', 1, NULL, 8, 'temporary_works')
on conflict (code) do nothing;

-- Z.01.01 Site Preparation items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.01.01', 'Z.01.01.01', 'Mobilization', 'Item', 'fixed', 1, NULL, 1, 'temporary_works'),
  ('Z.01.01', 'Z.01.01.02', 'Demobilization & site clearance', 'Item', 'fixed', 1, NULL, 2, 'temporary_works'),
  ('Z.01.01', 'Z.01.01.03', 'Temporary access & roads', 'Item', 'fixed', 1, NULL, 3, 'temporary_works'),
  ('Z.01.01', 'Z.01.01.04', 'Setting out & ongoing survey works', 'Month', 'param', 1, 'P07', 4, 'temporary_works'),
  ('Z.01.01', 'Z.01.01.05', 'Site signage & project board', 'Item', 'fixed', 1, NULL, 5, 'temporary_works'),
  ('Z.01.01', 'Z.01.01.06', 'Traffic management & road occupation', 'Item', 'fixed', 1, NULL, 6, 'temporary_works')
on conflict (code) do nothing;

-- Z.01.02 General Protection items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.01.02', 'Z.01.02.01', 'Temporary fencing & hoarding', 'Item', 'fixed', 1, NULL, 1, 'temporary_works'),
  ('Z.01.02', 'Z.01.02.02', 'Temporary sheet pile, length 6m', 'm', 'fixed', 95, NULL, 2, 'temporary_works'),
  ('Z.01.02', 'Z.01.02.03', 'Safety net to building perimeter', 'Item', 'fixed', 1, NULL, 3, 'temporary_works'),
  ('Z.01.02', 'Z.01.02.04', 'Edge protection & handrails', 'Floor', 'param', 1, 'P11', 4, 'temporary_works'),
  ('Z.01.02', 'Z.01.02.05', 'Protection of completed works', 'Item', 'fixed', 1, NULL, 5, 'temporary_works'),
  ('Z.01.02', 'Z.01.02.06', 'Monsoon protection & site drainage', 'Month', 'param', 1, 'P07', 6, 'temporary_works'),
  ('Z.01.02', 'Z.01.02.07', 'Dewatering during substructure', 'Month', 'fixed', 4, NULL, 7, 'temporary_works')
on conflict (code) do nothing;

-- Z.01.03 Temporary Building items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.01.03', 'Z.01.03.01', 'Site office, store & welfare facilities', 'Month', 'param', 1, 'P07', 1, 'temporary_works'),
  ('Z.01.03', 'Z.01.03.02', 'Temporary worker toilets & sanitation', 'Month', 'param', 1, 'P07', 2, 'temporary_works'),
  ('Z.01.03', 'Z.01.03.03', 'First aid room & facilities', 'Item', 'fixed', 1, NULL, 3, 'temporary_works'),
  ('Z.01.03', 'Z.01.03.04', 'Washing bay / wheel wash', 'Item', 'fixed', 1, NULL, 4, 'temporary_works')
on conflict (code) do nothing;

-- Z.01.04 Temporary Site Labor items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.01.04', 'Z.01.04.01', 'Site cleaning & waste removal', 'Month', 'param', 1, 'P07', 1, 'temporary_works'),
  ('Z.01.04', 'Z.01.04.02', 'Final builder''s clean at handover', 'Item', 'fixed', 1, NULL, 2, 'temporary_works')
on conflict (code) do nothing;

-- Z.01.05 Machinery & Vertical Transport items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.01.05', 'Z.01.05.01', 'Tower crane rental', 'Month', 'fixed', 16, NULL, 1, 'temporary_works'),
  ('Z.01.05', 'Z.01.05.02', 'Tower crane foundation, erection, dismantle & test', 'Item', 'fixed', 1, NULL, 2, 'temporary_works'),
  ('Z.01.05', 'Z.01.05.03', 'Passenger / material hoist rental', 'Month', 'param', 1, 'P08', 3, 'temporary_works'),
  ('Z.01.05', 'Z.01.05.04', 'Hoist erection & dismantling', 'Item', 'fixed', 1, NULL, 4, 'temporary_works'),
  ('Z.01.05', 'Z.01.05.05', 'Concrete pump provision', 'Item', 'fixed', 0, NULL, 5, 'temporary_works'),
  ('Z.01.05', 'Z.01.05.06', 'External scaffolding to facade', 'm2', 'param', 1, 'P06', 6, 'temporary_works'),
  ('Z.01.05', 'Z.01.05.07', 'Back-propping / falsework for PT slabs', 'Floor', 'param', 1, 'P04', 7, 'temporary_works')
on conflict (code) do nothing;

-- Z.01.06 Light Equipment items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.01.06', 'Z.01.06.01', 'Small plant, light equipment & hand tools', 'Month', 'param', 1, 'P07', 1, 'temporary_works')
on conflict (code) do nothing;

-- Z.01.07 Temporary Utilities items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.01.07', 'Z.01.07.01', 'Temporary electricity — installation, connection & removal', 'Item', 'fixed', 1, NULL, 1, 'temporary_works'),
  ('Z.01.07', 'Z.01.07.02', 'Temporary electricity — consumption & maintenance', 'Month', 'param', 1, 'P07', 2, 'temporary_works'),
  ('Z.01.07', 'Z.01.07.03', 'Temporary water — installation, connection & removal', 'Item', 'fixed', 1, NULL, 3, 'temporary_works'),
  ('Z.01.07', 'Z.01.07.04', 'Temporary water — consumption & maintenance', 'Month', 'param', 1, 'P07', 4, 'temporary_works')
on conflict (code) do nothing;

-- Z.01.08 Safety & Environment items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.01.08', 'Z.01.08.01', 'Health, safety provisions & PPE', 'Month', 'param', 1, 'P07', 1, 'temporary_works'),
  ('Z.01.08', 'Z.01.08.02', 'Site security incl. guards & CCTV', 'Month', 'param', 1, 'P07', 2, 'temporary_works'),
  ('Z.01.08', 'Z.01.08.03', 'Material & concrete testing (QA/QC)', 'Item', 'fixed', 1, NULL, 3, 'temporary_works')
on conflict (code) do nothing;

-- Z.30 Site Staff & Overheads items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.30', 'Z.30.01', 'Foreign country employees', 'Sum', 'fixed', 1, NULL, 1, 'staff'),
  ('Z.30', 'Z.30.02', 'Local country employees', 'Sum', 'fixed', 1, NULL, 2, 'staff'),
  ('Z.30', 'Z.30.03', 'Other personnel', 'Item', 'fixed', 0, NULL, 3, 'staff'),
  ('Z.30', 'Z.30.04', 'Welfare expense', 'Month', 'param', 1, 'P07', 4, 'staff'),
  ('Z.30', 'Z.30.05', 'Office supplies expenses', 'Month', 'param', 1, 'P07', 5, 'staff'),
  ('Z.30', 'Z.30.06', 'Communication & travel expense', 'Month', 'param', 1, 'P07', 6, 'staff'),
  ('Z.30', 'Z.30.07', 'Social expense', 'Month', 'param', 1, 'P07', 7, 'staff'),
  ('Z.30', 'Z.30.08', 'Taxes & public imposition', 'Item', 'fixed', 0, NULL, 8, 'staff'),
  ('Z.30', 'Z.30.09', 'Meeting expense', 'Month', 'param', 1, 'P07', 9, 'staff'),
  ('Z.30', 'Z.30.10', 'Miscellaneous expense', 'Month', 'param', 1, 'P07', 10, 'staff')
on conflict (code) do nothing;

-- Z.50 Design Expenses items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.50', 'Z.50.01', 'Shop drawings', 'Item', 'fixed', 1, NULL, 1, 'design'),
  ('Z.50', 'Z.50.02', 'As-built drawings', 'Item', 'fixed', 1, NULL, 2, 'design'),
  ('Z.50', 'Z.50.03', 'Temporary works design', 'Item', 'fixed', 1, NULL, 3, 'design')
on conflict (code) do nothing;

-- Z.70 Risks items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.70', 'Z.70.01', 'Risk allowance', 'Item', 'fixed', 0, NULL, 1, 'risk')
on conflict (code) do nothing;

-- ─── Components ─────────────────────────────────────────────────────────────
-- Components are linked to leaf items (level 3 codes like Z.01.01.01)
-- via the item_id FK. We use a CTE to resolve item IDs from codes.

-- Z.01.01.01 Mobilization ($10,500)
with item as (select id from public.prelim_library_items where code = 'Z.01.01.01')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Low-bed & truck transport trips (plant in)', '12', 'trip', 400, 1),
  ('Crane lifts for site establishment', '4', 'lift', 300, 2),
  ('Site setup labor', '100', 'man-day', 12, 3),
  ('Utility applications & administration', '1', 'lot', 1000, 4),
  ('Storage yard & hardstand setup', '1', 'lot', 1500, 5),
  ('Survey control points establishment', '1', 'lot', 800, 6)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.01.02 Demobilization ($6,460)
with item as (select id from public.prelim_library_items where code = 'Z.01.01.02')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Transport trips out (plant removal)', '10', 'trip', 400, 1),
  ('Dismantling labor', '80', 'man-day', 12, 2),
  ('Site reinstatement & final clearance', '1', 'lot', 1500, 3)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.01.03 Temporary access ($7,400)
with item as (select id from public.prelim_library_items where code = 'Z.01.01.03')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Laterite/gravel access road', '300', 'm2', 18, 1),
  ('Hardstand at loading/unloading area', '100', 'm2', 20, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.01.04 Setting out ($400/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.01.04')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Total station & level rental', '1', 'mo', 250, 1),
  ('Pegs, paint, consumables', '1', 'mo', 60, 2),
  ('Periodic verification survey', '1', 'mo', 90, 3)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.01.05 Site signage ($800)
with item as (select id from public.prelim_library_items where code = 'Z.01.01.05')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Project board 3m x 2m incl. frame', '1', 'no', 500, 1),
  ('Safety & directional signage', '1', 'lot', 300, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.01.06 Traffic management ($3,000)
with item as (select id from public.prelim_library_items where code = 'Z.01.01.06')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Flagmen during concrete pours', '60', 'man-day', 15, 1),
  ('Road occupation permits', '6', 'no', 250, 2),
  ('Cones, barriers, warning lights', '1', 'lot', 600, 3)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.02.01 Temporary fencing ($7,950)
with item as (select id from public.prelim_library_items where code = 'Z.01.02.01')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Corrugated hoarding 2.4m high on site perimeter', 'P01', 'm', 55, 1),
  ('Double gates', '2', 'no', 400, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.02.02 Sheet pile ($180/m)
with item as (select id from public.prelim_library_items where code = 'Z.01.02.02')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Drive & extract (subcontract)', '1', 'm', 140, 1),
  ('Rental during excavation (4 months)', '4', 'm-mo', 10, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.02.03 Safety net ($6,000)
with item as (select id from public.prelim_library_items where code = 'Z.01.02.03')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Net band, 2 lifts rotating up building', '1400', 'm2', 4, 1),
  ('Installation & shifting labor', '1', 'lot', 400, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.02.04 Edge protection ($700/floor)
with item as (select id from public.prelim_library_items where code = 'Z.01.02.04')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Guardrail to slab edge (building perimeter)', 'P03', 'm', 5, 1),
  ('Posts, fixing & shifting labor', '1', 'floor', 125, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.02.05 Protection of completed works ($4,000)
with item as (select id from public.prelim_library_items where code = 'Z.01.02.05')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Floor/lobby/stair protection sheeting', '600', 'm2', 5, 1),
  ('Corner guards, tapes, miscellaneous', '1', 'lot', 1000, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.02.06 Monsoon protection ($250/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.02.06')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Submersible pumps rental', '2', 'no', 60, 1),
  ('Sandbags & drainage channels', '1', 'mo', 80, 2),
  ('Attendance labor', '1', 'mo', 50, 3)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.02.07 Dewatering ($900/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.02.07')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Dewatering pumps rental', '2', 'no', 150, 1),
  ('Fuel / power', '1', 'mo', 300, 2),
  ('Standby attendance', '1', 'mo', 300, 3)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.03.01 Site office ($1,200/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.03.01')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Office containers', '3', 'no', 250, 1),
  ('Store container', '1', 'no', 150, 2),
  ('Furniture, AC, IT (amortized)', '1', 'mo', 200, 3),
  ('Workers shelter / canteen', '1', 'mo', 100, 4)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.03.02 Worker toilets ($200/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.03.02')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Portable toilet units', '4', 'no', 35, 1),
  ('Servicing & consumables', '1', 'mo', 60, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.03.03 First aid ($1,500)
with item as (select id from public.prelim_library_items where code = 'Z.01.03.03')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Room fit-out', '1', 'lot', 800, 1),
  ('Equipment & initial supplies', '1', 'lot', 700, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.03.04 Washing bay ($10,100)
with item as (select id from public.prelim_library_items where code = 'Z.01.03.04')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('RC pad & sediment pit', '1', 'lot', 4500, 1),
  ('Pump & water recycling system', '1', 'lot', 1500, 2),
  ('Hoses & equipment', '1', 'lot', 500, 3),
  ('Maintenance & desilting over programme', 'P07', 'mo', 200, 4)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.04.01 Site cleaning ($602/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.04.01')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Cleaning laborers', '26', 'man-day', 12, 1),
  ('Waste skip hire', '2', 'no', 120, 2),
  ('Tipping fees', '1', 'mo', 50, 3)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.04.02 Final clean ($3,500)
with item as (select id from public.prelim_library_items where code = 'Z.01.04.02')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Builder''s clean on GFA', 'P12', 'm2', 0.35, 1),
  ('Glass & facade cleaning', '1', 'lot', 700, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.05.01 Tower crane ($3,500/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.05.01')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Tower crane rental', '1', 'mo', 2800, 1),
  ('Operator & rigger', '1', 'mo', 600, 2),
  ('Maintenance & spares', '1', 'mo', 100, 3)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.05.02 Crane foundation ($18,000)
with item as (select id from public.prelim_library_items where code = 'Z.01.05.02')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('RC foundation base', '25', 'm3', 220, 1),
  ('Erection incl. mobile crane hire', '1', 'lot', 6000, 2),
  ('Dismantling', '1', 'lot', 4500, 3),
  ('Load test & certification', '1', 'lot', 2000, 4)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.05.03 Hoist rental ($1,500/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.05.03')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Hoist rental', '1', 'mo', 1200, 1),
  ('Operator', '1', 'mo', 300, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.05.04 Hoist erection ($4,000)
with item as (select id from public.prelim_library_items where code = 'Z.01.05.04')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Erection & base', '1', 'lot', 2200, 1),
  ('Dismantling', '1', 'lot', 1300, 2),
  ('Test & certification', '1', 'lot', 500, 3)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.05.06 Scaffolding ($7.20/m2)
with item as (select id from public.prelim_library_items where code = 'Z.01.05.06')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Erection & dismantling', '1', 'm2', 3, 1),
  ('Rental over scaffold duration', 'P09', 'm2-mo', 0.35, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.05.07 Back-propping ($1,200/floor)
with item as (select id from public.prelim_library_items where code = 'Z.01.05.07')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Adjustable props rental (400 no x 2-month cycle)', '800', 'prop-mo', 1.2, 1),
  ('Install & strike labor', '20', 'man-day', 12, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.06.01 Small plant ($350/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.06.01')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Concrete mixers', '2', 'no', 50, 1),
  ('Cutting & grinding equipment', '1', 'mo', 80, 2),
  ('Power tools replacement allowance', '1', 'mo', 100, 3),
  ('Consumables (discs, bits, blades)', '1', 'mo', 70, 4)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.07.01 Temp electricity install ($5,500)
with item as (select id from public.prelim_library_items where code = 'Z.01.07.01')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('EDC connection fee & deposit', '1', 'lot', 1500, 1),
  ('Main distribution board (MDB) & meter', '1', 'lot', 800, 2),
  ('Sub-distribution boards (1 per 2 floors x 5)', '1', 'lot', 750, 3),
  ('Cabling & rising mains distribution', '1', 'lot', 1200, 4),
  ('Earthing & protection', '1', 'lot', 400, 5),
  ('Site lighting installation', '1', 'lot', 600, 6),
  ('Removal at completion', '1', 'lot', 250, 7)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.07.02 Temp electricity consumption ($1,258.26/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.07.02')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Average monthly electricity cost (EDC)', '1', 'mo', 1108.26, 1),
  ('Electrician maintenance', '1', 'mo', 150, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.07.03 Temp water install ($1,900)
with item as (select id from public.prelim_library_items where code = 'Z.01.07.03')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('PPWSA connection & meter', '1', 'lot', 600, 1),
  ('Storage tanks 2 x 5 m3', '1', 'lot', 500, 2),
  ('Booster pump & piping to floors', '1', 'lot', 700, 3),
  ('Removal at completion', '1', 'lot', 100, 4)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.07.04 Temp water consumption ($160.83/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.07.04')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('PPWSA consumption cost (178.2 m3/mo)', '1', 'mo', 115.83, 1),
  ('Pump running & maintenance', '1', 'mo', 45, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.08.01 Health & safety ($500/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.08.01')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('PPE issue & replacement (per peak workforce)', 'P10', 'worker', 4, 1),
  ('First-aid consumables', '1', 'mo', 30, 2),
  ('Toolbox training & safety officer support', '1', 'mo', 100, 3),
  ('Safety signage & miscellaneous', '1', 'mo', 50, 4)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.08.02 Site security ($900/mo)
with item as (select id from public.prelim_library_items where code = 'Z.01.08.02')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Security guards (day/night rotation)', '3', 'no', 250, 1),
  ('CCTV system (amortized)', '1', 'mo', 100, 2),
  ('Security lighting power', '1', 'mo', 50, 3)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.01.08.03 Material testing ($8,000)
with item as (select id from public.prelim_library_items where code = 'Z.01.08.03')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Concrete cube test sets', '300', 'set', 15, 1),
  ('Rebar tensile tests', '40', 'no', 30, 2),
  ('Soil / compaction tests', '1', 'lot', 800, 3),
  ('Other / miscellaneous tests', '1', 'lot', 1500, 4)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.30.01 Foreign staff ($63,000) — single component with fixed total
with item as (select id from public.prelim_library_items where code = 'Z.30.01')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Project Manager (1 person x 18 months x $3,500/mo)', '1', 'lot', 63000, 1)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.30.02 Local staff ($132,000) — single component with fixed total
with item as (select id from public.prelim_library_items where code = 'Z.30.02')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('All local staff per Staff Schedule', '1', 'lot', 132000, 1)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.30.04 Welfare ($300/mo)
with item as (select id from public.prelim_library_items where code = 'Z.30.04')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Monthly welfare allowance', '1', 'mo', 300, 1)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.30.05 Office supplies ($200/mo)
with item as (select id from public.prelim_library_items where code = 'Z.30.05')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Monthly office supplies allowance', '1', 'mo', 200, 1)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.30.06 Communication & travel ($250/mo)
with item as (select id from public.prelim_library_items where code = 'Z.30.06')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Monthly communication & travel allowance', '1', 'mo', 250, 1)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.30.07 Social expense ($150/mo)
with item as (select id from public.prelim_library_items where code = 'Z.30.07')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Monthly social expense allowance', '1', 'mo', 150, 1)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.30.09 Meeting expense ($100/mo)
with item as (select id from public.prelim_library_items where code = 'Z.30.09')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Monthly meeting expense allowance', '1', 'mo', 100, 1)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.30.10 Miscellaneous ($200/mo)
with item as (select id from public.prelim_library_items where code = 'Z.30.10')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Monthly miscellaneous expense allowance', '1', 'mo', 200, 1)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.50.01 Shop drawings ($10,000)
with item as (select id from public.prelim_library_items where code = 'Z.50.01')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Draftsmen (2 no. x 10 months)', '20', 'man-mo', 450, 1),
  ('Plotting & printing', '1', 'lot', 1000, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.50.02 As-built ($6,000)
with item as (select id from public.prelim_library_items where code = 'Z.50.02')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Draftsman (1 no. x 10 months)', '10', 'man-mo', 500, 1),
  ('Printing & binding', '1', 'lot', 1000, 2)
) as v(description, qty_formula, unit, rate, sort_order);

-- Z.50.03 Temp works design ($5,000)
with item as (select id from public.prelim_library_items where code = 'Z.50.03')
insert into public.prelim_library_components (item_id, description, qty_formula, unit, rate, sort_order)
select id, v.description, v.qty_formula, v.unit, v.rate, v.sort_order from item, (values
  ('Crane base design & check', '1', 'lot', 1500, 1),
  ('Sheet pile / shoring design', '1', 'lot', 1500, 2),
  ('Back-propping & formwork scheme', '1', 'lot', 1500, 3),
  ('Documentation & submissions', '1', 'lot', 500, 4)
) as v(description, qty_formula, unit, rate, sort_order);
