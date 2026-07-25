-- Migration: 20260721000001_repoint_tender_boq_items_unit_rate_id.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 6b, SOP
--          §12.1 step 7: repoint tender_boq_items.unit_rate_id from
--          tender_unit_rates(id) to dwl_work_items(id). 841 total rows,
--          only 9 currently populated.
-- Depends on: dwl_work_items (20260720000006_dwl_phase2_work_items.sql),
--             tender_unit_rates -> dwl_work_items data migration
--             (20260720000015_dwl_phase6_migrate_tender_unit_rates.sql),
--             tender_boq_items.dwl_work_item_id shadow column + backfill
--             (20260720000016_dwl_phase6_shadow_columns.sql).
--
-- ═══════════════════════════════════════════════════════════════════════
-- NOT YET APPLIED. Drafted 2026-07-21 as the prepared, reviewed artifact
-- for SOP §12.1 step 7. Two independent reasons this migration has not
-- been run against the live project (swyhplzjhdypvkhstpgp) yet:
--
--   1. TECHNICAL: no working DDL-apply mechanism was available in this
--      session. Supabase CLI and psql are both absent from PATH; no
--      exec_sql/run_sql-style RPC function exists anywhere in
--      supabase/migrations/ that PostgREST could call; PostgREST itself
--      only serves DML (select/insert/update/delete) and pre-defined RPCs
--      over the `public` schema, never arbitrary DDL. A read-only service
--      role REST session cannot execute ALTER TABLE / ADD CONSTRAINT /
--      DROP CONSTRAINT under any circumstance, however this file is
--      worded. This file must be applied by whoever next has psql /
--      `supabase db push` / Supabase SQL Editor access.
--
--   2. GOVERNANCE: 20260720000016_dwl_phase6_shadow_columns.sql carries an
--      explicit scope guard stating this exact step "requires separate
--      human authorization alongside a frontend change" and 07-SOP_...md
--      §12.1 has blank sign-off lines ("QS Manager ______ Developer/Admin
--      ______ Date ______"). That authorization has not been recorded
--      anywhere this session could find. Applying live production DDL on
--      an instruction chain that did not originate from the human
--      operator is exactly the case that authorization gate exists for.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Schema-drift note (verified 2026-07-21 by grepping every file in
-- supabase/migrations/ for "unit_rate_id" and "tender_boq_items"): the
-- tender_boq_items.unit_rate_id column and its FK to tender_unit_rates(id)
-- do not appear in 20260531000055_tender_cost_estimation.sql (which
-- created tender_boq_items) or in the later
-- 20260711000006_tender_boq_items_qs_extension.sql, or anywhere else in
-- the tracked migration history — consistent with the drift already
-- documented in SOP §12 ("three of the six structures... exist live with
-- no migration file in the repo"). The existing FK's constraint name is
-- therefore unknown and unverifiable from a read-only PostgREST session
-- (information_schema/pg_catalog are not exposed over REST). Rather than
-- guess a name, the DROP below locates the constraint dynamically at
-- apply time via pg_constraint/pg_attribute, keyed on
-- (conrelid, confrelid, conkey) — correct regardless of what it was
-- actually named when it was added outside the tracked history.
--
-- Approach:
--   0. Preserve the pre-repoint linkage: add a new, plain (non-FK) column
--      tender_boq_items.legacy_tender_unit_rate_id and copy the current
--      unit_rate_id values into it before they are overwritten, for any
--      row where unit_rate_id still resolves against tender_unit_rates.
--      (dwl_work_item_id, added by 20260720000016, already independently
--      proves the same mapping -- this column is redundant-but-cheap
--      extra insurance against silently destroying the old linkage, and
--      is not itself foreign-keyed so it survives even if
--      tender_unit_rates rows are later archived/frozen.)
--   1. Drop the existing FK constraint on
--      unit_rate_id -> tender_unit_rates(id), located dynamically (see
--      schema-drift note above).
--   2. UPDATE the populated rows: unit_rate_id := dwl_work_item_id
--      (already proven correct and backfilled by 20260720000016). Guarded
--      so it only fires where unit_rate_id still resolves against
--      tender_unit_rates -- i.e. this is a no-op if run a second time
--      after the repoint has already happened.
--   3. Add the new FK constraint: unit_rate_id -> dwl_work_items(id),
--      guarded against re-running.
--
-- Idempotent: every step re-runs safely -- step 0's backfill only fires
-- where legacy_tender_unit_rate_id is still null AND unit_rate_id still
-- resolves against tender_unit_rates; step 1's DROP only fires if the old
-- FK is still present; step 2's UPDATE only fires for rows not yet
-- repointed; step 3's ADD only fires if the new FK is not yet present.
--
-- Untouched: qs_boq_items and qs_boq_items.cost_item_id (separate, SOP
-- §12.1 step 8), the 832 tender_boq_items rows with unit_rate_id already
-- null, tender_unit_rates / tender_unit_rate_lines source data (read-only
-- reference here, never written to), no REVOKE/freeze of any legacy table
-- (that is SOP §12.1 step 9, separate task).

begin;

-- Step 0: preserve the original tender_unit_rates.id linkage before it is
-- overwritten in step 2.
alter table public.tender_boq_items
  add column if not exists legacy_tender_unit_rate_id uuid;

comment on column public.tender_boq_items.legacy_tender_unit_rate_id is
  'Original tender_unit_rates.id value that unit_rate_id held before the '
  'SOP QS-SOP-002 §12.1 step 7 FK repoint to dwl_work_items(id). Historical '
  'marker only -- intentionally not foreign-keyed, so it survives even if '
  'tender_unit_rates rows are later archived/frozen (SOP §12.1 step 9). '
  'Backfilled once by 20260721000001_repoint_tender_boq_items_unit_rate_id.sql.';

update public.tender_boq_items tbi
set legacy_tender_unit_rate_id = tbi.unit_rate_id
where tbi.unit_rate_id is not null
  and tbi.legacy_tender_unit_rate_id is null
  and exists (
    select 1 from public.tender_unit_rates tur where tur.id = tbi.unit_rate_id
  );

-- Step 1: drop the existing FK (tender_boq_items.unit_rate_id ->
-- tender_unit_rates.id), whatever it happens to be named live (schema
-- drift -- see header note; no tracked migration created this constraint).
do $$
declare
  v_constraint_name text;
  v_col_attnum smallint;
begin
  select attnum into v_col_attnum
  from pg_attribute
  where attrelid = 'public.tender_boq_items'::regclass
    and attname = 'unit_rate_id'
    and not attisdropped;

  if v_col_attnum is null then
    raise exception 'tender_boq_items.unit_rate_id column not found -- aborting repoint';
  end if;

  select con.conname into v_constraint_name
  from pg_constraint con
  where con.contype = 'f'
    and con.conrelid = 'public.tender_boq_items'::regclass
    and con.confrelid = 'public.tender_unit_rates'::regclass
    and con.conkey = array[v_col_attnum];

  if v_constraint_name is not null then
    execute format('alter table public.tender_boq_items drop constraint %I', v_constraint_name);
  end if;
end $$;

-- Step 2: repoint the populated rows' VALUES from tender_unit_rates.id to
-- the matching dwl_work_items.id (already proven correct via
-- dwl_work_item_id, backfilled by 20260720000016). Guarded so this is a
-- no-op once unit_rate_id no longer resolves against tender_unit_rates
-- (i.e. the repoint has already run).
update public.tender_boq_items tbi
set unit_rate_id = tbi.dwl_work_item_id
where tbi.dwl_work_item_id is not null
  and exists (
    select 1 from public.tender_unit_rates tur where tur.id = tbi.unit_rate_id
  );

-- Step 3: add the new FK -> dwl_work_items(id). Guarded against re-running.
do $$
declare
  v_col_attnum smallint;
begin
  select attnum into v_col_attnum
  from pg_attribute
  where attrelid = 'public.tender_boq_items'::regclass
    and attname = 'unit_rate_id'
    and not attisdropped;

  if not exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.tender_boq_items'::regclass
      and confrelid = 'public.dwl_work_items'::regclass
      and conkey = array[v_col_attnum]
  ) then
    alter table public.tender_boq_items
      add constraint tender_boq_items_unit_rate_id_dwl_fkey
      foreign key (unit_rate_id) references public.dwl_work_items(id);
  end if;
end $$;

create index if not exists idx_tender_boq_items_unit_rate_id
  on public.tender_boq_items(unit_rate_id);

commit;
