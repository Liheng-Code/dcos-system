-- Migration: 20261022151500_procurement_p2_review_fixes.sql
-- Purpose: Code-review fixes on Procurement P2 (20261022150000 sealed bids / numbering, 20261022150100 value bands).
--   B1 the audit log no longer leaks sealed quotation amounts
--   B2 value bands are self-contained: own base currency + own FX rates (exchange_rates / currencies are not read)
--   B3 band identity (band, id, permission_action) can no longer be rewired
--   S1 band amount = the greatest of grand total, total amount and the sum of PO line totals
--   S2 cancelling / rejecting an RFQ no longer opens its bids; only the deadline or an award does
--   S3 PR / PO / RFQ numbers are immutable after insert
--   N1 bid-opening helpers answer only to users with rfq.view
--   N2 procurement_set_approval_bands writes only rows that really change (no no-op critical audit rows)
--   N3 dead PO-number loop removed from procurement_award_rfq
--   N4 deadline check and numbering year use the Bangkok date
--   N10 bids-open call in the quotation select policy is wrapped in a sub-select
-- Depends on: 20261022150000_procurement_p2_sealed_bids_numbering.sql, 20261022150100_procurement_p2_value_bands.sql
-- Additive and idempotent. No tenant_id in this system.

-- ---------------------------------------------------------------------------
-- Today in Bangkok (N4)
-- ---------------------------------------------------------------------------
create or replace function public.proc_today()
returns date
language sql
stable
set search_path = public
as $$ select (now() at time zone 'Asia/Bangkok')::date $$;
revoke all on function public.proc_today() from public, anon;
grant execute on function public.proc_today() to authenticated;

-- ---------------------------------------------------------------------------
-- Bid opening (S2, N1)
-- ---------------------------------------------------------------------------
-- Internal, no permission check: used by the definer award / score functions and the audit helper.
create or replace function public.proc_rfq_bids_open_at_raw(p_rfq_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((r.response_deadline + 1)::timestamp at time zone 'Asia/Bangkok')
    from public.procurement_rfqs r where r.id = p_rfq_id
$$;

-- Open = no deadline (legacy RFQ), deadline passed, or already awarded. Cancel / reject-all do NOT open bids.
create or replace function public.proc_rfq_bids_open_raw(p_rfq_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select r.response_deadline is null
            or now() >= ((r.response_deadline + 1)::timestamp at time zone 'Asia/Bangkok')
            or r.status = 'awarded'
       from public.procurement_rfqs r where r.id = p_rfq_id),
    false)
$$;

-- Client-callable: answers only for users with rfq.view.
create or replace function public.proc_rfq_bids_open_at(p_rfq_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case when public.has_permission('procurement', 'rfq', 'view')
              then public.proc_rfq_bids_open_at_raw(p_rfq_id) end
$$;

create or replace function public.proc_rfq_bids_open(p_rfq_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('procurement', 'rfq', 'view') and public.proc_rfq_bids_open_raw(p_rfq_id)
$$;

revoke all on function public.proc_rfq_bids_open_at_raw(uuid) from public, anon, authenticated;
revoke all on function public.proc_rfq_bids_open_raw(uuid)    from public, anon, authenticated;
revoke all on function public.proc_rfq_bids_open_at(uuid)     from public, anon;
revoke all on function public.proc_rfq_bids_open(uuid)        from public, anon;
grant execute on function public.proc_rfq_bids_open_at(uuid) to authenticated;
grant execute on function public.proc_rfq_bids_open(uuid)    to authenticated;

drop policy if exists proc_procurement_quotations_select on public.procurement_quotations;
create policy proc_procurement_quotations_select on public.procurement_quotations
  for select to authenticated
  using (
    (select public.has_permission('procurement', 'rfq', 'view'))
    and ((select public.proc_rfq_bids_open(rfq_id)) or created_by = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- B1. Audit log must not leak sealed bids
-- ---------------------------------------------------------------------------
-- Quotation / quotation item audit rows carry full row images (amounts). They follow the same rule as the tables:
-- readable once the bids are open, or by the person who recorded the quotation. A row whose quotation or RFQ no
-- longer exists is treated as open. Malformed data fails closed.
create or replace function public.proc_audit_row_visible(p_table text, p_new jsonb, p_old jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d         jsonb := coalesce(p_new, p_old);
  v_rfq     uuid;
  v_creator uuid;
  v_q       uuid;
begin
  if p_table = 'procurement_quotations' then
    v_rfq     := nullif(d ->> 'rfq_id', '')::uuid;
    v_creator := nullif(d ->> 'created_by', '')::uuid;
  elsif p_table = 'procurement_quotation_items' then
    v_q := nullif(d ->> 'quotation_id', '')::uuid;
    select q.rfq_id, q.created_by into v_rfq, v_creator from public.procurement_quotations q where q.id = v_q;
    if not found then
      return true;
    end if;
  else
    return true;
  end if;
  if v_creator is not null and v_creator = auth.uid() then
    return true;
  end if;
  if v_rfq is null or not exists (select 1 from public.procurement_rfqs where id = v_rfq) then
    return true;
  end if;
  return public.proc_rfq_bids_open_raw(v_rfq);
exception when invalid_text_representation or null_value_not_allowed then
  return false;
end $$;
revoke all on function public.proc_audit_row_visible(text, jsonb, jsonb) from public, anon;
grant execute on function public.proc_audit_row_visible(text, jsonb, jsonb) to authenticated;

drop policy if exists proc_procurement_audit_log_select on public.procurement_audit_log;
create policy proc_procurement_audit_log_select on public.procurement_audit_log
  for select to authenticated
  using (
    (select public.has_permission('procurement', 'audit_log', 'view'))
    and (table_name not in ('procurement_quotations', 'procurement_quotation_items')
         or (select public.proc_audit_row_visible(table_name, new_data, old_data)))
  );

-- ---------------------------------------------------------------------------
-- B2. Self-contained FX for the value bands
-- ---------------------------------------------------------------------------
create table if not exists public.procurement_fx_settings (
  singleton     boolean primary key default true check (singleton),
  id            uuid not null unique default gen_random_uuid(),
  base_currency text not null default 'USD' check (base_currency ~ '^[A-Z]{3}$'),
  updated_by    uuid,
  updated_at    timestamptz not null default now()
);
insert into public.procurement_fx_settings (singleton, base_currency) values (true, 'USD') on conflict (singleton) do nothing;

create table if not exists public.procurement_fx_rates (
  id             uuid primary key default gen_random_uuid(),
  currency       text not null check (currency ~ '^[A-Z]{3}$'),
  rate_to_base   numeric(18,8) not null check (rate_to_base > 0),
  effective_date date not null default ((now() at time zone 'Asia/Bangkok')::date),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  unique (currency, effective_date)
);

alter table public.procurement_fx_settings enable row level security;
alter table public.procurement_fx_rates    enable row level security;

drop policy if exists proc_fx_settings_select on public.procurement_fx_settings;
drop policy if exists proc_fx_settings_update on public.procurement_fx_settings;
create policy proc_fx_settings_select on public.procurement_fx_settings for select to authenticated
  using ((select public.has_permission('procurement', 'po', 'view')));
create policy proc_fx_settings_update on public.procurement_fx_settings for update to authenticated
  using ((select public.has_permission('procurement', 'po', 'configure')))
  with check ((select public.has_permission('procurement', 'po', 'configure')));

drop policy if exists proc_fx_rates_select on public.procurement_fx_rates;
drop policy if exists proc_fx_rates_insert on public.procurement_fx_rates;
drop policy if exists proc_fx_rates_update on public.procurement_fx_rates;
create policy proc_fx_rates_select on public.procurement_fx_rates for select to authenticated
  using ((select public.has_permission('procurement', 'po', 'view')));
create policy proc_fx_rates_insert on public.procurement_fx_rates for insert to authenticated
  with check ((select public.has_permission('procurement', 'po', 'configure')));
create policy proc_fx_rates_update on public.procurement_fx_rates for update to authenticated
  using ((select public.has_permission('procurement', 'po', 'configure')))
  with check ((select public.has_permission('procurement', 'po', 'configure')));
-- no delete policies

revoke all on public.procurement_fx_settings from anon, authenticated;
revoke all on public.procurement_fx_rates    from anon, authenticated;
grant select on public.procurement_fx_settings to authenticated;
grant update (base_currency) on public.procurement_fx_settings to authenticated;
grant select on public.procurement_fx_rates to authenticated;
grant insert (currency, rate_to_base, effective_date, created_by) on public.procurement_fx_rates to authenticated;
grant update (rate_to_base, effective_date) on public.procurement_fx_rates to authenticated;

create or replace function public.proc_fx_rates_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    if new.currency = (select base_currency from public.procurement_fx_settings limit 1) then
      raise exception 'PROC_VALIDATION: the base currency needs no exchange rate' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_proc_fx_rates_guard on public.procurement_fx_rates;
create trigger trg_proc_fx_rates_guard before insert on public.procurement_fx_rates
  for each row execute function public.proc_fx_rates_guard();

create or replace function public.proc_fx_settings_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists trg_proc_fx_settings_stamp on public.procurement_fx_settings;
create trigger trg_proc_fx_settings_stamp before update on public.procurement_fx_settings
  for each row execute function public.proc_fx_settings_stamp();

-- Critical audit (reuses the generic definer trigger: it writes severity 'critical' for any table with an id column).
drop trigger if exists trg_proc_audit_fx_settings on public.procurement_fx_settings;
create trigger trg_proc_audit_fx_settings after insert or update or delete on public.procurement_fx_settings
  for each row execute function public.proc_audit_bands_trigger();
drop trigger if exists trg_proc_audit_fx_rates on public.procurement_fx_rates;
create trigger trg_proc_audit_fx_rates after insert or update or delete on public.procurement_fx_rates
  for each row execute function public.proc_audit_bands_trigger();

create or replace function public.proc_base_currency()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select base_currency from public.procurement_fx_settings limit 1), 'USD')
$$;

-- S1: the PO value is the greatest of grand total, total amount and the sum of the line totals.
-- B2: converted with procurement_fx_rates only (latest rate on or before the Bangkok date).
create or replace function public.proc_po_base_amount(p_po_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_po   public.procurement_pos%rowtype;
  v_base text := public.proc_base_currency();
  v_amt  numeric;
  v_rate numeric;
begin
  select * into v_po from public.procurement_pos where id = p_po_id;
  if not found then
    raise exception 'PROC_NOT_FOUND: purchase order not found' using errcode = 'P0001';
  end if;
  v_amt := greatest(
    coalesce(v_po.grand_total, 0),
    coalesce(v_po.total_amount, 0),
    coalesce((select sum(i.total_price) from public.procurement_po_items i
               where i.po_id = p_po_id and i.item_type = 'line'), 0));
  if v_po.currency is null or v_po.currency = v_base then
    return v_amt;
  end if;
  select rate_to_base into v_rate from public.procurement_fx_rates
   where currency = v_po.currency and effective_date <= public.proc_today()
   order by effective_date desc limit 1;
  if v_rate is null then
    raise exception 'PROC_VALIDATION: no exchange rate % to %', v_po.currency, v_base using errcode = 'P0001';
  end if;
  return round(v_amt * v_rate, 2);
end $$;

-- ---------------------------------------------------------------------------
-- B3. Band identity is fixed
-- ---------------------------------------------------------------------------
revoke all on public.procurement_approval_bands from anon;
revoke insert, update, delete, truncate on public.procurement_approval_bands from authenticated;
grant select on public.procurement_approval_bands to authenticated;
grant update (label, min_amount, max_amount) on public.procurement_approval_bands to authenticated;

create or replace function public.proc_bands_identity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.band is distinct from old.band or new.id is distinct from old.id
     or new.permission_action is distinct from old.permission_action then
    raise exception 'PROC_VALIDATION: band, id and permission_action cannot be changed' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_proc_bands_identity on public.procurement_approval_bands;
create trigger trg_proc_bands_identity before update on public.procurement_approval_bands
  for each row execute function public.proc_bands_identity_guard();

-- N2: only rows that really change are written (and audited).
create or replace function public.procurement_set_approval_bands(p_bands jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.proc_require_user();
  perform public.proc_require_permission('po', 'configure');
  if p_bands is null or jsonb_typeof(p_bands) <> 'array' then
    raise exception 'PROC_VALIDATION: p_bands must be a JSON array' using errcode = 'P0001';
  end if;
  begin
    update public.procurement_approval_bands b
       set label      = coalesce(nullif(btrim(x.label), ''), b.label),
           min_amount = x.min_amount,
           max_amount = x.max_amount
      from jsonb_to_recordset(p_bands) as x(band integer, label text, min_amount numeric, max_amount numeric)
     where b.band = x.band
       and (b.label, b.min_amount, b.max_amount)
           is distinct from (coalesce(nullif(btrim(x.label), ''), b.label), x.min_amount, x.max_amount);
  exception
    when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then
      raise exception 'PROC_VALIDATION: invalid band input: %', sqlerrm using errcode = 'P0001';
  end;
  perform public.proc_validate_bands();
end $$;
revoke all on function public.procurement_set_approval_bands(jsonb) from public, anon;
grant execute on function public.procurement_set_approval_bands(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- S3. Numbers are immutable after insert (silently kept, so an edit form that echoes the number still works)
-- ---------------------------------------------------------------------------
create or replace function public.proc_numbers_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('dcos.proc_transition', true), '') = 'on' then
    return new;
  end if;
  if tg_table_name = 'procurement_prs' then
    new.pr_number := old.pr_number;
  elsif tg_table_name = 'procurement_pos' then
    new.po_number := old.po_number;
  else
    new.rfq_number := old.rfq_number;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['procurement_prs', 'procurement_pos', 'procurement_rfqs'] loop
    execute format('drop trigger if exists trg_proc_numbers_immutable on public.%I', t);
    execute format('create trigger trg_proc_numbers_immutable before update on public.%I
                    for each row execute function public.proc_numbers_immutable()', t);
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'proc_fx_rates_guard()', 'proc_fx_settings_stamp()', 'proc_bands_identity_guard()', 'proc_numbers_immutable()',
    'proc_base_currency()', 'proc_po_base_amount(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Function updates (S2, N1, N3, N4)
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
  if not public.proc_rfq_bids_open_raw(p_rfq_id) then
    raise exception 'PROC_BIDS_SEALED: bids are sealed until % (Asia/Bangkok)',
      to_char(public.proc_rfq_bids_open_at_raw(p_rfq_id) at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI')
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

  -- The PO number is assigned by trg_proc_assign_number (the null is replaced before the not-null check).
  insert into public.procurement_pos (
    po_number, supplier_id, project_id, wbs_node_id, pr_id, rfq_id, quotation_id,
    currency, total_amount, grand_total, payment_terms, status, notes
  ) values (
    null, v_quote.supplier_id, v_pr.project_id, v_pr.wbs_node_id, v_rfq.pr_id, p_rfq_id, p_quotation_id,
    v_quote.currency, v_line_sum, v_line_sum, v_quote.payment_terms, 'draft', v_notes
  ) returning id, po_number into v_po_id, v_po_number;

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
  if not public.proc_rfq_bids_open_raw(v_rfq.id) then
    raise exception 'PROC_BIDS_SEALED: bids are sealed until % (Asia/Bangkok)',
      to_char(public.proc_rfq_bids_open_at_raw(v_rfq.id) at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI')
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
  if p_to = 'issued' and (v_rfq.response_deadline is null or v_rfq.response_deadline < public.proc_today()) then
    raise exception 'PROC_VALIDATION: set a response deadline of today or later before issuing the RFQ'
      using errcode = 'P0001';
  end if;

  perform set_config('dcos.proc_transition', 'on', true);
  update public.procurement_rfqs
     set status            = p_to,
         issue_date        = case when p_to = 'issued' then public.proc_today() else issue_date end,
         status_reason     = v_reason,
         status_changed_by = v_uid,
         status_changed_at = now(),
         updated_at        = now()
   where id = p_id;
  perform set_config('dcos.proc_transition', 'off', true);

  return jsonb_build_object('id', p_id, 'from', v_from, 'to', p_to);
end $function$;

create or replace function public.procurement_next_number(p_kind text, p_project_id uuid, p_year integer DEFAULT NULL::integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key   text;
  v_year  integer := coalesce(p_year, extract(year from public.proc_today())::integer);
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
revoke all on function public.procurement_next_number(text, uuid, integer) from public, anon, authenticated;
