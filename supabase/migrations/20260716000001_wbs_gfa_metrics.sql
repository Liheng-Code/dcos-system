-- FS-QS-012: GFA, Site Area & Cost per m² Measurement and Reporting
-- Per DCOS-QS-GDL-001 V1.0

-- ============================================================
-- 1. Add is_basement to wbs_nodes
-- ============================================================
ALTER TABLE public.wbs_nodes
  ADD COLUMN IF NOT EXISTS is_basement boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. Create wbs_node_quantities table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wbs_node_quantities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_node_id     uuid NOT NULL REFERENCES public.wbs_nodes(id) ON DELETE CASCADE,
  metric_code     text NOT NULL CHECK (metric_code IN ('GFA', 'SITE_AREA', 'BUILDING_FOOTPRINT')),
  value           numeric(14,2) NOT NULL CHECK (value > 0),
  unit            text NOT NULL DEFAULT 'm2',
  source_ref      text NOT NULL CHECK (length(source_ref) > 0),
  is_current      boolean NOT NULL DEFAULT true,
  revised_reason  text,
  revised_at      timestamptz,
  revised_by      uuid REFERENCES auth.users(id),
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Only one current record per (wbs_node_id, metric_code)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wbs_node_quantities_current
  ON public.wbs_node_quantities (wbs_node_id, metric_code)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_wbs_node_quantities_project
  ON public.wbs_node_quantities (project_id);

CREATE INDEX IF NOT EXISTS idx_wbs_node_quantities_node
  ON public.wbs_node_quantities (wbs_node_id);

-- ============================================================
-- 3. Add gfa_at_snapshot to progress_snapshots
-- ============================================================
ALTER TABLE public.progress_snapshots
  ADD COLUMN IF NOT EXISTS gfa_at_snapshot numeric(14,2);

-- ============================================================
-- 4. RLS policies for wbs_node_quantities
-- ============================================================
ALTER TABLE public.wbs_node_quantities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view wbs_node_quantities"
  ON public.wbs_node_quantities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert wbs_node_quantities"
  ON public.wbs_node_quantities FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update wbs_node_quantities"
  ON public.wbs_node_quantities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admins can delete wbs_node_quantities"
  ON public.wbs_node_quantities FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- 5. Function: upsert GFA with revision control
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_wbs_gfa(
  p_wbs_node_id uuid,
  p_project_id uuid,
  p_value numeric,
  p_source_ref text,
  p_revised_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_old_id uuid;
  v_old_value numeric;
  v_new_id uuid;
  v_metric text := 'GFA';
BEGIN
  -- Find current record
  SELECT id, value INTO v_old_id, v_old_value
  FROM public.wbs_node_quantities
  WHERE wbs_node_id = p_wbs_node_id
    AND metric_code = v_metric
    AND is_current = true;

  -- Deactivate old record
  IF v_old_id IS NOT NULL THEN
    UPDATE public.wbs_node_quantities
    SET is_current = false
    WHERE id = v_old_id;
  END IF;

  -- Insert new record
  INSERT INTO public.wbs_node_quantities (
    project_id, wbs_node_id, metric_code, value, source_ref,
    is_current, revised_reason, revised_at, revised_by, created_by
  ) VALUES (
    p_project_id, p_wbs_node_id, v_metric, p_value, p_source_ref,
    true,
    CASE WHEN v_old_id IS NOT NULL THEN p_revised_reason ELSE NULL END,
    CASE WHEN v_old_id IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN v_old_id IS NOT NULL THEN auth.uid() ELSE NULL END,
    auth.uid()
  ) RETURNING id INTO v_new_id;

  -- Write audit log
  INSERT INTO public.wbs_audit_log (
    wbs_node_id, project_id, user_id, action, field_name, old_value, new_value
  ) VALUES (
    p_wbs_node_id, p_project_id, auth.uid(),
    'GFA_UPDATE',
    'gfa',
    CASE WHEN v_old_value IS NOT NULL THEN v_old_value::text ELSE NULL END,
    p_value::text
  );

  RETURN jsonb_build_object(
    'id', v_new_id,
    'old_value', v_old_value,
    'new_value', p_value,
    'revised', v_old_id IS NOT NULL
  );
END;
$$;

-- ============================================================
-- 6. Function: upsert SITE_AREA with revision control
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_wbs_site_area(
  p_wbs_node_id uuid,
  p_project_id uuid,
  p_value numeric,
  p_source_ref text,
  p_revised_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_old_id uuid;
  v_old_value numeric;
  v_new_id uuid;
  v_metric text := 'SITE_AREA';
BEGIN
  SELECT id, value INTO v_old_id, v_old_value
  FROM public.wbs_node_quantities
  WHERE wbs_node_id = p_wbs_node_id
    AND metric_code = v_metric
    AND is_current = true;

  IF v_old_id IS NOT NULL THEN
    UPDATE public.wbs_node_quantities
    SET is_current = false
    WHERE id = v_old_id;
  END IF;

  INSERT INTO public.wbs_node_quantities (
    project_id, wbs_node_id, metric_code, value, source_ref,
    is_current, revised_reason, revised_at, revised_by, created_by
  ) VALUES (
    p_project_id, p_wbs_node_id, v_metric, p_value, p_source_ref,
    true,
    CASE WHEN v_old_id IS NOT NULL THEN p_revised_reason ELSE NULL END,
    CASE WHEN v_old_id IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN v_old_id IS NOT NULL THEN auth.uid() ELSE NULL END,
    auth.uid()
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.wbs_audit_log (
    wbs_node_id, project_id, user_id, action, field_name, old_value, new_value
  ) VALUES (
    p_wbs_node_id, p_project_id, auth.uid(),
    'SITE_AREA_UPDATE',
    'site_area',
    CASE WHEN v_old_value IS NOT NULL THEN v_old_value::text ELSE NULL END,
    p_value::text
  );

  RETURN jsonb_build_object(
    'id', v_new_id,
    'old_value', v_old_value,
    'new_value', p_value,
    'revised', v_old_id IS NOT NULL
  );
END;
$$;

-- ============================================================
-- 7. Function: get GFA summary for a building node
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_building_gfa_summary(p_building_node_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH descendant_levels AS (
    SELECT wn.id, wn.is_basement
    FROM public.wbs_nodes wn
    WHERE wn.parent_id = p_building_node_id
      AND wn.node_type = 'level'
    UNION
    SELECT wn2.id, wn2.is_basement
    FROM public.wbs_nodes wn
    JOIN public.wbs_nodes wn2 ON wn2.parent_id = wn.id
    WHERE wn.parent_id = p_building_node_id
      AND wn.node_type = 'level'
      AND wn2.node_type = 'level'
  ),
  gfa_data AS (
    SELECT
      dl.is_basement,
      COALESCE(qn.value, 0) AS gfa
    FROM descendant_levels dl
    LEFT JOIN public.wbs_node_quantities qn
      ON qn.wbs_node_id = dl.id
      AND qn.metric_code = 'GFA'
      AND qn.is_current = true
  )
  SELECT jsonb_build_object(
    'gfa_above_ground', COALESCE(SUM(CASE WHEN NOT is_basement THEN gfa END), 0),
    'gfa_basement',     COALESCE(SUM(CASE WHEN is_basement THEN gfa END), 0),
    'gfa_total',        COALESCE(SUM(gfa), 0)
  )
  FROM gfa_data;
$$;

-- ============================================================
-- 8. Function: get project-level GFA and Site Area summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_project_area_summary(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH site_area AS (
    SELECT qn.value AS site_area
    FROM public.wbs_node_quantities qn
    JOIN public.wbs_nodes wn ON wn.id = qn.wbs_node_id
    WHERE qn.project_id = p_project_id
      AND qn.metric_code = 'SITE_AREA'
      AND qn.is_current = true
      AND wn.node_type = 'project'
    LIMIT 1
  ),
  all_levels AS (
    SELECT wn.id, wn.is_basement
    FROM public.wbs_nodes wn
    WHERE wn.project_id = p_project_id
      AND wn.node_type = 'level'
  ),
  gfa_totals AS (
    SELECT
      COALESCE(SUM(CASE WHEN NOT al.is_basement THEN qn.value END), 0) AS gfa_above_ground,
      COALESCE(SUM(CASE WHEN al.is_basement THEN qn.value END), 0) AS gfa_basement
    FROM all_levels al
    LEFT JOIN public.wbs_node_quantities qn
      ON qn.wbs_node_id = al.id
      AND qn.metric_code = 'GFA'
      AND qn.is_current = true
  )
  SELECT jsonb_build_object(
    'site_area',        (SELECT site_area FROM site_area),
    'gfa_above_ground', gfa_above_ground,
    'gfa_basement',     gfa_basement,
    'gfa_total',        gfa_above_ground + gfa_basement
  )
  FROM gfa_totals;
$$;
