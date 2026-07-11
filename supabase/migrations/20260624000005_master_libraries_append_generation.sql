-- Allow Master Library generation to append to projects with existing WBS nodes.
-- Each run gets its own prefix so the project-level unique WBS code constraint
-- is preserved without blocking generation.

create or replace function public.generate_wbs_from_master_library_items(
  p_project_id uuid,
  p_selections jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_count int := 0;
  v_branch_count int := 1;
  v_selection_counts int[];
  v_selection_count int;
  v_run_index int;
  v_run_prefix text;
  v_count int := 0;
  v_has_selection boolean := false;
  v_phase record;
  v_building record;
  v_level record;
  v_zone record;
  v_room record;
  v_element record;
  v_discipline record;
  v_task_group record;
  v_phase_id uuid;
  v_building_id uuid;
  v_level_id uuid;
  v_zone_id uuid;
  v_room_id uuid;
  v_element_id uuid;
  v_discipline_id uuid;
  v_phase_code text;
  v_building_code text;
  v_level_code text;
  v_zone_code text;
  v_room_code text;
  v_element_code text;
  v_discipline_code text;
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
    v_branch_count := v_branch_count * v_selection_count;
    v_expected_count := v_expected_count + v_branch_count;
  end loop;

  if not v_has_selection then
    return -1;
  end if;

  select coalesce(count(*), 0) + 1
    into v_run_index
    from public.wbs_nodes
   where project_id = p_project_id
     and node_type in ('phase', 'building', 'level', 'zone', 'room', 'element', 'discipline', 'task_group');

  v_run_prefix := 'GEN-' || lpad(v_run_index::text, 2, '0');

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

  -- Phase
  if jsonb_array_length(coalesce(p_selections->'phase_ids', '[]'::jsonb)) > 0 then
    for v_phase in
      select id, phase_code as code, phase_name as name, sequence_no as sort_order
      from public.phase_master
      where is_active = true
        and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'phase_ids', '[]'::jsonb)))
      order by sequence_no, phase_code
    loop
      v_phase_code := v_run_prefix || '-' || upper(v_phase.code);
      insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
      values (p_project_id, null, 'phase', v_phase_code, v_phase.name, v_phase.sort_order, 'active')
      returning id into v_phase_id;
      insert into _wbs_generation_current values (v_phase_id, v_phase_code, v_phase.sort_order);
      v_count := v_count + 1;
    end loop;
  end if;

  -- Building
  if jsonb_array_length(coalesce(p_selections->'building_ids', '[]'::jsonb)) > 0 then
    if exists (select 1 from _wbs_generation_current) then
      truncate _wbs_generation_next;
      for v_phase in select * from _wbs_generation_current order by sort_order, wbs_code loop
        for v_building in
          select id, building_code as code, building_name as name, row_number() over (order by building_code) as sort_order
          from public.building_master
          where is_active = true
            and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'building_ids', '[]'::jsonb)))
          order by building_code
        loop
          v_building_code := v_phase.wbs_code || '-' || upper(v_building.code);
          insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
          values (p_project_id, v_phase.node_id, 'building', v_building_code, v_building.name, v_building.sort_order, 'active')
          returning id into v_building_id;
          insert into _wbs_generation_next values (v_building_id, v_building_code, v_building.sort_order);
          v_count := v_count + 1;
        end loop;
      end loop;
      truncate _wbs_generation_current;
      insert into _wbs_generation_current select * from _wbs_generation_next;
      truncate _wbs_generation_next;
    else
      for v_building in
        select id, building_code as code, building_name as name, row_number() over (order by building_code) as sort_order
        from public.building_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'building_ids', '[]'::jsonb)))
        order by building_code
      loop
        v_building_code := v_run_prefix || '-' || upper(v_building.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, null, 'building', v_building_code, v_building.name, v_building.sort_order, 'active')
        returning id into v_building_id;
        insert into _wbs_generation_current values (v_building_id, v_building_code, v_building.sort_order);
        v_count := v_count + 1;
      end loop;
    end if;
  end if;

  -- Level
  if jsonb_array_length(coalesce(p_selections->'level_ids', '[]'::jsonb)) > 0 then
    if exists (select 1 from _wbs_generation_current) then
      truncate _wbs_generation_next;
      for v_building in select * from _wbs_generation_current order by sort_order, wbs_code loop
        for v_level in
          select id, level_code as code, level_name as name, sort_order
          from public.level_master
          where is_active = true
            and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'level_ids', '[]'::jsonb)))
          order by sort_order, level_code
        loop
          v_level_code := v_building.wbs_code || '-' || upper(v_level.code);
          insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
          values (p_project_id, v_building.node_id, 'level', v_level_code, v_level.name, v_level.sort_order, 'active')
          returning id into v_level_id;
          insert into _wbs_generation_next values (v_level_id, v_level_code, v_level.sort_order);
          v_count := v_count + 1;
        end loop;
      end loop;
      truncate _wbs_generation_current;
      insert into _wbs_generation_current select * from _wbs_generation_next;
      truncate _wbs_generation_next;
    else
      for v_level in
        select id, level_code as code, level_name as name, sort_order
        from public.level_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'level_ids', '[]'::jsonb)))
        order by sort_order, level_code
      loop
        v_level_code := v_run_prefix || '-' || upper(v_level.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, null, 'level', v_level_code, v_level.name, v_level.sort_order, 'active')
        returning id into v_level_id;
        insert into _wbs_generation_current values (v_level_id, v_level_code, v_level.sort_order);
        v_count := v_count + 1;
      end loop;
    end if;
  end if;

  -- Zone
  if jsonb_array_length(coalesce(p_selections->'zone_ids', '[]'::jsonb)) > 0 then
    if exists (select 1 from _wbs_generation_current) then
      truncate _wbs_generation_next;
      for v_level in select * from _wbs_generation_current order by sort_order, wbs_code loop
        for v_zone in
          select id, zone_code as code, zone_name as name, row_number() over (order by zone_code) as sort_order
          from public.zone_master
          where is_active = true
            and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'zone_ids', '[]'::jsonb)))
          order by zone_code
        loop
          v_zone_code := v_level.wbs_code || '-' || upper(v_zone.code);
          insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
          values (p_project_id, v_level.node_id, 'zone', v_zone_code, v_zone.name, v_zone.sort_order, 'active')
          returning id into v_zone_id;
          insert into _wbs_generation_next values (v_zone_id, v_zone_code, v_zone.sort_order);
          v_count := v_count + 1;
        end loop;
      end loop;
      truncate _wbs_generation_current;
      insert into _wbs_generation_current select * from _wbs_generation_next;
      truncate _wbs_generation_next;
    else
      for v_zone in
        select id, zone_code as code, zone_name as name, row_number() over (order by zone_code) as sort_order
        from public.zone_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'zone_ids', '[]'::jsonb)))
        order by zone_code
      loop
        v_zone_code := v_run_prefix || '-' || upper(v_zone.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, null, 'zone', v_zone_code, v_zone.name, v_zone.sort_order, 'active')
        returning id into v_zone_id;
        insert into _wbs_generation_current values (v_zone_id, v_zone_code, v_zone.sort_order);
        v_count := v_count + 1;
      end loop;
    end if;
  end if;

  -- Room
  if jsonb_array_length(coalesce(p_selections->'room_ids', '[]'::jsonb)) > 0 then
    if exists (select 1 from _wbs_generation_current) then
      truncate _wbs_generation_next;
      for v_zone in select * from _wbs_generation_current order by sort_order, wbs_code loop
        for v_room in
          select id, room_code as code, room_name as name, row_number() over (order by room_code) as sort_order
          from public.room_master
          where is_active = true
            and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'room_ids', '[]'::jsonb)))
          order by room_code
        loop
          v_room_code := v_zone.wbs_code || '-' || upper(v_room.code);
          insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
          values (p_project_id, v_zone.node_id, 'room', v_room_code, v_room.name, v_room.sort_order, 'active')
          returning id into v_room_id;
          insert into _wbs_generation_next values (v_room_id, v_room_code, v_room.sort_order);
          v_count := v_count + 1;
        end loop;
      end loop;
      truncate _wbs_generation_current;
      insert into _wbs_generation_current select * from _wbs_generation_next;
      truncate _wbs_generation_next;
    else
      for v_room in
        select id, room_code as code, room_name as name, row_number() over (order by room_code) as sort_order
        from public.room_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'room_ids', '[]'::jsonb)))
        order by room_code
      loop
        v_room_code := v_run_prefix || '-' || upper(v_room.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, null, 'room', v_room_code, v_room.name, v_room.sort_order, 'active')
        returning id into v_room_id;
        insert into _wbs_generation_current values (v_room_id, v_room_code, v_room.sort_order);
        v_count := v_count + 1;
      end loop;
    end if;
  end if;

  -- Element
  if jsonb_array_length(coalesce(p_selections->'element_ids', '[]'::jsonb)) > 0 then
    if exists (select 1 from _wbs_generation_current) then
      truncate _wbs_generation_next;
      for v_room in select * from _wbs_generation_current order by sort_order, wbs_code loop
        for v_element in
          select id, element_code as code, element_name as name, row_number() over (order by element_code) as sort_order
          from public.element_master
          where is_active = true
            and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'element_ids', '[]'::jsonb)))
          order by element_code
        loop
          v_element_code := v_room.wbs_code || '-' || upper(v_element.code);
          insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
          values (p_project_id, v_room.node_id, 'element', v_element_code, v_element.name, v_element.sort_order, 'active')
          returning id into v_element_id;
          insert into _wbs_generation_next values (v_element_id, v_element_code, v_element.sort_order);
          v_count := v_count + 1;
        end loop;
      end loop;
      truncate _wbs_generation_current;
      insert into _wbs_generation_current select * from _wbs_generation_next;
      truncate _wbs_generation_next;
    else
      for v_element in
        select id, element_code as code, element_name as name, row_number() over (order by element_code) as sort_order
        from public.element_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'element_ids', '[]'::jsonb)))
        order by element_code
      loop
        v_element_code := v_run_prefix || '-' || upper(v_element.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, null, 'element', v_element_code, v_element.name, v_element.sort_order, 'active')
        returning id into v_element_id;
        insert into _wbs_generation_current values (v_element_id, v_element_code, v_element.sort_order);
        v_count := v_count + 1;
      end loop;
    end if;
  end if;

  -- Discipline
  if jsonb_array_length(coalesce(p_selections->'discipline_ids', '[]'::jsonb)) > 0 then
    if exists (select 1 from _wbs_generation_current) then
      truncate _wbs_generation_next;
      for v_element in select * from _wbs_generation_current order by sort_order, wbs_code loop
        for v_discipline in
          select id, discipline_code as code, discipline_name as name, sequence_no as sort_order
          from public.discipline_master
          where is_active = true
            and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'discipline_ids', '[]'::jsonb)))
          order by sequence_no, discipline_code
        loop
          v_discipline_code := v_element.wbs_code || '-' || upper(v_discipline.code);
          insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
          values (p_project_id, v_element.node_id, 'discipline', v_discipline_code, v_discipline.name, v_discipline.sort_order, 'active')
          returning id into v_discipline_id;
          insert into _wbs_generation_next values (v_discipline_id, v_discipline_code, v_discipline.sort_order);
          v_count := v_count + 1;
        end loop;
      end loop;
      truncate _wbs_generation_current;
      insert into _wbs_generation_current select * from _wbs_generation_next;
      truncate _wbs_generation_next;
    else
      for v_discipline in
        select id, discipline_code as code, discipline_name as name, sequence_no as sort_order
        from public.discipline_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'discipline_ids', '[]'::jsonb)))
        order by sequence_no, discipline_code
      loop
        v_discipline_code := v_run_prefix || '-' || upper(v_discipline.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, null, 'discipline', v_discipline_code, v_discipline.name, v_discipline.sort_order, 'active')
        returning id into v_discipline_id;
        insert into _wbs_generation_current values (v_discipline_id, v_discipline_code, v_discipline.sort_order);
        v_count := v_count + 1;
      end loop;
    end if;
  end if;

  -- Task Group
  if jsonb_array_length(coalesce(p_selections->'task_group_ids', '[]'::jsonb)) > 0 then
    if exists (select 1 from _wbs_generation_current) then
      for v_discipline in select * from _wbs_generation_current order by sort_order, wbs_code loop
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
            v_discipline.node_id,
            'task_group',
            v_discipline.wbs_code || '-' || upper(v_task_group.code),
            v_task_group.name,
            v_task_group.sort_order,
            'active'
          );
          v_count := v_count + 1;
        end loop;
      end loop;
    else
      for v_task_group in
        select id, task_group_code as code, task_group_name as name, row_number() over (order by task_group_code) as sort_order
        from public.task_group_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'task_group_ids', '[]'::jsonb)))
        order by task_group_code
      loop
        v_discipline_code := v_run_prefix || '-' || upper(v_task_group.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, null, 'task_group', v_discipline_code, v_task_group.name, v_task_group.sort_order, 'active');
        v_count := v_count + 1;
      end loop;
    end if;
  end if;

  update public.projects
     set updated_at = now()
   where id = p_project_id;

  return v_count;
end;
$$;
