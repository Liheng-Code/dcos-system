-- Migration: 20260910000022_dwl_material_attributes_category_fields.sql
-- Purpose: Cost & Rate Library — Material Master (DCOS-DS-12-012, docs/
--          04-Business-Modules/12-Quantity-Surveying/12-Material-
--          Specification-Price-Recording-Design.md). Adds the Category,
--          Cost Code, and Application Scope fields from the Material
--          Master "Create New Material Record" form to the existing
--          dwl_material_attributes companion table.
--
-- Depends on: 20260910000001_dwl_material_attributes.sql
--             (public.dwl_material_attributes),
--             20260910000021_dwl_material_categories.sql
--             (public.dwl_material_categories),
--             20260711000003_budget_codes.sql (public.budget_codes).
--
-- Design principle (DCOS-DS-12-012 §1.3): purely additive — three nullable
--   columns, no backfill, no change to the locked dwl_resources spine or
--   its coding standard. No RLS change: existing tenant-scoped policies on
--   dwl_material_attributes already cover these new columns.
--
-- Idempotent: add column if not exists.

alter table public.dwl_material_attributes
  add column if not exists category_id      uuid references public.dwl_material_categories(id) on delete set null,
  add column if not exists budget_code_id    uuid references public.budget_codes(id) on delete set null,
  add column if not exists application_scope text;

create index if not exists idx_dwl_material_attributes_category
  on public.dwl_material_attributes(category_id);
create index if not exists idx_dwl_material_attributes_budget_code
  on public.dwl_material_attributes(budget_code_id);

comment on column public.dwl_material_attributes.category_id is
  'Material Master category picker -> public.dwl_material_categories(id). '
  'DCOS-DS-12-012 Cost & Rate Library Material Master form.';
comment on column public.dwl_material_attributes.budget_code_id is
  'Material Master "Cost Code" field -> public.budget_codes(id) (existing '
  'lettered enterprise budget code scheme, not a new numbering scheme). '
  'DCOS-DS-12-012 Cost & Rate Library Material Master form.';
comment on column public.dwl_material_attributes.application_scope is
  'Material Master "Application Scope" free-text field. '
  'DCOS-DS-12-012 Cost & Rate Library Material Master form.';
