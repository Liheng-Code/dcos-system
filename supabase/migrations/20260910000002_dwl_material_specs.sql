-- Migration: 20260910000002_dwl_material_specs.sql
-- Purpose: Material Specification & Price Recording (DCOS-DS-12-012), Phase C-B.
--          Adds the Material Specification library:
--            - dwl_material_specs         (specification identity, mutable)
--            - dwl_material_spec_revisions (dated revisions, APPEND-ONLY)
--            - dwl_v_current_material_spec (current revision per material)
--          and recreates dwl_v_materials to append the specification columns.
--          Realises Excel sheet 02_Material_Specification and master-prompt §4.
--
-- Depends on: 20260910000001_dwl_material_attributes.sql (dwl_v_materials),
--             20260720000003_dwl_phase1_resources.sql (dwl_resources,
--             set_updated_at), 20260720000017 (RLS pattern),
--             20260720000005 (dwl_v_current_prices security_invoker).
--
-- Append-only design (mirrors dwl_resource_prices, QS-SOP-002 §7 Step 1.4.1):
--   dwl_material_spec_revisions gets SELECT + INSERT policies only. With RLS
--   enabled and no UPDATE/DELETE policy, edits and deletes are rejected
--   outright — a spec change is a NEW revision row, never an edit.
--
-- Idempotent: create table if not exists, guarded policies, drop view before
--   create.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. dwl_material_specs — specification identity (mutable: name may be
--    corrected; the substance lives in revisions).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_material_specs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  spec_code    text not null,                    -- Excel: Specification ID base, e.g. SPEC-CLG-001
  resource_id  uuid not null references public.dwl_resources(id) on delete cascade,
  spec_name    text not null,                    -- Excel: Specification Name
  discipline   text,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint dwl_material_specs_code_key unique (tenant_id, spec_code)
);

create index if not exists idx_dwl_material_specs_tenant on public.dwl_material_specs(tenant_id);
create index if not exists idx_dwl_material_specs_resource on public.dwl_material_specs(resource_id);

drop trigger if exists set_dwl_material_specs_updated_at on public.dwl_material_specs;
create trigger set_dwl_material_specs_updated_at
  before update on public.dwl_material_specs
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. dwl_material_spec_revisions — APPEND-ONLY dated revisions.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_material_spec_revisions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  spec_id               uuid not null references public.dwl_material_specs(id) on delete cascade,
  revision_no           text not null,           -- Excel: Revision, e.g. R01, R02
  standard              text,
  grade                 text,
  strength_performance  text,                    -- Excel: Strength / Performance
  dimension             text,
  thickness             text,
  density               text,
  unit                  text,
  manufacturer          text,
  brand                 text,
  technical_req         text,                    -- Excel: Technical Requirements
  installation_req      text,                    -- Excel: Installation Requirements
  testing_req           text,                    -- Excel: Testing Requirements
  approval_req          text,                    -- Excel: Approval Requirements
  effective_date        date not null,
  expiry_date           date,                    -- null = open-ended
  status                text not null default 'active'
                          check (status in ('draft','active','superseded','expired')),
  source_document       text,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  constraint dwl_material_spec_revisions_no_key unique (spec_id, revision_no)
);

create index if not exists idx_dwl_material_spec_revisions_tenant
  on public.dwl_material_spec_revisions(tenant_id);
create index if not exists idx_dwl_material_spec_revisions_spec
  on public.dwl_material_spec_revisions(spec_id, effective_date desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_material_specs          enable row level security;
alter table public.dwl_material_spec_revisions enable row level security;

-- dwl_material_specs: tenant-scoped select/insert/update/delete.
do $$ begin
  create policy dwl_material_specs_tenant_select on public.dwl_material_specs
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_material_specs_tenant_insert on public.dwl_material_specs
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_material_specs_tenant_update on public.dwl_material_specs
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_material_specs_tenant_delete on public.dwl_material_specs
    for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- dwl_material_spec_revisions: APPEND-ONLY — SELECT + INSERT only.
-- No UPDATE / DELETE policy: with RLS on, both are rejected for all
-- non-superuser roles. This is the DB-level guarantee behind "a spec
-- change is a new revision, never an edit".
do $$ begin
  create policy dwl_material_spec_revisions_tenant_select on public.dwl_material_spec_revisions
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_material_spec_revisions_tenant_insert on public.dwl_material_spec_revisions
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. dwl_v_current_material_spec — the current revision per material.
--    "Current" = latest effective_date whose effective_date <= today and
--    (expiry_date is null or expiry_date >= today). Mirrors the
--    distinct-on idiom of dwl_v_current_prices.
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.dwl_v_current_material_spec;

create view public.dwl_v_current_material_spec
with (security_invoker = true)
as
select distinct on (s.resource_id)
  s.resource_id,
  s.id                as spec_id,
  s.spec_code,
  s.spec_name,
  rev.id              as revision_id,
  rev.revision_no,
  rev.standard,
  rev.grade,
  rev.strength_performance,
  rev.dimension,
  rev.thickness,
  rev.density,
  rev.unit,
  rev.manufacturer,
  rev.brand,
  rev.technical_req,
  rev.installation_req,
  rev.testing_req,
  rev.approval_req,
  rev.effective_date,
  rev.expiry_date,
  rev.status,
  rev.source_document
from public.dwl_material_specs s
join public.dwl_material_spec_revisions rev on rev.spec_id = s.id
where rev.effective_date <= current_date
  and (rev.expiry_date is null or rev.expiry_date >= current_date)
order by s.resource_id, rev.effective_date desc, rev.created_at desc;

comment on view public.dwl_v_current_material_spec is
  'Cost & Rate Library — current specification revision per material '
  '(DCOS-DS-12-012 Phase C-B). One row per resource_id: the latest '
  'effective, non-expired revision.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Recreate dwl_v_materials to append specification columns.
--    Same body as Phase C-A plus a left join to
--    dwl_v_current_material_spec. Drop+create (leaf view, no dependents).
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
  cp.unit_price              as current_unit_price,
  cp.currency                as current_currency,
  cp.valid_from              as current_price_valid_from,
  cp.quote_valid_until       as current_price_valid_until,
  cp.source_type             as current_price_source_type,
  cp.supplier_name           as current_supplier_name,
  cp.is_expired              as current_price_is_expired,
  -- specification columns (Phase C-B)
  ms.spec_code               as current_spec_code,
  ms.spec_name               as current_spec_name,
  ms.revision_no             as current_spec_revision_no,
  ms.effective_date          as current_spec_effective_date,
  ms.standard                as current_spec_standard,
  ms.grade                   as current_spec_grade,
  ms.status                  as current_spec_status
from public.dwl_resources r
left join public.dwl_material_attributes a on a.resource_id = r.id
left join public.dwl_v_current_prices cp on cp.resource_id = r.id
left join public.dwl_v_current_material_spec ms on ms.resource_id = r.id
where r.category = 'material';

comment on view public.dwl_v_materials is
  'Cost & Rate Library — Materials browse view (DCOS-DS-12-012 Phase C-B). '
  'dwl_resources (category=material) + dwl_material_attributes + current '
  'price + current specification revision. Phase C-D appends effective-cost '
  'columns.';
