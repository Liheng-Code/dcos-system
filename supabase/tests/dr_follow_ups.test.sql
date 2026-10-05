-- Module 10-01 Daily Reporting: follow-up records in other modules, database tests.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dr_follow_ups.test.sql
-- One transaction, rolled back. "ALL DR FOLLOW-UP TESTS PASSED" means success.

begin;

create temp table t_ctx (k text primary key, v uuid) on commit drop;
grant all on t_ctx to public;

do $$
declare
  v_ids uuid[]; v_project uuid; v_node uuid; v_task uuid; v_unit uuid; v_res jsonb;
begin
  select array_agg(id) into v_ids
  from (select id from public.profiles p where not public.is_admin(p.id) order by created_at limit 3) s;
  delete from public.user_roles where user_id = any (v_ids);

  insert into public.projects (project_code, project_name, project_type, project_manager_id, dr_enabled)
  values ('DRFU-' || substr(gen_random_uuid()::text, 1, 8), 'DR follow-up test', 'internal', v_ids[2], true)
  returning id into v_project;
  insert into public.wbs_nodes (project_id, node_type, wbs_code, wbs_name) values (v_project, 'phase', 'IN', 'In') returning id into v_node;
  insert into public.wbs_tasks (wbs_node_id, project_id, task_code, task_name) values (v_node, v_project, 'A-1', 'Blockwork') returning id into v_task;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at)
  values (v_project, 'SC-FU', 'SUBCONTRACTOR', 'ABC Masonry', 'Active', current_date - 30) returning id into v_unit;
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (v_unit, v_ids[1], 'REPORTER');

  v_res := public.dr_submit_report(
    v_ids[1], v_unit, current_date - 1, 'WORK',
    jsonb_build_object(
      'activities', jsonb_build_array(jsonb_build_object('line_id', 'a1', 'task_id', v_task, 'progress_today', 10)),
      'manpower', jsonb_build_array(jsonb_build_object('line_id', 'm1', 'trade', 'Mason', 'reported_count', 12),
                                    jsonb_build_object('line_id', 'm2', 'trade', 'Helper', 'reported_count', 6)),
      'issues', jsonb_build_array(jsonb_build_object('line_id', 'i1', 'description', 'Lintel detail at grid C4 is missing', 'severity', 'HIGH')),
      'inspections', jsonb_build_array(jsonb_build_object('line_id', 'q1', 'wbs_node_id', v_node, 'reference', 'Wall L06 north')),
      'safety', jsonb_build_object('toolbox_talk_held', true, 'incident_count', 1, 'near_miss_count', 0)),
    'fu-1');

  insert into t_ctx values ('reporter', v_ids[1]), ('pm', v_ids[2]), ('outsider', v_ids[3]), ('project', v_project),
                           ('node', v_node), ('unit', v_unit), ('report', (v_res->>'report_id')::uuid);
end $$;

create or replace function pg_temp.ctx(p text) returns uuid language sql as $$ select v from t_ctx where k = p $$;
create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'TEST FAILED [%]', p_label; end if;
  raise notice 'ok   %', p_label;
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_like text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm not ilike '%' || p_like || '%' then raise exception 'TEST FAILED [%]: wrong error: %', p_label, sqlerrm; end if;
    raise notice 'ok   %', p_label; return;
  end;
  raise exception 'TEST FAILED [%]: expected an error containing "%"', p_label, p_like;
end $$;
create or replace function pg_temp.count_as(p_user uuid, p_sql text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end $$;
create or replace function pg_temp.report_no() returns text language sql as $$
  select report_no from public.dr_reports where id = pg_temp.ctx('report')
$$;

-- 1. Who may raise, and from what.
select pg_temp.expect_error(
  format($q$select public.dr_raise_follow_up(%L, %L, 'RFI', 'i1', '{"title": "Lintel detail", "discipline": "str"}')$q$, pg_temp.ctx('reporter'), pg_temp.ctx('report')),
  'DR_FORBIDDEN', 'the reporter cannot raise a record in another module');
select pg_temp.expect_error(
  format($q$select public.dr_raise_follow_up(%L, %L, 'RFI', 'i1', '{"title": "Lintel detail", "discipline": "str"}')$q$, pg_temp.ctx('outsider'), pg_temp.ctx('report')),
  'DR_FORBIDDEN', 'nor can someone outside the project');
select pg_temp.expect_error(
  format($q$select public.dr_raise_follow_up(%L, %L, 'RFI', 'nope', '{"title": "x", "discipline": "str"}')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'DR_NOT_FOUND', 'an RFI needs an issue that is on the report');
select pg_temp.expect_error(
  format($q$select public.dr_raise_follow_up(%L, %L, 'RFI', 'i1', '{}')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'DR_REQ_FIELD', 'an RFI needs a title');
select pg_temp.expect_error(
  format($q$select public.dr_raise_follow_up(%L, %L, 'RFI', 'i1', '{"title": "Lintel", "discipline": "all"}')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'choose the discipline', 'an RFI needs a discipline that has a list to appear in');
select pg_temp.expect_error(
  format($q$select public.dr_raise_follow_up(%L, %L, 'PAYMENT', 'i1', '{}')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'DR_REQ_FIELD', 'an unknown kind is refused');
select pg_temp.ok(not exists (select 1 from public.design_rfi where project_id = pg_temp.ctx('project')), 'a refused request creates nothing');

-- 2. Issue -> RFI.
select public.dr_raise_follow_up(pg_temp.ctx('pm'), pg_temp.ctx('report'), 'RFI', 'i1', '{"title": "Lintel detail at C4", "discipline": "str"}');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(
            rfi_no = 'RFI-' || pg_temp.report_no() || '-1' and discipline = 'str' and priority = 'high' and status = 'open'
            and title = 'Lintel detail at C4' and question like 'Lintel detail at grid C4 is missing%'
            and question like '%Raised from daily report ' || pg_temp.report_no() || ' (ABC Masonry%' and created_by = pg_temp.ctx('pm'))
   from public.design_rfi where project_id = pg_temp.ctx('project')),
  'the RFI carries the issue text, a priority from its severity, and where it came from');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(section = 'issues' and line_id = 'i1' and reference = 'RFI-' || pg_temp.report_no() || '-1'
                                   and target_id = (select id from public.design_rfi where project_id = pg_temp.ctx('project')))
   from public.dr_follow_ups where report_id = pg_temp.ctx('report') and kind = 'RFI'),
  'the report line is linked to the RFI');
select pg_temp.ok(
  exists (select 1 from public.dr_audit_log where report_id = pg_temp.ctx('report') and event_code = 'DR.FOLLOW_UP_RAISED'
          and details->>'kind' = 'RFI' and actor_id = pg_temp.ctx('pm')),
  'raising it is audited');
select pg_temp.expect_error(
  format($q$select public.dr_raise_follow_up(%L, %L, 'RFI', 'i1', '{"title": "again", "discipline": "str"}')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'already raised', 'the same issue cannot be raised twice');

-- 3. Inspection line -> inspection request.
select public.dr_raise_follow_up(pg_temp.ctx('pm'), pg_temp.ctx('report'), 'INSPECTION_REQUEST', 'q1',
                                 jsonb_build_object('location', 'L06 north wall', 'inspection_date', (current_date + 1)::text));
select pg_temp.ok(
  (select count(*) = 1 and bool_and(
            ir_number = 'IR-' || pg_temp.report_no() || '-1' and status = 'submitted' and wbs_node_id = pg_temp.ctx('node')
            and location = 'L06 north wall' and request_date = current_date - 1 and inspection_date = current_date + 1
            and requested_by = pg_temp.ctx('reporter') and notes like '%Site reference: Wall L06 north%')
   from public.inspection_requests where project_id = pg_temp.ctx('project')),
  'the inspection request carries the location, dates, who asked on site and the site reference');

-- 4. Safety -> incidents: several per report, each completed by the approver.
select pg_temp.expect_error(
  format($q$select public.dr_raise_follow_up(%L, %L, 'HSE_INCIDENT', null, '{"description": "Cut hand"}')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'DR_REQ_FIELD', 'an incident needs a type');
select pg_temp.expect_error(
  format($q$select public.dr_raise_follow_up(%L, %L, 'HSE_INCIDENT', null, '{"incident_type": "first_aid"}')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'DR_REQ_FIELD', 'and a description');
select public.dr_raise_follow_up(pg_temp.ctx('pm'), pg_temp.ctx('report'), 'HSE_INCIDENT', null,
                                 '{"incident_type": "first_aid", "severity": "moderate", "description": "Cut hand on block edge", "location": "L06"}');
select public.dr_raise_follow_up(pg_temp.ctx('pm'), pg_temp.ctx('report'), 'HSE_INCIDENT', null,
                                 '{"incident_type": "near_miss", "description": "Block fell from scaffold"}');
select pg_temp.ok(
  (select count(*) = 2 and count(*) filter (where incident_number = 'INC-' || pg_temp.report_no() || '-1' and incident_type = 'first_aid'
                                                and severity = 'moderate' and status = 'reported' and reported_by = 'ABC Masonry'
                                                and incident_date = current_date - 1) = 1
          and count(*) filter (where incident_number = 'INC-' || pg_temp.report_no() || '-2' and severity = 'minor') = 1
   from public.hse_incidents where project_id = pg_temp.ctx('project')),
  'each incident is recorded with its type, severity, date and the unit that reported it');
select pg_temp.ok(
  (select array_agg(line_id order by line_id) = array['incident-1', 'incident-2'] from public.dr_follow_ups
   where report_id = pg_temp.ctx('report') and kind = 'HSE_INCIDENT'),
  'and linked to the report');

-- 5. Nothing reached the toolbox register before approval; approval records the talk once.
select pg_temp.ok(not exists (select 1 from public.hse_toolbox_talks where project_id = pg_temp.ctx('project')), 'no toolbox talk is recorded before approval');
select public.dr_decide_review(pg_temp.ctx('pm'), pg_temp.ctx('report'), 1, 'APPROVE');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(talk_date = current_date - 1 and topic = 'Daily toolbox talk: ABC Masonry' and attendees_count = 18
                                   and notes like '%' || pg_temp.report_no() || '%' and created_by = pg_temp.ctx('pm'))
   from public.hse_toolbox_talks where project_id = pg_temp.ctx('project')),
  'approval records the toolbox talk with the day''s manpower as attendance');
update public.dr_reports set approved_version_no = null where id = pg_temp.ctx('report');
update public.dr_reports set approved_version_no = 1 where id = pg_temp.ctx('report');
select pg_temp.ok((select count(*) = 1 from public.hse_toolbox_talks where project_id = pg_temp.ctx('project')), 'it is recorded once per report');

-- 6. Visibility and access.
select pg_temp.ok(pg_temp.count_as(pg_temp.ctx('pm'), format('select count(*) from public.dr_follow_ups where report_id = %L', pg_temp.ctx('report'))) = 5,
  'the approver sees all five links');
select pg_temp.ok(pg_temp.count_as(pg_temp.ctx('reporter'), format('select count(*) from public.dr_follow_ups where report_id = %L', pg_temp.ctx('report'))) = 0,
  'the reporting unit does not');
select pg_temp.ok(
  not has_function_privilege('authenticated', 'public.dr_raise_follow_up(uuid, uuid, text, text, jsonb)', 'execute')
  and not has_table_privilege('authenticated', 'public.dr_follow_ups', 'insert'),
  'records are raised through the server only');

do $$ begin raise notice 'ALL DR FOLLOW-UP TESTS PASSED'; end $$;

rollback;
