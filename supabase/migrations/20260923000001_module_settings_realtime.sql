-- Migration: 20260923000001_module_settings_realtime.sql
-- Purpose: Enable Supabase Realtime for the module visibility toggles so that a
--          change made on Administration > Settings > Modules (module_settings or
--          nav_item_settings) propagates live to every open client — the sidebar,
--          module hub, and the settings page itself — without a page refresh.
--          Mirrors the existing pattern used for public.task_alerts
--          (20260527000024_create_task_alerts.sql) and the planning sync tables
--          (20260806000002_create_msp_sync_tables.sql).

do $$
begin
  alter publication supabase_realtime add table public.module_settings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.nav_item_settings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;