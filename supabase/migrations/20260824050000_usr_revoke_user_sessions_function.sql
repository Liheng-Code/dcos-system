-- Migration: 20260824050000_usr_revoke_user_sessions_function.sql
-- Purpose: Fix broken admin-triggered session revocation. The existing code (both
--          apps/web/app/api/hr/employees/[id]/route.ts's pre-existing revoke logic and the
--          new Phase 3 ACCOUNT_STATUS_ACTIONS/change-password code that reused its pattern
--          for consistency) calls `supabase.auth.admin.signOut(userId)`.
--
--          Confirmed against the installed @supabase/auth-js SDK
--          (node_modules/@supabase/auth-js/dist/main/GoTrueAdminApi.js) and Supabase's own
--          docs (https://supabase.com/docs/reference/swift/auth-admin-signout: "Signs out a
--          specific user by revoking their session(s), using that user's access token
--          (JWT)."): `signOut(jwt, scope)` requires the TARGET'S OWN ACCESS TOKEN as its
--          first argument, not a user id. An admin acting on someone else's account never
--          has that token. Passing a raw profile UUID produces an invalid bearer token, the
--          call fails, and none of the four call sites checked/surfaced the error — so
--          "suspend/lock/disable revokes active sessions" has been silently not happening.
--
--          Supabase's documented mechanism for this exact case ("How to ensure an access
--          token (JWT) cannot be used after a user signs out",
--          https://supabase.com/docs/guides/auth/sessions): sessions live in `auth.sessions`;
--          deleting a user's rows there immediately prevents further refresh. Note this is
--          the SAME practical guarantee a correctly-used signOut(jwt) call would have given —
--          Supabase access tokens are stateless/self-verifying, so no standard mechanism
--          invalidates an already-issued, not-yet-expired JWT instantly. This migration
--          closes the "further refresh" gap; it does not add per-request account_status
--          checking (a separate, larger architectural addition, out of scope here — flagged
--          for a future pass if millisecond-level revocation is ever required).
--
-- Depends on: public.is_admin(uuid) / public.is_hr(uuid) not required here — this function
--             is service_role-only, called exclusively from trusted backend code that has
--             already performed its own actor/permission check before invoking it.

create or replace function public.revoke_user_sessions(
  target_user_id uuid,
  except_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions
  where user_id = target_user_id
    and (except_session_id is null or id <> except_session_id);
end;
$$;

comment on function public.revoke_user_sessions(uuid, uuid) is
  'Admin-only. Deletes auth.sessions rows for target_user_id (optionally excluding one '
  'session id, for "sign out everywhere except here" flows like self-service change-password). '
  'Immediately prevents further token refresh for the revoked sessions; the caller''s current '
  'access token (if any) still runs until its own natural expiry. Replaces the broken '
  'auth.admin.signOut(userId) pattern previously used at every admin-triggered revoke call '
  'site. See docs/04-Business-Modules/02-USR-User-Management/00-Master.md and the Phase 3 '
  'final report for the full analysis.';

-- Powerful, unauthenticated-argument action (any target_user_id) — service_role only. Callers
-- (backend API routes using createAdminClient()) are responsible for their own actor/admin
-- checks before invoking this; the function itself does not re-check who is calling.
revoke all on function public.revoke_user_sessions(uuid, uuid) from public;
revoke all on function public.revoke_user_sessions(uuid, uuid) from anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid, uuid) to service_role;
