-- Migration: 20261022101310_procurement_rfq_comparison.sql
-- Purpose: RFQ quotation comparison and award audit trail. Adds per-line lead time/notes on
--          quotation items, award snapshot columns on RFQs, and the atomic award RPC
--          procurement_award_rfq (recompute recommendation, enforce reason rules, create draft PO).
-- Depends on: procurement_rfqs, procurement_quotations, procurement_quotation_items,
--             procurement_pos, procurement_po_items, procurement_pr_items, procurement_prs,
--             procurement_suppliers, has_permission(text,text,text)
-- Additive only: safe to run while other lanes share the DB.

alter table public.procurement_quotation_items
  add column if not exists lead_time_days integer,
  add column if not exists notes text;

alter table public.procurement_rfqs
  add column if not exists recommended_supplier_id uuid references public.procurement_suppliers(id) on delete set null,
  add column if not exists recommended_quotation_id uuid references public.procurement_quotations(id) on delete set null,
  add column if not exists awarded_by uuid references auth.users(id) on delete set null,
  add column if not exists award_overrides_recommendation boolean not null default false,
  add column if not exists award_exception text,
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'procurement_quotation_items_lead_time_days_check'
                 and conrelid = 'public.procurement_quotation_items'::regclass) then
    alter table public.procurement_quotation_items
      add constraint procurement_quotation_items_lead_time_days_check
      check (lead_time_days is null or lead_time_days >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'procurement_rfqs_award_exception_check'
                 and conrelid = 'public.procurement_rfqs'::regclass) then
    alter table public.procurement_rfqs
      add constraint procurement_rfqs_award_exception_check
      check (award_exception is null or award_exception in ('fewer_than_3_quotes', 'single_source'));
  end if;
end $$;

create index if not exists idx_proc_rfqs_created_by on public.procurement_rfqs(created_by);
create index if not exists idx_proc_rfqs_recommended_quotation on public.procurement_rfqs(recommended_quotation_id);

-- Unique PO numbers, only when existing data has no duplicates (never fails the migration)
do $$
begin
  if exists (select 1 from public.procurement_pos group by po_number having count(*) > 1) then
    raise notice 'procurement_pos has duplicate po_number values; unique index not created';
  else
    create unique index if not exists uq_procurement_pos_po_number on public.procurement_pos(po_number);
  end if;
end $$;

create or replace function public.procurement_award_rfq(
  p_rfq_id uuid,
  p_quotation_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
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
$fn$;

revoke all on function public.procurement_award_rfq(uuid, uuid, text) from public;
grant execute on function public.procurement_award_rfq(uuid, uuid, text) to authenticated;
