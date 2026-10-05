-- Module 10-01 Daily Reporting — custom fields and Telegram invites, database tests.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/dr_custom_fields_invites.test.sql
-- One transaction, rolled back. "ALL DR CUSTOM FIELD AND INVITE TESTS PASSED" means success.

begin;

create temp table t_ctx (k text primary key, v uuid) on commit drop;
grant all on t_ctx to public;

do $$
declare
  v_ids uuid[]; v_project uuid; v_node uuid; v_task uuid; v_unit uuid;
begin
  select array_agg(id) into v_ids
  from (select id from public.profiles p where not public.is_admin(p.id) and p.telegram_user_id is null order by created_at limit 3) s;
  delete from public.user_roles where user_id = any (v_ids);

  insert into public.projects (project_code, project_name, project_type, project_manager_id, dr_enabled)
  values ('DRCF-' || substr(gen_random_uuid()::text, 1, 8), 'DR custom field test', 'internal', v_ids[2], true)
  returning id into v_project;
  insert into public.wbs_nodes (project_id, node_type, wbs_code, wbs_name) values (v_project, 'phase', 'IN', 'In') returning id into v_node;
  insert into public.wbs_tasks (wbs_node_id, project_id, task_code, task_name) values (v_node, v_project, 'A-1', 'Blockwork') returning id into v_task;
  insert into public.dr_reporting_units (project_id, unit_code, unit_type, display_name, status, mobilised_at)
  values (v_project, 'SC-CF', 'SUBCONTRACTOR', 'ABC Masonry', 'Active', current_date - 30) returning id into v_unit;
  insert into public.dr_reporting_unit_members (unit_id, user_id, member_role) values (v_unit, v_ids[1], 'REPORTER');

  insert into t_ctx values ('reporter', v_ids[1]), ('pm', v_ids[2]), ('outsider', v_ids[3]), ('project', v_project), ('task', v_task), ('unit', v_unit);
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
-- Runs one statement as a signed-in user and returns to the test role.
create or replace function pg_temp.as_user(p_user uuid, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute p_sql;
end $$;

-- ── 1. Custom field definitions ─────────────────────────────────────────────
select pg_temp.expect_error(
  format($q$select pg_temp.as_user(%L, $s$select public.dr_save_custom_fields(%L, '[]'::jsonb)$s$)$q$, pg_temp.ctx('reporter'), pg_temp.ctx('unit')),
  'DR_FORBIDDEN', 'a reporter cannot change the custom fields');
select pg_temp.expect_error(
  format($q$select pg_temp.as_user(%L, $s$select public.dr_save_custom_fields(%L, '[]'::jsonb)$s$)$q$, pg_temp.ctx('outsider'), pg_temp.ctx('unit')),
  'DR_FORBIDDEN', 'an outsider cannot change the custom fields');
select pg_temp.expect_error(
  format($q$select pg_temp.as_user(%L, $s$select public.dr_save_custom_fields(%L, '[{"key":"Wall Type","label":"Wall Type","type":"text"}]'::jsonb)$s$)$q$, pg_temp.ctx('pm'), pg_temp.ctx('unit')),
  'must be lower-case', 'a field key must be a plain identifier');
select pg_temp.expect_error(
  format($q$select pg_temp.as_user(%L, $s$select public.dr_save_custom_fields(%L, '[{"key":"a","label":"A","type":"text"},{"key":"a","label":"B","type":"text"}]'::jsonb)$s$)$q$, pg_temp.ctx('pm'), pg_temp.ctx('unit')),
  'used twice', 'two fields cannot share a key');
select pg_temp.expect_error(
  format($q$select pg_temp.as_user(%L, $s$select public.dr_save_custom_fields(%L, '[{"key":"a","label":"A","type":"date"}]'::jsonb)$s$)$q$, pg_temp.ctx('pm'), pg_temp.ctx('unit')),
  'text, number or select', 'an unknown field type is refused');
select pg_temp.expect_error(
  format($q$select pg_temp.as_user(%L, $s$select public.dr_save_custom_fields(%L, '[{"key":"a","label":"A","type":"select"}]'::jsonb)$s$)$q$, pg_temp.ctx('pm'), pg_temp.ctx('unit')),
  'options', 'a choice field needs options');
select pg_temp.expect_error(
  format($q$select pg_temp.as_user(%L, $s$select public.dr_save_custom_fields(%L, '{"key":"a"}'::jsonb)$s$)$q$, pg_temp.ctx('pm'), pg_temp.ctx('unit')),
  'must be a list', 'the definition must be a list');

do $$
begin
  perform pg_temp.as_user(pg_temp.ctx('pm'), format($s$select public.dr_save_custom_fields(%L,
    '[{"key":"wall_type","label":"Wall Type","type":"select","options":["Hollow Clay Brick","AAC Block"],"required":true},
      {"key":"wall_thickness","label":"Wall Thickness","type":"number","unit":"mm","required":true}]'::jsonb)$s$, pg_temp.ctx('unit')));
  perform pg_temp.ok((select version = 1 and is_active and jsonb_array_length(fields) = 2 and created_by = pg_temp.ctx('pm')
                      from public.dr_custom_field_definitions where unit_id = pg_temp.ctx('unit')),
                     'the project manager saves version 1');
  perform pg_temp.as_user(pg_temp.ctx('pm'), format($s$select public.dr_save_custom_fields(%L,
    '[{"key":"wall_type","label":"Wall Type","type":"select","options":["Hollow Clay Brick"],"required":true},
      {"key":"crew_leader","label":"Crew Leader","type":"text"}]'::jsonb)$s$, pg_temp.ctx('unit')));
  perform pg_temp.ok((select count(*) from public.dr_custom_field_definitions where unit_id = pg_temp.ctx('unit')) = 2
                     and (select count(*) from public.dr_custom_field_definitions where unit_id = pg_temp.ctx('unit') and is_active) = 1
                     and (select version from public.dr_custom_field_definitions where unit_id = pg_temp.ctx('unit') and is_active) = 2,
                     'saving again adds version 2 and keeps version 1 for old reports');
  perform pg_temp.ok((select count(*) from public.dr_audit_log where event_code = 'DR.CUSTOM_FIELDS_CHANGED' and unit_id = pg_temp.ctx('unit')) = 2,
                     'each change is audited');
end $$;

-- Values travel in the report payload, so they are versioned and immutable with it.
do $$
declare r jsonb; v public.dr_report_versions%rowtype;
begin
  r := public.dr_submit_report(pg_temp.ctx('reporter'), pg_temp.ctx('unit'), current_date - 1, 'WORK',
    jsonb_build_object('schema_version', 1,
      'weather', jsonb_build_object('condition', 'Sunny'),
      'manpower', jsonb_build_array(jsonb_build_object('line_id', 'm1', 'trade', 'Masonry', 'reported_count', 24)),
      'activities', jsonb_build_array(jsonb_build_object('line_id', 'a1', 'task_id', pg_temp.ctx('task'), 'progress_today', 65, 'headcount', 24, 'work_status', 'in_progress')),
      'safety', jsonb_build_object('toolbox_talk_held', true, 'incident_count', 0),
      'next_day', jsonb_build_array(jsonb_build_object('line_id', 'n1', 'description', 'Continue L06 blockwork')),
      'custom_fields', jsonb_build_object('wall_type', 'Hollow Clay Brick', 'crew_leader', 'Mr. Sok'),
      'custom_field_def_version', 2),
    'cf-idem-1', 'TELEGRAM_MINIAPP');
  select * into v from public.dr_report_versions where report_id = (r->>'report_id')::uuid;
  perform pg_temp.ok(v.payload->'custom_fields'->>'wall_type' = 'Hollow Clay Brick' and (v.payload->>'custom_field_def_version')::int = 2
                     and v.channel = 'TELEGRAM_MINIAPP',
                     'custom field values are stored in the report version with their definition version');
  insert into t_ctx values ('version', v.id);
end $$;
select pg_temp.expect_error(
  format($q$update public.dr_report_versions set payload = jsonb_set(payload, '{custom_fields,wall_type}', '"AAC Block"') where id = %L$q$, pg_temp.ctx('version')),
  'DR_IMMUTABLE', 'custom field values cannot be changed after submission');

-- Who can read the definition.
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ctx('reporter')::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.ctx('reporter')::text, true);
  set local role authenticated;
  select count(*) into n from public.dr_custom_field_definitions where unit_id = pg_temp.ctx('unit');
  reset role;
  perform pg_temp.ok(n = 2, 'a reporter of the unit can read its custom fields');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.ctx('outsider')::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.ctx('outsider')::text, true);
  set local role authenticated;
  select count(*) into n from public.dr_custom_field_definitions where unit_id = pg_temp.ctx('unit');
  reset role;
  perform pg_temp.ok(n = 0, 'an outsider cannot read them');
  perform pg_temp.ok(not has_table_privilege('authenticated', 'public.dr_custom_field_definitions', 'INSERT')
                     and not has_table_privilege('authenticated', 'public.dr_custom_field_definitions', 'UPDATE'),
                     'the definition is written only through dr_save_custom_fields');
end $$;

-- ── 2. Telegram invites ─────────────────────────────────────────────────────
-- The bot acts with the service role; profiles.telegram_user_id is guarded against anyone else.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error(
  format($q$select public.dr_tg_create_invite(%L, %L, %L, 'i-x')$q$, pg_temp.ctx('reporter'), pg_temp.ctx('unit'), pg_temp.ctx('reporter')),
  'DR_FORBIDDEN', 'a reporter cannot issue an invite');
select pg_temp.expect_error(
  format($q$select public.dr_tg_create_invite(%L, %L, %L, 'i-x')$q$, pg_temp.ctx('pm'), pg_temp.ctx('unit'), pg_temp.ctx('outsider')),
  'not an active member', 'an invite is only for a member of the unit');
select pg_temp.expect_error($q$select public.dr_tg_redeem_invite('i-unknown', 900001)$q$, 'DR_NOT_FOUND', 'an unknown invite links nothing');

do $$
declare v timestamptz; r jsonb;
begin
  v := public.dr_tg_create_invite(pg_temp.ctx('pm'), pg_temp.ctx('unit'), pg_temp.ctx('reporter'), 'i-old');
  perform pg_temp.ok(v between now() + interval '71 hours' and now() + interval '73 hours', 'an invite lasts three days');
  perform public.dr_tg_create_invite(pg_temp.ctx('pm'), pg_temp.ctx('unit'), pg_temp.ctx('reporter'), 'i-1', 9999);
  perform pg_temp.ok((select expires_at <= now() + interval '168 hours 1 minute' from public.dr_telegram_invites where token_hash = 'i-1'),
                     'an invite never lasts more than a week');
end $$;
select pg_temp.expect_error($q$select public.dr_tg_redeem_invite('i-old', 900001)$q$, 'DR_NOT_FOUND', 'a newer invite replaces the earlier one');

do $$
declare r jsonb;
begin
  -- The Telegram account is already linked to somebody else.
  update public.profiles set telegram_user_id = 900002 where id = pg_temp.ctx('outsider');
end $$;
select pg_temp.expect_error($q$select public.dr_tg_redeem_invite('i-1', 900002)$q$, 'already linked to another', 'a Telegram account linked to someone else cannot take the invite');

do $$
declare r jsonb;
begin
  perform pg_temp.ok((select used_at is null from public.dr_telegram_invites where token_hash = 'i-1'), 'a refused attempt does not use up the invite');
  r := public.dr_tg_redeem_invite('i-1', 900001);
  perform pg_temp.ok((r->>'user_id')::uuid = pg_temp.ctx('reporter') and r->>'unit_code' = 'SC-CF'
                     and (select telegram_user_id from public.profiles where id = pg_temp.ctx('reporter')) = 900001,
                     'opening the invite links the Telegram account to the reporter');
  perform pg_temp.ok(exists (select 1 from public.dr_audit_log where event_code = 'DR.TELEGRAM_LINKED' and actor_id = pg_temp.ctx('reporter')),
                     'the link is audited');
end $$;
select pg_temp.expect_error($q$select public.dr_tg_redeem_invite('i-1', 900003)$q$, 'DR_NOT_FOUND', 'an invite works once');

do $$
begin
  perform public.dr_tg_create_invite(pg_temp.ctx('pm'), pg_temp.ctx('unit'), pg_temp.ctx('reporter'), 'i-2');
  update public.dr_telegram_invites set expires_at = now() - interval '1 minute' where token_hash = 'i-2';
end $$;
select pg_temp.expect_error($q$select public.dr_tg_redeem_invite('i-2', 900001)$q$, 'DR_NOT_FOUND', 'an expired invite links nothing');

do $$
begin
  perform pg_temp.ok(not has_function_privilege('authenticated', 'public.dr_tg_redeem_invite(text, bigint)', 'EXECUTE')
                     and not has_function_privilege('anon', 'public.dr_tg_create_invite(uuid, uuid, uuid, text, int)', 'EXECUTE')
                     and not has_table_privilege('authenticated', 'public.dr_telegram_invites', 'SELECT'),
                     'invites are handled by the service role only');
end $$;

do $$ begin raise notice 'ALL DR CUSTOM FIELD AND INVITE TESTS PASSED'; end $$;

rollback;
