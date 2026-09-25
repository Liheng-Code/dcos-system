-- Migration: 20260922000009_plan_resource_trade_dashboard.sql
-- Purpose: Productivity & Resource-Costing Plan, Phase 3 (part 1, continued) — group generated resources by
--          TRADE (finer than resource_type) so the app can show manpower required vs available per trade.
--          The aggregation itself (get_resource_loading -> group by trade -> weekly shortage flag) is done
--          client-side in lib/planning/resource-service.ts; this migration only adds the column that carries
--          the trade label, and backfills it on plan_generate_resource_loading()'s own resources.
-- Depends on: 20260922000008 (plan_generate_resource_loading).
-- Safe to re-run.

alter table public.plan_resources add column if not exists trade text;

comment on column public.plan_resources.trade is 'Set by plan_generate_resource_loading() on the pooled resources it manages. NULL on a manually created resource — the dashboard falls back to the resource''s own name as its "trade" bucket.';

create or replace function public.plan_generate_resource_loading(p_project_id uuid)
returns table (resources_created integer, resources_reused integer, assignments_written integer, assignments_removed integer)
language plpgsql
as $$
declare
  v_created  integer := 0;
  v_reused   integer := 0;
  v_removed  integer := 0;
  v_written  integer := 0;
begin
  if p_project_id is null then
    raise exception 'plan_generate_resource_loading needs a project';
  end if;

  drop table if exists _gen_demand, _gen_trades; -- safe to call twice in the same transaction

  create temp table _gen_demand on commit drop as
  select w.task_id, public.plan_norm_trade(w.norm_id) as trade, w.crew_required
  from public.plan_task_work w
  where w.project_id = p_project_id
    and w.norm_id is not null
    and w.crew_required is not null
    and w.crew_required > 0;

  create temp table _gen_trades on commit drop as
  select distinct trade from _gen_demand;

  -- find-or-create one pooled labour resource per trade, named so re-runs find the same row; an existing
  -- resource's capacity (max_units) is never touched — the generator does not invent headcount.
  with ins as (
    insert into public.plan_resources (project_id, name, resource_type, max_units, unit_label, trade)
    select p_project_id, t.trade || ' - from norms', 'labor', 100, 'worker', t.trade
    from _gen_trades t
    where not exists (
      select 1 from public.plan_resources r where r.project_id = p_project_id and r.name = t.trade || ' - from norms'
    )
    returning 1
  )
  select count(*) into v_created from ins;

  -- backfill `trade` on resources this function already owns from before this column existed
  update public.plan_resources r
     set trade = t.trade
    from _gen_trades t
   where r.project_id = p_project_id and r.name = t.trade || ' - from norms' and r.trade is distinct from t.trade;

  select count(*) into v_reused
  from public.plan_resources r join _gen_trades t on r.project_id = p_project_id and r.name = t.trade || ' - from norms';
  v_reused := greatest(v_reused - v_created, 0);

  with removed as (
    delete from public.plan_task_assignments a
    using public.wbs_tasks wt
    where a.task_id = wt.id and wt.project_id = p_project_id and a.source = 'norm'
    returning 1
  )
  select count(*) into v_removed from removed;

  with written as (
    insert into public.plan_task_assignments (task_id, resource_id, allocation_percent, source, generated_at)
    select d.task_id, r.id, d.crew_required * 100, 'norm', now()
    from _gen_demand d
    join public.plan_resources r on r.project_id = p_project_id and r.name = d.trade || ' - from norms'
    returning 1
  )
  select count(*) into v_written from written;

  return query select v_created, v_reused, v_written, v_removed;
end $$;
