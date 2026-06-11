-- Add probation tracking fields to profiles

alter table public.profiles
  add column if not exists probation_status text default 'not_applicable'
    check (probation_status in ('not_applicable', 'active', 'completed', 'extended', 'failed')),
  add column if not exists probation_end_date date;
