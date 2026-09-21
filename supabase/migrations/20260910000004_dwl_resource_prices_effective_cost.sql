-- Migration: 20260910000004_dwl_resource_prices_effective_cost.sql
-- Purpose: Material Specification & Price Recording (DCOS-DS-12-012), Phase C-D.
--          Extends the APPEND-ONLY dwl_resource_prices table with the
--          effective-cost breakdown and audit columns from Excel sheet
--          05_Price_History, and exposes effective cost on
--          dwl_v_current_prices and dwl_v_materials.
--
--          Effective Unit Cost =
--            Basic Unit Price  (= unit_price, unchanged meaning)
--            - Discount + Delivery Cost + Handling Cost + Other Charges + Tax
--          stored as a GENERATED ALWAYS ... STORED column (cannot drift,
--          no trigger).
--
-- Depends on: 20260720000003 (dwl_resource_prices),
--             20260720000005 (dwl_v_current_prices security_invoker),
--             20260910000001 (dwl_v_materials), 20260910000002 (spec view).
--
-- APPEND-ONLY GUARANTEE PRESERVED: ALTER TABLE ... ADD COLUMN does not
--   create or alter any RLS policy. dwl_resource_prices still has SELECT +
--   INSERT policies only (20260720000017) and no UPDATE/DELETE policy, so
--   rows remain immutable after insert.
--
-- DOWNSTREAM RATES UNCHANGED (DCOS-DS-12-012 §3 D3): dwl_v_work_item_rates
--   and dwl_v_work_item_explosion still multiply by unit_price. Switching
--   them to coalesce(effective_unit_cost, unit_price) is a SEPARATE, gated
--   migration (Phase C-I) with its own QS Manager sign-off. This migration
--   only ADDS a trailing column to dwl_v_current_prices; the recipe views'
--   explicit column lists are untouched.
--
-- Idempotent: add column if not exists, create-or-replace view.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Nullable breakdown + audit columns on dwl_resource_prices.
--    Money columns default 0 so existing rows get a fast, non-null default
--    and effective_unit_cost == unit_price for all legacy rows.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_resource_prices
  add column if not exists quantity        numeric(14,4),
  add column if not exists discount        numeric(14,4) not null default 0,
  add column if not exists delivery_cost   numeric(14,4) not null default 0,
  add column if not exists handling_cost   numeric(14,4) not null default 0,
  add column if not exists other_charges   numeric(14,4) not null default 0,
  add column if not exists tax_amount      numeric(14,4) not null default 0,
  add column if not exists payment_terms   text,
  add column if not exists delivery_terms  text,
  add column if not exists lead_time_days  integer,
  add column if not exists source_document text,
  add column if not exists quotation_ref   text,   -- Excel: Quotation No. (free text; structured FK dwl_quotation_id added in Phase C-F)
  add column if not exists quotation_date  date,    -- Excel: Date
  add column if not exists project_code    text,    -- Excel: Project Code (nullable — market quotes need no project)
  add column if not exists approved_by     uuid references public.profiles(id),
  add column if not exists approved_at     timestamptz;

-- price_status: controlled lifecycle. Default 'approved' so existing
-- quick-entry rows (market_survey / purchase / estimate) stay usable and
-- backward-compatible.
do $$ begin
  alter table public.dwl_resource_prices
    add column price_status text not null default 'approved'
    check (price_status in
      ('draft','submitted','verified','approved','active','expired',
       'superseded','archived','rejected'));
exception when duplicate_column then null; end $$;

-- effective_unit_cost: generated, stored. Added AFTER its inputs exist.
do $$ begin
  alter table public.dwl_resource_prices
    add column effective_unit_cost numeric(14,4)
    generated always as (
      unit_price
      - coalesce(discount, 0)
      + coalesce(delivery_cost, 0)
      + coalesce(handling_cost, 0)
      + coalesce(other_charges, 0)
      + coalesce(tax_amount, 0)
    ) stored;
exception when duplicate_column then null; end $$;

comment on column public.dwl_resource_prices.unit_price is
  'Basic / quoted unit price BEFORE adjustments. Meaning unchanged by '
  'DCOS-DS-12-012 — downstream recipe views still multiply by this column.';
comment on column public.dwl_resource_prices.effective_unit_cost is
  'GENERATED: unit_price - discount + delivery + handling + other + tax '
  '(DCOS-DS-12-012 Phase C-D). Informational until the gated Phase C-I '
  'switches recipe views to it.';

create index if not exists idx_dwl_resource_prices_status
  on public.dwl_resource_prices(tenant_id, price_status);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. dwl_v_current_prices — append effective cost + breakdown.
--    CREATE OR REPLACE (NOT drop): dwl_v_work_item_rates /
--    dwl_v_work_item_explosion depend on this view. The 11 existing
--    columns keep their exact names, types, and order; new columns are
--    appended at the end only.
-- ─────────────────────────────────────────────────────────────────────────
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
  -- appended (Phase C-D):
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
  rp.project_code
from public.dwl_resource_prices rp
join public.dwl_resources r on r.id = rp.resource_id
left join public.dwl_suppliers s on s.id = rp.supplier_id
where r.is_active
order by rp.resource_id, rp.valid_from desc, rp.created_at desc;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Recreate dwl_v_materials to append current effective-cost columns.
--    Drop+create (leaf view, no dependents).
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
  ms.spec_code               as current_spec_code,
  ms.spec_name               as current_spec_name,
  ms.revision_no             as current_spec_revision_no,
  ms.effective_date          as current_spec_effective_date,
  ms.standard                as current_spec_standard,
  ms.grade                   as current_spec_grade,
  ms.status                  as current_spec_status,
  -- effective-cost columns (Phase C-D):
  cp.effective_unit_cost     as current_effective_unit_cost,
  cp.discount                as current_price_discount,
  cp.delivery_cost           as current_price_delivery_cost,
  cp.handling_cost           as current_price_handling_cost,
  cp.other_charges           as current_price_other_charges,
  cp.tax_amount              as current_price_tax_amount,
  cp.price_status            as current_price_status
from public.dwl_resources r
left join public.dwl_material_attributes a on a.resource_id = r.id
left join public.dwl_v_current_prices cp on cp.resource_id = r.id
left join public.dwl_v_current_material_spec ms on ms.resource_id = r.id
where r.category = 'material';

comment on view public.dwl_v_materials is
  'Cost & Rate Library — Materials browse view (DCOS-DS-12-012 Phase C-D). '
  'dwl_resources (category=material) + attributes + current price + current '
  'spec + effective-cost breakdown.';
