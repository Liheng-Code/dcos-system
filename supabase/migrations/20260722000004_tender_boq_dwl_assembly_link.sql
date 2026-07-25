-- Migration: 20260722000004_tender_boq_dwl_assembly_link.sql
-- Purpose: QS-SOP-003 (Direct Works Cost Library <-> Tender BOQ Integration,
--          v0.3, "Ready for Build") Phase 9 Step 2 -- §4.1 and §4.2:
--            1. Add tender_boq_items.dwl_assembly_id (new FK -> dwl_assemblies)
--               so a BOQ line can be priced from an Assembly, not just a
--               Work Item.
--            2. One-library-source CHECK: a BOQ line's rate is sourced from
--               at most one of dwl_work_item_id / dwl_assembly_id, never
--               both.
--            3. Extend tender_boq_items.rate_source's CHECK to allow the
--               two new provenance values 'dwl_work_item' / 'dwl_assembly'
--               alongside the existing 'manual' / 'price_list'.
--            4. Purely additive columns on dwl_v_work_item_explosion
--               (work_item_id, resource_category) -- required before
--               QS-SOP-003 Phase 3 (§9) can build the snapshot procedure.
-- Depends on: dwl_assemblies (20260720000008_dwl_phase3_assemblies.sql),
--             dwl_work_items / dwl_work_item_resources / dwl_v_current_prices
--               / dwl_v_work_item_explosion (20260720000006_dwl_phase2_work_items.sql),
--             dwl_resources.category (20260720000003_dwl_phase1_resources.sql),
--             tender_boq_items.rate_source CHECK (20260711000006_tender_boq_items_qs_extension.sql),
--             tender_boq_items.dwl_work_item_id (20260720000016_dwl_phase6_shadow_columns.sql).
--
-- ═══════════════════════════════════════════════════════════════════════
-- Corrections made against the doc's illustrative SQL (verified before
-- writing, per the doc's own instruction that its SQL was never applied
-- and may not be exactly right) -- both flagged to the human in this
-- session's report, not silently changed:
--
-- 1. rate_source CHECK constraint name: this session has no live
--    Supabase-CLI/psql/DB-query access (same limitation documented in
--    20260721000001_repoint_tender_boq_items_unit_rate_id.sql -- neither
--    tool is on PATH and no exec_sql-style RPC exists). The doc's SQL
--    assumes the existing constraint is named
--    'tender_boq_items_rate_source_check'. That name IS what Postgres's
--    default auto-naming convention would produce for the inline,
--    unnamed column CHECK added by 20260711000006
--    ("... rate_source text not null default 'manual' check (rate_source
--    in ('manual','price_list'))" -- default pattern is
--    <table>_<column>_check), so it is very likely correct, but "very
--    likely" is not "verified" and this session cannot query
--    pg_constraint against the live remote project to confirm it. Rather
--    than assume, this migration locates the existing rate_source CHECK
--    dynamically via pg_attribute/pg_constraint (same technique
--    20260721000001 used for the unit_rate_id FK's unknown live name) and
--    drops whatever it is actually named, then adds the constraint back
--    under the doc's proposed name. If the live name already IS
--    'tender_boq_items_rate_source_check', this is a no-op-equivalent
--    drop+recreate; if it is something else, this migration still
--    produces the correct end state either way.
--
-- 2. dwl_v_work_item_explosion column order: the doc's §4.2 SQL places
--    `wi.id as work_item_id` FIRST and `r.category as resource_category`
--    in the MIDDLE of the existing column list (between resource_unit and
--    consumption). PostgreSQL's CREATE OR REPLACE VIEW requires the new
--    query to reproduce the existing output columns in the SAME NAMES AND
--    SAME ORDER and permits only ADDING columns at the END of the list --
--    inserting a column in the middle (or at the front) is rejected at
--    apply time. Applied literally, the doc's §4.2 SQL would fail. This
--    migration keeps all 12 existing columns in their exact original
--    order (work_item_code, sort_order, resource_code, resource_desc,
--    resource_unit, consumption, waste_pct, unit_price, line_cost,
--    source_type, is_expired, basis_note) and appends work_item_id and
--    resource_category as columns 13-14. This is the only ordering that
--    is both valid CREATE OR REPLACE VIEW syntax and satisfies the doc's
--    own "purely additive, does not change any existing consumer's
--    output" requirement (§4.2) -- confirmed against the one live
--    consumer, dwl-work-items-list-page.tsx (see below), which selects an
--    explicit column list and is unaffected by column position for named
--    (not positional) column access.
--
-- Verified directly against live source (not assumed) before writing this
-- migration:
--   - dwl_resources.category (text, check in ('material','labor',
--     'equipment','subcon')) -- confirmed in
--     20260720000003_dwl_phase1_resources.sql line ~40. The doc's join
--     target/column name for "resource_category" is correct as-is.
--   - dwl_v_work_item_explosion's only live consumer is
--     apps/web/components/qs/dwl-work-items-list-page.tsx, which queries
--     it with an explicit column list:
--       .select("work_item_code, sort_order, resource_code, resource_desc,
--                 resource_unit, consumption, waste_pct, unit_price,
--                 line_cost, source_type, is_expired, basis_note")
--     -- no `select *`, no positional access. Confirmed via repo-wide
--     grep for "dwl_v_work_item_explosion" (5 hits total: this migration
--     file's own source, the two doc files, dwl-types.ts's TS interface
--     mirroring the same 12 columns, and this consumer). Adding two
--     trailing columns cannot change this consumer's result set or break
--     its TS typing.
--
-- Idempotent: `add column if not exists`; one-library-source CHECK and
-- rate_source CHECK are both guarded via pg_constraint existence checks
-- before ADD CONSTRAINT (which has no native IF NOT EXISTS in PostgreSQL
-- 15); CREATE OR REPLACE VIEW is naturally idempotent.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- §4.1, item 1 -- new assembly-linkage column + index
-- ─────────────────────────────────────────────────────────────────────────
alter table public.tender_boq_items
  add column if not exists dwl_assembly_id uuid references public.dwl_assemblies(id);

create index if not exists idx_tender_boq_items_dwl_assembly
  on public.tender_boq_items(dwl_assembly_id);

-- ─────────────────────────────────────────────────────────────────────────
-- §4.1, item 2 -- one-library-source guard: a BOQ line is priced from at
-- most ONE library source (Work Item OR Assembly, never both). Manual /
-- price_list rows have neither set.
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tender_boq_items'::regclass
      and conname = 'tender_boq_items_one_library_source_chk'
  ) then
    alter table public.tender_boq_items
      add constraint tender_boq_items_one_library_source_chk
      check (dwl_work_item_id is null or dwl_assembly_id is null);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- §4.1, item 3 -- rate_source CHECK gains 'dwl_work_item' / 'dwl_assembly'.
-- Existing 'manual' / 'price_list' rows and behavior are completely
-- untouched -- only the allowed-values list is widened.
--
-- The live constraint's actual name cannot be queried from this session
-- (no psql/Supabase-CLI/DB-RPC access -- see header note above), so it is
-- located dynamically by column reference rather than assumed by name.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_constraint_name text;
  v_col_attnum smallint;
begin
  select attnum into v_col_attnum
  from pg_attribute
  where attrelid = 'public.tender_boq_items'::regclass
    and attname = 'rate_source'
    and not attisdropped;

  if v_col_attnum is null then
    raise exception 'tender_boq_items.rate_source column not found -- aborting rate_source CHECK replace';
  end if;

  select con.conname into v_constraint_name
  from pg_constraint con
  where con.contype = 'c'
    and con.conrelid = 'public.tender_boq_items'::regclass
    and con.conkey = array[v_col_attnum];

  -- Only drop if a rate_source CHECK exists AND it does not already allow
  -- 'dwl_assembly' (i.e. this migration has not already run) -- keeps a
  -- second run a true no-op instead of a needless drop+recreate.
  if v_constraint_name is not null
     and not exists (
       select 1 from pg_constraint
       where conname = v_constraint_name
         and conrelid = 'public.tender_boq_items'::regclass
         and pg_get_constraintdef(oid) ilike '%dwl_assembly%'
     )
  then
    execute format('alter table public.tender_boq_items drop constraint %I', v_constraint_name);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tender_boq_items'::regclass
      and conname = 'tender_boq_items_rate_source_check'
  ) then
    alter table public.tender_boq_items
      add constraint tender_boq_items_rate_source_check
      check (rate_source in ('manual', 'price_list', 'dwl_work_item', 'dwl_assembly'));
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- §4.2 -- dwl_v_work_item_explosion: purely additive columns, appended at
-- the end of the column list (see header note on CREATE OR REPLACE VIEW's
-- column-order requirement). All 12 existing columns, joins, filter, and
-- ORDER BY are byte-for-byte identical to
-- 20260720000006_dwl_phase2_work_items.sql's definition.
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.dwl_v_work_item_explosion
with (security_invoker = true)
as
select
  wi.code as work_item_code,
  wir.sort_order,
  r.code as resource_code,
  r.description as resource_desc,
  r.unit as resource_unit,
  wir.consumption,
  wir.waste_pct,
  cp.unit_price,
  round(wir.consumption * (1 + wir.waste_pct) * cp.unit_price, 4) as line_cost,
  cp.source_type,
  cp.is_expired,
  wir.basis_note,
  wi.id as work_item_id,           -- NEW (§4.2) -- appended, not inserted, to satisfy CREATE OR REPLACE VIEW's column-order rule
  r.category as resource_category  -- NEW (§4.2) -- dwl_resources.category, confirmed text/check('material','labor','equipment','subcon')
from public.dwl_work_items wi
join public.dwl_work_item_resources wir on wir.work_item_id = wi.id
join public.dwl_resources r on r.id = wir.resource_id
join public.dwl_v_current_prices cp on cp.resource_id = wir.resource_id
order by wi.code, wir.sort_order;

commit;
