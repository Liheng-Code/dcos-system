-- Migration: 20260910000026_dwl_material_categories_expand.sql
-- Purpose: Cost & Rate Library — Material Master. Expands
--          dwl_material_categories (added in 20260910000021) with the
--          fields needed by the redesigned "Category & Specific Element
--          Management" dialog: a short code, a linked Specific Element,
--          Discipline, a default Cost Code Prefix, a badge color tag and a
--          free-text description. Also seeds the ten starter categories
--          shown in that dialog's mockup so "All Categories" is not empty
--          on first use. DCOS-DS-12-012, docs/04-Business-Modules/
--          12-Quantity-Surveying/12-Material-Specification-Price-Recording-
--          Design.md.
--
-- Additive only: dwl_material_categories keeps its existing id/group_name/
--   name/sort_order/is_active/created_at/updated_at columns unchanged; every
--   new column is nullable so no backfill is required. dwl_material_
--   attributes.category_id (20260910000022) and dwl_v_materials.category_id/
--   category_name (20260910000025) are unaffected by this migration.
--
-- Idempotent: guarded ADD COLUMN / index creation; seed rows inserted only
--   if a row with the same code does not already exist.

alter table public.dwl_material_categories
  add column if not exists code              text,
  add column if not exists specific_element  text,
  add column if not exists discipline        text,
  add column if not exists cost_code_prefix  text,
  add column if not exists color_tag         text,
  add column if not exists description       text;

-- Category codes (e.g. "CAT-CEIL") are unique when present; older rows
-- created before this migration (via the original simple Add dialog) may
-- have no code and are left as-is.
create unique index if not exists idx_dwl_material_categories_code
  on public.dwl_material_categories (code)
  where code is not null;

create index if not exists idx_dwl_material_categories_specific_element
  on public.dwl_material_categories (specific_element);

comment on column public.dwl_material_categories.code is
  'Short category code shown next to the name, e.g. CAT-CEIL (unique when set).';
comment on column public.dwl_material_categories.specific_element is
  'Single functional element this category maps to for cost tracking (free text, cross-walks to qs_element_library.sub_element — not a hard FK, same pattern as dwl_material_attributes.application_element).';
comment on column public.dwl_material_categories.cost_code_prefix is
  'Default Cost Code hint shown on the category (free text, e.g. "09-5100") — a suggestion for the Material form''s Cost Code picker, not a foreign key to budget_codes.';
comment on column public.dwl_material_categories.color_tag is
  'Named color key (e.g. "emerald", "violet") used to render the category''s badge/dot in the UI — a fixed client-side palette, not a hex value.';

-- Starter categories matching the "All Categories" mockup. Non-destructive:
-- only inserted if a row with the same code is not already present, so this
-- never overwrites a category an admin has already edited.
insert into public.dwl_material_categories
  (name, code, specific_element, discipline, cost_code_prefix, color_tag, sort_order, is_active)
select v.name, v.code, v.specific_element, v.discipline, v.cost_code_prefix, v.color_tag, v.sort_order, true
from (values
  ('Finishes - Ceiling',            'CAT-CEIL', 'Ceiling',            'Architectural',    '09-5100', 'emerald', 10),
  ('Finishes - Painting',           'CAT-PNT',  'Painting',           'Architectural',    '09-9100', 'sky',     20),
  ('Finishes - Tiling',             'CAT-TILE', 'Tiling',             'Architectural',    '09-3000', 'teal',    30),
  ('Finishes - Marble & Stone',     'CAT-MRBL', 'Marble & Stone',     'Architectural',    '09-3800', 'amber',   40),
  ('Openings - Door',               'CAT-DOOR', 'Door',               'Architectural',    '08-1100', 'orange',  50),
  ('Openings - Window',             'CAT-WNDW', 'Window',             'Architectural',    '08-5100', 'sky',     60),
  ('Thermal & Waterproofing',       'CAT-WPRF', 'Waterproofing',      'Architectural',    '07-1000', 'indigo',  70),
  ('Site - Anti-Mite / Termite',    'CAT-MITE', 'Anti-Mite / Termite','Civil/Structural', '02-3100', 'rose',    80),
  ('Finishes - Carpet',             'CAT-CRPT', 'Carpet',             'Architectural',    '09-6800', 'mint',    90),
  ('Finishes - Raised Floor',       'CAT-RFLR', 'Raised Floor',       'Architectural',    '09-6900', 'lavender',100)
) as v(name, code, specific_element, discipline, cost_code_prefix, color_tag, sort_order)
where not exists (
  select 1 from public.dwl_material_categories existing where existing.code = v.code
);
