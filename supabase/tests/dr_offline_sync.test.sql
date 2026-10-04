-- Module 10-01 Daily Reporting — Phase 1B offline sync, database tests.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dr_offline_sync.test.sql
-- One transaction, rolled back. "ALL DR OFFLINE TESTS PASSED" means success.

begin;

create temp table t_ctx (k text primary key, v uuid) on commit drop;
grant all on t_ctx to public;

do $$
declare
  v_ids uuid[]; v_project uuid; v_node uuid; v_node2 uuid; v_task uuid; v_task2 uuid; v_unit uuid;
begin
  select array_agg(id) into v_ids
  from (select id from public.profiles p where not public.is_admin(p.id) order by created_at limit 3) s;
  delete from public.user_roles where user_id = any (v_ids);

  insert into public.projects (project_code, project_name, project_type, project_manager_id, dr_enabled)
  values ('DROFF-' || substr(gen_random_uuid()::text, 1, 8), 'DR offline test', 'internal', v_ids[2], true)
  returning id into v_project;
  insert into public.wbs_nodes (project_id, node_type, wbs_code, wbs_name) values (v_project, 'phase', 'IN', 'In') returning id into v_node;
  insert into public.wbs_nodes (project_id, node_type, wbs_code, wbs_name) values (v_project, 'phase', 'OUT', 'Out') returning id into v_node2;
  insert into public.wbs_tasks (wbs_node_id, project_id, task_code, task_name) values (v_node, v_project, 'A-1', 'In scope') returning id into v_task;
  insert into public.wbs_tasks (wbs_node_id, project_id, task_code, task_name) values (v_node2, v_project, 'A-2', 'Out of scope') returning id into v_task2;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at)
  values (v_project, 'SC-OFF', 'SUBCONTRACTOR', 'Offline Sub', 'Active', current_date - 30) returning id into v_unit;
  insert into public.dr_reporting_unit_wbs_scope values (v_unit, v_node);
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (v_unit, v_ids[1], 'REPORTER');

  insert into t_ctx values ('reporter', v_ids[1]), ('pm', v_ids[2]), ('outsider', v_ids[3]), ('project', v_project),
    ('task', v_task), ('task2', v_task2), ('unit', v_unit), ('device', gen_random_uuid()), ('device2', gen_random_uuid());
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
create or replace function pg_temp.payload(p_task uuid, p_progress numeric, p_qty numeric) returns jsonb language sql as $$
  select jsonb_build_object('schema_version', 1,
    'weather', jsonb_build_object('condition', 'Sunny'),
    'manpower', jsonb_build_array(jsonb_build_object('line_id', 'm1', 'trade', 'Mason', 'reported_count', 6)),
    'activities', jsonb_build_array(jsonb_build_object('line_id', 'a1', 'task_id', p_task, 'progress_today', p_progress,
                                                       'reported_qty', p_qty, 'uom', 'm2', 'work_status', 'in_progress')),
    'safety', jsonb_build_object('toolbox_talk_held', true, 'incident_count', 0))
$$;
-- Shorthand: push one offline report written "now minus p_age".
create or replace function pg_temp.push(p_user uuid, p_date date, p_payload jsonb, p_key text, p_grant uuid,
                                        p_age interval default '1 hour', p_rules jsonb default '[]', p_expected int default 0,
                                        p_device uuid default null)
returns jsonb language sql as $$
  select public.dr_submit_offline_report(p_user, pg_temp.ctx('unit'), p_date, 'WORK', p_payload, p_key, now() - p_age,
                                         p_grant, coalesce(p_device, pg_temp.ctx('device')), p_rules, '[]'::jsonb, p_expected)
$$;

-- ── 1. Grant ────────────────────────────────────────────────────────────────
do $$
declare g jsonb;
begin
  g := public.dr_issue_offline_grant(pg_temp.ctx('reporter'), pg_temp.ctx('device'), 'Test phone', 'ua');
  insert into t_ctx values ('grant', (g->>'grant_id')::uuid);
  -- Backdate the grant so reports "written an hour ago" fall inside it.
  update public.dr_offline_grants set issued_at = now() - interval '2 days' where id = (g->>'grant_id')::uuid;
  perform pg_temp.ok(g->'unit_ids' ? pg_temp.ctx('unit')::text, 'grant lists the units the user may report for');
  perform pg_temp.ok((g->>'expires_at')::timestamptz > now() + interval '71 hours', 'grant expires after the grace period');
  perform pg_temp.ok((public.dr_issue_offline_grant(pg_temp.ctx('reporter'), pg_temp.ctx('device'))->>'grant_id')::uuid = pg_temp.ctx('grant')
                     and (select count(*) from public.dr_offline_grants where device_id = pg_temp.ctx('device')) = 1,
                     'checking in again extends the same grant instead of creating another');
  g := public.dr_issue_offline_grant(pg_temp.ctx('outsider'), pg_temp.ctx('device2'));
  insert into t_ctx values ('grant_outsider', (g->>'grant_id')::uuid);
  perform pg_temp.ok(jsonb_array_length(g->'unit_ids') = 0, 'a non-reporter gets a grant with no units');
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_issue_offline_grant(%L, %L)$q$, pg_temp.ctx('outsider'), pg_temp.ctx('device')),
  'registered to another user', 'a device cannot be taken over by another user');

-- ── 2. The only hard refusal: never authorised ──────────────────────────────
select pg_temp.expect_error(
  format($q$select pg_temp.push(%L, current_date - 1, pg_temp.payload(%L, 10, 5), 'k-none', %L, '1 hour', '[]', 0, %L)$q$,
         pg_temp.ctx('outsider'), pg_temp.ctx('task'), pg_temp.ctx('grant_outsider'), pg_temp.ctx('device2')),
  'no offline authorisation', 'push without a grant covering the unit is refused');
select pg_temp.expect_error(
  format($q$select pg_temp.push(%L, current_date - 1, pg_temp.payload(%L, 10, 5), 'k-stolen', %L)$q$,
         pg_temp.ctx('outsider'), pg_temp.ctx('task'), pg_temp.ctx('grant')),
  'no offline authorisation', 'another user cannot use someone else''s grant');
select pg_temp.expect_error(
  format($q$select pg_temp.push(%L, current_date - 1, pg_temp.payload(%L, 10, 5), 'k-old', %L, '10 days')$q$,
         pg_temp.ctx('reporter'), pg_temp.ctx('task'), pg_temp.ctx('grant')),
  'no offline authorisation', 'a report written before the grant existed is refused');

-- ── 3. Clean offline report ─────────────────────────────────────────────────
do $$
declare r jsonb; rep public.dr_reports%rowtype;
begin
  r := pg_temp.push(pg_temp.ctx('reporter'), current_date - 1, pg_temp.payload(pg_temp.ctx('task'), 20, 30), 'k-1', pg_temp.ctx('grant'), '1 hour', '[]', 2);
  insert into t_ctx values ('report', (r->>'report_id')::uuid);
  select * into rep from public.dr_reports where id = (r->>'report_id')::uuid;
  perform pg_temp.ok(r->>'outcome' = 'ACCEPTED' and rep.review_state = 'AWAITING_REVIEW', 'clean offline report accepted for review');
  perform pg_temp.ok(rep.sync_state = 'EVIDENCE_PENDING', 'report with photos still to come is EVIDENCE_PENDING');
  perform pg_temp.ok((select channel from public.dr_report_versions where report_id = rep.id) = 'FIELD_APP', 'channel recorded');
  perform pg_temp.ok((select queue_age_seconds from public.dr_version_origins o join public.dr_report_versions v on v.id = o.version_id where v.report_id = rep.id) >= 3500, 'queue age recorded');
  perform pg_temp.ok((select client_created_at from public.dr_report_versions where report_id = rep.id) < now() - interval '59 minutes', 'device time kept as the time of writing');

  r := pg_temp.push(pg_temp.ctx('reporter'), current_date - 1, pg_temp.payload(pg_temp.ctx('task'), 20, 30), 'k-1', pg_temp.ctx('grant'));
  perform pg_temp.ok((r->>'replayed')::boolean and (select count(*) from public.dr_report_versions where report_id = rep.id) = 1, 'pushing the same queued item twice creates nothing');
end $$;

-- ── 4. Photos arriving later ────────────────────────────────────────────────
do $$
declare r jsonb; k text := pg_temp.ctx('project') || '/' || pg_temp.ctx('unit') || '/';
begin
  r := public.dr_attach_evidence(pg_temp.ctx('reporter'), pg_temp.ctx('report'), 1,
        jsonb_build_array(jsonb_build_object('storage_key', k || 'p1.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 10, 'sha256', 'h1', 'target_section', 'activities', 'target_line_id', 'a1', 'scan_status', 'Available')));
  perform pg_temp.ok(not (r->>'complete')::boolean and (select sync_state from public.dr_reports where id = pg_temp.ctx('report')) = 'EVIDENCE_PENDING', 'one of two photos: still pending');
  r := public.dr_attach_evidence(pg_temp.ctx('reporter'), pg_temp.ctx('report'), 1,
        jsonb_build_array(jsonb_build_object('storage_key', k || 'p1.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 10, 'sha256', 'h1'),
                          jsonb_build_object('storage_key', k || 'p2.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 11, 'sha256', 'h2', 'scan_status', 'Available'),
                          jsonb_build_object('storage_key', k || 'p3.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 12, 'sha256', 'h3')));
  perform pg_temp.ok((r->>'complete')::boolean and (r->>'received')::int = 2, 'second photo completes it; a repeat and an extra are ignored');
  perform pg_temp.ok((select sync_state from public.dr_reports where id = pg_temp.ctx('report')) = 'SYNCED', 'report becomes SYNCED when evidence is complete');
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_attach_evidence(%L, %L, 1, '[]'::jsonb)$q$, pg_temp.ctx('pm'), pg_temp.ctx('report')),
  'DR_FORBIDDEN', 'only the sender can complete the evidence');

-- ── 5. Conflict: a report already exists ────────────────────────────────────
do $$
declare r jsonb;
begin
  r := pg_temp.push(pg_temp.ctx('reporter'), current_date - 1, pg_temp.payload(pg_temp.ctx('task'), 35, 44), 'k-2', pg_temp.ctx('grant'), '30 minutes');
  insert into t_ctx values ('conflict', (r->>'conflict_id')::uuid);
  perform pg_temp.ok(r->>'outcome' = 'CONFLICT' and r->>'existing_report_id' = pg_temp.ctx('report')::text, 'second report for the same unit and date is held as a conflict');
  perform pg_temp.ok((select incoming->'payload'->'activities'->0->>'reported_qty' from public.dr_sync_conflicts where id = (r->>'conflict_id')::uuid) = '44', 'the incoming report is kept in full');
  perform pg_temp.ok((select sync_state from public.dr_reports where id = pg_temp.ctx('report')) = 'CONFLICT', 'existing report marked CONFLICT');
  perform pg_temp.ok((select count(*) from public.dr_report_versions where report_id = pg_temp.ctx('report')) = 1, 'no version created by the conflict');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('pm') and title like 'Sync conflict%'), 'approver notified of the conflict');
  r := pg_temp.push(pg_temp.ctx('reporter'), current_date - 1, pg_temp.payload(pg_temp.ctx('task'), 35, 44), 'k-2', pg_temp.ctx('grant'));
  perform pg_temp.ok((r->>'replayed')::boolean and (select count(*) from public.dr_sync_conflicts where project_id = pg_temp.ctx('project')) = 1, 'replayed conflict push creates no second record');
end $$;
select pg_temp.expect_error($q$update public.dr_sync_conflicts set incoming = '{}'::jsonb$q$, 'DR_IMMUTABLE', 'the held report cannot be altered');
select pg_temp.expect_error($q$delete from public.dr_sync_conflicts$q$, 'DR_IMMUTABLE', 'the held report cannot be deleted');
select pg_temp.expect_error(
  format($q$select public.dr_resolve_conflict(%L, %L, 'KEEP_BOTH')$q$, pg_temp.ctx('outsider'), pg_temp.ctx('conflict')),
  'DR_FORBIDDEN', 'an outsider cannot resolve the conflict');
do $$
declare r jsonb; rep public.dr_reports%rowtype;
begin
  r := public.dr_resolve_conflict(pg_temp.ctx('reporter'), pg_temp.ctx('conflict'), 'KEEP_BOTH');
  select * into rep from public.dr_reports where id = pg_temp.ctx('report');
  perform pg_temp.ok(r->>'status' = 'Resolved — Kept Both' and rep.current_version_no = 2, 'kept both: the offline report becomes version 2');
  perform pg_temp.ok((select payload->'activities'->0->>'reported_qty' from public.dr_report_versions where report_id = rep.id and version_no = 1) = '30', 'version 1 untouched');
  perform pg_temp.ok((select submitted_by from public.dr_report_versions where report_id = rep.id and version_no = 2) = pg_temp.ctx('reporter'), 'authorship stays with the reporter');
  perform pg_temp.ok(rep.sync_state = 'SYNCED' and rep.review_state = 'AWAITING_REVIEW', 'report leaves CONFLICT and returns to review');
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_resolve_conflict(%L, %L, 'KEEP_EXISTING')$q$, pg_temp.ctx('pm'), pg_temp.ctx('conflict')),
  'already resolved', 'a conflict is resolved once');

-- Conflict against an approved report becomes an amendment awaiting approval.
do $$
declare r jsonb; rep public.dr_reports%rowtype;
begin
  perform public.dr_decide_review(pg_temp.ctx('pm'), pg_temp.ctx('report'), 2, 'APPROVE');
  r := pg_temp.push(pg_temp.ctx('reporter'), current_date - 1, pg_temp.payload(pg_temp.ctx('task'), 50, 60), 'k-3', pg_temp.ctx('grant'), '10 minutes');
  r := public.dr_resolve_conflict(pg_temp.ctx('pm'), (r->>'conflict_id')::uuid, 'MERGE', pg_temp.payload(pg_temp.ctx('task'), 45, 55), 'Combined');
  select * into rep from public.dr_reports where id = pg_temp.ctx('report');
  perform pg_temp.ok(rep.review_state = 'AMENDMENT_PENDING' and rep.approved_version_no = 2 and rep.current_version_no = 3, 'merge onto an approved report is an amendment; approved version stays official');
  perform pg_temp.ok((select version_kind from public.dr_report_versions where report_id = rep.id and version_no = 3) = 'AMENDMENT', 'merged version is an amendment');
  r := pg_temp.push(pg_temp.ctx('reporter'), current_date - 1, pg_temp.payload(pg_temp.ctx('task'), 50, 60), 'k-4', pg_temp.ctx('grant'), '5 minutes');
  r := public.dr_resolve_conflict(pg_temp.ctx('pm'), (r->>'conflict_id')::uuid, 'KEEP_EXISTING', null, 'Duplicate of v3');
  perform pg_temp.ok(r->>'status' = 'Resolved — Kept Existing' and (select current_version_no from public.dr_reports where id = pg_temp.ctx('report')) = 3, 'keep existing changes nothing');
end $$;

-- ── 6. Never dropped: accepted and flagged for review ───────────────────────
do $$
declare r jsonb; rep public.dr_reports%rowtype;
begin
  -- Rule errors found at sync + an activity outside the unit's scope.
  r := pg_temp.push(pg_temp.ctx('reporter'), current_date - 2, pg_temp.payload(pg_temp.ctx('task2'), 20, 5), 'k-5', pg_temp.ctx('grant'), '1 day',
                    '[{"rule_code":"REQ_FIELD","severity":"ERROR","message":"Add the plan for the next day."}]');
  select * into rep from public.dr_reports where id = (r->>'report_id')::uuid;
  perform pg_temp.ok(r->>'outcome' = 'ACCEPTED' and rep.sync_state = 'REQUIRES_REVIEW', 'report with rule errors is stored, not rejected');
  perform pg_temp.ok(rep.review_flags @> array['rule_errors', 'outside_wbs_scope'], 'reasons recorded');
  perform pg_temp.ok((select count(*) from public.dr_rule_results where report_id = rep.id and severity = 'ERROR') = 1, 'the failed rule is kept for the approver');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('pm') and alert_type = 'dr_requires_review' and title like rep.report_no || '%'), 'approver told it needs review');

  -- Access revoked while the phone was offline.
  perform public.dr_revoke_offline_access(pg_temp.ctx('reporter'), pg_temp.ctx('reporter'));
  update public.dr_reporting_unit_members set status = 'revoked' where unit_id = pg_temp.ctx('unit') and user_id = pg_temp.ctx('reporter');
  r := pg_temp.push(pg_temp.ctx('reporter'), current_date - 3, pg_temp.payload(pg_temp.ctx('task'), 10, 5), 'k-6', pg_temp.ctx('grant'), '2 hours');
  select * into rep from public.dr_reports where id = (r->>'report_id')::uuid;
  perform pg_temp.ok(r->>'outcome' = 'ACCEPTED' and rep.review_flags @> array['offline_grant_revoked', 'membership_revoked'], 'report written before revocation is still accepted, flagged');

  -- Approval settles it.
  perform public.dr_decide_review(pg_temp.ctx('pm'), rep.id, 1, 'APPROVE');
  perform pg_temp.ok((select sync_state from public.dr_reports where id = rep.id) = 'SYNCED', 'approval clears REQUIRES_REVIEW');
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_issue_offline_grant(%L, %L)$q$, pg_temp.ctx('reporter'), pg_temp.ctx('device')),
  'revoked for this device', 'no new grant for a revoked device');

-- ── 7. Quarantine: the database cannot store it, but it is not lost ─────────
do $$
declare r jsonb; c public.dr_sync_conflicts%rowtype; n int;
begin
  select count(*) into n from public.dr_reports where project_id = pg_temp.ctx('project');
  r := pg_temp.push(pg_temp.ctx('reporter'), current_date - 4, pg_temp.payload(pg_temp.ctx('task'), 250, 5), 'k-7', pg_temp.ctx('grant'), '3 hours');
  select * into c from public.dr_sync_conflicts where id = (r->>'conflict_id')::uuid;
  perform pg_temp.ok(r->>'outcome' = 'QUARANTINE' and c.kind = 'QUARANTINE' and c.error ilike '%check%', 'unstorable payload goes to quarantine with the database error');
  perform pg_temp.ok(c.incoming->'payload'->'activities'->0->>'progress_today' = '250', 'quarantined payload kept exactly');
  perform pg_temp.ok((select count(*) from public.dr_reports where project_id = pg_temp.ctx('project')) = n, 'no half-written report left behind');
  insert into t_ctx values ('quarantine', c.id);
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_resolve_conflict(%L, %L, 'DISCARD', null, 'x')$q$, pg_temp.ctx('reporter'), pg_temp.ctx('quarantine')),
  'only be closed by an approver', 'the reporter cannot discard a quarantined report');
do $$
declare r jsonb;
begin
  r := public.dr_resolve_conflict(pg_temp.ctx('pm'), pg_temp.ctx('quarantine'), 'DISCARD', null, 'Progress mistyped; re-entered online');
  perform pg_temp.ok(r->>'status' = 'Resolved — Discarded' and (select incoming is not null from public.dr_sync_conflicts where id = pg_temp.ctx('quarantine')), 'approver closes it; the record remains');
end $$;

-- ── 8. Row-level security ───────────────────────────────────────────────────
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ctx('outsider')::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.ctx('outsider')::text, true);
  set local role authenticated;
  select count(*) into n from public.dr_sync_conflicts;
  perform pg_temp.ok(n = 0, 'RLS: outsider sees no conflicts');
  select count(*) into n from public.dr_offline_grants where user_id <> pg_temp.ctx('outsider');
  perform pg_temp.ok(n = 0, 'RLS: a user sees only their own grants');
  reset role;
end $$;
select pg_temp.expect_error($q$
  do $i$ begin
    set local role authenticated;
    perform public.dr_submit_offline_report(pg_temp.ctx('reporter'), pg_temp.ctx('unit'), current_date, 'WORK', '{}'::jsonb, 'x', now(), pg_temp.ctx('grant'), pg_temp.ctx('device'));
  end $i$ $q$, 'permission denied', 'offline gateway is not callable by clients');
reset role;

select pg_temp.ok(
  (select count(distinct event_code) from public.dr_audit_log where project_id = pg_temp.ctx('project')
     and event_code in ('DR.REPORT_SYNCED', 'DR.SYNC_CONFLICT_RAISED', 'DR.SYNC_CONFLICT_RESOLVED', 'DR.SYNC_QUARANTINED', 'DR.EVIDENCE_UPLOADED')) = 5,
  'audit trail covers sync events');

do $$ begin raise notice 'ALL DR OFFLINE TESTS PASSED'; end $$;
rollback;
