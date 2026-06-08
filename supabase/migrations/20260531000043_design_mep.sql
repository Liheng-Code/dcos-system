-- Design Module: MEP-specific tables

-- 1. EQUIPMENT SCHEDULE
CREATE TABLE IF NOT EXISTS public.design_mep_equipment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  equipment_no    TEXT NOT NULL,
  equipment_name  TEXT NOT NULL,
  sub_discipline  TEXT NOT NULL CHECK (sub_discipline IN ('mechanical','electrical','plumbing','fire_fighting','elv','hvac','drainage','water_supply','power','lighting','communication','security','other')),
  manufacturer    TEXT,
  model_ref       TEXT,
  capacity        TEXT,
  power_rating_kw NUMERIC(10,2),
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit            TEXT,
  location        TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','ordered','delivered','installed','commissioned')),
  remarks         TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. LOAD SCHEDULE
CREATE TABLE IF NOT EXISTS public.design_mep_load_schedule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  load_type       TEXT NOT NULL CHECK (load_type IN ('electrical','mechanical','hvac','plumbing','fire_fighting','other')),
  load_name       TEXT NOT NULL,
  load_value      NUMERIC(12,2) NOT NULL,
  unit            TEXT NOT NULL DEFAULT 'kW',
  demand_factor   NUMERIC(5,2) DEFAULT 100,
  connected_load  NUMERIC(12,2) GENERATED ALWAYS AS (load_value * COALESCE(demand_factor,100) / 100) STORED,
  source          TEXT,
  remarks         TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SLEEVE / OPENING COORDINATION
CREATE TABLE IF NOT EXISTS public.design_mep_sleeve_coordination (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  sleeve_no       TEXT NOT NULL,
  service_type    TEXT NOT NULL CHECK (service_type IN ('mechanical','electrical','plumbing','fire_fighting','elv','hvac','drainage','water_supply','other')),
  size_mm         TEXT,
  location_text   TEXT,
  floor_ref       TEXT,
  structural_ref  TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','coordinated','approved','installed','closed')),
  remarks         TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. MATERIAL SUBMITTAL
CREATE TABLE IF NOT EXISTS public.design_mep_material_submittal (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  submittal_no    TEXT NOT NULL,
  material_name   TEXT NOT NULL,
  sub_discipline  TEXT NOT NULL CHECK (sub_discipline IN ('mechanical','electrical','plumbing','fire_fighting','elv','hvac','drainage','water_supply','power','lighting','communication','security','other')),
  manufacturer    TEXT,
  model_ref       TEXT,
  specification   TEXT,
  shop_drawing_ref TEXT,
  sample_ref      TEXT,
  submitted_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','approved','rejected','alternative_proposed')),
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  remarks         TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. COMMISSIONING DATA
CREATE TABLE IF NOT EXISTS public.design_mep_commissioning (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  system_name     TEXT NOT NULL,
  sub_discipline  TEXT NOT NULL CHECK (sub_discipline IN ('mechanical','electrical','plumbing','fire_fighting','elv','hvac','drainage','water_supply','power','lighting','communication','security','other')),
  equipment_ref   TEXT,
  test_type       TEXT NOT NULL,
  test_date       DATE,
  test_result     TEXT CHECK (test_result IN ('pass','fail','conditional_pass','not_tested')),
  tested_by       TEXT,
  witness_by      TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scheduled','in_progress','passed','failed','closed')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.design_mep_equipment              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_mep_load_schedule           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_mep_sleeve_coordination     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_mep_material_submittal      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_mep_commissioning           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mep_equip_auth" ON public.design_mep_equipment            TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mep_load_auth"  ON public.design_mep_load_schedule        TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mep_slv_auth"   ON public.design_mep_sleeve_coordination  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mep_sub_auth"   ON public.design_mep_material_submittal   TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mep_cms_auth"   ON public.design_mep_commissioning        TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_mep_equip_project ON public.design_mep_equipment(project_id);
CREATE INDEX idx_mep_load_project  ON public.design_mep_load_schedule(project_id);
CREATE INDEX idx_mep_slv_project   ON public.design_mep_sleeve_coordination(project_id);
CREATE INDEX idx_mep_sub_project   ON public.design_mep_material_submittal(project_id);
CREATE INDEX idx_mep_cms_project   ON public.design_mep_commissioning(project_id);
