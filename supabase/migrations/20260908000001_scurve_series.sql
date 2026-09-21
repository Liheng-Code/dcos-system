-- Migration: 20260908000001_scurve_series.sql
-- Purpose: Schedule-derived S-Curve / EVM series for Planning ▸ S-Curve & EVM.
--   1. RLS policy for progress_snapshots — the table was created with RLS enabled
--      but no policy (20260531000003), so capture / select are denied for the
--      `authenticated` role (capture_progress_snapshot is SECURITY INVOKER).
--   2. get_scurve_series(project) — an analytic planned (BCWS) curve computed from
--      wbs_tasks baseline_start_date / baseline_finish_date spread time-linearly,
--      weighted per project by cost → duration → equal; plus the persisted actual
--      snapshots and a live "today" earned point. Read-only.
-- Depends on:
--   public.wbs_tasks.baseline_start_date / baseline_finish_date / budget_cost /
--     actual_cost / duration_days / progress
--   public.progress_snapshots (20260531000003)
--   public.capture_progress_snapshot (20260531000009) — unchanged, still the
--     persistence path for the actual line.

-- ── 1. RLS policy for progress_snapshots ────────────────────────────────────
alter table public.progress_snapshots enable row level security;
drop policy if exists "auth_progress_snapshots" on public.progress_snapshots;
create policy "auth_progress_snapshots" on public.progress_snapshots
  for all to authenticated using (true) with check (true);

-- ── 2. get_scurve_series ───────────────────────────────────────────────────
create or replace function public.get_scurve_series(p_project_id uuid)
returns jsonb
language sql
security invoker
stable
as $$
with flags as (
  select
    coalesce(bool_or(coalesce(budget_cost, 0) > 0), false)   as has_budget,
    coalesce(bool_or(coalesce(duration_days, 0) > 0), false) as has_duration
  from public.wbs_tasks
  where project_id = p_project_id
),
t as (
  select
    baseline_start_date  as bs,
    baseline_finish_date as bf,
    coalesce(budget_cost, 0) as cost,
    case
      when (select has_budget   from flags) then coalesce(budget_cost, 0)
      when (select has_duration from flags) then coalesce(duration_days, 0)
      else 1
    end as w,
    coalesce(progress, 0)    as progress,
    coalesce(actual_cost, 0) as ac
  from public.wbs_tasks
  where project_id = p_project_id
    and baseline_start_date  is not null
    and baseline_finish_date is not null
),
params as (
  select min(bs) as w_start, max(bf) as w_end from t
),
periods as (
  select gs::date as d
  from params p,
       generate_series(
         date_trunc('week', p.w_start::timestamp),
         p.w_end::timestamp,
         case when (p.w_end - p.w_start) > 1095
              then interval '1 month' else interval '7 days' end
       ) gs
  where p.w_start is not null
  union
  select w_end from params where w_end is not null
),
planned as (
  select
    pr.d,
    sum(t.w    * fr.f) as pw,
    sum(t.cost * fr.f) as pv
  from periods pr
  cross join t
  cross join lateral (
    select case
      when t.bf <= t.bs then case when pr.d >= t.bf then 1.0 else 0.0 end
      when pr.d >= t.bf then 1.0
      when pr.d <= t.bs then 0.0
      else (pr.d - t.bs)::numeric / nullif((t.bf - t.bs), 0)::numeric
    end as f
  ) fr
  group by pr.d
),
totals as (
  select
    coalesce(sum(w), 0)                    as bac_w,
    coalesce(sum(cost), 0)                 as bac_cost,
    coalesce(sum(w * progress / 100.0), 0) as ev_w,
    coalesce(sum(ac), 0)                   as ac_now
  from t
)
select jsonb_build_object(
  'planned', coalesce((
    select jsonb_agg(jsonb_build_object(
             'date',  pl.d,
             'pct',   round(case when tt.bac_w > 0 then pl.pw / tt.bac_w * 100 else 0 end, 2),
             'value', round(pl.pv, 2)
           ) order by pl.d)
    from planned pl cross join totals tt
  ), '[]'::jsonb),
  'actual', coalesce((
    select jsonb_agg(jsonb_build_object(
             'date',        s.snapshot_date,
             'pct',         s.actual_progress,
             'value',       s.actual_cost,
             'planned_pct', s.planned_progress
           ) order by s.snapshot_date)
    from public.progress_snapshots s
    where s.project_id = p_project_id
      and s.wbs_node_id is null
  ), '[]'::jsonb),
  'live', (
    select jsonb_build_object(
             'date',  current_date,
             'pct',   round(case when tt.bac_w > 0 then tt.ev_w / tt.bac_w * 100 else 0 end, 2),
             'value', round(tt.ac_now, 2)
           )
    from totals tt
  ),
  'meta', jsonb_build_object(
    'baselined',    (select count(*) from t),
    'total_tasks',  (select count(*) from public.wbs_tasks where project_id = p_project_id),
    'weight_basis', (select case when has_budget then 'cost'
                                 when has_duration then 'duration'
                                 else 'equal' end from flags),
    'has_cost',     (select has_budget from flags),
    'bac_cost',     (select round(bac_cost, 2) from totals),
    'window_start', (select w_start from params),
    'window_end',   (select w_end   from params)
  )
);
$$;

grant execute on function public.get_scurve_series(uuid) to authenticated;

-- ── 3. GRANT EXECUTE on capture_progress_snapshot ────────────────────────────
-- Without this grant, PostgREST returns 404 (function not exposed to the role).
grant execute on function public.capture_progress_snapshot(uuid) to authenticated;
