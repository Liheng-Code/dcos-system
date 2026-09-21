-- Migration: 20260910000034_dwl_subcon_rates_schema.sql
-- Purpose: Cost & Rate Library — Subcontractor Trade Rates Library (plan
--          inside-module-quantity-surveying-delegated-valley.md). Adds the
--          companion table + columns + view the new module needs, all
--          additive on top of the existing QS-SOP-002 spine (dwl_resources,
--          dwl_suppliers, dwl_resource_prices).
--
-- Design: a "Subcontractor" is structurally identical to a "Supplier" (a
--   company: name, contact, rating, terms, a free-text code) — rather than
--   duplicate dwl_suppliers/dwl_supplier_profiles (RLS, triggers, the whole
--   pattern) for something structurally the same, this adds ONE
--   discriminator column so the existing company registry serves both
--   Supplier Master (vendor_kind='material_supplier', the default — all 19
--   existing rows are unaffected) and the new Subcontractor Rates screen
--   (vendor_kind='subcontractor'). "Trade" is a per-item attribute (mirrors
--   dwl_material_attributes but lean — this module needs nothing else).
--   "Rate Type" is genuinely missing from dwl_resource_prices and useful
--   beyond subcon (Labor/Equipment rates later), so it's added there
--   directly rather than duplicated per-module.
--
-- Depends on: 20260720000003_dwl_phase1_resources.sql (dwl_resources,
--   dwl_suppliers, dwl_resource_prices, set_updated_at),
--   20260910000003_dwl_supplier_profiles_and_materials.sql
--   (dwl_supplier_profiles).
--
-- Additive only: no existing column, table, or view is altered in meaning.
-- Idempotent: guarded ADD COLUMN, create table/index if not exists, guarded
--   policy creation, drop+create view (leaf, no dependents).

-- ── 1. dwl_supplier_profiles.vendor_kind — company registry discriminator ─
alter table public.dwl_supplier_profiles
  add column if not exists vendor_kind text not null default 'material_supplier';

do $$ begin
  alter table public.dwl_supplier_profiles
    add constraint dwl_supplier_profiles_vendor_kind_check
    check (vendor_kind in ('material_supplier', 'subcontractor'));
exception when duplicate_object then null; end $$;

comment on column public.dwl_supplier_profiles.vendor_kind is
  'Which registry this company belongs to: material_supplier (Supplier Master) '
  'or subcontractor (Subcontractor Trade Rates Library). Same underlying '
  'dwl_suppliers/dwl_supplier_profiles pattern for both — company data shape '
  'is identical, only the screen/filter differs.';

-- ── 2. dwl_resource_prices.rate_type — Unit Rate / Lump Sum / Day Rate, etc.
alter table public.dwl_resource_prices
  add column if not exists rate_type text;

comment on column public.dwl_resource_prices.rate_type is
  'Free-text rate basis (e.g. "Unit Rate", "Lump Sum", "Day Rate"). Nullable — '
  'not every resource category uses it yet. Introduced for Subcontractor '
  'Trade Rates, reusable by Labor/Equipment rates later.';

-- ── 3. dwl_subcon_attributes — 1:1 companion to dwl_resources for
--      category='subcon' items. Mirrors dwl_material_attributes's shape,
--      minimal (mutable, normal tenant-scoped CRUD — descriptive data).
create table if not exists public.dwl_subcon_attributes (
  resource_id      uuid primary key
                     references public.dwl_resources(id) on delete cascade,
  tenant_id        uuid not null,
  trade            text,                    -- e.g. "Waterproofing & Joint Sealing"
  lifecycle_status text not null default 'active'
                     check (lifecycle_status in ('active','inactive','draft','archived')),
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_dwl_subcon_attributes_tenant on public.dwl_subcon_attributes(tenant_id);
create index if not exists idx_dwl_subcon_attributes_trade on public.dwl_subcon_attributes(trade);

drop trigger if exists set_dwl_subcon_attributes_updated_at on public.dwl_subcon_attributes;
create trigger set_dwl_subcon_attributes_updated_at
  before update on public.dwl_subcon_attributes
  for each row execute function public.set_updated_at();

alter table public.dwl_subcon_attributes enable row level security;

do $$ begin
  create policy dwl_subcon_attributes_tenant_select on public.dwl_subcon_attributes
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_subcon_attributes_tenant_insert on public.dwl_subcon_attributes
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_subcon_attributes_tenant_update on public.dwl_subcon_attributes
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_subcon_attributes_tenant_delete on public.dwl_subcon_attributes
    for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- ── 4. dwl_v_subcon_rates — one row per commercial rate (price-history
--      listing, not current-price-only), matching the mockup's main table.
drop view if exists public.dwl_v_subcon_rates;

create view public.dwl_v_subcon_rates
with (security_invoker = true)
as
select
  p.id                     as price_id,
  p.tenant_id,
  r.id                     as resource_id,
  r.code                   as resource_code,
  r.description            as item_description,
  r.unit,
  a.trade,
  s.id                     as subcontractor_id,
  s.name                   as subcontractor_name,
  sp.supplier_code         as subcontractor_code,
  p.unit_price             as rate,
  p.currency,
  p.rate_type,
  p.valid_from             as effective_date,
  extract(year from p.valid_from)::int as rate_year,
  p.notes                  as scope_notes,
  p.source_type,
  p.created_at
from public.dwl_resource_prices p
join public.dwl_resources r on r.id = p.resource_id and r.category = 'subcon'
left join public.dwl_subcon_attributes a on a.resource_id = r.id
left join public.dwl_suppliers s on s.id = p.supplier_id
left join public.dwl_supplier_profiles sp on sp.supplier_id = s.id;

comment on view public.dwl_v_subcon_rates is
  'Subcontractor Trade Rates Library browse view — one row per commercial '
  'rate (dwl_resource_prices entry) for category=subcon resources, joined '
  'to trade + subcontractor. Distinct from dwl_v_materials/dwl_v_current_prices '
  '(current-price-only): this intentionally shows full year-over-year history.';
