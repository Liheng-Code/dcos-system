-- Migration: 20260910000003_dwl_supplier_profiles_and_materials.sql
-- Purpose: Material Specification & Price Recording (DCOS-DS-12-012), Phase C-C.
--            - dwl_supplier_profiles  : 1:1 companion to dwl_suppliers with the
--              rich Supplier Master fields from Excel sheet 03_Supplier_Master.
--            - dwl_supplier_materials : supplier <-> material junction from
--              Excel sheet 04_Supplier_Material.
--
-- Depends on: 20260720000003_dwl_phase1_resources.sql (dwl_suppliers,
--             dwl_resources, set_updated_at), 20260720000017 (RLS pattern).
--
-- Design principle (DCOS-DS-12-012 §1.3): dwl_suppliers stays unchanged.
--   Rich attributes live in the companion. dwl_suppliers.rating (CHECK
--   A/B/C) is still set by the app by mapping the Excel 1-5 rating; the
--   raw sub-ratings live here as free text.
--
-- Idempotent: create table if not exists, guarded policies.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. dwl_supplier_profiles — 1:1 companion to dwl_suppliers.
--    PK *is* the FK. Mutable (normal tenant-scoped CRUD). No DELETE policy:
--    suppliers are deactivated, never deleted (matches the dwl_suppliers
--    deactivate pattern) so the companion is never orphaned by a delete.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_supplier_profiles (
  supplier_id           uuid primary key
                          references public.dwl_suppliers(id) on delete cascade,
  tenant_id             uuid not null,
  supplier_code         text,                    -- Excel: Supplier Code (e.g. SUP-001). NOT spine-unique — see DCOS-DS-12-012 §9 Q5
  trading_name          text,
  supplier_type         text,                    -- Manufacturer / Distributor / Importer / Local Supplier / Specialist Supplier / General Supplier
  contact_person        text,
  position              text,
  phone                 text,
  email                 text,
  address               text,
  country               text,
  province_city         text,
  website               text,
  product_categories    text[] not null default '{}',
  payment_terms         text,
  delivery_terms        text,
  credit_terms          text,
  lead_time_days        integer,
  moq                   numeric(14,4),
  reliability_rating    text,                    -- free scale, kept as text
  quality_rating        text,
  price_competitiveness text,
  lifecycle_status      text not null default 'active'
                          check (lifecycle_status in ('active','inactive','draft','archived')),
  notes                 text,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_dwl_supplier_profiles_tenant
  on public.dwl_supplier_profiles(tenant_id);
create index if not exists idx_dwl_supplier_profiles_code
  on public.dwl_supplier_profiles(tenant_id, supplier_code);

drop trigger if exists set_dwl_supplier_profiles_updated_at on public.dwl_supplier_profiles;
create trigger set_dwl_supplier_profiles_updated_at
  before update on public.dwl_supplier_profiles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. dwl_supplier_materials — supplier <-> material junction.
--    Normal tenant-scoped CRUD incl. DELETE (a link can be removed;
--    is_active = false is preferred for history).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_supplier_materials (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  supplier_id           uuid not null references public.dwl_suppliers(id) on delete cascade,
  resource_id           uuid not null references public.dwl_resources(id) on delete cascade,
  supplier_product_code text,
  supplier_product_name text,
  brand                 text,
  manufacturer          text,
  specification         text,                    -- supplier-specific spec reference
  standard              text,
  package_size          text,
  moq                   numeric(14,4),
  lead_time_days        integer,
  is_active             boolean not null default true,
  notes                 text,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint dwl_supplier_materials_pair_key unique (supplier_id, resource_id)
);

create index if not exists idx_dwl_supplier_materials_tenant
  on public.dwl_supplier_materials(tenant_id);
create index if not exists idx_dwl_supplier_materials_supplier
  on public.dwl_supplier_materials(supplier_id);
create index if not exists idx_dwl_supplier_materials_resource
  on public.dwl_supplier_materials(resource_id);

drop trigger if exists set_dwl_supplier_materials_updated_at on public.dwl_supplier_materials;
create trigger set_dwl_supplier_materials_updated_at
  before update on public.dwl_supplier_materials
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_supplier_profiles  enable row level security;
alter table public.dwl_supplier_materials enable row level security;

-- dwl_supplier_profiles: select / insert / update (no delete — deactivate pattern)
do $$ begin
  create policy dwl_supplier_profiles_tenant_select on public.dwl_supplier_profiles
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_supplier_profiles_tenant_insert on public.dwl_supplier_profiles
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_supplier_profiles_tenant_update on public.dwl_supplier_profiles
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- dwl_supplier_materials: full CRUD
do $$ begin
  create policy dwl_supplier_materials_tenant_select on public.dwl_supplier_materials
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_supplier_materials_tenant_insert on public.dwl_supplier_materials
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_supplier_materials_tenant_update on public.dwl_supplier_materials
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_supplier_materials_tenant_delete on public.dwl_supplier_materials
    for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. dwl_v_supplier_materials — convenience view joining the junction to
--    supplier name + material code/description, for the Material detail
--    "Suppliers" tab and the Supplier detail "Materials" tab.
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.dwl_v_supplier_materials;

create view public.dwl_v_supplier_materials
with (security_invoker = true)
as
select
  sm.id,
  sm.tenant_id,
  sm.supplier_id,
  s.name                  as supplier_name,
  sp.supplier_code,
  sm.resource_id,
  r.code                  as material_code,
  coalesce(a.material_name, r.description) as material_name,
  r.unit                  as material_unit,
  sm.supplier_product_code,
  sm.supplier_product_name,
  sm.brand,
  sm.manufacturer,
  sm.specification,
  sm.standard,
  sm.package_size,
  sm.moq,
  sm.lead_time_days,
  sm.is_active,
  sm.notes,
  sm.created_at,
  sm.updated_at
from public.dwl_supplier_materials sm
join public.dwl_suppliers s on s.id = sm.supplier_id
left join public.dwl_supplier_profiles sp on sp.supplier_id = sm.supplier_id
join public.dwl_resources r on r.id = sm.resource_id
left join public.dwl_material_attributes a on a.resource_id = sm.resource_id;

comment on view public.dwl_v_supplier_materials is
  'Cost & Rate Library — supplier<->material links resolved to names/codes '
  '(DCOS-DS-12-012 Phase C-C).';
