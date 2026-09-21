-- Migration: 20260907000001_master_wbs_import.sql
-- Purpose: Support importing the PMO "Master WBS" Excel programme
--          (docs/7_Floor_Building_Master_WBS_Complete_Mockup.xlsx, sheet
--          "Master WBS") in one atomic call.
--
--          a) New columns on wbs_nodes / wbs_tasks for data the sheet carries
--             that had nowhere to live: cost code, discipline (nodes),
--             floor/area label, activity duration in days.
--          b) RPC public.import_master_wbs(project, payload, mode) that creates
--             the Phase / Work-Package hierarchy as wbs_nodes and every
--             Activity / Material Package as a scheduled wbs_tasks row, then
--             wires finish-to-start predecessor links and recalculates rollups.
--
-- Depends on: public.wbs_nodes (20260527000009), public.wbs_tasks
--             (20260527000016 + later), public.is_wbs_manager()
--             (20260904000001), public.recalculate_wbs_progress()
--             (20260604000001 .. 20260905000002), public.build_wbs_full_path().
-- The client (master-wbs-import-dialog.tsx) parses + validates + classifies the
-- sheet and posts a clean, ordered payload; this function only writes.
--
-- Note: wbs_outline_code is deliberately NOT written. That column is the
-- planner's *manual* MS-Project WBS-code override; leaving it NULL lets the
-- Planning / Gantt "WBS Code" column auto-compute the outline number from tree
-- position + the project code mask, while the "Code" column keeps each item's
-- own code (task_code / node segment). Re-import stays idempotent by keying on
-- the wbs_code ancestor-chain (nodes) and task_code (tasks).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New columns
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.wbs_nodes
  add column if not exists cost_code  text,
  add column if not exists discipline text,
  add column if not exists area_label text;

comment on column public.wbs_nodes.cost_code  is 'Cost/CBS code carried from an imported master programme. See 20260907000001.';
comment on column public.wbs_nodes.discipline is 'Primary discipline label for a summary node (free text, e.g. Structural / MEP). See 20260907000001.';
comment on column public.wbs_nodes.area_label is 'Floor / area / zone label as written in the source programme (e.g. B1, GF, 7F, External). See 20260907000001.';

alter table public.wbs_tasks
  add column if not exists cost_code     text,
  add column if not exists area_label    text,
  add column if not exists duration_days numeric;

comment on column public.wbs_tasks.cost_code     is 'Cost/CBS code carried from an imported master programme. See 20260907000001.';
comment on column public.wbs_tasks.area_label    is 'Floor / area / zone label as written in the source programme. See 20260907000001.';
comment on column public.wbs_tasks.duration_days is 'Planned duration in days from the source programme. Informational — start_date / end_date remain authoritative. See 20260907000001.';

create index if not exists idx_wbs_nodes_cost_code on public.wbs_nodes(project_id, cost_code);
create index if not exists idx_wbs_tasks_cost_code on public.wbs_tasks(project_id, cost_code);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC: import_master_wbs
-- ─────────────────────────────────────────────────────────────────────────────
-- p_payload shape (produced by the dialog):
--   {
--     "nodes": [ { key, parent_key, node_type, wbs_code, outline_code, wbs_name,
--                  discipline, area_label, cost_code, is_below_ground,
--                  is_external_works, schedule_level, sort_order }, ... ],
--     "tasks": [ { ord, node_key, task_code, outline_code, task_name, task_type,
--                  activity_type, is_milestone, discipline, area_label,
--                  cost_code, start_date, end_date, duration_days, owner_name,
--                  description, dependency_text, schedule_level, sort_order,
--                  predecessors: [ { code, type, lag }, ... ] }, ... ]
--   }
--   nodes are ordered parents-first; keys are the full dotted WBS codes.
-- p_mode: 'merge' (skip existing) | 'merge_update' (overwrite existing) |
--         'replace' (delete the project's active WBS first — managers only).
create or replace function public.import_master_wbs(
  p_project_id uuid,
  p_payload    jsonb,
  p_mode       text default 'merge'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode            text := lower(coalesce(p_mode, 'merge'));
  v_uid             uuid := auth.uid();
  v_now             timestamptz := now();
  v_preseed_nodes   int;
  v_preseed_tasks   int;
  v_nodes_in        int := coalesce(jsonb_array_length(p_payload->'nodes'), 0);
  v_tasks_in        int := coalesce(jsonb_array_length(p_payload->'tasks'), 0);
  v_nodes_created   int := 0;
  v_tasks_created   int;
  v_deps_linked     int := 0;
  v_deps_unresolved int := 0;
  v_pass            int := 0;
  v_rows            int;
  v_warnings        jsonb := '[]'::jsonb;
begin
  if p_project_id is null then
    raise exception 'p_project_id is required';
  end if;
  if v_mode not in ('merge', 'merge_update', 'replace') then
    raise exception 'Unknown import mode "%": expected merge | merge_update | replace', p_mode;
  end if;
  if v_mode = 'replace' and not public.is_wbs_manager() then
    raise exception 'Replace import requires an admin or project manager'
      using errcode = 'insufficient_privilege';
  end if;

  -- Progress-rollup safety net (same guard as the seed files).
  create temp table if not exists _wbs_dirty_projects (project_id uuid primary key)
    on commit delete rows;

  -- Working sets. Drop first so the function is safe to call more than once
  -- inside a single session/transaction (PostgREST gives each call its own
  -- transaction, but tests and future batch callers may not).
  drop table if exists _mw_in_nodes, _mw_in_tasks, _mw_nodes, _mw_tasks, _mw_new_tasks;

  create temp table _mw_in_nodes (
    key text, parent_key text, node_type text, wbs_code text, outline_code text,
    wbs_name text, discipline text, area_label text, cost_code text,
    is_below_ground boolean, is_external_works boolean,
    schedule_level int, sort_order int
  ) on commit drop;

  create temp table _mw_in_tasks (
    ord int, node_key text, task_code text, outline_code text, task_name text,
    task_type text, activity_type text, is_milestone boolean, discipline text,
    area_label text, cost_code text, start_date date, end_date date,
    duration_days numeric, owner_name text, description text,
    dependency_text text, schedule_level int, sort_order int, predecessors jsonb
  ) on commit drop;

  create temp table _mw_nodes (key text primary key, id uuid) on commit drop;
  create temp table _mw_tasks (key text primary key, id uuid) on commit drop;
  create temp table _mw_new_tasks (key text primary key) on commit drop;

  insert into _mw_in_nodes
  select * from jsonb_to_recordset(coalesce(p_payload->'nodes', '[]'::jsonb)) as x(
    key text, parent_key text, node_type text, wbs_code text, outline_code text,
    wbs_name text, discipline text, area_label text, cost_code text,
    is_below_ground boolean, is_external_works boolean,
    schedule_level int, sort_order int);

  insert into _mw_in_tasks
  select * from jsonb_to_recordset(coalesce(p_payload->'tasks', '[]'::jsonb)) as x(
    ord int, node_key text, task_code text, outline_code text, task_name text,
    task_type text, activity_type text, is_milestone boolean, discipline text,
    area_label text, cost_code text, start_date date, end_date date,
    duration_days numeric, owner_name text, description text,
    dependency_text text, schedule_level int, sort_order int, predecessors jsonb);

  if v_mode = 'replace' then
    delete from public.wbs_tasks where project_id = p_project_id;
    delete from public.wbs_nodes where project_id = p_project_id and status = 'active';
  end if;

  -- Node key = ancestor wbs_code chain joined by "." (mirrors the sheet's
  -- dotted WBS code). Rebuilt from the DB so it never depends on a stored
  -- override column.
  with recursive chain as (
    select id, wbs_code::text as k
    from public.wbs_nodes
    where project_id = p_project_id and parent_id is null
    union all
    select n.id, c.k || '.' || n.wbs_code
    from public.wbs_nodes n
    join chain c on n.parent_id = c.id
    where n.project_id = p_project_id
  )
  insert into _mw_nodes (key, id) select k, id from chain
  on conflict (key) do nothing;

  insert into _mw_tasks (key, id)
  select t.task_code, t.id
  from public.wbs_tasks t
  where t.project_id = p_project_id
  on conflict (key) do nothing;

  select count(*) into v_preseed_nodes from _mw_nodes;
  select count(*) into v_preseed_tasks from _mw_tasks;

  -- 2a. Insert nodes, parents first. After each pass rebuild _mw_nodes from the
  -- DB so newly-created parents resolve for the next pass. Bounded by depth.
  loop
    v_pass := v_pass + 1;

    insert into public.wbs_nodes (
      project_id, parent_id, node_type, wbs_code, wbs_name,
      status, sort_order, schedule_level, discipline, area_label, cost_code,
      is_below_ground, is_external_works
    )
    select
      p_project_id, pm.id, i.node_type, i.wbs_code, i.wbs_name,
      'active', coalesce(i.sort_order, 0),
      least(5, greatest(1, coalesce(i.schedule_level, 3))),
      nullif(i.discipline, ''), nullif(i.area_label, ''), nullif(i.cost_code, ''),
      coalesce(i.is_below_ground, false), coalesce(i.is_external_works, false)
    from _mw_in_nodes i
    left join _mw_nodes pm on pm.key = nullif(i.parent_key, '')
    where not exists (select 1 from _mw_nodes m where m.key = i.key)
      and (nullif(i.parent_key, '') is null or pm.id is not null)
    on conflict (project_id, parent_id, wbs_code) do nothing;

    get diagnostics v_rows = row_count;
    v_nodes_created := v_nodes_created + v_rows;

    with recursive chain as (
      select id, wbs_code::text as k
      from public.wbs_nodes
      where project_id = p_project_id and parent_id is null
      union all
      select n.id, c.k || '.' || n.wbs_code
      from public.wbs_nodes n
      join chain c on n.parent_id = c.id
      where n.project_id = p_project_id
    )
    insert into _mw_nodes (key, id) select k, id from chain
    on conflict (key) do nothing;

    exit when v_rows = 0 or v_pass > 64;
  end loop;

  -- merge_update: refresh descriptive fields on pre-existing nodes
  if v_mode = 'merge_update' then
    update public.wbs_nodes w set
      wbs_name       = i.wbs_name,
      schedule_level = least(5, greatest(1, coalesce(i.schedule_level, w.schedule_level, 3))),
      discipline     = nullif(i.discipline, ''),
      area_label     = nullif(i.area_label, ''),
      cost_code      = nullif(i.cost_code, ''),
      updated_at     = v_now
    from _mw_in_nodes i
    join _mw_nodes mn on mn.key = i.outline_code
    where w.id = mn.id;
  end if;

  -- 2b. Insert tasks (task_code = the sheet's dotted code — the "Code" column)
  with ins as (
    insert into public.wbs_tasks (
      project_id, wbs_node_id, task_code, task_name, description,
      discipline, owner_name, status, progress, priority, delay_status,
      task_type, activity_type, is_milestone, schedule_level, sort_order,
      start_date, end_date, baseline_start_date, baseline_finish_date,
      baseline_set_at, baseline_set_by, duration_days, area_label, cost_code,
      dependency_text, sync_source
    )
    select
      p_project_id, nm.id, i.task_code, i.task_name,
      nullif(i.description, ''), nullif(i.discipline, ''), nullif(i.owner_name, ''),
      'open', 0, 'medium', 'on_track',
      coalesce(nullif(i.task_type, ''), 'activity'),
      coalesce(nullif(i.activity_type, ''), 'normal'),
      coalesce(i.is_milestone, false),
      least(5, greatest(1, coalesce(i.schedule_level, 3))),
      coalesce(i.sort_order, 0),
      i.start_date, i.end_date, i.start_date, i.end_date,
      case when i.start_date is not null or i.end_date is not null then v_now end,
      case when i.start_date is not null or i.end_date is not null then v_uid end,
      i.duration_days, nullif(i.area_label, ''), nullif(i.cost_code, ''),
      nullif(i.dependency_text, ''), 'manual'
    from _mw_in_tasks i
    join _mw_nodes nm on nm.key = i.node_key
    where not exists (select 1 from _mw_tasks m where m.key = i.task_code)
    on conflict (project_id, task_code) do nothing
    returning id, task_code as key
  )
  insert into _mw_new_tasks (key)
  select key from ins
  on conflict (key) do nothing;

  insert into _mw_tasks (key, id)
  select t.task_code, t.id
  from public.wbs_tasks t
  join _mw_new_tasks nt on nt.key = t.task_code
  where t.project_id = p_project_id
  on conflict (key) do nothing;

  select count(*) into v_tasks_created from _mw_new_tasks;

  -- tasks whose parent node never resolved -> warn
  select v_warnings || coalesce(jsonb_agg(
           format('Row for %s skipped - parent node %s was not created', i.task_code, i.node_key)),
         '[]'::jsonb)
    into v_warnings
  from _mw_in_tasks i
  left join _mw_nodes nm on nm.key = i.node_key
  where nm.id is null;

  -- merge_update: refresh schedule fields on pre-existing tasks
  if v_mode = 'merge_update' then
    update public.wbs_tasks w set
      task_name           = i.task_name,
      description         = nullif(i.description, ''),
      discipline          = nullif(i.discipline, ''),
      owner_name          = nullif(i.owner_name, ''),
      task_type           = coalesce(nullif(i.task_type, ''), w.task_type),
      activity_type       = coalesce(nullif(i.activity_type, ''), w.activity_type),
      is_milestone        = coalesce(i.is_milestone, w.is_milestone),
      schedule_level      = least(5, greatest(1, coalesce(i.schedule_level, w.schedule_level, 3))),
      start_date          = i.start_date,
      end_date            = i.end_date,
      baseline_start_date = i.start_date,
      baseline_finish_date= i.end_date,
      baseline_set_at     = case when i.start_date is not null or i.end_date is not null then v_now else w.baseline_set_at end,
      baseline_set_by     = case when i.start_date is not null or i.end_date is not null then v_uid else w.baseline_set_by end,
      duration_days       = i.duration_days,
      area_label          = nullif(i.area_label, ''),
      cost_code           = nullif(i.cost_code, ''),
      dependency_text     = nullif(i.dependency_text, ''),
      updated_at          = v_now
    from _mw_in_tasks i
    join _mw_tasks mt on mt.key = i.task_code
    where w.id = mt.id;

    -- re-wire dependencies for every payload task, not just the new ones
    insert into _mw_new_tasks (key)
    select i.task_code from _mw_in_tasks i
    on conflict (key) do nothing;
  end if;

  -- 2c. Predecessor links (finish-to-start unless the sheet said otherwise)
  with pred as (
    select
      i.task_code                                      as succ_key,
      trim(e.value->>'code')                           as pred_code,
      lower(coalesce(nullif(e.value->>'type',''),'fs')) as ptype,
      coalesce((e.value->>'lag')::numeric, 0)          as plag
    from _mw_in_tasks i
    join _mw_new_tasks nt on nt.key = i.task_code
    cross join lateral jsonb_array_elements(coalesce(i.predecessors, '[]'::jsonb)) e
  ),
  resolved as (
    select
      st.id as succ_id, pt.id as pred_id,
      case when p.ptype in ('fs','ss','ff','sf') then p.ptype else 'fs' end as ptype,
      p.plag
    from pred p
    join _mw_tasks st on st.key = p.succ_key
    join _mw_tasks pt on pt.key = p.pred_code
    where pt.id <> st.id
  ),
  resolved_u as (
    select succ_id, pred_id, min(ptype) as ptype, min(plag) as plag
    from resolved group by succ_id, pred_id
  ),
  agg as (
    select succ_id,
      array_agg(pred_id order by pred_id) as ids,
      array_agg(ptype   order by pred_id) as types,
      array_agg(plag    order by pred_id) as lags
    from resolved_u group by succ_id
  ),
  upd as (
    update public.wbs_tasks s set
      dependency_task_ids = agg.ids,
      dependency_types    = agg.types,
      dependency_lag_days = agg.lags
    from agg where s.id = agg.succ_id
    returning coalesce(array_length(s.dependency_task_ids, 1), 0) as n
  )
  select coalesce(sum(n), 0) into v_deps_linked from upd;

  select count(*) into v_deps_unresolved
  from _mw_in_tasks i
  join _mw_new_tasks nt on nt.key = i.task_code
  cross join lateral jsonb_array_elements(coalesce(i.predecessors, '[]'::jsonb)) e
  left join _mw_tasks pt on pt.key = trim(e.value->>'code')
  where pt.id is null;

  -- 2d. Rebuild full_path for the project's nodes (the multi-row insert can
  -- leave it unset for some rows), then roll up progress.
  update public.wbs_nodes
     set full_path = public.build_wbs_full_path(id)
   where project_id = p_project_id;

  perform public.recalculate_wbs_progress(p_project_id);

  return jsonb_build_object(
    'mode',            v_mode,
    'nodes_in',        v_nodes_in,
    'nodes_created',   v_nodes_created,
    'nodes_skipped',   greatest(0, v_nodes_in - v_nodes_created),
    'tasks_in',        v_tasks_in,
    'tasks_created',   v_tasks_created,
    'tasks_skipped',   greatest(0, v_tasks_in - v_tasks_created),
    'deps_linked',     v_deps_linked,
    'deps_unresolved', v_deps_unresolved,
    'warnings',        v_warnings
  );
end;
$$;

comment on function public.import_master_wbs(uuid, jsonb, text) is
  'Bulk-import a PMO "Master WBS" programme: summary rows -> wbs_nodes, '
  'Activity / Material Package rows -> wbs_tasks with baseline dates and '
  'finish-to-start predecessor links. Does not write wbs_outline_code (the '
  'planner auto-computes the WBS Code column). Modes: merge (skip existing), '
  'merge_update (overwrite existing), replace (wipe active WBS first — '
  'managers only). Returns a jsonb summary. See 20260907000001.';

grant execute on function public.import_master_wbs(uuid, jsonb, text) to authenticated, service_role;
