-- Migration: 20260720000008_dwl_phase3_assemblies.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 3, Level 3:
--          Assemblies. Implements SOP §9 Step 3.1 (tables) and the
--          dwl_v_assembly_rates view (same section).
-- Depends on: 20260720000006_dwl_phase2_work_items.sql (dwl_work_items,
--             dwl_v_work_item_rates), profiles (already exists)
-- Scope: Phase 3 structure only. NO assembly data is seeded by this
--        migration — see the report accompanying this change. Only one
--        real work item exists in the library (03.02.010), so none of the
--        SOP §9 Step 3.3 starter assemblies (which need blockwork/RC
--        stiffener/plaster/paint work items that don't exist yet) can be
--        seeded honestly. This stays blocked on the same missing
--        Estimator work-item data flagged after Phase 2, and by extension
--        blocks Phase 4 (parametric models), which consumes assemblies.
-- Idempotent: safe to re-run (create table if not exists, create index if
--          not exists, guarded policy creation).
--
-- RLS note: like dwl_work_items/dwl_work_item_resources (Phase 2), these
-- are maintained/corrected over time, not append-only — normal
-- tenant-scoped INSERT/UPDATE/DELETE policies.
--
-- Security: dwl_v_assembly_rates created WITH (security_invoker = true)
-- from the start, same as the Phase 2 views.

-- ─────────────────────────────────────────────────────────────────────────
-- Step 3.1 — dwl_assemblies
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_assemblies (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  code             text not null,                 -- e.g. ASM-WALL-010
  element_group    text not null,                  -- wall / slab / roof / door / finish ...
  description      text not null,                  -- MUST state the measurement rule
  unit             text not null,                  -- usually m2 or no
  measurement_rule text not null,                  -- e.g. 'Net area, openings deducted'
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  constraint dwl_assemblies_code_key unique (code)
);

create index if not exists idx_dwl_assemblies_tenant on public.dwl_assemblies(tenant_id);
create index if not exists idx_dwl_assemblies_element_group on public.dwl_assemblies(tenant_id, element_group);

-- ─────────────────────────────────────────────────────────────────────────
-- Step 3.1 — dwl_assembly_items
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_assembly_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  assembly_id   uuid not null references public.dwl_assemblies(id) on delete cascade,
  work_item_id  uuid not null references public.dwl_work_items(id),
  qty_per_unit  numeric(14,6) not null check (qty_per_unit > 0),  -- DESIGN ratio, not waste
  basis_note    text not null,
  sort_order    int not null default 0,
  constraint dwl_assembly_items_assembly_work_item_key unique (assembly_id, work_item_id)
);

create index if not exists idx_dwl_assembly_items_tenant on public.dwl_assembly_items(tenant_id);
create index if not exists idx_dwl_assembly_items_assembly on public.dwl_assembly_items(assembly_id);
create index if not exists idx_dwl_assembly_items_work_item on public.dwl_assembly_items(work_item_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — tenant-scoped, normal CRUD (not append-only).
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_assemblies    enable row level security;
alter table public.dwl_assembly_items enable row level security;

do $$ begin
  create policy dwl_assemblies_tenant_select on public.dwl_assemblies
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_assemblies_tenant_insert on public.dwl_assemblies
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_assemblies_tenant_update on public.dwl_assemblies
    for update using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_assemblies_tenant_delete on public.dwl_assemblies
    for delete using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_assembly_items_tenant_select on public.dwl_assembly_items
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_assembly_items_tenant_insert on public.dwl_assembly_items
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_assembly_items_tenant_update on public.dwl_assembly_items
    for update using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_assembly_items_tenant_delete on public.dwl_assembly_items
    for delete using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- dwl_v_assembly_rates (SOP §9, exact SQL) — security_invoker = true
-- from the start.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.dwl_v_assembly_rates
with (security_invoker = true)
as
select
  a.id as assembly_id,
  a.code,
  a.element_group,
  a.description,
  a.unit,
  sum(ai.qty_per_unit * wir.net_direct_rate) as net_direct_rate,
  bool_or(wir.has_expired_price) as has_expired_price
from public.dwl_assemblies a
join public.dwl_assembly_items ai on ai.assembly_id = a.id
join public.dwl_v_work_item_rates wir on wir.work_item_id = ai.work_item_id
where a.is_active
group by a.id, a.code, a.element_group, a.description, a.unit;
