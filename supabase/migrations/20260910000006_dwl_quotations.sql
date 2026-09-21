-- Migration: 20260910000006_dwl_quotations.sql
-- Purpose: Material Specification & Price Recording (DCOS-DS-12-012), Phase C-F.
--          Lightweight, tenant-scoped quotation records mirroring Excel
--          sheets 06_Quotation_Header / 07_Quotation_Items, plus a nullable
--          FK from prices/submissions to the quotation.
--
--          NOT linked to procurement_quotations (DCOS-DS-12-012 §3 D5:
--          that table has no tenant_id, permissive RLS, and mandatory
--          rfq_id/total_amount). An optional procurement_quotation_id
--          bridge column is provided but never a hard dependency.
--
-- Depends on: 20260720000003 (dwl_suppliers, dwl_resources, set_updated_at),
--             20260910000004 (dwl_resource_prices), 20260910000005
--             (dwl_price_submissions), 20260720000017 (RLS pattern).
--
-- Idempotent: create table/column if not exists, guarded policies.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. dwl_quotations — header
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_quotations (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  quote_no               text not null,                  -- Excel: Quotation Number (e.g. QT-2026-001)
  supplier_id            uuid references public.dwl_suppliers(id),
  project_code           text,
  rfq_ref                text,                            -- Excel: RFQ Number (free text)
  quote_date             date,
  valid_until            date,
  currency               text not null default 'USD',
  payment_terms          text,
  delivery_terms         text,
  contact_person         text,
  source_document        text,
  status                 text not null default 'under_review'
                           check (status in ('draft','under_review','approved','superseded','expired','rejected')),
  notes                  text,
  procurement_quotation_id uuid,                          -- optional bridge only (no FK — different RLS boundary)
  created_by             uuid references public.profiles(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint dwl_quotations_no_key unique (tenant_id, quote_no)
);

create index if not exists idx_dwl_quotations_tenant   on public.dwl_quotations(tenant_id);
create index if not exists idx_dwl_quotations_supplier on public.dwl_quotations(supplier_id);

drop trigger if exists set_dwl_quotations_updated_at on public.dwl_quotations;
create trigger set_dwl_quotations_updated_at
  before update on public.dwl_quotations
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. dwl_quotation_items — lines
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_quotation_items (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  quotation_id          uuid not null references public.dwl_quotations(id) on delete cascade,
  line_no               integer not null,
  resource_id           uuid references public.dwl_resources(id) on delete set null,
  supplier_product_code text,
  description           text,
  spec_ref              text,
  quantity              numeric(14,4),
  unit                  text,
  unit_price            numeric(14,4) not null default 0,
  discount              numeric(14,4) not null default 0,
  delivery              numeric(14,4) not null default 0,
  handling              numeric(14,4) not null default 0,
  other_charges         numeric(14,4) not null default 0,
  tax                   numeric(14,4) not null default 0,
  effective_price       numeric(14,4) generated always as (
                          unit_price - coalesce(discount,0) + coalesce(delivery,0)
                          + coalesce(handling,0) + coalesce(other_charges,0) + coalesce(tax,0)
                        ) stored,
  lead_time_days        integer,
  remarks               text,
  created_at            timestamptz not null default now(),
  constraint dwl_quotation_items_line_key unique (quotation_id, line_no)
);

create index if not exists idx_dwl_quotation_items_tenant on public.dwl_quotation_items(tenant_id);
create index if not exists idx_dwl_quotation_items_quote  on public.dwl_quotation_items(quotation_id);
create index if not exists idx_dwl_quotation_items_resource on public.dwl_quotation_items(resource_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Nullable FK from prices / submissions to the quotation.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_resource_prices
  add column if not exists dwl_quotation_id uuid references public.dwl_quotations(id) on delete set null;
alter table public.dwl_price_submissions
  add column if not exists dwl_quotation_id uuid references public.dwl_quotations(id) on delete set null;

create index if not exists idx_dwl_resource_prices_quotation on public.dwl_resource_prices(dwl_quotation_id);
create index if not exists idx_dwl_price_submissions_quotation on public.dwl_price_submissions(dwl_quotation_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS — full tenant-scoped CRUD on both (quotations are corrected over
--    time; not append-only).
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_quotations      enable row level security;
alter table public.dwl_quotation_items enable row level security;

do $$ begin
  create policy dwl_quotations_tenant_select on public.dwl_quotations
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_quotations_tenant_insert on public.dwl_quotations
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_quotations_tenant_update on public.dwl_quotations
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_quotations_tenant_delete on public.dwl_quotations
    for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_quotation_items_tenant_select on public.dwl_quotation_items
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_quotation_items_tenant_insert on public.dwl_quotation_items
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_quotation_items_tenant_update on public.dwl_quotation_items
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_quotation_items_tenant_delete on public.dwl_quotation_items
    for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. dwl_v_quotation_items — items resolved to material code/name + a
--    per-material price-comparison helper (current library price vs this
--    quote's effective price).
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.dwl_v_quotation_items;

create view public.dwl_v_quotation_items
with (security_invoker = true)
as
select
  qi.id,
  qi.tenant_id,
  qi.quotation_id,
  q.quote_no,
  q.supplier_id,
  s.name                  as supplier_name,
  q.quote_date,
  q.valid_until,
  q.currency,
  qi.line_no,
  qi.resource_id,
  r.code                  as material_code,
  coalesce(a.material_name, r.description) as material_name,
  qi.description,
  qi.spec_ref,
  qi.quantity,
  qi.unit,
  qi.unit_price,
  qi.discount,
  qi.delivery,
  qi.handling,
  qi.other_charges,
  qi.tax,
  qi.effective_price,
  qi.lead_time_days,
  qi.remarks,
  cp.effective_unit_cost  as library_effective_unit_cost,
  cp.unit_price           as library_unit_price
from public.dwl_quotation_items qi
join public.dwl_quotations q on q.id = qi.quotation_id
left join public.dwl_suppliers s on s.id = q.supplier_id
left join public.dwl_resources r on r.id = qi.resource_id
left join public.dwl_material_attributes a on a.resource_id = qi.resource_id
left join public.dwl_v_current_prices cp on cp.resource_id = qi.resource_id;

comment on view public.dwl_v_quotation_items is
  'Cost & Rate Library — quotation lines resolved to materials, with the '
  'current library price alongside for comparison (DCOS-DS-12-012 Phase C-F).';
