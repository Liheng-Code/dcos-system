-- Add completed and rejected to wbs_tasks status and qa_status constraints

alter table wbs_tasks
  drop constraint if exists wbs_tasks_status_check,
  add constraint wbs_tasks_status_check
    check (status in ('open', 'in_progress', 'paused', 'blocked', 'review', 'submitted', 'closed', 'cancelled', 'completed', 'rejected'));

alter table wbs_tasks
  drop constraint if exists wbs_tasks_qa_status_check,
  add constraint wbs_tasks_qa_status_check
    check (qa_status in ('not_required', 'pending', 'submitted', 'review', 'failed', 'approved', 'rejected'));
