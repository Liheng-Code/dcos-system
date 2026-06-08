-- Add timeline tracking, comments, paused/cancelled status to wbs_tasks

-- Add new columns
alter table public.wbs_tasks
  add column started_at   timestamptz,
  add column paused_at    timestamptz,
  add column comments     jsonb not null default '[]'::jsonb;

-- Update status constraint to include paused and cancelled
alter table public.wbs_tasks
  drop constraint if exists wbs_tasks_status_check;

alter table public.wbs_tasks
  add constraint wbs_tasks_status_check
    check (status in ('open', 'in_progress', 'paused', 'blocked', 'review', 'submitted', 'closed', 'cancelled'));
