-- Migration: 20260725000010_seed_nav_overview_group.sql
-- Purpose: Add "Overview" sub-group heading under the Procurement module.
--
-- Depends on: public.nav_item_settings (20260724000003)

INSERT INTO public.nav_item_settings (nav_key, module_key, node_type, label, is_active, sort_order)
VALUES ('group:procurement:overview', 'procurement', 'group', 'Overview', true, 1)
ON CONFLICT (nav_key) DO UPDATE SET
  label = EXCLUDED.label,
  node_type = EXCLUDED.node_type;
