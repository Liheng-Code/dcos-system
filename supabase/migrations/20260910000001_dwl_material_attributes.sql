-- Migration: 20260910000001_dwl_material_attributes.sql
-- Purpose: Material Specification & Price Recording (DCOS-DS-12-012), Phase C-A.
--          Adds a 1:1 companion table `dwl_material_attributes` to the QS-SOP-002
--          Level-1 spine table `dwl_resources`, carrying the rich Material Master
--          attributes from the Cost & Rate Library Excel template
--          (01_Material_Master: subcategory, discipline, brand, model,
--          manufacturer, finish, dimension, tags, lifecycle status, ...).
--          Also adds the read-only browse view `dwl_v_materials`.
--
-- Depends on: 20260720000003_dwl_phase1_resources.sql (dwl_resources,
--             set_updated_at, dwl_v_current_prices),
--             20260720000005_dwl_v_current_prices_security_invoker.sql,
--             20260720000017_fix_dwl_tenant_isolation.sql (the CURRENT RLS
--             pattern: tenant_id = (select company_id from public.profiles
--             where id = auth.uid()) — NOT the broken auth.jwt() claim),
--             20260722000008_fix_dwl_resources_delete.sql,
--             public.profiles(company_id), public.companies.
--
-- Design principle (DCOS-DS-12-012 §1.3): the QS-SOP-002 spine
--   (dwl_resources, dwl_suppliers, dwl_resource_prices, dwl_v_current_prices)
--   and its signed Phase-1 acceptance tests stay byte-for-byte unchanged.
--   Everything new is a companion table, a nullable column, or a new view.
--   This migration only CREATEs new objects; it does not ALTER any existing
--   table, column, policy, or view.
--
-- Scope: Phase C-A only. Specifications (C-B), supplier enrichment (C-C),
--        price breakdown (C-D), workflow (C-E), quotations (C-F) are separate
--        migrations. `dwl_v_materials` is created here WITHOUT specification
--        columns; C-B drops and recreates it to add them.
--
-- Idempotent: create table if not exists, create index if not exists,
--        guarded policy creation, drop view if exists before create.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. dwl_material_attributes — 1:1 companion to dwl_resources
--    PK *is* the FK. One row per material (category = 'material').
--    Mutable (normal tenant-scoped CRUD) — this is descriptive data that
--    is corrected over time, not append-only history.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_material_attributes (
  resource_id          uuid primary key
                         references public.dwl_resources(id) on delete cascade,
  tenant_id            uuid not null,
  material_name        text,                      -- display name; spine `description` carries the price-driving spec
  subcategory          text,                      -- Excel: Subcategory (e.g. "Suspended Ceiling")
  discipline           text,                      -- Excel: Discipline (e.g. "Architectural")
  material_type        text,                      -- Excel: Material Type (e.g. "Ceiling System")
  tech_spec_summary    text,                      -- Excel: Technical Specification (Summary)
  standard             text,                      -- Excel: Standard (e.g. "EN 520 / Local")
  grade                text,
  brand                text,
  model                text,
  manufacturer         text,
  package_size         text,                      -- e.g. "Sheet", "Bag"
  dimension            text,                      -- e.g. "12.5mm thk", "1200x600"
  thickness            text,
  weight               text,
  color_finish         text,                      -- Excel: Color / Finish
  application_element   text,                      -- Excel: Application / Related Element
  lifecycle_status     text not null default 'active'
                         check (lifecycle_status in
                           ('draft','active','superseded','archived','obsolete')),
  tags                 text[] not null default '{}',   -- Excel: Tags (';'-split)
  legacy_code          text,                      -- template MAT-CL-* code, for spreadsheet cross-reference
  notes                text,                      -- spine has no notes column
  updated_by           uuid references public.profiles(id),   -- Excel: Modified By
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_dwl_material_attributes_tenant
  on public.dwl_material_attributes(tenant_id);
create index if not exists idx_dwl_material_attributes_legacy_code
  on public.dwl_material_attributes(tenant_id, legacy_code);

-- set_updated_at() was defined in 20260720000003_dwl_phase1_resources.sql.
drop trigger if exists set_dwl_material_attributes_updated_at on public.dwl_material_attributes;
create trigger set_dwl_material_attributes_updated_at
  before update on public.dwl_material_attributes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS — tenant-scoped, using the CURRENT working pattern from
--    20260720000017 (profiles subquery, NOT the auth.jwt() claim which was
--    found broken and replaced). Full CRUD: the parent dwl_resources allows
--    tenant-scoped DELETE (20260722000008) and cascades to this row, so a
--    matching DELETE policy is provided here for direct deletes too.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_material_attributes enable row level security;

do $$ begin
  create policy dwl_material_attributes_tenant_select on public.dwl_material_attributes
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_material_attributes_tenant_insert on public.dwl_material_attributes
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_material_attributes_tenant_update on public.dwl_material_attributes
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_material_attributes_tenant_delete on public.dwl_material_attributes
    for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. dwl_v_materials — browse/search view for the Materials list screen.
--    security_invoker = true from the start (Phase-2 lesson, not the
--    Phase-1 retrofit): RLS on the underlying dwl_* tables is enforced for
--    the querying user.
--
--    This version has NO specification columns — dwl_v_current_material_spec
--    does not exist until Phase C-B, which drops and recreates this view to
--    append them. Drop+create (not create-or-replace) is used because this
--    view is a leaf with no dependents, so column-set changes across phases
--    are safe.
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.dwl_v_materials;

create view public.dwl_v_materials
with (security_invoker = true)
as
select
  r.id                       as resource_id,
  r.code,
  r.category,
  coalesce(a.material_name, r.description)  as material_name,
  r.description,
  r.unit,
  r.spec_reference,
  r.is_active,
  r.created_at,
  r.updated_at,
  a.subcategory,
  a.discipline,
  a.material_type,
  a.tech_spec_summary,
  a.standard,
  a.grade,
  a.brand,
  a.model,
  a.manufacturer,
  a.package_size,
  a.dimension,
  a.thickness,
  a.weight,
  a.color_finish,
  a.application_element,
  a.lifecycle_status,
  a.tags,
  a.legacy_code,
  a.notes,
  -- current price (latest by valid_from) from the existing spine view
  cp.unit_price              as current_unit_price,
  cp.currency                as current_currency,
  cp.valid_from              as current_price_valid_from,
  cp.quote_valid_until       as current_price_valid_until,
  cp.source_type             as current_price_source_type,
  cp.supplier_name           as current_supplier_name,
  cp.is_expired              as current_price_is_expired
from public.dwl_resources r
left join public.dwl_material_attributes a on a.resource_id = r.id
left join public.dwl_v_current_prices cp on cp.resource_id = r.id
where r.category = 'material';

comment on view public.dwl_v_materials is
  'Cost & Rate Library — Materials browse view (DCOS-DS-12-012 Phase C-A). '
  'dwl_resources (category=material) left-joined with dwl_material_attributes '
  'and the current price from dwl_v_current_prices. Phase C-B appends '
  'specification columns; Phase C-D appends effective-cost columns.';
