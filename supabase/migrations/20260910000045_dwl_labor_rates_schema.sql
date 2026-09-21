-- Migration: 20260910000045_dwl_labor_rates_schema.sql
-- Purpose: Cost & Rate Library — new "Labor Rates" page (Direct Labor Wages
--          & Productivity Library). Adds:
--            - overtime_rate_per_hr on the existing append-only
--              dwl_resource_prices (a genuine price concept — it belongs on
--              price history alongside unit_price, not on a static
--              attributes table), appended to dwl_v_current_prices.
--            - dwl_labor_rate_attributes, a 1:1 companion table to
--              dwl_resources (category='labor') carrying skill_level and a
--              standard productivity note — structural twin of
--              dwl_material_attributes (20260910000001).
--            - dwl_v_labor_rates, a structural twin of dwl_v_materials,
--              joining dwl_resources + dwl_labor_rate_attributes +
--              dwl_v_current_prices.
--
-- Depends on: 20260720000003 (dwl_resources, dwl_v_current_prices,
--   set_updated_at), 20260910000004 (dwl_resource_prices effective-cost
--   columns, dwl_v_current_prices current shape), 20260910000001
--   (dwl_material_attributes — the pattern this migration mirrors).
--
-- Additive only: new nullable column, new table, new view. No existing
--   table, column, policy, or view is altered in place except
--   dwl_v_current_prices, which is CREATE OR REPLACE with the new column
--   appended at the end only (same non-breaking pattern 20260910000004
--   already used) — every existing column keeps its name, type and order,
--   so dwl_v_work_item_rates / dwl_v_work_item_explosion / dwl_v_materials
--   are unaffected.
--
-- Idempotent: add column if not exists, create table if not exists,
--   guarded policy creation, create-or-replace / drop+create views.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. overtime_rate_per_hr on dwl_resource_prices — append-only like every
--    other price figure on this table.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_resource_prices
  add column if not exists overtime_rate_per_hr numeric(10,2);

comment on column public.dwl_resource_prices.overtime_rate_per_hr is
  'Labor Rates — overtime wage per hour, recorded alongside unit_price '
  '(the basic daily/monthly/hourly rate) on the same append-only price row. '
  'Null for non-labor resources and for labor prices recorded before this '
  'column existed.';

create or replace view public.dwl_v_current_prices
with (security_invoker = true)
as
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
   and rp.quote_valid_until < current_date) as is_expired,
  rp.effective_unit_cost,
  rp.discount,
  rp.delivery_cost,
  rp.handling_cost,
  rp.other_charges,
  rp.tax_amount,
  rp.quantity,
  rp.price_status,
  rp.payment_terms,
  rp.delivery_terms,
  rp.lead_time_days,
  rp.quotation_ref,
  rp.quotation_date,
  rp.project_code,
  -- appended (Labor Rates, this migration):
  rp.overtime_rate_per_hr
from public.dwl_resource_prices rp
join public.dwl_resources r on r.id = rp.resource_id
left join public.dwl_suppliers s on s.id = rp.supplier_id
where r.is_active
order by rp.resource_id, rp.valid_from desc, rp.created_at desc;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. dwl_labor_rate_attributes — 1:1 companion to dwl_resources
--    (category='labor'). Mutable descriptive data (skill level, trade
--    description live on the spine; the productivity benchmark is corrected
--    over time), not append-only history — that's the price row above.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_labor_rate_attributes (
  resource_id                uuid primary key
                               references public.dwl_resources(id) on delete cascade,
  tenant_id                  uuid not null,
  skill_level                text
                               check (skill_level in ('General Helper','Skilled','Master','Foreman')),
  standard_productivity_note text,                 -- e.g. "14 - 18 m2/day (AAC blockwork with helper)"
  updated_by                 uuid references public.profiles(id),
  created_by                 uuid references public.profiles(id),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_dwl_labor_rate_attributes_tenant
  on public.dwl_labor_rate_attributes(tenant_id);

drop trigger if exists set_dwl_labor_rate_attributes_updated_at on public.dwl_labor_rate_attributes;
create trigger set_dwl_labor_rate_attributes_updated_at
  before update on public.dwl_labor_rate_attributes
  for each row execute function public.set_updated_at();

alter table public.dwl_labor_rate_attributes enable row level security;

do $$ begin
  create policy dwl_labor_rate_attributes_tenant_select on public.dwl_labor_rate_attributes
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_labor_rate_attributes_tenant_insert on public.dwl_labor_rate_attributes
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_labor_rate_attributes_tenant_update on public.dwl_labor_rate_attributes
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy dwl_labor_rate_attributes_tenant_delete on public.dwl_labor_rate_attributes
    for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. dwl_v_labor_rates — browse view for the Labor Rates page. Leaf view,
--    no dependents: drop+create.
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.dwl_v_labor_rates;

create view public.dwl_v_labor_rates
with (security_invoker = true)
as
select
  r.id                    as resource_id,
  r.code,
  r.description,
  r.unit,
  r.spec_reference,
  r.is_active,
  r.created_at,
  r.updated_at,
  a.skill_level,
  a.standard_productivity_note,
  cp.unit_price            as daily_basic_rate,
  cp.overtime_rate_per_hr,
  cp.currency,
  cp.valid_from,
  cp.price_status
from public.dwl_resources r
left join public.dwl_labor_rate_attributes a on a.resource_id = r.id
left join public.dwl_v_current_prices cp on cp.resource_id = r.id
where r.category = 'labor';

comment on view public.dwl_v_labor_rates is
  'Cost & Rate Library — Direct Labor Wages & Productivity Library browse '
  'view. dwl_resources (category=labor) left-joined with '
  'dwl_labor_rate_attributes and the current price (incl. overtime_rate_per_hr) '
  'from dwl_v_current_prices.';
