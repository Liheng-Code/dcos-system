-- Migration: 20260815000001_relocate_stakeholders_nav_to_project.sql
-- Purpose: The Stakeholders page moved from Administration to Project (route changed
--          from /dashboard/administration/stakeholders to /dashboard/stakeholders, and
--          it is no longer admin-gated). Update the nav_item_settings row in place so
--          any admin customization of its visibility survives the relocation, instead
--          of being orphaned under the old nav_key (which would silently reset to
--          visible, since a missing row defaults to is_active = true).
-- Depends on: 20260724000004_seed_nav_item_settings.sql

update public.nav_item_settings
set nav_key = '/dashboard/stakeholders',
    module_key = 'project',
    sort_order = 5
where nav_key = '/dashboard/administration/stakeholders';
