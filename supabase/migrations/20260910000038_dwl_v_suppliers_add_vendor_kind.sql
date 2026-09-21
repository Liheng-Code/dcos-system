-- Migration: 20260910000038_dwl_v_suppliers_add_vendor_kind.sql
-- Purpose: Bugfix — dwl_v_suppliers was created by 20260910000032 BEFORE
--          dwl_supplier_profiles.vendor_kind existed (that column was only
--          added later by 20260910000034_dwl_subcon_rates_schema.sql,
--          which updated the table but never went back to recreate this
--          view). dwl-suppliers-list-page.tsx and
--          dwl-subcon-rate-form-dialog.tsx both select/filter on
--          vendor_kind against this view, so every query against it has
--          been failing with PostgREST 400 "column does not exist" since
--          Supplier Master / Subcontractor Rates were deployed.
--
-- Fix: recreate dwl_v_suppliers with vendor_kind added as a trailing
--   column — byte-for-byte the same view body as 20260910000032, with only
--   that one column appended. No other consumer's column list changes.
--
-- Idempotent: drop+create view (leaf, no dependents).

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
  sp.vendor_kind,
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
  'spine) + dwl_supplier_profiles (rich companion, incl. vendor_kind) + '
  'linked-materials count.';
