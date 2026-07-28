-- Migration: 20260727000007_register_inventory_module.sql
-- Purpose: CWIMS Stage 1+2 gap-closure — register the Inventory module in module_settings
--          so it can be toggled/ordered in the sidebar like every other top-level module.
-- Depends on: module_settings (20260720000001_create_module_settings.sql)
--
-- Sort order: existing modules occupy 1-11 (project=1 ... administration=11), with
-- 'qs' already holding 7. Rather than renumber every existing row (which would touch
-- rows other modules may already depend on for display order), Inventory is appended
-- at 12 — the next free slot. This is additive/idempotent and safe to re-run.

insert into public.module_settings (module_key, display_name, description, is_active, sort_order)
values (
  'inventory',
  'Inventory',
  'Warehouses, stock, GRN, requisitions, transfers, tools, and adjustments',
  true,
  12
)
on conflict (module_key) do nothing;
