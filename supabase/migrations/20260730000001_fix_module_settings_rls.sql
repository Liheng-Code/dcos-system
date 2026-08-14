-- Fix RLS on module_settings and nav_item_settings: allow ALL authenticated users
-- to READ; only admins can write. Previously the SELECT policies also required
-- admin role, which hid every module (including Design) from non-admin users.

-- Module settings: allow all authenticated users to read
drop policy if exists "Admins can read module_settings" on public.module_settings;
create policy "Anyone can read module_settings"
  on public.module_settings for select
  using (auth.role() = 'authenticated');

-- Nav item settings: allow all authenticated users to read
drop policy if exists "Admins can read nav_item_settings" on public.nav_item_settings;
create policy "Anyone can read nav_item_settings"
  on public.nav_item_settings for select
  using (auth.role() = 'authenticated');
