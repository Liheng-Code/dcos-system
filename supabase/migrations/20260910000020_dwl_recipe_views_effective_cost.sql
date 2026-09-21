-- Migration: 20260910000020_dwl_recipe_views_effective_cost.sql
-- Purpose: Material Specification & Price Recording (DCOS-DS-12-012), Phase C-I
--          — the GATED switch of the Direct Works recipe rate views from the
--          basic quoted price (dwl_v_current_prices.unit_price) to the
--          landed effective unit cost
--          (coalesce(effective_unit_cost, unit_price)).
--
-- ─────────────────────────────────────────────────────────────────────────
-- THIS MIGRATION MOVES MONEY. Read before applying.
--
-- After this runs, every value derived from a Level-2 recipe changes:
--   * dwl_v_work_item_rates.net_direct_rate
--   * dwl_v_work_item_explosion.unit_price / line_cost
--   * dwl_v_assembly_rates.net_direct_rate      (reads work-item rates)
--   * dwl_v_project_estimate.amount             (reads assembly rates)
--   * every Tender BOQ line that pulled a rate from dwl_v_work_item_*
--
-- Rows whose current price has no cost breakdown (all breakdown columns 0,
-- e.g. every price seeded before Phase C-D and every market_survey/estimate
-- quick-entry) are UNCHANGED: effective_unit_cost == unit_price for them,
-- and coalesce() is a no-op. Only prices entered with a real
-- discount/delivery/handling/tax breakdown move, and they move UP by the
-- net landed cost.
--
-- REQUIRED BEFORE APPLYING (QS-SOP-002 §16 / DCOS-DS-12-012 §3 D3):
--   1. QS Manager sign-off, recorded separately from the C-A..C-H sign-off.
--   2. Re-run the QS-SOP-002 Phase-2 "cascade" acceptance test
--      (07-SOP_Direct_Works_Cost_Library_Module.md §8 Step 2.5, test 2)
--      and record the rate movement for the reference work item 03.02.010.
--   3. Snapshot or note the pre-migration net_direct_rate for the top ~20
--      work items so the movement is auditable.
--
-- ROLLBACK: re-apply the two view bodies from
--   20260720000006_dwl_phase2_work_items.sql (dwl_v_work_item_rates) and
--   20260722000004_tender_boq_dwl_assembly_link.sql (dwl_v_work_item_explosion)
--   verbatim — they are `create or replace view` and self-contained. The
--   pre-C-I bodies use `cp.unit_price` directly where this migration uses
--   `coalesce(cp.effective_unit_cost, cp.unit_price)`; nothing else differs.
--
-- Depends on: 20260910000004_dwl_resource_prices_effective_cost.sql
--   (dwl_v_current_prices.effective_unit_cost column), 20260720000006,
--   20260722000004.
-- Non-idempotent in effect only in that re-running is harmless (same bodies).
-- ─────────────────────────────────────────────────────────────────────────

-- ── dwl_v_work_item_rates ────────────────────────────────────────────────
-- Byte-for-byte the 20260720000006 body; the ONLY change is
--   cp.unit_price  ->  coalesce(cp.effective_unit_cost, cp.unit_price)
-- inside the sum(). Column list, joins, filter and GROUP BY are unchanged,
-- so CREATE OR REPLACE VIEW accepts it.
create or replace view public.dwl_v_work_item_rates
with (security_invoker = true)
as
select
  wi.id as work_item_id,
  wi.code,
  wi.boq_section,
  wi.description,
  wi.unit,
  sum(wir.consumption * (1 + wir.waste_pct) * coalesce(cp.effective_unit_cost, cp.unit_price)) as net_direct_rate,
  bool_or(cp.is_expired) as has_expired_price,
  count(*) as recipe_lines
from public.dwl_work_items wi
join public.dwl_work_item_resources wir on wir.work_item_id = wi.id
join public.dwl_v_current_prices cp on cp.resource_id = wir.resource_id
where wi.is_active
group by wi.id, wi.code, wi.boq_section, wi.description, wi.unit;

comment on view public.dwl_v_work_item_rates is
  'Direct Works Level-2 live work-item rate. Since DCOS-DS-12-012 Phase C-I '
  '(20260910000020) net_direct_rate is built on the landed effective unit '
  'cost = coalesce(dwl_v_current_prices.effective_unit_cost, unit_price), '
  'not the basic quoted price.';

-- ── dwl_v_work_item_explosion ────────────────────────────────────────────
-- Byte-for-byte the 20260722000004 body (14 columns incl. the §4.2
-- work_item_id / resource_category additions). Changes:
--   * the `unit_price` column now returns the effective unit cost
--     (coalesce(effective_unit_cost, unit_price)) so the build-up screen
--     stays internally consistent: unit x consumption x (1+waste) = line_cost.
--     The column keeps the name `unit_price` to satisfy CREATE OR REPLACE
--     VIEW; post-C-I it means "unit cost used for costing".
--   * line_cost uses the same effective figure.
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
  coalesce(cp.effective_unit_cost, cp.unit_price) as unit_price,
  round(wir.consumption * (1 + wir.waste_pct) * coalesce(cp.effective_unit_cost, cp.unit_price), 4) as line_cost,
  cp.source_type,
  cp.is_expired,
  wir.basis_note,
  wi.id as work_item_id,
  r.category as resource_category
from public.dwl_work_items wi
join public.dwl_work_item_resources wir on wir.work_item_id = wi.id
join public.dwl_resources r on r.id = wir.resource_id
join public.dwl_v_current_prices cp on cp.resource_id = wir.resource_id
order by wi.code, wir.sort_order;

comment on view public.dwl_v_work_item_explosion is
  'Direct Works Level-2 rate build-up (one row per recipe line). Since '
  'DCOS-DS-12-012 Phase C-I the `unit_price` column and `line_cost` are '
  'built on the landed effective unit cost, not the basic quoted price.';
