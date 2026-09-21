-- Migration: 20260910000029_dwl_bulk_materials_csv_import.sql
-- Purpose: Cost & Rate Library — Material Master. Bulk-imports
--          docs/DCOS_Bulk_Materials_Export_2026-09-15.csv (93 rows) into the
--          DWL spine + Material Master companion tables. DCOS-DS-12-012,
--          docs/04-Business-Modules/12-Quantity-Surveying/12-Material-
--          Specification-Price-Recording-Design.md.
--
-- DEMO DATA — the source CSV is a supplied catalogue export; prices are
-- treated here as 'market_survey' entries, not verified quotations, and
-- must be re-confirmed before use in live tendering (same caveat as the
-- Phase C-H ceiling seed in 20260910000010/11/12).
--
-- Dedup finding: 25 of the 93 CSV rows (MAT-CL-001..025) are the SAME
-- ceiling materials already seeded by 20260910000010_dwl_seed_ceiling_
-- materials.sql under the locked codes M-CLG-001..025 (identical names —
-- "Gypsum Board Suspended Ceiling", "Mineral Fiber Acoustic Tile", etc.,
-- and legacy_code already recorded as 'MAT-CL-NNN'). Those 25 are NOT
-- re-inserted as new resources; this migration only enriches their
-- existing dwl_material_attributes row (category_id + real brand/
-- manufacturer in place of the original seed's generic "Various") and
-- appends a market-survey price row where the CSV has one. The remaining
-- 68 rows are genuinely new materials.
--
-- Coding: CSV codes (MAT-CEIL-*, MAT-CEM-*, MAT-CON-*, ...) are remapped to
-- the locked DWL standard {M/L/E/S}-{GRP3}-{NNN} (QS-SOP-002 D2), grouped by
-- product family (CEB=branded ceiling boards, CON=ready-mix concrete,
-- STL=structural steel, TIL=tiling, WTR=waterproofing, etc. — see the
-- staging table below for the full code/legacy_code pairing). Original CSV
-- codes are preserved in dwl_material_attributes.legacy_code.
--
-- Category linkage: every row is matched to one of the 22 starter
-- categories seeded by 20260910000026/027 via dwl_material_categories.code
-- (e.g. CSV Category "Concrete & Cement" -> CAT-CONC). Cost Code / Budget
-- Code linkage is intentionally left null: the CSV's Cost Code column
-- (e.g. "09.51.00") is a CSI MasterFormat-style code, a different numbering
-- system from public.budget_codes (lettered A.00-Z.70 scheme) — there is no
-- real matching budget_codes row, so dwl_material_attributes.budget_code_id
-- is not fabricated here. The equivalent CSI-style value already lives on
-- each row's linked category as cost_code_prefix (informational).
--
-- Discipline: CSV "Civil/Structural" is mapped to the locked DWL_DISCIPLINES
-- value "Structural" (same mapping used by 20260910000028's backfill);
-- "Architectural" and "MEP" map directly.
--
-- Unit normalisation to the locked dictionary (QS-SOP-002 D3): "piece"->pcs,
-- "bucket"->no (no closer match in the locked list — flagged here as the one
-- lossy substitution), "liter"->l, "ton"->tonne, "meter"->m, "m²"->m2.
--
-- Additive only: INSERT-only for new resources/attributes/prices; the only
-- UPDATE touches dwl_material_attributes.category_id/brand/manufacturer for
-- the 25 pre-existing ceiling rows, and only fills in better data, never
-- clears a value. Idempotent: every insert guarded by ON CONFLICT / NOT
-- EXISTS; the price notes carry a 'CSV import 2026-09-15' marker so re-runs
-- do not duplicate price history.

drop table if exists pg_temp.tmp_bulk_materials;
create temporary table tmp_bulk_materials (
  action          text not null check (action in ('insert','update')),
  code            text not null,          -- locked code (new resource code, or existing M-CLG-* code for updates)
  legacy_code     text not null,          -- original CSV Material Code
  material_name   text,
  category_code   text,                   -- dwl_material_categories.code
  discipline      text,
  standard        text,
  grade           text,
  brand           text,
  manufacturer    text,
  subcategory     text,
  unit            text,
  base_price      numeric,
  price_date      date
);

insert into tmp_bulk_materials
  (action, code, legacy_code, material_name, category_code, discipline, standard, grade, brand, manufacturer, subcategory, unit, base_price, price_date)
values
  -- ── 68 new materials ──────────────────────────────────────────────────
  ('insert','M-CEB-001','MAT-CEIL-001','Gyproc Regular Gypsum Ceiling Board 9mm with Galvanized Furring Channel Grid','CAT-CEIL','Architectural','ASTM C1396 / EN 520 Class A','Regular Gypsum 9mm','Saint-Gobain Gyproc / SCG Elephant','Saint-Gobain Gyproc Cambodia','Ceiling Systems','m2',9.90,'2026-06-15'),
  ('insert','M-CEB-002','MAT-CEIL-002','Moisture Resistant (MR) Gypsum Ceiling Board 9mm for Wet Areas','CAT-CEIL','Architectural','ASTM C1396 Type H / EN 520 Type H2','MR Moisture Resistant','Saint-Gobain Gyproc Aqua / Knauf Hydro','Saint-Gobain Gyproc Cambodia','Ceiling Systems','m2',11.77,'2026-06-15'),
  ('insert','M-CEB-003','MAT-CEIL-003','Acoustic Mineral Fiber Ceiling Tile 600x600mm T-Bar Grid System','CAT-CEIL','Architectural','ASTM E1264 Type III / EN 13964','Acoustic Fine Fissured RH95','Armstrong / Knauf AMF','Saint-Gobain Gyproc & Knauf Cambodia','Acoustical Ceilings','m2',14.79,'2026-05-20'),
  ('insert','M-CEB-004','MAT-CEIL-004','Armstrong Acoustic Mineral Fiber Suspended Ceiling Tile 600x600x15mm Tegular Edge','CAT-CEIL','Architectural','ASTM E1264 Type III / EN 13964 / BS 476 Class 0','Commercial Acoustic Grade / Class A Flame Spread','Armstrong / USG Boral','Saint-Gobain Gyproc & Knauf Cambodia','Ceiling Systems','m2',12.43,'2026-06-16'),
  ('insert','M-CEB-005','MAT-CEIL-005','Architectural Aluminum U-Baffle Linear Ceiling System 50x100mm Natural Walnut Wrap','CAT-CEIL','Architectural','EN 13964 / ASTM B209 / Class A Fire Rating','Architectural Alloy 3003-H14','Hunter Douglas / SCG','Saint-Gobain Gyproc & Knauf Cambodia','Ceiling Systems','m2',42.13,'2026-06-18'),
  ('insert','M-CEM-001','MAT-CEM-001','Ordinary Portland Cement (OPC Type I - 50kg bag)','CAT-CONC','Structural','ASTM C150 Type I / EN 197-1 CEM I 42.5N','CEM I 42.5N','Camel Brand / Insee Extra','Siam City Cement Co.','Bagged Cement','bag',5.17,'2026-07-01'),
  ('insert','M-CON-001','MAT-CON-001','Ready Mix Concrete C30/37 (EN 206)','CAT-CONC','Structural','EN 206 / BS 8500','C30/37','Insee Pro / Mekong Mix','Siam City / Mekong Ready-Mix','Ready Mix Concrete','m3',103.95,'2026-08-05'),
  ('insert','M-CON-002','MAT-CON-002','High Performance Concrete C35/45 (EN 206)','CAT-CONC','Structural','EN 206 / ACI 318','C35/45','Insee SuperMax','Siam City Concrete','Ready Mix Concrete','m3',0,null),
  ('insert','M-CON-003','MAT-CON-003','Lean Concrete C16/20 (Blinding Layer)','CAT-CONC','Structural','EN 206','C16/20','Standard Mix','Mekong Ready-Mix','Plain Concrete','m3',0,null),
  ('insert','M-CPT-001','MAT-CPT-001','Heavy Commercial Nylon Modular Carpet Tile 500x500mm (Class 33 Heavy Commercial)','CAT-CRPT','Architectural','EN 1307 Class 33 / ISO 10361 / CRI Green Label Plus','Commercial Heavy Duty Class 33','Interface / Shaw Contract / Dawn Floors','Dawn Floors & Mekong Interior Solutions','Carpet & Resilient Flooring','m2',20.57,'2026-06-28'),
  ('insert','M-CPT-002','MAT-CPT-002','Low-VOC High-Tack Carpet Tile Pressure-Sensitive Tackifier Adhesive','CAT-CRPT','Architectural','EN 13999 / EMICODE EC1 Plus','Release Tackifier Grade','Bostik / Mapei Ultrabond Eco / Dawn Tack','Dawn Floors & Mekong Interior Solutions','Adhesives & Compounds','no',60.50,'2026-06-28'),
  ('insert','M-DOR-001','MAT-DOOR-004','2-Hour Fire-Rated Heavy Duty Double Leaf Steel Emergency Exit Door with Panic Exit Hardware','CAT-DOOR','Architectural','BS 476 Part 20 & 22 / UL 10C / NFPA 252 / CE Marked','Fire Class FD120 (120 Minutes Fire Rated)','Royal Door / Hafele Hardware','Cambodia Doors JSC & Royal Door Co.','Doors & Frames','set',455.40,'2026-06-12'),
  ('insert','M-DOR-002','MAT-DOR-001','Solid Engineered Hardwood Flush Timber Door (900x2100x40mm) with Frame & Lockset','CAT-DOOR','Architectural','BS 4787 / SS 332 / ASTM E90 (Acoustic)','Solid Core Grade A','Cambodia Doors / Royal Woodcraft','Cambodia Doors JSC & Royal Door Co.','Timber Doors & Frames','set',236.50,'2026-06-20'),
  ('insert','M-DOR-003','MAT-DOR-002','2-Hour Fire-Rated Steel Egress Door with Panic Hardware & Hydraulic Closer','CAT-DOOR','Architectural','BS 476 Part 22 / UL 10C / NFPA 252','FD120 (120 Minutes Fire-Rated)','Cambodia Doors / Royal Fire Safety','Cambodia Doors JSC & Royal Door Co.','Fire Rated Doors','set',454.30,'2026-06-20'),
  ('insert','M-DOR-004','MAT-DOR-003','Waterproof WPC / ABS Interior Bathroom Flush Door with Stainless Steel Hardware','CAT-DOOR','Architectural','ASTM D7031 / ISO 178 / GB/T 24137','Commercial Waterproof WPC','Cambodia Doors WPC / E-Door','Cambodia Doors JSC & Royal Door Co.','Specialty Doors','set',138.60,'2026-06-20'),
  ('insert','M-FAC-001','MAT-FAC-001','4mm PVDF Fire-Resistant Aluminum Composite Panel (ACP) Grade B1 for Facades','CAT-FAC','Architectural','EN 13501-1 Class B1 / ASTM E84 / AAMA 2605 / ISO 9001','FR Grade B1 (0.50mm Al Skin)','Alpolic / Alubond','SCG Building Materials International','Facade & Cladding','m2',29.15,'2026-06-14'),
  ('insert','M-FAC-002','MAT-FAC-002','SCG Fiber Cement Decorative Exterior Shiplap Siding Board 16mm Wood Plank Texture','CAT-FAC','Architectural','ASTM C1186 Grade II / ISO 8336 / TIS 1427','Exterior Grade II Heavy Duty 16mm','SCG Smartboard / Shera','SCG Building Materials International','Facade & Cladding','m2',15.40,'2026-06-16'),
  ('insert','M-FAC-003','MAT-FAC-003','Architectural Extruded Aluminum Aerofoil Sun Louver System 200mm Powder-Coated','CAT-FAC','Architectural','AAMA 2604 / ASTM B221 / EN 12020 / Qualicoat Class 2','Architectural Alloy 6063-T6 / Heavy Duty','SCG / Alspec Architectural','SCG Building Materials International','Facade & Cladding','m',35.20,'2026-06-19'),
  ('insert','M-FIN-001','MAT-FIN-001','Homogeneous Glazed Porcelain Floor Tile 600x600mm','CAT-TILE','Architectural','ISO 13006 / EN 14411 Annex G','First Grade (AAA Selected)','COTTO Grandis Marble series','SCG Building Materials','Ceramic & Porcelain Tiling','m2',17.05,'2026-08-15'),
  ('insert','M-FIN-002','MAT-FIN-002','Interior Anti-Bacterial Acrylic Emulsion Paint','CAT-PNT','Architectural','Green Label / ASTM D2486','Super Sheen Class 1','Dulux EasyClean / Nippon Odour-less','Apex Supply / AkzoNobel','Paints & Coatings','l',0,null),
  ('insert','M-FLR-001','MAT-FLR-001','5.0mm Stone Plastic Composite (SPC) Click Lock Flooring with 1.0mm IXPE Underlayment','CAT-FLR','Architectural','EN 13329 / ASTM F3261 / ISO 10582 / FloorScore Certified','Class 33 Heavy Commercial / 0.55mm Wear Layer','SCG / Dawn Floors','Dawn Floors Cambodia','Resilient Flooring','m2',15.95,'2026-06-15'),
  ('insert','M-FLR-002','MAT-FLR-002','Engineered Teakwood Parquet Flooring 15mm (3mm Burmese Teak Wear Layer)','CAT-FLR','Architectural','EN 13489 / ASTM D1037 / FSC Certified','Select & Better Grade (Uniform grain, minimal sapwood)','Mekong Timber Solutions','Dawn Floors Cambodia','Timber Flooring','m2',59.95,'2026-06-18'),
  ('insert','M-FLR-003','MAT-FLR-003','Heavy Commercial Homogeneous Vinyl Sheet 2.0mm Anti-Bacterial & Anti-Static','CAT-FLR','Architectural','EN ISO 10581 Type I / ASTM F1913 / ISO 22196','Homogeneous Type I / Wear Group T','Tarkett / Gerflor','Dawn Floors Cambodia','Resilient Flooring','m2',24.09,'2026-06-22'),
  ('insert','M-GLS-001','MAT-GLS-001','Double-Glazed Low-E Insulated Glass Unit 28mm (6+16Ar+6)','CAT-GLZ','Architectural','ASTM C1036 / EN 1279 Parts 1-4','Commercial Façade Grade','AGC Planibel Low-E / Saint-Gobain','AGC Flat Glass Indochina','Façade Glazing','m2',113.85,'2026-08-25'),
  ('insert','M-GLZ-001','MAT-GLZ-001','12mm Clear Tempered Glass Frameless Partition with Polished Pencil Edges','CAT-GLZ','Architectural','ASTM C1048 Kind FT / EN 12150-1 / ANSI Z97.1','Tempered Float Safety Glass 12mm','AGC Flat Glass Asia','AGC Indochina Glass Works','Glass & Glazing','m2',42.35,'2026-06-15'),
  ('insert','M-GLZ-002','MAT-GLZ-002','Low-E Double Glazed Unit (DGU) 6mm Low-E + 12A + 6mm Clear Tempered','CAT-GLZ','Architectural','ASTM E2190 / EN 1279 / ASTM C1376','Double Glazed Low-E Solar Control','AGC Sunergy / Planibel','AGC Indochina Glass Works','Glass & Glazing','m2',86.57,'2026-06-20'),
  ('insert','M-GLZ-003','MAT-GLZ-003','10.76mm Clear Laminated Safety Glass (5mm Float + 0.76mm PVB + 5mm Float)','CAT-GLZ','Architectural','EN ISO 12543 / ASTM C1172 / AS/NZS 2208','Laminated Grade A Safety','AGC / Saflex Interlayer','AGC Indochina Glass Works','Glass & Glazing','m2',47.08,'2026-06-18'),
  ('insert','M-HRD-001','MAT-HRD-001','Häfele SUS304 Heavy Duty Mortise Sash Lockset with Lever Handles & Euro Cylinder','CAT-HRD','Architectural','EN 12209 / EN 1906 / DIN 18251 / CE Certified','Commercial Grade SUS304 / Class 3','Häfele Architectural','Häfele Cambodia Co., Ltd.','Ironmongery & Hardware','set',50.93,'2026-06-08'),
  ('insert','M-HRD-002','MAT-HRD-002','Dormakaba Concealed Overhead Cam-Action Door Closer TS93 EN 2-5','CAT-HRD','Architectural','EN 1154 / CE Marked / Certifire CF119 / ANSI A156.4','EN 1154 Grade 1 (500,000 test cycles)','Dormakaba','Häfele Cambodia Co., Ltd.','Ironmongery & Hardware','pcs',122.65,'2026-06-10'),
  ('insert','M-HRD-003','MAT-HRD-003','Heavy Duty Hydraulic Floor Spring 150kg for Frameless Tempered Glass Swing Doors','CAT-HRD','Architectural','EN 1154 / DIN 18263 / ANSI Grade 1','Heavy Duty 150kg / Class 1','GMT / Häfele','Häfele Cambodia Co., Ltd.','Ironmongery & Hardware','set',73.48,'2026-06-12'),
  ('insert','M-INS-001','MAT-INS-001','Rockwool Mineral Wool Thermal Acoustic Slab 50mm 80kg/m³','CAT-INS','Architectural','EN 13162 / ASTM C612 Class 1','Safe-n-Silent Pro 380','Rockwool / SCG Fiber','SCG Building Materials','Acoustic & Thermal Insulation','m2',0,null),
  ('insert','M-INS-002','MAT-INS-002','Extruded Polystyrene (XPS) High Density Roof Insulation Board 50mm','CAT-INS','Architectural','ASTM C578 Type IV / EN 13164','XPS Grade 350 kPa','Knauf / Foamular','Rockwool & Insulation Systems Cambodia','Thermal & Acoustic Insulation','m2',12.70,'2026-06-12'),
  ('insert','M-INS-003','MAT-INS-003','Closed-Cell Cross-Linked Polyethylene (XLPE) Foil-Faced Duct Insulation 25mm','CAT-INS','MEP','BS 476 Part 6 & 7 Class 0 / ASTM C1427','Cross-Linked XLPE Class 0','Sekisui / Aerofoam','Rockwool & Insulation Systems Cambodia','Thermal & Acoustic Insulation','m2',6.43,'2026-06-15'),
  ('insert','M-INS-004','MAT-INS-004','Rockwool Safe''n''Silent Pro 60 Acoustic Partition Batt 50mm','CAT-INS','Architectural','ASTM C665 / EN 13162 / BS 476 Part 4 / ASTM E84 Class A','Acoustic Stone Wool 60 kg/m³','Rockwool Roxul','Rockwool Firesafe Cambodia','Thermal & Acoustic Insulation','m2',6.93,'2026-06-10'),
  ('insert','M-MAS-001','MAT-MAS-001','Autoclaved Aerated Concrete (AAC) Block 600x200x100mm','CAT-MASN','Architectural','EN 771-4 / ASTM C1693','Grade B3 / Class 4','SCG Smart Block / E-Block','SCG Building Materials','Lightweight Blockwork','m2',12.37,'2026-07-25'),
  ('insert','M-MAS-002','MAT-MAS-002','Red Clay Hollow Bricks (4-Hole 80x80x180mm)','CAT-MASN','Architectural','Local Industry Standard / TIS 77','Class 1 Hard Burnt','Kampong Cham Brick Works','Local Kiln Manufacturers','Clay Bricks','pcs',0,null),
  ('insert','M-MEP-001','MAT-MEP-001','uPVC Pressure Pipe Class 8.5 (110mm OD x 4.0m)','CAT-PLMB','MEP','TIS 17-2532 / BS 3505 Class 8.5','Class 8.5 Heavy Duty','SCG Elephant Brand / TPC','Thai Plastic and Chemicals','Drainage & Water Piping','m',0,null),
  ('insert','M-MEP-002','MAT-MEP-002','PPR Hot & Cold Water Pressure Pipe PN20 (25mm OD)','CAT-PLMB','MEP','DIN 8077 / DIN 8078 / ISO 15874','PN 20 Heavy Pressure','Aquatherm / SCG PPR','Thai Plastic and Chemicals','Potable Water Piping','m',0,null),
  ('insert','M-MEP-003','MAT-MEP-003','XLPE Copper Armoured Power Cable 4-Core x 16mm²','CAT-ELEC','MEP','IEC 60502-1 / BS 5467','CU/XLPE/SWA/PVC 0.6/1kV','Prysmian / Olympic Cable / Schneider','Schneider Electric Indo-China','Electrical Cables & Wiring','m',13.75,'2026-08-18'),
  ('insert','M-MRB-001','MAT-MRB-001','Cambodian Pursat White Natural Marble Slab 18mm Polished','CAT-MRBL','Architectural','ASTM C503 / EN 1469 / EN 12058','Grade Select Pursat White','Pursat Natural Marble / Cambodian Stone','Dongpeng & Cotto Stone Trading Phnom Penh','Natural Stone & Marble','m2',75.90,'2026-07-10'),
  ('insert','M-MRB-002','MAT-MRB-002','Black Galaxy Granite Slab 20mm Polished for Vanity Tops & Counters','CAT-MRBL','Architectural','ASTM C615 / EN 1469','Commercial First Choice (Dense Golden Flecks)','Black Galaxy Stone Center','Dongpeng & Cotto Stone Trading Phnom Penh','Natural Stone & Marble','m2',86.24,'2026-07-10'),
  ('insert','M-PNT-001','MAT-PNT-001','TOA 4-Seasons / Jotun Majestic Interior Acrylic Low-VOC Emulsion (3-Coat System)','CAT-PNT','Architectural','TIS 2321-2549 / ASTM D2486 / Green Label Singapore','Premium Architectural Emulsion','TOA 4-Seasons / Jotun Majestic True Beauty','TOA Paint (Cambodia) Co., Ltd.','Paints & Coatings','m2',3.41,'2026-07-01'),
  ('insert','M-PNT-002','MAT-PNT-002','TOA SuperShield / Jotun Jotashield Exterior WeatherShield Anti-Fungal Paint','CAT-PNT','Architectural','ASTM D412 / ASTM G154 (Weathering) / TIS 1114','Exterior WeatherShield Extreme','TOA SuperShield Titanium / Jotun Jotashield Extreme','TOA Paint (Cambodia) Co., Ltd.','Exterior Coatings','m2',5.72,'2026-07-01'),
  ('insert','M-PNT-003','MAT-PNT-003','SikaFloor-264 Heavy-Duty Solvent-Free Epoxy Floor Coating (3-Layer System)','CAT-PNT','Architectural','EN 1504-2 / ASTM D695 / ASTM D4060','Heavy Commercial / Industrial Grade','Sika / Master Builders','Sika Cambodia Ltd.','Specialty Flooring & Coatings','m2',11.99,'2026-06-10'),
  ('insert','M-ROF-001','MAT-ROOF-001','Lysaght Clean COLORBOND® Standing Seam Metal Roof 0.48mm BMT with 50mm PU Core','CAT-ROOF','Architectural','AS 1397 / AS 2728 / ASTM A792 / EN 10346','Hi-Tensile G550 / AZ150 Coating Class','BlueScope Lysaght','Lysaght BlueScope Cambodia Ltd.','Roofing Systems','m2',27.28,'2026-06-05'),
  ('insert','M-ROF-002','MAT-ROOF-002','SCG Prestige Flat Concrete Interlocking Roof Tile with Dry-Fix Ridge System','CAT-ROOF','Architectural','TIS 535 / EN 490 / ASTM C1492','Architectural Flat Concrete Tile Class A','SCG Prestige','SCG Building Materials International','Roofing Systems','m2',20.51,'2026-06-08'),
  ('insert','M-RSF-001','MAT-RSF-001','All-Steel Bare Cementitious Core OA Raised Access Floor 600x600mm (300mm FFH)','CAT-RFLR','Architectural','CISCA / MOB PF2 PS/SPU / EN 12825 Class 3A','Heavy Commercial OA-500/600','Dawn Floors / Maxgrid Access Floors','Dawn Floors & Mekong Interior Solutions','Access Flooring Systems','m2',43.78,'2026-07-02'),
  ('insert','M-RSF-002','MAT-RSF-002','Anti-Static High-Pressure Laminate (HPL) Calcium Sulphate Raised Floor for Data Centers','CAT-RFLR','Architectural','EN 12825 Class 5A / CISCA / DIN 4102-A2','Data Center Grade Anti-Static HPL','Dawn Floors / Lindner / M-Floor','Dawn Floors & Mekong Interior Solutions','Access Flooring Systems','m2',71.17,'2026-07-02'),
  ('insert','M-SAN-001','MAT-SAN-001','Toto Wall-Hung Vitreous China Water Closet with Geberit Concealed Dual-Flush Cistern','CAT-SAN','MEP','ASME A112.19.2 / EN 997 / WELS 3-Ticks / SS 574','Class 1 Vitreous China / Luxury Commercial','Toto / Geberit','SCG Building Materials International','Sanitary Fixtures','set',364.10,'2026-06-11'),
  ('insert','M-SAN-002','MAT-SAN-002','Grohe Deck-Mounted Single-Lever Chrome Brass Basin Mixer Tap with EcoJoy Aerator','CAT-SAN','MEP','EN 817 / ASME A112.18.1 / NSF/ANSI 61 / WELS 3-Tick','Commercial Heavy DR Brass','Grohe Architectural','SCG Building Materials International','Sanitary Fixtures','pcs',66.33,'2026-06-13'),
  ('insert','M-SAN-003','MAT-SAN-003','SUS304 Stainless Steel Linear Shower Trench Drain 100x800mm with Anti-Odor Water Trap','CAT-SAN','MEP','EN 1253-1 / ASME A112.6.3 / ISO 9001','SUS304 Architectural Grade','Apex / Hafele Sanitary','Apex Construction Supply & Hardware','Sanitary Fixtures','set',30.36,'2026-06-15'),
  ('insert','M-STL-001','MAT-STL-001','High-Yield Deformed Steel Rebar Gr 500B (T16 - T25)','CAT-METL','Structural','BS 4449:2005 / ASTM A615 Gr 60','B500B / Grade 60','Hoa Phat / Kyoei','Hoa Phat Steel Vietnam','Reinforcing Steel','tonne',794.20,'2026-08-20'),
  ('insert','M-STL-002','MAT-STL-002','Deformed Steel Rebar Gr 500B (T10 - T12 Stirrups)','CAT-METL','Structural','BS 4449:2005 Grade B500B','B500B','Hoa Phat Steel','Hoa Phat Steel Vietnam','Reinforcing Steel','tonne',0,null),
  ('insert','M-STL-003','MAT-STL-003','Structural Universal Beams UB 305x165x40.3 (S355JR)','CAT-METL','Structural','EN 10025-2 / BS 4-1','S355JR / ASTM A572 Gr 50','Nippon Steel / Posco','Nippon Steel Trading','Structural Steelwork','tonne',0,null),
  ('insert','M-TIL-001','MAT-TILE-001','Homogeneous Polished Porcelain Floor Tile 600x600mm Nano Glaze (Cotto / Dongpeng)','CAT-TILE','Architectural','ISO 13006 Group BIa / EN 14411','First Grade AAA Rectified','Cotto / Dongpeng Ceramics','Dongpeng & Cotto Stone Trading Phnom Penh','Ceramic & Porcelain Tiling','m2',16.39,'2026-06-25'),
  ('insert','M-TIL-002','MAT-TILE-002','Glazed Ceramic Wall Tile 300x600mm Rectified (Cotto / White Horse)','CAT-TILE','Architectural','ISO 13006 Group BIII / EN 14411','Grade A Rectified Monocottura','Cotto / White Horse Ceramic','Dongpeng & Cotto Stone Trading Phnom Penh','Ceramic & Porcelain Tiling','m2',12.92,'2026-06-25'),
  ('insert','M-TIL-003','MAT-TILE-003','Polymer-Modified High-Performance Tile Adhesive C2TE (Weber.tai fix / SikaCeram 200)','CAT-TILE','Architectural','EN 12004 / ISO 13007 Class C2TE','Class C2TE High Adhesion','Weber.tai fix / SikaCeram-200 TileFix','Sika Cambodia / Weber Saint-Gobain','Tile Adhesives & Grouts','bag',8.74,'2026-07-05'),
  ('insert','M-TIL-004','MAT-TILE-004','Large Format Sintered Porcelain Slab 1200x2400mm 9mm Thickness Polished Statuario','CAT-TILE','Architectural','ISO 13006 Group Bla / EN 14411 / ANSI A137.1','First Choice / Premium Sintered Slab Group Bla','Dongpeng / Cotto Grandezza','Dongpeng & Cotto Stone Trading Phnom Penh','Tiling Systems','m2',39.82,'2026-06-17'),
  ('insert','M-TIL-005','MAT-TILE-005','Heavy Duty Anti-Slip R11 Vitrified Exterior Paving Tile 600x600x20mm for Pool Concourse','CAT-TILE','Architectural','ISO 13006 Bla / DIN 51130 R11 / EN 14411','Heavy Traffic Outdoor Paver 20mm','SCG Cotto / Dongpeng','Dongpeng & Cotto Stone Trading Phnom Penh','Tiling Systems','m2',26.23,'2026-06-19'),
  ('insert','M-TRM-001','MAT-TRM-001','Pre-Construction Soil Chemical Drenching Termiticide Barrier (Fipronil 2.5% EC)','CAT-MITE','Structural','ASTM D3345 / AS 3660.1 / Singapore Standard SS 509','Pre-Construction Soil Barrier','Termidor / Premise / PestLab Standard','PestLab Exterminator Cambodia','Pest & Termite Treatment','m2',1.71,'2026-06-18'),
  ('insert','M-TRM-002','MAT-TRM-002','Sub-Slab Termite Reticulation Piping Network System with External Recharge Ports','CAT-MITE','Structural','AS 3660.2 / CIRIA C745','Engineered Termite Reticulation System','Termguard / PestLab Reticulation','PestLab Exterminator Cambodia','Pest & Termite Treatment','m',4.29,'2026-06-18'),
  ('insert','M-WIN-001','MAT-WIN-001','Powder-Coated Aluminum Sliding Window with 6mm Clear Tempered Glass (Xingfa Profile)','CAT-WNDW','Architectural','AAMA/WDMA/CSA 101 / EN 12210 / EN 12150','Commercial Grade Sliding 1.4mm','Xingfa / Zhongshan Aluminum','Kimmex Architectural / Local Glazing Fabricator','Aluminum Windows & Glazing','m2',96.80,'2026-07-08'),
  ('insert','M-WIN-002','MAT-WIN-002','Double-Glazed Soundproof & Low-E Insulated Glass Window (6mm+12A+6mm Argon)','CAT-WNDW','Architectural','EN 1279 / ASTM E2190 / ASTM C1048 / EN 14351','High Performance Thermal Break Low-E','Asahi Glass (AGC) / Xingfa Thermal-Break','AGC Flat Glass / Kimmex Glazing Phnom Penh','Energy-Efficient Glazing','m2',182.60,'2026-07-15'),
  ('insert','M-WIN-003','MAT-WIN-003','Heavy Commercial Thermal-Break Aluminum Sliding Window System with Stainless Steel Mesh','CAT-WNDW','Architectural','EN 14351-1 / ASTM E283 / ASTM E330 / AAMA 101','Commercial Grade 100 Series Thermal-Break','YKK AP / SCG Windoor','Cambodia Doors JSC & Royal Door Co.','Windows & Glazing','m2',119.68,'2026-06-15'),
  ('insert','M-WTR-001','MAT-WTR-001','SBS Bituminous Torch-on Waterproofing Membrane 4mm','CAT-WPRF','Architectural','EN 13707 / ASTM D6164 Type I','Premium 4mm Granule','SikaBit PRO T-240 G','Sika Chemical Co.','Sheet Waterproofing','m2',9.68,'2026-08-10'),
  ('insert','M-WTR-002','MAT-WTR-002','Polyurethane Liquid Waterproofing Coating (Sikalastic)','CAT-WPRF','Architectural','ASTM C836 / ETAG 005','Commercial Grade','Sikalastic-560 / 612','Sika Chemical Co.','Liquid Membrane','kg',0,null),
  ('insert','M-WTR-003','MAT-WTR-003','SikaTop Seal 107 Polymer-Modified Cementitious Waterproofing Slurry (2-Component)','CAT-WPRF','Architectural','EN 1504-2 / DIN 1048 / ASTM D4541','Heavy Duty 2-Component Cementitious','SikaTop Seal 107 / Crocodile Elastic Shield','Sika Cambodia Ltd.','Liquid Membrane Waterproofing','m2',8.69,'2026-07-12'),
  ('insert','M-WTR-004','MAT-WTR-004','Liquid-Applied Polyurethane (PU) Waterproofing Membrane (SikaRoof / MasterSeal)','CAT-WPRF','Architectural','ASTM C836 / ASTM D412 / ETAG 005 (25-year design life)','Exposed Roof UV-Stable PU','Sika SikaRoof MTC / MasterSeal 640','Sika Cambodia Ltd.','Liquid Membrane Waterproofing','m2',17.00,'2026-07-12'),

  -- ── 25 enrichment-only rows (already exist as M-CLG-001..025) ──────────
  ('update','M-CLG-001','MAT-CL-001',null,'CAT-CEIL',null,null,null,'Gyproc / Knauf','Saint-Gobain / Knauf Gips KG',null,null,17.45,'2026-08-15'),
  ('update','M-CLG-002','MAT-CL-002',null,'CAT-CEIL',null,null,null,'Gyproc / USG Boral','Saint-Gobain / USG Boral',null,null,0,null),
  ('update','M-CLG-003','MAT-CL-003',null,'CAT-CEIL',null,null,null,'Gyproc AquaROC / Knauf Hydro','Saint-Gobain / Knauf',null,null,21.08,'2026-08-18'),
  ('update','M-CLG-004','MAT-CL-004',null,'CAT-CEIL',null,null,null,'Gyproc FireLine / Promat Masterboard','Saint-Gobain / Etex Promat',null,null,0,null),
  ('update','M-CLG-005','MAT-CL-005',null,'CAT-CEIL',null,null,null,'SCG SmartBoard / James Hardie HardieBacker','Siam Cement Group / James Hardie',null,null,0,null),
  ('update','M-CLG-006','MAT-CL-006',null,'CAT-CEIL',null,null,null,'Armstrong Fine Fissured / USG Radar','Armstrong World Industries / USG Corp',null,null,25.63,'2026-08-20'),
  ('update','M-CLG-007','MAT-CL-007',null,'CAT-CEIL',null,null,null,'Hunter Douglas / Durlum','Hunter Douglas Architectural / Durlum GmbH',null,null,0,null),
  ('update','M-CLG-008','MAT-CL-008',null,'CAT-CEIL',null,null,null,'Armstrong MetalClip / SAS International','Armstrong / SAS International UK',null,null,48.70,'2026-08-22'),
  ('update','M-CLG-009','MAT-CL-009',null,'CAT-CEIL',null,null,null,'Hunter Douglas / Lindner Group','Lindner Group / Hunter Douglas',null,null,0,null),
  ('update','M-CLG-010','MAT-CL-010',null,'CAT-CEIL',null,null,null,'Hunter Douglas Luxalon / Alucobond','Hunter Douglas Architectural',null,null,0,null),
  ('update','M-CLG-011','MAT-CL-011',null,'CAT-CEIL',null,null,null,'Hunter Douglas Luxalon Exterior','Hunter Douglas Architectural',null,null,0,null),
  ('update','M-CLG-012','MAT-CL-012',null,'CAT-CEIL',null,null,null,'Armstrong Metal Baffles / Hunter Douglas','Armstrong / Hunter Douglas',null,null,0,null),
  ('update','M-CLG-013','MAT-CL-013',null,'CAT-CEIL',null,null,null,'Ecophon / SAS Baffle 500','SAS International / Saint-Gobain Ecophon',null,null,0,null),
  ('update','M-CLG-014','MAT-CL-014',null,'CAT-CEIL',null,null,null,'Durlum Open Sky / Hunter Douglas Cell','Durlum GmbH / Hunter Douglas',null,null,0,null),
  ('update','M-CLG-015','MAT-CL-015',null,'CAT-CEIL',null,null,null,'Lindner Mesh / Durlum Rhomboid','Lindner Group / Durlum GmbH',null,null,0,null),
  ('update','M-CLG-016','MAT-CL-016',null,'CAT-CEIL',null,null,null,'Plastik Ceiling / Everbuild','Everbuild / Shide Building Materials',null,null,0,null),
  ('update','M-CLG-017','MAT-CL-017',null,'CAT-CEIL',null,null,null,'Armstrong WoodWorks / Decoustics','Armstrong Architectural / CertainTeed',null,null,0,null),
  ('update','M-CLG-018','MAT-CL-018',null,'CAT-CEIL',null,null,null,'Gustafs Linear Rib / AcousticWood','Gustafs Scandinavia / Timber Innovations',null,null,0,null),
  ('update','M-CLG-019','MAT-CL-019',null,'CAT-CEIL',null,null,null,'Topakustik / Decoustics Quadrillo','Topakustik Switzerland / Saint-Gobain',null,null,0,null),
  ('update','M-CLG-020','MAT-CL-020',null,'CAT-CEIL',null,null,null,'BASWA Acoustic / Clipso Acoustic','Clipso Americas / BASWA Acoustic AG',null,null,0,null),
  ('update','M-CLG-021','MAT-CL-021',null,'CAT-CEIL',null,null,null,'Barrisol / Newmat','Normalu Barrisol France / Newmat Corp',null,null,0,null),
  ('update','M-CLG-022','MAT-CL-022',null,'CAT-CEIL',null,null,null,'Formglas / Architectural Precast Co.','Formglas Products Ltd / Local Specialist Fabricator',null,null,0,null),
  ('update','M-CLG-023','MAT-CL-023',null,'CAT-CEIL',null,null,null,'Armstrong SoundScapes / Ecophon Solo','Armstrong Architectural / Ecophon',null,null,0,null),
  ('update','M-CLG-024','MAT-CL-024',null,'CAT-CEIL',null,null,null,'K-13 Acoustic Thermal / PPG Architectural','International Cellulose Corp / PPG',null,null,0,null),
  ('update','M-CLG-025','MAT-CL-025',null,'CAT-CEIL',null,null,null,'System Coordinated MEP Specification','Various Coordinated MEP Fabricators',null,null,0,null);

-- ── 1. dwl_resources — the 68 genuinely new materials ────────────────────
insert into public.dwl_resources (tenant_id, code, category, description, unit, spec_reference)
select (select id from public.companies where code = 'MCC'), t.code, 'material', t.material_name, t.unit, t.standard
from tmp_bulk_materials t
where t.action = 'insert'
on conflict (code) do nothing;

-- ── 2. dwl_material_attributes — companion rows for the 68 new materials ─
insert into public.dwl_material_attributes
  (resource_id, tenant_id, material_name, subcategory, discipline, standard, grade, brand, manufacturer, category_id, legacy_code, lifecycle_status)
select r.id, r.tenant_id, t.material_name, t.subcategory, t.discipline, t.standard, t.grade, t.brand, t.manufacturer, mc.id, t.legacy_code, 'active'
from tmp_bulk_materials t
join public.dwl_resources r on r.code = t.code and r.category = 'material'
left join public.dwl_material_categories mc on mc.code = t.category_code
where t.action = 'insert'
on conflict (resource_id) do nothing;

-- ── 3. Enrich the 25 pre-existing ceiling materials (category + real brand
--      / manufacturer in place of the original seed's generic "Various") ─
update public.dwl_material_attributes a
set category_id  = mc.id,
    brand        = t.brand,
    manufacturer = t.manufacturer,
    updated_at   = now()
from tmp_bulk_materials t
join public.dwl_resources r on r.code = t.code and r.category = 'material'
left join public.dwl_material_categories mc on mc.code = t.category_code
where t.action = 'update'
  and a.resource_id = r.id;

-- ── 4. dwl_resource_prices — one market-survey price per row with a real
--      price (base_price > 0), for both new and enriched materials ──────
insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
select r.tenant_id, r.id, t.base_price, 'USD', t.price_date, 'market_survey',
  'CSV import 2026-09-15 — Basis: docs/DCOS_Bulk_Materials_Export_2026-09-15.csv row for ' || t.legacy_code || '. Market-survey price, not a verified quotation.'
from tmp_bulk_materials t
join public.dwl_resources r on r.code = t.code and r.category = 'material'
where t.base_price > 0
  and not exists (
    select 1 from public.dwl_resource_prices p
    where p.resource_id = r.id and p.notes like 'CSV import 2026-09-15%'
  );

drop table tmp_bulk_materials;
