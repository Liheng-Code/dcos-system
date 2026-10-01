-- Migration: 20261001000001_account_permissions_and_rls.sql
-- Purpose: Make Account / Finance access real in the database. First module of
--          the RLS remediation tracked in
--          docs/01-DCOS-Foundation/DCOS-RLS-Security-Remediation-Tracker.md
--          (finance is first in its risk order).
--
-- Before this migration:
--   * the eight account_* report views ran with their owner's rights and were
--     granted to anon, so the trial balance, P&L, balance sheet and aging
--     reports could be read through the API WITHOUT SIGNING IN;
--   * every account_* table had one policy, FOR ALL TO authenticated USING (true),
--     so any signed-in user could read and change all finance data;
--   * role_permissions had no rows for module 'account_finance'.
--
-- After:
--   1. role_permissions is seeded for 'account_finance' (editable afterwards in
--      Administration > Roles & Permissions).
--   2. The report views use security_invoker, so they return only what the
--      caller may read from the underlying tables; anon loses all access.
--   3. Each account_* table has per-command policies based on
--      has_permission('account_finance', <action>, <field>).
--
-- Quantity Surveying raises the AR invoice and the receipt voucher when a
-- progress claim is certified and paid (lib/qs/qs-service.ts, updateClaimStatus).
-- Those rows are allowed for users who may approve QS claims, and readable by
-- users who may view QS claims, so that flow keeps working for QS staff who
-- hold no Account permission.
--
-- Idempotent: safe to re-run.

-- ── 1. Permission rows ───────────────────────────────────────────────────────
-- Default matrix (segregation of duties: accountants prepare, management approves):
--   L0, L1  everything
--   L2      everything except delete and configure
--   AC      view, create, edit, submit, export on transactions and the chart of
--           accounts; view only on bank accounts and financial periods.
--           No approve, no delete.
--   Reports are view and export only, for all four roles.
-- Roles not listed get no Account access. Existing rows are left untouched.

with role_matrix(role_code, can_write, can_delete, can_approve, can_configure) as (
  values
    ('L0', true, true,  true,  true),
    ('L1', true, true,  true,  true),
    ('L2', true, false, true,  false),
    ('AC', true, false, false, false)
),
actions(action, ac_read_only) as (
  values
    ('coa',              false),
    ('ap_invoice',       false),
    ('ar_invoice',       false),
    ('payment',          false),
    ('journal',          false),
    ('payment_run',      false),
    ('withholding_tax',  false),
    ('cash_forecast',    false),
    ('bank_account',     true),
    ('financial_period', true),
    ('report',           true)
)
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
select
  m.role_code,
  'account_finance',
  a.action,
  true,                                              -- view
  w.writable,                                        -- can_create
  w.writable,                                        -- edit
  m.can_delete and a.action <> 'report',             -- delete
  w.writable,                                        -- submit
  m.can_approve and a.action <> 'report',            -- approve
  m.can_approve and a.action <> 'report',            -- reject
  true,                                              -- export
  false,                                             -- transmit
  m.can_configure and a.action <> 'report',          -- configure
  false,                                             -- reassign
  'company'
from role_matrix m
join public.roles r on r.code = m.role_code
cross join actions a
cross join lateral (
  select m.can_write
         and a.action <> 'report'
         and not (a.ac_read_only and m.role_code = 'AC') as writable
) w
on conflict (role_code, module, action) do nothing;

-- ── 2. Report views: run as the caller, and never for anon ───────────────────

do $$
declare
  v text;
begin
  foreach v in array array[
    'account_ap_aging', 'account_ar_aging', 'account_balance_sheet', 'account_budget_vs_actual',
    'account_cash_flow_summary', 'account_gl_ledger', 'account_profit_loss', 'account_trial_balance'
  ] loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = true)', v);
      execute format('revoke all on public.%I from anon', v);
    end if;
  end loop;
end $$;

-- ── 3. Table policies ────────────────────────────────────────────────────────

-- Read access to a kind of finance record: the record's own view permission, or
-- the report permission (the reports read these tables as the caller).
create or replace function public.account_can_read(p_action text)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.has_permission('account_finance', p_action, 'view')
      or public.has_permission('account_finance', 'report', 'view');
$$;

comment on function public.account_can_read(text) is
  'True when the caller may read account_finance records of this action: its view permission, or the report view permission.';

-- Standard tables: one action each, no cross-module writers.
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('account_coa',               'coa',              'account_coa_auth'),
      ('account_ap_invoices',       'ap_invoice',       'account_ap_auth'),
      ('account_journal_entries',   'journal',          'account_je_auth'),
      ('account_journal_lines',     'journal',          'account_jl_auth'),
      ('account_bank_accounts',     'bank_account',     'account_bank_auth'),
      ('account_payment_runs',      'payment_run',      'account_pr_auth'),
      ('account_payment_run_items', 'payment_run',      'account_pri_auth'),
      ('account_withholding_tax',   'withholding_tax',  'account_wht_auth'),
      ('account_cash_forecast',     'cash_forecast',    'account_cf_auth'),
      ('account_financial_periods', 'financial_period', 'account_periods_auth')
    ) as t(table_name, action, old_policy)
  loop
    if to_regclass('public.' || rec.table_name) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', rec.table_name);
    execute format('revoke all on public.%I from anon', rec.table_name);
    execute format('drop policy if exists %I on public.%I', rec.old_policy, rec.table_name);
    execute format('drop policy if exists account_select on public.%I', rec.table_name);
    execute format('drop policy if exists account_insert on public.%I', rec.table_name);
    execute format('drop policy if exists account_update on public.%I', rec.table_name);
    execute format('drop policy if exists account_delete on public.%I', rec.table_name);

    execute format(
      'create policy account_select on public.%I for select to authenticated
         using ((select public.account_can_read(%L)))',
      rec.table_name, rec.action);
    execute format(
      'create policy account_insert on public.%I for insert to authenticated
         with check ((select public.has_permission(''account_finance'', %L, ''can_create'')))',
      rec.table_name, rec.action);
    -- Approvers change status without holding edit.
    execute format(
      'create policy account_update on public.%I for update to authenticated
         using ((select public.has_permission(''account_finance'', %L, ''edit''))
             or (select public.has_permission(''account_finance'', %L, ''approve'')))
         with check ((select public.has_permission(''account_finance'', %L, ''edit''))
             or (select public.has_permission(''account_finance'', %L, ''approve'')))',
      rec.table_name, rec.action, rec.action, rec.action, rec.action);
    execute format(
      'create policy account_delete on public.%I for delete to authenticated
         using ((select public.has_permission(''account_finance'', %L, ''delete'')))',
      rec.table_name, rec.action);
  end loop;
end $$;

-- AR invoices: also written by QS when a claim is certified or paid (claim_id set).
revoke all on public.account_ar_invoices from anon;
drop policy if exists account_ar_auth on public.account_ar_invoices;
drop policy if exists account_select on public.account_ar_invoices;
drop policy if exists account_insert on public.account_ar_invoices;
drop policy if exists account_update on public.account_ar_invoices;
drop policy if exists account_delete on public.account_ar_invoices;

create policy account_select on public.account_ar_invoices for select to authenticated
  using (
    (select public.account_can_read('ar_invoice'))
    or (claim_id is not null and (select public.has_permission('qs', 'claims', 'view')))
  );
create policy account_insert on public.account_ar_invoices for insert to authenticated
  with check (
    (select public.has_permission('account_finance', 'ar_invoice', 'can_create'))
    or (claim_id is not null and (select public.has_permission('qs', 'claims', 'approve')))
  );
create policy account_update on public.account_ar_invoices for update to authenticated
  using (
    (select public.has_permission('account_finance', 'ar_invoice', 'edit'))
    or (select public.has_permission('account_finance', 'ar_invoice', 'approve'))
    or (claim_id is not null and (select public.has_permission('qs', 'claims', 'approve')))
  )
  with check (
    (select public.has_permission('account_finance', 'ar_invoice', 'edit'))
    or (select public.has_permission('account_finance', 'ar_invoice', 'approve'))
    or (claim_id is not null and (select public.has_permission('qs', 'claims', 'approve')))
  );
create policy account_delete on public.account_ar_invoices for delete to authenticated
  using ((select public.has_permission('account_finance', 'ar_invoice', 'delete')));

-- Payment vouchers: QS records the client receipt when a claim is paid.
revoke all on public.account_payment_vouchers from anon;
drop policy if exists account_pv_auth on public.account_payment_vouchers;
drop policy if exists account_select on public.account_payment_vouchers;
drop policy if exists account_insert on public.account_payment_vouchers;
drop policy if exists account_update on public.account_payment_vouchers;
drop policy if exists account_delete on public.account_payment_vouchers;

create policy account_select on public.account_payment_vouchers for select to authenticated
  using (
    (select public.account_can_read('payment'))
    or (type = 'receipt' and payee_type = 'client' and (select public.has_permission('qs', 'claims', 'view')))
  );
create policy account_insert on public.account_payment_vouchers for insert to authenticated
  with check (
    (select public.has_permission('account_finance', 'payment', 'can_create'))
    or (type = 'receipt' and payee_type = 'client' and (select public.has_permission('qs', 'claims', 'approve')))
  );
create policy account_update on public.account_payment_vouchers for update to authenticated
  using (
    (select public.has_permission('account_finance', 'payment', 'edit'))
    or (select public.has_permission('account_finance', 'payment', 'approve'))
  )
  with check (
    (select public.has_permission('account_finance', 'payment', 'edit'))
    or (select public.has_permission('account_finance', 'payment', 'approve'))
  );
create policy account_delete on public.account_payment_vouchers for delete to authenticated
  using ((select public.has_permission('account_finance', 'payment', 'delete')));

-- Voucher-to-invoice links: QS links the receipt to the claim's AR invoice.
revoke all on public.account_pv_links from anon;
drop policy if exists account_pv_link_auth on public.account_pv_links;
drop policy if exists account_select on public.account_pv_links;
drop policy if exists account_insert on public.account_pv_links;
drop policy if exists account_update on public.account_pv_links;
drop policy if exists account_delete on public.account_pv_links;

create policy account_select on public.account_pv_links for select to authenticated
  using (
    (select public.account_can_read('payment'))
    or (invoice_type = 'ar' and (select public.has_permission('qs', 'claims', 'view')))
  );
create policy account_insert on public.account_pv_links for insert to authenticated
  with check (
    (select public.has_permission('account_finance', 'payment', 'can_create'))
    or (invoice_type = 'ar' and (select public.has_permission('qs', 'claims', 'approve')))
  );
create policy account_update on public.account_pv_links for update to authenticated
  using ((select public.has_permission('account_finance', 'payment', 'edit')))
  with check ((select public.has_permission('account_finance', 'payment', 'edit')));
create policy account_delete on public.account_pv_links for delete to authenticated
  using ((select public.has_permission('account_finance', 'payment', 'delete')));
