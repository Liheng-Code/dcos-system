-- Module Insight RPCs
-- Returns task status/progress counts grouped by discipline for a given project.
-- SECURITY INVOKER so caller's RLS policies on wbs_tasks apply (tenant isolation).

CREATE OR REPLACE FUNCTION get_module_task_summary(p_project_id UUID)
RETURNS TABLE (
  discipline    TEXT,
  status        TEXT,
  delay_status  TEXT,
  task_count    BIGINT,
  avg_progress  NUMERIC,
  total_budget  NUMERIC,
  total_actual  NUMERIC,
  overdue_count BIGINT
)
LANGUAGE SQL
SECURITY INVOKER
STABLE
AS $$
  SELECT
    COALESCE(discipline, 'Unassigned')          AS discipline,
    status,
    delay_status,
    COUNT(*)                                    AS task_count,
    ROUND(AVG(progress), 1)                     AS avg_progress,
    COALESCE(SUM(budget_cost), 0)               AS total_budget,
    COALESCE(SUM(actual_cost), 0)               AS total_actual,
    COUNT(*) FILTER (
      WHERE end_date < CURRENT_DATE
        AND status NOT IN ('closed', 'completed', 'cancelled')
    )                                           AS overdue_count
  FROM wbs_tasks
  WHERE project_id = p_project_id
  GROUP BY discipline, status, delay_status
$$;

-- Returns approval pipeline counts grouped by discipline for a given project.
CREATE OR REPLACE FUNCTION get_module_approval_summary(p_project_id UUID)
RETURNS TABLE (
  discipline       TEXT,
  pending_review   BIGINT,
  pending_approval BIGINT,
  approved         BIGINT,
  rejected         BIGINT
)
LANGUAGE SQL
SECURITY INVOKER
STABLE
AS $$
  SELECT
    COALESCE(discipline, 'Unassigned')                          AS discipline,
    COUNT(*) FILTER (WHERE status = 'review')                   AS pending_review,
    COUNT(*) FILTER (WHERE status = 'submitted')                AS pending_approval,
    COUNT(*) FILTER (WHERE status IN ('closed', 'completed'))   AS approved,
    COUNT(*) FILTER (WHERE status IN ('cancelled', 'rejected')) AS rejected
  FROM wbs_tasks
  WHERE project_id = p_project_id
  GROUP BY discipline
$$;
