-- Migration: 20260722000005_restore_tender_boq_items_rate_source_drift.sql
-- Purpose: Close production schema drift on public.tender_boq_items --
--          rate_source and price_list_item_id are defined in
--          20260711000006_tender_boq_items_qs_extension.sql (same commit as
--          the app code in apps/web/lib/tender-cost-service.ts that reads/
--          writes them) but were confirmed ABSENT on the live table
--          (project swyhplzjhdypvkhstpgp, confirmed via information_schema
--          against the CLI-linked project matching the app's own
--          NEXT_PUBLIC_SUPABASE_URL). createBoqItem() and
--          bulkInsertBoqItems() unconditionally include both columns in
--          every insert -- every real "Add Item" and CSV import in the
--          live Tender BOQ tab has been failing with a Postgres
--          "42703 column does not exist" error since this code shipped.
--
-- Root cause (investigated, not assumed): a single multi-column
-- `alter table ... add column if not exists ...` statement in
-- 20260711000006 is atomic in Postgres -- labor_net_cost/material_net_cost
-- from that SAME statement are confirmed live, so the statement as written
-- cannot be what actually executed against production. git history shows
-- the migration file has never been edited since its one commit (a809528),
-- ruling out a post-hoc file edit. This matches an already-documented,
-- recurring pattern in this exact module: 20260720000002_reconcile_rate_
-- library_schema_drift.sql found five other tables live with no
-- corresponding migration file at all, and 20260721000001 found
-- tender_boq_items.unit_rate_id's original FK had no tracked migration
-- either. Most likely mechanism: production was hand-altered via the
-- Supabase SQL editor/dashboard around 2026-07-11 (truncated before
-- price_list_item_id/rate_source), and the migration version was later
-- marked applied in schema_migrations without the full statement having
-- actually run. is_manual_rate/sourcing/net_cost -- three columns that
-- exist live but appear in NO migration file and NO application code
-- anywhere in this repo -- are presumed leftover from an earlier, informal
-- prototype of this same concept; NOT touched or dropped here (unconfirmed
-- provenance, left as a separate follow-up decision, not this migration's
-- job).
--
-- Depends on: tender_boq_items (20260531000055_tender_cost_estimation.sql),
--             tender_price_list (20260711000005_tender_price_list.sql --
--             confirmed still live and distinct from tender_price_list_items
--             via a direct information_schema.tables check before writing
--             this file, so the FK target below is correct).
--
-- Idempotent: `add column if not exists` on both columns; the CHECK is
-- inline on the column definition and only applies at column-creation time,
-- so a second run is a no-op (the column already exists, IF NOT EXISTS
-- skips it, no re-validation is attempted).
--
-- Scope: restores ONLY the two originally-defined values ('manual',
-- 'price_list'), matching 20260711000006 exactly as designed. Widening
-- rate_source's CHECK to also allow 'dwl_work_item'/'dwl_assembly' is
-- QS-SOP-003's job (20260722000004_tender_boq_dwl_assembly_link.sql,
-- paused pending this fix) -- kept as a separate, independently-revertable
-- migration rather than folded in here.

alter table public.tender_boq_items
  add column if not exists price_list_item_id uuid references public.tender_price_list(id) on delete set null,
  add column if not exists rate_source         text not null default 'manual' check (rate_source in ('manual', 'price_list'));

create index if not exists idx_tbi_price_list_item on public.tender_boq_items(price_list_item_id);
