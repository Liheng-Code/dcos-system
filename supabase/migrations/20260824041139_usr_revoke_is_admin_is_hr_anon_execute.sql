-- Migration: 20260824041139_usr_revoke_is_admin_is_hr_anon_execute.sql
-- Purpose: Complete the fix started in 20260824040430. get_advisors still flagged
--          is_admin(uuid)/is_hr(uuid) as callable by the `anon` role after that
--          migration. Root cause: this Supabase project has a default privilege
--          rule (ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon,
--          authenticated, service_role) that grants EXECUTE to anon explicitly and
--          independently of the PUBLIC grant — confirmed via
--          `select proacl from pg_proc where proname = 'is_admin'`, which showed
--          `anon=X/postgres` even after `revoke ... from public`. `revoke ...
--          from public` alone was therefore insufficient; anon must be revoked
--          explicitly, same as was already done correctly for
--          fn_guard_profiles_protected_columns() and
--          fn_auto_disable_inactive_accounts() in 20260824040430.
--          There is no legitimate reason for the unauthenticated anon role to
--          call either helper.
-- Depends on: public.is_admin(uuid), public.is_hr(uuid) (20260824035808)

revoke execute on function public.is_admin(uuid) from anon;
revoke execute on function public.is_hr(uuid) from anon;
