-- Activity Library: residential / villa content (Phases B + C of the "Activity Library by Sector"
-- plan; villa first because of PRJ-2026-005 Luxury Villa).
--
-- B. Masters for work a villa needs that the RC high-rise library did not have: substructure
--    (excavation, pad footings, ground beams, slab on grade, anti-termite), pitched roof, joinery,
--    pool and external works. Each quantity-driven master gets a DRAFT company norm (indicative
--    South-East Asian rates, 8 h day, skilled + helper crew), a quantity rule, a work group and,
--    where one fits, a default step template. Masters are tagged with sectors / building types
--    (20261021000005). New work groups: RF Roofing, JN Joinery & Fit-out, EX External Works.
-- C. Three DRAFT activity templates for a villa / landed house: ground floor (substructure + frame
--    + finishes), upper floor, pitched roof. The Planning Manager reviews and activates them in
--    Activity Library > Templates before Generate offers them.
--
-- Idempotent: every insert skips what exists; templates get items / links only while they have none.

do $seed$
declare
  r record;
  d_id uuid; c_id uuid; f_id uuid;
begin
  -- hierarchy --------------------------------------------------------------------------------
  insert into public.plan_act_domains(code, name, sort_order) values ('EXT', 'External Works', 4)
    on conflict (code) do nothing;

  for r in select * from (values
      ('STR', 'SUB', 'Substructure',        'EXC',  'Excavation & Backfill', 1),
      ('STR', 'SUB', 'Substructure',        'FTG',  'Footings',              2),
      ('STR', 'SUB', 'Substructure',        'GB',   'Ground Beams',          3),
      ('STR', 'SUB', 'Substructure',        'SOG',  'Slab on Grade',         4),
      ('ARC', 'RF',  'Roofing',             'RF',   'Roof',                  1),
      ('ARC', 'JNR', 'Joinery & Fit-out',   'JNR',  'Joinery',               1),
      ('EXT', 'EXT', 'External Works',      'POOL', 'Swimming Pool',         1),
      ('EXT', 'EXT', 'External Works',      'PAV',  'Paving & Driveways',    2),
      ('EXT', 'EXT', 'External Works',      'LND',  'Landscaping',           3),
      ('EXT', 'EXT', 'External Works',      'FEN',  'Boundary & Fencing',    4),
      ('EXT', 'EXT', 'External Works',      'DRN',  'External Drainage',     5),
      ('EXT', 'EXT', 'External Works',      'SEP',  'Septic & Sewer',        6)
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
    ('RF', 'Roofing',             'Roof structure, covering, gutters and roof waterproofing', 65),
    ('JN', 'Joinery & Fit-out',   'Kitchens, wardrobes, vanities and railings',              75),
    ('EX', 'External Works',      'Pool, paving, landscaping, boundary, external drainage',  95)
  on conflict (code) do nothing;

  -- masters ------------------------------------------------------------------------------------
  -- dom, cat, fam, code, name, unit, discipline, work type, work group, duration basis, sectors, building types
  create temp table _rm(dom text, cat text, fam text, code text, name text, unit text, disc text, wtype text,
                        wg text, basis text, sectors text[], btypes text[]) on commit drop;
  insert into _rm values
    ('STR','SUB','EXC','STR-SUB-EXC-001','Excavation for Footings & Ground Beams','m³','STR','Earthworks','EW','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','EXC','STR-SUB-EXC-002','Backfill & Compaction','m³','STR','Earthworks','EW','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','EXC','STR-SUB-EXC-003','Anti-Termite Treatment','m²','STR','Treatment','EW','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','FTG','STR-SUB-FTG-001','Blinding Concrete','m²','STR','Concrete Works','FD','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','FTG','STR-SUB-FTG-002','Pad Footing Reinforcement','ton','STR','Reinforcement','FD','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','FTG','STR-SUB-FTG-003','Pad Footing Formwork','m²','STR','Formwork','FD','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','FTG','STR-SUB-FTG-004','Pad Footing Concrete Casting','m³','STR','Concrete Works','FD','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','GB','STR-SUB-GB-001','Ground Beam Reinforcement','ton','STR','Reinforcement','FD','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','GB','STR-SUB-GB-002','Ground Beam Formwork','m²','STR','Formwork','FD','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','GB','STR-SUB-GB-003','Ground Beam Concrete Casting','m³','STR','Concrete Works','FD','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','SOG','STR-SUB-SOG-001','Hardcore, Sand Bed & DPM','m²','STR','Sub-base','FD','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','SOG','STR-SUB-SOG-002','Slab on Grade Mesh / Reinforcement','m²','STR','Reinforcement','FD','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('STR','SUB','SOG','STR-SUB-SOG-003','Slab on Grade Concrete Casting','m³','STR','Concrete Works','FD','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('ARC','RF','RF','ARC-RF-001','Roof Truss Fabrication & Erection','m²','ARC','Roofing','RF','quantity','{residential,commercial,institutional}','{luxury_villa,mansion_estate,private_residence,standard_villa,townhouse,residential_development}'),
    ('ARC','RF','RF','ARC-RF-002','Roof Battens & Underlay','m²','ARC','Roofing','RF','quantity','{residential,commercial,institutional}','{luxury_villa,mansion_estate,private_residence,standard_villa,townhouse,residential_development}'),
    ('ARC','RF','RF','ARC-RF-003','Roof Tiling / Sheeting','m²','ARC','Roofing','RF','quantity','{residential,commercial,institutional}','{luxury_villa,mansion_estate,private_residence,standard_villa,townhouse,residential_development}'),
    ('ARC','RF','RF','ARC-RF-004','Gutters & Downpipes','m','ARC','Roofing','RF','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('ARC','RF','RF','ARC-RF-005','Flat Roof Waterproofing','m²','ARC','Waterproofing','RF','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('ARC','JNR','JNR','ARC-JNR-001','Kitchen Cabinets Installation','m','ARC','Joinery','JN','quantity','{residential,commercial}','{luxury_villa,mansion_estate,private_residence,standard_villa,townhouse,apartment,condominium,residential_tower,residential_development}'),
    ('ARC','JNR','JNR','ARC-JNR-002','Built-in Wardrobes Installation','m','ARC','Joinery','JN','quantity','{residential,commercial}','{luxury_villa,mansion_estate,private_residence,standard_villa,townhouse,apartment,condominium,residential_tower,residential_development,hotel}'),
    ('ARC','JNR','JNR','ARC-JNR-003','Staircase Balustrade & Railings','m','ARC','Metalwork','JN','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('ARC','JNR','JNR','ARC-JNR-004','Vanity Units & Bathroom Accessories','nos','ARC','Joinery','JN','quantity','{residential,commercial}','{luxury_villa,mansion_estate,private_residence,standard_villa,townhouse,apartment,condominium,residential_tower,residential_development,hotel}'),
    ('EXT','EXT','POOL','EXT-POOL-001','Swimming Pool Shell (Excavation, Rebar, Concrete)','m²','EXT','Pool','EX','quantity','{residential,commercial}','{luxury_villa,mansion_estate,private_residence,standard_villa,condominium,residential_tower,residential_development,hotel}'),
    ('EXT','EXT','POOL','EXT-POOL-002','Pool Waterproofing, Tiling & Coping','m²','EXT','Pool','EX','quantity','{residential,commercial}','{luxury_villa,mansion_estate,private_residence,standard_villa,condominium,residential_tower,residential_development,hotel}'),
    ('EXT','EXT','PAV','EXT-PAV-001','Driveway & Hardscape Paving','m²','EXT','Paving','EX','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('EXT','EXT','LND','EXT-LND-001','Landscaping (Softscape)','m²','EXT','Landscaping','EX','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('EXT','EXT','FEN','EXT-FEN-001','Boundary Wall & Gate','m','EXT','Masonry','EX','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('EXT','EXT','DRN','EXT-DRN-001','External Drainage & Manholes','m','EXT','Drainage','EX','quantity','{residential,commercial,industrial,institutional}','{}'),
    ('EXT','EXT','SEP','EXT-SEP-001','Septic Tank / Sewer Connection','lot','EXT','Drainage','EX','fixed','{residential,institutional}','{luxury_villa,mansion_estate,private_residence,standard_villa,townhouse,residential_development,school,clinic,religious_building}');

  for r in select * from _rm loop
    select fa.id, ca.id, dm.id into f_id, c_id, d_id
      from public.plan_act_families fa
      join public.plan_act_categories ca on ca.id = fa.category_id
      join public.plan_act_domains dm on dm.id = ca.domain_id
     where dm.code = r.dom and ca.code = r.cat and fa.code = r.fam;
    insert into public.plan_act_masters(code, name, domain_id, category_id, family_id, discipline, work_type, default_unit,
        status, version, owner, source, effective_date, sectors, building_types, duration_basis, default_work_group)
    values (r.code, r.name, d_id, c_id, f_id, r.disc, r.wtype, r.unit, 'active', 1, 'Planning Standards',
            'Company Standard (residential seed 2026-10-21)', date '2026-10-21', r.sectors, r.btypes, r.basis, r.wg)
    on conflict (code, version) do nothing;
  end loop;
end
$seed$;

-- norms (company library, draft): labour constant = crew size × 8 h / output per crew-day ---------
insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select 'NRM-' || m.code, v.name, v.trade, m.discipline, m.code, m.default_unit,
  round((v.skilled + v.helpers) * 8.0 / v.output, 4), 8, 100, 'manual',
  'ASSUMPTION: indicative rate ' || v.output || ' ' || m.default_unit || '/crew-day, crew ' || v.skilled || ' ' || v.skilled_role
    || coalesce(' + ' || nullif(v.helpers, 0) || ' ' || v.helper_role, '') || '. ' || v.note || ' Calibrate on the first house before approving.',
  'draft', 1, v.output, m.id
from (values
  ('STR-SUB-EXC-001', 'Excavation for footings & ground beams', 'Earthworks', 40,  1, 'Excavator Operator', 2, 'General Worker', 'Mini-excavator, trim by hand, spoil to stockpile.'),
  ('STR-SUB-EXC-002', 'Backfill & compaction in layers',       'Earthworks', 50,  1, 'Compactor Operator', 3, 'General Worker', '200 mm layers, plate / roller compaction, density tests.'),
  ('STR-SUB-EXC-003', 'Anti-termite soil treatment',           'Treatment', 300,  1, 'Pest Control Applicator', 1, 'General Worker', 'Horizontal and vertical barrier, certificate by specialist.'),
  ('STR-SUB-FTG-001', 'Blinding concrete 50-75 mm',            'Concrete',   80,  2, 'Mason', 2, 'General Worker', 'Lean concrete under footings and beams.'),
  ('STR-SUB-FTG-002', 'Pad footing reinforcement',             'Reinforcement', 1.0, 3, 'Steel Fixer', 1, 'General Worker', 'Cut, bend and fix incl. starter bars.'),
  ('STR-SUB-FTG-003', 'Pad footing formwork',                  'Formwork',   25,  2, 'Carpenter', 1, 'General Worker', 'Timber / plywood side forms.'),
  ('STR-SUB-FTG-004', 'Pad footing concrete casting',          'Concrete',   20,  4, 'Concrete Worker', 2, 'General Worker', 'Ready-mix by chute or pump, vibrated.'),
  ('STR-SUB-GB-001',  'Ground beam reinforcement',             'Reinforcement', 0.8, 3, 'Steel Fixer', 1, 'General Worker', 'Cages incl. stirrups and laps.'),
  ('STR-SUB-GB-002',  'Ground beam formwork',                  'Formwork',   20,  2, 'Carpenter', 1, 'General Worker', 'Side forms on blinding.'),
  ('STR-SUB-GB-003',  'Ground beam concrete casting',          'Concrete',   20,  4, 'Concrete Worker', 2, 'General Worker', 'Cast in one pour with footings where possible.'),
  ('STR-SUB-SOG-001', 'Hardcore, sand bed & DPM',              'Sub-base',  120,  1, 'Mason', 3, 'General Worker', 'Compacted hardcore 150 mm, sand blinding, polythene DPM.'),
  ('STR-SUB-SOG-002', 'Slab on grade mesh / reinforcement',    'Reinforcement', 200, 2, 'Steel Fixer', 1, 'General Worker', 'BRC mesh on spacers incl. laps.'),
  ('STR-SUB-SOG-003', 'Slab on grade concrete casting',        'Concrete',   30,  4, 'Concrete Worker', 2, 'General Worker', 'Ready-mix, screeded and floated.'),
  ('ARC-RF-001',      'Roof truss fabrication & erection',     'Roofing',    60,  3, 'Roof Carpenter / Steel Fixer', 2, 'General Worker', 'Light steel or timber trusses, per m² of roof slope area.'),
  ('ARC-RF-002',      'Roof battens & underlay',               'Roofing',   120,  2, 'Roofer', 1, 'General Worker', 'Sarking / underlay and battens at tile gauge.'),
  ('ARC-RF-003',      'Roof tiling / sheeting',                'Roofing',    40,  2, 'Roofer', 2, 'General Worker', 'Concrete / clay tiles incl. cutting; sheeting is faster.'),
  ('ARC-RF-004',      'Gutters & downpipes',                   'Roofing',    30,  1, 'Roofer', 1, 'General Worker', 'Brackets, gutter, outlets and downpipes.'),
  ('ARC-RF-005',      'Flat roof waterproofing (torch-on)',    'Waterproofing', 80, 2, 'Waterproofing Applicator', 2, 'General Worker', 'Primer + 1 layer torch-on, laps and upstands.'),
  ('ARC-JNR-001',     'Kitchen cabinets (base + wall units)',  'Joinery',     3,  2, 'Joiner', 1, 'General Worker', 'Per metre run incl. countertop fixing.'),
  ('ARC-JNR-002',     'Built-in wardrobes',                    'Joinery',     3,  2, 'Joiner', 1, 'General Worker', 'Per metre run, carcass, doors and fittings.'),
  ('ARC-JNR-003',     'Staircase balustrade & railings',       'Metalwork',  10,  2, 'Steel Fabricator', 1, 'General Worker', 'Prefabricated sections, posts and handrail.'),
  ('ARC-JNR-004',     'Vanity unit & bathroom accessories',    'Joinery',     2,  1, 'Joiner', 1, 'General Worker', 'Per bathroom: vanity, mirror, accessories, silicone.'),
  ('EXT-POOL-001',    'Swimming pool shell',                   'Pool',        3,  4, 'Mason / Steel Fixer', 2, 'General Worker', 'Per m² of water surface: excavation, rebar, shotcrete / cast shell.'),
  ('EXT-POOL-002',    'Pool waterproofing, tiling & coping',   'Pool',       12,  2, 'Tiler', 1, 'General Worker', 'Per m² of tiled surface (floor + walls).'),
  ('EXT-PAV-001',     'Driveway & hardscape paving',           'Paving',     30,  2, 'Paver', 2, 'General Worker', 'Interlocking pavers / stone on prepared base.'),
  ('EXT-LND-001',     'Landscaping softscape',                 'Landscaping', 80, 1, 'Gardener', 3, 'General Worker', 'Topsoil, planting, turfing.'),
  ('EXT-FEN-001',     'Boundary wall & gate',                  'Masonry',     6,  2, 'Mason', 2, 'General Worker', 'Footing, block wall 1.8-2.4 m, plaster; gate per opening.'),
  ('EXT-DRN-001',     'External drainage & manholes',          'Drainage',   15,  1, 'Plumber', 3, 'General Worker', 'Trench, pipe 100-150 mm, manholes at turns, backfill.')
) as v(mcode, name, trade, output, skilled, skilled_role, helpers, helper_role, note)
join public.plan_act_masters m on m.code = v.mcode and m.version = 1
where not exists (select 1 from public.plan_productivity_norms n where n.project_id is null and n.code = 'NRM-' || m.code);

-- quantity rules ------------------------------------------------------------------------------------
insert into public.plan_act_quantity_rules(master_id, name, metric_code, unit, provider_priority, note)
select m.id, v.rule_name, v.metric, m.default_unit, v.providers, v.note
from (values
  ('STR-SUB-EXC-001', 'Excavation volume',          'excavation_volume',       array['bim','boq','manual'], null),
  ('STR-SUB-EXC-002', 'Backfill volume',            'backfill_volume',         array['bim','boq','manual'], null),
  ('STR-SUB-EXC-003', 'Treated area',               'termite_area',            array['boq','manual','calculated'], 'Calculated fallback = ground floor GFA (footprint approximation).'),
  ('STR-SUB-FTG-001', 'Blinding area',              'blinding_area',           array['bim','boq','manual'], null),
  ('STR-SUB-FTG-002', 'Footing reinforcement',      'footing_rebar',           array['bim','boq','manual'], null),
  ('STR-SUB-FTG-003', 'Footing formwork',           'footing_formwork',        array['bim','boq','manual'], null),
  ('STR-SUB-FTG-004', 'Footing concrete',           'footing_volume',          array['bim','boq','manual'], null),
  ('STR-SUB-GB-001',  'Ground beam reinforcement',  'groundbeam_rebar',        array['bim','boq','manual'], null),
  ('STR-SUB-GB-002',  'Ground beam formwork',       'groundbeam_formwork',     array['bim','boq','manual'], null),
  ('STR-SUB-GB-003',  'Ground beam concrete',       'groundbeam_volume',       array['bim','boq','manual'], null),
  ('STR-SUB-SOG-001', 'Slab on grade area',         'sog_area',                array['bim','boq','manual','calculated'], 'Calculated fallback = ground floor GFA (approximation: ignores external slabs).'),
  ('STR-SUB-SOG-002', 'Slab on grade area',         'sog_area',                array['bim','boq','manual','calculated'], 'Calculated fallback = ground floor GFA (approximation: ignores external slabs).'),
  ('STR-SUB-SOG-003', 'Slab on grade concrete',     'sog_volume',              array['bim','boq','manual'], null),
  ('ARC-RF-001',      'Roof slope area',            'roof_area',               array['bim','boq','manual'], null),
  ('ARC-RF-002',      'Roof slope area',            'roof_area',               array['bim','boq','manual'], null),
  ('ARC-RF-003',      'Roof slope area',            'roof_area',               array['bim','boq','manual'], null),
  ('ARC-RF-004',      'Gutter length',              'gutter_length',           array['bim','boq','manual'], null),
  ('ARC-RF-005',      'Flat roof area',             'roof_waterproofing_area', array['bim','boq','manual'], null),
  ('ARC-JNR-001',     'Kitchen run',                'kitchen_run_length',      array['boq','manual'], null),
  ('ARC-JNR-002',     'Wardrobe run',               'wardrobe_run_length',     array['boq','manual'], null),
  ('ARC-JNR-003',     'Balustrade length',          'balustrade_length',       array['bim','boq','manual'], null),
  ('ARC-JNR-004',     'Bathrooms',                  'bathroom_count',          array['bim','boq','manual'], null),
  ('EXT-POOL-001',    'Pool water area',            'pool_area',               array['boq','manual'], null),
  ('EXT-POOL-002',    'Pool tiled area',            'pool_tile_area',          array['boq','manual'], null),
  ('EXT-PAV-001',     'Paved area',                 'paving_area',             array['boq','manual'], null),
  ('EXT-LND-001',     'Landscaped area',            'landscape_area',          array['boq','manual'], null),
  ('EXT-FEN-001',     'Boundary length',            'boundary_length',         array['boq','manual'], null),
  ('EXT-DRN-001',     'Drain length',               'ext_drain_length',        array['boq','manual'], null)
) as v(mcode, rule_name, metric, providers, note)
join public.plan_act_masters m on m.code = v.mcode and m.version = 1
on conflict (master_id, name) do nothing;

-- default step templates (by name; only where the master has none) ----------------------------------
update public.plan_act_masters m
   set default_step_template_id = s.id
  from (values
    ('STR-SUB-EXC-003', 'Anti-Termite Treatment'),
    ('STR-SUB-GB-003',  'Ground Beam'),
    ('STR-SUB-SOG-003', 'Slab on Grade / Ground Slab'),
    ('ARC-RF-001',      'Pitched Roof – Truss, Battens & Roof Tiling'),
    ('ARC-JNR-001',     'Kitchen Cabinets & Wardrobes'),
    ('ARC-JNR-002',     'Kitchen Cabinets & Wardrobes'),
    ('ARC-JNR-003',     'Balustrade & Railings'),
    ('EXT-POOL-001',    'Swimming Pool (Residential)'),
    ('EXT-LND-001',     'Landscaping'),
    ('EXT-FEN-001',     'Permanent Fence / Boundary'),
    ('EXT-DRN-001',     'External Drainage')
  ) as v(mcode, step_name)
  join public.activity_step_template_master s on s.template_name = v.step_name and s.is_active
 where m.code = v.mcode and m.default_step_template_id is null;

-- C. villa activity templates -----------------------------------------------------------------------
insert into public.plan_act_templates (code, name, description, domain_id, status, version, applies_to_level_types, owner,
  sectors, building_types, inter_level_from_seq, inter_level_to_seq, inter_level_relation, inter_level_lag_days)
select v.code, v.name, v.descr, d.id, 'draft', 1, v.levels, 'Planning Manager',
  array['residential'], array['luxury_villa','mansion_estate','private_residence','standard_villa','townhouse','residential_development'],
  v.from_seq, v.to_seq, 'fs', v.lag
from (values
  ('TPL-RES-VILLA-GF-001', 'Villa – Ground Floor (Substructure, Frame, Finishes)',
   'Excavation, pad footings and ground beams, slab on grade, ground floor columns and first floor slab, MEP and finishes. The next level''s setting out starts 1 day after the slab pour.',
   array['ground'], 26, 1, 1),
  ('TPL-RES-VILLA-UF-001', 'Villa – Upper Floor (Frame, Finishes)',
   'Columns and the slab above, MEP first fix, finishes, wardrobes and railings, MEP second fix. The next level''s setting out starts 1 day after the slab pour.',
   array['typical'], 13, 1, 1),
  ('TPL-RES-VILLA-RF-001', 'Villa – Pitched Roof',
   'Roof beams / stub columns, trusses, battens and underlay, tiles, gutters and downpipes.',
   array['roof'], null, null, 0)
) as v(code, name, descr, levels, from_seq, to_seq, lag)
cross join public.plan_act_domains d
where d.code = 'STR' and not exists (select 1 from public.plan_act_templates t where t.code = v.code);

-- items: template, seq, master, fixed days (null = from quantity), crews, note
insert into public.plan_act_template_items (template_id, seq, master_id, scope, duration_days_override, is_milestone, note, crews)
select t.id, v.seq, m.id, 'floor', v.fixed_days, false, v.note, v.crews
from (values
  -- ground floor
  ('TPL-RES-VILLA-GF-001',  1, 'STR-RC-SLAB-001', 0.5::numeric, 1, 'Setting out of grid and footings'),
  ('TPL-RES-VILLA-GF-001',  2, 'STR-SUB-EXC-001', null, 1, null),
  ('TPL-RES-VILLA-GF-001',  3, 'STR-SUB-FTG-001', null, 1, null),
  ('TPL-RES-VILLA-GF-001',  4, 'STR-SUB-FTG-002', null, 1, 'Incl. column starter bars'),
  ('TPL-RES-VILLA-GF-001',  5, 'STR-SUB-FTG-003', null, 1, null),
  ('TPL-RES-VILLA-GF-001',  6, 'STR-SUB-FTG-004', null, 1, null),
  ('TPL-RES-VILLA-GF-001',  7, 'STR-SUB-GB-002',  null, 1, null),
  ('TPL-RES-VILLA-GF-001',  8, 'STR-SUB-GB-001',  null, 1, null),
  ('TPL-RES-VILLA-GF-001',  9, 'STR-SUB-GB-003',  null, 1, null),
  ('TPL-RES-VILLA-GF-001', 10, 'STR-SUB-EXC-002', null, 1, 'After ground beams are stripped'),
  ('TPL-RES-VILLA-GF-001', 11, 'STR-SUB-EXC-003', null, 1, 'Before hardcore / DPM'),
  ('TPL-RES-VILLA-GF-001', 12, 'STR-SUB-SOG-001', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 13, 'STR-SUB-SOG-002', null, 1, 'With underground drainage sleeves'),
  ('TPL-RES-VILLA-GF-001', 14, 'STR-SUB-SOG-003', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 15, 'STR-RC-COL-001',  null, 1, null),
  ('TPL-RES-VILLA-GF-001', 16, 'STR-RC-COL-002',  null, 1, null),
  ('TPL-RES-VILLA-GF-001', 17, 'STR-RC-COL-003',  null, 1, null),
  ('TPL-RES-VILLA-GF-001', 18, 'STR-RC-SLAB-002', null, 1, 'First floor slab'),
  ('TPL-RES-VILLA-GF-001', 19, 'STR-RC-BEAM-002', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 20, 'STR-RC-BEAM-001', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 21, 'STR-RC-STAIR-002', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 22, 'STR-RC-SLAB-004', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 23, 'STR-RC-SLAB-003', 1::numeric, 1, 'Conduits / sleeves in the slab'),
  ('TPL-RES-VILLA-GF-001', 24, 'STR-RC-SLAB-005', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 25, 'STR-RC-SLAB-006', 0.5::numeric, 1, 'Hold point'),
  ('TPL-RES-VILLA-GF-001', 26, 'STR-RC-SLAB-007', null, 1, 'Drives the next level''s setting out'),
  ('TPL-RES-VILLA-GF-001', 27, 'STR-RC-SLAB-010', null, 1, 'Strip after curing'),
  ('TPL-RES-VILLA-GF-001', 28, 'MEP-ELE-001',     null, 1, null),
  ('TPL-RES-VILLA-GF-001', 29, 'MEP-PLB-001',     null, 1, null),
  ('TPL-RES-VILLA-GF-001', 30, 'MEP-PLB-003',     null, 1, null),
  ('TPL-RES-VILLA-GF-001', 31, 'ARC-MAS-BLK-001', null, 2, null),
  ('TPL-RES-VILLA-GF-001', 32, 'ARC-FIN-WAL-002', null, 2, null),
  ('TPL-RES-VILLA-GF-001', 33, 'ARC-FIN-FLR-003', null, 1, 'Wet areas'),
  ('TPL-RES-VILLA-GF-001', 34, 'ARC-FIN-FLR-002', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 35, 'ARC-FIN-WAL-003', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 36, 'ARC-FIN-FLR-004', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 37, 'ARC-FIN-CLG-003', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 38, 'ARC-DW-001',      null, 1, null),
  ('TPL-RES-VILLA-GF-001', 39, 'ARC-DW-003',      null, 1, null),
  ('TPL-RES-VILLA-GF-001', 40, 'ARC-FIN-WAL-004', null, 1, null),
  ('TPL-RES-VILLA-GF-001', 41, 'MEP-ELE-003',     null, 1, null),
  ('TPL-RES-VILLA-GF-001', 42, 'MEP-ELE-006',     null, 1, null),
  ('TPL-RES-VILLA-GF-001', 43, 'MEP-ELE-005',     null, 1, null),
  ('TPL-RES-VILLA-GF-001', 44, 'MEP-PLB-004',     null, 1, null),
  ('TPL-RES-VILLA-GF-001', 45, 'ARC-JNR-001',     null, 1, null),
  ('TPL-RES-VILLA-GF-001', 46, 'ARC-JNR-004',     null, 1, null),
  ('TPL-RES-VILLA-GF-001', 47, 'ARC-DW-002',      null, 1, 'Door leaves last'),
  -- upper floor
  ('TPL-RES-VILLA-UF-001',  1, 'STR-RC-SLAB-001', 0.5::numeric, 1, 'Setting out from the floor below'),
  ('TPL-RES-VILLA-UF-001',  2, 'STR-RC-COL-001',  null, 1, null),
  ('TPL-RES-VILLA-UF-001',  3, 'STR-RC-COL-002',  null, 1, null),
  ('TPL-RES-VILLA-UF-001',  4, 'STR-RC-COL-003',  null, 1, null),
  ('TPL-RES-VILLA-UF-001',  5, 'STR-RC-SLAB-002', null, 1, 'Slab above (roof slab / ring beam level)'),
  ('TPL-RES-VILLA-UF-001',  6, 'STR-RC-BEAM-002', null, 1, null),
  ('TPL-RES-VILLA-UF-001',  7, 'STR-RC-BEAM-001', null, 1, null),
  ('TPL-RES-VILLA-UF-001',  8, 'STR-RC-SLAB-004', null, 1, null),
  ('TPL-RES-VILLA-UF-001',  9, 'STR-RC-SLAB-003', 1::numeric, 1, null),
  ('TPL-RES-VILLA-UF-001', 10, 'STR-RC-SLAB-005', null, 1, null),
  ('TPL-RES-VILLA-UF-001', 11, 'STR-RC-STAIR-003', null, 1, 'Stair flight cast with the slab'),
  ('TPL-RES-VILLA-UF-001', 12, 'STR-RC-SLAB-006', 0.5::numeric, 1, 'Hold point'),
  ('TPL-RES-VILLA-UF-001', 13, 'STR-RC-SLAB-007', null, 1, 'Drives the next level''s setting out'),
  ('TPL-RES-VILLA-UF-001', 14, 'STR-RC-SLAB-010', null, 1, null),
  ('TPL-RES-VILLA-UF-001', 15, 'MEP-ELE-001',     null, 1, null),
  ('TPL-RES-VILLA-UF-001', 16, 'MEP-PLB-001',     null, 1, null),
  ('TPL-RES-VILLA-UF-001', 17, 'MEP-PLB-003',     null, 1, null),
  ('TPL-RES-VILLA-UF-001', 18, 'ARC-MAS-BLK-001', null, 2, null),
  ('TPL-RES-VILLA-UF-001', 19, 'ARC-FIN-WAL-002', null, 2, null),
  ('TPL-RES-VILLA-UF-001', 20, 'ARC-FIN-FLR-003', null, 1, 'Bathrooms and balconies'),
  ('TPL-RES-VILLA-UF-001', 21, 'ARC-FIN-FLR-002', null, 1, null),
  ('TPL-RES-VILLA-UF-001', 22, 'ARC-FIN-WAL-003', null, 1, null),
  ('TPL-RES-VILLA-UF-001', 23, 'ARC-FIN-FLR-004', null, 1, 'Or timber flooring in bedrooms'),
  ('TPL-RES-VILLA-UF-001', 24, 'ARC-FIN-CLG-003', null, 1, null),
  ('TPL-RES-VILLA-UF-001', 25, 'ARC-DW-001',      null, 1, null),
  ('TPL-RES-VILLA-UF-001', 26, 'ARC-DW-003',      null, 1, null),
  ('TPL-RES-VILLA-UF-001', 27, 'ARC-JNR-003',     null, 1, 'Stair and balcony railings'),
  ('TPL-RES-VILLA-UF-001', 28, 'ARC-FIN-WAL-004', null, 1, null),
  ('TPL-RES-VILLA-UF-001', 29, 'MEP-ELE-003',     null, 1, null),
  ('TPL-RES-VILLA-UF-001', 30, 'MEP-ELE-006',     null, 1, null),
  ('TPL-RES-VILLA-UF-001', 31, 'MEP-ELE-005',     null, 1, null),
  ('TPL-RES-VILLA-UF-001', 32, 'MEP-PLB-004',     null, 1, null),
  ('TPL-RES-VILLA-UF-001', 33, 'ARC-JNR-002',     null, 1, null),
  ('TPL-RES-VILLA-UF-001', 34, 'ARC-JNR-004',     null, 1, null),
  ('TPL-RES-VILLA-UF-001', 35, 'ARC-DW-002',      null, 1, 'Door leaves last'),
  -- pitched roof
  ('TPL-RES-VILLA-RF-001',  1, 'STR-RC-SLAB-001', 0.5::numeric, 1, 'Wall plate / truss setting out'),
  ('TPL-RES-VILLA-RF-001',  2, 'STR-RC-BEAM-002', null, 1, 'Roof ring beam / stub columns'),
  ('TPL-RES-VILLA-RF-001',  3, 'STR-RC-BEAM-001', null, 1, null),
  ('TPL-RES-VILLA-RF-001',  4, 'STR-RC-BEAM-003', null, 1, null),
  ('TPL-RES-VILLA-RF-001',  5, 'ARC-RF-001',      null, 1, 'Starts after the ring beam has cured'),
  ('TPL-RES-VILLA-RF-001',  6, 'ARC-RF-002',      null, 1, null),
  ('TPL-RES-VILLA-RF-001',  7, 'ARC-RF-003',      null, 1, null),
  ('TPL-RES-VILLA-RF-001',  8, 'ARC-RF-004',      null, 1, null)
) as v(tcode, seq, master_code, fixed_days, crews, note)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join lateral (
  select mm.id from public.plan_act_masters mm
   where mm.code = v.master_code and mm.status in ('active', 'approved', 'under_review', 'draft')
   order by (mm.status = 'active') desc, mm.version desc limit 1
) m on true
where not exists (select 1 from public.plan_act_template_items i where i.template_id = t.id);

-- links: template, successor seq, predecessor seq, relation, lag (working days)
insert into public.plan_act_template_dependencies (template_id, predecessor_item_id, successor_item_id, relation, lag_days, is_optional)
select t.id, p.id, s.id, v.rel, v.lag, false
from (values
  -- ground floor: substructure
  ('TPL-RES-VILLA-GF-001',  2,  1,'fs',0), ('TPL-RES-VILLA-GF-001',  3,  2,'fs',0), ('TPL-RES-VILLA-GF-001',  4,  3,'fs',0),
  ('TPL-RES-VILLA-GF-001',  5,  4,'fs',0), ('TPL-RES-VILLA-GF-001',  6,  5,'fs',0), ('TPL-RES-VILLA-GF-001',  7,  6,'fs',1),
  ('TPL-RES-VILLA-GF-001',  8,  7,'ss',0), ('TPL-RES-VILLA-GF-001',  9,  8,'fs',0), ('TPL-RES-VILLA-GF-001', 10,  9,'fs',2),
  ('TPL-RES-VILLA-GF-001', 11, 10,'fs',0), ('TPL-RES-VILLA-GF-001', 12, 11,'fs',0), ('TPL-RES-VILLA-GF-001', 13, 12,'fs',0),
  ('TPL-RES-VILLA-GF-001', 14, 13,'fs',0),
  -- ground floor: frame
  ('TPL-RES-VILLA-GF-001', 15,  9,'fs',1), ('TPL-RES-VILLA-GF-001', 16, 15,'fs',0), ('TPL-RES-VILLA-GF-001', 17, 16,'fs',0),
  ('TPL-RES-VILLA-GF-001', 18, 17,'fs',1), ('TPL-RES-VILLA-GF-001', 18, 14,'fs',0), ('TPL-RES-VILLA-GF-001', 19, 18,'ss',0),
  ('TPL-RES-VILLA-GF-001', 20, 19,'fs',0), ('TPL-RES-VILLA-GF-001', 21, 17,'fs',0), ('TPL-RES-VILLA-GF-001', 22, 18,'fs',0),
  ('TPL-RES-VILLA-GF-001', 23, 22,'ss',0), ('TPL-RES-VILLA-GF-001', 24, 22,'fs',0), ('TPL-RES-VILLA-GF-001', 24, 23,'fs',0),
  ('TPL-RES-VILLA-GF-001', 25, 24,'fs',0), ('TPL-RES-VILLA-GF-001', 25, 20,'fs',0), ('TPL-RES-VILLA-GF-001', 25, 21,'fs',0),
  ('TPL-RES-VILLA-GF-001', 26, 25,'fs',0), ('TPL-RES-VILLA-GF-001', 27, 26,'fs',7),
  -- ground floor: MEP + finishes
  ('TPL-RES-VILLA-GF-001', 28, 27,'fs',0), ('TPL-RES-VILLA-GF-001', 29, 27,'fs',0), ('TPL-RES-VILLA-GF-001', 30, 27,'fs',0),
  ('TPL-RES-VILLA-GF-001', 31, 27,'fs',0), ('TPL-RES-VILLA-GF-001', 32, 31,'fs',0), ('TPL-RES-VILLA-GF-001', 32, 28,'fs',0),
  ('TPL-RES-VILLA-GF-001', 32, 29,'fs',0), ('TPL-RES-VILLA-GF-001', 33, 32,'fs',0), ('TPL-RES-VILLA-GF-001', 34, 33,'fs',0),
  ('TPL-RES-VILLA-GF-001', 35, 33,'fs',0), ('TPL-RES-VILLA-GF-001', 36, 34,'fs',0), ('TPL-RES-VILLA-GF-001', 37, 32,'fs',0),
  ('TPL-RES-VILLA-GF-001', 38, 31,'fs',0), ('TPL-RES-VILLA-GF-001', 39, 31,'fs',0), ('TPL-RES-VILLA-GF-001', 40, 37,'fs',0),
  ('TPL-RES-VILLA-GF-001', 40, 35,'fs',0), ('TPL-RES-VILLA-GF-001', 41, 32,'fs',0), ('TPL-RES-VILLA-GF-001', 42, 40,'fs',0),
  ('TPL-RES-VILLA-GF-001', 42, 41,'fs',0), ('TPL-RES-VILLA-GF-001', 43, 40,'fs',0), ('TPL-RES-VILLA-GF-001', 44, 35,'fs',0),
  ('TPL-RES-VILLA-GF-001', 44, 36,'fs',0), ('TPL-RES-VILLA-GF-001', 44, 30,'fs',0), ('TPL-RES-VILLA-GF-001', 45, 36,'fs',0),
  ('TPL-RES-VILLA-GF-001', 45, 40,'fs',0), ('TPL-RES-VILLA-GF-001', 46, 44,'fs',0), ('TPL-RES-VILLA-GF-001', 47, 40,'fs',0),
  ('TPL-RES-VILLA-GF-001', 47, 36,'fs',0), ('TPL-RES-VILLA-GF-001', 47, 38,'fs',0),
  -- upper floor
  ('TPL-RES-VILLA-UF-001',  2,  1,'fs',0), ('TPL-RES-VILLA-UF-001',  3,  2,'fs',0), ('TPL-RES-VILLA-UF-001',  4,  3,'fs',0),
  ('TPL-RES-VILLA-UF-001',  5,  4,'fs',1), ('TPL-RES-VILLA-UF-001',  6,  5,'ss',0), ('TPL-RES-VILLA-UF-001',  7,  6,'fs',0),
  ('TPL-RES-VILLA-UF-001',  8,  5,'fs',0), ('TPL-RES-VILLA-UF-001',  9,  8,'ss',0), ('TPL-RES-VILLA-UF-001', 10,  8,'fs',0),
  ('TPL-RES-VILLA-UF-001', 10,  9,'fs',0), ('TPL-RES-VILLA-UF-001', 11,  4,'fs',0), ('TPL-RES-VILLA-UF-001', 12, 10,'fs',0),
  ('TPL-RES-VILLA-UF-001', 12,  7,'fs',0), ('TPL-RES-VILLA-UF-001', 13, 12,'fs',0), ('TPL-RES-VILLA-UF-001', 13, 11,'fs',0),
  ('TPL-RES-VILLA-UF-001', 14, 13,'fs',7),
  ('TPL-RES-VILLA-UF-001', 15, 14,'fs',0), ('TPL-RES-VILLA-UF-001', 16, 14,'fs',0), ('TPL-RES-VILLA-UF-001', 17, 14,'fs',0),
  ('TPL-RES-VILLA-UF-001', 18, 14,'fs',0), ('TPL-RES-VILLA-UF-001', 19, 18,'fs',0), ('TPL-RES-VILLA-UF-001', 19, 15,'fs',0),
  ('TPL-RES-VILLA-UF-001', 19, 16,'fs',0), ('TPL-RES-VILLA-UF-001', 20, 19,'fs',0), ('TPL-RES-VILLA-UF-001', 21, 20,'fs',0),
  ('TPL-RES-VILLA-UF-001', 22, 20,'fs',0), ('TPL-RES-VILLA-UF-001', 23, 21,'fs',0), ('TPL-RES-VILLA-UF-001', 24, 19,'fs',0),
  ('TPL-RES-VILLA-UF-001', 25, 18,'fs',0), ('TPL-RES-VILLA-UF-001', 26, 18,'fs',0), ('TPL-RES-VILLA-UF-001', 27, 23,'fs',0),
  ('TPL-RES-VILLA-UF-001', 28, 24,'fs',0), ('TPL-RES-VILLA-UF-001', 28, 22,'fs',0), ('TPL-RES-VILLA-UF-001', 29, 19,'fs',0),
  ('TPL-RES-VILLA-UF-001', 30, 28,'fs',0), ('TPL-RES-VILLA-UF-001', 30, 29,'fs',0), ('TPL-RES-VILLA-UF-001', 31, 28,'fs',0),
  ('TPL-RES-VILLA-UF-001', 32, 22,'fs',0), ('TPL-RES-VILLA-UF-001', 32, 23,'fs',0), ('TPL-RES-VILLA-UF-001', 32, 17,'fs',0),
  ('TPL-RES-VILLA-UF-001', 33, 28,'fs',0), ('TPL-RES-VILLA-UF-001', 33, 23,'fs',0), ('TPL-RES-VILLA-UF-001', 34, 32,'fs',0),
  ('TPL-RES-VILLA-UF-001', 35, 28,'fs',0), ('TPL-RES-VILLA-UF-001', 35, 23,'fs',0), ('TPL-RES-VILLA-UF-001', 35, 25,'fs',0),
  -- pitched roof
  ('TPL-RES-VILLA-RF-001',  2,  1,'fs',0), ('TPL-RES-VILLA-RF-001',  3,  2,'ss',0), ('TPL-RES-VILLA-RF-001',  4,  3,'fs',0),
  ('TPL-RES-VILLA-RF-001',  5,  4,'fs',7), ('TPL-RES-VILLA-RF-001',  6,  5,'fs',0), ('TPL-RES-VILLA-RF-001',  7,  6,'fs',0),
  ('TPL-RES-VILLA-RF-001',  8,  7,'ss',2)
) as v(tcode, succ, pred, rel, lag)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join public.plan_act_template_items s on s.template_id = t.id and s.seq = v.succ
join public.plan_act_template_items p on p.template_id = t.id and p.seq = v.pred
where not exists (
  select 1 from public.plan_act_template_dependencies d
   where d.template_id = t.id and d.predecessor_item_id = p.id and d.successor_item_id = s.id);

-- Same technical applicability as the other floor templates: reinforced concrete frame.
insert into public.plan_act_applicability (target_type, target_id, attribute, operator, values)
select 'template', t.id, 'structure_type', 'eq', array['reinforced_concrete']
from public.plan_act_templates t
where t.code in ('TPL-RES-VILLA-GF-001', 'TPL-RES-VILLA-UF-001', 'TPL-RES-VILLA-RF-001') and t.version = 1 and t.status = 'draft'
  and not exists (select 1 from public.plan_act_applicability a where a.target_type = 'template' and a.target_id = t.id);
