-- Fix template node codes: ensure every code is unique within its template
-- (wbs_nodes has a unique constraint on (project_id, wbs_code), so duplicate
--  codes like "ZA" or "STR-001" across levels would conflict on clone.)
-- Strategy: prefix zone/room/element codes with their parent level code.

do $fix$
declare
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid;
  n_bld uuid;
  n_l1 uuid; n_l2 uuid; n_l3 uuid; n_l4 uuid;
  n_z1 uuid; n_z2 uuid;
  n_r1 uuid; n_r2 uuid;
begin
  select id into t1 from public.wbs_templates where template_name = 'High-Rise Building';
  select id into t2 from public.wbs_templates where template_name = 'Infrastructure';
  select id into t3 from public.wbs_templates where template_name = 'Factory / Industrial';
  select id into t4 from public.wbs_templates where template_name = 'Residential Tower';
  select id into t5 from public.wbs_templates where template_name = 'Hospital';

  -- Clear and re-seed all 5 templates
  delete from public.wbs_template_nodes where template_id in (t1, t2, t3, t4, t5);

  -- ── T1: High-Rise Building ──────────────────────────────────
  n_bld := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_bld, t1, null, 'building', 'BLD-TA', 'Tower A', 0);

  -- B1
  n_l1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l1, t1, n_bld, 'level', 'B1', 'Basement Level 1', 0);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t1, n_l1, 'zone', 'B1-ZA', 'Zone A', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t1, n_z1, 'room', 'B1-CAR01', 'Car Park 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t1, n_r1, 'element', 'B1-STR001', 'Structural Works', 0),
    (t1, n_r1, 'element', 'B1-MEP001', 'M&E Works', 1);

  -- L01
  n_l2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l2, t1, n_bld, 'level', 'L01', 'Level 01', 1);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t1, n_l2, 'zone', 'L01-ZA', 'Zone A', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t1, n_z1, 'room', 'L01-LOBBY01', 'Lobby 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t1, n_r1, 'element', 'L01-STR001', 'Structural Works', 0),
    (t1, n_r1, 'element', 'L01-ARC001', 'Architectural Finishes', 1),
    (t1, n_r1, 'element', 'L01-MEP001', 'M&E Works', 2);
  n_z2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z2, t1, n_l2, 'zone', 'L01-ZB', 'Zone B', 1);
  n_r2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r2, t1, n_z2, 'room', 'L01-OFF01', 'Office 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t1, n_r2, 'element', 'L01-STR002', 'Structural Works', 0),
    (t1, n_r2, 'element', 'L01-ARC002', 'Architectural Finishes', 1);

  -- L02
  n_l3 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l3, t1, n_bld, 'level', 'L02', 'Level 02', 2);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t1, n_l3, 'zone', 'L02-ZA', 'Zone A', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t1, n_z1, 'room', 'L02-OFF01', 'Office 02', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t1, n_r1, 'element', 'L02-STR001', 'Structural Works', 0),
    (t1, n_r1, 'element', 'L02-ARC001', 'Architectural Finishes', 1);

  -- RF
  n_l4 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l4, t1, n_bld, 'level', 'RF', 'Roof Level', 3);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t1, n_l4, 'zone', 'RF-ZA', 'Zone A', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t1, n_z1, 'room', 'RF-PLT01', 'Plant Room 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t1, n_r1, 'element', 'RF-STR001', 'Structural Works', 0),
    (t1, n_r1, 'element', 'RF-MEP001', 'M&E Works', 1);

  -- ── T2: Infrastructure ──────────────────────────────────────
  n_bld := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_bld, t2, null, 'building', 'SEC-01', 'Section 01 — Road Works', 0);

  n_l1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l1, t2, n_bld, 'level', 'BRG-A', 'Bridge Structure A', 0);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t2, n_l1, 'zone', 'BRG-FDN', 'Foundation Works', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t2, n_z1, 'room', 'PILE-A1', 'Pile Cap A1', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t2, n_r1, 'element', 'CIV-001', 'Civil Works', 0),
    (t2, n_r1, 'element', 'STR-001', 'Structural Works', 1);

  n_z2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z2, t2, n_l1, 'zone', 'BRG-SUP', 'Superstructure', 1);
  n_r2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r2, t2, n_z2, 'room', 'DECK-A', 'Deck Slab A', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t2, n_r2, 'element', 'CIV-002', 'Civil Works', 0),
    (t2, n_r2, 'element', 'STR-002', 'Structural Works', 1);

  n_l2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l2, t2, n_bld, 'level', 'CLV-B', 'Culvert B', 1);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t2, n_l2, 'zone', 'CLV-EARTH', 'Earthworks', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t2, n_z1, 'room', 'CLV-EXCAV', 'Excavation', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t2, n_r1, 'element', 'CIV-003', 'Civil Works', 0);

  n_bld := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_bld, t2, null, 'building', 'SEC-02', 'Section 02 — Utility Works', 1);
  n_l1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l1, t2, n_bld, 'level', 'PIPE-MAIN', 'Water Main Pipe', 0);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t2, n_l1, 'zone', 'PIPE-INST', 'Pipe Installation', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t2, n_z1, 'room', 'PIPE-S01', 'Pipe Section 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t2, n_r1, 'element', 'MEP-001', 'Mechanical Works', 0);

  -- ── T3: Factory / Industrial ────────────────────────────────
  n_bld := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_bld, t3, null, 'building', 'AREA-01', 'Production Area', 0);

  n_l1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l1, t3, n_bld, 'level', 'SYS-PROC', 'Process System', 0);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t3, n_l1, 'zone', 'SUB-PRIM', 'Primary Process', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t3, n_z1, 'room', 'EQ-REACT01', 'Main Reactor', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t3, n_r1, 'element', 'STR-001', 'Structural Support', 0),
    (t3, n_r1, 'element', 'MEP-001', 'Mechanical Works', 1);

  n_l2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l2, t3, n_bld, 'level', 'SYS-UTIL', 'Utility System', 1);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t3, n_l2, 'zone', 'SUB-HVAC', 'HVAC System', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t3, n_z1, 'room', 'EQ-AHU01', 'AHU Unit 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t3, n_r1, 'element', 'MEP-002', 'Mechanical Works', 0),
    (t3, n_r1, 'element', 'ELE-001', 'Electrical Works', 1);

  n_bld := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_bld, t3, null, 'building', 'AREA-02', 'Utility Area', 1);
  n_l1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l1, t3, n_bld, 'level', 'SYS-PWR', 'Power System', 0);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t3, n_l1, 'zone', 'SUB-MV', 'MV Distribution', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t3, n_z1, 'room', 'EQ-MSB01', 'Main Switchboard', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t3, n_r1, 'element', 'ELE-002', 'Electrical Works', 0),
    (t3, n_r1, 'element', 'MEP-003', 'Mechanical Works', 1);

  -- ── T4: Residential Tower ───────────────────────────────────
  n_bld := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_bld, t4, null, 'building', 'BLD-A', 'Block A', 0);

  n_l1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l1, t4, n_bld, 'level', 'B1', 'Basement Level 1', 0);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t4, n_l1, 'zone', 'B1-ZA', 'Zone A', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t4, n_z1, 'room', 'B1-CAR01', 'Car Park 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t4, n_r1, 'element', 'B1-STR001', 'Structural Works', 0),
    (t4, n_r1, 'element', 'B1-MEP001', 'M&E Works', 1);

  n_l2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l2, t4, n_bld, 'level', 'L01', 'Level 01 — Residential', 1);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t4, n_l2, 'zone', 'L01-ZA', 'Zone A', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t4, n_z1, 'room', 'L01-UNIT01', 'Unit A01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t4, n_r1, 'element', 'L01-STR001', 'Structural Works', 0),
    (t4, n_r1, 'element', 'L01-ARC001', 'Interior Finishes', 1);
  n_z2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z2, t4, n_l2, 'zone', 'L01-ZB', 'Zone B', 1);
  n_r2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r2, t4, n_z2, 'room', 'L01-COR01', 'Corridor 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t4, n_r2, 'element', 'L01-ARC002', 'Architectural Finishes', 0);

  n_l3 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l3, t4, n_bld, 'level', 'L02', 'Level 02 — Residential', 2);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t4, n_l3, 'zone', 'L02-ZA', 'Zone A', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t4, n_z1, 'room', 'L02-UNIT01', 'Unit B01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t4, n_r1, 'element', 'L02-STR001', 'Structural Works', 0),
    (t4, n_r1, 'element', 'L02-ARC001', 'Interior Finishes', 1);

  n_l4 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l4, t4, n_bld, 'level', 'RF', 'Roof Level', 3);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t4, n_l4, 'zone', 'RF-ZA', 'Zone A', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t4, n_z1, 'room', 'RF-PLT01', 'Plant Room', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t4, n_r1, 'element', 'RF-MEP001', 'M&E Works', 0);

  -- ── T5: Hospital ────────────────────────────────────────────
  n_bld := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_bld, t5, null, 'building', 'BLD-MED', 'Block A — Medical', 0);

  n_l1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l1, t5, n_bld, 'level', 'L01', 'Ground Floor', 0);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t5, n_l1, 'zone', 'L01-ZA', 'Zone A — Outpatient', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t5, n_z1, 'room', 'L01-OPD01', 'OPD Clinic 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t5, n_r1, 'element', 'L01-STR001', 'Structural Works', 0),
    (t5, n_r1, 'element', 'L01-ARC001', 'Architectural Finishes', 1),
    (t5, n_r1, 'element', 'L01-MEP001', 'M&E Works', 2);
  n_z2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z2, t5, n_l1, 'zone', 'L01-ZB', 'Zone B — Emergency', 1);
  n_r2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r2, t5, n_z2, 'room', 'L01-ER01', 'Emergency Room 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t5, n_r2, 'element', 'L01-STR002', 'Structural Works', 0),
    (t5, n_r2, 'element', 'L01-ARC002', 'Architectural Finishes', 1);

  n_l2 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l2, t5, n_bld, 'level', 'L02', 'First Floor — Ward', 1);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t5, n_l2, 'zone', 'L02-ZA', 'Zone A — General Ward', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t5, n_z1, 'room', 'L02-WARD01', 'Ward 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t5, n_r1, 'element', 'L02-STR001', 'Structural Works', 0),
    (t5, n_r1, 'element', 'L02-ARC001', 'Architectural Finishes', 1);

  n_l3 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_l3, t5, n_bld, 'level', 'L03', 'Second Floor — ICU / OT', 2);
  n_z1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_z1, t5, n_l3, 'zone', 'L03-ZA', 'Zone A — Operating Theatre', 0);
  n_r1 := gen_random_uuid();
  insert into public.wbs_template_nodes (id, template_id, parent_id, node_type, wbs_code, wbs_name, sort_order)
  values (n_r1, t5, n_z1, 'room', 'L03-OT01', 'Operating Theatre 01', 0);
  insert into public.wbs_template_nodes (template_id, parent_id, node_type, wbs_code, wbs_name, sort_order) values
    (t5, n_r1, 'element', 'L03-STR001', 'Structural Works', 0),
    (t5, n_r1, 'element', 'L03-MEP001', 'M&E Works', 1);

end $fix$;
