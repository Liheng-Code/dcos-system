-- Add project-category applicability to QS BOQ scaffolds.
-- The QS scaffold organizes estimate lines; the operational Planning WBS remains separate.

alter table public.qs_wbs_templates
  add column if not exists template_category text,
  add column if not exists building_types text[] not null default '{}',
  add column if not exists template_family text,
  add column if not exists location_model text not null default 'building';

alter table public.qs_wbs_templates
  drop constraint if exists qs_wbs_templates_location_model_chk;

alter table public.qs_wbs_templates
  add constraint qs_wbs_templates_location_model_chk
  check (location_model in ('building', 'campus', 'facility', 'linear', 'general'));

create index if not exists idx_qs_wbs_templates_category
  on public.qs_wbs_templates(template_category);
create index if not exists idx_qs_wbs_templates_building_types
  on public.qs_wbs_templates using gin(building_types);
create index if not exists idx_qs_wbs_templates_family
  on public.qs_wbs_templates(template_family);

comment on column public.qs_wbs_templates.template_category is
  'Project sector slug from projects.category; null means category-neutral.';
comment on column public.qs_wbs_templates.building_types is
  'Applicable project building-type slugs from projects.building_type; empty means any type in the selected sector.';
comment on column public.qs_wbs_templates.template_family is
  'Reusable construction profile such as building_multi_storey or infrastructure_linear.';
comment on column public.qs_wbs_templates.location_model is
  'Location pattern for BOQ instantiation: building, campus, facility, linear, or general.';

-- Existing high-rise RC scaffold is a multi-storey building option. It is suggested
-- for these types, but users still select/confirm the template and locations.
update public.qs_wbs_templates
set template_family = 'building_multi_storey',
    template_category = null,
    building_types = array[
      'apartment', 'condominium', 'residential_tower', 'office_building', 'hotel',
      'hospital', 'government_building', 'shopping_mall', 'mixed_use_building'
    ],
    location_model = 'building',
    updated_at = now()
where template_code = 'TPL-HIGHRISE-RC';

