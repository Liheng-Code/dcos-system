-- Migration: 20261020000006_template_item_crews.sql
-- Purpose: Default crews per Activity Template item (doc 21, after Phase 3).
--          Generated durations were for one crew, so a typical floor cycle came out at ~45 working days.
--          A template item now says how many parallel crews (gangs) it plans with; generation divides the
--          duration by it and writes it into Task Work, so work-hours, crew size and labour loading agree
--          with the schedule. Planners still change crews per activity in Task Work.
--   1. plan_act_template_items.crews, plan_act_generation_items.crews (default 1).
--   2. plan_act_commit_generation: stores items.crews (body otherwise as in 20261006000008).
--   3. plan_act_link_run_work: writes plan_task_work.crews (body otherwise as in 20261006000006).
-- Depends on: 20261006000004, 20261006000006, 20261006000008 (activity generation).

alter table public.plan_act_template_items
  add column if not exists crews numeric not null default 1;
alter table public.plan_act_generation_items
  add column if not exists crews numeric not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_act_template_items_crews_chk') then
    alter table public.plan_act_template_items
      add constraint plan_act_template_items_crews_chk check (crews > 0 and crews <= 50);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plan_act_generation_items_crews_chk') then
    alter table public.plan_act_generation_items
      add constraint plan_act_generation_items_crews_chk check (crews > 0 and crews <= 50);
  end if;
end $$;

comment on column public.plan_act_template_items.crews is
  'Parallel crews (gangs) this activity is planned with by default. Generated duration = quantity / (output per crew-day x crews). Written to plan_task_work.crews on commit.';
comment on column public.plan_act_generation_items.crews is
  'Crews the generated duration was calculated with (from the template item).';

create or replace function public.plan_act_commit_generation(p_payload jsonb)
returns uuid
language plpgsql
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
      confidence, reasons, quantity, unit, quantity_source, quantity_ref, base_rate, adjusted_rate, raw_days, duration_days, crews)
  select v_run, v_project, i.task_id, i.node_id, i.template_item_id, i.master_id, i.method_id, i.norm_id,
      i.confidence, coalesce(array(select jsonb_array_elements_text(i.reasons)), '{}'),
      i.quantity, i.unit, i.quantity_source, i.quantity_ref, i.base_rate, i.adjusted_rate, i.raw_days, i.duration_days,
      coalesce(i.crews, 1)
  from jsonb_to_recordset(p_payload->'items') as i(
      task_id uuid, node_id uuid, template_item_id uuid, master_id uuid, method_id uuid, norm_id uuid,
      confidence text, reasons jsonb, quantity numeric, unit text, quantity_source text, quantity_ref text,
      base_rate numeric, adjusted_rate numeric, raw_days numeric, duration_days numeric, crews numeric);

  perform plan_act_link_run_work(v_run);

  return v_run;
end $$;

create or replace function public.plan_act_link_run_work(p_run_id uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare v_n integer := 0;
begin
  if not public.has_permission('planning', 'task_work', 'can_create') then
    return 0;
  end if;
  insert into plan_task_work(task_id, project_id, quantity, quantity_unit, quantity_source, norm_id, crews)
  select i.task_id, i.project_id, i.quantity, i.unit,
         case i.quantity_source when 'manual' then 'manual' else 'import' end, i.norm_id, coalesce(i.crews, 1)
  from plan_act_generation_items i
  where i.run_id = p_run_id and i.task_id is not null and i.quantity is not null and i.norm_id is not null
  on conflict (task_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
