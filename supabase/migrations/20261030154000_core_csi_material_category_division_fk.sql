-- Migration: 20261030154000_core_csi_material_category_division_fk.sql
-- Purpose: Make core csi_divisions the only division list QS material categories check against.
--          dwl_material_categories.division_code had two foreign keys: the core one
--          (dwl_material_categories_csi_division_fkey -> csi_divisions, added in 20261023122000) and the old one
--          (dwl_material_categories_division_code_fkey -> the frozen dwl_material_divisions, 25 codes). The old one
--          rejected valid CSI divisions outside those 25 (34, 35, 40-48), so it is dropped here.
-- Depends on: 20261023122000_core_csi_divisions.sql (core FK exists and is validated)
-- Removes a constraint only: no table, column or data changes, so other lanes are unaffected.
-- Still deferred to the cleanup step in docs/01-DCOS-Foundation/DCOS-CSI-Division-Standard.md section 10:
-- dropping dwl_material_divisions*, plan_act_divisions, plan_act_masters.division_id, the uuid RPC overloads
-- and the freeze trigger function.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dwl_material_categories_csi_division_fkey') then
    raise exception 'dwl_material_categories_csi_division_fkey is missing: apply 20261023122000_core_csi_divisions.sql first';
  end if;
end $$;

alter table public.dwl_material_categories drop constraint if exists dwl_material_categories_division_code_fkey;

comment on column public.dwl_material_categories.division_code is
  'CSI MasterFormat 2016 division (core csi_divisions.code). Defaults from the first two digits of cost_code_prefix.';
