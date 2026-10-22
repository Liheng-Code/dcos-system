-- Procurement P0+P1 hardening: SQL acceptance suite (doc 13 section 7).
-- Runs in ONE transaction and ends in ROLLBACK: nothing persists.
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
select pg_temp.as_pg();
insert into procurement_prs (id, pr_number, requested_by, created_by, approval_status, submitted_by) values
 ('00000000-0000-0000-0000-0000000000a1','T-PR-1','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','draft',null),
 ('00000000-0000-0000-0000-0000000000a2','T-PR-2','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','draft',null),
 ('00000000-0000-0000-0000-0000000000a3','T-PR-3','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','draft',null),
 ('00000000-0000-0000-0000-0000000000a4','T-PR-4','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','draft',null),
 ('00000000-0000-0000-0000-0000000000a5','T-PR-5','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','under_budget_review','1470d8fc-c1fe-4057-8dd1-5a78b27c4465'),
 ('00000000-0000-0000-0000-0000000000a6','T-PR-6','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','under_budget_review','1470d8fc-c1fe-4057-8dd1-5a78b27c4465'),
 ('00000000-0000-0000-0000-0000000000a7','T-PR-7','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','draft',null);
insert into procurement_pr_items (id, pr_id, line_no, item_description, unit, quantity) values
 ('00000000-0000-0000-0000-0000000001a1','00000000-0000-0000-0000-0000000000a1',1,'item','ea',5),
 ('00000000-0000-0000-0000-0000000001a5','00000000-0000-0000-0000-0000000000a5',1,'item','ea',5),
 ('00000000-0000-0000-0000-0000000001a7','00000000-0000-0000-0000-0000000000a7',1,'item','ea',5);

insert into procurement_pos (id, po_number, supplier_id, created_by, status) values
 ('00000000-0000-0000-0000-0000000000b1','T-PO-1','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','draft'),
 ('00000000-0000-0000-0000-0000000000b2','T-PO-2','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','draft'),
 ('00000000-0000-0000-0000-0000000000b3','T-PO-3','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','draft'),
 ('00000000-0000-0000-0000-0000000000b4','T-PO-4','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','issued'),
 ('00000000-0000-0000-0000-0000000000b5','T-PO-5','fa91ba30-5c9c-4576-95f4-85fe320e05ca','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','delivered');
insert into procurement_po_items (id, po_id, line_no, item_description, quantity_ordered) values
 ('00000000-0000-0000-0000-0000000002b1','00000000-0000-0000-0000-0000000000b1',1,'item',3),
 ('00000000-0000-0000-0000-0000000002b4','00000000-0000-0000-0000-0000000000b4',1,'item',10);
select set_config('dcos.proc_transition','on',true);
update procurement_pos set grand_total = 100 where id = '00000000-0000-0000-0000-0000000000b5';
update procurement_pos set grand_total = 20 where id = '00000000-0000-0000-0000-0000000000b4';
update procurement_po_items set unit_price = 2 where id = '00000000-0000-0000-0000-0000000002b4';
select set_config('dcos.proc_transition','off',true);
insert into procurement_delivery_notes (id, po_id, supplier_id, delivery_date) values
 ('00000000-0000-0000-0000-0000000003b4','00000000-0000-0000-0000-0000000000b4','fa91ba30-5c9c-4576-95f4-85fe320e05ca', current_date);
insert into procurement_goods_receipts (delivery_note_id, po_item_id, quantity_received, quantity_accepted)
 values ('00000000-0000-0000-0000-0000000003b4','00000000-0000-0000-0000-0000000002b4',4,4);

insert into procurement_rfqs (id, rfq_number, status, created_by, evaluation_method) values
 ('00000000-0000-0000-0000-0000000000c1','T-RFQ-1','draft','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','weighted'),
 ('00000000-0000-0000-0000-0000000000c2','T-RFQ-2','under_evaluation','1470d8fc-c1fe-4057-8dd1-5a78b27c4465','lowest_price');
insert into procurement_quotations (id, rfq_id, supplier_id, total_amount, created_by) values
 ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c2','fa91ba30-5c9c-4576-95f4-85fe320e05ca',100,'0b268e83-4c22-4f79-bf75-06154a7d496c');
insert into procurement_quotation_items (quotation_id, line_no, item_description, unit, quantity, unit_price, total)
 values ('00000000-0000-0000-0000-0000000000d2',1,'item','ea',1,100,100);
insert into procurement_rfq_suppliers (rfq_id, supplier_id) values ('00000000-0000-0000-0000-0000000000c1','fa91ba30-5c9c-4576-95f4-85fe320e05ca'),('00000000-0000-0000-0000-0000000000c2','fa91ba30-5c9c-4576-95f4-85fe320e05ca');

-- ---------------------------------------------------------------- a) direct status writes
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');   -- A (L0)
select pg_temp.t('a1 direct prs.approval_status', $q$update procurement_prs set approval_status='approved' where id='00000000-0000-0000-0000-0000000000a1'$q$, 'PROC_TRANSITION_RPC_ONLY%');
select pg_temp.t('a2 direct pos.status', $q$update procurement_pos set status='approved' where id='00000000-0000-0000-0000-0000000000b1'$q$, 'PROC_TRANSITION_RPC_ONLY%');
select pg_temp.t('a3 direct rfqs.status', $q$update procurement_rfqs set status='issued' where id='00000000-0000-0000-0000-0000000000c1'$q$, 'PROC_TRANSITION_RPC_ONLY%');
select pg_temp.t('a4 direct rfqs.awarded_supplier_id', $q$update procurement_rfqs set awarded_supplier_id='fa91ba30-5c9c-4576-95f4-85fe320e05ca' where id='00000000-0000-0000-0000-0000000000c1'$q$, 'PROC_TRANSITION_RPC_ONLY%');
select pg_temp.t('a5 direct quotations.is_awarded', $q$update procurement_quotations set is_awarded=true where id='00000000-0000-0000-0000-0000000000d2'$q$, 'PROC_TRANSITION_RPC_ONLY%');
select pg_temp.t('a6 direct prs.approved_by', $q$update procurement_prs set approved_by='1470d8fc-c1fe-4057-8dd1-5a78b27c4465' where id='00000000-0000-0000-0000-0000000000a1'$q$, 'PROC_TRANSITION_RPC_ONLY%');
select pg_temp.t('a7 direct quotations.combined_score', $q$update procurement_quotations set combined_score=99 where id='00000000-0000-0000-0000-0000000000d2'$q$, 'PROC_TRANSITION_RPC_ONLY%');

-- invoice match inserted by A through RLS (forces created_by = A, trigger moves PO delivered -> under_invoice_match)
select pg_temp.t('inv0 insert invoice match (valid)', $q$insert into procurement_invoice_matches (id, po_id, supplier_id, invoice_ref, invoice_date, invoice_amount, status) values ('00000000-0000-0000-0000-0000000004e1','00000000-0000-0000-0000-0000000000b5','fa91ba30-5c9c-4576-95f4-85fe320e05ca','INV-1',current_date,100,'matched')$q$, null);
select pg_temp.t('inv0b insert invoice match with variance', $q$insert into procurement_invoice_matches (id, po_id, supplier_id, invoice_ref, invoice_date, invoice_amount, variance_amount, status, created_by) values ('00000000-0000-0000-0000-0000000004e2','00000000-0000-0000-0000-0000000000b5','fa91ba30-5c9c-4576-95f4-85fe320e05ca','INV-2',current_date,150,50,'variance_detected','0b268e83-4c22-4f79-bf75-06154a7d496c')$q$, null);
select pg_temp.t('a8 direct invoice_matches.status', $q$update procurement_invoice_matches set status='approved' where id='00000000-0000-0000-0000-0000000004e1'$q$, 'PROC_TRANSITION_RPC_ONLY%');
select pg_temp.t('f2 insert invoice match already approved', $q$insert into procurement_invoice_matches (po_id, supplier_id, invoice_ref, invoice_date, invoice_amount, status) values ('00000000-0000-0000-0000-0000000000b5','fa91ba30-5c9c-4576-95f4-85fe320e05ca','INV-X',current_date,1,'approved')$q$, 'new row violates row-level security%');

-- ---------------------------------------------------------------- f) pre-approved inserts
select pg_temp.t('f1 insert PR as approved', $q$insert into procurement_prs (pr_number, approval_status) values ('T-F1','approved')$q$, 'new row violates row-level security%');
select pg_temp.t('f3 insert PR with approved_by (stripped to null)', $q$with i as (insert into procurement_prs (pr_number, approved_by) values ('T-F3','1470d8fc-c1fe-4057-8dd1-5a78b27c4465') returning approved_by) select 1 / (case when approved_by is null then 1 else 0 end) from i$q$, null);
select pg_temp.t('f4 insert PO as approved', $q$insert into procurement_pos (po_number, supplier_id, status) values ('T-F4','fa91ba30-5c9c-4576-95f4-85fe320e05ca','approved')$q$, 'new row violates row-level security%');
select pg_temp.t('f5 insert RFQ as awarded', $q$insert into procurement_rfqs (rfq_number, status) values ('T-F5','awarded')$q$, 'new row violates row-level security%');
select pg_temp.t('f6 insert quotation is_awarded (stripped to false)', $q$with i as (insert into procurement_quotations (rfq_id, supplier_id, total_amount, is_awarded) values ('00000000-0000-0000-0000-0000000000c1','fa91ba30-5c9c-4576-95f4-85fe320e05ca',1,true) returning is_awarded) select 1 / (case when is_awarded then 0 else 1 end) from i$q$, null);
select pg_temp.t('f7 insert draft PR ok', $q$insert into procurement_prs (id, pr_number, created_by) values ('00000000-0000-0000-0000-0000000000a9','T-F7','0b268e83-4c22-4f79-bf75-06154a7d496c')$q$, null);
select pg_temp.t('g0 insert budget confirmation by client', $q$insert into procurement_budget_confirmations (bc_number, pr_id) values ('T-BCX','00000000-0000-0000-0000-0000000000a1')$q$, 'new row violates row-level security%');

-- ---------------------------------------------------------------- e) audit log
select pg_temp.t('e1 insert audit log (L0)', $q$insert into procurement_audit_log (table_name, record_id, action) values ('procurement_prs', gen_random_uuid(), 'INSERT')$q$, 'new row violates row-level security%');
select pg_temp.as_user('d12566af-4e73-4bd7-8bf1-e117a145df49');   -- admin
select pg_temp.t('e2 insert audit log (admin)', $q$insert into procurement_audit_log (table_name, record_id, action) values ('procurement_prs', gen_random_uuid(), 'INSERT')$q$, 'new row violates row-level security%');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');

-- ---------------------------------------------------------------- d) delete
select pg_temp.t_rows('d1 delete procurement_prs', $q$delete from procurement_prs$q$, 0);
select pg_temp.t_rows('d2 delete procurement_pos', $q$delete from procurement_pos$q$, 0);
select pg_temp.t_rows('d3 delete procurement_suppliers', $q$delete from procurement_suppliers$q$, 0);
select pg_temp.t_rows('d4 delete procurement_rfqs', $q$delete from procurement_rfqs$q$, 0);
select pg_temp.t_rows('d5 delete procurement_audit_log', $q$delete from procurement_audit_log$q$, 0);

-- ---------------------------------------------------------------- l) edit lock on draft (ok)
select pg_temp.t_rows('l1 item edit on draft PR ok', $q$update procurement_pr_items set quantity=6 where pr_id='00000000-0000-0000-0000-0000000000a7'$q$, 1);
select pg_temp.t('l2 header edit on draft PR ok', $q$update procurement_prs set notes='x' where id='00000000-0000-0000-0000-0000000000a7'$q$, null);
select pg_temp.t_rows('l3 item edit on draft PO ok', $q$update procurement_po_items set quantity_ordered=4 where po_id='00000000-0000-0000-0000-0000000000b1'$q$, 1);

-- ---------------------------------------------------------------- b) PR/PO approval + SoD
select pg_temp.t('b0 A submits PR1', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a1','submitted')$q$, null);
select pg_temp.t('b1 creator override-approves own PR', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a1','approved','override because the budget owner is away')$q$, 'PROC_SOD_VIOLATION%');
select pg_temp.t('b1b override reason too short', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a1','approved','short')$q$, 'PROC_REASON_TOO_SHORT%');
-- l) edits on submitted PR
select pg_temp.t_rows('l4 item update on submitted PR refused', $q$update procurement_pr_items set quantity=9 where pr_id='00000000-0000-0000-0000-0000000000a1'$q$, 0);
select pg_temp.t_rows('l5 item delete on submitted PR refused', $q$delete from procurement_pr_items where pr_id='00000000-0000-0000-0000-0000000000a1'$q$, 0);
select pg_temp.t('l6 item insert on submitted PR refused', $q$insert into procurement_pr_items (pr_id, line_no, item_description, unit, quantity) values ('00000000-0000-0000-0000-0000000000a1',2,'x','ea',1)$q$, 'new row violates row-level security%');
select pg_temp.t('l7 header edit on submitted PR refused', $q$update procurement_prs set notes='changed' where id='00000000-0000-0000-0000-0000000000a1'$q$, 'PROC_LOCKED%');
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');   -- B (L1)
select pg_temp.t('b2 second user override-approves PR', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a1','approved','override because the budget owner is away')$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('b2b PR approved_by = B', $q$select approved_by::text from procurement_prs where id='00000000-0000-0000-0000-0000000000a1'$q$, '0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t_eq('b2c override reason stored', $q$select left(status_reason, 10) from procurement_prs where id='00000000-0000-0000-0000-0000000000a1'$q$, 'OVERRIDE: ');
select pg_temp.t_eq('b2d flag reset to off', $q$select current_setting('dcos.proc_transition', true)$q$, 'off');

-- c) submitter != creator still can't approve (A created PR2, B submits, B tries to approve)
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('c0 B submits PR2 (created by A)', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a2','submitted')$q$, null);
select pg_temp.t('c1 submitter cannot approve', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a2','approved','override approval by the submitter')$q$, 'PROC_SOD_VIOLATION%');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('c2 creator cannot approve (submitted by other)', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a2','approved','override approval by the creator')$q$, 'PROC_SOD_VIOLATION%');

-- PO
select pg_temp.t('b3 A submits PO1', $q$select procurement_transition_po('00000000-0000-0000-0000-0000000000b1','submitted')$q$, null);
select pg_temp.t('b4 creator approves own PO', $q$select procurement_transition_po('00000000-0000-0000-0000-0000000000b1','approved')$q$, 'PROC_SOD_VIOLATION%');
select pg_temp.t_rows('l8 PO item update on submitted PO refused', $q$update procurement_po_items set quantity_ordered=9 where po_id='00000000-0000-0000-0000-0000000000b1'$q$, 0);
select pg_temp.t('l9 PO header edit on submitted PO refused', $q$update procurement_pos set notes='x' where id='00000000-0000-0000-0000-0000000000b1'$q$, 'PROC_LOCKED%');
select pg_temp.as_user('45b635f5-dfcd-4750-a975-994ff757f920');   -- PO role (no approve)
select pg_temp.t('b5 PO-role user lacks po.approve', $q$select procurement_transition_po('00000000-0000-0000-0000-0000000000b1','approved')$q$, 'PROC_FORBIDDEN%');
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('b6 second user approves PO', $q$select procurement_transition_po('00000000-0000-0000-0000-0000000000b1','approved')$q$, null);
select pg_temp.t('b7 issue PO', $q$select procurement_transition_po('00000000-0000-0000-0000-0000000000b1','issued')$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('b7b PO issued_by = B', $q$select issued_by::text||'/'||status from procurement_pos where id='00000000-0000-0000-0000-0000000000b1'$q$, '0b268e83-4c22-4f79-bf75-06154a7d496c/issued');

-- ---------------------------------------------------------------- h) reasons
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('h0 A submits PR3', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a3','submitted')$q$, null);
select pg_temp.t('h1 cancel PR without reason', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a3','cancelled')$q$, 'PROC_REASON_REQUIRED%');
select pg_temp.t('h2 cancel PR with blank reason', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a3','cancelled','   ')$q$, 'PROC_REASON_REQUIRED%');
select pg_temp.t('h3 reject PR without reason', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a3','rejected')$q$, 'PROC_REASON_REQUIRED%');
select pg_temp.t('h4 return PR without reason', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a3','returned')$q$, 'PROC_REASON_REQUIRED%');
select pg_temp.t('h5 cancel PO without reason', $q$select procurement_transition_po('00000000-0000-0000-0000-0000000000b3','cancelled')$q$, 'PROC_REASON_REQUIRED%');
select pg_temp.t('h6 cancel RFQ without reason', $q$select procurement_transition_rfq('00000000-0000-0000-0000-0000000000c1','cancelled')$q$, 'PROC_REASON_REQUIRED%');
select pg_temp.t('h7 cancel PR with reason ok', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a3','cancelled','duplicate request')$q$, null);
select pg_temp.t('h8 cancelled PR is terminal', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a3','submitted')$q$, 'PROC_INVALID_TRANSITION%');

-- ---------------------------------------------------------------- i) invalid transition + compare-and-set; k) audit
select pg_temp.as_pg();
select pg_temp.t_eq('k0 audit count before', $q$select count(*)::text from procurement_audit_log where record_id='00000000-0000-0000-0000-0000000000a4' and action='UPDATE'$q$, '0');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('i1 draft -> approved invalid', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a4','approved','a sufficiently long override reason')$q$, 'PROC_INVALID_TRANSITION%');
select pg_temp.t('i2 draft -> submitted ok', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a4','submitted')$q$, null);
select pg_temp.t('i3 second submit from same state fails (CAS)', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a4','submitted')$q$, 'PROC_INVALID_TRANSITION%');
select pg_temp.as_pg();
select pg_temp.t_eq('k1 audit rows written by transition', $q$select (count(*) >= 1)::text from procurement_audit_log where record_id='00000000-0000-0000-0000-0000000000a4' and action='UPDATE'$q$, 'true');
select pg_temp.t_eq('k2 audit rows for PO transitions', $q$select (count(*) >= 3)::text from procurement_audit_log where record_id='00000000-0000-0000-0000-0000000000b1' and action='UPDATE'$q$, 'true');

-- ---------------------------------------------------------------- j) budget confirmation, scoring
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('j1 creator cannot confirm budget', $q$select procurement_confirm_budget('00000000-0000-0000-0000-0000000000a5', '{"bc_title":"t","bc_type":"GEN","budget_status":"under_budget"}'::jsonb, '[{"item_description":"item"}]'::jsonb)$q$, 'PROC_SOD_VIOLATION%');
select pg_temp.as_user('eb8f12ce-4a1a-4e2b-a963-88850a9ab1d2');   -- L5
select pg_temp.t('j2 L5 cannot confirm budget', $q$select procurement_confirm_budget('00000000-0000-0000-0000-0000000000a6', '{"bc_title":"t"}'::jsonb, '[{"item_description":"item"}]'::jsonb)$q$, 'PROC_FORBIDDEN%');
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('j3 empty items rejected', $q$select procurement_confirm_budget('00000000-0000-0000-0000-0000000000a5', '{"bc_title":"t"}'::jsonb, '[]'::jsonb)$q$, 'PROC_VALIDATION%');
select pg_temp.t('j4 confirm budget end to end', $q$select procurement_confirm_budget('00000000-0000-0000-0000-0000000000a5', '{"bc_number":"T-BC-1","bc_title":"Title","bc_type":"GEN","budget_status":"under_budget","signatory_position":"QS Manager"}'::jsonb, '[{"item_description":"item","pr_item_id":"00000000-0000-0000-0000-0000000001a5","estimated_amount":10}]'::jsonb)$q$, null);
select pg_temp.t('j4b confirm again fails (state)', $q$select procurement_confirm_budget('00000000-0000-0000-0000-0000000000a5', '{"bc_title":"t"}'::jsonb, '[{"item_description":"item"}]'::jsonb)$q$, 'PROC_INVALID_TRANSITION%');
select pg_temp.as_pg();
select pg_temp.t_eq('j5 PR approved + BC linked', $q$select p.approval_status||'/'||(p.budget_confirmation_id = b.id)::text||'/'||p.budget_checked::text||'/'||(p.approved_by = '0b268e83-4c22-4f79-bf75-06154a7d496c')::text from procurement_prs p join procurement_budget_confirmations b on b.pr_id = p.id where p.id='00000000-0000-0000-0000-0000000000a5'$q$, 'approved/true/true/true');
select pg_temp.t_eq('j6 BC stamped', $q$select (verified_by = approved_by and approved_by = created_by and approved_at = current_date and approved_by_position = 'QS Manager')::text||'/'||(select count(*) from procurement_budget_confirmation_items where bc_id = b.id)::text from procurement_budget_confirmations b where bc_number='T-BC-1'$q$, 'true/1');
select pg_temp.t_eq('j7 BC audited', $q$select (count(*) >= 1)::text from procurement_audit_log where table_name='procurement_budget_confirmations'$q$, 'true');

-- scoring: quotation d1 created by B on RFQ1 (weighted)
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('r0 A issues RFQ1', $q$select procurement_transition_rfq('00000000-0000-0000-0000-0000000000c1','issued')$q$, null);
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('r1 B records quotation', $q$insert into procurement_quotations (id, rfq_id, supplier_id, total_amount) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','fa91ba30-5c9c-4576-95f4-85fe320e05ca',50)$q$, null);
select pg_temp.t('r2 issued -> quotations_received', $q$select procurement_transition_rfq('00000000-0000-0000-0000-0000000000c1','quotations_received')$q$, null);
select pg_temp.t('r3 repeat is invalid (CAS)', $q$select procurement_transition_rfq('00000000-0000-0000-0000-0000000000c1','quotations_received')$q$, 'PROC_INVALID_TRANSITION%');
select pg_temp.t('r4 awarded only via award fn', $q$select procurement_transition_rfq('00000000-0000-0000-0000-0000000000c1','awarded')$q$, 'PROC_INVALID_TRANSITION%');
select pg_temp.t('j8 quotation creator cannot score', $q$select procurement_score_quotation('00000000-0000-0000-0000-0000000000d1', 80, 60)$q$, 'PROC_SOD_VIOLATION%');
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('j9 other user scores', $q$select procurement_score_quotation('00000000-0000-0000-0000-0000000000d1', 80, 60)$q$, null);
select pg_temp.t('j9b score out of range', $q$select procurement_score_quotation('00000000-0000-0000-0000-0000000000d1', 180, 60)$q$, 'PROC_VALIDATION%');
select pg_temp.as_pg();
select pg_temp.t_eq('j10 combined computed, statuses moved', $q$select q.combined_score::text||'/'||q.status||'/'||r.status from procurement_quotations q join procurement_rfqs r on r.id=q.rfq_id where q.id='00000000-0000-0000-0000-0000000000d1'$q$, '72/evaluated/under_evaluation');

-- award (security definer): RFQ2, single source needs a 50 char reason; B is not the RFQ creator
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('w1 award with short reason refused', $q$select procurement_award_rfq('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000d2','too short')$q$, '%award reason must be at least%');
select pg_temp.t('w2 award works', $q$select procurement_award_rfq('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000d2','Only one valid quotation was received and it is within the budget.')$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('w3 RFQ awarded + draft PO created', $q$select r.status||'/'||(select count(*) from procurement_pos where rfq_id = r.id)::text||'/'||(select status from procurement_quotations where id='00000000-0000-0000-0000-0000000000d2') from procurement_rfqs r where r.id='00000000-0000-0000-0000-0000000000c2'$q$, 'awarded/1/awarded');
select pg_temp.t_eq('w4 flag off after award', $q$select current_setting('dcos.proc_transition', true)$q$, 'off');
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('w5 awarded RFQ is terminal', $q$select procurement_transition_rfq('00000000-0000-0000-0000-0000000000c2','cancelled','try to cancel after award')$q$, 'PROC_INVALID_TRANSITION%');

-- ---------------------------------------------------------------- delivery sync + invoice
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('s1 sync partial delivery', $q$select procurement_sync_po_delivery('00000000-0000-0000-0000-0000000000b4')$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('s2 status partially_delivered, qty 4', $q$select p.status||'/'||i.quantity_delivered::text||'/'||i.quantity_accepted::text from procurement_pos p join procurement_po_items i on i.po_id=p.id where p.id='00000000-0000-0000-0000-0000000000b4'$q$, 'partially_delivered/4/4');
insert into procurement_goods_receipts (delivery_note_id, po_item_id, quantity_received, quantity_accepted)
 values ('00000000-0000-0000-0000-0000000003b4','00000000-0000-0000-0000-0000000002b4',6,6);
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('s3 sync full delivery', $q$select procurement_sync_po_delivery('00000000-0000-0000-0000-0000000000b4')$q$, null);
select pg_temp.as_user('eb8f12ce-4a1a-4e2b-a963-88850a9ab1d2');
select pg_temp.t('s4 L5 cannot sync', $q$select procurement_sync_po_delivery('00000000-0000-0000-0000-0000000000b4')$q$, 'PROC_FORBIDDEN%');
select pg_temp.as_pg();
select pg_temp.t_eq('s5 status delivered', $q$select status||'/'||(select quantity_delivered::text from procurement_po_items where po_id=procurement_pos.id) from procurement_pos where id='00000000-0000-0000-0000-0000000000b4'$q$, 'delivered/10');
select pg_temp.t_eq('inv1 invoice insert moved PO5 to under_invoice_match', $q$select status from procurement_pos where id='00000000-0000-0000-0000-0000000000b5'$q$, 'under_invoice_match');
select pg_temp.t_eq('inv1b created_by forced to A', $q$select created_by::text from procurement_invoice_matches where id='00000000-0000-0000-0000-0000000004e1'$q$, '1470d8fc-c1fe-4057-8dd1-5a78b27c4465');

select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('inv2 creator cannot approve invoice', $q$select procurement_transition_invoice_match('00000000-0000-0000-0000-0000000004e1','approved')$q$, 'PROC_SOD_VIOLATION%');
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('inv3 variance needs reason', $q$select procurement_transition_invoice_match('00000000-0000-0000-0000-0000000004e2','approved')$q$, 'PROC_REASON_REQUIRED%');
select pg_temp.t('inv4 reject needs reason', $q$select procurement_transition_invoice_match('00000000-0000-0000-0000-0000000004e2','rejected')$q$, 'PROC_REASON_REQUIRED%');
select pg_temp.t('inv5 other user approves invoice (closes PO)', $q$select procurement_transition_invoice_match('00000000-0000-0000-0000-0000000004e1','approved')$q$, null);
select pg_temp.t('inv6 approved invoice is terminal', $q$select procurement_transition_invoice_match('00000000-0000-0000-0000-0000000004e1','rejected','too late to reject')$q$, 'PROC_INVALID_TRANSITION%');
select pg_temp.as_pg();
select pg_temp.t_eq('inv7 PO closed', $q$select status from procurement_pos where id='00000000-0000-0000-0000-0000000000b5'$q$, 'closed');

-- ---------------------------------------------------------------- g) read-only and no-role users
select pg_temp.as_user('eb8f12ce-4a1a-4e2b-a963-88850a9ab1d2');   -- L5
select pg_temp.t_eq('g1 L5 can select PRs', $q$select (count(*) > 0)::text from procurement_prs$q$, 'true');
select pg_temp.t('g2 L5 cannot insert PR', $q$insert into procurement_prs (pr_number) values ('T-G2')$q$, 'new row violates row-level security%');
select pg_temp.t_rows('g2b L5 cannot update PR', $q$update procurement_prs set notes='x' where id='00000000-0000-0000-0000-0000000000a7'$q$, 0);
select pg_temp.t('g2c L5 cannot transition PR', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a7','submitted')$q$, 'PROC_FORBIDDEN%');
select pg_temp.as_user('3e0fcdce-3565-4636-aed4-44669c6567d1');   -- L4, no procurement role
select pg_temp.t_eq('g3 L4 sees 0 PRs', $q$select count(*)::text from procurement_prs$q$, '0');
select pg_temp.t_eq('g4 L4 sees 0 POs', $q$select count(*)::text from procurement_pos$q$, '0');
select pg_temp.t_eq('g5 L4 sees 0 suppliers', $q$select count(*)::text from procurement_suppliers$q$, '0');
select pg_temp.t_eq('g6 L4 sees 0 audit rows', $q$select count(*)::text from procurement_audit_log$q$, '0');
select pg_temp.t('g7 L4 cannot insert supplier', $q$insert into procurement_suppliers (supplier_code, supplier_name) values ('T-G7','x')$q$, 'new row violates row-level security%');
select pg_temp.t('g8 unauthenticated-style call refused', $q$select pg_temp.as_pg()$q$, null);
select pg_temp.t('g9 no JWT -> NOT_AUTHENTICATED', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a7','submitted')$q$, 'PROC_NOT_AUTHENTICATED%');

-- anon cannot execute
select pg_temp.as_pg();
select pg_temp.t_eq('x1 anon has no execute on transition fn', $q$select has_function_privilege('anon','procurement_transition_pr(uuid,text,text)','execute')::text$q$, 'false');
select pg_temp.t_eq('x2 authenticated has execute', $q$select has_function_privilege('authenticated','procurement_transition_pr(uuid,text,text)','execute')::text$q$, 'true');
select pg_temp.t_eq('x3 authenticated no execute on helper', $q$select has_function_privilege('authenticated','proc_check_sod(uuid,uuid,uuid,text)','execute')::text$q$, 'false');
select pg_temp.t_eq('x4 SK got po/supplier view', $q$select count(*)::text from role_permissions where role_code='SK' and module='procurement' and action in ('po','supplier') and view$q$, '2');

-- ======================= review-fix cases =======================
-- 1) provenance on insert
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rf1a insert PR with forged stamps (allowed, stamps cleared)', $q$insert into procurement_prs (id, pr_number, submitted_by, submitted_at, status_reason, status_changed_by, status_changed_at, budget_checked, budget_checked_by, budget_check_notes) values ('00000000-0000-0000-0000-0000000000f1','T-RF1','0b268e83-4c22-4f79-bf75-06154a7d496c', now(), 'forged', '0b268e83-4c22-4f79-bf75-06154a7d496c', now(), true, '0b268e83-4c22-4f79-bf75-06154a7d496c','forged')$q$, null);
select pg_temp.t('rf1b insert PO with forged stamps', $q$insert into procurement_pos (id, po_number, supplier_id, submitted_by, submitted_at, issued_date, status_reason, status_changed_by) values ('00000000-0000-0000-0000-0000000000f2','T-RF2','fa91ba30-5c9c-4576-95f4-85fe320e05ca','0b268e83-4c22-4f79-bf75-06154a7d496c', now(), current_date, 'forged', '0b268e83-4c22-4f79-bf75-06154a7d496c')$q$, null);
select pg_temp.t('rf1c insert RFQ with forged award fields', $q$insert into procurement_rfqs (id, rfq_number, award_reason, award_exception, award_overrides_recommendation, status_reason, status_changed_by) values ('00000000-0000-0000-0000-0000000000f3','T-RF3','forged','single_source', true, 'forged', '0b268e83-4c22-4f79-bf75-06154a7d496c')$q$, null);
select pg_temp.t('rf1d insert quotation with forged stamps', $q$insert into procurement_quotations (id, rfq_id, supplier_id, total_amount, status_reason, status_changed_by) values ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000f3','fa91ba30-5c9c-4576-95f4-85fe320e05ca',1,'forged','0b268e83-4c22-4f79-bf75-06154a7d496c')$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('rf1e PR stamps cleared', $q$select concat_ws('/', submitted_by, submitted_at, status_reason, status_changed_by, status_changed_at, budget_checked_by, budget_check_notes)||'/'||budget_checked::text||'/'||created_by::text from procurement_prs where id='00000000-0000-0000-0000-0000000000f1'$q$, '/false/1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t_eq('rf1f PO stamps cleared', $q$select concat_ws('/', submitted_by, submitted_at, issued_date, status_reason, status_changed_by) from procurement_pos where id='00000000-0000-0000-0000-0000000000f2'$q$, '');
select pg_temp.t_eq('rf1g RFQ award fields cleared', $q$select concat_ws('/', award_reason, award_exception, status_reason, status_changed_by)||'/'||award_overrides_recommendation::text from procurement_rfqs where id='00000000-0000-0000-0000-0000000000f3'$q$, '/false');
select pg_temp.t_eq('rf1h quotation stamps cleared', $q$select concat_ws('/', status_reason, status_changed_by) from procurement_quotations where id='00000000-0000-0000-0000-0000000000f4'$q$, '');

-- 2) invoice amounts computed by the database (AC role cannot read goods receipts)
select pg_temp.as_user('dadc8b39-f81a-427f-975e-c0191c234835');   -- AC + L4
select pg_temp.t('rf2a AC inserts invoice with forged amounts', $q$insert into procurement_invoice_matches (id, po_id, supplier_id, invoice_ref, invoice_date, invoice_amount, matched_po_amount, matched_gr_amount, variance_amount, status) values ('00000000-0000-0000-0000-0000000004e3','00000000-0000-0000-0000-0000000000b4','fa91ba30-5c9c-4576-95f4-85fe320e05ca','INV-3',current_date,20,999,999,0,'variance_detected')$q$, null);
select pg_temp.t('rf2b invoice over tolerance', $q$insert into procurement_invoice_matches (id, po_id, supplier_id, invoice_ref, invoice_date, invoice_amount, status) values ('00000000-0000-0000-0000-0000000004e4','00000000-0000-0000-0000-0000000000b5','fa91ba30-5c9c-4576-95f4-85fe320e05ca','INV-4',current_date,120,'matched')$q$, null);
select pg_temp.t_rows('rf2c tampering with variance on update ignored', $q$update procurement_invoice_matches set variance_amount = 0, matched_po_amount = 1 where id='00000000-0000-0000-0000-0000000004e4'$q$, 1);
select pg_temp.as_pg();
select pg_temp.t_eq('rf2d recomputed amounts + status (matched, gr=20)', $q$select concat_ws('/', matched_po_amount, matched_gr_amount, variance_amount, status) from procurement_invoice_matches where id='00000000-0000-0000-0000-0000000004e3'$q$, '20/20/0/matched');
select pg_temp.t_eq('rf2e variance beyond 2% -> variance_detected', $q$select concat_ws('/', matched_po_amount, variance_amount, status) from procurement_invoice_matches where id='00000000-0000-0000-0000-0000000004e4'$q$, '100/20/variance_detected');

-- 3) edit lock extended
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rf3a edit draft RFQ ok', $q$update procurement_rfqs set notes='ok' where id='00000000-0000-0000-0000-0000000000f3'$q$, null);
select pg_temp.t('rf3b edit non-draft RFQ locked', $q$update procurement_rfqs set notes='x' where id='00000000-0000-0000-0000-0000000000c1'$q$, 'PROC_LOCKED%');
select pg_temp.t_rows('rf3c quotation edit on awarded RFQ refused', $q$update procurement_quotations set evaluation_notes='x' where id='00000000-0000-0000-0000-0000000000d2'$q$, 0);
select pg_temp.t('rf3d quotation insert on awarded RFQ refused', $q$insert into procurement_quotations (rfq_id, supplier_id, total_amount) values ('00000000-0000-0000-0000-0000000000c2','fa91ba30-5c9c-4576-95f4-85fe320e05ca',1)$q$, 'new row violates row-level security%');
select pg_temp.t('rf3e quotation item insert on awarded RFQ refused', $q$insert into procurement_quotation_items (quotation_id, line_no, item_description, unit, quantity, unit_price, total) values ('00000000-0000-0000-0000-0000000000d2',2,'x','ea',1,1,1)$q$, 'new row violates row-level security%');
select pg_temp.t_rows('rf3f rfq_suppliers.responded on open RFQ ok', $q$update procurement_rfq_suppliers set responded = true where rfq_id='00000000-0000-0000-0000-0000000000c1'$q$, 1);
select pg_temp.t_rows('rf3g rfq_suppliers edit on awarded RFQ refused', $q$update procurement_rfq_suppliers set responded = true where rfq_id='00000000-0000-0000-0000-0000000000c2'$q$, 0);
select pg_temp.t('rf3h quotation insert on open RFQ ok', $q$insert into procurement_quotations (rfq_id, supplier_id, total_amount) values ('00000000-0000-0000-0000-0000000000c1','fa91ba30-5c9c-4576-95f4-85fe320e05ca',2)$q$, null);
select pg_temp.t('rf3i edit approved invoice match locked', $q$update procurement_invoice_matches set notes='x' where id='00000000-0000-0000-0000-0000000004e1'$q$, 'PROC_LOCKED%');
select pg_temp.t('rf3j edit open invoice match ok', $q$update procurement_invoice_matches set notes='x' where id='00000000-0000-0000-0000-0000000004e2'$q$, null);

-- 4) notifications
select pg_temp.t('rf4a client insert into notifications refused', $q$insert into procurement_notifications (record_type, record_id, event_type, title, message) values ('pr', gen_random_uuid(), 'pr_submitted', 't', 'm')$q$, 'new row violates row-level security%');
select pg_temp.as_pg();
create temp table nc as select count(*) n from procurement_notifications;
select pg_temp.as_user('1470d8fc-c1fe-4057-8dd1-5a78b27c4465');
select pg_temp.t('rf4b submit PR via function', $q$select procurement_transition_pr('00000000-0000-0000-0000-0000000000a7','submitted')$q$, null);
select pg_temp.as_pg();
select pg_temp.t_eq('rf4c transition created a notification', $q$select ((select count(*) from procurement_notifications) > (select n from nc))::text$q$, 'true');

-- 5) L5 / L6 read suppliers
select pg_temp.as_user('eb8f12ce-4a1a-4e2b-a963-88850a9ab1d2');
select pg_temp.t_eq('rf5a L5 reads suppliers', $q$select (count(*) > 0)::text from procurement_suppliers$q$, 'true');
select pg_temp.as_user('73c2d06c-6af7-414d-97a9-2658fe74243e');
select pg_temp.t_eq('rf5b L6 reads suppliers', $q$select (count(*) > 0)::text from procurement_suppliers$q$, 'true');
select pg_temp.t('rf5c L6 cannot insert supplier', $q$insert into procurement_suppliers (supplier_code, supplier_name) values ('T-RF5','x')$q$, 'new row violates row-level security%');

-- 6) trigger functions not executable
select pg_temp.as_pg();
select pg_temp.t_eq('rf6a proc_force_created_by not executable', $q$select has_function_privilege('authenticated','proc_force_created_by()','execute')::text$q$, 'false');
select pg_temp.t_eq('rf6b proc_edit_lock_guard not executable', $q$select has_function_privilege('anon','proc_edit_lock_guard()','execute')::text$q$, 'false');
select pg_temp.t_eq('rf6c proc_transition_guard not executable', $q$select has_function_privilege('authenticated','proc_transition_guard()','execute')::text$q$, 'false');
select pg_temp.t_eq('rf6d new trigger fns not executable', $q$select (has_function_privilege('authenticated','proc_insert_provenance_guard()','execute') or has_function_privilege('authenticated','proc_invoice_match_amounts()','execute'))::text$q$, 'false');

-- 7) confirm_budget input validation
select pg_temp.as_user('0b268e83-4c22-4f79-bf75-06154a7d496c');
select pg_temp.t('rf7a bad boolean', $q$select procurement_confirm_budget('00000000-0000-0000-0000-0000000000a6','{"registered_after_approved":"maybe"}'::jsonb,'[{"item_description":"i"}]'::jsonb)$q$, 'PROC_VALIDATION%');
select pg_temp.t('rf7b bad numeric', $q$select procurement_confirm_budget('00000000-0000-0000-0000-0000000000a6','{"bc_title":"t"}'::jsonb,'[{"item_description":"i","estimated_amount":"abc"}]'::jsonb)$q$, 'PROC_VALIDATION%');
select pg_temp.t('rf7c bad bc_type', $q$select procurement_confirm_budget('00000000-0000-0000-0000-0000000000a6','{"bc_type":"ZZZ"}'::jsonb,'[{"item_description":"i"}]'::jsonb)$q$, 'PROC_VALIDATION%');
select pg_temp.t('rf7d bad uuid in items', $q$select procurement_confirm_budget('00000000-0000-0000-0000-0000000000a6','{"bc_title":"t"}'::jsonb,'[{"item_description":"i","pr_item_id":"nope"}]'::jsonb)$q$, 'PROC_VALIDATION%');
select pg_temp.t('rf7e bad date', $q$select procurement_confirm_budget('00000000-0000-0000-0000-0000000000a6','{"bc_title":"t"}'::jsonb,'[{"item_description":"i"}]'::jsonb) where false$q$, null);

select pg_temp.as_pg();
select name, case when ok then 'PASS' else 'FAIL' end as result, case when ok then '' else detail end as detail from res order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from res;
rollback;
