-- Migration: 20261020000007_qs_wbs_templates.sql
-- Purpose: Standard WBS Template Engine for Tender BOQ & Cost Estimation.
--          Enables generating structured Tender BOQs aligned with international standards
--          (UniFormat II / RICS NRM1 for CBS, MasterFormat for PBS/Procurement,
--          and Activity Masters for WBS/Planning).
-- Depends on:
--   - 20260711000003_budget_codes.sql (budget_codes)
--   - 20260531000022_create_qs_cost_library.sql (qs_element_library)
--   - 20261020000003_planning_qs_bridge.sql (plan_work_groups, plan_act_masters)

-- ── 1. Master Template Catalog ─────────────────────────────────────────────
create table if not exists public.qs_wbs_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text not null unique,
  title text not null,
  building_type text not null default 'commercial',
  standard_framework text not null default 'hybrid_uniformat_masterformat',
  description text,
  version integer not null default 1,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qs_wbs_templates_bldg_type_chk check (
    building_type in ('commercial', 'residential', 'industrial', 'infrastructure', 'mixed_use', 'other')
  ),
  constraint qs_wbs_templates_framework_chk check (
    standard_framework in ('uniformat_ii', 'rics_nrm1', 'masterformat', 'hybrid_uniformat_masterformat', 'custom')
  )
);

comment on table public.qs_wbs_templates is
  'Standard project breakdown templates for Tender BOQ and Cost Estimation. Provides standardized scaffolding for residential towers, commercial buildings, warehouses, etc.';

-- ── 2. Template Breakdown Items (Hierarchical Scaffold) ────────────────────
create table if not exists public.qs_wbs_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.qs_wbs_templates(id) on delete cascade,
  parent_id uuid references public.qs_wbs_template_items(id) on delete cascade,
  item_code text not null,
  item_level integer not null default 1, -- 1: Discipline, 2: Group/Section, 3: Sub Section, 4: Sub Element / Leaf
  discipline text not null,               -- e.g. 'Civil and Structure', 'Architecture', 'MEP'
  section text not null,                  -- e.g. 'Superstructure', 'Sub-Structure'
  sub_section text,                       -- e.g. 'Structural Column', 'Masonry'
  sub_element text,                       -- e.g. 'Concrete', 'Formwork', 'Rebar'
  typical_unit text not null default 'm',
  
  -- Commercial Classification (CBS)
  budget_code_id uuid references public.budget_codes(id) on delete set null,
  element_library_id uuid references public.qs_element_library(id) on delete set null,
  uniformat_code text,                    -- e.g. 'B1010.10'
  masterformat_code text,                 -- e.g. '03 31 00'
  nrm_code text,                          -- e.g. '2.1.1'
  
  -- Planning Bridge (WBS / Time)
  planning_activity_master_id uuid references public.plan_act_masters(id) on delete set null,
  default_work_group text references public.plan_work_groups(code) on update cascade,
  duration_driver_role text not null default 'driver', -- 'driver', 'excluded', 'fixed'
  unit_conversion_factor numeric not null default 1.0, -- e.g. 0.001 for kg -> t
  
  -- Procurement Bridge (PBS / Supply Chain)
  default_procurement_package_code text,  -- e.g. 'PKG-STR-CONC-01', 'PKG-STR-REBAR-02'
  procurement_package_name text,          -- e.g. 'Ready-Mix Concrete Supply'
  resource_type text not null default 'material', -- 'material', 'subcontractor', 'labor', 'equipment'
  
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  constraint qs_wbs_template_items_role_chk check (duration_driver_role in ('driver', 'excluded', 'fixed')),
  constraint qs_wbs_template_items_resource_chk check (resource_type in ('material', 'subcontractor', 'labor', 'equipment')),
  constraint qs_wbs_template_items_factor_chk check (unit_conversion_factor > 0)
);

comment on table public.qs_wbs_template_items is
  'Predefined elemental line items in a WBS template. Each line carries CBS budget codes, planning activity master links, and procurement trade package codes.';

-- ── 3. Template Location Matrix (Default LBS Configuration) ───────────────
create table if not exists public.qs_wbs_template_locations (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.qs_wbs_templates(id) on delete cascade,
  location_type text not null,            -- 'substructure', 'podium', 'typical_tower', 'roof', 'external'
  level_code text not null,               -- e.g. 'B2', 'B1', 'GF', '1F', 'TYP_2F-20F', 'RF'
  level_name text not null,               -- e.g. 'Basement Level 2', 'Typical Floors (L02-L20)'
  floor_multiplier integer not null default 1, -- e.g. 19 for typical floor repetition
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint qs_wbs_template_locations_mult_chk check (floor_multiplier >= 1)
);

comment on table public.qs_wbs_template_locations is
  'Default floor/level location patterns associated with a template to automate multi-floor BOQ instantiation.';

-- ── 4. Indexes ─────────────────────────────────────────────────────────────
create index if not exists idx_qs_wbs_templates_code on public.qs_wbs_templates(template_code);
create index if not exists idx_qs_wbs_template_items_template on public.qs_wbs_template_items(template_id);
create index if not exists idx_qs_wbs_template_items_parent on public.qs_wbs_template_items(parent_id);
create index if not exists idx_qs_wbs_template_items_budget_code on public.qs_wbs_template_items(budget_code_id);
create index if not exists idx_qs_wbs_template_items_act_master on public.qs_wbs_template_items(planning_activity_master_id);
create index if not exists idx_qs_wbs_template_items_proc_pkg on public.qs_wbs_template_items(default_procurement_package_code);

-- ── 5. RLS Policies ────────────────────────────────────────────────────────
alter table public.qs_wbs_templates enable row level security;
alter table public.qs_wbs_template_items enable row level security;
alter table public.qs_wbs_template_locations enable row level security;

-- Everyone authenticated can view master templates
create policy "qs_wbs_templates select" on public.qs_wbs_templates for select to authenticated using (true);
create policy "qs_wbs_template_items select" on public.qs_wbs_template_items for select to authenticated using (true);
create policy "qs_wbs_template_locations select" on public.qs_wbs_template_locations for select to authenticated using (true);

-- Only authorized master library managers / admins can modify templates
create policy "qs_wbs_templates manage" on public.qs_wbs_templates for all to authenticated
  using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

create policy "qs_wbs_template_items manage" on public.qs_wbs_template_items for all to authenticated
  using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

create policy "qs_wbs_template_locations manage" on public.qs_wbs_template_locations for all to authenticated
  using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

-- ── 6. Seed Baseline Standard Template ─────────────────────────────────────
insert into public.qs_wbs_templates (template_code, title, building_type, standard_framework, description)
values (
  'TPL-HIGHRISE-RC',
  'High-Rise Reinforced Concrete Building (Standard)',
  'commercial',
  'hybrid_uniformat_masterformat',
  'Standard multi-tier breakdown for high-rise RC building. Structured by UniFormat/NRM1 elements, pre-linked to MasterFormat procurement packages and Planning Activity Masters.'
)
on conflict (template_code) do nothing;

-- Seed Default Locations for High-Rise Template
with tpl as (select id from public.qs_wbs_templates where template_code = 'TPL-HIGHRISE-RC' limit 1)
insert into public.qs_wbs_template_locations (template_id, location_type, level_code, level_name, floor_multiplier, sort_order)
select tpl.id, 'substructure', 'B01', 'Basement 1', 1, 10 from tpl
union all
select tpl.id, 'podium', '02.GF', 'Ground Floor', 1, 20 from tpl
union all
select tpl.id, 'podium', '03.1F', 'Level 1 (Podium)', 1, 30 from tpl
union all
select tpl.id, 'typical_tower', 'TYP_04F-15F', 'Typical Tower Floors (L04-L15)', 12, 40 from tpl
union all
select tpl.id, 'roof', '16.RF', 'Roof & Parapet', 1, 50 from tpl
on conflict do nothing;

-- Seed Default Items for High-Rise Template
with tpl as (select id from public.qs_wbs_templates where template_code = 'TPL-HIGHRISE-RC' limit 1)
insert into public.qs_wbs_template_items (
  template_id, item_code, item_level, discipline, section, sub_section, sub_element, typical_unit,
  element_library_id, uniformat_code, masterformat_code, default_work_group, duration_driver_role, unit_conversion_factor,
  default_procurement_package_code, procurement_package_name, resource_type, sort_order
)
select 
  tpl.id,
  case 
    when el.sub_section = 'Structural Column' and el.sub_element = 'Concrete' then 'STR-COL-CONC'
    when el.sub_section = 'Structural Column' and el.sub_element = 'Formwork' then 'STR-COL-FORM'
    when el.sub_section = 'Structural Column' and el.sub_element = 'Rebar' then 'STR-COL-REBAR'
    when el.sub_section = 'Structural Column' and el.sub_element = 'Steel Tie Wire' then 'STR-COL-TIE'
    when el.sub_section = 'Structural Beam' and el.sub_element = 'Concrete' then 'STR-BM-CONC'
    when el.sub_section = 'Structural Beam' and el.sub_element = 'Formwork' then 'STR-BM-FORM'
    when el.sub_section = 'Structural Beam' and el.sub_element = 'Rebar' then 'STR-BM-REBAR'
    else 'STR-ITEM'
  end as item_code,
  4 as item_level,
  el.discipline,
  el.section,
  el.sub_section,
  el.sub_element,
  el.typical_unit,
  el.id as element_library_id,
  'B1010.10' as uniformat_code,
  case 
    when el.sub_element = 'Concrete' then '03 31 00'
    when el.sub_element = 'Formwork' then '03 11 00'
    when el.sub_element = 'Rebar' then '03 21 00'
    else '03 00 00'
  end as masterformat_code,
  'ST' as default_work_group,
  case when el.sub_element = 'Steel Tie Wire' then 'excluded' else 'driver' end as duration_driver_role,
  case when el.typical_unit = 'kg' then 0.001 else 1.0 end as unit_conversion_factor,
  case 
    when el.sub_element = 'Concrete' then 'PKG-STR-CONC-01'
    when el.sub_element = 'Formwork' then 'PKG-STR-FORM-01'
    when el.sub_element = 'Rebar' then 'PKG-STR-REBAR-01'
    else 'PKG-STR-MISC'
  end as default_procurement_package_code,
  case 
    when el.sub_element = 'Concrete' then 'Ready-Mix Concrete Supply'
    when el.sub_element = 'Formwork' then 'Formwork Subcontract'
    when el.sub_element = 'Rebar' then 'Rebar Supply & Bending'
    else 'Miscellaneous Materials'
  end as procurement_package_name,
  case when el.sub_element = 'Formwork' then 'subcontractor' else 'material' end as resource_type,
  row_number() over () * 10 as sort_order
from tpl, public.qs_element_library el
where el.id in (
  '77d690b5-4cfb-49f9-bd5c-ff67fe77493c',
  '2f37b9d9-82c8-42dd-a4ec-f9f6b0814a90',
  '1c6120ac-c47a-45ff-8de7-2f10e06a64be',
  '2f9ce27b-48c7-4ab9-9821-a2af992a5d6b',
  '7720a9da-dc96-4314-8947-5ad30f70d4b2',
  '92cf6a44-ab87-41fd-9d82-8f9306ba0cb1',
  '0540f997-3be5-4db6-ba58-7a8c913d356d'
)
on conflict do nothing;

