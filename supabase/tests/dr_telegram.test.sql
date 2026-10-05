-- Module 10-01 Daily Reporting — Phase 1C Telegram binding and launch, database tests.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dr_telegram.test.sql
-- One transaction, rolled back. "ALL DR TELEGRAM TESTS PASSED" means success.

begin;

create temp table t_ctx (k text primary key, v uuid) on commit drop;
grant all on t_ctx to public;

do $$
declare
  v_ids uuid[]; v_project uuid; v_node uuid; v_task uuid; v_unit uuid; v_unit2 uuid;
begin
  select array_agg(id) into v_ids
  from (select id from public.profiles p where not public.is_admin(p.id) order by created_at limit 3) s;
  delete from public.user_roles where user_id = any (v_ids);

  insert into public.projects (project_code, project_name, project_type, project_manager_id, dr_enabled)
  values ('DRTG-' || substr(gen_random_uuid()::text, 1, 8), 'DR telegram test', 'internal', v_ids[2], true)
  returning id into v_project;
  insert into public.wbs_nodes (project_id, node_type, wbs_code, wbs_name) values (v_project, 'phase', 'IN', 'In') returning id into v_node;
  insert into public.wbs_tasks (wbs_node_id, project_id, task_code, task_name) values (v_node, v_project, 'A-1', 'In scope') returning id into v_task;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at)
  values (v_project, 'SC-TG1', 'SUBCONTRACTOR', 'Telegram Sub 1', 'Active', current_date - 30) returning id into v_unit;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at)
  values (v_project, 'SC-TG2', 'SUBCONTRACTOR', 'Telegram Sub 2', 'Active', current_date - 30) returning id into v_unit2;
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (v_unit, v_ids[1], 'REPORTER');

  insert into t_ctx values ('reporter', v_ids[1]), ('pm', v_ids[2]), ('outsider', v_ids[3]), ('project', v_project),
    ('task', v_task), ('unit', v_unit), ('unit2', v_unit2);
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
create or replace function pg_temp.payload(p_task uuid) returns jsonb language sql as $$
  select jsonb_build_object('schema_version', 1,
    'weather', jsonb_build_object('condition', 'Sunny'),
    'manpower', jsonb_build_array(jsonb_build_object('line_id', 'm1', 'trade', 'Mason', 'reported_count', 6)),
    'activities', jsonb_build_array(jsonb_build_object('line_id', 'a1', 'task_id', p_task, 'progress_today', 10,
                                                       'reported_qty', 5, 'uom', 'm2', 'work_status', 'in_progress')),
    'safety', jsonb_build_object('toolbox_talk_held', true, 'incident_count', 0))
$$;

-- ── 1. Starting a binding ───────────────────────────────────────────────────
select pg_temp.expect_error(
  format($q$select public.dr_tg_create_binding(%L, %L, 'h-x')$q$, pg_temp.ctx('outsider'), pg_temp.ctx('unit')),
  'DR_FORBIDDEN', 'an outsider cannot start a binding');
select pg_temp.expect_error(
  format($q$select public.dr_tg_create_binding(%L, %L, 'h-x')$q$, pg_temp.ctx('reporter'), pg_temp.ctx('unit')),
  'DR_FORBIDDEN', 'a reporter cannot start a binding');
do $$
declare r jsonb; r2 jsonb;
begin
  r := public.dr_tg_create_binding(pg_temp.ctx('pm'), pg_temp.ctx('unit'), 'h-old');
  r2 := public.dr_tg_create_binding(pg_temp.ctx('pm'), pg_temp.ctx('unit'), 'h-1');
  insert into t_ctx values ('binding', (r2->>'binding_id')::uuid);
  perform pg_temp.ok((select status from public.dr_telegram_bindings where id = (r->>'binding_id')::uuid) = 'Unbound'
                     and (select status from public.dr_telegram_bindings where id = (r2->>'binding_id')::uuid) = 'Pending',
                     'a new request replaces the earlier pending one');
  perform pg_temp.ok((r2->>'expires_at')::timestamptz between now() + interval '29 minutes' and now() + interval '31 minutes',
                     'the binding code lasts 30 minutes');
end $$;

-- ── 2. The bot sees the code in a group ─────────────────────────────────────
select pg_temp.expect_error(
  format($q$select public.dr_tg_bind_chat(%L, 'h-wrong', -1001, 'Group', 'group')$q$, pg_temp.ctx('pm')),
  'DR_NOT_FOUND', 'an unknown code binds nothing');
select pg_temp.expect_error(
  format($q$select public.dr_tg_bind_chat(%L, 'h-old', -1001, 'Group', 'group')$q$, pg_temp.ctx('pm')),
  'DR_STATE', 'the code of a replaced request no longer works');
select pg_temp.expect_error(
  format($q$select public.dr_tg_bind_chat(%L, 'h-1', -1001, 'Group', 'group')$q$, pg_temp.ctx('reporter')),
  'DR_FORBIDDEN', 'a code posted by someone who may not bind is refused');
select pg_temp.expect_error(
  format($q$select public.dr_tg_bind_chat(%L, 'h-1', 555, 'Private', 'private')$q$, pg_temp.ctx('pm')),
  'DR_INVALID', 'a private chat cannot be bound');
do $$
declare r jsonb;
begin
  r := public.dr_tg_bind_chat(pg_temp.ctx('pm'), 'h-1', -1001, 'Site A — Sub 1', 'group');
  perform pg_temp.ok((r->>'unit_id')::uuid = pg_temp.ctx('unit')
                     and (select status = 'Active' and chat_id = -1001 and valid_from is not null
                          from public.dr_telegram_bindings where id = pg_temp.ctx('binding')),
                     'posting the code activates the binding');
  perform pg_temp.ok(exists (select 1 from public.dr_audit_log where event_code = 'DR.BINDING_ACTIVATED' and unit_id = pg_temp.ctx('unit')),
                     'activation is audited');
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_tg_bind_chat(%L, 'h-1', -1002, 'Other', 'group')$q$, pg_temp.ctx('pm')),
  'DR_NOT_FOUND', 'a binding code works once');
do $$
begin
  perform public.dr_tg_create_binding(pg_temp.ctx('pm'), pg_temp.ctx('unit2'), 'h-2');
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_tg_bind_chat(%L, 'h-2', -1001, 'Site A', 'group')$q$, pg_temp.ctx('pm')),
  'already bound', 'one group cannot serve two units');
do $$
begin
  update public.dr_telegram_binding_codes set expires_at = now() - interval '1 minute' where code_hash = 'h-2';
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_tg_bind_chat(%L, 'h-2', -1002, 'Site A2', 'group')$q$, pg_temp.ctx('pm')),
  'DR_NOT_FOUND', 'an expired code binds nothing');

-- ── 3. Launch tokens ────────────────────────────────────────────────────────
select pg_temp.expect_error(
  format($q$select public.dr_tg_issue_launch_token(%L, %L, 't-x')$q$, pg_temp.ctx('reporter'), pg_temp.ctx('binding')),
  'DR_FORBIDDEN', 'a reporter cannot issue a launch link');
do $$
declare v timestamptz; r jsonb;
begin
  v := public.dr_tg_issue_launch_token(pg_temp.ctx('pm'), pg_temp.ctx('binding'), 't-1', 999);
  perform pg_temp.ok(v <= now() + interval '24 hours 1 minute', 'a launch link never lasts more than 24 hours');
  r := public.dr_tg_resolve_launch('t-1');
  perform pg_temp.ok((r->>'unit_id')::uuid = pg_temp.ctx('unit') and (r->>'chat_id')::bigint = -1001,
                     'a valid link resolves to its unit and group');
  perform public.dr_tg_issue_launch_token(pg_temp.ctx('pm'), pg_temp.ctx('binding'), 't-2');
end $$;
select pg_temp.expect_error($q$select public.dr_tg_resolve_launch('t-1')$q$, 'DR_FORBIDDEN', 'issuing a new link revokes the old one');
select pg_temp.expect_error($q$select public.dr_tg_resolve_launch('t-nope')$q$, 'DR_FORBIDDEN', 'an unknown link is refused');
do $$
begin
  update public.dr_telegram_launch_tokens set expires_at = now() - interval '1 minute' where token_hash = 't-2';
end $$;
select pg_temp.expect_error($q$select public.dr_tg_resolve_launch('t-2')$q$, 'DR_FORBIDDEN', 'an expired link is refused');
do $$
begin
  perform public.dr_tg_issue_launch_token(pg_temp.ctx('pm'), pg_temp.ctx('binding'), 't-3');
  update public.dr_reporting_units set status = 'Suspended' where id = pg_temp.ctx('unit');
end $$;
select pg_temp.expect_error($q$select public.dr_tg_resolve_launch('t-3')$q$, 'not active', 'a link for a suspended unit is refused');
do $$
begin
  update public.dr_reporting_units set status = 'Active' where id = pg_temp.ctx('unit');
end $$;

-- ── 4. Status lines for the group ───────────────────────────────────────────
do $$
declare r jsonb; v_no text; v_line text;
begin
  r := public.dr_submit_report(pg_temp.ctx('reporter'), pg_temp.ctx('unit'), current_date - 1, 'WORK',
                               pg_temp.payload(pg_temp.ctx('task')), 'tg-idem-1');
  insert into t_ctx values ('report', (r->>'report_id')::uuid);
  select report_no into v_no from public.dr_reports where id = (r->>'report_id')::uuid;
  select text into v_line from public.dr_telegram_group_outbox where unit_id = pg_temp.ctx('unit') order by created_at desc limit 1;
  perform pg_temp.ok(v_line like v_no || ' submitted%' and (select chat_id from public.dr_telegram_group_outbox where unit_id = pg_temp.ctx('unit') limit 1) = -1001,
                     'a submission queues a status line for the bound group');
  perform pg_temp.ok(v_line !~ '(m2|Mason|Sunny|[0-9]+\s*%)', 'the status line carries no report content');

  perform public.dr_decide_review(pg_temp.ctx('pm'), (r->>'report_id')::uuid, 1, 'APPROVE_WITH_REMARK', 'Quantity looks high, confidential remark');
  perform pg_temp.ok(exists (select 1 from public.dr_telegram_group_outbox where unit_id = pg_temp.ctx('unit') and text = v_no || ' approved'),
                     'approval queues "approved"');
  perform pg_temp.ok(not exists (select 1 from public.dr_telegram_group_outbox where text ilike '%confidential%'),
                     'the reviewer''s comment never reaches the group');
  perform pg_temp.ok((select count(*) from public.dr_telegram_group_outbox where unit_id = pg_temp.ctx('unit')) = 2, 'one line per event');
end $$;

-- ── 5. Bot removed and re-added ─────────────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.dr_tg_set_bot_presence(-1001, false);
  perform pg_temp.ok((r->>'changed')::boolean and (select status = 'Suspended' and not bot_present from public.dr_telegram_bindings where id = pg_temp.ctx('binding')),
                     'removing the bot suspends the binding');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('pm') and title like 'Telegram bot removed%'),
                     'the approver is told the bot was removed');
  perform pg_temp.ok((public.dr_tg_set_bot_presence(-4242, false)->>'changed')::boolean = false, 'an unbound group changes nothing');
end $$;
select pg_temp.expect_error($q$select public.dr_tg_resolve_launch('t-3')$q$, 'DR_FORBIDDEN', 'launch links stop when the bot is removed');
select pg_temp.expect_error(
  format($q$select public.dr_tg_issue_launch_token(%L, %L, 't-4')$q$, pg_temp.ctx('pm'), pg_temp.ctx('binding')),
  'DR_STATE', 'no launch link for a suspended binding');
do $$
declare n int; r jsonb;
begin
  select count(*) into n from public.dr_telegram_group_outbox where unit_id = pg_temp.ctx('unit');
  perform public.dr_audit(pg_temp.ctx('project'), pg_temp.ctx('unit'), pg_temp.ctx('report'), 1, 'DR.REPORT_AMENDED', pg_temp.ctx('pm'), 'WEB', '{}'::jsonb);
  perform pg_temp.ok((select count(*) from public.dr_telegram_group_outbox where unit_id = pg_temp.ctx('unit')) = n,
                     'no status line while the binding is suspended');
  r := public.dr_tg_set_bot_presence(-1001, true);
  perform pg_temp.ok(r->>'status' = 'Active'
                     and (select status = 'Active' and bot_present from public.dr_telegram_bindings where id = pg_temp.ctx('binding')),
                     're-adding the bot restores the binding');
end $$;

-- ── 6. Group upgraded to a supergroup ───────────────────────────────────────
do $$
declare r jsonb;
begin
  perform pg_temp.ok((public.dr_tg_migrate_chat(-7777, -1007777)->>'migrated')::boolean = false, 'migration of an unbound group changes nothing');
  r := public.dr_tg_migrate_chat(-1001, -1001001);
  insert into t_ctx values ('migrated', (r->>'binding_id')::uuid);
  perform pg_temp.ok((r->>'migrated')::boolean
                     and (select status from public.dr_telegram_bindings where id = pg_temp.ctx('binding')) = 'Migrated'
                     and (select status = 'Pending' and chat_id = -1001001 and migrated_from_chat_id = -1001
                          from public.dr_telegram_bindings where id = (r->>'binding_id')::uuid),
                     'migration retires the old binding and holds the new one for confirmation');
  perform pg_temp.ok(exists (select 1 from public.task_alerts where recipient_id = pg_temp.ctx('pm') and title like 'Telegram group moved%'),
                     'the approver is asked to confirm');
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_tg_confirm_migration(%L, %L)$q$, pg_temp.ctx('outsider'), pg_temp.ctx('migrated')),
  'DR_FORBIDDEN', 'an outsider cannot confirm a migrated binding');
select pg_temp.expect_error(
  format($q$select public.dr_tg_issue_launch_token(%L, %L, 't-5')$q$, pg_temp.ctx('pm'), pg_temp.ctx('migrated')),
  'DR_STATE', 'no launch link before the migration is confirmed');
do $$
begin
  perform public.dr_tg_confirm_migration(pg_temp.ctx('pm'), pg_temp.ctx('migrated'));
  perform pg_temp.ok((select status from public.dr_telegram_bindings where id = pg_temp.ctx('migrated')) = 'Active', 'confirmation activates the new binding');
  perform pg_temp.ok((select count(*) from public.dr_telegram_bindings where unit_id = pg_temp.ctx('unit') and status = 'Active') = 1, 'the unit still has exactly one active group');
end $$;
select pg_temp.expect_error(
  format($q$select public.dr_tg_confirm_migration(%L, %L)$q$, pg_temp.ctx('pm'), pg_temp.ctx('migrated')),
  'DR_STATE', 'a binding is confirmed once');

-- ── 7. Replacing and removing a group ───────────────────────────────────────
do $$
declare r jsonb;
begin
  perform public.dr_tg_issue_launch_token(pg_temp.ctx('pm'), pg_temp.ctx('migrated'), 't-6');
  perform public.dr_tg_create_binding(pg_temp.ctx('pm'), pg_temp.ctx('unit'), 'h-3');
  r := public.dr_tg_bind_chat(pg_temp.ctx('pm'), 'h-3', -2002, 'New group', 'supergroup');
  insert into t_ctx values ('binding3', (r->>'binding_id')::uuid);
  perform pg_temp.ok((select status from public.dr_telegram_bindings where id = pg_temp.ctx('migrated')) = 'Unbound'
                     and (select count(*) from public.dr_telegram_bindings where unit_id = pg_temp.ctx('unit') and status = 'Active') = 1,
                     'binding a new group retires the unit''s previous one');
end $$;
select pg_temp.expect_error($q$select public.dr_tg_resolve_launch('t-6')$q$, 'DR_FORBIDDEN', 'the retired group''s launch link stops working');
select pg_temp.expect_error(
  format($q$select public.dr_tg_unbind(%L, %L)$q$, pg_temp.ctx('reporter'), pg_temp.ctx('binding3')),
  'DR_FORBIDDEN', 'a reporter cannot unbind a group');
do $$
begin
  perform public.dr_tg_issue_launch_token(pg_temp.ctx('pm'), pg_temp.ctx('binding3'), 't-7');
  perform public.dr_tg_unbind(pg_temp.ctx('pm'), pg_temp.ctx('binding3'));
  perform pg_temp.ok((select status = 'Unbound' and valid_to is not null from public.dr_telegram_bindings where id = pg_temp.ctx('binding3')), 'unbinding keeps the row as history');
end $$;
select pg_temp.expect_error($q$select public.dr_tg_resolve_launch('t-7')$q$, 'DR_FORBIDDEN', 'unbinding revokes the launch link');
select pg_temp.expect_error(
  format($q$select public.dr_tg_unbind(%L, %L)$q$, pg_temp.ctx('pm'), pg_temp.ctx('binding3')),
  'DR_STATE', 'a binding is unbound once');

-- ── 8. No client write path ─────────────────────────────────────────────────
do $$
begin
  perform pg_temp.ok(not has_table_privilege('authenticated', 'public.dr_telegram_bindings', 'INSERT')
                     and not has_table_privilege('authenticated', 'public.dr_telegram_bindings', 'UPDATE')
                     and not has_table_privilege('authenticated', 'public.dr_telegram_launch_tokens', 'SELECT')
                     and not has_table_privilege('authenticated', 'public.dr_telegram_binding_codes', 'SELECT')
                     and not has_table_privilege('anon', 'public.dr_telegram_bindings', 'SELECT'),
                     'clients cannot write bindings or read codes and tokens');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public.dr_tg_resolve_launch(text)', 'EXECUTE')
                     and not has_function_privilege('anon', 'public.dr_tg_bind_chat(uuid, text, bigint, text, text)', 'EXECUTE'),
                     'binding functions are service-role only');
end $$;

do $$ begin raise notice 'ALL DR TELEGRAM TESTS PASSED'; end $$;

rollback;
