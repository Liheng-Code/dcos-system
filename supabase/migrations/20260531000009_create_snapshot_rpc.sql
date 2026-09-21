-- Add unique constraint to support upsert in capture_progress_snapshot.
ALTER TABLE public.progress_snapshots
  ADD CONSTRAINT uq_progress_snapshots_project_date
  UNIQUE (project_id, snapshot_date);

-- RPC: Capture a progress snapshot for a project (on-demand).
-- Computes:
--   actual_progress  = budget-weighted average of current task progress
--   planned_progress = time-linear interpolation using baseline start/finish dates
--   actual_cost      = sum of actual_cost from all tasks
--   planned_cost     = budget pro-rated by elapsed baseline time
-- Upserts: running again on the same day overwrites the earlier snapshot.
CREATE OR REPLACE FUNCTION capture_progress_snapshot(p_project_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id           UUID;
  v_actual_prog  NUMERIC;
  v_planned_prog NUMERIC;
  v_actual_cost  NUMERIC;
  v_planned_cost NUMERIC;
BEGIN
  -- Actual: budget-weighted progress
  SELECT
    ROUND(CASE
      WHEN SUM(COALESCE(budget_cost, 0)) > 0
        THEN SUM(COALESCE(budget_cost, 0) * progress / 100.0)
             / SUM(COALESCE(budget_cost, 0)) * 100
      ELSE AVG(progress)
    END, 1),
    COALESCE(SUM(COALESCE(actual_cost, 0)), 0)
  INTO v_actual_prog, v_actual_cost
  FROM public.wbs_tasks
  WHERE project_id = p_project_id;

  -- Planned: time-linear interpolation over baseline window
  SELECT
    ROUND(CASE
      WHEN SUM(COALESCE(budget_cost, 0)) > 0
        THEN SUM(COALESCE(budget_cost, 0) *
               CASE
                 WHEN baseline_start_date  IS NULL
                   OR baseline_finish_date IS NULL             THEN 0
                 WHEN CURRENT_DATE >= baseline_finish_date     THEN 1
                 WHEN CURRENT_DATE <= baseline_start_date      THEN 0
                 ELSE EXTRACT(EPOCH FROM ((CURRENT_DATE - baseline_start_date)
                                        * INTERVAL '1 day'))
                      / NULLIF(EXTRACT(EPOCH FROM
                          ((baseline_finish_date - baseline_start_date)
                           * INTERVAL '1 day')), 0)
               END
             ) / SUM(COALESCE(budget_cost, 0)) * 100
      ELSE 0
    END, 1),
    COALESCE(SUM(COALESCE(budget_cost, 0) *
      CASE
        WHEN baseline_start_date  IS NULL
          OR baseline_finish_date IS NULL             THEN 0
        WHEN CURRENT_DATE >= baseline_finish_date     THEN 1
        WHEN CURRENT_DATE <= baseline_start_date      THEN 0
        ELSE EXTRACT(EPOCH FROM ((CURRENT_DATE - baseline_start_date)
                                * INTERVAL '1 day'))
             / NULLIF(EXTRACT(EPOCH FROM
                 ((baseline_finish_date - baseline_start_date)
                  * INTERVAL '1 day')), 0)
      END
    ), 0)
  INTO v_planned_prog, v_planned_cost
  FROM public.wbs_tasks
  WHERE project_id = p_project_id;

  INSERT INTO public.progress_snapshots
    (project_id, snapshot_date, planned_progress, actual_progress,
     planned_cost, actual_cost, created_by)
  VALUES
    (p_project_id, CURRENT_DATE,
     v_planned_prog, v_actual_prog, v_planned_cost, v_actual_cost, auth.uid())
  ON CONFLICT (project_id, snapshot_date) DO UPDATE
    SET planned_progress = EXCLUDED.planned_progress,
        actual_progress  = EXCLUDED.actual_progress,
        planned_cost     = EXCLUDED.planned_cost,
        actual_cost      = EXCLUDED.actual_cost
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
