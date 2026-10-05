-- Module 10-01 Daily Reporting: AI assurance (queue, runs, findings, visibility), database tests.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dr_ai_assurance.test.sql
-- One transaction, rolled back. "ALL DR AI ASSURANCE TESTS PASSED" means success.

begin;

create temp table t_ctx (k text primary key, v uuid) on commit drop;
grant all on t_ctx to public;

do $$
declare
  v_ids uuid[]; v_project uuid; v_node uuid; v_task uuid; v_unit uuid;
begin
  select array_agg(id) into v_ids
  from (select id from public.profiles p where not public.is_admin(p.id) order by created_at limit 3) s;
  delete from public.user_roles where user_id = any (v_ids);

  insert into public.projects (project_code, project_name, project_type, project_manager_id, dr_enabled)
  values ('DRAI-' || substr(gen_random_uuid()::text, 1, 8), 'DR AI test', 'internal', v_ids[2], true)
  returning id into v_project;
  insert into public.wbs_nodes (project_id, node_type, wbs_code, wbs_name) values (v_project, 'phase', 'IN', 'In') returning id into v_node;
  insert into public.wbs_tasks (wbs_node_id, project_id, task_code, task_name) values (v_node, v_project, 'A-1', 'Blockwork') returning id into v_task;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at)
  values (v_project, 'SC-AI', 'SUBCONTRACTOR', 'ABC Masonry', 'Active', current_date - 30) returning id into v_unit;
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (v_unit, v_ids[1], 'REPORTER');

  insert into t_ctx values ('reporter', v_ids[1]), ('pm', v_ids[2]), ('outsider', v_ids[3]), ('project', v_project), ('task', v_task), ('unit', v_unit);
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
-- A count as a signed-in user, under row-level security.
create or replace function pg_temp.count_as(p_user uuid, p_sql text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  begin
    execute p_sql into n;
  exception when insufficient_privilege then
    n := -1;
  end;
  reset role;
  return n;
end $$;
-- A write as a signed-in user; returns rows touched, or -1 when refused.
create or replace function pg_temp.write_as(p_user uuid, p_sql text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  begin
    execute p_sql;
    get diagnostics n = row_count;
  exception when insufficient_privilege or check_violation then
    n := -1;
  end;
  reset role;
  return n;
end $$;
-- Submits a report for the day `p_days_ago`, with or without a photo on its activity.
create or replace function pg_temp.submit(p_days_ago int, p_photo boolean) returns uuid language plpgsql as $$
declare v jsonb;
begin
  v := public.dr_submit_report(
    pg_temp.ctx('reporter'), pg_temp.ctx('unit'), current_date - p_days_ago, 'WORK',
    jsonb_build_object('activities', jsonb_build_array(jsonb_build_object('line_id', 'a1', 'task_id', pg_temp.ctx('task'), 'progress_today', 10 + p_days_ago))),
    'ai-' || p_days_ago, 'WEB', now(), '[]'::jsonb,
    case when p_photo then jsonb_build_array(jsonb_build_object(
      'storage_key', pg_temp.ctx('project') || '/' || pg_temp.ctx('unit') || '/d' || p_days_ago || '.jpg',
      'mime_type', 'image/jpeg', 'size_bytes', 1000, 'sha256', 'sha-' || p_days_ago,
      'target_section', 'activities', 'target_line_id', 'a1', 'scan_status', 'Available', 'scan_engine', 'test'))
    else '[]'::jsonb end);
  return (v->>'report_id')::uuid;
end $$;
create or replace function pg_temp.state(p_report uuid) returns text language sql as $$
  select assurance_state from public.dr_reports where id = p_report
$$;
create or replace function pg_temp.version_of(p_report uuid) returns uuid language sql as $$
  select v.id from public.dr_report_versions v join public.dr_reports r on r.id = v.report_id and r.current_version_no = v.version_no
  where r.id = p_report
$$;
create or replace function pg_temp.claimed() returns int language sql as $$
  select count(*)::int from public.dr_ai_claim('EVIDENCE_ASSESSMENT', 10) c where c.project_id = pg_temp.ctx('project')
$$;

-- 1. Off by default: nothing is claimed until the project switches it on.
insert into t_ctx values ('r1', pg_temp.submit(1, true));
select pg_temp.ok(pg_temp.claimed() = 0, 'a project that has not switched AI on is never assessed');

select pg_temp.ok(
  pg_temp.write_as(pg_temp.ctx('reporter'), format('insert into public.dr_ai_project_settings (project_id, evidence_assessment_enabled) values (%L, true)', pg_temp.ctx('project'))) = -1,
  'a reporter cannot switch AI on');
insert into public.dr_ai_project_settings (project_id, evidence_assessment_enabled, daily_report_limit)
values (pg_temp.ctx('project'), true, 2);
select pg_temp.ok(
  exists (select 1 from public.dr_audit_log where project_id = pg_temp.ctx('project') and event_code = 'DR.AI_SETTINGS_CHANGED'
          and (details->>'evidence_assessment_enabled')::boolean and details->>'daily_report_limit' = '2'),
  'switching AI on is audited');

-- 2. Claim, and no double claim.
select pg_temp.ok(pg_temp.claimed() = 1, 'the waiting report is claimed');
select pg_temp.ok(pg_temp.state(pg_temp.ctx('r1')) = 'AI_RUNNING', 'a claimed report is marked AI_RUNNING');
select pg_temp.ok(pg_temp.claimed() = 0, 'a report being assessed is not claimed twice');

-- 3. A failed attempt: the report goes on to the approver, and is retried later.
select public.dr_ai_record_run('EVIDENCE_ASSESSMENT', pg_temp.version_of(pg_temp.ctx('r1')), 'FAILED', 'test-model', 'evidence-v1',
                               null, null, 0, 'timeout', now(), '[]'::jsonb);
select pg_temp.ok(pg_temp.state(pg_temp.ctx('r1')) = 'AI_UNAVAILABLE', 'a failed run leaves the report AI_UNAVAILABLE, not blocked');
select pg_temp.ok(
  (select review_state = 'AWAITING_REVIEW' and submission_state = 'SUBMITTED' from public.dr_reports where id = pg_temp.ctx('r1')),
  'and it stays with the approver');
select pg_temp.ok(pg_temp.claimed() = 0, 'a failed report is not retried at once');
update public.dr_reports set assurance_claimed_at = now() - interval '11 minutes' where id = pg_temp.ctx('r1');
select pg_temp.ok(pg_temp.claimed() = 1, 'it is retried once the wait has passed');

-- 4. A successful run stores findings and settles the state.
select public.dr_ai_record_run(
  'EVIDENCE_ASSESSMENT', pg_temp.version_of(pg_temp.ctx('r1')), 'SUCCEEDED', 'test-model', 'evidence-v1', 1200, 80, 1, null, now(),
  '[{"finding_type": "EVIDENCE_UNCLEAR", "severity": "WARNING", "assessment": "UNCLEAR", "message": "Photo shows formwork, not blockwork.",
     "target": {"section": "activities", "line_id": "a1"}, "source_refs": ["evidence:x"], "recommended_action": "REQUEST_ADDITIONAL_EVIDENCE"}]'::jsonb);
select pg_temp.ok(pg_temp.state(pg_temp.ctx('r1')) = 'COMPLETE', 'a successful run marks the report COMPLETE');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(assessment = 'UNCLEAR' and model = 'test-model' and prompt_version = 'evidence-v1'
                                   and unit_id = pg_temp.ctx('unit') and version_no = 1)
   from public.dr_ai_findings where report_id = pg_temp.ctx('r1')),
  'the finding is stored with its model and prompt version');
select pg_temp.ok(
  (select count(*) = 2 from public.dr_audit_log where report_id = pg_temp.ctx('r1') and event_code = 'DR.AI_RUN'),
  'every run is audited');
select pg_temp.ok(pg_temp.claimed() = 0, 'an assessed version is not assessed again');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(payload->'activities'->0->>'progress_today' = '11')
   from public.dr_report_versions where report_id = pg_temp.ctx('r1'))
  and (select review_state = 'AWAITING_REVIEW' and approved_version_no is null from public.dr_reports where id = pg_temp.ctx('r1')),
  'the run changed nothing in the report, its versions or its review');

-- 5. Runs and findings are append-only, and the answer is held to the schema.
select pg_temp.expect_error($q$update public.dr_ai_findings set message = 'x'$q$, 'DR_IMMUTABLE', 'a finding cannot be changed');
select pg_temp.expect_error($q$delete from public.dr_ai_runs$q$, 'DR_IMMUTABLE', 'a run cannot be deleted');
select pg_temp.expect_error(
  format($q$select public.dr_ai_record_run('EVIDENCE_ASSESSMENT', %L, 'SUCCEEDED', 'm', 'p', null, null, 0, null, now(),
            '[{"finding_type": "X", "severity": "WARNING", "assessment": "APPROVE_IT", "message": "m"}]'::jsonb)$q$, pg_temp.version_of(pg_temp.ctx('r1'))),
  'dr_ai_findings_assessment_check', 'an assessment outside the four categories is refused');
select pg_temp.expect_error(
  format($q$select public.dr_ai_record_run('EVIDENCE_ASSESSMENT', %L, 'APPROVED', 'm', 'p')$q$, pg_temp.version_of(pg_temp.ctx('r1'))),
  'DR_STATE', 'a run can only be recorded as succeeded or failed');

-- 6. Visibility: approvers only.
select pg_temp.ok(pg_temp.count_as(pg_temp.ctx('pm'), format('select count(*) from public.dr_ai_findings where report_id = %L', pg_temp.ctx('r1'))) = 1,
  'the approver sees the finding');
select pg_temp.ok(pg_temp.count_as(pg_temp.ctx('reporter'), format('select count(*) from public.dr_ai_findings where report_id = %L', pg_temp.ctx('r1'))) = 0,
  'the reporter of the unit does not see the finding');
select pg_temp.ok(pg_temp.count_as(pg_temp.ctx('reporter'), format('select count(*) from public.dr_ai_runs where report_id = %L', pg_temp.ctx('r1'))) = 0,
  'nor the run');
select pg_temp.ok(pg_temp.count_as(pg_temp.ctx('outsider'), format('select count(*) from public.dr_ai_findings where report_id = %L', pg_temp.ctx('r1'))) = 0,
  'nor does someone outside the project');
select pg_temp.ok(
  pg_temp.write_as(pg_temp.ctx('pm'), $q$insert into public.dr_ai_findings (run_id, report_id, version_id, version_no, project_id, capability, finding_type, severity, assessment, message)
                                        select run_id, report_id, version_id, version_no, project_id, capability, 'X', 'INFO', 'SUPPORTED', 'forged' from public.dr_ai_findings limit 1$q$) = -1,
  'nobody writes a finding through the app, not even the approver');

-- 7. The approver rates a finding.
select pg_temp.ok(
  pg_temp.write_as(pg_temp.ctx('reporter'), format($q$insert into public.dr_ai_finding_feedback (finding_id, verdict, decided_by)
     select id, 'DISMISSED', %L from public.dr_ai_findings where report_id = %L$q$, pg_temp.ctx('reporter'), pg_temp.ctx('r1'))) <= 0
  and not exists (select 1 from public.dr_ai_finding_feedback),
  'a reporter cannot rate a finding');
select pg_temp.ok(
  pg_temp.write_as(pg_temp.ctx('pm'), format($q$insert into public.dr_ai_finding_feedback (finding_id, verdict, decided_by)
     select id, 'ACCEPTED', %L from public.dr_ai_findings f where f.report_id = %L$q$, pg_temp.ctx('pm'), pg_temp.ctx('r1'))) = 1,
  'the approver rates the finding');
select pg_temp.ok(
  (select verdict = 'ACCEPTED' and decided_by = pg_temp.ctx('pm') and project_id = pg_temp.ctx('project') from public.dr_ai_finding_feedback),
  'the rating is stamped with the project and who gave it');
select pg_temp.ok(
  pg_temp.write_as(pg_temp.ctx('pm'), $q$update public.dr_ai_finding_feedback set verdict = 'DISMISSED'$q$) = 1,
  'and can change it');
select pg_temp.ok((select verdict = 'DISMISSED' from public.dr_ai_finding_feedback), 'the changed rating is stored');

-- 8. No photo on any activity: settled without a model call.
insert into t_ctx values ('r2', pg_temp.submit(2, false));
select pg_temp.ok(pg_temp.claimed() = 0, 'a report with no activity photo is not sent to the model');
select pg_temp.ok(
  exists (select 1 from public.dr_ai_runs where report_id = pg_temp.ctx('r2') and status = 'SKIPPED_NO_PHOTOS')
  and pg_temp.state(pg_temp.ctx('r2')) = 'NOT_APPLICABLE',
  'it is recorded as skipped and marked NOT_APPLICABLE');

-- 9. Daily limit (2 for this project; two attempts were made on r1 today).
insert into t_ctx values ('r3', pg_temp.submit(3, true));
select pg_temp.ok(pg_temp.claimed() = 0, 'past the daily limit nothing more is sent to the model');
select pg_temp.ok(
  exists (select 1 from public.dr_ai_runs where report_id = pg_temp.ctx('r3') and status = 'SKIPPED_BUDGET')
  and pg_temp.state(pg_temp.ctx('r3')) = 'AI_UNAVAILABLE',
  'the report goes to the approver marked AI_UNAVAILABLE');

-- 10. The global switch.
update public.dr_ai_project_settings set daily_report_limit = 100 where project_id = pg_temp.ctx('project');
insert into t_ctx values ('r4', pg_temp.submit(4, true));
update public.dr_ai_capabilities set status = 'Disabled' where capability = 'EVIDENCE_ASSESSMENT';
select pg_temp.ok(pg_temp.claimed() = 0, 'a capability disabled in the registry runs nowhere');
update public.dr_ai_capabilities set status = 'Enabled' where capability = 'EVIDENCE_ASSESSMENT';
select pg_temp.ok(pg_temp.claimed() = 1, 'and runs again when enabled');

-- 11. A decided report is no longer assessed; the functions are not callable from the app.
insert into t_ctx values ('r5', pg_temp.submit(5, true));
update public.dr_reports set review_state = 'APPROVED' where id = pg_temp.ctx('r5');
select pg_temp.ok(pg_temp.claimed() = 0, 'a report that already has a decision is left alone');
select pg_temp.ok(
  not has_function_privilege('authenticated', 'public.dr_ai_claim(text, int)', 'execute')
  and not has_function_privilege('authenticated', 'public.dr_ai_record_run(text, uuid, text, text, text, int, int, int, text, timestamptz, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.dr_ai_claim(text, int)', 'execute'),
  'the queue and record functions are service-role only');

do $$ begin raise notice 'ALL DR AI ASSURANCE TESTS PASSED'; end $$;

rollback;
