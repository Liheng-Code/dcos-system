-- Change wbs_code uniqueness from project-scoped to sibling-scoped, and rewrite
-- generate_wbs_from_master_library_items to store only the item's own code on each
-- node instead of the fully-accumulated parent path.
-- The full_path trigger already builds "BLDG-A / LVL-01" for display, so wbs_code
-- should just be the item's own identifier.

-- 1. Drop old project-scoped unique constraint.
alter table public.wbs_nodes
  drop constraint if exists wbs_nodes_project_id_wbs_code_key;

-- 2. Add sibling-scoped unique index.
--    NULLS NOT DISTINCT ensures root nodes (parent_id IS NULL) are also unique per project.
create unique index if not exists wbs_nodes_sibling_unique
  on public.wbs_nodes (project_id, parent_id, wbs_code) nulls not distinct;

-- 3. Rewrite generation function — own item code only, no accumulated prefix.
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
  v_selection_count  int;
  v_has_selection    boolean := false;
  v_count            int := 0;
  v_target_parent_id uuid;
  v_phase            record;
  v_building         record;
  v_level            record;
  v_zone             record;
  v_room             record;
  v_element          record;
  v_discipline       record;
  v_task_group       record;
  v_parent           record;
  v_next_parent_id   uuid;
  v_own_code         text;
begin
  -- Validate at least one selection exists
  v_selection_counts := array[
    jsonb_array_length(coalesce(p_selections->'phase_ids',      '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'building_ids',   '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'level_ids',      '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'zone_ids',       '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'room_ids',       '[]'::jsonb)),
    jsonb_array_length(coalesce(p_selections->'element_ids',    '[]'::jsonb)),
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

  -- Validate target node belongs to project (if provided)
  if p_target_node_id is not null then
    if not exists (
      select 1 from public.wbs_nodes
      where id = p_target_node_id and project_id = p_project_id
    ) then
      raise exception 'Target WBS node was not found for this project.';
    end if;
  end if;

  v_target_parent_id := p_target_node_id;

  -- Temp tables track current frontier of parent nodes for each generation level
  drop table if exists _wbs_generation_current;
  drop table if exists _wbs_generation_next;
  create temp table _wbs_generation_current (
    node_id    uuid,
    sort_order int not null
  ) on commit drop;
  create temp table _wbs_generation_next (
    node_id    uuid,
    sort_order int not null
  ) on commit drop;

  -- Seed: the chosen attachment point (null = project root)
  insert into _wbs_generation_current values (v_target_parent_id, 0);

  -- Phase
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
        v_own_code := upper(v_phase.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'phase', v_own_code, v_phase.name, v_phase.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_phase.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  -- Building
  if jsonb_array_length(coalesce(p_selections->'building_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_building in
        select id, building_code as code, building_name as name,
               row_number() over (order by building_code) as sort_order
          from public.building_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'building_ids', '[]'::jsonb)))
         order by building_code
      loop
        v_own_code := upper(v_building.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'building', v_own_code, v_building.name, v_building.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_building.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  -- Level
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
        v_own_code := upper(v_level.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'level', v_own_code, v_level.name, v_level.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_level.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  -- Zone
  if jsonb_array_length(coalesce(p_selections->'zone_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_zone in
        select id, zone_code as code, zone_name as name,
               row_number() over (order by zone_code) as sort_order
          from public.zone_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'zone_ids', '[]'::jsonb)))
         order by zone_code
      loop
        v_own_code := upper(v_zone.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'zone', v_own_code, v_zone.name, v_zone.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_zone.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  -- Room
  if jsonb_array_length(coalesce(p_selections->'room_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_room in
        select id, room_code as code, room_name as name,
               row_number() over (order by room_code) as sort_order
          from public.room_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'room_ids', '[]'::jsonb)))
         order by room_code
      loop
        v_own_code := upper(v_room.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'room', v_own_code, v_room.name, v_room.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_room.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  -- Element
  if jsonb_array_length(coalesce(p_selections->'element_ids', '[]'::jsonb)) > 0 then
    truncate _wbs_generation_next;
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_element in
        select id, element_code as code, element_name as name,
               row_number() over (order by element_code) as sort_order
          from public.element_master
         where is_active = true
           and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'element_ids', '[]'::jsonb)))
         order by element_code
      loop
        v_own_code := upper(v_element.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'element', v_own_code, v_element.name, v_element.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_element.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  -- Discipline
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
        v_own_code := upper(v_discipline.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_parent.node_id, 'discipline', v_own_code, v_discipline.name, v_discipline.sort_order, 'active')
        returning id into v_next_parent_id;
        insert into _wbs_generation_next values (v_next_parent_id, v_discipline.sort_order);
        v_count := v_count + 1;
      end loop;
    end loop;
    truncate _wbs_generation_current;
    insert into _wbs_generation_current select * from _wbs_generation_next;
  end if;

  -- Task Group (leaf level — no need to push into next table)
  if jsonb_array_length(coalesce(p_selections->'task_group_ids', '[]'::jsonb)) > 0 then
    for v_parent in select * from _wbs_generation_current order by sort_order loop
      for v_task_group in
        select id, task_group_code as code, task_group_name as name,
               row_number() over (order by task_group_code) as sort_order
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
          upper(v_task_group.code),
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
