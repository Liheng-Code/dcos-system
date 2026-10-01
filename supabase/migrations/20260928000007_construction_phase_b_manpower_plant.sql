-- Migration: 20260928000007_construction_phase_b_manpower_plant.sql
-- Construction Module Phase B: Manpower Variance & Plant Standby Intelligence
-- 1. Extend site_manpower with subcontract_id, daily_report_id, wbs_task_id, planned_workers
-- 2. Extend site_equipment with standby/breakdown hours, hourly cost, ownership, delay linkage
-- 3. RPC: get_site_manpower_variance(p_project_id, p_date)
-- 4. RPC: push_equipment_standby_to_delay(p_equipment_id)

-- ── 1. Extend site_manpower ─────────────────────────────────────────────────
ALTER TABLE public.site_manpower
  ADD COLUMN IF NOT EXISTS subcontract_id UUID REFERENCES public.subcontracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daily_report_id UUID REFERENCES public.site_daily_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wbs_task_id UUID REFERENCES public.wbs_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_resource_id UUID REFERENCES public.plan_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planned_workers INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_site_manpower_subcontract ON public.site_manpower(subcontract_id) WHERE subcontract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_manpower_report ON public.site_manpower(daily_report_id) WHERE daily_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_manpower_task ON public.site_manpower(wbs_task_id) WHERE wbs_task_id IS NOT NULL;

-- ── 2. Extend site_equipment ────────────────────────────────────────────────
ALTER TABLE public.site_equipment
  ADD COLUMN IF NOT EXISTS daily_report_id UUID REFERENCES public.site_daily_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wbs_task_id UUID REFERENCES public.wbs_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ownership_type TEXT DEFAULT 'hired'
    CHECK (ownership_type IN ('owned', 'hired', 'subcontractor')),
  ADD COLUMN IF NOT EXISTS hours_standby NUMERIC(6,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hours_breakdown NUMERIC(6,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS standby_reason TEXT,
  ADD COLUMN IF NOT EXISTS hourly_cost_rate NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delay_event_id UUID REFERENCES public.delay_register(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_site_equipment_delay ON public.site_equipment(delay_event_id) WHERE delay_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_equipment_report ON public.site_equipment(daily_report_id) WHERE daily_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_equipment_task ON public.site_equipment(wbs_task_id) WHERE wbs_task_id IS NOT NULL;

-- ── 3. RPC: get_site_manpower_variance ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_site_manpower_variance(
  p_project_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  trade TEXT,
  contractor TEXT,
  actual_workers INTEGER,
  planned_workers INTEGER,
  variance INTEGER,
  mobilization_pct NUMERIC,
  status TEXT,
  regular_hours NUMERIC,
  ot_hours NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH actuals AS (
    SELECT
      sm.trade,
      COALESCE(sc.subcontract_no || ' (' || sm.contractor || ')', sm.contractor, 'Direct Labor') AS contractor_name,
      SUM(sm.total_workers)::INTEGER AS total_actual,
      SUM(COALESCE(sm.planned_workers, 0))::INTEGER AS explicit_planned,
      SUM(COALESCE(sm.regular_hours, 0)) AS tot_reg_hrs,
      SUM(COALESCE(sm.ot_hours, 0)) AS tot_ot_hrs
    FROM public.site_manpower sm
    LEFT JOIN public.subcontracts sc ON sc.id = sm.subcontract_id
    WHERE sm.project_id = p_project_id
      AND sm.report_date = p_date
    GROUP BY sm.trade, contractor_name
  ),
  planned_allocations AS (
    -- Dynamically estimate planned trade strength from active plan_task_assignments if explicit_planned is 0
    SELECT
      pr.name AS trade_name,
      COUNT(DISTINCT pta.task_id)::INTEGER AS active_tasks_count
    FROM public.plan_task_assignments pta
    JOIN public.plan_resources pr ON pr.id = pta.resource_id
    JOIN public.wbs_tasks wt ON wt.id = pta.task_id
    WHERE pr.project_id = p_project_id
      AND pr.resource_type = 'labor'
      AND p_date BETWEEN wt.start_date AND wt.end_date
      AND wt.status IN ('open', 'in_progress')
    GROUP BY pr.name
  )
  SELECT
    a.trade,
    a.contractor_name AS contractor,
    a.total_actual AS actual_workers,
    GREATEST(a.explicit_planned, COALESCE(pa.active_tasks_count, 0)) AS planned_workers,
    (a.total_actual - GREATEST(a.explicit_planned, COALESCE(pa.active_tasks_count, 0)))::INTEGER AS variance,
    CASE
      WHEN GREATEST(a.explicit_planned, COALESCE(pa.active_tasks_count, 0)) > 0 THEN
        ROUND((a.total_actual::NUMERIC / GREATEST(a.explicit_planned, COALESCE(pa.active_tasks_count, 0))::NUMERIC) * 100, 1)
      ELSE 100.0
    END AS mobilization_pct,
    CASE
      WHEN GREATEST(a.explicit_planned, COALESCE(pa.active_tasks_count, 0)) = 0 THEN 'balanced'
      WHEN a.total_actual < GREATEST(a.explicit_planned, COALESCE(pa.active_tasks_count, 0)) THEN 'under_mobilized'
      WHEN a.total_actual > GREATEST(a.explicit_planned, COALESCE(pa.active_tasks_count, 0)) THEN 'surplus'
      ELSE 'balanced'
    END AS status,
    a.tot_reg_hrs AS regular_hours,
    a.tot_ot_hrs AS ot_hours
  FROM actuals a
  LEFT JOIN planned_allocations pa ON lower(pa.trade_name) = lower(a.trade)
  ORDER BY variance ASC, a.trade ASC;
END;
$$;

-- ── 4. RPC: push_equipment_standby_to_delay ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_equipment_standby_to_delay(
  p_equipment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eq          RECORD;
  v_delay_id    UUID;
  v_total_cost  NUMERIC;
BEGIN
  SELECT * INTO v_eq
  FROM public.site_equipment
  WHERE id = p_equipment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Equipment record not found');
  END IF;

  IF COALESCE(v_eq.hours_standby, 0) <= 0 AND COALESCE(v_eq.hours_breakdown, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No standby or breakdown hours recorded for this equipment');
  END IF;

  IF v_eq.delay_event_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delay event is already registered for this equipment record', 'delay_id', v_eq.delay_event_id);
  END IF;

  v_total_cost := (COALESCE(v_eq.hours_standby, 0) + COALESCE(v_eq.hours_breakdown, 0)) * COALESCE(v_eq.hourly_cost_rate, 0);

  INSERT INTO public.delay_register (
    project_id,
    wbs_task_id,
    description,
    delay_type,
    cause,
    responsible_party,
    start_date,
    status,
    notes,
    created_by
  ) VALUES (
    v_eq.project_id,
    v_eq.wbs_task_id,
    'Plant Downtime: ' || v_eq.equipment_name || ' (' || (COALESCE(v_eq.hours_standby, 0) + COALESCE(v_eq.hours_breakdown, 0)) || ' hrs lost)',
    CASE WHEN v_eq.hours_standby > 0 THEN 'excusable' ELSE 'non_excusable' END,
    'equipment',
    COALESCE(v_eq.operator, v_eq.ownership_type),
    v_eq.date,
    'open',
    'Logged from Site Equipment log on ' || v_eq.date::text || '. Standby: ' || COALESCE(v_eq.hours_standby, 0) || ' hrs, Breakdown: ' || COALESCE(v_eq.hours_breakdown, 0) || ' hrs. Reason: ' || COALESCE(v_eq.standby_reason, 'Plant stoppage') || '. Cost impact: ' || v_total_cost || '.',
    auth.uid()
  )
  RETURNING id INTO v_delay_id;

  -- Link back
  UPDATE public.site_equipment
  SET delay_event_id = v_delay_id
  WHERE id = p_equipment_id;

  RETURN jsonb_build_object(
    'success', true,
    'delay_id', v_delay_id,
    'cost_impact', v_total_cost
  );
END;
$$;
