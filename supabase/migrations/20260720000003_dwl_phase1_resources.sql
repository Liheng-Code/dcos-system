-- Migration: 20260720000003_dwl_phase1_resources.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 1, Level 1:
--          Resources, Suppliers, and append-only Price History.
--          Implements SOP §7 Step 1.1 (tables), Step 1.1a (RLS), Step 1.2
--          (dwl_v_current_prices view).
-- Depends on: profiles (already exists)
-- Scope: Phase 0 + Phase 1 only, per QS-SOP-002. Phase 2 onward (work items,
--        assemblies, parametric models) is explicitly out of scope for this
--        migration. No legacy table (company_rate_library, rate_libraries,
--        qs_cost_items, tender_unit_rates, tender_price_list_items,
--        unit_rate_library) is migrated, repointed, or altered here — that
--        is a separately-gated future phase per SOP §12.1.
-- Idempotent: safe to re-run against an environment where these objects
--          already exist (create table if not exists, create index if not
--          exists, guarded policy creation).

-- ─────────────────────────────────────────────────────────────────────────
-- Step 1.1 — Suppliers
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_suppliers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  name        text not null,
  contact     text,
  rating      text check (rating in ('A','B','C')) default 'B',
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index if not exists idx_dwl_suppliers_tenant on public.dwl_suppliers(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Step 1.1 — Resource catalogue (identity — changes rarely, never deleted)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_resources (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  code           text not null,                     -- e.g. M-CON-001, per §6 D2 coding standard
  category       text not null check (category in ('material','labor','equipment','subcon')),
  description    text not null,                      -- must include price-driving spec (§7 Step 1.4.5)
  unit           text not null,                       -- from §6 D3 locked unit dictionary
  spec_reference text,                                -- e.g. ASTM C94
  is_active      boolean not null default true,       -- deactivate, never delete
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint dwl_resources_code_key unique (code)
);

create index if not exists idx_dwl_resources_tenant on public.dwl_resources(tenant_id);
create index if not exists idx_dwl_resources_category on public.dwl_resources(tenant_id, category);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_dwl_resources_updated_at on public.dwl_resources;
create trigger set_dwl_resources_updated_at
  before update on public.dwl_resources
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Step 1.1 — Price history (append-only — never update, never delete)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_resource_prices (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  resource_id       uuid not null references public.dwl_resources(id),
  supplier_id       uuid references public.dwl_suppliers(id),
  unit_price        numeric(14,4) not null check (unit_price >= 0),
  currency          text not null default 'USD',
  valid_from        date not null,
  quote_valid_until date,                             -- null = open-ended (surveys, actuals)
  source_type       text not null check (source_type in
                      ('quotation','purchase','market_survey','estimate')),
  location          text default 'Phnom Penh',
  notes             text,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);

create index if not exists idx_dwl_resource_prices_resource on public.dwl_resource_prices (resource_id, valid_from desc);
create index if not exists idx_dwl_resource_prices_tenant on public.dwl_resource_prices(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Step 1.1a — RLS policies (mandatory, not optional)
--
-- Every existing rate-library table in DCOS ships with permissive
-- USING (true) / WITH CHECK (true) RLS (SOP-QS-Module.md §13 GAP-01,
-- Critical: "RBAC not enforced on QS components"). This module must not
-- repeat that pattern. All dwl_* tables are tenant-scoped via
-- auth.jwt() ->> 'tenant_id' (injected by public.custom_access_token_hook,
-- see 20260623000001_add_company_id_to_profiles_jwt_hook.sql).
--
-- dwl_resource_prices is append-only by design (§7 Step 1.4.1: "a price
-- change = a new row with a new valid_from; updating or deleting price
-- rows is prohibited"): no UPDATE/DELETE policy is created for it. With
-- RLS enabled and no matching policy, UPDATE/DELETE are rejected outright
-- for all non-superuser roles — this is the DB-level guarantee behind the
-- append-only rule.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_suppliers       enable row level security;
alter table public.dwl_resources       enable row level security;
alter table public.dwl_resource_prices enable row level security;

-- dwl_suppliers: tenant-scoped select/insert/update. No delete policy —
-- suppliers are deactivated (is_active = false), never deleted.
do $$ begin
  create policy dwl_suppliers_tenant_select on public.dwl_suppliers
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_suppliers_tenant_insert on public.dwl_suppliers
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_suppliers_tenant_update on public.dwl_suppliers
    for update using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

-- dwl_resources: tenant-scoped select/insert/update. No delete policy —
-- resources are deactivated (is_active = false), never deleted (Step 1.1
-- comment: "deactivate, never delete").
do $$ begin
  create policy dwl_resources_tenant_select on public.dwl_resources
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_resources_tenant_write on public.dwl_resources
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_resources_tenant_update on public.dwl_resources
    for update using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

-- dwl_resource_prices: tenant-scoped select/insert ONLY. Append-only
-- enforcement: no UPDATE/DELETE policy is created (see comment block above).
do $$ begin
  create policy dwl_resource_prices_tenant_select on public.dwl_resource_prices
    for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_resource_prices_tenant_insert on public.dwl_resource_prices
    for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Step 1.2 — "Current price" view
-- Current price of a resource = latest valid_from row, preferring
-- quotation/purchase over survey is achieved by ordering on valid_from
-- then created_at; explicit source-type preference is left to Phase 2+
-- consumers if a tie needs disambiguation beyond recency.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.dwl_v_current_prices as
select distinct on (rp.resource_id)
  rp.resource_id,
  r.code,
  r.description,
  r.unit,
  rp.unit_price,
  rp.currency,
  rp.valid_from,
  rp.quote_valid_until,
  rp.source_type,
  s.name as supplier_name,
  (rp.quote_valid_until is not null
   and rp.quote_valid_until < current_date) as is_expired
from public.dwl_resource_prices rp
join public.dwl_resources r on r.id = rp.resource_id
left join public.dwl_suppliers s on s.id = rp.supplier_id
where r.is_active
order by rp.resource_id, rp.valid_from desc, rp.created_at desc;
