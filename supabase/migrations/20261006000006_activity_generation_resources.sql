-- Activity Library — hand generated activities to the existing productivity/resource pipeline.
--   * plan_task_work (quantity + norm) is what the existing engine turns into crews, hours and planned cost, and what
--     plan_generate_resource_loading turns into labour assignments. The commit RPC now writes it for every generated
--     task that has a quantity and a productivity standard.
--   * Equipment/subcontract lines of the standard (not optional ones) are assigned by plan_act_generate_resources
--     with assignment source 'library' (the labour generator only deletes source 'norm', so the two never collide).
-- Depends on 20261006000004; replaces plan_act_commit_generation.

alter table public.plan_task_assignments drop constraint if exists plan_task_assignments_source_check;
alter table public.plan_task_assignments
  add constraint plan_task_assignments_source_check check (source in ('manual','norm','library'));

-- 1. quantity + norm -> plan_task_work for one run (skipped silently without the task_work create permission)
create or replace function public.plan_act_link_run_work(p_run_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_n integer := 0;
begin
  if not public.has_permission('planning', 'task_work', 'can_create') then
    return 0;
  end if;
  insert into plan_task_work(task_id, project_id, quantity, quantity_unit, quantity_source, norm_id)
  select i.task_id, i.project_id, i.quantity, i.unit,
         case i.quantity_source when 'manual' then 'manual' else 'import' end, i.norm_id
  from plan_act_generation_items i
  where i.run_id = p_run_id and i.task_id is not null and i.quantity is not null and i.norm_id is not null
  on conflict (task_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 2. equipment / subcontract assignments from the standard
create or replace function public.plan_act_generate_resources(p_run_id uuid)
returns table(resources_created integer, assignments_written integer, assignments_removed integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_project uuid;
  v_created integer := 0;
  v_written integer := 0;
  v_removed integer := 0;
begin
  select project_id into v_project from plan_act_generation_runs where id = p_run_id;
  if v_project is null then raise exception 'Generation run not found'; end if;
  if not public.has_permission('planning', 'resources', 'edit') then
    raise exception 'Assigning resources requires planning/resources edit permission';
  end if;

  create temp table _lib_demand on commit drop as
  select i.task_id, nr.role_label, nr.workers_per_crew,
         case nr.kind when 'subcontract' then 'subcontractor' else 'equipment' end as rtype
  from plan_act_generation_items i
  join plan_productivity_norm_resources nr on nr.norm_id = i.norm_id
  where i.run_id = p_run_id and i.task_id is not null
    and nr.kind in ('equipment', 'subcontract') and not nr.is_optional;

  with ins as (
    insert into plan_resources(project_id, name, resource_type, max_units, unit_label)
    select distinct v_project, d.role_label || ' - from library', d.rtype, 100, 'unit'
    from _lib_demand d
    where not exists (select 1 from plan_resources r where r.project_id = v_project and r.name = d.role_label || ' - from library')
    returning 1
  ) select count(*) into v_created from ins;

  with del as (
    delete from plan_task_assignments a using _lib_demand d
    where a.task_id = d.task_id and a.source = 'library' returning 1
  ) select count(*) into v_removed from del;

  with w as (
    insert into plan_task_assignments(task_id, resource_id, allocation_percent, source, generated_at)
    select d.task_id, r.id, max(d.workers_per_crew) * 100, 'library', now()
    from _lib_demand d
    join plan_resources r on r.project_id = v_project and r.name = d.role_label || ' - from library'
    group by d.task_id, r.id
    on conflict (task_id, resource_id) do nothing
    returning 1
  ) select count(*) into v_written from w;

  return query select v_created, v_written, v_removed;
end $$;

-- 3. commit RPC: same as 20261006000004 plus plan_act_link_run_work at the end
create or replace function public.plan_act_commit_generation(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run uuid;
  v_project uuid := (p_payload->>'project_id')::uuid;
begin
  if not public.has_permission('planning', 'schedule', 'edit') then
    raise exception 'Generating activities requires planning/schedule edit permission';
  end if;

  insert into plan_act_generation_runs(project_id, template_id, template_version, scope_node_ids, engine_version,
      quantity_priority, project_attributes, library_snapshot, total_count, high_count, review_count, low_count, warning_count)
  values (v_project, (p_payload->>'template_id')::uuid, (p_payload->>'template_version')::int,
      coalesce(array(select jsonb_array_elements_text(p_payload->'scope_node_ids'))::uuid[], '{}'),
      p_payload->>'engine_version',
      coalesce(array(select jsonb_array_elements_text(p_payload->'quantity_priority')), '{}'),
      coalesce(p_payload->'project_attributes', '{}'::jsonb), coalesce(p_payload->'library_snapshot', '{}'::jsonb),
      (p_payload->>'total_count')::int, (p_payload->>'high_count')::int, (p_payload->>'review_count')::int,
      (p_payload->>'low_count')::int, coalesce((p_payload->>'warning_count')::int, 0))
  returning id into v_run;

  insert into wbs_tasks(id, wbs_node_id, project_id, task_code, task_name, task_type, activity_type, is_milestone,
      discipline, duration_days, duration_unit, sort_order, schedule_level,
      dependency_task_ids, dependency_types, dependency_lag_days,
      activity_master_id, activity_method_id, generation_run_id, generation_confidence)
  select t.id, t.wbs_node_id, v_project, t.task_code, t.task_name, 'activity', 'normal', coalesce(t.is_milestone, false),
      t.discipline, t.duration_days, 'wd', coalesce(t.sort_order, 0), t.schedule_level,
      coalesce(array(select jsonb_array_elements_text(t.dependency_task_ids))::uuid[], '{}'),
      coalesce(array(select jsonb_array_elements_text(t.dependency_types)), '{}'),
      coalesce(array(select jsonb_array_elements_text(t.dependency_lag_days))::numeric[], '{}'),
      t.activity_master_id, t.activity_method_id, v_run, t.confidence
  from jsonb_to_recordset(p_payload->'tasks') as t(
      id uuid, wbs_node_id uuid, task_code text, task_name text, is_milestone boolean, discipline text,
      duration_days numeric, sort_order bigint, schedule_level int,
      dependency_task_ids jsonb, dependency_types jsonb, dependency_lag_days jsonb,
      activity_master_id uuid, activity_method_id uuid, confidence text);

  insert into plan_act_generation_items(run_id, project_id, task_id, node_id, template_item_id, master_id, method_id, norm_id,
      confidence, reasons, quantity, unit, quantity_source, base_rate, adjusted_rate, raw_days, duration_days)
  select v_run, v_project, i.task_id, i.node_id, i.template_item_id, i.master_id, i.method_id, i.norm_id,
      i.confidence, coalesce(array(select jsonb_array_elements_text(i.reasons)), '{}'),
      i.quantity, i.unit, i.quantity_source, i.base_rate, i.adjusted_rate, i.raw_days, i.duration_days
  from jsonb_to_recordset(p_payload->'items') as i(
      task_id uuid, node_id uuid, template_item_id uuid, master_id uuid, method_id uuid, norm_id uuid,
      confidence text, reasons jsonb, quantity numeric, unit text, quantity_source text,
      base_rate numeric, adjusted_rate numeric, raw_days numeric, duration_days numeric);

  perform plan_act_link_run_work(v_run);

  return v_run;
end $$;
