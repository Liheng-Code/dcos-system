-- Module 10-01 Daily Reporting: delegated reviewer (alternate approver), database tests.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dr_approver_delegation.test.sql
-- One transaction, rolled back. "ALL DR APPROVER DELEGATION TESTS PASSED" means success.

begin;

create temp table t_ctx (k text primary key, v uuid) on commit drop;
grant all on t_ctx to public;

do $$
declare
  v_ids uuid[]; v_admin uuid; v_project uuid;
begin
  select array_agg(id) into v_ids
  from (select id from public.profiles p where not public.is_admin(p.id) order by created_at limit 3) s;
  delete from public.user_roles where user_id = any (v_ids);
  select id into v_admin from public.profiles p where public.is_admin(p.id) order by created_at limit 1;

  insert into public.projects (project_code, project_name, project_type, project_manager_id, dr_enabled)
  values ('DRAP-' || substr(gen_random_uuid()::text, 1, 8), 'DR approver test', 'internal', v_ids[1], true)
  returning id into v_project;

  insert into t_ctx values ('pm', v_ids[1]), ('cover', v_ids[2]), ('later', v_ids[3]), ('admin', v_admin), ('project', v_project);
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
create or replace function pg_temp.events(p_code text) returns int language sql as $$
  select count(*)::int from public.dr_audit_log where project_id = pg_temp.ctx('project') and event_code = p_code
$$;

-- 1. Authority follows the dates.
select pg_temp.ok(public.dr_can_review(pg_temp.ctx('project'), pg_temp.ctx('pm')), 'with no approver set, the project manager approves');
select pg_temp.ok(not public.dr_can_review(pg_temp.ctx('project'), pg_temp.ctx('cover')), 'nobody else approves yet');

insert into public.dr_project_approvers (project_id, user_id, approver_role, valid_from, valid_to, set_by)
values (pg_temp.ctx('project'), pg_temp.ctx('cover'), 'ALTERNATE', current_date, current_date + 5, pg_temp.ctx('admin'));
select pg_temp.ok(public.dr_can_review(pg_temp.ctx('project'), pg_temp.ctx('cover')), 'an alternate inside its dates can approve');
select pg_temp.ok(public.dr_can_review(pg_temp.ctx('project'), pg_temp.ctx('pm')), 'the project manager keeps the authority while covered');
select pg_temp.ok(
  (select count(*) = 2 from public.dr_reviewers(pg_temp.ctx('project')) r where r in (pg_temp.ctx('pm'), pg_temp.ctx('cover'))),
  'review notifications go to both');

insert into public.dr_project_approvers (project_id, user_id, approver_role, valid_from, valid_to)
values (pg_temp.ctx('project'), pg_temp.ctx('later'), 'ALTERNATE', current_date + 3, current_date + 10);
select pg_temp.ok(not public.dr_can_review(pg_temp.ctx('project'), pg_temp.ctx('later')), 'cover that starts in the future gives no authority yet');
select pg_temp.ok(
  not exists (select 1 from public.dr_reviewers(pg_temp.ctx('project')) r where r = pg_temp.ctx('later')),
  'and no notifications yet');

select pg_temp.expect_error(
  format($q$insert into public.dr_project_approvers (project_id, user_id, approver_role, valid_from, valid_to)
            values (%L, %L, 'PRIMARY', current_date, current_date - 1)$q$, pg_temp.ctx('project'), pg_temp.ctx('later')),
  'dr_project_approvers_dates_check', 'an end date before the start date is refused');

-- 2. Every change is audited.
select pg_temp.ok(pg_temp.events('DR.APPROVER_SET') = 2, 'setting an approver is audited');
select pg_temp.ok(
  exists (select 1 from public.dr_audit_log where project_id = pg_temp.ctx('project') and event_code = 'DR.APPROVER_SET'
          and details->>'user_id' = pg_temp.ctx('cover')::text and details->>'approver_role' = 'ALTERNATE'
          and details->>'valid_from' = current_date::text and details->>'valid_to' = (current_date + 5)::text),
  'the audit entry says who, which role and which dates');

update public.dr_project_approvers set valid_to = current_date - 1, valid_from = current_date - 2
where project_id = pg_temp.ctx('project') and user_id = pg_temp.ctx('cover');
select pg_temp.ok(pg_temp.events('DR.APPROVER_CHANGED') = 1, 'changing the dates is audited');
select pg_temp.ok(
  exists (select 1 from public.dr_audit_log where project_id = pg_temp.ctx('project') and event_code = 'DR.APPROVER_CHANGED'
          and details->>'previous_valid_to' = (current_date + 5)::text),
  'with the dates it had before');
select pg_temp.ok(not public.dr_can_review(pg_temp.ctx('project'), pg_temp.ctx('cover')), 'an alternate past its end date can no longer approve');

update public.dr_project_approvers set set_by = pg_temp.ctx('admin')
where project_id = pg_temp.ctx('project') and user_id = pg_temp.ctx('later');
select pg_temp.ok(pg_temp.events('DR.APPROVER_CHANGED') = 1, 'a change that alters nothing about the authority is not audited');

delete from public.dr_project_approvers where project_id = pg_temp.ctx('project') and user_id = pg_temp.ctx('later');
select pg_temp.ok(pg_temp.events('DR.APPROVER_REMOVED') = 1, 'removing an approver is audited');

do $$ begin raise notice 'ALL DR APPROVER DELEGATION TESTS PASSED'; end $$;

rollback;
