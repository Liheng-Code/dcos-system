-- Generate project WBS directly from selected Master Library records.

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
  v_existing int;
  v_expected_count int := 0;
  v_branch_count int := 1;
  v_limit int := 10000;
  v_selection_counts int[];
  v_selection_count int;
  v_count int := 0;
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

  if v_selection_counts[1] = 0 then
    return -1;
  end if;

  foreach v_selection_count in array v_selection_counts loop
    exit when v_selection_count = 0;
    v_branch_count := v_branch_count * v_selection_count;
    v_expected_count := v_expected_count + v_branch_count;
    if v_expected_count > v_limit then
      return -3;
    end if;
  end loop;

  select count(*) into v_existing
  from public.wbs_nodes
  where project_id = p_project_id and status = 'active';

  if v_existing > 0 then
    return -2;
  end if;

  for v_phase in
    select id, phase_code as code, phase_name as name, sequence_no as sort_order
    from public.phase_master
    where is_active = true
      and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'phase_ids', '[]'::jsonb)))
    order by sequence_no, phase_code
  loop
    v_phase_code := upper(v_phase.code);
    insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
    values (p_project_id, null, 'phase', v_phase_code, v_phase.name, v_phase.sort_order, 'active')
    returning id into v_phase_id;
    v_count := v_count + 1;

    for v_building in
      select id, building_code as code, building_name as name, row_number() over (order by building_code) as sort_order
      from public.building_master
      where is_active = true
        and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'building_ids', '[]'::jsonb)))
      order by building_code
    loop
      v_building_code := v_phase_code || '-' || upper(v_building.code);
      insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
      values (p_project_id, v_phase_id, 'building', v_building_code, v_building.name, v_building.sort_order, 'active')
      returning id into v_building_id;
      v_count := v_count + 1;

      for v_level in
        select id, level_code as code, level_name as name, sort_order
        from public.level_master
        where is_active = true
          and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'level_ids', '[]'::jsonb)))
        order by sort_order, level_code
      loop
        v_level_code := v_building_code || '-' || upper(v_level.code);
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (p_project_id, v_building_id, 'level', v_level_code, v_level.name, v_level.sort_order, 'active')
        returning id into v_level_id;
        v_count := v_count + 1;

        for v_zone in
          select id, zone_code as code, zone_name as name, row_number() over (order by zone_code) as sort_order
          from public.zone_master
          where is_active = true
            and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'zone_ids', '[]'::jsonb)))
          order by zone_code
        loop
          v_zone_code := v_level_code || '-' || upper(v_zone.code);
          insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
          values (p_project_id, v_level_id, 'zone', v_zone_code, v_zone.name, v_zone.sort_order, 'active')
          returning id into v_zone_id;
          v_count := v_count + 1;

          for v_room in
            select id, room_code as code, room_name as name, row_number() over (order by room_code) as sort_order
            from public.room_master
            where is_active = true
              and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'room_ids', '[]'::jsonb)))
            order by room_code
          loop
            v_room_code := v_zone_code || '-' || upper(v_room.code);
            insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
            values (p_project_id, v_zone_id, 'room', v_room_code, v_room.name, v_room.sort_order, 'active')
            returning id into v_room_id;
            v_count := v_count + 1;

            for v_element in
              select id, element_code as code, element_name as name, row_number() over (order by element_code) as sort_order
              from public.element_master
              where is_active = true
                and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'element_ids', '[]'::jsonb)))
              order by element_code
            loop
              v_element_code := v_room_code || '-' || upper(v_element.code);
              insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
              values (p_project_id, v_room_id, 'element', v_element_code, v_element.name, v_element.sort_order, 'active')
              returning id into v_element_id;
              v_count := v_count + 1;

              for v_discipline in
                select id, discipline_code as code, discipline_name as name, sequence_no as sort_order
                from public.discipline_master
                where is_active = true
                  and id in (select value::uuid from jsonb_array_elements_text(coalesce(p_selections->'discipline_ids', '[]'::jsonb)))
                order by sequence_no, discipline_code
              loop
                v_discipline_code := v_element_code || '-' || upper(v_discipline.code);
                insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
                values (p_project_id, v_element_id, 'discipline', v_discipline_code, v_discipline.name, v_discipline.sort_order, 'active')
                returning id into v_discipline_id;
                v_count := v_count + 1;

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
                    v_discipline_id,
                    'task_group',
                    v_discipline_code || '-' || upper(v_task_group.code),
                    v_task_group.name,
                    v_task_group.sort_order,
                    'active'
                  );
                  v_count := v_count + 1;
                end loop;
              end loop;
            end loop;
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;

  update public.projects
     set updated_at = now()
   where id = p_project_id;

  return v_count;
end;
$$;
