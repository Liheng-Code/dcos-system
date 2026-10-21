-- Activity Library by sector (Planning > Activity Library, Phase A of the "Activity Library by
-- Sector" plan).
--
-- Activity masters and activity templates take the Project Categories taxonomy
-- (apps/web/lib/project-categories.ts) instead of their own project-type words:
--   sectors        = sector slugs (projects.category) the master / template can be used in;
--                    empty = every sector
--   building_types = building-type slugs (projects.building_type) it is written for; these
--                    projects get it as "recommended"
-- A master or a floor-cycle template usually serves several sectors (a column is a column in a
-- condominium or a hospital), so both take a list rather than one sector. The tags are
-- classification, not versioned content: the master / template guards leave them editable on
-- any status.
--
-- Existing data: the 80 masters are building trades (RC structure, finishes, MEP), so they get the
-- four building sectors; the two typical-floor templates get the sectors and building types of
-- multi-storey buildings. Applicability rules on the old project_type attribute become
-- building_type rules with the same meaning (high_rise -> towers, ...), so Generate's
-- applicability check behaves as before.

alter table public.plan_act_masters
  add column if not exists sectors text[] not null default '{}',
  add column if not exists building_types text[] not null default '{}';

alter table public.plan_act_templates
  add column if not exists sectors text[] not null default '{}',
  add column if not exists building_types text[] not null default '{}';

comment on column public.plan_act_masters.sectors is
  'Sector slugs (projects.category) this master is used in; empty = every sector.';
comment on column public.plan_act_masters.building_types is
  'Building-type slugs (projects.building_type) this master is written for; empty = any in its sectors.';
comment on column public.plan_act_masters.applicable_project_types is
  'Deprecated (replaced by sectors + building_types).';
comment on column public.plan_act_templates.sectors is
  'Sector slugs (projects.category) this template is used in; empty = every sector.';
comment on column public.plan_act_templates.building_types is
  'Building-type slugs (projects.building_type) this template is recommended for; empty = any in its sectors.';

-- Building-trade masters that existed before sectors: every building sector, not infrastructure.
update public.plan_act_masters
   set sectors = array['residential', 'commercial', 'industrial', 'institutional']
 where sectors = '{}'
   and created_at < timestamptz '2026-10-22'
   and (applicable_project_types = '{}' or applicable_project_types && array['high_rise', 'building', 'low_rise']);

update public.plan_act_templates
   set sectors = array['residential', 'commercial', 'institutional'],
       building_types = array['residential_tower', 'condominium', 'office_building', 'hotel', 'mixed_use_building', 'hospital']
 where code = 'TPL-STR-HR-RC-FLOOR-001' and sectors = '{}';

update public.plan_act_templates
   set sectors = array['residential', 'commercial', 'institutional'],
       building_types = array['apartment', 'condominium', 'residential_tower', 'office_building', 'mixed_use_building',
                              'hotel', 'hospital', 'school', 'university', 'government_building']
 where code = 'TPL-BLD-TYP-FLOOR-001' and sectors = '{}';

-- Old project_type rules -> building_type rules with the same meaning.
update public.plan_act_applicability a
   set attribute = 'building_type',
       values = (
         select coalesce(array_agg(distinct bt order by bt), '{}')
           from unnest(a.values) v,
                unnest(case lower(btrim(v))
                  when 'high_rise' then array['residential_tower', 'condominium', 'office_building', 'hotel', 'mixed_use_building', 'hospital']
                  when 'low_rise' then array['luxury_villa', 'mansion_estate', 'private_residence', 'standard_villa', 'townhouse', 'apartment',
                                             'residential_development', 'showroom', 'restaurant', 'retail_building', 'school', 'clinic', 'religious_building']
                  when 'building' then array['luxury_villa', 'mansion_estate', 'private_residence', 'standard_villa', 'townhouse', 'apartment',
                                             'condominium', 'residential_tower', 'residential_development', 'showroom', 'office_building',
                                             'shopping_mall', 'retail_building', 'mixed_use_building', 'hotel', 'restaurant', 'factory',
                                             'warehouse', 'manufacturing_facility', 'logistics_center', 'industrial_building', 'school',
                                             'university', 'hospital', 'clinic', 'government_building', 'religious_building']
                  when 'industrial' then array['factory', 'warehouse', 'manufacturing_facility', 'logistics_center', 'industrial_building']
                  when 'infrastructure' then array['road', 'bridge', 'drainage', 'water_supply', 'utility', 'other_infrastructure']
                  else array[lower(btrim(v))]
                end) bt
       )
 where a.attribute = 'project_type';
