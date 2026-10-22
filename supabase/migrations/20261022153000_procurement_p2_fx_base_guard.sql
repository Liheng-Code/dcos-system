-- Migration: 20261022153000_procurement_p2_fx_base_guard.sql
-- Purpose: Re-review follow-ups on Procurement P2 (after 20261022151500_procurement_p2_review_fixes.sql).
--   R1   the FX base currency cannot change while rates exist
--   NIT1 proc_audit_row_visible checks the caller's audit_log.view itself
--   NIT2 proc_audit_row_visible fails closed on a missing quotation_id / rfq_id key
-- Depends on: 20261022151500_procurement_p2_review_fixes.sql
-- Additive and idempotent. No tenant_id in this system.
--
-- Decision R2 (recorded): the value-band check converts at the latest rate on the approval date, as doc 07 section 4
-- requires ("evaluated on the base-currency value at the FX rate on the approval date"), not at a rate fixed when the
-- PO was submitted. Rate changes need po.configure and are audited as critical (procurement_fx_rates, procurement_fx_settings).

-- ---------------------------------------------------------------------------
-- R1. Base currency change guard
-- ---------------------------------------------------------------------------
-- Stored rates are "rate_to_base" for the current base currency. Changing the base currency would silently reinterpret
-- every stored rate, so it is refused while any rate exists. procurement_fx_rates is append-only for clients (no delete
-- policy, no delete grant), so in practice the base currency can only be changed while no rates exist yet. That is
-- acceptable: it is a once-per-installation setting. A no-op update to the same value is allowed.
create or replace function public.proc_fx_base_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.base_currency is distinct from old.base_currency
     and exists (select 1 from public.procurement_fx_rates) then
    raise exception 'PROC_VALIDATION: remove or replace the exchange rates before changing the base currency'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.proc_fx_base_guard() from public, anon, authenticated;

drop trigger if exists trg_proc_fx_base_guard on public.procurement_fx_settings;
create trigger trg_proc_fx_base_guard before update on public.procurement_fx_settings
  for each row execute function public.proc_fx_base_guard();

-- ---------------------------------------------------------------------------
-- NIT1 + NIT2. Audit visibility helper
-- ---------------------------------------------------------------------------
-- Execute stays granted to authenticated: the audit_log select policy is evaluated with the caller's privileges, so
-- revoking execute would break the policy (verified in the test suite). Instead the helper answers only to users
-- who hold audit_log.view.
-- Rules for quotation / quotation item rows:
--   * a missing or null rfq_id (quotations) / quotation_id (items) key: not visible (fail closed);
--   * a key that points to a quotation or RFQ that no longer exists: visible (nothing left to protect);
--   * malformed ids: not visible;
--   * otherwise visible to the recording user, or once the bids are open.
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
  if not public.has_permission('procurement', 'audit_log', 'view') then
    return false;
  end if;
  if p_table = 'procurement_quotations' then
    v_rfq     := nullif(d ->> 'rfq_id', '')::uuid;
    v_creator := nullif(d ->> 'created_by', '')::uuid;
    if v_rfq is null then
      return false;
    end if;
  elsif p_table = 'procurement_quotation_items' then
    v_q := nullif(d ->> 'quotation_id', '')::uuid;
    if v_q is null then
      return false;
    end if;
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
  if not exists (select 1 from public.procurement_rfqs where id = v_rfq) then
    return true;
  end if;
  return public.proc_rfq_bids_open_raw(v_rfq);
exception when invalid_text_representation or null_value_not_allowed then
  return false;
end $$;
revoke all on function public.proc_audit_row_visible(text, jsonb, jsonb) from public, anon;
grant execute on function public.proc_audit_row_visible(text, jsonb, jsonb) to authenticated;
