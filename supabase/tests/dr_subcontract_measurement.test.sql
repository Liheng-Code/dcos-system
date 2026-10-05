-- Module 10-01 Daily Reporting: measurement support for the subcontractor payment certificate, database tests.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dr_subcontract_measurement.test.sql
-- One transaction, rolled back. "ALL DR SUBCONTRACT MEASUREMENT TESTS PASSED" means success.

begin;

create temp table t_ctx (k text primary key, v uuid) on commit drop;
grant all on t_ctx to public;
create temp table t_out (k text primary key, v jsonb) on commit drop;
grant all on t_out to public;

create or replace function pg_temp.ctx(p text) returns uuid language sql as $$ select v from t_ctx where k = p $$;
create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'TEST FAILED [%]', p_label; end if;
  raise notice 'ok   %', p_label;
end $$;
-- The measurement as a signed-in user, under row-level security.
create or replace function pg_temp.measure_as(p_user uuid, p_from date, p_to date) returns jsonb language plpgsql as $$
declare j jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  j := public.dr_subcontract_measurement(pg_temp.ctx('subcontract'), p_from, p_to);
  reset role;
  return j;
end $$;
create or replace function pg_temp.submit(p_days_ago int, p_qty numeric, p_before numeric, p_today numeric) returns uuid language plpgsql as $$
declare v jsonb;
begin
  v := public.dr_submit_report(
    pg_temp.ctx('reporter'), pg_temp.ctx('unit'), current_date - p_days_ago, 'WORK',
    jsonb_build_object('activities', jsonb_build_array(jsonb_build_object(
      'line_id', 'a1', 'task_id', pg_temp.ctx('task'), 'progress_before', p_before, 'progress_today', p_today,
      'reported_qty', p_qty, 'uom', 'm2'))),
    'sm-' || p_days_ago);
  return (v->>'report_id')::uuid;
end $$;

do $$
declare
  v_ids uuid[]; v_project uuid; v_node uuid; v_task uuid; v_unit uuid; v_other uuid; v_sub uuid; v_r uuid;
begin
  select array_agg(id) into v_ids
  from (select id from public.profiles p where not public.is_admin(p.id) order by created_at limit 3) s;
  delete from public.user_roles where user_id = any (v_ids);

  insert into public.projects (project_code, project_name, project_type, project_manager_id, dr_enabled)
  values ('DRSM-' || substr(gen_random_uuid()::text, 1, 8), 'DR measurement test', 'internal', v_ids[2], true)
  returning id into v_project;
  insert into public.wbs_nodes (project_id, node_type, wbs_code, wbs_name) values (v_project, 'phase', 'L06', 'Level 6') returning id into v_node;
  insert into public.wbs_tasks (wbs_node_id, project_id, task_code, task_name) values (v_node, v_project, 'A-1', 'Blockwork') returning id into v_task;
  insert into public.subcontracts (project_id, subcontract_no, contract_type, contract_value)
  values (v_project, 'SC-TEST-' || substr(gen_random_uuid()::text, 1, 6), 'lump_sum', 1000) returning id into v_sub;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at, subcontract_id)
  values (v_project, 'SC-SM', 'SUBCONTRACTOR', 'ABC Masonry', 'Active', current_date - 30, v_sub) returning id into v_unit;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at)
  values (v_project, 'SC-OTHER', 'SUBCONTRACTOR', 'Other Co', 'Active', current_date - 30) returning id into v_other;
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (v_unit, v_ids[1], 'REPORTER');
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (v_other, v_ids[3], 'REPORTER');

  insert into t_ctx values ('reporter', v_ids[1]), ('pm', v_ids[2]), ('outsider', v_ids[3]), ('project', v_project),
                           ('task', v_task), ('unit', v_unit), ('other', v_other), ('subcontract', v_sub);

  -- Day -3: 30 m2 reported, approved as it stands. Day -2: 50 reported, the approver verifies 40. Day -1: 25, not approved.
  v_r := pg_temp.submit(3, 30, 0, 10);
  perform public.dr_decide_review(v_ids[2], v_r, 1, 'APPROVE');
  v_r := pg_temp.submit(2, 50, 10, 30);
  perform public.dr_decide_review(v_ids[2], v_r, 1, 'APPROVE_WITH_REMARK', 'Quantity reduced after site check',
            jsonb_build_array(jsonb_build_object('line_id', 'a1', 'verified_qty', 40, 'remark', 'Measured 40 m2 on site')));
  v_r := pg_temp.submit(1, 25, 30, 40);
  insert into t_ctx values ('pending', v_r);

  -- A report of a unit that is not on this subcontract must never be included.
  perform public.dr_submit_report(v_ids[3], v_other, current_date - 2, 'WORK',
    jsonb_build_object('activities', jsonb_build_array(jsonb_build_object('line_id', 'a1', 'task_id', v_task, 'progress_today', 5, 'reported_qty', 999, 'uom', 'm2'))),
    'sm-other');
end $$;

-- 1. What the QS (here the project manager, a project-wide viewer) sees.
insert into t_out values ('pm', pg_temp.measure_as(pg_temp.ctx('pm'), current_date - 10, current_date));
select pg_temp.ok((select jsonb_array_length(v->'units') = 1 and v->'units'->0->>'unit_code' = 'SC-SM' from t_out where k = 'pm'),
  'only the units linked to the subcontract are listed');
select pg_temp.ok((select (v->'coverage'->>'approved')::int = 2 and (v->'coverage'->>'pending')::int = 1 from t_out where k = 'pm'),
  'approved and not-yet-approved reports of the period are counted');
select pg_temp.ok((select jsonb_array_length(v->'rows') = 1 from t_out where k = 'pm'), 'one row per unit, activity and unit of measure');
select pg_temp.ok(
  (select (r->>'reported_qty')::numeric = 80 and (r->>'verified_qty')::numeric = 70 and (r->>'adjusted_lines')::int = 1
          and (r->>'days')::int = 2 and r->>'uom' = 'm2' and r->>'activity' = 'Blockwork' and r->>'task_code' = 'A-1'
          and r->>'wbs_code' = 'L06' and (r->>'progress_from')::numeric = 0 and (r->>'progress_to')::numeric = 30
          and (r->>'first_date')::date = current_date - 3 and (r->>'last_date')::date = current_date - 2
   from t_out, jsonb_array_elements(v->'rows') r where k = 'pm'),
  'approved days only: reported 80, verified 70 (one line adjusted), progress 0 to 30; the unapproved 25 and the other unit''s 999 are left out');

-- 2. The period is respected.
select pg_temp.ok(
  (select (r->>'reported_qty')::numeric = 50 and (r->>'verified_qty')::numeric = 40 and (r->>'progress_from')::numeric = 10
   from jsonb_array_elements(pg_temp.measure_as(pg_temp.ctx('pm'), current_date - 2, current_date - 2)->'rows') r),
  'a one-day period holds only that day');
select pg_temp.ok(
  (select jsonb_array_length(j->'rows') = 0 and (j->'coverage'->>'approved')::int = 0
   from pg_temp.measure_as(pg_temp.ctx('pm'), current_date - 60, current_date - 30) j),
  'a period with no reports is empty');

-- 3. Once the pending report is approved, it is included.
select public.dr_decide_review(pg_temp.ctx('pm'), pg_temp.ctx('pending'), 1, 'APPROVE');
select pg_temp.ok(
  (select (r->>'reported_qty')::numeric = 105 and (r->>'verified_qty')::numeric = 95 and (r->>'progress_to')::numeric = 40 and (r->>'days')::int = 3
   from jsonb_array_elements(pg_temp.measure_as(pg_temp.ctx('pm'), current_date - 10, current_date)->'rows') r),
  'a report counts from the moment it is approved');

-- 4. Access follows the report tables: someone outside the unit sees no quantities.
select pg_temp.ok(
  (select jsonb_array_length(j->'rows') = 0 and (j->'coverage'->>'approved')::int = 0
   from pg_temp.measure_as(pg_temp.ctx('outsider'), current_date - 10, current_date) j),
  'a reporter of another unit sees none of this subcontract''s quantities');

-- 5. Read-only: nothing reached the payment certificate tables, and the function cannot write.
select pg_temp.ok(
  not exists (select 1 from public.subcontract_ipcs where subcontract_id = pg_temp.ctx('subcontract'))
  and not exists (select 1 from public.subcontract_ipc_items i join public.subcontract_ipcs c on c.id = i.ipc_id where c.subcontract_id = pg_temp.ctx('subcontract')),
  'no payment certificate or certificate line was created');
select pg_temp.ok(
  (select provolatile = 's' and not prosecdef from pg_proc where oid = 'public.dr_subcontract_measurement(uuid, date, date)'::regprocedure),
  'the function is read-only (stable) and runs with the caller''s own access');
select pg_temp.ok(not has_function_privilege('anon', 'public.dr_subcontract_measurement(uuid, date, date)', 'execute'),
  'it is not callable without signing in');

do $$ begin raise notice 'ALL DR SUBCONTRACT MEASUREMENT TESTS PASSED'; end $$;

rollback;
