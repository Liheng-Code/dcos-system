alter table public.profiles
  add column if not exists employee_id text,
  add column if not exists job_title   text,
  add column if not exists department  text,
  add column if not exists level       text,
  add column if not exists report_to   text;
