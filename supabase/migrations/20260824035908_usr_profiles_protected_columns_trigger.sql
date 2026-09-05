-- Migration: 20260824035908_usr_profiles_protected_columns_trigger.sql
-- Purpose: BEFORE UPDATE trigger on profiles enforcing the column-level self-edit
--          restriction from 00-Master.md §7.4 / 04-Database-Schema.md §6. RLS's
--          UPDATE policy (previous migration) allows a user to update their own
--          row, but cannot restrict which columns within it change — this trigger
--          closes that gap regardless of which client issues the write (the
--          dominant pattern in this codebase is direct-Supabase-client writes from
--          React components, so app-layer-only enforcement would protect only the
--          one form that happens to omit these fields from its payload).
--
--          NOTE: the service-role/no-JWT-context exemption below was found to be
--          incomplete on first apply — see 20260824040047, applied immediately
--          after this one, which fixes it. This file is kept as originally written
--          for an accurate forward-only history; do not treat this version's
--          exemption logic as final on its own.
-- Depends on: public.is_admin(uuid), public.is_hr(uuid) (20260824035808),
--             public.profiles.account_status (20260824035735)
--
-- service_role exemption — verified, not assumed:
--   apps/web/lib/supabase/server.ts createAdminClient() builds a supabase-js
--   client using SUPABASE_SERVICE_ROLE_KEY as both apikey and bearer token. That
--   key is itself a JWT with a `role: service_role` claim. PostgREST authenticates
--   such requests as the Postgres `service_role` role and populates
--   request.jwt.claim(s) accordingly, so auth.role() (the standard Supabase helper,
--   confirmed present in this project: select coalesce(nullif(current_setting(
--   'request.jwt.claim.role', true), ''), current_setting('request.jwt.claims',
--   true)::jsonb ->> 'role')) correctly returns 'service_role' for every call made
--   through createAdminClient() — including the existing LIFECYCLE_ACTIONS handler
--   in apps/web/app/api/hr/employees/[id]/route.ts and the future
--   ACCOUNT_STATUS_ACTIONS/invite/activation endpoints (Phase 3), all of which use
--   createAdminClient(). Triggers fire regardless of RLS bypass, so this exemption
--   must be explicit here — it is not automatic just because service_role bypasses
--   RLS at the policy level.

create or replace function public.fn_guard_profiles_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service-role traffic (our own trusted backend/admin-client routes) must remain
  -- unaffected — see verification note above.
  if auth.role() = 'service_role' then
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

comment on function public.fn_guard_profiles_protected_columns() is
  'BEFORE UPDATE guard on profiles: rejects changes to role/account_status/status/'
  'department_id/email/user_code from any actor that is neither service_role nor '
  'is_admin()/is_hr(). Complements (does not replace) the profiles_update_self_or_admin '
  'RLS policy, which decides which ROWS a self-edit may touch; this trigger decides '
  'which COLUMNS within that row. See 00-Master.md §7.4.';

drop trigger if exists trg_guard_profiles_protected_columns on public.profiles;
create trigger trg_guard_profiles_protected_columns
  before update on public.profiles
  for each row execute function public.fn_guard_profiles_protected_columns();
