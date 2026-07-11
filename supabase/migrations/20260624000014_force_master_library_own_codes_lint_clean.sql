-- Final Master Library generator implementation: own-code-only and no temp
-- tables, so schema lint does not report missing temp relations.

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
  v_has_selection boolean := false;
  v_count int := 0;
  v_current_parent_ids uuid[];
  v_next_parent_ids uuid[];
  v_parent_id uuid;
  v_item_code text;
  v_item_name text;
  v_item_sort_order int;
  v_next_parent_id uuid;
begin
  for v_step in select value from jsonb_array_elements(v_steps) loop
    if jsonb_array_length(coalesce(p_selections->>(v_step->>'ids_key'), '[]')::jsonb) > 0 then
      v_has_selection := true;
      exit;
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

  v_current_parent_ids := array[p_target_node_id]::uuid[];

  for v_step in select value from jsonb_array_elements(v_steps) loop
    v_ids := coalesce(p_selections->>(v_step->>'ids_key'), '[]')::jsonb;
    if jsonb_array_length(v_ids) = 0 then
      continue;
    end if;

    v_next_parent_ids := array[]::uuid[];

    for v_parent_idx in 1..coalesce(array_length(v_current_parent_ids, 1), 0) loop
      v_parent_id := v_current_parent_ids[v_parent_idx];

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
    end loop;

    v_current_parent_ids := v_next_parent_ids;
  end loop;

  update public.projects
     set updated_at = now()
   where id = p_project_id;

  return v_count;
end;
$$;
