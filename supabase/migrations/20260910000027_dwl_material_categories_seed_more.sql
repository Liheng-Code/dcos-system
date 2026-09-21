-- Migration: 20260910000027_dwl_material_categories_seed_more.sql
-- Purpose: Cost & Rate Library — Material Master. Adds the remaining 12
--          starter categories (Structural, Masonry & Plaster, MEP, Glass &
--          Glazing, Insulation, Ironmongery, Flooring, Facade & Cladding,
--          Roofing) to reach the full 22-category starter set shown in the
--          "Category & Specific Element Management" mockup — the first 10
--          were seeded by 20260910000026. DCOS-DS-12-012, docs/
--          04-Business-Modules/12-Quantity-Surveying/12-Material-
--          Specification-Price-Recording-Design.md.
--
-- Additive only: same shape as 20260910000026's seed block, no column or
--   constraint changes. Idempotent: inserted only if a row with the same
--   code does not already exist, so this never overwrites a category an
--   admin has already edited or removed.

insert into public.dwl_material_categories
  (name, code, specific_element, discipline, cost_code_prefix, color_tag, sort_order, is_active)
select v.name, v.code, v.specific_element, v.discipline, v.cost_code_prefix, v.color_tag, v.sort_order, true
from (values
  ('Structural - Concrete & Cement',          'CAT-CONC', 'Structural Framing',          'Civil/Structural', '03-3000', 'slate',    110),
  ('Structural - Metals & Rebar',              'CAT-METL', 'Structural Framing',          'Civil/Structural', '03-2100', 'slate',    120),
  ('Masonry & Plaster',                        'CAT-MASN', 'Masonry & Plaster',           'Civil/Structural', '04-2000', 'amber',    130),
  ('MEP - Plumbing & Drainage',                'CAT-PLMB', 'Plumbing & Drainage',         'MEP',               '22-1000', 'amber',    140),
  ('MEP - Electrical & Lighting',              'CAT-ELEC', 'Electrical & Lighting',       'MEP',               '26-0500', 'amber',    150),
  ('Finishes - Glass & Glazing',               'CAT-GLZ',  'Glass & Glazing',             'Architectural',     '08-8000', 'teal',     160),
  ('Thermal & Acoustic Insulation',            'CAT-INS',  'Thermal & Acoustic Insulation','Architectural',    '07-2100', 'amber',    170),
  ('Openings - Ironmongery & Hardware',        'CAT-HRD',  'Ironmongery & Hardware',      'Architectural',     '08-7100', 'slate',    180),
  ('Finishes - Resilient & Timber Flooring',   'CAT-FLR',  'Flooring',                    'Architectural',     '09-6500', 'teal',     190),
  ('Building Envelope - Facade & Cladding',    'CAT-FAC',  'Facade & Cladding',           'Architectural',     '07-4000', 'sky',      200),
  ('MEP - Sanitary & Plumbing',                'CAT-SAN',  'Sanitary & Plumbing',         'MEP',               '22-4000', 'slate',    210),
  ('Building Envelope - Roofing Systems',      'CAT-ROOF', 'Roofing',                     'Architectural',     '07-3100', 'orange',   220)
) as v(name, code, specific_element, discipline, cost_code_prefix, color_tag, sort_order)
where not exists (
  select 1 from public.dwl_material_categories existing where existing.code = v.code
);
