-- Category-driven preliminary cost library profiles.
-- Existing tender line items and case parameters are intentionally retained.

create table if not exists public.prelim_profiles (
  code text primary key,
  name text not null,
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.prelim_category_profiles (
  sector_slug text not null,
  building_type_slug text not null,
  profile_code text not null references public.prelim_profiles(code),
  mapping_note text,
  mapping_version integer not null default 1,
  primary key (sector_slug, building_type_slug)
);

create table if not exists public.prelim_library_item_profiles (
  item_id uuid not null references public.prelim_library_items(id) on delete cascade,
  profile_code text not null references public.prelim_profiles(code),
  inclusion_state text not null default 'included' check (inclusion_state in ('included', 'excluded')),
  primary key (item_id, profile_code)
);

alter table public.prelim_library_components
  add column if not exists rate_currency text not null default 'USD',
  add column if not exists rate_source text not null default 'legacy_unverified',
  add column if not exists rate_effective_date date,
  add column if not exists rate_status text not null default 'unverified'
    check (rate_status in ('unverified', 'benchmark', 'quoted', 'approved'));

alter table public.tender_preliminaries_items
  add column if not exists source_library_case_id uuid references public.prelim_library_cases(id) on delete set null,
  add column if not exists source_profile_code text references public.prelim_profiles(code),
  add column if not exists calculation_snapshot jsonb,
  add column if not exists loaded_from_library_at timestamptz;

alter table public.prelim_library_cases
  add column if not exists profile_code text references public.prelim_profiles(code),
  add column if not exists sector_slug text,
  add column if not exists building_type_slug text,
  add column if not exists override_reason text;

insert into public.prelim_profiles (code, name, description) values
  ('PROF-BLD-HR', 'Building – High Rise', 'Multi-storey building work; confirm scale and construction method.'),
  ('PROF-BLD-LR', 'Building – Low Rise', 'Low-rise building work and smaller building sites.'),
  ('PROF-IND', 'Industrial', 'Factories, warehouses, manufacturing and logistics facilities.'),
  ('PROF-INF', 'Infrastructure / Linear', 'Road, bridge, drainage, water and utility work.'),
  ('PROF-GEN', 'General / Default', 'Shared preliminaries for unmapped or internal work.')
on conflict (code) do update set name = excluded.name, description = excluded.description;

update public.prelim_library_cases
set profile_code = 'PROF-BLD-HR'
where profile_code is null and is_default = true;

insert into public.prelim_category_profiles (sector_slug, building_type_slug, profile_code, mapping_note) values
  ('residential','luxury_villa','PROF-BLD-LR',null),
  ('residential','mansion_estate','PROF-BLD-LR',null),
  ('residential','private_residence','PROF-BLD-LR',null),
  ('residential','standard_villa','PROF-BLD-LR',null),
  ('residential','townhouse','PROF-BLD-LR',null),
  ('residential','apartment','PROF-BLD-LR','Review storeys and height; confirm high-rise profile where applicable.'),
  ('residential','condominium','PROF-BLD-HR','Review actual height and construction method.'),
  ('residential','residential_tower','PROF-BLD-HR',null),
  ('residential','residential_development','PROF-BLD-HR','Use separate estimate packages when blocks or infrastructure scopes differ.'),
  ('commercial','showroom','PROF-BLD-LR',null),
  ('commercial','office_building','PROF-BLD-HR','Review storeys and height; confirm low-rise profile where applicable.'),
  ('commercial','shopping_mall','PROF-BLD-LR','Review scale and temporary works requirements.'),
  ('commercial','retail_building','PROF-BLD-LR',null),
  ('commercial','mixed_use_building','PROF-BLD-HR','Split materially different building or civil scopes into packages.'),
  ('commercial','hotel','PROF-BLD-HR','Review actual height and construction method.'),
  ('commercial','restaurant','PROF-BLD-LR',null),
  ('industrial','factory','PROF-IND',null),
  ('industrial','warehouse','PROF-IND',null),
  ('industrial','manufacturing_facility','PROF-IND',null),
  ('industrial','logistics_center','PROF-IND',null),
  ('industrial','industrial_building','PROF-IND',null),
  ('institutional','school','PROF-BLD-LR','Review campus scale; split materially different packages.'),
  ('institutional','university','PROF-BLD-LR','Review campus scale; split materially different packages.'),
  ('institutional','hospital','PROF-BLD-HR','Review actual height and specialist temporary works.'),
  ('institutional','clinic','PROF-BLD-LR',null),
  ('institutional','government_building','PROF-BLD-LR','Review storeys and height; confirm high-rise profile where applicable.'),
  ('institutional','religious_building','PROF-BLD-LR',null),
  ('infrastructure','road','PROF-INF',null),
  ('infrastructure','bridge','PROF-INF','Review temporary works design and staging.'),
  ('infrastructure','drainage','PROF-INF',null),
  ('infrastructure','water_supply','PROF-INF',null),
  ('infrastructure','utility','PROF-INF',null),
  ('infrastructure','other_infrastructure','PROF-INF',null)
on conflict (sector_slug, building_type_slug) do update
set profile_code = excluded.profile_code,
    mapping_note = excluded.mapping_note,
    mapping_version = excluded.mapping_version;

-- Existing items are shared initially; explicit profile exclusions below narrow
-- equipment and building-specific work to the profiles where they apply.
insert into public.prelim_library_item_profiles (item_id, profile_code)
select i.id, p.code
from public.prelim_library_items i
cross join public.prelim_profiles p
on conflict do nothing;

delete from public.prelim_library_item_profiles ip
using public.prelim_library_items i
where ip.item_id = i.id
  and (
    (i.code in ('Z.01.05.01','Z.01.05.02','Z.01.05.03','Z.01.05.04') and ip.profile_code <> 'PROF-BLD-HR')
    or (i.code in ('Z.01.02.03','Z.01.02.04','Z.01.05.06','Z.01.05.07') and ip.profile_code not in ('PROF-BLD-HR','PROF-BLD-LR'))
    or (i.code in ('Z.01.02.07','Z.01.05.05') and ip.profile_code not in ('PROF-BLD-HR','PROF-BLD-LR','PROF-IND'))
    or (i.code = 'Z.01.05.08' and ip.profile_code not in ('PROF-BLD-LR','PROF-IND','PROF-INF'))
    or (i.code = 'Z.01.05.09' and ip.profile_code not in ('PROF-IND','PROF-INF'))
    or (ip.profile_code = 'PROF-GEN' and i.code in ('Z.01.02.02','Z.01.02.03','Z.01.02.04','Z.01.02.07','Z.01.05.01','Z.01.05.02','Z.01.05.03','Z.01.05.04','Z.01.05.05','Z.01.05.06','Z.01.05.07','Z.01.05.08','Z.01.05.09'))
  );

-- Add a small, explicitly profile-specific starting set for infrastructure.
insert into public.prelim_library_items
  (parent_code, code, description, unit, calc_mode, default_qty, formula, sort_order, category, notes)
values
  ('Z.01', 'Z.01.09', 'Infrastructure Temporary Works', 'Sum', 'sum_children', 1, null, 90, 'temporary_works', 'Infrastructure profile items'),
  ('Z.01.09', 'Z.01.09.01', 'Temporary traffic diversion and signage', 'm', 'param', 0, 'P30', 1, 'temporary_works', 'Quantity driver: alignment / road length; review staging and authority requirements.'),
  ('Z.01.09', 'Z.01.09.02', 'Temporary access bridges / crossings', 'no', 'param', 0, 'P32', 2, 'temporary_works', 'Quantity driver: number of structures / crossings.'),
  ('Z.01.09', 'Z.01.09.03', 'Dust, noise and environmental monitoring', 'Month', 'param', 0, 'P07', 3, 'temporary_works', 'Duration-based; set project-specific rate and quantity.'),
  ('Z.01.09', 'Z.01.09.04', 'Temporary drainage and water diversion', 'Item', 'fixed', 0, null, 4, 'temporary_works', 'Use only where required by method statement.')
on conflict (code) do nothing;

insert into public.prelim_library_item_profiles (item_id, profile_code)
select i.id, 'PROF-INF' from public.prelim_library_items i
where i.code like 'Z.01.09%'
on conflict do nothing;
delete from public.prelim_library_item_profiles ip
using public.prelim_library_items i
where ip.item_id = i.id and i.code like 'Z.01.09%' and ip.profile_code <> 'PROF-INF';

alter table public.prelim_profiles enable row level security;
alter table public.prelim_category_profiles enable row level security;
alter table public.prelim_library_item_profiles enable row level security;

drop policy if exists "Authenticated users can read prelim profiles" on public.prelim_profiles;
create policy "Authenticated users can read prelim profiles" on public.prelim_profiles
  for select to authenticated using (true);
drop policy if exists "Authenticated users can manage prelim profiles" on public.prelim_profiles;
create policy "Authenticated users can manage prelim profiles" on public.prelim_profiles
  for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Authenticated users can read prelim category profiles" on public.prelim_category_profiles;
create policy "Authenticated users can read prelim category profiles" on public.prelim_category_profiles
  for select to authenticated using (true);
drop policy if exists "Authenticated users can manage prelim category profiles" on public.prelim_category_profiles;
create policy "Authenticated users can manage prelim category profiles" on public.prelim_category_profiles
  for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "Authenticated users can read prelim item profiles" on public.prelim_library_item_profiles;
create policy "Authenticated users can read prelim item profiles" on public.prelim_library_item_profiles
  for select to authenticated using (true);
drop policy if exists "Authenticated users can manage prelim item profiles" on public.prelim_library_item_profiles;
create policy "Authenticated users can manage prelim item profiles" on public.prelim_library_item_profiles
  for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
