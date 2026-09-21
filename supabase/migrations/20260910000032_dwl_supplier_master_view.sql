-- Migration: 20260910000032_dwl_supplier_master_view.sql
-- Purpose: Cost & Rate Library — Supplier Master (plan
--          inside-module-quantity-surveying-delegated-valley.md). Adds the
--          one column the "Register New Commercial Vendor" mockup needs
--          that dwl_supplier_profiles doesn't already have, and a browse
--          view for the new Supplier Master list page — mirrors
--          dwl_v_materials' shape (20260910000025).
--
-- Depends on: 20260910000003_dwl_supplier_profiles_and_materials.sql
--             (dwl_suppliers, dwl_supplier_profiles, dwl_supplier_materials).
--
-- Additive only:
--   - dwl_supplier_profiles gains one nullable column, overall_rating. The
--     mockup shows two distinct 1-5 fields ("Star Rating" and "Reliability
--     Rating") but the existing schema only had a free-text
--     reliability_rating — nothing to hold the raw numeric overall score
--     precisely (dwl_suppliers.rating is only the derived A/B/C band, per
--     20260910000003's own design note). overall_rating is that missing
--     raw value; Reliability Rating continues to use the existing
--     reliability_rating text column, unchanged.
--   - dwl_v_suppliers is a new view, not a modification of any existing one.
--
-- Idempotent: guarded ADD COLUMN; drop+create view (leaf, no dependents).

alter table public.dwl_supplier_profiles
  add column if not exists overall_rating numeric(2,1);

comment on column public.dwl_supplier_profiles.overall_rating is
  'Raw "Star Rating (1-5)" from the Register/Edit Vendor form — distinct from '
  'dwl_suppliers.rating, which is the derived A/B/C band (>=4.5 A, >=3.5 B, else C).';

drop view if exists public.dwl_v_suppliers;

create view public.dwl_v_suppliers
with (security_invoker = true)
as
select
  s.id                    as supplier_id,
  s.tenant_id,
  s.name,
  s.contact,
  s.rating,
  s.is_active,
  s.created_at,
  sp.supplier_code,
  sp.trading_name,
  sp.supplier_type,
  sp.contact_person,
  sp.position,
  sp.phone,
  sp.email,
  sp.address,
  sp.country,
  sp.province_city,
  sp.website,
  sp.product_categories,
  sp.payment_terms,
  sp.delivery_terms,
  sp.credit_terms,
  sp.lead_time_days,
  sp.moq,
  sp.overall_rating,
  sp.reliability_rating,
  sp.quality_rating,
  sp.price_competitiveness,
  sp.lifecycle_status,
  sp.notes,
  sp.updated_at,
  (select count(*) from public.dwl_supplier_materials sm
    where sm.supplier_id = s.id and sm.is_active)   as materials_linked
from public.dwl_suppliers s
left join public.dwl_supplier_profiles sp on sp.supplier_id = s.id;

comment on view public.dwl_v_suppliers is
  'Cost & Rate Library — Supplier Master browse view. dwl_suppliers (locked '
  'spine) + dwl_supplier_profiles (rich companion) + linked-materials count.';
