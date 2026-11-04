-- Procurement P2 business rules: SQL acceptance suite (doc 13 section 7): sealed bids, award reason 50, value bands + FX, server numbering.
-- Runs in ONE transaction and ends in ROLLBACK: nothing persists. The 50-parallel numbering test is separate:
-- see 13-p2-numbering-parallel.sh.
-- Uses user ids from the local DB (production clone of 2026-09-21); adjust the ids on another DB.
-- Run: Get-Content <this file> -Raw | docker exec -i supabase_db_dcos-system psql -U postgres -d postgres -v ON_ERROR_STOP=1

begin;

create temp table res(n serial, name text, ok boolean, detail text);
grant all on res to public;
grant all on res_n_seq to public;

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function pg_temp.as_pg() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;
-- expect an error whose message matches p_pat (like); p_pat null = expect success
create function pg_temp.t(p_name text, p_sql text, p_pat text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into res(name, ok, detail) values (p_name, p_pat is null, case when p_pat is null then 'ok' else 'expected error '||p_pat||' but succeeded' end);
  exception when others then
    insert into res(name, ok, detail) values (p_name, p_pat is not null and sqlerrm like p_pat, sqlerrm);
  end;
end $$;
create function pg_temp.t_rows(p_name text, p_sql text, p_expected int) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute p_sql; get diagnostics n = row_count;
    insert into res(name, ok, detail) values (p_name, n = p_expected, 'rows='||n);
  exception when others then
    insert into res(name, ok, detail) values (p_name, false, sqlerrm);
  end;
end $$;
create function pg_temp.t_eq(p_name text, p_sql text, p_expected text) returns void language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql into v;
    insert into res(name, ok, detail) values (p_name, v is not distinct from p_expected, 'got='||coalesce(v,'null'));
  exception when others then
    insert into res(name, ok, detail) values (p_name, false, sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------- setup (as postgres)
-- Users: A = L0 (band 5, creator), B = L1 (band 5), C = L3 (band 3 once given po.approve below), L5 = read only,
--        ADM = admin (profiles.role = admin), L4 = no procurement role.
select pg_temp.as_pg();
-- Give L3 po.approve for this transaction only (rolled back) so that a band-limited approver exists.
update role_permissions set approve = true where role_code = 'L3' and module = 'procurement' and action = 'po';

-- RFQs. Deadlines: e1 sealed (future), e2 cancelled with a future deadline (open), e3 sealed + quotations_received,
-- e4 draft for the issue checks, e5/e6 award reason checks (no deadline = legacy, open).
insert into procurement_rfqs (id, rfq_number, status, created_by, evaluation_method, response_deadline) values
 ('00000000-0000-0000-0000-0000000000e1','T-E1','issued','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', current_date + 5),
 ('00000000-0000-0000-0000-0000000000e2','T-E2','cancelled','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', current_date + 5),
 ('00000000-0000-0000-0000-0000000000e3','T-E3','quotations_received','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', current_date + 5),
 ('00000000-0000-0000-0000-0000000000e4','T-E4','draft','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', null),
 ('00000000-0000-0000-0000-0000000000e5','T-E5','under_evaluation','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', null),
 ('00000000-0000-0000-0000-0000000000e6','T-E6','under_evaluation','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', null),
 ('00000000-0000-0000-0000-0000000000e7','T-E7','draft','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', current_date - 1);
insert into procurement_quotations (id, rfq_id, supplier_id, total_amount, created_by) values
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000e1','fa91ba30-5c9c-4576-95f4-85fe320e05ca',10,'0b268e83-4c22-4f79-bf75-06154a7d496c'),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000e2','fa91ba30-5c9c-4576-95f4-85fe320e05ca',10,'0b268e83-4c22-4f79-bf75-06154a7d496c'),
 ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000e3','fa91ba30-5c9c-4576-95f4-85fe320e05ca',10,'0b268e83-4c22-4f79-bf75-06154a7d496c'),
 -- e5: three quotations, f5a is the cheapest (recommended)
 ('00000000-0000-0000-0000-000000000fa1','00000000-0000-0000-0000-0000000000e5','fa91ba30-5c9c-4576-95f4-85fe320e05ca',100,'1470d8fc-c1fe-4057-8dd1-5a78b27c4465'),
 ('00000000-0000-0000-0000-000000000fa2','00000000-0000-0000-0000-0000000000e5','acb496bf-f4dd-4d24-bb83-9d1505782c43',120,'1470d8fc-c1fe-4057-8dd1-5a78b27c4465'),
 -- e6: two quotations only (fewer than 3 -> 20 character minimum)
 ('00000000-0000-0000-0000-000000000fb1','00000000-0000-0000-0000-0000000000e6','fa91ba30-5c9c-4576-95f4-85fe320e05ca',100,'1470d8fc-c1fe-4057-8dd1-5a78b27c4465'),
 ('00000000-0000-0000-0000-000000000fb2','00000000-0000-0000-0000-0000000000e6','acb496bf-f4dd-4d24-bb83-9d1505782c43',120,'1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
-- a third supplier for e5 so that 3 valid quotations exist
insert into procurement_suppliers (id, supplier_code, supplier_name) values ('00000000-0000-0000-0000-0000000005a3','T-SUP3','Third supplier');
insert into procurement_quotations (id, rfq_id, supplier_id, total_amount, created_by) values
 ('00000000-0000-0000-0000-000000000fa3','00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-0000000005a3',130,'1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
insert into procurement_quotation_items (quotation_id, line_no, item_description, unit, quantity, unit_price, total)
select id, 1, 'item', 'ea', 1, total_amount, total_amount from procurement_quotations where rfq_id in (
 '00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000e3',
 '00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-0000000000e6');

-- POs in 'submitted' for the band checks (created and submitted by A)
insert into procurement_pos (id, po_number, supplier_id, created_by, submitted_by, status, grand_total, currency) values
 ('00000000-0000-0000-0000-00000000b001','T-B1','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',500,'USD'),
 ('00000000-0000-0000-0000-00000000b002','T-B2','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',20000,'USD'),
 ('00000000-0000-0000-0000-00000000b003','T-B3','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',100000,'USD'),
 ('00000000-0000-0000-0000-00000000b004','T-B4','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',1000000,'THB'),
 ('00000000-0000-0000-0000-00000000b005','T-B5','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',20000,'USD'),
 ('00000000-0000-0000-0000-00000000b006','T-B6','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',500,'USD'),
 ('00000000-0000-0000-0000-00000000b007','T-B7','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',500,'USD'),
 ('00000000-0000-0000-0000-00000000b008','T-B8','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',1000,'USD'),
 ('00000000-0000-0000-0000-00000000b009','T-B9','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',1000.01,'USD'),
 ('00000000-0000-0000-0000-00000000b010','T-B10','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',10000,'USD'),
 ('00000000-0000-0000-0000-00000000b011','T-B11','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',50000.01,'USD'),
 ('00000000-0000-0000-0000-00000000b012','T-B12','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',300000,'USD'),
 ('00000000-0000-0000-0000-00000000b013','T-B13','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',13000000,'KRW');
-- uplift sources: b005 -> RFQ with a non-lowest award; b006 -> single source; b007 -> PR whose budget confirmation is over budget
select set_config('dcos.proc_transition','on',true);
update procurement_rfqs set award_overrides_recommendation = true where id = '00000000-0000-0000-0000-0000000000e4';
update procurement_rfqs set award_exception = 'single_source' where id = '00000000-0000-0000-0000-0000000000e3';
select set_config('dcos.proc_transition','off',true);
insert into procurement_prs (id, pr_number, requested_by, created_by, approval_status) values
 ('00000000-0000-0000-0000-00000000c001','T-PRB','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','approved');
insert into procurement_budget_confirmations (id, bc_number, pr_id, budget_status) values
 ('00000000-0000-0000-0000-00000000bc01','T-BCB','00000000-0000-0000-0000-00000000c001','over_budget');
select set_config('dcos.proc_transition','on',true);
update procurement_prs set budget_confirmation_id = '00000000-0000-0000-0000-00000000bc01' where id = '00000000-0000-0000-0000-00000000c001';
update procurement_pos set rfq_id = '00000000-0000-0000-0000-0000000000e4' where id = '00000000-0000-0000-0000-00000000b005';
update procurement_pos set rfq_id = '00000000-0000-0000-0000-0000000000e3' where id = '00000000-0000-0000-0000-00000000b006';
update procurement_pos set pr_id = '00000000-0000-0000-0000-00000000c001' where id = '00000000-0000-0000-0000-00000000b007';
select set_config('dcos.proc_transition','off',true);

-- review-fix fixtures
insert into procurement_rfqs (id, rfq_number, status, created_by, evaluation_method, response_deadline) values
 ('00000000-0000-0000-0000-0000000000e8','T-E8','awarded','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', current_date + 5),
 ('00000000-0000-0000-0000-0000000000e9','T-E9','issued','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', current_date + 5),
 ('00000000-0000-0000-0000-000000000e11','T-E11','draft','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', public.proc_today()),
 ('00000000-0000-0000-0000-000000000e12','T-E12','draft','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price', public.proc_today() - 1);
insert into procurement_quotations (id, rfq_id, supplier_id, total_amount, created_by) values
 ('00000000-0000-0000-0000-0000000000f8','00000000-0000-0000-0000-0000000000e8','fa91ba30-5c9c-4576-95f4-85fe320e05ca',10,'0b268e83-4c22-4f79-bf75-06154a7d496c'),
 ('00000000-0000-0000-0000-0000000000f9','00000000-0000-0000-0000-0000000000e9','fa91ba30-5c9c-4576-95f4-85fe320e05ca',777,'0b268e83-4c22-4f79-bf75-06154a7d496c');
insert into procurement_quotation_items (quotation_id, line_no, item_description, unit, quantity, unit_price, total)
 values ('00000000-0000-0000-0000-0000000000f8',1,'item','ea',1,10,10),('00000000-0000-0000-0000-0000000000f9',1,'item','ea',1,777,777);
insert into procurement_pos (id, po_number, supplier_id, created_by, submitted_by, status, grand_total, total_amount, currency) values
 ('00000000-0000-0000-0000-00000000b014','T-B14','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',100,200,'USD'),
 ('00000000-0000-0000-0000-00000000b015','T-B15','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',1000,1000,'AUD'),
 ('00000000-0000-0000-0000-00000000b016','T-B16','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','submitted',100,700,'USD');
insert into procurement_po_items (po_id, line_no, item_description, quantity_ordered, total_price, item_type) values
 ('00000000-0000-0000-0000-00000000b014',1,'line 1',1,10000,'line'),('00000000-0000-0000-0000-00000000b014',2,'line 2',1,20000,'line'),('00000000-0000-0000-0000-00000000b014',3,'section',0,999,'section');
create temp table nb(n int);
grant all on nb to public;

-- ================================================================ F4 sealed bids
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');   -- A: rfq.view, did not record the quotation
select pg_temp.t_eq('s1 non-creator sees 0 sealed quotations', $q$select count(*)::text from procurement_quotations where rfq_id='00000000-0000-0000-0000-0000000000e1'$q$, '0');
select pg_temp.t_eq('s2 non-creator sees 0 sealed quotation items', $q$select count(*)::text from procurement_quotation_items where quotation_id='00000000-0000-0000-0000-0000000000f1'$q$, '0');
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');   -- B: recorded the quotation
select pg_temp.t_eq('s3 creator sees own sealed quotation', $q$select count(*)::text from procurement_quotations where rfq_id='00000000-0000-0000-0000-0000000000e1'$q$, '1');
select pg_temp.t_eq('s4 creator sees own sealed quotation items', $q$select count(*)::text from procurement_quotation_items where quotation_id='00000000-0000-0000-0000-0000000000f1'$q$, '1');
select pg_temp.as_user('d12566af-4e73-4bd7-8bf1-e117a145df49');   -- admin, no bypass
select pg_temp.t_eq('s5 admin sees 0 sealed quotations', $q$select count(*)::text from procurement_quotations where rfq_id='00000000-0000-0000-0000-0000000000e1'$q$, '0');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('s6 cancelled RFQ keeps its bids sealed until the deadline', $q$select count(*)::text from procurement_quotations where rfq_id='00000000-0000-0000-0000-0000000000e2'$q$, '0');
select pg_temp.t_eq('s6b awarded RFQ opens its bids', $q$select count(*)::text from procurement_quotations where rfq_id='00000000-0000-0000-0000-0000000000e8'$q$, '1');
select pg_temp.t_eq('s7 RFQ without deadline (legacy) is open', $q$select count(*)::text from procurement_quotations where rfq_id='00000000-0000-0000-0000-0000000000e5'$q$, '3');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');   -- A has rfq.view (the helpers answer only to rfq.view users)
select pg_temp.t_eq('s8 opening time is the end of the deadline day in Asia/Bangkok', $q$select (proc_rfq_bids_open_at('00000000-0000-0000-0000-0000000000e1') = ((current_date + 6)::timestamp at time zone 'Asia/Bangkok'))::text$q$, 'true');
select pg_temp.t_eq('s9 sealed before, open helper false', $q$select proc_rfq_bids_open('00000000-0000-0000-0000-0000000000e1')::text$q$, 'false');
-- score / award while sealed
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('s10 score while sealed', $q$select procurement_score_quotation('00000000-0000-0000-0000-0000000000f3', 80, 60)$q$, 'PROC_BIDS_SEALED%');
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('s11 award while sealed', $q$select procurement_award_rfq('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000f3','Only one valid quotation was received and it is within the budget.')$q$, 'PROC_BIDS_SEALED%');
-- issue checks
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('s12 issue without a deadline', $q$select procurement_transition_rfq('00000000-0000-0000-0000-0000000000e4','issued')$q$, 'PROC_VALIDATION%');
select pg_temp.t('s13 issue with a past deadline', $q$select procurement_transition_rfq('00000000-0000-0000-0000-0000000000e7','issued')$q$, 'PROC_VALIDATION%');
select pg_temp.as_pg();
select set_config('dcos.proc_transition','on',true);
update procurement_rfqs set response_deadline = current_date where id = '00000000-0000-0000-0000-0000000000e4';
select set_config('dcos.proc_transition','off',true);
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('s14 issue with a deadline of today', $q$select procurement_transition_rfq('00000000-0000-0000-0000-0000000000e4','issued')$q$, null);
-- deadline passes -> everyone sees the quotation, scoring works
select pg_temp.as_pg();
select set_config('dcos.proc_transition','on',true);
update procurement_rfqs set response_deadline = current_date - 1 where id in ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e3');
select set_config('dcos.proc_transition','off',true);
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('s15 after the deadline a non-creator sees the quotation', $q$select count(*)::text from procurement_quotations where rfq_id='00000000-0000-0000-0000-0000000000e1'$q$, '1');
select pg_temp.t_eq('s16 after the deadline the items are visible', $q$select count(*)::text from procurement_quotation_items where quotation_id='00000000-0000-0000-0000-0000000000f1'$q$, '1');
select pg_temp.as_user('d12566af-4e73-4bd7-8bf1-e117a145df49');
select pg_temp.t_eq('s17 after the deadline the admin sees it too', $q$select count(*)::text from procurement_quotations where rfq_id='00000000-0000-0000-0000-0000000000e1'$q$, '1');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('s18 score after the deadline', $q$select procurement_score_quotation('00000000-0000-0000-0000-0000000000f3', 80, 60)$q$, null);

-- ================================================================ F6 award reason
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('a1 override with a 30 character reason', $q$select procurement_award_rfq('00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-000000000fa2','This one has better delivery ok')$q$, '%at least 50 characters%');
select pg_temp.t('a2 override with a 50 character reason', $q$select procurement_award_rfq('00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-000000000fa2','Better delivery terms and an extended warranty period.')$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('a3 award PO has the new number format', $q$select (po_number ~ '^GEN-PO-\d{4}-\d{4,}$')::text from procurement_pos where rfq_id='00000000-0000-0000-0000-0000000000e5'$q$, 'true');
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('a4 fewer than 3 quotations, 10 characters (still 20)', $q$select procurement_award_rfq('00000000-0000-0000-0000-0000000000e6','00000000-0000-0000-0000-000000000fb1','too short.')$q$, '%at least 20 characters%');
select pg_temp.t('a5 fewer than 3 quotations, 20 characters ok (recommended quotation)', $q$select procurement_award_rfq('00000000-0000-0000-0000-0000000000e6','00000000-0000-0000-0000-000000000fb1','Lowest compliant bid.')$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('a6 returned po_number is the stored one', $q$select (select po_number from procurement_pos where rfq_id='00000000-0000-0000-0000-0000000000e6') ~ '^GEN-PO-\d{4}-\d{4,}$'$q$, 'true');

-- ================================================================ F8 value bands
select pg_temp.as_user('36308164-bca8-4540-a72d-09f7021c5569');   -- C: L3, band 3
select pg_temp.t_eq('b1 info shape: required band for 20,000 USD', $q$select (procurement_po_band_info('00000000-0000-0000-0000-00000000b002') ->> 'required_band')||'/'||(procurement_po_band_info('00000000-0000-0000-0000-00000000b002') ->> 'user_band')||'/'||(procurement_po_band_info('00000000-0000-0000-0000-00000000b002') ->> 'base_currency')||'/'||(procurement_po_band_info('00000000-0000-0000-0000-00000000b002') ->> 'base_amount')$q$, '3/3/USD/20000');
select pg_temp.t_eq('b1b info has uplift_reasons and fx_error keys', $q$select (procurement_po_band_info('00000000-0000-0000-0000-00000000b002') ?& array['base_amount','base_currency','required_band','user_band','uplift_reasons','fx_error'])::text$q$, 'true');
select pg_temp.t('b2 band 3 approver approves 500 USD (band 1)', $q$select procurement_transition_po('00000000-0000-0000-0000-00000000b001','approved')$q$, null);
select pg_temp.t('b3 band 3 approver approves 20,000 USD (band 3)', $q$select procurement_transition_po('00000000-0000-0000-0000-00000000b002','approved')$q$, null);
select pg_temp.t('b4 band 3 approver cannot approve 100,000 USD (band 4)', $q$select procurement_transition_po('00000000-0000-0000-0000-00000000b003','approved')$q$, 'PROC_BAND_EXCEEDED: this PO needs approval band 4 (amount 100000 USD); you hold band 3%');
select pg_temp.t('b5 non-lowest award PO: band 3 amount +1 = 4, refused', $q$select procurement_transition_po('00000000-0000-0000-0000-00000000b005','approved')$q$, 'PROC_BAND_EXCEEDED%band 4%');
select pg_temp.t_eq('b6 single-source uplift', $q$select (procurement_po_band_info('00000000-0000-0000-0000-00000000b006') ->> 'required_band')||'/'||(procurement_po_band_info('00000000-0000-0000-0000-00000000b006') -> 'uplift_reasons')::text$q$, '2/["single_source"]');
select pg_temp.t_eq('b7 over-budget uplift', $q$select (procurement_po_band_info('00000000-0000-0000-0000-00000000b007') ->> 'required_band')||'/'||(procurement_po_band_info('00000000-0000-0000-0000-00000000b007') -> 'uplift_reasons')::text$q$, '2/["over_budget"]');
select pg_temp.t_eq('b8 band boundaries: 1000 -> 1, 1000.01 -> 2, 10000 -> 2, 50000.01 -> 4, 300000 -> 5', $q$select concat_ws(',', (procurement_po_band_info('00000000-0000-0000-0000-00000000b008') ->> 'required_band'), (procurement_po_band_info('00000000-0000-0000-0000-00000000b009') ->> 'required_band'), (procurement_po_band_info('00000000-0000-0000-0000-00000000b010') ->> 'required_band'), (procurement_po_band_info('00000000-0000-0000-0000-00000000b011') ->> 'required_band'), (procurement_po_band_info('00000000-0000-0000-0000-00000000b012') ->> 'required_band'))$q$, '1,2,2,4,5');
select pg_temp.t_eq('b9 non-base currency without a rate: info reports fx_error', $q$select (procurement_po_band_info('00000000-0000-0000-0000-00000000b004') ->> 'fx_error') like 'PROC_VALIDATION: no exchange rate THB to USD%' and (procurement_po_band_info('00000000-0000-0000-0000-00000000b004') ->> 'required_band') is null$q$, 'true');
select pg_temp.t('b10 non-base currency without a rate: approval refused', $q$select procurement_transition_po('00000000-0000-0000-0000-00000000b004','approved')$q$, 'PROC_VALIDATION: no exchange rate THB to USD%');
select pg_temp.as_pg();
insert into procurement_fx_rates (currency, rate_to_base, effective_date) values ('THB', 0.03, proc_today()), ('KRW', 0.00075, proc_today());
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t_eq('b11 direct rate: 1,000,000 THB x 0.03 = 30,000 USD, band 3', $q$select (procurement_po_band_info('00000000-0000-0000-0000-00000000b004') ->> 'base_amount')||'/'||(procurement_po_band_info('00000000-0000-0000-0000-00000000b004') ->> 'required_band')$q$, '30000.00/3');
select pg_temp.t_eq('b12 second currency: 13,000,000 KRW x 0.00075 = 9,750 USD, band 2', $q$select (procurement_po_band_info('00000000-0000-0000-0000-00000000b013') ->> 'base_amount')||'/'||(procurement_po_band_info('00000000-0000-0000-0000-00000000b013') ->> 'required_band')$q$, '9750.00/2');
select pg_temp.t('b13 band 5 holder approves the 100,000 USD PO', $q$select procurement_transition_po('00000000-0000-0000-0000-00000000b003','approved')$q$, null);
select pg_temp.as_user('d12566af-4e73-4bd7-8bf1-e117a145df49');
select pg_temp.t_eq('b14 admin holds band 5', $q$select procurement_po_band_info('00000000-0000-0000-0000-00000000b003') ->> 'user_band'$q$, '5');
select pg_temp.as_user('eb8f12ce-4a1a-4e2b-a963-88850a9ab1d2');
select pg_temp.t_eq('b15 read-only user holds no band', $q$select procurement_po_band_info('00000000-0000-0000-0000-00000000b003') ->> 'user_band'$q$, '0');
select pg_temp.as_user('3e0fcdce-3565-4636-aed4-44669c6567d1');
select pg_temp.t('b16 no po.view -> PROC_FORBIDDEN', $q$select procurement_po_band_info('00000000-0000-0000-0000-00000000b003')$q$, 'PROC_FORBIDDEN%');

-- band configuration
select pg_temp.as_user('eb8f12ce-4a1a-4e2b-a963-88850a9ab1d2');
select pg_temp.t_rows('c1 band update by a non-configure user', $q$update procurement_approval_bands set label = 'x' where band = 2$q$, 0);
select pg_temp.t('c2 band RPC by a non-configure user', $q$select procurement_set_approval_bands('[{"band":2,"min_amount":1000,"max_amount":10000}]'::jsonb)$q$, 'PROC_FORBIDDEN%');
select pg_temp.as_user('3e0fcdce-3565-4636-aed4-44669c6567d1');
select pg_temp.t_eq('c2b L4 sees no bands', $q$select count(*)::text from procurement_approval_bands$q$, '0');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');   -- A: L0 has po.configure
select pg_temp.t_eq('c3 anyone with po.view reads the 5 bands', $q$select count(*)::text from procurement_approval_bands$q$, '5');
select pg_temp.t('c4 configure user renames a band', $q$update procurement_approval_bands set label = 'Band 2 (renamed)' where band = 2$q$, null);
select pg_temp.t('c5 overlapping update is refused at validation', $q$update procurement_approval_bands set max_amount = 20000 where band = 2; set constraints all immediate$q$, 'PROC_VALIDATION%');
select pg_temp.t('c6 overlapping RPC input is refused', $q$select procurement_set_approval_bands('[{"band":2,"min_amount":1000,"max_amount":20000}]'::jsonb)$q$, 'PROC_VALIDATION%');
select pg_temp.t('c7 valid RPC edit moves a shared boundary', $q$select procurement_set_approval_bands('[{"band":1,"min_amount":0,"max_amount":2000},{"band":2,"min_amount":2000,"max_amount":10000}]'::jsonb)$q$, null);
select pg_temp.t('c8 delete a band is refused', $q$delete from procurement_approval_bands where band = 5$q$, 'permission denied%');
select pg_temp.t('c9 insert a band is refused', $q$insert into procurement_approval_bands (band, label, min_amount, max_amount, permission_action) values (5, 'dup', 0, 1, 'po_band9')$q$, 'permission denied%');
select pg_temp.as_pg();
select pg_temp.t_eq('c10 band changes write critical audit rows', $q$select (count(*) >= 2)::text from procurement_audit_log where table_name='procurement_approval_bands' and severity='critical'$q$, 'true');
select pg_temp.t_eq('c11 other tables keep severity normal', $q$select (count(*) > 0)::text from procurement_audit_log where table_name='procurement_prs' and severity='normal'$q$, 'true');
select pg_temp.t_eq('c12 role defaults: L1 band 5, L2 band 4, L3 band 3', $q$select string_agg(role_code||':'||action, ',' order by role_code) from role_permissions where module='procurement' and action like 'po\_band%' and approve$q$, 'L0:po_band5,L1:po_band5,L2:po_band4,L3:po_band3');

-- ================================================================ F9 numbering
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('n1 PR insert with a client number', $q$insert into procurement_prs (id, pr_number) values ('00000000-0000-0000-0000-0000000000a1','CLIENT-PR')$q$, null);
select pg_temp.t('n2 PR insert without a number (not-null column)', $q$insert into procurement_prs (id) values ('00000000-0000-0000-0000-0000000000a2')$q$, null);
select pg_temp.t('n3 PR with a project uses its project code', $q$insert into procurement_prs (id, pr_number, project_id) values ('00000000-0000-0000-0000-0000000000a3','CLIENT-PR','c91b2eac-1f0a-4fbf-bae5-f3cc1e357545')$q$, null);
select pg_temp.t('n4 PO insert with a client number', $q$insert into procurement_pos (id, po_number, supplier_id) values ('00000000-0000-0000-0000-0000000000a4','CLIENT-PO','fa91ba30-5c9c-4576-95f4-85fe320e05ca')$q$, null);
select pg_temp.t('n5 RFQ insert for a project PR', $q$insert into procurement_rfqs (id, rfq_number, pr_id) values ('00000000-0000-0000-0000-0000000000a5','CLIENT-RFQ','00000000-0000-0000-0000-0000000000a3')$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('n6 client number ignored, GEN format', $q$select (pr_number ~ '^GEN-PR-\d{4}-\d{4,}$' and pr_number <> 'CLIENT-PR')::text from procurement_prs where id='00000000-0000-0000-0000-0000000000a1'$q$, 'true');
select pg_temp.t_eq('n7 number assigned when omitted', $q$select (pr_number ~ '^GEN-PR-\d{4}-\d{4,}$')::text from procurement_prs where id='00000000-0000-0000-0000-0000000000a2'$q$, 'true');
select pg_temp.t_eq('n8 project code in the number', $q$select (pr_number ~ ('^PJR-2026-003-PR-\d{4}-\d{4,}$'))::text from procurement_prs where id='00000000-0000-0000-0000-0000000000a3'$q$, 'true');
select pg_temp.t_eq('n9 PO number', $q$select (po_number ~ '^GEN-PO-\d{4}-\d{4,}$' and po_number <> 'CLIENT-PO')::text from procurement_pos where id='00000000-0000-0000-0000-0000000000a4'$q$, 'true');
select pg_temp.t_eq('n10 RFQ number follows the PR project', $q$select (rfq_number ~ '^PJR-2026-003-RFQ-\d{4}-\d{4,}$')::text from procurement_rfqs where id='00000000-0000-0000-0000-0000000000a5'$q$, 'true');
select pg_temp.t_eq('n11 numbers are sequential and distinct', $q$select ((select last_no from procurement_number_seq where kind='PR' and project_key='GEN' and year=extract(year from current_date)) >= 2)::text$q$, 'true');
select pg_temp.t_eq('n12 unique indexes exist', $q$select count(*)::text from pg_indexes where indexname in ('uq_procurement_prs_pr_number','uq_procurement_rfqs_rfq_number','uq_procurement_pos_po_number')$q$, '3');
select pg_temp.t_eq('n13 next_number not executable by authenticated', $q$select has_function_privilege('authenticated','procurement_next_number(text,uuid,integer)','execute')::text$q$, 'false');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('n14 number sequence table closed to clients', $q$select * from procurement_number_seq$q$, 'permission denied%');


-- ================================================================ review fixes
-- B1 audit log must not leak sealed bids (RFQ e9 is sealed; its quotation f9 was recorded by B)
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('rv1 non-creator with audit_log.view sees no sealed quotation audit rows', $q$select count(*)::text from procurement_audit_log where table_name='procurement_quotations' and record_id='00000000-0000-0000-0000-0000000000f9'$q$, '0');
select pg_temp.t_eq('rv2 ... nor the sealed quotation item audit rows', $q$select count(*)::text from procurement_audit_log where table_name='procurement_quotation_items' and new_data ->> 'quotation_id' = '00000000-0000-0000-0000-0000000000f9'$q$, '0');
select pg_temp.t_eq('rv3 other audit rows stay visible', $q$select (count(*) > 0)::text from procurement_audit_log where table_name='procurement_prs'$q$, 'true');
select pg_temp.as_user('d12566af-4e73-4bd7-8bf1-e117a145df49');
select pg_temp.t_eq('rv4 admin sees no sealed audit rows either', $q$select count(*)::text from procurement_audit_log where table_name in ('procurement_quotations','procurement_quotation_items') and (new_data ->> 'rfq_id' = '00000000-0000-0000-0000-0000000000e9' or new_data ->> 'quotation_id' = '00000000-0000-0000-0000-0000000000f9')$q$, '0');
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t_eq('rv5 the quotation creator sees its own audit rows (quotation + item)', $q$select count(*)::text from procurement_audit_log where (table_name='procurement_quotations' and record_id='00000000-0000-0000-0000-0000000000f9') or (table_name='procurement_quotation_items' and new_data ->> 'quotation_id' = '00000000-0000-0000-0000-0000000000f9')$q$, '2');
select pg_temp.as_pg();
insert into procurement_audit_log (table_name, record_id, action, old_data) values
 ('procurement_quotations', gen_random_uuid(), 'DELETE', jsonb_build_object('rfq_id', gen_random_uuid(), 'created_by', '0b268e83-4c22-4f79-bf75-06154a7d496c', 'total_amount', 5)),
 ('procurement_quotation_items', gen_random_uuid(), 'DELETE', jsonb_build_object('quotation_id', gen_random_uuid(), 'unit_price', 5, 'created_by', '0b268e83-4c22-4f79-bf75-06154a7d496c', 'total_amount', 5));
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('rv6 audit rows of vanished quotations / RFQs count as open', $q$select count(*)::text from procurement_audit_log where action='DELETE' and table_name in ('procurement_quotations','procurement_quotation_items') and old_data ->> 'total_amount' = '5'$q$, '2');
select pg_temp.as_pg();
select set_config('dcos.proc_transition','on',true);
update procurement_rfqs set response_deadline = current_date - 1 where id = '00000000-0000-0000-0000-0000000000e9';
select set_config('dcos.proc_transition','off',true);
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('rv7 after the deadline the sealed audit rows are visible', $q$select (count(*) >= 1)::text from procurement_audit_log where table_name='procurement_quotations' and record_id='00000000-0000-0000-0000-0000000000f9'$q$, 'true');

-- B2 self-contained FX
select pg_temp.as_user('eb8f12ce-4a1a-4e2b-a963-88850a9ab1d2');   -- L5: po.view only
select pg_temp.t_eq('rv8 po.view reads the FX settings and rates', $q$select (select count(*) from procurement_fx_settings)::text||'/'||(select count(*) from procurement_fx_rates)::text$q$, '1/2');
select pg_temp.t('rv9 po.view user cannot insert a rate', $q$insert into procurement_fx_rates (currency, rate_to_base) values ('CHF', 1.1)$q$, '%row-level security%');
select pg_temp.t_rows('rv10 po.view user cannot update the base currency', $q$update procurement_fx_settings set base_currency = 'EUR'$q$, 0);
select pg_temp.t_rows('rv11 po.view user cannot update a rate', $q$update procurement_fx_rates set rate_to_base = 99$q$, 0);
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rv12 configure user inserts a rate (created_by forged on purpose)', $q$insert into procurement_fx_rates (currency, rate_to_base, created_by) values ('CNY', 0.14, '0b268e83-4c22-4f79-bf75-06154a7d496c')$q$, null);
select pg_temp.t('rv13 delete of a rate is refused', $q$delete from procurement_fx_rates$q$, 'permission denied%');
select pg_temp.t('rv14 base currency needs no rate', $q$insert into procurement_fx_rates (currency, rate_to_base) values ('USD', 1)$q$, 'PROC_VALIDATION%');
select pg_temp.t('rv15 configure user updates the settings', $q$update procurement_fx_settings set base_currency = 'USD'$q$, null);
insert into exchange_rates (from_currency, to_currency, rate, effective_date) values ('AUD','USD',999, current_date);
select pg_temp.as_pg();
insert into procurement_fx_rates (currency, rate_to_base, effective_date) values ('AUD', 7, public.proc_today() + 1), ('AUD', 0.5, public.proc_today() - 1);
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t_eq('rv16 only procurement_fx_rates counts (future rate and exchange_rates ignored)', $q$select procurement_po_band_info('00000000-0000-0000-0000-00000000b015') ->> 'base_amount'$q$, '500.00');
select pg_temp.t_eq('rv17 the old exchange_rates rows change nothing for THB', $q$select procurement_po_band_info('00000000-0000-0000-0000-00000000b004') ->> 'base_amount'$q$, '30000.00');
select pg_temp.as_pg();
select pg_temp.t_eq('rv18 FX tables write critical audit rows', $q$select count(distinct table_name)::text from procurement_audit_log where table_name in ('procurement_fx_settings','procurement_fx_rates') and severity='critical'$q$, '2');
select pg_temp.t_eq('rv19 created_by is forced on a rate', $q$select created_by::text from procurement_fx_rates where currency='CNY'$q$, '1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('rv20 base currency seeded as USD', $q$select proc_base_currency()$q$, 'USD');

-- B3 band identity
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rv21 cannot rewire permission_action', $q$update procurement_approval_bands set permission_action = 'po_band9' where band = 1$q$, 'permission denied%');
select pg_temp.t('rv22 cannot renumber a band', $q$update procurement_approval_bands set band = 9 where band = 5$q$, 'permission denied%');
select pg_temp.t('rv23 cannot change a band id', $q$update procurement_approval_bands set id = gen_random_uuid() where band = 5$q$, 'permission denied%');
select pg_temp.as_pg();
select pg_temp.t('rv24 guard trigger blocks identity changes even for the owner', $q$update procurement_approval_bands set permission_action = 'po_band9' where band = 1$q$, 'PROC_VALIDATION%');
select pg_temp.t_eq('rv25 table privileges', $q$select concat_ws(',', has_table_privilege('authenticated','procurement_approval_bands','insert'), has_table_privilege('authenticated','procurement_approval_bands','delete'), has_table_privilege('authenticated','procurement_approval_bands','truncate'), has_table_privilege('anon','procurement_approval_bands','insert'), has_table_privilege('anon','procurement_approval_bands','update'), has_table_privilege('anon','procurement_approval_bands','delete'), has_table_privilege('anon','procurement_approval_bands','truncate'))$q$, 'f,f,f,f,f,f,f');
select pg_temp.t_eq('rv26 authenticated can only update label, min, max', $q$select concat_ws(',', has_column_privilege('authenticated','procurement_approval_bands','label','update'), has_column_privilege('authenticated','procurement_approval_bands','permission_action','update'), has_column_privilege('authenticated','procurement_approval_bands','band','update'))$q$, 't,f,f');

-- S1 band amount
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t_eq('rv27 PO value = greatest(grand, total, sum of line totals); sections ignored', $q$select (procurement_po_band_info('00000000-0000-0000-0000-00000000b014') ->> 'base_amount')||'/'||(procurement_po_band_info('00000000-0000-0000-0000-00000000b014') ->> 'required_band')$q$, '30000/3');
select pg_temp.t_eq('rv28 total_amount above grand_total counts', $q$select procurement_po_band_info('00000000-0000-0000-0000-00000000b016') ->> 'base_amount'$q$, '700');

-- S3 numbers are immutable
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_rows('rv29 PR number edit is ignored (update itself succeeds)', $q$update procurement_prs set pr_number = 'HACK-PR', notes = 'edited' where id='00000000-0000-0000-0000-0000000000a1'$q$, 1);
select pg_temp.t_rows('rv30 PO number edit is ignored', $q$update procurement_pos set po_number = 'HACK-PO', notes = 'edited' where id='00000000-0000-0000-0000-0000000000a4'$q$, 1);
select pg_temp.t_rows('rv31 RFQ number edit is ignored', $q$update procurement_rfqs set rfq_number = 'HACK-RFQ', notes = 'edited' where id='00000000-0000-0000-0000-0000000000a5'$q$, 1);
select pg_temp.as_pg();
select pg_temp.t_eq('rv32 the numbers are unchanged', $q$select ((select pr_number from procurement_prs where id='00000000-0000-0000-0000-0000000000a1') ~ '^GEN-PR-' and (select po_number from procurement_pos where id='00000000-0000-0000-0000-0000000000a4') ~ '^GEN-PO-' and (select rfq_number from procurement_rfqs where id='00000000-0000-0000-0000-0000000000a5') ~ '^PJR-2026-003-RFQ-')::text$q$, 'true');

-- N1 helpers answer only to rfq.view users
select pg_temp.as_user('3e0fcdce-3565-4636-aed4-44669c6567d1');   -- L4: no procurement role
select pg_temp.t_eq('rv33 no rfq.view -> open helper false, opening time null', $q$select proc_rfq_bids_open('00000000-0000-0000-0000-0000000000e5')::text||'/'||coalesce(proc_rfq_bids_open_at('00000000-0000-0000-0000-0000000000e5')::text, 'null')$q$, 'false/null');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('rv34 rfq.view user gets real answers', $q$select proc_rfq_bids_open('00000000-0000-0000-0000-0000000000e5')::text||'/'||(proc_rfq_bids_open_at('00000000-0000-0000-0000-0000000000e3') is not null)::text$q$, 'true/true');
select pg_temp.t_eq('rv35 raw helpers are not callable by clients', $q$select has_function_privilege('authenticated','proc_rfq_bids_open_raw(uuid)','execute')::text$q$, 'false');

-- N2 band RPC writes only real changes
select pg_temp.as_pg();
delete from nb;
insert into nb select count(*) from procurement_audit_log where table_name = 'procurement_approval_bands';
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rv36 RPC with the current values', $q$select procurement_set_approval_bands((select jsonb_agg(jsonb_build_object('band', band, 'label', label, 'min_amount', min_amount, 'max_amount', max_amount)) from procurement_approval_bands))$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('rv37 no audit rows for a no-op RPC', $q$select ((select count(*) from procurement_audit_log where table_name = 'procurement_approval_bands') - (select n from nb))::text$q$, '0');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rv38 RPC changing one label', $q$select procurement_set_approval_bands((select jsonb_agg(jsonb_build_object('band', band, 'label', case when band = 3 then 'Band three' else label end, 'min_amount', min_amount, 'max_amount', max_amount)) from procurement_approval_bands))$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('rv39 exactly one new critical audit row for the one changed band', $q$select ((select count(*) from procurement_audit_log where table_name = 'procurement_approval_bands' and severity = 'critical') - (select n from nb))::text$q$, '1');

-- N3 / N4 / N10
select pg_temp.t_eq('rv40 award function has no md5 number loop', $q$select (pg_get_functiondef('procurement_award_rfq(uuid,uuid,text)'::regprocedure) not like '%md5(%')::text$q$, 'true');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rv41 issue with a deadline of today (Bangkok)', $q$select procurement_transition_rfq('00000000-0000-0000-0000-000000000e11','issued')$q$, null);
select pg_temp.t('rv42 issue with a deadline of yesterday (Bangkok)', $q$select procurement_transition_rfq('00000000-0000-0000-0000-000000000e12','issued')$q$, 'PROC_VALIDATION%');
select pg_temp.as_pg();
select pg_temp.t_eq('rv43 numbering year is the Bangkok year', $q$select (count(*) > 0 and bool_and(year = extract(year from proc_today())))::text from procurement_number_seq$q$, 'true');
select pg_temp.t_eq('rv44 quotation select policy wraps the helper in a sub-select', $q$select (qual ilike '%SELECT proc_rfq_bids_open(%')::text from pg_policies where policyname='proc_procurement_quotations_select'$q$, 'true');


-- ================================================================ re-review follow-ups
-- R1 base currency guard (the suite has FX rates from the b11/b12 fixtures)
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rv45 base currency cannot change while rates exist', $q$update procurement_fx_settings set base_currency = 'EUR'$q$, 'PROC_VALIDATION: remove or replace the exchange rates before changing the base currency');
select pg_temp.t('rv46 a no-op update to the same base currency is allowed', $q$update procurement_fx_settings set base_currency = 'USD'$q$, null);
select pg_temp.as_pg();
delete from procurement_fx_rates;
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rv47 with no rates left the base currency can change', $q$update procurement_fx_settings set base_currency = 'EUR'$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('rv48 and the helper follows it', $q$select proc_base_currency()$q$, 'EUR');
update procurement_fx_settings set base_currency = 'USD';

-- NIT2 fail closed on missing keys; dangling keys stay open
insert into procurement_audit_log (table_name, record_id, action, old_data) values
 ('procurement_quotations', gen_random_uuid(), 'DELETE', jsonb_build_object('total_amount', 6)),
 ('procurement_quotations', gen_random_uuid(), 'DELETE', jsonb_build_object('rfq_id', null, 'total_amount', 6)),
 ('procurement_quotation_items', gen_random_uuid(), 'DELETE', jsonb_build_object('unit_price', 6)),
 ('procurement_quotation_items', gen_random_uuid(), 'DELETE', jsonb_build_object('quotation_id', 'not-a-uuid', 'unit_price', 6)),
 ('procurement_quotation_items', gen_random_uuid(), 'DELETE', jsonb_build_object('quotation_id', gen_random_uuid(), 'unit_price', 6));
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('rv49 missing / null / malformed keys are hidden, a dangling quotation id stays open', $q$select count(*)::text from procurement_audit_log where action='DELETE' and (old_data ->> 'total_amount' = '6' or old_data ->> 'unit_price' = '6')$q$, '1');

-- NIT1 the helper answers only to audit_log.view; execute must stay granted (policies run with the caller's rights)
select pg_temp.as_user('3e0fcdce-3565-4636-aed4-44669c6567d1');   -- L4: no audit_log.view
select pg_temp.t_eq('rv50 helper returns false without audit_log.view', $q$select proc_audit_row_visible('procurement_prs', null, null)::text$q$, 'false');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('rv51 helper returns true for an unrelated table with audit_log.view', $q$select proc_audit_row_visible('procurement_prs', null, null)::text$q$, 'true');
select pg_temp.t_eq('rv52 execute stays granted to authenticated', $q$select has_function_privilege('authenticated','proc_audit_row_visible(text,jsonb,jsonb)','execute')::text$q$, 'true');
select pg_temp.as_pg();
revoke execute on function public.proc_audit_row_visible(text, jsonb, jsonb) from authenticated;
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rv53 (proof) revoking execute would break the audit_log policy', $q$select count(*) from procurement_audit_log$q$, 'permission denied for function proc_audit_row_visible');
select pg_temp.as_pg();
grant execute on function public.proc_audit_row_visible(text, jsonb, jsonb) to authenticated;
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('rv54 and the policy works again once execute is granted', $q$select (count(*) > 0)::text from procurement_audit_log$q$, 'true');

select pg_temp.as_pg();
select name, case when ok then 'PASS' else 'FAIL' end as result, case when ok then '' else detail end as detail from res order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from res;
rollback;
