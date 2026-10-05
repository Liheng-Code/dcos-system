-- Module 10-01 Daily Reporting, Phase 3/4: KPI trend, unit performance and
-- productivity benchmark (design 20, 22).
--
-- One read-only function that returns, for a project and a period, the raw
-- counts behind three views:
--
--   units      per reporting unit: reports due, on time, late, missing;
--              how many were returned for correction; how many activity
--              quantities the approver changed. The score is computed by the
--              app from these counts, so its formula is visible in one place.
--   weeks      the same compliance counts per calendar week, for the trend.
--   benchmark  per activity, unit of measure and reporting unit: output per
--              worker-day from approved reports, next to the project's
--              typical (median) daily figure for that activity.
--
-- Verified quantities are used where the approver changed a figure. Approved
-- reports only feed accuracy and productivity.
--
-- For whoever may see the whole project (approvers, management, planners,
-- QS). A reporting unit gets nothing back: its own score is not shown to it.

create or replace function public.dr_performance(p_project_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with gate as (
    select dr_can_view_project(p_project_id) as ok
  ),
  units as (
    select u.id, u.unit_code, u.display_name, u.unit_type
    from dr_reporting_units u, gate
    where gate.ok and u.project_id = p_project_id
  ),
  reports as (
    select r.id, r.unit_id, r.report_date, r.report_kind, r.late_flag, r.approved_version_no, r.warning_count
    from dr_reports r
    join units u on u.id = r.unit_id
    where r.report_date between p_from and p_to and r.submission_state <> 'WITHDRAWN'
  ),
  missing as (
    select m.unit_id, m.report_date
    from dr_missing_reports m
    join units u on u.id = m.unit_id
    where m.report_date between p_from and p_to and m.status = 'Open'
  ),
  returned as (
    select distinct c.report_id
    from dr_correction_requests c
    join reports r on r.id = c.report_id
    where c.request_kind = 'RETURN' and c.status <> 'Draft'
  ),
  lines as (
    select r.unit_id, r.report_date, ap.task_id, lower(btrim(ap.uom)) as uom_key, ap.uom,
           ap.reported_qty, coalesce(vq.verified_qty, ap.reported_qty) as qty, ap.headcount,
           (vq.verified_qty is not null and vq.verified_qty is distinct from ap.reported_qty) as adjusted
    from reports r
    join dr_report_versions v on v.report_id = r.id and v.version_no = r.approved_version_no
    join dr_activity_progress ap on ap.version_id = v.id
    left join dr_verified_quantities vq on vq.version_id = v.id and vq.line_id = ap.line_id
    where r.approved_version_no is not null and r.report_kind = 'WORK'
  ),
  unit_rows as (
    select u.id as unit_id, u.unit_code, u.display_name, u.unit_type,
           (select count(*) from reports r where r.unit_id = u.id) as reports,
           (select count(*) from reports r where r.unit_id = u.id and not r.late_flag) as on_time,
           (select count(*) from reports r where r.unit_id = u.id and r.late_flag) as late,
           (select count(*) from missing m where m.unit_id = u.id) as missing,
           (select count(*) from reports r where r.unit_id = u.id and r.approved_version_no is not null) as approved,
           (select count(*) from reports r where r.unit_id = u.id and r.report_kind = 'NO_WORK') as no_work,
           (select count(*) from reports r join returned x on x.report_id = r.id where r.unit_id = u.id) as returned,
           (select coalesce(sum(r.warning_count), 0) from reports r where r.unit_id = u.id) as warnings,
           (select count(*) from lines l where l.unit_id = u.id and l.reported_qty is not null) as qty_lines,
           (select count(*) from lines l where l.unit_id = u.id and l.adjusted) as adjusted_lines
    from units u
  ),
  week_rows as (
    select d.week_start,
           count(*) filter (where d.kind = 'on_time') as on_time,
           count(*) filter (where d.kind = 'late') as late,
           count(*) filter (where d.kind = 'missing') as missing
    from (
      select date_trunc('week', r.report_date)::date as week_start, case when r.late_flag then 'late' else 'on_time' end as kind from reports r
      union all
      select date_trunc('week', m.report_date)::date, 'missing' from missing m
    ) d
    group by d.week_start
  ),
  -- One figure per unit, activity and day: what one worker produced.
  daily as (
    select l.unit_id, l.task_id, l.uom_key, max(l.uom) as uom, l.report_date,
           sum(l.qty) as qty, sum(l.headcount) as workers
    from lines l
    where l.task_id is not null and l.qty > 0 and l.headcount > 0 and l.uom_key is not null
    group by l.unit_id, l.task_id, l.uom_key, l.report_date
  ),
  typical as (
    select d.task_id, d.uom_key,
           percentile_cont(0.5) within group (order by d.qty / d.workers) as median_per_worker,
           count(*) as days, count(distinct d.unit_id) as units
    from daily d
    group by d.task_id, d.uom_key
  ),
  bench_rows as (
    select d.unit_id, d.task_id, d.uom_key, max(d.uom) as uom, count(*) as days,
           sum(d.qty) as qty, sum(d.workers) as worker_days
    from daily d
    group by d.unit_id, d.task_id, d.uom_key
  )
  select jsonb_build_object(
    'allowed', (select ok from gate),
    'units', (select coalesce(jsonb_agg(to_jsonb(x) order by x.unit_code), '[]'::jsonb) from unit_rows x),
    'weeks', (select coalesce(jsonb_agg(to_jsonb(w) order by w.week_start), '[]'::jsonb) from week_rows w),
    'benchmark', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'unit_id', b.unit_id, 'unit_code', u.unit_code, 'task_id', b.task_id, 'task_code', t.task_code,
               'activity', t.task_name, 'uom', b.uom, 'days', b.days, 'qty', b.qty, 'worker_days', b.worker_days,
               'per_worker', b.qty / b.worker_days,
               'typical_per_worker', ty.median_per_worker, 'typical_days', ty.days, 'typical_units', ty.units)
               order by t.task_code nulls last, b.uom_key, u.unit_code), '[]'::jsonb)
      from bench_rows b
      join units u on u.id = b.unit_id
      join typical ty on ty.task_id = b.task_id and ty.uom_key = b.uom_key
      left join wbs_tasks t on t.id = b.task_id));
$$;

revoke all on function public.dr_performance(uuid, date, date) from public, anon;
grant execute on function public.dr_performance(uuid, date, date) to authenticated, service_role;
