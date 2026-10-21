-- QS Bridge rules for the sector content (step 2 after Phases A-D of the "Activity Library by Sector"
-- plan): which QS-classified BOQ lines feed the quantity metrics of the new activity masters, so their
-- durations come from BOQ quantity x norm instead of manual entry.
--
-- 1. QS Element Library additions where BOQ lines had nothing to be classified under: a "Civil Works >
--    Infrastructure" discipline (earthworks, pavement, road furniture, road drainage, culverts, bridges,
--    pipelines, utilities), and healthcare, industrial and residential items (medical gas, nurse call,
--    shielding, clean rooms, metal cladding, docks, racking, cranes, wardrobes, vanities, pool, external
--    drains). Additive only: existing elements and BOQ lines are unchanged.
-- 2. Bridge rules (plan_act_qs_bridge) for those elements and for existing ones the new masters use
--    (footings, ground beams, slab on grade, basement walls, roofs, structural steel, kitchens,
--    handrails, paving, landscape, lab benches, AV). Also fixes the core-wall rules, which pointed at a
--    "Core Wall" sub-section the library calls "Lift Core / Shear Core".
--    Assumptions are written on the rule (steel split 40 % columns / 60 % rafters; one projector per
--    classroom). Raft foundations share the footing element, so raft masters keep manual quantities.
--
-- Idempotent: elements on their unique key, rules skipped when an identical rule exists.

insert into public.qs_element_library (discipline, section, sub_section, sub_element, typical_unit, sort_order, is_active)
select v.discipline, v.section, v.sub_section, v.sub_element, v.unit, 600 + v.ord, true
from (values
  ('Civil Works', 'Infrastructure', 'Earthworks', 'Clearing & grubbing', 'm2', 0),
  ('Civil Works', 'Infrastructure', 'Earthworks', 'Topsoil stripping', 'm3', 1),
  ('Civil Works', 'Infrastructure', 'Earthworks', 'Cut to formation', 'm3', 2),
  ('Civil Works', 'Infrastructure', 'Earthworks', 'Embankment fill', 'm3', 3),
  ('Civil Works', 'Infrastructure', 'Earthworks', 'Ground improvement', 'm2', 4),
  ('Civil Works', 'Infrastructure', 'Earthworks', 'Slope protection', 'm2', 5),
  ('Civil Works', 'Infrastructure', 'Earthworks', 'Subgrade preparation', 'm2', 6),
  ('Civil Works', 'Infrastructure', 'Pavement', 'Sub-base course', 'm2', 20),
  ('Civil Works', 'Infrastructure', 'Pavement', 'Base course', 'm2', 21),
  ('Civil Works', 'Infrastructure', 'Pavement', 'Prime / tack coat', 'm2', 22),
  ('Civil Works', 'Infrastructure', 'Pavement', 'Asphalt binder course', 'm2', 23),
  ('Civil Works', 'Infrastructure', 'Pavement', 'Asphalt wearing course', 'm2', 24),
  ('Civil Works', 'Infrastructure', 'Pavement', 'Kerb & median', 'm', 25),
  ('Civil Works', 'Infrastructure', 'Pavement', 'Footpath / cycle lane', 'm2', 26),
  ('Civil Works', 'Infrastructure', 'Road Furniture & Lighting', 'Crash barrier / guardrail', 'm', 40),
  ('Civil Works', 'Infrastructure', 'Road Furniture & Lighting', 'Traffic sign', 'Nos', 41),
  ('Civil Works', 'Infrastructure', 'Road Furniture & Lighting', 'Road marking', 'm', 42),
  ('Civil Works', 'Infrastructure', 'Road Furniture & Lighting', 'Traffic signal junction', 'Nos', 43),
  ('Civil Works', 'Infrastructure', 'Road Furniture & Lighting', 'Street light pole', 'Nos', 44),
  ('Civil Works', 'Infrastructure', 'Road Drainage', 'Pipe culvert', 'm', 60),
  ('Civil Works', 'Infrastructure', 'Road Drainage', 'U-channel / side drain', 'm', 61),
  ('Civil Works', 'Infrastructure', 'Road Drainage', 'Manhole / catch basin', 'Nos', 62),
  ('Civil Works', 'Infrastructure', 'Road Drainage', 'Subsoil drain', 'm', 63),
  ('Civil Works', 'Infrastructure', 'Road Drainage', 'Rip-rap / erosion protection', 'm2', 64),
  ('Civil Works', 'Infrastructure', 'Culvert & Minor Structure', 'Concrete', 'm3', 80),
  ('Civil Works', 'Infrastructure', 'Culvert & Minor Structure', 'Formwork', 'm2', 81),
  ('Civil Works', 'Infrastructure', 'Culvert & Minor Structure', 'Rebar', 'kg', 82),
  ('Civil Works', 'Infrastructure', 'Culvert & Minor Structure', 'Headwall / wingwall', 'm3', 83),
  ('Civil Works', 'Infrastructure', 'Bridge Pier & Abutment', 'Concrete', 'm3', 100),
  ('Civil Works', 'Infrastructure', 'Bridge Pier & Abutment', 'Formwork', 'm2', 101),
  ('Civil Works', 'Infrastructure', 'Bridge Pier & Abutment', 'Rebar', 'kg', 102),
  ('Civil Works', 'Infrastructure', 'Bridge Pier & Abutment', 'Crosshead concrete', 'm3', 103),
  ('Civil Works', 'Infrastructure', 'Bridge Superstructure', 'Bearing', 'Nos', 120),
  ('Civil Works', 'Infrastructure', 'Bridge Superstructure', 'Precast girder / segment', 'Nos', 121),
  ('Civil Works', 'Infrastructure', 'Bridge Superstructure', 'Deck concrete', 'm3', 122),
  ('Civil Works', 'Infrastructure', 'Bridge Superstructure', 'Deck formwork / permanent shutter', 'm2', 123),
  ('Civil Works', 'Infrastructure', 'Bridge Superstructure', 'Deck rebar', 'kg', 124),
  ('Civil Works', 'Infrastructure', 'Bridge Superstructure', 'Expansion joint', 'm', 125),
  ('Civil Works', 'Infrastructure', 'Bridge Superstructure', 'Parapet / barrier', 'm', 126),
  ('Civil Works', 'Infrastructure', 'Bridge Superstructure', 'Deck waterproofing', 'm2', 127),
  ('Civil Works', 'Infrastructure', 'Pipelines', 'Trench excavation & shoring', 'm', 140),
  ('Civil Works', 'Infrastructure', 'Pipelines', 'Pipe bedding', 'm', 141),
  ('Civil Works', 'Infrastructure', 'Pipelines', 'Pipe laying & jointing', 'm', 142),
  ('Civil Works', 'Infrastructure', 'Pipelines', 'Valve chamber / thrust block', 'Nos', 143),
  ('Civil Works', 'Infrastructure', 'Pipelines', 'Valve / hydrant / air valve', 'Nos', 144),
  ('Civil Works', 'Infrastructure', 'Pipelines', 'Service / house connection', 'Nos', 145),
  ('Civil Works', 'Infrastructure', 'Pipelines', 'Road reinstatement', 'm2', 146),
  ('Civil Works', 'Infrastructure', 'Pipelines', 'HDD / trenchless crossing', 'm', 147),
  ('Civil Works', 'Infrastructure', 'Power & Telecom Utilities', 'Duct bank', 'm', 160),
  ('Civil Works', 'Infrastructure', 'Power & Telecom Utilities', 'MV / LV cable', 'm', 161),
  ('Civil Works', 'Infrastructure', 'Power & Telecom Utilities', 'Cable joint / termination', 'Nos', 162),
  ('Civil Works', 'Infrastructure', 'Power & Telecom Utilities', 'Fibre / telemetry cable', 'm', 163),
  ('Civil Works', 'Infrastructure', 'Power & Telecom Utilities', 'Pump set', 'Nos', 164),
  ('Architecture', 'Exterior Wall and Partition', 'Metal cladding', 'Metal wall cladding', 'm2', 180),
  ('Architecture', 'Exterior Wall and Partition', 'Metal cladding', 'Insulated sandwich panel', 'm2', 181),
  ('Architecture', 'Exterior Door', 'Dock equipment', 'Dock leveller & shelter', 'Nos', 200),
  ('Architecture', 'Exterior Door', 'Dock equipment', 'Sectional / dock door', 'Nos', 201),
  ('Architecture', 'Fittings, furnishings and equipment', 'Built-in joinery', 'Built-in wardrobe', 'm', 220),
  ('Architecture', 'Fittings, furnishings and equipment', 'Built-in joinery', 'Vanity unit', 'Nos', 221),
  ('Architecture', 'Fittings, furnishings and equipment', 'Racking & storage', 'Pallet racking', 'bay', 240),
  ('Architecture', 'Special installation', 'Healthcare fit-out', 'Radiation shielding (lead lining)', 'm2', 260),
  ('Architecture', 'Special installation', 'Healthcare fit-out', 'Clean room / operating theatre', 'm2', 261),
  ('Architecture', 'Special installation', 'Healthcare fit-out', 'Wall protection / crash rail', 'm', 262),
  ('MEP', 'MEDICAL GAS SYSTEM', 'Medical gas', 'Medical gas piping', 'm', 280),
  ('MEP', 'MEDICAL GAS SYSTEM', 'Medical gas', 'Medical gas outlet', 'Nos', 281),
  ('MEP', 'MEDICAL GAS SYSTEM', 'Medical gas', 'Bed-head unit', 'Nos', 282),
  ('MEP', 'MEDICAL GAS SYSTEM', 'Medical gas', 'Medical gas plant', 'Lot', 283),
  ('MEP', 'ELV INSTALLATION', 'Nurse call system', 'Nurse call point', 'point', 300),
  ('Civil and Structure', 'Super Structure', 'Crane Runway & Crane', 'Crane rail & girder', 'm', 320),
  ('Civil and Structure', 'Super Structure', 'Crane Runway & Crane', 'Overhead crane', 'Nos', 321),
  ('External Works', 'External Work', 'Swimming pool', 'Pool shell', 'm2', 340),
  ('External Works', 'External Work', 'Swimming pool', 'Pool tiling & coping', 'm2', 341),
  ('External Works', 'External Work', 'External drainage', 'Drain pipe', 'm', 360),
  ('External Works', 'External Work', 'External drainage', 'Manhole / inspection chamber', 'Nos', 361)
) as v(discipline, section, sub_section, sub_element, unit, ord)
on conflict (discipline, section, sub_section, sub_element) do nothing;

insert into public.plan_act_qs_bridge (role, metric_code, metric_unit, unit_factor, match_discipline, match_section, match_sub_section, match_sub_element, match_unit, note, sort_order)
select v.role, v.metric, v.metric_unit, v.factor, v.disc, v.section, v.sub_section, v.sub_element, v.unit, v.note, 500 + v.ord
from (values
  ('driver', 'core_rebar', 't', 0.001::numeric, 'Civil and Structure', null, 'Lift Core / Shear Core', 'Rebar', 'kg', 'kg -> t', 0),
  ('driver', 'core_formwork', 'm²', 1::numeric, 'Civil and Structure', null, 'Lift Core / Shear Core', 'Formwork', 'm2', null, 1),
  ('driver', 'core_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Lift Core / Shear Core', 'Concrete', 'm3', null, 2),
  ('driver', 'excavation_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Footing / Raft Foundation', 'Earthwork', 'm3', null, 3),
  ('driver', 'excavation_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Ground Beam / Tie Beam', 'Earthwork', 'm3', null, 4),
  ('driver', 'excavation_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Pile Cap & Stump', 'Earthwork', 'm3', null, 5),
  ('driver', 'excavation_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Site Preparation & Earthwork', 'Excavation', 'm3', 'Site excavation; basement digs use Basement / Retaining Wall > Earthwork', 6),
  ('driver', 'backfill_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Site Preparation & Earthwork', 'Backfill', 'm3', null, 7),
  ('driver', 'termite_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Footing / Raft Foundation', 'Anti-Termite', 'm2', null, 8),
  ('driver', 'termite_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Slab on Grade / Ground Slab', 'Anti-Termite', 'm2', null, 9),
  ('driver', 'termite_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Pile Cap & Stump', 'Anti-Termite', 'm2', null, 10),
  ('driver', 'termite_area', 'm²', 1::numeric, 'Architecture', null, 'Waterproofing', 'anti termite', 'm2', 'More specific than the wet-area waterproofing rule', 11),
  ('driver', 'blinding_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Footing / Raft Foundation', 'Base Preparation', 'm2', 'Base preparation incl. blinding (lean concrete m³ stays excluded)', 12),
  ('driver', 'footing_rebar', 't', 0.001::numeric, 'Civil and Structure', null, 'Footing / Raft Foundation', 'Rebar', 'kg', 'kg -> t; raft foundations share this element: use raft masters with manual quantities', 13),
  ('driver', 'footing_formwork', 'm²', 1::numeric, 'Civil and Structure', null, 'Footing / Raft Foundation', 'Formwork', 'm2', null, 14),
  ('driver', 'footing_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Footing / Raft Foundation', 'Concrete', 'm3', null, 15),
  ('driver', 'groundbeam_rebar', 't', 0.001::numeric, 'Civil and Structure', null, 'Ground Beam / Tie Beam', 'Rebar', 'kg', 'kg -> t', 16),
  ('driver', 'groundbeam_formwork', 'm²', 1::numeric, 'Civil and Structure', null, 'Ground Beam / Tie Beam', 'Formwork', 'm2', null, 17),
  ('driver', 'groundbeam_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Ground Beam / Tie Beam', 'Concrete', 'm3', null, 18),
  ('driver', 'sog_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Slab on Grade / Ground Slab', 'Base Preparation', 'm2', 'Feeds hardcore / DPM and mesh', 19),
  ('driver', 'industrial_floor_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Slab on Grade / Ground Slab', 'Base Preparation', 'm2', 'Same line drives the superflat floor masters', 20),
  ('driver', 'sog_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Slab on Grade / Ground Slab', 'Concrete', 'm3', null, 21),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Slab on Grade / Ground Slab', 'Vapour Barrier', null, 'Part of hardcore & DPM', 22),
  ('driver', 'basement_excavation_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Basement / Retaining Wall', 'Earthwork', 'm3', null, 23),
  ('driver', 'retaining_wall_rebar', 't', 0.001::numeric, 'Civil and Structure', null, 'Basement / Retaining Wall', 'Rebar', 'kg', 'kg -> t', 24),
  ('driver', 'retaining_wall_formwork', 'm²', 1::numeric, 'Civil and Structure', null, 'Basement / Retaining Wall', 'Formwork', 'm2', null, 25),
  ('driver', 'retaining_wall_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Basement / Retaining Wall', 'Concrete', 'm3', null, 26),
  ('driver', 'basement_membrane_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Basement / Retaining Wall', 'Waterproofing', 'm2', null, 27),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Basement / Retaining Wall', 'Protection Board', null, 'Laid with the membrane', 28),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Basement / Retaining Wall', 'Drainage Board', null, 'Laid with the membrane', 29),
  ('driver', 'roof_area', 'm²', 1::numeric, 'Architecture', 'Roofing', 'Roof covering', 'Roof tile', 'm2', 'Pitched tiled roofs: trusses, battens and tiles', 30),
  ('driver', 'metal_roof_area', 'm²', 1::numeric, 'Architecture', 'Roofing', 'Roof covering', 'Metal roof sheet', 'm2', null, 31),
  ('driver', 'metal_roof_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Roof Structure / Truss', 'Zinc sheet', 'm2', null, 32),
  ('driver', 'gutter_length', 'm', 1::numeric, 'Architecture', 'Roofing', 'Roof drainage', 'Gutter', 'm', null, 33),
  ('driver', 'gutter_length', 'm', 1::numeric, 'Architecture', 'Roofing', 'Roof drainage', 'Downpipe', 'm', null, 34),
  ('driver', 'flashing_length', 'm', 1::numeric, 'Architecture', 'Roofing', 'Roof drainage', 'Flashing', 'm', null, 35),
  ('driver', 'flashing_length', 'm', 1::numeric, 'Civil and Structure', null, 'Roof Structure / Truss', 'Flashing', 'm', null, 36),
  ('driver', 'roof_waterproofing_area', 'm²', 1::numeric, 'Architecture', 'Roofing', 'Roof waterproofing & insulation', 'Waterproofing membrane', 'm2', null, 37),
  ('driver', 'steel_column_weight', 't', 0.0004::numeric, 'Civil and Structure', null, 'Structural Steel', 'Steel Section / Beam', 'kg', 'kg -> t, ASSUMPTION: 40 % of main steel is columns', 38),
  ('driver', 'steel_rafter_weight', 't', 0.0006::numeric, 'Civil and Structure', null, 'Structural Steel', 'Steel Section / Beam', 'kg', 'kg -> t, ASSUMPTION: 60 % of main steel is rafters', 39),
  ('driver', 'steel_rafter_weight', 't', 0.001::numeric, 'Civil and Structure', null, 'Structural Steel', 'Bracing', 'kg', 'kg -> t', 40),
  ('driver', 'steel_rafter_weight', 't', 0.001::numeric, 'Civil and Structure', null, 'Roof Structure / Truss', 'Truss', 'kg', 'kg -> t', 41),
  ('driver', 'steel_rafter_weight', 't', 0.001::numeric, 'Civil and Structure', null, 'Roof Structure / Truss', 'Bracing', 'kg', 'kg -> t', 42),
  ('driver', 'purlin_girt_weight', 't', 0.001::numeric, 'Civil and Structure', null, 'Structural Steel', 'Purlin', 'kg', 'kg -> t', 43),
  ('driver', 'purlin_girt_weight', 't', 0.001::numeric, 'Civil and Structure', null, 'Structural Steel', 'Sag rod', 'kg', 'kg -> t', 44),
  ('driver', 'purlin_girt_weight', 't', 0.001::numeric, 'Civil and Structure', null, 'Roof Structure / Truss', 'Purlin', 'kg', 'kg -> t', 45),
  ('driver', 'purlin_girt_weight', 't', 0.001::numeric, 'Civil and Structure', null, 'Roof Structure / Truss', 'Sag rod', 'kg', 'kg -> t', 46),
  ('driver', 'anchor_bolt_count', 'nos', 1::numeric, 'Civil and Structure', null, 'Structural Steel', 'Anchor Bolt', 'Nos', null, 47),
  ('driver', 'anchor_bolt_count', 'nos', 1::numeric, 'Civil and Structure', null, 'Roof Structure / Truss', 'Anchor Bolt', 'Nos', null, 48),
  ('driver', 'crane_runway_length', 'm', 1::numeric, 'Civil and Structure', null, 'Crane Runway & Crane', 'Crane rail & girder', 'm', null, 49),
  ('driver', 'crane_count', 'nos', 1::numeric, 'Civil and Structure', null, 'Crane Runway & Crane', 'Overhead crane', 'Nos', null, 50),
  ('driver', 'cladding_area', 'm²', 1::numeric, 'Architecture', null, 'Metal cladding', 'Metal wall cladding', 'm2', null, 51),
  ('driver', 'cladding_area', 'm²', 1::numeric, 'Architecture', null, 'Metal cladding', 'Insulated sandwich panel', 'm2', null, 52),
  ('driver', 'dock_count', 'nos', 1::numeric, 'Architecture', null, 'Dock equipment', 'Dock leveller & shelter', 'Nos', null, 53),
  ('driver', 'industrial_door_count', 'nos', 1::numeric, 'Architecture', null, 'Dock equipment', 'Sectional / dock door', 'Nos', null, 54),
  ('driver', 'racking_bay_count', 'bay', 1::numeric, 'Architecture', null, 'Racking & storage', 'Pallet racking', 'bay', null, 55),
  ('driver', 'floor_coating_area', 'm²', 1::numeric, 'Architecture', null, 'Resilient flooring', 'Epoxy flooring', 'm2', null, 56),
  ('driver', 'kitchen_run_length', 'm', 1::numeric, 'Architecture', null, 'Kitchen Fitting', 'Kitchen cabinet', 'm', null, 57),
  ('driver', 'wardrobe_run_length', 'm', 1::numeric, 'Architecture', null, 'Built-in joinery', 'Built-in wardrobe', 'm', null, 58),
  ('driver', 'bathroom_count', 'nos', 1::numeric, 'Architecture', null, 'Built-in joinery', 'Vanity unit', 'Nos', null, 59),
  ('driver', 'balustrade_length', 'm', 1::numeric, 'Architecture', null, 'Handrail & Balustrade', null, 'm', null, 60),
  ('driver', 'balustrade_length', 'm', 1::numeric, 'Architecture', null, 'Handrail', 'Handrail', 'm', null, 61),
  ('driver', 'balustrade_length', 'm', 1::numeric, 'Architecture', null, 'Handrail', 'Handrail on staircase', 'm', null, 62),
  ('driver', 'wall_protection_length', 'm', 1::numeric, 'Architecture', null, 'Handrail', 'Wall guard rail', 'm', null, 63),
  ('driver', 'wall_protection_length', 'm', 1::numeric, 'Architecture', null, 'Healthcare fit-out', 'Wall protection / crash rail', 'm', null, 64),
  ('driver', 'casework_length', 'm', 1::numeric, 'Architecture', null, 'Special purpose Fitting', 'Laboratory bench', 'm', null, 65),
  ('driver', 'classroom_count', 'room', 1::numeric, 'MEP', null, 'Audio visual & school system', 'Projector & screen', 'Nos', 'ASSUMPTION: one projector / screen per classroom', 66),
  ('driver', 'av_security_points', 'point', 1::numeric, 'MEP', null, 'Audio visual & school system', 'Speaker', 'Nos', null, 67),
  ('driver', 'av_security_points', 'point', 1::numeric, 'MEP', null, 'Security system', 'CCTV camera', 'Nos', null, 68),
  ('driver', 'av_security_points', 'point', 1::numeric, 'MEP', null, 'Security system', 'Access control door', 'Nos', null, 69),
  ('driver', 'av_security_points', 'point', 1::numeric, 'MEP', null, 'Security system', 'Intercom', 'Nos', null, 70),
  ('driver', 'medgas_pipe_length', 'm', 1::numeric, 'MEP', null, 'Medical gas', 'Medical gas piping', 'm', null, 71),
  ('driver', 'medgas_outlet_count', 'nos', 1::numeric, 'MEP', null, 'Medical gas', 'Medical gas outlet', 'Nos', null, 72),
  ('driver', 'medgas_outlet_count', 'nos', 1::numeric, 'MEP', null, 'Medical gas', 'Bed-head unit', 'Nos', null, 73),
  ('excluded', null, null, 1::numeric, 'MEP', null, 'Medical gas', 'Medical gas plant', null, 'Fixed-duration plant installation', 74),
  ('driver', 'nurse_call_points', 'point', 1::numeric, 'MEP', null, 'Nurse call system', 'Nurse call point', 'point', null, 75),
  ('driver', 'shielding_area', 'm²', 1::numeric, 'Architecture', null, 'Healthcare fit-out', 'Radiation shielding (lead lining)', 'm2', null, 76),
  ('driver', 'cleanroom_area', 'm²', 1::numeric, 'Architecture', null, 'Healthcare fit-out', 'Clean room / operating theatre', 'm2', null, 77),
  ('driver', 'paving_area', 'm²', 1::numeric, 'External Works', null, 'Roads, path, paving', 'Concrete paving', 'm2', null, 78),
  ('driver', 'paving_area', 'm²', 1::numeric, 'External Works', null, 'Roads, path, paving', 'Interlocking paver', 'm2', null, 79),
  ('driver', 'paving_area', 'm²', 1::numeric, 'External Works', null, 'Roads, path, paving', 'Asphalt paving', 'm2', null, 80),
  ('driver', 'paving_area', 'm²', 1::numeric, 'External Works', null, 'Roads, path, paving', 'Car park', 'm2', null, 81),
  ('driver', 'kerb_length', 'm', 1::numeric, 'External Works', null, 'Roads, path, paving', 'Kerb', 'm', null, 82),
  ('driver', 'road_marking_length', 'm', 1::numeric, 'External Works', null, 'Roads, path, paving', 'Road marking', 'm', null, 83),
  ('driver', 'landscape_area', 'm²', 1::numeric, 'External Works', null, 'Landscape', 'Turfing', 'm2', null, 84),
  ('driver', 'boundary_length', 'm', 1::numeric, 'External Works', null, 'Fence, railing & wall', 'Boundary fence', 'm', null, 85),
  ('driver', 'pool_area', 'm²', 1::numeric, 'External Works', null, 'Swimming pool', 'Pool shell', 'm2', null, 86),
  ('driver', 'pool_tile_area', 'm²', 1::numeric, 'External Works', null, 'Swimming pool', 'Pool tiling & coping', 'm2', null, 87),
  ('driver', 'ext_drain_length', 'm', 1::numeric, 'External Works', null, 'External drainage', 'Drain pipe', 'm', null, 88),
  ('driver', 'clearing_area', 'm²', 1::numeric, 'Civil Works', null, 'Earthworks', 'Clearing & grubbing', 'm2', null, 89),
  ('driver', 'topsoil_volume', 'm³', 1::numeric, 'Civil Works', null, 'Earthworks', 'Topsoil stripping', 'm3', null, 90),
  ('driver', 'cut_volume', 'm³', 1::numeric, 'Civil Works', null, 'Earthworks', 'Cut to formation', 'm3', null, 91),
  ('driver', 'fill_volume', 'm³', 1::numeric, 'Civil Works', null, 'Earthworks', 'Embankment fill', 'm3', null, 92),
  ('driver', 'ground_improvement_area', 'm²', 1::numeric, 'Civil Works', null, 'Earthworks', 'Ground improvement', 'm2', null, 93),
  ('driver', 'slope_protection_area', 'm²', 1::numeric, 'Civil Works', null, 'Earthworks', 'Slope protection', 'm2', null, 94),
  ('driver', 'subgrade_area', 'm²', 1::numeric, 'Civil Works', null, 'Earthworks', 'Subgrade preparation', 'm2', null, 95),
  ('driver', 'subbase_area', 'm²', 1::numeric, 'Civil Works', null, 'Pavement', 'Sub-base course', 'm2', null, 96),
  ('driver', 'base_course_area', 'm²', 1::numeric, 'Civil Works', null, 'Pavement', 'Base course', 'm2', null, 97),
  ('driver', 'prime_coat_area', 'm²', 1::numeric, 'Civil Works', null, 'Pavement', 'Prime / tack coat', 'm2', null, 98),
  ('driver', 'asphalt_binder_area', 'm²', 1::numeric, 'Civil Works', null, 'Pavement', 'Asphalt binder course', 'm2', null, 99),
  ('driver', 'asphalt_wearing_area', 'm²', 1::numeric, 'Civil Works', null, 'Pavement', 'Asphalt wearing course', 'm2', null, 100),
  ('driver', 'kerb_length', 'm', 1::numeric, 'Civil Works', null, 'Pavement', 'Kerb & median', 'm', null, 101),
  ('driver', 'footpath_area', 'm²', 1::numeric, 'Civil Works', null, 'Pavement', 'Footpath / cycle lane', 'm2', null, 102),
  ('driver', 'barrier_length', 'm', 1::numeric, 'Civil Works', null, 'Road Furniture & Lighting', 'Crash barrier / guardrail', 'm', null, 103),
  ('driver', 'sign_count', 'nos', 1::numeric, 'Civil Works', null, 'Road Furniture & Lighting', 'Traffic sign', 'Nos', null, 104),
  ('driver', 'road_marking_length', 'm', 1::numeric, 'Civil Works', null, 'Road Furniture & Lighting', 'Road marking', 'm', null, 105),
  ('driver', 'signal_junction_count', 'nos', 1::numeric, 'Civil Works', null, 'Road Furniture & Lighting', 'Traffic signal junction', 'Nos', null, 106),
  ('driver', 'lighting_pole_count', 'nos', 1::numeric, 'Civil Works', null, 'Road Furniture & Lighting', 'Street light pole', 'Nos', null, 107),
  ('driver', 'pipe_culvert_length', 'm', 1::numeric, 'Civil Works', null, 'Road Drainage', 'Pipe culvert', 'm', null, 108),
  ('driver', 'side_drain_length', 'm', 1::numeric, 'Civil Works', null, 'Road Drainage', 'U-channel / side drain', 'm', null, 109),
  ('driver', 'manhole_count', 'nos', 1::numeric, 'Civil Works', null, 'Road Drainage', 'Manhole / catch basin', 'Nos', null, 110),
  ('driver', 'manhole_count', 'nos', 1::numeric, 'External Works', null, 'External drainage', 'Manhole / inspection chamber', 'Nos', null, 111),
  ('driver', 'subsoil_drain_length', 'm', 1::numeric, 'Civil Works', null, 'Road Drainage', 'Subsoil drain', 'm', null, 112),
  ('driver', 'riprap_area', 'm²', 1::numeric, 'Civil Works', null, 'Road Drainage', 'Rip-rap / erosion protection', 'm2', null, 113),
  ('driver', 'civil_concrete_volume', 'm³', 1::numeric, 'Civil Works', null, 'Culvert & Minor Structure', 'Concrete', 'm3', null, 114),
  ('driver', 'civil_formwork', 'm²', 1::numeric, 'Civil Works', null, 'Culvert & Minor Structure', 'Formwork', 'm2', null, 115),
  ('driver', 'civil_rebar', 't', 0.001::numeric, 'Civil Works', null, 'Culvert & Minor Structure', 'Rebar', 'kg', 'kg -> t', 116),
  ('driver', 'headwall_volume', 'm³', 1::numeric, 'Civil Works', null, 'Culvert & Minor Structure', 'Headwall / wingwall', 'm3', null, 117),
  ('driver', 'bored_pile_length', 'm', 1::numeric, 'Civil and Structure', null, 'Bored Pile', 'Bored Pile Boring', 'm', null, 118),
  ('driver', 'pier_volume', 'm³', 1::numeric, 'Civil Works', null, 'Bridge Pier & Abutment', 'Concrete', 'm3', null, 119),
  ('driver', 'pier_formwork', 'm²', 1::numeric, 'Civil Works', null, 'Bridge Pier & Abutment', 'Formwork', 'm2', null, 120),
  ('driver', 'pier_rebar', 't', 0.001::numeric, 'Civil Works', null, 'Bridge Pier & Abutment', 'Rebar', 'kg', 'kg -> t', 121),
  ('driver', 'crosshead_volume', 'm³', 1::numeric, 'Civil Works', null, 'Bridge Pier & Abutment', 'Crosshead concrete', 'm3', null, 122),
  ('driver', 'bearing_count', 'nos', 1::numeric, 'Civil Works', null, 'Bridge Superstructure', 'Bearing', 'Nos', null, 123),
  ('driver', 'girder_count', 'nos', 1::numeric, 'Civil Works', null, 'Bridge Superstructure', 'Precast girder / segment', 'Nos', null, 124),
  ('driver', 'deck_volume', 'm³', 1::numeric, 'Civil Works', null, 'Bridge Superstructure', 'Deck concrete', 'm3', null, 125),
  ('driver', 'deck_formwork_area', 'm²', 1::numeric, 'Civil Works', null, 'Bridge Superstructure', 'Deck formwork / permanent shutter', 'm2', null, 126),
  ('driver', 'deck_rebar', 't', 0.001::numeric, 'Civil Works', null, 'Bridge Superstructure', 'Deck rebar', 'kg', 'kg -> t', 127),
  ('driver', 'expansion_joint_length', 'm', 1::numeric, 'Civil Works', null, 'Bridge Superstructure', 'Expansion joint', 'm', null, 128),
  ('driver', 'parapet_length', 'm', 1::numeric, 'Civil Works', null, 'Bridge Superstructure', 'Parapet / barrier', 'm', null, 129),
  ('driver', 'deck_waterproofing_area', 'm²', 1::numeric, 'Civil Works', null, 'Bridge Superstructure', 'Deck waterproofing', 'm2', null, 130),
  ('driver', 'trench_length', 'm', 1::numeric, 'Civil Works', null, 'Pipelines', 'Trench excavation & shoring', 'm', null, 131),
  ('driver', 'pipe_bedding_length', 'm', 1::numeric, 'Civil Works', null, 'Pipelines', 'Pipe bedding', 'm', null, 132),
  ('driver', 'pipe_length', 'm', 1::numeric, 'Civil Works', null, 'Pipelines', 'Pipe laying & jointing', 'm', null, 133),
  ('driver', 'valve_chamber_count', 'nos', 1::numeric, 'Civil Works', null, 'Pipelines', 'Valve chamber / thrust block', 'Nos', null, 134),
  ('driver', 'valve_count', 'nos', 1::numeric, 'Civil Works', null, 'Pipelines', 'Valve / hydrant / air valve', 'Nos', null, 135),
  ('driver', 'service_connection_count', 'nos', 1::numeric, 'Civil Works', null, 'Pipelines', 'Service / house connection', 'Nos', null, 136),
  ('driver', 'reinstatement_area', 'm²', 1::numeric, 'Civil Works', null, 'Pipelines', 'Road reinstatement', 'm2', null, 137),
  ('driver', 'hdd_length', 'm', 1::numeric, 'Civil Works', null, 'Pipelines', 'HDD / trenchless crossing', 'm', null, 138),
  ('driver', 'duct_bank_length', 'm', 1::numeric, 'Civil Works', null, 'Power & Telecom Utilities', 'Duct bank', 'm', null, 139),
  ('driver', 'cable_length_mv_lv', 'm', 1::numeric, 'Civil Works', null, 'Power & Telecom Utilities', 'MV / LV cable', 'm', null, 140),
  ('driver', 'cable_joint_count', 'nos', 1::numeric, 'Civil Works', null, 'Power & Telecom Utilities', 'Cable joint / termination', 'Nos', null, 141),
  ('driver', 'fibre_length', 'm', 1::numeric, 'Civil Works', null, 'Power & Telecom Utilities', 'Fibre / telemetry cable', 'm', null, 142),
  ('driver', 'pump_count', 'nos', 1::numeric, 'Civil Works', null, 'Power & Telecom Utilities', 'Pump set', 'Nos', null, 143),
  ('driver', 'balustrade_length', 'm', 1::numeric, 'Architecture', null, 'Handrail on staircase', null, 'm', 'BOQs that use the element as the sub-section', 144),
  ('driver', 'termite_area', 'm²', 1::numeric, null, null, 'anti termite', null, 'm2', 'BOQs that use anti termite as the sub-section', 145),
  ('driver', 'termite_area', 'm²', 1::numeric, 'Civil and Structure', null, null, 'Anti-Termite', 'm2', 'Anti-termite under any structural element', 146),
  ('driver', 'blinding_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Pile Cap & Stump', 'Base Preparation', 'm2', null, 147),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Pile Cap & Stump', 'Waterproofing', null, 'Laid with the pile cap base preparation', 148),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Bored Pile', 'Concrete', null, 'Part of bored pile installation (driven by boring length)', 149),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Bored Pile', 'Rebar', null, 'Part of bored pile installation (driven by boring length)', 150),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Bored Pile', 'Steel Round Pipe', null, 'Temporary / permanent casing, part of boring', 151),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Bored Pile', 'Bored Pile Coring', null, 'Pile test, fixed duration', 152),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Bored Pile', 'Bored Pile Testing', null, 'Pile test, fixed duration', 153),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Bored Pile', 'Bored Pile Head Cutting', null, 'Part of pile cap excavation and trimming', 154),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Septic tank', null, null, 'Septic tank is a fixed-duration activity (EXT-SEP-001)', 155),
  ('driver', 'wall_rebar', 't', 0.001::numeric, 'Civil and Structure', null, 'Parapet wall & Stiffener Column', 'Rebar', 'kg', 'kg -> t; parapets built with the wall masters', 156),
  ('driver', 'wall_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Parapet wall & Stiffener Column', 'Formwork', 'm2', 'Parapets built with the wall masters', 157),
  ('driver', 'wall_volume', 'm³', 1::numeric, 'Civil and Structure', null, 'Parapet wall & Stiffener Column', 'Concrete', 'm3', 'Parapets built with the wall masters', 158),
  ('driver', 'flashing_length', 'm', 1::numeric, 'Civil and Structure', null, 'Structural Steel', 'Flashing', 'm', null, 159),
  ('driver', 'metal_roof_area', 'm²', 1::numeric, 'Civil and Structure', null, 'Structural Steel', 'Zinc sheet', 'm2', null, 160),
  ('driver', 'anchor_bolt_count', 'nos', 1::numeric, 'Civil and Structure', null, 'Structural Steel', 'J bolt', 'Nos', null, 161),
  ('excluded', null, null, 1::numeric, 'Civil and Structure', null, 'Structural Steel', 'Steel plate', null, 'Connection material, part of erection', 162)
) as v(role, metric, metric_unit, factor, disc, section, sub_section, sub_element, unit, note, ord)
where not exists (
  select 1 from public.plan_act_qs_bridge b
   where b.role = v.role
     and coalesce(b.metric_code, '') = coalesce(v.metric, '')
     and lower(coalesce(b.match_discipline, '')) = lower(coalesce(v.disc, ''))
     and lower(coalesce(b.match_section, '')) = lower(coalesce(v.section, ''))
     and lower(coalesce(b.match_sub_section, '')) = lower(coalesce(v.sub_section, ''))
     and lower(coalesce(b.match_sub_element, '')) = lower(coalesce(v.sub_element, ''))
     and lower(coalesce(b.match_unit, '')) = lower(coalesce(v.unit, '')));

-- 3. Curtain wall / façade master (the commercial step template existed, the master did not), its norm,
--    quantity rule, bridge rule for the existing "External façade" element, and the WBS link in the
--    office / retail template.
do $fac$
declare d_id uuid; c_id uuid; f_id uuid;
begin
  select id into d_id from public.plan_act_domains where code = 'ARC';
  select id into c_id from public.plan_act_categories where domain_id = d_id and code = 'OPN';
  insert into public.plan_act_families(category_id, code, name, sort_order) values (c_id, 'FAC', 'Façade & Curtain Wall', 2)
    on conflict (category_id, code) do nothing;
  select id into f_id from public.plan_act_families where category_id = c_id and code = 'FAC';
  insert into public.plan_act_masters(code, name, domain_id, category_id, family_id, discipline, work_type, default_unit,
      status, version, owner, source, effective_date, sectors, building_types, duration_basis, default_work_group)
  values ('ARC-FAC-001', 'Curtain Wall / Façade Installation', d_id, c_id, f_id, 'ARC', 'Façade', 'm²', 'active', 1,
          'Planning Standards', 'Company Standard (commercial seed 2026-10-21)', date '2026-10-21',
          array['commercial','institutional','residential'], array['office_building','shopping_mall','mixed_use_building','hotel','residential_tower'],
          'quantity', 'EN')
  on conflict (code, version) do nothing;
end $fac$;

insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select 'NRM-ARC-FAC-001', 'Curtain wall / unitised façade installation', 'Façade', 'ARC', m.code, 'm²', round((3 + 2) * 8.0 / 25, 4), 8, 100, 'manual',
  'ASSUMPTION: indicative rate 25 m²/crew-day, crew 3 Façade Installer + 2 Rigger. Brackets, units / mullions, glazing, sealant; unitised systems run faster. Calibrate on the first floors before approving.',
  'draft', 1, 25, m.id
from public.plan_act_masters m
where m.code = 'ARC-FAC-001' and m.version = 1
  and not exists (select 1 from public.plan_productivity_norms n where n.project_id is null and n.code = 'NRM-ARC-FAC-001');

insert into public.plan_act_quantity_rules(master_id, name, metric_code, unit, provider_priority)
select m.id, 'Façade area', 'facade_area', 'm²', array['bim','boq','manual']
from public.plan_act_masters m where m.code = 'ARC-FAC-001' and m.version = 1
on conflict (master_id, name) do nothing;

update public.plan_act_masters m set default_step_template_id = s.id
  from public.activity_step_template_master s
 where m.code = 'ARC-FAC-001' and m.default_step_template_id is null
   and s.template_name = 'Curtain Wall / Unitised Façade' and s.is_active;

insert into public.plan_act_qs_bridge (role, metric_code, metric_unit, unit_factor, match_discipline, match_section, match_sub_section, match_sub_element, match_unit, note, sort_order)
select 'driver', 'facade_area', 'm²', 1, 'Architecture', null, v.sub_section, v.sub_element, 'm2', null, 700 + v.ord
from (values ('External façade', null::text, 1), ('External façade', 'Curtain wall', 2), ('External façade', 'Aluminium composite panel', 3)) v(sub_section, sub_element, ord)
where not exists (
  select 1 from public.plan_act_qs_bridge b
   where b.metric_code = 'facade_area' and lower(coalesce(b.match_sub_section, '')) = lower(v.sub_section)
     and lower(coalesce(b.match_sub_element, '')) = lower(coalesce(v.sub_element, '')));

create or replace function pg_temp.link_facade(arr jsonb) returns jsonb
language sql stable as $f$
  select coalesce(jsonb_agg(
           case when coalesce(x->>'master_code', '') = '' and lower(btrim(x->>'task_name')) = 'curtain wall unit installation'
                then x || jsonb_build_object('master_code', 'ARC-FAC-001') else x end order by o), '[]'::jsonb)
  from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) with ordinality e(x, o)
$f$;

update public.wbs_templates w
   set content = jsonb_set(w.content, '{floor_blocks}',
         coalesce((select jsonb_object_agg(b.key, b.value || jsonb_build_object('tasks', pg_temp.link_facade(b.value->'tasks')))
                     from jsonb_each(coalesce(w.content->'floor_blocks', '{}'::jsonb)) b), '{}'::jsonb))
 where w.template_category = 'commercial' and jsonb_typeof(w.content->'floor_blocks') = 'object';
