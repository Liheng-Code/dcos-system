-- Sidebar module visibility in one request (performance).
-- usePermittedModules (apps/web/hooks/use-permitted-modules.ts) used to make ~30 requests in 4-5 sequential rounds
-- on every page load (a role_permissions count per RBAC code, then getUserPermissions per code), and the dashboard
-- layout waits for it. This returns the same three facts in one call. SECURITY INVOKER: the tables are readable by
-- every authenticated user (policies *_select_all), so the result is what the client computed before.
--   has_role: the user has a user_roles row or a legacy profiles.role
--   seeded:   codes in p_codes that have any role_permissions row (for any role)
--   granted:  codes in p_codes where one of the user's user_roles has a role_permissions row
--             (user_roles only, as getUserPermissions in apps/web/lib/permissions.ts)

create or replace function public.current_user_module_access(p_codes text[])
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with my_roles as (
    select ur.role_code from public.user_roles ur where ur.user_id = auth.uid()
  )
  select jsonb_build_object(
    'has_role',
      exists (select 1 from my_roles)
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role is not null),
    'seeded',
      coalesce((select jsonb_agg(distinct rp.module) from public.role_permissions rp where rp.module = any (p_codes)), '[]'::jsonb),
    'granted',
      coalesce((select jsonb_agg(distinct rp.module) from public.role_permissions rp
                where rp.module = any (p_codes) and rp.role_code in (select role_code from my_roles)), '[]'::jsonb)
  );
$$;

revoke all on function public.current_user_module_access(text[]) from public, anon;
grant execute on function public.current_user_module_access(text[]) to authenticated;
