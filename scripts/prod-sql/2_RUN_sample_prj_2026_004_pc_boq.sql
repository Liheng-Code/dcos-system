-- Sample data for PRODUCTION (run by hand in the Supabase SQL Editor): PRJ-2026-004-PC (7 Story Mix Use Building).
-- WRITES DATA. Run the dry-run file first and check its report.
-- Adds a draft Main Works BOQ (BOQ-002) with Bills 2-6 (117 lines, random but plausible quantities, setseed 0.42),
-- sample BOQ items (codes SMP-*), labour/equipment hours per unit, BOQ item -> activity links, crew sizes,
-- task -> activity links and the BOQ level -> WBS floor location map. It does not create the programme: do that
-- afterwards in Planning > Generate from BOQ (Preview, then Commit with dates).
-- Runs once: if the project already has the sample lines (item codes SMP-*), it stops and changes nothing.
-- The project is found by its code, not a fixed id. Supabase SQL Editor shows only the last result table.
begin;
create temp table smp_proj on commit drop as select id from projects where project_code = 'PRJ-2026-004-PC';
do $$ begin
  if (select count(*) from smp_proj) <> 1 then
    raise exception 'Project PRJ-2026-004-PC not found (or found more than once). Nothing was written.';
  end if;
  if exists (select 1 from qs_boq_items where project_id = (select id from smp_proj) and item_code like 'SMP-%') then
    raise exception 'The sample BOQ is already loaded for PRJ-2026-004-PC. Nothing was written.';
  end if;
end $$;
select setseed(0.42);

-- Bills 2-6 live in their own draft Main Works BOQ; the locked Preliminaries BOQ (BOQ-001) is left untouched.
insert into qs_boq (project_id, boq_number, title, description, boq_type, version, status, currency_code)
select (select id from smp_proj), 'BOQ-002', 'Main Works', 'Sample data: Bills 2-6 (Substructure, Superstructure, Architectural, MEP, External Works)', 'main_works', 1, 'draft', 'USD'
where not exists (select 1 from qs_boq where project_id = (select id from smp_proj) and boq_type = 'main_works');

create temp table smp_stats(k text, v bigint) on commit drop;
create temp table smp_ctx on commit drop as
  select (select id from smp_proj)::uuid as project_id,
         'Sample data PRJ-2026-004-PC'::text as note,
         (select tenant_id from dwl_work_items group by tenant_id order by count(*) desc limit 1) as tenant_id,
         (select id from qs_boq where project_id = (select id from smp_proj) and boq_type = 'main_works' order by created_at limit 1) as boq_id;
do $$ begin
  if (select boq_id from smp_ctx) is null or (select tenant_id from smp_ctx) is null then
    raise exception 'project BOQ or tenant not found';
  end if;
end $$;

-- ---------------------------------------------------------------- source data
create temp table smp_bill(bill int, bill_name text, elemental text) on commit drop;
insert into smp_bill values (2,'Substructure','substructure'),(3,'Superstructure','superstructure'),(4,'Architectural','architectural'),(5,'MEP','mep'),(6,'External Works','external_works');

create temp table smp_src(ord int, bill int, section_code text, section_title text, item_no text, item_code text, description text, unit text,
  base_qty numeric, unit_rate numeric, discipline text, sub_section text, level text, csi text, reuse_code text, labour text, equipment text) on commit drop;
insert into smp_src values
(1,2,'2.1','Earthworks','2.1.01','SMP-STR-001','Site clearance and stripping of topsoil 150 mm','m2',900,1.2,'STR','Earthworks','B1','31 10 00','','Helper:0.04','Excavator:0.008'),
(2,2,'2.1','Earthworks','2.1.02','SMP-STR-002','Bulk excavation to basement formation level and pile cap level by machine','m3',4300,22,'STR','Earthworks','B1','31 20 00','31 20 13','Operator:0.05;Helper:0.03','Excavator:0.05'),
(3,2,'2.1','Earthworks','2.1.03','SMP-STR-003','Disposal of surplus excavated material off site','m3',4300,18,'STR','Earthworks','B1','31 20 00','31 20 16','Helper:0.02','Excavator:0.03'),
(4,2,'2.1','Earthworks','2.1.04','SMP-STR-004','Excavation support to basement perimeter, soldier piles and timber lagging','m2',700,95,'STR','Earthworks','B1','31 50 00','','Operator:0.15;Helper:0.4;Welder:0.1','Piling Rig:0.08'),
(5,2,'2.1','Earthworks','2.1.05','SMP-STR-005','Dewatering of basement excavation, pumps and attendance for construction period','item',1,32000,'STR','Earthworks','B1','31 23 19','','Operator:600;Helper:400',''),
(6,2,'2.1','Earthworks','2.1.06','SMP-STR-006','Backfilling and compaction around basement walls and pile caps in layers','m3',1100,28,'STR','Earthworks','B1','31 20 00','31 20 15','Helper:0.25','Roller:0.04;Excavator:0.03'),
(7,2,'2.2','Piling','2.2.01','SMP-STR-007','Mobilisation and demobilisation of piling rig and pile test equipment','item',1,14000,'STR','Piling','B1','31 60 00','','Operator:60;Helper:120','Piling Rig:40'),
(8,2,'2.2','Piling','2.2.02','SMP-STR-008','Supply and install precast spun pile D300 class B, average 25 m per pile, including splices','m',3250,24,'STR','Piling','B1','31 60 00','','Operator:0.08;Helper:0.12;Welder:0.03','Piling Rig:0.08'),
(9,2,'2.2','Piling','2.2.03','SMP-STR-009','Pile head trimming and exposing of starter bars to cut-off level','no',130,38,'STR','Piling','B1','31 60 00','','Helper:2.0',''),
(10,2,'2.2','Piling','2.2.04','SMP-STR-010','Static pile load test to 1.5 times design load, working pile','no',2,9500,'STR','Piling','B1','31 60 00','','Operator:24;Helper:48','Piling Rig:16'),
(11,2,'2.3','Pile caps and ground beams','2.3.01','SMP-STR-011','Lean concrete blinding C10, 75 mm thick','m3',65,85,'STR','Pile caps and ground beams','B1','03 30 00','','Mason:1.0;Helper:2.0','Concrete Pump:0.05'),
(12,2,'2.3','Pile caps and ground beams','2.3.02','SMP-STR-012','Pile caps in C30 concrete','m3',340,114,'STR','Pile caps and ground beams','B1','03 30 00','03 30 13','Mason:1.4;Helper:2.8','Concrete Pump:0.1'),
(13,2,'2.3','Pile caps and ground beams','2.3.03','SMP-STR-013','Ground beams in C30 concrete','m3',140,139.5,'STR','Pile caps and ground beams','B1','03 30 00','03 30 15','Mason:1.6;Helper:3.0','Concrete Pump:0.1'),
(14,2,'2.3','Pile caps and ground beams','2.3.04','SMP-STR-014','Formwork to sides of pile caps and ground beams','m2',1700,14,'STR','Pile caps and ground beams','B1','03 11 00','','Carpenter:0.7;Helper:0.5',''),
(15,2,'2.3','Pile caps and ground beams','2.3.05','SMP-STR-015','Reinforcement to pile caps and ground beams, cut, bend and fix','kg',58000,0.97,'STR','Pile caps and ground beams','B1','03 21 00','LIB-REB-001','Steel Fixer:0.02;Helper:0.012',''),
(16,2,'2.4','Basement structure','2.4.01','SMP-STR-016','B1 floor slab on grade 200 mm C25 including mesh and power floating','m2',700,26,'STR','Basement structure','B1','03 30 00','03 30 16','Mason:0.25;Helper:0.5','Concrete Pump:0.01'),
(17,2,'2.4','Basement structure','2.4.02','SMP-STR-017','B1 columns in C30 concrete','m3',45,144,'STR','Basement structure','B1','03 30 00','03 30 14','Mason:2.0;Helper:3.5','Concrete Pump:0.12'),
(18,2,'2.4','Basement structure','2.4.03','SMP-STR-018','Formwork to B1 columns','m2',280,16,'STR','Basement structure','B1','03 11 00','','Carpenter:0.9;Helper:0.5',''),
(19,2,'2.4','Basement structure','2.4.04','SMP-STR-019','Reinforcement to B1 columns','kg',9000,0.97,'STR','Basement structure','B1','03 21 00','LIB-REB-001','Steel Fixer:0.022;Helper:0.012',''),
(20,2,'2.4','Basement structure','2.4.05','SMP-STR-020','B1 retaining walls and lift/stair core walls in C30 concrete','m3',190,163.2,'STR','Basement structure','B1','03 30 00','03 30 18','Mason:2.2;Helper:3.8','Concrete Pump:0.12'),
(21,2,'2.4','Basement structure','2.4.06','SMP-STR-021','Formwork to B1 retaining walls and core walls, two faces','m2',1300,15,'STR','Basement structure','B1','03 11 00','','Carpenter:0.8;Helper:0.5',''),
(22,2,'2.4','Basement structure','2.4.07','SMP-STR-022','Reinforcement to B1 retaining walls and core walls','kg',23000,0.97,'STR','Basement structure','B1','03 21 00','LIB-REB-001','Steel Fixer:0.022;Helper:0.012',''),
(23,2,'2.4','Basement structure','2.4.08','SMP-STR-023','B1 beams supporting ground floor slab in C30 concrete','m3',45,139.5,'STR','Basement structure','B1','03 30 00','03 30 15','Mason:1.8;Helper:3.2','Concrete Pump:0.12'),
(24,2,'2.4','Basement structure','2.4.09','SMP-STR-024','Formwork to B1 beams','m2',320,17,'STR','Basement structure','B1','03 11 00','','Carpenter:1.0;Helper:0.6',''),
(25,2,'2.4','Basement structure','2.4.10','SMP-STR-025','Reinforcement to B1 beams','kg',8100,0.97,'STR','Basement structure','B1','03 21 00','LIB-REB-001','Steel Fixer:0.022;Helper:0.012',''),
(26,2,'2.4','Basement structure','2.4.11','SMP-STR-026','B1 staircase flights and landings in C30 concrete','m3',12,209,'STR','Basement structure','B1','03 30 00','03 30 19','Mason:4.0;Helper:5.5','Concrete Pump:0.2'),
(27,2,'2.4','Basement structure','2.4.12','SMP-STR-027','Formwork to B1 staircase','m2',60,28,'STR','Basement structure','B1','03 11 00','','Carpenter:1.4;Helper:0.8',''),
(28,2,'2.4','Basement structure','2.4.13','SMP-STR-028','Reinforcement to B1 staircase','kg',1700,0.97,'STR','Basement structure','B1','03 21 00','LIB-REB-001','Steel Fixer:0.025;Helper:0.014',''),
(29,2,'2.5','Waterproofing','2.5.01','SMP-STR-029','Two-layer torch-on bituminous membrane to B1 slab and external face of retaining walls with protection screed','m2',1260,16,'STR','Waterproofing','B1','07 10 00','','Helper:0.2;Mason:0.1',''),
(30,3,'3.1','Columns and walls','3.1.01','SMP-STR-030','Columns GF to 7F in C30 concrete','m3',210,144,'STR','Columns and walls','All','03 30 00','03 30 14','Mason:2.0;Helper:3.5','Concrete Pump:0.12;Tower Crane:0.25'),
(31,3,'3.1','Columns and walls','3.1.02','SMP-STR-031','Formwork to columns GF to 7F','m2',1600,16,'STR','Columns and walls','All','03 11 00','','Carpenter:0.9;Helper:0.5','Tower Crane:0.04'),
(32,3,'3.1','Columns and walls','3.1.03','SMP-STR-032','Reinforcement to columns GF to 7F','kg',42000,0.97,'STR','Columns and walls','All','03 21 00','LIB-REB-001','Steel Fixer:0.022;Helper:0.012','Tower Crane:0.003'),
(33,3,'3.1','Columns and walls','3.1.04','SMP-STR-033','Shear walls and lift/stair core walls GF to 7F in C30 concrete','m3',320,163.2,'STR','Columns and walls','All','03 30 00','03 30 18','Mason:2.2;Helper:3.8','Concrete Pump:0.12;Tower Crane:0.2'),
(34,3,'3.1','Columns and walls','3.1.05','SMP-STR-034','Formwork to shear and core walls, two faces','m2',2500,15,'STR','Columns and walls','All','03 11 00','','Carpenter:0.8;Helper:0.5','Tower Crane:0.04'),
(35,3,'3.1','Columns and walls','3.1.06','SMP-STR-035','Reinforcement to shear and core walls','kg',35000,0.97,'STR','Columns and walls','All','03 21 00','LIB-REB-001','Steel Fixer:0.022;Helper:0.012','Tower Crane:0.003'),
(36,3,'3.2','Beams and slabs','3.2.01','SMP-STR-036','Suspended beams GF to 7F in C30 concrete','m3',360,139.5,'STR','Beams and slabs','All','03 30 00','03 30 15','Mason:1.8;Helper:3.2','Concrete Pump:0.12;Tower Crane:0.15'),
(37,3,'3.2','Beams and slabs','3.2.02','SMP-STR-037','Formwork to beams GF to 7F','m2',2500,17,'STR','Beams and slabs','All','03 11 00','','Carpenter:1.0;Helper:0.6','Tower Crane:0.04'),
(38,3,'3.2','Beams and slabs','3.2.03','SMP-STR-038','Reinforcement to beams GF to 7F','kg',61000,0.97,'STR','Beams and slabs','All','03 21 00','LIB-REB-001','Steel Fixer:0.022;Helper:0.012','Tower Crane:0.003'),
(39,3,'3.2','Beams and slabs','3.2.04','SMP-STR-039','Suspended slabs 180 mm GF to 7F in C30 concrete','m3',940,135,'STR','Beams and slabs','All','03 30 00','','Mason:1.5;Helper:3.0','Concrete Pump:0.08;Tower Crane:0.05'),
(40,3,'3.2','Beams and slabs','3.2.05','SMP-STR-040','Formwork to slab soffits and edges, 4 reuses','m2',5200,9.19,'STR','Beams and slabs','All','03 11 00','LIB-FWK-001','Carpenter:0.55;Helper:0.35','Tower Crane:0.03'),
(41,3,'3.2','Beams and slabs','3.2.06','SMP-STR-041','Reinforcement to suspended slabs GF to 7F','kg',103000,0.97,'STR','Beams and slabs','All','03 21 00','LIB-REB-001','Steel Fixer:0.02;Helper:0.011','Tower Crane:0.003'),
(42,3,'3.3','Stairs','3.3.01','SMP-STR-042','Staircase flights and landings GF to 7F in C30 concrete','m3',48,209,'STR','Stairs','All','03 30 00','03 30 19','Mason:4.0;Helper:5.5','Concrete Pump:0.2;Tower Crane:0.3'),
(43,3,'3.3','Stairs','3.3.02','SMP-STR-043','Formwork to staircases GF to 7F','m2',430,28,'STR','Stairs','All','03 11 00','','Carpenter:1.4;Helper:0.8','Tower Crane:0.05'),
(44,3,'3.3','Stairs','3.3.03','SMP-STR-044','Reinforcement to staircases GF to 7F','kg',7200,0.97,'STR','Stairs','All','03 21 00','LIB-REB-001','Steel Fixer:0.025;Helper:0.014','Tower Crane:0.004'),
(45,3,'3.4','Roof structure','3.4.01','SMP-STR-045','Roof slab and roof beams including lift overrun in C30 concrete','m3',130,135,'STR','Roof structure','RF','03 30 00','','Mason:1.6;Helper:3.1','Concrete Pump:0.08;Tower Crane:0.1'),
(46,3,'3.4','Roof structure','3.4.02','SMP-STR-046','Formwork to roof slab soffit and edges, 4 reuses','m2',650,9.19,'STR','Roof structure','RF','03 11 00','LIB-FWK-001','Carpenter:0.55;Helper:0.35','Tower Crane:0.03'),
(47,3,'3.4','Roof structure','3.4.03','SMP-STR-047','Reinforcement to roof slab and beams','kg',14300,0.97,'STR','Roof structure','RF','03 21 00','LIB-REB-001','Steel Fixer:0.02;Helper:0.011','Tower Crane:0.003'),
(48,3,'3.4','Roof structure','3.4.04','SMP-STR-048','RC parapet 1.0 m high complete with formwork and reinforcement','m',130,95,'STR','Roof structure','RF','03 30 00','','Carpenter:1.0;Steel Fixer:0.5;Mason:0.6;Helper:1.5','Tower Crane:0.1'),
(49,3,'3.4','Roof structure','3.4.05','SMP-STR-049','MEP embedded items cast into slabs and walls, sleeves, conduit boxes and drainage inserts','item',1,28000,'STR','Roof structure','All','03 15 00','','Electrician:380;Plumber:300;Helper:600',''),
(50,4,'4.1','Masonry','4.1.01','SMP-ARC-001','150 mm hollow concrete blockwork to external walls in cement mortar','m2',2800,14.02,'ARC','Masonry','All','04 22 00','LIB-BLK-001','Mason:0.9;Helper:0.7','Tower Crane:0.01'),
(51,4,'4.1','Masonry','4.1.02','SMP-ARC-002','100 mm AAC block internal partition walls in thin-bed mortar','m2',2900,10.01,'ARC','Masonry','All','04 22 00','ASM-MAS-002','Mason:0.55;Helper:0.4',''),
(52,4,'4.2','Plaster and screed','4.2.01','SMP-ARC-003','Internal cement-sand plaster 15 mm to walls','m2',8600,4.57,'ARC','Plaster and screed','All','09 24 00','LIB-PLA-001','Mason:0.35;Helper:0.25',''),
(53,4,'4.2','Plaster and screed','4.2.02','SMP-ARC-004','External cement-sand render 20 mm with waterproofing admixture','m2',3200,8.5,'ARC','Plaster and screed','All','09 24 00','','Mason:0.55;Helper:0.4',''),
(54,4,'4.2','Plaster and screed','4.2.03','SMP-ARC-005','Cement-sand floor screed 50 mm to receive finishes','m2',4900,6.5,'ARC','Plaster and screed','All','03 53 00','','Mason:0.25;Helper:0.2',''),
(55,4,'4.3','Ceilings','4.3.01','SMP-ARC-006','Suspended gypsum board ceiling on concealed GI frame','m2',3000,8.81,'ARC','Ceilings','All','09 51 00','09.51.010','Carpenter:0.35;Helper:0.2',''),
(56,4,'4.3','Ceilings','4.3.02','SMP-ARC-007','Mineral fibre lay-in ceiling tile 600x600 on exposed T-grid','m2',1500,8.04,'ARC','Ceilings','All','09 51 00','ASM-CEIL-MFT-001','Carpenter:0.25;Helper:0.15',''),
(57,4,'4.4','Floor finishes','4.4.01','SMP-ARC-008','Porcelain floor tile 600x600 on polymer adhesive, grouted','m2',3200,20.54,'ARC','Floor finishes','All','09 30 00','ASM-TIL-001','Tiler:0.55;Helper:0.35',''),
(58,4,'4.4','Floor finishes','4.4.02','SMP-ARC-009','Anti-slip ceramic floor tile 300x300 to wet areas','m2',600,7.65,'ARC','Floor finishes','All','09 30 00','ASM-TIL-004','Tiler:0.6;Helper:0.4',''),
(59,4,'4.4','Floor finishes','4.4.03','SMP-ARC-010','Natural stone flooring to lobby, entrance and stair landings','m2',450,120,'ARC','Floor finishes','All','09 30 00','09 30 16','Tiler:1.0;Helper:0.6',''),
(60,4,'4.4','Floor finishes','4.4.04','SMP-ARC-011','Epoxy floor coating to B1 car park','m2',700,35,'ARC','Floor finishes','B1','09 90 00','09 90 15','Painter:0.25;Helper:0.15',''),
(61,4,'4.5','Wall finishes','4.5.01','SMP-ARC-012','Glazed ceramic wall tile 300x600 to toilets and wet areas','m2',1500,15.95,'ARC','Wall finishes','All','09 30 00','ASM-TIL-003','Tiler:0.7;Helper:0.4',''),
(62,4,'4.6','Doors','4.6.01','SMP-ARC-013','Solid timber door leaf with hardwood door frame and ironmongery, complete','no',130,340,'ARC','Doors','All','08 10 00','','Carpenter:5.0;Helper:2.0',''),
(63,4,'4.6','Doors','4.6.02','SMP-ARC-014','Fire-rated steel door and frame FD60, single leaf','no',60,1250,'ARC','Doors','All','08 10 00','08 10 14','Carpenter:3.5;Helper:2.0',''),
(64,4,'4.6','Doors','4.6.03','SMP-ARC-015','Aluminium glazed door single leaf','no',40,850,'ARC','Doors','All','08 10 00','08 10 15','Carpenter:4.0;Helper:2.0',''),
(65,4,'4.7','Windows and glazing','4.7.01','SMP-ARC-016','Aluminium window with clear glass','m2',900,185,'ARC','Windows and glazing','All','08 50 00','08 50 13','Carpenter:1.6;Helper:0.8',''),
(66,4,'4.7','Windows and glazing','4.7.02','SMP-ARC-017','Aluminium curtain wall system to entrance and lobby facade','m2',260,450,'ARC','Windows and glazing','All','08 40 00','08 50 15','Carpenter:3.0;Helper:1.5','Tower Crane:0.05'),
(67,4,'4.7','Windows and glazing','4.7.03','SMP-ARC-018','10 mm tempered glass to balustrades and lobby partitions','m2',120,95,'ARC','Windows and glazing','All','08 80 00','','Carpenter:1.5;Helper:1.0',''),
(68,4,'4.8','Painting','4.8.01','SMP-ARC-019','Alkali-resistant sealer and primer to internal walls and ceilings','m2',12000,1.1,'ARC','Painting','All','09 90 00','','Painter:0.07;Helper:0.02',''),
(69,4,'4.8','Painting','4.8.02','SMP-ARC-020','Interior emulsion paint, 2 coats over putty','m2',12000,3.2,'ARC','Painting','All','09 90 00','','Painter:0.12;Helper:0.04',''),
(70,4,'4.8','Painting','4.8.03','SMP-ARC-021','External weathershield paint, 2 coats over sealer','m2',3500,4.6,'ARC','Painting','All','09 90 00','','Painter:0.15;Helper:0.05',''),
(71,4,'4.9','Roof finishes and waterproofing','4.9.01','SMP-ARC-022','Liquid polyurethane roof waterproofing 1.5 mm including parapet upstands','m2',750,16.86,'ARC','Roof finishes and waterproofing','RF','07 10 00','ASM-WPF-002','Painter:0.2;Helper:0.25',''),
(72,4,'4.9','Roof finishes and waterproofing','4.9.02','SMP-ARC-023','EPS insulation board 50 mm to roof slab','m2',650,18,'ARC','Roof finishes and waterproofing','RF','07 20 00','07 20 14','Helper:0.12',''),
(73,4,'4.9','Roof finishes and waterproofing','4.9.03','SMP-ARC-024','Cementitious waterproofing to toilets and balconies, 2 coats with wall upturn','m2',1500,8.5,'ARC','Roof finishes and waterproofing','All','07 10 00','','Painter:0.1;Helper:0.2',''),
(74,5,'5.1','Electrical','5.1.01','SMP-MEP-001','PVC conduit 20 mm concealed in slabs and walls, first fix','m',14000,3.2,'MEP','Electrical','All','26 05 00','','Electrician:0.12;Helper:0.06',''),
(75,5,'5.1','Electrical','5.1.02','SMP-MEP-002','Power and lighting cable 2.5 mm2 drawn in conduit, first fix','m',30000,1.4,'MEP','Electrical','All','26 05 19','','Electrician:0.05;Helper:0.02',''),
(76,5,'5.1','Electrical','5.1.03','SMP-MEP-003','Cable tray 200 mm installed with supports','m',1800,10.55,'MEP','Electrical','All','26 05 36','LIB-MEP-003','Electrician:0.25;Helper:0.2','Tower Crane:0.005'),
(77,5,'5.1','Electrical','5.1.04','SMP-MEP-004','Main distribution board and emergency distribution board','no',2,3500,'MEP','Electrical','B1','26 24 00','26 20 13','Electrician:60;Helper:30','Tower Crane:2'),
(78,5,'5.1','Electrical','5.1.05','SMP-MEP-005','Floor sub distribution board','no',18,1800,'MEP','Electrical','All','26 24 00','26 20 14','Electrician:12;Helper:6',''),
(79,5,'5.1','Electrical','5.1.06','SMP-MEP-006','Lighting point complete with wiring, second fix','no',1900,27.74,'MEP','Electrical','All','26 51 00','LIB-MEP-001','Electrician:1.1;Helper:0.5',''),
(80,5,'5.1','Electrical','5.1.07','SMP-MEP-007','LED panel light 600x600 supply and install','no',850,185,'MEP','Electrical','All','26 51 00','26 50 13','Electrician:0.5;Helper:0.2',''),
(81,5,'5.1','Electrical','5.1.08','SMP-MEP-008','LED downlight recessed supply and install','no',1400,95,'MEP','Electrical','All','26 51 00','26 50 14','Electrician:0.35;Helper:0.1',''),
(82,5,'5.1','Electrical','5.1.09','SMP-MEP-009','Switches and socket outlets, second fix','no',1700,28,'MEP','Electrical','All','26 27 26','','Electrician:0.6;Helper:0.2',''),
(83,5,'5.1','Electrical','5.1.10','SMP-MEP-010','Earthing and lightning protection system','item',1,22000,'MEP','Electrical','All','26 05 26','','Electrician:400;Helper:500',''),
(84,5,'5.2','ELV','5.2.01','SMP-MEP-011','ELV system, data and telephone outlets, CCTV and access control devices with cabling','no',520,120,'MEP','ELV','All','27 13 00','','Electrician:2.2;Helper:0.8',''),
(85,5,'5.3','Fire alarm','5.3.01','SMP-MEP-012','Fire alarm cabling and conduit, first fix','m',3500,2.2,'MEP','Fire alarm','All','28 31 00','','Electrician:0.07;Helper:0.03',''),
(86,5,'5.3','Fire alarm','5.3.02','SMP-MEP-013','Fire alarm detectors, manual call points and sounders, second fix','no',680,52,'MEP','Fire alarm','All','28 31 00','','Electrician:0.7;Helper:0.2',''),
(87,5,'5.3','Fire alarm','5.3.03','SMP-MEP-014','Addressable fire alarm control panel and graphic repeater','no',1,6200,'MEP','Fire alarm','GF','28 31 00','','Electrician:60;Helper:20',''),
(88,5,'5.4','Plumbing','5.4.01','SMP-MEP-015','PPR water supply pipes 20 to 50 mm installed, first fix','m',3200,3.9,'MEP','Plumbing','All','22 11 16','LIB-MEP-002','Plumber:0.35;Helper:0.2',''),
(89,5,'5.4','Plumbing','5.4.02','SMP-MEP-016','Close-coupled WC suite, second fix','no',66,380,'MEP','Plumbing','All','22 40 00','22 40 13','Plumber:3.5;Helper:1.5',''),
(90,5,'5.4','Plumbing','5.4.03','SMP-MEP-017','Wall-hung wash basin with mixer tap, second fix','no',66,280,'MEP','Plumbing','All','22 40 00','22 40 14','Plumber:2.5;Helper:1.0',''),
(91,5,'5.4','Plumbing','5.4.04','SMP-MEP-018','Water storage tanks and booster pump set','item',1,21000,'MEP','Plumbing','RF','22 30 00','','Plumber:200;Helper:200','Tower Crane:8'),
(92,5,'5.5','Drainage','5.5.01','SMP-MEP-019','UPVC drainage pipe 100 mm with fittings, soil and waste','m',1300,28,'MEP','Drainage','All','22 13 00','22 10 15','Plumber:0.45;Helper:0.25',''),
(93,5,'5.5','Drainage','5.5.02','SMP-MEP-020','UPVC drainage pipe 150 mm with fittings, stacks and collectors','m',420,45,'MEP','Drainage','All','22 13 00','22 10 16','Plumber:0.6;Helper:0.35',''),
(94,5,'5.6','HVAC','5.6.01','SMP-MEP-021','GI ductwork with thermal insulation, first fix','m2',1600,55,'MEP','HVAC','All','23 31 00','','Ductwork Fitter:0.9;Helper:0.5','Tower Crane:0.01'),
(95,5,'5.6','HVAC','5.6.02','SMP-MEP-022','Chilled water pipework, insulated','m',1400,38,'MEP','HVAC','All','23 21 13','','Pipe Fitter:0.5;Welder:0.15;Helper:0.3',''),
(96,5,'5.6','HVAC','5.6.03','SMP-MEP-023','Cassette and ducted fan coil units, second fix','no',140,720,'MEP','HVAC','All','23 80 00','','Ductwork Fitter:5.0;Electrician:2.0;Helper:3.0',''),
(97,5,'5.6','HVAC','5.6.04','SMP-MEP-024','Air handling unit for lobby and common areas','no',4,8500,'MEP','HVAC','All','23 73 00','','Ductwork Fitter:40;Pipe Fitter:30;Helper:50','Tower Crane:4'),
(98,5,'5.6','HVAC','5.6.05','SMP-MEP-025','Air-cooled chiller, roof mounted','no',2,46000,'MEP','HVAC','RF','23 70 00','','Pipe Fitter:100;Electrician:60;Helper:80','Tower Crane:12'),
(99,5,'5.7','Fire fighting','5.7.01','SMP-MEP-026','Black steel fire pipework 25 to 100 mm for sprinkler and hose reel, first fix','m',3600,21,'MEP','Fire fighting','All','21 13 00','','Pipe Fitter:0.4;Welder:0.15;Helper:0.25',''),
(100,5,'5.7','Fire fighting','5.7.02','SMP-MEP-027','Pendant sprinkler heads, second fix','no',760,16,'MEP','Fire fighting','All','21 13 13','','Pipe Fitter:0.4;Helper:0.2',''),
(101,5,'5.7','Fire fighting','5.7.03','SMP-MEP-028','Fire hose reel cabinets complete','no',24,520,'MEP','Fire fighting','All','21 12 00','','Pipe Fitter:3.0;Helper:1.5',''),
(102,5,'5.7','Fire fighting','5.7.04','SMP-MEP-029','Fire pump set and fire water tank','item',1,52000,'MEP','Fire fighting','B1','21 30 00','','Pipe Fitter:240;Electrician:120;Helper:200','Tower Crane:16'),
(103,6,'6.1','Site works','6.1.01','SMP-EXT-001','Imported laterite fill to external platform, compacted','m3',1800,14,'EXT','Site works','EXT','31 23 23','','Operator:0.06;Helper:0.2','Excavator:0.05;Roller:0.04'),
(104,6,'6.2','Drainage','6.2.01','SMP-EXT-002','RC storm drain pipe 450 mm on granular bed including excavation','m',220,48,'EXT','Drainage','EXT','33 41 00','','Pipe Fitter:0.5;Helper:0.6','Excavator:0.08'),
(105,6,'6.2','Drainage','6.2.02','SMP-EXT-003','Brick manholes and catch pits with cover','no',18,420,'EXT','Drainage','EXT','33 49 00','','Mason:6.0;Helper:10.0',''),
(106,6,'6.3','Utilities','6.3.01','SMP-EXT-004','HDPE 110 mm water supply main in trench','m',120,22,'EXT','Utilities','EXT','33 10 00','','Pipe Fitter:0.25;Helper:0.4','Excavator:0.04'),
(107,6,'6.3','Utilities','6.3.02','SMP-EXT-005','Underground electrical ducts and handholes','m',150,38,'EXT','Utilities','EXT','33 71 19','','Electrician:0.2;Helper:0.5','Excavator:0.05'),
(108,6,'6.3','Utilities','6.3.03','SMP-EXT-006','Septic tank and soakaway','item',1,24000,'EXT','Utilities','EXT','33 36 00','','Mason:300;Helper:500','Excavator:30'),
(109,6,'6.4','Roads and parking','6.4.01','SMP-EXT-007','Laterite sub-base 300 mm compacted','m3',900,26,'EXT','Roads and parking','EXT','32 11 16','','Operator:0.06;Helper:0.1','Roller:0.05;Excavator:0.04'),
(110,6,'6.4','Roads and parking','6.4.02','SMP-EXT-008','Crushed stone base course 150 mm compacted','m3',450,38,'EXT','Roads and parking','EXT','32 11 23','','Operator:0.06;Helper:0.12','Roller:0.06'),
(111,6,'6.4','Roads and parking','6.4.03','SMP-EXT-009','Asphalt wearing course 50 mm to roads and parking','m2',3000,17,'EXT','Roads and parking','EXT','32 12 16','','Operator:0.05;Helper:0.1','Roller:0.03'),
(112,6,'6.4','Roads and parking','6.4.04','SMP-EXT-010','Precast concrete kerbs on concrete bed','m',600,14,'EXT','Roads and parking','EXT','32 16 00','','Mason:0.4;Helper:0.4',''),
(113,6,'6.5','Landscaping','6.5.01','SMP-EXT-011','Topsoil and turf grass to landscaped areas','m2',1200,7.5,'EXT','Landscaping','EXT','32 90 00','','Helper:0.25',''),
(114,6,'6.5','Landscaping','6.5.02','SMP-EXT-012','Ornamental trees 2 m high planted with stakes','no',45,55,'EXT','Landscaping','EXT','32 90 00','','Helper:1.5',''),
(115,6,'6.6','Boundary and gate','6.6.01','SMP-EXT-013','Boundary wall 2.4 m high in brickwork with RC posts, plastered and painted','m',200,95,'EXT','Boundary and gate','EXT','32 31 00','','Mason:4.0;Helper:3.5',''),
(116,6,'6.6','Boundary and gate','6.6.02','SMP-EXT-014','Steel sliding vehicle gate and pedestrian gate','no',2,2800,'EXT','Boundary and gate','EXT','32 31 00','','Welder:30;Helper:30',''),
(117,6,'6.6','Boundary and gate','6.6.03','SMP-EXT-015','Guard house, single storey 12 m2 complete','item',1,6500,'EXT','Boundary and gate','EXT','13 34 00','','Mason:200;Carpenter:120;Helper:250','');

create temp table smp_item_master(item_code text, master_code text, share_pct numeric) on commit drop;
insert into smp_item_master values
('SMP-STR-001','CIV-EW-001','100'),
('SMP-STR-002','STR-SUB-BSM-001','100'),
('SMP-STR-003','STR-SUB-BSM-001','100'),
('SMP-STR-004','STR-SUB-BSM-003','100'),
('SMP-STR-005','STR-SUB-BSM-002','100'),
('SMP-STR-006','STR-SUB-EXC-002','100'),
('SMP-STR-007','CIV-BRG-001','100'),
('SMP-STR-008','CIV-BRG-001','100'),
('SMP-STR-009','CIV-BRG-001','100'),
('SMP-STR-010','CIV-BRG-002','100'),
('SMP-STR-011','STR-SUB-FTG-001','100'),
('SMP-STR-012','STR-RC-FDN-003','100'),
('SMP-STR-013','STR-SUB-GB-003','100'),
('SMP-STR-014','STR-RC-FDN-002','50'),
('SMP-STR-014','STR-SUB-GB-002','50'),
('SMP-STR-015','STR-RC-FDN-001','70'),
('SMP-STR-015','STR-SUB-GB-001','30'),
('SMP-STR-016','STR-SUB-SOG-003','100'),
('SMP-STR-017','STR-RC-COL-003','100'),
('SMP-STR-018','STR-RC-COL-002','100'),
('SMP-STR-019','STR-RC-COL-001','100'),
('SMP-STR-020','STR-SUB-BSM-009','100'),
('SMP-STR-021','STR-SUB-BSM-008','100'),
('SMP-STR-022','STR-SUB-BSM-007','100'),
('SMP-STR-023','STR-RC-BEAM-003','100'),
('SMP-STR-024','STR-RC-BEAM-002','100'),
('SMP-STR-025','STR-RC-BEAM-001','100'),
('SMP-STR-026','STR-RC-STAIR-003','100'),
('SMP-STR-027','STR-RC-STAIR-002','100'),
('SMP-STR-028','STR-RC-STAIR-001','100'),
('SMP-STR-029','STR-SUB-BSM-004','100'),
('SMP-STR-030','STR-RC-COL-003','100'),
('SMP-STR-031','STR-RC-COL-002','100'),
('SMP-STR-032','STR-RC-COL-001','100'),
('SMP-STR-033','STR-RC-WALL-003','100'),
('SMP-STR-034','STR-RC-WALL-002','100'),
('SMP-STR-035','STR-RC-WALL-001','100'),
('SMP-STR-036','STR-RC-BEAM-003','100'),
('SMP-STR-037','STR-RC-BEAM-002','100'),
('SMP-STR-038','STR-RC-BEAM-001','100'),
('SMP-STR-039','STR-RC-SLAB-007','100'),
('SMP-STR-040','STR-RC-SLAB-002','100'),
('SMP-STR-041','STR-RC-SLAB-004','60'),
('SMP-STR-041','STR-RC-SLAB-005','40'),
('SMP-STR-042','STR-RC-STAIR-003','100'),
('SMP-STR-043','STR-RC-STAIR-002','100'),
('SMP-STR-044','STR-RC-STAIR-001','100'),
('SMP-STR-045','STR-RC-SLAB-007','100'),
('SMP-STR-046','STR-RC-SLAB-002','100'),
('SMP-STR-047','STR-RC-SLAB-004','60'),
('SMP-STR-047','STR-RC-SLAB-005','40'),
('SMP-STR-048','ARC-RF-007','100'),
('SMP-STR-049','STR-RC-SLAB-003','100'),
('SMP-ARC-001','ARC-MAS-BLK-001','100'),
('SMP-ARC-002','ARC-MAS-BLK-001','100'),
('SMP-ARC-003','ARC-FIN-WAL-002','100'),
('SMP-ARC-004','ARC-FIN-WAL-002','100'),
('SMP-ARC-005','ARC-FIN-FLR-002','100'),
('SMP-ARC-006','ARC-FIN-CLG-001','50'),
('SMP-ARC-006','ARC-FIN-CLG-003','50'),
('SMP-ARC-007','ARC-FIN-CLG-001','50'),
('SMP-ARC-007','ARC-FIN-CLG-002','50'),
('SMP-ARC-008','ARC-FIN-FLR-004','100'),
('SMP-ARC-009','ARC-FIN-FLR-004','100'),
('SMP-ARC-010','ARC-FIN-FLR-004','100'),
('SMP-ARC-011','IND-FLR-005','100'),
('SMP-ARC-012','ARC-FIN-WAL-003','100'),
('SMP-ARC-013','ARC-DW-002','60'),
('SMP-ARC-013','ARC-DW-001','40'),
('SMP-ARC-014','ARC-DW-001','50'),
('SMP-ARC-014','ARC-DW-002','50'),
('SMP-ARC-015','ARC-DW-001','50'),
('SMP-ARC-015','ARC-DW-002','50'),
('SMP-ARC-016','ARC-DW-003','60'),
('SMP-ARC-016','ARC-DW-004','40'),
('SMP-ARC-017','ARC-FAC-001','100'),
('SMP-ARC-018','ARC-DW-004','100'),
('SMP-ARC-019','ARC-FIN-WAL-004','100'),
('SMP-ARC-020','ARC-FIN-WAL-004','100'),
('SMP-ARC-021','ARC-FIN-WAL-004','100'),
('SMP-ARC-022','ARC-RF-005','100'),
('SMP-ARC-023','ARC-RF-006','100'),
('SMP-ARC-024','ARC-FIN-FLR-003','100'),
('SMP-MEP-001','MEP-ELE-001','100'),
('SMP-MEP-002','MEP-ELE-002','60'),
('SMP-MEP-002','MEP-ELE-003','40'),
('SMP-MEP-003','MEP-ELE-001','100'),
('SMP-MEP-004','MEP-ELE-004','100'),
('SMP-MEP-005','MEP-ELE-004','100'),
('SMP-MEP-006','MEP-ELE-003','100'),
('SMP-MEP-007','MEP-ELE-005','100'),
('SMP-MEP-008','MEP-ELE-005','100'),
('SMP-MEP-009','MEP-ELE-006','100'),
('SMP-MEP-010','MEP-ELE-007','50'),
('SMP-MEP-010','MEP-ELE-009','50'),
('SMP-MEP-011','INS-ELV-001','100'),
('SMP-MEP-012','MEP-ELE-001','50'),
('SMP-MEP-012','MEP-FP-004','50'),
('SMP-MEP-013','MEP-FP-004','100'),
('SMP-MEP-014','MEP-FP-004','100'),
('SMP-MEP-015','MEP-PLB-001','100'),
('SMP-MEP-016','MEP-PLB-004','100'),
('SMP-MEP-017','MEP-PLB-004','100'),
('SMP-MEP-018','CIV-FAC-001','100'),
('SMP-MEP-019','MEP-PLB-003','100'),
('SMP-MEP-020','MEP-PLB-003','100'),
('SMP-MEP-021','MEP-HVAC-001','70'),
('SMP-MEP-021','MEP-HVAC-005','30'),
('SMP-MEP-022','MEP-HVAC-003','100'),
('SMP-MEP-023','MEP-HVAC-002','100'),
('SMP-MEP-024','MEP-HVAC-002','100'),
('SMP-MEP-025','MEP-HVAC-002','100'),
('SMP-MEP-026','MEP-FP-001','100'),
('SMP-MEP-027','MEP-FP-002','100'),
('SMP-MEP-028','MEP-FP-003','100'),
('SMP-MEP-029','CIV-FAC-001','100'),
('SMP-EXT-001','CIV-EW-004','100'),
('SMP-EXT-002','EXT-DRN-001','100'),
('SMP-EXT-003','CIV-DRN-003','100'),
('SMP-EXT-004','EXT-UTL-001','100'),
('SMP-EXT-005','EXT-UTL-001','100'),
('SMP-EXT-006','EXT-SEP-001','100'),
('SMP-EXT-007','CIV-PAV-001','100'),
('SMP-EXT-008','CIV-PAV-002','100'),
('SMP-EXT-009','CIV-PAV-005','100'),
('SMP-EXT-010','CIV-PAV-006','100'),
('SMP-EXT-011','EXT-LND-001','100'),
('SMP-EXT-012','EXT-LND-001','100'),
('SMP-EXT-013','EXT-FEN-001','100'),
('SMP-EXT-014','EXT-FEN-001','100'),
('SMP-EXT-015','EXT-GH-001','100');

create temp table smp_task_map(grp text, task_name text, master_code text) on commit drop;
insert into smp_task_map values
('ARCHITECTURAL','Blockwork','ARC-MAS-BLK-001'),
('ARCHITECTURAL','Ceiling','ARC-FIN-CLG-001'),
('ARCHITECTURAL','Doors','ARC-DW-002'),
('ARCHITECTURAL','Flooring','ARC-FIN-FLR-004'),
('ARCHITECTURAL','Painting','ARC-FIN-WAL-004'),
('ARCHITECTURAL','Parapet Finishes','ARC-FIN-WAL-002'),
('ARCHITECTURAL','Plaster','ARC-FIN-WAL-002'),
('ARCHITECTURAL','Roof Finishes','ARC-RF-006'),
('ARCHITECTURAL','Screed','ARC-FIN-FLR-002'),
('ARCHITECTURAL','Wall Finishes','ARC-FIN-WAL-003'),
('ARCHITECTURAL WORKS','Blockwork','ARC-MAS-BLK-001'),
('ARCHITECTURAL WORKS','Ceiling','ARC-FIN-CLG-001'),
('ARCHITECTURAL WORKS','Door Frames','ARC-DW-001'),
('ARCHITECTURAL WORKS','Doors','ARC-DW-002'),
('ARCHITECTURAL WORKS','External Finishing','ARC-FIN-WAL-002'),
('ARCHITECTURAL WORKS','Final Architectural Finishes','ARC-FIN-WAL-006'),
('ARCHITECTURAL WORKS','Flooring','ARC-FIN-FLR-004'),
('ARCHITECTURAL WORKS','Glass','ARC-DW-004'),
('ARCHITECTURAL WORKS','Internal Painting','ARC-FIN-WAL-004'),
('ARCHITECTURAL WORKS','Internal Partition','ARC-MAS-BLK-001'),
('ARCHITECTURAL WORKS','Painting Primer','ARC-FIN-WAL-004'),
('ARCHITECTURAL WORKS','Plastering','ARC-FIN-WAL-002'),
('ARCHITECTURAL WORKS','Screed','ARC-FIN-FLR-002'),
('ARCHITECTURAL WORKS','Stone / Marble','ARC-FIN-FLR-004'),
('ARCHITECTURAL WORKS','Wall Tiling','ARC-FIN-WAL-003'),
('ARCHITECTURAL WORKS','Waterproofing','ARC-FIN-FLR-003'),
('ARCHITECTURAL WORKS','Windows','ARC-DW-003'),
('BOUNDARY & GATE','Boundary Wall','EXT-FEN-001'),
('BOUNDARY & GATE','Gate','EXT-FEN-001'),
('BOUNDARY & GATE','Guard House','EXT-GH-001'),
('BOUNDARY & GATE','Security System','INS-ELV-001'),
('EARTHWORK','Dewatering','STR-SUB-BSM-002'),
('EARTHWORK','Excavation','STR-SUB-BSM-001'),
('EARTHWORK','Excavation Support','STR-SUB-BSM-003'),
('EARTHWORK','Formation Level','CIV-EW-007'),
('EARTHWORK','Site Preparation','CIV-EW-001'),
('EARTHWORK','Soil Compaction','STR-SUB-EXC-002'),
('EXTERNAL CIVIL WORKS','Backfilling','STR-SUB-EXC-002'),
('EXTERNAL CIVIL WORKS','Compaction','STR-SUB-EXC-002'),
('EXTERNAL CIVIL WORKS','Concrete Works','CIV-STR-003'),
('EXTERNAL CIVIL WORKS','Excavation','CIV-PIP-001'),
('EXTERNAL CIVIL WORKS','External Structures','CIV-STR-003'),
('EXTERNAL CIVIL WORKS','Filling','CIV-EW-004'),
('EXTERNAL CIVIL WORKS','Kerbs','CIV-PAV-006'),
('EXTERNAL DRAINAGE','Catch Pits','CIV-DRN-003'),
('EXTERNAL DRAINAGE','Drainage Testing','CIV-PIP-010'),
('EXTERNAL DRAINAGE','Inspection Chambers','CIV-DRN-003'),
('EXTERNAL DRAINAGE','Manholes','CIV-DRN-003'),
('EXTERNAL DRAINAGE','Sewer Drainage','EXT-DRN-001'),
('EXTERNAL DRAINAGE','Stormwater Drainage','EXT-DRN-001'),
('EXTERNAL FINISHES','External Lighting','EXT-LGT-001'),
('EXTERNAL FINISHES','External Painting','ARC-FIN-WAL-004'),
('EXTERNAL FINISHES','Final Cleaning','ARC-FIN-FLR-008'),
('EXTERNAL FINISHES','Signage','EXT-SGN-001'),
('EXTERNAL UTILITIES','Electrical','EXT-UTL-001'),
('EXTERNAL UTILITIES','ELV','EXT-UTL-001'),
('EXTERNAL UTILITIES','External Lighting','EXT-LGT-001'),
('EXTERNAL UTILITIES','Fire Water','CIV-PIP-003'),
('EXTERNAL UTILITIES','Telecom','EXT-UTL-001'),
('EXTERNAL UTILITIES','Water Supply','EXT-UTL-001'),
('FOUNDATION','Ground Beam Concrete','STR-SUB-GB-003'),
('FOUNDATION','Ground Beam Formwork','STR-SUB-GB-002'),
('FOUNDATION','Ground Beam Reinforcement','STR-SUB-GB-001'),
('FOUNDATION','Pile Cap Concrete','STR-RC-FDN-003'),
('FOUNDATION','Pile Cap Excavation','STR-SUB-EXC-001'),
('FOUNDATION','Pile Cap Formwork','STR-RC-FDN-002'),
('FOUNDATION','Pile Cap Reinforcement','STR-RC-FDN-001'),
('FOUNDATION','Pile Installation','CIV-BRG-001'),
('FOUNDATION','Pile Setting Out','STR-RC-SLAB-001'),
('FOUNDATION','Pile Testing','CIV-BRG-002'),
('LANDSCAPING','Grass','EXT-LND-001'),
('LANDSCAPING','Hardscape','EXT-PAV-001'),
('LANDSCAPING','Shrubs','EXT-LND-001'),
('LANDSCAPING','Softscape','EXT-LND-001'),
('LANDSCAPING','Topsoil','EXT-LND-001'),
('LANDSCAPING','Trees','EXT-LND-001'),
('MEP','Drainage','MEP-PLB-003'),
('MEP','Electrical First Fix','MEP-ELE-001'),
('MEP','ELV','INS-ELV-001'),
('MEP','Fire Alarm','MEP-FP-004'),
('MEP','Fire Fighting','MEP-FP-001'),
('MEP','HVAC','MEP-HVAC-001'),
('MEP','HVAC Equipment','MEP-HVAC-002'),
('MEP','Lightning Protection','MEP-ELE-009'),
('MEP','Other Roof Equipment','ARC-RF-007'),
('MEP','Plumbing First Fix','MEP-PLB-001'),
('MEP','Pumps','CIV-FAC-001'),
('MEP','Roof Drainage','ARC-RF-004'),
('MEP FIRST FIX','Cable Trays','MEP-ELE-001'),
('MEP FIRST FIX','Drainage Pipes','MEP-PLB-003'),
('MEP FIRST FIX','Electrical Conduits','MEP-ELE-001'),
('MEP FIRST FIX','ELV Conduits','MEP-ELE-001'),
('MEP FIRST FIX','Fire Alarm Conduits','MEP-ELE-001'),
('MEP FIRST FIX','Fire Fighting Pipes','MEP-FP-001'),
('MEP FIRST FIX','HVAC Ductwork','MEP-HVAC-001'),
('MEP FIRST FIX','HVAC Pipes','MEP-HVAC-003'),
('MEP FIRST FIX','Plumbing Pipes','MEP-PLB-001'),
('MEP SECOND FIX','Cable Pulling','MEP-ELE-002'),
('MEP SECOND FIX','DB Installation','MEP-ELE-004'),
('MEP SECOND FIX','ELV Devices','INS-ELV-001'),
('MEP SECOND FIX','Fire Alarm Devices','MEP-FP-004'),
('MEP SECOND FIX','Fire Fighting Equipment','MEP-FP-003'),
('MEP SECOND FIX','HVAC Equipment','MEP-HVAC-002'),
('MEP SECOND FIX','Lighting','MEP-ELE-005'),
('MEP SECOND FIX','Plumbing Fixtures','MEP-PLB-004'),
('MEP SECOND FIX','Sprinkler Heads','MEP-FP-002'),
('MEP SECOND FIX','Switches & Sockets','MEP-ELE-006'),
('ROAD & PARKING','Asphalt / Concrete','CIV-PAV-005'),
('ROAD & PARKING','Base Course','CIV-PAV-002'),
('ROAD & PARKING','Kerbs','CIV-PAV-006'),
('ROAD & PARKING','Parking','EXT-PAV-002'),
('ROAD & PARKING','Pavement','EXT-PAV-001'),
('ROAD & PARKING','Road Marking','CIV-RFN-003'),
('ROAD & PARKING','Subbase','CIV-PAV-001'),
('ROAD & PARKING','Subgrade','CIV-EW-007'),
('ROAD & PARKING','Traffic Signage','CIV-RFN-002'),
('SITE PREPARATION','Site Clearance','CIV-EW-001'),
('SITE PREPARATION','Site Grading','CIV-EW-003'),
('SITE PREPARATION','Temporary Drainage','CIV-DRN-002'),
('SITE PREPARATION','Temporary Roads','CIV-PAV-001'),
('STRUCTURAL','B1 Beams','STR-RC-BEAM-003'),
('STRUCTURAL','B1 Columns','STR-RC-COL-003'),
('STRUCTURAL','B1 Retaining Walls','STR-SUB-BSM-009'),
('STRUCTURAL','B1 Shear Walls','STR-RC-WALL-003'),
('STRUCTURAL','B1 Slab','STR-RC-SLAB-007'),
('STRUCTURAL','B1 Staircase','STR-RC-STAIR-003'),
('STRUCTURAL WORKS','Beam Formwork','STR-RC-BEAM-002'),
('STRUCTURAL WORKS','Beam Reinforcement','STR-RC-BEAM-001'),
('STRUCTURAL WORKS','Column Concrete','STR-RC-COL-003'),
('STRUCTURAL WORKS','Column Formwork','STR-RC-COL-002'),
('STRUCTURAL WORKS','Column Reinforcement','STR-RC-COL-001'),
('STRUCTURAL WORKS','Concrete Curing','STR-RC-SLAB-009'),
('STRUCTURAL WORKS','Concrete Pour','STR-RC-SLAB-007'),
('STRUCTURAL WORKS','Formwork Removal','STR-RC-SLAB-010'),
('STRUCTURAL WORKS','MEP Embedded Items','STR-RC-SLAB-003'),
('STRUCTURAL WORKS','Parapet','ARC-RF-007'),
('STRUCTURAL WORKS','Roof Beams','STR-RC-BEAM-003'),
('STRUCTURAL WORKS','Roof Columns','STR-RC-COL-003'),
('STRUCTURAL WORKS','Roof Slab','STR-RC-SLAB-007'),
('STRUCTURAL WORKS','Roof Structure','STR-RC-SLAB-007'),
('STRUCTURAL WORKS','Setting Out','STR-RC-SLAB-001'),
('STRUCTURAL WORKS','Shear Wall Concrete','STR-RC-WALL-003'),
('STRUCTURAL WORKS','Shear Wall Formwork','STR-RC-WALL-002'),
('STRUCTURAL WORKS','Shear Wall Reinforcement','STR-RC-WALL-001'),
('STRUCTURAL WORKS','Slab Formwork','STR-RC-SLAB-002'),
('STRUCTURAL WORKS','Slab Reinforcement','STR-RC-SLAB-004'),
('STRUCTURAL WORKS','Structural Inspection','STR-RC-SLAB-006'),
('TESTING & INSPECTION','Structural Inspection','STR-RC-SLAB-006'),
('WATERPROOFING','Foundation Waterproofing','STR-SUB-BSM-004'),
('WATERPROOFING','Insulation','ARC-RF-006'),
('WATERPROOFING','Retaining Wall Waterproofing','STR-SUB-BSM-004'),
('WATERPROOFING','Roof Waterproofing','ARC-RF-005'),
('WATERPROOFING','Slab Waterproofing','STR-SUB-BSM-004'),
('TESTING & COMMISSIONING','Drainage Testing','MEP-PLB-006'),
('TESTING & COMMISSIONING','Electrical Testing','MEP-ELE-008'),
('TESTING & COMMISSIONING','Fire Alarm Testing','MEP-FP-006'),
('TESTING & COMMISSIONING','Fire Fighting Testing','MEP-FP-006'),
('TESTING & COMMISSIONING','HVAC Testing','MEP-HVAC-007'),
('TESTING & COMMISSIONING','Plumbing Testing','MEP-PLB-006');

-- one row per master code (latest non-archived version)
create temp table smp_master on commit drop as
  select distinct on (code) code, id from plan_act_masters where status <> 'archived' order by code, version desc;

-- ---------------------------------------------------------------- 1. remove this script's previous rows
delete from plan_act_master_work_items where source = 'import'
  and work_item_id in (select id from dwl_work_items where code like 'SMP-%');
delete from dwl_work_item_resources where basis_note = (select note from smp_ctx);
delete from qs_boq_items where project_id = (select project_id from smp_ctx) and item_code like 'SMP-%';
delete from qs_boq_sections s using smp_ctx c
  where s.project_id = c.project_id
    and s.section_code in (select distinct section_code from smp_src)
    and not exists (select 1 from qs_boq_items i where i.boq_section_id = s.id);
delete from dwl_work_items w where w.code like 'SMP-%'
  and not exists (select 1 from qs_boq_items i where i.dwl_work_item_id = w.id)
  and not exists (select 1 from tender_boq_items t where t.dwl_work_item_id = w.id or t.unit_rate_id = w.id)
  and not exists (select 1 from tender_boq_item_alternates a where a.dwl_work_item_id = w.id)
  and not exists (select 1 from dwl_assembly_items a where a.work_item_id = w.id);

-- ---------------------------------------------------------------- 2. sections (no parent concept: one section per bill sub-section)
with sec as (
  select s.section_code, min(s.section_title) as title, min(s.bill) as bill, min(s.ord) as ord
  from smp_src s group by s.section_code
), ins as (
  insert into qs_boq_sections(project_id, boq_id, seq, title, description, section_code, baseline_status)
  select c.project_id, c.boq_id,
         (select coalesce(max(seq), 0) from qs_boq_sections where boq_id = c.boq_id and section_code is null) + 10 * row_number() over (order by sec.ord),
         sec.title, 'Bill ' || sec.bill || ' - ' || b.bill_name || ' (sample data)', sec.section_code, 'draft'
  from sec join smp_bill b on b.bill = sec.bill cross join smp_ctx c
  where not exists (select 1 from qs_boq_sections x where x.boq_id = c.boq_id and x.section_code = sec.section_code)
  returning 1)
insert into smp_stats select 'sections inserted', count(*) from ins;

-- ---------------------------------------------------------------- 3. cost library BOQ items (reuse or create)
create temp table smp_wi on commit drop as
  select s.item_code, s.reuse_code, w.id as reuse_id
  from smp_src s left join dwl_work_items w on w.code = s.reuse_code;
-- a library item that does not exist here is created as an SMP item instead

with ins as (
  insert into dwl_work_items(tenant_id, code, name, description, unit, csi_section_code, boq_section, is_active)
  select c.tenant_id, s.item_code,
         case when length(s.description) <= 70 then s.description else regexp_replace(left(s.description, 70), '\s+\S*$', '') end,
         s.description, s.unit, s.csi, s.section_title, true
  from smp_src s join smp_wi w on w.item_code = s.item_code cross join smp_ctx c
  where w.reuse_id is null
  on conflict (code) do nothing
  returning 1)
insert into smp_stats select 'work items created', count(*) from ins;
insert into smp_stats select 'work items reused (lines)', count(*) from smp_wi where reuse_id is not null;

create temp table smp_wi_final on commit drop as
  select s.item_code, coalesce(w.reuse_id, (select id from dwl_work_items where code = s.item_code)) as work_item_id
  from smp_src s join smp_wi w on w.item_code = s.item_code;

-- ---------------------------------------------------------------- 4. resources and hour rows (hr per unit)
create temp table smp_hours(item_code text, res_name text, category text, hrs numeric, sort_order int) on commit drop;
insert into smp_hours
  select s.item_code, trim(split_part(p.v, ':', 1)), 'labor', trim(split_part(p.v, ':', 2))::numeric, p.n::int
  from smp_src s, unnest(string_to_array(nullif(s.labour, ''), ';')) with ordinality as p(v, n);
insert into smp_hours
  select s.item_code, trim(split_part(p.v, ':', 1)), 'equipment', trim(split_part(p.v, ':', 2))::numeric, 100 + p.n::int
  from smp_src s, unnest(string_to_array(nullif(s.equipment, ''), ';')) with ordinality as p(v, n);

with names as (select distinct res_name, category from smp_hours), ins as (
  insert into dwl_resources(tenant_id, code, category, description, unit, is_active)
  select c.tenant_id, 'SMP-' || case n.category when 'labor' then 'LAB-' else 'EQP-' end || upper(regexp_replace(n.res_name, '[^A-Za-z0-9]+', '-', 'g')),
         n.category, n.res_name, 'hr', true
  from names n cross join smp_ctx c
  where not exists (select 1 from dwl_resources r where lower(r.description) = lower(n.res_name) and r.unit = 'hr' and r.category = n.category and r.is_active)
  on conflict (code) do nothing
  returning 1)
insert into smp_stats select 'resources created', count(*) from ins;

create temp table smp_res on commit drop as
  select distinct on (n.res_name, n.category) n.res_name, n.category, r.id as resource_id
  from (select distinct res_name, category from smp_hours) n
  join dwl_resources r on lower(r.description) = lower(n.res_name) and r.unit = 'hr' and r.category = n.category and r.is_active
  order by n.res_name, n.category, (r.code like 'SMP-%'), r.created_at;

with ins as (
  insert into dwl_work_item_resources(tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
  select c.tenant_id, f.work_item_id, r.resource_id, h.hrs, 0, c.note, h.sort_order
  from smp_hours h join smp_wi_final f on f.item_code = h.item_code
  join smp_res r on r.res_name = h.res_name and r.category = h.category cross join smp_ctx c
  where h.hrs > 0
  on conflict (work_item_id, resource_id) do nothing
  returning 1)
insert into smp_stats select 'hour rows inserted', count(*) from ins;

-- ---------------------------------------------------------------- 5. BOQ lines (random factor 0.85-1.15; counts and items rounded to whole numbers)
with q as (
  select s.*, random() as rnd from (select * from smp_src order by ord) s
), ins as (
  insert into qs_boq_items(project_id, boq_section_id, seq, description, unit, quantity, unit_rate, item_no, item_code, baseline_status, currency,
                           elemental_category, dwl_work_item_id, building_code, level, discipline, section, sub_section)
  select c.project_id, sec.id, 600 + 10 * q.ord, q.description, q.unit,
         case when q.unit in ('no', 'item') then greatest(1, round(q.base_qty * (0.85 + q.rnd::numeric * 0.30))) else round(q.base_qty * (0.85 + q.rnd::numeric * 0.30), 2) end,
         q.unit_rate, q.item_no, q.item_code, 'draft', 'USD', b.elemental, f.work_item_id, 'BA', q.level, q.discipline, q.section_title, q.sub_section
  from q cross join smp_ctx c
  join qs_boq_sections sec on sec.boq_id = c.boq_id and sec.section_code = q.section_code
  join smp_bill b on b.bill = q.bill
  join smp_wi_final f on f.item_code = q.item_code
  returning 1)
insert into smp_stats select 'boq lines inserted', count(*) from ins;

-- ---------------------------------------------------------------- 6. BOQ item -> master links
with ins as (
  insert into plan_act_master_work_items(master_id, work_item_id, share_pct, duration_days_per_unit, source, created_by)
  select m.id, f.work_item_id, l.share_pct, null, 'import', null
  from smp_item_master l join smp_master m on m.code = l.master_code join smp_wi_final f on f.item_code = l.item_code
  on conflict (master_id, work_item_id) do nothing
  returning 1)
insert into smp_stats select 'master links inserted', count(*) from ins;

-- ---------------------------------------------------------------- 7. crew_size defaults on linked masters
with linked as (
  select master_id as id from plan_act_master_work_items where work_item_id in (select work_item_id from smp_wi_final)
  union select m.id from smp_task_map t join smp_master m on m.code = t.master_code
), upd as (
  update plan_act_masters pm set crew_size = case
      when pm.code ~ '^STR-RC-' or pm.code ~ '^STR-SUB-(GB|FTG)-' or pm.code ~ '^STR-SUB-BSM-00[5-9]' then 6
      when pm.code ~ '^(MEP|INS)-' then 3
      else 4 end
  from linked l where l.id = pm.id and pm.crew_size is null
  returning 1)
insert into smp_stats select 'masters crew_size set', count(*) from upd;

-- ---------------------------------------------------------------- 8. tasks -> masters (task name + parent group name)
with upd as (
  update wbs_tasks t set activity_master_id = m.id
  from smp_task_map tm
  join wbs_nodes g on g.wbs_name = tm.grp
  join smp_master m on m.code = tm.master_code
  where t.wbs_node_id = g.id and g.project_id = (select project_id from smp_ctx) and t.project_id = g.project_id
    and t.task_name = tm.task_name and t.activity_master_id is null
  returning 1)
insert into smp_stats select 'tasks linked this run', count(*) from upd;

-- ---------------------------------------------------------------- 9. location map (floor task_group nodes; All = GFA split)
create temp table smp_loc(label text, node_pattern text, split_rule text) on commit drop;
insert into smp_loc values ('B1', '^B1( |$)', 'none'), ('GF', '^GF( |$)', 'none'), ('1F', '^1F( |$)', 'none'), ('2F', '^2F( |$)', 'none'),
  ('3F', '^3F( |$)', 'none'), ('4F', '^4F( |$)', 'none'), ('5F', '^5F( |$)', 'none'), ('6F', '^6F( |$)', 'none'), ('7F', '^7F( |$)', 'none'),
  ('RF', '^RF( |$)', 'none'), ('EXT', '^BX( |$)', 'none'), ('All', null, 'gfa');
with ins as (
  insert into plan_location_map(project_id, building_code, qs_level_label, wbs_node_id, status, split_rule, note, confirmed_by)
  select c.project_id, 'BA', l.label,
         (select n.id from wbs_nodes n where n.project_id = c.project_id and n.node_type = 'task_group' and n.wbs_name ~ l.node_pattern),
         'confirmed', l.split_rule,
         case when l.label = 'All' then 'Sample data: project-wide lines split over the building levels by GFA (equal if no GFA)' else 'Sample data: floor task group' end,
         null
  from smp_loc l cross join smp_ctx c
  where l.label = 'All'
     or (select count(*) from wbs_nodes n where n.project_id = c.project_id and n.node_type = 'task_group' and n.wbs_name ~ l.node_pattern) = 1
  on conflict (project_id, building_code, qs_level_label) do nothing
  returning 1)
insert into smp_stats select 'location rows inserted', count(*) from ins;

-- ---------------------------------------------------------------- 10. summaries
select 'lines/amount by bill' as report, b.bill, b.bill_name, count(i.id) as lines, sum(i.total_amount) as amount
from smp_bill b left join smp_src s on s.bill = b.bill
left join qs_boq_items i on i.item_code = s.item_code and i.project_id = (select project_id from smp_ctx)
group by b.bill, b.bill_name order by b.bill;
select 'new lines total' as report, count(*) as lines, sum(total_amount) as amount
  from qs_boq_items where project_id = (select project_id from smp_ctx) and item_code like 'SMP-%';
select 'all BOQ lines incl. prelims' as report, count(*) as lines, sum(total_amount) as amount
  from qs_boq_items where project_id = (select project_id from smp_ctx);
select 'lines on reused vs created items' as report, count(*) filter (where reuse_id is not null) as reused, count(*) filter (where reuse_id is null) as created
  from smp_wi;
select 'SMP work items in library' as report, count(*) from dwl_work_items where code like 'SMP-%';
select 'SMP resources in library' as report, category, count(*) from dwl_resources where code like 'SMP-%' group by category order by 2;
select 'sample hour rows now' as report, count(*) from dwl_work_item_resources where basis_note = (select note from smp_ctx);
select 'lines with no hr labour row' as report, f.item_code from smp_wi_final f
  where not exists (select 1 from dwl_work_item_resources r join dwl_resources d on d.id = r.resource_id
                    where r.work_item_id = f.work_item_id and d.category = 'labor' and d.unit = 'hr');
select 'import master links on sample items' as report, count(*) from plan_act_master_work_items
  where work_item_id in (select work_item_id from smp_wi_final) and source = 'import';
select 'lines with no master link' as report, s.item_code from smp_src s join smp_wi_final f using (item_code)
  where not exists (select 1 from plan_act_master_work_items l where l.work_item_id = f.work_item_id);
select 'this-run counters' as report, k, v from smp_stats order by k;
with grp as (select distinct grp from smp_task_map), ct as (
  select t.id, t.activity_master_id from wbs_tasks t join wbs_nodes g on g.id = t.wbs_node_id
  where t.project_id = (select project_id from smp_ctx) and g.wbs_name in (select grp from grp))
select 'tasks linked vs construction-group tasks' as report, count(*) filter (where activity_master_id is not null) as linked, count(*) as total,
       (select count(*) from wbs_tasks where project_id = (select project_id from smp_ctx) and activity_master_id is not null) as linked_all_tasks,
       (select count(*) from wbs_tasks where project_id = (select project_id from smp_ctx)) as all_tasks
from ct;
select 'distinct unmapped task names' as report, string_agg(distinct u.wbs_name || ' / ' || u.task_name, '; ' order by u.wbs_name || ' / ' || u.task_name) as names
from (select t.task_name, g.wbs_name from wbs_tasks t join wbs_nodes g on g.id = t.wbs_node_id
      where t.project_id = (select project_id from smp_ctx) and t.activity_master_id is null
        and g.wbs_name in (select grp from smp_task_map)) u;
select 'location map rows' as report, qs_level_label, split_rule, status, wbs_node_id is not null as has_node
  from plan_location_map where project_id = (select project_id from smp_ctx) order by 2;
-- ---------------------------------------------------------------- 11. final report (the SQL Editor shows this table)
select * from (
  select 1 as n, 'Project' as check_item, (select project_code || ' - ' || project_name from projects where id = (select id from smp_proj)) as result
  union all select 2, 'BOQ used', (select boq_number || ' ' || title || ' (' || status || ')' from qs_boq where id = (select boq_id from smp_ctx))
  union all select 3, 'Sample BOQ lines', (select count(*) || ' lines, USD ' || to_char(coalesce(sum(total_amount), 0), 'FM999,999,999.00') from qs_boq_items where project_id = (select id from smp_proj) and item_code like 'SMP-%')
  union all select 4, 'BOQ items reused / created', (select count(*) filter (where reuse_id is not null) || ' reused / ' || count(*) filter (where reuse_id is null) || ' created' from smp_wi)
  union all select 5, 'Hour rows (hr per unit)', (select count(*)::text from dwl_work_item_resources where basis_note = (select note from smp_ctx))
  union all select 6, 'BOQ item -> activity links', (select count(*)::text from plan_act_master_work_items where work_item_id in (select work_item_id from smp_wi_final))
  union all select 7, 'Lines with NO activity link', (select count(*)::text from smp_src s join smp_wi_final f using (item_code) where not exists (select 1 from plan_act_master_work_items l where l.work_item_id = f.work_item_id))
  union all select 8, 'Activity codes not found here', (select count(distinct master_code) || ' of ' || (select count(distinct master_code) from smp_item_master) from smp_item_master l where not exists (select 1 from smp_master m where m.code = l.master_code))
  union all select 9, 'Project tasks linked to activities', (select count(*) filter (where activity_master_id is not null) || ' of ' || count(*) from wbs_tasks where project_id = (select id from smp_proj))
  union all select 10, 'Location map rows (expect 12)', (select count(*) || ' (' || count(*) filter (where wbs_node_id is not null) || ' with a WBS floor)' from plan_location_map where project_id = (select id from smp_proj))
  union all select 11, 'Run', 'Committed'
) r order by n;
commit;
