-- Migration: 20261027085200_boq_programme_commit_defer_rollup.sql
-- Purpose: plan_boq_commit_programme timed out (statement_timeout 8 s for authenticated) on a 564-task commit: every
--   per-task insert/update fired the statement-level trg_task_flush_dirty, so recalculate_wbs_progress ran for the
--   whole project ~560 times (~62 s). Fix:
--   1. flush_dirty_wbs_progress skips while the transaction-local setting dcos.defer_wbs_progress = 'on'; the dirty
--      rows stay queued in _wbs_dirty_projects.
--   2. plan_boq_commit_programme turns the setting on after its permission check and, before returning, turns it off
--      and runs the queued roll-up once.
-- Behaviour is unchanged for every other caller (the setting is unset). Body otherwise identical to
-- 20261026160300_boq_programme_phase2_fixes.sql.

create or replace function public.flush_dirty_wbs_progress()
 returns trigger
 language plpgsql
as $function$
begin
  -- Nothing has been marked dirty in this session yet.
  if to_regclass('pg_temp._wbs_dirty_projects') is null then
    return null;
  end if;
  -- A bulk writer (e.g. plan_boq_commit_programme) defers the roll-up and runs it once at its end.
  if coalesce(current_setting('dcos.defer_wbs_progress', true), '') = 'on' then
    return null;
  end if;

  perform public.recalculate_wbs_progress(project_id)
  from _wbs_dirty_projects;

  truncate _wbs_dirty_projects;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.plan_boq_commit_programme(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_project   uuid := (p ->> 'project_id')::uuid;
  v_source    text := p ->> 'source';
  v_start     date := nullif(p ->> 'project_start', '')::date;
  v_run       uuid;
  v_tasks     jsonb := coalesce(p -> 'tasks', '[]'::jsonb);
  v_keys      text[] := '{}';
  v_ids       jsonb := '{}'::jsonb;   -- key -> task id (only tasks that have an id); also the output map
  v_mode      jsonb := '{}'::jsonb;   -- key -> create | update | skip
  v_newmap    jsonb := '{}'::jsonb;   -- 'master|node' -> id for tasks created in this payload
  v_created int := 0; v_updated int := 0; v_sk_started int := 0; v_sk_locked int := 0; v_cleared int := 0;
  v_flagged int := 0; v_kept int := 0; v_deduped int := 0;
  t jsonb; pr jsonb; v_x record;
  v_key text; v_id uuid; v_exist uuid; v_node uuid; v_row public.wbs_tasks%rowtype; v_found boolean;
  v_flag text; v_dupkey text;
  v_dep_ids uuid[]; v_dep_types text[]; v_dep_lags numeric[]; v_dep_id uuid; v_pkey text; v_ptype text;
  v_code text; v_base text; v_n int; v_mcode text; v_nodecode text; v_sort bigint;
  v_master uuid; v_qty numeric; v_unit text; v_tender uuid; v_qs uuid; v_qsrc text; v_cur text;
  v_nodes uuid[];
begin
  if v_project is null or v_source not in ('tender', 'contract') then
    raise exception 'plan_boq_commit_programme: project_id and source (tender|contract) are required';
  end if;
  if not (public.is_project_member(v_project) and public.has_permission('planning', 'schedule', 'edit')) then
    raise exception 'Committing a BOQ programme requires project membership and planning/schedule edit permission';
  end if;

  perform pg_advisory_xact_lock(hashtext('boq_programme:' || v_project::text));
  -- one WBS progress roll-up at the end instead of one per task statement (see header)
  perform set_config('dcos.defer_wbs_progress', 'on', true);

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

  -- pass 1: validate everything, decide each task's id and mode (no task writes yet)
  for t in select * from jsonb_array_elements(v_tasks) loop
    v_key := t ->> 'key';
    if v_key is null then raise exception 'every task needs a key'; end if;
    if v_key = any (v_keys) then raise exception 'duplicate task key %', v_key; end if;
    v_keys := v_keys || v_key;

    -- ownership validation
    for v_x in select * from jsonb_to_recordset(coalesce(t -> 'boq_lines', '[]'::jsonb))
                 as x(tender_boq_item_id uuid, qs_boq_item_id uuid) loop
      if (v_x.tender_boq_item_id is null) = (v_x.qs_boq_item_id is null) then
        raise exception 'task %: each boq line needs exactly one of tender_boq_item_id / qs_boq_item_id', v_key;
      end if;
      if not public.plan_boq_item_ok(v_project, v_x.tender_boq_item_id, v_x.qs_boq_item_id) then
        raise exception 'task %: BOQ item % does not belong to this project', v_key,
          coalesce(v_x.tender_boq_item_id, v_x.qs_boq_item_id);
      end if;
    end loop;
    for v_x in select * from jsonb_to_recordset(coalesce(t -> 'resource_hours', '[]'::jsonb))
                 as x(dwl_resource_id uuid, kind text) loop
      if not public.plan_boq_resource_ok(v_x.dwl_resource_id) then
        raise exception 'task %: resource % is not in the caller''s library tenant', v_key, v_x.dwl_resource_id;
      end if;
    end loop;
    for pr in select * from jsonb_array_elements(coalesce(t -> 'predecessors', '[]'::jsonb)) loop
      if nullif(pr ->> 'key', '') is null and nullif(pr ->> 'task_id', '') is not null then
        if not exists (select 1 from public.wbs_tasks w
                        where w.id = (pr ->> 'task_id')::uuid and w.project_id = v_project) then
          raise exception 'task %: predecessor task % is not in this project', v_key, pr ->> 'task_id';
        end if;
      end if;
    end loop;

    v_flag   := t ->> 'skip';
    v_master := nullif(t ->> 'activity_master_id', '')::uuid;
    v_exist  := nullif(t ->> 'existing_task_id', '')::uuid;
    v_found  := false;

    if v_exist is not null then
      select * into v_row from public.wbs_tasks where id = v_exist and project_id = v_project;
      if not found then raise exception 'task % does not belong to project', v_exist; end if;
      v_found := true;
    else
      v_node := (t ->> 'wbs_node_id')::uuid;
      if v_node is null or not exists (select 1 from public.wbs_nodes where id = v_node and project_id = v_project) then
        raise exception 'wbs node % does not belong to project', v_node;
      end if;
      if v_master is not null then
        v_dupkey := v_master::text || '|' || v_node::text;
        select * into v_row from public.wbs_tasks
         where project_id = v_project and wbs_node_id = v_node and activity_master_id = v_master
         order by created_at limit 1;
        if found then
          v_found := true; v_exist := v_row.id; v_deduped := v_deduped + 1;
        elsif v_newmap ? v_dupkey then
          -- same master on same node twice in one payload: second one updates the first
          v_ids := v_ids || jsonb_build_object(v_key, v_newmap ->> v_dupkey);
          v_mode := v_mode || jsonb_build_object(v_key, 'update');
          v_deduped := v_deduped + 1;
          continue;
        end if;
      end if;
    end if;

    if v_found then
      v_ids := v_ids || jsonb_build_object(v_key, v_row.id);
      if v_flag in ('started', 'locked') then
        v_flagged := v_flagged + 1; v_mode := v_mode || jsonb_build_object(v_key, 'skip');
      elsif coalesce(v_row.progress, 0) > 0 or v_row.actual_start_date is not null or v_row.started_at is not null then
        v_sk_started := v_sk_started + 1; v_mode := v_mode || jsonb_build_object(v_key, 'skip');
      elsif public.wbs_node_effectively_locked(v_row.wbs_node_id) and not public.is_wbs_manager() then
        v_sk_locked := v_sk_locked + 1; v_mode := v_mode || jsonb_build_object(v_key, 'skip');
      else
        v_mode := v_mode || jsonb_build_object(v_key, 'update');
      end if;
    else
      -- genuinely new task
      if v_flag in ('started', 'locked') then
        v_flagged := v_flagged + 1; v_mode := v_mode || jsonb_build_object(v_key, 'skip');
      elsif public.wbs_node_effectively_locked(v_node) and not public.is_wbs_manager() then
        v_sk_locked := v_sk_locked + 1; v_mode := v_mode || jsonb_build_object(v_key, 'skip');
      else
        v_id := gen_random_uuid();
        v_ids := v_ids || jsonb_build_object(v_key, v_id);
        v_mode := v_mode || jsonb_build_object(v_key, 'create');
        if v_master is not null then v_newmap := v_newmap || jsonb_build_object(v_dupkey, v_id); end if;
      end if;
    end if;
  end loop;

  -- pass 2: write
  for t in select * from jsonb_array_elements(v_tasks) loop
    v_key := t ->> 'key';
    if (v_mode ->> v_key) is null or (v_mode ->> v_key) = 'skip' then continue; end if;
    v_id := (v_ids ->> v_key)::uuid;
    v_master := nullif(t ->> 'activity_master_id', '')::uuid;

    if (v_mode ->> v_key) = 'update' then
      update public.wbs_tasks
         set duration_days = coalesce((t ->> 'duration_days')::numeric, duration_days),
             budget_cost = coalesce((t ->> 'budget_cost')::numeric, budget_cost),
             activity_master_id = coalesce(activity_master_id, v_master)
       where id = v_id;
      v_updated := v_updated + 1;
    else
      v_node := (t ->> 'wbs_node_id')::uuid;
      v_dep_ids := '{}'; v_dep_types := '{}'; v_dep_lags := '{}';
      for pr in select * from jsonb_array_elements(coalesce(t -> 'predecessors', '[]'::jsonb)) loop
        v_pkey := nullif(pr ->> 'key', '');
        if v_pkey is not null then
          if not (v_pkey = any (v_keys)) then raise exception 'unknown predecessor key %', v_pkey; end if;
          if not (v_ids ? v_pkey) then continue; end if;      -- predecessor was skipped: drop the link
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
    end if;

    -- boq lines (replace)
    delete from public.plan_task_boq_lines where task_id = v_id;
    insert into public.plan_task_boq_lines(project_id, task_id, tender_boq_item_id, qs_boq_item_id,
          share_pct, quantity, amount, run_id)
    select v_project, v_id, x.tender_boq_item_id, x.qs_boq_item_id,
           sum(x.share_pct), sum(x.quantity), round(sum(coalesce(x.amount, 0)), 2), v_run
      from jsonb_to_recordset(coalesce(t -> 'boq_lines', '[]'::jsonb)) as x(
           tender_boq_item_id uuid, qs_boq_item_id uuid, share_pct numeric, quantity numeric, amount numeric)
     group by x.tender_boq_item_id, x.qs_boq_item_id;

    -- resource hours (replace)
    delete from public.plan_task_resource_hours where task_id = v_id;
    insert into public.plan_task_resource_hours(project_id, task_id, dwl_resource_id, kind, hours, source, run_id)
    select v_project, v_id, x.dwl_resource_id, x.kind, round(sum(x.hours), 2), 'boq', v_run
      from jsonb_to_recordset(coalesce(t -> 'resource_hours', '[]'::jsonb)) as x(
           dwl_resource_id uuid, kind text, hours numeric)
     group by x.dwl_resource_id, x.kind;

    -- plan_task_work quantity; manual rows are never overwritten
    v_qty := (t ->> 'quantity')::numeric; v_unit := t ->> 'unit';
    if v_qty is not null then
      select quantity_source into v_cur from public.plan_task_work where task_id = v_id;
      if v_cur = 'manual' then
        v_kept := v_kept + 1;
      else
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
    end if;
  end loop;

  -- clear tasks no longer driven by the BOQ (only tasks that currently have BOQ lines)
  for v_id in select (jsonb_array_elements_text(coalesce(p -> 'clear_task_ids', '[]'::jsonb)))::uuid loop
    select * into v_row from public.wbs_tasks where id = v_id and project_id = v_project;
    if not found then continue; end if;
    if not exists (select 1 from public.plan_task_boq_lines where task_id = v_id) then continue; end if;
    if coalesce(v_row.progress, 0) > 0 or v_row.actual_start_date is not null or v_row.started_at is not null then
      continue;
    end if;
    if public.wbs_node_effectively_locked(v_row.wbs_node_id) and not public.is_wbs_manager() then continue; end if;
    delete from public.plan_task_boq_lines where task_id = v_id;
    delete from public.plan_task_resource_hours where task_id = v_id and source = 'boq';
    update public.wbs_tasks set budget_cost = 0 where id = v_id;
    update public.plan_task_work
       set quantity_source = 'manual', tender_boq_item_id = null, qs_boq_item_id = null,
           quantity_reason = coalesce(quantity_reason, 'BOQ link cleared by programme regeneration'),
           updated_by = auth.uid()
     where task_id = v_id and quantity_source in ('boq', 'tender_boq');
    v_cleared := v_cleared + 1;
  end loop;

  update public.plan_act_generation_runs
     set total_count = v_created + v_updated, high_count = v_created + v_updated
   where id = v_run;

  insert into public.wbs_audit_log(project_id, user_id, action, field_name, old_value, new_value)
  values (v_project, auth.uid(), 'boq_programme_commit', 'run_id', null,
          jsonb_build_object('run_id', v_run, 'source', v_source, 'created', v_created, 'updated', v_updated,
            'skipped_started', v_sk_started, 'skipped_locked', v_sk_locked, 'skipped_flagged', v_flagged,
            'cleared', v_cleared, 'kept_manual_work', v_kept, 'deduped', v_deduped)::text);

  perform set_config('dcos.defer_wbs_progress', 'off', true);
  if to_regclass('pg_temp._wbs_dirty_projects') is not null then
    perform public.recalculate_wbs_progress(d.project_id) from pg_temp._wbs_dirty_projects d;
    truncate pg_temp._wbs_dirty_projects;
  end if;

  return jsonb_build_object('run_id', v_run, 'created', v_created, 'updated', v_updated,
           'skipped_started', v_sk_started, 'skipped_locked', v_sk_locked, 'skipped_flagged', v_flagged,
           'cleared', v_cleared, 'kept_manual_work', v_kept, 'deduped', v_deduped, 'task_ids', v_ids);
end $function$;

