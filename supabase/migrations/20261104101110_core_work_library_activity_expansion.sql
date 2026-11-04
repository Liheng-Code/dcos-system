-- Construction Work Library: activity expansion for the thin CSI divisions (2026-11).
--
-- Adds about 107 DRAFT activity masters so every active building division has a usable set: 01 preliminaries &
-- temporary works, 02 existing conditions, 04 masonry, 05 metalwork, 06 joinery, 08 openings, 10-13 specialties /
-- equipment / furnishings, 14 conveying, 21-23 fire / plumbing / HVAC plant, 25 BMS, 26 power plant, 27 ICT, 28 security.
-- Drafts are reviewed and activated in the Activity Library (bulk Activate) before Generate uses them.
--   A. CSI sections the activities need (Division 02 had none), core library, inactive-safe.
--   B. Taxonomy: domain PRE (Preliminaries & Site) and new categories / families under STR, ARC and MEP.
--   C. Method statement and T&C catalogue items where a division had none.
--   D. Procurement (PD) packages per trade.
--   E. The masters (status draft), then their links: method statements, T&C, packages, BOQ cost items with the same
--      CSI section (only where the section has at most 5 active items), and a DRAFT productivity norm per quantity
--      master (labour constant = crew x 8 h / output per crew-day, flagged ASSUMPTION).
-- Idempotent and additive: every insert skips what exists.

-- ── A. CSI sections ───────────────────────────────────────────────────────
insert into public.csi_sections (code, division_code, parent_code, level, name, sort_order)
select v.code, left(v.code, 2),
       case when right(v.code, 2) <> '00' and exists (select 1 from public.csi_sections p where p.code = left(v.code, 5) || ' 00')
            then left(v.code, 5) || ' 00' end,
       case when right(v.code, 2) = '00' then 2 else 3 end,
       v.name, 100
from (values
  ('01 54 19', 'Temporary Cranes'), ('01 54 23', 'Temporary Scaffolding and Platforms'), ('01 56 00', 'Temporary Barriers and Enclosures'),
  ('01 58 13', 'Temporary Project Signage'),
  ('02 21 00', 'Surveys'), ('02 32 00', 'Geotechnical Investigations'), ('02 41 00', 'Demolition'), ('02 41 19', 'Selective Demolition'),
  ('02 82 00', 'Asbestos Remediation'),
  ('04 21 00', 'Clay Unit Masonry'),
  ('06 10 00', 'Rough Carpentry'), ('06 20 00', 'Finish Carpentry'), ('06 46 00', 'Wood Trim'), ('06 73 00', 'Composite Decking'),
  ('08 11 13', 'Hollow Metal Doors and Frames'), ('08 31 00', 'Access Doors and Panels'), ('08 91 00', 'Louvers'),
  ('10 21 13', 'Toilet Compartments'), ('10 22 00', 'Partitions'), ('10 28 00', 'Toilet, Bath, and Laundry Accessories'),
  ('10 44 00', 'Fire Protection Specialties'), ('10 51 00', 'Lockers'), ('10 55 00', 'Postal Specialties'), ('10 73 00', 'Protective Covers'),
  ('11 24 00', 'Maintenance Equipment'), ('11 31 00', 'Residential Appliances'), ('11 40 00', 'Foodservice Equipment'),
  ('11 82 00', 'Facility Solid Waste Handling Equipment'),
  ('12 21 00', 'Window Blinds'), ('12 48 00', 'Rugs and Mats'), ('12 50 00', 'Furniture'), ('12 92 00', 'Interior Planters and Artificial Plants'),
  ('12 93 00', 'Site Furnishings'),
  ('13 12 00', 'Fountains'), ('13 31 00', 'Fabric Structures'),
  ('14 21 00', 'Electric Traction Elevators'), ('14 24 00', 'Hydraulic Elevators'), ('14 31 00', 'Escalators'), ('14 42 00', 'Wheelchair Lifts'),
  ('21 13 16', 'Dry-Pipe Sprinkler Systems'),
  ('22 11 23', 'Domestic Water Pumps'), ('22 12 00', 'Facility Potable-Water Storage Tanks'), ('22 14 00', 'Facility Storm Drainage'),
  ('23 21 23', 'Hydronic Pumps'), ('23 23 00', 'Refrigerant Piping'), ('23 33 00', 'Air Duct Accessories'), ('23 64 00', 'Packaged Water Chillers'),
  ('23 65 00', 'Cooling Towers'), ('23 81 26', 'Split-System Air-Conditioners'),
  ('25 10 00', 'Integrated Automation Network Equipment'), ('25 30 00', 'Integrated Automation Instrumentation and Terminal Devices'),
  ('25 50 00', 'Integrated Automation Facility Controls'),
  ('26 12 00', 'Medium-Voltage Transformers'), ('26 25 00', 'Enclosed Bus Assemblies'), ('26 32 13', 'Engine Generators'),
  ('26 33 53', 'Static Uninterruptible Power Supply'), ('26 52 00', 'Safety Lighting'),
  ('27 11 00', 'Communications Equipment Room Fittings'), ('27 15 00', 'Communications Horizontal Cabling'),
  ('27 21 00', 'Data Communications Network Equipment'), ('27 41 00', 'Audio-Video Systems'),
  ('28 13 00', 'Access Control'), ('28 16 00', 'Intrusion Detection'), ('28 23 00', 'Video Surveillance'), ('28 32 00', 'Radiation and Gas Detection')
) as v(code, name)
on conflict (code) do nothing;

-- ── B. Taxonomy ───────────────────────────────────────────────────────────
insert into public.plan_act_domains (code, name, sort_order) values ('PRE', 'Preliminaries & Site', 0)
on conflict (code) do nothing;

insert into public.plan_act_categories (domain_id, code, name, sort_order)
select d.id, v.code, v.name, v.sort_order
from (values
  ('PRE', 'PRE', 'Preliminaries & Temporary Works', 1), ('PRE', 'EXC', 'Existing Conditions', 2),
  ('STR', 'MET', 'Metalwork', 3),
  ('ARC', 'SPC', 'Specialties & Furnishings', 7),
  ('MEP', 'CONV', 'Conveying Systems', 5), ('MEP', 'ELV', 'ELV & Building Systems', 6)
) as v(dom, code, name, sort_order)
join public.plan_act_domains d on d.code = v.dom
on conflict (domain_id, code) do nothing;

insert into public.plan_act_families (category_id, code, name, sort_order)
select c.id, v.code, v.name, v.sort_order
from (values
  ('PRE', 'PRE', 'TMP', 'Temporary Facilities', 1), ('PRE', 'PRE', 'ACC', 'Access, Cranes & Hoists', 2), ('PRE', 'PRE', 'CLS', 'Close-out & Handover', 3),
  ('PRE', 'EXC', 'SVY', 'Surveys & Investigation', 1), ('PRE', 'EXC', 'DEM', 'Demolition & Clearance', 2),
  ('STR', 'MET', 'MET', 'Metal Fabrications', 1),
  ('ARC', 'SPC', 'SPC', 'Specialties', 1), ('ARC', 'SPC', 'FUR', 'Furnishings & Equipment', 2),
  ('MEP', 'CONV', 'LFT', 'Lifts & Escalators', 1),
  ('MEP', 'ELV', 'BMS', 'Building Automation', 1), ('MEP', 'ELV', 'COM', 'Communications', 2), ('MEP', 'ELV', 'SEC', 'Security & Fire Alarm', 3)
) as v(dom, cat, code, name, sort_order)
join public.plan_act_domains d on d.code = v.dom
join public.plan_act_categories c on c.domain_id = d.id and c.code = v.cat
on conflict (category_id, code) do nothing;

-- ── C. Method statements and T&C items ────────────────────────────────────
insert into public.plan_act_method_statements (code, name, csi_division_code, sort_order) values
  ('MS-01-03', 'Scaffolding and Temporary Access', '01', 30), ('MS-01-04', 'Tower Crane Erection and Dismantling', '01', 40),
  ('MS-02-01', 'Demolition and Site Clearance', '02', 10), ('MS-02-02', 'Hazardous Material Removal', '02', 20),
  ('MS-06-01', 'Joinery and Millwork Installation', '06', 10), ('MS-10-01', 'Specialties Installation', '10', 10),
  ('MS-14-01', 'Lift and Escalator Installation', '14', 10), ('MS-25-01', 'BMS Installation and Integration', '25', 10),
  ('MS-28-01', 'Fire Alarm and Security Systems Installation', '28', 10)
on conflict (code) do nothing;

insert into public.plan_act_tc_items (code, name, csi_division_code, tc_type, sort_order) values
  ('TC-01-01', 'Scaffold Inspection and Tagging', '01', 'inspection', 10), ('TC-01-02', 'Tower Crane Load Test', '01', 'test', 20),
  ('TC-04-01', 'Mortar Cube Test', '04', 'test', 10),
  ('TC-05-01', 'Weld Inspection (Visual / UT)', '05', 'inspection', 10), ('TC-05-02', 'Bolt Torque Check', '05', 'test', 20),
  ('TC-08-02', 'Fire Door Inspection', '08', 'inspection', 20),
  ('TC-21-02', 'Fire Pump Performance Test', '21', 'commissioning', 20),
  ('TC-22-02', 'Potable Water Disinfection and Sampling', '22', 'test', 20),
  ('TC-26-05', 'Emergency Lighting Duration Test', '26', 'test', 50),
  ('TC-27-01', 'Structured Cabling Certification', '27', 'test', 10)
on conflict (code) do nothing;

-- ── D. Procurement (PD) packages ──────────────────────────────────────────
insert into public.plan_act_procurement_packages (code, name, package_type, csi_division_code, trade_category, default_lead_time_days, is_long_lead, sort_order) values
  ('PKG-PRE-SITE',  'Site Establishment & Temporary Works',  'service',     '01', 'General Contracting', 14,  false, 10),
  ('PKG-PRE-CRANE', 'Tower Crane & Hoist Hire',               'equipment',   '01', 'Lifting Equipment',   60,  true,  20),
  ('PKG-PRE-SCAF',  'Scaffolding & Edge Protection',          'subcontract', '01', 'Scaffolding',         14,  false, 30),
  ('PKG-PRE-CLEAN', 'Cleaning & Waste Disposal',              'service',     '01', 'Cleaning',            7,   false, 40),
  ('PKG-DEM-SI',    'Site Investigation & Surveys',           'service',     '02', 'Geotechnical',        21,  false, 10),
  ('PKG-DEM-01',    'Demolition & Site Clearance',            'subcontract', '02', 'Demolition',          14,  false, 20),
  ('PKG-DEM-HAZ',   'Hazardous Material Removal',             'subcontract', '02', 'Hazardous Materials', 21,  false, 30),
  ('PKG-ARC-MAS',   'Masonry Materials',                      'material',    '04', 'Masonry',             14,  false, 10),
  ('PKG-STR-STEEL', 'Structural & Miscellaneous Steelwork',   'subcontract', '05', 'Structural Steel',    45,  true,  10),
  ('PKG-ARC-METAL', 'Architectural Metalwork',                'subcontract', '05', 'Metalwork',           30,  false, 20),
  ('PKG-ARC-JOIN',  'Joinery & Millwork',                     'subcontract', '06', 'Joinery',             45,  true,  10),
  ('PKG-ARC-DOOR',  'Doors & Ironmongery',                    'subcontract', '08', 'Doors',               60,  true,  10),
  ('PKG-ARC-ALUM',  'Aluminium, Glazing & Louvres',           'subcontract', '08', 'Aluminium & Glazing', 60,  true,  20),
  ('PKG-ARC-SPEC',  'Architectural Specialties',              'material',    '10', 'Specialties',         30,  false, 10),
  ('PKG-ARC-BMU',   'Façade Access Equipment (BMU)',          'subcontract', '11', 'Façade Access',       120, true,  10),
  ('PKG-ARC-FFE',   'Furniture, Fittings & Equipment',        'material',    '12', 'FF&E',                45,  false, 10),
  ('PKG-MEP-LIFT',  'Lifts & Escalators',                     'subcontract', '14', 'Vertical Transport',  120, true,  10),
  ('PKG-MEP-FIRE',  'Fire Protection & Fire Alarm',           'subcontract', '21', 'Fire Protection',     45,  false, 10),
  ('PKG-MEP-PLB',   'Plumbing & Sanitary',                    'subcontract', '22', 'Plumbing',            30,  false, 10),
  ('PKG-MEP-HVAC',  'HVAC Systems',                           'subcontract', '23', 'HVAC',                60,  true,  10),
  ('PKG-ELV-BMS',   'Building Management System',             'subcontract', '25', 'BMS',                 45,  false, 10),
  ('PKG-MEP-ELEC',  'Electrical Installation',                'subcontract', '26', 'Electrical',          45,  false, 10),
  ('PKG-MEP-GEN',   'Generators & UPS',                       'equipment',   '26', 'Power Equipment',     90,  true,  20),
  ('PKG-ELV-ICT',   'ICT & Communications',                   'subcontract', '27', 'ICT',                 30,  false, 10),
  ('PKG-ELV-SEC',   'Security Systems',                       'subcontract', '28', 'Security Systems',    30,  false, 10)
on conflict (code) do nothing;

-- ── E. Masters and their links ────────────────────────────────────────────
-- code, name, unit, CSI section, domain, category, family, activity type, duration basis,
-- output per crew-day (null = fixed), skilled crew + role, helpers, method statements, T&C items, package
create temp table _exp (
  code text, name text, unit text, sec text, dom text, cat text, fam text, atype text, basis text,
  output numeric, skilled int, srole text, helpers int, ms text[], tc text[], pkg text
) on commit drop;

insert into _exp values
  -- 01 Preliminaries & temporary works
  ('PRE-TMP-001', 'Mobilisation & Site Establishment',              'lot', '01 52 00', 'PRE', 'PRE', 'TMP', 'construction', 'fixed',    null, null, null, null, '{MS-01-01}', '{}', 'PKG-PRE-SITE'),
  ('PRE-TMP-002', 'Site Offices & Welfare Cabins',                  'lot', '01 52 00', 'PRE', 'PRE', 'TMP', 'construction', 'fixed',    null, null, null, null, '{MS-01-01}', '{}', 'PKG-PRE-SITE'),
  ('PRE-TMP-003', 'Site Hoarding & Gates',                          'm',   '01 56 00', 'PRE', 'PRE', 'TMP', 'construction', 'quantity', 30,   2, 'Carpenter', 2, '{MS-01-01}', '{}', 'PKG-PRE-SITE'),
  ('PRE-TMP-004', 'Temporary Power Supply & Distribution',          'lot', '01 51 00', 'PRE', 'PRE', 'TMP', 'construction', 'fixed',    null, null, null, null, '{MS-01-01}', '{}', 'PKG-PRE-SITE'),
  ('PRE-TMP-005', 'Temporary Water Supply & Drainage',              'lot', '01 51 00', 'PRE', 'PRE', 'TMP', 'construction', 'fixed',    null, null, null, null, '{MS-01-01}', '{}', 'PKG-PRE-SITE'),
  ('PRE-TMP-006', 'Project Signboard & Safety Signage',             'lot', '01 58 13', 'PRE', 'PRE', 'TMP', 'construction', 'fixed',    null, null, null, null, '{}', '{}', 'PKG-PRE-SITE'),
  ('PRE-ACC-001', 'Tower Crane Foundation, Erection & Dismantling', 'nos', '01 54 19', 'PRE', 'PRE', 'ACC', 'construction', 'fixed',    null, null, null, null, '{MS-01-04}', '{TC-01-02}', 'PKG-PRE-CRANE'),
  ('PRE-ACC-002', 'Construction Hoist Installation & Removal',      'nos', '01 54 00', 'PRE', 'PRE', 'ACC', 'construction', 'fixed',    null, null, null, null, '{MS-01-04}', '{TC-01-02}', 'PKG-PRE-CRANE'),
  ('PRE-ACC-003', 'External Scaffolding Erection & Dismantling',    'm²',  '01 54 23', 'PRE', 'PRE', 'ACC', 'construction', 'quantity', 80,   3, 'Scaffolder', 2, '{MS-01-03}', '{TC-01-01}', 'PKG-PRE-SCAF'),
  ('PRE-ACC-004', 'Safety Netting & Edge Protection',               'm',   '01 56 00', 'PRE', 'PRE', 'ACC', 'construction', 'quantity', 60,   2, 'Scaffolder', 1, '{MS-01-03}', '{TC-01-01}', 'PKG-PRE-SCAF'),
  ('PRE-CLS-001', 'Final Builder''s Clean',                         'm²',  '01 74 00', 'PRE', 'PRE', 'CLS', 'construction', 'quantity', 400,  1, 'Supervisor', 6, '{}', '{}', 'PKG-PRE-CLEAN'),
  ('PRE-CLS-002', 'Demobilisation & Site Reinstatement',            'lot', '01 70 00', 'PRE', 'PRE', 'CLS', 'construction', 'fixed',    null, null, null, null, '{}', '{}', null),
  ('PRE-CLS-003', 'As-built Drawings, O&M Manuals & Handover',      'lot', '01 78 00', 'PRE', 'PRE', 'CLS', 'submittal',    'fixed',    null, null, null, null, '{}', '{}', null),
  ('PRE-CLS-004', 'Snagging & Defects Rectification',               'lot', '01 70 00', 'PRE', 'PRE', 'CLS', 'construction', 'fixed',    null, null, null, null, '{}', '{}', null),
  -- 02 Existing conditions
  ('PRE-SVY-001', 'Topographic & Condition Survey',                 'lot', '02 21 00', 'PRE', 'EXC', 'SVY', 'construction', 'fixed',    null, null, null, null, '{MS-01-02}', '{}', 'PKG-DEM-SI'),
  ('PRE-SVY-002', 'Geotechnical Investigation (Boreholes)',         'nos', '02 32 00', 'PRE', 'EXC', 'SVY', 'construction', 'quantity', 1,    2, 'Driller', 2, '{}', '{}', 'PKG-DEM-SI'),
  ('PRE-SVY-003', 'Existing Utilities Detection & Diversion',       'lot', '02 21 00', 'PRE', 'EXC', 'SVY', 'construction', 'fixed',    null, null, null, null, '{MS-01-02}', '{}', 'PKG-DEM-SI'),
  ('PRE-DEM-001', 'Site Clearance & Grubbing',                      'm²',  '02 41 00', 'PRE', 'EXC', 'DEM', 'construction', 'quantity', 800,  1, 'Machine Operator', 3, '{MS-02-01}', '{}', 'PKG-DEM-01'),
  ('PRE-DEM-002', 'Building Demolition (Mechanical)',               'm²',  '02 41 00', 'PRE', 'EXC', 'DEM', 'construction', 'quantity', 150,  2, 'Machine Operator', 4, '{MS-02-01}', '{}', 'PKG-DEM-01'),
  ('PRE-DEM-003', 'Selective Demolition & Strip-out',               'm²',  '02 41 19', 'PRE', 'EXC', 'DEM', 'construction', 'quantity', 60,   2, 'Demolition Worker', 3, '{MS-02-01}', '{}', 'PKG-DEM-01'),
  ('PRE-DEM-004', 'Asbestos / Hazardous Material Removal',          'm²',  '02 82 00', 'PRE', 'EXC', 'DEM', 'construction', 'quantity', 30,   2, 'Licensed Remover', 2, '{MS-02-02}', '{}', 'PKG-DEM-HAZ'),
  ('PRE-DEM-005', 'Tree Felling & Stump Removal',                   'nos', '02 41 00', 'PRE', 'EXC', 'DEM', 'construction', 'quantity', 10,   1, 'Machine Operator', 3, '{MS-02-01}', '{}', 'PKG-DEM-01'),
  ('PRE-DEM-006', 'Removal & Disposal of Demolition Debris',        'm³',  '02 41 00', 'PRE', 'EXC', 'DEM', 'construction', 'quantity', 120,  1, 'Machine Operator', 2, '{MS-02-01}', '{}', 'PKG-DEM-01'),
  -- 04 Masonry
  ('ARC-MAS-BLK-002', 'Brick Masonry Wall (Clay Brick)',            'm²',  '04 21 00', 'ARC', 'MAS', 'BLK', 'construction', 'quantity', 10,   2, 'Mason', 2, '{MS-04-01}', '{TC-04-01}', 'PKG-ARC-MAS'),
  ('ARC-MAS-BLK-003', 'Hollow Concrete Block Partition',            'm²',  '04 22 00', 'ARC', 'MAS', 'BLK', 'construction', 'quantity', 14,   2, 'Mason', 2, '{MS-04-01}', '{TC-04-01}', 'PKG-ARC-MAS'),
  ('ARC-MAS-BLK-004', 'Lintels & Masonry Reinforcement',            'm',   '04 20 00', 'ARC', 'MAS', 'BLK', 'construction', 'quantity', 25,   1, 'Mason', 1, '{MS-04-01}', '{}', 'PKG-ARC-MAS'),
  ('ARC-MAS-BLK-005', 'Fair-faced / Feature Brickwork',             'm²',  '04 21 00', 'ARC', 'MAS', 'BLK', 'construction', 'quantity', 6,    2, 'Mason', 1, '{MS-04-01}', '{TC-04-01}', 'PKG-ARC-MAS'),
  ('ARC-MAS-BLK-006', 'Stone Masonry Retaining Wall',               'm³',  '04 43 00', 'ARC', 'MAS', 'BLK', 'construction', 'quantity', 3,    2, 'Mason', 2, '{MS-04-01}', '{TC-04-01}', 'PKG-ARC-MAS'),
  -- 05 Metalwork
  ('STR-MET-001', 'Steel Staircase Fabrication & Installation',     'ton', '05 51 00', 'STR', 'MET', 'MET', 'construction', 'quantity', 0.5,  3, 'Steel Fixer', 2, '{MS-05-01}', '{TC-05-01,TC-05-02}', 'PKG-STR-STEEL'),
  ('STR-MET-002', 'Steel Handrails & Balustrades',                  'm',   '05 52 00', 'STR', 'MET', 'MET', 'construction', 'quantity', 12,   2, 'Welder', 1, '{}', '{TC-05-01}', 'PKG-ARC-METAL'),
  ('STR-MET-003', 'Steel Decking (Composite Floor)',                'm²',  '05 31 00', 'STR', 'MET', 'MET', 'construction', 'quantity', 150,  3, 'Steel Fixer', 2, '{MS-05-01}', '{TC-05-01}', 'PKG-STR-STEEL'),
  ('STR-MET-004', 'Miscellaneous Metalwork (Ladders, Grating, Covers)', 'kg', '05 50 00', 'STR', 'MET', 'MET', 'construction', 'quantity', 400, 2, 'Welder', 1, '{}', '{TC-05-01}', 'PKG-ARC-METAL'),
  ('STR-MET-005', 'Light-gauge Steel Framing',                      'm²',  '05 40 00', 'STR', 'MET', 'MET', 'construction', 'quantity', 40,   2, 'Steel Fixer', 2, '{MS-05-01}', '{TC-05-02}', 'PKG-STR-STEEL'),
  ('STR-MET-006', 'Steel Canopy Structure',                         'ton', '05 12 00', 'STR', 'MET', 'MET', 'construction', 'quantity', 0.8,  3, 'Steel Erector', 2, '{MS-05-01}', '{TC-05-01,TC-05-02}', 'PKG-STR-STEEL'),
  -- 06 Joinery
  ('ARC-JNR-005', 'Timber Door Frames & Architraves',               'nos', '06 20 00', 'ARC', 'JNR', 'JNR', 'construction', 'quantity', 8,    1, 'Carpenter', 1, '{MS-06-01}', '{}', 'PKG-ARC-JOIN'),
  ('ARC-JNR-006', 'Timber Skirting & Trims',                        'm',   '06 46 00', 'ARC', 'JNR', 'JNR', 'construction', 'quantity', 60,   1, 'Carpenter', 1, '{MS-06-01}', '{}', 'PKG-ARC-JOIN'),
  ('ARC-JNR-007', 'Timber Wall Panelling / Cladding',               'm²',  '06 20 00', 'ARC', 'JNR', 'JNR', 'construction', 'quantity', 15,   2, 'Carpenter', 1, '{MS-06-01}', '{}', 'PKG-ARC-JOIN'),
  ('ARC-JNR-008', 'Reception / Feature Counters (Millwork)',        'm',   '06 41 00', 'ARC', 'JNR', 'JNR', 'construction', 'quantity', 3,    2, 'Carpenter', 1, '{MS-06-01}', '{}', 'PKG-ARC-JOIN'),
  ('ARC-JNR-009', 'Timber / Composite Decking',                     'm²',  '06 73 00', 'ARC', 'JNR', 'JNR', 'construction', 'quantity', 20,   2, 'Carpenter', 1, '{MS-06-01}', '{}', 'PKG-ARC-JOIN'),
  ('ARC-JNR-010', 'Timber Roof Battens & Fascia',                   'm',   '06 10 00', 'ARC', 'JNR', 'JNR', 'construction', 'quantity', 80,   2, 'Carpenter', 1, '{MS-06-01}', '{}', 'PKG-ARC-JOIN'),
  -- 08 Openings
  ('ARC-DW-005', 'Fire-rated Door Sets',                            'nos', '08 11 13', 'ARC', 'OPN', 'DW', 'construction', 'quantity', 4,    2, 'Carpenter', 1, '{MS-08-01}', '{TC-08-02}', 'PKG-ARC-DOOR'),
  ('ARC-DW-006', 'Steel Doors & Frames (Hollow Metal)',             'nos', '08 11 13', 'ARC', 'OPN', 'DW', 'construction', 'quantity', 6,    2, 'Carpenter', 1, '{MS-08-01}', '{}', 'PKG-ARC-DOOR'),
  ('ARC-DW-007', 'Ironmongery & Door Closers',                      'set', '08 71 00', 'ARC', 'OPN', 'DW', 'construction', 'quantity', 10,   1, 'Carpenter', 0, '{MS-08-01}', '{TC-08-02}', 'PKG-ARC-DOOR'),
  ('ARC-DW-008', 'Aluminium Louvres',                               'm²',  '08 91 00', 'ARC', 'OPN', 'DW', 'construction', 'quantity', 15,   2, 'Aluminium Fabricator', 1, '{MS-08-01}', '{}', 'PKG-ARC-ALUM'),
  ('ARC-DW-009', 'Access Panels & Hatches',                         'nos', '08 31 00', 'ARC', 'OPN', 'DW', 'construction', 'quantity', 10,   1, 'Carpenter', 1, '{MS-08-01}', '{}', 'PKG-ARC-DOOR'),
  ('ARC-DW-010', 'Automatic Sliding Entrance Doors',                'nos', '08 40 00', 'ARC', 'OPN', 'DW', 'construction', 'quantity', 1,    2, 'Aluminium Fabricator', 1, '{MS-08-01}', '{}', 'PKG-ARC-ALUM'),
  ('ARC-DW-011', 'Skylights / Roof Lights',                         'm²',  '08 60 00', 'ARC', 'OPN', 'DW', 'construction', 'quantity', 10,   2, 'Glazier', 1, '{MS-08-01}', '{TC-08-01}', 'PKG-ARC-ALUM'),
  -- 10 Specialties
  ('ARC-SPC-001', 'Toilet Cubicles & Partitions',                   'nos', '10 21 13', 'ARC', 'SPC', 'SPC', 'construction', 'quantity', 4,    2, 'Fitter', 0, '{MS-10-01}', '{}', 'PKG-ARC-SPEC'),
  ('ARC-SPC-002', 'Toilet & Washroom Accessories',                  'nos', '10 28 00', 'ARC', 'SPC', 'SPC', 'construction', 'quantity', 20,   1, 'Fitter', 0, '{MS-10-01}', '{}', 'PKG-ARC-SPEC'),
  ('ARC-SPC-003', 'Fire Extinguishers & Cabinets',                  'nos', '10 44 00', 'ARC', 'SPC', 'SPC', 'construction', 'quantity', 20,   1, 'Fitter', 0, '{MS-10-01}', '{}', 'PKG-MEP-FIRE'),
  ('ARC-SPC-004', 'Internal Signage & Room Identification',         'nos', '10 14 00', 'ARC', 'SPC', 'SPC', 'construction', 'quantity', 25,   1, 'Fitter', 1, '{MS-10-01}', '{}', 'PKG-ARC-SPEC'),
  ('ARC-SPC-005', 'Operable / Folding Partitions',                  'm²',  '10 22 00', 'ARC', 'SPC', 'SPC', 'construction', 'quantity', 10,   2, 'Fitter', 1, '{MS-10-01}', '{}', 'PKG-ARC-SPEC'),
  ('ARC-SPC-006', 'Lockers',                                        'nos', '10 51 00', 'ARC', 'SPC', 'SPC', 'construction', 'quantity', 15,   1, 'Fitter', 1, '{MS-10-01}', '{}', 'PKG-ARC-SPEC'),
  ('ARC-SPC-007', 'Entrance Canopy / Protective Cover',             'm²',  '10 73 00', 'ARC', 'SPC', 'SPC', 'construction', 'quantity', 8,    2, 'Fitter', 2, '{MS-10-01}', '{}', 'PKG-ARC-SPEC'),
  ('ARC-SPC-008', 'Mailboxes & Postal Specialties',                 'nos', '10 55 00', 'ARC', 'SPC', 'SPC', 'construction', 'quantity', 10,   1, 'Fitter', 0, '{MS-10-01}', '{}', 'PKG-ARC-SPEC'),
  -- 11 Equipment
  ('ARC-FUR-001', 'Kitchen Appliances Installation',                'nos', '11 31 00', 'ARC', 'SPC', 'FUR', 'construction', 'quantity', 6,    1, 'Fitter', 0, '{}', '{}', 'PKG-ARC-FFE'),
  ('ARC-FUR-002', 'Commercial Kitchen Equipment',                   'lot', '11 40 00', 'ARC', 'SPC', 'FUR', 'construction', 'fixed',    null, null, null, null, '{}', '{}', 'PKG-ARC-FFE'),
  ('ARC-FUR-003', 'Building Maintenance Unit / Gondola',            'nos', '11 24 00', 'ARC', 'SPC', 'FUR', 'construction', 'fixed',    null, null, null, null, '{}', '{}', 'PKG-ARC-BMU'),
  ('ARC-FUR-004', 'Waste Compactor & Refuse Chute Equipment',       'nos', '11 82 00', 'ARC', 'SPC', 'FUR', 'construction', 'fixed',    null, null, null, null, '{}', '{}', 'PKG-ARC-FFE'),
  -- 12 Furnishings
  ('ARC-FUR-005', 'Window Blinds & Curtains',                       'm²',  '12 21 00', 'ARC', 'SPC', 'FUR', 'construction', 'quantity', 30,   1, 'Fitter', 1, '{}', '{}', 'PKG-ARC-FFE'),
  ('ARC-FUR-006', 'Entrance Mats & Frames',                         'm²',  '12 48 00', 'ARC', 'SPC', 'FUR', 'construction', 'quantity', 10,   1, 'Fitter', 0, '{}', '{}', 'PKG-ARC-FFE'),
  ('ARC-FUR-007', 'Loose Furniture Installation',                   'lot', '12 50 00', 'ARC', 'SPC', 'FUR', 'construction', 'fixed',    null, null, null, null, '{}', '{}', 'PKG-ARC-FFE'),
  ('ARC-FUR-008', 'Site Furnishings (Benches, Bins, Bike Racks)',   'nos', '12 93 00', 'ARC', 'SPC', 'FUR', 'construction', 'quantity', 10,   1, 'Fitter', 1, '{}', '{}', 'PKG-ARC-FFE'),
  ('ARC-FUR-009', 'Interior Planters & Landscaping',                'nos', '12 92 00', 'ARC', 'SPC', 'FUR', 'construction', 'quantity', 10,   1, 'Gardener', 1, '{}', '{}', 'PKG-ARC-FFE'),
  -- 13 Special construction
  ('ARC-SPC-009', 'Prefabricated Modular Rooms / Cabins',           'nos', '13 34 00', 'ARC', 'SPC', 'SPC', 'construction', 'quantity', 2,    3, 'Fitter', 2, '{}', '{}', null),
  ('ARC-SPC-010', 'Water Feature / Fountain',                       'lot', '13 12 00', 'ARC', 'SPC', 'SPC', 'construction', 'fixed',    null, null, null, null, '{}', '{}', null),
  ('ARC-SPC-011', 'Tensile Fabric Structure',                       'm²',  '13 31 00', 'ARC', 'SPC', 'SPC', 'construction', 'quantity', 20,   3, 'Rigger', 2, '{}', '{}', null),
  -- 14 Conveying
  ('MEP-LFT-001', 'Passenger Lift Installation',                    'nos', '14 21 00', 'MEP', 'CONV', 'LFT', 'construction', 'quantity', 0.025, 2, 'Lift Technician', 2, '{MS-14-01}', '{TC-14-01}', 'PKG-MEP-LIFT'),
  ('MEP-LFT-002', 'Goods / Service Lift Installation',              'nos', '14 21 00', 'MEP', 'CONV', 'LFT', 'construction', 'quantity', 0.025, 2, 'Lift Technician', 2, '{MS-14-01}', '{TC-14-01}', 'PKG-MEP-LIFT'),
  ('MEP-LFT-003', 'Escalator Installation',                         'nos', '14 31 00', 'MEP', 'CONV', 'LFT', 'construction', 'quantity', 0.03, 2, 'Lift Technician', 2, '{MS-14-01}', '{TC-14-01}', 'PKG-MEP-LIFT'),
  ('MEP-LFT-004', 'Hydraulic / Car Park Lift',                      'nos', '14 24 00', 'MEP', 'CONV', 'LFT', 'construction', 'quantity', 0.04, 2, 'Lift Technician', 2, '{MS-14-01}', '{TC-14-01}', 'PKG-MEP-LIFT'),
  ('MEP-LFT-005', 'Platform / Wheelchair Lift',                     'nos', '14 42 00', 'MEP', 'CONV', 'LFT', 'construction', 'quantity', 0.2,  2, 'Lift Technician', 1, '{MS-14-01}', '{TC-14-01}', 'PKG-MEP-LIFT'),
  ('MEP-LFT-006', 'Lift Testing, Certification & Handover',         'lot', '14 21 00', 'MEP', 'CONV', 'LFT', 'testing',      'fixed',    null, null, null, null, '{}', '{TC-14-01}', 'PKG-MEP-LIFT'),
  -- 21 Fire suppression
  ('MEP-FP-007', 'Fire Pump Set Installation',                      'nos', '21 30 00', 'MEP', 'FP', 'FP', 'construction', 'quantity', 0.5,  2, 'Pipe Fitter', 2, '{MS-21-01}', '{TC-21-02}', 'PKG-MEP-FIRE'),
  ('MEP-FP-008', 'Fire Standpipe / Riser & Landing Valves',         'm',   '21 12 00', 'MEP', 'FP', 'FP', 'construction', 'quantity', 15,   2, 'Pipe Fitter', 1, '{MS-21-01}', '{TC-21-01}', 'PKG-MEP-FIRE'),
  ('MEP-FP-009', 'Fire Water Storage Tank',                         'nos', '21 10 00', 'MEP', 'FP', 'FP', 'construction', 'fixed',    null, null, null, null, '{MS-21-01}', '{}', 'PKG-MEP-FIRE'),
  ('MEP-FP-010', 'Dry-pipe / Deluge Sprinkler System',              'm',   '21 13 16', 'MEP', 'FP', 'FP', 'construction', 'quantity', 20,   2, 'Pipe Fitter', 1, '{MS-21-01}', '{TC-21-01}', 'PKG-MEP-FIRE'),
  -- 22 Plumbing
  ('MEP-PLB-007', 'Domestic Water Booster Pump Set',                'nos', '22 11 23', 'MEP', 'PLB', 'PLB', 'construction', 'quantity', 0.5,  2, 'Plumber', 1, '{MS-22-01}', '{TC-22-01}', 'PKG-MEP-PLB'),
  ('MEP-PLB-008', 'Water Storage Tanks (GRP / Sectional)',          'nos', '22 12 00', 'MEP', 'PLB', 'PLB', 'construction', 'quantity', 0.5,  3, 'Plumber', 2, '{MS-22-01}', '{TC-22-02}', 'PKG-MEP-PLB'),
  ('MEP-PLB-009', 'Rainwater / Storm Drainage Pipework',            'm',   '22 14 00', 'MEP', 'PLB', 'PLB', 'construction', 'quantity', 20,   2, 'Plumber', 1, '{MS-22-01}', '{TC-22-01}', 'PKG-MEP-PLB'),
  ('MEP-PLB-010', 'Water Treatment / Filtration Plant',             'lot', '22 31 00', 'MEP', 'PLB', 'PLB', 'construction', 'fixed',    null, null, null, null, '{MS-22-01}', '{TC-22-02}', 'PKG-MEP-PLB'),
  ('MEP-PLB-011', 'Water Meters & Valves',                          'nos', '22 05 19', 'MEP', 'PLB', 'PLB', 'construction', 'quantity', 10,   1, 'Plumber', 1, '{MS-22-01}', '{}', 'PKG-MEP-PLB'),
  -- 23 HVAC
  ('MEP-HVAC-008', 'Split / VRF Air-Conditioning Units',            'nos', '23 81 26', 'MEP', 'MECH', 'HVAC', 'construction', 'quantity', 3,   2, 'HVAC Technician', 1, '{MS-23-01}', '{TC-23-02}', 'PKG-MEP-HVAC'),
  ('MEP-HVAC-009', 'Refrigerant Piping (VRF)',                      'm',   '23 23 00', 'MEP', 'MECH', 'HVAC', 'construction', 'quantity', 20,  2, 'HVAC Technician', 1, '{MS-23-01}', '{}', 'PKG-MEP-HVAC'),
  ('MEP-HVAC-010', 'Chiller Installation',                          'nos', '23 64 00', 'MEP', 'MECH', 'HVAC', 'construction', 'quantity', 0.2, 3, 'HVAC Technician', 3, '{MS-23-01}', '{TC-23-03}', 'PKG-MEP-HVAC'),
  ('MEP-HVAC-011', 'Cooling Tower Installation',                    'nos', '23 65 00', 'MEP', 'MECH', 'HVAC', 'construction', 'quantity', 0.3, 3, 'HVAC Technician', 2, '{MS-23-01}', '{TC-23-02}', 'PKG-MEP-HVAC'),
  ('MEP-HVAC-012', 'Ventilation & Exhaust Fans',                    'nos', '23 34 00', 'MEP', 'MECH', 'HVAC', 'construction', 'quantity', 4,   2, 'HVAC Technician', 1, '{MS-23-01}', '{TC-23-02}', 'PKG-MEP-HVAC'),
  ('MEP-HVAC-013', 'Fire & Volume Control Dampers',                 'nos', '23 33 00', 'MEP', 'MECH', 'HVAC', 'construction', 'quantity', 10,  2, 'Duct Fitter', 0, '{MS-23-01}', '{TC-23-01}', 'PKG-MEP-HVAC'),
  ('MEP-HVAC-014', 'Chilled Water Pumps',                           'nos', '23 21 23', 'MEP', 'MECH', 'HVAC', 'construction', 'quantity', 1,   2, 'Pipe Fitter', 1, '{MS-23-01}', '{TC-23-02}', 'PKG-MEP-HVAC'),
  -- 25 Integrated automation
  ('MEP-BMS-001', 'BMS Network & Controllers (DDC Panels)',         'nos',   '25 10 00', 'MEP', 'ELV', 'BMS', 'construction', 'quantity', 2,  2, 'Controls Technician', 0, '{MS-25-01}', '{TC-25-01}', 'PKG-ELV-BMS'),
  ('MEP-BMS-002', 'BMS Field Devices & Sensors',                    'point', '25 30 00', 'MEP', 'ELV', 'BMS', 'construction', 'quantity', 20, 1, 'Controls Technician', 1, '{MS-25-01}', '{TC-25-01}', 'PKG-ELV-BMS'),
  ('MEP-BMS-003', 'BMS Graphics, Integration & Commissioning',      'lot',   '25 50 00', 'MEP', 'ELV', 'BMS', 'testing',      'fixed',    null, null, null, null, '{MS-25-01}', '{TC-25-01}', 'PKG-ELV-BMS'),
  ('MEP-BMS-004', 'Energy Metering System',                         'nos',   '25 30 00', 'MEP', 'ELV', 'BMS', 'construction', 'quantity', 8,  1, 'Controls Technician', 0, '{MS-25-01}', '{TC-25-01}', 'PKG-ELV-BMS'),
  -- 26 Electrical plant
  ('MEP-ELE-010', 'MV Switchgear & Transformer Installation',       'nos', '26 12 00', 'MEP', 'ELE', 'ELE', 'construction', 'quantity', 0.5, 3, 'Electrician', 2, '{MS-26-01}', '{TC-26-01,TC-26-03}', 'PKG-MEP-ELEC'),
  ('MEP-ELE-011', 'Standby Generator Installation',                 'nos', '26 32 13', 'MEP', 'ELE', 'ELE', 'construction', 'quantity', 0.3, 3, 'Electrician', 2, '{MS-26-01}', '{TC-26-04}', 'PKG-MEP-GEN'),
  ('MEP-ELE-012', 'UPS & Battery System',                           'nos', '26 33 53', 'MEP', 'ELE', 'ELE', 'construction', 'quantity', 0.5, 2, 'Electrician', 1, '{MS-26-01}', '{TC-26-03}', 'PKG-MEP-GEN'),
  ('MEP-ELE-013', 'Emergency & Exit Lighting',                      'nos', '26 52 00', 'MEP', 'ELE', 'ELE', 'construction', 'quantity', 20,  1, 'Electrician', 1, '{MS-26-01}', '{TC-26-05}', 'PKG-MEP-ELEC'),
  ('MEP-ELE-014', 'Busduct / Rising Mains',                         'm',   '26 25 00', 'MEP', 'ELE', 'ELE', 'construction', 'quantity', 15,  2, 'Electrician', 1, '{MS-26-01}', '{TC-26-01}', 'PKG-MEP-ELEC'),
  -- 27 Communications
  ('MEP-COM-001', 'Structured Cabling (Data / Voice)',              'point', '27 15 00', 'MEP', 'ELV', 'COM', 'construction', 'quantity', 25, 2, 'ELV Technician', 1, '{MS-27-01}', '{TC-27-01}', 'PKG-ELV-ICT'),
  ('MEP-COM-002', 'Telecom / Server Room Fit-out (Racks & Trays)',  'nos',   '27 11 00', 'MEP', 'ELV', 'COM', 'construction', 'quantity', 1,  2, 'ELV Technician', 1, '{MS-27-01}', '{}', 'PKG-ELV-ICT'),
  ('MEP-COM-003', 'MATV / IPTV System',                             'point', '27 41 00', 'MEP', 'ELV', 'COM', 'construction', 'quantity', 15, 1, 'ELV Technician', 1, '{MS-27-01}', '{}', 'PKG-ELV-ICT'),
  ('MEP-COM-004', 'Network Active Equipment & Wi-Fi',               'nos',   '27 21 00', 'MEP', 'ELV', 'COM', 'construction', 'quantity', 10, 1, 'ELV Technician', 0, '{MS-27-01}', '{}', 'PKG-ELV-ICT'),
  -- 28 Electronic safety & security
  ('MEP-SEC-001', 'Fire Alarm Panel & Interface Modules',           'nos',  '28 31 00', 'MEP', 'ELV', 'SEC', 'construction', 'quantity', 0.5, 2, 'ELV Technician', 0, '{MS-28-01}', '{TC-28-01}', 'PKG-MEP-FIRE'),
  ('MEP-SEC-002', 'CCTV System',                                    'nos',  '28 23 00', 'MEP', 'ELV', 'SEC', 'construction', 'quantity', 6,   2, 'ELV Technician', 1, '{MS-28-01}', '{TC-28-02}', 'PKG-ELV-SEC'),
  ('MEP-SEC-003', 'Access Control System',                          'door', '28 13 00', 'MEP', 'ELV', 'SEC', 'construction', 'quantity', 3,   2, 'ELV Technician', 0, '{MS-28-01}', '{TC-28-02}', 'PKG-ELV-SEC'),
  ('MEP-SEC-004', 'Intrusion Detection & Intercom',                 'nos',  '28 16 00', 'MEP', 'ELV', 'SEC', 'construction', 'quantity', 8,   1, 'ELV Technician', 1, '{MS-28-01}', '{TC-28-02}', 'PKG-ELV-SEC'),
  ('MEP-SEC-005', 'Gas Detection System',                           'nos',  '28 32 00', 'MEP', 'ELV', 'SEC', 'construction', 'quantity', 6,   1, 'ELV Technician', 1, '{MS-28-01}', '{}', 'PKG-ELV-SEC');

-- masters (draft; visible_code assigned by trigger from the CSI division)
insert into public.plan_act_masters (code, name, domain_id, category_id, family_id, discipline, work_type, default_unit,
    status, version, owner, source, effective_date, duration_basis, csi_division_code, csi_section_code, trade, activity_type)
select e.code, e.name, d.id, c.id, f.id, case e.dom when 'PRE' then 'GEN' else e.dom end, c.name, e.unit,
       'draft', 1, 'Planning Standards', 'Company Standard (expansion seed 2026-11)', date '2026-11-04', e.basis,
       left(e.sec, 2), e.sec,
       case e.dom when 'PRE' then 'General' when 'ARC' then 'Architecture' when 'STR' then 'Structure' else 'MEP' end,
       e.atype
from _exp e
join public.plan_act_domains d on d.code = e.dom
join public.plan_act_categories c on c.domain_id = d.id and c.code = e.cat
join public.plan_act_families f on f.category_id = c.id and f.code = e.fam
on conflict (code, version) do nothing;

-- method statement links
insert into public.plan_act_master_method_statements (master_id, method_statement_id, sort_order)
select m.id, s.id, 10 * row_number() over (partition by m.id order by s.code)
from _exp e
cross join lateral unnest(e.ms) as x(code)
join public.plan_act_masters m on m.code = e.code and m.version = 1
join public.plan_act_method_statements s on s.code = x.code
on conflict do nothing;

-- T&C links
insert into public.plan_act_master_tc_items (master_id, tc_item_id, sort_order)
select m.id, t.id, 10 * row_number() over (partition by m.id order by t.code)
from _exp e
cross join lateral unnest(e.tc) as x(code)
join public.plan_act_masters m on m.code = e.code and m.version = 1
join public.plan_act_tc_items t on t.code = x.code
on conflict do nothing;

-- package links
insert into public.plan_act_master_procurement_packages (master_id, package_id, sort_order)
select m.id, p.id, 10
from _exp e
join public.plan_act_masters m on m.code = e.code and m.version = 1
join public.plan_act_procurement_packages p on p.code = e.pkg
on conflict (master_id, package_id) do nothing;

-- BOQ links: active cost items of the same CSI section, only where the section is specific (<= 5 items)
insert into public.plan_act_master_work_items (master_id, work_item_id, share_pct, sort_order, source)
select m.id, w.id, 100, 10 * row_number() over (partition by m.id order by w.code), 'import'
from _exp e
join public.plan_act_masters m on m.code = e.code and m.version = 1 and m.status = 'draft'
join public.dwl_work_items w on w.csi_section_code = e.sec and w.is_active
where (select count(*) from public.dwl_work_items w2 where w2.csi_section_code = e.sec and w2.is_active) <= 5
on conflict (master_id, work_item_id) do nothing;

-- draft norms for quantity masters
insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select 'NRM-' || m.code, lower(e.name), m.trade, m.discipline, m.code, m.default_unit,
  round((e.skilled + e.helpers) * 8.0 / e.output, 4), 8, 100, 'manual',
  'ASSUMPTION: indicative rate ' || e.output || ' ' || m.default_unit || '/crew-day, crew ' || e.skilled || ' ' || e.srole
    || coalesce(' + ' || nullif(e.helpers, 0) || ' General Worker', '') || '. Expansion seed 2026-11. Calibrate on site before approving.',
  'draft', 1, e.output, m.id
from _exp e
join public.plan_act_masters m on m.code = e.code and m.version = 1
where e.basis = 'quantity' and e.output is not null
  and not exists (select 1 from public.plan_productivity_norms n where n.project_id is null and n.code = 'NRM-' || m.code);
