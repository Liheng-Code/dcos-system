-- Migration: 20260910000025_dwl_v_materials_category_budget_photos.sql
-- Purpose: Cost & Rate Library — Material Master (DCOS-DS-12-012, docs/
--          04-Business-Modules/12-Quantity-Surveying/12-Material-
--          Specification-Price-Recording-Design.md). Extends
--          dwl_v_materials with the Category, Cost Code, Application
--          Scope, and photo-count columns needed by the Material Master
--          list/card UI (plan
--          inside-module-quantity-surveying-delegated-valley.md).
--
-- Depends on: 20260910000004_dwl_resource_prices_effective_cost.sql
--             (the current dwl_v_materials body being extended here),
--             20260910000021_dwl_material_categories.sql,
--             20260910000022_dwl_material_attributes_category_fields.sql
--             (dwl_material_attributes.category_id / budget_code_id /
--             application_scope), 20260910000023_dwl_material_photos.sql,
--             public.budget_codes.
--
-- Additive-only: this is the byte-for-byte 20260910000004 view body with
--   SIX new TRAILING columns appended (category_id, category_name,
--   budget_code_id, budget_code, application_scope, photo_count) — no
--   existing column is removed, renamed, or reordered, so the app's
--   existing explicit column-list consumers (dwl-materials-list-page.tsx)
--   are unaffected. security_invoker = true is preserved. Drop+create
--   (leaf view, no dependents), matching the pattern used by every prior
--   dwl_v_materials revision in this migration series.
--
-- Idempotent: drop view if exists before create.

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
  cp.effective_unit_cost     as current_effective_unit_cost,
  cp.discount                as current_price_discount,
  cp.delivery_cost           as current_price_delivery_cost,
  cp.handling_cost           as current_price_handling_cost,
  cp.other_charges           as current_price_other_charges,
  cp.tax_amount              as current_price_tax_amount,
  cp.price_status            as current_price_status,
  -- Material Master category / cost code / scope / photos (DCOS-DS-12-012):
  a.category_id,
  mc.name                    as category_name,
  a.budget_code_id,
  bc.code                    as budget_code,
  a.application_scope,
  (select count(*) from public.dwl_material_photos p
    where p.resource_id = r.id)                as photo_count
from public.dwl_resources r
left join public.dwl_material_attributes a on a.resource_id = r.id
left join public.dwl_v_current_prices cp on cp.resource_id = r.id
left join public.dwl_v_current_material_spec ms on ms.resource_id = r.id
left join public.dwl_material_categories mc on mc.id = a.category_id
left join public.budget_codes bc on bc.id = a.budget_code_id
where r.category = 'material';

comment on view public.dwl_v_materials is
  'Cost & Rate Library — Materials browse view (DCOS-DS-12-012, latest: '
  '20260910000025). dwl_resources (category=material) + attributes + '
  'current price + current spec + effective-cost breakdown + material '
  'category + budget/cost code + application scope + photo_count.';
