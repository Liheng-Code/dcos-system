-- ============================================================
-- Add employment policy & probation tracking fields
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- A. Add missing probation tracking columns to profiles
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists probation_start_date date,
  add column if not exists confirmation_date    date,
  add column if not exists confirmed_by         uuid references public.profiles(id);

-- ─────────────────────────────────────────────────────────────
-- B. Create leave_employment_policy table
-- Keyed on (employment_type, probation_status, leave_type_id)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.leave_employment_policy (
  id                  uuid primary key default gen_random_uuid(),
  employment_type     text not null check (employment_type in ('permanent', 'contract', 'temporary', 'intern')),
  probation_status    text not null check (probation_status in ('not_applicable', 'active', 'completed', 'extended', 'failed')),
  leave_type_id       uuid not null references public.leave_types(id) on delete cascade,
  allowed             boolean not null default false,
  requires_hr         boolean not null default false,
  requires_attachment boolean not null default false,
  monthly_accrual     boolean not null default false,
  usable              boolean not null default false,
  created_at          timestamptz not null default now(),
  unique(employment_type, probation_status, leave_type_id)
);

-- ─────────────────────────────────────────────────────────────
-- C. Seed default policies
-- ─────────────────────────────────────────────────────────────

-- Helper: permanent + not_applicable (no probation) — all leave types fully allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'permanent', 'not_applicable', lt.id, true, false, false, false, true
from public.leave_types lt
on conflict do nothing;

-- Helper: permanent + completed probation — all leave types fully allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'permanent', 'completed', lt.id, true, false, false, false, true
from public.leave_types lt
on conflict do nothing;

-- permanent + active probation — restricted
-- Annual: not allowed, but monthly accrual enabled (locked until confirmation)
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'permanent', 'active', lt.id, false, false, false, true, false
from public.leave_types lt where lt.leave_code = 'ANNUAL'
on conflict do nothing;

-- Sick: allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'permanent', 'active', lt.id, true, false, false, false, true
from public.leave_types lt where lt.leave_code = 'SICK'
on conflict do nothing;

-- Emergency: allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'permanent', 'active', lt.id, true, false, false, false, true
from public.leave_types lt where lt.leave_code = 'EMERGENCY'
on conflict do nothing;

-- Maternity: allowed (gender restriction handled separately)
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'permanent', 'active', lt.id, true, false, false, false, true
from public.leave_types lt where lt.leave_code = 'MATERNITY'
on conflict do nothing;

-- Paternity: allowed (gender restriction handled separately)
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'permanent', 'active', lt.id, true, false, false, false, true
from public.leave_types lt where lt.leave_code = 'PATERNITY'
on conflict do nothing;

-- Compensation: allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'permanent', 'active', lt.id, true, false, false, false, true
from public.leave_types lt where lt.leave_code = 'COMPENSATION'
on conflict do nothing;

-- Unpaid: allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'permanent', 'active', lt.id, true, false, false, false, true
from public.leave_types lt where lt.leave_code = 'UNPAID'
on conflict do nothing;

-- Business Leave: requires HR approval during probation
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'permanent', 'active', lt.id, true, true, false, false, true
from public.leave_types lt where lt.leave_code = 'BUSINESS'
on conflict do nothing;

-- contract + active probation — same restrictions as permanent
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'contract', 'active', lt.id, lep.allowed, lep.requires_hr, lep.requires_attachment, lep.monthly_accrual, lep.usable
from public.leave_employment_policy lep
join public.leave_types lt on lt.id = lep.leave_type_id
where lep.employment_type = 'permanent' and lep.probation_status = 'active'
on conflict do nothing;

-- contract + not_applicable — all allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'contract', 'not_applicable', lt.id, true, false, false, false, true
from public.leave_types lt
on conflict do nothing;

-- contract + completed — all allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'contract', 'completed', lt.id, true, false, false, false, true
from public.leave_types lt
on conflict do nothing;

-- temporary + active — restricted (same as permanent active)
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'temporary', 'active', lt.id, lep.allowed, lep.requires_hr, lep.requires_attachment, lep.monthly_accrual, lep.usable
from public.leave_employment_policy lep
join public.leave_types lt on lt.id = lep.leave_type_id
where lep.employment_type = 'permanent' and lep.probation_status = 'active'
on conflict do nothing;

-- temporary + not_applicable — all allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'temporary', 'not_applicable', lt.id, true, false, false, false, true
from public.leave_types lt
on conflict do nothing;

-- intern + active — annual not allowed, sick & unpaid allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'intern', 'active', lt.id, false, false, false, false, false
from public.leave_types lt where lt.leave_code = 'ANNUAL'
on conflict do nothing;

insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'intern', 'active', lt.id, true, false, false, false, true
from public.leave_types lt where lt.leave_code in ('SICK', 'UNPAID')
on conflict do nothing;

-- intern + not_applicable — all allowed
insert into public.leave_employment_policy (employment_type, probation_status, leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable)
select 'intern', 'not_applicable', lt.id, true, false, false, false, true
from public.leave_types lt
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- D. RLS Policies
-- ─────────────────────────────────────────────────────────────
alter table public.leave_employment_policy enable row level security;

create policy "leave_employment_policy_view"
  on public.leave_employment_policy for select to authenticated using (true);

create policy "leave_employment_policy_manage"
  on public.leave_employment_policy for all to authenticated
  using (exists (select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')))
  with check (exists (select 1 from user_roles where user_id = auth.uid() and role_code in ('HR_Manager', 'admin')));
