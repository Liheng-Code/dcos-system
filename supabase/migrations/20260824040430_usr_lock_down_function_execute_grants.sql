-- Migration: 20260824040430_usr_lock_down_function_execute_grants.sql
-- Purpose: Fix security advisories raised by get_advisors after migrations
--          20260824035735-20260824040214 landed. New SECURITY DEFINER functions
--          are granted EXECUTE to PUBLIC by default at creation time, which
--          get_advisors flagged as `anon_security_definer_function_executable` /
--          `authenticated_security_definer_function_executable` for all four new
--          functions (each independently callable via PostgREST RPC,
--          e.g. POST /rest/v1/rpc/fn_auto_disable_inactive_accounts).
--
--          - is_admin(uuid) / is_hr(uuid): read-only boolean checks referenced
--            from RLS policies (20260824035840) and the profiles guard trigger
--            (20260824035908/20260824040047) — `authenticated` genuinely needs
--            EXECUTE for those RLS policies to evaluate at all, but `anon`/PUBLIC
--            do not.
--          - fn_guard_profiles_protected_columns(): a BEFORE UPDATE trigger
--            function only. It is never meant to be called directly; trigger
--            firing does not require the triggering client to hold EXECUTE on
--            the function.
--          - fn_auto_disable_inactive_accounts(): the pg_cron job target
--            (20260824040148). This is the most important one to lock down — left
--            open, any authenticated (or anon) caller could invoke
--            /rest/v1/rpc/fn_auto_disable_inactive_accounts on demand and force
--            a bulk account-disable pass outside the scheduled 02:00 job.
-- Depends on: 20260824035808 (is_admin/is_hr), 20260824035908 (guard trigger fn),
--             20260824040148 (auto-disable fn)

revoke execute on function public.is_admin(uuid) from public;
grant  execute on function public.is_admin(uuid) to authenticated, service_role;

revoke execute on function public.is_hr(uuid) from public;
grant  execute on function public.is_hr(uuid) to authenticated, service_role;

revoke execute on function public.fn_guard_profiles_protected_columns() from public, anon, authenticated;

revoke execute on function public.fn_auto_disable_inactive_accounts() from public, anon, authenticated;
