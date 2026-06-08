-- SOP-TSK-001 §5: Add formal assignee_id column so the assigner is stored
-- directly on the task rather than being derived from audit log lookups.

ALTER TABLE public.wbs_tasks
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_tasks_assignee_id
  ON public.wbs_tasks(assignee_id);
