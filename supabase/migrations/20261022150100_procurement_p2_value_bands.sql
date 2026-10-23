-- Migration: 20261022150100_procurement_p2_value_bands.sql
-- Purpose: Procurement hardening P2, part 2 (doc 13 F8, doc 07 section 4): PO approval value bands.
--   * procurement_approval_bands (config, editable only with po.configure, critical audit on change)
--   * base-currency conversion, required band (+1 uplift), user band
--   * procurement_transition_po refuses an approval above the approver's band (PROC_BAND_EXCEEDED)
--   * procurement_po_band_info for the PO detail screen
-- Depends on: 20261022150000_procurement_p2_sealed_bids_numbering.sql, currencies, exchange_rates
-- Additive and idempotent. No tenant_id in this system.
--
-- Known gaps (deferred): band 5 step-up authentication (AAL3, D6); delegation / acting-up grants (doc 07 section 4).

-- ---------------------------------------------------------------------------
-- Audit severity
-- ---------------------------------------------------------------------------
alter table public.procurement_audit_log add column if not exists severity text not null default 'normal';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'procurement_audit_log_severity_check') then
    alter table public.procurement_audit_log
      add constraint procurement_audit_log_severity_check check (severity in ('normal', 'high', 'critical'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Bands
-- ---------------------------------------------------------------------------
-- A band holds amounts with min_amount < amount <= max_amount (band 1 also holds 0). Boundaries are shared:
-- band N's min_amount equals band N-1's max_amount, so the ranges are contiguous and cannot overlap.
create table if not exists public.procurement_approval_bands (
  band              integer primary key check (band between 1 and 5),
  id                uuid not null unique default gen_random_uuid(),
  label             text not null,
  min_amount        numeric(18,2) not null check (min_amount >= 0),
  max_amount        numeric(18,2),
  permission_action text not null unique,
  updated_by        uuid,
  updated_at        timestamptz not null default now()
);

insert into public.procurement_approval_bands (band, label, min_amount, max_amount, permission_action) values
  (1, 'Band 1',        0,      1000, 'po_band1'),
  (2, 'Band 2',     1000,     10000, 'po_band2'),
  (3, 'Band 3',    10000,     50000, 'po_band3'),
  (4, 'Band 4',    50000,    250000, 'po_band4'),
  (5, 'Band 5',   250000,      null, 'po_band5')
on conflict (band) do nothing;

alter table public.procurement_approval_bands enable row level security;

drop policy if exists proc_approval_bands_select on public.procurement_approval_bands;
drop policy if exists proc_approval_bands_update on public.procurement_approval_bands;
create policy proc_approval_bands_select on public.procurement_approval_bands
  for select to authenticated
  using ((select public.has_permission('procurement', 'po', 'view')));
create policy proc_approval_bands_update on public.procurement_approval_bands
  for update to authenticated
  using ((select public.has_permission('procurement', 'po', 'configure')))
  with check ((select public.has_permission('procurement', 'po', 'configure')));
-- no insert / delete policies

-- Whole-table validation: five bands, contiguous, ascending, band 5 open ended.
create or replace function public.proc_validate_bands()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_prev numeric := 0;
  v_n    integer := 0;
begin
  for r in select * from public.procurement_approval_bands order by band loop
    v_n := v_n + 1;
    if r.band <> v_n then
      raise exception 'PROC_VALIDATION: bands must be numbered 1 to 5 without gaps' using errcode = 'P0001';
    end if;
    if r.min_amount <> v_prev then
      raise exception 'PROC_VALIDATION: band % must start where band % ends (%), got %',
        r.band, r.band - 1, v_prev, r.min_amount using errcode = 'P0001';
    end if;
    if r.band < 5 then
      if r.max_amount is null or r.max_amount <= r.min_amount then
        raise exception 'PROC_VALIDATION: band % needs a maximum above its minimum', r.band using errcode = 'P0001';
      end if;
      v_prev := r.max_amount;
    elsif r.max_amount is not null then
      raise exception 'PROC_VALIDATION: band 5 has no maximum' using errcode = 'P0001';
    end if;
  end loop;
  if v_n <> 5 then
    raise exception 'PROC_VALIDATION: exactly 5 bands are required' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.proc_bands_validate_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.proc_validate_bands();
  return null;
end $$;

-- Deferred: a multi-row edit (two boundaries moving together) is validated once, at commit.
drop trigger if exists trg_proc_bands_validate on public.procurement_approval_bands;
create constraint trigger trg_proc_bands_validate
  after insert or update or delete on public.procurement_approval_bands
  deferrable initially deferred
  for each row execute function public.proc_bands_validate_trigger();

create or replace function public.proc_bands_stamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists trg_proc_bands_stamp on public.procurement_approval_bands;
create trigger trg_proc_bands_stamp before update on public.procurement_approval_bands
  for each row execute function public.proc_bands_stamp();

-- Critical audit (doc 07 section 7: value band changes are always audited, severity CRITICAL).
create or replace function public.proc_audit_bands_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.procurement_audit_log (table_name, record_id, action, old_data, new_data, changed_by, severity)
  values (tg_table_name, coalesce(new.id, old.id), tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          auth.uid(), 'critical');
  return coalesce(new, old);
end $$;
drop trigger if exists trg_proc_audit_approval_bands on public.procurement_approval_bands;
create trigger trg_proc_audit_approval_bands
  after insert or update or delete on public.procurement_approval_bands
  for each row execute function public.proc_audit_bands_trigger();

-- Atomic edit of all bands at once. p_bands: [{band, label?, min_amount, max_amount}] (max_amount null for band 5).
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
     where b.band = x.band;
  exception
    when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then
      raise exception 'PROC_VALIDATION: invalid band input: %', sqlerrm using errcode = 'P0001';
  end;
  perform public.proc_validate_bands();
end $$;

-- Default holders (doc 07 section 4). Holding band N implies 1..N. Admins pass through has_permission.
insert into public.role_permissions (role_code, module, action, view, approve, scope)
select v.role_code, 'procurement', v.action, true, true, 'company'
  from (values ('L0', 'po_band5'), ('L1', 'po_band5'), ('L2', 'po_band4'), ('L3', 'po_band3')) as v(role_code, action)
 where exists (select 1 from public.roles r where r.code = v.role_code)
on conflict (role_code, module, action) do update set view = true, approve = true;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.proc_base_currency()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select code from public.currencies where is_base order by code limit 1), 'USD')
$$;

-- PO value in the base currency at today's rate. Raises PROC_VALIDATION when no rate exists.
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
  v_amt := coalesce(v_po.grand_total, v_po.total_amount, 0);
  if v_po.currency is null or v_po.currency = v_base then
    return v_amt;
  end if;

  select rate into v_rate from public.exchange_rates
   where from_currency = v_po.currency and to_currency = v_base and effective_date <= current_date
   order by effective_date desc limit 1;
  if v_rate is not null and v_rate > 0 then
    return round(v_amt * v_rate, 2);
  end if;

  select rate into v_rate from public.exchange_rates
   where from_currency = v_base and to_currency = v_po.currency and effective_date <= current_date
   order by effective_date desc limit 1;
  if v_rate is not null and v_rate > 0 then
    return round(v_amt / v_rate, 2);
  end if;

  raise exception 'PROC_VALIDATION: no exchange rate % to %', v_po.currency, v_base using errcode = 'P0001';
end $$;

-- Why the required band goes up by one (doc 07 section 4): non-lowest award, single source, budget override.
create or replace function public.proc_po_uplift_reasons(p_po_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_remove(array[
      case when r.award_overrides_recommendation then 'award_override' end,
      case when r.award_exception = 'single_source' then 'single_source' end,
      case when bc.budget_status = 'over_budget' then 'over_budget' end
    ], null), '{}'::text[])
    from public.procurement_pos p
    left join public.procurement_rfqs r on r.id = p.rfq_id
    left join public.procurement_prs pr on pr.id = p.pr_id
    left join public.procurement_budget_confirmations bc on bc.id = pr.budget_confirmation_id
   where p.id = p_po_id
$$;

create or replace function public.proc_po_required_band(p_po_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_amt  numeric := public.proc_po_base_amount(p_po_id);
  v_band integer;
begin
  select band into v_band from public.procurement_approval_bands
   where (band = 1 and v_amt >= min_amount and v_amt <= max_amount)
      or (band > 1 and v_amt > min_amount and (max_amount is null or v_amt <= max_amount))
   order by band limit 1;
  v_band := coalesce(v_band, 5);
  if cardinality(public.proc_po_uplift_reasons(p_po_id)) > 0 then
    v_band := least(v_band + 1, 5);
  end if;
  return v_band;
end $$;

-- Highest band the caller holds (0 = none). Role stacking gives the maximum.
create or replace function public.proc_user_max_band()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(band), 0)
    from public.procurement_approval_bands
   where public.has_permission('procurement', permission_action, 'approve')
$$;

-- For the PO detail screen. {base_amount, base_currency, required_band, user_band, uplift_reasons[]}.
-- When no exchange rate exists, base_amount and required_band are null and fx_error says why.
create or replace function public.procurement_po_band_info(p_po_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_amt    numeric;
  v_req    integer;
  v_fx_err text;
begin
  perform public.proc_require_user();
  perform public.proc_require_permission('po', 'view');
  if not exists (select 1 from public.procurement_pos where id = p_po_id) then
    raise exception 'PROC_NOT_FOUND: purchase order not found' using errcode = 'P0001';
  end if;
  begin
    v_amt := public.proc_po_base_amount(p_po_id);
    v_req := public.proc_po_required_band(p_po_id);
  exception when sqlstate 'P0001' then
    v_fx_err := sqlerrm;
  end;
  return jsonb_build_object(
    'base_amount',    v_amt,
    'base_currency',  public.proc_base_currency(),
    'required_band',  v_req,
    'user_band',      public.proc_user_max_band(),
    'uplift_reasons', to_jsonb(public.proc_po_uplift_reasons(p_po_id)),
    'fx_error',       v_fx_err);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'procurement_po_band_info(uuid)', 'procurement_set_approval_bands(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'proc_validate_bands()', 'proc_bands_validate_trigger()', 'proc_bands_stamp()', 'proc_audit_bands_trigger()',
    'proc_base_currency()', 'proc_po_base_amount(uuid)', 'proc_po_uplift_reasons(uuid)',
    'proc_po_required_band(uuid)', 'proc_user_max_band()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- PO approval checks the caller's band (after permission and SoD).
-- ---------------------------------------------------------------------------
create or replace function public.procurement_transition_po(p_id uuid, p_to text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid := public.proc_require_user();
  v_po      public.procurement_pos%rowtype;
  v_from    text;
  v_field   text;
  v_need    boolean := false;
  v_sod     boolean := false;
  v_reason  text;
  v_req     integer;
  v_have    integer;
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
  if p_to = 'approved' then
    -- F8: the band is a hard ceiling (doc 07 section 4). Role stacking gives the maximum band.
    -- Gap (P2+): band 5 step-up authentication (AAL3, D6) is not enforced yet.
    v_req  := public.proc_po_required_band(p_id);
    v_have := public.proc_user_max_band();
    if v_have < v_req then
      raise exception 'PROC_BAND_EXCEEDED: this PO needs approval band % (amount % %); you hold band %',
        v_req, public.proc_po_base_amount(p_id), public.proc_base_currency(), v_have
        using errcode = 'P0001';
    end if;
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
end $function$;

revoke all on function public.procurement_transition_po(uuid,text,text) from public, anon;
grant execute on function public.procurement_transition_po(uuid,text,text) to authenticated;
