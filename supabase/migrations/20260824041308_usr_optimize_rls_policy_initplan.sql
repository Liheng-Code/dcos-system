-- Migration: 20260824041308_usr_optimize_rls_policy_initplan.sql
-- Purpose: Fix a performance advisory (auth_rls_initplan, WARN) raised by
--          get_advisors against profiles_update_self_or_admin
--          (20260824035840): calling auth.uid()/is_admin()/is_hr() directly in a
--          USING/WITH CHECK clause makes Postgres re-evaluate them once per row
--          instead of once per query. Supabase's documented fix is to wrap the
--          call in a scalar subquery — `(select auth.uid())` — so the planner can
--          treat it as an initplan and evaluate it once. See
--          https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
--          Only profiles_update_self_or_admin was actually flagged (profiles has
--          the most rows of the four tables touched by 20260824035840), but the
--          same fix is applied to the roles/role_permissions/user_roles
--          admin-only policies here too, proactively, so they don't start
--          generating the same warning as those tables grow. This changes
--          evaluation strategy only — the access-control semantics from
--          00-Master.md §7.3 are unchanged.
-- Depends on: 20260824035840_usr_tighten_core_rls.sql

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()) or (select public.is_hr()))
  with check (id = (select auth.uid()) or (select public.is_admin()) or (select public.is_hr()));

drop policy if exists "roles_admin_write" on public.roles;
create policy "roles_admin_write" on public.roles
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "roles_admin_update" on public.roles;
create policy "roles_admin_update" on public.roles
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "roles_admin_delete" on public.roles;
create policy "roles_admin_delete" on public.roles
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "role_permissions_admin_write" on public.role_permissions;
create policy "role_permissions_admin_write" on public.role_permissions
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "role_permissions_admin_update" on public.role_permissions;
create policy "role_permissions_admin_update" on public.role_permissions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "role_permissions_admin_delete" on public.role_permissions;
create policy "role_permissions_admin_delete" on public.role_permissions
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "user_roles_admin_write" on public.user_roles;
create policy "user_roles_admin_write" on public.user_roles
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "user_roles_admin_update" on public.user_roles;
create policy "user_roles_admin_update" on public.user_roles
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "user_roles_admin_delete" on public.user_roles;
create policy "user_roles_admin_delete" on public.user_roles
  for delete to authenticated using ((select public.is_admin()));
