-- Migration: 20261023122000_core_csi_divisions.sql
-- Purpose: One core CSI MasterFormat 2016 library (csi_divisions, csi_sections) shared by QS and Planning.
--          Freezes the older QS/Planning division lists and points QS cost codes, material categories,
--          work items, WBS template items and Activity Database masters at the core library.
-- Depends on: dwl_material_divisions, dwl_material_division_sections, dwl_material_categories, qs_cost_divisions,
--             qs_cost_sections, dwl_work_items, qs_wbs_template_items, plan_act_masters, plan_act_divisions,
--             plan_act_division_counters, plan_act_master_work_items, can_manage_master_libraries(),
--             set_updated_at(), profiles (all exist)
-- Additive only: nothing is renamed, dropped or retyped. plan_act_masters.division_id and the old division
-- tables / RPC signatures stay (frozen / unused) until a later cleanup migration.
-- Reference libraries are global (no tenant_id), like dwl_material_divisions and plan_act_divisions.
-- No audit-log trigger: master libraries have no audit pattern; updated_by/updated_at are kept instead.

-- 1. csi_divisions ------------------------------------------------------------------
create table if not exists public.csi_divisions (
  code        text primary key,
  name        text not null,
  group_name  text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null,
  constraint csi_divisions_code_chk check (code ~ '^[0-9]{2}$')
);

insert into public.csi_divisions (code, name, group_name, sort_order) values
  ('00','Procurement and Contracting Requirements','Procurement and Contracting Requirements',0),
  ('01','General Requirements','General Requirements',1),
  ('02','Existing Conditions','Facility Construction',2),
  ('03','Concrete','Facility Construction',3),
  ('04','Masonry','Facility Construction',4),
  ('05','Metals','Facility Construction',5),
  ('06','Wood, Plastics, and Composites','Facility Construction',6),
  ('07','Thermal and Moisture Protection','Facility Construction',7),
  ('08','Openings','Facility Construction',8),
  ('09','Finishes','Facility Construction',9),
  ('10','Specialties','Facility Construction',10),
  ('11','Equipment','Facility Construction',11),
  ('12','Furnishings','Facility Construction',12),
  ('13','Special Construction','Facility Construction',13),
  ('14','Conveying Equipment','Facility Construction',14),
  ('21','Fire Suppression','Facility Services',21),
  ('22','Plumbing','Facility Services',22),
  ('23','Heating, Ventilating, and Air Conditioning (HVAC)','Facility Services',23),
  ('25','Integrated Automation','Facility Services',25),
  ('26','Electrical','Facility Services',26),
  ('27','Communications','Facility Services',27),
  ('28','Electronic Safety and Security','Facility Services',28),
  ('31','Earthwork','Site and Infrastructure',31),
  ('32','Exterior Improvements','Site and Infrastructure',32),
  ('33','Utilities','Site and Infrastructure',33),
  ('34','Transportation','Site and Infrastructure',34),
  ('35','Waterway and Marine Construction','Site and Infrastructure',35),
  ('40','Process Interconnections','Process Equipment',40),
  ('41','Material Processing and Handling Equipment','Process Equipment',41),
  ('42','Process Heating, Cooling, and Drying Equipment','Process Equipment',42),
  ('43','Process Gas and Liquid Handling, Purification, and Storage Equipment','Process Equipment',43),
  ('44','Pollution and Waste Control Equipment','Process Equipment',44),
  ('45','Industry-Specific Manufacturing Equipment','Process Equipment',45),
  ('46','Water and Wastewater Equipment','Process Equipment',46),
  ('48','Electrical Power Generation','Process Equipment',48)
on conflict (code) do nothing;

-- 2. csi_sections -------------------------------------------------------------------
create table if not exists public.csi_sections (
  code           text primary key,
  division_code  text not null references public.csi_divisions(code) on update cascade on delete restrict,
  parent_code    text references public.csi_sections(code) on update cascade on delete restrict,
  level          smallint not null,
  name           text not null,
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null,
  constraint csi_sections_code_chk check (code ~ '^[0-9]{2} [0-9]{2} [0-9]{2}$'),
  constraint csi_sections_division_chk check (left(code, 2) = division_code),
  constraint csi_sections_level_chk check (level in (2, 3))
);
create index if not exists idx_csi_sections_division on public.csi_sections (division_code);
create index if not exists idx_csi_sections_parent on public.csi_sections (parent_code);

-- 2a. copy the QS sections (official titles replace eight informal ones)
insert into public.csi_sections (code, division_code, parent_code, level, name, sort_order)
select s.code, s.division_code, s.parent_code,
       case when s.code like '__ __ 00' then 2 else 3 end,
       coalesce(o.name, s.name), s.sort_order
  from public.dwl_material_division_sections s
  left join (values
    ('01 11 00','Summary of Work'),
    ('01 14 00','Work Restrictions'),
    ('01 29 00','Payment Procedures'),
    ('01 54 00','Construction Aids'),
    ('03 15 00','Concrete Accessories'),
    ('03 24 00','Fibrous Reinforcing'),
    ('07 30 00','Steep Slope Roofing'),
    ('03 31 00','Structural Concrete')
  ) o(code, name) on o.code = s.code
on conflict (code) do nothing;

-- 2b. level-2 sections referenced by the Planning remap, QS cost sections and work-item backfill
insert into public.csi_sections (code, division_code, parent_code, level, name, sort_order)
select v.code, left(v.code, 2), null, 2, v.name, 0
  from (values
    ('01 45 00','Quality Control'),
    ('01 50 00','Temporary Facilities and Controls'),
    ('01 71 00','Examination and Preparation'),
    ('01 74 00','Cleaning and Waste Management'),
    ('03 01 00','Maintenance of Concrete'),
    ('03 11 00','Concrete Forming'),
    ('03 15 00','Concrete Accessories'),
    ('03 20 00','Concrete Reinforcing'),
    ('03 21 00','Reinforcing Bars'),
    ('03 22 00','Fabric and Grid Reinforcing'),
    ('03 30 00','Cast-in-Place Concrete'),
    ('03 35 00','Concrete Finishing'),
    ('03 39 00','Concrete Curing'),
    ('03 41 00','Precast Structural Concrete'),
    ('03 53 00','Concrete Topping'),
    ('04 20 00','Unit Masonry'),
    ('04 22 00','Concrete Unit Masonry'),
    ('04 43 00','Stone Masonry'),
    ('05 05 00','Common Work Results for Metals'),
    ('05 10 00','Structural Metal Framing'),
    ('05 12 00','Structural Steel Framing'),
    ('05 31 00','Steel Decking'),
    ('05 41 00','Structural Metal Stud Framing'),
    ('05 50 00','Metal Fabrications'),
    ('05 52 00','Metal Railings'),
    ('06 17 00','Shop-Fabricated Structural Wood'),
    ('06 41 00','Architectural Wood Casework'),
    ('07 10 00','Dampproofing and Waterproofing'),
    ('07 20 00','Thermal Protection'),
    ('07 21 00','Thermal Insulation'),
    ('07 22 00','Roof and Deck Insulation'),
    ('07 31 00','Shingles and Shakes'),
    ('07 32 00','Roof Tiles'),
    ('07 41 00','Roof Panels'),
    ('07 42 00','Wall Panels'),
    ('07 50 00','Membrane Roofing'),
    ('07 62 00','Sheet Metal Flashing and Trim'),
    ('07 71 00','Roof Specialties'),
    ('07 72 00','Roof Accessories'),
    ('07 92 00','Joint Sealants'),
    ('07 95 00','Expansion Control'),
    ('08 10 00','Doors and Frames'),
    ('08 33 00','Coiling Doors and Grilles'),
    ('08 44 00','Curtain Wall and Glazed Assemblies'),
    ('08 50 00','Windows'),
    ('08 71 00','Door Hardware'),
    ('08 80 00','Glazing'),
    ('09 05 00','Common Work Results for Finishes'),
    ('09 20 00','Plaster and Gypsum Board'),
    ('09 22 00','Supports for Plaster and Gypsum Board'),
    ('09 24 00','Cement Plastering'),
    ('09 29 00','Gypsum Board'),
    ('09 30 00','Tiling'),
    ('09 51 00','Acoustical Ceilings'),
    ('09 64 00','Wood Flooring'),
    ('09 65 00','Resilient Flooring'),
    ('09 67 00','Fluid-Applied Flooring'),
    ('09 72 00','Wall Coverings'),
    ('09 90 00','Painting and Coating'),
    ('09 91 00','Painting'),
    ('10 11 00','Visual Display Units'),
    ('10 14 00','Signage'),
    ('10 26 00','Wall and Door Protection'),
    ('10 56 00','Storage Assemblies'),
    ('11 13 00','Loading Dock Equipment'),
    ('12 35 00','Specialty Casework'),
    ('12 60 00','Multiple Seating'),
    ('13 11 00','Swimming Pools'),
    ('13 21 00','Controlled Environment Rooms'),
    ('13 34 00','Fabricated Engineered Structures'),
    ('13 49 00','Radiation Protection'),
    ('14 60 00','Hoists and Cranes'),
    ('21 08 00','Commissioning of Fire Suppression'),
    ('21 12 00','Fire-Suppression Standpipes'),
    ('21 13 00','Fire-Suppression Sprinkler Systems'),
    ('21 22 00','Clean-Agent Fire-Extinguishing Systems'),
    ('22 08 00','Commissioning of Plumbing'),
    ('22 10 00','Plumbing Piping and Pumps'),
    ('22 11 00','Facility Water Distribution'),
    ('22 13 00','Facility Sanitary Sewerage'),
    ('22 15 00','General Service Compressed-Air Systems'),
    ('22 33 00','Electric Domestic Water Heaters'),
    ('22 40 00','Plumbing Fixtures'),
    ('22 63 00','Gas Systems for Healthcare Facilities'),
    ('23 05 00','Common Work Results for HVAC'),
    ('23 07 00','HVAC Insulation'),
    ('23 21 00','Hydronic Piping and Pumps'),
    ('23 31 00','HVAC Ducts and Casings'),
    ('23 34 00','HVAC Fans'),
    ('23 37 00','Air Outlets and Inlets'),
    ('23 73 00','Indoor Central-Station Air-Handling Units'),
    ('25 00 00','Integrated Automation'),
    ('26 05 00','Common Work Results for Electrical'),
    ('26 08 00','Commissioning of Electrical Systems'),
    ('26 20 00','Low-Voltage Electrical Transmission'),
    ('26 24 00','Switchboards and Panelboards'),
    ('26 27 00','Low-Voltage Distribution Equipment'),
    ('26 31 00','Photovoltaic Collectors'),
    ('26 41 00','Facility Lightning Protection'),
    ('26 50 00','Lighting'),
    ('26 51 00','Interior Lighting'),
    ('26 56 00','Exterior Lighting'),
    ('27 13 00','Communications Backbone Cabling'),
    ('27 51 00','Distributed Audio-Video Communications Systems'),
    ('27 52 00','Healthcare Communications and Monitoring Systems'),
    ('28 31 00','Fire Detection and Alarm'),
    ('31 10 00','Site Clearing'),
    ('31 14 00','Earth Stripping and Stockpiling'),
    ('31 20 00','Earth Moving'),
    ('31 22 00','Grading'),
    ('31 23 00','Excavation and Fill'),
    ('31 31 00','Soil Treatment'),
    ('31 32 00','Soil Stabilization'),
    ('31 37 00','Riprap'),
    ('31 50 00','Excavation Support and Protection'),
    ('31 60 00','Special Foundations and Load-Bearing Elements'),
    ('31 63 00','Bored Piles'),
    ('32 01 00','Operation and Maintenance of Exterior Improvements'),
    ('32 11 00','Base Courses'),
    ('32 12 00','Flexible Paving'),
    ('32 13 00','Rigid Paving'),
    ('32 14 00','Unit Paving'),
    ('32 16 00','Curbs, Gutters, Sidewalks, and Driveways'),
    ('32 17 00','Paving Specialties'),
    ('32 18 00','Athletic and Recreational Surfacing'),
    ('32 31 00','Fences and Gates'),
    ('32 90 00','Planting'),
    ('33 05 00','Common Work Results for Utilities'),
    ('33 10 00','Water Utilities'),
    ('33 12 00','Water Utility Distribution Equipment'),
    ('33 13 00','Disinfecting of Water Utility Distribution'),
    ('33 36 00','Utility Septic Tanks'),
    ('33 41 00','Storm Utility Drainage Piping'),
    ('33 46 00','Subdrainage'),
    ('33 49 00','Storm Drainage Structures'),
    ('33 71 00','Electrical Utility Transmission and Distribution'),
    ('34 41 00','Roadway Signaling and Control Equipment'),
    ('34 71 00','Roadway Construction'),
    ('43 21 00','Pumps')
  ) v(code, name)
on conflict (code) do nothing;

-- 2c. level-3 sections (parent = the 'xx yy 00' of the same group; it must exist from 2a/2b)
insert into public.csi_sections (code, division_code, parent_code, level, name, sort_order)
select v.code, left(v.code, 2), left(v.code, 5) || ' 00', 3, v.name, 0
  from (values
    ('01 71 23','Field Engineering'),
    ('07 41 13','Metal Roof Panels'),
    ('09 22 26','Suspension Systems'),
    ('09 65 13','Resilient Base and Accessories'),
    ('12 35 53','Laboratory Casework'),
    ('21 13 13','Wet-Pipe Sprinkler Systems'),
    ('22 11 16','Domestic Water Piping'),
    ('22 13 16','Sanitary Waste and Vent Piping'),
    ('23 05 93','Testing, Adjusting, and Balancing for HVAC'),
    ('23 21 13','Hydronic Piping'),
    ('26 05 13','Medium-Voltage Cables'),
    ('26 05 19','Low-Voltage Electrical Power Conductors and Cables'),
    ('26 05 26','Grounding and Bonding for Electrical Systems'),
    ('26 05 36','Cable Trays for Electrical Systems'),
    ('26 24 16','Panelboards'),
    ('26 27 26','Wiring Devices'),
    ('27 13 23','Communications Optical Fiber Backbone Cabling'),
    ('27 52 23','Nurse Call/Code Blue Systems'),
    ('31 14 13','Soil Stripping and Stockpiling'),
    ('31 23 16','Excavation'),
    ('31 23 19','Dewatering'),
    ('31 23 23','Fill'),
    ('31 31 16','Termite Control'),
    ('32 11 16','Subbase Courses'),
    ('32 11 23','Aggregate Base Courses'),
    ('32 12 13','Tack Coats'),
    ('32 12 16','Asphalt Paving'),
    ('32 13 13','Concrete Paving'),
    ('32 17 23','Pavement Markings'),
    ('33 05 16','Utility Structures'),
    ('33 05 23','Trenchless Utility Installation'),
    ('33 71 19','Electrical Underground Ducts and Manholes'),
    ('34 41 13','Traffic Signals'),
    ('34 71 13','Vehicle Barriers')
  ) v(code, name)
on conflict (code) do nothing;

-- 3. updated_at / updated_by, RLS, grants -------------------------------------------
create or replace function public.csi_set_audit_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists trg_csi_divisions_audit on public.csi_divisions;
create trigger trg_csi_divisions_audit before insert or update on public.csi_divisions
  for each row execute function public.csi_set_audit_columns();
drop trigger if exists trg_csi_sections_audit on public.csi_sections;
create trigger trg_csi_sections_audit before insert or update on public.csi_sections
  for each row execute function public.csi_set_audit_columns();

alter table public.csi_divisions enable row level security;
alter table public.csi_sections enable row level security;

drop policy if exists "csi_divisions authenticated view" on public.csi_divisions;
create policy "csi_divisions authenticated view" on public.csi_divisions
  for select to authenticated using (true);
drop policy if exists "csi_divisions manager insert" on public.csi_divisions;
create policy "csi_divisions manager insert" on public.csi_divisions
  for insert to authenticated with check (public.can_manage_master_libraries());
drop policy if exists "csi_divisions manager update" on public.csi_divisions;
create policy "csi_divisions manager update" on public.csi_divisions
  for update to authenticated using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());
drop policy if exists "csi_divisions manager delete" on public.csi_divisions;
create policy "csi_divisions manager delete" on public.csi_divisions
  for delete to authenticated using (public.can_manage_master_libraries());

drop policy if exists "csi_sections authenticated view" on public.csi_sections;
create policy "csi_sections authenticated view" on public.csi_sections
  for select to authenticated using (true);
drop policy if exists "csi_sections manager insert" on public.csi_sections;
create policy "csi_sections manager insert" on public.csi_sections
  for insert to authenticated with check (public.can_manage_master_libraries());
drop policy if exists "csi_sections manager update" on public.csi_sections;
create policy "csi_sections manager update" on public.csi_sections
  for update to authenticated using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());
drop policy if exists "csi_sections manager delete" on public.csi_sections;
create policy "csi_sections manager delete" on public.csi_sections
  for delete to authenticated using (public.can_manage_master_libraries());

grant select, insert, update, delete on public.csi_divisions to authenticated;
grant select, insert, update, delete on public.csi_sections to authenticated;

-- 4. Freeze the older division lists -------------------------------------------------
create or replace function public.csi_legacy_division_frozen()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'postgres' then  -- maintenance / migrations only
    return coalesce(new, old);
  end if;
  raise exception 'CSI divisions are managed in Administration > Master Libraries > CSI Divisions';
end $$;

drop trigger if exists trg_dwl_material_divisions_frozen on public.dwl_material_divisions;
create trigger trg_dwl_material_divisions_frozen before insert or update or delete on public.dwl_material_divisions
  for each row execute function public.csi_legacy_division_frozen();
drop trigger if exists trg_dwl_material_division_sections_frozen on public.dwl_material_division_sections;
create trigger trg_dwl_material_division_sections_frozen before insert or update or delete on public.dwl_material_division_sections
  for each row execute function public.csi_legacy_division_frozen();
drop trigger if exists trg_plan_act_divisions_frozen on public.plan_act_divisions;
create trigger trg_plan_act_divisions_frozen before insert or update or delete on public.plan_act_divisions
  for each row execute function public.csi_legacy_division_frozen();

-- 5. QS material categories ------------------------------------------------------------
-- 'Site - Anti-Mite / Termite' (cost prefix 02-3100) is termite control = 31 31 16, i.e. division 31.
update public.dwl_material_categories
   set division_code = '31'
 where name = 'Site - Anti-Mite / Termite' and division_code = '02';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dwl_material_categories_csi_division_fkey') then
    alter table public.dwl_material_categories
      add constraint dwl_material_categories_csi_division_fkey
      foreign key (division_code) references public.csi_divisions(code) on update cascade not valid;
  end if;
end $$;
alter table public.dwl_material_categories validate constraint dwl_material_categories_csi_division_fkey;

-- 6. QS cost divisions / sections --------------------------------------------------------
alter table public.qs_cost_divisions add column if not exists csi_division_code text;
alter table public.qs_cost_sections  add column if not exists csi_section_code  text;

update public.qs_cost_divisions set csi_division_code = code where csi_division_code is null;
update public.qs_cost_sections
   set csi_section_code = case code when '01 10' then '01 50 00' else code || ' 00' end
 where csi_section_code is null and code ~ '^[0-9]{2} [0-9]{2}$';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qs_cost_divisions_csi_division_fkey') then
    alter table public.qs_cost_divisions add constraint qs_cost_divisions_csi_division_fkey
      foreign key (csi_division_code) references public.csi_divisions(code) on update cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qs_cost_sections_csi_section_fkey') then
    alter table public.qs_cost_sections add constraint qs_cost_sections_csi_section_fkey
      foreign key (csi_section_code) references public.csi_sections(code) on update cascade;
  end if;
end $$;
create index if not exists idx_qs_cost_divisions_csi on public.qs_cost_divisions (csi_division_code);
create index if not exists idx_qs_cost_sections_csi on public.qs_cost_sections (csi_section_code);

create or replace function public.qs_cost_division_csi_default()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.csi_division_code is null then
    new.csi_division_code := new.code;
  end if;
  if not exists (select 1 from public.csi_divisions where code = new.csi_division_code) then
    raise exception 'Cost division % is not a CSI division; add it in Administration > Master Libraries > CSI Divisions first', new.csi_division_code;
  end if;
  return new;
end $$;
drop trigger if exists trg_qs_cost_division_csi_default on public.qs_cost_divisions;
create trigger trg_qs_cost_division_csi_default before insert or update on public.qs_cost_divisions
  for each row execute function public.qs_cost_division_csi_default();

-- 7. QS work items --------------------------------------------------------------------------
alter table public.dwl_work_items
  add column if not exists csi_section_code  text,
  add column if not exists csi_division_code text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dwl_work_items_csi_section_fkey') then
    alter table public.dwl_work_items add constraint dwl_work_items_csi_section_fkey
      foreign key (csi_section_code) references public.csi_sections(code) on update cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dwl_work_items_csi_division_fkey') then
    alter table public.dwl_work_items add constraint dwl_work_items_csi_division_fkey
      foreign key (csi_division_code) references public.csi_divisions(code) on update cascade;
  end if;
end $$;
create index if not exists idx_dwl_work_items_csi_section on public.dwl_work_items (csi_section_code);
create index if not exists idx_dwl_work_items_csi_division on public.dwl_work_items (csi_division_code);

create or replace function public.dwl_work_item_csi_sync()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.csi_section_code is not null then
    new.csi_division_code := left(new.csi_section_code, 2);
  end if;
  return new;
end $$;
drop trigger if exists trg_dwl_work_item_csi_sync on public.dwl_work_items;
create trigger trg_dwl_work_item_csi_sync before insert or update of csi_section_code, csi_division_code on public.dwl_work_items
  for each row execute function public.dwl_work_item_csi_sync();

-- backfill (high-confidence rules only)
-- A: codes shaped 'NN NN NN'
update public.dwl_work_items w
   set csi_section_code = left(w.code, 5) || ' 00'
 where w.csi_section_code is null and w.code ~ '^[0-9]{2} [0-9]{2} [0-9]{2}$'
   and exists (select 1 from public.csi_sections s where s.code = left(w.code, 5) || ' 00');
update public.dwl_work_items w
   set csi_division_code = left(w.code, 2)
 where w.csi_section_code is null and w.csi_division_code is null and w.code ~ '^[0-9]{2} [0-9]{2} [0-9]{2}$'
   and exists (select 1 from public.csi_divisions d where d.code = left(w.code, 2));
-- B: dotted codes '09.51.010' -> section when it exists, else division only
update public.dwl_work_items w
   set csi_section_code = replace(left(w.code, 5), '.', ' ') || ' 00'
 where w.csi_section_code is null and w.code ~ '^[0-9]{2}\.[0-9]{2}\.'
   and exists (select 1 from public.csi_sections s where s.code = replace(left(w.code, 5), '.', ' ') || ' 00');
update public.dwl_work_items w
   set csi_division_code = left(w.code, 2)
 where w.csi_section_code is null and w.csi_division_code is null and w.code ~ '^[0-9]{2}\.[0-9]{2}\.'
   and exists (select 1 from public.csi_divisions d where d.code = left(w.code, 2));
-- C: assembly rows by BOQ section
update public.dwl_work_items w
   set csi_section_code = case
         when w.boq_section = 'Tiling'               then '09 30 00'
         when w.boq_section = 'Painting'             then '09 90 00'
         when w.boq_section = 'Waterproofing'        then '07 10 00'
         when w.boq_section = 'Ceiling'              then '09 51 00'
         when w.boq_section = 'Drywall & Partitions' then '09 20 00'
         when w.boq_section = 'Screeding'            then '03 53 00'
         when w.boq_section = 'Masonry & Plaster' and w.code like 'ASM-MAS%' then '04 20 00'
         when w.boq_section = 'Masonry & Plaster' and w.code like 'ASM-PLS%' then '09 24 00'
       end
 where w.csi_section_code is null and w.code like 'ASM-%';

-- 8. QS WBS template items: free text -> section FK (not validated: '03 00 00' is a division heading) -----
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qs_wbs_template_items_masterformat_fkey') then
    alter table public.qs_wbs_template_items add constraint qs_wbs_template_items_masterformat_fkey
      foreign key (masterformat_code) references public.csi_sections(code) on update cascade not valid;
  end if;
end $$;

-- 9. Planning: Activity Database ---------------------------------------------------------------
alter table public.plan_act_masters
  add column if not exists csi_division_code text,
  add column if not exists csi_section_code  text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plan_act_masters_csi_division_fkey') then
    alter table public.plan_act_masters add constraint plan_act_masters_csi_division_fkey
      foreign key (csi_division_code) references public.csi_divisions(code) on update cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plan_act_masters_csi_section_fkey') then
    alter table public.plan_act_masters add constraint plan_act_masters_csi_section_fkey
      foreign key (csi_section_code) references public.csi_sections(code) on update cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plan_act_division_counters_csi_fkey') then
    alter table public.plan_act_division_counters add constraint plan_act_division_counters_csi_fkey
      foreign key (division_code) references public.csi_divisions(code) on update cascade not valid;
  end if;
end $$;
create index if not exists idx_plan_act_masters_csi_division on public.plan_act_masters (csi_division_code);
create index if not exists idx_plan_act_masters_csi_section on public.plan_act_masters (csi_section_code);

-- 9a. division <-> section consistency. Named trg_plan_act_master_csi_sync so it fires before the guard
--     and the visible-code trigger (alphabetical order).
create or replace function public.plan_act_master_csi_sync()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.csi_section_code is not null then
    if new.csi_division_code is null then
      new.csi_division_code := left(new.csi_section_code, 2);
    elsif left(new.csi_section_code, 2) <> new.csi_division_code then
      if tg_op = 'UPDATE' and new.csi_division_code is distinct from old.csi_division_code
         and new.csi_section_code is not distinct from old.csi_section_code then
        new.csi_section_code := null;  -- division moved: the old section no longer applies
      else
        raise exception 'CSI section % does not belong to division %', new.csi_section_code, new.csi_division_code;
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_plan_act_master_csi_sync on public.plan_act_masters;
create trigger trg_plan_act_master_csi_sync
  before insert or update of csi_division_code, csi_section_code on public.plan_act_masters
  for each row execute function public.plan_act_master_csi_sync();

-- 9b. visible_code keyed on csi_division_code (division_id is no longer used)
create or replace function public.plan_act_master_assign_visible_code()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_div text;
  v_next int;
begin
  v_div := new.csi_division_code;

  -- division changed on a root master and the code no longer fits: regenerate
  if tg_op = 'UPDATE' and new.csi_division_code is distinct from old.csi_division_code
     and new.visible_code is not distinct from old.visible_code
     and new.supersedes_id is null
     and (v_div is null or new.visible_code is null or new.visible_code !~ ('^D' || v_div || '-\d+$')) then
    new.visible_code := null;
  end if;

  if new.visible_code is null then
    -- a new version keeps the code of its predecessor
    if new.supersedes_id is not null then
      select visible_code into new.visible_code from public.plan_act_masters where id = new.supersedes_id;
      if new.visible_code is not null then
        return new;
      end if;
    end if;
    if v_div is null then
      return new;
    end if;
    insert into public.plan_act_division_counters (division_code, last_n) values (v_div, 0)
      on conflict (division_code) do nothing;
    select greatest(c.last_n,
             coalesce((select max(substring(visible_code from ('^D' || v_div || '-(\d+)$'))::int)
                         from public.plan_act_masters
                        where visible_code ~ ('^D' || v_div || '-\d+$')), 0)) + 1
      into v_next
      from public.plan_act_division_counters c where c.division_code = v_div
      for update;
    update public.plan_act_division_counters set last_n = v_next where division_code = v_div;
    new.visible_code := 'D' || v_div || '-' || lpad(v_next::text, 3, '0');
    return new;
  end if;

  -- explicit code must match its division
  if v_div is not null and new.visible_code !~ ('^D' || v_div || '-\d{3,}$') then
    raise exception 'visible_code % does not match division % (expected D%-###)', new.visible_code, v_div, v_div;
  end if;
  return new;
end $$;

drop trigger if exists trg_plan_act_master_visible_code on public.plan_act_masters;
create trigger trg_plan_act_master_visible_code
  before insert or update of csi_division_code, visible_code, supersedes_id on public.plan_act_masters
  for each row execute function public.plan_act_master_assign_visible_code();

create or replace function public.plan_act_master_visible_code_after()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_div text;
  v_n int;
begin
  if new.visible_code is null then return null; end if;
  v_div := substring(new.visible_code from '^D(\d{2})-\d+$');
  v_n := substring(new.visible_code from '^D\d{2}-(\d+)$')::int;
  if v_div is not null then
    insert into public.plan_act_division_counters (division_code, last_n) values (v_div, v_n)
      on conflict (division_code) do update set last_n = greatest(public.plan_act_division_counters.last_n, excluded.last_n);
  end if;
  -- other versions of the same activity share the code and division; their section is cleared
  -- if it belongs to a different division
  update public.plan_act_masters
     set visible_code = new.visible_code,
         csi_division_code = new.csi_division_code,
         csi_section_code = case when csi_section_code is not null and left(csi_section_code, 2) = new.csi_division_code
                                 then csi_section_code else null end
   where code = new.code and id <> new.id
     and (visible_code is distinct from new.visible_code or csi_division_code is distinct from new.csi_division_code);
  return null;
end $$;

drop trigger if exists trg_plan_act_master_visible_code_after on public.plan_act_masters;
create trigger trg_plan_act_master_visible_code_after
  after insert or update of csi_division_code, visible_code on public.plan_act_masters
  for each row execute function public.plan_act_master_visible_code_after();

-- 9c. catalogue audit also records the CSI columns
create or replace function public.plan_act_master_catalogue_audit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_diff text := '';
begin
  if new.csi_division_code is distinct from old.csi_division_code then
    v_diff := v_diff || 'csi_division_code: ' || coalesce(old.csi_division_code, '-') || ' -> ' || coalesce(new.csi_division_code, '-') || '; ';
  end if;
  if new.csi_section_code is distinct from old.csi_section_code then
    v_diff := v_diff || 'csi_section_code: ' || coalesce(old.csi_section_code, '-') || ' -> ' || coalesce(new.csi_section_code, '-') || '; ';
  end if;
  if new.division_id is distinct from old.division_id then
    v_diff := v_diff || 'division_id: ' || coalesce(old.division_id::text, '-') || ' -> ' || coalesce(new.division_id::text, '-') || '; ';
  end if;
  if new.visible_code is distinct from old.visible_code then
    v_diff := v_diff || 'visible_code: ' || coalesce(old.visible_code, '-') || ' -> ' || coalesce(new.visible_code, '-') || '; ';
  end if;
  if new.trade is distinct from old.trade then
    v_diff := v_diff || 'trade: ' || coalesce(old.trade, '-') || ' -> ' || coalesce(new.trade, '-') || '; ';
  end if;
  if new.image_path is distinct from old.image_path then
    v_diff := v_diff || 'image_path: ' || coalesce(old.image_path, '-') || ' -> ' || coalesce(new.image_path, '-') || '; ';
  end if;
  if v_diff <> '' then
    insert into public.plan_act_change_history(entity_type, entity_id, action, reason)
    values ('master', new.id, 'catalogue', rtrim(v_diff, '; '));
  end if;
  return null;
end $$;

drop trigger if exists trg_plan_act_master_catalogue_audit on public.plan_act_masters;
create trigger trg_plan_act_master_catalogue_audit
  after update of csi_division_code, csi_section_code, division_id, visible_code, trade, image_path on public.plan_act_masters
  for each row execute function public.plan_act_master_catalogue_audit();

-- plan_act_master_guard() is unchanged: its immutable tuple never listed the catalogue columns, so
-- csi_division_code and csi_section_code stay editable on approved/active masters (not versioned).

-- 9d. New RPCs (the uuid-based ones stay as they are)
create or replace function public.plan_act_csi_division_counts()
returns table (division_code text, activity_count bigint, work_item_count bigint)
language sql stable security invoker
set search_path to 'public'
as $$
  select d.code,
         count(distinct m.code),
         count(distinct l.work_item_id)
    from public.csi_divisions d
    left join public.plan_act_masters m
           on m.csi_division_code = d.code and m.status not in ('superseded','archived')
    left join public.plan_act_master_work_items l on l.master_id = m.id
   group by d.code
   order by d.code;
$$;
grant execute on function public.plan_act_csi_division_counts() to authenticated;

-- no default on p_division_code: a one-argument call keeps resolving to the uuid overload
create or replace function public.plan_act_bank_search(q text, p_division_code text)
returns jsonb
language sql stable security invoker
set search_path to 'public'
as $$
  select jsonb_build_object(
    'activities', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.visible_code nulls last, a.code) from (
        select * from (
          select distinct on (m.code) m.id, m.visible_code, m.code, m.name, m.default_unit,
                 m.csi_division_code, m.csi_section_code
            from public.plan_act_masters m
           where m.status not in ('superseded','archived')
             and (p_division_code is null or m.csi_division_code = p_division_code)
             and (coalesce(btrim(q), '') = ''
                  or m.name ilike '%' || btrim(q) || '%'
                  or m.code ilike '%' || btrim(q) || '%'
                  or m.visible_code ilike '%' || btrim(q) || '%')
           order by m.code, m.version desc) latest
         order by latest.visible_code nulls last, latest.code
         limit 200) a), '[]'::jsonb),
    'work_items', coalesce((
      select jsonb_agg(to_jsonb(w)) from (
        select i.id, i.code, i.description, i.unit, i.csi_division_code, i.csi_section_code
          from public.dwl_work_items i
         where i.is_active
           and (p_division_code is null
                or i.csi_division_code = p_division_code
                or exists (
                 select 1 from public.plan_act_master_work_items l
                   join public.plan_act_masters m on m.id = l.master_id
                  where l.work_item_id = i.id and m.csi_division_code = p_division_code
                    and m.status not in ('superseded','archived')))
           and (coalesce(btrim(q), '') = ''
                or i.description ilike '%' || btrim(q) || '%'
                or i.code ilike '%' || btrim(q) || '%')
         order by i.code
         limit 200) w), '[]'::jsonb)
  );
$$;
grant execute on function public.plan_act_bank_search(text, text) to authenticated;
