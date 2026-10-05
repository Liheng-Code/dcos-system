-- Module 10-01 Daily Reporting: rule governance (versions, audit, project overrides), database tests.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dr_rule_governance.test.sql
-- One transaction, rolled back. "ALL DR RULE GOVERNANCE TESTS PASSED" means success.

begin;

create temp table t_ctx (k text primary key, v uuid) on commit drop;
grant all on t_ctx to public;

do $$
declare
  v_ids uuid[]; v_admin uuid; v_project uuid;
begin
  select array_agg(id) into v_ids
  from (select id from public.profiles p where not public.is_admin(p.id) order by created_at limit 2) s;
  delete from public.user_roles where user_id = any (v_ids);
  select id into v_admin from public.profiles p where public.is_admin(p.id) order by created_at limit 1;

  insert into public.projects (project_code, project_name, project_type, project_manager_id, dr_enabled)
  values ('DRRG-' || substr(gen_random_uuid()::text, 1, 8), 'DR rule test', 'internal', v_ids[1], true)
  returning id into v_project;

  insert into t_ctx values ('pm', v_ids[1]), ('outsider', v_ids[2]), ('admin', v_admin), ('project', v_project);
end $$;

create or replace function pg_temp.ctx(p text) returns uuid language sql as $$ select v from t_ctx where k = p $$;
create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'TEST FAILED [%]', p_label; end if;
  raise notice 'ok   %', p_label;
end $$;
-- Runs one statement as a signed-in user, under row-level security, and reports how many rows it touched.
create or replace function pg_temp.rows_as(p_user uuid, p_sql text) returns int language plpgsql as $$
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
create or replace function pg_temp.events(p_code text) returns int language sql as $$
  select count(*)::int from public.dr_audit_log where project_id = pg_temp.ctx('project') and event_code = p_code
$$;

-- 1. A project override is created, versioned and audited.
insert into public.dr_rule_definitions (project_id, rule_code, point, severity, params, min_history_days)
values (pg_temp.ctx('project'), 'PROGRESS_JUMP', 'POST_SUBMIT', 'WARNING', '{"multiplier": 4, "window_days": 10, "min_samples": 3}', 10);
select pg_temp.ok(pg_temp.events('DR.RULE_SET') = 1, 'creating a project rule is audited');
select pg_temp.ok(
  (select details->>'rule_code' = 'PROGRESS_JUMP' and details->>'scope' = 'PROJECT' and (details->'params'->>'multiplier') = '4'
   from public.dr_audit_log where project_id = pg_temp.ctx('project') and event_code = 'DR.RULE_SET'),
  'the audit entry holds the rule and its parameters');

update public.dr_rule_definitions set params = jsonb_set(params, '{multiplier}', '5')
where project_id = pg_temp.ctx('project') and rule_code = 'PROGRESS_JUMP';
select pg_temp.ok(
  (select version = 2 from public.dr_rule_definitions where project_id = pg_temp.ctx('project') and rule_code = 'PROGRESS_JUMP'),
  'a change bumps the version');
select pg_temp.ok(
  (select (details->'previous'->'params'->>'multiplier') = '4' and (details->'params'->>'multiplier') = '5' and details->>'version' = '2'
   from public.dr_audit_log where project_id = pg_temp.ctx('project') and event_code = 'DR.RULE_CHANGED'),
  'a change is audited with the old and the new parameters');

update public.dr_rule_definitions set params = params, version = 99
where project_id = pg_temp.ctx('project') and rule_code = 'PROGRESS_JUMP';
select pg_temp.ok(
  (select version = 2 from public.dr_rule_definitions where project_id = pg_temp.ctx('project') and rule_code = 'PROGRESS_JUMP')
  and pg_temp.events('DR.RULE_CHANGED') = 1,
  'an update that changes nothing keeps the version and is not audited; the version cannot be set by hand');

update public.dr_rule_definitions set is_active = false
where project_id = pg_temp.ctx('project') and rule_code = 'PROGRESS_JUMP';
select pg_temp.ok(
  (select version = 3 from public.dr_rule_definitions where project_id = pg_temp.ctx('project') and rule_code = 'PROGRESS_JUMP')
  and pg_temp.events('DR.RULE_CHANGED') = 2,
  'switching a rule off is a change like any other');

-- 2. Who may remove what.
select pg_temp.ok(
  pg_temp.rows_as(pg_temp.ctx('outsider'), format('delete from public.dr_rule_definitions where project_id = %L', pg_temp.ctx('project'))) <= 0
  and exists (select 1 from public.dr_rule_definitions where project_id = pg_temp.ctx('project')),
  'someone with no rights on the project cannot remove its rule');
select pg_temp.ok(
  pg_temp.rows_as(pg_temp.ctx('admin'), $q$delete from public.dr_rule_definitions where project_id is null and rule_code = 'PROGRESS_JUMP'$q$) <= 0
  and exists (select 1 from public.dr_rule_definitions where project_id is null and rule_code = 'PROGRESS_JUMP'),
  'a global default cannot be deleted from the app, even by an administrator');
select pg_temp.ok(
  pg_temp.rows_as(pg_temp.ctx('admin'), format('delete from public.dr_rule_definitions where project_id = %L', pg_temp.ctx('project'))) = 1,
  'an administrator removes the project rule, returning the project to the default');
select pg_temp.ok(pg_temp.events('DR.RULE_REMOVED') = 1, 'removing a project rule is audited');

-- 3. A change to a global default is audited too, against no project.
update public.dr_rule_definitions set params = jsonb_set(params, '{threshold_pct}', '75')
where project_id is null and rule_code = 'MANPOWER_BELOW_PLAN';
select pg_temp.ok(
  exists (select 1 from public.dr_audit_log where project_id is null and event_code = 'DR.RULE_CHANGED'
          and details->>'rule_code' = 'MANPOWER_BELOW_PLAN' and details->>'scope' = 'GLOBAL'),
  'a change to a global default is audited');

do $$ begin raise notice 'ALL DR RULE GOVERNANCE TESTS PASSED'; end $$;

rollback;
