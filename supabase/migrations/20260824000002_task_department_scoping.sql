-- Department scoping for tasks: wbs_tasks.department_id marks the EXECUTING
-- department. Derived automatically from the owner's department until set explicitly.

ALTER TABLE public.wbs_tasks
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- Backfill from owner first, then assignee as fallback.
-- NOTE: an UPDATE ... FROM cannot LEFT JOIN against the target alias,
-- so the owner pass and assignee fallback are two separate statements.
UPDATE public.wbs_tasks t
SET    department_id = p.department_id
FROM   public.profiles p
WHERE  t.owner_id = p.id
  AND  t.department_id IS NULL
  AND  p.department_id IS NOT NULL;

UPDATE public.wbs_tasks t
SET    department_id = p.department_id
FROM   public.profiles p
WHERE  t.owner_id IS NULL
  AND  t.assignee_id = p.id
  AND  t.department_id IS NULL
  AND  p.department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_tasks_department_id
  ON public.wbs_tasks(department_id);

CREATE INDEX IF NOT EXISTS idx_wbs_tasks_project_department
  ON public.wbs_tasks(project_id, department_id);

CREATE INDEX IF NOT EXISTS idx_wbs_tasks_department_status
  ON public.wbs_tasks(department_id, status);

-- Auto-derive executing department from the assigned owner when not set explicitly.
CREATE OR REPLACE FUNCTION public.derive_task_department()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.department_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    SELECT pr.department_id INTO NEW.department_id
    FROM   public.profiles pr
    WHERE  pr.id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_task_department ON public.wbs_tasks;

CREATE TRIGGER trg_derive_task_department
  BEFORE INSERT OR UPDATE OF department_id, owner_id ON public.wbs_tasks
  FOR EACH ROW EXECUTE FUNCTION public.derive_task_department();
