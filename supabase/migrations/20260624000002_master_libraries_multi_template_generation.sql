-- Multi-template Master Library WBS generation.
-- Generates one phase and one building branch per selected WBS template.

create or replace function public.generate_wbs_from_master_templates(
  p_project_id uuid,
  p_template_ids uuid[],
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
  v_template_id uuid;
  v_template record;
  v_template_index int := 0;
  v_basements int := greatest(0, least(9, coalesce((p_variables->>'basement_count')::int, 1)));
  v_floors int := greatest(1, least(200, coalesce((p_variables->>'floor_count')::int, 3)));
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
  v_building_code text;
  v_building_name text;
  v_elements jsonb := coalesce(p_variables->'elements', '[{"code":"STR","name":"Structural Works"},{"code":"ARC","name":"Architectural Works"},{"code":"MEP","name":"M&E Works"}]'::jsonb);
  v_disciplines jsonb := coalesce(p_variables->'disciplines', '[{"code":"CON","name":"Construction"},{"code":"QAQC","name":"QAQC"}]'::jsonb);
  v_task_groups jsonb := coalesce(p_variables->'task_groups', '[{"code":"TG-CON","name":"Construction"},{"code":"TG-INS","name":"Inspection"}]'::jsonb);
  v_item jsonb;
  v_disc jsonb;
  v_tg jsonb;
begin
  if p_template_ids is null or array_length(p_template_ids, 1) is null then
    raise exception 'Select at least one template.';
  end if;

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

  foreach v_template_id in array p_template_ids loop
    select id, template_name, template_category
      into v_template
      from public.wbs_templates
     where id = v_template_id and is_active = true;

    if v_template.id is null then
      raise exception 'Template % was not found or is inactive.', v_template_id;
    end if;

    v_template_index := v_template_index + 1;
    v_building_code := 'LIB-' || lpad(v_template_index::text, 2, '0');
    v_building_name := v_template.template_name;

    insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
    values (p_project_id, v_phase_id, 'building', v_building_code, v_building_name, v_template_index, 'active')
    returning id into v_building_id;
    v_count := v_count + 1;

    for v_floor_no in 1..(v_basements + v_floors) loop
      if v_floor_no <= v_basements then
        v_level_code := v_building_code || '-B' || (v_basements - v_floor_no + 1)::text;
        v_level_name := 'Basement Level ' || (v_basements - v_floor_no + 1)::text;
      elsif v_floor_no = v_basements + 1 then
        v_level_code := v_building_code || '-L01';
        v_level_name := 'Level 01';
      else
        v_level_code := v_building_code || '-L' || lpad((v_floor_no - v_basements)::text, 2, '0');
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
  end loop;

  update public.projects
     set wbs_template_id = p_template_ids[1],
         updated_at = now()
   where id = p_project_id;

  return v_count;
end;
$$;
