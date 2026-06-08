-- Weekly Work Plan tables for Module 11 — Planning & Scheduling.
-- A weekly plan is a PM-defined list of tasks to be executed in a given week,
-- with target progress % per task. At week end, actual progress is compared.

CREATE TABLE IF NOT EXISTS public.weekly_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  title           TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'approved')),
  notes           TEXT,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_plans_project_week
  ON public.weekly_plans(project_id, week_start_date);

CREATE TABLE IF NOT EXISTS public.weekly_plan_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id  UUID NOT NULL REFERENCES public.weekly_plans(id) ON DELETE CASCADE,
  wbs_task_id     UUID NOT NULL REFERENCES public.wbs_tasks(id) ON DELETE CASCADE,
  target_progress INT  NOT NULL DEFAULT 0 CHECK (target_progress BETWEEN 0 AND 100),
  responsible_name TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (weekly_plan_id, wbs_task_id)
);

ALTER TABLE public.weekly_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_plan_tasks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage weekly plans for any project they can see.
-- Tighter per-project RLS can be layered on after project membership model is clarified.
CREATE POLICY "Authenticated users can manage weekly plans"
  ON public.weekly_plans FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage weekly plan tasks"
  ON public.weekly_plan_tasks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
