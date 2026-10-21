-- Activity Library: industrial content (factory / warehouse), Phases B + C + D of the "Activity
-- Library by Sector" plan, after the residential slice (20261021000006 / 07).
--
-- B. Domain IND "Steel & Industrial": pre-engineered steel frame, crane runway, mezzanine steel,
--    superflat industrial floor, machine foundations and pits, metal roof and wall envelope,
--    industrial doors and docks, racking and industrial MEP. DRAFT company norms (indicative
--    South-East Asian rates, 8 h day), quantity rules, work groups SS Steel Structure, EN Building
--    Envelope, IO Industrial Fit-out, and default step templates where one fits.
-- C. DRAFT activity templates: factory ground (with machine foundations, crane runway and crane,
--    process piping), warehouse ground (with docks, racking, forklift charging), mezzanine / office
--    floor, metal roof, pits & trenches. A Planning Manager activates them.
-- D. Links the activities of the two industrial WBS templates to the new masters by exact name
--    (only activities without a master; only industrial templates).
--
-- Idempotent: inserts skip what exists; template items / links are written only while missing.

do $seed$
declare
  r record;
  d_id uuid; c_id uuid; f_id uuid;
begin
  insert into public.plan_act_domains(code, name, sort_order) values ('IND', 'Steel & Industrial', 5)
    on conflict (code) do nothing;

  for r in select * from (values
      ('IND', 'STL', 'Structural Steel',     'PEB', 'Pre-Engineered Steel Frame', 1),
      ('IND', 'STL', 'Structural Steel',     'CRN', 'Crane Runway & Cranes',      2),
      ('IND', 'STL', 'Structural Steel',     'MEZ', 'Mezzanine Steel',            3),
      ('IND', 'FLR', 'Industrial Floors',    'SFS', 'Superflat Slab',             1),
      ('IND', 'FLR', 'Industrial Floors',    'FCT', 'Floor Coatings & Marking',   2),
      ('IND', 'FND', 'Industrial Foundations','MFD', 'Machine Foundations & Pits', 1),
      ('IND', 'ENV', 'Building Envelope',    'RFS', 'Metal Roof',                 1),
      ('IND', 'ENV', 'Building Envelope',    'CLD', 'Wall Cladding',              2),
      ('IND', 'ENV', 'Building Envelope',    'DOR', 'Industrial Doors & Docks',   3),
      ('IND', 'OPS', 'Industrial Fit-out',   'RCK', 'Racking & Operations',       1),
      ('IND', 'OPS', 'Industrial Fit-out',   'IMEP','Industrial MEP',             2)
    ) v(dom, cat, cat_name, fam, fam_name, so)
  loop
    select id into d_id from public.plan_act_domains where code = r.dom;
    insert into public.plan_act_categories(domain_id, code, name) values (d_id, r.cat, r.cat_name)
      on conflict (domain_id, code) do nothing;
    select id into c_id from public.plan_act_categories where domain_id = d_id and code = r.cat;
    insert into public.plan_act_families(category_id, code, name, sort_order) values (c_id, r.fam, r.fam_name, r.so)
      on conflict (category_id, code) do nothing;
  end loop;

  insert into public.plan_work_groups(code, name, description, sort_order) values
    ('SS', 'Steel Structure',     'Pre-engineered / structural steel frame, crane runway, mezzanine steel', 35),
    ('EN', 'Building Envelope',   'Metal roof and wall cladding, industrial doors and docks',              45),
    ('IO', 'Industrial Fit-out',  'Racking, floor coatings and marking, forklift charging',                85)
  on conflict (code) do nothing;

  -- dom, cat, fam, code, name, unit, discipline, work type, work group, basis, sectors, building types
  create temp table _im(dom text, cat text, fam text, code text, name text, unit text, disc text, wtype text,
                        wg text, basis text, sectors text[], btypes text[]) on commit drop;
  insert into _im values
    ('IND','STL','PEB','IND-STL-PEB-001','Anchor Bolt Setting','nos','STR','Steel','FD','quantity','{industrial,commercial}','{}'),
    ('IND','STL','PEB','IND-STL-PEB-002','Steel Column Erection','ton','STR','Steel','SS','quantity','{industrial,commercial}','{}'),
    ('IND','STL','PEB','IND-STL-PEB-003','Rafter & Bracing Erection','ton','STR','Steel','SS','quantity','{industrial,commercial}','{}'),
    ('IND','STL','PEB','IND-STL-PEB-004','Purlins & Girts Installation','ton','STR','Steel','SS','quantity','{industrial,commercial}','{}'),
    ('IND','STL','PEB','IND-STL-PEB-005','Bolt Tightening & Alignment Survey','lot','STR','Steel','SS','fixed','{industrial,commercial}','{}'),
    ('IND','STL','CRN','IND-STL-CRN-001','Crane Girder & Rail Installation','m','STR','Steel','SS','quantity','{industrial}','{factory,manufacturing_facility,industrial_building}'),
    ('IND','STL','CRN','IND-STL-CRN-002','Overhead Crane Installation & Load Test','nos','MEP','Mechanical','SS','quantity','{industrial}','{factory,manufacturing_facility,industrial_building}'),
    ('IND','STL','MEZ','IND-STL-MEZ-001','Mezzanine Steel & Decking','m²','STR','Steel','SS','quantity','{industrial,commercial}','{}'),
    ('IND','FLR','SFS','IND-FLR-001','Sub-base Proof Rolling & Vapour Barrier','m²','STR','Sub-base','FD','quantity','{industrial,commercial}','{}'),
    ('IND','FLR','SFS','IND-FLR-002','Industrial Slab Mesh / Steel Fibre Placement','m²','STR','Reinforcement','FD','quantity','{industrial,commercial}','{}'),
    ('IND','FLR','SFS','IND-FLR-003','Superflat Slab Pour (Laser Screed)','m²','STR','Concrete Works','FD','quantity','{industrial,commercial}','{}'),
    ('IND','FLR','SFS','IND-FLR-004','Floor Hardener, Curing & Joint Sawing','m²','STR','Concrete Works','FD','quantity','{industrial,commercial}','{}'),
    ('IND','FLR','FCT','IND-FLR-005','Epoxy / PU Floor Coating','m²','ARC','Finishes','IO','quantity','{industrial,commercial,institutional}','{}'),
    ('IND','FLR','FCT','IND-FLR-006','Floor Line Marking','m','ARC','Finishes','IO','quantity','{industrial}','{}'),
    ('IND','FND','MFD','IND-FND-001','Machine Foundation','m³','STR','Concrete Works','FD','quantity','{industrial}','{factory,manufacturing_facility,industrial_building}'),
    ('IND','FND','MFD','IND-FND-002','Pits & Trenches (Rebar, Formwork, Concrete)','m³','STR','Concrete Works','FD','quantity','{industrial}','{}'),
    ('IND','ENV','RFS','IND-ENV-RF-001','Roof Insulation Blanket & Safety Mesh','m²','ARC','Roofing','EN','quantity','{industrial,commercial}','{}'),
    ('IND','ENV','RFS','IND-ENV-RF-002','Metal Roof Sheeting','m²','ARC','Roofing','EN','quantity','{industrial,commercial}','{}'),
    ('IND','ENV','RFS','IND-ENV-RF-003','Skylights & Smoke Vents','nos','ARC','Roofing','EN','quantity','{industrial,commercial}','{}'),
    ('IND','ENV','RFS','IND-ENV-RF-004','Ridge & Roof Ventilators','nos','ARC','Roofing','EN','quantity','{industrial,commercial}','{}'),
    ('IND','ENV','CLD','IND-ENV-CLD-001','Metal Wall Cladding / Insulated Panels','m²','ARC','Cladding','EN','quantity','{industrial,commercial}','{}'),
    ('IND','ENV','CLD','IND-ENV-CLD-002','Flashings & Trims','m','ARC','Cladding','EN','quantity','{industrial,commercial}','{}'),
    ('IND','ENV','DOR','IND-ENV-DOR-001','Rolling Shutters / Sectional Doors','nos','ARC','Doors','EN','quantity','{industrial,commercial}','{}'),
    ('IND','ENV','DOR','IND-ENV-DOR-002','Dock Leveller & Shelter','nos','ARC','Doors','EN','quantity','{industrial}','{warehouse,logistics_center,factory}'),
    ('IND','OPS','RCK','IND-OPS-001','Pallet Racking Installation','bay','ARC','Racking','IO','quantity','{industrial}','{warehouse,logistics_center}'),
    ('IND','OPS','IMEP','IND-MEP-001','High-Bay Lighting','nos','MEP','Electrical','M2','quantity','{industrial,commercial}','{}'),
    ('IND','OPS','IMEP','IND-MEP-002','ESFR / In-rack Sprinkler Pipework','m','MEP','Fire Protection','M1','quantity','{industrial}','{}'),
    ('IND','OPS','IMEP','IND-MEP-003','Process Piping / Compressed Air','m','MEP','Mechanical','M1','quantity','{industrial}','{factory,manufacturing_facility,industrial_building}'),
    ('IND','OPS','IMEP','IND-MEP-004','Industrial Ventilation & Exhaust Fans','nos','MEP','HVAC','M2','quantity','{industrial,commercial}','{}'),
    ('IND','OPS','IMEP','IND-MEP-005','Forklift / EV Charging Points','nos','MEP','Electrical','M2','quantity','{industrial}','{warehouse,logistics_center}'),
    ('IND','OPS','IMEP','IND-MEP-006','Rooftop Solar PV','kWp','MEP','Electrical','M2','quantity','{industrial,commercial,residential,institutional}','{}');

  for r in select * from _im loop
    select fa.id, ca.id, dm.id into f_id, c_id, d_id
      from public.plan_act_families fa
      join public.plan_act_categories ca on ca.id = fa.category_id
      join public.plan_act_domains dm on dm.id = ca.domain_id
     where dm.code = r.dom and ca.code = r.cat and fa.code = r.fam;
    insert into public.plan_act_masters(code, name, domain_id, category_id, family_id, discipline, work_type, default_unit,
        status, version, owner, source, effective_date, sectors, building_types, duration_basis, default_work_group)
    values (r.code, r.name, d_id, c_id, f_id, r.disc, r.wtype, r.unit, 'active', 1, 'Planning Standards',
            'Company Standard (industrial seed 2026-10-21)', date '2026-10-21', r.sectors, r.btypes, r.basis, r.wg)
    on conflict (code, version) do nothing;
  end loop;
end
$seed$;

-- norms (draft): labour constant = crew size × 8 h / output per crew-day --------------------------
insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select 'NRM-' || m.code, v.name, v.trade, m.discipline, m.code, m.default_unit,
  round((v.skilled + v.helpers) * 8.0 / v.output, 4), 8, 100, 'manual',
  'ASSUMPTION: indicative rate ' || v.output || ' ' || m.default_unit || '/crew-day, crew ' || v.skilled || ' ' || v.skilled_role
    || coalesce(' + ' || nullif(v.helpers, 0) || ' ' || v.helper_role, '') || '. ' || v.note || ' Calibrate on the first bays before approving.',
  'draft', 1, v.output, m.id
from (values
  ('IND-STL-PEB-001', 'Anchor bolt setting with template',       'Steel',       40,   2, 'Steel Fixer', 1, 'Surveyor Helper', 'Bolt groups set to template, surveyed before the pour.'),
  ('IND-STL-PEB-002', 'Steel column erection',                   'Steel',        8,   4, 'Steel Erector', 2, 'Rigger', 'Mobile crane assist; plumb, shim and temporary bracing.'),
  ('IND-STL-PEB-003', 'Rafter & bracing erection',               'Steel',        8,   4, 'Steel Erector', 2, 'Rigger', 'Rafter splices on ground, lift, connect, bracing.'),
  ('IND-STL-PEB-004', 'Purlins & girts installation',            'Steel',        3,   3, 'Steel Erector', 2, 'Rigger', 'Cold-formed Z / C sections incl. sag rods (tonnage basis).'),
  ('IND-STL-CRN-001', 'Crane girder & rail installation',        'Steel',       20,   3, 'Steel Erector', 2, 'Rigger', 'Per metre of runway (one side): girder, rail, clips, alignment.'),
  ('IND-STL-CRN-002', 'Overhead crane installation & load test', 'Mechanical', 0.2,   3, 'Crane Technician', 2, 'Rigger', 'About 5 crew-days per EOT crane incl. electrics and 125 % load test.'),
  ('IND-STL-MEZ-001', 'Mezzanine steel & metal decking',         'Steel',       40,   3, 'Steel Erector', 2, 'General Worker', 'Secondary beams, deck sheet and edge trims (per m² floor).'),
  ('IND-FLR-001',     'Sub-base proof rolling & vapour barrier', 'Sub-base',   600,   1, 'Roller Operator', 3, 'General Worker', 'Proof roll, trim, level survey, polythene laid with laps.'),
  ('IND-FLR-002',     'Industrial slab mesh / steel fibre',      'Reinforcement', 400, 2, 'Steel Fixer', 2, 'General Worker', 'Mesh on chairs, or fibre dosing check at the plant.'),
  ('IND-FLR-003',     'Superflat slab pour (laser screed)',      'Concrete',   800,   6, 'Concrete Finisher', 4, 'General Worker', 'Laser screed + ride-on trowels, one bay per day.'),
  ('IND-FLR-004',     'Floor hardener, curing & joint sawing',   'Concrete',  1000,   3, 'Concrete Finisher', 2, 'General Worker', 'Dry-shake hardener, curing compound, saw cuts within 24 h.'),
  ('IND-FLR-005',     'Epoxy / PU floor coating',                'Finishes',   150,   2, 'Coating Applicator', 2, 'General Worker', 'Grind, prime, 2 coats; cure before traffic.'),
  ('IND-FLR-006',     'Floor line marking',                      'Finishes',   300,   1, 'Line Marker', 1, 'General Worker', 'Aisles, bays and walkways, epoxy paint.'),
  ('IND-FND-001',     'Machine foundation',                      'Concrete',     6,   4, 'Concrete Worker / Steel Fixer', 2, 'General Worker', 'Rebar, formwork with anchor templates, pour; per m³ concrete.'),
  ('IND-FND-002',     'Pits & trenches (rebar, formwork, concrete)', 'Concrete',  5,   4, 'Concrete Worker / Steel Fixer', 2, 'General Worker', 'Dock / equipment pits and cable trenches; per m³ concrete.'),
  ('IND-ENV-RF-001',  'Roof insulation blanket & safety mesh',   'Roofing',    400,   3, 'Roofer', 1, 'General Worker', 'Wire mesh and blanket rolled over purlins.'),
  ('IND-ENV-RF-002',  'Metal roof sheeting',                     'Roofing',    250,   4, 'Roofer', 2, 'General Worker', 'Standing seam / screw-fix sheets incl. lifting to roof.'),
  ('IND-ENV-RF-003',  'Skylights & smoke vents',                 'Roofing',      8,   2, 'Roofer', 1, 'General Worker', 'Per unit, incl. kerb and flashing.'),
  ('IND-ENV-RF-004',  'Ridge & roof ventilators',                'Roofing',      6,   2, 'Roofer', 1, 'General Worker', 'Per unit, turbine or ridge ventilator.'),
  ('IND-ENV-CLD-001', 'Metal wall cladding / insulated panels',  'Cladding',   120,   3, 'Cladder', 2, 'General Worker', 'From MEWP; sheets or sandwich panels incl. fixings.'),
  ('IND-ENV-CLD-002', 'Flashings & trims',                       'Cladding',    80,   2, 'Cladder', 1, 'General Worker', 'Corners, openings, eaves and base trims.'),
  ('IND-ENV-DOR-001', 'Rolling shutter / sectional door',        'Doors',      1.5,   2, 'Door Installer', 1, 'General Worker', 'Per door incl. guides, motor and commissioning.'),
  ('IND-ENV-DOR-002', 'Dock leveller & shelter',                 'Doors',        1,   2, 'Door Installer', 1, 'General Worker', 'Per dock: leveller into pit frame, shelter, bumpers.'),
  ('IND-OPS-001',     'Pallet racking installation',             'Racking',     12,   3, 'Racking Installer', 1, 'General Worker', 'Per bay: frames, beams, anchors, plumb.'),
  ('IND-MEP-001',     'High-bay lighting',                       'Electrical',  12,   2, 'Electrician', 1, 'Electrical Helper', 'Per fitting from MEWP incl. drop and connection.'),
  ('IND-MEP-002',     'ESFR / in-rack sprinkler pipework',       'Fire Protection', 25, 2, 'Pipe Fitter', 1, 'General Worker', 'Grooved steel mains and branches at height.'),
  ('IND-MEP-003',     'Process piping / compressed air',         'Mechanical',  20,   2, 'Pipe Fitter', 1, 'General Worker', 'Average 25-50 mm incl. supports and valves.'),
  ('IND-MEP-004',     'Industrial ventilation & exhaust fans',   'HVAC',         4,   2, 'HVAC Technician', 1, 'General Worker', 'Wall / roof fans incl. louvres and power.'),
  ('IND-MEP-005',     'Forklift / EV charging points',           'Electrical',   6,   1, 'Electrician', 1, 'Electrical Helper', 'Per point incl. isolator and termination.'),
  ('IND-MEP-006',     'Rooftop solar PV',                        'Electrical',  25,   3, 'Solar Installer', 2, 'General Worker', 'Per kWp: rails, panels, DC cabling (inverters separate).')
) as v(mcode, name, trade, output, skilled, skilled_role, helpers, helper_role, note)
join public.plan_act_masters m on m.code = v.mcode and m.version = 1
where not exists (select 1 from public.plan_productivity_norms n where n.project_id is null and n.code = 'NRM-' || m.code);

-- quantity rules -----------------------------------------------------------------------------------
insert into public.plan_act_quantity_rules(master_id, name, metric_code, unit, provider_priority, note)
select m.id, v.rule_name, v.metric, m.default_unit, v.providers, v.note
from (values
  ('IND-STL-PEB-001', 'Anchor bolt groups',      'anchor_bolt_count',      array['bim','boq','manual'], null),
  ('IND-STL-PEB-002', 'Column steel tonnage',    'steel_column_weight',    array['bim','boq','manual'], null),
  ('IND-STL-PEB-003', 'Rafter & bracing tonnage','steel_rafter_weight',    array['bim','boq','manual'], null),
  ('IND-STL-PEB-004', 'Purlin & girt tonnage',   'purlin_girt_weight',     array['bim','boq','manual'], null),
  ('IND-STL-CRN-001', 'Crane runway length',     'crane_runway_length',    array['bim','boq','manual'], null),
  ('IND-STL-CRN-002', 'Overhead cranes',         'crane_count',            array['boq','manual'], null),
  ('IND-STL-MEZ-001', 'Mezzanine area',          'mezzanine_area',         array['bim','boq','manual'], null),
  ('IND-FLR-001',     'Industrial floor area',   'industrial_floor_area',  array['bim','boq','manual','calculated'], 'Calculated fallback = level GFA (approximation).'),
  ('IND-FLR-002',     'Industrial floor area',   'industrial_floor_area',  array['bim','boq','manual','calculated'], 'Calculated fallback = level GFA (approximation).'),
  ('IND-FLR-003',     'Industrial floor area',   'industrial_floor_area',  array['bim','boq','manual','calculated'], 'Calculated fallback = level GFA (approximation).'),
  ('IND-FLR-004',     'Industrial floor area',   'industrial_floor_area',  array['bim','boq','manual','calculated'], 'Calculated fallback = level GFA (approximation).'),
  ('IND-FLR-005',     'Coated floor area',       'floor_coating_area',     array['bim','boq','manual'], null),
  ('IND-FLR-006',     'Line marking length',     'line_marking_length',    array['boq','manual'], null),
  ('IND-FND-001',     'Machine foundation concrete', 'machine_foundation_volume', array['bim','boq','manual'], null),
  ('IND-FND-002',     'Pit & trench concrete',   'pit_volume',             array['bim','boq','manual'], null),
  ('IND-ENV-RF-001',  'Metal roof area',         'metal_roof_area',        array['bim','boq','manual'], null),
  ('IND-ENV-RF-002',  'Metal roof area',         'metal_roof_area',        array['bim','boq','manual'], null),
  ('IND-ENV-RF-003',  'Skylights & vents',       'skylight_count',         array['bim','boq','manual'], null),
  ('IND-ENV-RF-004',  'Roof ventilators',        'ventilator_count',       array['bim','boq','manual'], null),
  ('IND-ENV-CLD-001', 'Wall cladding area',      'cladding_area',          array['bim','boq','manual'], null),
  ('IND-ENV-CLD-002', 'Flashing length',         'flashing_length',        array['bim','boq','manual'], null),
  ('IND-ENV-DOR-001', 'Industrial doors',        'industrial_door_count',  array['bim','boq','manual'], null),
  ('IND-ENV-DOR-002', 'Dock positions',          'dock_count',             array['bim','boq','manual'], null),
  ('IND-OPS-001',     'Racking bays',            'racking_bay_count',      array['boq','manual'], null),
  ('IND-MEP-001',     'High-bay fittings',       'highbay_count',          array['bim','boq','manual'], null),
  ('IND-MEP-002',     'ESFR pipe length',        'esfr_pipe_length',       array['bim','boq','manual'], null),
  ('IND-MEP-003',     'Process pipe length',     'process_pipe_length',    array['bim','boq','manual'], null),
  ('IND-MEP-004',     'Ventilation fans',        'vent_fan_count',         array['bim','boq','manual'], null),
  ('IND-MEP-005',     'Charging points',         'charging_point_count',   array['boq','manual'], null),
  ('IND-MEP-006',     'Solar PV capacity',       'solar_kwp',              array['boq','manual'], null)
) as v(mcode, rule_name, metric, providers, note)
join public.plan_act_masters m on m.code = v.mcode and m.version = 1
on conflict (master_id, name) do nothing;

update public.plan_act_masters m
   set default_step_template_id = s.id
  from (values
    ('IND-FLR-003',     'Superflat / Industrial Floor Slab'),
    ('IND-ENV-RF-002',  'Metal Roof Sheeting & Insulation'),
    ('IND-ENV-CLD-001', 'Metal Wall Cladding / Insulated Panels'),
    ('IND-STL-CRN-002', 'Overhead Crane Installation'),
    ('IND-OPS-001',     'Racking System Installation'),
    ('IND-ENV-DOR-002', 'Dock Leveller, Shelter & Dock Door'),
    ('IND-FND-001',     'Machine Foundation'),
    ('IND-MEP-003',     'Process Piping / Compressed Air')
  ) as v(mcode, step_name)
  join public.activity_step_template_master s on s.template_name = v.step_name and s.is_active
 where m.code = v.mcode and m.default_step_template_id is null;

-- C. industrial activity templates --------------------------------------------------------------------
insert into public.plan_act_templates (code, name, description, domain_id, status, version, applies_to_level_types, owner,
  sectors, building_types, inter_level_from_seq, inter_level_to_seq, inter_level_relation, inter_level_lag_days)
select v.code, v.name, v.descr, d.id, 'draft', 1, v.levels, 'Planning Manager', array['industrial'], v.btypes, null, null, 'fs', 0
from (values
  ('TPL-IND-FAC-GF-001', 'Factory – Ground (Foundations, Superflat Slab, Steel Frame, Envelope, MEP)',
   'Pad footings and ground beams, anchor bolts, machine foundations, steel frame and crane runway, wall cladding and doors, superflat slab, industrial MEP, process piping and crane installation.',
   array['ground'], array['factory','manufacturing_facility','industrial_building']),
  ('TPL-IND-WH-GF-001', 'Warehouse – Ground (Foundations, Superflat Slab, Steel Frame, Envelope, Racking)',
   'Pad footings and dock walls, anchor bolts, steel frame, cladding and dock doors, superflat slab, dock levellers, ESFR and high-bay lighting, racking, line marking and charging points.',
   array['ground'], array['warehouse','logistics_center']),
  ('TPL-IND-MEZ-001', 'Factory / Warehouse – Mezzanine & Office Floor',
   'Mezzanine steel and deck, topping slab, office partitions and finishes, MEP.',
   array['typical', 'mezzanine'], array['factory','manufacturing_facility','industrial_building','warehouse','logistics_center']),
  ('TPL-IND-RF-001', 'Factory / Warehouse – Metal Roof',
   'Safety mesh and insulation, metal roof sheeting, skylights and smoke vents, ventilators, gutters, rooftop solar PV.',
   array['roof'], array['factory','manufacturing_facility','industrial_building','warehouse','logistics_center']),
  ('TPL-IND-PIT-001', 'Factory / Warehouse – Pits & Trenches',
   'Excavation, blinding, dock / equipment pits and trenches, backfill.',
   array['basement'], array['factory','manufacturing_facility','industrial_building','warehouse','logistics_center'])
) as v(code, name, descr, levels, btypes)
cross join public.plan_act_domains d
where d.code = 'IND' and not exists (select 1 from public.plan_act_templates t where t.code = v.code);

insert into public.plan_act_template_items (template_id, seq, master_id, scope, duration_days_override, is_milestone, note, crews)
select t.id, v.seq, m.id, 'floor', v.fixed_days, false, v.note, v.crews
from (values
  -- factory ground
  ('TPL-IND-FAC-GF-001',  1, 'STR-RC-SLAB-001',  1::numeric, 1, 'Grid and footing setting out'),
  ('TPL-IND-FAC-GF-001',  2, 'STR-SUB-EXC-001',  null, 1, null),
  ('TPL-IND-FAC-GF-001',  3, 'STR-SUB-FTG-001',  null, 1, null),
  ('TPL-IND-FAC-GF-001',  4, 'STR-SUB-FTG-002',  null, 1, null),
  ('TPL-IND-FAC-GF-001',  5, 'IND-STL-PEB-001',  null, 1, 'Surveyed before the pour'),
  ('TPL-IND-FAC-GF-001',  6, 'STR-SUB-FTG-003',  null, 1, null),
  ('TPL-IND-FAC-GF-001',  7, 'STR-SUB-FTG-004',  null, 1, null),
  ('TPL-IND-FAC-GF-001',  8, 'STR-SUB-GB-002',   null, 1, null),
  ('TPL-IND-FAC-GF-001',  9, 'STR-SUB-GB-001',   null, 1, null),
  ('TPL-IND-FAC-GF-001', 10, 'STR-SUB-GB-003',   null, 1, null),
  ('TPL-IND-FAC-GF-001', 11, 'IND-FND-001',      null, 1, null),
  ('TPL-IND-FAC-GF-001', 12, 'STR-SUB-EXC-002',  null, 1, null),
  ('TPL-IND-FAC-GF-001', 13, 'IND-STL-PEB-002',  null, 1, '7 days after footing concrete'),
  ('TPL-IND-FAC-GF-001', 14, 'IND-STL-PEB-003',  null, 1, null),
  ('TPL-IND-FAC-GF-001', 15, 'IND-STL-PEB-004',  null, 1, null),
  ('TPL-IND-FAC-GF-001', 16, 'IND-STL-CRN-001',  null, 1, null),
  ('TPL-IND-FAC-GF-001', 17, 'IND-STL-PEB-005',  2::numeric, 1, 'Hold point before cladding / slab'),
  ('TPL-IND-FAC-GF-001', 18, 'IND-ENV-CLD-001',  null, 1, null),
  ('TPL-IND-FAC-GF-001', 19, 'IND-ENV-CLD-002',  null, 1, null),
  ('TPL-IND-FAC-GF-001', 20, 'IND-ENV-DOR-001',  null, 1, null),
  ('TPL-IND-FAC-GF-001', 21, 'IND-FLR-001',      null, 1, null),
  ('TPL-IND-FAC-GF-001', 22, 'IND-FLR-002',      null, 1, null),
  ('TPL-IND-FAC-GF-001', 23, 'IND-FLR-003',      null, 1, 'One bay per day'),
  ('TPL-IND-FAC-GF-001', 24, 'IND-FLR-004',      null, 1, null),
  ('TPL-IND-FAC-GF-001', 25, 'MEP-ELE-001',      null, 1, 'Cable trays / busduct'),
  ('TPL-IND-FAC-GF-001', 26, 'MEP-ELE-004',      null, 1, 'MCCs and DBs'),
  ('TPL-IND-FAC-GF-001', 27, 'IND-MEP-001',      null, 1, null),
  ('TPL-IND-FAC-GF-001', 28, 'IND-MEP-002',      null, 1, null),
  ('TPL-IND-FAC-GF-001', 29, 'IND-MEP-004',      null, 1, null),
  ('TPL-IND-FAC-GF-001', 30, 'IND-MEP-003',      null, 1, null),
  ('TPL-IND-FAC-GF-001', 31, 'IND-STL-CRN-002',  null, 1, 'After slab and runway'),
  ('TPL-IND-FAC-GF-001', 32, 'IND-FLR-005',      null, 1, 'After slab curing'),
  ('TPL-IND-FAC-GF-001', 33, 'IND-FLR-006',      null, 1, null),
  -- warehouse ground
  ('TPL-IND-WH-GF-001',  1, 'STR-RC-SLAB-001',  1::numeric, 1, 'Grid and footing setting out'),
  ('TPL-IND-WH-GF-001',  2, 'STR-SUB-EXC-001',  null, 1, null),
  ('TPL-IND-WH-GF-001',  3, 'STR-SUB-FTG-001',  null, 1, null),
  ('TPL-IND-WH-GF-001',  4, 'STR-SUB-FTG-002',  null, 1, null),
  ('TPL-IND-WH-GF-001',  5, 'IND-STL-PEB-001',  null, 1, 'Surveyed before the pour'),
  ('TPL-IND-WH-GF-001',  6, 'STR-SUB-FTG-003',  null, 1, null),
  ('TPL-IND-WH-GF-001',  7, 'STR-SUB-FTG-004',  null, 1, null),
  ('TPL-IND-WH-GF-001',  8, 'STR-SUB-GB-002',   null, 1, 'Ground beams / dock walls'),
  ('TPL-IND-WH-GF-001',  9, 'STR-SUB-GB-001',   null, 1, null),
  ('TPL-IND-WH-GF-001', 10, 'STR-SUB-GB-003',   null, 1, null),
  ('TPL-IND-WH-GF-001', 11, 'STR-SUB-EXC-002',  null, 1, null),
  ('TPL-IND-WH-GF-001', 12, 'IND-STL-PEB-002',  null, 1, '7 days after footing concrete'),
  ('TPL-IND-WH-GF-001', 13, 'IND-STL-PEB-003',  null, 1, null),
  ('TPL-IND-WH-GF-001', 14, 'IND-STL-PEB-004',  null, 1, null),
  ('TPL-IND-WH-GF-001', 15, 'IND-STL-PEB-005',  2::numeric, 1, 'Hold point before cladding / slab'),
  ('TPL-IND-WH-GF-001', 16, 'IND-ENV-CLD-001',  null, 1, null),
  ('TPL-IND-WH-GF-001', 17, 'IND-ENV-CLD-002',  null, 1, null),
  ('TPL-IND-WH-GF-001', 18, 'IND-ENV-DOR-001',  null, 1, 'Dock and personnel doors'),
  ('TPL-IND-WH-GF-001', 19, 'IND-FLR-001',      null, 1, null),
  ('TPL-IND-WH-GF-001', 20, 'IND-FLR-002',      null, 1, null),
  ('TPL-IND-WH-GF-001', 21, 'IND-FLR-003',      null, 1, 'One bay per day'),
  ('TPL-IND-WH-GF-001', 22, 'IND-FLR-004',      null, 1, null),
  ('TPL-IND-WH-GF-001', 23, 'IND-ENV-DOR-002',  null, 1, 'After the slab'),
  ('TPL-IND-WH-GF-001', 24, 'MEP-ELE-001',      null, 1, 'Cable trays / containment'),
  ('TPL-IND-WH-GF-001', 25, 'MEP-ELE-004',      null, 1, null),
  ('TPL-IND-WH-GF-001', 26, 'IND-MEP-001',      null, 1, null),
  ('TPL-IND-WH-GF-001', 27, 'IND-MEP-002',      null, 1, null),
  ('TPL-IND-WH-GF-001', 28, 'IND-MEP-005',      null, 1, null),
  ('TPL-IND-WH-GF-001', 29, 'IND-OPS-001',      null, 2, 'After slab curing'),
  ('TPL-IND-WH-GF-001', 30, 'IND-FLR-006',      null, 1, null),
  -- mezzanine / office floor
  ('TPL-IND-MEZ-001',  1, 'STR-RC-SLAB-001',  0.5::numeric, 1, null),
  ('TPL-IND-MEZ-001',  2, 'IND-STL-MEZ-001',  null, 1, null),
  ('TPL-IND-MEZ-001',  3, 'STR-RC-SLAB-004',  null, 1, 'Mesh on deck'),
  ('TPL-IND-MEZ-001',  4, 'STR-RC-SLAB-006',  0.5::numeric, 1, 'Hold point'),
  ('TPL-IND-MEZ-001',  5, 'STR-RC-SLAB-007',  null, 1, 'Topping slab'),
  ('TPL-IND-MEZ-001',  6, 'STR-RC-SLAB-009',  null, 1, null),
  ('TPL-IND-MEZ-001',  7, 'MEP-ELE-001',      null, 1, null),
  ('TPL-IND-MEZ-001',  8, 'MEP-PLB-001',      null, 1, null),
  ('TPL-IND-MEZ-001',  9, 'MEP-PLB-003',      null, 1, null),
  ('TPL-IND-MEZ-001', 10, 'ARC-MAS-BLK-001',  null, 1, 'Office partitions'),
  ('TPL-IND-MEZ-001', 11, 'ARC-FIN-WAL-002',  null, 1, null),
  ('TPL-IND-MEZ-001', 12, 'ARC-FIN-FLR-002',  null, 1, null),
  ('TPL-IND-MEZ-001', 13, 'ARC-FIN-FLR-004',  null, 1, null),
  ('TPL-IND-MEZ-001', 14, 'ARC-FIN-CLG-003',  null, 1, null),
  ('TPL-IND-MEZ-001', 15, 'ARC-DW-001',       null, 1, null),
  ('TPL-IND-MEZ-001', 16, 'ARC-FIN-WAL-004',  null, 1, null),
  ('TPL-IND-MEZ-001', 17, 'ARC-JNR-003',      null, 1, 'Stairs and edge railings'),
  ('TPL-IND-MEZ-001', 18, 'MEP-ELE-003',      null, 1, null),
  ('TPL-IND-MEZ-001', 19, 'MEP-ELE-005',      null, 1, null),
  ('TPL-IND-MEZ-001', 20, 'MEP-HVAC-002',     null, 1, null),
  ('TPL-IND-MEZ-001', 21, 'MEP-PLB-004',      null, 1, null),
  ('TPL-IND-MEZ-001', 22, 'ARC-DW-002',       null, 1, null),
  -- metal roof
  ('TPL-IND-RF-001',  1, 'IND-ENV-RF-001',  null, 1, 'After purlins are complete'),
  ('TPL-IND-RF-001',  2, 'IND-ENV-RF-002',  null, 2, null),
  ('TPL-IND-RF-001',  3, 'IND-ENV-RF-003',  null, 1, null),
  ('TPL-IND-RF-001',  4, 'IND-ENV-RF-004',  null, 1, null),
  ('TPL-IND-RF-001',  5, 'ARC-RF-004',      null, 1, null),
  ('TPL-IND-RF-001',  6, 'IND-MEP-006',     null, 1, 'Optional: delete if no PV'),
  -- pits & trenches
  ('TPL-IND-PIT-001',  1, 'STR-RC-SLAB-001',  0.5::numeric, 1, null),
  ('TPL-IND-PIT-001',  2, 'STR-SUB-EXC-001',  null, 1, null),
  ('TPL-IND-PIT-001',  3, 'STR-SUB-FTG-001',  null, 1, null),
  ('TPL-IND-PIT-001',  4, 'IND-FND-002',      null, 1, null),
  ('TPL-IND-PIT-001',  5, 'STR-SUB-EXC-002',  null, 1, '7 days after the pit walls')
) as v(tcode, seq, master_code, fixed_days, crews, note)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join lateral (
  select mm.id from public.plan_act_masters mm
   where mm.code = v.master_code and mm.status in ('active', 'approved', 'under_review', 'draft')
   order by (mm.status = 'active') desc, mm.version desc limit 1
) m on true
where not exists (select 1 from public.plan_act_template_items i where i.template_id = t.id);

insert into public.plan_act_template_dependencies (template_id, predecessor_item_id, successor_item_id, relation, lag_days, is_optional)
select t.id, p.id, s.id, v.rel, v.lag, false
from (values
  -- factory ground
  ('TPL-IND-FAC-GF-001',  2,  1,'fs',0), ('TPL-IND-FAC-GF-001',  3,  2,'fs',0), ('TPL-IND-FAC-GF-001',  4,  3,'fs',0),
  ('TPL-IND-FAC-GF-001',  5,  4,'ss',0), ('TPL-IND-FAC-GF-001',  6,  4,'fs',0), ('TPL-IND-FAC-GF-001',  7,  6,'fs',0),
  ('TPL-IND-FAC-GF-001',  7,  5,'fs',0), ('TPL-IND-FAC-GF-001',  8,  7,'fs',1), ('TPL-IND-FAC-GF-001',  9,  8,'ss',0),
  ('TPL-IND-FAC-GF-001', 10,  9,'fs',0), ('TPL-IND-FAC-GF-001', 11,  3,'fs',0), ('TPL-IND-FAC-GF-001', 12, 10,'fs',2),
  ('TPL-IND-FAC-GF-001', 12, 11,'fs',2), ('TPL-IND-FAC-GF-001', 13,  7,'fs',7), ('TPL-IND-FAC-GF-001', 14, 13,'ss',2),
  ('TPL-IND-FAC-GF-001', 15, 14,'ss',2), ('TPL-IND-FAC-GF-001', 16, 14,'fs',0), ('TPL-IND-FAC-GF-001', 17, 15,'fs',0),
  ('TPL-IND-FAC-GF-001', 17, 16,'fs',0), ('TPL-IND-FAC-GF-001', 18, 17,'fs',0), ('TPL-IND-FAC-GF-001', 19, 18,'ss',2),
  ('TPL-IND-FAC-GF-001', 20, 18,'fs',0), ('TPL-IND-FAC-GF-001', 21, 12,'fs',0), ('TPL-IND-FAC-GF-001', 21, 17,'fs',0),
  ('TPL-IND-FAC-GF-001', 22, 21,'ss',1), ('TPL-IND-FAC-GF-001', 23, 22,'ss',1), ('TPL-IND-FAC-GF-001', 24, 23,'ss',1),
  ('TPL-IND-FAC-GF-001', 25, 17,'fs',0), ('TPL-IND-FAC-GF-001', 26, 25,'ss',2), ('TPL-IND-FAC-GF-001', 27, 25,'fs',0),
  ('TPL-IND-FAC-GF-001', 28, 17,'fs',0), ('TPL-IND-FAC-GF-001', 29, 18,'fs',0), ('TPL-IND-FAC-GF-001', 30, 24,'fs',0),
  ('TPL-IND-FAC-GF-001', 31, 24,'fs',0), ('TPL-IND-FAC-GF-001', 31, 16,'fs',0), ('TPL-IND-FAC-GF-001', 32, 24,'fs',14),
  ('TPL-IND-FAC-GF-001', 32, 30,'fs',0), ('TPL-IND-FAC-GF-001', 33, 32,'fs',2),
  -- warehouse ground
  ('TPL-IND-WH-GF-001',  2,  1,'fs',0), ('TPL-IND-WH-GF-001',  3,  2,'fs',0), ('TPL-IND-WH-GF-001',  4,  3,'fs',0),
  ('TPL-IND-WH-GF-001',  5,  4,'ss',0), ('TPL-IND-WH-GF-001',  6,  4,'fs',0), ('TPL-IND-WH-GF-001',  7,  6,'fs',0),
  ('TPL-IND-WH-GF-001',  7,  5,'fs',0), ('TPL-IND-WH-GF-001',  8,  7,'fs',1), ('TPL-IND-WH-GF-001',  9,  8,'ss',0),
  ('TPL-IND-WH-GF-001', 10,  9,'fs',0), ('TPL-IND-WH-GF-001', 11, 10,'fs',2), ('TPL-IND-WH-GF-001', 12,  7,'fs',7),
  ('TPL-IND-WH-GF-001', 13, 12,'ss',2), ('TPL-IND-WH-GF-001', 14, 13,'ss',2), ('TPL-IND-WH-GF-001', 15, 14,'fs',0),
  ('TPL-IND-WH-GF-001', 16, 15,'fs',0), ('TPL-IND-WH-GF-001', 17, 16,'ss',2), ('TPL-IND-WH-GF-001', 18, 16,'fs',0),
  ('TPL-IND-WH-GF-001', 19, 11,'fs',0), ('TPL-IND-WH-GF-001', 19, 15,'fs',0), ('TPL-IND-WH-GF-001', 20, 19,'ss',1),
  ('TPL-IND-WH-GF-001', 21, 20,'ss',1), ('TPL-IND-WH-GF-001', 22, 21,'ss',1), ('TPL-IND-WH-GF-001', 23, 22,'fs',0),
  ('TPL-IND-WH-GF-001', 23, 18,'fs',0), ('TPL-IND-WH-GF-001', 24, 15,'fs',0), ('TPL-IND-WH-GF-001', 25, 24,'ss',2),
  ('TPL-IND-WH-GF-001', 26, 24,'fs',0), ('TPL-IND-WH-GF-001', 27, 15,'fs',0), ('TPL-IND-WH-GF-001', 28, 25,'fs',0),
  ('TPL-IND-WH-GF-001', 29, 22,'fs',14), ('TPL-IND-WH-GF-001', 29, 27,'fs',0), ('TPL-IND-WH-GF-001', 30, 22,'fs',14),
  -- mezzanine
  ('TPL-IND-MEZ-001',  2,  1,'fs',0), ('TPL-IND-MEZ-001',  3,  2,'fs',0), ('TPL-IND-MEZ-001',  4,  3,'fs',0),
  ('TPL-IND-MEZ-001',  5,  4,'fs',0), ('TPL-IND-MEZ-001',  6,  5,'fs',0), ('TPL-IND-MEZ-001',  7,  6,'fs',0),
  ('TPL-IND-MEZ-001',  8,  6,'fs',0), ('TPL-IND-MEZ-001',  9,  6,'fs',0), ('TPL-IND-MEZ-001', 10,  6,'fs',0),
  ('TPL-IND-MEZ-001', 11, 10,'fs',0), ('TPL-IND-MEZ-001', 11,  7,'fs',0), ('TPL-IND-MEZ-001', 11,  8,'fs',0),
  ('TPL-IND-MEZ-001', 12, 11,'fs',0), ('TPL-IND-MEZ-001', 13, 12,'fs',0), ('TPL-IND-MEZ-001', 14, 11,'fs',0),
  ('TPL-IND-MEZ-001', 15, 10,'fs',0), ('TPL-IND-MEZ-001', 16, 14,'fs',0), ('TPL-IND-MEZ-001', 17,  6,'fs',0),
  ('TPL-IND-MEZ-001', 18, 11,'fs',0), ('TPL-IND-MEZ-001', 19, 14,'fs',0), ('TPL-IND-MEZ-001', 20, 14,'fs',0),
  ('TPL-IND-MEZ-001', 21, 13,'fs',0), ('TPL-IND-MEZ-001', 21,  9,'fs',0), ('TPL-IND-MEZ-001', 22, 16,'fs',0),
  ('TPL-IND-MEZ-001', 22, 13,'fs',0),
  -- metal roof
  ('TPL-IND-RF-001',  2,  1,'ss',1), ('TPL-IND-RF-001',  3,  2,'ss',2), ('TPL-IND-RF-001',  4,  2,'ss',2),
  ('TPL-IND-RF-001',  5,  2,'ss',2), ('TPL-IND-RF-001',  6,  2,'fs',0),
  -- pits
  ('TPL-IND-PIT-001',  2,  1,'fs',0), ('TPL-IND-PIT-001',  3,  2,'fs',0), ('TPL-IND-PIT-001',  4,  3,'fs',0),
  ('TPL-IND-PIT-001',  5,  4,'fs',7)
) as v(tcode, succ, pred, rel, lag)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join public.plan_act_template_items s on s.template_id = t.id and s.seq = v.succ
join public.plan_act_template_items p on p.template_id = t.id and p.seq = v.pred
where not exists (
  select 1 from public.plan_act_template_dependencies d
   where d.template_id = t.id and d.predecessor_item_id = p.id and d.successor_item_id = s.id);

insert into public.plan_act_applicability (target_type, target_id, attribute, operator, values)
select 'template', t.id, 'structure_type', 'in', array['steel']
from public.plan_act_templates t
where t.code in ('TPL-IND-FAC-GF-001', 'TPL-IND-WH-GF-001') and t.version = 1 and t.status = 'draft'
  and not exists (select 1 from public.plan_act_applicability a where a.target_type = 'template' and a.target_id = t.id);

-- D. industrial WBS template activities -> masters (exact names; industrial templates only) --------
create temp table _ind_master_map (task_name text primary key, master_code text not null) on commit drop;
insert into _ind_master_map (task_name, master_code) values
  ('Piling / Pad Footing Excavation', 'STR-SUB-EXC-001'), ('Pad Footing Excavation', 'STR-SUB-EXC-001'),
  ('Excavation for Pits, Tanks & Trenches', 'STR-SUB-EXC-001'), ('Excavation for Dock Pits & Trenches', 'STR-SUB-EXC-001'),
  ('Pile Caps & Column Footings', 'STR-SUB-FTG-004'), ('Ground Beams / Dock Walls', 'STR-SUB-GB-003'),
  ('Anchor Bolt Setting', 'IND-STL-PEB-001'), ('PEB Columns Erection', 'IND-STL-PEB-002'),
  ('Rafters & Bracing', 'IND-STL-PEB-003'), ('Purlins & Girts', 'IND-STL-PEB-004'),
  ('Bolt Tightening & Alignment Survey', 'IND-STL-PEB-005'), ('Crane Girders & Rails', 'IND-STL-CRN-001'),
  ('Mezzanine Steel', 'IND-STL-MEZ-001'), ('Machine Foundations', 'IND-FND-001'),
  ('Pit Wall / Slab Concrete Pour', 'IND-FND-002'), ('Dock Pit Wall Concrete Pour', 'IND-FND-002'),
  ('Sub-base Compaction & Vapour Barrier', 'IND-FLR-001'), ('Sub-base Compaction & Proof Rolling', 'IND-FLR-001'),
  ('Floor Slab Reinforcement / Mesh', 'IND-FLR-002'), ('Mesh / Steel-Fibre Placement', 'IND-FLR-002'),
  ('Ground Slab Concrete Pour', 'IND-FLR-003'), ('Superflat Slab Concrete Pour', 'IND-FLR-003'),
  ('Floor Hardener, Curing & Joint Sawing', 'IND-FLR-004'), ('Epoxy / PU Floor Coating', 'IND-FLR-005'),
  ('Floor Line Marking', 'IND-FLR-006'),
  ('Wall Cladding', 'IND-ENV-CLD-001'), ('Wall Cladding / Insulated Panels', 'IND-ENV-CLD-001'),
  ('Flashings & Trims', 'IND-ENV-CLD-002'), ('Rolling Shutters & Industrial Doors', 'IND-ENV-DOR-001'),
  ('Dock Doors', 'IND-ENV-DOR-001'), ('Dock Levellers & Shelters', 'IND-ENV-DOR-002'),
  ('Roof Insulation Blanket', 'IND-ENV-RF-001'), ('Roof Sheeting', 'IND-ENV-RF-002'),
  ('Skylights', 'IND-ENV-RF-003'), ('Skylights & Smoke Vents', 'IND-ENV-RF-003'), ('Smoke Vents', 'IND-ENV-RF-003'),
  ('Ridge & Roof Ventilators', 'IND-ENV-RF-004'), ('Ridge Ventilators', 'IND-ENV-RF-004'),
  ('Racking Installation', 'IND-OPS-001'),
  ('High-Bay Lighting', 'IND-MEP-001'), ('High-Bay LED Lighting', 'IND-MEP-001'),
  ('ESFR Sprinklers & Hydrants', 'IND-MEP-002'), ('ESFR & In-rack Sprinklers', 'IND-MEP-002'),
  ('Compressed Air Piping', 'IND-MEP-003'), ('Process Water & Cooling Piping', 'IND-MEP-003'),
  ('Ventilation & Exhaust Fans', 'IND-MEP-004'), ('Roof Exhaust Fans', 'IND-MEP-004'),
  ('Solar PV Mounting & Panels', 'IND-MEP-006'),
  ('Cable Trays & Busduct', 'MEP-ELE-001'), ('Cable Trays & Containment', 'MEP-ELE-001'),
  ('MCC & DB Installation', 'MEP-ELE-004');

create or replace function pg_temp.link_ind_tasks(arr jsonb) returns jsonb
language sql stable as $f$
  select coalesce(jsonb_agg(
           case when coalesce(x->>'master_code', '') = '' and m.master_code is not null
                then x || jsonb_build_object('master_code', m.master_code) else x end order by o), '[]'::jsonb)
  from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) with ordinality e(x, o)
  left join _ind_master_map m on lower(m.task_name) = lower(btrim(x->>'task_name'))
$f$;

update public.wbs_templates w
   set content = jsonb_set(w.content, '{floor_blocks}',
         coalesce((select jsonb_object_agg(b.key, b.value || jsonb_build_object('tasks', pg_temp.link_ind_tasks(b.value->'tasks')))
                     from jsonb_each(coalesce(w.content->'floor_blocks', '{}'::jsonb)) b), '{}'::jsonb))
 where w.template_category = 'industrial' and jsonb_typeof(w.content->'floor_blocks') = 'object';
