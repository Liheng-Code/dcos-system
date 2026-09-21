-- Migration: 20260917000002_plan_schedule_settings.sql
-- Purpose: Per-project critical / near-critical float threshold settings for
--          the Planning ▸ Gantt Chart CPM engine.
-- Depends on: projects (already exists)

-- ── 1. Schedule settings (one row per project) ────────────────────────────
create table if not exists public.plan_schedule_settings (
  project_id                          uuid primary key references public.projects(id) on delete cascade,
  critical_float_threshold_days       integer not null default 0,
  near_critical_float_threshold_days  integer not null default 5,
  updated_at                          timestamptz not null default now()
);

alter table public.plan_schedule_settings enable row level security;
drop policy if exists "auth_plan_schedule_settings" on public.plan_schedule_settings;
create policy "auth_plan_schedule_settings" on public.plan_schedule_settings
  for all to authenticated using (true) with check (true);

comment on column public.plan_schedule_settings.critical_float_threshold_days is
  'A task is "critical" when its CPM total float (working days) is <= this value. Read by lib/planning/schedule-engine.ts. Default 0 matches the CPM engine''s prior hardcoded behavior.';
comment on column public.plan_schedule_settings.near_critical_float_threshold_days is
  'A task is "near-critical" (amber warning) when its total float is > critical_float_threshold_days and <= this value.';
