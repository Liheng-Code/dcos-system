-- =====================================================================================
-- DCOS Seed Data — Price List: ARCHITECTURE (ARC)
-- Market basis : Cambodia — Phnom Penh, delivered to site, USD, EXCLUDING VAT (10%)
-- Price date   : Q2-2026 indicative. Cement/sand anchored to MoC PP commodity data;
--   bricks reflect the local red-clay kiln market (400+ kilns, Mekong/Tonle Sap belt);
--   tiles/sanitary/aluminum are typical PP shop rates for standard commercial grades
--   (mid-range Chinese/Thai/Vietnamese imports). Premium brands cost 1.5–3x these rates.
-- VERIFY with supplier quotes before live tender use. Provinces: +5–15% transport.
-- NOTE: shared basics (cement, sand, laborer, mason) repeat STR codes — the
--   ON CONFLICT clause dedupes them, so files can run standalone or together.
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
-- ── Shared basics (dedupe with STR file) ───────────────────────────────────────────
 ('PL-CEM-01','Portland cement 42.5N, K-Cement (Kampot), bag 50kg','material','bag',5.10,'Kampot Cement (SCG)','MoC PP 21,000 KHR/bag May-2025'),
 ('PL-SND-01','Sand, fine river (mortar/plaster), delivered','material','m3',13.00,'Mekong sand depot','PP delivered basis'),
-- ── Masonry ────────────────────────────────────────────────────────────────────────
 ('PL-BRK-01','Red clay brick, local kiln (approx 40x80x170mm)','material','pc',0.065,'Local brick kiln','Dominant walling material in KH'),
 ('PL-BRK-02','Red clay brick, hollow 100mm','material','pc',0.22,'Local brick kiln',''),
 ('PL-BLK-01','Hollow concrete block 100mm (10x20x40cm)','material','pc',0.42,'Block factory PP',''),
 ('PL-BLK-02','Hollow concrete block 150mm (15x20x40cm)','material','pc',0.55,'Block factory PP',''),
 ('PL-BLK-03','Hollow concrete block 200mm (20x20x40cm)','material','pc',0.68,'Block factory PP',''),
 ('PL-BLK-04','AAC lightweight block 600x200x100mm','material','pc',1.10,'AAC plant / importer','High-rise infill walls'),
 ('PL-LNT-01','Precast concrete lintel 100x100mm','material','m',3.20,'Local precast','Over openings'),
-- ── Plaster, render & skim ─────────────────────────────────────────────────────────
 ('PL-SKM-01','Skim coat / wall finishing compound, bag 20kg','material','bag',7.50,'TOA/Jotun/Lanko dealer',''),
 ('PL-PTY-01','Wall putty (acrylic), bag 20kg','material','bag',8.00,'Paint shop PP',''),
 ('PL-GYP-01','Gypsum plaster powder, bag 25kg','material','bag',4.20,'Building materials shop',''),
 ('PL-MSH-02','Galvanised plaster mesh (crack control)','material','m2',0.60,'Hardware shop','At dissimilar material joints'),
-- ── Floor & wall tiling / stone ────────────────────────────────────────────────────
 ('PL-TIL-01','Ceramic floor tile 300x300, standard','material','m2',4.50,'Tile shop PP','Budget grade'),
 ('PL-TIL-02','Ceramic wall tile 300x600, standard','material','m2',5.50,'Tile shop PP',''),
 ('PL-TIL-03','Porcelain tile 600x600, standard commercial','material','m2',8.50,'Tile shop PP','Mid-range import'),
 ('PL-TIL-04','Porcelain tile 800x800, polished','material','m2',12.00,'Tile shop PP',''),
 ('PL-TIL-05','Anti-slip ceramic tile 300x300 (wet areas)','material','m2',5.00,'Tile shop PP',''),
 ('PL-STN-01','Granite tile/slab 20mm, standard grey','material','m2',28.00,'Stone shop PP','Counters/feature floors'),
 ('PL-ADH-01','Tile adhesive, bag 20kg','material','bag',6.80,'Weber/Lanko/Jorakay dealer','Covers 4-5 m2 per bag'),
 ('PL-GRT-01','Tile grout, coloured','material','kg',1.20,'Tile shop PP',''),
 ('PL-TRM-01','Stainless steel tile trim/edge','material','m',2.20,'Tile shop PP',''),
 ('PL-SPC-01','Tile spacers/levelling clips, bag 100pc','material','bag',1.50,'Tile shop PP',''),
-- ── Painting & coatings ────────────────────────────────────────────────────────────
 ('PL-PNT-01','Emulsion paint, interior, 18L pail','material','pail',42.00,'TOA/Jotun/Nippon dealer','Standard grade, ~90-110 m2/coat'),
 ('PL-PNT-02','Emulsion paint, exterior weathershield, 18L pail','material','pail',78.00,'TOA/Jotun/Nippon dealer',''),
 ('PL-PNT-03','Sealer/primer, water-based, 18L pail','material','pail',38.00,'Paint dealer PP',''),
 ('PL-PNT-04','Enamel gloss paint (wood/metal), 3L can','material','can',14.00,'Paint dealer PP',''),
 ('PL-PNT-05','Paint thinner','material','L',2.00,'Paint dealer PP',''),
 ('PL-SND-10','Sandpaper, assorted grit','material','sheet',0.25,'Hardware shop',''),
-- ── Doors, windows & glazing ───────────────────────────────────────────────────────
 ('PL-DOR-01','Solid engineered timber door leaf 900x2100x40mm','material','ea',85.00,'Door factory PP','Paint/veneer finish'),
 ('PL-DOR-02','HDF/moulded door leaf 800-900x2100mm','material','ea',45.00,'Door shop PP','Interior standard'),
 ('PL-DOR-03','Steel fire-rated door + frame, 60min, single leaf','material','ea',260.00,'Fire door supplier','Incl. closer & hardware; verify cert'),
 ('PL-DOR-04','Timber door frame set, hardwood','material','set',35.00,'Timber shop PP',''),
 ('PL-WIN-01','Aluminum sliding window, powder-coated, 5mm glass','material','m2',55.00,'Aluminum fabricator PP','Supply & install typical'),
 ('PL-WIN-02','Aluminum swing/casement door, powder-coated, glass','material','m2',75.00,'Aluminum fabricator PP','Supply & install typical'),
 ('PL-GLS-01','Clear float glass 5mm, cut to size','material','m2',8.00,'Glass shop PP',''),
 ('PL-GLS-02','Tempered glass 8mm','material','m2',22.00,'Glass shop PP','Balustrades/shopfronts'),
 ('PL-IRM-01','Door lockset, lever mortise, standard','material','ea',18.00,'Hardware shop PP',''),
 ('PL-IRM-02','SS butt hinge 4", pair','material','pair',3.50,'Hardware shop PP',''),
 ('PL-IRM-03','Door closer, surface mounted','material','ea',22.00,'Hardware shop PP',''),
-- ── Ceilings & partitions ──────────────────────────────────────────────────────────
 ('PL-GYB-01','Gypsum board 9mm, sheet 1.22x2.44m','material','sheet',5.00,'Gyproc/Knauf/Elephant dealer',''),
 ('PL-GYB-02','Gypsum board 9mm moisture-resistant, sheet','material','sheet',6.80,'Gypsum dealer PP','Wet areas'),
 ('PL-FRC-01','Metal furring channel + accessories','material','m',0.55,'Gypsum dealer PP','Concealed ceiling grid'),
 ('PL-FRC-02','Suspension rod + adjustable clip set','material','set',0.70,'Gypsum dealer PP',''),
 ('PL-TGR-01','Exposed T-grid system 600x600, complete','material','m2',2.20,'Gypsum dealer PP',''),
 ('PL-MFT-01','Mineral fiber ceiling tile 600x600','material','pc',1.80,'Ceiling supplier PP','T-bar lay-in'),
 ('PL-PVC-20','PVC ceiling panel 250mm wide','material','m',1.40,'Building materials shop','Wet areas / budget ceilings'),
 ('PL-STD-01','Metal stud 76mm + track, partition framing','material','m',0.85,'Gypsum dealer PP',''),
 ('PL-INS-01','Rockwool insulation 50mm, 60kg/m3','material','m2',1.90,'Insulation supplier','Partition acoustic infill'),
-- ── Roofing & rainwater ────────────────────────────────────────────────────────────
 ('PL-RUF-01','Metal roof sheet, colorbond 0.42mm BMT','material','m2',4.80,'Roof roll-former PP','Zincalume/painted'),
 ('PL-RUF-02','Ridge capping / flashing, colorbond','material','m',3.00,'Roof roll-former PP',''),
 ('PL-RUF-03','Concrete roof tile, flat profile','material','pc',0.55,'Tile factory (SCG/local)','~10 pc per m2'),
 ('PL-RUF-04','Reflective foil insulation + mesh','material','m2',1.20,'Roof supplier',''),
 ('PL-RUF-05','Polycarbonate sheet 6mm','material','m2',9.50,'Building materials shop','Canopies/skylights'),
-- ── Floor finishes & misc architectural ────────────────────────────────────────────
 ('PL-FLR-01','Floor hardener powder, bag 25kg','material','bag',9.50,'Sika/Lanko dealer','Warehouse slabs'),
 ('PL-FLR-02','Self-levelling compound, bag 25kg','material','bag',12.00,'Weber/Lanko dealer',''),
 ('PL-FLR-03','Vinyl floor tile (LVT) 3mm','material','m2',9.00,'Flooring shop PP',''),
 ('PL-RLG-01','Stainless steel railing 304, complete','material','m',45.00,'SS fabricator PP','Supply & install typical'),
 ('PL-RLG-02','Mild steel railing, painted, complete','material','m',22.00,'Steel fabricator PP','Supply & install typical'),
 ('PL-SIL-01','Silicone sealant, neutral cure, 300ml','material','tube',2.80,'Hardware shop PP',''),
 ('PL-EXP-01','Aluminum expansion joint cover, floor 50mm','material','m',18.00,'Specialist supplier',''),
-- ── Labor — day rates (8h) ─────────────────────────────────────────────────────────
 ('PL-LAB-01','General laborer / helper','labor','day',12.00,NULL,'Shared code with STR'),
 ('PL-LAB-02','Mason (concrete/masonry skilled)','labor','day',17.00,NULL,'Shared code with STR'),
 ('PL-LAB-10','Plasterer, skilled','labor','day',17.00,NULL,''),
 ('PL-LAB-11','Tiler, skilled','labor','day',20.00,NULL,''),
 ('PL-LAB-12','Painter','labor','day',15.00,NULL,''),
 ('PL-LAB-13','Gypsum/ceiling installer','labor','day',17.00,NULL,''),
 ('PL-LAB-14','Aluminum/glazing installer','labor','day',20.00,NULL,''),
 ('PL-LAB-15','Joinery carpenter (doors/fitout)','labor','day',18.00,NULL,''),
-- ── Labor-only subcontract rates (common Cambodia practice) ────────────────────────
 ('PL-LOS-10','Labor-only: brick/block laying','labor','m2',1.60,'Labor subcontractor','Wall area'),
 ('PL-LOS-11','Labor-only: plastering 2 coats','labor','m2',1.30,'Labor subcontractor',''),
 ('PL-LOS-12','Labor-only: floor/wall tiling','labor','m2',2.50,'Labor subcontractor',''),
 ('PL-LOS-13','Labor-only: painting 1 primer + 2 topcoats','labor','m2',0.50,'Labor subcontractor',''),
 ('PL-LOS-14','Labor-only: gypsum ceiling install','labor','m2',1.80,'Labor subcontractor',''),
-- ── Plant (ARC-specific) ───────────────────────────────────────────────────────────
 ('PL-PLT-20','Mobile scaffold tower, rental','plant','day',6.00,'Scaffold supplier',''),
 ('PL-PLT-21','Tile cutter (wet saw), rental','plant','day',8.00,'Plant hire PP',''),
 ('PL-PLT-22','Airless paint sprayer, rental','plant','day',18.00,'Plant hire PP','')
) AS v(code, description, category, unit, unit_price, supplier_name, notes)
ON CONFLICT (tender_id, code) DO NOTHING;

-- End of ARC price list seed (77 items)
