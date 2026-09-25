-- =============================================================================
-- Seed: Cost Item Library — 20 built-up cost items (painting, tiling, plaster,
--       screed, masonry, waterproofing, ceiling, drywall)
-- =============================================================================
-- Quantity Surveying ▸ Cost & Estimation ▸ Cost Item Library had 2 items
-- (ASM-CEIL-GYP-001, ASM-MAS-001). This seed adds 20 more, each built the same
-- way as ASM-CEIL-GYP-001 so the library costs them live from current prices:
--
--   dwl_assemblies            header (code, element group, unit, measurement rule)
--   dwl_assembly_costing      daily output, OH 10% / risk 2% / profit 10%, VAT 0%
--   dwl_work_items (+ dwl_assembly_items qty 1.0)
--   dwl_work_item_resources   material recipe: consumption per unit + waste %
--   dwl_assembly_crew         crew per day  → labour/unit = crew day cost ÷ output
--   dwl_assembly_equipment    plant per day → equipment/unit = day cost ÷ output
--   dwl_assembly_specs        specification / inclusions / exclusions / benchmarks
--   dwl_assembly_layers       build-up drawn in the item detail
--
-- Materials, labour and equipment are EXISTING library resources (by code), so
-- material cost follows the Material Master's current prices. Consumptions are
-- standard Cambodian site norms (coverage per litre, mortar per m², pieces per
-- m²); daily outputs are gang-day outputs for a typical Phnom Penh site.
-- Rates exclude VAT (vat_pct = 0), matching ASM-CEIL-GYP-001; set VAT per
-- item or at tender level if required.
--
-- Re-running is safe: an item whose code already exists is skipped (never
-- overwritten), and an item that references a resource code missing from the
-- target database is skipped with a NOTICE. Remove everything this seed added:
--
--   DELETE FROM public.dwl_assemblies  WHERE code ~ '^ASM-(PNT|TIL|PLS|SCR|WPF|DRY)-00[1-5]$|^ASM-MAS-00[234]$|^ASM-CEIL-MFT-001$';
--   DELETE FROM public.dwl_work_items  WHERE code ~ '^ASM-(PNT|TIL|PLS|SCR|WPF|DRY)-00[1-5]$|^ASM-MAS-00[234]$|^ASM-CEIL-MFT-001$';
--   (costing / crew / equipment / specs / layers / recipes cascade; fails if a
--    tender BOQ line already references one of these items — detach it first)
--
-- Manual seed — NOT in supabase/config.toml [db.seed].sql_paths, not applied by
-- `db push`. From repo root:
--   supabase db query --local -f supabase/seeds/seed_cost_item_library_finishes.sql
-- =============================================================================

DO $seed$
DECLARE
  v_data jsonb := $json$[
  {"code":"ASM-PNT-001","group":"Painting","cat":"CAT-PNT","unit":"m2","wtype":"Interior Painting",
   "desc":"Interior emulsion paint to plastered walls — 2 skim coats wall putty, 1 coat sealer, 2 finish coats",
   "rule":"Net painted wall area; deduct openings > 0.5 m2; reveals measured separately",
   "method":"Sand and dust off, 2 coats acrylic putty sanded smooth, 1 coat water-based sealer, 2 coats interior emulsion by roller",
   "scope":"Surface preparation of cured cement-sand plaster (min. 28 days), two skim coats of acrylic wall putty sanded to a smooth finish, one coat of water-based alkali-resistant sealer and two finish coats of interior acrylic emulsion applied by roller and brush to walls up to 3.5 m high.",
   "guard":"Plaster must be cured >= 28 days and below 16% moisture. Premium anti-bacterial paint: use ASM-PNT-004.",
   "output":25,
   "mats":[["MAT-GEN-253",0.05,0.05,"2 skim coats ~1.0 kg/m2 (20 kg bag)"],
           ["MAT-GEN-234",0.0056,0.05,"1 coat sealer @ ~10 m2/L (18 L pail)"],
           ["MAT-GEN-230",0.0111,0.05,"2 finish coats @ ~10 m2/L/coat (18 L pail)"],
           ["MAT-GEN-342",0.02,0,"Sanding between putty coats"]],
   "crew":[["PL-LAB-12","Painter",1,"Cambodia benchmark: $14 – $17 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["PL-PLT-20","Mobile scaffold tower",1]],
   "specs":[["specification","System","Putty x2 + sealer x1 + emulsion x2 (5 applications)"],
            ["specification","Applicable Standards","ASTM D2486 scrub resistance; manufacturer data sheet"],
            ["inclusion","","Masking, protection of adjacent finishes and cleaning on completion"],
            ["boundary_exclusion","","Plaster repairs beyond minor filling"],
            ["boundary_exclusion","","Feature / textured paints and wall graphics"],
            ["productivity_benchmark","Cambodia Site Benchmark","20 - 30 m2 / gang-day for the full 5-application system"]],
   "layers":[["Finish","Interior emulsion, 2 coats",0.10,"#e2e8f0"],["Sealer","Water-based sealer",0.05,"#fde68a"],["Skim","Acrylic wall putty, 2 coats",1.00,"#f5f5f4"],["Substrate","Cement-sand plaster (by others)",15.00,"#a8a29e"]]},

  {"code":"ASM-PNT-002","group":"Painting","cat":"CAT-PNT","unit":"m2","wtype":"Interior Painting",
   "desc":"Interior emulsion paint to gypsum board ceilings — spot putty, 1 coat sealer, 2 finish coats",
   "rule":"Net ceiling area; no deduction for openings <= 0.5 m2",
   "method":"Spot-fill screw heads and joints, 1 coat sealer, 2 coats emulsion by roller from mobile scaffold",
   "scope":"Painting of taped and jointed gypsum board ceilings: spot putty to fixings and joints, one coat sealer and two coats interior acrylic emulsion (ceiling white), working from mobile scaffold up to 4.0 m.",
   "guard":"Ceiling joints must be finished to Level 4 by the ceiling trade before painting.",
   "output":28,
   "mats":[["MAT-GEN-253",0.015,0.05,"Spot putty to joints and fixings ~0.3 kg/m2"],
           ["MAT-GEN-234",0.0056,0.05,"1 coat sealer @ ~10 m2/L"],
           ["MAT-GEN-230",0.0111,0.05,"2 finish coats @ ~10 m2/L/coat"],
           ["MAT-GEN-342",0.01,0,"Light sanding"]],
   "crew":[["PL-LAB-12","Painter",1,"Cambodia benchmark: $14 – $17 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["E-SCF-001","Mobile stepladder & baker scaffold",1]],
   "specs":[["specification","System","Spot putty + sealer x1 + emulsion x2"],
            ["boundary_exclusion","","Ceiling joint treatment (included in ceiling item)"],
            ["boundary_exclusion","","Work above 4.0 m requiring powered access"],
            ["productivity_benchmark","Cambodia Site Benchmark","25 - 35 m2 / gang-day"]],
   "layers":[["Finish","Interior emulsion, 2 coats",0.10,"#e2e8f0"],["Sealer","Water-based sealer",0.05,"#fde68a"],["Substrate","Gypsum board (by others)",12.50,"#60a5fa"]]},

  {"code":"ASM-PNT-003","group":"Painting","cat":"CAT-PNT","unit":"m2","wtype":"Exterior Painting",
   "desc":"Exterior weathershield paint to rendered walls — 1 coat alkali-resisting sealer, 2 finish coats",
   "rule":"Net painted facade area; deduct openings > 0.5 m2",
   "method":"Wash down, fill hairline cracks, 1 coat alkali-resisting sealer, 2 coats exterior weathershield",
   "scope":"Exterior painting of cement-sand render: wash down, fill hairline cracks, one coat alkali-resisting sealer and two coats of anti-fungal exterior weathershield emulsion.",
   "guard":"External scaffolding / gondola is priced in preliminaries. Do not paint in rain or on render with moisture > 16%.",
   "output":30,
   "mats":[["MAT-GEN-253",0.01,0.05,"Crack filling ~0.2 kg/m2"],
           ["MAT-GEN-234",0.0062,0.05,"1 coat alkali-resisting sealer @ ~9 m2/L"],
           ["MAT-GEN-232",0.0123,0.05,"2 coats weathershield @ ~9 m2/L/coat (18 L pail)"]],
   "crew":[["PL-LAB-12","Painter",1,"Cambodia benchmark: $14 – $17 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["PL-PLT-20","Mobile scaffold tower (low level)",1]],
   "specs":[["specification","System","Alkali-resisting sealer x1 + exterior weathershield x2"],
            ["specification","Performance Requirements","Anti-fungal / anti-algae, UV resistant"],
            ["boundary_exclusion","","Facade scaffolding, gondola or MEWP (preliminaries)"],
            ["boundary_exclusion","","Render repairs and crack stitching"],
            ["productivity_benchmark","Cambodia Site Benchmark","25 - 35 m2 / gang-day from scaffold"]],
   "layers":[["Finish","Exterior weathershield, 2 coats",0.12,"#cbd5e1"],["Sealer","Alkali-resisting sealer",0.05,"#fde68a"],["Substrate","Cement-sand render (by others)",20.00,"#a8a29e"]]},

  {"code":"ASM-PNT-004","group":"Painting","cat":"CAT-PNT","unit":"m2","wtype":"Interior Painting",
   "desc":"Premium anti-bacterial interior paint to walls — 2 skim coats, 1 coat sealer, 2 finish coats",
   "rule":"Net painted wall area; deduct openings > 0.5 m2",
   "method":"As ASM-PNT-001 with premium anti-bacterial washable emulsion",
   "scope":"As the standard interior wall system but finished with premium anti-bacterial, washable acrylic emulsion (Dulux EasyClean / Nippon Odour-less or equal) for healthcare, education and high-traffic areas.",
   "guard":"Premium paint price is a draft web-research estimate in the Material Master — confirm with supplier quote.",
   "output":24,
   "mats":[["MAT-GEN-253",0.05,0.05,"2 skim coats ~1.0 kg/m2"],
           ["MAT-GEN-234",0.0056,0.05,"1 coat sealer @ ~10 m2/L"],
           ["MAT-PNT-001",0.2,0.05,"2 coats @ ~10 m2/L/coat"],
           ["MAT-GEN-342",0.02,0,"Sanding between putty coats"]],
   "crew":[["PL-LAB-12","Painter",1,"Cambodia benchmark: $14 – $17 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["PL-PLT-20","Mobile scaffold tower",1]],
   "specs":[["specification","Finish","Premium anti-bacterial washable acrylic, low VOC (Green Label)"],
            ["boundary_exclusion","","Plaster repairs beyond minor filling"],
            ["productivity_benchmark","Cambodia Site Benchmark","20 - 28 m2 / gang-day"]],
   "layers":[["Finish","Anti-bacterial emulsion, 2 coats",0.10,"#dbeafe"],["Sealer","Water-based sealer",0.05,"#fde68a"],["Skim","Acrylic wall putty, 2 coats",1.00,"#f5f5f4"]]},

  {"code":"ASM-PNT-005","group":"Painting","cat":"CAT-PNT","unit":"m2","wtype":"Metal & Wood Painting",
   "desc":"Enamel paint to steel / metalwork — 1 coat anti-rust primer, 2 coats gloss enamel",
   "rule":"Surface area painted (girth x length); small items enumerated separately",
   "method":"Wire brush / sand to St 2, degrease, 1 coat red-oxide primer, 2 coats alkyd gloss enamel by brush",
   "scope":"Painting of railings, grilles, frames and light steelwork: hand-tool cleaning to St 2, one coat anti-rust primer and two coats alkyd gloss enamel thinned per manufacturer.",
   "guard":"Not for structural steel protective coating systems (use a specialist epoxy / PU system).",
   "output":15,
   "mats":[["MAT-GEN-240",0.1,0.05,"1 coat anti-rust primer @ ~10 m2/L"],
           ["MAT-GEN-236",0.055,0.05,"2 coats enamel @ ~12 m2/L/coat (3 L can)"],
           ["MAT-GEN-238",0.03,0,"Thinning and brush cleaning"],
           ["MAT-GEN-342",0.05,0,"Surface preparation"]],
   "crew":[["PL-LAB-12","Painter",1,"Cambodia benchmark: $14 – $17 / day"],["PL-LAB-01","Helper",0.5,"Shared helper"]],
   "equip":[],
   "specs":[["specification","Surface Preparation","ISO 8501-1 St 2 hand-tool cleaning"],
            ["boundary_exclusion","","Blast cleaning and high-build protective coatings"],
            ["productivity_benchmark","Cambodia Site Benchmark","12 - 18 m2 / painter-day (3 coats)"]],
   "layers":[["Finish","Alkyd gloss enamel, 2 coats",0.08,"#1e293b"],["Primer","Red-oxide anti-rust primer",0.05,"#b91c1c"],["Substrate","Steel (by others)",3.00,"#64748b"]]},

  {"code":"ASM-TIL-001","group":"Tiling","cat":"CAT-TILE","unit":"m2","wtype":"Floor Tiling",
   "desc":"Porcelain floor tile 600x600 mm on polymer tile adhesive, grouted",
   "rule":"Net floor area; no deduction for openings <= 0.5 m2; skirting measured separately",
   "method":"Notched-trowel adhesive (10 mm) on cured screed, levelling clips, 2 mm joints, coloured grout",
   "scope":"Supply and lay homogeneous glazed porcelain floor tiles 600x600 mm on polymer-modified tile adhesive over a cured sand-cement screed, with levelling clips, 2 mm joints and coloured cementitious grout, cleaned and protected.",
   "guard":"Screed (ASM-SCR-001) and waterproofing are separate items. Tile price assumes standard grade; check selected range.",
   "output":10,
   "mats":[["MAT-TILE-001",1.0,0.07,"1 m2 tile + 7% cutting waste"],
           ["MAT-GEN-004",0.25,0.05,"~5 kg/m2 adhesive, 10 mm notch (20 kg bag)"],
           ["MAT-GEN-154",0.3,0.1,"2 mm joints ~0.3 kg/m2"],
           ["MAT-GEN-346",0.08,0,"~8 levelling clips/m2 (bag of 100)"]],
   "crew":[["PL-LAB-11","Tiler",1,"Cambodia benchmark: $18 – $22 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["PL-PLT-21","Tile cutter (wet saw)",1]],
   "specs":[["specification","Tile","Homogeneous glazed porcelain 600x600 mm, water absorption <= 0.5% (ISO 13006 BIa)"],
            ["specification","Adhesive","Polymer-modified C2TE (EN 12004)"],
            ["specification","Tolerance","Max. 3 mm under a 3 m straightedge; lippage <= 1 mm"],
            ["boundary_exclusion","","Floor screed and levelling"],
            ["boundary_exclusion","","Skirting, stair nosings and movement joints (separate items)"],
            ["productivity_benchmark","Cambodia Site Benchmark","8 - 12 m2 / gang-day for 600x600"]],
   "layers":[["Tile","Porcelain 600x600",9.00,"#e7e5e4"],["Adhesive","Polymer tile adhesive",6.00,"#9ca3af"],["Substrate","Sand-cement screed (by others)",50.00,"#a8a29e"]]},

  {"code":"ASM-TIL-002","group":"Tiling","cat":"CAT-TILE","unit":"m2","wtype":"Floor Tiling",
   "desc":"Ceramic floor tile 300x300 mm on 40 mm cement-sand mortar bed, grouted",
   "rule":"Net floor area; no deduction for openings <= 0.5 m2",
   "method":"Traditional semi-dry 1:4 mortar bed 40 mm with neat cement slurry, tiles tapped to level, grouted",
   "scope":"Supply and lay standard ceramic floor tiles 300x300 mm on a 40 mm semi-dry 1:4 cement-sand bed with neat cement slurry, joints grouted — the common Cambodian method for residential and back-of-house floors.",
   "guard":"Bed thickness above 40 mm (falls, level differences) is extra.",
   "output":12,
   "mats":[["MAT-GEN-371",1.0,0.07,"1 m2 tile + 7% cutting waste"],
           ["MAT-GEN-079",0.31,0.05,"40 mm 1:4 bed ~12.8 kg + slurry ~2.5 kg cement/m2 (50 kg bag)"],
           ["MAT-GEN-337",0.045,0.1,"40 mm bed incl. bulking"],
           ["MAT-GEN-154",0.4,0.1,"3 mm joints ~0.4 kg/m2"],
           ["MAT-GEN-438",0.01,0,"Mixing and curing water"]],
   "crew":[["PL-LAB-11","Tiler",1,"Cambodia benchmark: $18 – $22 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["PL-PLT-21","Tile cutter (wet saw)",1]],
   "specs":[["specification","Tile","Glazed ceramic 300x300 mm, standard grade"],
            ["specification","Bedding","Semi-dry 1:4 cement-sand, 40 mm, with neat cement slurry"],
            ["boundary_exclusion","","Additional bedding thickness above 40 mm"],
            ["productivity_benchmark","Cambodia Site Benchmark","10 - 14 m2 / gang-day"]],
   "layers":[["Tile","Ceramic 300x300",8.00,"#f5f5f4"],["Bed","1:4 cement-sand bed + slurry",40.00,"#a8a29e"],["Substrate","Concrete slab (by others)",120.00,"#78716c"]]},

  {"code":"ASM-TIL-003","group":"Tiling","cat":"CAT-TILE","unit":"m2","wtype":"Wall Tiling",
   "desc":"Glazed ceramic wall tile 300x600 mm on polymer tile adhesive, grouted",
   "rule":"Net wall area; deduct openings > 0.5 m2; trims measured separately",
   "method":"Notched-trowel adhesive on plaster, spacers, 2 mm joints, silicone at internal corners and fittings",
   "scope":"Supply and fix rectified glazed ceramic wall tiles 300x600 mm to plastered walls on polymer-modified adhesive with spacers, 2 mm grouted joints and neutral-cure silicone at internal corners and around fittings.",
   "guard":"Wet-area waterproofing below tiles is ASM-WPF-001. Metal trims are measured per metre.",
   "output":8,
   "mats":[["MAT-TILE-003",1.0,0.08,"1 m2 tile + 8% cutting waste"],
           ["MAT-GEN-004",0.2,0.05,"~4 kg/m2 adhesive (20 kg bag)"],
           ["MAT-GEN-154",0.25,0.1,"2 mm joints ~0.25 kg/m2"],
           ["MAT-GEN-346",0.1,0,"Spacers (bag of 100)"],
           ["MAT-GEN-330",0.03,0,"Silicone to corners and fittings (300 ml tube)"]],
   "crew":[["PL-LAB-11","Tiler",1,"Cambodia benchmark: $18 – $22 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["PL-PLT-21","Tile cutter (wet saw)",1]],
   "specs":[["specification","Tile","Rectified glazed ceramic 300x600 mm (Cotto / White Horse or equal)"],
            ["specification","Adhesive","Polymer-modified C2TE (EN 12004)"],
            ["boundary_exclusion","","Wall plaster and waterproofing"],
            ["boundary_exclusion","","Stainless / aluminium edge trims"],
            ["productivity_benchmark","Cambodia Site Benchmark","6 - 10 m2 / gang-day"]],
   "layers":[["Tile","Ceramic wall tile 300x600",8.00,"#f8fafc"],["Adhesive","Polymer tile adhesive",5.00,"#9ca3af"],["Substrate","Cement-sand plaster (by others)",15.00,"#a8a29e"]]},

  {"code":"ASM-TIL-004","group":"Tiling","cat":"CAT-TILE","unit":"m2","wtype":"Floor Tiling",
   "desc":"Anti-slip ceramic floor tile 300x300 mm to wet areas on tile adhesive, grouted",
   "rule":"Net floor area; no deduction for drains and openings <= 0.5 m2",
   "method":"Adhesive over cured waterproofing, laid to falls to drains, 3 mm joints",
   "scope":"Supply and lay anti-slip (R10) ceramic floor tiles 300x300 mm in toilets, kitchens and balconies on polymer tile adhesive over cured waterproofing, laid to falls, cut neatly around drains.",
   "guard":"Waterproofing (ASM-WPF-001) and floor drains are separate items.",
   "output":9,
   "mats":[["MAT-GEN-380",1.0,0.08,"1 m2 tile + 8% cutting waste (falls and drains)"],
           ["MAT-GEN-004",0.22,0.05,"~4.4 kg/m2 adhesive"],
           ["MAT-GEN-154",0.4,0.1,"3 mm joints ~0.4 kg/m2"],
           ["MAT-GEN-346",0.1,0,"Spacers"]],
   "crew":[["PL-LAB-11","Tiler",1,"Cambodia benchmark: $18 – $22 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["PL-PLT-21","Tile cutter (wet saw)",1]],
   "specs":[["specification","Slip Resistance","R10 (DIN 51130) or better"],
            ["boundary_exclusion","","Waterproofing membrane, floor drains and screed to falls"],
            ["productivity_benchmark","Cambodia Site Benchmark","7 - 10 m2 / gang-day (small rooms)"]],
   "layers":[["Tile","Anti-slip ceramic 300x300",8.00,"#e7e5e4"],["Adhesive","Polymer tile adhesive",5.00,"#9ca3af"],["Membrane","Cementitious waterproofing (by others)",2.00,"#38bdf8"]]},

  {"code":"ASM-TIL-005","group":"Tiling","cat":"CAT-TILE","unit":"m","wtype":"Floor Tiling",
   "desc":"Porcelain tile skirting 100 mm high cut from 600x600 floor tile, on adhesive",
   "rule":"Net length along wall; no deduction for door openings <= 1.0 m",
   "method":"Strips cut on wet saw, edge polished, fixed with adhesive, grouted to floor tile joints",
   "scope":"Tile skirting 100 mm high cut from the matching 600x600 porcelain floor tile, factory edge up, fixed on tile adhesive and grouted.",
   "guard":"Pre-made skirting pieces from the tile supplier change the material line.",
   "output":25,
   "mats":[["MAT-TILE-001",0.1,0.15,"0.1 m2/m + 15% cutting waste"],
           ["MAT-GEN-004",0.02,0.05,"~0.4 kg/m adhesive"],
           ["MAT-GEN-154",0.03,0.1,"Joints and top edge"]],
   "crew":[["PL-LAB-11","Tiler",1,"Cambodia benchmark: $18 – $22 / day"],["PL-LAB-01","Helper",0.5,"Shared helper"]],
   "equip":[["PL-PLT-21","Tile cutter (wet saw)",1]],
   "specs":[["specification","Height","100 mm, factory edge up"],
            ["productivity_benchmark","Cambodia Site Benchmark","20 - 30 m / tiler-day"]],
   "layers":[["Tile","Porcelain skirting strip",9.00,"#e7e5e4"],["Adhesive","Tile adhesive",4.00,"#9ca3af"]]},

  {"code":"ASM-PLS-001","group":"Masonry & Plaster","cat":"CAT-MASN","unit":"m2","wtype":"Plastering",
   "desc":"Internal cement-sand plaster 15 mm (1:4) to masonry walls, wood-float finish",
   "rule":"Net plastered area; deduct openings > 0.5 m2; reveals measured separately",
   "method":"Wet down, dubbing where needed, screeds / dots, 1:4 plaster 15 mm, wood float, mesh at dissimilar junctions",
   "scope":"Internal cement-sand plaster 15 mm thick (1:4) to brick / block walls including dots and screeds, galvanised mesh at column-wall junctions and around conduits, wood-float finish ready for skim and paint; cured 7 days.",
   "guard":"Average 15 mm. Extra thickness for out-of-plumb masonry is measured separately.",
   "output":12,
   "mats":[["MAT-GEN-079",0.11,0.05,"0.017 m3 mortar/m2 incl. dubbing @ ~320 kg cement/m3 (50 kg bag)"],
           ["MAT-GEN-337",0.019,0.1,"Fine plastering sand incl. bulking"],
           ["MAT-GEN-207",0.1,0.05,"Mesh at junctions and conduit chases ~0.1 m2/m2"],
           ["MAT-GEN-438",0.006,0,"Mixing and curing water"]],
   "crew":[["PL-LAB-10","Plasterer",1,"Cambodia benchmark: $15 – $18 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["PL-PLT-20","Mobile scaffold tower",1]],
   "specs":[["specification","Mix / Thickness","1:4 cement : fine sand, 15 mm average"],
            ["specification","Tolerance","Max. 3 mm deviation under a 2 m straightedge"],
            ["boundary_exclusion","","Skim coat and painting"],
            ["boundary_exclusion","","Corner beads and expansion joints"],
            ["productivity_benchmark","Cambodia Site Benchmark","10 - 14 m2 / gang-day"]],
   "layers":[["Plaster","1:4 cement-sand plaster",15.00,"#d6d3d1"],["Substrate","Brick / block wall (by others)",100.00,"#b45309"]]},

  {"code":"ASM-PLS-002","group":"Masonry & Plaster","cat":"CAT-MASN","unit":"m2","wtype":"Plastering",
   "desc":"External cement-sand render 20 mm (1:3) with waterproofing admixture",
   "rule":"Net rendered facade area; deduct openings > 0.5 m2",
   "method":"Spatterdash, two-coat 1:3 render 20 mm with integral waterproofer, mesh at junctions, wood-float finish",
   "scope":"External two-coat cement-sand render 20 mm (1:3) with integral waterproofing admixture on spatterdash, galvanised mesh at junctions, wood-float finish ready for exterior paint; cured 7 days.",
   "guard":"Facade scaffolding is in preliminaries. Grooves / feature bands are extra.",
   "output":10,
   "mats":[["MAT-GEN-079",0.17,0.05,"0.022 m3/m2 incl. spatterdash @ ~400 kg cement/m3"],
           ["MAT-GEN-337",0.024,0.1,"Plastering sand incl. bulking"],
           ["MAT-GEN-033",0.05,0.05,"Integral waterproofing / plasticiser admixture"],
           ["MAT-GEN-207",0.15,0.05,"Mesh at junctions ~0.15 m2/m2"],
           ["MAT-GEN-438",0.008,0,"Mixing and curing water"]],
   "crew":[["PL-LAB-10","Plasterer",1,"Cambodia benchmark: $15 – $18 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["PL-PLT-20","Mobile scaffold tower (low level)",1]],
   "specs":[["specification","Mix / Thickness","1:3 cement : sand, 20 mm in two coats, integral waterproofer"],
            ["boundary_exclusion","","Facade scaffolding / gondola (preliminaries)"],
            ["boundary_exclusion","","Architectural grooves and bands"],
            ["productivity_benchmark","Cambodia Site Benchmark","8 - 12 m2 / gang-day"]],
   "layers":[["Render","1:3 render with waterproofer",20.00,"#d6d3d1"],["Substrate","Brick / block wall (by others)",100.00,"#b45309"]]},

  {"code":"ASM-SCR-001","group":"Screeding","cat":"CAT-CONC","unit":"m2","wtype":"Floor Screed",
   "desc":"Cement-sand floor screed 50 mm (1:3), bonded, trowelled ready for tiling",
   "rule":"Net floor area; no deduction for columns / openings <= 0.5 m2",
   "method":"Clean and wet slab, bonding slurry, 1:3 semi-dry screed 50 mm to levels, float finish, cured 7 days",
   "scope":"Bonded cement-sand floor screed 50 mm average (1:3) laid on a cleaned and wetted slab with neat cement bonding slurry, ruled to level or falls, wood-float finish ready for tile adhesive; cured 7 days.",
   "guard":"Average 50 mm. Screeds to falls > 65 mm or unbonded / floating screeds are separate.",
   "output":25,
   "mats":[["MAT-GEN-079",0.45,0.05,"0.052 m3/m2 incl. slurry @ ~430 kg cement/m3"],
           ["MAT-GEN-340",0.058,0.1,"Coarse washed sand incl. bulking"],
           ["MAT-GEN-438",0.012,0,"Mixing and curing water"]],
   "crew":[["PL-LAB-02","Mason",1,"Cambodia benchmark: $16 – $20 / day"],["PL-LAB-01","Helper",2,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["PL-PLT-01","Concrete mixer 350-500 L",1]],
   "specs":[["specification","Mix / Thickness","1:3 cement : coarse sand, 50 mm average, bonded"],
            ["specification","Tolerance","SR2 — max. 5 mm under a 2 m straightedge"],
            ["boundary_exclusion","","Floor hardener, self-levelling underlay"],
            ["productivity_benchmark","Cambodia Site Benchmark","20 - 30 m2 / gang-day (mixer on floor)"]],
   "layers":[["Screed","1:3 cement-sand screed",50.00,"#a8a29e"],["Bond","Neat cement slurry",2.00,"#78716c"],["Substrate","RC slab (by others)",150.00,"#57534e"]]},

  {"code":"ASM-MAS-002","group":"Masonry & Plaster","cat":"CAT-MASN","unit":"m2","wtype":"Masonry Walls",
   "desc":"100 mm AAC lightweight block wall (600x200x100 mm) in thin-bed mortar",
   "rule":"Net wall area; deduct openings > 0.5 m2; lintels and stiffeners measured separately",
   "method":"First course on 1:3 mortar bed, then thin-bed joints 3 mm, staggered bond, ties to columns every 3 courses",
   "scope":"100 mm autoclaved aerated concrete block walls (600x200x100 mm) with the first course on a 1:3 levelling bed and 3 mm thin-bed joints above, staggered bond, tied to RC columns.",
   "guard":"Lintels, stiffener columns and plaster are separate items.",
   "output":15,
   "mats":[["MAT-GEN-049",8.33,0.05,"8.33 blocks/m2 (600x200 face)"],
           ["MAT-GEN-079",0.06,0.05,"Levelling bed + thin joints ~3 kg cement/m2"],
           ["MAT-GEN-337",0.005,0.1,"Mortar sand"]],
   "crew":[["PL-LAB-02","Mason",1,"Cambodia benchmark: $16 – $20 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[],
   "specs":[["specification","Block","AAC 600x200x100 mm, density ~550 kg/m3"],
            ["boundary_exclusion","","RC lintels, stiffener columns and wall ties to structure"],
            ["productivity_benchmark","Cambodia Site Benchmark","12 - 18 m2 / gang-day"]],
   "layers":[["Wall","AAC block 100 mm",100.00,"#e5e7eb"]]},

  {"code":"ASM-MAS-003","group":"Masonry & Plaster","cat":"CAT-MASN","unit":"m2","wtype":"Masonry Walls",
   "desc":"100 mm red clay 4-hole brick wall (80x80x180 mm) in 1:4 cement-sand mortar",
   "rule":"Net wall area; deduct openings > 0.5 m2; lintels and stiffeners measured separately",
   "method":"Stretcher bond, 10 mm joints, bricks pre-wetted, ties to columns every 5 courses",
   "scope":"Single-leaf internal partition in local kiln-fired 4-hole red clay bricks 80x80x180 mm laid in stretcher bond with 1:4 cement-sand mortar, 10 mm joints, pre-wetted bricks, tied to RC columns. For the 200 mm external / party wall see ASM-MAS-001.",
   "guard":"Lintels, stiffener columns and plaster are separate items.",
   "output":10,
   "mats":[["MAT-MASN-002",58,0.05,"~58 bricks/m2 (190x90 incl. joints)"],
           ["MAT-GEN-079",0.15,0.05,"0.025 m3 mortar/m2 @ ~300 kg cement/m3"],
           ["MAT-GEN-337",0.028,0.1,"Mortar sand incl. bulking"],
           ["MAT-GEN-438",0.005,0,"Mixing water and pre-wetting"]],
   "crew":[["PL-LAB-02","Mason",1,"Cambodia benchmark: $16 – $20 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[],
   "specs":[["specification","Brick","Kiln-fired 4-hole red clay 80x80x180 mm, class 1"],
            ["specification","Mortar","1:4 cement : sand, 10 mm joints"],
            ["boundary_exclusion","","RC lintels, stiffeners and plaster"],
            ["productivity_benchmark","Cambodia Site Benchmark","8 - 12 m2 / gang-day"]],
   "layers":[["Wall","Red clay 4-hole brick",80.00,"#b45309"]]},

  {"code":"ASM-MAS-004","group":"Masonry & Plaster","cat":"CAT-MASN","unit":"m2","wtype":"Masonry Walls",
   "desc":"150 mm hollow concrete block wall (150x200x400 mm) in 1:4 cement-sand mortar",
   "rule":"Net wall area; deduct openings > 0.5 m2; lintels and core filling measured separately",
   "method":"Stretcher bond, 10 mm joints, ties to columns every 3 courses",
   "scope":"150 mm hollow concrete block walls (15x20x40 cm) in stretcher bond with 1:4 cement-sand mortar and 10 mm joints, tied to RC columns.",
   "guard":"Core filling / reinforcement for load-bearing use is extra.",
   "output":12,
   "mats":[["MAT-GEN-045",12.5,0.05,"12.5 blocks/m2 (410x210 incl. joints)"],
           ["MAT-GEN-079",0.075,0.05,"0.012 m3 mortar/m2 @ ~300 kg cement/m3"],
           ["MAT-GEN-337",0.014,0.1,"Mortar sand"],
           ["MAT-GEN-438",0.004,0,"Mixing water"]],
   "crew":[["PL-LAB-02","Mason",1,"Cambodia benchmark: $16 – $20 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[],
   "specs":[["specification","Block","Hollow concrete block 150x200x400 mm"],
            ["boundary_exclusion","","Core filling, reinforcement, lintels and plaster"],
            ["productivity_benchmark","Cambodia Site Benchmark","10 - 14 m2 / gang-day"]],
   "layers":[["Wall","Hollow concrete block 150 mm",150.00,"#9ca3af"]]},

  {"code":"ASM-WPF-001","group":"Waterproofing","cat":"CAT-WPRF","unit":"m2","wtype":"Wet Area Waterproofing",
   "desc":"Cementitious waterproofing to wet areas — 2 coats, with 300 mm wall upturn and corner reinforcement",
   "rule":"Net floor area plus wall upturns (measured flat); no deduction for drains",
   "method":"Prime / dampen, fillets and mesh at wall-floor junctions and drains, 2 crossing coats by brush, 48 h flood test",
   "scope":"Two-component polymer-modified cementitious waterproofing in toilets, kitchens and balconies: substrate dampened, fillets and reinforcing mesh at internal corners and drains, two crossing brush coats (~2 kg/m2), 300 mm upturn at walls (1,800 mm at showers), 48-hour flood test.",
   "guard":"Area includes upturns. Protective screed / tile is separate.",
   "output":30,
   "mats":[["MAT-GEN-436",0.08,0.05,"2 coats ~2.0 kg/m2 (25 kg 2-part set)"],
           ["MAT-GEN-207",0.2,0.05,"Reinforcing mesh at corners and drains"]],
   "crew":[["PL-LAB-02","Waterproofing applicator",1,"Cambodia benchmark: $16 – $20 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[],
   "specs":[["specification","Product","2-part polymer cementitious slurry (SikaTop Seal 107 or equal)"],
            ["specification","Testing","48-hour flood test before tiling"],
            ["boundary_exclusion","","Screed to falls, floor drains and tiling"],
            ["productivity_benchmark","Cambodia Site Benchmark","25 - 40 m2 / gang-day (2 coats)"]],
   "layers":[["Membrane","Cementitious waterproofing, 2 coats",2.00,"#38bdf8"],["Substrate","Screed / slab (by others)",50.00,"#a8a29e"]]},

  {"code":"ASM-WPF-002","group":"Waterproofing","cat":"CAT-WPRF","unit":"m2","wtype":"Roof Waterproofing",
   "desc":"Liquid polyurethane roof waterproofing 1.5 mm DFT, UV-resistant, with reinforcement at details",
   "rule":"Net roof area plus upturns (measured flat)",
   "method":"Grind and clean slab, fill defects, reinforcing fabric at details, 2 coats PU to 1.5 mm DFT, flood test",
   "scope":"Seamless liquid-applied polyurethane waterproofing to exposed concrete roofs: surface grinding and cleaning, reinforcement at upstands, drains and cracks, two coats to 1.5 mm dry film thickness, 300 mm upturns, 48-hour flood test.",
   "guard":"PU price is a draft web-research estimate in the Material Master — confirm with Sika / distributor quote. Insulation and protection screed are separate.",
   "output":40,
   "mats":[["MAT-WPRF-002",2.0,0.05,"1.5 mm DFT @ ~1.3 kg/m2/mm"],
           ["MAT-GEN-207",0.1,0.05,"Reinforcement at details"]],
   "crew":[["PL-LAB-02","Waterproofing applicator",1,"Cambodia benchmark: $16 – $20 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[],
   "specs":[["specification","Product","Liquid-applied PU membrane (Sikalastic or equal), UV resistant"],
            ["specification","Thickness","1.5 mm dry film thickness minimum"],
            ["boundary_exclusion","","Roof insulation, screed to falls and protection layers"],
            ["productivity_benchmark","Cambodia Site Benchmark","30 - 50 m2 / gang-day"]],
   "layers":[["Membrane","PU waterproofing 1.5 mm",1.50,"#0ea5e9"],["Substrate","RC roof slab (by others)",150.00,"#57534e"]]},

  {"code":"ASM-CEIL-MFT-001","group":"Ceiling","cat":"CAT-CEIL","unit":"m2","wtype":"Interior Ceiling Fitout",
   "desc":"Mineral fibre lay-in ceiling tile 600x600 mm on exposed T-grid suspension",
   "rule":"Net ceiling area; no deduction for openings <= 0.5 m2",
   "method":"Wall angle to level, hangers at 1200 c/c, main tees 1200 c/c, cross tees 600, tiles laid in",
   "scope":"Supply and install 600x600 mm mineral fibre lay-in ceiling tiles on an exposed 24 mm white T-grid, including perimeter wall angle, hangers with expansion anchors, main and cross tees, cutting around services.",
   "guard":"Standard height <= 4.0 m. Access panels and light fittings are separate.",
   "output":25,
   "mats":[["MAT-GEN-203",2.78,0.05,"2.78 tiles/m2 (600x600)"],
           ["MAT-GEN-367",1.0,0.05,"T-grid main + cross tees per m2"],
           ["MAT-CEIL-034",0.7,0.05,"Hangers at 1200 c/c incl. anchors"],
           ["MAT-CEIL-035",0.4,0.05,"Perimeter wall angle ~0.4 m/m2"]],
   "crew":[["PL-LAB-13","Ceiling installer",1,"Cambodia benchmark: $15 – $18 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["E-SCF-001","Mobile stepladder & baker scaffold",1]],
   "specs":[["specification","Tile","Mineral fibre 600x600x15 mm, NRC >= 0.55"],
            ["specification","Grid","24 mm exposed white T-grid (ASTM C635)"],
            ["boundary_exclusion","","Access panels, light fittings and diffusers"],
            ["productivity_benchmark","Cambodia Site Benchmark","20 - 30 m2 / gang-day"]],
   "layers":[["Tile","Mineral fibre tile 15 mm",15.00,"#f1f5f9"],["Grid","Exposed T-grid",38.00,"#fb923c"]]},

  {"code":"ASM-DRY-001","group":"Drywall & Partitions","cat":null,"unit":"m2","wtype":"Drywall Partition",
   "desc":"Gypsum drywall partition — 76 mm metal studs @ 600 c/c, 1 layer 12.5 mm board each side, jointed",
   "rule":"Net partition area measured one side; deduct openings > 0.5 m2",
   "method":"Floor and ceiling tracks, studs @ 600 c/c, boards screwed @ 200 c/c both sides, joints taped and filled",
   "scope":"Non-load-bearing drywall partition 101 mm overall: 76 mm galvanised studs at 600 mm centres in floor and ceiling tracks, one layer 12.5 mm standard gypsum board each side screwed at 200 mm centres, joints taped and filled to Level 4 ready for paint.",
   "guard":"Height <= 3.5 m. Insulation infill, fire / acoustic rating and door frames are separate.",
   "output":10,
   "mats":[["MAT-CEIL-031",2.0,0.07,"2 m2 board/m2 (one layer each side)"],
           ["MAT-GEN-349",2.4,0.05,"Studs @ 600 c/c ~1.7 m + tracks ~0.7 m per m2"],
           ["MAT-CEIL-036",30,0.1,"Screws @ 200 c/c both sides"],
           ["MAT-CEIL-037",2.4,0.05,"Joint tape both sides"],
           ["MAT-CEIL-038",0.7,0.05,"Jointing compound both sides"]],
   "crew":[["PL-LAB-13","Drywall installer",1,"Cambodia benchmark: $15 – $18 / day"],["PL-LAB-01","Helper",1,"Cambodia benchmark: $11 – $13 / day"]],
   "equip":[["E-SCF-001","Mobile stepladder & baker scaffold",1]],
   "specs":[["specification","Build-up","12.5 GB + 76 stud + 12.5 GB = 101 mm"],
            ["specification","Applicable Standards","ASTM C1396 / ASTM C754 / ASTM C840"],
            ["boundary_exclusion","","Mineral wool infill, fire / acoustic rated build-ups"],
            ["boundary_exclusion","","Door frames and heavy-fixture backing"],
            ["productivity_benchmark","Cambodia Site Benchmark","8 - 12 m2 / gang-day (both sides, jointed)"]],
   "layers":[["Board","12.5 mm gypsum board",12.50,"#60a5fa"],["Stud","76 mm metal stud cavity",76.00,"#fb923c"],["Board","12.5 mm gypsum board",12.50,"#60a5fa"]]}
  ]$json$;

  v_item      jsonb;
  v_line      jsonb;
  v_tenant    uuid;
  v_asm_id    uuid;
  v_wi_id     uuid;
  v_cat_id    uuid;
  v_missing   text;
  v_i         int;
  v_added     int := 0;
  v_skipped   int := 0;
BEGIN
  -- Same tenant as the existing library.
  SELECT tenant_id INTO v_tenant FROM public.dwl_resources WHERE code = 'MAT-GEN-079';
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Library tenant not found (resource MAT-GEN-079 missing) — load the Cost & Rate Library first';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_data) LOOP
    IF EXISTS (SELECT 1 FROM public.dwl_assemblies WHERE code = v_item->>'code') THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.dwl_work_items WHERE code = v_item->>'code') THEN
      RAISE NOTICE '% skipped — a work item with this code already exists', v_item->>'code';
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Every referenced resource must exist, or the item is skipped.
    SELECT string_agg(c, ', ') INTO v_missing
    FROM (
      SELECT l->>0 AS c FROM jsonb_array_elements(v_item->'mats') l
      UNION SELECT l->>0 FROM jsonb_array_elements(v_item->'crew') l
      UNION SELECT l->>0 FROM jsonb_array_elements(v_item->'equip') l
    ) x
    WHERE NOT EXISTS (SELECT 1 FROM public.dwl_resources r WHERE r.code = x.c);
    IF v_missing IS NOT NULL THEN
      RAISE NOTICE '% skipped — resource code(s) not found: %', v_item->>'code', v_missing;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id INTO v_cat_id FROM public.dwl_material_categories WHERE code = v_item->>'cat';

    INSERT INTO public.dwl_work_items (tenant_id, code, boq_section, description, unit, method_note)
    VALUES (v_tenant, v_item->>'code', v_item->>'group', v_item->>'desc', v_item->>'unit', v_item->>'method')
    RETURNING id INTO v_wi_id;

    v_i := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_item->'mats') LOOP
      v_i := v_i + 1;
      INSERT INTO public.dwl_work_item_resources (tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
      SELECT v_tenant, v_wi_id, r.id, (v_line->>1)::numeric, (v_line->>2)::numeric, v_line->>3, v_i
      FROM public.dwl_resources r WHERE r.code = v_line->>0;
    END LOOP;

    INSERT INTO public.dwl_assemblies (tenant_id, code, element_group, description, unit, measurement_rule)
    VALUES (v_tenant, v_item->>'code', v_item->>'group', v_item->>'desc', v_item->>'unit', v_item->>'rule')
    RETURNING id INTO v_asm_id;

    INSERT INTO public.dwl_assembly_costing
      (assembly_id, tenant_id, daily_output, overhead_pct, risk_pct, profit_pct, vat_pct,
       guardrail_note, version_label, status, discipline, work_item_type, category_id, scope_of_works)
    VALUES (v_asm_id, v_tenant, (v_item->>'output')::numeric, 0.10, 0.02, 0.10, 0,
            v_item->>'guard', 'v1.0', 'active', 'Architectural', v_item->>'wtype', v_cat_id, v_item->>'scope');

    INSERT INTO public.dwl_assembly_items (tenant_id, assembly_id, work_item_id, qty_per_unit, basis_note, sort_order)
    VALUES (v_tenant, v_asm_id, v_wi_id, 1, 'Direct 1:1 — single work item forms the whole assembly', 1);

    v_i := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_item->'crew') LOOP
      v_i := v_i + 1;
      INSERT INTO public.dwl_assembly_crew (tenant_id, assembly_id, resource_id, role_label, quantity, sort_order, benchmark_note)
      SELECT v_tenant, v_asm_id, r.id, v_line->>1, (v_line->>2)::numeric, v_i, v_line->>3
      FROM public.dwl_resources r WHERE r.code = v_line->>0;
    END LOOP;

    v_i := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_item->'equip') LOOP
      v_i := v_i + 1;
      INSERT INTO public.dwl_assembly_equipment (tenant_id, assembly_id, resource_id, role_label, quantity, sort_order)
      SELECT v_tenant, v_asm_id, r.id, v_line->>1, (v_line->>2)::numeric, v_i
      FROM public.dwl_resources r WHERE r.code = v_line->>0;
    END LOOP;

    v_i := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_item->'specs') LOOP
      v_i := v_i + 1;
      INSERT INTO public.dwl_assembly_specs (tenant_id, assembly_id, section, sort_order, spec_label, spec_value)
      VALUES (v_tenant, v_asm_id, v_line->>0, v_i, v_line->>1, v_line->>2);
    END LOOP;

    v_i := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_item->'layers') LOOP
      v_i := v_i + 1;
      INSERT INTO public.dwl_assembly_layers (tenant_id, assembly_id, sort_order, layer_name, material_label, thickness_mm, color_hex)
      VALUES (v_tenant, v_asm_id, v_i, v_line->>0, v_line->>1, (v_line->>2)::numeric, v_line->>3);
    END LOOP;

    v_added := v_added + 1;
  END LOOP;

  RAISE NOTICE 'Cost Item Library seed: % item(s) added, % skipped (already present or missing resources)', v_added, v_skipped;
END $seed$;
