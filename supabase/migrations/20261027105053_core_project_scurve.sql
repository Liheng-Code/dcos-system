-- Migration: 20261027105053_core_project_scurve.sql
-- Purpose: one project S-curve that combines cost and time (doc 33). Until now planned value came from several places
--   (get_scurve_series: live budget over calendar days; QS: hand-typed qs_cost_baseline; dashboard: a synthetic curve)
--   and none used the frozen baseline cost. This adds:
--   1. progress_snapshots.earned_value / bac, written by capture_progress_snapshot, so the EV history is kept in money.
--      capture_progress_snapshot also weights planned cost by the frozen baseline_cost (else budget_cost).
--   2. project_scurve(project, period 'week'|'month'): cumulative per period
--        pv        baseline dates x baseline_cost (else budget_cost), spread over working days (plan_project_workdays)
--        forecast  current dates x budget_cost, same spread
--        ev        snapshot history + the live value at the data date. The live value is measured on the baseline
--                  (baseline cost x progress of baselined tasks) so it is comparable with pv; at_data_date.ev_total
--                  is the same on the whole current budget.
--        ac        qs_cost_transactions other than 'po' (actual cost)
--        committed qs_cost_transactions of type 'po'
--        certified gross cumulative work value (total_completed_stored) of certified / paid progress claims
--      plus the values at the data date and baseline health (coverage, unbaselined tasks). Indices (SPI, CPI, EAC...)
--      are computed in apps/web/lib/project-scurve.ts.
-- SECURITY INVOKER: wbs_tasks, qs_* and progress_snapshots RLS apply to the caller. Additive only.

-- 1. snapshots carry earned value ----------------------------------------------------------------------
alter table public.progress_snapshots add column if not exists earned_value numeric;
alter table public.progress_snapshots add column if not exists bac numeric;

create or replace function public.capture_progress_snapshot(p_project_id uuid)
returns uuid
language plpgsql
as $function$
declare
  v_id           uuid;
  v_actual_prog  numeric;
  v_planned_prog numeric;
  v_actual_cost  numeric;
  v_planned_cost numeric;
  v_earned       numeric;
  v_bac          numeric;
begin
  -- Actual: budget-weighted progress, earned value in money
  select
    round(case
      when sum(coalesce(budget_cost, 0)) > 0
        then sum(coalesce(budget_cost, 0) * progress / 100.0) / sum(coalesce(budget_cost, 0)) * 100
      else avg(progress)
    end, 1),
    coalesce(sum(coalesce(actual_cost, 0)), 0),
    coalesce(sum(coalesce(budget_cost, 0) * coalesce(progress, 0) / 100.0), 0),
    coalesce(sum(coalesce(budget_cost, 0)), 0)
  into v_actual_prog, v_actual_cost, v_earned, v_bac
  from public.wbs_tasks
  where project_id = p_project_id;

  -- Planned: time-linear over the baseline window, weighted by the frozen baseline cost (else the budget)
  select
    round(case
      when sum(coalesce(baseline_cost, budget_cost, 0)) > 0
        then sum(coalesce(baseline_cost, budget_cost, 0) *
               case
                 when baseline_start_date is null or baseline_finish_date is null then 0
                 when current_date >= baseline_finish_date then 1
                 when current_date <= baseline_start_date then 0
                 else (current_date - baseline_start_date)::numeric / nullif(baseline_finish_date - baseline_start_date, 0)
               end) / sum(coalesce(baseline_cost, budget_cost, 0)) * 100
      else 0
    end, 1),
    coalesce(sum(coalesce(baseline_cost, budget_cost, 0) *
      case
        when baseline_start_date is null or baseline_finish_date is null then 0
        when current_date >= baseline_finish_date then 1
        when current_date <= baseline_start_date then 0
        else (current_date - baseline_start_date)::numeric / nullif(baseline_finish_date - baseline_start_date, 0)
      end), 0)
  into v_planned_prog, v_planned_cost
  from public.wbs_tasks
  where project_id = p_project_id;

  insert into public.progress_snapshots
    (project_id, snapshot_date, planned_progress, actual_progress, planned_cost, actual_cost, earned_value, bac, created_by)
  values
    (p_project_id, current_date, v_planned_prog, v_actual_prog, v_planned_cost, v_actual_cost, v_earned, v_bac, auth.uid())
  on conflict (project_id, snapshot_date) do update
    set planned_progress = excluded.planned_progress,
        actual_progress  = excluded.actual_progress,
        planned_cost     = excluded.planned_cost,
        actual_cost      = excluded.actual_cost,
        earned_value     = excluded.earned_value,
        bac              = excluded.bac
  returning id into v_id;

  return v_id;
end;
$function$;

-- 2. project_scurve ------------------------------------------------------------------------------------
create or replace function public.project_scurve(p_project_id uuid, p_period text default 'week')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_period    text := case when p_period in ('week', 'month') then p_period else 'week' end;
  v_step      interval;
  v_data_date date;
  v_currency  text;
  v_out       jsonb;
begin
  v_step := case v_period when 'week' then interval '7 days' else interval '1 month' end;
  select coalesce(p.data_date, current_date), p.currency into v_data_date, v_currency
    from public.projects p where p.id = p_project_id;
  if v_data_date is null then
    v_data_date := current_date;
  end if;

  with t as (
    select w.id,
           coalesce(w.budget_cost, 0)::numeric as budget,
           coalesce(w.progress, 0)::numeric as progress,
           w.baseline_start_date as bs, w.baseline_finish_date as bf,
           coalesce(w.baseline_cost, w.budget_cost, 0)::numeric as bcost,
           (w.baseline_cost is null and coalesce(w.budget_cost, 0) <> 0) as bcost_fallback,
           w.start_date as s, w.end_date as f
      from public.wbs_tasks w
     where w.project_id = p_project_id
  ),
  -- money spread over working days: 'pv' on baseline dates, 'fc' on current dates
  src as (
    select 'pv'::text as kind, id, bcost as v, bs as s, bf as f from t
     where bs is not null and bf is not null and bf >= bs and bcost <> 0
    union all
    select 'fc', id, budget, s, f from t
     where s is not null and f is not null and f >= s and budget <> 0
  ),
  costs as (
    select coalesce(c.cost_date, c.invoice_date, c.created_at::date) as d,
           coalesce(c.base_currency_amount, c.total_cost, 0)::numeric as v,
           (c.transaction_type = 'po') as committed
      from public.qs_cost_transactions c
     where c.project_id = p_project_id
  ),
  claims as (
    select coalesce(q.certified_at::date, q.period_end) as d, coalesce(q.total_completed_stored, 0)::numeric as v
      from public.qs_progress_claims q
     where q.project_id = p_project_id and q.status in ('certified', 'paid')
       and coalesce(q.certified_at::date, q.period_end) is not null
  ),
  snaps as (
    select s.snapshot_date as d,
           coalesce(s.earned_value,
                    s.actual_progress / 100.0 * coalesce(s.bac, (select sum(budget) from t))) as v
      from public.progress_snapshots s
     where s.project_id = p_project_id and s.wbs_node_id is null
  ),
  tspan as (select min(s) as lo, max(f) as hi from src),
  -- cost, claim and snapshot dates widen the chart, but at most a year beyond the programme, so one mistyped date
  -- cannot stretch it past the 10-year limit of plan_project_workdays
  span as (
    select least(coalesce(ts.lo, v_data_date), v_data_date,
                 (select case when min(d) is null then null else greatest(min(d), coalesce(ts.lo, v_data_date) - 365) end from costs),
                 (select case when min(d) is null then null else greatest(min(d), coalesce(ts.lo, v_data_date) - 365) end from claims),
                 (select case when min(d) is null then null else greatest(min(d), coalesce(ts.lo, v_data_date) - 365) end from snaps)) as lo,
           greatest(coalesce(ts.hi, v_data_date), v_data_date,
                 (select case when max(d) is null then null else least(max(d), coalesce(ts.hi, v_data_date) + 365) end from costs),
                 (select case when max(d) is null then null else least(max(d), coalesce(ts.hi, v_data_date) + 365) end from claims)) as hi
      from tspan ts
  ),
  wd as (
    select w.work_date from span, public.plan_project_workdays(p_project_id, span.lo, span.hi) w
  ),
  td as (select src.kind, src.id, src.v, wd.work_date from src join wd on wd.work_date between src.s and src.f),
  n  as (select kind, id, count(*)::numeric as c from td group by kind, id),
  alloc as (
    select td.kind, td.work_date as d, td.v / n.c as v from td join n using (kind, id)
    union all  -- no working day inside the task: book it on its start date
    select src.kind, src.s, src.v from src where not exists (select 1 from n where n.kind = src.kind and n.id = src.id)
  ),
  -- cumulative per day, so each period reads one row instead of re-summing every allocation
  daily as (
    select kind, d, sum(sum(v)) over (partition by kind order by d) as cum
      from alloc group by kind, d
  ),
  periods as (
    select gs::date as p, (gs + v_step - interval '1 day')::date as pend
      from span, generate_series(public.plan_period_start(span.lo, v_period)::timestamp, span.hi::timestamp, v_step) gs
  ),
  rows as (
    select pr.p, pr.pend,
           coalesce((select cum from daily a where a.kind = 'pv' and a.d <= pr.pend order by a.d desc limit 1), 0) as pv,
           coalesce((select cum from daily a where a.kind = 'fc' and a.d <= pr.pend order by a.d desc limit 1), 0) as fc,
           (pr.p <= v_data_date) as reached,
           case when pr.p <= v_data_date and v_data_date <= pr.pend
                then (select sum(bcost * progress / 100.0) from t where bs is not null and bf is not null and bf >= bs)
                else (select v from snaps s where s.d <= pr.pend order by s.d desc limit 1) end as ev,
           (select coalesce(sum(v), 0) from costs c where not c.committed and c.d <= least(pr.pend, v_data_date)) as ac,
           (select coalesce(sum(v), 0) from costs c where c.committed and c.d <= least(pr.pend, v_data_date)) as cm,
           (select coalesce(max(v), 0) from claims c where c.d <= least(pr.pend, v_data_date)) as ce
      from periods pr
  ),
  active_bl as (
    select b.baseline_number, b.baseline_name, b.baseline_date
      from public.wbs_baselines b where b.project_id = p_project_id and b.is_active
     order by b.created_at desc limit 1
  )
  select jsonb_build_object(
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object(
               'period', r.p,
               'pv', round(r.pv, 2),
               'forecast', round(r.fc, 2),
               'ev', case when r.reached then round(r.ev, 2) end,
               'ac', case when r.reached then round(r.ac, 2) end,
               'committed', case when r.reached then round(r.cm, 2) end,
               'certified', case when r.reached then round(r.ce, 2) end) order by r.p)
        from rows r), '[]'::jsonb),
    'at_data_date', jsonb_build_object(
      'pv',        (select round(coalesce(sum(v), 0), 2) from alloc where kind = 'pv' and d <= v_data_date),
      'forecast',  (select round(coalesce(sum(v), 0), 2) from alloc where kind = 'fc' and d <= v_data_date),
      'ev',        (select round(coalesce(sum(bcost * progress / 100.0), 0), 2) from t where bs is not null and bf is not null and bf >= bs),
      'ev_total',  (select round(coalesce(sum(budget * progress / 100.0), 0), 2) from t),
      'ac',        (select round(coalesce(sum(v), 0), 2) from costs where not committed and d <= v_data_date),
      'committed', (select round(coalesce(sum(v), 0), 2) from costs where committed and d <= v_data_date),
      'certified', (select round(coalesce(max(v), 0), 2) from claims where d <= v_data_date)
    ),
    'meta', jsonb_build_object(
      'period',            v_period,
      'data_date',         v_data_date,
      'currency',          v_currency,
      'start',             (select lo from span),
      'finish',            (select hi from span),
      'bac',               (select round(coalesce(sum(v), 0), 2) from src where kind = 'pv'),
      'budget_total',      (select round(coalesce(sum(budget), 0), 2) from t),
      'boq_total',         (select round(coalesce(sum(i.total_amount), 0), 2) from public.qs_boq_items i where i.project_id = p_project_id),
      'unbaselined_tasks', (select count(*) from t where budget <> 0 and (bs is null or bf is null)),
      'unbaselined_budget',(select round(coalesce(sum(budget), 0), 2) from t where budget <> 0 and (bs is null or bf is null)),
      'pv_fallback_tasks', (select count(*) from t where bs is not null and bf is not null and bcost_fallback),
      'baseline_number',   (select baseline_number from active_bl),
      'baseline_name',     (select baseline_name from active_bl),
      'baseline_date',     (select baseline_date from active_bl),
      'snapshots',         (select count(*) from snaps)
    )
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.project_scurve(uuid, text) from public, anon;
grant execute on function public.project_scurve(uuid, text) to authenticated;
