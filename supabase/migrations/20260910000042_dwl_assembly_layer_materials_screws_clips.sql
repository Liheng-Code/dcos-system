-- Migration: 20260910000042_dwl_assembly_layer_materials_screws_clips.sql
-- Purpose: Cost Item Library — 3D Assembly Cross-Section realism pass (plan
--          inside-module-quantity-surveying-delegated-valley.md). Two of
--          the ceiling assembly's 9 real BOQ materials were never linked to
--          any dwl_assembly_layers row by 20260910000041 — Self-Drilling
--          Drywall Screws (MAT-CEIL-036) and Miscellaneous Fixing
--          Accessories & Clips (MAT-CEIL-039) — which is the literal
--          reason the 3D viewer (and the layer inspector's cost/consumption
--          roll-up) had no representation for them. Fixes the link, not
--          just the rendering.
--
-- Depends on: 20260910000041_dwl_assembly_layer_materials_specs.sql.
-- Additive only: no schema changes, just 2 more rows in the existing
--   many-to-many dwl_assembly_layer_materials table.
-- Idempotent: guarded by "not exists" on (layer_id, resource_id).

do $$
declare
  v_assembly_id uuid;
  v_tenant      uuid;
  v_outer_id    uuid;
  v_inner_id    uuid;
  v_galv_id     uuid;
  v_screw_id    uuid;
  v_clip_id     uuid;
begin
  select id, tenant_id into v_assembly_id, v_tenant from public.dwl_assemblies where code = 'ASM-CEIL-GYP-001';
  if v_assembly_id is null then
    return;
  end if;

  select id into v_outer_id from public.dwl_assembly_layers where assembly_id = v_assembly_id and layer_name = 'Outer';
  select id into v_inner_id from public.dwl_assembly_layers where assembly_id = v_assembly_id and layer_name = 'Inner';
  select id into v_galv_id  from public.dwl_assembly_layers where assembly_id = v_assembly_id and layer_name = 'Galvanized';
  select id into v_screw_id from public.dwl_resources where code = 'MAT-CEIL-036';
  select id into v_clip_id  from public.dwl_resources where code = 'MAT-CEIL-039';

  if v_outer_id is not null and v_screw_id is not null and not exists (
    select 1 from public.dwl_assembly_layer_materials where layer_id = v_outer_id and resource_id = v_screw_id
  ) then
    insert into public.dwl_assembly_layer_materials (tenant_id, layer_id, resource_id, sort_order)
    values (v_tenant, v_outer_id, v_screw_id, 2);
  end if;

  if v_inner_id is not null and v_screw_id is not null and not exists (
    select 1 from public.dwl_assembly_layer_materials where layer_id = v_inner_id and resource_id = v_screw_id
  ) then
    insert into public.dwl_assembly_layer_materials (tenant_id, layer_id, resource_id, sort_order)
    values (v_tenant, v_inner_id, v_screw_id, 2);
  end if;

  if v_galv_id is not null and v_clip_id is not null and not exists (
    select 1 from public.dwl_assembly_layer_materials where layer_id = v_galv_id and resource_id = v_clip_id
  ) then
    insert into public.dwl_assembly_layer_materials (tenant_id, layer_id, resource_id, sort_order)
    values (v_tenant, v_galv_id, v_clip_id, 5);
  end if;
end $$;
