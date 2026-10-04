-- Module 10-01 Daily Reporting — database tests.
-- Run against a database that has every migration applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dr_daily_reporting.test.sql
-- Everything runs in one transaction and is rolled back. A failed assertion
-- raises and aborts the script; reaching "ALL DR TESTS PASSED" means success.

begin;

create temp table t_ctx (k text primary key, v uuid) on commit drop;
grant all on t_ctx to public;

-- ── Fixtures ────────────────────────────────────────────────────────────────
do $$
declare
  v_ids      uuid[];
  v_project  uuid;
  v_node     uuid;
  v_node2    uuid;
  v_task     uuid;
  v_task2    uuid;
  v_unit     uuid;
  v_unit2    uuid;
begin
  -- None of the fixture users may be a global admin, or RLS tests prove nothing.
  select array_agg(id) into v_ids
  from (select id from public.profiles p where not public.is_admin(p.id) order by created_at limit 5) s;
  if coalesce(array_length(v_ids, 1), 0) < 5 then
    raise exception 'fixture: need at least 5 non-admin profiles';
  end if;
  delete from public.user_roles where user_id = any (v_ids);

  insert into public.projects (project_code, project_name, project_type, project_manager_id, dr_enabled)
  values ('DRTEST-' || substr(gen_random_uuid()::text, 1, 8), 'DR test project', 'internal', v_ids[2], true)
  returning id into v_project;

  insert into public.wbs_nodes (project_id, node_type, wbs_code, wbs_name)
  values (v_project, 'phase', 'T1', 'Scope node') returning id into v_node;
  insert into public.wbs_nodes (project_id, node_type, wbs_code, wbs_name)
  values (v_project, 'phase', 'T2', 'Out of scope node') returning id into v_node2;

  insert into public.wbs_tasks (wbs_node_id, project_id, task_code, task_name)
  values (v_node, v_project, 'ACT-1', 'Slab formwork') returning id into v_task;
  insert into public.wbs_tasks (wbs_node_id, project_id, task_code, task_name)
  values (v_node2, v_project, 'ACT-2', 'Out of scope activity') returning id into v_task2;

  insert into public.project_members (project_id, user_id) values (v_project, v_ids[2]), (v_project, v_ids[4])
  on conflict do nothing;
  insert into public.user_roles (user_id, role_code) values (v_ids[4], 'L2');

  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status)
  values (v_project, 'SC-T1', 'SUBCONTRACTOR', 'Test Subcontractor', 'Active') returning id into v_unit;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status)
  values (v_project, 'IH-T1', 'IN_HOUSE_TEAM', 'Test In-house', 'Active') returning id into v_unit2;

  insert into public.dr_reporting_unit_wbs_scope (unit_id, wbs_node_id) values (v_unit, v_node);
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role, is_lead) values (v_unit, v_ids[1], 'REPORTER', true);
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (v_unit2, v_ids[5], 'REPORTER');

  insert into t_ctx values
    ('reporter', v_ids[1]), ('pm', v_ids[2]), ('outsider', v_ids[3]), ('director', v_ids[4]),
    ('reporter2', v_ids[5]), ('project', v_project), ('task', v_task), ('task2', v_task2),
    ('unit', v_unit), ('unit2', v_unit2), ('node', v_node);
end $$;

create or replace function pg_temp.ctx(p text) returns uuid language sql as $$ select v from t_ctx where k = p $$;

create or replace function pg_temp.payload(p_qty numeric, p_progress numeric, p_incidents int default 0)
returns jsonb language sql as $$
  select jsonb_build_object(
    'schema_version', 1,
    'weather', jsonb_build_object('condition', 'Sunny', 'hours_lost', 0),
    'manpower', jsonb_build_array(jsonb_build_object('line_id', 'm1', 'trade', 'Carpenter', 'planned_count', 10, 'reported_count', 8, 'hours', 8)),
    'activities', jsonb_build_array(jsonb_build_object(
      'line_id', 'a1', 'task_id', pg_temp.ctx('task'), 'work_status', 'in_progress', 'progress_before', 0,
      'progress_today', p_progress, 'reported_qty', p_qty, 'uom', 'm2', 'trade_code', 'Carpenter',
      'headcount', 8, 'hours_normal', 8, 'hours_ot', 0, 'remarks', 'Level 5 zone B')),
    'delays', jsonb_build_array(jsonb_build_object(
      'line_id', 'd1', 'cause_category', 'EMPLOYER_CAUSED', 'description', 'Drawing not issued',
      'hours_lost', 2, 'task_id', pg_temp.ctx('task'), 'notice_required', true)),
    'safety', jsonb_build_object('toolbox_talk_held', true, 'incident_count', p_incidents, 'near_miss_count', 0),
    'next_day', jsonb_build_array(jsonb_build_object('line_id', 'n1', 'task_id', pg_temp.ctx('task'), 'planned_manpower', 8)))
$$;

-- Expect a statement to fail with a message containing p_like.
create or replace function pg_temp.expect_error(p_sql text, p_like text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not ilike '%' || p_like || '%' then
      raise exception 'TEST FAILED [%]: wrong error: %', p_label, sqlerrm;
    end if;
    raise notice 'ok   %', p_label;
    return;
  end;
  raise exception 'TEST FAILED [%]: expected an error containing "%"', p_label, p_like;
end $$;

create or replace function pg_temp.ok(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'TEST FAILED [%]', p_label;
  end if;
  raise notice 'ok   %', p_label;
end $$;

-- ── 1. Submit, idempotency, projections ─────────────────────────────────────
do $$
declare
  v_res  jsonb;
  v_res2 jsonb;
  v_rep  public.dr_reports%rowtype;
begin
  v_res := public.dr_submit_report(pg_temp.ctx('reporter'), pg_temp.ctx('unit'), current_date - 1, 'WORK',
                                   pg_temp.payload(120, 40, 1), 'idem-1', 'WEB', now(),
                                   '[{"rule_code":"LATE_SUBMIT","severity":"WARNING","message":"late"}]'::jsonb,
                                   jsonb_build_array(jsonb_build_object(
                                     'storage_key', pg_temp.ctx('project') || '/' || pg_temp.ctx('unit') || '/p1.jpg',
                                     'mime_type', 'image/jpeg', 'size_bytes', 1000, 'sha256', 'abc',
                                     'target_section', 'activities', 'target_line_id', 'a1',
                                     'scan_status', 'Available', 'scan_engine', 'test')));
  insert into t_ctx values ('report', (v_res->>'report_id')::uuid);
  select * into v_rep from public.dr_reports where id = (v_res->>'report_id')::uuid;

  perform pg_temp.ok(v_rep.report_no ~ '^DR-\d{4}-\d{6}$', 'report number format');
  perform pg_temp.ok(v_rep.review_state = 'AWAITING_REVIEW' and v_rep.submission_state = 'SUBMITTED', 'initial states');
  perform pg_temp.ok(v_rep.warning_count = 1, 'warning count from rule results');
  perform pg_temp.ok((select count(*) from public.dr_activity_progress where report_id = v_rep.id) = 1, 'activity projected');
  perform pg_temp.ok((select cumulative_reported_qty from public.dr_activity_progress where report_id = v_rep.id) = 120, 'cumulative quantity');
  perform pg_temp.ok((select count(*) from public.dr_manpower m join public.dr_report_versions v on v.id = m.version_id where v.report_id = v_rep.id) = 1, 'manpower projected');
  perform pg_temp.ok((select count(*) from public.dr_evidence where report_id = v_rep.id) = 1, 'evidence registered');
  perform pg_temp.ok((select length(content_hash) from public.dr_report_versions where report_id = v_rep.id) = 64, 'content hash');

  v_res2 := public.dr_submit_report(pg_temp.ctx('reporter'), pg_temp.ctx('unit'), current_date - 1, 'WORK',
                                    pg_temp.payload(120, 40, 1), 'idem-1');
  perform pg_temp.ok((v_res2->>'replayed')::boolean and v_res2->>'report_id' = v_res->>'report_id', 'idempotent replay returns original receipt');
  perform pg_temp.ok((select count(*) from public.dr_report_versions where report_id = v_rep.id) = 1, 'replay created no version');

  -- Notifications raised at submission
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('pm') and alert_type = 'dr_review_required'), 'PM notified: review required');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('pm') and alert_type = 'dr_safety_incident'), 'safety incident notified at submission');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('director') and alert_type = 'dr_safety_incident'), 'management notified of incident');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('pm') and alert_type = 'dr_delay_notice'), 'potential delay notice at submission');
  perform pg_temp.ok(exists (select 1 from public.dr_notification_outbox where recipient_id = pg_temp.ctx('pm')), 'outbox rows written');
  perform pg_temp.ok(exists (select 1 from public.dr_audit_log where report_id = v_rep.id and event_code = 'DR.REPORT_SUBMITTED'), 'audit: submitted');
  -- Nothing reaches planning before approval (ADR-2)
  perform pg_temp.ok((select progress from public.wbs_tasks where id = pg_temp.ctx('task')) = 0, 'no planning progress before approval');
  perform pg_temp.ok(not exists (select 1 from public.delay_register where project_id = pg_temp.ctx('project')), 'no delay register row before approval');
end $$;

-- ── 2. Intake invariants ────────────────────────────────────────────────────
select pg_temp.expect_error(
  format($q$select public.dr_submit_report(%L, %L, current_date - 1, 'WORK', pg_temp.payload(1, 1), 'idem-dup')$q$,
         pg_temp.ctx('reporter'), pg_temp.ctx('unit')),
  'DR_DUP_REPORT', 'duplicate for unit and date rejected');
select pg_temp.expect_error(
  format($q$select public.dr_submit_report(%L, %L, current_date + 3, 'WORK', pg_temp.payload(1, 1), 'idem-future')$q$,
         pg_temp.ctx('reporter'), pg_temp.ctx('unit')),
  'DR_DATE_FUTURE', 'future date rejected');
select pg_temp.expect_error(
  format($q$select public.dr_submit_report(%L, %L, current_date - 2, 'WORK', pg_temp.payload(1, 1), 'idem-nonmember')$q$,
         pg_temp.ctx('outsider'), pg_temp.ctx('unit')),
  'DR_INV_UNIT', 'non-member cannot submit');
select pg_temp.expect_error(
  format($q$select public.dr_submit_report(%L, %L, current_date - 2, 'WORK',
            jsonb_build_object('activities', jsonb_build_array(jsonb_build_object('line_id','a1','task_id',%L,'progress_today',10))), 'idem-scope')$q$,
         pg_temp.ctx('reporter'), pg_temp.ctx('unit'), pg_temp.ctx('task2')),
  'DR_INV_WBS', 'activity outside WBS scope rejected');
select pg_temp.expect_error(
  format($q$select public.dr_submit_report(%L, %L, current_date - 2, 'NO_WORK', '{}'::jsonb, 'idem-nowork')$q$,
         pg_temp.ctx('reporter'), pg_temp.ctx('unit')),
  'DR_REQ_FIELD', 'No Work report needs a reason');
select pg_temp.expect_error(
  format($q$select public.dr_submit_report(%L, %L, current_date - 2, 'WORK',
            jsonb_build_object('activities', jsonb_build_array(jsonb_build_object('line_id','a1','task_id',%L,'progress_today',140))), 'idem-140')$q$,
         pg_temp.ctx('reporter'), pg_temp.ctx('unit'), pg_temp.ctx('task')),
  'check', 'progress above 100 rejected by constraint');

-- ── 3. Immutability ─────────────────────────────────────────────────────────
select pg_temp.expect_error($q$update public.dr_report_versions set payload = '{}'::jsonb$q$, 'DR_IMMUTABLE', 'version cannot be updated');
select pg_temp.expect_error($q$delete from public.dr_report_versions$q$, 'DR_IMMUTABLE', 'version cannot be deleted');
select pg_temp.expect_error($q$update public.dr_activity_progress set reported_qty = 999$q$, 'DR_IMMUTABLE', 'line table cannot be updated');
select pg_temp.expect_error($q$update public.dr_evidence set sha256 = 'tampered'$q$, 'DR_IMMUTABLE', 'evidence hash cannot be changed');
select pg_temp.expect_error($q$delete from public.dr_audit_log$q$, 'DR_IMMUTABLE', 'audit log cannot be deleted');
do $$
begin
  update public.dr_evidence set scan_status = 'Quarantined';
  perform pg_temp.ok(true, 'evidence scan_status may change');
  update public.dr_evidence set scan_status = 'Available';
end $$;

-- ── 4. Row-level security ───────────────────────────────────────────────────
create or replace function pg_temp.visible_reports(p_user uuid) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  select count(*) into n from public.dr_reports where project_id = pg_temp.ctx('project');
  reset role;
  return n;
end $$;

select pg_temp.ok(pg_temp.visible_reports(pg_temp.ctx('reporter')) = 1, 'RLS: unit reporter sees own unit report');
select pg_temp.ok(pg_temp.visible_reports(pg_temp.ctx('pm')) = 1, 'RLS: PM sees project reports');
select pg_temp.ok(pg_temp.visible_reports(pg_temp.ctx('outsider')) = 0, 'RLS: non-member sees nothing');
select pg_temp.ok(pg_temp.visible_reports(pg_temp.ctx('reporter2')) = 0, 'RLS: member of another unit sees nothing');

do $$
declare n int;
begin
  -- Reporter must not see reviewer-only material.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ctx('reporter')::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.ctx('reporter')::text, true);
  set local role authenticated;
  select count(*) into n from public.dr_rule_results;
  perform pg_temp.ok(n = 0, 'RLS: reporter cannot read rule results');
  select count(*) into n from public.dr_audit_log;
  perform pg_temp.ok(n = 0, 'RLS: reporter cannot read audit log');
  select count(*) into n from public.dr_evidence;
  perform pg_temp.ok(n = 1, 'RLS: reporter reads own evidence rows');
  reset role;
end $$;

select pg_temp.expect_error($q$
  do $i$ begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ctx('reporter')::text, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.dr_reports (report_no, project_id, unit_id, report_date, report_kind)
    values ('DR-HACK', pg_temp.ctx('project'), pg_temp.ctx('unit'), current_date - 9, 'WORK');
  end $i$ $q$, 'permission denied', 'RLS: client cannot insert a report directly');
reset role;
select pg_temp.expect_error($q$
  do $i$ begin
    set local role authenticated;
    perform public.dr_decide_review(pg_temp.ctx('reporter'), pg_temp.ctx('report'), 1, 'APPROVE');
  end $i$ $q$, 'permission denied', 'gateway functions are not callable by clients');
reset role;
select pg_temp.expect_error($q$
  do $i$ begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ctx('reporter')::text, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.dr_reporting_unit_members (unit_id, user_id) values (pg_temp.ctx('unit2'), pg_temp.ctx('reporter'));
  end $i$ $q$, 'row-level security', 'RLS: reporter cannot add themselves to another unit');
reset role;
select pg_temp.expect_error($q$
  do $i$ begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ctx('pm')::text, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', pg_temp.ctx('pm')::text, true);
    set local role authenticated;
    insert into public.dr_project_approvers (project_id, user_id, approver_role) values (pg_temp.ctx('project'), pg_temp.ctx('outsider'), 'ALTERNATE');
  end $i$ $q$, 'row-level security', 'RLS: PM cannot appoint their own alternate');
reset role;

-- ── 5. Review: return → correct → approve ───────────────────────────────────
select pg_temp.expect_error(
  format($q$select public.dr_decide_review(%L, %L, 1, 'APPROVE')$q$, pg_temp.ctx('outsider'), pg_temp.ctx('report')),
  'DR_FORBIDDEN', 'non-approver cannot decide');
select pg_temp.expect_error(
  format($q$select public.dr_decide_review(%L, %L, 1, 'RETURN', null)$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'DR_REQ_FIELD', 'return needs a comment');
select pg_temp.expect_error(
  format($q$select public.dr_decide_review(%L, %L, 1, 'RETURN', 'fix it')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'DR_REQ_FIELD', 'return needs at least one item');
select pg_temp.expect_error(
  format($q$select public.dr_decide_review(%L, %L, 1, 'APPROVE')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'classify every delay', 'approval blocked until delays are classified');

do $$
declare
  v_res jsonb;
  v_rep public.dr_reports%rowtype;
begin
  perform public.dr_open_review(pg_temp.ctx('pm'), pg_temp.ctx('report'));
  perform pg_temp.ok((select review_state from public.dr_reports where id = pg_temp.ctx('report')) = 'IN_REVIEW', 'open review → IN_REVIEW');

  perform public.dr_decide_review(pg_temp.ctx('pm'), pg_temp.ctx('report'), 1, 'RETURN', 'Quantity looks too high',
    '[]'::jsonb, '[{"target_section":"activities","target_line_id":"a1","reason":"Quantity exceeds slab area"}]'::jsonb);
  select * into v_rep from public.dr_reports where id = pg_temp.ctx('report');
  perform pg_temp.ok(v_rep.review_state = 'RETURNED' and v_rep.submission_state = 'RETURNED', 'returned state');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('reporter') and alert_type = 'dr_report_returned'), 'reporter notified of return');

  v_res := public.dr_resubmit_report(pg_temp.ctx('reporter'), pg_temp.ctx('report'), pg_temp.payload(90, 40, 1), 'idem-2',
                                     'WEB', now(), '[]'::jsonb,
                                     jsonb_build_array(jsonb_build_object(
                                       'storage_key', pg_temp.ctx('project') || '/' || pg_temp.ctx('unit') || '/p1.jpg',
                                       'sha256', 'RESTATED', 'mime_type', 'image/png', 'size_bytes', 5)),
                                     'Corrected to measured area');
  perform pg_temp.ok((v_res->>'version_no')::int = 2, 'correction creates version 2');
  perform pg_temp.ok((select payload->'activities'->0->>'reported_qty' from public.dr_report_versions where report_id = pg_temp.ctx('report') and version_no = 1) = '120', 'version 1 untouched');
  perform pg_temp.ok((select sha256 from public.dr_evidence e join public.dr_report_versions v on v.id = e.version_id where v.report_id = pg_temp.ctx('report') and v.version_no = 2) = 'abc', 'carried evidence keeps its original hash');
  perform pg_temp.ok((select status from public.dr_correction_requests where report_id = pg_temp.ctx('report')) = 'Resubmitted', 'correction request resubmitted');
end $$;

select pg_temp.expect_error(
  format($q$select public.dr_decide_review(%L, %L, 1, 'APPROVE')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'DR_STALE', 'decision on a stale version rejected');
select pg_temp.expect_error(
  format($q$select public.dr_decide_review(%L, %L, 2, 'APPROVE', null, '[{"line_id":"a1","verified_qty":80,"remark":""}]'::jsonb, '[]'::jsonb, '[{"line_id":"d1","delay_type":"excusable"}]'::jsonb)$q$,
         pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'check', 'verified quantity needs a remark');

do $$
declare
  v_res jsonb;
  v_rep public.dr_reports%rowtype;
begin
  v_res := public.dr_decide_review(pg_temp.ctx('pm'), pg_temp.ctx('report'), 2, 'APPROVE_WITH_REMARK', 'Verified on site',
    '[{"line_id":"a1","verified_qty":80,"remark":"Measured 80 m2 on site"}]'::jsonb, '[]'::jsonb,
    '[{"line_id":"d1","delay_type":"excusable"}]'::jsonb);
  select * into v_rep from public.dr_reports where id = pg_temp.ctx('report');
  perform pg_temp.ok(v_rep.review_state = 'APPROVED_WITH_REMARK' and v_rep.approved_version_no = 2, 'approved with remark');
  perform pg_temp.ok((select reported_qty from public.dr_activity_progress ap join public.dr_report_versions v on v.id = ap.version_id where v.report_id = v_rep.id and v.version_no = 2) = 90, 'reported quantity retained');
  perform pg_temp.ok((select verified_qty from public.dr_verified_quantities where report_id = v_rep.id) = 80, 'verified quantity stored separately');
  -- Planning sync happens now, with the verified quantity.
  perform pg_temp.ok((select progress from public.wbs_tasks where id = pg_temp.ctx('task')) = 40, 'planning progress updated on approval');
  perform pg_temp.ok((select quantity_done from public.plan_productivity_logs where task_id = pg_temp.ctx('task')) = 80, 'productivity log uses verified quantity');
  perform pg_temp.ok((select delay_type from public.delay_register where project_id = pg_temp.ctx('project')) = 'excusable', 'delay register row uses PM classification');
  perform pg_temp.ok((select status from public.dr_correction_requests where report_id = v_rep.id) = 'Closed', 'correction closed on approval');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('reporter') and alert_type = 'dr_report_approved'), 'reporter notified of approval');
end $$;

-- Segregation of duties: the PM is also a reporter of unit2 and submits there.
do $$
declare v_res jsonb;
begin
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (pg_temp.ctx('unit2'), pg_temp.ctx('pm'), 'REPORTER');
  v_res := public.dr_submit_report(pg_temp.ctx('pm'), pg_temp.ctx('unit2'), current_date - 1, 'NO_WORK',
                                   '{"no_work_reason":"Rain all day"}'::jsonb, 'idem-sod');
  insert into t_ctx values ('report_sod', (v_res->>'report_id')::uuid);
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_decide_review(%L, %L, 1, 'APPROVE')$q$, pg_temp.ctx('pm'), pg_temp.ctx('report_sod')),
  'DR_SOD', 'submitter cannot approve own version');

-- ── 6. No Work → Work supersede (G11) and summary ───────────────────────────
select pg_temp.expect_error(
  format($q$select public.dr_submit_report(%L, %L, current_date - 1, 'WORK', '{"activities":[]}'::jsonb, 'idem-g11a')$q$,
         pg_temp.ctx('reporter2'), pg_temp.ctx('unit2')),
  'needs a reason', 'replacing No Work needs a reason');
do $$
declare v_res jsonb;
begin
  v_res := public.dr_submit_report(pg_temp.ctx('reporter2'), pg_temp.ctx('unit2'), current_date - 1, 'WORK',
                                   '{"manpower":[{"line_id":"m1","trade":"Mason","reported_count":5}]}'::jsonb,
                                   'idem-g11b', 'WEB', null, '[]'::jsonb, '[]'::jsonb, 'Crew arrived after the rain');
  perform pg_temp.ok((v_res->>'version_no')::int = 2, 'No Work replaced by a work version');
end $$;

do $$
declare
  s public.dr_project_daily_summaries%rowtype;
  v_res jsonb;
begin
  select * into s from public.dr_project_daily_summaries
  where project_id = pg_temp.ctx('project') and summary_date = current_date - 1 and revision_no = 0;
  perform pg_temp.ok((s.coverage->>'submitted')::int = 2 and (s.coverage->>'approved')::int = 1 and (s.coverage->>'pending')::int = 1, 'coverage: 2 submitted, 1 approved, 1 pending');
  perform pg_temp.ok((s.totals->>'manpower_total')::int = 8, 'official totals exclude the pending report');
  perform pg_temp.ok((s.totals->'quantities'->0->>'verified_qty')::numeric = 80, 'summary shows verified quantity');

  v_res := public.dr_publish_summary(pg_temp.ctx('pm'), pg_temp.ctx('project'), current_date - 1, 'Day summary');
  perform pg_temp.ok((v_res->>'revision_no')::int = 1, 'summary published as revision 1');
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_publish_summary(%L, %L, current_date - 1, 'Day summary')$q$, pg_temp.ctx('pm'), pg_temp.ctx('project')),
  'DR_NO_CHANGE', 'unchanged summary is not republished');
select pg_temp.expect_error(
  format($q$select public.dr_publish_summary(%L, %L, current_date - 1, 'x')$q$, pg_temp.ctx('reporter'), pg_temp.ctx('project')),
  'DR_FORBIDDEN', 'reporter cannot publish summary');

-- ── 7. Amendment ────────────────────────────────────────────────────────────
do $$
declare
  v_res jsonb;
  v_rep public.dr_reports%rowtype;
begin
  v_res := public.dr_submit_amendment(pg_temp.ctx('reporter'), pg_temp.ctx('report'), pg_temp.payload(85, 45, 0),
                                      'Re-measured after survey', 'idem-amend');
  select * into v_rep from public.dr_reports where id = pg_temp.ctx('report');
  perform pg_temp.ok(v_rep.review_state = 'AMENDMENT_PENDING' and v_rep.approved_version_no = 2 and v_rep.current_version_no = 3,
                     'amendment pending; previous approved version still official');
  perform public.dr_decide_review(pg_temp.ctx('pm'), pg_temp.ctx('report'), 3, 'APPROVE', null, '[]'::jsonb, '[]'::jsonb,
                                  '[{"line_id":"d1","delay_type":"excusable"}]'::jsonb);
  perform pg_temp.ok((select approved_version_no from public.dr_reports where id = pg_temp.ctx('report')) = 3, 'amended version approved');
  perform pg_temp.ok((select count(*) from public.plan_productivity_logs where task_id = pg_temp.ctx('task')) = 1
                     and (select quantity_done from public.plan_productivity_logs where task_id = pg_temp.ctx('task')) = 85,
                     'amendment updates the same productivity log, no duplicate');
  perform pg_temp.ok((select count(*) from public.delay_register where project_id = pg_temp.ctx('project')) = 1, 'amendment does not duplicate the delay');
  v_res := public.dr_publish_summary(pg_temp.ctx('pm'), pg_temp.ctx('project'), current_date - 1, 'Day summary');
  perform pg_temp.ok((v_res->>'revision_no')::int = 2, 'amendment produces summary revision 2');
  perform pg_temp.ok((select count(*) from public.dr_project_daily_summaries where project_id = pg_temp.ctx('project') and summary_date = current_date - 1 and status = 'Superseded') = 1, 'revision 1 superseded');
end $$;

-- ── 8. Missing reports and escalation ───────────────────────────────────────
do $$
declare
  v_unit3 uuid;
  v_res   jsonb;
  v_day   date := current_date - 1;
  m       public.dr_missing_reports%rowtype;
begin
  insert into public.dr_reporting_schedules (project_id, name, working_days) values (pg_temp.ctx('project'), 'Default', '{1,2,3,4,5,6,7}');
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at)
  values (pg_temp.ctx('project'), 'SC-T3', 'SUBCONTRACTOR', 'Silent Subcontractor', 'Active', current_date - 5) returning id into v_unit3;
  -- A unit set up today owes nothing for yesterday.
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status)
  values (pg_temp.ctx('project'), 'SC-T4', 'SUBCONTRACTOR', 'New Subcontractor', 'Active');
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (v_unit3, pg_temp.ctx('outsider'), 'REPORTER');

  v_res := public.dr_run_schedule(now());
  select * into m from public.dr_missing_reports where unit_id = v_unit3 and report_date = v_day;
  perform pg_temp.ok(m.id is not null and m.status = 'Open', 'missing report raised for a silent unit');
  perform pg_temp.ok(not exists (select 1 from public.dr_missing_reports where unit_id = pg_temp.ctx('unit') and report_date = v_day), 'no missing record for a unit that reported');
  perform pg_temp.ok(not exists (select 1 from public.dr_missing_reports x join public.dr_reporting_units u on u.id = x.unit_id
                                 where u.unit_code = 'SC-T4' and x.report_date = v_day), 'no missing record for days before a unit existed');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('outsider') and alert_type = 'dr_report_missing'), 'reporter notified of missing report');

  perform public.dr_run_schedule(now());
  perform pg_temp.ok((select count(*) from public.dr_missing_reports where unit_id = v_unit3 and report_date = v_day) = 1, 'schedule run is idempotent');

  perform public.dr_run_schedule(now() + interval '3 days');
  perform pg_temp.ok((select escalation_level from public.dr_missing_reports where id = m.id) = 2, 'missing report escalated to level 2');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('director') and alert_type = 'dr_report_missing'), 'management notified at final escalation');

  -- Late submission closes the record and is flagged.
  v_res := public.dr_submit_report(pg_temp.ctx('outsider'), v_unit3, v_day, 'NO_WORK', '{"no_work_reason":"Access not released"}'::jsonb, 'idem-late');
  perform pg_temp.ok((select status from public.dr_missing_reports where id = m.id) = 'Late Submitted', 'late submission closes the missing record');
  perform pg_temp.ok((select late_flag from public.dr_reports where id = (v_res->>'report_id')::uuid), 'late flag set');
end $$;

select pg_temp.ok(
  (select count(*) from public.dr_audit_log where project_id = pg_temp.ctx('project')
     and event_code in ('DR.REPORT_SUBMITTED', 'DR.REVIEW_DECISION', 'DR.CORRECTION_SENT', 'DR.CORRECTION_RESUBMITTED',
                        'DR.REPORT_AMENDED', 'DR.SUMMARY_PUBLISHED', 'DR.SUMMARY_SUPERSEDED', 'DR.MISSING_REPORT_RAISED',
                        'DR.REVIEW_OPENED')) >= 12,
  'audit trail covers the lifecycle');

-- ── 9. Legacy backfill ──────────────────────────────────────────────────────
do $$
declare
  v_old  uuid;
  v_old2 uuid;
  v_res  jsonb;
  v_logs int;
  v_prog numeric;
begin
  insert into public.site_daily_reports (project_id, report_date, weather_conditions, work_summary, issues_encountered,
                                         status, created_by, verified_by, verified_at, updated_at)
  values (pg_temp.ctx('project'), current_date - 20, 'Cloudy', 'Old diary', 'Crane down', 'verified_by_pm',
          pg_temp.ctx('reporter'), pg_temp.ctx('pm'), now() - interval '19 days', now() - interval '19 days')
  returning id into v_old;
  insert into public.site_daily_reports (project_id, report_date, status, created_by, updated_at)
  values (pg_temp.ctx('project'), current_date - 20, 'submitted', pg_temp.ctx('reporter'), now() - interval '20 days')
  returning id into v_old2;
  insert into public.site_daily_reports (project_id, report_date, status, created_by)
  values (pg_temp.ctx('project'), current_date - 21, 'draft', pg_temp.ctx('reporter'));
  insert into public.site_daily_report_activities (daily_report_id, project_id, task_id, progress_before, progress_today,
                                                   quantity_done, quantity_unit, has_delay, delay_category, delay_hours_lost)
  values (v_old, pg_temp.ctx('project'), pg_temp.ctx('task'), 10, 20, 15, 'm2', true, 'client', 3);
  insert into public.site_manpower (project_id, report_date, trade, total_workers) values (pg_temp.ctx('project'), current_date - 20, 'Mason', 6);

  select count(*) into v_logs from public.plan_productivity_logs where project_id = pg_temp.ctx('project');
  select progress into v_prog from public.wbs_tasks where id = pg_temp.ctx('task');

  v_res := public.dr_backfill_project(pg_temp.ctx('project'));
  perform pg_temp.ok((v_res->>'imported')::int = 1 and (v_res->>'drafts_not_imported')::int = 1
                     and jsonb_array_length(v_res->'skipped') = 1, 'backfill: 1 imported, 1 duplicate listed, draft left out');
  perform pg_temp.ok(exists (select 1 from public.dr_reports where source_site_report_id = v_old and imported_flag
                             and review_state = 'APPROVED' and approved_by = pg_temp.ctx('pm')), 'backfill: verified report imported as approved');
  perform pg_temp.ok((select cause_category from public.dr_delay_events de join public.dr_reports r on r.id = de.report_id
                      where r.source_site_report_id = v_old) = 'EMPLOYER_CAUSED', 'backfill: delay category mapped');
  perform pg_temp.ok((select count(*) from public.plan_productivity_logs where project_id = pg_temp.ctx('project')) = v_logs
                     and (select progress from public.wbs_tasks where id = pg_temp.ctx('task')) = v_prog,
                     'backfill: planning tables untouched');
  v_res := public.dr_backfill_project(pg_temp.ctx('project'));
  perform pg_temp.ok((v_res->>'imported')::int = 0, 'backfill: idempotent');
end $$;

-- ── 10. Hardening ───────────────────────────────────────────────────────────
select pg_temp.expect_error($q$
  do $i$ begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ctx('reporter')::text, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', pg_temp.ctx('reporter')::text, true);
    update public.projects set dr_enabled = false where id = pg_temp.ctx('project');
  end $i$ $q$, 'DR_FORBIDDEN', 'a reporter cannot switch Daily Reporting off for the project');
do $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ctx('pm')::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.ctx('pm')::text, true);
  update public.projects set dr_enabled = false where id = pg_temp.ctx('project');
  perform pg_temp.ok((select not dr_enabled from public.projects where id = pg_temp.ctx('project')), 'the project manager can switch it');
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
select pg_temp.expect_error(
  format($q$insert into public.dr_reporting_schedules (project_id, name, timezone) values (%L, 'Bad tz', 'Mars/Olympus')$q$, pg_temp.ctx('project')),
  'unknown time zone', 'unknown schedule time zone rejected');
select pg_temp.expect_error(
  format($q$insert into public.dr_reporting_schedules (project_id, name, reminder_time, deadline_time) values (%L, 'Bad times', '19:00', '18:00')$q$, pg_temp.ctx('project')),
  'reminder must be earlier', 'reminder after deadline rejected');

do $$ begin raise notice 'ALL DR TESTS PASSED'; end $$;

rollback;
