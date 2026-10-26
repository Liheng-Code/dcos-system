-- Migration: 20261026155000_boq_programme_phase2.sql
-- Purpose: BOQ-driven programme generator (doc 24, Phase 2), DB part:
--          task <-> BOQ line links, per-task resource hours, BOQ generation runs, commit RPC.
-- Depends on: wbs_tasks, wbs_nodes, tender_boq_items, qs_boq_items, dwl_resources,
--             plan_act_generation_runs, plan_task_work, is_project_member(), has_permission(),
--             wbs_node_effectively_locked(), is_wbs_manager()
-- Additive only. One compatible relaxation: plan_act_generation_runs.source_chk now also accepts
-- source = 'boq' (a BOQ run has neither template_id nor kit_id).

-- 1. plan_act_generation_runs: source + boq_source ---------------------------------
alter table public.plan_act_generation_runs add column if not exists source text default 'template';
alter table public.plan_act_generation_runs add column if not exists boq_source text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plan_act_generation_runs_source_values_chk') then
    alter table public.plan_act_generation_runs add constraint plan_act_generation_runs_source_values_chk
      check (source is null or source in ('template', 'kit', 'boq'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plan_act_generation_runs_boq_source_chk') then
    alter table public.plan_act_generation_runs add constraint plan_act_generation_runs_boq_source_chk
      check (boq_source is null or boq_source in ('tender', 'contract'));
  end if;
  -- relax template_id/kit_id requirement for BOQ runs
  if exists (select 1 from pg_constraint where conname = 'plan_act_generation_runs_source_chk') then
    alter table public.plan_act_generation_runs drop constraint plan_act_generation_runs_source_chk;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plan_act_generation_runs_origin_chk') then
    alter table public.plan_act_generation_runs add constraint plan_act_generation_runs_origin_chk
      check (source = 'boq' or template_id is not null or kit_id is not null);
  end if;
end $$;

-- 2. plan_task_boq_lines -------------------------------------------------------------
create table if not exists public.plan_task_boq_lines (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  task_id            uuid not null references public.wbs_tasks(id) on delete cascade,
  tender_boq_item_id uuid references public.tender_boq_items(id) on delete cascade,
  qs_boq_item_id     uuid references public.qs_boq_items(id) on delete cascade,
  share_pct          numeric not null,
  quantity           numeric not null,
  amount             numeric not null default 0,
  run_id             uuid references public.plan_act_generation_runs(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint plan_task_boq_lines_one_item_chk
    check ((tender_boq_item_id is not null)::int + (qs_boq_item_id is not null)::int = 1)
);
create unique index if not exists uq_plan_task_boq_lines_task_item
  on public.plan_task_boq_lines(task_id, coalesce(tender_boq_item_id, qs_boq_item_id));
create index if not exists idx_plan_task_boq_lines_task on public.plan_task_boq_lines(task_id);
create index if not exists idx_plan_task_boq_lines_qs_item on public.plan_task_boq_lines(qs_boq_item_id);
create index if not exists idx_plan_task_boq_lines_tender_item on public.plan_task_boq_lines(tender_boq_item_id);
create index if not exists idx_plan_task_boq_lines_project on public.plan_task_boq_lines(project_id);

-- 3. plan_task_resource_hours ---------------------------------------------------------
create table if not exists public.plan_task_resource_hours (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  task_id         uuid not null references public.wbs_tasks(id) on delete cascade,
  dwl_resource_id uuid not null references public.dwl_resources(id),
  kind            text not null,
  hours           numeric not null,
  source          text default 'boq',
  run_id          uuid references public.plan_act_generation_runs(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint plan_task_resource_hours_kind_chk check (kind in ('labor', 'equipment')),
  constraint plan_task_resource_hours_hours_chk check (hours >= 0),
  constraint plan_task_resource_hours_task_resource_key unique (task_id, dwl_resource_id)
);
create index if not exists idx_plan_task_resource_hours_task on public.plan_task_resource_hours(task_id);
create index if not exists idx_plan_task_resource_hours_resource on public.plan_task_resource_hours(dwl_resource_id);
create index if not exists idx_plan_task_resource_hours_project on public.plan_task_resource_hours(project_id);

-- 4. RLS (project members; planning/schedule view for read, edit for write) -------------------
do $$
declare t text;
begin
  foreach t in array array['plan_task_boq_lines', 'plan_task_resource_hours'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (
      public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'))$p$,
      t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (
      public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'))$p$,
      t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format($p$create policy %I on public.%I for update to authenticated using (
      public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit')
    ) with check (
      public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'))$p$,
      t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using (
      public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'edit'))$p$,
      t || '_delete', t);
  end loop;
end $$;

-- 5. plan_boq_commit_programme ------------------------------------------------------------
-- SECURITY DEFINER because the caller needs to write plan_task_work (task_work permission) and
-- runs/lines/hours with only planning/schedule edit; permissions are checked explicitly.
create or replace function public.plan_boq_commit_programme(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project   uuid := (p ->> 'project_id')::uuid;
  v_source    text := p ->> 'source';
  v_start     date := nullif(p ->> 'project_start', '')::date;
  v_run       uuid;
  v_tasks     jsonb := coalesce(p -> 'tasks', '[]'::jsonb);
  v_ids       jsonb := '{}'::jsonb;        -- key -> task id (all payload tasks)
  v_out       jsonb := '{}'::jsonb;        -- key -> task id (created/updated/skipped)
  v_created int := 0; v_updated int := 0; v_sk_started int := 0; v_sk_locked int := 0; v_cleared int := 0;
  t jsonb; pr jsonb; ln jsonb; rh jsonb;
  v_key text; v_id uuid; v_exist uuid; v_node uuid; v_row public.wbs_tasks%rowtype;
  v_dep_ids uuid[]; v_dep_types text[]; v_dep_lags numeric[]; v_dep_id uuid; v_pkey text; v_ptype text;
  v_code text; v_base text; v_n int; v_mcode text; v_nodecode text; v_sort bigint;
  v_master uuid; v_qty numeric; v_unit text; v_tender uuid; v_qs uuid; v_qsrc text;
  v_nodes uuid[];
begin
  if v_project is null or v_source not in ('tender', 'contract') then
    raise exception 'plan_boq_commit_programme: project_id and source (tender|contract) are required';
  end if;
  if not (public.is_project_member(v_project) and public.has_permission('planning', 'schedule', 'edit')) then
    raise exception 'Committing a BOQ programme requires project membership and planning/schedule edit permission';
  end if;

  if v_start is null then
    select start_date into v_start from public.projects where id = v_project;
  end if;

  select coalesce(array_agg(distinct (x ->> 'wbs_node_id')::uuid), '{}') into v_nodes
    from jsonb_array_elements(v_tasks) x where x ->> 'wbs_node_id' is not null;

  insert into public.plan_act_generation_runs(project_id, source, boq_source, scope_node_ids, engine_version,
        project_attributes, library_snapshot)
  values (v_project, 'boq', v_source, v_nodes, 'boq-programme-1',
        jsonb_build_object('project_start', v_start), '{}'::jsonb)
  returning id into v_run;

  -- pass 1: assign an id to every payload task
  for t in select * from jsonb_array_elements(v_tasks) loop
    v_key := t ->> 'key';
    if v_key is null then raise exception 'every task needs a key'; end if;
    if v_ids ? v_key then raise exception 'duplicate task key %', v_key; end if;
    v_id := coalesce(nullif(t ->> 'existing_task_id', '')::uuid, gen_random_uuid());
    v_ids := v_ids || jsonb_build_object(v_key, v_id);
  end loop;

  -- pass 2: create / update
  for t in select * from jsonb_array_elements(v_tasks) loop
    v_key   := t ->> 'key';
    v_id    := (v_ids ->> v_key)::uuid;
    v_exist := nullif(t ->> 'existing_task_id', '')::uuid;
    v_master := nullif(t ->> 'activity_master_id', '')::uuid;

    if v_exist is not null then
      select * into v_row from public.wbs_tasks where id = v_exist and project_id = v_project;
      if not found then raise exception 'task % does not belong to project', v_exist; end if;
      v_out := v_out || jsonb_build_object(v_key, v_id);
      if coalesce(v_row.progress, 0) > 0 or v_row.actual_start_date is not null or v_row.started_at is not null then
        v_sk_started := v_sk_started + 1; continue;
      end if;
      if public.wbs_node_effectively_locked(v_row.wbs_node_id) and not public.is_wbs_manager() then
        v_sk_locked := v_sk_locked + 1; continue;
      end if;
      update public.wbs_tasks
         set duration_days = coalesce((t ->> 'duration_days')::numeric, duration_days),
             budget_cost = coalesce((t ->> 'budget_cost')::numeric, budget_cost),
             activity_master_id = coalesce(activity_master_id, v_master)
       where id = v_exist;
      v_updated := v_updated + 1;
    else
      v_node := (t ->> 'wbs_node_id')::uuid;
      if not exists (select 1 from public.wbs_nodes where id = v_node and project_id = v_project) then
        raise exception 'wbs node % does not belong to project', v_node;
      end if;
      if public.wbs_node_effectively_locked(v_node) and not public.is_wbs_manager() then
        v_sk_locked := v_sk_locked + 1; v_out := v_out - v_key; continue;
      end if;

      -- dependencies (new tasks only)
      v_dep_ids := '{}'; v_dep_types := '{}'; v_dep_lags := '{}';
      for pr in select * from jsonb_array_elements(coalesce(t -> 'predecessors', '[]'::jsonb)) loop
        v_pkey := nullif(pr ->> 'key', '');
        if v_pkey is not null then
          if not (v_ids ? v_pkey) then raise exception 'unknown predecessor key %', v_pkey; end if;
          v_dep_id := (v_ids ->> v_pkey)::uuid;
        else
          v_dep_id := nullif(pr ->> 'task_id', '')::uuid;
        end if;
        if v_dep_id is null or v_dep_id = v_id then continue; end if;
        v_ptype := lower(coalesce(pr ->> 'type', 'FS'));
        if v_ptype not in ('fs', 'ss', 'ff', 'sf') then raise exception 'bad dependency type %', v_ptype; end if;
        v_dep_ids := v_dep_ids || v_dep_id;
        v_dep_types := v_dep_types || v_ptype;
        v_dep_lags := v_dep_lags || coalesce((pr ->> 'lag_days')::numeric, 0);
      end loop;

      -- task code: <master code>@<node wbs_code>, #n when taken (same scheme as the template engine)
      select coalesce(code, 'BOQ') into v_mcode from public.plan_act_masters where id = v_master;
      select coalesce(wbs_code, left(id::text, 6)) into v_nodecode from public.wbs_nodes where id = v_node;
      v_base := coalesce(v_mcode, 'BOQ') || '@' || v_nodecode;
      v_code := v_base; v_n := 1;
      while exists (select 1 from public.wbs_tasks where project_id = v_project and task_code = v_code) loop
        v_n := v_n + 1; v_code := v_base || '#' || v_n;
      end loop;

      select coalesce(max(sort_order), 0) + 10 into v_sort from public.wbs_tasks where wbs_node_id = v_node;

      insert into public.wbs_tasks(id, wbs_node_id, project_id, task_code, task_name, task_type, activity_type,
            is_milestone, duration_days, duration_unit, sort_order, schedule_level, start_date, budget_cost,
            dependency_task_ids, dependency_types, dependency_lag_days, activity_master_id, generation_run_id)
      values (v_id, v_node, v_project, v_code, coalesce(t ->> 'task_name', v_code), 'activity', 'normal',
            false, (t ->> 'duration_days')::numeric, 'wd', v_sort, 3, v_start, (t ->> 'budget_cost')::numeric,
            v_dep_ids, v_dep_types, v_dep_lags, v_master, v_run);
      v_created := v_created + 1;
      v_out := v_out || jsonb_build_object(v_key, v_id);
    end if;

    -- boq lines (replace)
    delete from public.plan_task_boq_lines where task_id = v_id;
    insert into public.plan_task_boq_lines(project_id, task_id, tender_boq_item_id, qs_boq_item_id,
          share_pct, quantity, amount, run_id)
    select v_project, v_id, x.tender_boq_item_id, x.qs_boq_item_id,
           sum(x.share_pct), sum(x.quantity), sum(coalesce(x.amount, 0)), v_run
      from jsonb_to_recordset(coalesce(t -> 'boq_lines', '[]'::jsonb)) as x(
           tender_boq_item_id uuid, qs_boq_item_id uuid, share_pct numeric, quantity numeric, amount numeric)
     group by x.tender_boq_item_id, x.qs_boq_item_id;

    -- resource hours (replace)
    delete from public.plan_task_resource_hours where task_id = v_id;
    insert into public.plan_task_resource_hours(project_id, task_id, dwl_resource_id, kind, hours, source, run_id)
    select v_project, v_id, x.dwl_resource_id, x.kind, sum(x.hours), 'boq', v_run
      from jsonb_to_recordset(coalesce(t -> 'resource_hours', '[]'::jsonb)) as x(
           dwl_resource_id uuid, kind text, hours numeric)
     group by x.dwl_resource_id, x.kind;

    -- plan_task_work quantity (single BOQ item link: the largest-share line)
    v_qty := (t ->> 'quantity')::numeric; v_unit := t ->> 'unit';
    if v_qty is not null then
      v_tender := null; v_qs := null;
      if v_source = 'tender' then
        select x.tender_boq_item_id into v_tender
          from jsonb_to_recordset(coalesce(t -> 'boq_lines', '[]'::jsonb)) as x(tender_boq_item_id uuid, share_pct numeric)
         where x.tender_boq_item_id is not null order by x.share_pct desc nulls last limit 1;
      else
        select x.qs_boq_item_id into v_qs
          from jsonb_to_recordset(coalesce(t -> 'boq_lines', '[]'::jsonb)) as x(qs_boq_item_id uuid, share_pct numeric)
         where x.qs_boq_item_id is not null order by x.share_pct desc nulls last limit 1;
      end if;
      v_qsrc := case when v_tender is not null then 'tender_boq' when v_qs is not null then 'boq' else 'import' end;
      insert into public.plan_task_work(task_id, project_id, quantity, quantity_unit, quantity_source,
            tender_boq_item_id, qs_boq_item_id)
      values (v_id, v_project, v_qty, v_unit, v_qsrc, v_tender, v_qs)
      on conflict (task_id) do update
        set quantity = excluded.quantity, quantity_unit = excluded.quantity_unit,
            quantity_source = excluded.quantity_source,
            tender_boq_item_id = excluded.tender_boq_item_id, qs_boq_item_id = excluded.qs_boq_item_id,
            updated_by = auth.uid();
    end if;
  end loop;

  -- clear tasks no longer driven by the BOQ
  for v_id in select (jsonb_array_elements_text(coalesce(p -> 'clear_task_ids', '[]'::jsonb)))::uuid loop
    select * into v_row from public.wbs_tasks where id = v_id and project_id = v_project;
    if not found then continue; end if;
    if coalesce(v_row.progress, 0) > 0 or v_row.actual_start_date is not null or v_row.started_at is not null then
      continue;
    end if;
    if public.wbs_node_effectively_locked(v_row.wbs_node_id) and not public.is_wbs_manager() then continue; end if;
    delete from public.plan_task_boq_lines where task_id = v_id;
    delete from public.plan_task_resource_hours where task_id = v_id;
    update public.wbs_tasks set budget_cost = 0 where id = v_id;
    v_cleared := v_cleared + 1;
  end loop;

  update public.plan_act_generation_runs
     set total_count = v_created + v_updated, high_count = v_created + v_updated
   where id = v_run;

  return jsonb_build_object('run_id', v_run, 'created', v_created, 'updated', v_updated,
           'skipped_started', v_sk_started, 'skipped_locked', v_sk_locked, 'cleared', v_cleared,
           'task_ids', v_out);
end $$;

revoke all on function public.plan_boq_commit_programme(jsonb) from public;
grant execute on function public.plan_boq_commit_programme(jsonb) to authenticated;
