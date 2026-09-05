-- Migration: 20260905000002_fix_wbs_progress_status_exclusion_and_reparent_trigger.sql
-- Purpose: Fix two correctness gaps in the WBS progress roll-up
--          (public.recalculate_wbs_progress, trg_task_collect_dirty / trg_task_flush_dirty):
--            1. Exclude cancelled/rejected tasks from the budget_cost-weighted average
--               at every aggregation step (leaf, per-level, project-level) — a cancelled
--               or rejected task should not drag the weighted progress up or down.
--            2. Recalculate the roll-up when a task is reparented to a different WBS
--               node (wbs_node_id changes) or when its status changes (now relevant
--               because of fix 1 — flipping into/out of cancelled/rejected changes the
--               weighted result even if progress/budget_cost did not change). Previously
--               only progress/budget_cost changes and inserts/deletes triggered a
--               recalculation, so drag/indent/outdent moves in the Gantt Chart silently
--               left both the old and new parent's progress_percent stale.
-- Depends on: public.recalculate_wbs_progress (20260604000001, last redefined in
--             20260604000004 — this migration's body supersedes that one),
--             public.collect_dirty_wbs_project / public.flush_dirty_wbs_progress
--             (20260604000001, flush guarded in 20260902000004 — untouched here),
--             public.wbs_tasks.status check constraint (20260608000001 — final list:
--             open, assigned, in_progress, paused, blocked, review, submitted,
--             approved, closed, cancelled, completed, rejected).

-- 1. Roll-up function: exclude cancelled/rejected tasks from every weighted-average step.
--    Structure (leaf aggregation -> depth loop -> project-level) is unchanged from
--    20260604000004; only the three WHERE-clause exclusions below are new.
create or replace function public.recalculate_wbs_progress(p_project_id uuid)
returns void
language plpgsql
as $$
declare
  v_max_depth int;
  v_level int;
  v_rows int;
begin
  -- Step A: Leaf nodes — weighted average of their tasks' progress
  with task_agg as (
    select
      wt.wbs_node_id,
      sum(wt.progress * coalesce(wt.budget_cost, 1)) as weighted_progress,
      sum(coalesce(wt.budget_cost, 1)) as total_weight
    from wbs_tasks wt
    join wbs_nodes wn on wn.id = wt.wbs_node_id
    where wn.project_id = p_project_id
      and not exists (select 1 from wbs_nodes child where child.parent_id = wn.id)
      and wt.status not in ('cancelled', 'rejected')
    group by wt.wbs_node_id
  )
  update wbs_nodes wn
  set progress_percent = case
      when ta.total_weight > 0 then round((ta.weighted_progress / ta.total_weight)::numeric, 2)
      else 0
    end,
    updated_at = now()
  from task_agg ta
  where wn.id = ta.wbs_node_id;

  -- Step B: Tree depth for controlled bottom-up loop
  with recursive node_depth as (
    select id, parent_id, 0 as depth
    from wbs_nodes
    where project_id = p_project_id
      and not exists (select 1 from wbs_nodes child where child.parent_id = wbs_nodes.id)
    union all
    select wn.id, wn.parent_id, nd.depth + 1
    from wbs_nodes wn
    join node_depth nd on nd.parent_id = wn.id
  )
  select coalesce(max(depth), 0) into v_max_depth from node_depth;

  -- Step C: One level per iteration, bottom-up
  for v_level in 1..v_max_depth loop
    with child_agg as (
      select
        pn.id as parent_id,
        sum(cn.progress_percent * coalesce(ts.total_weight, 0)) as weighted_progress,
        sum(coalesce(ts.total_weight, 0)) as total_weight
      from wbs_nodes cn
      join wbs_nodes pn on pn.id = cn.parent_id and pn.project_id = p_project_id
      left join (
        select wbs_node_id, sum(coalesce(budget_cost, 1)) as total_weight
        from wbs_tasks
        where project_id = p_project_id
          and status not in ('cancelled', 'rejected')
        group by wbs_node_id
      ) ts on ts.wbs_node_id = cn.id
      where cn.project_id = p_project_id
        and cn.id in (
          with recursive nd as (
            select id, parent_id, 0 as d
            from wbs_nodes
            where project_id = p_project_id
              and not exists (select 1 from wbs_nodes child where child.parent_id = wbs_nodes.id)
            union all
            select wn.id, wn.parent_id, nd.d + 1
            from wbs_nodes wn
            join nd on nd.parent_id = wn.id
          )
          select id from nd where d = v_level - 1 and parent_id is not null
        )
      group by pn.id
    )
    update wbs_nodes wn
    set progress_percent = case
        when ca.total_weight > 0 then round((ca.weighted_progress / ca.total_weight)::numeric, 2)
        else 0
      end,
      updated_at = now()
    from child_agg ca
    where wn.id = ca.parent_id and wn.project_id = p_project_id;

    get diagnostics v_rows = row_count;
    if v_rows = 0 then exit; end if;
  end loop;

  -- Step D: Project-level progress directly from all leaf-level tasks
  update public.projects p
  set progress_percentage = coalesce((
    select round(
      sum(wt.progress * coalesce(wt.budget_cost, 1))
      / nullif(sum(coalesce(wt.budget_cost, 1)), 0), 2
    )
    from wbs_tasks wt
    where wt.project_id = p_project_id
      and wt.status not in ('cancelled', 'rejected')
  ), 0),
    updated_at = now()
  where p.id = p_project_id;
end;
$$;

-- 2. Widen the wbs_tasks dirty-tracking triggers to also fire on status and
--    wbs_node_id changes. CREATE OR REPLACE TRIGGER cannot add columns to an
--    UPDATE OF clause, so drop + recreate (idempotent via IF EXISTS), matching
--    this repo's established pattern (e.g. 20260904000002_wbs_tasks_lock_guard.sql).
drop trigger if exists trg_task_collect_dirty on public.wbs_tasks;
create trigger trg_task_collect_dirty
  after insert or update of progress, budget_cost, status, wbs_node_id or delete
  on public.wbs_tasks for each row
  execute function public.collect_dirty_wbs_project();

drop trigger if exists trg_task_flush_dirty on public.wbs_tasks;
create trigger trg_task_flush_dirty
  after insert or update of progress, budget_cost, status, wbs_node_id or delete
  on public.wbs_tasks for each statement
  execute function public.flush_dirty_wbs_progress();
