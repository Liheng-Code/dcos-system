-- ============================================================
-- Phase 0 — Naming Convention Reference Tables
-- ============================================================

-- ============================================================
-- 1. Discipline Codes (unified from convention doc + frontend)
-- ============================================================
create table if not exists public.discipline_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  source      text not null default 'convention' check (source in ('convention', 'frontend', 'both')),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.discipline_codes (code, name, source, sort_order) values
  ('ARC', 'Architecture', 'both', 1),
  ('STR', 'Structural', 'both', 2),
  ('MEC', 'Mechanical', 'convention', 3),
  ('ELE', 'Electrical', 'convention', 4),
  ('PLB', 'Plumbing', 'convention', 5),
  ('FFG', 'Fire Fighting', 'convention', 6),
  ('CIV', 'Civil / Geotechnical', 'convention', 7),
  ('BIM', 'BIM Coordination', 'convention', 8),
  ('MEP', 'MEP (Combined)', 'frontend', 9),
  ('CVL', 'Civil', 'frontend', 10),
  ('GEO', 'Geotechnical', 'frontend', 11),
  ('QS', 'Quantity Surveying', 'frontend', 12),
  ('HSE', 'HSE', 'frontend', 13),
  ('QA', 'QA/QC', 'frontend', 14),
  ('PRC', 'Procurement', 'frontend', 15),
  ('GEN', 'General', 'frontend', 16);

-- ============================================================
-- 2. Stakeholder Abbreviations (for transmittal routing)
-- ============================================================
create table if not exists public.stakeholder_abbreviations (
  id              uuid primary key default gen_random_uuid(),
  stakeholder_id  uuid not null references public.stakeholders(id) on delete cascade unique,
  abbreviation    text not null check (length(abbreviation) between 3 and 4 and abbreviation ~ '^[A-Z0-9]{3,4}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- 3. Budget Package Sections (groups A–F)
-- ============================================================
create table if not exists public.budget_package_sections (
  id          uuid primary key default gen_random_uuid(),
  group_code  text not null check (group_code in ('A', 'B', 'C', 'D', 'E', 'F')),
  group_name  text not null,
  section     text not null,
  section_name text not null,
  description text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique(group_code, section)
);

insert into public.budget_package_sections (group_code, group_name, section, section_name, description, sort_order) values
  -- Group A — Early Works
  ('A', 'Early Works', 'A.1', 'Topography Survey', 'Land survey and mapping', 1),
  ('A', 'Early Works', 'A.2', 'Soil Investigation', 'Borehole, SPT, laboratory testing', 2),
  ('A', 'Early Works', 'A.3', 'Mine / UXO Clearance', 'Unexploded ordnance and mine clearance', 3),
  ('A', 'Early Works', 'A.4', 'Soil Leveling', 'Cut and fill, earthworks', 4),
  ('A', 'Early Works', 'A.5', 'Demolition', 'Existing structure removal', 5),
  ('A', 'Early Works', 'A.6', 'Clearing', 'Site clearing, tree removal, grubbing', 6),
  ('A', 'Early Works', 'A.7', 'Repair Existing Services', 'Utility diversion and protection', 7),
  ('A', 'Early Works', 'A.8', 'Renovation', 'Upgrade of existing structures', 8),
  ('A', 'Early Works', 'A.9', 'Specialist Groundworks', 'Dewatering, ground improvement, soil nailing', 9),
  -- Group B — Sub-Structure
  ('B', 'Sub-Structure', 'B.1', 'Foundation / Piling', 'Driven piles, bored piles, micro-piles, raft foundation', 10),
  ('B', 'Sub-Structure', 'B.2', 'Basement', 'Retaining wall, basement slab, waterproofing', 11),
  ('B', 'Sub-Structure', 'B.3', 'Ground Floor Slab', 'Ground-bearing or suspended ground slab', 12),
  ('B', 'Sub-Structure', 'B.4', 'Super-Structure Podium', 'Transfer plate, podium frame, podium slab', 13),
  -- Group C — Architecture External
  ('C', 'Architecture External', 'C.1', 'Exterior Wall', 'External wall system, curtain wall, cladding', 14),
  ('C', 'Architecture External', 'C.2', 'Exterior Wall Finishing', 'External paint, render, stone cladding', 15),
  ('C', 'Architecture External', 'C.3', 'Exterior Doors', 'Main entrance, fire exit doors — external', 16),
  ('C', 'Architecture External', 'C.4', 'Exterior Windows', 'External glazing, curtain wall infills', 17),
  ('C', 'Architecture External', 'C.5', 'Exterior Floor', 'External hardscape, paving, entrance plaza', 18),
  ('C', 'Architecture External', 'C.6', 'Exterior Soffit', 'Canopy soffits, underside of transfer slab', 19),
  ('C', 'Architecture External', 'C.7', 'Exterior Stair & Ramp', 'External staircases and vehicle ramps', 20),
  ('C', 'Architecture External', 'C.8', 'Roofing', 'Waterproofing membrane, insulation, roof finish', 21),
  ('C', 'Architecture External', 'C.9', 'Internal Wall Partition', 'Lightweight partition walls, wall finish', 22),
  ('C', 'Architecture External', 'C.10', 'Internal Doors', 'Internal door sets — all floors', 23),
  ('C', 'Architecture External', 'C.11', 'Special Installation', 'Feature walls, specialist architectural elements', 24),
  -- Group D — Interior Finishes
  ('D', 'Interior Finishes', 'D.1', 'Wall Finish', 'Internal paint, wallpaper, tiling, stone — wall', 25),
  ('D', 'Interior Finishes', 'D.2', 'Floor Finish', 'Tiles, carpet, timber, epoxy, raised floor', 26),
  ('D', 'Interior Finishes', 'D.3', 'Ceiling Finish', 'Plasterboard, mineral fibre, metal tile ceiling', 27),
  -- Group E — Fittings, Furnishings & Equipment
  ('E', 'Fittings & Equipment', 'E.1', 'General Fittings', 'Cubicles, lockers, shelving, standard fittings', 28),
  ('E', 'Fittings & Equipment', 'E.2', 'Kitchen Fittings', 'Pantry, kitchen cabinetry, appliances', 29),
  ('E', 'Fittings & Equipment', 'E.3', 'Special Purpose Fittings', 'Reception desk, branded elements, specialist furniture', 30),
  ('E', 'Fittings & Equipment', 'E.4', 'Signage', 'Internal and external signage, wayfinding', 31),
  ('E', 'Fittings & Equipment', 'E.5', 'Art & Décor', 'Artwork, sculptures, decorative elements', 32),
  ('E', 'Fittings & Equipment', 'E.6', 'Non-Mech / Non-Elec Equipment', 'Whiteboards, projection screens, safes', 33),
  ('E', 'Fittings & Equipment', 'E.7', 'Internal Planting', 'Indoor plants, green walls, irrigation', 34),
  ('E', 'Fittings & Equipment', 'E.8', 'Bird & Vermin Control', 'Bird deterrent, pest control systems', 35),
  -- Group F — Building Services (MEP)
  ('F', 'Building Services (MEP)', 'F.1', 'Sanitary Installations', 'Water closets, urinals, basins, sanitary fittings', 36),
  ('F', 'Building Services (MEP)', 'F.2', 'Air Conditioning System', 'Chilled water, split units, fan coil units', 37),
  ('F', 'Building Services (MEP)', 'F.3', 'Mechanical Ventilation', 'Supply, exhaust, pressurisation systems', 38),
  ('F', 'Building Services (MEP)', 'F.4', 'Plumbing — Water Supply', 'Cold water, hot water, water tanks, pump sets', 39),
  ('F', 'Building Services (MEP)', 'F.5', 'Drainage System', 'Soil waste, stormwater, grease trap', 40),
  ('F', 'Building Services (MEP)', 'F.6', 'Fire Fighting System', 'Sprinkler, hydrant, hose reel, pump room', 41),
  ('F', 'Building Services (MEP)', 'F.7', 'Electrical — Power', 'Main switchboard, DB, cabling, earthing', 42),
  ('F', 'Building Services (MEP)', 'F.8', 'Electrical — Lighting', 'Lighting fixtures, emergency lighting, controls', 43),
  ('F', 'Building Services (MEP)', 'F.9', 'ELV Systems', 'CCTV, access control, PA, BMS, MATV, data cabling', 44),
  ('F', 'Building Services (MEP)', 'F.10', 'Lifts & Escalators', 'Passenger lifts, service lifts, escalators', 45),
  ('F', 'Building Services (MEP)', 'F.11', 'Generators & UPS', 'Standby generator, UPS, battery systems', 46),
  ('F', 'Building Services (MEP)', 'F.12', 'Lightning Protection', 'Lightning conductor, earthing system', 47);

-- ============================================================
-- 4. Building Codes (BA–BZ, skip I,O, reserved BX/BY/BZ)
-- ============================================================
create table if not exists public.building_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^B[A-Z]$'),
  name        text not null,
  description text,
  is_reserved boolean not null default false,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.building_codes (code, name, description, is_reserved, sort_order) values
  ('BA', 'Building A', 'Primary Tower — first building in project', false, 1),
  ('BB', 'Building B', 'Secondary Structure — second building', false, 2),
  ('BC', 'Building C', 'Podium / Retail — third building or podium block', false, 3),
  ('BD', 'Building D', 'Service Block — ancillary / service building', false, 4),
  ('BE', 'Building E', 'Fifth building', false, 5),
  ('BF', 'Building F', 'Sixth building', false, 6),
  ('BG', 'Building G', 'Seventh building', false, 7),
  ('BH', 'Building H', 'Eighth building', false, 8),
  ('BJ', 'Building J', 'Ninth building (skip I)', false, 9),
  ('BK', 'Building K', 'Tenth building', false, 10),
  ('BL', 'Building L', 'Eleventh building', false, 11),
  ('BM', 'Building M', 'Twelfth building', false, 12),
  ('BN', 'Building N', 'Thirteenth building', false, 13),
  ('BP', 'Building P', 'Fourteenth building (skip O)', false, 14),
  ('BQ', 'Building Q', 'Fifteenth building', false, 15),
  ('BR', 'Building R', 'Sixteenth building', false, 16),
  ('BS', 'Building S', 'Seventeenth building', false, 17),
  ('BT', 'Building T', 'Eighteenth building', false, 18),
  ('BU', 'Building U', 'Nineteenth building', false, 19),
  ('BV', 'Building V', 'Twentieth building', false, 20),
  ('BW', 'Building W', 'Twenty-first building', false, 21),
  ('BX', 'External Works', 'Site drainage, roadworks, boundary — Reserved', true, 22),
  ('BY', 'Landscape', 'Hard and soft landscaping — Reserved', true, 23),
  ('BZ', 'Permanent Boundary Works', 'Fencing, walls, gates — Reserved', true, 24);

-- ============================================================
-- 5. Level Type Prefixes (convention-defined, read-only)
-- ============================================================
create table if not exists public.level_type_prefixes (
  id          uuid primary key default gen_random_uuid(),
  prefix      text not null unique check (prefix ~ '^[A-Z]{1,2}$'),
  name        text not null,
  format      text not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.level_type_prefixes (prefix, name, format, description, sort_order) values
  ('B', 'Basement', 'B[01–99]', 'Underground floors, numbered from deepest', 1),
  ('G', 'Ground Floor', 'G00', 'Ground floor level, always G00', 2),
  ('L', 'Upper Level', 'L[01–99]', 'Typical floors above ground', 3),
  ('M', 'Mezzanine', 'M[01–99]', 'Intermediate floor between main levels', 4),
  ('R', 'Roof Level', 'R00', 'Main roof slab or roof plant room', 5),
  ('PH', 'Penthouse', 'PH[01–09]', 'Penthouse floors above main tower', 6),
  ('ZZ', 'Applies to Some Floors', 'ZZ', 'For items spanning selected but not all floors', 7),
  ('XX', 'Not Applicable', 'XX', 'Level not applicable for this record / discipline', 8);

-- ============================================================
-- 6. Zone Type Codes (convention-defined, read-only)
-- ============================================================
create table if not exists public.zone_type_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  category    text not null check (category in ('design', 'construction', 'system')),
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.zone_type_codes (code, name, category, description, sort_order) values
  ('DZone1', 'Wet / Service Zone', 'design', 'Toilets, AHU rooms, electrical rooms, shafts', 1),
  ('DZone2', 'Core / Circulation Zone', 'design', 'Lifts, staircases, lobbies, corridors', 2),
  ('DZone3', 'Primary Functional Zone A', 'design', 'Banking hall, main office, retail area', 3),
  ('DZone4', 'Primary Functional Zone B', 'design', 'Back-of-house, storage, secondary offices', 4),
  ('DAll', 'All Design Zones', 'design', 'Applies to entire floor without subdivision', 5),
  ('DZZ', 'Applies to Some Floors', 'design', 'Selected zones only — varies by floor', 6),
  ('DXX', 'Not Applicable', 'design', 'Zone does not exist on this floor', 7),
  ('CZone1', 'Construction Zone 1', 'construction', 'First concrete pour sequence / work front', 8),
  ('CZone2', 'Construction Zone 2', 'construction', 'Second work front or crane zone', 9),
  ('CZone3', 'Construction Zone 3', 'construction', 'Third zone — finishing or MEP installation', 10),
  ('CAll', 'All Construction Zones', 'construction', 'Floor-wide construction activity', 11);

-- ============================================================
-- 7. Project Code Sequences (auto-increment for Phase 1)
-- ============================================================
create table if not exists public.project_code_sequences (
  prefix        text primary key,
  last_sequence integer not null,
  description   text,
  created_at    timestamptz not null default now(),
  constraint last_sequence_positive check (last_sequence >= 0)
);

insert into public.project_code_sequences (prefix, last_sequence, description) values
  ('P', 0, 'Project code sequence — P[NNN]-[ShortName]');

-- ============================================================
-- RLS
-- ============================================================
alter table public.discipline_codes enable row level security;
alter table public.stakeholder_abbreviations enable row level security;
alter table public.budget_package_sections enable row level security;
alter table public.building_codes enable row level security;
alter table public.level_type_prefixes enable row level security;
alter table public.zone_type_codes enable row level security;
alter table public.project_code_sequences enable row level security;

-- Read: all authenticated users
create policy "Authenticated users can view discipline codes"
  on public.discipline_codes for select to authenticated using (true);
create policy "Authenticated users can view stakeholder abbreviations"
  on public.stakeholder_abbreviations for select to authenticated using (true);
create policy "Authenticated users can view budget package sections"
  on public.budget_package_sections for select to authenticated using (true);
create policy "Authenticated users can view building codes"
  on public.building_codes for select to authenticated using (true);
create policy "Authenticated users can view level type prefixes"
  on public.level_type_prefixes for select to authenticated using (true);
create policy "Authenticated users can view zone type codes"
  on public.zone_type_codes for select to authenticated using (true);
create policy "Authenticated users can view project code sequences"
  on public.project_code_sequences for select to authenticated using (true);

-- Write: admins only
create policy "Admins can manage discipline codes"
  on public.discipline_codes for all to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
create policy "Admins can manage stakeholder abbreviations"
  on public.stakeholder_abbreviations for all to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
create policy "Admins can manage budget package sections"
  on public.budget_package_sections for all to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
create policy "Admins can manage building codes"
  on public.building_codes for all to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
create policy "Admins can manage level type prefixes"
  on public.level_type_prefixes for all to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
create policy "Admins can manage zone type codes"
  on public.zone_type_codes for all to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
create policy "Admins can manage project code sequences"
  on public.project_code_sequences for all to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
