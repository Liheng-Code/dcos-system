-- Project Categories: two-level Sector -> Building Type taxonomy.
-- Source: docs/04-Business-Modules/04-02-Project-Setup/Project Categories.md
--
-- `projects.category` is repurposed to hold the SECTOR slug (its previous
-- sector-like values already fit); a new `projects.building_type` column holds
-- the leaf building-type slug. Both stay nullable (drafts).

-- ============================================================
-- 1. Migrate legacy `category` values to canonical sectors
-- ============================================================
update public.projects set category = 'residential' where category = 'high_rise';
update public.projects set category = 'commercial'  where category = 'mixed_use';
update public.projects set category = null          where category = 'building';
-- 'residential' | 'commercial' | 'industrial' | 'infrastructure' | 'other' unchanged.

-- ============================================================
-- 2. Relax the `category` check to the canonical sector list
-- ============================================================
alter table public.projects drop constraint if exists projects_category_check;
alter table public.projects
  add constraint projects_category_check check (category in (
    'residential', 'commercial', 'industrial', 'institutional', 'infrastructure', 'other'
  ));

-- ============================================================
-- 3. Add `building_type` (leaf of the taxonomy)
-- ============================================================
alter table public.projects
  add column if not exists building_type text check (building_type in (
    -- residential
    'luxury_villa', 'mansion_estate', 'private_residence', 'standard_villa',
    'townhouse', 'apartment', 'condominium', 'residential_tower', 'residential_development',
    -- commercial
    'showroom', 'office_building', 'shopping_mall', 'retail_building',
    'mixed_use_building', 'hotel', 'restaurant',
    -- industrial
    'factory', 'warehouse', 'manufacturing_facility', 'logistics_center', 'industrial_building',
    -- institutional
    'school', 'university', 'hospital', 'clinic', 'government_building', 'religious_building',
    -- infrastructure
    'road', 'bridge', 'drainage', 'water_supply', 'utility', 'other_infrastructure'
  ));

comment on column public.projects.category is 'Project sector slug (see lib/project-categories.ts)';
comment on column public.projects.building_type is 'Building-type slug within the sector (see lib/project-categories.ts)';
