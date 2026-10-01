-- URGENT FIX for production. Paste into the Supabase SQL editor and run.
--
-- Ten views ran with their owner's rights and were granted to the anonymous role,
-- so the API returned their rows to callers who had not signed in: the Account
-- reports (trial balance, P&L, balance sheet, aging, ledger, cash flow, budget vs
-- actual), every BOQ line with its requisition status, and contract time-bar alerts.
--
-- This makes each view run as the caller and removes anonymous access. It changes
-- nothing else: signed-in users see what the underlying tables allow, as before.
-- It does NOT yet restrict which signed-in users can use Account; that is in
-- migration 20261001000001 and should follow once the migration history is reconciled.
--
-- Safe to run more than once. A view that does not exist is skipped.
-- The same statements are in migrations 20261001000001 (section 2) and
-- 20261001000002, so running those later is harmless.

do $$
declare
  v text;
  done text[] := '{}';
  skipped text[] := '{}';
begin
  foreach v in array array[
    'account_ap_aging', 'account_ar_aging', 'account_balance_sheet', 'account_budget_vs_actual',
    'account_cash_flow_summary', 'account_gl_ledger', 'account_profit_loss', 'account_trial_balance',
    'qs_v_boq_requisition_status', 'time_bar_alerts'
  ] loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = true)', v);
      execute format('revoke all on public.%I from anon', v);
      done := done || v;
    else
      skipped := skipped || v;
    end if;
  end loop;
  raise notice 'closed: %', array_to_string(done, ', ');
  raise notice 'not present, skipped: %', coalesce(nullif(array_to_string(skipped, ', '), ''), '(none)');
end $$;

-- Check: every row should show invoker = true and anon_can_read = false.
select c.relname as view,
       coalesce(c.reloptions::text, '') ~ 'security_invoker=(true|on)' as invoker,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_can_read
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and (c.relname like 'account\_%' or c.relname in ('qs_v_boq_requisition_status', 'time_bar_alerts'))
order by 1;
