-- Migration: 20260928000008_construction_phase_c_holdpoints_backcharges.sql
-- Construction Module Phase C: Quality Hold-Points & Site Back-Charge Linkage
-- 1. Extend subcontract_back_charges with project_id, wbs_task_id, ncr_id, daily_report_id, evidence_photo_url
-- 2. Extend inspection_requests with is_hold_point and step_no
-- 3. RPC: check_task_quality_holdpoints(p_task_ids)

-- ── 1. Extend subcontract_back_charges ──────────────────────────────────────
ALTER TABLE public.subcontract_back_charges
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS wbs_task_id UUID REFERENCES public.wbs_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ncr_id UUID REFERENCES public.ncrs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daily_report_id UUID REFERENCES public.site_daily_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evidence_photo_url TEXT;

-- Backfill project_id from subcontracts
UPDATE public.subcontract_back_charges sbc
SET project_id = sc.project_id
FROM public.subcontracts sc
WHERE sbc.subcontract_id = sc.id AND sbc.project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sub_bc_project ON public.subcontract_back_charges(project_id);
CREATE INDEX IF NOT EXISTS idx_sub_bc_task ON public.subcontract_back_charges(wbs_task_id) WHERE wbs_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sub_bc_ncr ON public.subcontract_back_charges(ncr_id) WHERE ncr_id IS NOT NULL;

-- ── 2. Extend inspection_requests ───────────────────────────────────────────
ALTER TABLE public.inspection_requests
  ADD COLUMN IF NOT EXISTS is_hold_point BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS step_no INTEGER;

CREATE INDEX IF NOT EXISTS idx_inspection_requests_holdpoint
  ON public.inspection_requests(wbs_task_id, is_hold_point) WHERE is_hold_point = true;

-- ── 3. RPC: check_task_quality_holdpoints ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_task_quality_holdpoints(
  p_task_ids UUID[]
)
RETURNS TABLE (
  task_id UUID,
  total_inspections INTEGER,
  passed_inspections INTEGER,
  failed_inspections INTEGER,
  pending_inspections INTEGER,
  open_ncrs INTEGER,
  has_blocking_holdpoint BOOLEAN,
  holdpoint_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH task_list AS (
    SELECT unnest(p_task_ids) AS tid
  ),
  inspections_summary AS (
    SELECT
      ir.wbs_task_id,
      COUNT(*)::INTEGER AS tot,
      COUNT(*) FILTER (WHERE ir.status = 'passed')::INTEGER AS passed,
      COUNT(*) FILTER (WHERE ir.status = 'failed')::INTEGER AS failed,
      COUNT(*) FILTER (WHERE ir.status IN ('draft', 'submitted', 'scheduled', 'inspected'))::INTEGER AS pending,
      BOOL_OR(ir.is_hold_point = true AND ir.status IN ('failed', 'draft', 'submitted', 'scheduled')) AS has_unpassed_holdpoint,
      STRING_AGG(
        CASE
          WHEN ir.status = 'failed' THEN 'Inspection Failed: ' || ir.ir_number
          WHEN ir.is_hold_point AND ir.status <> 'passed' THEN 'Hold Point Pending: ' || ir.ir_number
          ELSE NULL
        END,
        '; '
      ) AS ir_alert
    FROM public.inspection_requests ir
    WHERE ir.wbs_task_id = ANY(p_task_ids)
    GROUP BY ir.wbs_task_id
  ),
  ncr_summary AS (
    -- Count open NCRs linked directly to task (via inspection or wbs_node)
    SELECT
      COALESCE(ir.wbs_task_id, wt.id) AS task_id,
      COUNT(*)::INTEGER AS open_count,
      STRING_AGG(n.ncr_number || ' (' || n.severity || ')', ', ') AS ncr_alert
    FROM public.ncrs n
    LEFT JOIN public.inspection_requests ir ON ir.id = n.inspection_request_id
    LEFT JOIN public.wbs_tasks wt ON wt.wbs_node_id = n.wbs_node_id
    WHERE n.status IN ('open', 'corrective_action', 'reinspection')
      AND (ir.wbs_task_id = ANY(p_task_ids) OR wt.id = ANY(p_task_ids))
    GROUP BY COALESCE(ir.wbs_task_id, wt.id)
  )
  SELECT
    t.tid AS task_id,
    COALESCE(i.tot, 0) AS total_inspections,
    COALESCE(i.passed, 0) AS passed_inspections,
    COALESCE(i.failed, 0) AS failed_inspections,
    COALESCE(i.pending, 0) AS pending_inspections,
    COALESCE(nc.open_count, 0) AS open_ncrs,
    (COALESCE(i.failed, 0) > 0 OR COALESCE(i.has_unpassed_holdpoint, false) OR COALESCE(nc.open_count, 0) > 0) AS has_blocking_holdpoint,
    CONCAT_WS(' | ', i.ir_alert, CASE WHEN nc.open_count > 0 THEN 'Open NCRs: ' || nc.ncr_alert END) AS holdpoint_message
  FROM task_list t
  LEFT JOIN inspections_summary i ON i.wbs_task_id = t.tid
  LEFT JOIN ncr_summary nc ON nc.task_id = t.tid;
END;
$$;
