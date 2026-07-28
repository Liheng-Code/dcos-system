-- Migration: 20260725000009_seed_nav_procurement_groups_2.sql
-- Purpose: Add "Cost Management", "Receiving & Settlement", and "Administration"
--          sub-group headings under the Procurement module in nav_item_settings.
--
-- Depends on: public.nav_item_settings (20260724000003),
--             seed rows (20260724000004, 20260725000007, 20260725000008)

-- Cost Management group (sort_order 3, before BOQ)
INSERT INTO public.nav_item_settings (nav_key, module_key, node_type, label, is_active, sort_order)
VALUES ('group:procurement:cost_management', 'procurement', 'group', 'Cost Management', true, 3)
ON CONFLICT (nav_key) DO UPDATE SET
  label = EXCLUDED.label,
  node_type = EXCLUDED.node_type;

-- Receiving & Settlement group (sort_order 14, before Goods Receipt)
INSERT INTO public.nav_item_settings (nav_key, module_key, node_type, label, is_active, sort_order)
VALUES ('group:procurement:receiving', 'procurement', 'group', 'Receiving & Settlement', true, 14)
ON CONFLICT (nav_key) DO UPDATE SET
  label = EXCLUDED.label,
  node_type = EXCLUDED.node_type;

-- Administration group (sort_order 16, before Notifications)
INSERT INTO public.nav_item_settings (nav_key, module_key, node_type, label, is_active, sort_order)
VALUES ('group:procurement:administration', 'procurement', 'group', 'Administration', true, 16)
ON CONFLICT (nav_key) DO UPDATE SET
  label = EXCLUDED.label,
  node_type = EXCLUDED.node_type;
