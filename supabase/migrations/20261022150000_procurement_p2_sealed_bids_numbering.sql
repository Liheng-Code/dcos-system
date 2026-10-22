-- Migration: 20261022150000_procurement_p2_sealed_bids_numbering.sql
-- Purpose: Procurement hardening P2, part 1 (doc 13 section 5 P2: F4, F6, F9).
--   F4 sealed bids: quotations stay hidden until the RFQ deadline has passed (BR-07).
--   F6 award reason: an award that overrides the system recommendation needs at least 50 characters (BR-09, D3).
--   F9 server numbering: PR / PO / RFQ numbers are assigned by the database, race-free.
-- Depends on: 20261022130910/11, 20261022134300, 20261022140500 (procurement P0/P1)
-- Additive and idempotent. No tenant_id in this system.

-- ---------------------------------------------------------------------------
-- F4. Sealed bids
-- ---------------------------------------------------------------------------
-- Opening time = the end of the response_deadline day in Asia/Bangkok (UTC+7). Null for legacy RFQs without a deadline.
create or replace function public.proc_rfq_bids_open_at(p_rfq_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((r.response_deadline + 1)::timestamp at time zone 'Asia/Bangkok')
    from public.procurement_rfqs r
   where r.id = p_rfq_id
$$;

-- True when the quotations of the RFQ may be read by everyone with rfq.view:
-- no deadline (legacy RFQ, never sealed), deadline passed, or the RFQ is already closed.
create or replace function public.proc_rfq_bids_open(p_rfq_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select r.response_deadline is null
            or now() >= ((r.response_deadline + 1)::timestamp at time zone 'Asia/Bangkok')
            or r.status in ('awarded', 'rejected_all', 'cancelled')
       from public.procurement_rfqs r
      where r.id = p_rfq_id),
    false)
$$;

revoke all on function public.proc_rfq_bids_open_at(uuid) from public, anon;
revoke all on function public.proc_rfq_bids_open(uuid)    from public, anon;
grant execute on function public.proc_rfq_bids_open_at(uuid) to authenticated;
grant execute on function public.proc_rfq_bids_open(uuid)    to authenticated;

-- Quotation reads: rfq.view AND (bids open OR the caller recorded the quotation). No admin bypass (doc 07 section 1).
drop policy if exists proc_procurement_quotations_select on public.procurement_quotations;
create policy proc_procurement_quotations_select on public.procurement_quotations
  for select to authenticated
  using (
    (select public.has_permission('procurement', 'rfq', 'view'))
    and (public.proc_rfq_bids_open(rfq_id) or created_by = (select auth.uid()))
  );

-- Quotation items follow their quotation: the sub-select is itself filtered by the policy above.
drop policy if exists proc_procurement_quotation_items_select on public.procurement_quotation_items;
create policy proc_procurement_quotation_items_select on public.procurement_quotation_items
  for select to authenticated
  using (
    (select public.has_permission('procurement', 'rfq', 'view'))
    and exists (select 1 from public.procurement_quotations q where q.id = quotation_id)
  );

-- ---------------------------------------------------------------------------
-- F9. Server numbering
-- ---------------------------------------------------------------------------
create table if not exists public.procurement_number_seq (
  kind        text    not null check (kind in ('PR', 'PO', 'RFQ')),
  project_key text    not null,
  year        integer not null,
  last_no     integer not null default 0,
  primary key (kind, project_key, year)
);
alter table public.procurement_number_seq enable row level security;
-- No policies: only the security definer numbering function touches this table.
revoke all on public.procurement_number_seq from anon, authenticated;

-- Internal. {project_code or GEN}-{KIND}-{YYYY}-{NNNN}. p_year exists for tests only.
create or replace function public.procurement_next_number(p_kind text, p_project_id uuid, p_year integer default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key   text;
  v_year  integer := coalesce(p_year, extract(year from current_date)::integer);
  v_no    integer;
  v_num   text;
  v_table text;
  v_col   text;
  v_tries integer := 0;
  v_taken boolean;
begin
  if p_kind not in ('PR', 'PO', 'RFQ') then
    raise exception 'PROC_VALIDATION: unknown number kind %', p_kind using errcode = 'P0001';
  end if;
  v_table := case p_kind when 'PR' then 'procurement_prs' when 'PO' then 'procurement_pos' else 'procurement_rfqs' end;
  v_col   := case p_kind when 'PR' then 'pr_number' when 'PO' then 'po_number' else 'rfq_number' end;

  select coalesce(nullif(btrim(project_code), ''), 'GEN') into v_key from public.projects where id = p_project_id;
  v_key := coalesce(v_key, 'GEN');

  loop
    insert into public.procurement_number_seq as s (kind, project_key, year, last_no)
    values (p_kind, v_key, v_year, 1)
    on conflict (kind, project_key, year) do update set last_no = s.last_no + 1
    returning s.last_no into v_no;

    v_num := v_key || '-' || p_kind || '-' || v_year::text || '-' || lpad(v_no::text, 4, '0');
    execute format('select exists (select 1 from public.%I where %I = $1)', v_table, v_col) into v_taken using v_num;
    exit when not v_taken;
    v_tries := v_tries + 1;
    if v_tries >= 50 then
      raise exception 'PROC_VALIDATION: could not allocate a unique % number', p_kind using errcode = 'P0001';
    end if;
  end loop;
  return v_num;
end $$;

revoke all on function public.procurement_next_number(text, uuid, integer) from public, anon, authenticated;

-- BEFORE INSERT: always overwrite the number, whatever the client sent (or nothing). The trigger function is
-- security definer so that signed-in users, who cannot call procurement_next_number, still get a number.
create or replace function public.proc_assign_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'procurement_prs' then
    new.pr_number := public.procurement_next_number('PR', new.project_id);
  elsif tg_table_name = 'procurement_pos' then
    new.po_number := public.procurement_next_number('PO', new.project_id);
  else
    new.rfq_number := public.procurement_next_number(
      'RFQ', (select p.project_id from public.procurement_prs p where p.id = new.pr_id));
  end if;
  return new;
end $$;

revoke all on function public.proc_assign_number() from public, anon, authenticated;

drop trigger if exists trg_proc_assign_number on public.procurement_prs;
create trigger trg_proc_assign_number before insert on public.procurement_prs
  for each row execute function public.proc_assign_number();
drop trigger if exists trg_proc_assign_number on public.procurement_pos;
create trigger trg_proc_assign_number before insert on public.procurement_pos
  for each row execute function public.proc_assign_number();
drop trigger if exists trg_proc_assign_number on public.procurement_rfqs;
create trigger trg_proc_assign_number before insert on public.procurement_rfqs
  for each row execute function public.proc_assign_number();

-- Unique numbers on PR and RFQ (the PO index already exists). Created only when the existing data allows it.
do $$
begin
  if not exists (select 1 from public.procurement_prs group by pr_number having count(*) > 1) then
    create unique index if not exists uq_procurement_prs_pr_number on public.procurement_prs (pr_number);
  else
    raise notice 'duplicate pr_number values exist: uq_procurement_prs_pr_number not created';
  end if;
  if not exists (select 1 from public.procurement_rfqs group by rfq_number having count(*) > 1) then
    create unique index if not exists uq_procurement_rfqs_rfq_number on public.procurement_rfqs (rfq_number);
  else
    raise notice 'duplicate rfq_number values exist: uq_procurement_rfqs_rfq_number not created';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- F4 + F6 + F9 in procurement_award_rfq: refuses while bids are sealed, override reason minimum 50,
-- and the PO number comes from the numbering trigger (the returned po_number is the real one).
-- Other minimums stay at 20: not in base currency, lines not fully covered, fewer than 3 quotations.
-- Single source stays at 50.
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
  if not public.proc_rfq_bids_open(p_rfq_id) then
    raise exception 'PROC_BIDS_SEALED: bids are sealed until % (Asia/Bangkok)',
      to_char(public.proc_rfq_bids_open_at(p_rfq_id) at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI')
      using errcode = 'P0001';
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
    v_min := greatest(v_min, 50);  -- F6 / BR-09 / D3: was 20
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
      ) returning id, po_number into v_po_id, v_po_number;  -- po_number is assigned by trg_proc_assign_number
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

-- Scoring is refused while bids are sealed.
create or replace function public.procurement_score_quotation(p_id uuid, p_technical numeric, p_commercial numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not public.proc_rfq_bids_open(v_rfq.id) then
    raise exception 'PROC_BIDS_SEALED: bids are sealed until % (Asia/Bangkok)',
      to_char(public.proc_rfq_bids_open_at(v_rfq.id) at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI')
      using errcode = 'P0001';
  end if;

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
end $function$;

-- Issuing needs a response deadline (today or later): that is what seals the bids.
create or replace function public.procurement_transition_rfq(p_id uuid, p_to text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_to = 'issued' and (v_rfq.response_deadline is null or v_rfq.response_deadline < current_date) then
    raise exception 'PROC_VALIDATION: set a response deadline of today or later before issuing the RFQ'
      using errcode = 'P0001';
  end if;

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
end $function$;

do $$
declare f text;
begin
  foreach f in array array[
    'procurement_award_rfq(uuid,uuid,text)', 'procurement_score_quotation(uuid,numeric,numeric)',
    'procurement_transition_rfq(uuid,text,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
