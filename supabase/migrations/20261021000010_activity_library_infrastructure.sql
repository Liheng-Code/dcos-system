-- Activity Library: infrastructure content (roads, drainage, culverts, bridges, pipelines, utilities),
-- Phases B + C + D of the "Activity Library by Sector" plan, after residential, industrial and
-- institutional (20261021000006 / 08 / 09).
--
-- B. Domain CIV "Civil & Infrastructure": earthworks, pavement, road furniture and lighting, road
--    drainage, culverts and minor civil structures, bridges (piles, piers, crossheads, bearings,
--    girders, deck, joints, parapets, waterproofing, load test), pipelines (trench, bedding, laying,
--    chambers, valves, connections, reinstatement, HDD, pressure test), power / telecom utilities and
--    pumps. DRAFT company norms (indicative, 8 h day), quantity rules, default step templates, work
--    groups CV / RD / BR / PL. Linear works are measured per project section until chainage
--    support (Phase E) exists.
-- C. DRAFT templates for the structure stages used by the infrastructure WBS templates: bridge
--    foundations / piers & abutments / span / deck finishes, box culvert base / walls / top slab /
--    headwalls, pump-station wet well. A Planning Manager activates them.
-- D. Activities of the three infrastructure WBS templates -> masters by exact name (sections and
--    structure blocks; only activities without a master).
--
-- Idempotent: inserts skip what exists; template items / links are written only while missing.

insert into public.plan_act_domains(code, name, sort_order) values ('CIV', 'Civil & Infrastructure', 7) on conflict (code) do nothing;
insert into public.plan_work_groups(code, name, description, sort_order) values
  ('CV', 'Civil & Earthworks',      'Earthworks, drainage, culverts and minor civil structures', 15),
  ('RD', 'Roads & Pavement',        'Pavement layers, kerbs, road furniture, marking and lighting', 25),
  ('BR', 'Bridges',                 'Piles, piers, crossheads, bearings, girders, deck and joints', 30),
  ('PL', 'Pipelines & Utilities',   'Water / sewer pipelines, crossings, duct banks, cables, pumps', 55)
on conflict (code) do nothing;

do $h$
declare r record; d_id uuid; c_id uuid;
begin
  for r in select * from (values
    ('CIV', 'RDW', 'Roads & Earthworks', 'EW', 'Earthworks', 1),
    ('CIV', 'RDW', 'Roads & Earthworks', 'PAV', 'Pavement', 2),
    ('CIV', 'RDW', 'Roads & Earthworks', 'RFN', 'Road Furniture & Lighting', 3),
    ('CIV', 'DRN', 'Drainage & Civil Structures', 'DRN', 'Road Drainage', 1),
    ('CIV', 'DRN', 'Drainage & Civil Structures', 'STC', 'Culverts & Minor Structures', 2),
    ('CIV', 'BRG', 'Bridges', 'BRG', 'Bridges', 1),
    ('CIV', 'PIP', 'Pipelines & Utilities', 'PIP', 'Pipelines', 1),
    ('CIV', 'PIP', 'Pipelines & Utilities', 'UTL', 'Power & Telecom Utilities', 2),
    ('CIV', 'PIP', 'Pipelines & Utilities', 'FAC', 'Pump & Treatment Equipment', 3)
  ) v(dom, cat, cat_name, fam, fam_name, so) loop
    select id into d_id from public.plan_act_domains where code = r.dom;
    insert into public.plan_act_categories(domain_id, code, name) values (d_id, r.cat, r.cat_name) on conflict (domain_id, code) do nothing;
    select id into c_id from public.plan_act_categories where domain_id = d_id and code = r.cat;
    insert into public.plan_act_families(category_id, code, name, sort_order) values (c_id, r.fam, r.fam_name, r.so) on conflict (category_id, code) do nothing;
  end loop;
end $h$;

insert into public.plan_act_masters(code, name, domain_id, category_id, family_id, discipline, work_type, default_unit,
    status, version, owner, source, effective_date, sectors, building_types, duration_basis, default_work_group)
select v.code, v.name, dm.id, ca.id, fa.id, v.disc, v.wtype, v.unit, 'active', 1, 'Planning Standards',
       'Company Standard (infrastructure seed 2026-10-21)', date '2026-10-21', array['infrastructure']::text[], v.btypes, v.basis, v.wg
from (values
  ('CIV', 'RDW', 'EW', 'CIV-EW-001', 'Clearing & Grubbing', 'm²', 'CIV', 'Earthworks', 'CV', 'quantity', array[]::text[]),
  ('CIV', 'RDW', 'EW', 'CIV-EW-002', 'Topsoil Stripping', 'm³', 'CIV', 'Earthworks', 'CV', 'quantity', array[]::text[]),
  ('CIV', 'RDW', 'EW', 'CIV-EW-003', 'Cut to Formation', 'm³', 'CIV', 'Earthworks', 'CV', 'quantity', array[]::text[]),
  ('CIV', 'RDW', 'EW', 'CIV-EW-004', 'Embankment Fill & Compaction', 'm³', 'CIV', 'Earthworks', 'CV', 'quantity', array[]::text[]),
  ('CIV', 'RDW', 'EW', 'CIV-EW-005', 'Ground Improvement / Soft Soil Treatment', 'm²', 'CIV', 'Earthworks', 'CV', 'quantity', array[]::text[]),
  ('CIV', 'RDW', 'EW', 'CIV-EW-006', 'Slope Protection', 'm²', 'CIV', 'Earthworks', 'CV', 'quantity', array[]::text[]),
  ('CIV', 'RDW', 'EW', 'CIV-EW-007', 'Subgrade Preparation & Testing', 'm²', 'CIV', 'Earthworks', 'CV', 'quantity', array[]::text[]),
  ('CIV', 'RDW', 'PAV', 'CIV-PAV-001', 'Sub-base Course', 'm²', 'CIV', 'Pavement', 'RD', 'quantity', array['road','bridge']::text[]),
  ('CIV', 'RDW', 'PAV', 'CIV-PAV-002', 'Base Course', 'm²', 'CIV', 'Pavement', 'RD', 'quantity', array['road','bridge']::text[]),
  ('CIV', 'RDW', 'PAV', 'CIV-PAV-003', 'Prime / Tack Coat', 'm²', 'CIV', 'Pavement', 'RD', 'quantity', array['road','bridge']::text[]),
  ('CIV', 'RDW', 'PAV', 'CIV-PAV-004', 'Asphalt Binder Course', 'm²', 'CIV', 'Pavement', 'RD', 'quantity', array['road','bridge']::text[]),
  ('CIV', 'RDW', 'PAV', 'CIV-PAV-005', 'Asphalt Wearing Course', 'm²', 'CIV', 'Pavement', 'RD', 'quantity', array['road','bridge']::text[]),
  ('CIV', 'RDW', 'PAV', 'CIV-PAV-006', 'Kerbs & Medians', 'm', 'CIV', 'Pavement', 'RD', 'quantity', array['road','bridge']::text[]),
  ('CIV', 'RDW', 'PAV', 'CIV-PAV-007', 'Footpaths & Cycle Lanes', 'm²', 'CIV', 'Pavement', 'RD', 'quantity', array['road','bridge']::text[]),
  ('CIV', 'RDW', 'RFN', 'CIV-RFN-001', 'Crash Barriers & Guardrails', 'm', 'CIV', 'Road Furniture', 'RD', 'quantity', array['road','bridge']::text[]),
  ('CIV', 'RDW', 'RFN', 'CIV-RFN-002', 'Traffic Signs & Gantries', 'nos', 'CIV', 'Road Furniture', 'RD', 'quantity', array['road','bridge']::text[]),
  ('CIV', 'RDW', 'RFN', 'CIV-RFN-003', 'Road Marking & Studs', 'm', 'CIV', 'Road Furniture', 'RD', 'quantity', array['road','bridge']::text[]),
  ('CIV', 'RDW', 'RFN', 'CIV-RFN-004', 'Traffic Signal Installation', 'nos', 'MEP', 'Electrical', 'RD', 'quantity', array['road']::text[]),
  ('CIV', 'RDW', 'RFN', 'CIV-RFN-005', 'Street / Bridge Lighting', 'nos', 'MEP', 'Electrical', 'RD', 'quantity', array['road','bridge','utility']::text[]),
  ('CIV', 'DRN', 'DRN', 'CIV-DRN-001', 'Pipe Culverts', 'm', 'CIV', 'Drainage', 'CV', 'quantity', array['road','drainage']::text[]),
  ('CIV', 'DRN', 'DRN', 'CIV-DRN-002', 'Side Drains & U-Channels', 'm', 'CIV', 'Drainage', 'CV', 'quantity', array['road','drainage','bridge']::text[]),
  ('CIV', 'DRN', 'DRN', 'CIV-DRN-003', 'Catch Basins, Manholes & Chambers', 'nos', 'CIV', 'Drainage', 'CV', 'quantity', array['road','drainage','water_supply']::text[]),
  ('CIV', 'DRN', 'DRN', 'CIV-DRN-004', 'Subsoil Drains', 'm', 'CIV', 'Drainage', 'CV', 'quantity', array['road','drainage']::text[]),
  ('CIV', 'DRN', 'DRN', 'CIV-DRN-005', 'Outfalls, Rip-rap & Erosion Protection', 'm²', 'CIV', 'Drainage', 'CV', 'quantity', array['road','drainage','bridge']::text[]),
  ('CIV', 'DRN', 'STC', 'CIV-STR-001', 'Civil Structure Reinforcement (Culverts, Tanks, Wet Wells)', 'ton', 'STR', 'Reinforcement', 'CV', 'quantity', array['road','drainage','water_supply']::text[]),
  ('CIV', 'DRN', 'STC', 'CIV-STR-002', 'Civil Structure Formwork', 'm²', 'STR', 'Formwork', 'CV', 'quantity', array['road','drainage','water_supply']::text[]),
  ('CIV', 'DRN', 'STC', 'CIV-STR-003', 'Civil Structure Concrete Casting', 'm³', 'STR', 'Concrete Works', 'CV', 'quantity', array['road','drainage','water_supply']::text[]),
  ('CIV', 'DRN', 'STC', 'CIV-STR-004', 'Headwalls & Wingwalls', 'm³', 'STR', 'Concrete Works', 'CV', 'quantity', array['road','drainage','bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-001', 'Bored Pile Installation', 'm', 'STR', 'Piling', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-002', 'Pile Integrity & Load Tests', 'lot', 'STR', 'Testing', 'BR', 'fixed', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-004', 'Pier / Abutment Reinforcement', 'ton', 'STR', 'Reinforcement', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-005', 'Pier / Abutment Formwork', 'm²', 'STR', 'Formwork', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-006', 'Pier / Abutment Concrete Casting', 'm³', 'STR', 'Concrete Works', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-007', 'Pier Crosshead (Falsework, Rebar, Concrete)', 'm³', 'STR', 'Concrete Works', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-008', 'Bearing Installation', 'nos', 'STR', 'Bearings', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-009', 'Girder / Segment Erection', 'nos', 'STR', 'Erection', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-010', 'Deck Slab Reinforcement', 'ton', 'STR', 'Reinforcement', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-011', 'Deck Formwork / Permanent Shutters', 'm²', 'STR', 'Formwork', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-012', 'Deck Slab Concrete Casting', 'm³', 'STR', 'Concrete Works', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-013', 'Expansion Joints', 'm', 'STR', 'Joints', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-014', 'Parapets / Barriers on Structure', 'm', 'STR', 'Concrete Works', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-015', 'Deck Waterproofing', 'm²', 'STR', 'Waterproofing', 'BR', 'quantity', array['bridge']::text[]),
  ('CIV', 'BRG', 'BRG', 'CIV-BRG-016', 'Bridge Load Test', 'lot', 'STR', 'Testing', 'QA', 'fixed', array['bridge']::text[]),
  ('CIV', 'PIP', 'PIP', 'CIV-PIP-001', 'Trench Excavation & Shoring', 'm', 'CIV', 'Pipelines', 'PL', 'quantity', array['water_supply','drainage','utility','other_infrastructure']::text[]),
  ('CIV', 'PIP', 'PIP', 'CIV-PIP-002', 'Pipe Bedding', 'm', 'CIV', 'Pipelines', 'PL', 'quantity', array['water_supply','drainage','utility','other_infrastructure']::text[]),
  ('CIV', 'PIP', 'PIP', 'CIV-PIP-003', 'Pipe Laying & Jointing', 'm', 'CIV', 'Pipelines', 'PL', 'quantity', array['water_supply','drainage','utility','other_infrastructure','road']::text[]),
  ('CIV', 'PIP', 'PIP', 'CIV-PIP-004', 'Thrust Blocks & Valve Chambers', 'nos', 'CIV', 'Pipelines', 'PL', 'quantity', array['water_supply','drainage','utility','other_infrastructure']::text[]),
  ('CIV', 'PIP', 'PIP', 'CIV-PIP-005', 'Valves, Hydrants & Air Valves', 'nos', 'CIV', 'Pipelines', 'PL', 'quantity', array['water_supply','drainage','utility','other_infrastructure']::text[]),
  ('CIV', 'PIP', 'PIP', 'CIV-PIP-006', 'Service / House Connections', 'nos', 'CIV', 'Pipelines', 'PL', 'quantity', array['water_supply','drainage','utility','other_infrastructure']::text[]),
  ('CIV', 'PIP', 'PIP', 'CIV-PIP-008', 'Road Reinstatement', 'm²', 'CIV', 'Pipelines', 'PL', 'quantity', array['water_supply','drainage','utility','other_infrastructure','road']::text[]),
  ('CIV', 'PIP', 'PIP', 'CIV-PIP-009', 'HDD / Trenchless Crossing', 'm', 'CIV', 'Trenchless', 'PL', 'quantity', array['water_supply','drainage','utility','other_infrastructure']::text[]),
  ('CIV', 'PIP', 'PIP', 'CIV-PIP-010', 'Pipeline Pressure Test & Disinfection', 'lot', 'CIV', 'Testing', 'QA', 'fixed', array['water_supply','drainage','utility','other_infrastructure']::text[]),
  ('CIV', 'PIP', 'UTL', 'CIV-UTL-001', 'Duct Bank Construction', 'm', 'MEP', 'Utilities', 'PL', 'quantity', array['utility','road','water_supply']::text[]),
  ('CIV', 'PIP', 'UTL', 'CIV-UTL-002', 'MV / LV Cable Pulling', 'm', 'MEP', 'Utilities', 'PL', 'quantity', array['utility','road','water_supply']::text[]),
  ('CIV', 'PIP', 'UTL', 'CIV-UTL-003', 'Cable Jointing & Termination', 'nos', 'MEP', 'Utilities', 'PL', 'quantity', array['utility','road','water_supply']::text[]),
  ('CIV', 'PIP', 'UTL', 'CIV-UTL-004', 'Fibre / Telemetry Cable', 'm', 'MEP', 'Utilities', 'PL', 'quantity', array['utility','road','water_supply']::text[]),
  ('CIV', 'PIP', 'FAC', 'CIV-FAC-001', 'Pump & Motor Installation', 'nos', 'MEP', 'Mechanical', 'PL', 'quantity', array['water_supply','drainage','utility']::text[])
) v(dom, cat, fam, code, name, unit, disc, wtype, wg, basis, btypes)
join public.plan_act_domains dm on dm.code = v.dom
join public.plan_act_categories ca on ca.domain_id = dm.id and ca.code = v.cat
join public.plan_act_families fa on fa.category_id = ca.id and fa.code = v.fam
on conflict (code, version) do nothing;

-- building / industrial masters that infrastructure structures and facilities also use
update public.plan_act_masters set sectors = sectors || array['infrastructure']
 where version = 1 and not ('infrastructure' = any(sectors)) and sectors <> '{}'
   and code in ('STR-SUB-EXC-001','STR-SUB-EXC-002','STR-SUB-FTG-001','STR-SUB-BSM-001','STR-SUB-BSM-002','STR-SUB-BSM-003',
                'STR-SUB-BSM-004','STR-RC-FDN-001','STR-RC-FDN-002','STR-RC-FDN-003','IND-MEP-003','IND-FND-001','IND-FLR-005');

insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select 'NRM-' || m.code, v.name, v.trade, m.discipline, m.code, m.default_unit,
  round((v.skilled + v.helpers) * 8.0 / v.output, 4), 8, 100, 'manual',
  'ASSUMPTION: indicative rate ' || v.output || ' ' || m.default_unit || '/crew-day, crew ' || v.skilled || ' ' || v.skilled_role
    || coalesce(' + ' || nullif(v.helpers, 0) || ' ' || v.helper_role, '') || '. ' || v.note || ' Calibrate on the first sections before approving.',
  'draft', 1, v.output, m.id
from (values
  ('CIV-EW-001', 'Clearing & grubbing', 'Earthworks', 3000, 1, 'Dozer Operator', 3, 'General Worker', 'Dozer, chainsaw crew, spoil to tip.'),
  ('CIV-EW-002', 'Topsoil stripping', 'Earthworks', 400, 2, 'Plant Operator', 2, 'General Worker', 'Dozer / excavator to stockpile.'),
  ('CIV-EW-003', 'Cut to formation', 'Earthworks', 500, 3, 'Plant Operator', 2, 'General Worker', 'Excavator + trucks, haul within site.'),
  ('CIV-EW-004', 'Embankment fill & compaction', 'Earthworks', 400, 3, 'Plant Operator', 3, 'General Worker', 'Layers ≤ 300 mm, grader, roller, density tests.'),
  ('CIV-EW-005', 'Ground improvement / soft soil treatment', 'Earthworks', 300, 3, 'Plant Operator', 3, 'General Worker', 'Geotextile + surcharge / stone columns (indicative).'),
  ('CIV-EW-006', 'Slope protection', 'Earthworks', 80, 2, 'Mason', 3, 'General Worker', 'Turfing, geomat or rip-rap per m².'),
  ('CIV-EW-007', 'Subgrade preparation & testing', 'Earthworks', 1500, 2, 'Plant Operator', 2, 'General Worker', 'Grade, compact, proof roll and test.'),
  ('CIV-PAV-001', 'Sub-base course', 'Pavement', 1200, 3, 'Plant Operator', 3, 'General Worker', 'Granular sub-base 150-200 mm, grader + roller.'),
  ('CIV-PAV-002', 'Base course', 'Pavement', 1200, 3, 'Plant Operator', 3, 'General Worker', 'Crushed aggregate base, graded and compacted.'),
  ('CIV-PAV-003', 'Prime / tack coat', 'Pavement', 5000, 1, 'Sprayer Operator', 2, 'General Worker', 'Bitumen distributor.'),
  ('CIV-PAV-004', 'Asphalt binder course', 'Pavement', 2500, 6, 'Paving Crew', 4, 'General Worker', 'Paver + rollers, about 50 mm.'),
  ('CIV-PAV-005', 'Asphalt wearing course', 'Pavement', 3000, 6, 'Paving Crew', 4, 'General Worker', 'Paver + rollers, about 40-50 mm.'),
  ('CIV-PAV-006', 'Kerbs & medians', 'Pavement', 80, 2, 'Mason', 2, 'General Worker', 'Precast kerbs on concrete bed / haunch.'),
  ('CIV-PAV-007', 'Footpaths & cycle lanes', 'Pavement', 120, 2, 'Paver', 2, 'General Worker', 'Pavers or asphalt on base.'),
  ('CIV-RFN-001', 'Crash barriers & guardrails', 'Road Furniture', 120, 2, 'Installer', 2, 'General Worker', 'W-beam on driven posts.'),
  ('CIV-RFN-002', 'Traffic signs & gantries', 'Road Furniture', 8, 2, 'Installer', 2, 'General Worker', 'Signs on posts; gantries take a crane day each.'),
  ('CIV-RFN-003', 'Road marking & studs', 'Road Furniture', 2000, 1, 'Marking Machine Operator', 2, 'General Worker', 'Thermoplastic lines incl. studs.'),
  ('CIV-RFN-004', 'Traffic signal installation', 'Electrical', 0.25, 2, 'Electrician', 2, 'Electrical Helper', 'Per junction: poles, heads, controller and cabling.'),
  ('CIV-RFN-005', 'Street / bridge lighting', 'Electrical', 6, 2, 'Electrician', 2, 'General Worker', 'Per pole incl. base, bracket, luminaire and cabling.'),
  ('CIV-DRN-001', 'Pipe culverts', 'Drainage', 15, 2, 'Pipe Layer', 3, 'General Worker', 'Excavate, bed, lay RC pipe, backfill.'),
  ('CIV-DRN-002', 'Side drains & U-channels', 'Drainage', 40, 2, 'Mason', 3, 'General Worker', 'Precast U-channels on bedding.'),
  ('CIV-DRN-003', 'Catch basins, manholes & chambers', 'Drainage', 2, 2, 'Mason', 2, 'General Worker', 'Precast or in-situ, per unit incl. cover.'),
  ('CIV-DRN-004', 'Subsoil drains', 'Drainage', 60, 1, 'Pipe Layer', 3, 'General Worker', 'Perforated pipe in filter material.'),
  ('CIV-DRN-005', 'Outfalls, rip-rap & erosion protection', 'Drainage', 40, 2, 'Mason', 3, 'General Worker', 'Rip-rap / gabions per m².'),
  ('CIV-STR-001', 'Civil structure reinforcement', 'Reinforcement', 1.2, 4, 'Steel Fixer', 1, 'General Worker', 'Culverts, tanks and wet wells.'),
  ('CIV-STR-002', 'Civil structure formwork', 'Formwork', 30, 3, 'Carpenter', 1, 'General Worker', 'Walls and slabs of minor structures.'),
  ('CIV-STR-003', 'Civil structure concrete casting', 'Concrete', 40, 4, 'Concrete Worker', 2, 'General Worker', 'Pumped, vibrated.'),
  ('CIV-STR-004', 'Headwalls & wingwalls', 'Concrete', 8, 4, 'Concrete Worker / Carpenter', 2, 'General Worker', 'Per m³ incl. formwork and rebar.'),
  ('CIV-BRG-001', 'Bored pile installation', 'Piling', 30, 4, 'Piling Rig Crew', 3, 'General Worker', 'Per m bored incl. cage and tremie pour.'),
  ('CIV-BRG-004', 'Pier / abutment reinforcement', 'Reinforcement', 1.5, 4, 'Steel Fixer', 2, 'General Worker', 'Cages lifted by crane.'),
  ('CIV-BRG-005', 'Pier / abutment formwork', 'Formwork', 25, 3, 'Carpenter', 2, 'General Worker', 'System forms, climbing for tall piers.'),
  ('CIV-BRG-006', 'Pier / abutment concrete casting', 'Concrete', 40, 4, 'Concrete Worker', 2, 'General Worker', 'Pumped in lifts.'),
  ('CIV-BRG-007', 'Pier crosshead', 'Concrete', 8, 6, 'Carpenter / Steel Fixer', 2, 'General Worker', 'Per m³ incl. falsework, rebar and pour.'),
  ('CIV-BRG-008', 'Bearing installation', 'Bearings', 4, 2, 'Bearing Installer', 1, 'General Worker', 'Per bearing incl. grout and survey.'),
  ('CIV-BRG-009', 'Girder / segment erection', 'Erection', 4, 6, 'Erection Crew', 2, 'Rigger', 'Per girder by crane or launcher.'),
  ('CIV-BRG-010', 'Deck slab reinforcement', 'Reinforcement', 2, 4, 'Steel Fixer', 2, 'General Worker', 'Deck mats on girders.'),
  ('CIV-BRG-011', 'Deck formwork / permanent shutters', 'Formwork', 80, 3, 'Carpenter', 2, 'General Worker', 'Permanent shutters between girders.'),
  ('CIV-BRG-012', 'Deck slab concrete casting', 'Concrete', 80, 6, 'Concrete Worker', 4, 'General Worker', 'Pumped, screeded, cured.'),
  ('CIV-BRG-013', 'Expansion joints', 'Joints', 10, 2, 'Joint Installer', 2, 'General Worker', 'Per m incl. nosing concrete.'),
  ('CIV-BRG-014', 'Parapets / barriers on structure', 'Concrete', 25, 3, 'Carpenter / Concrete Worker', 2, 'General Worker', 'Slip-form or precast, per m.'),
  ('CIV-BRG-015', 'Deck waterproofing', 'Waterproofing', 300, 2, 'Waterproofing Applicator', 2, 'General Worker', 'Spray / sheet membrane before surfacing.'),
  ('CIV-PIP-001', 'Trench excavation & shoring', 'Pipelines', 40, 2, 'Excavator Operator', 3, 'General Worker', 'Trench boxes / shoring, per m of trench.'),
  ('CIV-PIP-002', 'Pipe bedding', 'Pipelines', 80, 1, 'Pipe Layer', 2, 'General Worker', 'Sand / granular bed and haunch.'),
  ('CIV-PIP-003', 'Pipe laying & jointing', 'Pipelines', 50, 2, 'Pipe Layer', 3, 'General Worker', 'HDPE / DI / uPVC, average 150-300 mm.'),
  ('CIV-PIP-004', 'Thrust blocks & valve chambers', 'Pipelines', 2, 2, 'Mason', 2, 'General Worker', 'Per unit incl. cover.'),
  ('CIV-PIP-005', 'Valves, hydrants & air valves', 'Pipelines', 6, 2, 'Pipe Fitter', 1, 'General Worker', 'Per unit incl. fittings.'),
  ('CIV-PIP-006', 'Service / house connections', 'Pipelines', 6, 2, 'Plumber', 2, 'General Worker', 'Tapping, pipe and meter box per connection.'),
  ('CIV-PIP-008', 'Road reinstatement', 'Pipelines', 150, 2, 'Paver', 3, 'General Worker', 'Base and asphalt over trenches.'),
  ('CIV-PIP-009', 'HDD / trenchless crossing', 'Trenchless', 40, 4, 'HDD Crew', 2, 'General Worker', 'Per m incl. pilot, ream and pullback.'),
  ('CIV-UTL-001', 'Duct bank construction', 'Utilities', 30, 2, 'Mason', 3, 'General Worker', 'Trench, ducts in concrete surround, backfill.'),
  ('CIV-UTL-002', 'MV / LV cable pulling', 'Utilities', 300, 3, 'Cable Jointer', 3, 'General Worker', 'Winch / roller pulling through ducts.'),
  ('CIV-UTL-003', 'Cable jointing & termination', 'Utilities', 3, 1, 'Cable Jointer', 1, 'General Worker', 'MV joints / terminations per unit.'),
  ('CIV-UTL-004', 'Fibre / telemetry cable', 'Utilities', 800, 2, 'Fibre Technician', 2, 'General Worker', 'Blown / pulled fibre, splicing separate.'),
  ('CIV-FAC-001', 'Pump & motor installation', 'Mechanical', 1, 2, 'Mechanical Fitter', 2, 'General Worker', 'Per pump set incl. alignment and connections.')
) as v(mcode, name, trade, output, skilled, skilled_role, helpers, helper_role, note)
join public.plan_act_masters m on m.code = v.mcode and m.version = 1
where not exists (select 1 from public.plan_productivity_norms n where n.project_id is null and n.code = 'NRM-' || m.code);

insert into public.plan_act_quantity_rules(master_id, name, metric_code, unit, provider_priority)
select m.id, v.rule_name, v.metric, m.default_unit, array['bim','boq','manual']
from (values
  ('CIV-EW-001', 'Cleared area', 'clearing_area'),
  ('CIV-EW-002', 'Topsoil volume', 'topsoil_volume'),
  ('CIV-EW-003', 'Cut volume', 'cut_volume'),
  ('CIV-EW-004', 'Fill volume', 'fill_volume'),
  ('CIV-EW-005', 'Treated area', 'ground_improvement_area'),
  ('CIV-EW-006', 'Slope protection area', 'slope_protection_area'),
  ('CIV-EW-007', 'Subgrade area', 'subgrade_area'),
  ('CIV-PAV-001', 'Sub-base area', 'subbase_area'),
  ('CIV-PAV-002', 'Base course area', 'base_course_area'),
  ('CIV-PAV-003', 'Sprayed area', 'prime_coat_area'),
  ('CIV-PAV-004', 'Binder course area', 'asphalt_binder_area'),
  ('CIV-PAV-005', 'Wearing course area', 'asphalt_wearing_area'),
  ('CIV-PAV-006', 'Kerb length', 'kerb_length'),
  ('CIV-PAV-007', 'Footpath area', 'footpath_area'),
  ('CIV-RFN-001', 'Barrier length', 'barrier_length'),
  ('CIV-RFN-002', 'Signs', 'sign_count'),
  ('CIV-RFN-003', 'Marking length', 'road_marking_length'),
  ('CIV-RFN-004', 'Signalised junctions', 'signal_junction_count'),
  ('CIV-RFN-005', 'Lighting poles', 'lighting_pole_count'),
  ('CIV-DRN-001', 'Culvert pipe length', 'pipe_culvert_length'),
  ('CIV-DRN-002', 'Drain length', 'side_drain_length'),
  ('CIV-DRN-003', 'Manholes / chambers', 'manhole_count'),
  ('CIV-DRN-004', 'Subsoil drain length', 'subsoil_drain_length'),
  ('CIV-DRN-005', 'Protection area', 'riprap_area'),
  ('CIV-STR-001', 'Structure reinforcement', 'civil_rebar'),
  ('CIV-STR-002', 'Structure formwork', 'civil_formwork'),
  ('CIV-STR-003', 'Structure concrete', 'civil_concrete_volume'),
  ('CIV-STR-004', 'Headwall concrete', 'headwall_volume'),
  ('CIV-BRG-001', 'Bored pile length', 'bored_pile_length'),
  ('CIV-BRG-004', 'Pier reinforcement', 'pier_rebar'),
  ('CIV-BRG-005', 'Pier formwork', 'pier_formwork'),
  ('CIV-BRG-006', 'Pier concrete', 'pier_volume'),
  ('CIV-BRG-007', 'Crosshead concrete', 'crosshead_volume'),
  ('CIV-BRG-008', 'Bearings', 'bearing_count'),
  ('CIV-BRG-009', 'Girders / segments', 'girder_count'),
  ('CIV-BRG-010', 'Deck reinforcement', 'deck_rebar'),
  ('CIV-BRG-011', 'Deck soffit area', 'deck_formwork_area'),
  ('CIV-BRG-012', 'Deck concrete', 'deck_volume'),
  ('CIV-BRG-013', 'Joint length', 'expansion_joint_length'),
  ('CIV-BRG-014', 'Parapet length', 'parapet_length'),
  ('CIV-BRG-015', 'Deck area', 'deck_waterproofing_area'),
  ('CIV-PIP-001', 'Trench length', 'trench_length'),
  ('CIV-PIP-002', 'Bedded length', 'pipe_bedding_length'),
  ('CIV-PIP-003', 'Pipe length', 'pipe_length'),
  ('CIV-PIP-004', 'Chambers', 'valve_chamber_count'),
  ('CIV-PIP-005', 'Valves & hydrants', 'valve_count'),
  ('CIV-PIP-006', 'Connections', 'service_connection_count'),
  ('CIV-PIP-008', 'Reinstated area', 'reinstatement_area'),
  ('CIV-PIP-009', 'Crossing length', 'hdd_length'),
  ('CIV-UTL-001', 'Duct bank length', 'duct_bank_length'),
  ('CIV-UTL-002', 'Cable length', 'cable_length_mv_lv'),
  ('CIV-UTL-003', 'Joints / terminations', 'cable_joint_count'),
  ('CIV-UTL-004', 'Fibre length', 'fibre_length'),
  ('CIV-FAC-001', 'Pump sets', 'pump_count')
) as v(mcode, rule_name, metric)
join public.plan_act_masters m on m.code = v.mcode and m.version = 1
on conflict (master_id, name) do nothing;

update public.plan_act_masters m set default_step_template_id = s.id
  from (values
    ('CIV-EW-004', 'Earthworks – Cut & Fill'),
    ('CIV-PAV-002', 'Road Pavement – Sub-base & Base'),
    ('CIV-PAV-005', 'Asphalt Paving'),
    ('CIV-PAV-006', 'Kerbs, Medians & U-Drains'),
    ('CIV-RFN-003', 'Road Marking & Signage'),
    ('CIV-RFN-005', 'Street Lighting'),
    ('CIV-STR-003', 'Box Culvert'),
    ('CIV-DRN-003', 'Manholes & Valve Chambers'),
    ('CIV-BRG-001', 'Piling Works'),
    ('CIV-BRG-007', 'Bridge Pier & Crosshead'),
    ('CIV-BRG-009', 'Precast Girder Erection'),
    ('CIV-BRG-012', 'Bridge Deck Slab'),
    ('CIV-BRG-008', 'Bearings & Expansion Joints'),
    ('CIV-PIP-003', 'Pipeline Laying (Water / Sewer)'),
    ('CIV-PIP-004', 'Manholes & Valve Chambers'),
    ('CIV-PIP-009', 'HDD / Trenchless Crossing'),
    ('CIV-PIP-010', 'Pressure Testing & Disinfection'),
    ('CIV-UTL-001', 'Cable Duct Bank & Cable Pulling')
  ) as v(mcode, step_name)
  join public.activity_step_template_master s on s.template_name = v.step_name and s.is_active
 where m.code = v.mcode and m.default_step_template_id is null;

insert into public.plan_act_templates (code, name, description, domain_id, status, version, applies_to_level_types, owner,
  sectors, building_types, inter_level_from_seq, inter_level_to_seq, inter_level_relation, inter_level_lag_days)
select v.code, v.name, v.descr, d.id, 'draft', 1, v.levels, 'Planning Manager', array['infrastructure']::text[], v.btypes, v.from_seq, v.to_seq, 'fs', v.lag
from (values
  ('TPL-INF-BR-FDN-001', 'Bridge – Foundations (Bored Piles & Pile Caps)', 'Bored piles, integrity / load tests, pile cap excavation, blinding, reinforcement, formwork and concrete, backfill. The substructure starts 3 days after the pile cap pour.', array['basement']::text[], array['bridge']::text[], 8, 1, 3),
  ('TPL-INF-BR-SUB-001', 'Bridge – Piers & Abutments', 'Pier / abutment reinforcement, formwork and concrete, crosshead with bearing plinths, wingwalls, abutment backfill. Spans start 7 days after the crosshead pour.', array['ground']::text[], array['bridge']::text[], 5, 1, 7),
  ('TPL-INF-BR-SPAN-001', 'Bridge – Span / Deck', 'Bearings, girder / segment erection, permanent shutters, deck reinforcement, hold point, deck concrete. The next span starts when this span''s girders are erected.', array['typical']::text[], array['bridge']::text[], 3, 1, 0),
  ('TPL-INF-BR-DECK-001', 'Bridge – Deck Finishes & Opening', 'Parapets, expansion joints, deck waterproofing, surfacing, marking, lighting, load test.', array['roof']::text[], array['bridge']::text[], null::int, null::int, 0),
  ('TPL-INF-CUL-BASE-001', 'Box Culvert – Base Slab', 'Diversion and excavation, bedding and blinding, base slab reinforcement, formwork and concrete.', array['basement']::text[], array['road','drainage']::text[], 6, 1, 2),
  ('TPL-INF-CUL-WALL-001', 'Box Culvert – Walls', 'Wall reinforcement, formwork and concrete (or precast unit placement).', array['ground']::text[], array['road','drainage']::text[], 4, 1, 3),
  ('TPL-INF-CUL-TOP-001', 'Box Culvert – Top Slab', 'Falsework and formwork, top slab reinforcement, hold point, concrete.', array['typical']::text[], array['road','drainage']::text[], 5, 1, 7),
  ('TPL-INF-CUL-HW-001', 'Box Culvert – Headwalls, Backfill & Reinstatement', 'Headwalls and wingwalls, waterproofing, backfill, aprons and scour protection, guardrails, road reinstatement.', array['roof']::text[], array['road','drainage']::text[], null::int, null::int, 0),
  ('TPL-INF-PS-WW-001', 'Pump Station – Wet Well / Underground Tank', 'Sheet piling, excavation and dewatering, blinding, base slab, walls and roof slab, waterproofing, backfill, pumps and pipework.', array['basement']::text[], array['water_supply','drainage','utility']::text[], null::int, null::int, 0)
) v(code, name, descr, levels, btypes, from_seq, to_seq, lag)
cross join public.plan_act_domains d
where d.code = 'CIV' and not exists (select 1 from public.plan_act_templates t where t.code = v.code);

insert into public.plan_act_template_items (template_id, seq, master_id, scope, duration_days_override, is_milestone, note, crews)
select t.id, v.seq, m.id, 'floor', v.fixed_days, false, v.note, v.crews
from (values
  ('TPL-INF-BR-FDN-001', 1, 'STR-RC-SLAB-001', 1::numeric, 1, 'Pile positions'),
  ('TPL-INF-BR-FDN-001', 2, 'CIV-BRG-001', null::numeric, 1, null),
  ('TPL-INF-BR-FDN-001', 3, 'CIV-BRG-002', 5::numeric, 1, 'Integrity + load tests'),
  ('TPL-INF-BR-FDN-001', 4, 'STR-SUB-EXC-001', null::numeric, 1, 'Pile cap excavation and pile trimming'),
  ('TPL-INF-BR-FDN-001', 5, 'STR-SUB-FTG-001', null::numeric, 1, null),
  ('TPL-INF-BR-FDN-001', 6, 'STR-RC-FDN-001', null::numeric, 1, null),
  ('TPL-INF-BR-FDN-001', 7, 'STR-RC-FDN-002', null::numeric, 1, null),
  ('TPL-INF-BR-FDN-001', 8, 'STR-RC-FDN-003', null::numeric, 1, 'Drives the substructure start'),
  ('TPL-INF-BR-FDN-001', 9, 'STR-SUB-EXC-002', null::numeric, 1, null),
  ('TPL-INF-BR-SUB-001', 1, 'STR-RC-SLAB-001', 0.5::numeric, 1, null),
  ('TPL-INF-BR-SUB-001', 2, 'CIV-BRG-004', null::numeric, 1, null),
  ('TPL-INF-BR-SUB-001', 3, 'CIV-BRG-005', null::numeric, 1, null),
  ('TPL-INF-BR-SUB-001', 4, 'CIV-BRG-006', null::numeric, 1, null),
  ('TPL-INF-BR-SUB-001', 5, 'CIV-BRG-007', null::numeric, 1, 'Crosshead incl. bearing plinths; drives the spans'),
  ('TPL-INF-BR-SUB-001', 6, 'CIV-STR-004', null::numeric, 1, 'Abutments only'),
  ('TPL-INF-BR-SUB-001', 7, 'STR-SUB-EXC-002', null::numeric, 1, 'Abutment backfill & drainage'),
  ('TPL-INF-BR-SUB-001', 8, 'CIV-EW-006', null::numeric, 1, 'Slope protection at abutments'),
  ('TPL-INF-BR-SPAN-001', 1, 'STR-RC-SLAB-001', 0.5::numeric, 1, null),
  ('TPL-INF-BR-SPAN-001', 2, 'CIV-BRG-008', null::numeric, 1, null),
  ('TPL-INF-BR-SPAN-001', 3, 'CIV-BRG-009', null::numeric, 1, null),
  ('TPL-INF-BR-SPAN-001', 4, 'CIV-BRG-011', null::numeric, 1, null),
  ('TPL-INF-BR-SPAN-001', 5, 'CIV-BRG-010', null::numeric, 1, null),
  ('TPL-INF-BR-SPAN-001', 6, 'STR-RC-SLAB-006', 0.5::numeric, 1, 'Hold point'),
  ('TPL-INF-BR-SPAN-001', 7, 'CIV-BRG-012', null::numeric, 1, null),
  ('TPL-INF-BR-SPAN-001', 8, 'STR-RC-SLAB-009', 7::numeric, 1, 'Curing / stressing (if PT)'),
  ('TPL-INF-BR-DECK-001', 1, 'CIV-BRG-014', null::numeric, 1, null),
  ('TPL-INF-BR-DECK-001', 2, 'CIV-BRG-013', null::numeric, 1, null),
  ('TPL-INF-BR-DECK-001', 3, 'CIV-BRG-015', null::numeric, 1, null),
  ('TPL-INF-BR-DECK-001', 4, 'CIV-PAV-005', null::numeric, 1, 'Deck surfacing'),
  ('TPL-INF-BR-DECK-001', 5, 'CIV-RFN-003', null::numeric, 1, null),
  ('TPL-INF-BR-DECK-001', 6, 'CIV-RFN-005', null::numeric, 1, 'Lighting & signs on structure'),
  ('TPL-INF-BR-DECK-001', 7, 'CIV-BRG-016', 3::numeric, 1, 'Before opening'),
  ('TPL-INF-CUL-BASE-001', 1, 'STR-RC-SLAB-001', 0.5::numeric, 1, null),
  ('TPL-INF-CUL-BASE-001', 2, 'STR-SUB-EXC-001', null::numeric, 1, 'Incl. stream / traffic diversion'),
  ('TPL-INF-CUL-BASE-001', 3, 'STR-SUB-FTG-001', null::numeric, 1, null),
  ('TPL-INF-CUL-BASE-001', 4, 'CIV-STR-001', null::numeric, 1, null),
  ('TPL-INF-CUL-BASE-001', 5, 'CIV-STR-002', null::numeric, 1, null),
  ('TPL-INF-CUL-BASE-001', 6, 'CIV-STR-003', null::numeric, 1, null),
  ('TPL-INF-CUL-WALL-001', 1, 'STR-RC-SLAB-001', 0.5::numeric, 1, null),
  ('TPL-INF-CUL-WALL-001', 2, 'CIV-STR-001', null::numeric, 1, null),
  ('TPL-INF-CUL-WALL-001', 3, 'CIV-STR-002', null::numeric, 1, null),
  ('TPL-INF-CUL-WALL-001', 4, 'CIV-STR-003', null::numeric, 1, null),
  ('TPL-INF-CUL-TOP-001', 1, 'STR-RC-SLAB-001', 0.5::numeric, 1, null),
  ('TPL-INF-CUL-TOP-001', 2, 'CIV-STR-002', null::numeric, 1, 'Falsework and soffit'),
  ('TPL-INF-CUL-TOP-001', 3, 'CIV-STR-001', null::numeric, 1, null),
  ('TPL-INF-CUL-TOP-001', 4, 'STR-RC-SLAB-006', 0.5::numeric, 1, 'Hold point'),
  ('TPL-INF-CUL-TOP-001', 5, 'CIV-STR-003', null::numeric, 1, null),
  ('TPL-INF-CUL-HW-001', 1, 'CIV-STR-004', null::numeric, 1, null),
  ('TPL-INF-CUL-HW-001', 2, 'STR-SUB-BSM-004', null::numeric, 1, 'Waterproofing & protection'),
  ('TPL-INF-CUL-HW-001', 3, 'STR-SUB-EXC-002', null::numeric, 1, null),
  ('TPL-INF-CUL-HW-001', 4, 'CIV-DRN-005', null::numeric, 1, 'Aprons and scour protection'),
  ('TPL-INF-CUL-HW-001', 5, 'CIV-RFN-001', null::numeric, 1, null),
  ('TPL-INF-CUL-HW-001', 6, 'CIV-PIP-008', null::numeric, 1, 'Road reinstatement over the structure'),
  ('TPL-INF-PS-WW-001', 1, 'STR-RC-SLAB-001', 0.5::numeric, 1, null),
  ('TPL-INF-PS-WW-001', 2, 'STR-SUB-BSM-003', null::numeric, 1, 'Sheet piling / caisson'),
  ('TPL-INF-PS-WW-001', 3, 'STR-SUB-BSM-002', 10::numeric, 1, 'Through excavation and base slab'),
  ('TPL-INF-PS-WW-001', 4, 'STR-SUB-BSM-001', null::numeric, 1, null),
  ('TPL-INF-PS-WW-001', 5, 'STR-SUB-FTG-001', null::numeric, 1, null),
  ('TPL-INF-PS-WW-001', 6, 'CIV-STR-001', null::numeric, 1, 'Base slab and walls'),
  ('TPL-INF-PS-WW-001', 7, 'CIV-STR-002', null::numeric, 1, null),
  ('TPL-INF-PS-WW-001', 8, 'CIV-STR-003', null::numeric, 1, 'Base, walls and roof slab in stages'),
  ('TPL-INF-PS-WW-001', 9, 'CIV-PIP-010', 3::numeric, 1, 'Water-tightness test'),
  ('TPL-INF-PS-WW-001', 10, 'STR-SUB-BSM-004', null::numeric, 1, null),
  ('TPL-INF-PS-WW-001', 11, 'STR-SUB-EXC-002', null::numeric, 1, null),
  ('TPL-INF-PS-WW-001', 12, 'CIV-FAC-001', null::numeric, 1, null)
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
  ('TPL-INF-BR-FDN-001', 2, 1, 'fs', 0),
  ('TPL-INF-BR-FDN-001', 3, 2, 'fs', 0),
  ('TPL-INF-BR-FDN-001', 4, 3, 'fs', 0),
  ('TPL-INF-BR-FDN-001', 5, 4, 'fs', 0),
  ('TPL-INF-BR-FDN-001', 6, 5, 'fs', 0),
  ('TPL-INF-BR-FDN-001', 7, 6, 'ss', 1),
  ('TPL-INF-BR-FDN-001', 8, 6, 'fs', 0),
  ('TPL-INF-BR-FDN-001', 8, 7, 'fs', 0),
  ('TPL-INF-BR-FDN-001', 9, 8, 'fs', 3),
  ('TPL-INF-BR-SUB-001', 2, 1, 'fs', 0),
  ('TPL-INF-BR-SUB-001', 3, 2, 'ss', 1),
  ('TPL-INF-BR-SUB-001', 4, 2, 'fs', 0),
  ('TPL-INF-BR-SUB-001', 4, 3, 'fs', 0),
  ('TPL-INF-BR-SUB-001', 5, 4, 'fs', 3),
  ('TPL-INF-BR-SUB-001', 6, 4, 'fs', 0),
  ('TPL-INF-BR-SUB-001', 7, 6, 'fs', 7),
  ('TPL-INF-BR-SUB-001', 8, 7, 'fs', 0),
  ('TPL-INF-BR-SPAN-001', 2, 1, 'fs', 0),
  ('TPL-INF-BR-SPAN-001', 3, 2, 'fs', 0),
  ('TPL-INF-BR-SPAN-001', 4, 3, 'fs', 0),
  ('TPL-INF-BR-SPAN-001', 5, 4, 'ss', 1),
  ('TPL-INF-BR-SPAN-001', 6, 5, 'fs', 0),
  ('TPL-INF-BR-SPAN-001', 6, 4, 'fs', 0),
  ('TPL-INF-BR-SPAN-001', 7, 6, 'fs', 0),
  ('TPL-INF-BR-SPAN-001', 8, 7, 'fs', 0),
  ('TPL-INF-BR-DECK-001', 2, 1, 'ss', 2),
  ('TPL-INF-BR-DECK-001', 3, 1, 'fs', 0),
  ('TPL-INF-BR-DECK-001', 4, 3, 'fs', 0),
  ('TPL-INF-BR-DECK-001', 4, 2, 'fs', 0),
  ('TPL-INF-BR-DECK-001', 5, 4, 'fs', 0),
  ('TPL-INF-BR-DECK-001', 6, 1, 'fs', 0),
  ('TPL-INF-BR-DECK-001', 7, 5, 'fs', 0),
  ('TPL-INF-BR-DECK-001', 7, 6, 'fs', 0),
  ('TPL-INF-CUL-BASE-001', 2, 1, 'fs', 0),
  ('TPL-INF-CUL-BASE-001', 3, 2, 'fs', 0),
  ('TPL-INF-CUL-BASE-001', 4, 3, 'fs', 0),
  ('TPL-INF-CUL-BASE-001', 5, 4, 'ss', 1),
  ('TPL-INF-CUL-BASE-001', 6, 4, 'fs', 0),
  ('TPL-INF-CUL-BASE-001', 6, 5, 'fs', 0),
  ('TPL-INF-CUL-WALL-001', 2, 1, 'fs', 0),
  ('TPL-INF-CUL-WALL-001', 3, 2, 'ss', 1),
  ('TPL-INF-CUL-WALL-001', 4, 2, 'fs', 0),
  ('TPL-INF-CUL-WALL-001', 4, 3, 'fs', 0),
  ('TPL-INF-CUL-TOP-001', 2, 1, 'fs', 0),
  ('TPL-INF-CUL-TOP-001', 3, 2, 'ss', 1),
  ('TPL-INF-CUL-TOP-001', 4, 3, 'fs', 0),
  ('TPL-INF-CUL-TOP-001', 4, 2, 'fs', 0),
  ('TPL-INF-CUL-TOP-001', 5, 4, 'fs', 0),
  ('TPL-INF-CUL-HW-001', 2, 1, 'fs', 0),
  ('TPL-INF-CUL-HW-001', 3, 2, 'fs', 0),
  ('TPL-INF-CUL-HW-001', 4, 1, 'fs', 0),
  ('TPL-INF-CUL-HW-001', 5, 3, 'fs', 0),
  ('TPL-INF-CUL-HW-001', 6, 3, 'fs', 0),
  ('TPL-INF-PS-WW-001', 2, 1, 'fs', 0),
  ('TPL-INF-PS-WW-001', 3, 2, 'ss', 3),
  ('TPL-INF-PS-WW-001', 4, 2, 'ss', 3),
  ('TPL-INF-PS-WW-001', 5, 4, 'fs', 0),
  ('TPL-INF-PS-WW-001', 6, 5, 'fs', 0),
  ('TPL-INF-PS-WW-001', 7, 6, 'ss', 2),
  ('TPL-INF-PS-WW-001', 8, 6, 'fs', 0),
  ('TPL-INF-PS-WW-001', 8, 7, 'fs', 0),
  ('TPL-INF-PS-WW-001', 9, 8, 'fs', 7),
  ('TPL-INF-PS-WW-001', 10, 9, 'fs', 0),
  ('TPL-INF-PS-WW-001', 11, 10, 'fs', 0),
  ('TPL-INF-PS-WW-001', 12, 9, 'fs', 0)
) as v(tcode, succ, pred, rel, lag)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join public.plan_act_template_items s on s.template_id = t.id and s.seq = v.succ
join public.plan_act_template_items p on p.template_id = t.id and p.seq = v.pred
where not exists (select 1 from public.plan_act_template_dependencies d where d.template_id = t.id and d.predecessor_item_id = p.id and d.successor_item_id = s.id);

create temp table _inf_master_map (task_name text primary key, master_code text not null) on commit drop;
insert into _inf_master_map values
  ('Clearing & Grubbing', 'CIV-EW-001'),
  ('Topsoil Stripping', 'CIV-EW-002'),
  ('Cut to Formation', 'CIV-EW-003'),
  ('Embankment Fill & Compaction', 'CIV-EW-004'),
  ('Embankment Fill & Ground Improvement', 'CIV-EW-004'),
  ('Ground Improvement / Soft Soil Treatment', 'CIV-EW-005'),
  ('Slope Protection', 'CIV-EW-006'),
  ('Subgrade Preparation & Testing', 'CIV-EW-007'),
  ('Sub-base Course', 'CIV-PAV-001'),
  ('Sub-base & Base Course', 'CIV-PAV-001'),
  ('Base Course', 'CIV-PAV-002'),
  ('Prime Coat', 'CIV-PAV-003'),
  ('Asphalt Binder Course', 'CIV-PAV-004'),
  ('Asphalt Wearing Course', 'CIV-PAV-005'),
  ('Asphalt Surfacing', 'CIV-PAV-005'),
  ('Kerbs & Medians', 'CIV-PAV-006'),
  ('Footpaths & Cycle Lanes', 'CIV-PAV-007'),
  ('Crash Barriers & Guardrails', 'CIV-RFN-001'),
  ('Guardrails', 'CIV-RFN-001'),
  ('Traffic Signs & Gantries', 'CIV-RFN-002'),
  ('Road Marking & Studs', 'CIV-RFN-003'),
  ('Road Marking', 'CIV-RFN-003'),
  ('Road Furniture & Markings', 'CIV-RFN-003'),
  ('Traffic Signal Installation', 'CIV-RFN-004'),
  ('Street Lighting Poles & Cabling', 'CIV-RFN-005'),
  ('Bridge Lighting', 'CIV-RFN-005'),
  ('Lighting & Signs on Structure', 'CIV-RFN-005'),
  ('Pipe Culverts', 'CIV-DRN-001'),
  ('Side Drains & U-Channels', 'CIV-DRN-002'),
  ('Drainage', 'CIV-DRN-002'),
  ('Catch Basins & Manholes', 'CIV-DRN-003'),
  ('Subsoil Drains', 'CIV-DRN-004'),
  ('Outfalls & Erosion Protection', 'CIV-DRN-005'),
  ('Scour Protection / Rip-rap', 'CIV-DRN-005'),
  ('Inlet / Outlet Aprons', 'CIV-DRN-005'),
  ('Base Slab Reinforcement', 'CIV-STR-001'),
  ('Wall Reinforcement', 'CIV-STR-001'),
  ('Top Slab Reinforcement', 'CIV-STR-001'),
  ('Base Slab Formwork', 'CIV-STR-002'),
  ('Wall Formwork', 'CIV-STR-002'),
  ('Top Slab Formwork', 'CIV-STR-002'),
  ('Roof Slab Formwork & Reinforcement', 'CIV-STR-002'),
  ('Base Slab Concrete Pour', 'CIV-STR-003'),
  ('Wall Concrete Pour', 'CIV-STR-003'),
  ('Top Slab Concrete Pour', 'CIV-STR-003'),
  ('Base Slab Concrete', 'CIV-STR-003'),
  ('Wall Concrete', 'CIV-STR-003'),
  ('Roof Slab Concrete Pour', 'CIV-STR-003'),
  ('Headwalls', 'CIV-STR-004'),
  ('Wingwalls', 'CIV-STR-004'),
  ('Wing Walls', 'CIV-STR-004'),
  ('Bored Pile Installation', 'CIV-BRG-001'),
  ('Pile Integrity & Load Tests', 'CIV-BRG-002'),
  ('Pile Cap Excavation & Pile Trimming', 'STR-SUB-EXC-001'),
  ('Pile Cap Blinding', 'STR-SUB-FTG-001'),
  ('Pile Cap Reinforcement', 'STR-RC-FDN-001'),
  ('Pile Cap Formwork & Embeds', 'STR-RC-FDN-002'),
  ('Pile Cap Concrete Pour', 'STR-RC-FDN-003'),
  ('Curing & Backfilling', 'STR-SUB-EXC-002'),
  ('Pier / Abutment Wall Reinforcement', 'CIV-BRG-004'),
  ('Pier / Abutment Formwork', 'CIV-BRG-005'),
  ('Pier / Abutment Concrete', 'CIV-BRG-006'),
  ('Crosshead Concrete Pour', 'CIV-BRG-007'),
  ('Abutment Backfill & Drainage', 'STR-SUB-EXC-002'),
  ('Bearing Installation', 'CIV-BRG-008'),
  ('Girder / Segment Erection', 'CIV-BRG-009'),
  ('Deck Formwork / Permanent Shutters', 'CIV-BRG-011'),
  ('Deck Slab Reinforcement', 'CIV-BRG-010'),
  ('Deck Slab Concrete Pour', 'CIV-BRG-012'),
  ('Expansion Joints', 'CIV-BRG-013'),
  ('Parapets / Barriers', 'CIV-BRG-014'),
  ('Deck Waterproofing', 'CIV-BRG-015'),
  ('Bridge Load Test', 'CIV-BRG-016'),
  ('Trench Excavation & Shoring', 'CIV-PIP-001'),
  ('Pipe Bedding', 'CIV-PIP-002'),
  ('Pipe Laying & Jointing', 'CIV-PIP-003'),
  ('Water Main Installation', 'CIV-PIP-003'),
  ('Sewer Main Installation', 'CIV-PIP-003'),
  ('Thrust Blocks & Valve Chambers', 'CIV-PIP-004'),
  ('Valves, Hydrants & Air Valves', 'CIV-PIP-005'),
  ('Service / House Connections', 'CIV-PIP-006'),
  ('Backfill & Compaction', 'STR-SUB-EXC-002'),
  ('Road Reinstatement', 'CIV-PIP-008'),
  ('Road Reinstatement over Structure', 'CIV-PIP-008'),
  ('HDD Road Crossings', 'CIV-PIP-009'),
  ('Pipe Jacking / Micro-tunnelling', 'CIV-PIP-009'),
  ('Pipeline Pressure Testing', 'CIV-PIP-010'),
  ('Utility Pressure & Leak Tests', 'CIV-PIP-010'),
  ('Power & Telecom Duct Banks', 'CIV-UTL-001'),
  ('Duct Bank Construction', 'CIV-UTL-001'),
  ('Utility Ducts on Bridge', 'CIV-UTL-001'),
  ('Cable Pulling', 'CIV-UTL-002'),
  ('Cable Jointing & Termination', 'CIV-UTL-003'),
  ('Fibre / Telemetry Cables', 'CIV-UTL-004'),
  ('Pump & Motor Installation', 'CIV-FAC-001'),
  ('Submersible Pumps', 'CIV-FAC-001'),
  ('Pipework & Valves', 'IND-MEP-003'),
  ('Pipework, Valves & Surge Vessels', 'IND-MEP-003'),
  ('Equipment Bases', 'IND-FND-001'),
  ('Sheet Piling / Caisson', 'STR-SUB-BSM-003'),
  ('Excavation', 'STR-SUB-BSM-001'),
  ('Excavation & Dewatering', 'STR-SUB-EXC-001'),
  ('Dewatering', 'STR-SUB-BSM-002'),
  ('Blinding', 'STR-SUB-FTG-001'),
  ('Bedding & Blinding', 'STR-SUB-FTG-001'),
  ('Waterproofing & Protection', 'STR-SUB-BSM-004'),
  ('Roof Waterproofing', 'ARC-RF-005'),
  ('Landscaping & Turfing', 'EXT-LND-001'),
  ('Fencing', 'EXT-FEN-001'),
  ('Setting Out & Survey', 'STR-RC-SLAB-001'),
  ('Pre-pour Inspection', 'STR-RC-SLAB-006'),
  ('Embedded Items', 'STR-RC-SLAB-003'),
  ('Column Reinforcement', 'STR-RC-COL-001'),
  ('Column Formwork', 'STR-RC-COL-002'),
  ('Column Concrete', 'STR-RC-COL-003'),
  ('Beam & Slab Formwork', 'STR-RC-SLAB-002'),
  ('Beam & Slab Reinforcement', 'STR-RC-SLAB-004'),
  ('Slab Concrete Pour', 'STR-RC-SLAB-007'),
  ('Curing & Formwork Stripping', 'STR-RC-SLAB-010'),
  ('Ground Slab', 'STR-SUB-SOG-003'),
  ('Blockwork', 'ARC-MAS-BLK-001'),
  ('Plastering', 'ARC-FIN-WAL-002'),
  ('Painting', 'ARC-FIN-WAL-004'),
  ('Ceiling', 'ARC-FIN-CLG-003'),
  ('Chemical-Resistant Floor Coating', 'IND-FLR-005'),
  ('MCC & VFD Installation', 'MEP-ELE-004'),
  ('Cabling & Termination', 'MEP-ELE-002'),
  ('Lighting & Small Power', 'MEP-ELE-003');

create or replace function pg_temp.link_inf_tasks(arr jsonb, sections boolean) returns jsonb
language sql stable as $f$
  select coalesce(jsonb_agg(
           case when coalesce(x->>'master_code', '') = '' and m.master_code is not null
                     and (not sections or (x->>'node_key') like '03%' or (x->>'node_key') like '04%')
                then x || jsonb_build_object('master_code', m.master_code) else x end order by o), '[]'::jsonb)
  from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) with ordinality e(x, o)
  left join _inf_master_map m on lower(m.task_name) = lower(btrim(x->>'task_name'))
$f$;

-- sections: only construction (03.*) and testing (04.*) activities; floor blocks: all
update public.wbs_templates w
   set content = jsonb_set(
         jsonb_set(w.content, '{sections,tasks}', pg_temp.link_inf_tasks(w.content->'sections'->'tasks', true)),
         '{floor_blocks}',
         coalesce((select jsonb_object_agg(b.key, b.value || jsonb_build_object('tasks', pg_temp.link_inf_tasks(b.value->'tasks', false)))
                     from jsonb_each(coalesce(w.content->'floor_blocks', '{}'::jsonb)) b), '{}'::jsonb))
 where w.template_category = 'infrastructure' and jsonb_typeof(w.content->'sections') = 'object';
