-- Migration: 20260922000008_plan_resource_generation.sql
-- Purpose: Productivity & Resource-Costing Plan, Phase 3 (part 1) — "Generate resource loading from norms".
--
--   plan_task_assignments.source   'manual' (default, untouched by generation) | 'norm' (owned by the generator)
--   plan_generate_resource_loading(project)   for every plan_task_work row with a computed crew requirement,
--                                              finds/creates one pooled labour resource per TRADE and writes
--                                              one assignment per task (allocation_percent = crew_required x 100,
--                                              the same "100 = one worker" convention as plan_resources.max_units
--                                              and the existing hand-mapped seed). Re-running replaces every
--                                              'norm' assignment from scratch, so it is idempotent by
--                                              construction; 'manual' assignments are never touched.
--
-- Runs as the CALLER (no SECURITY DEFINER): ordinary RLS applies, so the user needs planning/resources edit
-- AND delete rights, same as doing this by hand through the Resources screen.
-- Depends on: 20260922000006 (plan_task_work), 20260905000004 (plan_resources / plan_task_assignments).
-- Safe to re-run.

alter table public.plan_task_assignments
  add column if not exists source text not null default 'manual' check (source in ('manual', 'norm')),
  add column if not exists generated_at timestamptz;

comment on column public.plan_task_assignments.source is '''norm'' rows are owned by plan_generate_resource_loading() and replaced wholesale on every run; ''manual'' rows (the default) are never touched by it.';

-- A norm's trade label for grouping resources: the norm's own `trade` field if set, else the labor crew role
-- with the most workers per crew (the "anchor" trade a norm's crew is built around), else 'General'.
create or replace function public.plan_norm_trade(p_norm_id uuid)
returns text
language sql
stable
as $$
  select coalesce(
    (select n.trade from public.plan_productivity_norms n where n.id = p_norm_id and n.trade is not null and btrim(n.trade) <> ''),
    (select nr.role_label
       from public.plan_productivity_norm_resources nr
      where nr.norm_id = p_norm_id and nr.kind = 'labor'
      order by nr.workers_per_crew desc, nr.sort_order
      limit 1),
    'General'
  )
$$;

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
    insert into public.plan_resources (project_id, name, resource_type, max_units, unit_label)
    select p_project_id, t.trade || ' - from norms', 'labor', 100, 'worker'
    from _gen_trades t
    where not exists (
      select 1 from public.plan_resources r where r.project_id = p_project_id and r.name = t.trade || ' - from norms'
    )
    returning 1
  )
  select count(*) into v_created from ins;

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

grant execute on function public.plan_generate_resource_loading(uuid) to authenticated;

comment on function public.plan_generate_resource_loading(uuid) is 'Phase 3: rebuilds every "norm"-sourced plan_task_assignments row for a project from its current plan_task_work crew_required. Idempotent (full replace of source=''norm'' rows); never touches source=''manual'' rows or an existing resource''s capacity.';
