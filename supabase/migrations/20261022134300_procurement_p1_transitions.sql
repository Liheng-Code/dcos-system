-- Migration: 20261022134300_procurement_p1_transitions.sql
-- Purpose: Procurement hardening P1, part 2 (doc 13 section 4.2).
--   * proc_transition_guard: status / approval / award / author columns can only change inside the
--     transition functions below (dcos.proc_transition = 'on'), never by a direct client update.
--   * Security definer transition functions with permission checks, compare-and-set on the current state,
--     reasons, and segregation of duties (BR-18; admins are bound too, Decision 4).
--   * procurement_award_rfq becomes security definer (checks unchanged).
--   * procurement_sync_po_delivery derives PO delivery state from goods receipts server-side.
--   * Invoice match insert moves the PO to under_invoice_match (definer trigger).
-- Depends on: 20261022130911_procurement_p1_rls.sql (columns), has_permission(), procurement_* tables
-- Additive and idempotent. No tenant_id in this system.
--
-- Error contract: every failure is `raise exception 'PROC_<CODE>: <text>' using errcode = 'P0001'`.
--   PROC_NOT_AUTHENTICATED, PROC_NOT_FOUND, PROC_INVALID_TRANSITION, PROC_FORBIDDEN, PROC_SOD_VIOLATION,
--   PROC_REASON_REQUIRED, PROC_REASON_TOO_SHORT, PROC_VALIDATION, PROC_TRANSITION_RPC_ONLY (guard), PROC_LOCKED (edit lock).
--
-- Known gaps, deferred to P2 (not forgotten):
--   * PR "override approve" (submitted -> approved) is not yet gated by a higher-level approval
--     (FR-05, proc.budget.override, AAL3).
--   * The SoD exception register (doc 07 section 8) is not implemented: admins are bound by SoD too.
--   * Approval value bands (BR-05), sealed bids (BR-07), server numbering, award override minimum 50.

-- ---------------------------------------------------------------------------
-- 1. Guard trigger
-- ---------------------------------------------------------------------------
create or replace function public.proc_transition_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if coalesce(current_setting('dcos.proc_transition', true), '') = 'on' then
    return new;
  end if;
  foreach c in array array[
    'status', 'approval_status', 'approved_by', 'approved_at', 'is_awarded',
    'awarded_supplier_id', 'awarded_by', 'awarded_at', 'award_reason', 'award_exception',
    'award_overrides_recommendation', 'recommended_supplier_id', 'recommended_quotation_id',
    'verified_by', 'created_by', 'submitted_by', 'submitted_at', 'issued_by', 'issued_date',
    'budget_checked', 'budget_checked_by', 'budget_confirmation_id',
    'status_reason', 'status_changed_by', 'status_changed_at',
    'technical_score', 'commercial_score', 'combined_score'
  ] loop
    if n -> c is distinct from o -> c then
      raise exception 'PROC_TRANSITION_RPC_ONLY: change % status through its procurement function', tg_table_name
        using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'procurement_prs','procurement_pos','procurement_budget_confirmations',
    'procurement_invoice_matches','procurement_rfqs','procurement_quotations'
  ] loop
    execute format('drop trigger if exists trg_proc_a_transition_guard on public.%I', t);
    execute format('create trigger trg_proc_a_transition_guard before update on public.%I
                    for each row execute function public.proc_transition_guard()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------
create or replace function public.proc_require_user()
returns uuid
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'PROC_NOT_AUTHENTICATED: sign in to continue' using errcode = 'P0001';
  end if;
  return auth.uid();
end $$;

create or replace function public.proc_require_permission(p_action text, p_field text)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not public.has_permission('procurement', p_action, p_field) then
    raise exception 'PROC_FORBIDDEN: you do not have % permission on procurement %', p_field, p_action
      using errcode = 'P0001';
  end if;
end $$;

-- Returns the trimmed reason (null when blank). Raises when required and missing / shorter than p_min.
create or replace function public.proc_clean_reason(p_reason text, p_required boolean, p_min integer default 1)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_required then
    if v is null then
      raise exception 'PROC_REASON_REQUIRED: a reason is required for this action' using errcode = 'P0001';
    end if;
    if length(v) < p_min then
      raise exception 'PROC_REASON_TOO_SHORT: the reason must be at least % characters', p_min
        using errcode = 'P0001';
    end if;
  end if;
  return v;
end $$;

-- Segregation of duties (BR-18): the actor may be neither the author nor the submitter.
-- A null author/submitter (legacy rows, Decision 3) cannot be compared and is skipped.
create or replace function public.proc_check_sod(p_actor uuid, p_creator uuid, p_submitter uuid, p_what text)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_creator is not null and p_actor = p_creator then
    raise exception 'PROC_SOD_VIOLATION: you created this %, so you cannot approve it', p_what
      using errcode = 'P0001';
  end if;
  if p_submitter is not null and p_actor = p_submitter then
    raise exception 'PROC_SOD_VIOLATION: you submitted this %, so you cannot approve it', p_what
      using errcode = 'P0001';
  end if;
end $$;

revoke all on function public.proc_require_user()                           from public, anon, authenticated;
revoke all on function public.proc_require_permission(text, text)           from public, anon, authenticated;
revoke all on function public.proc_clean_reason(text, boolean, integer)     from public, anon, authenticated;
revoke all on function public.proc_check_sod(uuid, uuid, uuid, text)        from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. PR transitions
-- ---------------------------------------------------------------------------
create or replace function public.procurement_transition_pr(p_id uuid, p_to text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := public.proc_require_user();
  v_pr      public.procurement_prs%rowtype;
  v_from    text;
  v_field   text;
  v_need    boolean := false;
  v_min     integer := 1;
  v_sod     boolean := false;
  v_reason  text;
  v_stored  text;
begin
  select * into v_pr from public.procurement_prs where id = p_id for update;
  if not found then
    raise exception 'PROC_NOT_FOUND: purchase requisition not found' using errcode = 'P0001';
  end if;
  v_from := v_pr.approval_status;

  if    v_from in ('draft', 'returned') and p_to = 'submitted' then
    v_field := 'submit';
  elsif v_from = 'submitted' and p_to = 'under_budget_review' then
    v_field := 'approve';
  elsif v_from = 'submitted' and p_to = 'approved' then
    -- Override approve. Gap (P2): higher-level approval (FR-05, proc.budget.override, AAL3) not enforced yet.
    v_field := 'approve'; v_sod := true; v_need := true; v_min := 20;
  elsif v_from in ('submitted', 'under_budget_review') and p_to in ('returned', 'rejected') then
    v_field := 'reject'; v_need := true;
  elsif v_from in ('draft', 'returned', 'submitted', 'under_budget_review') and p_to = 'cancelled' then
    v_field := 'edit'; v_need := true;
  elsif v_from = 'approved' and p_to = 'closed' then
    v_field := 'edit';
  else
    raise exception 'PROC_INVALID_TRANSITION: a PR in status % cannot move to %', v_from, coalesce(p_to, 'null')
      using errcode = 'P0001';
  end if;

  perform public.proc_require_permission('pr', v_field);
  v_reason := public.proc_clean_reason(p_reason, v_need, v_min);
  if v_sod then
    perform public.proc_check_sod(v_uid, coalesce(v_pr.created_by, v_pr.requested_by), v_pr.submitted_by, 'purchase requisition');
  end if;
  v_stored := case when v_sod then 'OVERRIDE: ' || v_reason else v_reason end;

  perform set_config('dcos.proc_transition', 'on', true);
  update public.procurement_prs
     set approval_status    = p_to,
         submitted_by       = case when p_to = 'submitted' then v_uid else submitted_by end,
         submitted_at       = case when p_to = 'submitted' then now() else submitted_at end,
         approved_by        = case when p_to = 'approved' then v_uid else approved_by end,
         approved_at        = case when p_to = 'approved' then now() else approved_at end,
         status_reason      = v_stored,
         status_changed_by  = v_uid,
         status_changed_at  = now(),
         updated_at         = now()
   where id = p_id;
  perform set_config('dcos.proc_transition', 'off', true);

  return jsonb_build_object('id', p_id, 'from', v_from, 'to', p_to);
end $$;

-- Budget confirmation: creates the BC + items and approves the PR in one atomic call.
-- p_header: BC column names as keys (bc_number, bc_title, bc_type, to_name, to_role, cc, ai_ref_no,
--   registered_after_approved, signature_pic, reason_* flags, reason_other, budget_status, reason_over_budget,
--   attachment_* flags, attachment_other, verified_by_position, approved_by_position, prepared_by_position),
--   plus optional signatory_position used for both positions when they are not given.
-- p_items: array of {pr_item_id, line_no, budget_code, item_description, contract_target_budget,
--   estimated_amount, remaining_work_amount}.
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

  return v_bc;
end $$;

-- ---------------------------------------------------------------------------
-- 4. PO transitions + delivery sync
-- ---------------------------------------------------------------------------
create or replace function public.procurement_transition_po(p_id uuid, p_to text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := public.proc_require_user();
  v_po      public.procurement_pos%rowtype;
  v_from    text;
  v_field   text;
  v_need    boolean := false;
  v_sod     boolean := false;
  v_reason  text;
begin
  select * into v_po from public.procurement_pos where id = p_id for update;
  if not found then
    raise exception 'PROC_NOT_FOUND: purchase order not found' using errcode = 'P0001';
  end if;
  v_from := v_po.status;

  if    v_from = 'draft' and p_to = 'submitted' then
    v_field := 'submit';
  elsif v_from = 'submitted' and p_to = 'approved' then
    v_field := 'approve'; v_sod := true;
  elsif v_from = 'approved' and p_to = 'issued' then
    v_field := 'submit';
  elsif v_from = 'submitted' and p_to = 'draft' then
    -- reject = return to the preparer
    v_field := 'reject'; v_need := true;
  elsif v_from in ('draft', 'submitted', 'approved') and p_to = 'cancelled' then
    v_field := 'edit'; v_need := true;
  elsif v_from in ('delivered', 'under_invoice_match') and p_to = 'closed' then
    v_field := 'edit';
  else
    raise exception 'PROC_INVALID_TRANSITION: a PO in status % cannot move to %', v_from, coalesce(p_to, 'null')
      using errcode = 'P0001';
  end if;

  perform public.proc_require_permission('po', v_field);
  v_reason := public.proc_clean_reason(p_reason, v_need);
  if v_sod then
    perform public.proc_check_sod(v_uid, v_po.created_by, v_po.submitted_by, 'purchase order');
  end if;

  perform set_config('dcos.proc_transition', 'on', true);
  update public.procurement_pos
     set status            = p_to,
         submitted_by      = case when p_to = 'submitted' then v_uid else submitted_by end,
         submitted_at      = case when p_to = 'submitted' then now() else submitted_at end,
         approved_by       = case when p_to = 'approved' then v_uid else approved_by end,
         approved_at       = case when p_to = 'approved' then now() else approved_at end,
         issued_by         = case when p_to = 'issued' then v_uid else issued_by end,
         issued_date       = case when p_to = 'issued' then current_date else issued_date end,
         status_reason     = v_reason,
         status_changed_by = v_uid,
         status_changed_at = now(),
         updated_at        = now()
   where id = p_id;
  perform set_config('dcos.proc_transition', 'off', true);

  return jsonb_build_object('id', p_id, 'from', v_from, 'to', p_to);
end $$;

-- Recomputes received quantities from the goods receipts and derives the PO delivery state.
-- Mirrors goods-receipt-form.tsx: delivered when accepted >= ordered over all lines, else partially_delivered.
-- Returns the PO status after the sync.
create or replace function public.procurement_sync_po_delivery(p_po_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := public.proc_require_user();
  v_po        public.procurement_pos%rowtype;
  v_ordered   numeric;
  v_accepted  numeric;
  v_new       text;
begin
  perform public.proc_require_permission('goods_receipt', 'can_create');

  select * into v_po from public.procurement_pos where id = p_po_id for update;
  if not found then
    raise exception 'PROC_NOT_FOUND: purchase order not found' using errcode = 'P0001';
  end if;
  if v_po.status not in ('issued', 'partially_delivered', 'delivered', 'under_invoice_match', 'closed') then
    raise exception 'PROC_INVALID_TRANSITION: a PO in status % cannot receive goods', v_po.status
      using errcode = 'P0001';
  end if;

  update public.procurement_po_items pi
     set quantity_delivered = s.acc,
         quantity_accepted  = s.acc
    from (
      select i.id, coalesce(sum(g.quantity_accepted), 0) as acc
        from public.procurement_po_items i
        left join public.procurement_goods_receipts g on g.po_item_id = i.id
       where i.po_id = p_po_id
       group by i.id
    ) s
   where pi.id = s.id
     and (pi.quantity_delivered is distinct from s.acc or pi.quantity_accepted is distinct from s.acc);

  select coalesce(sum(quantity_ordered), 0), coalesce(sum(quantity_delivered), 0)
    into v_ordered, v_accepted
    from public.procurement_po_items
   where po_id = p_po_id and item_type = 'line';

  v_new := v_po.status;
  if v_po.status in ('issued', 'partially_delivered', 'delivered') and v_accepted > 0 then
    v_new := case when v_accepted >= v_ordered then 'delivered' else 'partially_delivered' end;
  end if;

  if v_new <> v_po.status then
    perform set_config('dcos.proc_transition', 'on', true);
    update public.procurement_pos
       set status = v_new, status_reason = null, status_changed_by = v_uid, status_changed_at = now(), updated_at = now()
     where id = p_po_id;
    perform set_config('dcos.proc_transition', 'off', true);
  end if;
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Invoice matches
-- ---------------------------------------------------------------------------
-- A new invoice match moves a delivered / partially delivered PO to under_invoice_match.
create or replace function public.proc_invoice_match_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('dcos.proc_transition', 'on', true);
  update public.procurement_pos
     set status = 'under_invoice_match', status_reason = null,
         status_changed_by = auth.uid(), status_changed_at = now(), updated_at = now()
   where id = new.po_id and status in ('delivered', 'partially_delivered');
  perform set_config('dcos.proc_transition', 'off', true);
  return new;
end $$;

drop trigger if exists trg_proc_invoice_match_po_state on public.procurement_invoice_matches;
create trigger trg_proc_invoice_match_po_state
  after insert on public.procurement_invoice_matches
  for each row execute function public.proc_invoice_match_after_insert();

create or replace function public.procurement_transition_invoice_match(p_id uuid, p_to text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := public.proc_require_user();
  v_m         public.procurement_invoice_matches%rowtype;
  v_from      text;
  v_reason    text;
  v_variance  text;
  v_po_closed boolean := false;
begin
  select * into v_m from public.procurement_invoice_matches where id = p_id for update;
  if not found then
    raise exception 'PROC_NOT_FOUND: invoice match not found' using errcode = 'P0001';
  end if;
  v_from := v_m.status;
  if v_from not in ('pending', 'matched', 'variance_detected') or p_to not in ('approved', 'rejected') then
    raise exception 'PROC_INVALID_TRANSITION: an invoice match in status % cannot move to %', v_from, coalesce(p_to, 'null')
      using errcode = 'P0001';
  end if;

  if p_to = 'approved' then
    perform public.proc_require_permission('invoice', 'approve');
    perform public.proc_check_sod(v_uid, v_m.created_by, null, 'invoice match');
    v_reason := public.proc_clean_reason(p_reason, false);
    if coalesce(v_m.variance_amount, 0) <> 0 then
      v_variance := coalesce(v_reason, nullif(btrim(coalesce(v_m.variance_reason, '')), ''));
      if v_variance is null then
        raise exception 'PROC_REASON_REQUIRED: a variance explanation is required before approving'
          using errcode = 'P0001';
      end if;
    else
      v_variance := v_m.variance_reason;
    end if;

    perform set_config('dcos.proc_transition', 'on', true);
    update public.procurement_invoice_matches
       set status = 'approved', approved_by = v_uid, approved_at = now(),
           variance_reason = v_variance, status_reason = v_reason,
           status_changed_by = v_uid, status_changed_at = now(), updated_at = now()
     where id = p_id;
    update public.procurement_pos
       set status = 'closed', status_reason = null,
           status_changed_by = v_uid, status_changed_at = now(), updated_at = now()
     where id = v_m.po_id and status in ('delivered', 'under_invoice_match');
    v_po_closed := found;
    perform set_config('dcos.proc_transition', 'off', true);
  else
    perform public.proc_require_permission('invoice', 'reject');
    v_reason := public.proc_clean_reason(p_reason, true);

    perform set_config('dcos.proc_transition', 'on', true);
    update public.procurement_invoice_matches
       set status = 'rejected', variance_reason = v_reason, status_reason = v_reason,
           status_changed_by = v_uid, status_changed_at = now(), updated_at = now()
     where id = p_id;
    perform set_config('dcos.proc_transition', 'off', true);
  end if;

  return jsonb_build_object('id', p_id, 'from', v_from, 'to', p_to, 'po_closed', v_po_closed);
end $$;

-- ---------------------------------------------------------------------------
-- 6. RFQ transitions + quotation scoring
-- ---------------------------------------------------------------------------
create or replace function public.procurement_transition_rfq(p_id uuid, p_to text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := public.proc_require_user();
  v_rfq     public.procurement_rfqs%rowtype;
  v_from    text;
  v_field   text;
  v_need    boolean := false;
  v_reason  text;
begin
  select * into v_rfq from public.procurement_rfqs where id = p_id for update;
  if not found then
    raise exception 'PROC_NOT_FOUND: RFQ not found' using errcode = 'P0001';
  end if;
  v_from := v_rfq.status;

  if p_to = 'awarded' then
    raise exception 'PROC_INVALID_TRANSITION: an RFQ can only be awarded through procurement_award_rfq'
      using errcode = 'P0001';
  elsif v_from = 'draft' and p_to = 'issued' then
    v_field := 'submit';
  elsif v_from = 'issued' and p_to = 'quotations_received' then
    v_field := 'edit';
  elsif v_from = 'quotations_received' and p_to = 'under_evaluation' then
    v_field := 'edit';
  elsif v_from in ('draft', 'issued', 'quotations_received', 'under_evaluation') and p_to = 'cancelled' then
    v_field := 'edit'; v_need := true;
  elsif v_from in ('issued', 'quotations_received', 'under_evaluation') and p_to = 'rejected_all' then
    v_field := 'reject'; v_need := true;
  else
    raise exception 'PROC_INVALID_TRANSITION: an RFQ in status % cannot move to %', v_from, coalesce(p_to, 'null')
      using errcode = 'P0001';
  end if;

  perform public.proc_require_permission('rfq', v_field);
  v_reason := public.proc_clean_reason(p_reason, v_need);

  perform set_config('dcos.proc_transition', 'on', true);
  update public.procurement_rfqs
     set status            = p_to,
         issue_date        = case when p_to = 'issued' then current_date else issue_date end,
         status_reason     = v_reason,
         status_changed_by = v_uid,
         status_changed_at = now(),
         updated_at        = now()
   where id = p_id;
  perform set_config('dcos.proc_transition', 'off', true);

  return jsonb_build_object('id', p_id, 'from', v_from, 'to', p_to);
end $$;

-- Scores a quotation (0-100). Pass both scores every call; null clears a score.
-- combined_score is computed here: technical_commercial = round((t+c)/2), weighted = round(t*0.6 + c*0.4).
create or replace function public.procurement_score_quotation(p_id uuid, p_technical numeric, p_commercial numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := public.proc_require_user();
  v_q         public.procurement_quotations%rowtype;
  v_rfq       public.procurement_rfqs%rowtype;
  v_combined  numeric;
  v_status    text;
begin
  select * into v_q from public.procurement_quotations where id = p_id for update;
  if not found then
    raise exception 'PROC_NOT_FOUND: quotation not found' using errcode = 'P0001';
  end if;
  select * into v_rfq from public.procurement_rfqs where id = v_q.rfq_id for update;

  if v_rfq.status not in ('quotations_received', 'under_evaluation') or v_q.status not in ('pending', 'evaluated') then
    raise exception 'PROC_INVALID_TRANSITION: a % quotation on a % RFQ cannot be scored', v_q.status, v_rfq.status
      using errcode = 'P0001';
  end if;
  perform public.proc_require_permission('rfq', 'edit');
  -- Quotation SoD (doc 07 section 8): the person who recorded the quotation can't score it.
  if v_q.created_by is not null and v_q.created_by = v_uid then
    raise exception 'PROC_SOD_VIOLATION: you recorded this quotation, so you cannot score it' using errcode = 'P0001';
  end if;
  if (p_technical is not null and (p_technical < 0 or p_technical > 100))
     or (p_commercial is not null and (p_commercial < 0 or p_commercial > 100)) then
    raise exception 'PROC_VALIDATION: scores must be between 0 and 100' using errcode = 'P0001';
  end if;

  if p_technical is not null and p_commercial is not null then
    if v_rfq.evaluation_method = 'technical_commercial' then
      v_combined := round((p_technical + p_commercial) / 2);
    elsif v_rfq.evaluation_method = 'weighted' then
      v_combined := round(p_technical * 0.6 + p_commercial * 0.4);
    end if;
  end if;
  v_status := case when p_technical is not null or p_commercial is not null then 'evaluated' else v_q.status end;

  perform set_config('dcos.proc_transition', 'on', true);
  update public.procurement_quotations
     set technical_score = p_technical, commercial_score = p_commercial, combined_score = v_combined,
         status = v_status, status_changed_by = v_uid, status_changed_at = now(), updated_at = now()
   where id = p_id;
  if v_rfq.status = 'quotations_received' then
    update public.procurement_rfqs
       set status = 'under_evaluation', status_changed_by = v_uid, status_changed_at = now(), updated_at = now()
     where id = v_rfq.id;
  end if;
  perform set_config('dcos.proc_transition', 'off', true);

  return jsonb_build_object('id', p_id, 'technical_score', p_technical, 'commercial_score', p_commercial,
                            'combined_score', v_combined, 'status', v_status);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Award: same checks, now security definer behind the guard
-- ---------------------------------------------------------------------------
create or replace function public.procurement_award_rfq(p_rfq_id uuid, p_quotation_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rfq            public.procurement_rfqs%rowtype;
  v_pr             public.procurement_prs%rowtype;
  v_quote          public.procurement_quotations%rowtype;
  v_method         text;
  v_has_pr         boolean;
  v_total_lines    integer;
  v_base_currency  text;
  v_quote_count    integer;
  v_exception      text;
  v_rec_id         uuid;
  v_rec_supplier   uuid;
  v_override       boolean;
  v_chosen_full    boolean;
  v_chosen_comp    boolean;
  v_chosen_covered integer;
  v_reason         text;
  v_min            integer := 1;
  v_why            text[] := '{}';
  v_po_id          uuid;
  v_po_number      text;
  v_line_sum       numeric(18,2);
  v_uncovered      integer;
  v_notes          text;
  v_tries          integer := 0;
begin
  if not has_permission('procurement', 'rfq', 'approve') then
    raise exception 'Not permitted to award RFQs';
  end if;

  select * into v_rfq from public.procurement_rfqs where id = p_rfq_id for update;
  if not found then
    raise exception 'RFQ not found';
  end if;
  -- serialise against concurrent quotation edits while we recompute
  perform 1 from public.procurement_quotations where rfq_id = p_rfq_id for update;
  if v_rfq.status not in ('quotations_received', 'under_evaluation') then
    raise exception 'RFQ cannot be awarded in status %', v_rfq.status;
  end if;
  if v_rfq.awarded_supplier_id is not null
     or exists (select 1 from public.procurement_quotations where rfq_id = p_rfq_id and is_awarded) then
    raise exception 'RFQ already awarded';
  end if;
  if v_rfq.created_by is not null and v_rfq.created_by = auth.uid() then
    raise exception 'The RFQ creator cannot award it';
  end if;

  select * into v_quote from public.procurement_quotations
   where id = p_quotation_id and rfq_id = p_rfq_id;
  if not found then
    raise exception 'Quotation does not belong to this RFQ';
  end if;
  if v_quote.status = 'rejected' then
    raise exception 'A rejected quotation cannot be awarded';
  end if;
  if v_quote.valid_until is not null and v_quote.valid_until < (now() at time zone 'utc')::date then
    raise exception 'The quotation expired on %', v_quote.valid_until;
  end if;

  v_method := coalesce(v_rfq.evaluation_method, 'lowest_price');
  if v_rfq.pr_id is not null then
    select * into v_pr from public.procurement_prs where id = v_rfq.pr_id;
  end if;
  v_has_pr := v_rfq.pr_id is not null
              and exists (select 1 from public.procurement_pr_items where pr_id = v_rfq.pr_id);

  -- number of lines a quotation must cover
  if v_has_pr then
    select count(*) into v_total_lines from public.procurement_pr_items where pr_id = v_rfq.pr_id;
  else
    select count(distinct qi.line_no) into v_total_lines
      from public.procurement_quotation_items qi
      join public.procurement_quotations q on q.id = qi.quotation_id
     where q.rfq_id = p_rfq_id and q.status <> 'rejected' and qi.unit_price > 0;
  end if;

  -- base currency: most common among non-rejected quotations, tie -> alphabetical first
  select currency into v_base_currency
    from public.procurement_quotations
   where rfq_id = p_rfq_id and status <> 'rejected'
   group by currency
   order by count(*) desc, currency asc
   limit 1;

  select count(*) into v_quote_count
    from public.procurement_quotations
   where rfq_id = p_rfq_id and status <> 'rejected'
     and (valid_until is null or valid_until >= (now() at time zone 'utc')::date);
  v_exception := case when v_quote_count = 1 then 'single_source'
                      when v_quote_count = 2 then 'fewer_than_3_quotes'
                      else null end;

  -- per-quotation stats, recommendation, and flags of the chosen quotation
  with q as (
    select * from public.procurement_quotations
     where rfq_id = p_rfq_id and status <> 'rejected'
  ),
  cov as (
    select qi.quotation_id,
           count(distinct case when v_has_pr then qi.pr_item_id::text else qi.line_no::text end)
             filter (where qi.unit_price > 0
                     and (not v_has_pr
                          or qi.pr_item_id in (select id from public.procurement_pr_items where pr_id = v_rfq.pr_id))
                    ) as covered,
           coalesce(sum(qi.total), 0) as compare_total
      from public.procurement_quotation_items qi
     where qi.quotation_id in (select id from q)
     group by qi.quotation_id
  ),
  stats as (
    select q.id, q.supplier_id, q.currency, q.delivery_lead_time, q.received_at, q.combined_score,
           coalesce(cov.covered, 0) as covered,
           coalesce(cov.compare_total, 0) as compare_total,
           (q.currency = v_base_currency) as comparable,
           (q.valid_until is not null and q.valid_until < (now() at time zone 'utc')::date) as expired
      from q left join cov on cov.quotation_id = q.id
  ),
  eligible as (
    select * from stats
     where comparable and not expired and v_total_lines > 0 and covered >= v_total_lines
       and (v_method = 'lowest_price' or combined_score is not null)
  ),
  ranked as (
    select id, supplier_id from eligible
     order by case when v_method = 'lowest_price' then compare_total end asc,
              case when v_method <> 'lowest_price' then combined_score end desc,
              case when v_method <> 'lowest_price' then compare_total end asc,
              delivery_lead_time asc nulls last,
              received_at asc nulls last,
              id asc
     limit 1
  )
  select (select id from ranked),
         (select supplier_id from ranked),
         s.comparable,
         s.covered
    into v_rec_id, v_rec_supplier, v_chosen_comp, v_chosen_covered
    from stats s
   where s.id = p_quotation_id;

  v_chosen_full := v_total_lines > 0 and v_chosen_covered >= v_total_lines;
  v_override := (v_rec_id is null or v_rec_id <> p_quotation_id);

  -- reason rules
  v_reason := btrim(coalesce(p_reason, ''));
  if length(v_reason) = 0 then
    raise exception 'An award reason is required';
  end if;
  if length(v_reason) > 2000 then
    raise exception 'The award reason must be at most 2000 characters (got %)', length(v_reason);
  end if;
  if v_override then
    v_min := greatest(v_min, 20);
    v_why := v_why || 'it differs from the system recommendation'::text;
  end if;
  if not v_chosen_comp then
    v_min := greatest(v_min, 20);
    v_why := v_why || 'the quotation is not in the base currency'::text;
  end if;
  if not v_chosen_full then
    v_min := greatest(v_min, 20);
    v_why := v_why || 'the quotation does not cover every line'::text;
  end if;
  if v_exception = 'fewer_than_3_quotes' then
    v_min := greatest(v_min, 20);
    v_why := v_why || 'fewer than 3 valid quotations were received'::text;
  elsif v_exception = 'single_source' then
    v_min := greatest(v_min, 50);
    v_why := v_why || 'only one valid quotation was received (single source)'::text;
  end if;
  if length(v_reason) < v_min then
    raise exception 'The award reason must be at least % characters because %',
      v_min, array_to_string(v_why, '; ');
  end if;

  perform set_config('dcos.proc_transition', 'on', true);
  -- award
  update public.procurement_rfqs
     set status = 'awarded',
         awarded_supplier_id = v_quote.supplier_id,
         award_reason = v_reason,
         awarded_at = now(),
         awarded_by = auth.uid(),
         recommended_supplier_id = v_rec_supplier,
         recommended_quotation_id = v_rec_id,
         award_overrides_recommendation = v_override,
         award_exception = v_exception,
         updated_at = now()
   where id = p_rfq_id;

  update public.procurement_quotations
     set is_awarded = (id = p_quotation_id),
         status = case when id = p_quotation_id then 'awarded' else 'rejected' end,
         updated_at = now()
   where rfq_id = p_rfq_id;
  perform set_config('dcos.proc_transition', 'off', true);

  -- draft PO
  select coalesce(sum(total), 0)::numeric(18,2) into v_line_sum
    from public.procurement_quotation_items
   where quotation_id = p_quotation_id and unit_price > 0;
  v_uncovered := greatest(v_total_lines - v_chosen_covered, 0);
  v_notes := case when v_uncovered > 0
                  then format('Partial award: %s of %s RFQ lines are not covered by this quotation.',
                              v_uncovered, v_total_lines)
                  else null end;

  loop
    v_po_number := 'PO-' || to_char(now(), 'YYYY') || '-'
                   || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    v_tries := v_tries + 1;
    if exists (select 1 from public.procurement_pos where po_number = v_po_number) then
      if v_tries >= 5 then
        raise exception 'Could not generate a unique PO number';
      end if;
      continue;
    end if;
    begin
      insert into public.procurement_pos (
        po_number, supplier_id, project_id, wbs_node_id, pr_id, rfq_id, quotation_id,
        currency, total_amount, grand_total, payment_terms, status, notes
      ) values (
        v_po_number, v_quote.supplier_id, v_pr.project_id, v_pr.wbs_node_id, v_rfq.pr_id, p_rfq_id, p_quotation_id,
        v_quote.currency, v_line_sum, v_line_sum, v_quote.payment_terms, 'draft', v_notes
      ) returning id into v_po_id;
      exit;
    exception when unique_violation then
      if v_tries >= 5 then
        raise exception 'Could not generate a unique PO number';
      end if;
    end;
  end loop;

  insert into public.procurement_po_items (
    po_id, pr_item_id, line_no, item_code, item_description, unit,
    quantity_ordered, unit_price, total_price, delivery_date_expected, notes
  )
  select v_po_id, qi.pr_item_id,
         (row_number() over (order by qi.line_no, qi.id))::integer,
         qi.item_code, qi.item_description, qi.unit,
         qi.quantity, qi.unit_price, qi.total, qi.delivery_date, qi.notes
    from public.procurement_quotation_items qi
   where qi.quotation_id = p_quotation_id and qi.unit_price > 0
   order by qi.line_no, qi.id;

  return jsonb_build_object(
    'po_id', v_po_id,
    'po_number', v_po_number,
    'recommended_quotation_id', v_rec_id,
    'override', v_override,
    'exception', v_exception,
    'uncovered_lines', v_uncovered
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Grants: only signed-in users may call the client-facing functions
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'procurement_transition_pr(uuid,text,text)',
    'procurement_confirm_budget(uuid,jsonb,jsonb)',
    'procurement_transition_po(uuid,text,text)',
    'procurement_sync_po_delivery(uuid)',
    'procurement_transition_invoice_match(uuid,text,text)',
    'procurement_transition_rfq(uuid,text,text)',
    'procurement_score_quotation(uuid,numeric,numeric)',
    'procurement_award_rfq(uuid,uuid,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.proc_invoice_match_after_insert() from public, anon, authenticated;
