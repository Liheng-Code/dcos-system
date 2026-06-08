-- QA/QC Module — NCR tables

-- ── Non-Conformance Reports ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ncrs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  inspection_request_id UUID REFERENCES public.inspection_requests(id) ON DELETE SET NULL,
  wbs_node_id           UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  ncr_number            TEXT NOT NULL,
  description           TEXT NOT NULL,
  severity              TEXT NOT NULL DEFAULT 'minor'
                        CHECK (severity IN ('minor', 'major', 'critical')),
  raised_by             UUID REFERENCES auth.users(id),
  raised_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responsible_party     TEXT,
  due_date              DATE,
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN (
                          'open','corrective_action','reinspection','closed','voided'
                        )),
  closed_by             UUID REFERENCES auth.users(id),
  closed_at             TIMESTAMPTZ,
  closure_comment       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── NCR Corrective Actions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ncr_corrective_actions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ncr_id            UUID NOT NULL REFERENCES public.ncrs(id) ON DELETE CASCADE,
  action_description TEXT NOT NULL,
  assigned_to       TEXT,
  due_date          DATE,
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','completed')),
  completed_at      TIMESTAMPTZ,
  completion_note   TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ncrs_project    ON public.ncrs(project_id);
CREATE INDEX IF NOT EXISTS idx_ncrs_status     ON public.ncrs(status);
CREATE INDEX IF NOT EXISTS idx_ncr_actions_ncr ON public.ncr_corrective_actions(ncr_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.ncrs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_corrective_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_ncrs"         ON public.ncrs                   TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_ncr_actions"  ON public.ncr_corrective_actions TO authenticated USING (true) WITH CHECK (true);
