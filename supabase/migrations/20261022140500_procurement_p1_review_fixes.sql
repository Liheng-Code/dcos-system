-- Migration: 20261022140500_procurement_p1_review_fixes.sql
-- Purpose: Code-review fixes on the Procurement P1 hardening (20261022130910/11 and 20261022134300).
--   1. Provenance on insert: client inserts cannot pre-fill approval/submission/award/status stamps.
--   2. Invoice match amounts are computed by the database (matched_po_amount, matched_gr_amount, variance_amount, status on insert).
--   3. Edit lock extended: RFQs, quotations, quotation items, RFQ suppliers, invoice matches.
--   4. procurement_notifications: no client insert (the notify triggers are security definer).
--   5. L5 and L6 can read suppliers.
--   6. Trigger functions are not executable by clients.
--   7. procurement_confirm_budget turns bad input into PROC_VALIDATION.
-- Additive and idempotent. No tenant_id in this system.
--
-- Known P2 gaps (not fixed here, tracked on purpose):
--   * Supplier PQ status, blacklist and other supplier master fields are directly writable by anyone with
--     supplier.edit (review item 4).
--   * Goods receipts and PO revisions are not append-only (update is allowed by goods_receipt.edit / po.edit).
--   * Over-receipt is not capped (accepted quantity can exceed the ordered quantity).
--   * PR override approve has no higher-level approval (FR-05, proc.budget.override, AAL3).
--   * No SoD exception register (doc 07 section 8); admins are bound by SoD.
--   * Value bands (BR-05), sealed bids (BR-07), server numbering, award override minimum 50, PQ eligibility.
--   * Invoice match status is only computed on insert (an amount edit while pending/matched recomputes the
--     amounts but not the status).

-- ---------------------------------------------------------------------------
-- 1. Provenance on insert
-- ---------------------------------------------------------------------------
create or replace function public.proc_insert_provenance_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and coalesce(current_setting('dcos.proc_transition', true), '') <> 'on' then
    -- Keys that don't exist on this table are ignored by jsonb_populate_record.
    new := jsonb_populate_record(new, jsonb_build_object(
      'submitted_by', null, 'submitted_at', null,
      'status_reason', null, 'status_changed_by', null, 'status_changed_at', null,
      'approved_by', null, 'approved_at', null,
      'issued_by', null, 'issued_date', null,
      'budget_checked', false, 'budget_checked_by', null, 'budget_check_notes', null, 'budget_confirmation_id', null,
      'awarded_supplier_id', null, 'awarded_by', null, 'awarded_at', null, 'award_reason', null,
      'award_exception', null, 'award_overrides_recommendation', false,
      'recommended_supplier_id', null, 'recommended_quotation_id', null,
      'is_awarded', false));
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['procurement_prs','procurement_pos','procurement_rfqs','procurement_quotations','procurement_invoice_matches'] loop
    execute format('drop trigger if exists trg_proc_insert_provenance on public.%I', t);
    execute format('create trigger trg_proc_insert_provenance before insert on public.%I
                    for each row execute function public.proc_insert_provenance_guard()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Invoice match amounts (mirrors invoice-match-form.tsx)
-- ---------------------------------------------------------------------------
create or replace function public.proc_invoice_match_amounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po_amt numeric;
  v_gr_amt numeric;
begin
  if tg_op = 'UPDATE'
     and new.po_id = old.po_id and new.invoice_amount is not distinct from old.invoice_amount then
    -- nothing that feeds the amounts changed: keep the stored values, whatever the client sent
    new.matched_po_amount := old.matched_po_amount;
    new.matched_gr_amount := old.matched_gr_amount;
    new.variance_amount   := old.variance_amount;
    return new;
  end if;

  select coalesce(grand_total, total_amount, 0) into v_po_amt
    from public.procurement_pos where id = new.po_id;
  select coalesce(sum(g.quantity_accepted * pi.unit_price), 0) into v_gr_amt
    from public.procurement_goods_receipts g
    join public.procurement_po_items pi on pi.id = g.po_item_id
   where pi.po_id = new.po_id;

  new.matched_po_amount := coalesce(v_po_amt, 0);
  new.matched_gr_amount := v_gr_amt;
  new.variance_amount   := new.invoice_amount - coalesce(v_po_amt, 0);

  if tg_op = 'INSERT' and new.status in ('matched', 'variance_detected') then
    new.status := case when abs(new.variance_amount) > coalesce(v_po_amt, 0) * 0.02
                       then 'variance_detected' else 'matched' end;
  end if;
  return new;
end $$;

drop trigger if exists trg_proc_0_invoice_amounts on public.procurement_invoice_matches;
create trigger trg_proc_0_invoice_amounts
  before insert or update on public.procurement_invoice_matches
  for each row execute function public.proc_invoice_match_amounts();

-- ---------------------------------------------------------------------------
-- 3. Edit lock extended
-- ---------------------------------------------------------------------------
create or replace function public.proc_edit_lock_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_open   boolean;
begin
  if coalesce(current_setting('dcos.proc_transition', true), '') = 'on' then
    return new;
  end if;

  if tg_table_name = 'procurement_prs' then
    v_status := old.approval_status;
    v_open   := v_status in ('draft', 'returned');
  elsif tg_table_name = 'procurement_pos' or tg_table_name = 'procurement_rfqs' then
    v_status := old.status;
    v_open   := v_status = 'draft';
  elsif tg_table_name = 'procurement_invoice_matches' then
    v_status := old.status;
    v_open   := v_status in ('pending', 'matched', 'variance_detected');
  else
    return new;
  end if;

  if not v_open and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    raise exception 'PROC_LOCKED: % is % and can no longer be edited', tg_table_name, v_status
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_proc_zz_edit_lock_guard on public.procurement_rfqs;
create trigger trg_proc_zz_edit_lock_guard before update on public.procurement_rfqs
  for each row execute function public.proc_edit_lock_guard();
drop trigger if exists trg_proc_zz_edit_lock_guard on public.procurement_invoice_matches;
create trigger trg_proc_zz_edit_lock_guard before update on public.procurement_invoice_matches
  for each row execute function public.proc_edit_lock_guard();

-- Quotations, quotation items, RFQ suppliers: writable only while the parent RFQ is still open
-- (not awarded / rejected_all / cancelled). rfq-detail sets responded = true on rfq_suppliers while
-- the RFQ is issued or quotations_received, which stays allowed.
drop policy if exists proc_procurement_quotations_insert on public.procurement_quotations;
drop policy if exists proc_procurement_quotations_update on public.procurement_quotations;
create policy proc_procurement_quotations_insert on public.procurement_quotations
  for insert to authenticated
  with check (
    (select public.has_permission('procurement', 'rfq', 'can_create'))
    and status = 'pending'
    and not coalesce(is_awarded, false)
    and technical_score is null and commercial_score is null and combined_score is null
    and exists (select 1 from public.procurement_rfqs r
                 where r.id = rfq_id and r.status not in ('awarded', 'rejected_all', 'cancelled'))
  );
create policy proc_procurement_quotations_update on public.procurement_quotations
  for update to authenticated
  using (
    (select public.has_permission('procurement', 'rfq', 'edit'))
    and exists (select 1 from public.procurement_rfqs r
                 where r.id = rfq_id and r.status not in ('awarded', 'rejected_all', 'cancelled'))
  )
  with check (
    exists (select 1 from public.procurement_rfqs r
             where r.id = rfq_id and r.status not in ('awarded', 'rejected_all', 'cancelled'))
  );

drop policy if exists proc_procurement_quotation_items_insert on public.procurement_quotation_items;
drop policy if exists proc_procurement_quotation_items_update on public.procurement_quotation_items;
create policy proc_procurement_quotation_items_insert on public.procurement_quotation_items
  for insert to authenticated
  with check (
    (select public.has_permission('procurement', 'rfq', 'can_create'))
    and exists (select 1 from public.procurement_quotations q
                  join public.procurement_rfqs r on r.id = q.rfq_id
                 where q.id = quotation_id and r.status not in ('awarded', 'rejected_all', 'cancelled'))
  );
create policy proc_procurement_quotation_items_update on public.procurement_quotation_items
  for update to authenticated
  using (
    (select public.has_permission('procurement', 'rfq', 'edit'))
    and exists (select 1 from public.procurement_quotations q
                  join public.procurement_rfqs r on r.id = q.rfq_id
                 where q.id = quotation_id and r.status not in ('awarded', 'rejected_all', 'cancelled'))
  )
  with check (
    exists (select 1 from public.procurement_quotations q
              join public.procurement_rfqs r on r.id = q.rfq_id
             where q.id = quotation_id and r.status not in ('awarded', 'rejected_all', 'cancelled'))
  );

drop policy if exists proc_procurement_rfq_suppliers_insert on public.procurement_rfq_suppliers;
drop policy if exists proc_procurement_rfq_suppliers_update on public.procurement_rfq_suppliers;
create policy proc_procurement_rfq_suppliers_insert on public.procurement_rfq_suppliers
  for insert to authenticated
  with check (
    (select public.has_permission('procurement', 'rfq', 'can_create'))
    and exists (select 1 from public.procurement_rfqs r
                 where r.id = rfq_id and r.status not in ('awarded', 'rejected_all', 'cancelled'))
  );
create policy proc_procurement_rfq_suppliers_update on public.procurement_rfq_suppliers
  for update to authenticated
  using (
    (select public.has_permission('procurement', 'rfq', 'edit'))
    and exists (select 1 from public.procurement_rfqs r
                 where r.id = rfq_id and r.status not in ('awarded', 'rejected_all', 'cancelled'))
  )
  with check (
    exists (select 1 from public.procurement_rfqs r
             where r.id = rfq_id and r.status not in ('awarded', 'rejected_all', 'cancelled'))
  );

-- ---------------------------------------------------------------------------
-- 4. Notifications: written only by the security definer notify triggers
-- ---------------------------------------------------------------------------
drop policy if exists "Trigger can insert notifications" on public.procurement_notifications;

-- ---------------------------------------------------------------------------
-- 5. L5 and L6 read access to suppliers (additive; other flags untouched)
-- ---------------------------------------------------------------------------
insert into public.role_permissions (role_code, module, action, view, scope)
select r.code, 'procurement', 'supplier', true,
       case r.code when 'L5' then 'department' else 'own' end
  from public.roles r
 where r.code in ('L5', 'L6')
on conflict (role_code, module, action) do update set view = true;

-- ---------------------------------------------------------------------------
-- 6. Trigger functions are not callable by clients
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'proc_force_created_by()', 'proc_edit_lock_guard()', 'proc_transition_guard()',
    'proc_insert_provenance_guard()', 'proc_invoice_match_amounts()', 'proc_invoice_match_after_insert()',
    'proc_audit_trigger()', 'proc_notify_pr_status_change()', 'proc_notify_po_status_change()',
    'proc_notify_invoice_event()', 'proc_notify_gr_event()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. procurement_confirm_budget: bad input raises PROC_VALIDATION instead of a raw cast error
-- ---------------------------------------------------------------------------
create or replace function public.procurement_confirm_budget(p_pr_id uuid, p_header jsonb, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := public.proc_require_user();
  v_pr     public.procurement_prs%rowtype;
  v_bc     uuid;
  v_number text;
  v_pos    text;
  v_title  text;
begin
  select * into v_pr from public.procurement_prs where id = p_pr_id for update;
  if not found then
    raise exception 'PROC_NOT_FOUND: purchase requisition not found' using errcode = 'P0001';
  end if;
  if v_pr.approval_status <> 'under_budget_review' then
    raise exception 'PROC_INVALID_TRANSITION: a PR in status % cannot be budget-confirmed', v_pr.approval_status
      using errcode = 'P0001';
  end if;
  perform public.proc_require_permission('pr', 'approve');
  perform public.proc_check_sod(v_uid, coalesce(v_pr.created_by, v_pr.requested_by), v_pr.submitted_by, 'purchase requisition');

  begin
  if p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception 'PROC_VALIDATION: p_header must be a JSON object' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'PROC_VALIDATION: p_items must be a non-empty JSON array' using errcode = 'P0001';
  end if;
  if exists (
       select 1 from jsonb_array_elements(p_items) e
        where nullif(btrim(coalesce(e ->> 'item_description', '')), '') is null
           or (nullif(e ->> 'pr_item_id', '') is not null
               and not exists (select 1 from public.procurement_pr_items i
                                where i.id = (e ->> 'pr_item_id')::uuid and i.pr_id = p_pr_id))
     ) then
    raise exception 'PROC_VALIDATION: every item needs a description and must belong to this PR'
      using errcode = 'P0001';
  end if;

  v_number := nullif(btrim(coalesce(p_header ->> 'bc_number', '')), '');
  if v_number is null then
    v_number := 'BC-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  end if;
  v_pos   := nullif(btrim(coalesce(p_header ->> 'signatory_position', '')), '');
  v_title := nullif(btrim(coalesce(p_header ->> 'bc_title', '')), '');

  insert into public.procurement_budget_confirmations (
    bc_number, pr_id, project_id, to_name, to_role, cc, bc_title, bc_type, ai_ref_no,
    registered_after_approved, signature_pic,
    reason_design_defect, reason_design_missing, reason_design_change_vo, reason_change_order,
    reason_design_change_no_cost, reason_design_change_mgmt_no_cost, reason_other,
    budget_status, reason_over_budget,
    attachment_detail_comparison, attachment_quotation, attachment_detail_budget, attachment_drawing, attachment_other,
    prepared_by, prepared_by_position, prepared_at,
    verified_by, verified_by_position, verified_at,
    approved_by, approved_by_position, approved_at,
    created_by, status_changed_by, status_changed_at
  ) values (
    v_number, p_pr_id, v_pr.project_id,
    nullif(p_header ->> 'to_name', ''), nullif(p_header ->> 'to_role', ''), nullif(p_header ->> 'cc', ''),
    v_title, nullif(p_header ->> 'bc_type', ''), nullif(p_header ->> 'ai_ref_no', ''),
    coalesce((p_header ->> 'registered_after_approved')::boolean, false), nullif(p_header ->> 'signature_pic', ''),
    coalesce((p_header ->> 'reason_design_defect')::boolean, false),
    coalesce((p_header ->> 'reason_design_missing')::boolean, false),
    coalesce((p_header ->> 'reason_design_change_vo')::boolean, false),
    coalesce((p_header ->> 'reason_change_order')::boolean, false),
    coalesce((p_header ->> 'reason_design_change_no_cost')::boolean, false),
    coalesce((p_header ->> 'reason_design_change_mgmt_no_cost')::boolean, false),
    nullif(p_header ->> 'reason_other', ''),
    nullif(p_header ->> 'budget_status', ''), nullif(p_header ->> 'reason_over_budget', ''),
    coalesce((p_header ->> 'attachment_detail_comparison')::boolean, false),
    coalesce((p_header ->> 'attachment_quotation')::boolean, false),
    coalesce((p_header ->> 'attachment_detail_budget')::boolean, false),
    coalesce((p_header ->> 'attachment_drawing')::boolean, false),
    nullif(p_header ->> 'attachment_other', ''),
    v_pr.requested_by, coalesce(nullif(p_header ->> 'prepared_by_position', ''), 'Requester'), v_pr.preparation_date,
    v_uid, coalesce(nullif(p_header ->> 'verified_by_position', ''), v_pos), current_date,
    v_uid, coalesce(nullif(p_header ->> 'approved_by_position', ''), v_pos), current_date,
    v_uid, v_uid, now()
  ) returning id into v_bc;

  insert into public.procurement_budget_confirmation_items (
    bc_id, pr_item_id, line_no, budget_code, item_description,
    contract_target_budget, estimated_amount, remaining_work_amount
  )
  select v_bc,
         nullif(e ->> 'pr_item_id', '')::uuid,
         coalesce(nullif(e ->> 'line_no', '')::integer, n::integer),
         nullif(e ->> 'budget_code', ''),
         btrim(e ->> 'item_description'),
         nullif(e ->> 'contract_target_budget', '')::numeric,
         nullif(e ->> 'estimated_amount', '')::numeric,
         nullif(e ->> 'remaining_work_amount', '')::numeric
    from jsonb_array_elements(p_items) with ordinality as t(e, n)
   order by n;

  perform set_config('dcos.proc_transition', 'on', true);
  update public.procurement_prs
     set approval_status        = 'approved',
         approved_by            = v_uid,
         approved_at            = now(),
         budget_checked         = true,
         budget_checked_by      = v_uid,
         budget_check_notes     = v_title,
         budget_confirmation_id = v_bc,
         status_reason          = null,
         status_changed_by      = v_uid,
         status_changed_at      = now(),
         updated_at             = now()
   where id = p_pr_id;
  perform set_config('dcos.proc_transition', 'off', true);

  exception
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
      or numeric_value_out_of_range or invalid_parameter_value or check_violation
      or not_null_violation or foreign_key_violation or unique_violation then
      raise exception 'PROC_VALIDATION: invalid input: %', sqlerrm using errcode = 'P0001';
  end;

  return v_bc;
end $$;
