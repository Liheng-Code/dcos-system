-- Cross-department task requests: a task created by department A to be executed
-- by department B. requesting_department_id IS NULL means a normal in-department
-- (or unscoped) task.

ALTER TABLE public.wbs_tasks
  ADD COLUMN IF NOT EXISTS requesting_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cross_dept_status        text
      CHECK (cross_dept_status IN ('requested', 'accepted', 'rejected')),
  ADD COLUMN IF NOT EXISTS cross_dept_note          text,
  ADD COLUMN IF NOT EXISTS cross_dept_decided_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cross_dept_decided_at    timestamptz;

CREATE INDEX IF NOT EXISTS idx_wbs_tasks_requesting_department
  ON public.wbs_tasks(requesting_department_id);

CREATE INDEX IF NOT EXISTS idx_wbs_tasks_cross_dept_queue
  ON public.wbs_tasks(department_id, cross_dept_status)
  WHERE cross_dept_status = 'requested';
