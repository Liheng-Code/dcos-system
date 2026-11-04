-- =====================================================================================
-- DCOS Seed Data — Price List: STRUCTURE (STR)
-- Market basis : Cambodia — Phnom Penh, delivered to site, USD, EXCLUDING VAT (10%)
-- Price date   : Q2-2026 indicative. Anchored sources:
--   * Cement: MoC/CEIC Phnom Penh — K-Cement 21,000 KHR/bag, Elephant 20,000 KHR (May-2025)
--   * Ready-mix: CPAC / Chip Mong / High Land published lists (~USD 58–88/m3 by grade)
--   * Rebar: MoC Phnom Penh, VN 12mm 31,500 KHR/bar ≈ USD 0.72/kg; market USD 600–750/t
--   * Sand/stone: PP market ~USD 13/m3 sand, ~USD 16–18/m3 crushed stone delivered
--   * Labor: laborer USD 300–400/month ≈ 12–15/day; skilled trades 17–22/day (PP 2025)
-- All other items are indicative Phnom Penh market rates — VERIFY with supplier quotes
-- before using in a live tender. Provinces: add 5–15% transport uplift outside PP/Kandal.
-- =====================================================================================
-- HOW TO RUN: replace the two UUIDs in params, then run the whole file.
-- Requires unique constraint: (tender_id, code). Re-runnable (ON CONFLICT DO NOTHING).
-- =====================================================================================

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,   -- << your tenant_id
    '00000000-0000-0000-0000-000000000002'::uuid AS tender_id    -- << your tender_id
)
INSERT INTO price_list_items
  (tenant_id, tender_id, code, description, category, unit, unit_price, currency,
   supplier_name, quote_ref, quote_date, valid_until, is_active, notes)
SELECT p.tenant_id, p.tender_id,
       v.code, v.description, v.category, v.unit, v.unit_price, 'USD',
       v.supplier_name, 'MKT-2026Q2', DATE '2026-07-01', DATE '2026-09-30', true, v.notes
FROM params p,
(VALUES
-- ── Cement / binders ────────────────────────────────────────────────────────────────
 ('PL-CEM-01','Portland cement 42.5N, K-Cement (Kampot), bag 50kg','material','bag',5.10,'Kampot Cement (SCG)','MoC PP 21,000 KHR/bag May-2025'),
 ('PL-CEM-02','Portland cement, Camel / Chip Mong Insee, bag 50kg','material','bag',5.00,'Chip Mong Insee','MoC PP 20,000 KHR/bag May-2025'),
 ('PL-CEM-03','Portland cement, Conch (Battambang), bag 50kg','material','bag',4.60,'Battambang Conch','Budget brand, verify availability'),
 ('PL-GRT-02','Non-shrink cementitious grout, bag 25kg','material','bag',14.00,'Sika/Fosroc dealer PP','Baseplate & anchor grouting'),
-- ── Aggregates / fill ───────────────────────────────────────────────────────────────
 ('PL-SND-01','Sand, fine river (mortar/plaster), delivered','material','m3',13.00,'Mekong sand depot','PP delivered ~USD 80 per 6m3 truck'),
 ('PL-SND-02','Sand, coarse washed (concrete), delivered','material','m3',16.00,'Mekong sand depot','Concrete grade'),
 ('PL-AGG-01','Crushed stone 10–20mm (3/4"), delivered','material','m3',17.50,'Quarry depot Kampong Speu','Concrete aggregate'),
 ('PL-AGG-02','Crushed stone 40mm / base course, delivered','material','m3',16.00,'Quarry depot','Blinding & sub-base'),
 ('PL-FIL-01','Laterite fill material, delivered & tipped','material','m3',8.00,'Local supplier','Compaction fill'),
 ('PL-FIL-02','Selected soil fill, delivered & tipped','material','m3',6.00,'Local supplier','General fill'),
-- ── Ready-mix concrete (delivered, ≤15km, excl. pump) ───────────────────────────────
 ('PL-RMC-01','Ready-mix lean concrete C10, delivered','material','m3',64.00,'CPAC / Chip Mong Concrete','CPAC list basis'),
 ('PL-RMC-02','Ready-mix concrete C21/18 (210ksc), delivered','material','m3',75.00,'CPAC / Chip Mong Concrete','CPAC list basis'),
 ('PL-RMC-03','Ready-mix concrete C25 (240/250ksc), delivered','material','m3',78.00,'CPAC / Chip Mong Concrete','Most common structural grade'),
 ('PL-RMC-04','Ready-mix concrete C30/25 (300ksc), delivered','material','m3',80.00,'CPAC / Chip Mong Concrete','CPAC list basis'),
 ('PL-RMC-05','Ready-mix concrete C35/30 (350ksc), delivered','material','m3',84.00,'CPAC / Chip Mong Concrete','High-rise columns/walls'),
 ('PL-RMC-06','Ready-mix concrete C40/35 (400ksc), delivered','material','m3',88.00,'CPAC / Chip Mong Concrete','CPAC list basis'),
 ('PL-RMC-07','Concrete pumping service (boom/line)','material','m3',3.50,'Batching plant','Per m3 pumped, min charge applies'),
 ('PL-ADM-01','Concrete admixture, plasticizer/retarder','material','L',1.80,'Sika/BASF dealer PP','Site-mix use'),
 ('PL-ADM-02','Curing compound, membrane type','material','L',2.50,'Sika/Fosroc dealer PP','Slabs & columns'),
 ('PL-WTR-01','Water for construction (trucked)','material','m3',1.00,'Local water truck','Site-mix & curing'),
-- ── Reinforcement ───────────────────────────────────────────────────────────────────
 ('PL-REB-01','Round bar RB6 (SR24), 6mm','material','kg',0.70,'Steel depot PP (VN/local mill)','Stirrups/links'),
 ('PL-REB-02','Deformed bar DB10 (SD40)','material','kg',0.72,'Steel depot PP','MoC VN steel basis ~0.72/kg'),
 ('PL-REB-03','Deformed bar DB12 (SD40)','material','kg',0.72,'Steel depot PP','MoC 31,500 KHR/12mm bar'),
 ('PL-REB-04','Deformed bar DB16 (SD40)','material','kg',0.73,'Steel depot PP','~USD 700–730/t delivered'),
 ('PL-REB-05','Deformed bar DB20 (SD40)','material','kg',0.74,'Steel depot PP',''),
 ('PL-REB-06','Deformed bar DB25 (SD40)','material','kg',0.75,'Steel depot PP',''),
 ('PL-BWR-01','Black annealed binding wire','material','kg',1.05,'Steel depot PP',''),
 ('PL-MSH-01','Welded wire mesh A142 (6mm@200)','material','m2',2.20,'Steel depot PP','Slab-on-grade'),
 ('PL-CVR-01','Concrete cover block / spacer','material','pc',0.03,'Local precast','25–50mm cover'),
 ('PL-CPL-01','Rebar mechanical coupler DB16–DB20','material','ea',1.80,'Specialist supplier','High-rise splicing'),
-- ── Formwork & falsework ────────────────────────────────────────────────────────────
 ('PL-PLY-01','Plywood 15mm ordinary, sheet 1.22×2.44m','material','sheet',15.50,'Timber shop PP','2–3 reuses'),
 ('PL-PLY-02','Film-faced formply 18mm, sheet 1.22×2.44m','material','sheet',18.50,'Timber shop PP','4–6 reuses'),
 ('PL-TMB-01','Timber 50×100mm (2×4"), mixed hardwood','material','m',0.65,'Timber shop PP','Walers/soldiers'),
 ('PL-TMB-02','Timber plank 25×150mm','material','m',0.55,'Timber shop PP','Edge forms'),
 ('PL-NLS-01','Nails, assorted 2–4"','material','kg',1.10,'Hardware shop',''),
 ('PL-TIE-01','Form tie rod + cone + wing nut set','material','set',0.90,'Formwork supplier','Wall/column forms'),
 ('PL-OIL-01','Form release oil','material','L',1.60,'Hardware shop',''),
 ('PL-PRP-01','Steel prop 2–4m, purchase','material','ea',12.00,'Scaffold supplier PP','Or rent — see plant section'),
-- ── Waterproofing & protection (structural) ────────────────────────────────────────
 ('PL-WPF-01','PVC waterstop 200mm','material','m',2.80,'Sika/Fosroc dealer','Construction joints, tanks'),
 ('PL-WPF-02','Bituminous membrane 3mm, torch-on','material','m2',4.50,'Waterproofing supplier','Foundations/roof deck'),
 ('PL-WPF-03','Cementitious waterproof slurry, 2-part set 20kg+5L','material','set',32.00,'Sika/Fosroc dealer','Tanks, wet areas'),
 ('PL-EPX-01','Epoxy anchor adhesive, cartridge 380ml','material','ea',9.50,'Hilti/Sika dealer','Post-fix rebar/anchors'),
-- ── Structural / misc steel ────────────────────────────────────────────────────────
 ('PL-STL-01','Structural steel H/I-beam, supply','material','kg',0.95,'Steel depot PP','Canopies, mezzanines'),
 ('PL-STL-02','Steel plate & flat bar, supply','material','kg',0.98,'Steel depot PP',''),
 ('PL-STL-03','Steel angle & channel, supply','material','kg',0.92,'Steel depot PP',''),
 ('PL-WLD-01','Welding electrode E6013, 2.6–3.2mm','material','kg',2.20,'Hardware shop',''),
 ('PL-PNT-10','Anti-rust primer (red oxide/zinc)','material','L',4.50,'Paint shop','Steelwork protection'),
-- ── Piling ──────────────────────────────────────────────────────────────────────────
 ('PL-PIL-01','Spun pile D300 class B, supply','material','m',13.50,'Precast pile factory','Verify per project spec'),
 ('PL-PIL-02','Pile driving/jacking service D300','material','m',3.00,'Piling subcontractor','Rig mobilization extra'),
-- ── Labor — day rates (8h), Phnom Penh site basis ──────────────────────────────────
 ('PL-LAB-01','General laborer / helper','labor','day',12.00,NULL,'~350–400 USD/month basis'),
 ('PL-LAB-02','Mason (concrete/masonry skilled)','labor','day',17.00,NULL,'Skilled trade PP rate'),
 ('PL-LAB-03','Steel fixer (rebar), skilled','labor','day',18.00,NULL,''),
 ('PL-LAB-04','Carpenter, formwork, skilled','labor','day',18.00,NULL,''),
 ('PL-LAB-05','Welder, certified','labor','day',20.00,NULL,''),
 ('PL-LAB-06','Site foreman / ganger','labor','day',28.00,NULL,''),
 ('PL-LAB-07','Surveyor + instrument man (pair)','labor','day',45.00,NULL,'Setting-out crew'),
-- ── Labor-only subcontract rates (common Cambodia practice) ────────────────────────
 ('PL-LOS-01','Labor-only: concreting, place & finish','labor','m3',8.00,'Labor subcontractor','Excl. pump & materials'),
 ('PL-LOS-02','Labor-only: rebar cut/bend/fix','labor','t',90.00,'Labor subcontractor','Per tonne fixed'),
 ('PL-LOS-03','Labor-only: formwork erect & strike','labor','m2',3.00,'Labor subcontractor','Contact area'),
-- ── Plant & equipment (rental incl. operator where noted) ──────────────────────────
 ('PL-PLT-01','Concrete mixer 350–500L, rental','plant','day',25.00,'Plant hire PP','Excl. fuel/operator'),
 ('PL-PLT-02','Concrete vibrator (poker), rental','plant','day',8.00,'Plant hire PP',''),
 ('PL-PLT-03','Bar cutter machine, rental','plant','day',15.00,'Plant hire PP',''),
 ('PL-PLT-04','Bar bender machine, rental','plant','day',15.00,'Plant hire PP',''),
 ('PL-PLT-05','Excavator PC120–200 incl. operator+fuel','plant','hour',50.00,'Plant hire PP','USD 45–60/h by size'),
 ('PL-PLT-06','Mobile crane 25t incl. operator','plant','day',350.00,'Crane hire PP',''),
 ('PL-PLT-07','Tower crane 6t, monthly rental','plant','month',8500.00,'Crane hire','Erection/dismantle extra'),
 ('PL-PLT-08','Generator 60kVA, rental','plant','day',45.00,'Plant hire PP','Excl. diesel'),
 ('PL-PLT-09','Plate compactor, rental','plant','day',12.00,'Plant hire PP',''),
 ('PL-PLT-10','Water pump 3", rental','plant','day',10.00,'Plant hire PP','Dewatering'),
 ('PL-PLT-11','Steel prop, rental','plant','month',1.50,'Scaffold supplier','Per prop per month'),
 ('PL-PLT-12','Scaffolding frame set (2 frames+braces), rental','plant','month',3.00,'Scaffold supplier','Per set per month'),
 ('PL-FUE-01','Diesel fuel','plant','L',0.95,'Fuel station','~3,800–4,000 KHR/L')
) AS v(code, description, category, unit, unit_price, supplier_name, notes)
ON CONFLICT (tender_id, code) DO NOTHING;

-- End of STR price list seed (72 items)
