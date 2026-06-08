alter table public.wbs_tasks
  add column baseline_start_date  date,
  add column baseline_finish_date date,
  add column baseline_set_at      timestamptz,
  add column baseline_set_by      uuid references public.profiles(id);
