-- QA/QC Module — Phase 1
-- Tables: itps, itp_items, inspection_requests, inspection_results

-- ── Inspection and Test Plans ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.itps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id  UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  discipline   TEXT,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'active', 'closed')),
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ITP Items (checklist rows inside an ITP) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.itp_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itp_id               UUID NOT NULL REFERENCES public.itps(id) ON DELETE CASCADE,
  seq                  INTEGER NOT NULL DEFAULT 0,
  activity             TEXT NOT NULL,
  inspection_type      TEXT NOT NULL DEFAULT 'review'
                       CHECK (inspection_type IN ('hold', 'witness', 'review')),
  responsible_party    TEXT,
  acceptance_criteria  TEXT,
  document_reference   TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Inspection Requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inspection_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  itp_id           UUID REFERENCES public.itps(id) ON DELETE SET NULL,
  wbs_node_id      UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  wbs_task_id      UUID REFERENCES public.wbs_tasks(id) ON DELETE SET NULL,
  ir_number        TEXT NOT NULL,
  location         TEXT,
  requested_by     UUID REFERENCES auth.users(id),
  request_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  inspection_date  DATE,
  inspector_name   TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN (
                     'draft','submitted','scheduled','inspected','passed','failed','closed'
                   )),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Inspection Results (one row per ITP item per IR) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.inspection_results (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_request_id  UUID NOT NULL REFERENCES public.inspection_requests(id) ON DELETE CASCADE,
  itp_item_id            UUID NOT NULL REFERENCES public.itp_items(id) ON DELETE CASCADE,
  result                 TEXT CHECK (result IN ('pass','fail','na','pending')),
  remark                 TEXT,
  recorded_by            UUID REFERENCES auth.users(id),
  recorded_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (inspection_request_id, itp_item_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_itps_project             ON public.itps(project_id);
CREATE INDEX IF NOT EXISTS idx_itp_items_itp            ON public.itp_items(itp_id, seq);
CREATE INDEX IF NOT EXISTS idx_inspection_req_project   ON public.inspection_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_inspection_req_itp       ON public.inspection_requests(itp_id);
CREATE INDEX IF NOT EXISTS idx_inspection_results_req   ON public.inspection_results(inspection_request_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.itps               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itp_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_results  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_itps"                ON public.itps               TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_itp_items"           ON public.itp_items          TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_inspection_requests" ON public.inspection_requests TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_inspection_results"  ON public.inspection_results  TO authenticated USING (true) WITH CHECK (true);
