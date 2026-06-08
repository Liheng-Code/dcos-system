-- Schedule Levels Framework
-- Implements 5-level construction schedule hierarchy:
--   Level 1: Executive / Portfolio
--   Level 2: Master Schedule (phases, milestones)
--   Level 3: Control Schedule (detailed CPM, current default)
--   Level 4: Execution Schedule (work packages)
--   Level 5: Look-ahead (daily/weekly tactical)

-- ── 1. Add schedule_level to wbs_tasks ─────────────────────────────────────────
ALTER TABLE public.wbs_tasks ADD COLUMN IF NOT EXISTS schedule_level INTEGER
  DEFAULT 3
  CHECK (schedule_level BETWEEN 1 AND 5);

-- ── 2. Add schedule_level + is_summary to wbs_nodes ────────────────────────────
ALTER TABLE public.wbs_nodes ADD COLUMN IF NOT EXISTS schedule_level INTEGER
  CHECK (schedule_level BETWEEN 1 AND 5);

ALTER TABLE public.wbs_nodes ADD COLUMN IF NOT EXISTS is_summary BOOLEAN
  DEFAULT false;

-- ── 3. Schedule Levels Config Table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schedule_levels_config (
  level             INTEGER PRIMARY KEY CHECK (level BETWEEN 1 AND 5),
  label             TEXT NOT NULL,
  short_label       TEXT NOT NULL,
  description       TEXT,
  default_zoom      TEXT NOT NULL DEFAULT 'month',
  update_frequency  TEXT NOT NULL DEFAULT 'monthly',
  sort_order        INTEGER NOT NULL DEFAULT 0
);

INSERT INTO public.schedule_levels_config (level, label, short_label, description, default_zoom, update_frequency, sort_order)
VALUES
  (1, 'Executive Schedule',   'Executive',  'Portfolio reporting and high-level oversight',  'month', 'monthly',    1),
  (2, 'Master Schedule',      'Master',     'Complete project overview with phases and milestones', 'month', 'bi-weekly', 2),
  (3, 'Control Schedule',     'Control',    'Granular project control and tracking with CPM', 'week',  'weekly',    3),
  (4, 'Execution Schedule',   'Execution',  'Comprehensive execution planning (work packages)', 'day',  'daily',     4),
  (5, 'Look-ahead Schedule',  'Look-ahead', 'Daily and weekly tactical planning',              'day',  'daily',     5)
ON CONFLICT (level) DO NOTHING;

-- ── 4. RPC: Get tasks filtered by schedule level (with optional rollup) ─────────
CREATE OR REPLACE FUNCTION public.get_tasks_by_level(
  p_project_id  UUID,
  p_level       INTEGER DEFAULT 3
)
RETURNS TABLE (
  id                UUID,
  task_code         TEXT,
  task_name         TEXT,
  discipline        TEXT,
  wbs_node_id       UUID,
  owner_name        TEXT,
  start_date        DATE,
  end_date          DATE,
  progress          NUMERIC,
  status            TEXT,
  delay_status      TEXT,
  priority          TEXT,
  dependency_task_ids UUID[],
  dependency_types  TEXT[],
  dependency_lag_days NUMERIC[],
  is_milestone      BOOLEAN,
  constraint_type   TEXT,
  baseline_start_date DATE,
  baseline_finish_date DATE,
  schedule_level    INTEGER
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    wt.id, wt.task_code, wt.task_name, wt.discipline,
    wt.wbs_node_id, wt.owner_name,
    wt.start_date, wt.end_date, wt.progress,
    wt.status, wt.delay_status, wt.priority,
    wt.dependency_task_ids, wt.dependency_types, wt.dependency_lag_days,
    wt.is_milestone, wt.constraint_type,
    wt.baseline_start_date, wt.baseline_finish_date,
    wt.schedule_level
  FROM public.wbs_tasks wt
  WHERE wt.project_id = p_project_id
    AND wt.schedule_level = p_level
  ORDER BY wt.sort_order, wt.start_date;
$$;

-- ── 5. RPC: Get summary rollup for a schedule level ─────────────────────────────
-- Returns aggregate data grouped by WBS node for the given schedule level.
CREATE OR REPLACE FUNCTION public.get_level_summary(
  p_project_id  UUID,
  p_level       INTEGER DEFAULT 2
)
RETURNS TABLE (
  wbs_node_id     UUID,
  wbs_code        TEXT,
  wbs_name        TEXT,
  parent_id       UUID,
  node_type       TEXT,
  task_count      BIGINT,
  progress        NUMERIC,
  earliest_start  DATE,
  latest_end      DATE,
  delayed_count   BIGINT,
  milestone_count BIGINT,
  total_float_min NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
  WITH level_tasks AS (
    SELECT * FROM public.wbs_tasks
    WHERE project_id = p_project_id
      AND schedule_level = p_level
  ),
  node_agg AS (
    SELECT
      wn.id,
      wn.wbs_code,
      wn.wbs_name,
      wn.parent_id,
      wn.node_type,
      COUNT(lt.id)::BIGINT                                         AS task_count,
      ROUND(AVG(lt.progress), 1)                                   AS progress,
      MIN(lt.start_date)                                           AS earliest_start,
      MAX(lt.end_date)                                             AS latest_end,
      COUNT(lt.id) FILTER (WHERE lt.delay_status IN ('delayed','blocked'))::BIGINT AS delayed_count,
      COUNT(lt.id) FILTER (WHERE lt.is_milestone)::BIGINT          AS milestone_count,
      MIN(lt.id::TEXT)                                             AS dummy_float
    FROM public.wbs_nodes wn
    LEFT JOIN level_tasks lt ON lt.wbs_node_id = wn.id
    WHERE wn.project_id = p_project_id
    GROUP BY wn.id, wn.wbs_code, wn.wbs_name, wn.parent_id, wn.node_type
  )
  SELECT
    na.id          AS wbs_node_id,
    na.wbs_code,
    na.wbs_name,
    na.parent_id,
    na.node_type,
    na.task_count,
    na.progress,
    na.earliest_start,
    na.latest_end,
    na.delayed_count,
    na.milestone_count,
    NULL::NUMERIC  AS total_float_min
  FROM node_agg na
  WHERE na.task_count > 0
  ORDER BY na.wbs_code;
$$;

-- ── 6. RPC: Get portfolio-level schedule (Level 1) ──────────────────────────────
-- Returns project-level aggregate data for executive view.
CREATE OR REPLACE FUNCTION public.get_portfolio_schedule(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  project_id        UUID,
  project_code      TEXT,
  project_name      TEXT,
  project_status    TEXT,
  start_date        DATE,
  end_date          DATE,
  progress          NUMERIC,
  task_count        BIGINT,
  delayed_count     BIGINT,
  milestone_count   BIGINT,
  total_budget      NUMERIC,
  total_actual      NUMERIC,
  spi               NUMERIC,
  cpi               NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
  WITH project_totals AS (
    SELECT
      p.id,
      p.project_code,
      p.project_name,
      p.project_status,
      p.start_date,
      p.end_date,
      p.progress_percentage,
      COUNT(wt.id)::BIGINT                                          AS task_count,
      COUNT(wt.id) FILTER (WHERE wt.delay_status IN ('delayed','blocked'))::BIGINT AS delayed_count,
      COUNT(wt.id) FILTER (WHERE wt.is_milestone)::BIGINT           AS milestone_count,
      COALESCE(SUM(wt.budget_cost), 0)                              AS total_budget,
      COALESCE(SUM(wt.actual_cost), 0)                              AS total_actual
    FROM public.projects p
    LEFT JOIN public.wbs_tasks wt ON wt.project_id = p.id
    WHERE p.project_status IN ('active', 'on_hold')
    GROUP BY p.id, p.project_code, p.project_name, p.project_status, p.start_date, p.end_date, p.progress_percentage
  )
  SELECT
    pt.id               AS project_id,
    pt.project_code,
    pt.project_name,
    pt.project_status,
    pt.start_date,
    pt.end_date,
    pt.progress_percentage AS progress,
    pt.task_count,
    pt.delayed_count,
    pt.milestone_count,
    pt.total_budget,
    pt.total_actual,
    CASE WHEN pt.total_budget > 0
      THEN ROUND((pt.progress_percentage / 100.0) / NULLIF(
        (SELECT COALESCE(SUM(wt2.progress * wt2.budget_cost) / NULLIF(SUM(wt2.budget_cost), 0), 0) / 100.0
        FROM public.wbs_tasks wt2 WHERE wt2.project_id = pt.id), 0), 2)
      ELSE NULL END    AS spi,
    CASE WHEN pt.total_budget > 0
      THEN ROUND(pt.total_budget / NULLIF(pt.total_actual, 0), 2)
      ELSE NULL END    AS cpi
  FROM project_totals pt
  ORDER BY pt.project_code;
$$;

-- ── 7. Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wbs_tasks_schedule_level
  ON public.wbs_tasks(schedule_level);

CREATE INDEX IF NOT EXISTS idx_wbs_nodes_schedule_level
  ON public.wbs_nodes(schedule_level);

-- ── 8. RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.schedule_levels_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_schedule_levels_config"
  ON public.schedule_levels_config
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── 9. Update existing tasks to default schedule_level ──────────────────────────
UPDATE public.wbs_tasks
SET schedule_level = 3
WHERE schedule_level IS NULL;

UPDATE public.wbs_nodes
SET schedule_level = 2
WHERE schedule_level IS NULL AND node_type = 'phase';

UPDATE public.wbs_nodes
SET schedule_level = 3
WHERE schedule_level IS NULL;
