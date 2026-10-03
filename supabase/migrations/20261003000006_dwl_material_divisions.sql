-- Material Master divisions: CSI MasterFormat classification above the
-- existing Material Master categories.
--
--   dwl_material_divisions          the divisions (00, 01, 03 ... 33)
--   dwl_material_division_sections  sections under a division (09 30 00) and
--                                   their subclasses (parent_code set)
--   dwl_material_categories.division_code
--                                   the division a category belongs to. A
--                                   material takes its division from its
--                                   category, so no material row changes.
--
-- Reference libraries like dwl_material_categories: not tenant-scoped, open
-- RLS for authenticated users, writes gated in the UI (qs_libraries).

create table if not exists public.dwl_material_divisions (
  code        text primary key,
  name        text not null,
  group_name  text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.dwl_material_division_sections (
  id             uuid primary key default gen_random_uuid(),
  division_code  text not null references public.dwl_material_divisions(code) on update cascade on delete cascade,
  code           text not null,
  name           text not null,
  parent_code    text,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint dwl_material_division_sections_code_key unique (code),
  constraint dwl_material_division_sections_parent_fkey
    foreign key (parent_code) references public.dwl_material_division_sections(code) on update cascade on delete cascade
);

create index if not exists idx_dwl_material_division_sections_division
  on public.dwl_material_division_sections (division_code);
create index if not exists idx_dwl_material_division_sections_parent
  on public.dwl_material_division_sections (parent_code);

alter table public.dwl_material_categories
  add column if not exists division_code text
  references public.dwl_material_divisions(code) on update cascade on delete set null;

create index if not exists idx_dwl_material_categories_division
  on public.dwl_material_categories (division_code);

-- ── updated_at ───────────────────────────────────────────────────────────────

drop trigger if exists set_dwl_material_divisions_updated_at on public.dwl_material_divisions;
create trigger set_dwl_material_divisions_updated_at
  before update on public.dwl_material_divisions
  for each row execute function public.set_updated_at();

drop trigger if exists set_dwl_material_division_sections_updated_at on public.dwl_material_division_sections;
create trigger set_dwl_material_division_sections_updated_at
  before update on public.dwl_material_division_sections
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.dwl_material_divisions enable row level security;
alter table public.dwl_material_division_sections enable row level security;

drop policy if exists "Auth users can view dwl material divisions" on public.dwl_material_divisions;
create policy "Auth users can view dwl material divisions" on public.dwl_material_divisions
  for select to authenticated using (true);
drop policy if exists "Auth users can insert dwl material divisions" on public.dwl_material_divisions;
create policy "Auth users can insert dwl material divisions" on public.dwl_material_divisions
  for insert to authenticated with check (true);
drop policy if exists "Auth users can update dwl material divisions" on public.dwl_material_divisions;
create policy "Auth users can update dwl material divisions" on public.dwl_material_divisions
  for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete dwl material divisions" on public.dwl_material_divisions;
create policy "Auth users can delete dwl material divisions" on public.dwl_material_divisions
  for delete to authenticated using (true);

drop policy if exists "Auth users can view dwl material division sections" on public.dwl_material_division_sections;
create policy "Auth users can view dwl material division sections" on public.dwl_material_division_sections
  for select to authenticated using (true);
drop policy if exists "Auth users can insert dwl material division sections" on public.dwl_material_division_sections;
create policy "Auth users can insert dwl material division sections" on public.dwl_material_division_sections
  for insert to authenticated with check (true);
drop policy if exists "Auth users can update dwl material division sections" on public.dwl_material_division_sections;
create policy "Auth users can update dwl material division sections" on public.dwl_material_division_sections
  for update to authenticated using (true) with check (true);
drop policy if exists "Auth users can delete dwl material division sections" on public.dwl_material_division_sections;
create policy "Auth users can delete dwl material division sections" on public.dwl_material_division_sections
  for delete to authenticated using (true);

grant select, insert, update, delete on public.dwl_material_divisions to authenticated;
grant select, insert, update, delete on public.dwl_material_division_sections to authenticated;

-- ── Seed: CSI MasterFormat divisions, sections and subclasses ────────────────

insert into public.dwl_material_divisions (code, name, group_name, sort_order) values
  ('00', 'Procurement and Contracting Requirements', 'General Requirements', 10),
  ('01', 'General Requirements', 'General Requirements', 20),
  ('02', 'Existing Conditions', 'Facility Construction', 30),
  ('03', 'Concrete', 'Facility Construction', 40),
  ('04', 'Masonry', 'Facility Construction', 50),
  ('05', 'Metals', 'Facility Construction', 60),
  ('06', 'Wood, Plastics, and Composites', 'Facility Construction', 70),
  ('07', 'Thermal and Moisture Protection', 'Facility Construction', 80),
  ('08', 'Openings', 'Facility Construction', 90),
  ('09', 'Finishes', 'Facility Construction', 100),
  ('10', 'Specialties', 'Facility Construction', 110),
  ('11', 'Equipment', 'Facility Construction', 120),
  ('12', 'Furnishings', 'Facility Construction', 130),
  ('13', 'Special Construction', 'Facility Construction', 140),
  ('14', 'Conveying Equipment', 'Facility Construction', 150),
  ('21', 'Fire Suppression', 'Facility Services', 160),
  ('22', 'Plumbing', 'Facility Services', 170),
  ('23', 'Heating, Ventilating, and Air Conditioning (HVAC)', 'Facility Services', 180),
  ('25', 'Integrated Automation', 'Facility Services', 190),
  ('26', 'Electrical', 'Facility Services', 200),
  ('27', 'Communications', 'Facility Services', 210),
  ('28', 'Electronic Safety and Security', 'Facility Services', 220),
  ('31', 'Earthwork', 'Site and Infrastructure', 230),
  ('32', 'Exterior Improvements', 'Site and Infrastructure', 240),
  ('33', 'Utilities', 'Site and Infrastructure', 250)
on conflict (code) do nothing;

-- Sections come before their subclasses in this list, and a multi-row insert
-- checks the parent_code reference once at the end of the statement.
insert into public.dwl_material_division_sections (division_code, code, name, parent_code, sort_order) values
  ('01', '01 10 00', 'Summary of Work', null, 10),
  ('01', '01 11 00', 'Summary of Work Results', '01 10 00', 10),
  ('01', '01 14 00', 'Work Restrictions & Site Security', '01 10 00', 20),
  ('01', '01 20 00', 'Price and Payment Procedures', null, 20),
  ('01', '01 22 00', 'Unit Prices & Schedules', '01 20 00', 10),
  ('01', '01 29 00', 'Payment Procedures & Retainage', '01 20 00', 20),
  ('01', '01 50 00', 'Temporary Facilities and Controls', null, 30),
  ('01', '01 51 00', 'Temporary Utilities & Power Distribution', '01 50 00', 10),
  ('01', '01 52 00', 'Construction Facilities & Site Offices', '01 50 00', 20),
  ('01', '01 54 00', 'Construction Equipment & Scaffolding', '01 50 00', 30),
  ('01', '01 70 00', 'Execution and Closeout Requirements', null, 40),
  ('01', '01 74 00', 'Cleaning and Waste Management', '01 70 00', 10),
  ('01', '01 78 00', 'Closeout Submittals & Warranties', '01 70 00', 20),
  ('03', '03 01 00', 'Maintenance of Concrete', null, 10),
  ('03', '03 01 30', 'Maintenance of Cast-in-Place Concrete', '03 01 00', 10),
  ('03', '03 01 40', 'Maintenance of Precast Concrete', '03 01 00', 20),
  ('03', '03 05 00', 'Common Work Results for Concrete', null, 20),
  ('03', '03 05 10', 'Basic Concrete Materials & Aggregates', '03 05 00', 10),
  ('03', '03 05 20', 'Chemical Admixtures and Plasticizers', '03 05 00', 20),
  ('03', '03 10 00', 'Concrete Forming and Accessories', null, 30),
  ('03', '03 11 00', 'Concrete Forming Systems', '03 10 00', 10),
  ('03', '03 15 00', 'Concrete Construction Joints & Waterstops', '03 10 00', 20),
  ('03', '03 20 00', 'Concrete Reinforcing', null, 40),
  ('03', '03 21 00', 'Reinforcing Steel Bars (Rebar)', '03 20 00', 10),
  ('03', '03 22 00', 'Welded Wire Mesh Reinforcement', '03 20 00', 20),
  ('03', '03 24 00', 'Fiberglass & Basalt Composite Rebar', '03 20 00', 30),
  ('03', '03 30 00', 'Cast-in-Place Concrete', null, 50),
  ('03', '03 31 00', 'Structural Ready-Mix Concrete C30-C60', '03 30 00', 10),
  ('03', '03 35 00', 'Concrete Finishing & Power Troweling', '03 30 00', 20),
  ('03', '03 37 00', 'Specialty Placed Concrete (Shotcrete)', '03 30 00', 30),
  ('03', '03 38 00', 'Post-Tensioned Concrete Strand Cables', '03 30 00', 40),
  ('03', '03 40 00', 'Precast Concrete', null, 60),
  ('03', '03 41 00', 'Plant-Precast Structural Concrete Columns', '03 40 00', 10),
  ('03', '03 45 00', 'Plant-Precast Architectural Facade Panels', '03 40 00', 20),
  ('03', '03 50 00', 'Cast Decks and Underlayment', null, 70),
  ('03', '03 54 00', 'Self-Leveling Hydraulic Cement Underlayment', '03 50 00', 10),
  ('03', '03 60 00', 'Grouting', null, 80),
  ('03', '03 61 00', 'Cementitious Structural Non-Shrink Grout', '03 60 00', 10),
  ('03', '03 62 00', 'Non-Shrink Precision Epoxy Grout', '03 60 00', 20),
  ('03', '03 70 00', 'Mass Concrete', null, 90),
  ('03', '03 71 00', 'Low-Heat Hydration Raft Foundation Mix', '03 70 00', 10),
  ('05', '05 10 00', 'Structural Metal Framing', null, 10),
  ('05', '05 12 00', 'Structural Steel Framing I-Beams', '05 10 00', 10),
  ('05', '05 14 00', 'Structural Aluminum Framing Profiles', '05 10 00', 20),
  ('05', '05 20 00', 'Metal Joists', null, 20),
  ('05', '05 21 00', 'Open-Web Steel Joists', '05 20 00', 10),
  ('05', '05 30 00', 'Metal Decking', null, 30),
  ('05', '05 31 00', 'Galvanized Steel Floor Decking', '05 30 00', 10),
  ('05', '05 40 00', 'Cold-Formed Metal Framing', null, 40),
  ('05', '05 41 00', 'Structural Metal Stud Framing', '05 40 00', 10),
  ('05', '05 50 00', 'Metal Fabrications', null, 50),
  ('05', '05 51 00', 'Metal Stairs and Railings', '05 50 00', 10),
  ('05', '05 70 00', 'Decorative Metal', null, 60),
  ('05', '05 73 00', 'Decorative Formed Metal Cladding', '05 70 00', 10),
  ('07', '07 10 00', 'Dampproofing and Waterproofing', null, 10),
  ('07', '07 11 00', 'Bituminous Dampproofing', '07 10 00', 10),
  ('07', '07 13 00', 'Sheet Membrane Waterproofing', '07 10 00', 20),
  ('07', '07 14 00', 'Fluid-Applied Waterproofing Polyurethane', '07 10 00', 30),
  ('07', '07 20 00', 'Thermal Protection / Insulation', null, 20),
  ('07', '07 21 00', 'Extruded Polystyrene XPS & Rockwool', '07 20 00', 10),
  ('07', '07 30 00', 'Shingles and Roof Tiles', null, 30),
  ('07', '07 40 00', 'Roofing and Siding Panels', null, 40),
  ('07', '07 50 00', 'Membrane Roofing', null, 50),
  ('07', '07 54 00', 'Thermoplastic Polyolefin (TPO) Roofing', '07 50 00', 10),
  ('07', '07 60 00', 'Flashing and Sheet Metal', null, 60),
  ('07', '07 70 00', 'Roof and Wall Specialties', null, 70),
  ('07', '07 80 00', 'Fire and Smoke Protection', null, 80),
  ('07', '07 84 00', 'Firestopping Penetration Seals', '07 80 00', 10),
  ('07', '07 90 00', 'Joint Protection / Sealants', null, 90),
  ('07', '07 92 00', 'Joint Sealants & Expansion Mastics', '07 90 00', 10),
  ('08', '08 10 00', 'Doors and Frames', null, 10),
  ('08', '08 30 00', 'Specialty Doors and Frames', null, 20),
  ('08', '08 40 00', 'Entrances, Storefronts, and Curtain Walls', null, 30),
  ('08', '08 50 00', 'Windows', null, 40),
  ('08', '08 60 00', 'Roof Windows and Skylights', null, 50),
  ('08', '08 70 00', 'Hardware', null, 60),
  ('08', '08 80 00', 'Glazing', null, 70),
  ('09', '09 20 00', 'Plaster and Gypsum Board', null, 10),
  ('09', '09 22 00', 'Supports for Plaster and Gypsum Board', '09 20 00', 10),
  ('09', '09 29 00', 'Gypsum Board Acoustic / Fire Assemblies', '09 20 00', 20),
  ('09', '09 30 00', 'Tiling', null, 20),
  ('09', '09 30 13', 'Ceramic Tiling', '09 30 00', 10),
  ('09', '09 30 16', 'Quarry Tiling & Pavers', '09 30 00', 20),
  ('09', '09 30 19', 'Porcelain Large-Format Slabs', '09 30 00', 30),
  ('09', '09 50 00', 'Ceilings', null, 30),
  ('09', '09 51 00', 'Acoustical Ceilings Mineral Tile', '09 50 00', 10),
  ('09', '09 60 00', 'Flooring', null, 40),
  ('09', '09 64 00', 'Wood Flooring & Engineered Parquet', '09 60 00', 10),
  ('09', '09 65 00', 'Resilient Flooring (LVT / Vinyl)', '09 60 00', 20),
  ('09', '09 68 00', 'Commercial Carpet Tile', '09 60 00', 30),
  ('09', '09 70 00', 'Wall Finishes', null, 50),
  ('09', '09 77 00', 'Special Wall Surfacing WPC Panels', '09 70 00', 10),
  ('09', '09 80 00', 'Acoustic Treatment', null, 60),
  ('09', '09 84 00', 'Acoustic Room Components & Baffles', '09 80 00', 10),
  ('09', '09 90 00', 'Painting and Coating', null, 70),
  ('09', '09 91 13', 'Exterior Painting Acrylic Systems', '09 90 00', 10),
  ('09', '09 91 23', 'Interior Painting Odorless Emulsion', '09 90 00', 20),
  ('09', '09 96 00', 'High-Performance Epoxy Industrial Coatings', '09 90 00', 30),
  ('21', '21 10 00', 'Water-Based Fire-Suppression Systems', null, 10),
  ('21', '21 13 13', 'Wet-Pipe Sprinkler Systems', '21 10 00', 10),
  ('21', '21 20 00', 'Fire-Extinguishing Systems', null, 20),
  ('21', '21 22 00', 'Clean-Agent Fire-Extinguishing FM200', '21 20 00', 10),
  ('21', '21 30 00', 'Fire Pumps', null, 30),
  ('21', '21 31 13', 'Centrifugal Fire Pumps UL/FM', '21 30 00', 10),
  ('22', '22 05 00', 'Common Work Results for Plumbing', null, 10),
  ('22', '22 05 19', 'Meters and Gauges for Plumbing Piping', '22 05 00', 10),
  ('22', '22 10 00', 'Plumbing Piping and Pumps', null, 20),
  ('22', '22 11 16', 'Domestic Water Piping PPR/Copper', '22 10 00', 10),
  ('22', '22 13 16', 'Sanitary Waste and Vent Piping HDPE', '22 10 00', 20),
  ('22', '22 30 00', 'Plumbing Equipment', null, 30),
  ('22', '22 31 00', 'Water Softeners & Filtration Skid', '22 30 00', 10),
  ('22', '22 33 00', 'Commercial Domestic Water Heaters', '22 30 00', 20),
  ('22', '22 40 00', 'Plumbing Fixtures', null, 40),
  ('22', '22 42 13', 'Commercial Water Closets & Urinals', '22 40 00', 10),
  ('23', '23 20 00', 'HVAC Piping and Pumps', null, 10),
  ('23', '23 30 00', 'HVAC Air Distribution', null, 20),
  ('23', '23 70 00', 'Central HVAC Equipment', null, 30),
  ('23', '23 80 00', 'Decentralized HVAC Equipment', null, 40)
on conflict (code) do nothing;

-- Categories → divisions. A category's cost code prefix already starts with its
-- MasterFormat division ("09-5100" → 09), so use it wherever the division is
-- not set by hand.

update public.dwl_material_categories c
   set division_code = left(c.cost_code_prefix, 2)
 where c.division_code is null
   and c.cost_code_prefix ~ '^[0-9]{2}'
   and exists (select 1 from public.dwl_material_divisions d where d.code = left(c.cost_code_prefix, 2));

create or replace function public.dwl_material_categories_default_division()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.division_code is null and new.cost_code_prefix ~ '^[0-9]{2}' then
    select d.code into new.division_code
      from public.dwl_material_divisions d
     where d.code = left(new.cost_code_prefix, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists dwl_material_categories_default_division on public.dwl_material_categories;
create trigger dwl_material_categories_default_division
  before insert or update of cost_code_prefix on public.dwl_material_categories
  for each row execute function public.dwl_material_categories_default_division();
