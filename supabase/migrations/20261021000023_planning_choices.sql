-- Planning choices per sector (Generate plan G4).
-- The fixed Generate dropdowns (structure / formwork / building component) become a catalogue: each choice is
-- tagged with the sectors and building types it is asked for (lib/project-categories.ts) and may suggest a
-- default per sector or building type. Generate asks only the choices for the project's category; template and
-- master conditions (plan_act_applicability) pick attributes and values from the same catalogue.
--   1. plan_act_attributes + RLS + seed (12 choices)
--   2. "building_component" conditions dropped: the part (ground / typical / roof...) now comes from the scope row
--   3. Draft templates that only fit one roof / pavement / deck / installation type get that condition
-- Depends on: 20261006000004 (plan_act_applicability), 20261021000006..10 (the templates conditioned in 3).

-- ── 1. Catalogue ───────────────────────────────────────────────────────────
create table if not exists public.plan_act_attributes (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  description text,
  -- [{ "value": "reinforced_concrete", "label": "Reinforced concrete" }, ...]
  options jsonb not null default '[]'::jsonb,
  -- asked when the project's sector is listed OR its building type is listed; both empty = every project
  sectors text[] not null default '{}',
  building_types text[] not null default '{}',
  -- suggested value per building type or sector slug, building type first: { "industrial": "steel", "luxury_villa": "pitched_tile" }
  defaults jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.plan_act_attributes is
  'Planning choices Generate asks per project category (structure type, roof type, pavement type...). Template / master conditions use the same keys and values.';

drop trigger if exists set_plan_act_attributes_updated_at on public.plan_act_attributes;
create trigger set_plan_act_attributes_updated_at before update on public.plan_act_attributes
  for each row execute function public.set_updated_at();

alter table public.plan_act_attributes enable row level security;
drop policy if exists "plan_act_attributes authenticated view" on public.plan_act_attributes;
create policy "plan_act_attributes authenticated view" on public.plan_act_attributes for select to authenticated using (true);
drop policy if exists "plan_act_attributes privileged manage" on public.plan_act_attributes;
create policy "plan_act_attributes privileged manage" on public.plan_act_attributes to authenticated
  using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());
grant select, insert, update, delete on public.plan_act_attributes to authenticated;

insert into public.plan_act_attributes(key, label, description, options, sectors, building_types, defaults, sort_order) values
  ('structure_type', 'Structure type', 'Main structural system of the building.',
    '[{"value":"reinforced_concrete","label":"Reinforced concrete"},{"value":"steel","label":"Steel"},{"value":"precast","label":"Precast concrete"},{"value":"timber","label":"Timber"},{"value":"load_bearing_masonry","label":"Load-bearing masonry"}]',
    array['residential','commercial','industrial','institutional'], '{}',
    '{"residential":"reinforced_concrete","commercial":"reinforced_concrete","institutional":"reinforced_concrete","industrial":"steel"}', 10),
  ('foundation_type', 'Foundation type', null,
    '[{"value":"pad","label":"Pad footings"},{"value":"strip","label":"Strip footings"},{"value":"raft","label":"Raft"},{"value":"piled","label":"Piled"}]',
    array['residential','commercial','industrial','institutional'], array['bridge'],
    '{"residential":"pad","industrial":"pad","bridge":"piled","residential_tower":"piled","condominium":"piled","office_building":"piled","hospital":"piled","shopping_mall":"piled"}', 20),
  ('roof_type', 'Roof type', null,
    '[{"value":"pitched_tile","label":"Pitched, tiled"},{"value":"flat_rc","label":"Flat RC"},{"value":"metal_sheet","label":"Metal sheet"},{"value":"dome","label":"Dome / feature roof"}]',
    array['residential','commercial','industrial','institutional'], '{}',
    '{"luxury_villa":"pitched_tile","mansion_estate":"pitched_tile","private_residence":"pitched_tile","standard_villa":"pitched_tile","townhouse":"pitched_tile","residential_development":"pitched_tile","apartment":"flat_rc","condominium":"flat_rc","residential_tower":"flat_rc","commercial":"flat_rc","institutional":"flat_rc","religious_building":"dome","industrial":"metal_sheet"}', 30),
  ('finish_grade', 'Finish grade', 'Specification level of finishes.',
    '[{"value":"standard","label":"Standard"},{"value":"premium","label":"Premium"},{"value":"luxury","label":"Luxury"}]',
    array['residential'], array['hotel'],
    '{"luxury_villa":"luxury","mansion_estate":"luxury","residential":"standard","hotel":"premium"}', 40),
  ('formwork_type', 'Formwork type', 'Slab and wall formwork system for repetitive floors.',
    '[{"value":"conventional","label":"Conventional (timber / ply)"},{"value":"aluminum","label":"Aluminium system"},{"value":"table_form","label":"Table form"},{"value":"tunnel_form","label":"Tunnel form"},{"value":"steel_form","label":"Steel form"}]',
    array['commercial','institutional'], array['apartment','condominium','residential_tower'],
    '{"commercial":"conventional","institutional":"conventional","apartment":"conventional","condominium":"conventional","residential_tower":"conventional"}', 50),
  ('floor_type', 'Floor type', 'Ground-bearing slab specification.',
    '[{"value":"standard_slab","label":"Standard slab"},{"value":"superflat","label":"Superflat (racking / VNA)"}]',
    array['industrial'], '{}', '{"warehouse":"superflat","logistics_center":"superflat","industrial":"standard_slab"}', 60),
  ('overhead_crane', 'Overhead crane', null,
    '[{"value":"yes","label":"Yes"},{"value":"no","label":"No"}]',
    array['industrial'], '{}', '{"industrial":"no"}', 70),
  ('medical_gases', 'Medical gases', null,
    '[{"value":"yes","label":"Yes"},{"value":"no","label":"No"}]',
    '{}', array['hospital','clinic'], '{"hospital":"yes","clinic":"no"}', 80),
  ('pavement_type', 'Pavement type', null,
    '[{"value":"flexible_asphalt","label":"Flexible (asphalt)"},{"value":"rigid_concrete","label":"Rigid (concrete)"},{"value":"surface_dressing","label":"Surface dressing (DBST)"}]',
    '{}', array['road'], '{"road":"flexible_asphalt"}', 90),
  ('deck_type', 'Deck type', null,
    '[{"value":"precast_girder","label":"Precast girders"},{"value":"cast_in_situ","label":"Cast in situ"},{"value":"steel_composite","label":"Steel composite"}]',
    '{}', array['bridge'], '{"bridge":"precast_girder"}', 100),
  ('pipe_material', 'Pipe material', null,
    '[{"value":"hdpe","label":"HDPE"},{"value":"ductile_iron","label":"Ductile iron"},{"value":"upvc","label":"uPVC"},{"value":"rc_pipe","label":"RC pipe"}]',
    '{}', array['drainage','water_supply','utility','other_infrastructure'], '{"drainage":"rc_pipe","water_supply":"hdpe","utility":"hdpe"}', 110),
  ('installation_method', 'Installation method', null,
    '[{"value":"open_trench","label":"Open trench"},{"value":"trenchless_hdd","label":"Trenchless (HDD)"}]',
    '{}', array['drainage','water_supply','utility','other_infrastructure'], '{"drainage":"open_trench","water_supply":"open_trench","utility":"open_trench","other_infrastructure":"open_trench"}', 120)
on conflict (key) do nothing;

-- ── 2. building_component conditions are now the scope row's part ──────────
-- (runs as the migration owner, so the frozen-template guard on plan_act_applicability lets it through)
delete from public.plan_act_applicability where attribute = 'building_component';

-- ── 3. Conditions for type-specific draft templates ────────────────────────
do $$
declare r record;
begin
  for r in
    select * from (values
      ('TPL-RES-VILLA-RF-001', 'roof_type', array['pitched_tile','metal_sheet']),
      ('TPL-IND-RF-001', 'roof_type', array['metal_sheet']),
      ('TPL-INS-CIV-DOME-001', 'roof_type', array['dome']),
      ('TPL-INF-RD-SEG-001', 'pavement_type', array['flexible_asphalt']),
      ('TPL-INF-BR-SPAN-001', 'deck_type', array['precast_girder','steel_composite']),
      ('TPL-INF-PL-SEG-001', 'installation_method', array['open_trench'])
    ) as x(code, attribute, vals)
  loop
    insert into public.plan_act_applicability(target_type, target_id, attribute, operator, values)
    select 'template', t.id, r.attribute, 'in', r.vals
    from public.plan_act_templates t
    where t.code = r.code and t.status = 'draft'
      and not exists (select 1 from public.plan_act_applicability a
                      where a.target_type = 'template' and a.target_id = t.id and a.attribute = r.attribute);
  end loop;
end $$;
