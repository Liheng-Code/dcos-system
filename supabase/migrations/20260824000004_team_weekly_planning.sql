-- Department-level weekly workload planning on top of the existing
-- weekly_plans / weekly_plan_tasks tables (Module 11).

ALTER TABLE public.weekly_plans
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE;

ALTER TABLE public.weekly_plan_tasks
  ADD COLUMN IF NOT EXISTS responsible_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Allow one company-wide plan AND one plan per department for the same week.
-- The original uq_weekly_plans_project_week is a plain UNIQUE INDEX (not a table
-- constraint), so it must be dropped via DROP INDEX, not DROP CONSTRAINT.
DROP INDEX IF EXISTS public.uq_weekly_plans_project_week;

CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_plans_project_week_dept
  ON public.weekly_plans(project_id, week_start_date, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_weekly_plans_department ON public.weekly_plans(department_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_tasks_responsible ON public.weekly_plan_tasks(responsible_id);
