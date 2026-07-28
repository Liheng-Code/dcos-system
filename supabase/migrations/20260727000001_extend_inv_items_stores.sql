-- Migration: 20260727000001_extend_inv_items_stores.sql
-- Purpose: CWIMS Stage 1+2 gap-closure — extend inv_items and inv_stores with
--          DG/batch/shelf-life tracking on items, and broaden store typing +
--          capacity tracking on stores.
-- Depends on: inv_items, inv_stores (20260621000001_create_inv_module_tables.sql)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. inv_items — add DG / batch-management / shelf-life / barcode fields
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.inv_items
  add column if not exists barcode          text,
  add column if not exists is_dg            boolean not null default false,
  add column if not exists is_batch_managed boolean not null default false,
  add column if not exists shelf_life_days  integer;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. inv_stores — broaden store_type taxonomy + capacity tracking
--    Old taxonomy: ('main','sub','temporary')
--    New taxonomy: ('central','site','temporary','yard','dg')
--    Data migration: 'main' -> 'central', 'sub' -> 'site' (run before the
--    constraint swap so any existing rows never violate the new check).
-- ─────────────────────────────────────────────────────────────────────────────
update public.inv_stores set store_type = 'central' where store_type = 'main';
update public.inv_stores set store_type = 'site'    where store_type = 'sub';

alter table public.inv_stores drop constraint if exists inv_stores_type_check;

alter table public.inv_stores
  add constraint inv_stores_type_check
  check (store_type in ('central','site','temporary','yard','dg'));

alter table public.inv_stores
  add column if not exists capacity_qty numeric(18,4),
  add column if not exists capacity_uom text;
