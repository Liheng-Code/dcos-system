-- Migration: 20260904000004_plan_timescale.sql
-- Purpose: MS-Project-style Timescale settings for Planning ▸ Gantt Chart —
--          one JSON config per project driving the multi-tier timeline header
--          and non-working-time shading.
-- Depends on: projects.

create table if not exists public.plan_timescale (
  project_id uuid primary key references public.projects(id) on delete cascade,
  -- TimescaleConfig — see apps/web/lib/planning/timescale.ts
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.plan_timescale enable row level security;
drop policy if exists "auth_plan_timescale" on public.plan_timescale;
create policy "auth_plan_timescale" on public.plan_timescale
  for all to authenticated using (true) with check (true);

comment on table public.plan_timescale is
  'Per-project Gantt timescale configuration (tiers, size, non-working shading). '
  'Upserted directly by the client; no RPC.';
