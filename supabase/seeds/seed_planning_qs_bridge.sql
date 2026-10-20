-- Seed: Planning <-> QS bridge, Phase 1 standards (doc 21). Idempotent: re-running adds what is missing and
-- re-applies master attributes; it never deletes rows a user added or edited.
-- Source: docs/Standard_WBS_Planning_and_QS_Modules.xlsx (sheets 01, 03, 04) + the QS Element Library and the
-- PJR-2026-003 tender BOQ classification (checked 2026-10-20).
-- Everything numeric here is an ASSUMPTION / indicative company starting figure: masters are draft, norms are
-- draft, and every assumed split says so in its note.
-- Depends on: seed_activity_library.sql, migration 20261020000003_planning_qs_bridge.sql.

-- ── A. Category / family for masonry ───────────────────────────────────────
insert into public.plan_act_categories (domain_id, code, name, sort_order)
select d.id, 'MAS', 'Masonry & Partitions', 5 from public.plan_act_domains d where d.code = 'ARC'
on conflict (domain_id, code) do nothing;

insert into public.plan_act_families (category_id, code, name, sort_order)
select c.id, 'BLK', 'Blockwork', 1
from public.plan_act_categories c join public.plan_act_domains d on d.id = c.domain_id
where d.code = 'ARC' and c.code = 'MAS'
on conflict (category_id, code) do nothing;

-- ── B. Draft masters for elements the BOQ measures but the library lacked ─────
insert into public.plan_act_masters (code, name, description, domain_id, category_id, family_id, discipline, work_type, default_unit, status, version, owner, source)
select v.code, v.name, v.descr, d.id, c.id, f.id, v.discipline, v.work_type, v.unit, 'draft', 1, 'Planning Manager', 'Standard WBS workbook 2026-10-20'
from (values
  ('STR-RC-BEAM-001',  'Beam Reinforcement',          'Fix beam reinforcement',              'STR', 'RC',  'BEAM',  'STR', 'Reinforcement',  'ton'),
  ('STR-RC-BEAM-002',  'Beam Formwork Installation',  'Erect beam side and soffit formwork', 'STR', 'RC',  'BEAM',  'STR', 'Formwork',       'm²'),
  ('STR-RC-BEAM-003',  'Beam Concrete Casting',       'Cast beam concrete',                  'STR', 'RC',  'BEAM',  'STR', 'Concrete Works', 'm³'),
  ('STR-RC-STAIR-001', 'Stair Reinforcement',         'Fix staircase reinforcement',         'STR', 'RC',  'STAIR', 'STR', 'Reinforcement',  'ton'),
  ('STR-RC-STAIR-002', 'Stair Formwork Installation', 'Erect staircase formwork',            'STR', 'RC',  'STAIR', 'STR', 'Formwork',       'm²'),
  ('STR-RC-STAIR-003', 'Stair Concrete Casting',      'Cast staircase concrete',             'STR', 'RC',  'STAIR', 'STR', 'Concrete Works', 'm³'),
  ('STR-RC-FDN-001',   'Pile Cap Reinforcement',      'Fix pile cap / stump reinforcement',  'STR', 'RC',  'FDN',   'STR', 'Reinforcement',  'ton'),
  ('STR-RC-FDN-002',   'Pile Cap Formwork',           'Erect pile cap / stump formwork',     'STR', 'RC',  'FDN',   'STR', 'Formwork',       'm²'),
  ('STR-RC-FDN-003',   'Pile Cap Concrete Casting',   'Cast pile cap / stump concrete',      'STR', 'RC',  'FDN',   'STR', 'Concrete Works', 'm³'),
  ('ARC-MAS-BLK-001',  'Blockwork / Masonry Wall',    'Lay block / brick walls and partitions', 'ARC', 'MAS', 'BLK', 'ARC', 'Masonry',     'm²')
) as v(code, name, descr, dom, cat, fam, discipline, work_type, unit)
join public.plan_act_domains d on d.code = v.dom
join public.plan_act_categories c on c.domain_id = d.id and c.code = v.cat
join public.plan_act_families f on f.category_id = c.id and f.code = v.fam
where not exists (select 1 from public.plan_act_masters m where m.code = v.code);

-- ── C. Master planning attributes: work group, duration basis ────────────────
update public.plan_act_masters m
set default_work_group = case
      when m.code like 'STR-RC-FDN-%' then 'FD'
      when m.code like 'STR-%' then 'ST'
      when m.code like 'ARC-%' then 'AR'
      when m.code in ('MEP-ELE-008', 'MEP-FP-006', 'MEP-HVAC-007', 'MEP-PLB-006') then 'QA'
      when m.code in ('MEP-ELE-001', 'MEP-ELE-007', 'MEP-FP-001', 'MEP-HVAC-001', 'MEP-HVAC-003', 'MEP-HVAC-005',
                      'MEP-PLB-001', 'MEP-PLB-002', 'MEP-PLB-003') then 'M1'
      when m.code like 'MEP-%' then 'M2'
      else m.default_work_group
    end,
    duration_basis = case
      -- per-floor lot activities: standard days, not quantity (workbook "Duration Driver? = No")
      when m.code in ('STR-RC-SLAB-001', 'STR-RC-SLAB-003', 'STR-RC-SLAB-006', 'MEP-ELE-007', 'MEP-ELE-008',
                      'MEP-FP-005', 'MEP-FP-006', 'MEP-HVAC-006', 'MEP-HVAC-007', 'MEP-PLB-006') then 'fixed'
      else 'quantity'
    end
-- first run only: once a master has a work group, its attributes belong to the library managers
where m.default_work_group is null;

-- Default Activity Step Templates (finishes and MEP only: structural masters are already split into
-- rebar / formwork / concrete activities, so a whole-element step template would double count).
update public.plan_act_masters m
set default_step_template_id = t.id
from (values
  ('ARC-MAS-BLK-001', 'Blockwork / Masonry – Typical Floor'),
  ('ARC-FIN-WAL-002', 'Plastering (Internal) – Typical Floor'),
  ('ARC-FIN-WAL-003', 'Wall Tiling – Typical Floor'),
  ('ARC-FIN-WAL-004', 'Internal Painting – Typical Floor'),
  ('ARC-FIN-FLR-002', 'Screed – Typical Floor'),
  ('ARC-FIN-FLR-003', 'Waterproofing (Wet Areas) – Typical Floor'),
  ('ARC-FIN-FLR-004', 'Flooring – Typical Floor'),
  ('ARC-FIN-CLG-003', 'Ceiling – Typical Floor'),
  ('ARC-DW-001',      'Door Frames – Typical Floor'),
  ('ARC-DW-002',      'Doors (Leaf + Ironmongery) – Typical Floor'),
  ('ARC-DW-003',      'Windows / Glazing – Typical Floor'),
  ('MEP-ELE-001',     'Electrical Conduits – Typical Floor'),
  ('MEP-ELE-002',     'Cable Pulling – Typical Floor'),
  ('MEP-ELE-004',     'DB Installation – Typical Floor'),
  ('MEP-ELE-005',     'Lighting Installation – Typical Floor'),
  ('MEP-ELE-006',     'Switches & Sockets – Typical Floor'),
  ('MEP-FP-001',      'Fire Fighting Pipes – Typical Floor'),
  ('MEP-FP-002',      'Sprinkler Heads – Typical Floor'),
  ('MEP-HVAC-001',    'HVAC Ductwork – Typical Floor'),
  ('MEP-HVAC-002',    'HVAC Equipment – Typical Floor'),
  ('MEP-HVAC-003',    'HVAC Pipes – Typical Floor'),
  ('MEP-PLB-001',     'Plumbing Pipes – Typical Floor'),
  ('MEP-PLB-003',     'Drainage Pipes – Typical Floor'),
  ('MEP-PLB-004',     'Plumbing Fixtures – Typical Floor')
) as v(code, template_name)
join public.activity_step_template_master t on t.template_name = v.template_name
where m.code = v.code and m.default_step_template_id is null;

-- ── D. Quantity rules (metric each master measures) ─────────────────────────
-- Runs as the database owner, so the "frozen children" guard lets the seed add rules to active masters.
insert into public.plan_act_quantity_rules (master_id, name, metric_code, unit, provider_priority, deduction_metrics, addition_metrics, note)
select m.id, v.rule_name, v.metric, v.unit, array['bim','boq','manual'], '{}', '{}', v.note
from (values
  ('STR-RC-COL-001',   'Column rebar',          'column_rebar',       't',  'BOQ Structural Column > Rebar (kg x 0.001)'),
  ('STR-RC-COL-002',   'Column formwork',       'column_formwork',    'm²', 'BOQ Structural Column > Formwork'),
  ('STR-RC-COL-003',   'Column concrete',       'column_volume',      'm³', 'BOQ Structural Column > Concrete'),
  ('STR-RC-WALL-001',  'Shear wall rebar',      'wall_rebar',         't',  'BOQ Structural Wall > Rebar (kg x 0.001)'),
  ('STR-RC-WALL-002',  'Shear wall formwork',   'wall_area',          'm²', 'BOQ Structural Wall > Formwork'),
  ('STR-RC-WALL-003',  'Shear wall concrete',   'wall_volume',        'm³', 'BOQ Structural Wall > Concrete'),
  ('STR-RC-CORE-001',  'Core wall rebar',       'core_rebar',         't',  'BOQ Core Wall > Rebar (kg x 0.001)'),
  ('STR-RC-CORE-002',  'Core wall formwork',    'core_formwork',      'm²', 'BOQ Core Wall > Formwork'),
  ('STR-RC-CORE-003',  'Core wall concrete',    'core_volume',        'm³', 'BOQ Core Wall > Concrete'),
  ('STR-RC-SLAB-004',  'Slab bottom rebar',     'slab_rebar_bottom',  't',  'Half of BOQ Structural Slab > Rebar (assumed 50/50 bottom/top)'),
  ('STR-RC-SLAB-005',  'Slab top rebar',        'slab_rebar_top',     't',  'Half of BOQ Structural Slab > Rebar (assumed 50/50 bottom/top)'),
  ('STR-RC-BEAM-001',  'Beam rebar',            'beam_rebar',         't',  'BOQ Structural Beam > Rebar (kg x 0.001)'),
  ('STR-RC-BEAM-002',  'Beam formwork',         'beam_formwork',      'm²', 'BOQ Structural Beam > Formwork'),
  ('STR-RC-BEAM-003',  'Beam concrete',         'beam_volume',        'm³', 'BOQ Structural Beam > Concrete'),
  ('STR-RC-STAIR-001', 'Stair rebar',           'stair_rebar',        't',  'BOQ Structural Staircase > Rebar (kg x 0.001)'),
  ('STR-RC-STAIR-002', 'Stair formwork',        'stair_formwork',     'm²', 'BOQ Structural Staircase > Formwork'),
  ('STR-RC-STAIR-003', 'Stair concrete',        'stair_volume',       'm³', 'BOQ Structural Staircase > Concrete'),
  ('STR-RC-FDN-001',   'Pile cap rebar',        'pilecap_rebar',      't',  'BOQ Pile Cap & Stump > Rebar (kg x 0.001)'),
  ('STR-RC-FDN-002',   'Pile cap formwork',     'pilecap_formwork',   'm²', 'BOQ Pile Cap & Stump > Formwork'),
  ('STR-RC-FDN-003',   'Pile cap concrete',     'pilecap_volume',     'm³', 'BOQ Pile Cap & Stump > Concrete'),
  ('ARC-MAS-BLK-001',  'Blockwork area',        'blockwork_area',     'm²', 'BOQ Hollow clay brick (all thicknesses)'),
  ('ARC-FIN-WAL-002',  'Internal plaster area', 'wall_plaster_area',  'm²', 'BOQ Interior/Internal Wall Finishes > Plastering'),
  ('ARC-FIN-WAL-003',  'Wall tiling area',      'wall_tile_area',     'm²', 'BOQ Wall tiling / Toilet Wall tile'),
  ('ARC-FIN-WAL-004',  'Internal paint area',   'wall_paint_area',    'm²', 'BOQ Interior/Internal Wall Finishes > Painting'),
  ('ARC-FIN-FLR-002',  'Screed area',           'screed_area',        'm²', 'BOQ Screed'),
  ('ARC-FIN-FLR-003',  'Wet area waterproofing','waterproofing_area', 'm²', 'BOQ Waterproofing'),
  ('ARC-FIN-FLR-004',  'Floor tile / stone area','floor_tile_area',   'm²', 'BOQ floor tile and stone lines'),
  ('ARC-FIN-CLG-001',  'Ceiling area',          'ceiling_area',       'm²', 'BOQ Suspended ceiling'),
  ('ARC-FIN-CLG-003',  'Ceiling area',          'ceiling_area',       'm²', 'BOQ Suspended ceiling'),
  ('ARC-DW-001',       'Door count',            'door_count',         'nos','BOQ Interior Door (all types)'),
  ('ARC-DW-002',       'Door count',            'door_count',         'nos','BOQ Interior Door (all types)'),
  ('ARC-DW-003',       'Window count',          'window_count',       'nos','BOQ Glass Window'),
  ('MEP-ELE-001',      'Containment length',    'containment_length', 'm',  'BOQ Cable tray / trunking / ladder / conduit'),
  ('MEP-ELE-002',      'Cable length',          'cable_length',       'm',  'BOQ Power cable / control cable'),
  ('MEP-ELE-004',      'Distribution boards',   'db_count',           'nos','BOQ Sub-distribution board'),
  ('MEP-ELE-005',      'Light fittings',        'luminaire_count',    'nos','BOQ luminaires, emergency lights, exit signs'),
  ('MEP-ELE-006',      'Sockets & switches',    'accessory_points',   'nos','BOQ socket outlets, switches'),
  ('MEP-FP-001',       'Sprinkler pipe length', 'sprinkler_pipe_length','m','BOQ Sprinkler piping'),
  ('MEP-FP-002',       'Sprinkler heads',       'sprinkler_head_count','nos','BOQ Sprinkler head'),
  ('MEP-FP-004',       'Fire alarm devices',    'fire_alarm_points',  'point','BOQ detectors, call points, sounders'),
  ('MEP-HVAC-002',     'AHU / FCU units',       'ahu_fcu_count',      'nos','BOQ AHU, FCU, VRF indoor, split units'),
  ('MEP-HVAC-003',     'Chilled water pipe',    'chw_pipe_length',    'm',  'BOQ Chilled water piping'),
  ('MEP-HVAC-004',     'Air terminals',         'air_terminal_count', 'nos','BOQ diffusers, grilles, louvers'),
  ('MEP-PLB-001',      'Cold water pipe',       'cold_water_pipe_length','m','BOQ Cold water piping'),
  ('MEP-PLB-002',      'Hot water pipe',        'hot_water_pipe_length','m','BOQ Hot water piping'),
  ('MEP-PLB-003',      'Soil & waste pipe',     'drainage_pipe_length','m', 'BOQ soil, waste, vent pipes'),
  ('MEP-PLB-004',      'Sanitary fixtures',     'sanitary_count',     'nos','BOQ sanitary ware')
) as v(code, rule_name, metric, unit, note)
join public.plan_act_masters m on m.code = v.code and m.status in ('draft', 'active')
on conflict (master_id, name) do nothing;

-- ── E. Bridge rules: QS element -> metric ───────────────────────────────────
-- Matched on Sub Section / Sub Element (case-insensitive); Section only where it separates internal from external.
insert into public.plan_act_qs_bridge (role, metric_code, metric_unit, unit_factor, match_discipline, match_section, match_sub_section, match_sub_element, match_unit, note, sort_order)
select v.role, v.metric, v.metric_unit, v.factor, v.disc, v.section, v.sub_section, v.sub_element, v.unit, v.note, v.ord
from (values
  -- structure: element x work type
  ('driver', 'column_rebar',      't',  0.001, 'Civil and Structure', null, 'Structural Column', 'Rebar',    'kg', 'kg -> t', 100),
  ('driver', 'column_formwork',   'm²', 1,     'Civil and Structure', null, 'Structural Column', 'Formwork', 'm2', null, 101),
  ('driver', 'column_volume',     'm³', 1,     'Civil and Structure', null, 'Structural Column', 'Concrete', 'm3', null, 102),
  ('driver', 'wall_rebar',        't',  0.001, 'Civil and Structure', null, 'Structural Wall',   'Rebar',    'kg', 'kg -> t', 110),
  ('driver', 'wall_area',         'm²', 1,     'Civil and Structure', null, 'Structural Wall',   'Formwork', 'm2', null, 111),
  ('driver', 'wall_volume',       'm³', 1,     'Civil and Structure', null, 'Structural Wall',   'Concrete', 'm3', null, 112),
  ('driver', 'core_rebar',        't',  0.001, 'Civil and Structure', null, 'Core Wall',         'Rebar',    'kg', 'kg -> t', 115),
  ('driver', 'core_formwork',     'm²', 1,     'Civil and Structure', null, 'Core Wall',         'Formwork', 'm2', null, 116),
  ('driver', 'core_volume',       'm³', 1,     'Civil and Structure', null, 'Core Wall',         'Concrete', 'm3', null, 117),
  ('driver', 'slab_rebar_bottom', 't',  0.0005,'Civil and Structure', null, 'Structural Slab',   'Rebar',    'kg', 'kg -> t, ASSUMPTION: half of slab rebar is bottom mesh', 120),
  ('driver', 'slab_rebar_top',    't',  0.0005,'Civil and Structure', null, 'Structural Slab',   'Rebar',    'kg', 'kg -> t, ASSUMPTION: half of slab rebar is top mesh', 121),
  ('driver', 'slab_area',         'm²', 1,     'Civil and Structure', null, 'Structural Slab',   'Formwork', 'm2', 'Slab soffit formwork area', 122),
  ('driver', 'slab_volume',       'm³', 1,     'Civil and Structure', null, 'Structural Slab',   'Concrete', 'm3', null, 123),
  ('driver', 'beam_rebar',        't',  0.001, 'Civil and Structure', null, 'Structural Beam',   'Rebar',    'kg', 'kg -> t', 130),
  ('driver', 'beam_formwork',     'm²', 1,     'Civil and Structure', null, 'Structural Beam',   'Formwork', 'm2', null, 131),
  ('driver', 'beam_volume',       'm³', 1,     'Civil and Structure', null, 'Structural Beam',   'Concrete', 'm3', null, 132),
  ('driver', 'stair_rebar',       't',  0.001, 'Civil and Structure', null, 'Structural Staircase', 'Rebar',    'kg', 'kg -> t', 140),
  ('driver', 'stair_formwork',    'm²', 1,     'Civil and Structure', null, 'Structural Staircase', 'Formwork', 'm2', null, 141),
  ('driver', 'stair_volume',      'm³', 1,     'Civil and Structure', null, 'Structural Staircase', 'Concrete', 'm3', null, 142),
  ('driver', 'pilecap_rebar',     't',  0.001, 'Civil and Structure', null, 'Pile Cap & Stump',  'Rebar',    'kg', 'kg -> t', 150),
  ('driver', 'pilecap_formwork',  'm²', 1,     'Civil and Structure', null, 'Pile Cap & Stump',  'Formwork', 'm2', null, 151),
  ('driver', 'pilecap_volume',    'm³', 1,     'Civil and Structure', null, 'Pile Cap & Stump',  'Concrete', 'm3', null, 152),
  -- structure: lines that are materials or minor items, not duration drivers
  ('excluded', null, null, 1, null, null, null, 'Steel Tie Wire', null, 'Material within rebar fixing', 190),
  ('excluded', null, null, 1, null, null, null, 'Water Stop',     null, 'Fixed with formwork / concrete', 191),
  ('excluded', null, null, 1, null, null, null, 'Rebar Testing',  null, 'Test, not site work', 192),
  ('excluded', null, null, 1, null, null, null, 'Crush Stone',    null, 'Part of base preparation', 193),
  ('excluded', null, null, 1, null, null, null, 'Lean Concrete',  null, 'Blinding, part of base preparation', 194),
  -- architecture
  ('driver', 'blockwork_area',    'm²', 1, 'Architecture', null, 'Hollow clay brick', null, 'm2', 'All wall thicknesses', 200),
  ('driver', 'wall_plaster_area', 'm²', 1, 'Architecture', 'Internal Wall Finishes', 'Plastering', null, 'm2', null, 210),
  ('driver', 'wall_plaster_area', 'm²', 1, 'Architecture', 'Interior Wall Finishes', 'Plastering', null, 'm2', null, 211),
  ('driver', 'ext_plaster_area',  'm²', 1, 'Architecture', 'Exterior Wall Finishes', 'Plastering', null, 'm2', 'External render: no master yet', 212),
  ('driver', 'wall_paint_area',   'm²', 1, 'Architecture', 'Internal Wall Finishes', 'Painting', null, 'm2', null, 220),
  ('driver', 'wall_paint_area',   'm²', 1, 'Architecture', 'Interior Wall Finishes', 'Painting', null, 'm2', null, 221),
  ('driver', 'ext_paint_area',    'm²', 1, 'Architecture', 'Exterior Wall Finishes', 'Painting', null, 'm2', 'External painting: no master yet', 222),
  ('driver', 'wall_tile_area',    'm²', 1, 'Architecture', null, 'Wall tiling',       null, 'm2', null, 230),
  ('driver', 'wall_tile_area',    'm²', 1, 'Architecture', null, 'Toilet Wall tile',  null, 'm2', null, 231),
  ('driver', 'floor_tile_area',   'm²', 1, 'Architecture', null, 'Toilet Floor tile', null, 'm2', null, 240),
  ('driver', 'floor_tile_area',   'm²', 1, 'Architecture', null, 'Marble on staircase', null, 'm2', null, 241),
  ('driver', 'waterproofing_area','m²', 1, 'Architecture', null, 'Waterproofing',     null, 'm2', null, 245),
  ('driver', 'ceiling_area',      'm²', 1, 'Architecture', null, 'Suspended ceiling', null, 'm2', null, 250),
  ('driver', 'door_count',        'nos',1, 'Architecture', null, 'PVC door',   null, 'pcs', null, 260),
  ('driver', 'door_count',        'nos',1, 'Architecture', null, 'Steel Door', null, 'pcs', null, 261),
  ('driver', 'door_count',        'nos',1, 'Architecture', null, 'Wood door',  null, 'pcs', null, 262),
  ('driver', 'window_count',      'nos',1, 'Architecture', null, 'Glass Window', null, 'pcs', null, 270),
  ('excluded', null, null, 1, 'Architecture', null, 'Signage', null, null, 'Not a duration driver', 290),
  -- MEP (Element Library names; this BOQ has no classified MEP lines yet)
  ('driver', 'containment_length', 'm', 1, null, null, 'Cable & containment', 'Cable tray',     'm', null, 300),
  ('driver', 'containment_length', 'm', 1, null, null, 'Cable & containment', 'Cable trunking', 'm', null, 301),
  ('driver', 'containment_length', 'm', 1, null, null, 'Cable & containment', 'Cable ladder',   'm', null, 302),
  ('driver', 'containment_length', 'm', 1, null, null, 'Cable & containment', 'Conduit',        'm', null, 303),
  ('driver', 'cable_length',       'm', 1, null, null, 'Cable & containment', 'Power cable',    'm', null, 304),
  ('driver', 'cable_length',       'm', 1, null, null, 'Cable & containment', 'Control cable',  'm', null, 305),
  ('driver', 'db_count',         'nos', 1, null, null, 'Main distribution', 'Sub-distribution board (DB)', null, null, 310),
  ('driver', 'luminaire_count',  'nos', 1, null, null, 'Lighting', null, null, null, 320),
  ('driver', 'accessory_points', 'nos', 1, null, null, 'Power & wiring accessories', 'Socket outlet', null, null, 330),
  ('driver', 'accessory_points', 'nos', 1, null, null, 'Power & wiring accessories', 'Switch', null, null, 331),
  ('driver', 'sprinkler_pipe_length','m',1, null, null, 'Sprinkler system', 'Sprinkler piping', 'm', null, 340),
  ('driver', 'sprinkler_head_count','nos',1,null, null, 'Sprinkler system', 'Sprinkler head', null, null, 341),
  ('driver', 'fire_alarm_points','point',1,null, null, 'Fire alarm system', 'Smoke / heat detector', null, null, 350),
  ('driver', 'fire_alarm_points','point',1,null, null, 'Fire alarm system', 'Manual call point', null, null, 351),
  ('driver', 'fire_alarm_points','point',1,null, null, 'Fire alarm system', 'Alarm bell / sounder', null, null, 352),
  ('driver', 'ahu_fcu_count',    'nos', 1, null, null, 'Chilled water system', 'Air handling unit (AHU)', null, null, 360),
  ('driver', 'ahu_fcu_count',    'nos', 1, null, null, 'Chilled water system', 'Fan coil unit (FCU)', null, null, 361),
  ('driver', 'ahu_fcu_count',    'nos', 1, null, null, 'VRF / VRV system', 'VRF indoor unit', null, null, 362),
  ('driver', 'ahu_fcu_count',    'nos', 1, null, null, 'Split unit system', null, null, null, 363),
  ('driver', 'chw_pipe_length',    'm', 1, null, null, 'AC piping & accessories', 'Chilled water piping', 'm', null, 370),
  ('driver', 'air_terminal_count','nos',1, null, null, 'Air terminal', null, null, null, 380),
  ('driver', 'cold_water_pipe_length','m',1,null,null, 'Water supply', 'Cold water piping', 'm', null, 390),
  ('driver', 'hot_water_pipe_length','m',1,null, null, 'Water supply', 'Hot water piping', 'm', null, 391),
  ('driver', 'drainage_pipe_length','m',1, null, null, 'Drainage', 'Soil pipe',  'm', null, 392),
  ('driver', 'drainage_pipe_length','m',1, null, null, 'Drainage', 'Waste pipe', 'm', null, 393),
  ('driver', 'drainage_pipe_length','m',1, null, null, 'Drainage', 'Vent pipe',  'm', null, 394),
  ('driver', 'sanitary_count',   'nos', 1, null, null, 'Sanitary ware', null, null, null, 395),
  ('excluded', null, null, 1, null, null, 'Testing & Commissioning', null, null, 'Fixed-duration commissioning, not quantity', 398)
) as v(role, metric, metric_unit, factor, disc, section, sub_section, sub_element, unit, note, ord)
where not exists (
  select 1 from public.plan_act_qs_bridge b
  where b.role = v.role
    and coalesce(b.metric_code, '') = coalesce(v.metric, '')
    and lower(coalesce(b.match_discipline, '')) = lower(coalesce(v.disc, ''))
    and lower(coalesce(b.match_section, '')) = lower(coalesce(v.section, ''))
    and lower(coalesce(b.match_sub_section, '')) = lower(coalesce(v.sub_section, ''))
    and lower(coalesce(b.match_sub_element, '')) = lower(coalesce(v.sub_element, ''))
);

-- ── F. Workbook productivity rates (sheet 04) as draft company standards ─────
-- labour_constant_hr_per_unit = crew x 8 h / daily output. Crew ranges ("8-10 men") use the midpoint.
insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select v.code, v.name, v.trade, m.discipline, m.code, m.default_unit, round(v.crew * 8.0 / v.output, 4),
  8, 100, 'manual',
  'ASSUMPTION: Standard_WBS_Planning_and_QS_Modules.xlsx sheet 04 ' || v.ref || ' indicative rate (' || v.output || ' ' || m.default_unit
    || '/day, crew ' || v.crew || '). Calibrate after the first 1-2 floors.',
  'draft', 1, v.output, m.id
from (values
  ('WB-P04-PILECAP-REBAR', 'P04', 'STR-RC-FDN-001',   'Pile cap rebar (workbook P04)',        'Reinforcement', 1.2, 9),
  ('WB-P03-PILECAP-CONC',  'P03', 'STR-RC-FDN-003',   'Pile cap concrete (workbook P03)',     'Concrete',      40,  8),
  ('WB-P05-COL-REBAR',     'P05', 'STR-RC-COL-001',   'Column rebar (workbook P05)',          'Reinforcement', 1.0, 8),
  ('WB-P06-BEAM-REBAR',    'P06', 'STR-RC-BEAM-001',  'Beam rebar (workbook P06)',            'Reinforcement', 1.2, 9),
  ('WB-P07-SLAB-REBAR-B',  'P07', 'STR-RC-SLAB-004',  'Slab bottom rebar (workbook P07)',     'Reinforcement', 2.5, 11),
  ('WB-P07-SLAB-REBAR-T',  'P07', 'STR-RC-SLAB-005',  'Slab top rebar (workbook P07)',        'Reinforcement', 2.5, 11),
  ('WB-P08-COL-FORM',      'P08', 'STR-RC-COL-002',   'Column formwork (workbook P08)',       'Formwork',      40,  6),
  ('WB-P09-BEAM-FORM',     'P09', 'STR-RC-BEAM-002',  'Beam formwork (workbook P09)',         'Formwork',      80,  11),
  ('WB-P10-COL-CONC',      'P10', 'STR-RC-COL-003',   'Column concrete (workbook P10)',       'Concrete',      80,  10),
  ('WB-P10-BEAM-CONC',     'P10', 'STR-RC-BEAM-003',  'Beam concrete (workbook P10)',         'Concrete',      80,  10),
  ('WB-P10-WALL-CONC',     'P10', 'STR-RC-WALL-003',  'Shear wall concrete (workbook P10)',   'Concrete',      80,  10),
  ('WB-P11-BLOCKWORK',     'P11', 'ARC-MAS-BLK-001',  'Blockwork 150-200mm (workbook P11)',   'Masonry',       30,  7),
  ('WB-P12-PLASTER',       'P12', 'ARC-FIN-WAL-002',  'Internal plaster (workbook P12)',      'Plastering',    50,  6),
  ('WB-P13-SCREED',        'P13', 'ARC-FIN-FLR-002',  'Floor screed (workbook P13)',          'Finishes',      80,  6),
  ('WB-P14-FLOOR-TILE',    'P14', 'ARC-FIN-FLR-004',  'Floor tiling (workbook P14)',          'Finishes',      35,  5),
  ('WB-P15-WALL-TILE',     'P15', 'ARC-FIN-WAL-003',  'Wall tiling (workbook P15)',           'Finishes',      25,  4),
  ('WB-P16-PAINT',         'P16', 'ARC-FIN-WAL-004',  'Internal painting 2 coats (workbook P16)', 'Painting',  80,  5),
  ('WB-P17-CONDUIT',       'P17', 'MEP-ELE-001',      'Electrical conduits 1st fix (workbook P17)', 'Electrical', 120, 5),
  ('WB-P19-PLUMB-PIPE',    'P19', 'MEP-PLB-001',      'Plumbing pipes 1st fix (workbook P19)', 'Plumbing',     60,  4),
  ('WB-P20-DUCTWORK',      'P20', 'MEP-HVAC-001',     'HVAC ductwork (workbook P20)',         'HVAC',          50,  5),
  ('WB-P21-FF-PIPE',       'P21', 'MEP-FP-001',       'Fire fighting pipes (workbook P21)',   'Fire Protection', 50, 4),
  ('WB-P22-CABLE-PULL',    'P22', 'MEP-ELE-002',      'Cable pulling (workbook P22)',         'Electrical',    200, 4),
  ('WB-P23-LIGHTING',      'P23', 'MEP-ELE-005',      'Lighting installation (workbook P23)', 'Electrical',    30,  4)
) as v(code, ref, master_code, name, trade, output, crew)
join public.plan_act_masters m on m.code = v.master_code and m.status in ('draft', 'active')
where not exists (
  select 1 from public.plan_productivity_norms n where n.project_id is null and lower(n.code) = lower(v.code)
);

-- One labour crew line per workbook norm (the workbook gives a crew size, not a trade split).
insert into public.plan_productivity_norm_resources (norm_id, kind, role_label, workers_per_crew, allocation_rule, is_optional, sort_order)
select n.id, 'labor', n.trade || ' crew (workbook)', round(n.labour_constant_hr_per_unit * n.output_per_day / 8.0), 'per_crew', false, 1
from public.plan_productivity_norms n
where n.project_id is null and n.code like 'WB-P%'
  and not exists (select 1 from public.plan_productivity_norm_resources r where r.norm_id = n.id);

-- Concrete pours: the pump is the limit (workbook P10 note), so it is an equipment line per pour.
insert into public.plan_productivity_norm_resources (norm_id, kind, role_label, workers_per_crew, allocation_rule, is_optional, sort_order)
select n.id, 'equipment', 'Concrete Pump', 1, 'per_pour', false, 2
from public.plan_productivity_norms n
where n.project_id is null and n.code like 'WB-P10-%'
  and not exists (select 1 from public.plan_productivity_norm_resources r where r.norm_id = n.id and r.kind = 'equipment');

-- ── G. Proxy rates for structural activities the workbook gives no figure for ──
-- Each is the closest workbook trade and says so; replace with a real rate or calibrate from site logs.
insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select v.code, v.name, v.trade, m.discipline, m.code, m.default_unit, round(v.crew * 8.0 / v.output, 4), 8, 100, 'manual',
  'ASSUMPTION: PROXY of workbook ' || v.ref || ' (' || v.proxy_of || ', ' || v.output || ' ' || m.default_unit || '/day, crew ' || v.crew
    || '). No workbook figure for this activity; replace or calibrate after the first floors.',
  'draft', 1, v.output, m.id
from (values
  ('WB-PX-WALL-REBAR',  'P05', 'column rebar',     'STR-RC-WALL-001',  'Shear wall rebar (proxy P05)',     'Reinforcement', 1.0, 8),
  ('WB-PX-WALL-FORM',   'P08', 'column formwork',  'STR-RC-WALL-002',  'Shear wall formwork (proxy P08)',  'Formwork',      40,  6),
  ('WB-PX-CORE-REBAR',  'P05', 'column rebar',     'STR-RC-CORE-001',  'Core wall rebar (proxy P05)',      'Reinforcement', 1.0, 8),
  ('WB-PX-CORE-FORM',   'P08', 'column formwork',  'STR-RC-CORE-002',  'Core wall formwork (proxy P08)',   'Formwork',      40,  6),
  ('WB-PX-CORE-CONC',   'P10', 'structural pour',  'STR-RC-CORE-003',  'Core wall concrete (proxy P10)',   'Concrete',      80,  10),
  ('WB-PX-STAIR-REBAR', 'P06', 'beam rebar',       'STR-RC-STAIR-001', 'Stair rebar (proxy P06)',          'Reinforcement', 1.2, 9),
  ('WB-PX-STAIR-FORM',  'P08', 'column formwork',  'STR-RC-STAIR-002', 'Stair formwork (proxy P08)',       'Formwork',      40,  6),
  ('WB-PX-STAIR-CONC',  'P10', 'structural pour',  'STR-RC-STAIR-003', 'Stair concrete (proxy P10)',       'Concrete',      80,  10)
) as v(code, ref, proxy_of, master_code, name, trade, output, crew)
join public.plan_act_masters m on m.code = v.master_code and m.status in ('draft', 'active')
where not exists (select 1 from public.plan_productivity_norms n where n.project_id is null and lower(n.code) = lower(v.code));

insert into public.plan_productivity_norm_resources (norm_id, kind, role_label, workers_per_crew, allocation_rule, is_optional, sort_order)
select n.id, 'labor', n.trade || ' crew (proxy)', round(n.labour_constant_hr_per_unit * n.output_per_day / 8.0), 'per_crew', false, 1
from public.plan_productivity_norms n
where n.project_id is null and n.code like 'WB-PX-%'
  and not exists (select 1 from public.plan_productivity_norm_resources r where r.norm_id = n.id);

insert into public.plan_productivity_norm_resources (norm_id, kind, role_label, workers_per_crew, allocation_rule, is_optional, sort_order)
select n.id, 'equipment', 'Concrete Pump', 1, 'per_pour', false, 2
from public.plan_productivity_norms n
where n.project_id is null and n.code like 'WB-PX-%-CONC'
  and not exists (select 1 from public.plan_productivity_norm_resources r where r.norm_id = n.id and r.kind = 'equipment');

-- ── H. Template placeholders that the bridge now replaces ───────────────────
-- TPL-STR-HR-RC-FLOOR-001 was given fixed starting durations before quantities existed. A fixed duration wins over
-- the calculated one, so once an item's master is quantity-driven, has a quantity rule and a company productivity
-- standard, its placeholder is cleared (draft templates only; an active template is frozen and needs a new version).
update public.plan_act_template_items i
set duration_days_override = null
from public.plan_act_templates t, public.plan_act_masters m
where t.id = i.template_id and m.id = i.master_id
  and t.code = 'TPL-STR-HR-RC-FLOOR-001' and t.status = 'draft'
  and i.duration_days_override is not null
  and m.duration_basis = 'quantity'
  and exists (select 1 from public.plan_act_quantity_rules r where r.master_id = m.id)
  and exists (select 1 from public.plan_productivity_norms n where n.activity_master_id = m.id and n.project_id is null and n.status <> 'retired');

