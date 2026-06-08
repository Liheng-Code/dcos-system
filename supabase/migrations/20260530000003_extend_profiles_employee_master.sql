-- Employee Master profile fields

alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists nationality text,
  add column if not exists phone text,
  add column if not exists address text;

create index if not exists idx_profiles_date_of_birth on public.profiles(date_of_birth);
