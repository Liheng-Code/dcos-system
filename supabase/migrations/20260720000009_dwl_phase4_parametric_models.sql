-- Migration: 20260720000009_dwl_phase4_parametric_models.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 4, Level 4:
--          Parametric Quantity Models. Implements SOP §10 Step 4.1
--          (dwl_quantity_models, dwl_model_factors) and Step 4.3
--          (dwl_projects, dwl_v_project_estimate).
-- Depends on: 20260720000008_dwl_phase3_assemblies.sql (dwl_assemblies,
--             dwl_v_assembly_rates), profiles (already exists)
-- Scope: Phase 4 structure only. NO model/project data is seeded by this
--        migration. SOP §10 Step 4.2's MDL-SCH-001 model points at ~9
--        assemblies (ASM-SLAB-010, ASM-COL-010, etc.) that don't exist —
--        same blocker chain flagged after Phases 2 and 3 (missing real
--        Estimator work-item data). See report accompanying this change.
-- Idempotent: safe to re-run (create table if not exists, create index if
--          not exists, guarded policy creation).
--
-- IMPORTANT: dwl_projects is a lightweight quick-estimate record (name,
-- model_id, gfa, footprint, storeys, status) scoped to this module's
-- parametric estimating workflow. It is NOT the main DCOS project registry
-- (public.projects) and does not replace or link to it in this phase.
--
-- RLS note: like dwl_work_items/dwl_assemblies, these are
-- maintained/corrected over time, not append-only — normal tenant-scoped
-- INSERT/UPDATE/DELETE policies.
--
-- Security: dwl_v_project_estimate created WITH (security_invoker = true)
-- from the start, same as the Phase 2/3 views.

-- ─────────────────────────────────────────────────────────────────────────
-- Step 4.1 — dwl_quantity_models
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_quantity_models (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  code          text not null,                  -- e.g. MDL-SCH-001
  building_type text not null,                   -- school / office / apartment ...
  description   text not null,
  basis_note    text not null,                   -- which completed projects calibrated it
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint dwl_quantity_models_code_key unique (code)
);

create index if not exists idx_dwl_quantity_models_tenant on public.dwl_quantity_models(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Step 4.1 — dwl_model_factors
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_model_factors (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  model_id     uuid not null references public.dwl_quantity_models(id) on delete cascade,
  assembly_id  uuid not null references public.dwl_assemblies(id),
  driver       text not null check (driver in
                 ('gfa','footprint','storeys','gfa_per_45','fixed')),
  factor       numeric(14,6) not null,           -- qty = driver_value × factor
  basis_note   text not null,
  constraint dwl_model_factors_model_assembly_key unique (model_id, assembly_id)
);

create index if not exists idx_dwl_model_factors_tenant on public.dwl_model_factors(tenant_id);
create index if not exists idx_dwl_model_factors_model on public.dwl_model_factors(model_id);
create index if not exists idx_dwl_model_factors_assembly on public.dwl_model_factors(assembly_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Step 4.3 — dwl_projects (lightweight quick-estimate record — see note
-- above; distinct from public.projects, the main DCOS project registry)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_projects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  name        text not null,
  model_id    uuid references public.dwl_quantity_models(id),
  gfa         numeric(14,2),
  footprint   numeric(14,2),
  storeys     int,
  status      text not null default 'draft',
  created_at  timestamptz not null default now()
);

create index if not exists idx_dwl_projects_tenant on public.dwl_projects(tenant_id);
create index if not exists idx_dwl_projects_model on public.dwl_projects(model_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — tenant-scoped, normal CRUD (not append-only).
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_quantity_models enable row level security;
alter table public.dwl_model_factors   enable row level security;
alter table public.dwl_projects        enable row level security;

do $$ begin
  create policy dwl_quantity_models_tenant_select on public.dwl_quantity_models
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_quantity_models_tenant_insert on public.dwl_quantity_models
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_quantity_models_tenant_update on public.dwl_quantity_models
    for update using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_quantity_models_tenant_delete on public.dwl_quantity_models
    for delete using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_model_factors_tenant_select on public.dwl_model_factors
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_model_factors_tenant_insert on public.dwl_model_factors
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_model_factors_tenant_update on public.dwl_model_factors
    for update using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_model_factors_tenant_delete on public.dwl_model_factors
    for delete using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_projects_tenant_select on public.dwl_projects
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_projects_tenant_insert on public.dwl_projects
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_projects_tenant_update on public.dwl_projects
    for update using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_projects_tenant_delete on public.dwl_projects
    for delete using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Step 4.3 — dwl_v_project_estimate (SOP §10, exact SQL) — security_invoker
-- = true from the start.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.dwl_v_project_estimate
with (security_invoker = true)
as
select
  p.id as project_id,
  p.name,
  a.element_group,
  a.code as assembly_code,
  a.description,
  a.unit,
  round(case mf.driver
      when 'gfa'       then p.gfa * mf.factor
      when 'footprint' then p.footprint * mf.factor
      when 'storeys'   then p.storeys * mf.factor
      when 'fixed'     then mf.factor
      else p.gfa * mf.factor end, 2) as quantity,
  ar.net_direct_rate,
  round((case mf.driver
      when 'gfa'       then p.gfa * mf.factor
      when 'footprint' then p.footprint * mf.factor
      when 'storeys'   then p.storeys * mf.factor
      when 'fixed'     then mf.factor
      else p.gfa * mf.factor end) * ar.net_direct_rate, 0) as amount
from public.dwl_projects p
join public.dwl_model_factors mf on mf.model_id = p.model_id
join public.dwl_assemblies a on a.id = mf.assembly_id
join public.dwl_v_assembly_rates ar on ar.assembly_id = a.id;
