-- Migration: 20260720000016_dwl_phase6_shadow_columns.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 6, SHADOW
--          COLUMNS ONLY (explicitly NOT the FK cutover — see scope guard
--          below). Adds two new NULLABLE columns:
--            tender_boq_items.dwl_work_item_id uuid references dwl_work_items(id)
--            qs_boq_items.dwl_work_item_id     uuid references dwl_work_items(id)
--          and backfills tender_boq_items.dwl_work_item_id for the 9 rows
--          that already have unit_rate_id set, by following
--          unit_rate_id -> tender_unit_rates -> the matching migrated
--          dwl_work_items row (20260720000015).
--
-- ═══════════════════════════════════════════════════════════════════════
-- CRITICAL SCOPE GUARD — read before touching this file again:
-- Do NOT modify, drop, or retarget tender_boq_items.unit_rate_id (FK to
-- tender_unit_rates) or qs_boq_items.cost_item_id (FK to qs_cost_items).
-- Supabase PostgREST resolves the currently-deployed frontend's
-- embedded-relationship queries (qs-service.ts, tender-cost-service.ts,
-- e.g. `.select('*, qs_cost_items(...)')`) through those live FK
-- constraints. Changing what they point to, without a coordinated
-- frontend deploy, breaks the BOQ Builder and tender cost estimation
-- screens in production immediately. That coordinated cutover (SOP
-- §12.1 step 7-8, "repoint tender_boq_items.unit_rate_id / decide on
-- qs_boq_items.cost_item_id") is explicitly OUT OF SCOPE here and
-- requires separate human authorization alongside a frontend change.
-- This migration ONLY adds new, additional, nullable columns — the
-- existing unit_rate_id and cost_item_id columns and their FK
-- constraints are completely untouched.
-- ═══════════════════════════════════════════════════════════════════════
--
-- qs_boq_items has 0 live rows (verified 2026-07-20) — nothing to
-- backfill there; the column is added ready for future use only. Its
-- dormant-vs-live status remains explicitly unresolved (SOP §12.1 step 8)
-- — not deprecated, not assumed dead, not touched beyond adding this
-- column.
--
-- Idempotent: `add column if not exists`; backfill guarded by
-- `where dwl_work_item_id is null` so re-running is a safe no-op.

-- Production already has tender_boq_items.unit_rate_id (FK to
-- tender_unit_rates) but no earlier migration declares it, so a fresh local
-- DB (supabase start) lacks it. Add it when missing; no-op on production.
alter table public.tender_boq_items
  add column if not exists unit_rate_id uuid references public.tender_unit_rates(id);

alter table public.tender_boq_items
  add column if not exists dwl_work_item_id uuid references public.dwl_work_items(id);

alter table public.qs_boq_items
  add column if not exists dwl_work_item_id uuid references public.dwl_work_items(id);

create index if not exists idx_tender_boq_items_dwl_work_item on public.tender_boq_items(dwl_work_item_id);
create index if not exists idx_qs_boq_items_dwl_work_item on public.qs_boq_items(dwl_work_item_id);

-- Backfill: the 9 tender_boq_items rows with unit_rate_id set, resolved via
-- the tender_unit_rates provenance marker (robust against the '-TUR'
-- disambiguation suffix applied to 6 of the 9 migrated work items).
update public.tender_boq_items tbi
set dwl_work_item_id = wi.id
from public.tender_unit_rates tur
join public.dwl_work_items wi
  on left(wi.method_note, length('Migrated from tender_unit_rates.code=''' || tur.code || ''''))
     = 'Migrated from tender_unit_rates.code=''' || tur.code || ''''
where tbi.unit_rate_id = tur.id
  and tbi.dwl_work_item_id is null;
