-- Migration: 20260725000008_seed_nav_procurement_groups.sql
-- Purpose: Add "Sourcing & Ordering" and "Inventory" sub-group headings under
--          the Procurement module in nav_item_settings so the admin "Manage
--          navigation items" dialog can toggle them on/off.
--
-- Depends on: public.nav_item_settings (20260724000003),
--             seed rows (20260724000004, 20260725000007)

-- Sourcing & Ordering group (sort_order 8, before RFQs at 8+)
INSERT INTO public.nav_item_settings (nav_key, module_key, node_type, label, is_active, sort_order)
VALUES ('group:procurement:sourcing', 'procurement', 'group', 'Sourcing & Ordering', true, 8)
ON CONFLICT (nav_key) DO UPDATE SET
  label = EXCLUDED.label,
  node_type = EXCLUDED.node_type;

-- Inventory group (sort_order 11, before Inventory at 11+)
INSERT INTO public.nav_item_settings (nav_key, module_key, node_type, label, is_active, sort_order)
VALUES ('group:procurement:inventory', 'procurement', 'group', 'Inventory', true, 11)
ON CONFLICT (nav_key) DO UPDATE SET
  label = EXCLUDED.label,
  node_type = EXCLUDED.node_type;
