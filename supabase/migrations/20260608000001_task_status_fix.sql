-- SOP-TSK-001: Add 'assigned' and 'approved' statuses to wbs_tasks
-- 'assigned' = task has a receiver but not yet accepted
-- 'approved'  = task approved by assignee, before formal closure

ALTER TABLE public.wbs_tasks DROP CONSTRAINT IF EXISTS wbs_tasks_status_check;

ALTER TABLE public.wbs_tasks
  ADD CONSTRAINT wbs_tasks_status_check
  CHECK (status IN (
    'open',
    'assigned',
    'in_progress',
    'paused',
    'blocked',
    'review',
    'submitted',
    'approved',
    'closed',
    'cancelled',
    'completed',
    'rejected'
  ));
