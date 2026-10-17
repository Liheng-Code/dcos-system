-- Activity Library - Phase 3.2: BOQ quantity provider.
--   * plan_act_quantity_links: a planner-confirmed link between a BOQ line (project BOQ or tender BOQ) and a metric of a WBS
--     node. 'factor' is the share of the line that belongs to that node, because BOQ lines often cover several levels
--     ("Concrete to slabs, L1-L10"). The provider sums line quantity x factor, so every generated quantity is traceable.
--   * plan_act_generation_items.quantity_ref: human-readable reference of where the quantity came from (e.g. BOQ item no).
--   * plan_act_commit_generation now stores quantity_ref.
-- Depends on 20261006000004-6.

create table if not exists public.plan_act_quantity_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  wbs_node_id uuid not null references public.wbs_nodes(id) on delete cascade,
  metric_code text not null,
  boq_source text not null check (boq_source in ('qs_boq', 'tender_boq')),
  boq_item_id uuid not null,
  boq_item_ref text,
  boq_description text,
  boq_unit text,
  boq_quantity_at_link numeric,
  factor numeric not null default 1 check (factor > 0 and factor <= 10),
  note text,
  confirmed_by uuid default auth.uid(),
  confirmed_at timestamptz not null default now(),
  unique (wbs_node_id, metric_code, boq_source, boq_item_id)
);
create index if not exists idx_plan_act_qlinks_project on public.plan_act_quantity_links(project_id);
create index if not exists idx_plan_act_qlinks_node on public.plan_act_quantity_links(wbs_node_id, metric_code);
create index if not exists idx_plan_act_qlinks_item on public.plan_act_quantity_links(boq_source, boq_item_id);

alter table public.plan_act_quantity_links enable row level security;
drop policy if exists plan_act_qlinks_select on public.plan_act_quantity_links;
create policy plan_act_qlinks_select on public.plan_act_quantity_links for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists plan_act_qlinks_write on public.plan_act_quantity_links;
create policy plan_act_qlinks_write on public.plan_act_quantity_links for all to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'))
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));

alter table public.plan_act_generation_items add column if not exists quantity_ref text;

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
      confidence, reasons, quantity, unit, quantity_source, quantity_ref, base_rate, adjusted_rate, raw_days, duration_days)
  select v_run, v_project, i.task_id, i.node_id, i.template_item_id, i.master_id, i.method_id, i.norm_id,
      i.confidence, coalesce(array(select jsonb_array_elements_text(i.reasons)), '{}'),
      i.quantity, i.unit, i.quantity_source, i.quantity_ref, i.base_rate, i.adjusted_rate, i.raw_days, i.duration_days
  from jsonb_to_recordset(p_payload->'items') as i(
      task_id uuid, node_id uuid, template_item_id uuid, master_id uuid, method_id uuid, norm_id uuid,
      confidence text, reasons jsonb, quantity numeric, unit text, quantity_source text, quantity_ref text,
      base_rate numeric, adjusted_rate numeric, raw_days numeric, duration_days numeric);

  perform plan_act_link_run_work(v_run);

  return v_run;
end $$;
