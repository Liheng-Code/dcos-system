-- SOP-TSK-001 §20: Recurring tasks
-- task_recurrences stores the schedule; generate_recurring_tasks() creates copies.

CREATE TABLE IF NOT EXISTS public.task_recurrences (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        uuid        NOT NULL REFERENCES public.projects(id)    ON DELETE CASCADE,
  template_task_id  uuid        NOT NULL REFERENCES public.wbs_tasks(id)   ON DELETE CASCADE,
  frequency         text        NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval_value    int         NOT NULL DEFAULT 1 CHECK (interval_value > 0),
  start_date        date        NOT NULL,
  end_date          date,
  next_run_at       date        NOT NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  created_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.task_recurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_recurrences_auth" ON public.task_recurrences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Function: generate recurring task copies for all overdue schedules
CREATE OR REPLACE FUNCTION public.generate_recurring_tasks()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec      record;
  v_new_code text;
  v_count    int := 0;
BEGIN
  FOR v_rec IN
    SELECT r.id             AS rec_id,
           r.frequency,
           r.interval_value,
           r.next_run_at,
           r.end_date,
           t.*
    FROM public.task_recurrences r
    JOIN public.wbs_tasks t ON t.id = r.template_task_id
    WHERE r.is_active = true
      AND r.next_run_at <= CURRENT_DATE
      AND (r.end_date IS NULL OR r.next_run_at <= r.end_date)
  LOOP
    v_new_code := v_rec.task_code || '-' || TO_CHAR(v_rec.next_run_at, 'YYYYMMDD');

    -- Skip if a task with this code already exists in this project
    IF NOT EXISTS (
      SELECT 1 FROM public.wbs_tasks
      WHERE project_id = v_rec.project_id AND task_code = v_new_code
    ) THEN
      INSERT INTO public.wbs_tasks (
        wbs_node_id, project_id, task_code, task_name, description,
        priority, task_type, category, discipline, assignee_id, sort_order
      ) VALUES (
        v_rec.wbs_node_id, v_rec.project_id, v_new_code, v_rec.task_name,
        v_rec.description, v_rec.priority, v_rec.task_type, v_rec.category,
        v_rec.discipline, v_rec.assignee_id, 0
      );
      v_count := v_count + 1;
    END IF;

    -- Advance next_run_at by one interval
    UPDATE public.task_recurrences SET
      next_run_at = CASE v_rec.frequency
        WHEN 'daily'   THEN v_rec.next_run_at + (v_rec.interval_value || ' days')::interval
        WHEN 'weekly'  THEN v_rec.next_run_at + (v_rec.interval_value * 7 || ' days')::interval
        WHEN 'monthly' THEN v_rec.next_run_at + (v_rec.interval_value || ' months')::interval
      END
    WHERE id = v_rec.rec_id;
  END LOOP;

  RETURN v_count;
END;
$$;
