-- Migration: 20260724000005_reorder_procurement_pr_rfq.sql
-- Purpose: Move "Purchase Requisitions" above "RFQs" in the Procurement sidebar
--          section, matching the reordered entries in apps/web/lib/nav-item-catalog.ts
--          and apps/web/components/dashboard/sidebar.tsx.
-- Depends on: nav_item_settings seed (20260724000004_seed_nav_item_settings.sql)

UPDATE public.nav_item_settings SET sort_order = 8 WHERE nav_key = '/dashboard/procurement/pr';
UPDATE public.nav_item_settings SET sort_order = 9 WHERE nav_key = '/dashboard/procurement/rfq';
