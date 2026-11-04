-- Phase U1 (doc 35; PRD doc 34 §6.1 guided planning mode): programme readiness checklist.
-- plan_programme_readiness(project) returns, in one call, the facts behind the 11 guided steps
-- (project dates, WBS, BOQ, activities, durations, logic, calculation, QA/QC, baseline / revision).
-- The steps and their status are worked out in the app (lib/planning/readiness/programme-readiness.ts).
-- Read-only. Security definer with an explicit member + Planning schedule view check, because the facts
-- include counts from QS tables the planner may not read row by row.

create or replace function public.plan_programme_readiness(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tender uuid;
  v_out    jsonb;
begin
  if not (public.is_project_member(p_project_id) and public.has_permission('planning', 'schedule', 'view')) then
    raise exception 'Not allowed to view this project''s programme' using errcode = '42501';
  end if;

  -- the tender Generate from BOQ uses: awarded, else the latest that is not cancelled
  select id into v_tender from public.tender_register
   where project_id = p_project_id and status <> 'cancelled'
   order by (status = 'awarded') desc, created_at desc, id desc
   limit 1;

  with t as (
    select id, coalesce(is_milestone, false) as milestone, coalesce(progress, 0) as progress, duration_days,
           activity_master_id, generation_run_id, dependency_task_ids, updated_at
      from public.wbs_tasks where project_id = p_project_id
  ),
  succ as (
    select distinct unnest(dependency_task_ids) as id from t
  ),
  open_ends as (
    select count(*) filter (where progress < 100) as incomplete,
           count(*) filter (where progress < 100 and (coalesce(cardinality(dependency_task_ids), 0) = 0
                                                     or id not in (select s.id from succ s where s.id is not null))) as open_ended
      from t
  )
  select jsonb_build_object(
    'project', (select jsonb_build_object('code', p.project_code, 'type', p.project_type, 'status', p.project_status,
                                          'start_date', p.start_date, 'end_date', p.end_date, 'data_date', p.data_date)
                  from public.projects p where p.id = p_project_id),
    'project_calendar', exists (select 1 from public.plan_calendars c where c.project_id = p_project_id),
    'wbs', (select jsonb_build_object('nodes', count(*),
                                      'levels', count(*) filter (where node_type in ('level', 'segment')),
                                      'buildings', count(*) filter (where node_type = 'building'))
              from public.wbs_nodes where project_id = p_project_id),
    'boq', jsonb_build_object(
      'contract_lines', (select count(*) from public.qs_boq_items q
                           join public.qs_boq_sections s on s.id = q.boq_section_id
                           join public.qs_boq b on b.id = s.boq_id
                          where q.project_id = p_project_id and b.boq_type = 'main_works'),
      'tender_lines', (select count(*) from public.tender_boq_items where tender_id = v_tender),
      'has_tender', v_tender is not null),
    'tasks', (select jsonb_build_object(
                'total', count(*),
                'activities', count(*) filter (where not milestone),
                'generated', count(*) filter (where activity_master_id is not null or generation_run_id is not null),
                'with_duration', count(*) filter (where not milestone and coalesce(duration_days, 0) > 0),
                'last_change', max(updated_at))
                from t),
    'work', (select jsonb_build_object('rows', count(*), 'with_norm', count(*) filter (where norm_id is not null),
                                       'calculated', count(*) filter (where calc_status = 'ok'))
               from public.plan_task_work where project_id = p_project_id),
    'logic', (select jsonb_build_object('incomplete', incomplete, 'open_ended', open_ended) from open_ends),
    'calculation', (select jsonb_build_object('at', c.created_at, 'finish', c.project_finish, 'critical', c.critical_count,
                                              'warnings', coalesce(jsonb_array_length(case when jsonb_typeof(c.warnings) = 'array' then c.warnings end), 0))
                      from public.plan_schedule_calculations c where c.project_id = p_project_id
                     order by c.created_at desc limit 1),
    'qaqc', (select jsonb_build_object('at', r.created_at, 'failed', r.failed, 'critical_failed', r.critical_failed,
                                       'open_critical', (select count(*) from public.plan_schedule_qaqc_findings f
                                                          where f.project_id = p_project_id and f.status = 'open' and f.severity = 'critical'))
               from public.plan_schedule_qaqc_runs r where r.project_id = p_project_id
              order by r.created_at desc limit 1),
    'baseline', (select jsonb_build_object('approved', count(*) filter (where status = 'approved'),
                                           'pending', count(*) filter (where status = 'pending'),
                                           'last_approved', max(decided_at) filter (where status = 'approved'))
                   from public.wbs_baselines where project_id = p_project_id),
    'revision', (select jsonb_build_object('status', r.status, 'number', r.revision_number, 'submitted_at', r.submitted_at)
                   from public.plan_schedule_revisions r
                   join public.plan_schedule_streams s on s.id = r.stream_id
                  where s.project_id = p_project_id
                  order by r.created_at desc limit 1)
  ) into v_out
  from open_ends;

  return v_out;
end;
$$;

revoke all on function public.plan_programme_readiness(uuid) from public, anon;
grant execute on function public.plan_programme_readiness(uuid) to authenticated;
