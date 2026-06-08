-- SOP-TSK-001 §22: Escalation rules
-- task_escalations tracks what level has been sent per task.
-- run_task_escalation() creates overdue alerts at L1/L2/L3/L4 thresholds.

CREATE TABLE IF NOT EXISTS public.task_escalations (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id          uuid        NOT NULL REFERENCES public.wbs_tasks(id) ON DELETE CASCADE,
  escalation_level int         NOT NULL CHECK (escalation_level BETWEEN 1 AND 4),
  days_overdue     int         NOT NULL,
  notified_at      timestamptz DEFAULT now(),
  resolved_at      timestamptz,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (task_id, escalation_level)
);

ALTER TABLE public.task_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_escalations_auth" ON public.task_escalations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Function: check overdue tasks and escalate
CREATE OR REPLACE FUNCTION public.run_task_escalation()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task         record;
  v_days         int;
  v_level        int;
  v_recipient_id uuid;
  v_count        int := 0;
BEGIN
  FOR v_task IN
    SELECT t.id, t.project_id, t.task_code, t.task_name,
           t.end_date, t.status, t.owner_id, t.assignee_id,
           p.project_manager_id
    FROM public.wbs_tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.end_date < CURRENT_DATE
      AND t.status NOT IN ('closed', 'completed', 'cancelled', 'approved')
  LOOP
    v_days := CURRENT_DATE - v_task.end_date;

    v_level := CASE
      WHEN v_days >= 14 THEN 4
      WHEN v_days >= 7  THEN 3
      WHEN v_days >= 3  THEN 2
      WHEN v_days >= 1  THEN 1
      ELSE 0
    END;

    IF v_level = 0 THEN CONTINUE; END IF;

    -- Skip if this level already escalated
    IF EXISTS (
      SELECT 1 FROM public.task_escalations
      WHERE task_id = v_task.id AND escalation_level = v_level
    ) THEN CONTINUE; END IF;

    -- Determine recipient per SOP §22
    v_recipient_id := CASE v_level
      WHEN 1 THEN v_task.owner_id              -- L1: Receiver
      WHEN 2 THEN v_task.assignee_id           -- L2: Assignee
      WHEN 3 THEN v_task.assignee_id           -- L3: Department Manager (assignee proxy)
      WHEN 4 THEN v_task.project_manager_id    -- L4: Project Manager
    END;

    IF v_recipient_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.task_escalations (task_id, escalation_level, days_overdue)
    VALUES (v_task.id, v_level, v_days);

    INSERT INTO public.task_alerts (
      project_id, wbs_task_id, recipient_id,
      alert_type, title, body, task_code, task_name, metadata
    ) VALUES (
      v_task.project_id, v_task.id, v_recipient_id,
      'task_overdue',
      'Task overdue ' || v_days || ' day(s) — Level ' || v_level,
      v_task.task_name || ' was due on ' || v_task.end_date::text,
      v_task.task_code, v_task.task_name,
      jsonb_build_object('days_overdue', v_days, 'escalation_level', v_level)
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
