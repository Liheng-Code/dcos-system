-- Construction Work Library: procurement package coverage (2026-11-04, roadmap Wave 2 item 5).
--
-- User-approved review (package-mapping-review.xlsx): 239 current activities had no package, 108 of them in divisions
-- with no package at all (07, 09, 13, 31, 32, 33, 34).
--   A. plan_act_masters.self_performed: work the main contractor does itself (setting out, snagging, handover,
--      inspections). Such an activity needs no package and never counts as "No package". Not versioned (like trade).
--   B. 19 new catalogue packages for the uncovered divisions, plus precast, testing and medical gases.
--   C. The 4 Division 03 packages get their missing trade and default lead time.
--   D. Package links for 235 activities (some take two or three packages, e.g. a combined rebar / formwork / concrete
--      item); matched by master code on the current version, existing links kept.
--   E. The 4 self-performed activities are ticked.
--   F. wl_masters_missing_package(): ids of current activities with no package that are not self-performed, for the
--      Master Activity list's "No package" badge (same pattern as wl_masters_missing_norm).
-- Additive: one new column with a default, inserts, and updates limited to named codes.

-- ── A. Self-performed flag ────────────────────────────────────────────────
alter table public.plan_act_masters add column if not exists self_performed boolean not null default false;
comment on column public.plan_act_masters.self_performed is
  'Work done by the main contractor itself: needs no procurement package (Work Library "No package" ignores it).';

-- ── B. New packages ───────────────────────────────────────────────────────
insert into public.plan_act_procurement_packages
  (code, name, package_type, csi_division_code, trade_category, default_lead_time_days, is_long_lead, description, is_active, sort_order)
select v.code, v.name, v.package_type, v.division, v.trade, v.lead, v.long_lead, v.description, true, 10
from (values
  ('PKG-ARC-WPF', 'Waterproofing', 'subcontract', '07', 'Waterproofing', 21, false, 'Membranes to wet areas, roofs, decks and basements; screed to falls; expansion joints.'),
  ('PKG-ARC-ROOF', 'Roofing & Metal Cladding', 'subcontract', '07', 'Roofing', 45, true, 'Roof sheeting and tiling, insulation, gutters, flashings, skylights, ventilators, wall cladding.'),
  ('PKG-ARC-CEIL', 'Ceilings & Drywall', 'subcontract', '09', 'Ceilings & Partitions', 30, false, 'Suspended and gypsum ceilings, drywall partitions, access panels, mouldings.'),
  ('PKG-ARC-FLOOR', 'Flooring & Tiling', 'subcontract', '09', 'Flooring & Tiling', 30, false, 'Tile and stone, vinyl, timber and epoxy floors, wall tiling, skirting, substrate preparation.'),
  ('PKG-ARC-PAINT', 'Painting, Plaster & Wall Finishes', 'subcontract', '09', 'Painting', 14, false, 'Plaster and render, paint and coatings, wallpaper, line marking, touch-up.'),
  ('PKG-SPC-STRUCT', 'Special & Prefabricated Structures', 'subcontract', '13', 'Special Construction', 60, true, 'Guardhouses, modular cabins, domes and spires, tensile fabric structures.'),
  ('PKG-SPC-POOL', 'Pools & Water Features', 'subcontract', '13', 'Pools', 45, false, 'Pool shells, waterproofing, tiling and coping, fountains.'),
  ('PKG-SPC-MED', 'Healthcare Special Rooms', 'subcontract', '13', 'Clean Rooms', 90, true, 'Operating theatre and clean room fit-out, radiation shielding.'),
  ('PKG-STR-PRECAST', 'Precast Concrete Elements', 'subcontract', '03', 'Precast Concrete', 60, true, 'Precast girders and segments, with erection.'),
  ('PKG-CIV-EARTH', 'Earthworks & Excavation', 'subcontract', '31', 'Earthworks', 14, false, 'Clearing, stripping, cut and fill, excavation, backfill, sub-base, hardcore and DPM.'),
  ('PKG-CIV-PILE', 'Piling', 'subcontract', '31', 'Piling', 45, true, 'Bored and driven piles.'),
  ('PKG-CIV-GEO', 'Ground Engineering & Treatment', 'subcontract', '31', 'Ground Engineering', 30, false, 'Shoring, dewatering, ground improvement, slope and erosion protection, anti-termite.'),
  ('PKG-PRE-TEST', 'Testing, Inspection & Surveys', 'service', '01', 'Testing Services', 14, false, 'Load tests, pile integrity tests and third-party inspection.'),
  ('PKG-EXT-ROAD', 'Roads & Paving', 'subcontract', '32', 'Roadworks', 30, false, 'Sub-base and base, asphalt, kerbs, footpaths, paving, car parks, yard pavements, road marking.'),
  ('PKG-EXT-LAND', 'Landscaping, Fencing & Sports', 'subcontract', '32', 'Landscaping', 30, false, 'Softscape, fencing and gates, playgrounds and sports courts.'),
  ('PKG-CIV-DRAIN', 'Drainage & Sewerage', 'subcontract', '33', 'Drainage', 30, false, 'Culverts, drains, manholes, subsoil drains, septic tanks and sewer connections.'),
  ('PKG-CIV-WATER', 'Water Mains & External Utilities', 'subcontract', '33', 'Pipelines', 45, false, 'Water mains, valves, hydrants, house connections, HDD crossings, pumps, utility ducts.'),
  ('PKG-CIV-TRAFFIC', 'Road Furniture & Traffic Systems', 'subcontract', '34', 'Traffic Systems', 60, true, 'Crash barriers, traffic signs and gantries, signals.'),
  ('PKG-MEP-MGAS', 'Medical & Laboratory Gases', 'subcontract', '22', 'Medical Gases', 90, true, 'Medical and lab gas pipework, outlets, bed-head units, plant and manifolds.')

) v(code, name, package_type, division, trade, lead, long_lead, description)
join public.csi_divisions d on d.code = v.division
on conflict (code) do nothing;

-- ── C. Division 03 package details (only where still empty) ───────────────
update public.plan_act_procurement_packages p
   set trade_category = coalesce(p.trade_category, v.trade),
       default_lead_time_days = coalesce(p.default_lead_time_days, v.lead)
  from (values
    ('PKG-STR-CONC-01', 'Concrete', 7), ('PKG-STR-FORM-01', 'Formwork', 21),
    ('PKG-STR-MISC', 'Construction Materials', 7), ('PKG-STR-REBAR-01', 'Reinforcement', 14)
  ) v(code, trade, lead)
 where p.code = v.code and (p.trade_category is null or p.default_lead_time_days is null);

-- ── D. Activity -> package links ──────────────────────────────────────────
insert into public.plan_act_master_procurement_packages (master_id, package_id, sort_order)
select m.id, p.id, 10 * row_number() over (partition by m.id order by v.ord)
from (select x.master_code, x.package_code, row_number() over () ord from (values
  ('ARC-FIN-FLR-008', 'PKG-PRE-CLEAN'), ('CIV-BRG-016', 'PKG-PRE-TEST'), ('PRE-CLS-002', 'PKG-PRE-SITE'), ('ARC-FIN-FLR-002', 'PKG-STR-CONC-01'),
  ('CIV-BRG-004', 'PKG-STR-REBAR-01'), ('CIV-BRG-005', 'PKG-STR-FORM-01'), ('CIV-BRG-006', 'PKG-STR-CONC-01'), ('CIV-BRG-007', 'PKG-STR-CONC-01'),
  ('CIV-BRG-007', 'PKG-STR-REBAR-01'), ('CIV-BRG-007', 'PKG-STR-FORM-01'), ('CIV-BRG-009', 'PKG-STR-PRECAST'), ('CIV-BRG-009', 'PKG-PRE-CRANE'),
  ('CIV-BRG-010', 'PKG-STR-REBAR-01'), ('CIV-BRG-011', 'PKG-STR-FORM-01'), ('CIV-BRG-012', 'PKG-STR-CONC-01'), ('CIV-BRG-014', 'PKG-STR-CONC-01'),
  ('CIV-STR-001', 'PKG-STR-REBAR-01'), ('CIV-STR-002', 'PKG-STR-FORM-01'), ('CIV-STR-003', 'PKG-STR-CONC-01'), ('CIV-STR-004', 'PKG-STR-CONC-01'),
  ('IND-FLR-002', 'PKG-STR-REBAR-01'), ('IND-FLR-003', 'PKG-STR-CONC-01'), ('IND-FLR-003', 'PKG-STR-MISC'), ('IND-FLR-004', 'PKG-STR-CONC-01'),
  ('IND-FLR-004', 'PKG-STR-MISC'), ('IND-FND-001', 'PKG-STR-CONC-01'), ('IND-FND-001', 'PKG-STR-REBAR-01'), ('IND-FND-001', 'PKG-STR-FORM-01'),
  ('IND-FND-002', 'PKG-STR-CONC-01'), ('IND-FND-002', 'PKG-STR-REBAR-01'), ('IND-FND-002', 'PKG-STR-FORM-01'), ('STR-RC-BEAM-001', 'PKG-STR-REBAR-01'),
  ('STR-RC-BEAM-002', 'PKG-STR-FORM-01'), ('STR-RC-BEAM-003', 'PKG-STR-CONC-01'), ('STR-RC-COL-001', 'PKG-STR-REBAR-01'), ('STR-RC-COL-002', 'PKG-STR-FORM-01'),
  ('STR-RC-COL-003', 'PKG-STR-CONC-01'), ('STR-RC-CORE-001', 'PKG-STR-REBAR-01'), ('STR-RC-CORE-002', 'PKG-STR-FORM-01'), ('STR-RC-CORE-003', 'PKG-STR-CONC-01'),
  ('STR-RC-FDN-001', 'PKG-STR-REBAR-01'), ('STR-RC-FDN-002', 'PKG-STR-FORM-01'), ('STR-RC-FDN-003', 'PKG-STR-CONC-01'), ('STR-RC-SLAB-002', 'PKG-STR-FORM-01'),
  ('STR-RC-SLAB-003', 'PKG-MEP-ELEC'), ('STR-RC-SLAB-003', 'PKG-MEP-PLB'), ('STR-RC-SLAB-004', 'PKG-STR-REBAR-01'), ('STR-RC-SLAB-005', 'PKG-STR-REBAR-01'),
  ('STR-RC-SLAB-007', 'PKG-STR-CONC-01'), ('STR-RC-SLAB-008', 'PKG-STR-MISC'), ('STR-RC-SLAB-009', 'PKG-STR-MISC'), ('STR-RC-SLAB-010', 'PKG-STR-FORM-01'),
  ('STR-RC-STAIR-001', 'PKG-STR-REBAR-01'), ('STR-RC-STAIR-002', 'PKG-STR-FORM-01'), ('STR-RC-STAIR-003', 'PKG-STR-CONC-01'), ('STR-RC-WALL-001', 'PKG-STR-REBAR-01'),
  ('STR-RC-WALL-002', 'PKG-STR-FORM-01'), ('STR-RC-WALL-003', 'PKG-STR-CONC-01'), ('STR-SUB-BSM-005', 'PKG-STR-REBAR-01'), ('STR-SUB-BSM-006', 'PKG-STR-CONC-01'),
  ('STR-SUB-BSM-007', 'PKG-STR-REBAR-01'), ('STR-SUB-BSM-008', 'PKG-STR-FORM-01'), ('STR-SUB-BSM-009', 'PKG-STR-CONC-01'), ('STR-SUB-FTG-001', 'PKG-STR-CONC-01'),
  ('STR-SUB-FTG-002', 'PKG-STR-REBAR-01'), ('STR-SUB-FTG-003', 'PKG-STR-FORM-01'), ('STR-SUB-FTG-004', 'PKG-STR-CONC-01'), ('STR-SUB-GB-001', 'PKG-STR-REBAR-01'),
  ('STR-SUB-GB-002', 'PKG-STR-FORM-01'), ('STR-SUB-GB-003', 'PKG-STR-CONC-01'), ('STR-SUB-SOG-002', 'PKG-STR-REBAR-01'), ('STR-SUB-SOG-003', 'PKG-STR-CONC-01'),
  ('ARC-MAS-BLK-001', 'PKG-ARC-MAS'), ('EXT-FEN-001', 'PKG-ARC-MAS'), ('INS-CIV-003', 'PKG-ARC-MAS'), ('ARC-JNR-003', 'PKG-ARC-METAL'),
  ('CIV-BRG-008', 'PKG-STR-STEEL'), ('IND-STL-CRN-001', 'PKG-STR-STEEL'), ('IND-STL-MEZ-001', 'PKG-STR-STEEL'), ('IND-STL-PEB-001', 'PKG-STR-STEEL'),
  ('IND-STL-PEB-002', 'PKG-STR-STEEL'), ('IND-STL-PEB-003', 'PKG-STR-STEEL'), ('IND-STL-PEB-004', 'PKG-STR-STEEL'), ('IND-STL-PEB-005', 'PKG-STR-STEEL'),
  ('ARC-JNR-001', 'PKG-ARC-JOIN'), ('ARC-JNR-002', 'PKG-ARC-JOIN'), ('ARC-JNR-004', 'PKG-ARC-JOIN'), ('ARC-RF-001', 'PKG-STR-STEEL'),
  ('ARC-FIN-FLR-003', 'PKG-ARC-WPF'), ('ARC-RF-002', 'PKG-ARC-ROOF'), ('ARC-RF-003', 'PKG-ARC-ROOF'), ('ARC-RF-004', 'PKG-ARC-ROOF'),
  ('ARC-RF-005', 'PKG-ARC-WPF'), ('ARC-RF-006', 'PKG-ARC-WPF'), ('ARC-RF-007', 'PKG-ARC-ROOF'), ('CIV-BRG-013', 'PKG-ARC-WPF'),
  ('CIV-BRG-015', 'PKG-ARC-WPF'), ('IND-ENV-CLD-001', 'PKG-ARC-ROOF'), ('IND-ENV-CLD-002', 'PKG-ARC-ROOF'), ('IND-ENV-RF-001', 'PKG-ARC-ROOF'),
  ('IND-ENV-RF-002', 'PKG-ARC-ROOF'), ('IND-ENV-RF-003', 'PKG-ARC-ROOF'), ('IND-ENV-RF-004', 'PKG-ARC-ROOF'), ('STR-SUB-BSM-004', 'PKG-ARC-WPF'),
  ('ARC-DW-001', 'PKG-ARC-DOOR'), ('ARC-DW-002', 'PKG-ARC-DOOR'), ('ARC-DW-003', 'PKG-ARC-ALUM'), ('ARC-DW-004', 'PKG-ARC-ALUM'),
  ('ARC-FAC-001', 'PKG-ARC-ALUM'), ('IND-ENV-DOR-001', 'PKG-ARC-DOOR'), ('ARC-FIN-CLG-001', 'PKG-ARC-CEIL'), ('ARC-FIN-CLG-002', 'PKG-ARC-CEIL'),
  ('ARC-FIN-CLG-003', 'PKG-ARC-CEIL'), ('ARC-FIN-CLG-004', 'PKG-ARC-CEIL'), ('ARC-FIN-CLG-005', 'PKG-ARC-PAINT'), ('ARC-FIN-FLR-001', 'PKG-ARC-FLOOR'),
  ('ARC-FIN-FLR-004', 'PKG-ARC-FLOOR'), ('ARC-FIN-FLR-005', 'PKG-ARC-FLOOR'), ('ARC-FIN-FLR-006', 'PKG-ARC-FLOOR'), ('ARC-FIN-FLR-007', 'PKG-ARC-FLOOR'),
  ('ARC-FIN-WAL-001', 'PKG-ARC-PAINT'), ('ARC-FIN-WAL-002', 'PKG-ARC-PAINT'), ('ARC-FIN-WAL-003', 'PKG-ARC-FLOOR'), ('ARC-FIN-WAL-004', 'PKG-ARC-PAINT'),
  ('ARC-FIN-WAL-005', 'PKG-ARC-PAINT'), ('ARC-FIN-WAL-006', 'PKG-ARC-PAINT'), ('IND-FLR-005', 'PKG-ARC-FLOOR'), ('IND-FLR-006', 'PKG-ARC-PAINT'),
  ('INS-CIV-002', 'PKG-ARC-CEIL'), ('ARC-FIN-WAL-007', 'PKG-ARC-CEIL'), ('EXT-SGN-001', 'PKG-ARC-SPEC'), ('IND-OPS-001', 'PKG-ARC-SPEC'),
  ('INS-EDU-001', 'PKG-ARC-SPEC'), ('INS-MED-007', 'PKG-ARC-SPEC'), ('IND-ENV-DOR-002', 'PKG-ARC-SPEC'), ('INS-EDU-002', 'PKG-ARC-FFE'),
  ('INS-LAB-001', 'PKG-ARC-FFE'), ('EXT-GH-001', 'PKG-SPC-STRUCT'), ('EXT-POOL-001', 'PKG-SPC-POOL'), ('EXT-POOL-002', 'PKG-SPC-POOL'),
  ('INS-CIV-001', 'PKG-SPC-STRUCT'), ('INS-MED-004', 'PKG-SPC-MED'), ('INS-MED-005', 'PKG-SPC-MED'), ('ARC-SPC-011', 'PKG-SPC-STRUCT'),
  ('ARC-SPC-010', 'PKG-SPC-POOL'), ('ARC-SPC-009', 'PKG-SPC-STRUCT'), ('IND-STL-CRN-002', 'PKG-MEP-LIFT'), ('IND-MEP-002', 'PKG-MEP-FIRE'),
  ('MEP-FP-001', 'PKG-MEP-FIRE'), ('MEP-FP-002', 'PKG-MEP-FIRE'), ('MEP-FP-003', 'PKG-MEP-FIRE'), ('MEP-FP-005', 'PKG-MEP-FIRE'),
  ('MEP-FP-006', 'PKG-MEP-FIRE'), ('IND-MEP-003', 'PKG-MEP-PLB'), ('INS-LAB-002', 'PKG-MEP-MGAS'), ('INS-MED-001', 'PKG-MEP-MGAS'),
  ('INS-MED-002', 'PKG-MEP-MGAS'), ('INS-MED-003', 'PKG-MEP-MGAS'), ('MEP-PLB-001', 'PKG-MEP-PLB'), ('MEP-PLB-002', 'PKG-MEP-PLB'),
  ('MEP-PLB-003', 'PKG-MEP-PLB'), ('MEP-PLB-004', 'PKG-MEP-PLB'), ('MEP-PLB-005', 'PKG-MEP-PLB'), ('MEP-PLB-006', 'PKG-MEP-PLB'),
  ('IND-MEP-004', 'PKG-MEP-HVAC'), ('MEP-HVAC-001', 'PKG-MEP-HVAC'), ('MEP-HVAC-002', 'PKG-MEP-HVAC'), ('MEP-HVAC-003', 'PKG-MEP-HVAC'),
  ('MEP-HVAC-004', 'PKG-MEP-HVAC'), ('MEP-HVAC-005', 'PKG-MEP-HVAC'), ('MEP-HVAC-007', 'PKG-MEP-HVAC'), ('MEP-HVAC-006', 'PKG-ELV-BMS'),
  ('CIV-RFN-005', 'PKG-MEP-ELEC'), ('CIV-UTL-002', 'PKG-MEP-ELEC'), ('CIV-UTL-003', 'PKG-MEP-ELEC'), ('EXT-LGT-001', 'PKG-MEP-ELEC'),
  ('IND-MEP-001', 'PKG-MEP-ELEC'), ('IND-MEP-005', 'PKG-MEP-ELEC'), ('IND-MEP-006', 'PKG-MEP-ELEC'), ('MEP-ELE-001', 'PKG-MEP-ELEC'),
  ('MEP-ELE-002', 'PKG-MEP-ELEC'), ('MEP-ELE-003', 'PKG-MEP-ELEC'), ('MEP-ELE-004', 'PKG-MEP-ELEC'), ('MEP-ELE-005', 'PKG-MEP-ELEC'),
  ('MEP-ELE-006', 'PKG-MEP-ELEC'), ('MEP-ELE-007', 'PKG-MEP-ELEC'), ('MEP-ELE-008', 'PKG-MEP-ELEC'), ('MEP-ELE-009', 'PKG-MEP-ELEC'),
  ('CIV-UTL-004', 'PKG-ELV-ICT'), ('INS-ELV-001', 'PKG-ELV-ICT'), ('INS-MED-006', 'PKG-ELV-ICT'), ('MEP-FP-004', 'PKG-MEP-FIRE'),
  ('CIV-BRG-001', 'PKG-CIV-PILE'), ('CIV-BRG-002', 'PKG-PRE-TEST'), ('CIV-DRN-005', 'PKG-CIV-GEO'), ('CIV-EW-001', 'PKG-CIV-EARTH'),
  ('CIV-EW-002', 'PKG-CIV-EARTH'), ('CIV-EW-003', 'PKG-CIV-EARTH'), ('CIV-EW-004', 'PKG-CIV-EARTH'), ('CIV-EW-005', 'PKG-CIV-GEO'),
  ('CIV-EW-006', 'PKG-CIV-GEO'), ('CIV-EW-007', 'PKG-CIV-EARTH'), ('CIV-PIP-001', 'PKG-CIV-EARTH'), ('IND-FLR-001', 'PKG-CIV-EARTH'),
  ('STR-SUB-BSM-001', 'PKG-CIV-EARTH'), ('STR-SUB-BSM-002', 'PKG-CIV-GEO'), ('STR-SUB-BSM-003', 'PKG-CIV-GEO'), ('STR-SUB-EXC-001', 'PKG-CIV-EARTH'),
  ('STR-SUB-EXC-002', 'PKG-CIV-EARTH'), ('STR-SUB-EXC-003', 'PKG-CIV-GEO'), ('STR-SUB-SOG-001', 'PKG-CIV-EARTH'), ('CIV-PAV-001', 'PKG-EXT-ROAD'),
  ('CIV-PAV-002', 'PKG-EXT-ROAD'), ('CIV-PAV-003', 'PKG-EXT-ROAD'), ('CIV-PAV-004', 'PKG-EXT-ROAD'), ('CIV-PAV-005', 'PKG-EXT-ROAD'),
  ('CIV-PAV-006', 'PKG-EXT-ROAD'), ('CIV-PAV-007', 'PKG-EXT-ROAD'), ('CIV-PIP-008', 'PKG-EXT-ROAD'), ('CIV-RFN-003', 'PKG-EXT-ROAD'),
  ('EXT-FEN-002', 'PKG-EXT-LAND'), ('EXT-LND-001', 'PKG-EXT-LAND'), ('EXT-PAV-001', 'PKG-EXT-ROAD'), ('EXT-PAV-002', 'PKG-EXT-ROAD'),
  ('EXT-PAV-003', 'PKG-EXT-ROAD'), ('EXT-SPT-001', 'PKG-EXT-LAND'), ('CIV-DRN-001', 'PKG-CIV-DRAIN'), ('CIV-DRN-002', 'PKG-CIV-DRAIN'),
  ('CIV-DRN-003', 'PKG-CIV-DRAIN'), ('CIV-DRN-004', 'PKG-CIV-DRAIN'), ('CIV-PIP-002', 'PKG-CIV-WATER'), ('CIV-PIP-003', 'PKG-CIV-WATER'),
  ('CIV-PIP-004', 'PKG-CIV-WATER'), ('CIV-PIP-005', 'PKG-CIV-WATER'), ('CIV-PIP-006', 'PKG-CIV-WATER'), ('CIV-PIP-009', 'PKG-CIV-WATER'),
  ('CIV-PIP-010', 'PKG-CIV-WATER'), ('CIV-UTL-001', 'PKG-MEP-ELEC'), ('EXT-DRN-001', 'PKG-CIV-DRAIN'), ('EXT-SEP-001', 'PKG-CIV-DRAIN'),
  ('EXT-UTL-001', 'PKG-CIV-WATER'), ('CIV-FAC-001', 'PKG-CIV-WATER'), ('CIV-RFN-001', 'PKG-CIV-TRAFFIC'), ('CIV-RFN-002', 'PKG-CIV-TRAFFIC'),
  ('CIV-RFN-004', 'PKG-CIV-TRAFFIC')

) x(master_code, package_code)) v
join public.plan_act_masters m on m.code = v.master_code and m.status not in ('superseded', 'archived')
join public.plan_act_procurement_packages p on p.code = v.package_code
on conflict (master_id, package_id) do nothing;

-- ── E. Self-performed activities ──────────────────────────────────────────
update public.plan_act_masters m set self_performed = true
 where m.code in ('STR-RC-SLAB-001', 'PRE-CLS-004', 'PRE-CLS-003', 'STR-RC-SLAB-006')
   and m.status not in ('superseded', 'archived') and not m.self_performed;

-- ── F. "No package" flag ──────────────────────────────────────────────────
create or replace function public.wl_masters_missing_package()
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select m.id
    from public.plan_act_masters m
   where m.status not in ('superseded', 'archived')
     and not m.self_performed
     and not exists (select 1 from public.plan_act_master_procurement_packages x where x.master_id = m.id);
$function$;

revoke all on function public.wl_masters_missing_package() from public, anon;
grant execute on function public.wl_masters_missing_package() to authenticated;
