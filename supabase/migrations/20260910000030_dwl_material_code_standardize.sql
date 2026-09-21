-- Migration: 20260910000030_dwl_material_code_standardize.sql
-- Purpose: Cost & Rate Library — Material Master. Re-codes every existing
--          material resource from the original {M}-{GRP3}-{NNN} scheme to a
--          new standardized MAT-{GROUP}-{NNN} scheme (e.g. MAT-CEIL-001),
--          per explicit QS Manager decision 2026-09-15.
--
-- Governance note: 07-SOP_Direct_Works_Cost_Library_Module.md §6 D2 and
--   13-SOP_Material_Specification_Price_Recording.md §5 both record the
--   original {M/L/E/S}-{GRP3}-{NNN} standard as "locked — no changes
--   without a new SOP version" (dated 2026-07-20). This migration
--   supersedes that decision FOR MATERIALS ONLY, authorized directly by
--   the QS Manager on 2026-09-15 — those two SOP documents should be
--   revised to a new version reflecting MAT-{GROUP}-{NNN} as a follow-up.
--   Labor (L-), Equipment (E-) and Subcontract (S-) resources are entirely
--   unaffected — this migration only ever touches dwl_resources rows with
--   category = 'material'.
--
-- Group segment: derived from the material's Category code where one is
--   assigned (dwl_material_categories.code, e.g. 'CAT-CEIL' -> group
--   'CEIL' — the part after "CAT-"). For materials with no category
--   assigned (chiefly the ~180 legacy-migrated "-MAT" resources from
--   20260720000013, backfilled discipline-only by 20260910000028), falls
--   back to a fixed Discipline -> group map; a material with neither
--   falls back to the placeholder group 'GEN'.
--
-- Sequence: 3-digit, sequential per group, ordered by the OLD code so the
--   renumber is deterministic and reviewable from a diff of this file
--   alone (no reliance on row insertion order).
--
-- Nothing is lost: every renamed row's pre-existing code is copied into
--   dwl_material_attributes.legacy_code — but ONLY where legacy_code is
--   still null. Rows that already carry an older legacy code (e.g. the
--   ceiling set's MAT-CL-001..025 / MAT-CEIL-001..005, set by
--   20260910000029) keep that original value untouched, since it is the
--   deeper/earlier legacy reference and the M-CLG-*/M-CEB-* code about to
--   be replaced here is itself only an intermediate identifier.
--
-- Idempotent: both statements are scoped to `code !~ '^MAT-'`, so re-running
--   this migration after a first successful application is a no-op —
--   already-renamed rows (and any material created after this migration,
--   since the Create Material form now generates codes directly in
--   MAT-{GROUP}-{NNN} form) are skipped by the WHERE clause.
--
-- Depends on 20260910000021..29 (categories, category_id/legacy_code
-- columns, attribute backfill, bulk CSV import) having already run, so
-- that Category assignment and discipline backfill are both in their
-- final state before group segments are computed.

-- ── 1. Preserve the pre-rename code as legacy_code, only where nothing is
--      recorded there yet ─────────────────────────────────────────────────
update public.dwl_material_attributes a
set legacy_code = r.code
from public.dwl_resources r
where a.resource_id = r.id
  and r.category = 'material'
  and r.code !~ '^MAT-'
  and a.legacy_code is null;

-- ── 2. Compute group segment + per-group sequence, then rename ───────────
with mat_groups as (
  select
    r.id as resource_id,
    r.code as old_code,
    coalesce(
      nullif(split_part(cat.code, '-', 2), ''),
      case a.discipline
        when 'Architectural'      then 'ARC'
        when 'Structural'         then 'STR'
        when 'Civil'              then 'CIV'
        when 'MEP'                then 'MEP'
        when 'Interior'           then 'INT'
        when 'Landscape'          then 'LND'
        when 'Specialist'         then 'SPC'
        when 'Façade'             then 'FAC'
        when 'Fire & Life Safety' then 'FLS'
        when 'Acoustic'           then 'ACU'
        else 'GEN'
      end
    ) as group_code
  from public.dwl_resources r
  join public.dwl_material_attributes a on a.resource_id = r.id
  left join public.dwl_material_categories cat on cat.id = a.category_id
  where r.category = 'material'
    and r.code !~ '^MAT-'
),
mat_seq as (
  select
    resource_id,
    'MAT-' || group_code || '-' || lpad(
      row_number() over (partition by group_code order by old_code)::text, 3, '0'
    ) as new_code
  from mat_groups
)
update public.dwl_resources r
set code = m.new_code
from mat_seq m
where r.id = m.resource_id;
