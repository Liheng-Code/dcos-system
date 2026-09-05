-- Migration: 20260902000002_prelim_library_early_works.sql
-- Purpose: Add a new "Early Works" section (Z.00) to the Prelim Cost Library, parallel to Budget Codes' "A – Early Work" group (A.00–A.08), per user request
-- Depends on: prelim_library_items (supabase/migrations/20260718000001_prelim_cost_library.sql)

-- 1. Widen the category check constraint to also allow 'early_work'
alter table public.prelim_library_items drop constraint if exists prelim_library_items_category_check;
alter table public.prelim_library_items add constraint prelim_library_items_category_check
  check (category in ('temporary_works','staff','design','risk','early_work'));

-- 2. Top-level section (parent_code = NULL)
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  (NULL, 'Z.00', 'EARLY WORKS', 'Sum', 'sum_children', 1, NULL, 0, 'early_work')
on conflict (code) do nothing;

-- 3. Z.00 Early Works items
insert into public.prelim_library_items (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category) values
  ('Z.00', 'Z.00.01', 'Topography Survey', 'Item', 'fixed', 1, NULL, 1, 'early_work'),
  ('Z.00', 'Z.00.02', 'Soil Investigation', 'Item', 'fixed', 1, NULL, 2, 'early_work'),
  ('Z.00', 'Z.00.03', 'Mine / UXO Clearance', 'Item', 'fixed', 1, NULL, 3, 'early_work'),
  ('Z.00', 'Z.00.04', 'Soil Leveling', 'Item', 'fixed', 1, NULL, 4, 'early_work'),
  ('Z.00', 'Z.00.05', 'Demolition', 'Item', 'fixed', 1, NULL, 5, 'early_work'),
  ('Z.00', 'Z.00.06', 'Cleaning', 'Item', 'fixed', 1, NULL, 6, 'early_work'),
  ('Z.00', 'Z.00.07', 'Repair existing services', 'Item', 'fixed', 1, NULL, 7, 'early_work'),
  ('Z.00', 'Z.00.08', 'Renovation', 'Item', 'fixed', 1, NULL, 8, 'early_work')
on conflict (code) do nothing;
