-- QS Module Phase 1: Cost Code Library (Division → Section → Item rate library)

CREATE TABLE IF NOT EXISTS public.qs_cost_divisions (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  seq  INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.qs_cost_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES public.qs_cost_divisions(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  seq         INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.qs_cost_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id    UUID NOT NULL REFERENCES public.qs_cost_sections(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  description   TEXT NOT NULL,
  unit          TEXT NOT NULL,
  base_rate     NUMERIC(12,2) NOT NULL DEFAULT 0,
  labor_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  material_pct  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  equipment_pct NUMERIC(5,2)  NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.qs_cost_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qs_cost_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qs_cost_items     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qs_div_auth"  ON public.qs_cost_divisions TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qs_sec_auth"  ON public.qs_cost_sections  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qs_item_auth" ON public.qs_cost_items     TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_qs_sections_div  ON public.qs_cost_sections(division_id);
CREATE INDEX idx_qs_items_section ON public.qs_cost_items(section_id);

-- ── Seed: Divisions ───────────────────────────────────────────────────────────
INSERT INTO public.qs_cost_divisions (code, name, seq) VALUES
  ('01', 'General Requirements',          10),
  ('02', 'Existing Conditions',           20),
  ('03', 'Concrete',                      30),
  ('04', 'Masonry',                       40),
  ('05', 'Metals',                        50),
  ('06', 'Wood, Plastics & Composites',   60),
  ('07', 'Thermal & Moisture Protection', 70),
  ('08', 'Openings',                      80),
  ('09', 'Finishes',                      90),
  ('10', 'Specialties',                  100),
  ('21', 'Fire Suppression',             110),
  ('22', 'Plumbing',                     120),
  ('23', 'HVAC',                         130),
  ('26', 'Electrical',                   140),
  ('27', 'Communications',               150),
  ('31', 'Earthwork',                    160),
  ('32', 'Exterior Improvements',        170),
  ('33', 'Utilities',                    180)
ON CONFLICT (code) DO NOTHING;

-- ── Seed: Sections & Items (via DO block) ────────────────────────────────────
DO $$
DECLARE
  d01 UUID; d03 UUID; d04 UUID; d05 UUID; d07 UUID;
  d08 UUID; d09 UUID; d22 UUID; d26 UUID; d31 UUID;
  sid UUID;
BEGIN
  SELECT id INTO d01 FROM public.qs_cost_divisions WHERE code='01';
  SELECT id INTO d03 FROM public.qs_cost_divisions WHERE code='03';
  SELECT id INTO d04 FROM public.qs_cost_divisions WHERE code='04';
  SELECT id INTO d05 FROM public.qs_cost_divisions WHERE code='05';
  SELECT id INTO d07 FROM public.qs_cost_divisions WHERE code='07';
  SELECT id INTO d08 FROM public.qs_cost_divisions WHERE code='08';
  SELECT id INTO d09 FROM public.qs_cost_divisions WHERE code='09';
  SELECT id INTO d22 FROM public.qs_cost_divisions WHERE code='22';
  SELECT id INTO d26 FROM public.qs_cost_divisions WHERE code='26';
  SELECT id INTO d31 FROM public.qs_cost_divisions WHERE code='31';

  -- 01 General Requirements
  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d01,'01 10','Temporary Facilities & Controls',10) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'01 10 13','Mobilisation & Demobilisation','LS',25000,60,30,10),
    (sid,'01 10 14','Temporary Site Office (per month)','month',2500,20,70,10),
    (sid,'01 10 15','Temporary Hoarding & Fencing','m',85,40,50,10),
    (sid,'01 10 16','Site Security (per month)','month',3500,100,0,0);

  -- 03 Concrete
  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d03,'03 20','Concrete Reinforcing',10) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'03 20 13','Mild Steel Reinforcement (supply & fix)','ton',1450,35,60,5),
    (sid,'03 20 14','High-Yield Reinforcement (supply & fix)','ton',1580,35,60,5);

  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d03,'03 30','Cast-in-Place Concrete',20) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'03 30 13','Concrete Footings / Pile Caps (C25)','m3',285,30,60,10),
    (sid,'03 30 14','Concrete Columns (C30)','m3',320,35,55,10),
    (sid,'03 30 15','Concrete Beams (C30)','m3',310,35,55,10),
    (sid,'03 30 16','Concrete Slabs on Grade (C25)','m2',65,30,60,10),
    (sid,'03 30 17','Concrete Suspended Slabs (C30)','m2',95,35,55,10),
    (sid,'03 30 18','Concrete Walls (C30)','m3',340,38,52,10),
    (sid,'03 30 19','Concrete Staircase (C30)','m3',380,45,45,10);

  -- 04 Masonry
  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d04,'04 20','Unit Masonry',10) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'04 20 13','Brick Masonry Wall (100mm)','m2',68,50,45,5),
    (sid,'04 20 14','Brick Masonry Wall (200mm)','m2',115,50,45,5),
    (sid,'04 20 15','Hollow Concrete Block (150mm)','m2',55,45,50,5),
    (sid,'04 20 16','Hollow Concrete Block (200mm)','m2',75,45,50,5);

  -- 05 Metals
  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d05,'05 10','Structural Steel',10) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'05 10 13','Structural Steel (supply, fabricate & erect)','ton',2800,30,60,10),
    (sid,'05 10 14','Steel Decking','m2',42,25,65,10);

  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d05,'05 50','Metal Fabrications',20) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'05 50 13','Steel Staircase','EA',4500,45,50,5),
    (sid,'05 50 14','Mild Steel Handrail','m',120,55,40,5),
    (sid,'05 50 15','Steel Grating','m2',185,30,65,5);

  -- 07 Thermal & Moisture
  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d07,'07 10','Waterproofing',10) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'07 10 13','Bituminous Waterproofing Membrane','m2',38,40,55,5),
    (sid,'07 10 14','Cementitious Waterproofing','m2',28,45,50,5),
    (sid,'07 10 15','Polyurethane Waterproofing','m2',55,35,60,5);

  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d07,'07 20','Thermal Insulation',20) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'07 20 13','Rockwool Insulation (50mm)','m2',22,40,55,5),
    (sid,'07 20 14','EPS Insulation Board (50mm)','m2',18,35,60,5);

  -- 08 Openings
  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d08,'08 10','Doors & Frames',10) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'08 10 13','Hollow Metal Door & Frame (900×2100)','EA',680,30,65,5),
    (sid,'08 10 14','Fire-Rated Steel Door & Frame (FD60)','EA',1250,30,65,5),
    (sid,'08 10 15','Aluminium Door (single leaf)','EA',850,25,70,5),
    (sid,'08 10 16','Automatic Sliding Door','EA',4200,20,75,5);

  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d08,'08 50','Windows',20) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'08 50 13','Aluminium Window (clear glass)','m2',185,25,70,5),
    (sid,'08 50 14','Aluminium Window (tinted glass)','m2',215,25,70,5),
    (sid,'08 50 15','Curtain Wall System','m2',450,25,70,5);

  -- 09 Finishes
  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d09,'09 20','Plastering',10) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'09 20 13','Sand-Cement Plaster (15mm)','m2',18,60,35,5),
    (sid,'09 20 14','Gypsum Board (single layer)','m2',28,50,45,5),
    (sid,'09 20 15','Gypsum Board Ceiling (with frame)','m2',45,50,45,5);

  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d09,'09 30','Tiling',20) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'09 30 13','Ceramic Floor Tile (300×300)','m2',38,45,50,5),
    (sid,'09 30 14','Porcelain Floor Tile (600×600)','m2',65,40,55,5),
    (sid,'09 30 15','Wall Tile (300×450)','m2',45,45,50,5),
    (sid,'09 30 16','Natural Stone Flooring','m2',120,35,60,5);

  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d09,'09 90','Painting & Coating',30) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'09 90 13','Interior Emulsion Paint (2 coats)','m2',8,65,30,5),
    (sid,'09 90 14','Exterior Weather Paint (2 coats)','m2',12,60,35,5),
    (sid,'09 90 15','Epoxy Floor Coating','m2',35,40,55,5),
    (sid,'09 90 16','Anti-rust Paint on Steelwork','m2',18,55,40,5);

  -- 22 Plumbing
  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d22,'22 10','Plumbing Piping',10) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'22 10 13','UPVC Water Supply Pipe (25mm)','m',18,50,45,5),
    (sid,'22 10 14','UPVC Water Supply Pipe (50mm)','m',32,45,50,5),
    (sid,'22 10 15','UPVC Drainage Pipe (100mm)','m',28,45,50,5),
    (sid,'22 10 16','UPVC Drainage Pipe (150mm)','m',45,40,55,5);

  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d22,'22 40','Plumbing Fixtures',20) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'22 40 13','Close-Coupled WC Suite','EA',380,30,65,5),
    (sid,'22 40 14','Wash Basin (wall-hung)','EA',280,30,65,5),
    (sid,'22 40 15','Shower Tray & Enclosure','EA',650,25,70,5),
    (sid,'22 40 16','Urinal (wall-hung)','EA',320,30,65,5);

  -- 26 Electrical
  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d26,'26 20','LV Distribution',10) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'26 20 13','Main Distribution Board','EA',3500,25,70,5),
    (sid,'26 20 14','Sub Distribution Board','EA',1800,25,70,5),
    (sid,'26 20 15','PVC Conduit (20mm)','m',8,55,40,5),
    (sid,'26 20 16','Cable Tray / Trunking','m',35,40,55,5),
    (sid,'26 20 17','Power & Lighting Cable (2.5mm²)','m',5,50,45,5);

  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d26,'26 50','Lighting',20) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'26 50 13','LED Panel Light (600×600)','EA',185,35,60,5),
    (sid,'26 50 14','LED Downlight (recessed)','EA',95,35,60,5),
    (sid,'26 50 15','Emergency Exit Light','EA',145,30,65,5),
    (sid,'26 50 16','External Floodlight','EA',280,30,65,5);

  -- 31 Earthwork
  INSERT INTO public.qs_cost_sections (division_id,code,name,seq) VALUES (d31,'31 20','Earth Moving',10) RETURNING id INTO sid;
  INSERT INTO public.qs_cost_items (section_id,code,description,unit,base_rate,labor_pct,material_pct,equipment_pct) VALUES
    (sid,'31 20 13','General Excavation (machine)','m3',22,20,0,80),
    (sid,'31 20 14','Rock Breaking & Excavation','m3',85,15,0,85),
    (sid,'31 20 15','Backfilling & Compaction','m3',28,25,30,45),
    (sid,'31 20 16','Disposal of Excavated Material','m3',18,10,0,90),
    (sid,'31 20 17','Sand Bedding (150mm)','m3',45,30,65,5);
END $$;
