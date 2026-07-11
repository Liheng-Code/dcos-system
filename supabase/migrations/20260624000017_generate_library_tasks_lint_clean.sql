-- Keep library task generation behavior from 20260624000016, but avoid the
-- plpgsql lint warning caused by a declared variable shadowing the FOR index.

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
  v_steps jsonb := '[
    {"ids_key":"phase_ids","node_type":"phase","table_name":"phase_master","code_col":"phase_code","name_col":"phase_name","sort_expr":"sequence_no","order_expr":"sequence_no, phase_code"},
    {"ids_key":"building_ids","node_type":"building","table_name":"building_master","code_col":"building_code","name_col":"building_name","sort_expr":"row_number() over (order by building_code)","order_expr":"building_code"},
    {"ids_key":"level_ids","node_type":"level","table_name":"level_master","code_col":"level_code","name_col":"level_name","sort_expr":"sort_order","order_expr":"sort_order, level_code"},
    {"ids_key":"zone_ids","node_type":"zone","table_name":"zone_master","code_col":"zone_code","name_col":"zone_name","sort_expr":"row_number() over (order by zone_code)","order_expr":"zone_code"},
    {"ids_key":"room_ids","node_type":"room","table_name":"room_master","code_col":"room_code","name_col":"room_name","sort_expr":"row_number() over (order by room_code)","order_expr":"room_code"},
    {"ids_key":"element_ids","node_type":"element","table_name":"element_master","code_col":"element_code","name_col":"element_name","sort_expr":"row_number() over (order by element_code)","order_expr":"element_code"},
    {"ids_key":"discipline_ids","node_type":"discipline","table_name":"discipline_master","code_col":"discipline_code","name_col":"discipline_name","sort_expr":"sequence_no","order_expr":"sequence_no, discipline_code"},
    {"ids_key":"task_group_ids","node_type":"task_group","table_name":"task_group_master","code_col":"task_group_code","name_col":"task_group_name","sort_expr":"row_number() over (order by task_group_code)","order_expr":"task_group_code"}
  ]'::jsonb;
  v_step jsonb;
  v_ids jsonb;
  v_task_template_ids jsonb := coalesce(p_selections->>'task_template_ids', '[]')::jsonb;
  v_has_selection boolean := false;
  v_count int := 0;
  v_current_parent_ids uuid[];
  v_next_parent_ids uuid[];
  v_parent_id uuid;
  v_parent_pos int := 1;
  v_item_code text;
  v_item_name text;
  v_item_sort_order int;
  v_next_parent_id uuid;
  v_task_target_ids uuid[];
  v_task_target_id uuid;
  v_task_template record;
  v_task_code text;
  v_task_counter int;
begin
  for v_step in select value from jsonb_array_elements(v_steps) loop
    if jsonb_array_length(coalesce(p_selections->>(v_step->>'ids_key'), '[]')::jsonb) > 0 then
      v_has_selection := true;
      exit;
    end if;
  end loop;

  if not v_has_selection and jsonb_array_length(v_task_template_ids) > 0 then
    v_has_selection := true;
  end if;

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

  v_current_parent_ids := array[p_target_node_id]::uuid[];

  for v_step in select value from jsonb_array_elements(v_steps) loop
    v_ids := coalesce(p_selections->>(v_step->>'ids_key'), '[]')::jsonb;
    if jsonb_array_length(v_ids) = 0 then
      continue;
    end if;

    v_next_parent_ids := array[]::uuid[];
    v_parent_pos := 1;

    while v_parent_pos <= coalesce(array_length(v_current_parent_ids, 1), 0) loop
      v_parent_id := v_current_parent_ids[v_parent_pos];

      for v_item_code, v_item_name, v_item_sort_order in execute format(
        'select %1$I as code, %2$I as name, %3$s as sort_order
           from public.%4$I
          where is_active = true
            and id in (select value::uuid from jsonb_array_elements_text($1))
          order by %5$s',
        v_step->>'code_col',
        v_step->>'name_col',
        v_step->>'sort_expr',
        v_step->>'table_name',
        v_step->>'order_expr'
      ) using v_ids loop
        insert into public.wbs_nodes (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status)
        values (
          p_project_id,
          v_parent_id,
          v_step->>'node_type',
          upper(v_item_code),
          v_item_name,
          v_item_sort_order,
          'active'
        )
        returning id into v_next_parent_id;

        v_next_parent_ids := array_append(v_next_parent_ids, v_next_parent_id);
        v_count := v_count + 1;
      end loop;

      v_parent_pos := v_parent_pos + 1;
    end loop;

    v_current_parent_ids := v_next_parent_ids;
  end loop;

  if jsonb_array_length(v_task_template_ids) > 0 then
    v_task_target_ids := array_remove(v_current_parent_ids, null);

    if coalesce(array_length(v_task_target_ids, 1), 0) = 0 then
      if p_target_node_id is null then
        raise exception 'Select at least one WBS library item or choose an existing target node before generating task templates.';
      end if;
      v_task_target_ids := array[p_target_node_id]::uuid[];
    end if;

    foreach v_task_target_id in array v_task_target_ids loop
      for v_task_template in
        select
          t.template_code,
          t.task_name,
          t.description,
          t.default_priority,
          t.category,
          t.default_duration,
          t.default_weight,
          t.predecessor,
          t.milestone,
          t.requires_document,
          t.requires_photo,
          t.requires_inspection,
          d.discipline_code
        from public.task_template_master t
        left join public.discipline_master d on d.id = t.discipline_id
        where t.is_active = true
          and t.id in (select value::uuid from jsonb_array_elements_text(v_task_template_ids))
        order by t.template_code
      loop
        v_task_code := upper(v_task_template.template_code);
        v_task_counter := 1;

        while exists (
          select 1 from public.wbs_tasks
           where project_id = p_project_id
             and task_code = v_task_code
        ) loop
          v_task_counter := v_task_counter + 1;
          v_task_code := upper(v_task_template.template_code) || '-' || lpad(v_task_counter::text, 3, '0');
        end loop;

        insert into public.wbs_tasks (
          wbs_node_id,
          project_id,
          task_code,
          task_name,
          description,
          status,
          priority,
          discipline,
          dependency_text,
          docs_count,
          photos_count,
          qa_status,
          budget_cost,
          planned_hours,
          sort_order,
          task_type,
          category,
          is_milestone,
          schedule_level
        )
        values (
          v_task_target_id,
          p_project_id,
          v_task_code,
          v_task_template.task_name,
          v_task_template.description,
          'open',
          coalesce(v_task_template.default_priority, 'medium'),
          v_task_template.discipline_code,
          v_task_template.predecessor,
          case when v_task_template.requires_document then 1 else 0 end,
          case when v_task_template.requires_photo then 1 else 0 end,
          case when v_task_template.requires_inspection then 'pending' else 'not_required' end,
          v_task_template.default_weight,
          v_task_template.default_duration * 8,
          v_task_counter,
          lower(regexp_replace(coalesce(v_task_template.category, 'construction tasks'), '\s+tasks$', '', 'i')),
          lower(regexp_replace(coalesce(v_task_template.category, 'construction tasks'), '\s+', '_', 'g')),
          coalesce(v_task_template.milestone, false),
          3
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
