-- Extend profiles table with HR fields

alter table public.profiles
  add column if not exists team_id uuid references public.teams(id) on delete set null,
  add column if not exists position_id uuid references public.positions(id) on delete set null,
  add column if not exists grade text,
  add column if not exists employment_type text default 'permanent' check (employment_type in ('permanent', 'contract', 'temporary', 'intern')),
  add column if not exists join_date date;

-- Create indexes for common lookups
create index if not exists idx_profiles_team_id on public.profiles(team_id);
create index if not exists idx_profiles_position_id on public.profiles(position_id);
create index if not exists idx_profiles_department on public.profiles(department);
