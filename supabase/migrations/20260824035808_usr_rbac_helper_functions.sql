-- Migration: 20260824035808_usr_rbac_helper_functions.sql
-- Purpose: Add public.is_admin()/public.is_hr() SQL helper functions per
--          00-Master.md §7.2 / 04-Database-Schema.md §4. Formalizes the existing,
--          already-trusted union pattern (profiles.role OR user_roles.role_code)
--          used by getActorContext() in apps/web/app/api/hr/employees/[id]/route.ts
--          (HR_ROLE_CODES = {HR_Manager, admin}) and by user_audit_logs' inline RLS
--          check (20260606000002_user_management_gaps.sql). Every new policy in the
--          following USR migrations calls these instead of repeating the EXISTS
--          boilerplate.
-- Depends on: public.profiles (20260526_0001), public.user_roles (20260527000002)
--
-- Role-code set verified against apps/web/app/api/hr/employees/[id]/route.ts:
--   const HR_ROLE_CODES = new Set(["HR_Manager", "admin"]);
-- is_hr() below reproduces that exact set; is_admin() is the strict 'admin'-only
-- subset of it. Do not add roles to either set without updating that app-layer
-- constant to match, or the DB and API layers will silently diverge.

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = uid and ur.role_code = 'admin'
  );
$$;

create or replace function public.is_hr(uid uuid default auth.uid())
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role in ('admin', 'HR_Manager')
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = uid and ur.role_code in ('admin', 'HR_Manager')
  );
$$;

comment on function public.is_admin(uuid) is
  'RLS/trigger helper: true if uid has profiles.role = ''admin'' OR a user_roles '
  'row with role_code = ''admin''. Mirrors HR_ROLE_CODES-style union logic in '
  'apps/web/app/api/hr/employees/[id]/route.ts. See 00-Master.md §7.2.';

comment on function public.is_hr(uuid) is
  'RLS/trigger helper: true if uid has profiles.role IN (''admin'',''HR_Manager'') '
  'OR a matching user_roles.role_code. Matches HR_ROLE_CODES = {HR_Manager, admin} '
  'in apps/web/app/api/hr/employees/[id]/route.ts exactly — admin is deliberately '
  'included as an equivalent authority. See 00-Master.md §7.2.';

-- Functions are executable by PUBLIC by default; grant explicitly for clarity.
-- (Tightened further in 20260824040430_usr_lock_down_function_execute_grants.sql,
-- which revokes the PUBLIC/anon grant get_advisors flagged and keeps only
-- authenticated + service_role — authenticated genuinely needs EXECUTE here
-- because the RLS policies in 20260824035840 evaluate these functions.)
grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.is_hr(uuid) to authenticated, service_role;
