-- Migration: 20260910000028_dwl_backfill_migrated_material_attributes.sql
-- Purpose: Cost & Rate Library — Material Master. Backfills the missing
--          dwl_material_attributes companion row for every dwl_resources
--          material that never got one — specifically the ~180 synthetic
--          "<qs_cost_items.code>-MAT" resources created by
--          20260720000013_dwl_phase6_migrate_qs_cost_items.sql, which
--          inserted directly into dwl_resources and never touched
--          dwl_material_attributes (that table did not exist yet at the
--          time — it was added later by 20260910000001).
--
-- Why this matters: dwl_v_materials LEFT JOINs dwl_material_attributes, so
--   every one of these migrated materials shows Category/Specification as
--   blank and — critically — has discipline = NULL. The Material Master
--   catalog's Discipline filter is built from the DISTINCT discipline
--   values actually present in the data, so an entire discipline (e.g.
--   "Structural" for the CSI Division 03/04/05 concrete/masonry/metals
--   items) can be invisible in the filter even though dozens of materials
--   plainly belong to it — not a filter bug, a missing-data bug.
--
-- Fix: insert one dwl_material_attributes row per orphaned material, with
--   material_name cleaned of the migration boilerplate (same regex the UI
--   already applies for display — see cleanLabel() in
--   dwl-materials-list-page.tsx / dwl-material-detail-page.tsx /
--   dwl-material-category-dialog.tsx) and discipline inferred from the
--   resource code's leading CSI MasterFormat division number (e.g.
--   "03 20 13-MAT" -> division 03 -> Structural). Standard CSI division ->
--   DWL_DISCIPLINES mapping, same buckets already used for this migration's
--   companion category seed (20260910000026/27).
--
-- Additive only: INSERT-only, guarded by "no existing attributes row for
--   this resource_id" — never touches a row that already has attributes
--   (e.g. the Phase C-H ceiling seed materials, or anything an admin has
--   since edited via the Material form). Idempotent.

insert into public.dwl_material_attributes (resource_id, tenant_id, material_name, discipline, lifecycle_status, created_by)
select
  r.id,
  r.tenant_id,
  nullif(trim(
    regexp_replace(
      regexp_replace(r.description, '^(Material|Labor|Equipment) component \(migrated\) for\s*', '', 'i'),
      '\s*\(source:[^)]*\)', '', 'gi'
    )
  ), '') as material_name,
  case left(r.code, 2)
    when '02' then 'Civil'
    when '03' then 'Structural'
    when '04' then 'Structural'
    when '05' then 'Structural'
    when '06' then 'Architectural'
    when '07' then 'Architectural'
    when '08' then 'Architectural'
    when '09' then 'Architectural'
    when '10' then 'Specialist'
    when '11' then 'Specialist'
    when '12' then 'Interior'
    when '13' then 'Specialist'
    when '14' then 'Specialist'
    when '21' then 'Fire & Life Safety'
    when '22' then 'MEP'
    when '23' then 'MEP'
    when '25' then 'MEP'
    when '26' then 'MEP'
    when '27' then 'MEP'
    when '28' then 'Fire & Life Safety'
    when '31' then 'Civil'
    when '32' then 'Civil'
    when '33' then 'Civil'
    else null
  end as discipline,
  'active',
  r.created_by
from public.dwl_resources r
where r.category = 'material'
  and not exists (
    select 1 from public.dwl_material_attributes a where a.resource_id = r.id
  );
