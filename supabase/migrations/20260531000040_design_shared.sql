-- Design Module: Shared cross-discipline tables

-- 1. DESIGN DRAWINGS (unified register with discipline discriminator)
CREATE TABLE IF NOT EXISTS public.design_drawings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  discipline      TEXT NOT NULL CHECK (discipline IN ('arc','str','mep')),
  drawing_no      TEXT NOT NULL,
  title           TEXT NOT NULL,
  revision        TEXT NOT NULL DEFAULT 'R00',
  drawing_type    TEXT,
  scale           TEXT,
  sheet_size      TEXT,
  file_path       TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','under_review','approved','rejected','ifc','superseded','archived')),
  description     TEXT,
  remarks         TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. DESIGN RFI (shared across all disciplines)
CREATE TABLE IF NOT EXISTS public.design_rfi (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  discipline      TEXT NOT NULL CHECK (discipline IN ('arc','str','mep','all')),
  rfi_no          TEXT NOT NULL,
  title           TEXT NOT NULL,
  question        TEXT NOT NULL,
  response        TEXT,
  responded_by    UUID REFERENCES auth.users(id),
  responded_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','answered','closed','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','critical')),
  due_date        DATE,
  assigned_to     UUID REFERENCES auth.users(id),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. DESIGN REVIEW COMMENTS
CREATE TABLE IF NOT EXISTS public.design_review_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  discipline      TEXT NOT NULL CHECK (discipline IN ('arc','str','mep','all')),
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  comment         TEXT NOT NULL,
  comment_type    TEXT NOT NULL DEFAULT 'general'
    CHECK (comment_type IN ('general','internal_review','client_review','coordination','approval')),
  resolved        BOOLEAN NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. DESIGN COORDINATION LOG (cross-discipline coordination)
CREATE TABLE IF NOT EXISTS public.design_coordination_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  discipline_from TEXT NOT NULL CHECK (discipline_from IN ('arc','str','mep')),
  discipline_to   TEXT NOT NULL CHECK (discipline_to IN ('arc','str','mep')),
  subject         TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','critical')),
  due_date        DATE,
  resolved_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.design_drawings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_rfi               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_review_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_coordination_log  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "design_draw_auth"  ON public.design_drawings         TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "design_rfi_auth"   ON public.design_rfi              TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "design_rev_auth"   ON public.design_review_comments  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "design_coord_auth" ON public.design_coordination_log TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_design_draw_project   ON public.design_drawings(project_id);
CREATE INDEX idx_design_draw_discipline ON public.design_drawings(discipline);
CREATE INDEX idx_design_draw_status    ON public.design_drawings(status);
CREATE INDEX idx_design_rfi_project    ON public.design_rfi(project_id);
CREATE INDEX idx_design_rfi_discipline ON public.design_rfi(discipline);
CREATE INDEX idx_design_rfi_status     ON public.design_rfi(status);
CREATE INDEX idx_design_rev_entity     ON public.design_review_comments(entity_type, entity_id);
CREATE INDEX idx_design_coord_project  ON public.design_coordination_log(project_id);
