-- Migration: 20260725000007_seed_nav_suppliers_group.sql
-- Purpose: Add a "Suppliers" sub-group heading under the Procurement module in
--          nav_item_settings so the admin "Manage navigation items" dialog can
--          toggle the group on/off. The parent-child nesting is defined purely
--          in the frontend catalog (nav-item-catalog.ts parentGroupKey) and the
--          sidebar component (FolderHeader navKey prop), not in this table.
--
-- Depends on: public.nav_item_settings (20260724000003),
--             seed rows (20260724000004)

-- Insert the group heading (sort_order 4, before the leaf items at 4-7)
INSERT INTO public.nav_item_settings (nav_key, module_key, node_type, label, is_active, sort_order)
VALUES ('group:procurement:suppliers', 'procurement', 'group', 'Suppliers', true, 4)
ON CONFLICT (nav_key) DO UPDATE SET
  label = EXCLUDED.label,
  node_type = EXCLUDED.node_type;
