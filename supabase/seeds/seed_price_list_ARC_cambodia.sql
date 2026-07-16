-- =====================================================================================
-- DCOS Seed Data — Company Rate Library: ARCHITECTURE (ARC)
-- Market basis : Cambodia — Phnom Penh, USD
-- Price date   : Q2-2026 indicative. Rates are flat (resource) prices for the
--   company-wide rate library. Import into any tender's Unit Rates tab.
-- Shared basics (cement, sand, laborer, mason) repeat STR codes — the
--   ON CONFLICT clause dedupes them, so files can run standalone or together.
-- VERIFY with supplier quotes before live tender use.
-- =====================================================================================

INSERT INTO public.company_rate_library
  (tenant_id, code, description, trade, discipline, unit, mode, base_rate, net_rate, category_tags, region, is_active, notes)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  v.code, v.description, v.trade, v.discipline, v.unit, 'flat', v.unit_price, v.unit_price,
  v.tags, 'Cambodia', true, v.notes
FROM (VALUES
-- ── Shared basics (dedupe with STR file) ───────────────────────────────────
 ('PL-CEM-01','Portland cement 42.5N, K-Cement (Kampot), bag 50kg','Concrete','Architecture','bag',5.10,ARRAY['architectural','cement'],'MoC PP 21,000 KHR/bag May-2025'),
 ('PL-SND-01','Sand, fine river (mortar/plaster), delivered','Aggregates','Architecture','m3',13.00,ARRAY['architectural','sand'],'PP delivered basis'),
-- ── Masonry ────────────────────────────────────────────────────────────────
 ('PL-BRK-01','Red clay brick, local kiln (approx 40x80x170mm)','Masonry','Architecture','pc',0.065,ARRAY['architectural','brick'],'Dominant walling material in KH'),
 ('PL-BRK-02','Red clay brick, hollow 100mm','Masonry','Architecture','pc',0.22,ARRAY['architectural','brick'],''),
 ('PL-BLK-01','Hollow concrete block 100mm (10x20x40cm)','Masonry','Architecture','pc',0.42,ARRAY['architectural','block'],''),
 ('PL-BLK-02','Hollow concrete block 150mm (15x20x40cm)','Masonry','Architecture','pc',0.55,ARRAY['architectural','block'],''),
 ('PL-BLK-03','Hollow concrete block 200mm (20x20x40cm)','Masonry','Architecture','pc',0.68,ARRAY['architectural','block'],''),
 ('PL-BLK-04','AAC lightweight block 600x200x100mm','Masonry','Architecture','pc',1.10,ARRAY['architectural','block'],'High-rise infill walls'),
 ('PL-LNT-01','Precast concrete lintel 100x100mm','Masonry','Architecture','m',3.20,ARRAY['architectural','lintel'],'Over openings'),
-- ── Plaster, render & skim ─────────────────────────────────────────────────
 ('PL-SKM-01','Skim coat / wall finishing compound, bag 20kg','Plastering','Architecture','bag',7.50,ARRAY['architectural','plaster'],''),
 ('PL-PTY-01','Wall putty (acrylic), bag 20kg','Plastering','Architecture','bag',8.00,ARRAY['architectural','plaster'],''),
 ('PL-GYP-01','Gypsum plaster powder, bag 25kg','Plastering','Architecture','bag',4.20,ARRAY['architectural','plaster'],''),
 ('PL-MSH-02','Galvanised plaster mesh (crack control)','Plastering','Architecture','m2',0.60,ARRAY['architectural','plaster'],'At dissimilar material joints'),
-- ── Floor & wall tiling / stone ────────────────────────────────────────────
 ('PL-TIL-01','Ceramic floor tile 300x300, standard','Tiling','Architecture','m2',4.50,ARRAY['architectural','tile'],'Budget grade'),
 ('PL-TIL-02','Ceramic wall tile 300x600, standard','Tiling','Architecture','m2',5.50,ARRAY['architectural','tile'],''),
 ('PL-TIL-03','Porcelain tile 600x600, standard commercial','Tiling','Architecture','m2',8.50,ARRAY['architectural','tile'],'Mid-range import'),
 ('PL-TIL-04','Porcelain tile 800x800, polished','Tiling','Architecture','m2',12.00,ARRAY['architectural','tile'],''),
 ('PL-TIL-05','Anti-slip ceramic tile 300x300 (wet areas)','Tiling','Architecture','m2',5.00,ARRAY['architectural','tile'],''),
 ('PL-STN-01','Granite tile/slab 20mm, standard grey','Tiling','Architecture','m2',28.00,ARRAY['architectural','stone'],'Counters/feature floors'),
 ('PL-ADH-01','Tile adhesive, bag 20kg','Tiling','Architecture','bag',6.80,ARRAY['architectural','adhesive'],'Covers 4-5 m2 per bag'),
 ('PL-GRT-01','Tile grout, coloured','Tiling','Architecture','kg',1.20,ARRAY['architectural','grout'],''),
 ('PL-TRM-01','Stainless steel tile trim/edge','Tiling','Architecture','m',2.20,ARRAY['architectural','trim'],''),
 ('PL-SPC-01','Tile spacers/levelling clips, bag 100pc','Tiling','Architecture','bag',1.50,ARRAY['architectural'],''),
-- ── Painting & coatings ────────────────────────────────────────────────────
 ('PL-PNT-01','Emulsion paint, interior, 18L pail','Painting','Architecture','pail',42.00,ARRAY['architectural','paint'],'Standard grade, ~90-110 m2/coat'),
 ('PL-PNT-02','Emulsion paint, exterior weathershield, 18L pail','Painting','Architecture','pail',78.00,ARRAY['architectural','paint'],''),
 ('PL-PNT-03','Sealer/primer, water-based, 18L pail','Painting','Architecture','pail',38.00,ARRAY['architectural','paint'],''),
 ('PL-PNT-04','Enamel gloss paint (wood/metal), 3L can','Painting','Architecture','can',14.00,ARRAY['architectural','paint'],''),
 ('PL-PNT-05','Paint thinner','Painting','Architecture','L',2.00,ARRAY['architectural','paint'],''),
 ('PL-SND-10','Sandpaper, assorted grit','Painting','Architecture','sheet',0.25,ARRAY['architectural'],''),
-- ── Doors, windows & glazing ───────────────────────────────────────────────
 ('PL-DOR-01','Solid engineered timber door leaf 900x2100x40mm','Doors & Windows','Architecture','ea',85.00,ARRAY['architectural','door'],'Paint/veneer finish'),
 ('PL-DOR-02','HDF/moulded door leaf 800-900x2100mm','Doors & Windows','Architecture','ea',45.00,ARRAY['architectural','door'],'Interior standard'),
 ('PL-DOR-03','Steel fire-rated door + frame, 60min, single leaf','Doors & Windows','Architecture','ea',260.00,ARRAY['architectural','door'],'Incl. closer & hardware; verify cert'),
 ('PL-DOR-04','Timber door frame set, hardwood','Doors & Windows','Architecture','set',35.00,ARRAY['architectural','door'],''),
 ('PL-WIN-01','Aluminum sliding window, powder-coated, 5mm glass','Doors & Windows','Architecture','m2',55.00,ARRAY['architectural','window'],'Supply & install typical'),
 ('PL-WIN-02','Aluminum swing/casement door, powder-coated, glass','Doors & Windows','Architecture','m2',75.00,ARRAY['architectural','window'],'Supply & install typical'),
 ('PL-GLS-01','Clear float glass 5mm, cut to size','Doors & Windows','Architecture','m2',8.00,ARRAY['architectural','glass'],''),
 ('PL-GLS-02','Tempered glass 8mm','Doors & Windows','Architecture','m2',22.00,ARRAY['architectural','glass'],'Balustrades/shopfronts'),
 ('PL-IRM-01','Door lockset, lever mortise, standard','Doors & Windows','Architecture','ea',18.00,ARRAY['architectural','hardware'],''),
 ('PL-IRM-02','SS butt hinge 4", pair','Doors & Windows','Architecture','pair',3.50,ARRAY['architectural','hardware'],''),
 ('PL-IRM-03','Door closer, surface mounted','Doors & Windows','Architecture','ea',22.00,ARRAY['architectural','hardware'],''),
-- ── Ceilings & partitions ──────────────────────────────────────────────────
 ('PL-GYB-01','Gypsum board 9mm, sheet 1.22x2.44m','Ceiling','Architecture','sheet',5.00,ARRAY['architectural','ceiling'],''),
 ('PL-GYB-02','Gypsum board 9mm moisture-resistant, sheet','Ceiling','Architecture','sheet',6.80,ARRAY['architectural','ceiling'],'Wet areas'),
 ('PL-FRC-01','Metal furring channel + accessories','Ceiling','Architecture','m',0.55,ARRAY['architectural','ceiling'],'Concealed ceiling grid'),
 ('PL-FRC-02','Suspension rod + adjustable clip set','Ceiling','Architecture','set',0.70,ARRAY['architectural','ceiling'],''),
 ('PL-TGR-01','Exposed T-grid system 600x600, complete','Ceiling','Architecture','m2',2.20,ARRAY['architectural','ceiling'],''),
 ('PL-MFT-01','Mineral fiber ceiling tile 600x600','Ceiling','Architecture','pc',1.80,ARRAY['architectural','ceiling'],'T-bar lay-in'),
 ('PL-PVC-20','PVC ceiling panel 250mm wide','Ceiling','Architecture','m',1.40,ARRAY['architectural','ceiling'],'Wet areas / budget ceilings'),
 ('PL-STD-01','Metal stud 76mm + track, partition framing','Ceiling','Architecture','m',0.85,ARRAY['architectural','ceiling'],''),
 ('PL-INS-01','Rockwool insulation 50mm, 60kg/m3','Ceiling','Architecture','m2',1.90,ARRAY['architectural','insulation'],'Partition acoustic infill'),
-- ── Roofing & rainwater ────────────────────────────────────────────────────
 ('PL-RUF-01','Metal roof sheet, colorbond 0.42mm BMT','Roofing','Architecture','m2',4.80,ARRAY['architectural','roofing'],'Zincalume/painted'),
 ('PL-RUF-02','Ridge capping / flashing, colorbond','Roofing','Architecture','m',3.00,ARRAY['architectural','roofing'],''),
 ('PL-RUF-03','Concrete roof tile, flat profile','Roofing','Architecture','pc',0.55,ARRAY['architectural','roofing'],'~10 pc per m2'),
 ('PL-RUF-04','Reflective foil insulation + mesh','Roofing','Architecture','m2',1.20,ARRAY['architectural','roofing'],''),
 ('PL-RUF-05','Polycarbonate sheet 6mm','Roofing','Architecture','m2',9.50,ARRAY['architectural','roofing'],'Canopies/skylights'),
-- ── Floor finishes & misc ──────────────────────────────────────────────────
 ('PL-FLR-01','Floor hardener powder, bag 25kg','Flooring','Architecture','bag',9.50,ARRAY['architectural','flooring'],'Warehouse slabs'),
 ('PL-FLR-02','Self-levelling compound, bag 25kg','Flooring','Architecture','bag',12.00,ARRAY['architectural','flooring'],''),
 ('PL-FLR-03','Vinyl floor tile (LVT) 3mm','Flooring','Architecture','m2',9.00,ARRAY['architectural','flooring'],''),
 ('PL-RLG-01','Stainless steel railing 304, complete','Miscellaneous','Architecture','m',45.00,ARRAY['architectural','railing'],'Supply & install typical'),
 ('PL-RLG-02','Mild steel railing, painted, complete','Miscellaneous','Architecture','m',22.00,ARRAY['architectural','railing'],'Supply & install typical'),
 ('PL-SIL-01','Silicone sealant, neutral cure, 300ml','Miscellaneous','Architecture','tube',2.80,ARRAY['architectural'],''),
 ('PL-EXP-01','Aluminum expansion joint cover, floor 50mm','Miscellaneous','Architecture','m',18.00,ARRAY['architectural'],''),
-- ── Labor — day rates (8h) ─────────────────────────────────────────────────
 ('PL-LAB-01','General laborer / helper','Labor','Architecture','day',12.00,ARRAY['labor'],'Shared code with STR'),
 ('PL-LAB-02','Mason (concrete/masonry skilled)','Labor','Architecture','day',17.00,ARRAY['labor'],'Shared code with STR'),
 ('PL-LAB-10','Plasterer, skilled','Labor','Architecture','day',17.00,ARRAY['labor'],''),
 ('PL-LAB-11','Tiler, skilled','Labor','Architecture','day',20.00,ARRAY['labor'],''),
 ('PL-LAB-12','Painter','Labor','Architecture','day',15.00,ARRAY['labor'],''),
 ('PL-LAB-13','Gypsum/ceiling installer','Labor','Architecture','day',17.00,ARRAY['labor'],''),
 ('PL-LAB-14','Aluminum/glazing installer','Labor','Architecture','day',20.00,ARRAY['labor'],''),
 ('PL-LAB-15','Joinery carpenter (doors/fitout)','Labor','Architecture','day',18.00,ARRAY['labor'],''),
-- ── Labor-only subcontract rates ────────────────────────────────────────────
 ('PL-LOS-10','Labor-only: brick/block laying','Labor','Architecture','m2',1.60,ARRAY['labor','subcon'],'Wall area'),
 ('PL-LOS-11','Labor-only: plastering 2 coats','Labor','Architecture','m2',1.30,ARRAY['labor','subcon'],''),
 ('PL-LOS-12','Labor-only: floor/wall tiling','Labor','Architecture','m2',2.50,ARRAY['labor','subcon'],''),
 ('PL-LOS-13','Labor-only: painting 1 primer + 2 topcoats','Labor','Architecture','m2',0.50,ARRAY['labor','subcon'],''),
 ('PL-LOS-14','Labor-only: gypsum ceiling install','Labor','Architecture','m2',1.80,ARRAY['labor','subcon'],''),
-- ── Plant (ARC-specific) ───────────────────────────────────────────────────
 ('PL-PLT-20','Mobile scaffold tower, rental','Plant','Architecture','day',6.00,ARRAY['plant'],''),
 ('PL-PLT-21','Tile cutter (wet saw), rental','Plant','Architecture','day',8.00,ARRAY['plant'],''),
 ('PL-PLT-22','Airless paint sprayer, rental','Plant','Architecture','day',18.00,ARRAY['plant'],'')
) AS v(code, description, trade, discipline, unit, unit_price, tags, notes)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- End of ARC rate library seed (77 items)
