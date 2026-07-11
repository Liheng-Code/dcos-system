-- ============================================================
-- Master Libraries: reusable WBS generation foundations
-- ============================================================

-- Template metadata used by the Master Library generator.
alter table public.wbs_templates
  add column if not exists generator_config jsonb not null default '{}'::jsonb;

alter table public.wbs_template_nodes
  add column if not exists source_library_type text,
  add column if not exists source_library_id uuid;

-- Keep the WBS node type constraint aligned with the Master Libraries chain.
alter table public.wbs_nodes
  drop constraint if exists wbs_nodes_node_type_check;

alter table public.wbs_nodes
  add constraint wbs_nodes_node_type_check
  check (node_type in (
    'phase',
    'building',
    'stage',
    'level',
    'zone',
    'room',
    'element',
    'discipline',
    'task_group',
    'section',
    'segment',
    'structure',
    'component',
    'area',
    'system',
    'subsystem',
    'equipment'
  ));

create table if not exists public.phase_master (
  id uuid primary key default gen_random_uuid(),
  phase_code text not null unique,
  phase_name text not null,
  sequence_no int not null default 0,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.building_master (
  id uuid primary key default gen_random_uuid(),
  building_code text not null unique,
  building_name text not null,
  building_type text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.level_master (
  id uuid primary key default gen_random_uuid(),
  level_code text not null unique,
  level_name text not null,
  sort_order int not null default 0,
  level_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zone_master (
  id uuid primary key default gen_random_uuid(),
  zone_code text not null unique,
  zone_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_master (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  room_name text not null,
  category text,
  discipline text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.element_master (
  id uuid primary key default gen_random_uuid(),
  element_code text not null unique,
  element_name text not null,
  category text,
  discipline text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discipline_master (
  id uuid primary key default gen_random_uuid(),
  discipline_code text not null unique,
  discipline_name text not null,
  sequence_no int not null default 0,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_group_master (
  id uuid primary key default gen_random_uuid(),
  task_group_code text not null unique,
  task_group_name text not null,
  category text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.can_manage_master_libraries()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
  or exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_code = ur.role_code
    where ur.user_id = auth.uid()
      and rp.module = 'master_libraries'
      and (rp.edit or rp.can_create or rp.delete or rp.configure)
  );
$$;

do $policies$
declare
  tbl text;
begin
  foreach tbl in array array[
    'phase_master',
    'building_master',
    'level_master',
    'zone_master',
    'room_master',
    'element_master',
    'discipline_master',
    'task_group_master'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "%s authenticated view" on public.%I', tbl, tbl);
    execute format('drop policy if exists "%s privileged manage" on public.%I', tbl, tbl);
    execute format('create policy "%s authenticated view" on public.%I for select to authenticated using (true)', tbl, tbl);
    execute format('create policy "%s privileged manage" on public.%I for all to authenticated using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries())', tbl, tbl);
  end loop;
end $policies$;

insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
values
  ('L0', 'master_libraries', 'manage', true, true, true, true, false, false, false, true, false, true, false, 'company'),
  ('L1', 'master_libraries', 'manage', true, true, true, true, false, false, false, true, false, true, false, 'company'),
  ('L2', 'master_libraries', 'manage', true, true, true, false, false, false, false, true, false, true, false, 'company'),
  ('L3', 'master_libraries', 'manage', true, false, false, false, false, false, false, true, false, false, false, 'company'),
  ('L4', 'master_libraries', 'manage', true, false, false, false, false, false, false, false, false, false, false, 'company'),
  ('L5', 'master_libraries', 'manage', true, false, false, false, false, false, false, false, false, false, false, 'own'),
  ('L6', 'master_libraries', 'manage', true, false, false, false, false, false, false, false, false, false, false, 'own')
on conflict do nothing;

insert into public.phase_master (phase_code, phase_name, sequence_no) values
  ('PH-001', 'Tender', 1),
  ('PH-002', 'Design', 2),
  ('PH-003', 'Procurement', 3),
  ('PH-004', 'Construction', 4),
  ('PH-005', 'Testing', 5),
  ('PH-006', 'Commissioning', 6),
  ('PH-007', 'Handover', 7),
  ('PH-008', 'DLP', 8),
  ('PH-009', 'Closeout', 9)
on conflict (phase_code) do update set phase_name = excluded.phase_name, sequence_no = excluded.sequence_no;

insert into public.building_master (building_code, building_name, building_type) values
  ('BLD-001', 'Main Tower', 'tower'),
  ('BLD-002', 'Podium', 'podium'),
  ('BLD-003', 'Warehouse', 'industrial'),
  ('BLD-004', 'Factory', 'industrial'),
  ('BLD-005', 'Office Building', 'office'),
  ('BLD-006', 'Residential Tower', 'residential'),
  ('BLD-007', 'Club House', 'amenity'),
  ('BLD-008', 'Parking Building', 'parking'),
  ('BLD-009', 'Plant Room', 'mep')
on conflict (building_code) do update set building_name = excluded.building_name, building_type = excluded.building_type;

insert into public.level_master (level_code, level_name, sort_order, level_type) values
  ('LVL-B4', 'Basement 4', -4, 'basement'),
  ('LVL-B3', 'Basement 3', -3, 'basement'),
  ('LVL-B2', 'Basement 2', -2, 'basement'),
  ('LVL-B1', 'Basement 1', -1, 'basement'),
  ('LVL-G', 'Ground Floor', 0, 'ground'),
  ('LVL-M', 'Mezzanine', 1, 'mezzanine'),
  ('LVL-L2', 'Level 2', 2, 'typical'),
  ('LVL-L3', 'Level 3', 3, 'typical'),
  ('LVL-L4', 'Level 4', 4, 'typical'),
  ('LVL-RF', 'Roof', 100, 'roof'),
  ('LVL-RT', 'Roof Top', 101, 'roof')
on conflict (level_code) do update set level_name = excluded.level_name, sort_order = excluded.sort_order, level_type = excluded.level_type;

insert into public.zone_master (zone_code, zone_name) values
  ('ZN-001', 'North'), ('ZN-002', 'South'), ('ZN-003', 'East'), ('ZN-004', 'West'),
  ('ZN-005', 'Core'), ('ZN-006', 'Wing A'), ('ZN-007', 'Wing B'), ('ZN-008', 'Wing C'),
  ('ZN-009', 'External'), ('ZN-010', 'Roof Zone')
on conflict (zone_code) do update set zone_name = excluded.zone_name;

insert into public.room_master (room_code, room_name, category, discipline) values
  ('RM-OFF', 'Office', 'workplace', 'Architecture'),
  ('RM-MTG', 'Meeting Room', 'workplace', 'Architecture'),
  ('RM-LBY', 'Lift Lobby', 'circulation', 'Architecture'),
  ('RM-TLT', 'Toilet', 'wet area', 'Architecture'),
  ('RM-PAN', 'Pantry', 'support', 'Architecture'),
  ('RM-COR', 'Corridor', 'circulation', 'Architecture'),
  ('RM-STR', 'Stair', 'circulation', 'Structure'),
  ('RM-ELEC', 'Electrical Room', 'mep', 'MEP'),
  ('RM-MECH', 'Mechanical Room', 'mep', 'MEP'),
  ('RM-PUMP', 'Pump Room', 'mep', 'MEP'),
  ('RM-AHU', 'AHU Room', 'mep', 'MEP'),
  ('RM-MDF', 'MDF Room', 'mep', 'MEP'),
  ('RM-IDF', 'IDF Room', 'mep', 'MEP'),
  ('RM-SVR', 'Server Room', 'mep', 'MEP')
on conflict (room_code) do update set room_name = excluded.room_name, category = excluded.category, discipline = excluded.discipline;

insert into public.element_master (element_code, element_name, category, discipline) values
  ('EL-PILE', 'Pile', 'Structure', 'Structure'),
  ('EL-PCAP', 'Pile Cap', 'Structure', 'Structure'),
  ('EL-COL', 'Column', 'Structure', 'Structure'),
  ('EL-BEAM', 'Beam', 'Structure', 'Structure'),
  ('EL-SLAB', 'Slab', 'Structure', 'Structure'),
  ('EL-WALL', 'Wall', 'Architecture', 'Architecture'),
  ('EL-DOOR', 'Door', 'Architecture', 'Architecture'),
  ('EL-WIN', 'Window', 'Architecture', 'Architecture'),
  ('EL-CEIL', 'Ceiling', 'Architecture', 'Architecture'),
  ('EL-TILE', 'Tile', 'Architecture', 'Architecture'),
  ('EL-PIPE', 'Pipe', 'MEP', 'MEP'),
  ('EL-CTRY', 'Cable Tray', 'MEP', 'MEP'),
  ('EL-LGT', 'Lighting', 'MEP', 'MEP'),
  ('EL-DUCT', 'Duct', 'MEP', 'MEP')
on conflict (element_code) do update set element_name = excluded.element_name, category = excluded.category, discipline = excluded.discipline;

insert into public.discipline_master (discipline_code, discipline_name, sequence_no) values
  ('ARC', 'Architecture', 1),
  ('STR', 'Structure', 2),
  ('MEP', 'MEP', 3),
  ('BIM', 'BIM', 4),
  ('PLN', 'Planning', 5),
  ('PRC', 'Procurement', 6),
  ('CON', 'Construction', 7),
  ('QAQC', 'QAQC', 8),
  ('HSE', 'HSE', 9),
  ('QS', 'QS', 10),
  ('DC', 'Document Control', 11),
  ('COM', 'Commissioning', 12)
on conflict (discipline_code) do update set discipline_name = excluded.discipline_name, sequence_no = excluded.sequence_no;

insert into public.task_group_master (task_group_code, task_group_name, category) values
  ('TG-DES', 'Design', 'Design'),
  ('TG-CALC', 'Calculation Note', 'Design'),
  ('TG-DRW', 'Drawing', 'Design'),
  ('TG-SHOP', 'Shop Drawing', 'Design'),
  ('TG-MAT', 'Material Approval', 'Procurement'),
  ('TG-METHOD', 'Method Statement', 'Construction'),
  ('TG-PRC', 'Procurement', 'Procurement'),
  ('TG-CON', 'Construction', 'Construction'),
  ('TG-INS', 'Inspection', 'QAQC'),
  ('TG-TST', 'Testing', 'QAQC'),
  ('TG-COM', 'Commissioning', 'Commissioning'),
  ('TG-ASB', 'As-built', 'Handover'),
  ('TG-PUN', 'Punch List', 'Handover'),
  ('TG-HND', 'Handover', 'Handover')
on conflict (task_group_code) do update set task_group_name = excluded.task_group_name, category = excluded.category;

create or replace function public.generate_wbs_from_master_template(
  p_project_id uuid,
  p_template_id uuid,
  p_variables jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing int;
  v_count int := 0;
  v_phase_id uuid;
  v_building_id uuid;
  v_level_id uuid;
  v_zone_id uuid;
  v_room_id uuid;
  v_element_id uuid;
  v_discipline_id uuid;
  v_task_group_id uuid;
  v_basements int := greatest(0, least(9, coalesce((p_variables->>'basement_count')::int, 1)));
  v_floors int := greatest(1, least(200, coalesce((p_variables->>'floor_count')::int, 3)));
  v_building_code text := upper(coalesce(nullif(p_variables->>'building_code', ''), 'BLD-A'));
  v_building_name text := coalesce(nullif(p_variables->>'building_name', ''), 'Building A');
  v_phase_code text := upper(coalesce(nullif(p_variables->>'phase_code', ''), 'PH-CON'));
  v_phase_name text := coalesce(nullif(p_variables->>'phase_name', ''), 'Construction');
  v_zone_count int := greatest(1, least(8, coalesce((p_variables->>'zone_count')::int, 2)));
  v_room_count int := greatest(1, least(8, coalesce((p_variables->>'room_count')::int, 2)));
  v_zone_no int;
  v_room_no int;
  v_floor_no int;
  v_level_code text;
  v_level_name text;
  v_zone_code text;
  v_room_code text;
  v_prefix text;
  v_elements jsonb := coalesce(p_variables->'elements', '[{"code":"STR","name":"Structural Works"},{"code":"ARC","name":"Architectural Works"},{"code":"MEP","name":"M&E Works"}]'::jsonb);
  v_disciplines jsonb := coalesce(p_variables->'disciplines', '[{"code":"CON","name":"Construction"},{"code":"QAQC","name":"QAQC"}]'::jsonb);
  v_task_groups jsonb := coalesce(p_variables->'task_groups', '[{"code":"TG-CON","name":"Construction"},{"code":"TG-INS","name":"Inspection"}]'::jsonb);
  v_item jsonb;
  v_disc jsonb;
  v_tg jsonb;
begin
  select count(*) into v_existing
  from public.wbs_nodes
  where project_id = p_project_id and status = 'active';

  if v_existing > 0 then
    raise exception 'WBS generation is blocked because this project already has active WBS nodes.';
  end if;

  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
  values (p_project_id, null, 'phase', v_phase_code, v_phase_name, 0, 'active')
  returning id into v_phase_id;
  v_count := v_count + 1;

  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
  values (p_project_id, v_phase_id, 'building', v_building_code, v_building_name, 0, 'active')
  returning id into v_building_id;
  v_count := v_count + 1;

  for v_floor_no in 1..(v_basements + v_floors) loop
    if v_floor_no <= v_basements then
      v_level_code := 'B' || (v_basements - v_floor_no + 1)::text;
      v_level_name := 'Basement Level ' || (v_basements - v_floor_no + 1)::text;
    elsif v_floor_no = v_basements + 1 then
      v_level_code := 'L01';
      v_level_name := 'Level 01';
    else
      v_level_code := 'L' || lpad((v_floor_no - v_basements)::text, 2, '0');
      v_level_name := 'Level ' || lpad((v_floor_no - v_basements)::text, 2, '0');
    end if;

    insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
    values (p_project_id, v_building_id, 'level', v_level_code, v_level_name, v_floor_no, 'active')
    returning id into v_level_id;
    v_count := v_count + 1;

    for v_zone_no in 1..v_zone_count loop
      v_zone_code := v_level_code || '-Z' || chr(64 + v_zone_no);
      insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
      values (p_project_id, v_level_id, 'zone', v_zone_code, 'Zone ' || chr(64 + v_zone_no), v_zone_no, 'active')
      returning id into v_zone_id;
      v_count := v_count + 1;

      for v_room_no in 1..v_room_count loop
        v_room_code := v_zone_code || '-R' || lpad(v_room_no::text, 2, '0');
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_zone_id, 'room', v_room_code, 'Room ' || lpad(v_room_no::text, 2, '0'), v_room_no, 'active')
        returning id into v_room_id;
        v_count := v_count + 1;

        for v_item in select * from jsonb_array_elements(v_elements) loop
          v_prefix := v_room_code || '-' || upper(coalesce(v_item->>'code', 'EL'));
          insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
          values (p_project_id, v_room_id, 'element', v_prefix, coalesce(v_item->>'name', 'Element'), 0, 'active')
          returning id into v_element_id;
          v_count := v_count + 1;

          for v_disc in select * from jsonb_array_elements(v_disciplines) loop
            insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
            values (p_project_id, v_element_id, 'discipline', v_prefix || '-' || upper(coalesce(v_disc->>'code', 'DISC')), coalesce(v_disc->>'name', 'Discipline'), 0, 'active')
            returning id into v_discipline_id;
            v_count := v_count + 1;

            for v_tg in select * from jsonb_array_elements(v_task_groups) loop
              insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
              values (p_project_id, v_discipline_id, 'task_group', v_prefix || '-' || upper(coalesce(v_disc->>'code', 'DISC')) || '-' || upper(coalesce(v_tg->>'code', 'TG')), coalesce(v_tg->>'name', 'Task Group'), 0, 'active');
              v_count := v_count + 1;
            end loop;
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;

  update public.projects
  set wbs_template_id = p_template_id,
      updated_at = now()
  where id = p_project_id;

  return v_count;
end;
$$;
