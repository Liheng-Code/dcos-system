-- Module 10-01 Daily Reporting: unit performance, weekly trend and productivity benchmark, database tests.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dr_performance.test.sql
-- One transaction, rolled back. "ALL DR PERFORMANCE TESTS PASSED" means success.

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
create or replace function pg_temp.perf_as(p_user uuid) returns jsonb language plpgsql as $$
declare j jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  j := public.dr_performance(pg_temp.ctx('project'), current_date - 20, current_date);
  reset role;
  return j;
end $$;
-- One report: quantity and workers on the shared activity. Returns the report id.
create or replace function pg_temp.submit(p_who text, p_unit text, p_days_ago int, p_qty numeric, p_workers int) returns uuid language plpgsql as $$
declare v jsonb;
begin
  v := public.dr_submit_report(
    pg_temp.ctx(p_who), pg_temp.ctx(p_unit), current_date - p_days_ago, 'WORK',
    jsonb_build_object('activities', jsonb_build_array(jsonb_build_object(
      'line_id', 'a1', 'task_id', pg_temp.ctx('task'), 'progress_today', 50 - p_days_ago,
      'reported_qty', p_qty, 'uom', 'm2', 'headcount', p_workers))),
    'pf-' || p_unit || '-' || p_days_ago);
  return (v->>'report_id')::uuid;
end $$;
create or replace function pg_temp.unit_row(p_key text, p_code text) returns jsonb language sql as $$
  select u from t_out, jsonb_array_elements(v->'units') u where k = p_key and u->>'unit_code' = p_code
$$;

do $$
declare
  v_ids uuid[]; v_project uuid; v_node uuid; v_task uuid; v_a uuid; v_b uuid; v_r uuid; i int;
begin
  select array_agg(id) into v_ids
  from (select id from public.profiles p where not public.is_admin(p.id) order by created_at limit 3) s;
  delete from public.user_roles where user_id = any (v_ids);

  insert into public.projects (project_code, project_name, project_type, project_manager_id, dr_enabled)
  values ('DRPF-' || substr(gen_random_uuid()::text, 1, 8), 'DR performance test', 'internal', v_ids[2], true)
  returning id into v_project;
  insert into public.wbs_nodes (project_id, node_type, wbs_code, wbs_name) values (v_project, 'phase', 'L06', 'Level 6') returning id into v_node;
  insert into public.wbs_tasks (wbs_node_id, project_id, task_code, task_name) values (v_node, v_project, 'A-1', 'Blockwork') returning id into v_task;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at)
  values (v_project, 'SC-A', 'SUBCONTRACTOR', 'Alpha Masonry', 'Active', current_date - 40) returning id into v_a;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at)
  values (v_project, 'SC-B', 'SUBCONTRACTOR', 'Beta Masonry', 'Active', current_date - 40) returning id into v_b;
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (v_a, v_ids[1], 'REPORTER'), (v_b, v_ids[3], 'REPORTER');

  insert into t_ctx values ('ra', v_ids[1]), ('pm', v_ids[2]), ('rb', v_ids[3]), ('project', v_project), ('task', v_task), ('a', v_a), ('b', v_b);

  -- Unit A: four approved days, 40 m2 with 10 workers each (4 per worker). One of them late, one adjusted to 30.
  for i in 1..4 loop
    v_r := pg_temp.submit('ra', 'a', i, 40, 10);
    -- Reports for past days are stored as late; set the flag to what this test needs.
    update public.dr_reports set late_flag = (i = 2) where id = v_r;
    if i = 3 then
      perform public.dr_decide_review(v_ids[2], v_r, 1, 'APPROVE_WITH_REMARK', 'Reduced after site check',
                jsonb_build_array(jsonb_build_object('line_id', 'a1', 'verified_qty', 30, 'remark', 'Measured 30 m2')));
    else
      perform public.dr_decide_review(v_ids[2], v_r, 1, 'APPROVE');
    end if;
  end loop;
  -- Unit A: a fifth report, returned for correction and still open; and one working day with no report.
  v_r := pg_temp.submit('ra', 'a', 5, 40, 10);
  update public.dr_reports set late_flag = false where id = v_r;
  perform public.dr_decide_review(v_ids[2], v_r, 1, 'RETURN', 'Quantity looks too high', '[]'::jsonb,
            '[{"target_section":"activities","target_line_id":"a1","reason":"Check the quantity"}]'::jsonb);
  insert into public.dr_missing_reports (project_id, unit_id, report_date, status) values (v_project, v_a, current_date - 6, 'Open');
  -- An excused day is not the unit's fault and must not count.
  insert into public.dr_missing_reports (project_id, unit_id, report_date, status, excuse_reason) values (v_project, v_a, current_date - 7, 'Excused', 'Site closed');

  -- Unit B: three approved days at 20 m2 with 10 workers (2 per worker).
  for i in 1..3 loop
    v_r := pg_temp.submit('rb', 'b', i, 20, 10);
    update public.dr_reports set late_flag = false where id = v_r;
    perform public.dr_decide_review(v_ids[2], v_r, 1, 'APPROVE');
  end loop;
end $$;

insert into t_out values ('pm', pg_temp.perf_as(pg_temp.ctx('pm')));

-- 1. Unit counts.
select pg_temp.ok((select (v->>'allowed')::boolean and jsonb_array_length(v->'units') = 2 from t_out where k = 'pm'), 'a project-wide viewer gets both units');
select pg_temp.ok(
  (select (u->>'reports')::int = 5 and (u->>'on_time')::int = 4 and (u->>'late')::int = 1 and (u->>'missing')::int = 1
          and (u->>'approved')::int = 4 and (u->>'returned')::int = 1
   from pg_temp.unit_row('pm', 'SC-A') u),
  'unit A: 5 received, 4 on time, 1 late, 1 missing (the excused day is not counted), 4 approved, 1 returned');
select pg_temp.ok(
  (select (u->>'qty_lines')::int = 4 and (u->>'adjusted_lines')::int = 1 from pg_temp.unit_row('pm', 'SC-A') u),
  'unit A: 4 approved quantities, 1 changed by the approver; the returned report is not counted');
select pg_temp.ok(
  (select (u->>'reports')::int = 3 and (u->>'on_time')::int = 3 and (u->>'missing')::int = 0 and (u->>'returned')::int = 0
          and (u->>'qty_lines')::int = 3 and (u->>'adjusted_lines')::int = 0
   from pg_temp.unit_row('pm', 'SC-B') u),
  'unit B: 3 received, all on time, none returned or adjusted');

-- 2. Weekly trend adds up to the same totals.
select pg_temp.ok(
  (select sum((w->>'on_time')::int) = 7 and sum((w->>'late')::int) = 1 and sum((w->>'missing')::int) = 1
   from t_out, jsonb_array_elements(v->'weeks') w where k = 'pm'),
  'the weekly counts add up to the unit counts');

-- 3. Productivity benchmark: verified quantities, compared with the project's typical day.
select pg_temp.ok(
  (select (b->>'days')::int = 4 and (b->>'qty')::numeric = 150 and (b->>'worker_days')::numeric = 40 and (b->>'per_worker')::numeric = 3.75
          and b->>'uom' = 'm2' and b->>'activity' = 'Blockwork' and (b->>'typical_units')::int = 2 and (b->>'typical_days')::int = 7
          and (b->>'typical_per_worker')::numeric = 3
   from t_out, jsonb_array_elements(v->'benchmark') b where k = 'pm' and b->>'unit_code' = 'SC-A'),
  'unit A: 150 m2 verified over 40 worker-days = 3.75 per worker; the project median over 7 days is 3');
select pg_temp.ok(
  (select (b->>'per_worker')::numeric = 2 and (b->>'days')::int = 3
   from t_out, jsonb_array_elements(v->'benchmark') b where k = 'pm' and b->>'unit_code' = 'SC-B'),
  'unit B: 2 per worker');

-- 4. A reporting unit does not get its own or anyone else's figures.
select pg_temp.ok(
  (select (j->>'allowed')::boolean is false and jsonb_array_length(j->'units') = 0 and jsonb_array_length(j->'benchmark') = 0
          and jsonb_array_length(j->'weeks') = 0
   from pg_temp.perf_as(pg_temp.ctx('ra')) j),
  'a reporter gets nothing back');

-- 5. Read-only.
select pg_temp.ok(
  (select provolatile = 's' and not prosecdef from pg_proc where oid = 'public.dr_performance(uuid, date, date)'::regprocedure)
  and not has_function_privilege('anon', 'public.dr_performance(uuid, date, date)', 'execute'),
  'the function is read-only, runs with the caller''s access, and needs a signed-in user');

do $$ begin raise notice 'ALL DR PERFORMANCE TESTS PASSED'; end $$;

rollback;
