-- Add location as a first-class WBS node type and make Master Library generation
-- create a location root node above the generated hierarchy.

alter table public.wbs_nodes
  drop constraint if exists wbs_nodes_node_type_check;

alter table public.wbs_nodes
  add constraint wbs_nodes_node_type_check
  check (node_type in (
    'location',
    'phase',
    'building',
    'stage',
    'level',
    'zone',
    'room',
    'element',
    'task_group',
    'discipline',
    'section',
    'segment',
    'structure',
    'component',
    'area',
    'system',
    'subsystem',
    'equipment'
  ));

create or replace function public.generate_wbs_from_master_library_items(
  p_project_id uuid,
  p_selections jsonb default '{}'::jsonb,
  p_location_name text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_selection_counts int[];
  v_selection_count int;
  v_has_selection boolean := false;
  v_count int := 0;
  v_run_index int;
  v_run_prefix text;
  v_location_name text;
  v_location_code text;
  v_location_id uuid;
  v_phase record;
  v_building record;
  v_level record;
  v_zone record;
  v_room record;
  v_element record;
  v_discipline record;
  v_task_group record;
  v_parent record;
  v_next_parent record;
  v_next_parent_id uuid;
  v_next_parent_code text;
  v_next_parent_sort int;
begin
  v_selection_counts := array[
    jsonb_array_length(coalesce(p_selections->'phase_ids', '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'building_ids', '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'level_ids', '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'zone_ids', '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'room_ids', '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'element_ids', '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'discipline_ids', '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'task_group_ids', '[]'::jsonb))
  ];

  foreach v_selection_count in array v_selection_counts loop
    if v_selection_count > 0 then
      v_has_selection := true;
    end if;
  end loop;

  if not v_has_selection then
    return -1;
  end if;

  select coalesce(count(*), 0) + 1
    into v_run_index
    from public.wbs_nodes
   where project_id = p_project_id
     and node_type = 'location';

  v_run_prefix := 'LOC-' || lpad(v_run_index::text, 2, '0');

  select coalesce(nullif(trim(p_location_name), ''), nullif(trim(p.location), ''), 'Location')
    into v_location_name
    from public.projects p
   where p.id = p_project_id;

  v_location_code := v_run_prefix || '-ROOT';
  insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
  values (p_project_id, null, 'location', v_location_code, v_location_name, 0, 'active')
  returning id into v_location_id;
  v_count := v_count + 1;

  drop table if exists _wbs_generation_current;
  drop table if exists _wbs_generation_next;
  create temp table _wbs_generation_current (
    node_id uuid not null,
    wbs_code text not null,
    sort_order int not null
  ) on commit drop;
  create temp table _wbs_generation_next (
    node_id uuid not null,
    wbs_code text not null,
    sort_order int not null
  ) on commit drop;

  insert into _wbs_generation_current values (v_location_id, v_location_code, 0);

  if jsonb_array_length(coalesce(p_selections->'phase_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order, wbs_code loop
      for v_phase in
        select id, phase_code as code, phase_name as name, sequence_no as sort_order
        from public.phase_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'phase_ids', '[]'::jsonb)))
        order by sequence_no, phase_code
      loop
        v_next_parent_code := v_parent.wbs_code || '-' || upper(v_phase.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'phase', v_next_parent_code, v_phase.name, v_phase.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_next_parent_code, v_phase.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'building_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order, wbs_code loop
      for v_building in
        select id, building_code as code, building_name as name, row_number() over (order by building_code) as sort_order
        from public.building_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'building_ids', '[]'::jsonb)))
        order by building_code
      loop
        v_next_parent_code := v_parent.wbs_code || '-' || upper(v_building.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'building', v_next_parent_code, v_building.name, v_building.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_next_parent_code, v_building.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'level_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order, wbs_code loop
      for v_level in
        select id, level_code as code, level_name as name, sort_order
        from public.level_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'level_ids', '[]'::jsonb)))
        order by sort_order, level_code
      loop
        v_next_parent_code := v_parent.wbs_code || '-' || upper(v_level.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'level', v_next_parent_code, v_level.name, v_level.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_next_parent_code, v_level.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'zone_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order, wbs_code loop
      for v_zone in
        select id, zone_code as code, zone_name as name, row_number() over (order by zone_code) as sort_order
        from public.zone_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'zone_ids', '[]'::jsonb)))
        order by zone_code
      loop
        v_next_parent_code := v_parent.wbs_code || '-' || upper(v_zone.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'zone', v_next_parent_code, v_zone.name, v_zone.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_next_parent_code, v_zone.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'room_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order, wbs_code loop
      for v_room in
        select id, room_code as code, room_name as name, row_number() over (order by room_code) as sort_order
        from public.room_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'room_ids', '[]'::jsonb)))
        order by room_code
      loop
        v_next_parent_code := v_parent.wbs_code || '-' || upper(v_room.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'room', v_next_parent_code, v_room.name, v_room.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_next_parent_code, v_room.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'element_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order, wbs_code loop
      for v_element in
        select id, element_code as code, element_name as name, row_number() over (order by element_code) as sort_order
        from public.element_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'element_ids', '[]'::jsonb)))
        order by element_code
      loop
        v_next_parent_code := v_parent.wbs_code || '-' || upper(v_element.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'element', v_next_parent_code, v_element.name, v_element.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_next_parent_code, v_element.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'discipline_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order, wbs_code loop
      for v_discipline in
        select id, discipline_code as code, discipline_name as name, sequence_no as sort_order
        from public.discipline_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'discipline_ids', '[]'::jsonb)))
        order by sequence_no, discipline_code
      loop
        v_next_parent_code := v_parent.wbs_code || '-' || upper(v_discipline.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'discipline', v_next_parent_code, v_discipline.name, v_discipline.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_next_parent_code, v_discipline.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'task_group_ids', '[]'::jsonb)) > 0 then
    for v_parent in select * from _wbs_generation_current order by sort_order, wbs_code loop
      for v_task_group in
        select id, task_group_code as code, task_group_name as name, row_number() over (order by task_group_code) as sort_order
        from public.task_group_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'task_group_ids', '[]'::jsonb)))
        order by task_group_code
      loop
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (
          p_project_id,
          v_parent.node_id,
          'task_group',
          v_parent.wbs_code || '-' || upper(v_task_group.code),
          v_task_group.name,
          v_task_group.sort_order,
          'active'
        );
        v_count := v_count + 1;
      end loop;
    end loop;
  end if;

  update public.projects
     set updated_at = now()
   where id = p_project_id;

  return v_count;
end;
$$;
