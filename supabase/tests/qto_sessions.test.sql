-- Module 04-20-01 Quantity Take-off: sessions, versions, review, publication and transfer, database tests.
--   docker exec -i supabase_db_dcos-system psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/qto_sessions.test.sql
-- One transaction, rolled back. "ALL QTO SESSION TESTS PASSED" means success.
-- Covers Master Plan §18 cases 1–6, 22, 23, 26–29, 30–37, 39.

begin;

create temp table t_ctx (k text primary key, v uuid) on commit drop;
grant all on t_ctx to public;

do $$
declare
  v_ids uuid[]; v_co uuid; v_other_co uuid; v_project uuid; v_tender uuid; v_drawing uuid;
  v_r1 uuid; v_r2 uuid; v_rules uuid;
begin
  select company_id into v_co from public.profiles where company_id is not null
   group by company_id order by count(*) desc limit 1;
  select array_agg(id) into v_ids from (
    select id from public.profiles p where not public.is_admin(p.id) and p.company_id = v_co
     order by created_at limit 4) s;
  delete from public.user_roles where user_id = any (v_ids);
  insert into public.user_roles (user_id, role_code) values
    (v_ids[1], 'QS'), (v_ids[2], 'L3'), (v_ids[3], 'L2'), (v_ids[4], 'QS');

  insert into public.companies (name, code) values ('QTO test other co', 'QTOX-' || substr(gen_random_uuid()::text, 1, 6))
  returning id into v_other_co;
  update public.profiles set company_id = v_other_co where id = v_ids[4];

  insert into public.projects (project_code, project_name, project_type)
  values ('QTOT-' || substr(gen_random_uuid()::text, 1, 8), 'QTO test project', 'tender') returning id into v_project;
  insert into public.tender_register (tender_no, title, tender_type, project_id)
  values ('QTOT-' || substr(gen_random_uuid()::text, 1, 8), 'QTO test tender', 'open', v_project) returning id into v_tender;
  insert into public.project_precontract_details (project_id, tender_register_id, tender_stage)
  values (v_project, v_tender, 'tendering');
  insert into public.qto_drawing_register (tender_id, drawing_no, title, tenant_id)
  values (v_tender, 'S-100', 'Ground slab', v_co) returning id into v_drawing;
  insert into public.qto_drawing_revisions (drawing_id, revision, status, tenant_id)
  values (v_drawing, 'P01', 'superseded', v_co) returning id into v_r1;
  insert into public.qto_drawing_revisions (drawing_id, revision, status, tenant_id)
  values (v_drawing, 'P02', 'current', v_co) returning id into v_r2;

  select v.id into v_rules from public.qto_measurement_rule_versions v
    join public.qto_measurement_rulesets r on r.id = v.ruleset_id where r.code = 'DCOS-STD' and v.version_no = 1;

  insert into t_ctx values ('qs', v_ids[1]), ('rev', v_ids[2]), ('rev2', v_ids[3]), ('outsider', v_ids[4]),
    ('tender', v_tender), ('drawing', v_drawing), ('r1', v_r1), ('r2', v_r2), ('rules', v_rules), ('co', v_co);
end $$;

create or replace function pg_temp.ctx(p text) returns uuid language sql as $$ select v from t_ctx where k = p $$;
create or replace function pg_temp.put(p text, v uuid) returns void language sql as $$
  insert into t_ctx values (p, v) on conflict (k) do update set v = excluded.v $$;
create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'TEST FAILED [%]', p_label; end if;
  raise notice 'ok   %', p_label;
end $$;
-- Runs one statement as a signed-in user under RLS. Returns its first value as text, or 'ERR: <message>'.
create or replace function pg_temp.as_user(p_user uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR: ' || sqlerrm;
  end;
  reset role;
  return v;
end $$;
create or replace function pg_temp.q(p_template text, variadic p_args text[]) returns text language sql as $$
  select format(p_template, variadic p_args) $$;

-- ── A. Sessions and source ───────────────────────────────────────────────
select pg_temp.put('s1', pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_create_session(%L, 'STR – S-100 – Rev P02', %L, %L, 'STR', 'BA')::text$q$,
  pg_temp.ctx('tender')::text, pg_temp.ctx('r2')::text, pg_temp.ctx('rules')::text))::uuid);
select pg_temp.ok(pg_temp.ctx('s1') is not null, '1. a valid tender session is created');
select pg_temp.ok((select session_code = 'QTS-001' and purpose = 'TENDER' from public.qto_sessions where id = pg_temp.ctx('s1')),
  '1. session code is generated and purpose is TENDER');
select pg_temp.put('v1', (select current_version_id from public.qto_sessions where id = pg_temp.ctx('s1')));
select pg_temp.ok((select version_no = 1 and status = 'DRAFT' and drawing_revision_id = pg_temp.ctx('r2')
                   from public.qto_session_versions where id = pg_temp.ctx('v1')), '1. version 1 starts as DRAFT on the chosen revision');

select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_create_session(%L, 'Construction remeasure', %L, %L, p_purpose => 'CONSTRUCTION')::text$q$,
  pg_temp.ctx('tender')::text, pg_temp.ctx('r2')::text, pg_temp.ctx('rules')::text)) !~ '^ERR', '2. a construction session can be created');

select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_create_session(%L, 'No source', null, %L)::text$q$,
  pg_temp.ctx('tender')::text, pg_temp.ctx('rules')::text)) like 'ERR: QTO_SOURCE_REQUIRED%', '3. a session without a source revision is rejected');

select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('outsider'), pg_temp.q(
  $q$select count(*)::text from public.qto_sessions where id = %L$q$, pg_temp.ctx('s1')::text)) = '0',
  '4. another company cannot see the session');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('outsider'), pg_temp.q(
  $q$select public.qto_version_transition(%L, 'IN_PROGRESS')$q$, pg_temp.ctx('v1')::text)) like 'ERR: QTO_NOT_FOUND%',
  '4. another company cannot change the session');

-- Items: one firm slab (10 × 8 × 0.2 = 16 m3), one provisional without its assumption.
select pg_temp.put('i1', pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$insert into public.qto_items (tender_id, qto_no, description, unit, quantity, work_section, building,
       drawing_revision_id, session_version_id, tenant_id, quantity_status)
     values (%L, 'QTO-000001', 'Ground slab C30', 'm3', 16, 'Concrete', 'BA', %L, %L, %L, 'FIRM') returning id::text$q$,
  pg_temp.ctx('tender')::text, pg_temp.ctx('r2')::text, pg_temp.ctx('v1')::text, pg_temp.ctx('co')::text))::uuid);
select pg_temp.put('i2', pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$insert into public.qto_items (tender_id, qto_no, description, unit, quantity, work_section, building,
       drawing_revision_id, session_version_id, tenant_id, quantity_status)
     values (%L, 'QTO-000002', 'Pile caps (design pending)', 'm3', 4, 'Concrete', 'BA', %L, %L, %L, 'PROVISIONAL') returning id::text$q$,
  pg_temp.ctx('tender')::text, pg_temp.ctx('r2')::text, pg_temp.ctx('v1')::text, pg_temp.ctx('co')::text))::uuid);
select pg_temp.ok(pg_temp.ctx('i1') is not null and pg_temp.ctx('i2') is not null, 'items can be added to a draft version');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('outsider'), pg_temp.q(
  $q$select count(*)::text from public.qto_items where id in (%L, %L)$q$, pg_temp.ctx('i1')::text, pg_temp.ctx('i2')::text)) = '0',
  '37. another company cannot read the take-off items');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('outsider'), pg_temp.q(
  $q$update public.qto_items set quantity = 0 where id = %L returning 'x'$q$, pg_temp.ctx('i1')::text)) is null,
  '37. another company cannot change the take-off items');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$delete from public.qto_items where id = %L returning 'x'$q$, pg_temp.ctx('i1')::text)) is null,
  'BR-03. only an administrator can hard-delete an item');

-- ── 39. Validation results are not duplicated ────────────────────────────
select pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_sync_issues(%L, '[{"rule_code":"DUPLICATE","severity":"WARNING","message":"Possible duplicate","fingerprint":"dup:1"}]')::text$q$,
  pg_temp.ctx('v1')::text));
select pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_sync_issues(%L, '[{"rule_code":"DUPLICATE","severity":"WARNING","message":"Possible duplicate (rerun)","fingerprint":"dup:1"}]')::text$q$,
  pg_temp.ctx('v1')::text));
select pg_temp.ok((select count(*) = 1 from public.qto_issues where version_id = pg_temp.ctx('v1') and status = 'open'),
  '39. rerunning validation keeps one open issue');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_acknowledge_issue((select id from public.qto_issues where version_id = %L and status = 'open'), '')::text$q$,
  pg_temp.ctx('v1')::text)) like 'ERR: QTO_VALIDATION%', 'acknowledging a warning needs a justification');
select pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_sync_issues(%L, '[]')::text$q$, pg_temp.ctx('v1')::text));
select pg_temp.ok((select count(*) = 0 from public.qto_issues where version_id = pg_temp.ctx('v1') and status <> 'resolved'),
  'an issue that is no longer detected is resolved');

-- ── D. Review workflow ───────────────────────────────────────────────────
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_version_transition(%L, 'APPROVED')$q$, pg_temp.ctx('v1')::text)) like 'ERR: QTO_INVALID_TRANSITION%',
  'DRAFT cannot jump to APPROVED');
select pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q($q$select public.qto_version_transition(%L, 'IN_PROGRESS')$q$, pg_temp.ctx('v1')::text));
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_version_transition(%L, 'SUBMITTED_FOR_REVIEW')$q$, pg_temp.ctx('v1')::text)) like 'ERR: QTO_BLOCKING_ISSUES%',
  'a provisional item without an assumption blocks submission');
select pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$update public.qto_items set provisional_assumption = 'Pile cap sizes per S-100 P02 note 4, awaiting RFI-12' where id = %L returning 'x'$q$,
  pg_temp.ctx('i2')::text));
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_version_transition(%L, 'SUBMITTED_FOR_REVIEW')$q$, pg_temp.ctx('v1')::text)) = 'SUBMITTED_FOR_REVIEW',
  'the version is submitted once blocking problems are fixed');

select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$update public.qto_items set quantity = 1 where id = %L returning 'x'$q$, pg_temp.ctx('i1')::text)) like 'ERR: QTO_LOCKED%',
  '27. items cannot be edited while the version is under review');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_version_transition(%L, 'APPROVED')$q$, pg_temp.ctx('v1')::text)) like 'ERR: QTO_FORBIDDEN%',
  'a QS without approval rights cannot approve');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('rev'), pg_temp.q(
  $q$select public.qto_version_transition(%L, 'CHANGES_REQUESTED')$q$, pg_temp.ctx('v1')::text)) like 'ERR: QTO_VALIDATION%',
  'requesting changes needs a comment');
select pg_temp.as_user(pg_temp.ctx('rev'), pg_temp.q(
  $q$select public.qto_version_transition(%L, 'CHANGES_REQUESTED', 'Check slab thickness against S-100 section A')$q$, pg_temp.ctx('v1')::text));
select pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q($q$select public.qto_version_transition(%L, 'IN_PROGRESS')$q$, pg_temp.ctx('v1')::text));
select pg_temp.ok((select count(*) = 1 from public.qto_version_reviews where version_id = pg_temp.ctx('v1')
                   and to_status = 'CHANGES_REQUESTED' and comment like 'Check slab%'),
  '26. the change request stays in the review history');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('rev'), pg_temp.q(
  $q$update public.qto_version_reviews set comment = 'rewritten' where version_id = %L returning 'x'$q$, pg_temp.ctx('v1')::text)) is null,
  '26. review history cannot be rewritten through the API');

-- The reviewer submits it themselves this time, so they may not approve it.
select pg_temp.as_user(pg_temp.ctx('rev'), pg_temp.q($q$select public.qto_version_transition(%L, 'SUBMITTED_FOR_REVIEW')$q$, pg_temp.ctx('v1')::text));
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('rev'), pg_temp.q(
  $q$select public.qto_version_transition(%L, 'APPROVED')$q$, pg_temp.ctx('v1')::text)) like 'ERR: QTO_SELF_APPROVAL%',
  '28. self-approval is rejected');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('rev2'), pg_temp.q(
  $q$select public.qto_version_transition(%L, 'APPROVED', 'Checked')$q$, pg_temp.ctx('v1')::text)) = 'APPROVED',
  'another reviewer approves');

-- ── Publication ──────────────────────────────────────────────────────────
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_publish_version(%L)::text$q$, pg_temp.ctx('v1')::text)) like 'ERR: QTO_FORBIDDEN%',
  'a QS cannot publish');
select pg_temp.put('pub1', pg_temp.as_user(pg_temp.ctx('rev2'), pg_temp.q(
  $q$select public.qto_publish_version(%L)::text$q$, pg_temp.ctx('v1')::text))::uuid);
select pg_temp.ok((select status = 'PUBLISHED' and published_by = pg_temp.ctx('rev2') from public.qto_session_versions where id = pg_temp.ctx('v1')),
  '31. publication records the version and publisher');
select pg_temp.ok((select item_count = 2 and snapshot -> 'version' ->> 'id' = pg_temp.ctx('v1')::text
                   from public.qto_publications where id = pg_temp.ctx('pub1')), '31. the snapshot holds the version and both items');
select pg_temp.ok((select snapshot_hash = public.qto_snapshot_hash(snapshot)
                          and snapshot_hash = public.qto_snapshot_hash(public.qto_build_snapshot(version_id))
                   from public.qto_publications where id = pg_temp.ctx('pub1')),
  '30. the snapshot hash is reproducible from canonical content');

select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$update public.qto_items set quantity = 1 where id = %L returning 'x'$q$, pg_temp.ctx('i1')::text)) like 'ERR: QTO_LOCKED%',
  '29. published quantities cannot be modified');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('rev2'), pg_temp.q(
  $q$update public.qto_publications set snapshot_hash = repeat('0', 64) where id = %L returning 'x'$q$, pg_temp.ctx('pub1')::text)) is null,
  '29. a publication cannot be updated through the API');
do $$ begin
  update public.qto_publications set snapshot_hash = repeat('0', 64) where id = pg_temp.ctx('pub1');
  raise exception 'TEST FAILED [29. publication immutable even for the owner role]';
exception when others then
  if sqlerrm not like 'QTO_IMMUTABLE%' then raise; end if;
  raise notice 'ok   29. a publication is immutable even outside RLS';
end $$;

-- ── E. Transfer to the tender BOQ ────────────────────────────────────────
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select (public.qto_transfer_to_tender_boq(%L, %L, 'test-key-0001') ->> 'status')$q$,
  pg_temp.ctx('pub1')::text, pg_temp.ctx('tender')::text)) = 'succeeded', '32. a transfer succeeds');
select pg_temp.ok((select count(*) = 1 and sum(quantity) = 16 from public.tender_boq_items where tender_id = pg_temp.ctx('tender')),
  '32/35. only the firm quantity is written to the tender BOQ (provisional excluded by default)');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select (public.qto_transfer_to_tender_boq(%L, %L, 'test-key-0001') ->> 'replayed')$q$,
  pg_temp.ctx('pub1')::text, pg_temp.ctx('tender')::text)) = 'true', '33. a retry with the same key replays the result');
select pg_temp.ok((select count(*) = 1 and sum(quantity) = 16 from public.tender_boq_items where tender_id = pg_temp.ctx('tender')),
  '33. the retry did not duplicate quantities');

select pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select (public.qto_transfer_to_tender_boq(%L, %L, 'test-key-0002', true) ->> 'status')$q$,
  pg_temp.ctx('pub1')::text, pg_temp.ctx('tender')::text));
select pg_temp.ok((select count(*) = 2 and sum(quantity) = 20 from public.tender_boq_items where tender_id = pg_temp.ctx('tender')),
  '35. including provisional items adds them; the firm line is reused, not duplicated');
select pg_temp.ok((select count(*) = 2 from public.qto_boq_links where transfer_id is not null
                   and qto_item_id in (pg_temp.ctx('i1'), pg_temp.ctx('i2'))), 'each transferred item keeps its BOQ link');

update public.tender_boq_items set quantity = 99
 where id = (select boq_item_id from public.qto_boq_links where qto_item_id = pg_temp.ctx('i1'));
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select (public.qto_transfer_to_tender_boq(%L, %L, 'test-key-0003', true) ->> 'error')$q$,
  pg_temp.ctx('pub1')::text, pg_temp.ctx('tender')::text)) like 'QTO_TRANSFER_CONFLICT%',
  '34. a line changed outside QTO is not overwritten; the error is actionable');
select pg_temp.ok((select quantity = 99 from public.tender_boq_items
                    where id = (select boq_item_id from public.qto_boq_links where qto_item_id = pg_temp.ctx('i1'))),
  '34. the failed transfer changed nothing');

update public.project_precontract_details set tender_stage = 'submitted' where tender_register_id = pg_temp.ctx('tender');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select (public.qto_transfer_to_tender_boq(%L, %L, 'test-key-0004', true, true) ->> 'status')$q$,
  pg_temp.ctx('pub1')::text, pg_temp.ctx('tender')::text)) = 'failed', '34. a transfer into a locked tender fails');
select pg_temp.ok((select count(*) = 2 from public.qto_transfers where publication_id = pg_temp.ctx('pub1') and status = 'failed'),
  '34. failed transfers are recorded');
update public.project_precontract_details set tender_stage = 'tendering' where tender_register_id = pg_temp.ctx('tender');

select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('outsider'), pg_temp.q(
  $q$select count(*)::text from public.qto_transfers where publication_id = %L$q$, pg_temp.ctx('pub1')::text)) = '0',
  '37. another company cannot read the transfers');

-- ── New version ──────────────────────────────────────────────────────────
select pg_temp.put('v2', pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_create_version(%L, 'Drawing S-100 revised', %L, %L, array[%L]::uuid[])::text$q$,
  pg_temp.ctx('s1')::text, pg_temp.ctx('r2')::text, pg_temp.ctx('rules')::text, pg_temp.ctx('i1')::text))::uuid);
select pg_temp.ok((select version_no = 2 and parent_version_id = pg_temp.ctx('v1') and baseline_version_id = pg_temp.ctx('v1')
                   from public.qto_session_versions where id = pg_temp.ctx('v2')), '5. the new version references its parent and baseline');
select pg_temp.ok((select carried_from_item_id = pg_temp.ctx('i1') and carry_status = 'UNVERIFIED' and quantity = 16
                   from public.qto_items where session_version_id = pg_temp.ctx('v2')),
  '23. a carried item keeps its provenance and is marked unverified');
select pg_temp.ok((select quantity = 16 and session_version_id = pg_temp.ctx('v1') from public.qto_items where id = pg_temp.ctx('i1')),
  '22. the new version did not modify its parent');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_create_version(%L, 'Second', %L, %L)::text$q$,
  pg_temp.ctx('s1')::text, pg_temp.ctx('r2')::text, pg_temp.ctx('rules')::text)) like 'ERR: QTO_VERSION_OPEN%',
  '6. only one open version per session');
do $$ begin
  insert into public.qto_session_versions (session_id, version_no, status) values (pg_temp.ctx('s1'), 2, 'DRAFT');
  raise exception 'TEST FAILED [6. duplicate version number]';
exception when unique_violation then
  raise notice 'ok   6. a duplicate version number is rejected by the database';
end $$;

-- ── B. Calculation runs ──────────────────────────────────────────────────
select pg_temp.put('i1v2', (select id from public.qto_items where session_version_id = pg_temp.ctx('v2')));
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_record_calculation(%L, '{"engine_version":"qto-calc/1","gross":16,"deductions":0.5,"net":15.5,"factor_product":1,"result":15.5,"unit":"m2"}')::text$q$,
  pg_temp.ctx('i1v2')::text)) like 'ERR: QTO_UNIT_MISMATCH%', '12. a calculation in an incompatible unit is rejected');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_record_calculation(%L, '{"engine_version":"qto-calc/1","gross":16,"deductions":0.4,"net":15.5,"factor_product":1,"result":15.5,"unit":"m3"}')::text$q$,
  pg_temp.ctx('i1v2')::text)) like 'ERR:%', 'gross − deductions must equal net');
select pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_record_calculation(%L, '{"engine_version":"qto-calc/1","expression":"L * W * D","gross":16,"deductions":0.5,"net":15.5,"factor_product":1,"result":15.5,"unit":"m3"}')::text$q$,
  pg_temp.ctx('i1v2')::text));
select pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_record_calculation(%L, '{"engine_version":"qto-calc/1","expression":"L * W * D","gross":16,"deductions":0.5,"net":15.5,"factor_product":1.05,"result":16.275,"unit":"m3"}')::text$q$,
  pg_temp.ctx('i1v2')::text));
select pg_temp.ok((select quantity = 16.275 and carry_status = 'REMEASURED' from public.qto_items where id = pg_temp.ctx('i1v2')),
  '10/11. the latest run sets the item quantity and marks it remeasured');
select pg_temp.ok((select count(*) = 2 from public.qto_calculation_runs where item_id = pg_temp.ctx('i1v2')),
  '14. calculation history keeps the earlier result');

-- ── 36. Audit ────────────────────────────────────────────────────────────
select pg_temp.ok((select count(*) >= 5 from public.qto_audit_log
                    where table_name = 'qto_session_versions' and record_id = pg_temp.ctx('v1')),
  '36. version state changes are audited');
select pg_temp.ok((select count(*) >= 4 from public.qto_audit_log a join public.qto_transfers t on t.id = a.record_id
                    where a.table_name = 'qto_transfers' and t.publication_id = pg_temp.ctx('pub1')),
  '36. transfers are audited');

-- ── CAD (DXF) drawings ───────────────────────────────────────────────────
select pg_temp.put('cadcal', pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_save_cad_calibration(%L, 0.1)::text$q$, pg_temp.ctx('r2')::text))::uuid);
select pg_temp.ok((select method = 'cad_units' and metres_per_unit = 0.1 and is_active from public.qto_drawing_calibrations where id = pg_temp.ctx('cadcal')),
  'CAD. the scale from drawing units is saved as method cad_units');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('outsider'), pg_temp.q(
  $q$select public.qto_save_cad_calibration(%L, 0.1)::text$q$, pg_temp.ctx('r2')::text)) like 'ERR:%',
  'CAD. another company cannot set the scale');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$select public.qto_save_cad_calibration(%L, 0)::text$q$, pg_temp.ctx('r2')::text)) like 'ERR: QTO_VALIDATION%',
  'CAD. a zero scale is rejected');
select pg_temp.ok(pg_temp.as_user(pg_temp.ctx('qs'), pg_temp.q(
  $q$update public.qto_drawing_revisions set source_format = 'svg' where id = %L returning 1$q$, pg_temp.ctx('r2')::text)) like 'ERR:%',
  'CAD. source_format only allows pdf, dxf or dwg');

do $$ begin raise notice 'ALL QTO SESSION TESTS PASSED'; end $$;
rollback;
