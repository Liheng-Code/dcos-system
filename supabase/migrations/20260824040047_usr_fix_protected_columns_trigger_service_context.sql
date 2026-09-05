-- Migration: 20260824040047_usr_fix_protected_columns_trigger_service_context.sql
-- Purpose: Fix a bug in fn_guard_profiles_protected_columns() (20260824035908):
--          the trigger only exempted `auth.role() = 'service_role'`, but any SQL
--          executed outside of a PostgREST/GoTrue request context — a migration
--          run via the Management API / SQL editor as the `postgres` superuser, or
--          a pg_cron job body (public.fn_auto_disable_inactive_accounts(), added
--          in 20260824040148) — has NO request.jwt.claims at all, so auth.role()
--          and auth.uid() both evaluate to NULL. That made is_admin(NULL)/
--          is_hr(NULL) false and the trigger rejected the write outright.
--          Caught live: the departments_fk backfill migration failed with the
--          trigger's own "not permitted" exception. Left unfixed, this would also
--          have silently broken the pg_cron auto-disable job at 02:00 daily.
-- Depends on: public.fn_guard_profiles_protected_columns() (20260824035908)
--
-- Fix: also exempt when auth.uid() is null, i.e. there is no JWT-derived actor at
-- all. This is safe — it does not open a hole for real end-user traffic: every
-- profiles RLS policy that allows UPDATE is scoped `to authenticated`, so the anon
-- role never has a matching policy and never reaches this trigger with rows to
-- update in the first place; and any real `authenticated` session always carries a
-- resolvable `sub` claim, so auth.uid() is only null for direct
-- superuser/migration/pg_cron execution — exactly the trusted-context class this
-- trigger is meant to let through.
--
-- Verified live against the actual production RLS + trigger stack (transactional
-- tests, rolled back, no permanent data changes):
--   - authenticated self-edit of a non-protected column (full_name): allowed.
--   - authenticated non-admin editing another user's row: 0 rows affected (RLS).
--   - authenticated self-edit of a protected column (role): rejected, 42501.
--   - authenticated admin editing another user's account_status: allowed.
--   - anon attempting any update: 0 rows affected (no anon policy exists).
--   - service_role context changing role + account_status: allowed (trigger
--     exemption confirmed working end-to-end, not just by code inspection).

create or replace function public.fn_guard_profiles_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if public.is_admin(auth.uid()) or public.is_hr(auth.uid()) then
    return new;
  end if;

  if new.role            is distinct from old.role
     or new.account_status is distinct from old.account_status
     or new.status          is distinct from old.status
     or new.department_id   is distinct from old.department_id
     or new.email            is distinct from old.email
     or new.user_code        is distinct from old.user_code
  then
    raise exception 'You are not permitted to change role, account_status, status, department_id, email, or user_code on this record.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
