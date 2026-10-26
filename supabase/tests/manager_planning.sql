-- Rolled-back check for migration 20261013000008 (set_task_planning, department-manager rules).
-- Run: docker exec -i supabase_db_dcos-system psql -U postgres -d postgres -f - < this file
begin;
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
      perform set_config('role','authenticated', true); end $f$;
create or replace function pg_temp.as_db() returns void language plpgsql as $f$
begin perform set_config('role','postgres', true); end $f$;

do $$
declare
  admin1 uuid := 'd12566af-4e73-4bd7-8bf1-e117a145df49';
  emp uuid := 'aa123ed6-f8bf-464c-984b-c191e888ac97';
  proj uuid := '1181449f-7991-4605-8a3e-4437e17df886';
  mgr uuid; stranger uuid; v_role text; dept uuid; t uuid; plan uuid; res jsonb; msg text;
begin
  select id into mgr from profiles where role <> 'admin' and id not in (select user_id from user_roles where role_code = 'admin') order by id limit 1;
  select id into stranger from profiles where role <> 'admin' and id not in (select user_id from user_roles where role_code = 'admin') and id <> mgr order by id limit 1;
  select rp.role_code into v_role from role_permissions rp where rp.module = 'task_management' and rp.action = 'plan_team' and rp."edit" limit 1;
  select id into dept from departments where department_code = 'CONST';
  insert into user_roles(user_id, role_code) values (mgr, v_role), (stranger, v_role) on conflict do nothing;
  insert into project_members(project_id, user_id) values (proj, mgr), (proj, stranger) on conflict do nothing;
  update departments set department_head = mgr where id = dept;
  select id into t from wbs_tasks where project_id = proj and department_id = dept and status = 'open' order by id limit 1;

  perform pg_temp.as_user(stranger);
  begin perform set_task_planning(t, jsonb_build_object('owner_id', emp)); raise notice 'FAIL non-manager planned task';
  exception when others then get stacked diagnostics msg = message_text; raise notice 'non-manager blocked: OK (%)', msg; end;

  perform pg_temp.as_user(mgr);
  res := set_task_planning(t, jsonb_build_object('owner_id', emp, 'estimated_hours', 16, 'start_date', '2026-10-19', 'end_date', '2026-10-21'));
  raise notice 'manager plans task: % (expect assigned)', res;
  perform pg_temp.as_db();
  raise notice 'owner=emp %, assigned_by=mgr %, est=16 %, audit=% (expect 3)',
    (select owner_id = emp from wbs_tasks where id = t), (select assigned_by = mgr from wbs_tasks where id = t),
    (select estimated_hours = 16 from wbs_tasks where id = t),
    (select count(*) from wbs_audit_log where wbs_task_id = t and user_id = mgr);

  perform pg_temp.as_user(mgr);
  begin perform set_task_planning(t, jsonb_build_object('reviewer_id', emp)); raise notice 'FAIL reviewer = owner';
  exception when others then raise notice 'reviewer = owner blocked: OK'; end;
  begin perform set_task_planning(t, jsonb_build_object('end_date', '2026-10-01')); raise notice 'FAIL finish before start';
  exception when others then raise notice 'finish before start blocked: OK'; end;
  begin perform set_task_planning(t, jsonb_build_object('colour', 'red')); raise notice 'FAIL unknown field';
  exception when others then raise notice 'unknown field blocked: OK'; end;
  res := set_task_planning(t, jsonb_build_object('reviewer_id', admin1, 'approver_id', null));
  raise notice 'reviewer set: ok';

  -- plan + publish by manager; stranger cannot publish/reopen
  perform pg_temp.as_db();
  insert into weekly_plans(project_id, department_id, week_start_date, title, status, created_by)
    values (proj, dept, '2026-10-19', 'MGR TEST', 'approved', mgr) returning id into plan;
  insert into weekly_plan_tasks(weekly_plan_id, wbs_task_id, responsible_id, target_progress) values (plan, t, emp, 10);
  perform pg_temp.as_user(stranger);
  begin perform publish_team_plan(plan); raise notice 'FAIL stranger published';
  exception when others then get stacked diagnostics msg = message_text; raise notice 'stranger publish blocked: OK (%)', msg; end;
  perform pg_temp.as_user(mgr);
  res := publish_team_plan(plan);
  raise notice 'manager publishes: %', res;
  begin perform set_task_planning(t, jsonb_build_object('estimated_hours', 20)); raise notice 'FAIL planning change on published';
  exception when others then raise notice 'planning a published task blocked: OK'; end;
  perform pg_temp.as_user(stranger);
  begin perform reopen_team_plan(plan, 'Trying to reopen'); raise notice 'FAIL stranger reopened';
  exception when others then raise notice 'stranger reopen blocked: OK'; end;
  perform pg_temp.as_user(mgr);
  perform reopen_team_plan(plan, 'Manager reopens plan');
  res := set_task_planning(t, jsonb_build_object('estimated_hours', 20));
  raise notice 'after reopen planning works: %', res;
end $$;
rollback;
