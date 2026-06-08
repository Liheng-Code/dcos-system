-- Add classification columns to wbs_tasks
alter table public.wbs_tasks
  add column task_type text,
  add column category  text;
