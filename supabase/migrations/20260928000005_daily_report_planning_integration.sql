-- Migration: 20260928000004_daily_report_planning_integration.sql
-- Purpose: Daily Reports to Planning Activity Integration (Phase 1)
--          1. Extends public.site_daily_reports with status, submission metadata, and counters.
--          2. Creates public.site_daily_report_activities linking schedule activities (public.wbs_tasks)
--             to daily site reports, capturing physical progress, actual dates, activity steps,
--             output quantities, manpower/hours, and delay notifications.
--          3. Links site daily report activities to public.plan_productivity_logs,
--             public.wbs_task_progress_reviews, and public.delay_register.
--          4. Creates sync_daily_report_to_planning() RPC to push progress, productivity,
--             and delays into the planning engine.
--          5. Creates get_daily_report_planning_context() and get_task_site_diary_history() RPCs.
--
-- Depends on:
--   public.site_daily_reports (20260531000044_site_execution.sql)
--   public.wbs_tasks (20260527000016_create_wbs_enterprise_tables.sql)
--   public.wbs_task_steps (20260918000001_activity_step_templates.sql)
--   public.wbs_task_progress_reviews / submit_progress() (20260919000009_progress_review.sql)
--   public.plan_productivity_logs (20260922000011_plan_productivity_logs.sql)
--   public.delay_register (20260609000002_delay_register.sql, 20260919000011_delay_governance.sql)
--   public.is_project_member() (20260919000001_project_members_and_permission_helpers.sql)

-- ── 1. Extend site_daily_reports ─────────────────────────────────────────────
ALTER TABLE public.site_daily_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'verified_by_pm', 'closed')),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activities_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_manpower_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.site_daily_reports.status IS
  'Lifecycle state: draft (editable on site), submitted (synced to Planning / review queue), verified_by_pm (approved by project manager), closed.';

-- ── 2. Create site_daily_report_activities ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_daily_report_activities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_report_id       UUID NOT NULL REFERENCES public.site_daily_reports(id) ON DELETE CASCADE,
  project_id            UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id               UUID NOT NULL REFERENCES public.wbs_tasks(id) ON DELETE CASCADE,

  -- Activity execution status and progress
  activity_status       TEXT NOT NULL DEFAULT 'in_progress'
                        CHECK (activity_status IN ('not_started', 'in_progress', 'completed', 'hindered', 'stopped')),
  progress_before       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_before BETWEEN 0 AND 100),
  progress_today        NUMERIC(5,2) NOT NULL CHECK (progress_today BETWEEN 0 AND 100),
  actual_start_date     DATE,
  actual_finish_date    DATE,

  -- Step progress snapshot (array of { step_id, step_name, step_no, progress, is_completed })
  step_progress         JSONB DEFAULT '[]'::jsonb,

  -- Productivity and output
  trade_code            TEXT,
  headcount             INTEGER CHECK (headcount IS NULL OR headcount > 0),
  hours_normal          NUMERIC(5,2) DEFAULT 0 CHECK (hours_normal >= 0),
  hours_ot              NUMERIC(5,2) DEFAULT 0 CHECK (hours_ot >= 0),
  quantity_done         NUMERIC(12,4) CHECK (quantity_done IS NULL OR quantity_done >= 0),
  quantity_unit         TEXT,

  -- Observations and site delays
  work_description      TEXT,
  has_delay             BOOLEAN NOT NULL DEFAULT FALSE,
  delay_reason          TEXT,
  delay_hours_lost      NUMERIC(4,1) DEFAULT 0 CHECK (delay_hours_lost >= 0),
  delay_category        TEXT CHECK (delay_category IS NULL OR delay_category IN ('weather', 'material', 'labor', 'subcontractor', 'rfi_design', 'client', 'safety', 'other')),

  -- Foreign references to planning modules
  progress_review_id    UUID REFERENCES public.wbs_task_progress_reviews(id) ON DELETE SET NULL,
  productivity_log_id   UUID REFERENCES public.plan_productivity_logs(id) ON DELETE SET NULL,
  delay_event_id        UUID REFERENCES public.delay_register(id) ON DELETE SET NULL,

  -- Sync state
  sync_status           TEXT NOT NULL DEFAULT 'draft'
                        CHECK (sync_status IN ('draft', 'synced', 'pending_approval', 'approved', 'rejected')),
  sync_error            TEXT,

  created_by            UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_site_daily_report_task UNIQUE (daily_report_id, task_id)
);

COMMENT ON TABLE public.site_daily_report_activities IS
  'Daily activity progress, output quantities, manpower hours, and delays reported from site execution for individual schedule activities (wbs_tasks). Synchronized to Planning Module.';

CREATE INDEX IF NOT EXISTS idx_site_dr_act_report ON public.site_daily_report_activities(daily_report_id);
CREATE INDEX IF NOT EXISTS idx_site_dr_act_task ON public.site_daily_report_activities(task_id);
CREATE INDEX IF NOT EXISTS idx_site_dr_act_project ON public.site_daily_report_activities(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_site_dr_act_review ON public.site_daily_report_activities(progress_review_id) WHERE progress_review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_dr_act_prod ON public.site_daily_report_activities(productivity_log_id) WHERE productivity_log_id IS NOT NULL;

-- ── 3. Extend reverse linkages ──────────────────────────────────────────────
ALTER TABLE public.wbs_task_progress_reviews
  ADD COLUMN IF NOT EXISTS daily_report_id UUID REFERENCES public.site_daily_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daily_report_activity_id UUID REFERENCES public.site_daily_report_activities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_task_progress_reviews_daily_report
  ON public.wbs_task_progress_reviews(daily_report_id) WHERE daily_report_id IS NOT NULL;

ALTER TABLE public.plan_productivity_logs
  ADD COLUMN IF NOT EXISTS daily_report_activity_id UUID REFERENCES public.site_daily_report_activities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plan_productivity_logs_dr_act
  ON public.plan_productivity_logs(daily_report_activity_id) WHERE daily_report_activity_id IS NOT NULL;

-- ── 4. RLS for site_daily_report_activities ─────────────────────────────────
ALTER TABLE public.site_daily_report_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_daily_report_activities_select ON public.site_daily_report_activities;
CREATE POLICY site_daily_report_activities_select ON public.site_daily_report_activities
  FOR SELECT TO authenticated
  USING (is_project_member(project_id));

DROP POLICY IF EXISTS site_daily_report_activities_insert ON public.site_daily_report_activities;
CREATE POLICY site_daily_report_activities_insert ON public.site_daily_report_activities
  FOR INSERT TO authenticated
  WITH CHECK (is_project_member(project_id));

DROP POLICY IF EXISTS site_daily_report_activities_update ON public.site_daily_report_activities;
CREATE POLICY site_daily_report_activities_update ON public.site_daily_report_activities
  FOR UPDATE TO authenticated
  USING (is_project_member(project_id))
  WITH CHECK (is_project_member(project_id));

DROP POLICY IF EXISTS site_daily_report_activities_delete ON public.site_daily_report_activities;
CREATE POLICY site_daily_report_activities_delete ON public.site_daily_report_activities
  FOR DELETE TO authenticated
  USING (is_project_member(project_id));

-- ── 5. Trigger for updated_at on site_daily_report_activities ──────────────
DROP TRIGGER IF EXISTS trg_site_daily_report_activities_updated_at ON public.site_daily_report_activities;
CREATE TRIGGER trg_site_daily_report_activities_updated_at
  BEFORE UPDATE ON public.site_daily_report_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 6. RPC: sync_daily_report_to_planning() ────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_daily_report_to_planning(p_daily_report_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report            RECORD;
  v_item              RECORD;
  v_review_res        JSONB;
  v_prod_id           UUID;
  v_delay_id          UUID;
  v_step_item         JSONB;
  v_step_id           UUID;
  v_step_prog         NUMERIC;
  v_synced_count      INTEGER := 0;
  v_pending_count     INTEGER := 0;
  v_prod_count        INTEGER := 0;
  v_delay_count       INTEGER := 0;
  v_error_count       INTEGER := 0;
  v_total_act_count   INTEGER := 0;
BEGIN
  -- Verify report exists
  SELECT * INTO v_report FROM public.site_daily_reports WHERE id = p_daily_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Daily Report % not found', p_daily_report_id;
  END IF;

  -- Ensure caller is project member or admin
  IF NOT public.is_project_member(v_report.project_id) THEN
    RAISE EXCEPTION 'Not authorized to submit daily reports for this project';
  END IF;

  -- Loop through each activity line
  FOR v_item IN
    SELECT * FROM public.site_daily_report_activities
    WHERE daily_report_id = p_daily_report_id
  LOOP
    v_total_act_count := v_total_act_count + 1;

    -- A. Activity Steps update (if step progress array provided)
    IF v_item.step_progress IS NOT NULL AND jsonb_typeof(v_item.step_progress) = 'array' AND jsonb_array_length(v_item.step_progress) > 0 THEN
      FOR v_step_item IN SELECT * FROM jsonb_array_elements(v_item.step_progress)
      LOOP
        v_step_id := (v_step_item->>'step_id')::uuid;
        v_step_prog := (v_step_item->>'progress')::numeric;

        IF v_step_id IS NOT NULL AND v_step_prog IS NOT NULL THEN
          UPDATE public.wbs_task_steps
          SET progress = v_step_prog,
              end_date = CASE WHEN v_step_prog = 100 THEN COALESCE(end_date, v_report.report_date) ELSE end_date END,
              updated_at = NOW()
          WHERE id = v_step_id AND task_id = v_item.task_id;
        END IF;
      END LOOP;
    END IF;

    -- B. Physical progress update via submit_progress()
    BEGIN
      v_review_res := public.submit_progress(
        v_item.task_id,
        v_item.progress_today,
        COALESCE(v_item.work_description, 'Daily Report: ' || v_report.report_date::text)
      );

      IF (v_review_res->>'mode') = 'direct' THEN
        UPDATE public.site_daily_report_activities
        SET sync_status = 'synced',
            sync_error = NULL
        WHERE id = v_item.id;
        v_synced_count := v_synced_count + 1;
      ELSIF (v_review_res->>'mode') = 'pending' THEN
        UPDATE public.site_daily_report_activities
        SET sync_status = 'pending_approval',
            progress_review_id = (v_review_res->>'review_id')::uuid,
            sync_error = NULL
        WHERE id = v_item.id;

        -- Store backlink on review row
        UPDATE public.wbs_task_progress_reviews
        SET daily_report_id = p_daily_report_id,
            daily_report_activity_id = v_item.id
        WHERE id = (v_review_res->>'review_id')::uuid;

        v_pending_count := v_pending_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.site_daily_report_activities
      SET sync_status = 'rejected',
          sync_error = SQLERRM
      WHERE id = v_item.id;
      v_error_count := v_error_count + 1;
    END;

    -- C. Update actual dates and observation notes on wbs_tasks
    IF v_item.actual_start_date IS NOT NULL THEN
      UPDATE public.wbs_tasks
      SET actual_start_date = LEAST(COALESCE(actual_start_date, v_item.actual_start_date), v_item.actual_start_date)
      WHERE id = v_item.task_id;
    END IF;

    IF v_item.progress_today = 100 AND v_item.actual_finish_date IS NOT NULL THEN
      UPDATE public.wbs_tasks
      SET actual_finish_date = v_item.actual_finish_date,
          status = 'closed'
      WHERE id = v_item.task_id;
    ELSIF v_item.progress_today > 0 AND v_item.progress_today < 100 THEN
      UPDATE public.wbs_tasks
      SET status = 'in_progress'
      WHERE id = v_item.task_id AND status = 'open';
    END IF;

    IF v_item.work_description IS NOT NULL AND btrim(v_item.work_description) <> '' THEN
      UPDATE public.wbs_tasks
      SET field_observation_notes = v_item.work_description
      WHERE id = v_item.task_id;
    END IF;

    -- D. Productivity Logs (Phase 5 of Productivity Plan)
    IF v_item.quantity_done IS NOT NULL AND (COALESCE(v_item.hours_normal, 0) + COALESCE(v_item.hours_ot, 0)) > 0 THEN
      IF v_item.productivity_log_id IS NOT NULL THEN
        UPDATE public.plan_productivity_logs
        SET trade_code = COALESCE(v_item.trade_code, 'General'),
            log_date = v_report.report_date,
            headcount = COALESCE(v_item.headcount, 1),
            hours_normal = COALESCE(v_item.hours_normal, 8),
            hours_ot = COALESCE(v_item.hours_ot, 0),
            quantity_done = v_item.quantity_done,
            unit = v_item.quantity_unit,
            condition_note = v_item.work_description,
            updated_at = NOW()
        WHERE id = v_item.productivity_log_id;
        v_prod_count := v_prod_count + 1;
      ELSE
        INSERT INTO public.plan_productivity_logs (
          project_id, task_id, trade_code, log_date, headcount,
          hours_normal, hours_ot, quantity_done, unit, condition_note,
          source, daily_report_activity_id, created_by
        ) VALUES (
          v_report.project_id, v_item.task_id, COALESCE(v_item.trade_code, 'General'),
          v_report.report_date, COALESCE(v_item.headcount, 1),
          COALESCE(v_item.hours_normal, 8), COALESCE(v_item.hours_ot, 0),
          v_item.quantity_done, v_item.quantity_unit,
          v_item.work_description, 'site_diary', v_item.id, auth.uid()
        )
        RETURNING id INTO v_prod_id;

        UPDATE public.site_daily_report_activities
        SET productivity_log_id = v_prod_id
        WHERE id = v_item.id;
        v_prod_count := v_prod_count + 1;
      END IF;
    END IF;

    -- E. Delay Register linkage
    IF v_item.has_delay AND COALESCE(v_item.delay_hours_lost, 0) > 0 THEN
      IF v_item.delay_event_id IS NULL THEN
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
          v_report.project_id,
          v_item.task_id,
          COALESCE(v_item.delay_reason, 'Delay reported on ' || v_report.report_date::text),
          CASE WHEN v_item.delay_category IN ('weather', 'client', 'rfi_design') THEN 'excusable' ELSE 'non_excusable' END,
          v_item.delay_category,
          v_item.trade_code,
          v_report.report_date,
          'open',
          'Logged via Site Daily Report on ' || v_report.report_date::text || '. Impact: ' || v_item.delay_hours_lost || ' hours lost.',
          auth.uid()
        )
        RETURNING id INTO v_delay_id;

        INSERT INTO public.delay_register_tasks (delay_id, wbs_task_id)
        VALUES (v_delay_id, v_item.task_id)
        ON CONFLICT DO NOTHING;

        UPDATE public.site_daily_report_activities
        SET delay_event_id = v_delay_id
        WHERE id = v_item.id;

        v_delay_count := v_delay_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- Update summary on daily report
  UPDATE public.site_daily_reports
  SET status = 'submitted',
      submitted_at = NOW(),
      submitted_by = auth.uid(),
      activities_count = v_total_act_count
  WHERE id = p_daily_report_id;

  RETURN jsonb_build_object(
    'success', true,
    'total_activities', v_total_act_count,
    'activities_direct_synced', v_synced_count,
    'activities_pending_review', v_pending_count,
    'productivity_logs_recorded', v_prod_count,
    'delays_logged', v_delay_count,
    'errors', v_error_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_daily_report_to_planning(UUID) TO authenticated;

-- ── 7. RPC: get_daily_report_planning_context() ─────────────────────────────
-- Returns active and scheduled activities for a project date, with current progress,
-- norms, work quantity units, and step templates.
CREATE OR REPLACE FUNCTION public.get_daily_report_planning_context(
  p_project_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  task_id UUID,
  task_code TEXT,
  task_name TEXT,
  discipline TEXT,
  status TEXT,
  current_progress NUMERIC,
  start_date DATE,
  end_date DATE,
  actual_start_date DATE,
  actual_finish_date DATE,
  quantity NUMERIC,
  quantity_unit TEXT,
  norm_id UUID,
  norm_code TEXT,
  suggested_trade TEXT,
  steps_count INTEGER,
  steps_json JSONB
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    t.id AS task_id,
    t.task_code,
    t.task_name,
    t.discipline,
    t.status,
    t.progress AS current_progress,
    t.start_date,
    t.end_date,
    t.actual_start_date,
    t.actual_finish_date,
    w.quantity,
    w.quantity_unit,
    w.norm_id,
    n.code AS norm_code,
    n.trade AS suggested_trade,
    COALESCE(st.steps_count, 0)::INTEGER AS steps_count,
    COALESCE(st.steps_json, '[]'::jsonb) AS steps_json
  FROM public.wbs_tasks t
  LEFT JOIN public.plan_task_work w ON w.task_id = t.id
  LEFT JOIN public.plan_productivity_norms n ON n.id = w.norm_id
  LEFT JOIN (
    SELECT
      s.task_id,
      COUNT(*)::INTEGER AS steps_count,
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'step_no', s.step_no,
          'step_name', s.step_name,
          'weight', s.weight,
          'progress', s.progress,
          'start_date', s.start_date,
          'end_date', s.end_date
        ) ORDER BY s.step_no
      ) AS steps_json
    FROM public.wbs_task_steps s
    GROUP BY s.task_id
  ) st ON st.task_id = t.id
  WHERE t.project_id = p_project_id
    AND t.status <> 'closed'
  ORDER BY
    CASE
      WHEN t.start_date <= p_date AND t.end_date >= p_date THEN 1
      WHEN t.status = 'in_progress' THEN 2
      WHEN t.start_date > p_date THEN 3
      ELSE 4
    END,
    t.task_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_report_planning_context(UUID, DATE) TO authenticated;

-- ── 8. RPC: get_task_site_diary_history() ───────────────────────────────────
-- Returns all Daily Report entries and field logs tied to a specific schedule activity.
CREATE OR REPLACE FUNCTION public.get_task_site_diary_history(p_task_id UUID)
RETURNS TABLE (
  daily_report_id UUID,
  report_date DATE,
  activity_status TEXT,
  progress_before NUMERIC,
  progress_today NUMERIC,
  quantity_done NUMERIC,
  quantity_unit TEXT,
  trade_code TEXT,
  headcount INTEGER,
  hours_total NUMERIC,
  work_description TEXT,
  has_delay BOOLEAN,
  delay_reason TEXT,
  delay_hours_lost NUMERIC,
  weather_conditions TEXT,
  author_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    r.id AS daily_report_id,
    r.report_date,
    a.activity_status,
    a.progress_before,
    a.progress_today,
    a.quantity_done,
    a.quantity_unit,
    a.trade_code,
    a.headcount,
    (COALESCE(a.hours_normal, 0) + COALESCE(a.hours_ot, 0)) AS hours_total,
    a.work_description,
    a.has_delay,
    a.delay_reason,
    a.delay_hours_lost,
    r.weather_conditions,
    a.created_by AS author_id,
    a.created_at
  FROM public.site_daily_report_activities a
  JOIN public.site_daily_reports r ON r.id = a.daily_report_id
  WHERE a.task_id = p_task_id
  ORDER BY r.report_date DESC, a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_task_site_diary_history(UUID) TO authenticated;
