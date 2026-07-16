-- Migration: 20260716000002_tender_award_budget_conversion_hardening.sql
-- Purpose: Address Supabase advisor findings raised immediately after
--          20260716000001_tender_award_budget_conversion.sql was applied.
-- Depends on: 20260716000001_tender_award_budget_conversion.sql (applied earlier today)
--
-- Findings addressed:
-- 1. SECURITY (WARN, lint 0028/0029): public.convert_tender_to_project_budget is a
--    SECURITY DEFINER function that bypasses RLS. The prior migration granted EXECUTE
--    to `authenticated` but never revoked the default PUBLIC grant, so it was also
--    callable by the unauthenticated `anon` role via PostgREST — anyone could invoke it
--    with an arbitrary p_tender_id / p_user_id and mutate project budget data without
--    signing in. Revoke from PUBLIC/anon; keep authenticated only.
-- 2. PERFORMANCE (INFO, lint 0001): tender_register_budget_converted_by_fkey has no
--    covering index. Add one.

revoke execute on function public.convert_tender_to_project_budget(uuid, uuid) from public;
revoke execute on function public.convert_tender_to_project_budget(uuid, uuid) from anon;
grant execute on function public.convert_tender_to_project_budget(uuid, uuid) to authenticated;

create index if not exists idx_tender_register_budget_converted_by
  on public.tender_register(budget_converted_by);
