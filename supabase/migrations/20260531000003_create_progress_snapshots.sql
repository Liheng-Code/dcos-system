-- Progress snapshots for S-curve and EVM reporting.
-- One row per project (or WBS node) per day; captures planned vs actual progress and cost.
CREATE TABLE IF NOT EXISTS public.progress_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id      UUID REFERENCES public.wbs_nodes(id) ON DELETE SET NULL,
  snapshot_date    DATE NOT NULL,
  planned_progress NUMERIC,
  actual_progress  NUMERIC,
  planned_cost     NUMERIC,
  actual_cost      NUMERIC,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_progress_snapshots_project_date
  ON public.progress_snapshots(project_id, snapshot_date);

ALTER TABLE public.progress_snapshots ENABLE ROW LEVEL SECURITY;

-- Policy uses project_team_members joined via project_stakeholder_team_id
-- (omitted; table doesn't have direct project_id column. Will be added separately.)
