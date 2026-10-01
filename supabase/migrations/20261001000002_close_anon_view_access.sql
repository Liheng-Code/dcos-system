-- Migration: 20261001000002_close_anon_view_access.sql
-- Purpose: Stop two views from being readable without signing in.
--
-- qs_v_boq_requisition_status and time_bar_alerts ran with their owner's rights
-- (no security_invoker) and were granted to anon, so the API returned their rows
-- to callers with no session: every BOQ line with its requisition status, and
-- contract time-bar alerts. Both are only used by signed-in screens (QS BOQ
-- builder, Procurement BOQ pickers, Contracts), so they now run as the caller
-- and anon has no access. Signed-in users see what the underlying tables'
-- policies allow, as before.
--
-- Not changed here: v_plan_client_programme, which backs the client programme
-- portal and needs a decision on how that portal authenticates.
--
-- Idempotent: safe to re-run.

do $$
declare
  v text;
begin
  foreach v in array array['qs_v_boq_requisition_status', 'time_bar_alerts'] loop
    if to_regclass('public.' || v) is not null then
      execute format('alter view public.%I set (security_invoker = true)', v);
      execute format('revoke all on public.%I from anon', v);
    end if;
  end loop;
end $$;
