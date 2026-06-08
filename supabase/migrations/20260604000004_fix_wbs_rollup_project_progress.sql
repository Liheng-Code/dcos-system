-- Fix Step D: compute project-level progress directly from leaf-level tasks
-- instead of from root nodes (which have zero direct task weight).
-- Root node progress_percent is already correct, but their task weight is 0,
-- causing the division to yield NULL.

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
  ), 0),
    updated_at = now()
  where p.id = p_project_id;
end;
$$;
