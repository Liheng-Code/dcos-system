-- Schedule RPCs for Module 11 — Planning & Scheduling
-- All functions use SECURITY INVOKER so tenant RLS on wbs_tasks applies.

-- ─── 1. Set Project Baseline ──────────────────────────────────────────────────
-- Copies start_date / end_date → baseline_* fields for every scheduled task in
-- a project. Only overwrites tasks that have both dates set.
CREATE OR REPLACE FUNCTION set_project_baseline(p_project_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY INVOKER
AS $$
  UPDATE public.wbs_tasks
  SET
    baseline_start_date  = start_date,
    baseline_finish_date = end_date,
    baseline_set_at      = NOW(),
    baseline_set_by      = auth.uid()
  WHERE project_id = p_project_id
    AND start_date  IS NOT NULL
    AND end_date    IS NOT NULL;
$$;

-- ─── 2. Schedule Variance per Task ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_schedule_variance(p_project_id UUID)
RETURNS TABLE (
  task_id              UUID,
  task_code            TEXT,
  task_name            TEXT,
  discipline           TEXT,
  planned_start        DATE,
  planned_finish       DATE,
  baseline_start       DATE,
  baseline_finish      DATE,
  start_variance_days  INT,
  finish_variance_days INT,
  is_delayed           BOOLEAN
)
LANGUAGE SQL
SECURITY INVOKER
STABLE
AS $$
  SELECT
    id,
    task_code,
    task_name,
    discipline,
    start_date                                 AS planned_start,
    end_date                                   AS planned_finish,
    baseline_start_date                        AS baseline_start,
    baseline_finish_date                       AS baseline_finish,
    (start_date - baseline_start_date)::INT    AS start_variance_days,
    (end_date   - baseline_finish_date)::INT   AS finish_variance_days,
    end_date > baseline_finish_date            AS is_delayed
  FROM public.wbs_tasks
  WHERE project_id         = p_project_id
    AND baseline_start_date  IS NOT NULL
    AND baseline_finish_date IS NOT NULL
    AND start_date           IS NOT NULL
    AND end_date             IS NOT NULL
  ORDER BY finish_variance_days DESC NULLS LAST
$$;

-- ─── 3. Look-ahead Tasks ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_lookahead_tasks(p_project_id UUID, p_weeks INT DEFAULT 4)
RETURNS TABLE (
  task_id       UUID,
  task_code     TEXT,
  task_name     TEXT,
  discipline    TEXT,
  owner_name    TEXT,
  start_date    DATE,
  end_date      DATE,
  progress      NUMERIC,
  status        TEXT,
  delay_status  TEXT,
  priority      TEXT
)
LANGUAGE SQL
SECURITY INVOKER
STABLE
AS $$
  SELECT
    id           AS task_id,
    task_code,
    task_name,
    discipline,
    owner_name,
    start_date,
    end_date,
    progress,
    status,
    delay_status,
    priority
  FROM public.wbs_tasks
  WHERE project_id = p_project_id
    AND start_date IS NOT NULL
    AND start_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (p_weeks::INT * 7)
    AND status NOT IN ('closed', 'completed', 'cancelled')
  ORDER BY start_date, task_code
$$;

-- ─── 4. CPM Critical Path (Forward + Backward Pass) ───────────────────────────
-- Implements full CPM using recursive CTEs:
--   Forward pass  → earliest start/finish per task
--   Backward pass → latest start/finish per task
--   Float         → late_start - early_start
--   Critical      → float <= 0
--
-- Supports FS, SS, FF, SF dependency types and lag_days.
-- Only one predecessor per task is supported (single dependency_task_id).
CREATE OR REPLACE FUNCTION get_critical_path_tasks(p_project_id UUID)
RETURNS TABLE (
  id               UUID,
  task_code        TEXT,
  task_name        TEXT,
  early_start      DATE,
  early_finish     DATE,
  late_start       DATE,
  late_finish      DATE,
  total_float_days INT,
  is_critical      BOOLEAN
)
LANGUAGE SQL
SECURITY INVOKER
AS $$
  WITH RECURSIVE
  -- ── Forward pass ─────────────────────────────────────────────────────────
  fwd(task_id, task_code, task_name, early_start, early_finish, dur) AS (
    -- Base: tasks whose predecessor is not in this project (or no predecessor)
    SELECT
      t.id,
      t.task_code,
      t.task_name,
      COALESCE(t.start_date, CURRENT_DATE),
      COALESCE(t.end_date,   CURRENT_DATE),
      GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
    FROM public.wbs_tasks t
    WHERE t.project_id = p_project_id
      AND (t.dependency_task_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM public.wbs_tasks p2
          WHERE p2.id = t.dependency_task_id AND p2.project_id = p_project_id
        ))

    UNION ALL

    -- Recursive: tasks whose predecessor has been computed
    SELECT
      t.id,
      t.task_code,
      t.task_name,
      -- Early start based on dependency type
      CASE COALESCE(t.dependency_type, 'fs')
        WHEN 'fs' THEN f.early_finish + COALESCE((t.lag_days)::INT, 0)
        WHEN 'ss' THEN f.early_start  + COALESCE((t.lag_days)::INT, 0)
        WHEN 'ff' THEN f.early_finish + COALESCE((t.lag_days)::INT, 0)
                       - GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
        WHEN 'sf' THEN f.early_start  + COALESCE((t.lag_days)::INT, 0)
                       - GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
        ELSE f.early_finish
      END,
      -- Early finish
      CASE COALESCE(t.dependency_type, 'fs')
        WHEN 'fs' THEN f.early_finish + COALESCE((t.lag_days)::INT, 0)
                       + GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
        WHEN 'ss' THEN f.early_start  + COALESCE((t.lag_days)::INT, 0)
                       + GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
        WHEN 'ff' THEN f.early_finish + COALESCE((t.lag_days)::INT, 0)
        WHEN 'sf' THEN f.early_start  + COALESCE((t.lag_days)::INT, 0)
        ELSE f.early_finish + GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
      END,
      GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
    FROM public.wbs_tasks t
    JOIN fwd f ON t.dependency_task_id = f.task_id
    WHERE t.project_id = p_project_id
  ),
  -- Deduplicate: keep the latest early_finish per task (handles diamond paths)
  fwd_best AS (
    SELECT DISTINCT ON (task_id)
      task_id, task_code, task_name, early_start, early_finish, dur
    FROM fwd
    ORDER BY task_id, early_finish DESC
  ),
  -- Network end = latest early_finish across all tasks
  net_end AS (SELECT MAX(early_finish) AS v FROM fwd_best),
  -- ── Backward pass ────────────────────────────────────────────────────────
  bwd(task_id, late_start, late_finish) AS (
    -- Base: sink tasks (nothing depends on them) → LF = network end
    SELECT
      f.task_id,
      (SELECT v FROM net_end) - f.dur,
      (SELECT v FROM net_end)
    FROM fwd_best f
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wbs_tasks s
      WHERE s.dependency_task_id = f.task_id AND s.project_id = p_project_id
    )

    UNION ALL

    -- Recursive: walk backward through the dependency graph
    SELECT
      f.task_id,
      b.late_start - COALESCE((succ.lag_days)::INT, 0) - f.dur,
      b.late_start - COALESCE((succ.lag_days)::INT, 0)
    FROM fwd_best f
    JOIN public.wbs_tasks succ
      ON succ.dependency_task_id = f.task_id AND succ.project_id = p_project_id
    JOIN bwd b ON b.task_id = succ.id
  ),
  -- Deduplicate: keep the minimum late_start per task
  bwd_best AS (
    SELECT task_id,
           MIN(late_start)  AS late_start,
           MIN(late_finish) AS late_finish
    FROM bwd
    GROUP BY task_id
  )
  SELECT
    f.task_id,
    f.task_code,
    f.task_name,
    f.early_start,
    f.early_finish,
    b.late_start,
    b.late_finish,
    (b.late_start - f.early_start)::INT  AS total_float_days,
    (b.late_start - f.early_start) <= 0  AS is_critical
  FROM fwd_best f
  JOIN bwd_best b ON b.task_id = f.task_id
  ORDER BY f.early_start, f.task_code
$$;
