alter table public.profiles
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive', 'resigned'));
