-- Design Module: Architecture-specific tables

-- 1. ROOM DATA SHEETS
CREATE TABLE IF NOT EXISTS public.design_arc_room_data (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  room_no         TEXT NOT NULL,
  room_name       TEXT NOT NULL,
  level           TEXT,
  area_sqm        NUMERIC(10,2),
  floor_finish    TEXT,
  wall_finish     TEXT,
  ceiling_finish  TEXT,
  base_type       TEXT,
  door_type       TEXT,
  window_type     TEXT,
  lighting_notes  TEXT,
  power_notes     TEXT,
  hvac_notes      TEXT,
  plumbing_notes  TEXT,
  ff_e_notes      TEXT,
  special_require TEXT,
  remarks         TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','revised')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. DOOR SCHEDULE
CREATE TABLE IF NOT EXISTS public.design_arc_door_schedule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  door_no         TEXT NOT NULL,
  door_type       TEXT,
  width_mm        NUMERIC(6,1),
  height_mm       NUMERIC(6,1),
  thickness_mm    NUMERIC(6,1),
  material        TEXT,
  finish          TEXT,
  hardware_set    TEXT,
  fire_rating     TEXT,
  acoustic_rating TEXT,
  remarks         TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','revised')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. WINDOW SCHEDULE
CREATE TABLE IF NOT EXISTS public.design_arc_window_schedule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  window_no       TEXT NOT NULL,
  window_type     TEXT,
  width_mm        NUMERIC(6,1),
  height_mm       NUMERIC(6,1),
  frame_material  TEXT,
  glass_type      TEXT,
  finish          TEXT,
  hardware_set    TEXT,
  remarks         TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','revised')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. FINISH SCHEDULE
CREATE TABLE IF NOT EXISTS public.design_arc_finish_schedule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  location        TEXT NOT NULL,
  element         TEXT NOT NULL CHECK (element IN ('floor','wall','ceiling','base','other')),
  finish_material TEXT NOT NULL,
  finish_code     TEXT,
  color           TEXT,
  brand           TEXT,
  remarks         TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','revised')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. MATERIAL APPROVAL
CREATE TABLE IF NOT EXISTS public.design_arc_material_approval (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  material_name   TEXT NOT NULL,
  category        TEXT,
  manufacturer    TEXT,
  brand           TEXT,
  model_ref       TEXT,
  sample_ref      TEXT,
  specification   TEXT,
  supplier        TEXT,
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

-- RLS
ALTER TABLE public.design_arc_room_data         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_arc_door_schedule     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_arc_window_schedule   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_arc_finish_schedule   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_arc_material_approval ENABLE ROW LEVEL SECURITY;

CREATE POLICY "design_arc_room_auth"  ON public.design_arc_room_data         TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "design_arc_door_auth"  ON public.design_arc_door_schedule     TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "design_arc_win_auth"   ON public.design_arc_window_schedule   TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "design_arc_fin_auth"   ON public.design_arc_finish_schedule   TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "design_arc_mat_auth"   ON public.design_arc_material_approval TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_arc_room_project ON public.design_arc_room_data(project_id);
CREATE INDEX idx_arc_door_project ON public.design_arc_door_schedule(project_id);
CREATE INDEX idx_arc_win_project  ON public.design_arc_window_schedule(project_id);
CREATE INDEX idx_arc_fin_project  ON public.design_arc_finish_schedule(project_id);
CREATE INDEX idx_arc_mat_project  ON public.design_arc_material_approval(project_id);
