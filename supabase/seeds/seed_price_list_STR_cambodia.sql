-- =====================================================================================
-- DCOS Seed Data — Company Rate Library: STRUCTURE (STR)
-- Market basis : Cambodia — Phnom Penh, USD
-- Price date   : Q2-2026 indicative. Rates are flat (resource) prices for the
--   company-wide rate library. Import into any tender's Unit Rates tab.
-- VERIFY with supplier quotes before live tender use.
-- =====================================================================================

INSERT INTO public.company_rate_library
  (tenant_id, code, description, trade, discipline, unit, mode, base_rate, net_rate, category_tags, region, is_active, notes)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  v.code, v.description, v.trade, v.discipline, v.unit, 'flat', v.unit_price, v.unit_price,
  v.tags, 'Cambodia', true, v.notes
FROM (VALUES
-- ── Cement / binders ────────────────────────────────────────────────────────
 ('PL-CEM-01','Portland cement 42.5N, K-Cement (Kampot), bag 50kg','Concrete','Structural','bag',5.10,ARRAY['structural','cement'],'MoC PP 21,000 KHR/bag May-2025'),
 ('PL-CEM-02','Portland cement, Camel / Chip Mong Insee, bag 50kg','Concrete','Structural','bag',5.00,ARRAY['structural','cement'],'MoC PP 20,000 KHR/bag May-2025'),
 ('PL-CEM-03','Portland cement, Conch (Battambang), bag 50kg','Concrete','Structural','bag',4.60,ARRAY['structural','cement'],'Budget brand, verify availability'),
 ('PL-GRT-02','Non-shrink cementitious grout, bag 25kg','Concrete','Structural','bag',14.00,ARRAY['structural','grout'],'Baseplate & anchor grouting'),
-- ── Aggregates / fill ───────────────────────────────────────────────────────
 ('PL-SND-01','Sand, fine river (mortar/plaster), delivered','Aggregates','Structural','m3',13.00,ARRAY['structural','sand'],'PP delivered ~USD 80 per 6m3 truck'),
 ('PL-SND-02','Sand, coarse washed (concrete), delivered','Aggregates','Structural','m3',16.00,ARRAY['structural','sand'],'Concrete grade'),
 ('PL-AGG-01','Crushed stone 10-20mm (3/4"), delivered','Aggregates','Structural','m3',17.50,ARRAY['structural','aggregate'],'Concrete aggregate'),
 ('PL-AGG-02','Crushed stone 40mm / base course, delivered','Aggregates','Structural','m3',16.00,ARRAY['structural','aggregate'],'Blinding & sub-base'),
 ('PL-FIL-01','Laterite fill material, delivered & tipped','Fill','Structural','m3',8.00,ARRAY['structural','fill'],'Compaction fill'),
 ('PL-FIL-02','Selected soil fill, delivered & tipped','Fill','Structural','m3',6.00,ARRAY['structural','fill'],'General fill'),
-- ── Ready-mix concrete ──────────────────────────────────────────────────────
 ('PL-RMC-01','Ready-mix lean concrete C10, delivered','Concrete','Structural','m3',64.00,ARRAY['structural','concrete'],'CPAC list basis'),
 ('PL-RMC-02','Ready-mix concrete C21/18 (210ksc), delivered','Concrete','Structural','m3',75.00,ARRAY['structural','concrete'],'CPAC list basis'),
 ('PL-RMC-03','Ready-mix concrete C25 (240/250ksc), delivered','Concrete','Structural','m3',78.00,ARRAY['structural','concrete'],'Most common structural grade'),
 ('PL-RMC-04','Ready-mix concrete C30/25 (300ksc), delivered','Concrete','Structural','m3',80.00,ARRAY['structural','concrete'],'CPAC list basis'),
 ('PL-RMC-05','Ready-mix concrete C35/30 (350ksc), delivered','Concrete','Structural','m3',84.00,ARRAY['structural','concrete'],'High-rise columns/walls'),
 ('PL-RMC-06','Ready-mix concrete C40/35 (400ksc), delivered','Concrete','Structural','m3',88.00,ARRAY['structural','concrete'],'CPAC list basis'),
 ('PL-RMC-07','Concrete pumping service (boom/line)','Concrete','Structural','m3',3.50,ARRAY['structural','concrete'],'Per m3 pumped, min charge applies'),
 ('PL-ADM-01','Concrete admixture, plasticizer/retarder','Concrete','Structural','L',1.80,ARRAY['structural','admixture'],'Site-mix use'),
 ('PL-ADM-02','Curing compound, membrane type','Concrete','Structural','L',2.50,ARRAY['structural','admixture'],'Slabs & columns'),
 ('PL-WTR-01','Water for construction (trucked)','Concrete','Structural','m3',1.00,ARRAY['structural'],'Site-mix & curing'),
-- ── Reinforcement ───────────────────────────────────────────────────────────
 ('PL-REB-01','Round bar RB6 (SR24), 6mm','Rebar','Structural','kg',0.70,ARRAY['structural','rebar'],'Stirrups/links'),
 ('PL-REB-02','Deformed bar DB10 (SD40)','Rebar','Structural','kg',0.72,ARRAY['structural','rebar'],'MoC VN steel basis ~0.72/kg'),
 ('PL-REB-03','Deformed bar DB12 (SD40)','Rebar','Structural','kg',0.72,ARRAY['structural','rebar'],'MoC 31,500 KHR/12mm bar'),
 ('PL-REB-04','Deformed bar DB16 (SD40)','Rebar','Structural','kg',0.73,ARRAY['structural','rebar'],'~USD 700-730/t delivered'),
 ('PL-REB-05','Deformed bar DB20 (SD40)','Rebar','Structural','kg',0.74,ARRAY['structural','rebar'],''),
 ('PL-REB-06','Deformed bar DB25 (SD40)','Rebar','Structural','kg',0.75,ARRAY['structural','rebar'],''),
 ('PL-BWR-01','Black annealed binding wire','Rebar','Structural','kg',1.05,ARRAY['structural','rebar'],''),
 ('PL-MSH-01','Welded wire mesh A142 (6mm@200)','Rebar','Structural','m2',2.20,ARRAY['structural','rebar'],'Slab-on-grade'),
 ('PL-CVR-01','Concrete cover block / spacer','Rebar','Structural','pc',0.03,ARRAY['structural','rebar'],'25-50mm cover'),
 ('PL-CPL-01','Rebar mechanical coupler DB16-DB20','Rebar','Structural','ea',1.80,ARRAY['structural','rebar'],'High-rise splicing'),
-- ── Formwork & falsework ────────────────────────────────────────────────────
 ('PL-PLY-01','Plywood 15mm ordinary, sheet 1.22x2.44m','Formwork','Structural','sheet',15.50,ARRAY['structural','formwork'],'2-3 reuses'),
 ('PL-PLY-02','Film-faced formply 18mm, sheet 1.22x2.44m','Formwork','Structural','sheet',18.50,ARRAY['structural','formwork'],'4-6 reuses'),
 ('PL-TMB-01','Timber 50x100mm (2x4"), mixed hardwood','Formwork','Structural','m',0.65,ARRAY['structural','formwork'],'Walers/soldiers'),
 ('PL-TMB-02','Timber plank 25x150mm','Formwork','Structural','m',0.55,ARRAY['structural','formwork'],'Edge forms'),
 ('PL-NLS-01','Nails, assorted 2-4"','Formwork','Structural','kg',1.10,ARRAY['structural','formwork'],''),
 ('PL-TIE-01','Form tie rod + cone + wing nut set','Formwork','Structural','set',0.90,ARRAY['structural','formwork'],'Wall/column forms'),
 ('PL-OIL-01','Form release oil','Formwork','Structural','L',1.60,ARRAY['structural','formwork'],''),
 ('PL-PRP-01','Steel prop 2-4m, purchase','Formwork','Structural','ea',12.00,ARRAY['structural','formwork'],'Or rent - see plant section'),
-- ── Waterproofing & protection ──────────────────────────────────────────────
 ('PL-WPF-01','PVC waterstop 200mm','Waterproofing','Structural','m',2.80,ARRAY['structural','waterproofing'],'Construction joints, tanks'),
 ('PL-WPF-02','Bituminous membrane 3mm, torch-on','Waterproofing','Structural','m2',4.50,ARRAY['structural','waterproofing'],'Foundations/roof deck'),
 ('PL-WPF-03','Cementitious waterproof slurry, 2-part set 20kg+5L','Waterproofing','Structural','set',32.00,ARRAY['structural','waterproofing'],'Tanks, wet areas'),
 ('PL-EPX-01','Epoxy anchor adhesive, cartridge 380ml','Waterproofing','Structural','ea',9.50,ARRAY['structural','epoxy'],'Post-fix rebar/anchors'),
-- ── Structural / misc steel ────────────────────────────────────────────────
 ('PL-STL-01','Structural steel H/I-beam, supply','Steel','Structural','kg',0.95,ARRAY['structural','steel'],'Canopies, mezzanines'),
 ('PL-STL-02','Steel plate & flat bar, supply','Steel','Structural','kg',0.98,ARRAY['structural','steel'],''),
 ('PL-STL-03','Steel angle & channel, supply','Steel','Structural','kg',0.92,ARRAY['structural','steel'],''),
 ('PL-WLD-01','Welding electrode E6013, 2.6-3.2mm','Steel','Structural','kg',2.20,ARRAY['structural','steel'],''),
 ('PL-PNT-10','Anti-rust primer (red oxide/zinc)','Steel','Structural','L',4.50,ARRAY['structural','paint'],'Steelwork protection'),
-- ── Piling ──────────────────────────────────────────────────────────────────
 ('PL-PIL-01','Spun pile D300 class B, supply','Piling','Structural','m',13.50,ARRAY['structural','piling'],'Verify per project spec'),
 ('PL-PIL-02','Pile driving/jacking service D300','Piling','Structural','m',3.00,ARRAY['structural','piling'],'Rig mobilization extra'),
-- ── Labor — day rates (8h) ──────────────────────────────────────────────────
 ('PL-LAB-01','General laborer / helper','Labor','Structural','day',12.00,ARRAY['labor'],'~350-400 USD/month basis'),
 ('PL-LAB-02','Mason (concrete/masonry skilled)','Labor','Structural','day',17.00,ARRAY['labor'],'Skilled trade PP rate'),
 ('PL-LAB-03','Steel fixer (rebar), skilled','Labor','Structural','day',18.00,ARRAY['labor'],''),
 ('PL-LAB-04','Carpenter, formwork, skilled','Labor','Structural','day',18.00,ARRAY['labor'],''),
 ('PL-LAB-05','Welder, certified','Labor','Structural','day',20.00,ARRAY['labor'],''),
 ('PL-LAB-06','Site foreman / ganger','Labor','Structural','day',28.00,ARRAY['labor'],''),
 ('PL-LAB-07','Surveyor + instrument man (pair)','Labor','Structural','day',45.00,ARRAY['labor'],'Setting-out crew'),
-- ── Labor-only subcontract rates ────────────────────────────────────────────
 ('PL-LOS-01','Labor-only: concreting, place & finish','Labor','Structural','m3',8.00,ARRAY['labor','subcon'],'Excl. pump & materials'),
 ('PL-LOS-02','Labor-only: rebar cut/bend/fix','Labor','Structural','t',90.00,ARRAY['labor','subcon'],'Per tonne fixed'),
 ('PL-LOS-03','Labor-only: formwork erect & strike','Labor','Structural','m2',3.00,ARRAY['labor','subcon'],'Contact area'),
-- ── Plant & equipment ──────────────────────────────────────────────────────
 ('PL-PLT-01','Concrete mixer 350-500L, rental','Plant','Structural','day',25.00,ARRAY['plant'],'Excl. fuel/operator'),
 ('PL-PLT-02','Concrete vibrator (poker), rental','Plant','Structural','day',8.00,ARRAY['plant'],''),
 ('PL-PLT-03','Bar cutter machine, rental','Plant','Structural','day',15.00,ARRAY['plant'],''),
 ('PL-PLT-04','Bar bender machine, rental','Plant','Structural','day',15.00,ARRAY['plant'],''),
 ('PL-PLT-05','Excavator PC120-200 incl. operator+fuel','Plant','Structural','hour',50.00,ARRAY['plant'],'USD 45-60/h by size'),
 ('PL-PLT-06','Mobile crane 25t incl. operator','Plant','Structural','day',350.00,ARRAY['plant'],''),
 ('PL-PLT-07','Tower crane 6t, monthly rental','Plant','Structural','month',8500.00,ARRAY['plant'],'Erection/dismantle extra'),
 ('PL-PLT-08','Generator 60kVA, rental','Plant','Structural','day',45.00,ARRAY['plant'],'Excl. diesel'),
 ('PL-PLT-09','Plate compactor, rental','Plant','Structural','day',12.00,ARRAY['plant'],''),
 ('PL-PLT-10','Water pump 3", rental','Plant','Structural','day',10.00,ARRAY['plant'],'Dewatering'),
 ('PL-PLT-11','Steel prop, rental','Plant','Structural','month',1.50,ARRAY['plant'],'Per prop per month'),
 ('PL-PLT-12','Scaffolding frame set (2 frames+braces), rental','Plant','Structural','month',3.00,ARRAY['plant'],'Per set per month'),
 ('PL-FUE-01','Diesel fuel','Plant','Structural','L',0.95,ARRAY['plant'],'~3,800-4,000 KHR/L')
) AS v(code, description, trade, discipline, unit, unit_price, tags, notes)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- End of STR rate library seed (72 items)
