-- Seed: prj_2026_004_pc_custom_quantities_norms.sql
-- Purpose: Productivity & Resource-Costing Plan, §6 rollout on PRJ-2026-004-PC (7 Story Mix Use Building).
--
-- PRJ-2026-004-PC has no real BOQ/QTO/GFA record of its own (checked directly: qs_boq_items has only 57
-- prelims rows, 0 tender_boq_items, 0 rows in wbs_node_quantities for this project — the "800 m2/floor GFA"
-- referenced earlier in this plan's own notes belongs to a DIFFERENT project; corrected here). At the user's
-- explicit request ("create your own custom" data), this seed populates ASSUMED, REPRESENTATIVE quantities
-- and DRAFT productivity norms for the 52 construction activities that repeat across this project's floors
-- (Structural, Architectural, MEP) — covering ~416 of its 802 tasks. Every quantity here is a round,
-- order-of-magnitude estimate for a floor of a 7-story mixed-use building, NOT a real take-off. Every norm's
-- labour CONSTANT (hours/unit) is a generic, published construction-industry productivity figure, not a
-- DWL-sourced recipe (only one such recipe, C30 columns/walls, exists for real — reused verbatim below). Every
-- norm's CREW and DAY RATE is real (dwl_v_labor_rates), so cost is grounded in real wages even though
-- productivity and quantity are not.
--
-- Every norm is left in DRAFT status (never self-approved) and its basis_note says so explicitly — per plan
-- decision §6.3: "draft starter norm labelled 'assumption - validate' and approved by the site/QS team. I
-- will not present unvalidated numbers as facts." Excluded from this pass, honestly: non-physical tasks
-- (QA/QC, Procurement, Shop Drawings, Design, BIM, Documentation, Handover, Commissioning — 155 tasks, no
-- natural unit of measure) and one-off tasks that don't repeat per floor (piling, retaining walls, roof,
-- civil/landscape, external works — ~230 tasks; each would need individual judgement, not a systematic
-- model, and is left for a follow-up pass rather than guessed here).
--
-- Idempotent: safe to re-run (deletes and recreates its own norms/crew/task_work by code prefix 'CUST-').
-- This is DATA, not schema — no new tables/columns. Local DB only, per CLAUDE.md.

set request.jwt.claims = '{"sub":"0b268e83-4c22-4f79-bf75-06154a7d496c"}';

\set project_id '''854192a9-bf72-4e63-9f41-11204714b60c'''

-- ── 0. clean slate for a re-run ──────────────────────────────────────────────
delete from plan_task_work w
  using plan_productivity_norms n
  where w.norm_id = n.id and n.code like 'CUST-%';
delete from plan_productivity_norm_resources
  where norm_id in (select id from plan_productivity_norms where code like 'CUST-%');
delete from plan_productivity_norms where code like 'CUST-%';

-- ── 1. norms ──────────────────────────────────────────────────────────────────
-- unit / labour-constant (hr per unit) / trade, one row per activity. LC values are generic published
-- construction productivity figures except the two marked (*), which reuse the real DWL C30 concrete recipe
-- (120 m3 -> 220.8 man-hr, i.e. 1.84 hr/m3) already verified elsewhere in this plan.
insert into plan_productivity_norms (project_id, code, name, trade, unit, labour_constant_hr_per_unit, hours_per_day_basis, efficiency_pct, source, basis_note, status)
values
  (:project_id, 'CUST-STR-01', 'Setting Out',               'Survey',              'ls', 12.00, 8, 100, 'manual', 'ASSUMPTION - not validated. Representative lump-sum survey effort per floor; no real QTO exists for this project. Needs QS/site review before commercial use.', 'draft'),
  (:project_id, 'CUST-STR-02', 'Column Formwork',            'Formwork Carpentry',  'm2', 0.45,  8, 100, 'manual', 'ASSUMPTION - generic industry productivity rate (panel formwork, fix+strike), not project-specific.', 'draft'),
  (:project_id, 'CUST-STR-03', 'Column Reinforcement',       'Steel Fixing',        't',  12.0,  8, 100, 'manual', 'ASSUMPTION - generic rebar-fixing rate (columns, congested).', 'draft'),
  (:project_id, 'CUST-STR-04', 'Column Concrete',            'Concreting',          'm3', 1.84,  8, 100, 'manual', '(*) Real DWL recipe: gang of 6 laborers + 0.9 masons places 30 m3/day (120 m3 -> 220.8 man-hr). Same figure verified live in Phases 1 and 4 of this plan.', 'draft'),
  (:project_id, 'CUST-STR-05', 'Beam Formwork',               'Formwork Carpentry',  'm2', 0.50,  8, 100, 'manual', 'ASSUMPTION - generic industry productivity rate (beam soffit + sides).', 'draft'),
  (:project_id, 'CUST-STR-06', 'Beam Reinforcement',         'Steel Fixing',        't',  11.0,  8, 100, 'manual', 'ASSUMPTION - generic rebar-fixing rate (beams).', 'draft'),
  (:project_id, 'CUST-STR-07', 'Shear Wall Formwork',         'Formwork Carpentry',  'm2', 0.50,  8, 100, 'manual', 'ASSUMPTION - generic industry productivity rate (wall panel formwork).', 'draft'),
  (:project_id, 'CUST-STR-08', 'Shear Wall Reinforcement',   'Steel Fixing',        't',  13.0,  8, 100, 'manual', 'ASSUMPTION - generic rebar-fixing rate (walls, two-layer mesh).', 'draft'),
  (:project_id, 'CUST-STR-09', 'Shear Wall Concrete',        'Concreting',          'm3', 1.84,  8, 100, 'manual', '(*) Same real DWL C30 recipe as Column Concrete.', 'draft'),
  (:project_id, 'CUST-STR-10', 'Slab Formwork',               'Formwork Carpentry',  'm2', 0.35,  8, 100, 'manual', 'ASSUMPTION - generic industry productivity rate (flat soffit, more efficient than vertical formwork).', 'draft'),
  (:project_id, 'CUST-STR-11', 'Slab Reinforcement',         'Steel Fixing',        't',  9.0,   8, 100, 'manual', 'ASSUMPTION - generic rebar-fixing rate (slab mesh, less congested than columns).', 'draft'),
  (:project_id, 'CUST-STR-12', 'Concrete Pour',               'Concreting',          'm3', 1.84,  8, 100, 'manual', '(*) Same real DWL C30 recipe; this activity is the floor slab''s own concrete pour.', 'draft'),
  (:project_id, 'CUST-STR-13', 'Formwork Removal',           'Formwork Strip',      'm2', 0.08,  8, 100, 'manual', 'ASSUMPTION - generic strike/clean/stack rate, faster than installation.', 'draft'),
  (:project_id, 'CUST-STR-14', 'Concrete Curing',             'Curing',              'm3', 0.30,  8, 100, 'manual', 'ASSUMPTION - generic watering/covering labour per m3 of concrete placed that floor.', 'draft'),
  (:project_id, 'CUST-ARC-01', 'Blockwork',                   'Blockwork',           'm2', 1.80,  8, 100, 'manual', 'ASSUMPTION - generic 200mm hollow-block laying rate.', 'draft'),
  (:project_id, 'CUST-ARC-02', 'Internal Partition',         'Blockwork',           'm2', 1.50,  8, 100, 'manual', 'ASSUMPTION - generic lightweight partition rate.', 'draft'),
  (:project_id, 'CUST-ARC-03', 'Plastering',                  'Plastering',          'm2', 0.35,  8, 100, 'manual', 'ASSUMPTION - generic sand-cement plaster rate.', 'draft'),
  (:project_id, 'CUST-ARC-04', 'Screed',                      'Screed & Waterproofing', 'm2', 0.30, 8, 100, 'manual', 'ASSUMPTION - generic floor screed rate.', 'draft'),
  (:project_id, 'CUST-ARC-05', 'Waterproofing',               'Screed & Waterproofing', 'm2', 0.25, 8, 100, 'manual', 'ASSUMPTION - generic membrane/coating rate, wet areas only (small area vs. floor plate).', 'draft'),
  (:project_id, 'CUST-ARC-06', 'Flooring',                    'Tiling & Flooring',   'm2', 0.60,  8, 100, 'manual', 'ASSUMPTION - generic tile/stone floor-laying rate.', 'draft'),
  (:project_id, 'CUST-ARC-07', 'Wall Tiling',                'Tiling & Flooring',   'm2', 0.70,  8, 100, 'manual', 'ASSUMPTION - generic wall-tiling rate.', 'draft'),
  (:project_id, 'CUST-ARC-08', 'Stone / Marble',             'Tiling & Flooring',   'm2', 1.00,  8, 100, 'manual', 'ASSUMPTION - generic natural-stone laying rate (slower than tile).', 'draft'),
  (:project_id, 'CUST-ARC-09', 'Ceiling',                     'Ceiling',             'm2', 0.50,  8, 100, 'manual', 'ASSUMPTION - generic suspended-ceiling installation rate.', 'draft'),
  (:project_id, 'CUST-ARC-10', 'Internal Painting',          'Painting',            'm2', 0.12,  8, 100, 'manual', 'ASSUMPTION - generic 2-coat emulsion rate, walls + ceiling combined.', 'draft'),
  (:project_id, 'CUST-ARC-11', 'Painting Primer',             'Painting',            'm2', 0.08,  8, 100, 'manual', 'ASSUMPTION - generic primer-coat rate, same area as Internal Painting.', 'draft'),
  (:project_id, 'CUST-ARC-12', 'External Finishing',         'Exterior Finishing',  'm2', 0.30,  8, 100, 'manual', 'ASSUMPTION - generic external render + paint combined rate.', 'draft'),
  (:project_id, 'CUST-ARC-13', 'Final Architectural Finishes', 'Finishing Snagging', 'ls', 40.0, 8, 100, 'manual', 'ASSUMPTION - lump-sum snagging/touch-up effort per floor.', 'draft'),
  (:project_id, 'CUST-ARC-14', 'Doors',                       'Joinery',             'no', 3.00,  8, 100, 'manual', 'ASSUMPTION - generic door leaf + hardware install rate.', 'draft'),
  (:project_id, 'CUST-ARC-15', 'Door Frames',                'Joinery',             'no', 1.50,  8, 100, 'manual', 'ASSUMPTION - generic frame install rate.', 'draft'),
  (:project_id, 'CUST-ARC-16', 'Windows',                     'Glazing',             'no', 4.00,  8, 100, 'manual', 'ASSUMPTION - generic window unit install rate.', 'draft'),
  (:project_id, 'CUST-ARC-17', 'Glass',                       'Glazing',             'm2', 0.90,  8, 100, 'manual', 'ASSUMPTION - generic glazing rate.', 'draft'),
  (:project_id, 'CUST-MEP-01', 'Electrical Conduits',        'Electrical',          'm',  0.12,  8, 100, 'manual', 'ASSUMPTION - generic conduit first-fix rate.', 'draft'),
  (:project_id, 'CUST-MEP-02', 'Cable Pulling',               'Electrical',          'm',  0.05,  8, 100, 'manual', 'ASSUMPTION - generic cable-pulling rate.', 'draft'),
  (:project_id, 'CUST-MEP-03', 'Cable Trays',                 'Electrical',          'm',  0.30,  8, 100, 'manual', 'ASSUMPTION - generic tray install rate.', 'draft'),
  (:project_id, 'CUST-MEP-04', 'DB Installation',             'Electrical',          'no', 6.00,  8, 100, 'manual', 'ASSUMPTION - generic distribution-board install rate.', 'draft'),
  (:project_id, 'CUST-MEP-05', 'Switches & Sockets',         'Electrical',          'no', 0.50,  8, 100, 'manual', 'ASSUMPTION - generic accessory second-fix rate.', 'draft'),
  (:project_id, 'CUST-MEP-06', 'Lighting',                    'Electrical',          'no', 0.60,  8, 100, 'manual', 'ASSUMPTION - generic light-fixture install rate.', 'draft'),
  (:project_id, 'CUST-MEP-07', 'Plumbing Pipes',              'Plumbing',            'm',  0.20,  8, 100, 'manual', 'ASSUMPTION - generic pipe first-fix rate.', 'draft'),
  (:project_id, 'CUST-MEP-08', 'Plumbing Fixtures',          'Plumbing',            'no', 3.00,  8, 100, 'manual', 'ASSUMPTION - generic sanitary-fixture install rate.', 'draft'),
  (:project_id, 'CUST-MEP-09', 'Drainage Pipes',             'Plumbing',            'm',  0.25,  8, 100, 'manual', 'ASSUMPTION - generic drainage-pipe install rate.', 'draft'),
  (:project_id, 'CUST-MEP-10', 'HVAC Ductwork',               'Ductwork',            'm',  0.60,  8, 100, 'manual', 'ASSUMPTION - generic sheet-metal duct install rate.', 'draft'),
  (:project_id, 'CUST-MEP-11', 'HVAC Pipes',                  'HVAC M&E',            'm',  0.30,  8, 100, 'manual', 'ASSUMPTION - generic refrigerant/chilled-water pipe rate.', 'draft'),
  (:project_id, 'CUST-MEP-12', 'HVAC Equipment',             'HVAC M&E',            'no', 8.00,  8, 100, 'manual', 'ASSUMPTION - generic FCU/AHU install rate.', 'draft'),
  (:project_id, 'CUST-MEP-13', 'Fire Fighting Pipes',        'Fire Protection',     'm',  0.25,  8, 100, 'manual', 'ASSUMPTION - generic fire-pipe install rate.', 'draft'),
  (:project_id, 'CUST-MEP-14', 'Fire Fighting Equipment',    'Fire Protection',     'no', 4.00,  8, 100, 'manual', 'ASSUMPTION - generic fire equipment install rate.', 'draft'),
  (:project_id, 'CUST-MEP-15', 'Sprinkler Heads',             'Fire Protection',     'no', 0.40,  8, 100, 'manual', 'ASSUMPTION - generic sprinkler-head install rate.', 'draft'),
  (:project_id, 'CUST-MEP-16', 'Fire Alarm Devices',         'Electrical',          'no', 0.50,  8, 100, 'manual', 'ASSUMPTION - generic detector/device install rate.', 'draft'),
  (:project_id, 'CUST-MEP-17', 'Fire Alarm Conduits',        'Electrical',          'm',  0.10,  8, 100, 'manual', 'ASSUMPTION - generic small-bore conduit rate.', 'draft'),
  (:project_id, 'CUST-MEP-18', 'ELV Devices',                 'Electrical',          'no', 0.60,  8, 100, 'manual', 'ASSUMPTION - generic ELV device install rate.', 'draft'),
  (:project_id, 'CUST-MEP-19', 'ELV Conduits',                'Electrical',          'm',  0.10,  8, 100, 'manual', 'ASSUMPTION - generic small-bore conduit rate.', 'draft');

-- ── 2. crew templates, applied to every norm that uses them ─────────────────
-- Every dwl_resource_id below is a REAL day-wage resource in dwl_v_labor_rates (checked directly; excludes
-- the "Labor component (migrated) for <cost item>" rows, which are per-unit COSTS, not day wages, and would
-- silently corrupt the cost engine if used as a crew rate).
create temp table _crew (template text, role_label text, dwl_resource_id uuid, workers numeric, sort_order int) on commit drop;
insert into _crew (template, role_label, dwl_resource_id, workers, sort_order) values
  ('formwork',   'Carpenter (formwork), skilled', 'faf7aaee-50b0-44bb-868c-6de658d72e03', 4,   0),
  ('formwork',   'General laborer',               '7fd149c4-116f-4cf5-8895-296f83dcdb6a', 2,   1),
  ('rebar',      'Steel fixer (rebar), skilled',  '91207c22-6d2a-4f05-9497-09e6bf146726', 4,   0),
  ('rebar',      'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 2,   1),
  ('concrete',   'General laborer',               '7fd149c4-116f-4cf5-8895-296f83dcdb6a', 6,   0),
  ('concrete',   'Mason (concrete/masonry skilled)', '3c67a7b8-27bd-40eb-b3ab-510344afd7e6', 0.9, 1),
  ('curing',     'General laborer',               '7fd149c4-116f-4cf5-8895-296f83dcdb6a', 2,   0),
  ('strip',      'General laborer',               '7fd149c4-116f-4cf5-8895-296f83dcdb6a', 4,   0),
  ('blockwork',  'Mason (concrete/masonry skilled)', '3c67a7b8-27bd-40eb-b3ab-510344afd7e6', 4, 0),
  ('blockwork',  'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 2,   1),
  ('plastering', 'Plasterer, skilled',            '2282ea02-bc43-4579-8474-7d9df26c493a', 4,   0),
  ('plastering', 'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 2,   1),
  ('screed',     'Mason (concrete/masonry skilled)', '3c67a7b8-27bd-40eb-b3ab-510344afd7e6', 3, 0),
  ('screed',     'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 2,   1),
  ('tiling',     'Tiler, skilled',                '9ca35f79-4a1a-4160-86a6-f1fa070a35d6', 3,   0),
  ('tiling',     'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 2,   1),
  ('ceiling',    'Gypsum/ceiling installer',       '4be890cf-2c24-4c09-bcea-efbc69dc7aaf', 3,   0),
  ('ceiling',    'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 2,   1),
  ('painting',   'Painter',                        'e87c5159-d390-4cde-8243-061a2f2ba430', 3,   0),
  ('painting',   'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 1,   1),
  ('extfinish',  'Painter',                        'e87c5159-d390-4cde-8243-061a2f2ba430', 2,   0),
  ('extfinish',  'Plasterer, skilled',            '2282ea02-bc43-4579-8474-7d9df26c493a', 2,   1),
  ('snag',       'Painter',                        'e87c5159-d390-4cde-8243-061a2f2ba430', 1,   0),
  ('snag',       'Tiler, skilled',                '9ca35f79-4a1a-4160-86a6-f1fa070a35d6', 1,   1),
  ('snag',       'General laborer',               '7fd149c4-116f-4cf5-8895-296f83dcdb6a', 2,   2),
  ('joinery',    'Joinery carpenter (doors/fitout)', '9a16711a-4f41-4944-887c-bae033adcd39', 2, 0),
  ('joinery',    'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 1,   1),
  ('glazing',    'Aluminum/glazing installer',     '0c9f5e38-3e05-4ffe-906e-66c96b3e48d1', 2,   0),
  ('glazing',    'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 1,   1),
  ('electrical', 'Electrician, skilled',          'f6037623-b795-4981-89ef-688caeb5746d', 2,   0),
  ('electrical', 'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 1,   1),
  ('plumbing',   'Plumber, skilled',              'a239eeec-eccc-4127-9d39-767148b9632a', 2,   0),
  ('plumbing',   'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 1,   1),
  ('ductwork',   'Duct/sheet-metal worker',        'cb03b9e1-c6e7-4456-b8fc-8741e90a6eb2', 3,   0),
  ('ductwork',   'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 1,   1),
  ('hvac',       'AC/refrigeration technician',    'd953898a-af68-4ff4-931e-9702af6dcf59', 2,   0),
  ('hvac',       'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 1,   1),
  ('fireprot',   'Fire protection fitter',        '45cad038-f951-4e99-8bf8-91497ead29a0', 2,   0),
  ('fireprot',   'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 1,   1),
  ('survey',     'Surveyor + instrument man (pair)', '3db2885a-cd67-45aa-b2f7-a16ab6e36224', 1, 0),
  ('survey',     'General Helper',                'ab71d432-31ef-4505-8eb0-8e18bfb9262b', 1,   1);

create temp table _norm_template (code text, template text) on commit drop;
insert into _norm_template (code, template) values
  ('CUST-STR-01','survey'), ('CUST-STR-02','formwork'), ('CUST-STR-03','rebar'), ('CUST-STR-04','concrete'),
  ('CUST-STR-05','formwork'), ('CUST-STR-06','rebar'), ('CUST-STR-07','formwork'), ('CUST-STR-08','rebar'),
  ('CUST-STR-09','concrete'), ('CUST-STR-10','formwork'), ('CUST-STR-11','rebar'), ('CUST-STR-12','concrete'),
  ('CUST-STR-13','strip'), ('CUST-STR-14','curing'),
  ('CUST-ARC-01','blockwork'), ('CUST-ARC-02','blockwork'), ('CUST-ARC-03','plastering'), ('CUST-ARC-04','screed'),
  ('CUST-ARC-05','screed'), ('CUST-ARC-06','tiling'), ('CUST-ARC-07','tiling'), ('CUST-ARC-08','tiling'),
  ('CUST-ARC-09','ceiling'), ('CUST-ARC-10','painting'), ('CUST-ARC-11','painting'), ('CUST-ARC-12','extfinish'),
  ('CUST-ARC-13','snag'), ('CUST-ARC-14','joinery'), ('CUST-ARC-15','joinery'), ('CUST-ARC-16','glazing'),
  ('CUST-ARC-17','glazing'),
  ('CUST-MEP-01','electrical'), ('CUST-MEP-02','electrical'), ('CUST-MEP-03','electrical'), ('CUST-MEP-04','electrical'),
  ('CUST-MEP-05','electrical'), ('CUST-MEP-06','electrical'), ('CUST-MEP-07','plumbing'), ('CUST-MEP-08','plumbing'),
  ('CUST-MEP-09','plumbing'), ('CUST-MEP-10','ductwork'), ('CUST-MEP-11','hvac'), ('CUST-MEP-12','hvac'),
  ('CUST-MEP-13','fireprot'), ('CUST-MEP-14','fireprot'), ('CUST-MEP-15','fireprot'), ('CUST-MEP-16','electrical'),
  ('CUST-MEP-17','electrical'), ('CUST-MEP-18','electrical'), ('CUST-MEP-19','electrical');

insert into plan_productivity_norm_resources (norm_id, kind, role_label, dwl_resource_id, workers_per_crew, sort_order)
select n.id, 'labor', c.role_label, c.dwl_resource_id, c.workers, c.sort_order
from _norm_template t
join plan_productivity_norms n on n.code = t.code and n.project_id = :project_id
join _crew c on c.template = t.template;

-- ── 3. representative quantities, one row per repeated activity ─────────────
create temp table _qty (task_name text, discipline text, norm_code text, unit text, qty numeric) on commit drop;
insert into _qty (task_name, discipline, norm_code, unit, qty) values
  ('Setting Out',               'Structural', 'CUST-STR-01', 'ls', 1),
  ('Column Formwork',           'Structural', 'CUST-STR-02', 'm2', 300),
  ('Column Reinforcement',      'Structural', 'CUST-STR-03', 't',  8),
  ('Column Concrete',           'Structural', 'CUST-STR-04', 'm3', 40),
  ('Beam Formwork',             'Structural', 'CUST-STR-05', 'm2', 450),
  ('Beam Reinforcement',        'Structural', 'CUST-STR-06', 't',  10),
  ('Shear Wall Formwork',       'Structural', 'CUST-STR-07', 'm2', 250),
  ('Shear Wall Reinforcement',  'Structural', 'CUST-STR-08', 't',  7),
  ('Shear Wall Concrete',       'Structural', 'CUST-STR-09', 'm3', 35),
  ('Slab Formwork',             'Structural', 'CUST-STR-10', 'm2', 750),
  ('Slab Reinforcement',        'Structural', 'CUST-STR-11', 't',  14),
  ('Concrete Pour',             'Structural', 'CUST-STR-12', 'm3', 130),
  ('Formwork Removal',          'Structural', 'CUST-STR-13', 'm2', 1800),
  ('Concrete Curing',           'Structural', 'CUST-STR-14', 'm3', 205),
  ('Blockwork',                 'Architectural', 'CUST-ARC-01', 'm2', 200),
  ('Internal Partition',        'Architectural', 'CUST-ARC-02', 'm2', 150),
  ('Plastering',                 'Architectural', 'CUST-ARC-03', 'm2', 500),
  ('Screed',                     'Architectural', 'CUST-ARC-04', 'm2', 750),
  ('Waterproofing',             'Architectural', 'CUST-ARC-05', 'm2', 80),
  ('Flooring',                   'Architectural', 'CUST-ARC-06', 'm2', 700),
  ('Wall Tiling',               'Architectural', 'CUST-ARC-07', 'm2', 120),
  ('Stone / Marble',            'Architectural', 'CUST-ARC-08', 'm2', 100),
  ('Ceiling',                    'Architectural', 'CUST-ARC-09', 'm2', 700),
  ('Internal Painting',         'Architectural', 'CUST-ARC-10', 'm2', 1400),
  ('Painting Primer',           'Architectural', 'CUST-ARC-11', 'm2', 1400),
  ('External Finishing',        'Architectural', 'CUST-ARC-12', 'm2', 350),
  ('Final Architectural Finishes', 'Architectural', 'CUST-ARC-13', 'ls', 1),
  ('Doors',                      'Architectural', 'CUST-ARC-14', 'no', 15),
  ('Door Frames',                'Architectural', 'CUST-ARC-15', 'no', 15),
  ('Windows',                    'Architectural', 'CUST-ARC-16', 'no', 12),
  ('Glass',                      'Architectural', 'CUST-ARC-17', 'm2', 90),
  ('Electrical Conduits',       'MEP', 'CUST-MEP-01', 'm',  600),
  ('Cable Pulling',             'MEP', 'CUST-MEP-02', 'm',  1200),
  ('Cable Trays',               'MEP', 'CUST-MEP-03', 'm',  150),
  ('DB Installation',           'MEP', 'CUST-MEP-04', 'no', 2),
  ('Switches & Sockets',        'MEP', 'CUST-MEP-05', 'no', 60),
  ('Lighting',                   'MEP', 'CUST-MEP-06', 'no', 40),
  ('Plumbing Pipes',            'MEP', 'CUST-MEP-07', 'm',  300),
  ('Plumbing Fixtures',         'MEP', 'CUST-MEP-08', 'no', 15),
  ('Drainage Pipes',            'MEP', 'CUST-MEP-09', 'm',  200),
  ('HVAC Ductwork',             'MEP', 'CUST-MEP-10', 'm',  150),
  ('HVAC Pipes',                 'MEP', 'CUST-MEP-11', 'm',  200),
  ('HVAC Equipment',            'MEP', 'CUST-MEP-12', 'no', 4),
  ('Fire Fighting Pipes',       'MEP', 'CUST-MEP-13', 'm',  250),
  ('Fire Fighting Equipment',   'MEP', 'CUST-MEP-14', 'no', 5),
  ('Sprinkler Heads',           'MEP', 'CUST-MEP-15', 'no', 50),
  ('Fire Alarm Devices',        'MEP', 'CUST-MEP-16', 'no', 25),
  ('Fire Alarm Conduits',       'MEP', 'CUST-MEP-17', 'm',  300),
  ('ELV Devices',                'MEP', 'CUST-MEP-18', 'no', 30),
  ('ELV Conduits',               'MEP', 'CUST-MEP-19', 'm',  350);

-- ── 4. write plan_task_work for every matching real task ─────────────────────
insert into plan_task_work (task_id, quantity, quantity_unit, quantity_source, quantity_reason, norm_id, crews)
select t.id, q.qty, q.unit, 'manual',
       'Representative estimate for schedule/resource modelling (no real QTO exists for this project) - requires QS validation before commercial use.',
       n.id, 1
from wbs_tasks t
join _qty q on q.task_name = t.task_name and q.discipline = t.discipline
join plan_productivity_norms n on n.code = q.norm_code and n.project_id = :project_id
where t.project_id = :project_id and t.is_milestone = false
on conflict (task_id) do update set
  quantity = excluded.quantity, quantity_unit = excluded.quantity_unit, quantity_source = excluded.quantity_source,
  quantity_reason = excluded.quantity_reason, norm_id = excluded.norm_id, crews = excluded.crews;
