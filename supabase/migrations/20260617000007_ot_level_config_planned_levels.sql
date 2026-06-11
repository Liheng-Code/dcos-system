-- ============================================================
-- OT Level Config & Planned Levels (Issues 3 & 4)
-- ============================================================

-- 1. Add planned_levels to overtime_requests for approval chain persistence
alter table if exists public.overtime_requests
  add column if not exists planned_levels jsonb;

-- 2. overtime_level_config — Staff level OT eligibility
create table if not exists public.overtime_level_config (
  id                uuid primary key default gen_random_uuid(),
  role_level        text not null unique,
  role_name         text not null,
  ot_eligible       boolean not null default true,
  max_hours_per_month numeric,
  require_supervisor_approval boolean not null default true,
  is_active         boolean not null default true,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles(id)
);

alter table public.overtime_level_config enable row level security;

create policy "Authenticated users can view overtime_level_config"
  on public.overtime_level_config for select to authenticated using (true);

create policy "HR admin can manage overtime_level_config"
  on public.overtime_level_config for all to authenticated
  using (exists (
    select 1 from public.profiles where id = auth.uid()
    and level in ('HR_Manager','HR_Admin','Super_Admin','Admin')
  ));

-- Seed default level config
insert into public.overtime_level_config (role_level, role_name, ot_eligible, max_hours_per_month)
values
  ('L0', 'Super Admin',         false, null),
  ('L1', 'Managing Director',   false, null),
  ('L2', 'General Manager',     true,  60),
  ('L3', 'Project Manager',     true,  80),
  ('L4', 'Department Manager',  true,  80),
  ('L5', 'Senior Engineer',     true,  100),
  ('L6', 'Staff',               true,  100)
on conflict (role_level) do nothing;
