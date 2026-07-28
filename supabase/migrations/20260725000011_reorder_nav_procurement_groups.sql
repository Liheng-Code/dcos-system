-- Migration: 20260725000011_reorder_nav_procurement_groups.sql
-- Purpose: Swap sort_order of "Suppliers" and "Cost Management" groups so
--          Suppliers appears before Cost Management (suppliers must be set up
--          before cost planning).
--
-- Depends on: nav_item_settings seed rows (20260724000004, 20260725000007, 20260725000009)

-- Suppliers group: sort 4 → 3
UPDATE public.nav_item_settings
SET sort_order = 3
WHERE nav_key = 'group:procurement:suppliers';

-- Cost Management group: sort 3 → 4
UPDATE public.nav_item_settings
SET sort_order = 4
WHERE nav_key = 'group:procurement:cost_management';
