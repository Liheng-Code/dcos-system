-- Migration: 20260910000021_dwl_material_categories.sql
-- Purpose: Cost & Rate Library — Material Master (docs/04-Business-Modules/
--          12-Quantity-Surveying/12-Material-Specification-Price-Recording-
--          Design.md, DCOS-DS-12-012). Adds the manageable Material Category
--          reference library backing the Material Master "Category" picker
--          and "+ Manage/New" dialog (see plan
--          inside-module-quantity-surveying-delegated-valley.md).
--
-- Depends on: none (new leaf reference table). Referenced by
--             dwl_material_attributes.category_id, added in
--             20260910000022_dwl_material_attributes_category_fields.sql.
--
-- Design: shared enterprise reference library, NOT tenant-scoped — same
--   open-RLS / UI-gated-writes pattern as public.qs_element_library
--   (20260722000009) and public.budget_codes (20260711000003). Categories
--   are shared across all tenants like budget codes and the element
--   library; admin-only write access is enforced by the app's "Manage
--   Categories" dialog, not by RLS.
--
-- Idempotent: create table if not exists, guarded policies, defensive
--   create-or-replace of the shared set_updated_at() trigger function.

create table if not exists public.dwl_material_categories (
  id          uuid primary key default gen_random_uuid(),
  group_name  text,                       -- optional grouping (e.g. discipline or family)
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_dwl_material_categories_group
  on public.dwl_material_categories(group_name);

alter table public.dwl_material_categories enable row level security;

-- Open RLS, UI-gated writes — mirrors qs_element_library / budget_codes.
create policy "Auth users can view dwl material categories"
  on public.dwl_material_categories for select to authenticated using (true);
create policy "Auth users can insert dwl material categories"
  on public.dwl_material_categories for insert to authenticated with check (true);
create policy "Auth users can update dwl material categories"
  on public.dwl_material_categories for update to authenticated using (true) with check (true);
create policy "Auth users can delete dwl material categories"
  on public.dwl_material_categories for delete to authenticated using (true);

-- set_updated_at() was defined in 20260720000003_dwl_phase1_resources.sql;
-- defensively re-declared here (create or replace) mirroring the pattern
-- used in 20260722000009_qs_element_library.sql, in case this migration
-- ever runs against an environment where it does not yet exist.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_dwl_material_categories_updated_at on public.dwl_material_categories;
create trigger set_dwl_material_categories_updated_at
  before update on public.dwl_material_categories
  for each row execute function public.set_updated_at();

comment on table public.dwl_material_categories is
  'Cost & Rate Library — shared Material Category reference list (open RLS, '
  'UI-gated writes). DCOS-DS-12-012 / docs/04-Business-Modules/'
  '12-Quantity-Surveying/12-Material-Specification-Price-Recording-Design.md.';
