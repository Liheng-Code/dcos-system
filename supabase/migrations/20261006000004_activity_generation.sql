-- Activity Library — Phase 2: schedule generation runs, generated-item audit, planner overrides.
-- Project Activity = existing wbs_tasks (extended with provenance columns). A generation run is an immutable
-- record of what was generated, from which library versions; re-running creates a new run.
-- Depends on 20261006000001-3.

-- 1. Provenance on wbs_tasks
alter table public.wbs_tasks
  add column if not exists activity_master_id uuid references public.plan_act_masters(id) on delete set null,
  add column if not exists activity_method_id uuid references public.plan_act_methods(id) on delete set null,
  add column if not exists generation_run_id uuid,
  add column if not exists generation_confidence text check (generation_confidence in ('high','review','low'));
create index if not exists idx_wbs_tasks_activity_master on public.wbs_tasks(activity_master_id);
create index if not exists idx_wbs_tasks_generation_run on public.wbs_tasks(generation_run_id);

-- 2. Runs
create sequence if not exists public.plan_act_run_seq;

create table if not exists public.plan_act_generation_runs (
  id uuid primary key default gen_random_uuid(),
  run_no text not null unique default (to_char(now(), 'YYYY') || '-' || lpad(nextval('public.plan_act_run_seq')::text, 5, '0')),
  project_id uuid not null references public.projects(id) on delete cascade,
  template_id uuid not null references public.plan_act_templates(id) on delete restrict,
  template_version integer not null,
  scope_node_ids uuid[] not null default '{}',
  engine_version text not null,
  quantity_priority text[] not null default '{}',
  project_attributes jsonb not null default '{}'::jsonb,
  library_snapshot jsonb not null default '{}'::jsonb,   -- master/method/norm ids+versions used
  total_count integer not null default 0,
  high_count integer not null default 0,
  review_count integer not null default 0,
  low_count integer not null default 0,
  warning_count integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_act_runs_project on public.plan_act_generation_runs(project_id, created_at desc);
create index if not exists idx_plan_act_runs_template on public.plan_act_generation_runs(template_id);

alter table public.wbs_tasks
  drop constraint if exists wbs_tasks_generation_run_id_fkey;
alter table public.wbs_tasks
  add constraint wbs_tasks_generation_run_id_fkey foreign key (generation_run_id)
  references public.plan_act_generation_runs(id) on delete set null;

-- 3. Items: one per generated task (the planner's review queue)
create table if not exists public.plan_act_generation_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.plan_act_generation_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid references public.wbs_tasks(id) on delete set null,
  node_id uuid references public.wbs_nodes(id) on delete set null,
  template_item_id uuid references public.plan_act_template_items(id) on delete set null,
  master_id uuid references public.plan_act_masters(id) on delete set null,
  method_id uuid references public.plan_act_methods(id) on delete set null,
  norm_id uuid references public.plan_productivity_norms(id) on delete set null,
  confidence text not null check (confidence in ('high','review','low')),
  reasons text[] not null default '{}',
  quantity numeric,
  unit text,
  quantity_source text,
  base_rate numeric,
  adjusted_rate numeric,
  raw_days numeric,
  duration_days numeric,
  review_status text not null default 'pending' check (review_status in ('pending','accepted','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_act_items_run on public.plan_act_generation_items(run_id, confidence);
create index if not exists idx_plan_act_items_task on public.plan_act_generation_items(task_id);
create index if not exists idx_plan_act_items_project on public.plan_act_generation_items(project_id);

-- 4. Overrides: append-only audit of planner changes to generated values
create table if not exists public.plan_act_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid references public.plan_act_generation_items(id) on delete set null,
  task_id uuid references public.wbs_tasks(id) on delete set null,
  field text not null,
  old_value text,
  new_value text,
  reason text not null check (length(btrim(reason)) > 0),
  source text not null default 'planner' check (source in ('planner','ai_accepted','system')),
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index if not exists idx_plan_act_overrides_task on public.plan_act_overrides(task_id, changed_at desc);
create index if not exists idx_plan_act_overrides_project on public.plan_act_overrides(project_id);

-- 5. RLS: project members read; writes need planning/schedule edit (checked inside the RPC and by policy)
alter table public.plan_act_generation_runs enable row level security;
alter table public.plan_act_generation_items enable row level security;
alter table public.plan_act_overrides enable row level security;

drop policy if exists plan_act_runs_select on public.plan_act_generation_runs;
create policy plan_act_runs_select on public.plan_act_generation_runs for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists plan_act_runs_insert on public.plan_act_generation_runs;
create policy plan_act_runs_insert on public.plan_act_generation_runs for insert to authenticated
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));

drop policy if exists plan_act_items_select on public.plan_act_generation_items;
create policy plan_act_items_select on public.plan_act_generation_items for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists plan_act_items_insert on public.plan_act_generation_items;
create policy plan_act_items_insert on public.plan_act_generation_items for insert to authenticated
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));
drop policy if exists plan_act_items_update on public.plan_act_generation_items;
create policy plan_act_items_update on public.plan_act_generation_items for update to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'))
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));

drop policy if exists plan_act_overrides_select on public.plan_act_overrides;
create policy plan_act_overrides_select on public.plan_act_overrides for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists plan_act_overrides_insert on public.plan_act_overrides;
create policy plan_act_overrides_insert on public.plan_act_overrides for insert to authenticated
  with check (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'));
-- no update/delete policies on runs or overrides: history is never rewritten

-- 6. Atomic commit: run + tasks + items in one transaction (SECURITY INVOKER: RLS applies to the caller).
-- Payload built by lib/planning/activity-library/generation-planner.ts.
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

  return v_run;
end $$;
