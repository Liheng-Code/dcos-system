-- Migration: 20260720000010_dwl_phase5_snapshots.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 5:
--          Snapshots. Implements SOP §11 (dwl_project_snapshots).
-- Depends on: 20260720000009_dwl_phase4_parametric_models.sql
--             (dwl_projects), profiles (already exists)
-- Scope: this is the last of the originally-scoped build phases (0–5).
--        Phase 6 (legacy integration / FK repoint of the six existing
--        rate-library structures, per SOP §12–12.1) is explicitly OUT OF
--        SCOPE for this migration — it is a separate, larger decision
--        gated on its own authorization.
-- Idempotent: safe to re-run (create table if not exists, create index if
--          not exists, guarded policy creation).
--
-- RLS: append-only by design (SOP §11: "the live library moves; a
-- submitted tender must not... Snapshots are append-only"). Same pattern
-- as dwl_resource_prices in Phase 1 — tenant-scoped SELECT/INSERT only, NO
-- UPDATE/DELETE policy. With RLS enabled and no matching policy,
-- UPDATE/DELETE are rejected outright for the application role — this is
-- the DB-level guarantee, not just a documented convention.

create table if not exists public.dwl_project_snapshots (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  project_id   uuid not null references public.dwl_projects(id),
  label        text not null,                    -- e.g. 'Tender submission rev A'
  snapped_at   timestamptz not null default now(),
  snapped_by   uuid references public.profiles(id),
  payload      jsonb not null                     -- full estimate rows + exploded rates + prices used
);

create index if not exists idx_dwl_project_snapshots_tenant on public.dwl_project_snapshots(tenant_id);
create index if not exists idx_dwl_project_snapshots_project on public.dwl_project_snapshots(project_id);

alter table public.dwl_project_snapshots enable row level security;

do $$ begin
  create policy dwl_project_snapshots_tenant_select on public.dwl_project_snapshots
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_project_snapshots_tenant_insert on public.dwl_project_snapshots
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

-- Append-only enforcement: deliberately NO UPDATE/DELETE policy is created
-- for dwl_project_snapshots (mirrors dwl_resource_prices in Phase 1).
