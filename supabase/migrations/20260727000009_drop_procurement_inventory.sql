-- Migration: 20260727000009_drop_procurement_inventory.sql
-- Purpose: Retire the legacy procurement_inventory stub (migration 20260531000014).
-- It has been fully superseded by the Inventory module (Module 26 — INV):
-- inv_items / inv_stores / inv_stock / inv_movements etc.
-- Confirmed empty (0 rows) prior to this migration; the last two application
-- read/write paths (components/procurement/auto-reorder.tsx and
-- components/procurement/goods-receipt-form.tsx) were rewired off this table in the
-- same change that adds this migration, and the standalone
-- app/dashboard/procurement/inventory page that exposed it directly has been deleted.

drop table if exists public.procurement_inventory;
