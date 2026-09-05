-- Migration: 20260905000003_add_baseline_cost_variance.sql
-- Purpose: Extend the baseline system to snapshot/restore/clear budget_cost
--          (as baseline_cost) alongside the existing start/finish date
--          snapshotting, and extend get_schedule_variance() with duration
--          variance and cost variance. Phase 3 of the MS Project Gap
--          Remediation Plan, section 3 "Baseline duration + cost variance"
--          (docs/04-Business-Modules/06-Planning-Scheduling/13-MSProject-Gap-Remediation-Plan.md).
-- Depends on:
--   public.wbs_tasks.budget_cost / actual_cost
--     (20260527000016_create_wbs_enterprise_tables.sql)
--   public.wbs_tasks.baseline_start_date / baseline_finish_date /
--     baseline_set_at / baseline_set_by
--     (20260530000006_add_baseline_fields_to_wbs_tasks.sql)
--   public.set_baseline / public.clear_baseline / public.activate_baseline
--     (20260904000003_planning_project_tools.sql)
--   public.get_schedule_variance
--     (20260531000004_create_schedule_rpcs.sql)
--
-- This is purely additive: every existing branch (whole-project vs partial
-- task_ids, is_active handling, the wbs_baselines on-conflict upsert, the
-- existing returned/filtered columns) is preserved exactly as-is. The only
-- change is that budget_cost is now captured into baseline_cost wherever
-- start_date/end_date are already captured into baseline_start_date/
-- baseline_finish_date, and get_schedule_variance() gains derived
-- duration/cost variance columns.

-- ── 1. Frozen "as-baselined" cost column ──────────────────────────────────
alter table public.wbs_tasks add column if not exists baseline_cost numeric;

-- ── 2. set_baseline: also snapshot budget_cost → baseline_cost ────────────
create or replace function public.set_baseline(p_project_id uuid, p_number int, p_task_ids uuid[])
returns void
language plpgsql
security invoker
as $$
declare
  v_whole boolean := (p_task_ids is null or array_length(p_task_ids, 1) is null);
  v_new   jsonb;
  v_kept  jsonb := '[]'::jsonb;
begin
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'id', id, 'start_date', start_date, 'end_date', end_date,
             'budget_cost', budget_cost)
                     order by id),
           '[]'::jsonb)
    into v_new
    from public.wbs_tasks
   where project_id = p_project_id
     and start_date is not null and end_date is not null
     and (v_whole or id = any (p_task_ids));

  if not v_whole then
    select coalesce(jsonb_agg(e), '[]'::jsonb)
      into v_kept
      from public.wbs_baselines b,
           lateral jsonb_array_elements(coalesce(b.snapshot_data -> 'tasks', '[]'::jsonb)) e
     where b.project_id = p_project_id
       and b.baseline_number = p_number
       and not ((e ->> 'id')::uuid = any (p_task_ids));
  end if;

  insert into public.wbs_baselines
    (project_id, baseline_number, baseline_name, baseline_type, baseline_date,
     snapshot_data, is_active, set_by, created_by)
  values
    (p_project_id, p_number,
     case when p_number = 0 then 'Baseline' else 'Baseline ' || p_number end,
     'current', current_date,
     jsonb_build_object('set_at', now(), 'tasks', v_kept || v_new),
     v_whole, auth.uid(), auth.uid())
  on conflict (project_id, baseline_number) do update set
     snapshot_data = jsonb_build_object('set_at', now(), 'tasks', v_kept || v_new),
     baseline_date = current_date,
     set_by        = auth.uid(),
     is_active     = case when v_whole then true else public.wbs_baselines.is_active end;

  if v_whole then
    update public.wbs_baselines set is_active = false
     where project_id = p_project_id and baseline_number <> p_number;
  end if;

  update public.wbs_tasks t set
     baseline_start_date  = (e ->> 'start_date')::date,
     baseline_finish_date = (e ->> 'end_date')::date,
     baseline_cost         = (e ->> 'budget_cost')::numeric,
     baseline_set_at      = now(),
     baseline_set_by      = auth.uid()
    from jsonb_array_elements(v_new) e
   where t.id = (e ->> 'id')::uuid and t.project_id = p_project_id;
end
$$;
grant execute on function public.set_baseline(uuid, int, uuid[]) to authenticated;

-- ── 3. clear_baseline: also null baseline_cost when clearing an active baseline ─
create or replace function public.clear_baseline(p_project_id uuid, p_number int, p_task_ids uuid[])
returns void
language plpgsql
security invoker
as $$
declare
  v_whole      boolean := (p_task_ids is null or array_length(p_task_ids, 1) is null);
  v_was_active boolean;
begin
  select is_active into v_was_active
    from public.wbs_baselines
   where project_id = p_project_id and baseline_number = p_number;

  if v_whole then
    delete from public.wbs_baselines
     where project_id = p_project_id and baseline_number = p_number;
  else
    update public.wbs_baselines set snapshot_data = jsonb_build_object(
             'set_at', now(),
             'tasks', coalesce(
               (select jsonb_agg(e)
                  from jsonb_array_elements(coalesce(snapshot_data -> 'tasks', '[]'::jsonb)) e
                 where not ((e ->> 'id')::uuid = any (p_task_ids))),
               '[]'::jsonb))
     where project_id = p_project_id and baseline_number = p_number;
  end if;

  if coalesce(v_was_active, false) then
    update public.wbs_tasks set
       baseline_start_date = null, baseline_finish_date = null,
       baseline_cost = null,
       baseline_set_at = null, baseline_set_by = null
     where project_id = p_project_id and (v_whole or id = any (p_task_ids));
  end if;
end
$$;
grant execute on function public.clear_baseline(uuid, int, uuid[]) to authenticated;

-- ── 4. activate_baseline: also swap baseline_cost from the chosen snapshot ─
create or replace function public.activate_baseline(p_project_id uuid, p_number int)
returns void
language plpgsql
security invoker
as $$
begin
  update public.wbs_baselines set is_active = (baseline_number = p_number)
   where project_id = p_project_id;

  update public.wbs_tasks set
     baseline_start_date = null, baseline_finish_date = null, baseline_cost = null
   where project_id = p_project_id;

  update public.wbs_tasks t set
     baseline_start_date  = (e ->> 'start_date')::date,
     baseline_finish_date = (e ->> 'end_date')::date,
     baseline_cost         = (e ->> 'budget_cost')::numeric,
     baseline_set_at      = now(),
     baseline_set_by      = auth.uid()
    from public.wbs_baselines b,
         lateral jsonb_array_elements(coalesce(b.snapshot_data -> 'tasks', '[]'::jsonb)) e
   where b.project_id = p_project_id and b.baseline_number = p_number
     and t.id = (e ->> 'id')::uuid and t.project_id = p_project_id;
end
$$;
grant execute on function public.activate_baseline(uuid, int) to authenticated;

-- ── 5. get_schedule_variance: add duration + cost variance columns ────────
-- Postgres cannot CREATE OR REPLACE a set-returning function when the OUT
-- column list changes, so the existing function must be dropped first.
-- This is a signature-only change (new derived columns) — no data is lost.
drop function if exists get_schedule_variance(uuid);

create function get_schedule_variance(p_project_id uuid)
returns table (
  task_id                uuid,
  task_code              text,
  task_name              text,
  discipline             text,
  planned_start          date,
  planned_finish         date,
  baseline_start         date,
  baseline_finish        date,
  start_variance_days    int,
  finish_variance_days   int,
  is_delayed             boolean,
  duration_variance_days int,
  baseline_cost          numeric,
  cost_variance          numeric,
  cost_variance_percent  numeric
)
language sql
security invoker
stable
as $$
  select
    id,
    task_code,
    task_name,
    discipline,
    start_date                                 as planned_start,
    end_date                                   as planned_finish,
    baseline_start_date                        as baseline_start,
    baseline_finish_date                       as baseline_finish,
    (start_date - baseline_start_date)::int    as start_variance_days,
    (end_date   - baseline_finish_date)::int   as finish_variance_days,
    end_date > baseline_finish_date            as is_delayed,
    ((end_date - start_date) - (baseline_finish_date - baseline_start_date))::int
                                                as duration_variance_days,
    baseline_cost,
    budget_cost - baseline_cost                as cost_variance,
    case when baseline_cost > 0
         then round((budget_cost - baseline_cost) / baseline_cost * 100, 1)
         else null end                          as cost_variance_percent
  from public.wbs_tasks
  where project_id         = p_project_id
    and baseline_start_date  is not null
    and baseline_finish_date is not null
    and start_date           is not null
    and end_date             is not null
  order by finish_variance_days desc nulls last
$$;