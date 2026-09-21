-- Migration: 20260910000031_dwl_material_category_costcode_backfill.sql
-- Purpose: Cost & Rate Library — Material Master. Fills the Category and
--          Cost Code columns for existing materials that are missing them
--          (chiefly the ~180 legacy-migrated "-MAT" resources, plus any
--          bulk-import rows whose source category text didn't exact-match
--          an existing dwl_material_categories.code). Requested by the
--          user after noticing Category / Specification / Cost Code /
--          Supplier were showing blank in the Material Master Catalog.
--
-- Scope decision (confirmed with user before writing this migration):
--   - Category: best-effort keyword backfill IS in scope. Only assigned
--     when a keyword rule confidently matches; left null otherwise (no
--     catch-all guess).
--   - Cost Code: best-effort backfill IS in scope, but ONLY for the ~12 of
--     22 categories that map to a single, unambiguous budget_codes entry.
--     The remaining categories (Concrete & Cement, Metals & Rebar, Masonry
--     & Plaster, Door, Painting, Glass & Glazing, Insulation, Ironmongery &
--     Hardware, Waterproofing, Anti-Mite/Termite) do not have one clean
--     match in the firm's elemental classification (e.g. concrete spans
--     both B.00 Sub Structure and B.04 Super Structure) and are
--     deliberately left blank rather than guessed — a wrong Cost Code
--     would misclassify real project costs.
--   - Specification and Supplier are NOT touched by this migration — both
--     require real source data (a recorded technical spec, or an actual
--     price/quotation with a supplier) that does not exist for these rows.
--     They stay correctly blank until entered via the Material form,
--     import, or Record Price flow — this is intentional, not a bug.
--
-- Idempotent: every statement is scoped to rows where the target column is
--   still null, so re-running after a first successful application only
--   affects rows that are still genuinely unset (nothing already-set is
--   ever overwritten).

-- ── 1. Category — keyword + division backfill ────────────────────────────
-- Matches against the material's name + description (already-cleaned
-- boilerplate aside — raw text is fine for a case-insensitive keyword
-- search). Ordered most-specific-first so e.g. "door closer" hits Hardware
-- before the generic "door" pattern would hit Openings - Door.
with target as (
  select
    a.resource_id,
    lower(coalesce(a.material_name, '') || ' ' || coalesce(r.description, '')) as txt
  from public.dwl_resources r
  join public.dwl_material_attributes a on a.resource_id = r.id
  where r.category = 'material'
    and a.category_id is null
),
matched as (
  select
    resource_id,
    case
      when txt ~ 'hinge|lockset|door closer|ironmongery|handle ?set' then 'CAT-HRD'
      when txt ~ 'waterproof|damp.?proof|water.?proofing membrane' then 'CAT-WPRF'
      when txt ~ 'termite|anti.?mite|anti.?termite' then 'CAT-MITE'
      when txt ~ 'ceiling|gypsum board|acoustic tile|suspended grid' then 'CAT-CEIL'
      when txt ~ 'carpet' then 'CAT-CRPT'
      when txt ~ 'raised floor|access floor' then 'CAT-RFLR'
      when txt ~ 'marble|granite|natural stone' then 'CAT-MRBL'
      when txt ~ 'tile|tiling' then 'CAT-TILE'
      when txt ~ 'glass|glazing|curtain wall' then 'CAT-GLZ'
      when txt ~ 'window|louver|louvre' then 'CAT-WNDW'
      when txt ~ 'facade|cladding|acp panel' then 'CAT-FAC'
      when txt ~ 'roof' then 'CAT-ROOF'
      when txt ~ 'rebar|reinforc|structural steel|steel beam|steel column|mild steel|high.?yield' then 'CAT-METL'
      when txt ~ 'concrete|cement|ready.?mix' then 'CAT-CONC'
      when txt ~ 'brick|block ?work|masonry|plaster|render|mortar' then 'CAT-MASN'
      when txt ~ 'insulation|rockwool|fiberglass' then 'CAT-INS'
      when txt ~ 'sanitary|water closet|\mwc\M|wash basin|faucet' then 'CAT-SAN'
      when txt ~ 'pipe|plumbing|drainage|upvc' then 'CAT-PLMB'
      when txt ~ 'cable|conduit|electrical|lighting|luminaire|switch|socket|\mmcb\M|panel board' then 'CAT-ELEC'
      when txt ~ 'timber floor|vinyl floor|resilient floor|laminate floor|parquet' then 'CAT-FLR'
      when txt ~ 'paint|emulsion|primer' then 'CAT-PNT'
      else null
    end as cat_code
  from target
)
update public.dwl_material_attributes a
set category_id = c.id,
    updated_at = now()
from matched m
join public.dwl_material_categories c on c.code = m.cat_code
where a.resource_id = m.resource_id
  and m.cat_code is not null;

-- ── 2. Cost Code — only for categories with one unambiguous budget_codes
--      match (see scope note above). Runs after step 1 so materials that
--      just received a Category above are eligible too.
with cost_code_map (cat_code, budget_code) as (
  values
    ('CAT-CEIL', 'D.03'),  -- Ceiling Finishes
    ('CAT-ELEC', 'F.05'),  -- Electrical System
    ('CAT-PLMB', 'F.07'),  -- Plumbing System
    ('CAT-SAN',  'F.01'),  -- Sanitary Installations
    ('CAT-ROOF', 'C.08'),  -- Roofing
    ('CAT-WNDW', 'C.04'),  -- Exterior Window and Louver
    ('CAT-FAC',  'C.02'),  -- Exterior Wall Finishes
    ('CAT-TILE', 'D.02'),  -- Interior Floor Finishes
    ('CAT-MRBL', 'D.02'),  -- Interior Floor Finishes
    ('CAT-CRPT', 'D.02'),  -- Interior Floor Finishes
    ('CAT-RFLR', 'D.02'),  -- Interior Floor Finishes
    ('CAT-FLR',  'D.02')   -- Interior Floor Finishes
)
update public.dwl_material_attributes a
set budget_code_id = bc.id,
    updated_at = now()
from public.dwl_resources r,
     public.dwl_material_categories c
     join cost_code_map m on m.cat_code = c.code
     join public.budget_codes bc on bc.code = m.budget_code
where a.resource_id = r.id
  and r.category = 'material'
  and a.budget_code_id is null
  and c.id = a.category_id;
