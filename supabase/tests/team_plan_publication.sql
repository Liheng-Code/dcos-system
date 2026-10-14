-- Rolled-back check for migration 20261013000006 (publish_team_plan / reopen_team_plan).
-- Run: docker exec -i supabase_db_dcos-system psql -U postgres -d postgres -f - < this file
-- Uses local admin profiles and picks a project that has tasks; creates its own plan inside the transaction.
begin;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
      perform set_config('role','authenticated', true); end $f$;

do $$
declare
  mgr uuid := 'd12566af-4e73-4bd7-8bf1-e117a145df49';   -- admin, member of the project below
  emp1 uuid := 'aa123ed6-f8bf-464c-984b-c191e888ac97';
  emp2 uuid := '0b268e83-4c22-4f79-bf75-06154a7d496c';
  proj uuid := '1181449f-7991-4605-8a3e-4437e17df886';
  t1 uuid; t2 uuid; plan uuid; res jsonb; n int; msg text;
begin
  select id into t1 from wbs_tasks where project_id = proj and status = 'open' order by id limit 1;
  select id into t2 from wbs_tasks where project_id = proj and status = 'open' and id <> t1 order by id limit 1;
  insert into weekly_plans(project_id, week_start_date, title, status, created_by, revision_no)
    values (proj, '2026-10-12', 'TEST', 'approved', mgr, 0) returning id into plan;
  insert into weekly_plan_tasks(weekly_plan_id, wbs_task_id, responsible_id, target_progress) values
    (plan, t1, emp1, 20), (plan, t2, emp2, 30);

  perform pg_temp.as_user(mgr);
  res := publish_team_plan(plan);
  raise notice 'publish: % (expect rev 1, 2 assigned, 2 notifications)', res;
  raise notice 'owner t1 = emp1: %', (select owner_id = emp1 from wbs_tasks where id = t1);
  raise notice 'status t1 = assigned: %', (select status = 'assigned' from wbs_tasks where id = t1);
  perform set_config('role','postgres',true); raise notice 'alerts: % (expect 2)', (select count(*) from task_alerts where source_key like 'plan:' || plan || '%'); perform pg_temp.as_user(mgr);
  raise notice 'audit rows: % (expect 2)', (select count(*) from wbs_audit_log where wbs_task_id in (t1,t2) and action='Assignee Changed' and user_id = mgr and created_at > now() - interval '1 minute');

  begin perform publish_team_plan(plan); raise notice 'FAIL double publish allowed';
  exception when others then raise notice 'double publish blocked: OK'; end;

  begin update weekly_plan_tasks set responsible_id = emp2 where weekly_plan_id = plan and wbs_task_id = t1;
        raise notice 'FAIL edit of published plan allowed';
  exception when others then raise notice 'edit of published plan blocked: OK'; end;
  begin delete from weekly_plans where id = plan; raise notice 'FAIL delete of published plan allowed';
  exception when others then raise notice 'delete of published plan blocked: OK'; end;

  begin perform reopen_team_plan(plan, 'no'); raise notice 'FAIL reopen without reason';
  exception when others then raise notice 'reopen without reason blocked: OK'; end;
  perform reopen_team_plan(plan, 'Move task 1 to Employee 2');
  update weekly_plan_tasks set responsible_id = emp2 where weekly_plan_id = plan and wbs_task_id = t1;
  begin perform publish_team_plan(plan); raise notice 'FAIL republish without reason';
  exception when others then raise notice 'republish without reason blocked: OK'; end;
  res := publish_team_plan(plan, 'Move task 1 to Employee 2',
    '[{"profile_id":"0b268e83-4c22-4f79-bf75-06154a7d496c","period_start":"2026-10-12","period_end":"2026-10-18","planned_hours":45,"available_hours":40,"utilization_pct":112.5,"reason":"Deadline-driven, approved by PM"}]');
  raise notice 'republish: % (expect rev 2)', res;
  perform set_config('role','postgres',true); raise notice 'alerts for emp1 revised/removed: % (expect 1)', (select count(*) from task_alerts where recipient_id = emp1 and source_key like 'plan:' || plan || ':r2:removed%');
  raise notice 'overrides recorded: % (expect 1)', (select count(*) from capacity_overrides where weekly_plan_id = plan);
  raise notice 'revisions: % (expect published, reopened, published = 3)', (select count(*) from team_plan_revisions where weekly_plan_id = plan);

  begin perform publish_team_plan(plan); exception when others then null; end;
  perform reopen_team_plan(plan, 'Testing override reason');
  begin perform publish_team_plan(plan, 'Testing override reason', '[{"profile_id":"0b268e83-4c22-4f79-bf75-06154a7d496c","period_start":"2026-10-12","period_end":"2026-10-18","reason":"x"}]');
        raise notice 'FAIL override without reason';
  exception when others then raise notice 'override without reason blocked: OK'; end;

  -- non-admin without plan_team permission cannot publish
  perform set_config('role','postgres',true);
  update weekly_plans set status = 'approved' where id = plan;
  perform pg_temp.as_user((select id from profiles where role <> 'admin' and id not in (select user_id from user_roles where role_code='admin') limit 1));
  begin perform publish_team_plan(plan, 'Testing no permission'); raise notice 'FAIL unauthorised publish';
  exception when others then get stacked diagnostics msg = message_text; raise notice 'unauthorised publish blocked: OK (%)', msg; end;
end $$;
rollback;
