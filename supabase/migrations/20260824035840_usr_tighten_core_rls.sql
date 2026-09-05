-- Migration: 20260824035840_usr_tighten_core_rls.sql
-- Purpose: Replace the wide-open `USING (true) WITH CHECK (true)` policies on
--          profiles, roles, role_permissions, user_roles (added in
--          20260602000057_enable_rls_core_tables.sql, comment: "tighten once RBAC
--          finalised") with the policy shapes approved in 00-Master.md §7.3 /
--          04-Database-Schema.md §5. approval_thresholds carries the same wide-open
--          pattern from the same migration but is explicitly OUT OF SCOPE here —
--          not touched.
-- Depends on: public.is_admin(uuid), public.is_hr(uuid) (20260824035808)
--
-- profiles SELECT is deliberately left broad (see 04-Database-Schema.md §5 for the
-- full rationale) — Postgres RLS cannot restrict columns, only rows, and profiles
-- is read broadly across the whole platform today (assignee pickers, approver
-- dropdowns, WBS ownership, the sidebar's own isAdmin check) for non-sensitive
-- fields. Do not tighten this SELECT policy as part of "cleanup" — it is a
-- reviewed, deliberate decision, not an oversight.
--
-- Column-level self-edit restriction (blocking role/account_status/status/
-- department_id/email/user_code changes smuggled into a self "id = auth.uid()"
-- UPDATE) is enforced by the BEFORE UPDATE trigger added in the next migration
-- (20260824035908), not by RLS — RLS cannot express column-level restrictions.

-- ─── profiles ───────────────────────────────────────────────────────────────
drop policy if exists "profiles_authenticated_all" on public.profiles;

create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin() or public.is_hr())
  with check (id = auth.uid() or public.is_admin() or public.is_hr());

-- No INSERT policy for `authenticated` (default deny): row creation happens only
-- via handle_new_user() (SECURITY DEFINER, bypasses RLS) or the service-role admin
-- client used by backend API routes (also bypasses RLS).
-- No DELETE policy for `authenticated` (default deny): matches SOP §19 "never
-- deleted" — use status/account_status transitions, not row deletion.

-- ─── roles ──────────────────────────────────────────────────────────────────
drop policy if exists "roles_authenticated_all" on public.roles;

create policy "roles_select_all" on public.roles
  for select to authenticated using (true);

create policy "roles_admin_write" on public.roles
  for insert to authenticated with check (public.is_admin());

create policy "roles_admin_update" on public.roles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "roles_admin_delete" on public.roles
  for delete to authenticated using (public.is_admin());

-- ─── role_permissions ───────────────────────────────────────────────────────
drop policy if exists "role_permissions_authenticated_all" on public.role_permissions;

create policy "role_permissions_select_all" on public.role_permissions
  for select to authenticated using (true);

create policy "role_permissions_admin_write" on public.role_permissions
  for insert to authenticated with check (public.is_admin());

create policy "role_permissions_admin_update" on public.role_permissions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "role_permissions_admin_delete" on public.role_permissions
  for delete to authenticated using (public.is_admin());

-- ─── user_roles ─────────────────────────────────────────────────────────────
drop policy if exists "user_roles_authenticated_all" on public.user_roles;

create policy "user_roles_select_all" on public.user_roles
  for select to authenticated using (true);

create policy "user_roles_admin_write" on public.user_roles
  for insert to authenticated with check (public.is_admin());

create policy "user_roles_admin_update" on public.user_roles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "user_roles_admin_delete" on public.user_roles
  for delete to authenticated using (public.is_admin());

-- approval_thresholds: intentionally untouched — same 20260602000057 wide-open
-- pattern, flagged separately per 00-Master.md §7.1, out of scope for this module.
