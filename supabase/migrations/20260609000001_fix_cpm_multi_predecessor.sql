-- Fix get_critical_path_tasks() to use multi-predecessor arrays (dependency_task_ids[])
-- instead of the old single dependency_task_id column.

CREATE OR REPLACE FUNCTION public.get_critical_path_tasks(p_project_id UUID)
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
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE
  -- Expand multi-predecessor array into rows for easier joining
  deps AS (
    SELECT
      t.id                                                          AS task_id,
      UNNEST(COALESCE(t.dependency_task_ids, ARRAY[]::UUID[]))      AS pred_id,
      UNNEST(COALESCE(t.dependency_types,    ARRAY[]::TEXT[]))      AS dep_type,
      UNNEST(COALESCE(t.dependency_lag_days, ARRAY[]::NUMERIC[]))   AS lag_d
    FROM public.wbs_tasks t
    WHERE t.project_id = p_project_id
  ),

  -- ── Forward pass ─────────────────────────────────────────────────────────
  fwd(task_id, task_code, task_name, early_start, early_finish, dur) AS (
    -- Base: tasks with no predecessors in this project
    SELECT
      t.id,
      t.task_code,
      t.task_name,
      COALESCE(t.start_date, CURRENT_DATE),
      COALESCE(t.end_date,   CURRENT_DATE),
      GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
    FROM public.wbs_tasks t
    WHERE t.project_id = p_project_id
      AND (
        COALESCE(array_length(t.dependency_task_ids, 1), 0) = 0
        OR NOT EXISTS (
          SELECT 1 FROM public.wbs_tasks p2
          WHERE p2.project_id = p_project_id
            AND p2.id = ANY(COALESCE(t.dependency_task_ids, ARRAY[]::UUID[]))
        )
      )

    UNION ALL

    -- Recursive: each task whose predecessor has been computed
    SELECT
      t.id,
      t.task_code,
      t.task_name,
      CASE COALESCE(d.dep_type, 'fs')
        WHEN 'fs' THEN f.early_finish + COALESCE(d.lag_d::INT, 0)
        WHEN 'ss' THEN f.early_start  + COALESCE(d.lag_d::INT, 0)
        WHEN 'ff' THEN f.early_finish + COALESCE(d.lag_d::INT, 0) - GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
        WHEN 'sf' THEN f.early_start  + COALESCE(d.lag_d::INT, 0) - GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
        ELSE f.early_finish
      END,
      CASE COALESCE(d.dep_type, 'fs')
        WHEN 'fs' THEN f.early_finish + COALESCE(d.lag_d::INT, 0) + GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
        WHEN 'ss' THEN f.early_start  + COALESCE(d.lag_d::INT, 0) + GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
        WHEN 'ff' THEN f.early_finish + COALESCE(d.lag_d::INT, 0)
        WHEN 'sf' THEN f.early_start  + COALESCE(d.lag_d::INT, 0)
        ELSE f.early_finish + GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
      END,
      GREATEST(1, COALESCE(t.end_date - t.start_date, 1))
    FROM public.wbs_tasks t
    JOIN deps d ON d.task_id = t.id
    JOIN fwd  f ON f.task_id = d.pred_id
    WHERE t.project_id = p_project_id
  ),

  -- Deduplicate: for each task, keep the row with the LATEST early_finish
  -- (diamond paths produce multiple rows; we take the most constrained)
  fwd_best AS (
    SELECT DISTINCT ON (fw.task_id)
      fw.task_id, fw.task_code, fw.task_name, fw.early_start, fw.early_finish, fw.dur
    FROM fwd fw
    ORDER BY fw.task_id, fw.early_finish DESC
  ),

  -- Network end = latest early_finish across all tasks
  net_end AS (SELECT MAX(fb.early_finish) AS v FROM fwd_best fb),

  -- ── Backward pass ────────────────────────────────────────────────────────
  bwd(task_id, late_start, late_finish) AS (
    -- Base: sink tasks (no successors) → LF = network end
    SELECT
      f.task_id,
      (SELECT v FROM net_end) - f.dur,
      (SELECT v FROM net_end)
    FROM fwd_best f
    WHERE NOT EXISTS (
      SELECT 1 FROM deps d2
      WHERE d2.pred_id = f.task_id
    )

    UNION ALL

    -- Recursive: walk backward through dependency graph
    SELECT
      f.task_id,
      b.late_start - COALESCE(d.lag_d::INT, 0) - f.dur,
      b.late_start - COALESCE(d.lag_d::INT, 0)
    FROM fwd_best f
    JOIN deps     d ON d.pred_id = f.task_id
    JOIN bwd      b ON b.task_id = d.task_id
  ),

  -- Deduplicate: keep minimum late_start per task
  bwd_best AS (
    SELECT bw.task_id,
           MIN(bw.late_start)  AS late_start,
           MIN(bw.late_finish) AS late_finish
    FROM bwd bw
    GROUP BY bw.task_id
  )

  SELECT
    f.task_id,
    f.task_code,
    f.task_name,
    f.early_start,
    f.early_finish,
    b.late_start,
    b.late_finish,
    (b.late_start - f.early_start)::INT AS total_float_days,
    (b.late_start - f.early_start) <= 0 AS is_critical
  FROM fwd_best f
  JOIN bwd_best b ON b.task_id = f.task_id
  ORDER BY f.early_start, f.task_code;
END;
$$;
