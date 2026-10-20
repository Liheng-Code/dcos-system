-- Seed: Activity Template TPL-BLD-TYP-FLOOR-001 "Typical Floor – Full Cycle" (doc 21, gap after Phase 3).
-- One recipe per typical floor: structure (columns, shear walls, beams, slab, stairs), MEP first fix, finishes,
-- MEP second fix, with the standard logic between them and a link from one floor's slab pour to the next floor's
-- setting out. Durations come from the QS Bridge quantities x productivity standards; only the three activities that
-- are fixed by nature (survey, MEP embedded items, pre-pour inspection) carry a fixed duration.
-- Draft: the Planning Manager reviews the logic and activates it in Activity Library > Templates.
-- Idempotent: creates the template once; items and links are only written while the template has none.
-- Depends on: seed_activity_library.sql, seed_planning_qs_bridge.sql.

insert into public.plan_act_templates (code, name, description, domain_id, status, version, applies_to_level_types, owner,
  inter_level_from_seq, inter_level_to_seq, inter_level_relation, inter_level_lag_days)
select 'TPL-BLD-TYP-FLOOR-001', 'Typical Floor – Full Cycle (Structure, MEP, Finishes)',
  'Columns, shear walls, beams, slab and stairs; MEP first fix; blockwork to painting; MEP second fix. Next floor setting out starts 1 day after this floor''s slab pour.',
  d.id, 'draft', 1, array['typical'], 'Planning Manager', 17, 1, 'fs', 1
from public.plan_act_domains d
where d.code = 'STR'
  and not exists (select 1 from public.plan_act_templates t where t.code = 'TPL-BLD-TYP-FLOOR-001');

-- Same applicability as the RC floor template: reinforced concrete, typical floor.
insert into public.plan_act_applicability (target_type, target_id, attribute, operator, values)
select 'template', t.id, v.attribute, v.operator, v.vals
from public.plan_act_templates t
cross join (values
  ('structure_type', 'eq', array['reinforced_concrete']),
  ('building_component', 'in', array['typical_floor'])
) as v(attribute, operator, vals)
where t.code = 'TPL-BLD-TYP-FLOOR-001' and t.status = 'draft'
  and not exists (select 1 from public.plan_act_applicability a where a.target_type = 'template' and a.target_id = t.id);

-- Items: seq, master, fixed duration (null = from quantity), note
insert into public.plan_act_template_items (template_id, seq, master_id, scope, duration_days_override, is_milestone, note)
select t.id, v.seq, m.id, 'floor', v.fixed_days, false, v.note
from public.plan_act_templates t
cross join (values
  -- structure
  ( 1, 'STR-RC-SLAB-001',  0.5::numeric, 'Setting out from the floor below'),
  ( 2, 'STR-RC-COL-001',   null, null),
  ( 3, 'STR-RC-WALL-001',  null, 'Starts with column rebar'),
  ( 4, 'STR-RC-COL-002',   null, null),
  ( 5, 'STR-RC-WALL-002',  null, null),
  ( 6, 'STR-RC-COL-003',   null, null),
  ( 7, 'STR-RC-WALL-003',  null, null),
  ( 8, 'STR-RC-SLAB-002',  null, 'After vertical elements are cast'),
  ( 9, 'STR-RC-BEAM-002',  null, 'With slab formwork'),
  (10, 'STR-RC-BEAM-001',  null, null),
  (11, 'STR-RC-SLAB-003',  1::numeric, 'Conduits / sleeves cast in the slab'),
  (12, 'STR-RC-SLAB-004',  null, null),
  (13, 'STR-RC-SLAB-005',  null, 'After embedded items'),
  (14, 'STR-RC-STAIR-002', null, 'After columns are cast'),
  (15, 'STR-RC-STAIR-001', null, null),
  (16, 'STR-RC-SLAB-006',  0.5::numeric, 'Hold point: slab, beam and stair reinforcement'),
  (17, 'STR-RC-SLAB-007',  null, 'Drives the next floor''s setting out'),
  (18, 'STR-RC-BEAM-003',  null, 'Cast with the slab'),
  (19, 'STR-RC-STAIR-003', null, 'Cast with the slab'),
  (20, 'STR-RC-SLAB-008',  null, null),
  (21, 'STR-RC-SLAB-009',  null, null),
  (22, 'STR-RC-SLAB-010',  null, '3 days after curing starts'),
  -- MEP first fix
  (23, 'MEP-ELE-001',      null, null),
  (24, 'MEP-PLB-001',      null, null),
  (25, 'MEP-PLB-003',      null, null),
  (26, 'MEP-FP-001',       null, null),
  (27, 'MEP-HVAC-003',     null, null),
  (28, 'MEP-HVAC-001',     null, null),
  -- finishes
  (29, 'ARC-MAS-BLK-001',  null, 'After formwork is stripped'),
  (30, 'ARC-FIN-WAL-002',  null, 'After blockwork and in-wall first fix'),
  (31, 'ARC-FIN-FLR-003',  null, 'Wet areas'),
  (32, 'ARC-FIN-FLR-002',  null, null),
  (33, 'ARC-FIN-WAL-003',  null, null),
  (34, 'ARC-FIN-FLR-004',  null, null),
  (35, 'ARC-FIN-CLG-001',  null, 'After ceiling-void services'),
  (36, 'ARC-FIN-CLG-003',  null, null),
  (37, 'ARC-DW-001',       null, null),
  (38, 'ARC-DW-003',       null, null),
  (39, 'ARC-FIN-WAL-004',  null, null),
  -- MEP second fix
  (40, 'MEP-ELE-002',      null, null),
  (41, 'MEP-ELE-006',      null, null),
  (42, 'MEP-ELE-005',      null, null),
  (43, 'MEP-FP-002',       null, null),
  (44, 'MEP-HVAC-002',     null, 'Units above the ceiling before boards'),
  (45, 'MEP-HVAC-004',     null, null),
  (46, 'MEP-PLB-004',      null, null),
  (47, 'ARC-DW-002',       null, 'Door leaves last, after painting and flooring')
) as v(seq, master_code, fixed_days, note)
join lateral (
  -- the active version of the master, else its newest version
  select mm.id from public.plan_act_masters mm
  where mm.code = v.master_code and mm.status in ('active', 'approved', 'under_review', 'draft')
  order by (mm.status = 'active') desc, mm.version desc limit 1
) m on true
where t.code = 'TPL-BLD-TYP-FLOOR-001' and t.status = 'draft'
  and not exists (select 1 from public.plan_act_template_items i where i.template_id = t.id);

-- Links: successor seq, predecessor seq, relation, lag (working days)
insert into public.plan_act_template_dependencies (template_id, predecessor_item_id, successor_item_id, relation, lag_days, is_optional)
select t.id, p.id, s.id, v.rel, v.lag, false
from public.plan_act_templates t
cross join (values
  ( 2,  1, 'fs', 0), ( 3,  2, 'ss', 0), ( 4,  2, 'fs', 0), ( 5,  3, 'fs', 0), ( 6,  4, 'fs', 0), ( 7,  5, 'fs', 0),
  ( 8,  6, 'fs', 0), ( 8,  7, 'fs', 0), ( 9,  8, 'ss', 0), (10,  9, 'fs', 0), (11,  8, 'fs', 0), (12,  8, 'fs', 0),
  (13, 12, 'fs', 0), (13, 11, 'fs', 0), (14,  6, 'fs', 0), (15, 14, 'fs', 0),
  (16, 13, 'fs', 0), (16, 10, 'fs', 0), (16, 15, 'fs', 0),
  (17, 16, 'fs', 0), (18, 17, 'ss', 0), (19, 17, 'ss', 0), (20, 17, 'fs', 0), (21, 20, 'fs', 0), (22, 21, 'fs', 3),
  (23, 22, 'fs', 0), (24, 22, 'fs', 0), (25, 22, 'fs', 0), (26, 22, 'fs', 0), (27, 22, 'fs', 0), (28, 22, 'fs', 0),
  (29, 22, 'fs', 0), (30, 29, 'fs', 0), (30, 23, 'fs', 0), (30, 24, 'fs', 0), (31, 30, 'fs', 0), (32, 31, 'fs', 0),
  (33, 31, 'fs', 0), (34, 32, 'fs', 0), (35, 26, 'fs', 0), (35, 27, 'fs', 0), (35, 28, 'fs', 0), (35, 30, 'fs', 0),
  (36, 35, 'fs', 0), (37, 29, 'fs', 0), (38, 29, 'fs', 0), (39, 36, 'fs', 0), (39, 33, 'fs', 0),
  (40, 23, 'fs', 0), (40, 30, 'fs', 0), (41, 39, 'fs', 0), (41, 40, 'fs', 0), (42, 36, 'fs', 0), (42, 40, 'fs', 0),
  (43, 36, 'fs', 0), (44, 35, 'fs', 0), (45, 36, 'fs', 0), (46, 33, 'fs', 0), (46, 34, 'fs', 0), (46, 25, 'fs', 0),
  (47, 39, 'fs', 0), (47, 34, 'fs', 0), (47, 37, 'fs', 0)
) as v(succ, pred, rel, lag)
join public.plan_act_template_items s on s.template_id = t.id and s.seq = v.succ
join public.plan_act_template_items p on p.template_id = t.id and p.seq = v.pred
where t.code = 'TPL-BLD-TYP-FLOOR-001' and t.status = 'draft'
  and not exists (select 1 from public.plan_act_template_dependencies d where d.template_id = t.id);

-- Default crews (starting figures, aimed at a ~2-week structural floor cycle; the Planning Manager tunes them).
-- Set only while an item is still at 1 crew, so a planner's own figure is never overwritten.
update public.plan_act_template_items i
set crews = v.crews
from public.plan_act_templates t, public.plan_act_masters m,
  (values
    ('STR-RC-COL-001', 4), ('STR-RC-COL-002', 2), ('STR-RC-WALL-002', 2),
    ('STR-RC-SLAB-002', 2), ('STR-RC-BEAM-002', 2), ('STR-RC-BEAM-001', 4),
    ('STR-RC-SLAB-004', 2), ('STR-RC-SLAB-005', 2), ('STR-RC-SLAB-010', 2),
    ('ARC-MAS-BLK-001', 4), ('ARC-FIN-WAL-002', 3), ('ARC-FIN-WAL-003', 2), ('ARC-FIN-FLR-004', 2),
    ('ARC-FIN-WAL-004', 2), ('ARC-FIN-CLG-001', 2), ('ARC-FIN-CLG-003', 2)
  ) as v(code, crews)
where t.id = i.template_id and m.id = i.master_id and m.code = v.code
  and t.code = 'TPL-BLD-TYP-FLOOR-001' and t.status = 'draft'
  and i.crews = 1;
