-- Design Module: Structure-specific tables

-- 1. CALCULATION NOTES
CREATE TABLE IF NOT EXISTS public.design_str_calc_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  calc_no         TEXT NOT NULL,
  title           TEXT NOT NULL,
  calc_type       TEXT,
  software        TEXT,
  model_ref       TEXT,
  assumptions     TEXT,
  conclusions     TEXT,
  file_path       TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','revised')),
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. MODEL REGISTER (ETABS/SAFE/SAP/Revit)
CREATE TABLE IF NOT EXISTS public.design_str_model_register (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  model_no        TEXT NOT NULL,
  model_name      TEXT NOT NULL,
  software        TEXT NOT NULL,
  version         TEXT,
  model_file_path TEXT,
  report_file_path TEXT,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revised','superseded','archived')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. REBAR / SHOP DRAWING REVIEW
CREATE TABLE IF NOT EXISTS public.design_str_rebar_review (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  review_no       TEXT NOT NULL,
  drawing_ref     TEXT NOT NULL,
  element_type    TEXT,
  reviewer        TEXT,
  review_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  findings        TEXT,
  status          TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','approved','rejected','re_submitted','closed')),
  rebar_kg        NUMERIC(12,2),
  remarks         TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TECHNICAL QUERIES (site-related structural queries)
CREATE TABLE IF NOT EXISTS public.design_str_technical_queries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  tq_no           TEXT NOT NULL,
  title           TEXT NOT NULL,
  query_text      TEXT NOT NULL,
  response_text   TEXT,
  responded_by    UUID REFERENCES auth.users(id),
  responded_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  due_date        DATE,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. DESIGN CHANGES
CREATE TABLE IF NOT EXISTS public.design_str_design_changes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  change_no       TEXT NOT NULL,
  title           TEXT NOT NULL,
  reason          TEXT NOT NULL,
  original_ref    TEXT,
  description     TEXT,
  impact_scope    TEXT,
  impact_cost     TEXT,
  impact_schedule TEXT,
  approved_by     UUID REFERENCES auth.users(id),
  approved_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','under_review','approved','rejected','implemented','closed')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.design_str_calc_notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_str_model_register       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_str_rebar_review         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_str_technical_queries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_str_design_changes       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "str_calc_auth"   ON public.design_str_calc_notes         TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "str_model_auth"  ON public.design_str_model_register     TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "str_rebar_auth"  ON public.design_str_rebar_review       TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "str_tq_auth"     ON public.design_str_technical_queries  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "str_dc_auth"     ON public.design_str_design_changes     TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_str_calc_project  ON public.design_str_calc_notes(project_id);
CREATE INDEX idx_str_model_project ON public.design_str_model_register(project_id);
CREATE INDEX idx_str_rebar_project ON public.design_str_rebar_review(project_id);
CREATE INDEX idx_str_tq_project    ON public.design_str_technical_queries(project_id);
CREATE INDEX idx_str_dc_project    ON public.design_str_design_changes(project_id);
