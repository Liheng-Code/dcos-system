-- Planning release checks (doc 22 P2.1; Wave 1 gate). Self-checking SQL tests for the high-risk Planning paths:
-- steps RLS (P0.2), the schedule write guard (P0.3), validated constraints (P0.4), the started-step lock (P0.5),
-- anon execute (P0.6), membership backfill (P0.1), baseline immutability and approval (P1.1, P1.2), actual dates
-- from progress (P1.3), the duration / date trigger, the link-array checks and the WBS lock guard.
--
-- Everything runs in ONE transaction that is always rolled back: the fixture projects, activities and baselines
-- never persist. Users act through test JWTs (request.jwt.claims + role authenticated), so row-level security,
-- permissions and guards apply exactly as for the app.
--
-- Run on the LOCAL stack (from the repo root, Git Bash):
--   docker exec -i supabase_db_dcos-system psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/tests/planning/planning_release_checks.sql
-- Output: one PASS / FAIL line per check, then a summary; any FAIL raises an error (non-zero exit).
--
-- Test users (local stack; none is an admin): planner = Hanko (L4: schedule / baseline edit, programme approve; a
-- project manager, so the WBS lock does not bind him), approver = Visal (L4, the second person for four-eyes approval),
-- engineer = Sovanarith (L4 planner who is not a project manager), site = Thida (L6: Planning view, and Tasks
-- update-progress, the permission site staff record progress with).

\set ON_ERROR_STOP 1
begin;

-- hide the per-check rows; only the report below prints
\o /dev/null
create temp table _results (n serial, check_name text, ok boolean, detail text) on commit drop;

-- run p_sql as p_user; returns 'ok', 'ok <first value>' or 'ERR <message>'
create function pg_temp.as_user(p_user uuid, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql into r;
  execute 'reset role';
  return coalesce('ok ' || r, 'ok');
exception when others then
  execute 'reset role';
  return 'ERR ' || sqlerrm;
end $$;

create function pg_temp.expect(p_name text, p_ok boolean, p_detail text default null) returns void language sql as $$
  insert into _results (check_name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail);
$$;
create function pg_temp.allowed(p_name text, p_res text) returns void language sql as $$
  select pg_temp.expect(p_name, p_res like 'ok%', p_res);
$$;
create function pg_temp.blocked(p_name text, p_res text) returns void language sql as $$
  select pg_temp.expect(p_name, p_res like 'ERR%', p_res);
$$;

\set planner  '''71be9de5-2de7-49c5-af52-28f6d3b857e5'''
\set approver '''95a942c5-3e3a-4118-8ddf-5a7dbd770930'''
\set viewer   '''db8a234a-45fd-47ee-b2b7-d9c87bad7e23'''
\set engineer '''dadc8b39-f81a-427f-975e-c0191c234835'''

-- ── fixture ──────────────────────────────────────────────────────────────────────────────────────────────────
insert into projects (project_code, project_name, project_type, start_date) values ('TST-P21-A', 'Release check A', 'awarded', '2026-11-02')
  returning id as pa \gset
insert into projects (project_code, project_name, project_type, start_date) values ('TST-P21-B', 'Release check B (no members)', 'awarded', '2026-11-02')
  returning id as pb \gset
insert into project_members (project_id, user_id) values (:'pa', :planner), (:'pa', :approver), (:'pa', :viewer), (:'pa', :engineer) on conflict do nothing;
-- a fixed data date, so the actual dates progress sets are predictable
update projects set data_date = '2026-11-20' where id = :'pa';
-- the schedule settings of A: progress review off, so a planner's direct progress is a normal edit
insert into plan_schedule_settings (project_id, progress_review_enabled) values (:'pa', false)
  on conflict (project_id) do update set progress_review_enabled = false;

insert into wbs_nodes (project_id, node_type, wbs_code, wbs_name, sort_order) values (:'pa', 'task_group', 'P21', 'Open WBS', 1) returning id as na \gset
insert into wbs_nodes (project_id, node_type, wbs_code, wbs_name, sort_order) values (:'pa', 'task_group', 'P21L', 'Locked WBS', 2) returning id as nl \gset
insert into wbs_nodes (project_id, node_type, wbs_code, wbs_name, sort_order) values (:'pb', 'task_group', 'P21B', 'Other project', 1) returning id as nb \gset

insert into wbs_tasks (project_id, wbs_node_id, task_code, task_name, start_date, end_date, duration_days, duration_unit)
  values (:'pa', :'na', 'P21-T1', 'First', '2026-11-02', '2026-11-07', 6, 'wd') returning id as t1 \gset
insert into wbs_tasks (project_id, wbs_node_id, task_code, task_name, start_date, end_date, duration_days, duration_unit,
                       dependency_task_ids, dependency_types, dependency_lag_days)
  values (:'pa', :'na', 'P21-T2', 'Second', '2026-11-09', '2026-11-11', 3, 'wd', array[:'t1']::uuid[], array['fs'], array[0])
  returning id as t2 \gset
insert into wbs_tasks (project_id, wbs_node_id, task_code, task_name, start_date, end_date, duration_days, duration_unit)
  values (:'pa', :'nl', 'P21-T3', 'Under a locked WBS', '2026-11-02', '2026-11-03', 2, 'wd') returning id as t3 \gset
insert into wbs_tasks (project_id, wbs_node_id, task_code, task_name, start_date, end_date, duration_days, duration_unit)
  values (:'pb', :'nb', 'P21-T9', 'Other project task', '2026-11-02', '2026-11-03', 2, 'wd') returning id as t9 \gset
insert into wbs_task_steps (task_id, step_no, step_name, weight) values (:'t1', 1, 'Only step', 100) returning id as s1 \gset
insert into wbs_task_steps (task_id, step_no, step_name, weight) values (:'t9', 1, 'Other step', 100);
-- locking needs an admin or the project manager
\set admin '''0b268e83-4c22-4f79-bf75-06154a7d496c'''
select pg_temp.as_user(:admin, format('update wbs_nodes set is_locked = true where id = %L returning 1', :'nl')) as lock_result \gset
select pg_temp.expect('Fixture: an admin locks a WBS item', :'lock_result' like 'ok%', :'lock_result');

-- ── P0.1 project membership ──────────────────────────────────────────────────────────────────────────────────
select pg_temp.expect('P0.1 every project manager is a member of their project',
  not exists (select 1 from projects p where p.project_manager_id is not null
              and not exists (select 1 from project_members m where m.project_id = p.id and m.user_id = p.project_manager_id)));

-- ── P0.2 step RLS ────────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.blocked('P0.2 site user cannot add a step',
  pg_temp.as_user(:viewer, format('insert into wbs_task_steps (task_id, step_no, step_name, weight) values (%L, 2, %L, 0) returning id', :'t1', 'x')));
select pg_temp.allowed('P0.2 planner (member) can add a step',
  pg_temp.as_user(:planner, format('insert into wbs_task_steps (task_id, step_no, step_name, weight) values (%L, 2, %L, 0) returning id', :'t1', 'Extra')));
select pg_temp.blocked('P0.2 planner cannot add a step on a project they are not a member of',
  pg_temp.as_user(:planner, format('insert into wbs_task_steps (task_id, step_no, step_name, weight) values (%L, 2, %L, 0) returning id', :'t9', 'x')));
select pg_temp.expect('P0.2 planner cannot change a step on a project they are not a member of (no row changes)',
  pg_temp.as_user(:planner, format('with u as (update wbs_task_steps set step_name = %L where task_id = %L returning 1) select count(*) from u', 'x', :'t9')) = 'ok 0');
select pg_temp.expect('P0.2 planner cannot delete a step on a project they are not a member of (no row changes)',
  pg_temp.as_user(:planner, format('with d as (delete from wbs_task_steps where task_id = %L returning 1) select count(*) from d', :'t9')) = 'ok 0');
select pg_temp.expect('P0.2 Planning schedule view reads steps (doc 22 design: member or view permission)',
  pg_temp.as_user(:planner, format('select count(*) from wbs_task_steps where task_id = %L', :'t9')) = 'ok 1');
select pg_temp.expect('P0.2 site user (member) reads the steps',
  pg_temp.as_user(:viewer, format('select count(*) from wbs_task_steps where task_id = %L', :'t1')) = 'ok 2');
select pg_temp.expect('P0.2 site user records a step''s progress (review off, member)',
  pg_temp.as_user(:viewer, format('with u as (update wbs_task_steps set progress = 30 where task_id = %L and step_no = 2 returning 1) select count(*) from u', :'t1')) = 'ok 1');
select pg_temp.blocked('P0.2 site user cannot rename or reweight a step',
  pg_temp.as_user(:viewer, format('update wbs_task_steps set step_name = %L where task_id = %L and step_no = 2 returning 1', 'renamed', :'t1')));

-- ── P0.3 schedule write guard ────────────────────────────────────────────────────────────────────────────────
select pg_temp.blocked('P0.3 site user cannot move an activity''s dates',
  pg_temp.as_user(:viewer, format('update wbs_tasks set end_date = end_date + 1 where id = %L returning 1', :'t2')));
select pg_temp.blocked('P0.3 site user cannot change links',
  pg_temp.as_user(:viewer, format('update wbs_tasks set dependency_lag_days = array[2] where id = %L returning 1', :'t2')));
select pg_temp.allowed('P0.3 site user records progress directly (member, project without progress review)',
  pg_temp.as_user(:viewer, format('update wbs_tasks set progress = 10 where id = %L returning 1', :'t2')));
select pg_temp.expect('P0.3 site user cannot record progress on a project they are not a member of',
  pg_temp.as_user(:viewer, format('with u as (update wbs_tasks set progress = 10 where id = %L returning 1) select count(*) from u', :'t9')) in ('ok 0')
  or pg_temp.as_user(:viewer, format('with u as (update wbs_tasks set progress = 10 where id = %L returning 1) select count(*) from u', :'t9')) like 'ERR%');
update plan_schedule_settings set progress_review_enabled = true where project_id = :'pa';
select pg_temp.blocked('P0.3 with progress review on, site user must submit progress for review',
  pg_temp.as_user(:viewer, format('update wbs_tasks set progress = 15 where id = %L returning 1', :'t2')));
update plan_schedule_settings set progress_review_enabled = false where project_id = :'pa';
select pg_temp.allowed('P0.3 planner can move an activity''s dates',
  pg_temp.as_user(:planner, format('update wbs_tasks set end_date = %L where id = %L returning 1', '2026-11-12', :'t2')));
select pg_temp.blocked('P0.3 nobody writes baseline dates directly (planner)',
  pg_temp.as_user(:planner, format('update wbs_tasks set baseline_finish_date = %L where id = %L returning 1', '2026-12-01', :'t1')));

-- ── duration / date trigger ──────────────────────────────────────────────────────────────────────────────────
select pg_temp.expect('Duration follows the dates (Mon 9 to Thu 12 Nov = 4 working days)',
  (select duration_days from wbs_tasks where id = :'t2') = 4, (select duration_days::text from wbs_tasks where id = :'t2'));

-- ── link-array checks (P0.4 constraints) ─────────────────────────────────────────────────────────────────────
select pg_temp.blocked('Links: arrays of different lengths are refused',
  pg_temp.as_user(:planner, format('update wbs_tasks set dependency_task_ids = array[%L]::uuid[], dependency_types = array[%L, %L], dependency_lag_days = array[0] where id = %L returning 1', :'t1', 'fs', 'ss', :'t2')));
select pg_temp.blocked('Links: an activity cannot depend on itself',
  pg_temp.as_user(:planner, format('update wbs_tasks set dependency_task_ids = array[%L]::uuid[], dependency_types = array[%L], dependency_lag_days = array[0] where id = %L returning 1', :'t2', 'fs', :'t2')));
select pg_temp.blocked('Links: an unknown link type is refused',
  pg_temp.as_user(:planner, format('update wbs_tasks set dependency_types = array[%L] where id = %L returning 1', 'XX', :'t2')));
select pg_temp.expect('P0.4 the six wbs_tasks checks are validated for every row',
  (select count(*) from pg_constraint where conrelid = 'public.wbs_tasks'::regclass and convalidated and conname in
    ('wbs_tasks_dep_arrays_len', 'wbs_tasks_dep_no_self', 'wbs_tasks_dep_types_valid', 'wbs_tasks_hours_nonneg',
     'wbs_tasks_progress_method_check', 'wbs_tasks_reviewer_independent')) = 6);

-- ── WBS lock guard ───────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.blocked('Lock guard: a planner who is not a project manager cannot change an activity under a locked WBS item',
  pg_temp.as_user(:engineer, format('update wbs_tasks set end_date = end_date + 1 where id = %L returning 1', :'t3')));
select pg_temp.allowed('Lock guard: the project manager still can (by design)',
  pg_temp.as_user(:planner, format('update wbs_tasks set task_name = %L where id = %L returning 1', 'Under a locked WBS (PM edit)', :'t3')));

-- ── P0.5 started-step lock ───────────────────────────────────────────────────────────────────────────────────
select pg_temp.allowed('P0.5 planner records step progress',
  pg_temp.as_user(:planner, format('update wbs_task_steps set progress = 20 where id = %L returning 1', :'s1')));
select pg_temp.blocked('P0.5 a started step''s weight is locked',
  pg_temp.as_user(:planner, format('update wbs_task_steps set weight = 50 where id = %L returning 1', :'s1')));

-- ── P1.3 actual dates from progress ──────────────────────────────────────────────────────────────────────────
select pg_temp.allowed('P1.3 planner records 40% (review off)',
  pg_temp.as_user(:planner, format('update wbs_tasks set progress = 40 where id = %L returning 1', :'t2')));
select pg_temp.expect('P1.3 progress above 0 set the actual start (the planned start, before the data date)',
  (select actual_start_date from wbs_tasks where id = :'t2') = '2026-11-09', (select actual_start_date::text from wbs_tasks where id = :'t2'));
select pg_temp.allowed('P1.3 planner records 100%',
  pg_temp.as_user(:planner, format('update wbs_tasks set progress = 100 where id = %L returning 1', :'t2')));
select pg_temp.expect('P1.3 100% sets the actual finish',
  (select actual_finish_date from wbs_tasks where id = :'t2') = '2026-11-12', (select actual_finish_date::text from wbs_tasks where id = :'t2'));
select pg_temp.expect('P1.3 no activity anywhere has progress without an actual start',
  not exists (select 1 from wbs_tasks where coalesce(progress, 0) > 0 and actual_start_date is null));

-- ── P1.1 / P1.2 baselines ────────────────────────────────────────────────────────────────────────────────────
select pg_temp.blocked('P1.2 site user cannot set a baseline',
  pg_temp.as_user(:viewer, format('select set_baseline(%L, 1, null, %L, %L, %L)', :'pa', 'BL1', 'contract', 'first')));
select pg_temp.allowed('P1.2 planner sets baseline 1 (submitted for approval)',
  pg_temp.as_user(:planner, format('select set_baseline(%L, 1, null, %L, %L, %L)', :'pa', 'BL1', 'contract', 'release check')));
select id as b1 from wbs_baselines where project_id = :'pa' and baseline_number = 1 \gset
select pg_temp.expect('P1.2 a new baseline is not approved yet',
  (select status from wbs_baselines where id = :'b1') <> 'approved', (select status from wbs_baselines where id = :'b1'));
select pg_temp.blocked('P1.2 an unapproved baseline cannot be made active',
  pg_temp.as_user(:planner, format('select activate_baseline(%L, 1)', :'pa')));
select pg_temp.blocked('P1.2 the submitter cannot approve their own baseline',
  pg_temp.as_user(:planner, format('select approve_baseline(%L, %L)', :'b1', 'own')));
select pg_temp.blocked('P1.2 nobody approves by editing the status directly',
  pg_temp.as_user(:planner, format('update wbs_baselines set status = %L where id = %L returning 1', 'approved', :'b1')));
select pg_temp.allowed('P1.2 a second person approves it',
  pg_temp.as_user(:approver, format('select approve_baseline(%L, %L)', :'b1', 'checked')));
select pg_temp.expect('P1.2 the approved baseline is active and its dates reach the activities',
  (select status = 'approved' and is_active from wbs_baselines where id = :'b1')
  and (select baseline_finish_date from wbs_tasks where id = :'t1') is not null);
select pg_temp.blocked('P1.1 an approved baseline slot cannot be set again',
  pg_temp.as_user(:planner, format('select set_baseline(%L, 1, null, %L, %L, %L)', :'pa', 'BL1 again', 'contract', 'overwrite')));
select pg_temp.blocked('P1.1 an approved baseline''s snapshot cannot be edited',
  pg_temp.as_user(:approver, format('update wbs_baselines set snapshot_data = %L where id = %L returning 1', '{}', :'b1')));
select pg_temp.blocked('P1.1 an approved baseline cannot be cleared',
  pg_temp.as_user(:approver, format('select clear_baseline(%L, 1, null)', :'pa')));
select pg_temp.allowed('P1.2 planner submits baseline 2 (revised)',
  pg_temp.as_user(:planner, format('select set_baseline(%L, 2, null, %L, %L, %L)', :'pa', 'BL2', 'revised', 'revision for the check')));
select id as b2 from wbs_baselines where project_id = :'pa' and baseline_number = 2 \gset
select pg_temp.allowed('P1.2 the approver rejects it with a reason',
  pg_temp.as_user(:approver, format('select reject_baseline(%L, %L)', :'b2', 'not ready')));
select pg_temp.expect('P1.2 a rejected baseline is not active and baseline 1 stays in force',
  (select not is_active from wbs_baselines where id = :'b2') and (select is_active from wbs_baselines where id = :'b1'),
  (select status from wbs_baselines where id = :'b2'));

-- ── P1.5 / doc 35 Q3 schedule quality gate on baseline submission ──────────────────────────────────────────
insert into plan_schedule_settings (project_id, qaqc_gate) values (:'pa', 'block')
  on conflict (project_id) do update set qaqc_gate = 'block';
select pg_temp.blocked('P1.5 gate "block": a baseline cannot be submitted without a recent schedule check',
  pg_temp.as_user(:planner, format('select set_baseline(%L, 3, null, %L, %L, %L)', :'pa', 'BL3', 'revised', 'gate check')));
insert into plan_schedule_qaqc_runs (project_id, engine_version) values (:'pa', 'test') returning id as qr \gset
insert into plan_schedule_qaqc_findings (project_id, check_code, check_number, check_name, severity, message, status, first_run_id, last_run_id)
  values (:'pa', 'logic', 1, 'Logic', 'critical', 'Open ends', 'open', :'qr', :'qr') returning id as qf \gset
select pg_temp.blocked('P1.5 gate "block": an open critical finding stops the submission',
  pg_temp.as_user(:planner, format('select set_baseline(%L, 3, null, %L, %L, %L)', :'pa', 'BL3', 'revised', 'gate check')));
update plan_schedule_qaqc_findings set status = 'accepted', accept_reason = 'release check', accepted_at = now() where id = :'qf';
select pg_temp.allowed('P1.5 gate "block": with the finding accepted, the baseline can be submitted',
  pg_temp.as_user(:planner, format('select set_baseline(%L, 3, null, %L, %L, %L)', :'pa', 'BL3', 'revised', 'gate check')));

-- ── P0.6 anon execute ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.expect('P0.6 no Planning function is executable by anon',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
              and (p.proname like 'plan\_%' or p.proname like '%baseline%'
                   or p.proname in ('advance_data_date', 'submit_progress', 'decide_progress_review', 'sync_daily_report_to_planning',
                                    'apply_schedule_dates', 'task_transition', 'wbs_node_delete_check'))
              and has_function_privilege('anon', p.oid, 'execute')));

\o
-- ── report ───────────────────────────────────────────────────────────────────────────────────────────────────
select case when ok then 'PASS' else 'FAIL' end as result, check_name,
       case when ok then '' else coalesce(detail, '') end as detail
  from _results order by n;

do $$
declare v_fail int; v_all int;
begin
  select count(*) filter (where not ok), count(*) into v_fail, v_all from _results;
  if v_fail > 0 then
    raise exception 'Planning release checks: % of % FAILED', v_fail, v_all;
  end if;
  raise notice 'Planning release checks: all % passed', v_all;
end $$;

rollback;
