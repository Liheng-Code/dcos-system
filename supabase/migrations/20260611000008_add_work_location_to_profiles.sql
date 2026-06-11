alter table public.profiles
  add column if not exists work_location text check (work_location in ('office', 'site', 'hybrid'));
