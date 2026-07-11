-- Ensure the active Master Library generator stores only each node's own code.
-- This repeats the corrected function under a new migration version because
-- earlier 20260624000008 migrations share the same timestamp and one can be
-- skipped by migration tracking.

drop function if exists public.generate_wbs_from_master_library_items(uuid, jsonb);
drop function if exists public.generate_wbs_from_master_library_items(uuid, jsonb, text);

alter table public.wbs_nodes
  drop constraint if exists wbs_nodes_project_id_wbs_code_key;

create unique index if not exists wbs_nodes_sibling_unique
  on public.wbs_nodes (project_id, parent_id, wbs_code) nulls not distinct;

create or replace function public.generate_wbs_from_master_library_items(
  p_project_id uuid,
  p_selections jsonb default '{}'::jsonb,
  p_target_node_id uuid default null
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
  v_target_parent_id uuid;
  v_phase record;
  v_building record;
  v_level record;
  v_zone record;
  v_room record;
  v_element record;
  v_discipline record;
  v_task_group record;
  v_parent record;
  v_next_parent_id uuid;
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

  if p_target_node_id is not null and not exists (
    select 1
      from public.wbs_nodes
     where id = p_target_node_id
       and project_id = p_project_id
  ) then
    raise exception 'Target WBS node was not found for this project.';
  end if;

  v_target_parent_id := p_target_node_id;

  drop table if exists _wbs_generation_current;
  drop table if exists _wbs_generation_next;
  create temp table _wbs_generation_current (
    node_id uuid,
    sort_order int not null
  ) on commit drop;
  create temp table _wbs_generation_next (
    node_id uuid,
    sort_order int not null
  ) on commit drop;

  insert into _wbs_generation_current values (v_target_parent_id, 0);

  if jsonb_array_length(coalesce(p_selections->'phase_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_phase in
        select id, phase_code as code, phase_name as name, sequence_no as sort_order
          from public.phase_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'phase_ids', '[]'::jsonb)))
         order by sequence_no, phase_code
      loop
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'phase', upper(v_phase.code), v_phase.name, v_phase.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_phase.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'building_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_building in
        select id, building_code as code, building_name as name, row_number() over (order by building_code) as sort_order
          from public.building_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'building_ids', '[]'::jsonb)))
         order by building_code
      loop
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'building', upper(v_building.code), v_building.name, v_building.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_building.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'level_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_level in
        select id, level_code as code, level_name as name, sort_order
          from public.level_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'level_ids', '[]'::jsonb)))
         order by sort_order, level_code
      loop
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'level', upper(v_level.code), v_level.name, v_level.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_level.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'zone_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_zone in
        select id, zone_code as code, zone_name as name, row_number() over (order by zone_code) as sort_order
          from public.zone_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'zone_ids', '[]'::jsonb)))
         order by zone_code
      loop
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'zone', upper(v_zone.code), v_zone.name, v_zone.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_zone.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'room_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_room in
        select id, room_code as code, room_name as name, row_number() over (order by room_code) as sort_order
          from public.room_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'room_ids', '[]'::jsonb)))
         order by room_code
      loop
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'room', upper(v_room.code), v_room.name, v_room.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_room.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'element_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_element in
        select id, element_code as code, element_name as name, row_number() over (order by element_code) as sort_order
          from public.element_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'element_ids', '[]'::jsonb)))
         order by element_code
      loop
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'element', upper(v_element.code), v_element.name, v_element.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_element.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'discipline_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_discipline in
        select id, discipline_code as code, discipline_name as name, sequence_no as sort_order
          from public.discipline_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'discipline_ids', '[]'::jsonb)))
         order by sequence_no, discipline_code
      loop
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'discipline', upper(v_discipline.code), v_discipline.name, v_discipline.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_discipline.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  if jsonb_array_length(coalesce(p_selections->'task_group_ids', '[]'::jsonb)) > 0 then
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_task_group in
        select id, task_group_code as code, task_group_name as name, row_number() over (order by task_group_code) as sort_order
          from public.task_group_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'task_group_ids', '[]'::jsonb)))
         order by task_group_code
      loop
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'task_group', upper(v_task_group.code), v_task_group.name, v_task_group.sort_order, 'active');
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
