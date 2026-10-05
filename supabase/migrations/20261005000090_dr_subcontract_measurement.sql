-- Module 10-01 Daily Reporting, Phase 3: measurement support for the
-- subcontractor payment certificate (design 6, D15).
--
-- A read-only view of what a subcontract's reporting units reported and what
-- the approver verified, over a period, for the QS who certifies a payment.
--
-- Boundary (D15): a reported quantity is the reporter's statement and a
-- verified quantity is the approver's site check. Neither is a measured or
-- certified quantity. This function only reads; Daily Reporting has no write
-- path to subcontract_ipcs or subcontract_ipc_items, and this file adds none.
--
-- Approved reports only. Reports of the period that are not approved yet are
-- counted, so the reader knows the figures are incomplete, but their
-- quantities are left out.
--
-- security invoker: the caller sees what the row-level security of the report
-- tables lets them see (project-wide viewers such as QS, and a unit's own
-- reporters for their own unit).

create or replace function public.dr_subcontract_measurement(p_subcontract_id uuid, p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with units as (
    select u.id, u.unit_code, u.display_name
    from dr_reporting_units u
    where u.subcontract_id = p_subcontract_id
  ),
  reports as (
    select r.id, r.unit_id, r.report_date, r.report_kind, r.approved_version_no, r.submission_state
    from dr_reports r
    join units u on u.id = r.unit_id
    where r.report_date between p_from and p_to
      and r.submission_state <> 'WITHDRAWN'
  ),
  lines as (
    select r.unit_id, r.report_date, ap.task_id, ap.wbs_node_id, ap.free_text_activity,
           lower(btrim(ap.uom)) as uom_key, ap.uom, ap.reported_qty, ap.progress_before, ap.progress_today,
           vq.verified_qty
    from reports r
    join dr_report_versions v on v.report_id = r.id and v.version_no = r.approved_version_no
    join dr_activity_progress ap on ap.version_id = v.id
    left join dr_verified_quantities vq on vq.version_id = v.id and vq.line_id = ap.line_id
    where r.approved_version_no is not null and r.report_kind = 'WORK'
  ),
  grouped as (
    select l.unit_id, l.task_id, l.wbs_node_id,
           case when l.task_id is null then l.free_text_activity end as free_text_activity,
           l.uom_key,
           max(l.uom) as uom,
           count(distinct l.report_date) as days,
           min(l.report_date) as first_date,
           max(l.report_date) as last_date,
           sum(l.reported_qty) as reported_qty,
           -- The approver's figure where one was given, the reported one where the line was accepted as it stood.
           sum(coalesce(l.verified_qty, l.reported_qty)) as verified_qty,
           count(*) filter (where l.verified_qty is not null and l.verified_qty is distinct from l.reported_qty) as adjusted_lines,
           (array_agg(l.progress_before order by l.report_date))[1] as progress_from,
           (array_agg(l.progress_today order by l.report_date desc))[1] as progress_to
    from lines l
    group by l.unit_id, l.task_id, l.wbs_node_id, case when l.task_id is null then l.free_text_activity end, l.uom_key
  )
  select jsonb_build_object(
    'units', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', u.id, 'unit_code', u.unit_code, 'display_name', u.display_name)
                                        order by u.unit_code), '[]'::jsonb) from units u),
    'coverage', jsonb_build_object(
      'approved', (select count(*) from reports where approved_version_no is not null),
      'pending', (select count(*) from reports where approved_version_no is null),
      'no_work', (select count(*) from reports where approved_version_no is not null and report_kind = 'NO_WORK')),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'unit_id', g.unit_id, 'unit_code', u.unit_code,
               'task_id', g.task_id, 'task_code', t.task_code,
               'activity', coalesce(t.task_name, g.free_text_activity, 'Activity'),
               'wbs_node_id', g.wbs_node_id, 'wbs_code', n.wbs_code, 'wbs_name', n.wbs_name,
               'uom', g.uom, 'days', g.days, 'first_date', g.first_date, 'last_date', g.last_date,
               'reported_qty', g.reported_qty, 'verified_qty', g.verified_qty, 'adjusted_lines', g.adjusted_lines,
               'progress_from', g.progress_from, 'progress_to', g.progress_to)
               order by u.unit_code, n.wbs_code nulls last, t.task_code nulls last, g.uom_key nulls last), '[]'::jsonb)
      from grouped g
      join units u on u.id = g.unit_id
      left join wbs_tasks t on t.id = g.task_id
      left join wbs_nodes n on n.id = g.wbs_node_id));
$$;

revoke all on function public.dr_subcontract_measurement(uuid, date, date) from public, anon;
grant execute on function public.dr_subcontract_measurement(uuid, date, date) to authenticated, service_role;
