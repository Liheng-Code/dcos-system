-- Migration: 20260721000002_dwl_phase6_freeze_legacy_tables.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) -- SOP §12.1 step 9:
--          freeze legacy rate/cost tables read-only for the app-facing roles
--          now that steps 1-7 (data migration + tender_boq_items.unit_rate_id
--          repoint) are done and verified. Tables are NOT dropped -- they
--          remain the audit trail for pre-migration data, per SOP wording:
--          "do not drop them -- they remain the audit trail for
--          pre-migration data."
-- Depends on: 20260720000011..000015 (dwl_phase6_migrate_* data migrations),
--             20260721000001_repoint_tender_boq_items_unit_rate_id.sql
--             (tender_boq_items.unit_rate_id now FKs dwl_work_items).
--
-- ═══════════════════════════════════════════════════════════════════════
-- SCOPE -- read this before applying.
--
-- Of the 8 tables named in the task brief, only 6 are frozen by this file.
-- Two are EXCLUDED because a live, non-dead-code write path was found
-- against them during verification (grep of apps/web + direct DB
-- introspection of live grants/functions on project swyhplzjhdypvkhstpgp,
-- 2026-07-21). Freezing them here would either (a) silently break a
-- feature that still writes to them, or (b) give false confidence, since
-- the write path does not go through the anon/authenticated grant this
-- migration revokes. See the reporting note at the end of this header.
--
-- INCLUDED (frozen -- INSERT/UPDATE/DELETE revoked from anon, authenticated):
--   1. rate_libraries
--   2. company_rate_library, company_rate_library_lines
--   3. tender_unit_rates, tender_unit_rate_lines
--   4. tender_price_list_items
--
-- EXCLUDED (verification found a live write path -- flagged, not frozen):
--   - unit_rate_library
--       apps/web/components/tenders/cost-estimation/unit-rates-tab.tsx
--       still does supabase.from("unit_rate_library").insert(...) and
--       .delete(...) directly, mounted live at
--       apps/web/app/dashboard/tenders/unit-rates/page.tsx. This
--       contradicts SOP §12.1's page-repoint table, which lists this page
--       as already repointed to dwl_v_work_item_rates -- it is not. In
--       addition, apps/web/app/api/procurement/[resource]/route.ts and
--       .../[resource]/[id]/route.ts allow-list "unit_rate_library" for
--       POST/PUT/DELETE via createAdminClient() (service_role), gated only
--       on "is any authenticated user" -- no role check. A REVOKE on
--       anon/authenticated would not even block that second path, since it
--       runs as service_role.
--   - qs_cost_items, qs_cost_divisions, qs_cost_sections
--       No direct .insert/.update/.delete against these three in
--       apps/web/lib/qs-service.ts (getCostDivisions/getCostItems there are
--       select-only, confirming the boq-builder.tsx read path is safe) and
--       the dedicated CRUD page (/dashboard/qs/cost-library) is confirmed
--       deleted. BUT the same generic
--       apps/web/app/api/procurement/[resource]/route.ts allow-list also
--       includes "qs_cost_items", "qs_cost_sections", "qs_cost_divisions"
--       for POST/PUT/DELETE via the service-role admin client. No current
--       frontend caller was found hitting that route for these three
--       resource names, but the route is live, deployed code (not dead
--       code) reachable by any authenticated user today, and -- again --
--       a table-level REVOKE on anon/authenticated would not block it.
--
-- Recommendation for the orchestrator: either close the generic
-- /api/procurement/[resource] allow-list for these four table names (and
-- retire/repoint unit-rates/page.tsx) before re-attempting the freeze on
-- them, or accept that a table-level REVOKE gives no real protection here
-- and choose a different control (e.g. remove them from ALLOWED_RESOURCES,
-- delete unit-rates-tab.tsx now that unit_rate_library data is migrated).
--
-- RESIDUAL RISK on the 2 tables that ARE frozen below and also appear in
-- SECURITY DEFINER functions:
--   public.recalc_from_price_item(uuid) and public.recalc_from_unit_rate(uuid)
--   are SECURITY DEFINER and UPDATE tender_unit_rates / tender_unit_rate_lines
--   internally (confirmed via pg_get_functiondef). SECURITY DEFINER functions
--   execute with the owner's privileges, not the caller's -- a table-level
--   REVOKE from anon/authenticated does NOT stop them. Neither function has
--   any caller anywhere in apps/web (grepped; no .rpc("recalc_from_price_item"
--   or "recalc_from_unit_rate") and no DB trigger invokes them either -- only
--   ordinary set_updated_at triggers exist on these tables), so they are
--   dead code from the app's perspective today. But both still carry
--   EXECUTE granted to anon AND authenticated (confirmed via
--   information_schema.routine_privileges), meaning either role could call
--   them directly over PostgREST's /rpc/ endpoint right now and write to
--   tender_unit_rates/tender_unit_rate_lines regardless of the table REVOKE
--   below. This migration also revokes EXECUTE on both functions from
--   anon/authenticated (see final section) so the freeze on those two
--   tables is not cosmetic. public.create_bid_snapshot(uuid) was checked
--   too: it only reads these legacy tables and writes into snap_* tables,
--   so it needs no change.
--
-- tender_price_list (SOP's separate "retire" candidate) is DELIBERATELY
-- NOT touched by this migration -- see the standalone note after the
-- REVOKE statements below. It is NOT a candidate for freeze or drop.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ── 1. unit_rate_library -> dwl_work_items ──────────────────────────────
-- EXCLUDED. See header. Left fully writable pending orchestrator decision.

-- ── 2. rate_libraries -> dwl_resources / dwl_resource_prices ────────────
-- Verified clean: no reference anywhere in apps/web (its only UI,
-- /dashboard/qs/rate-libraries/page.tsx, was already deleted; grep for
-- "rate_libraries" across apps/web returns no hits at all).
revoke insert, update, delete on public.rate_libraries from anon, authenticated;

comment on table public.rate_libraries is
  'FROZEN READ-ONLY as of 20260721000002 (QS-SOP-002 SOP-QS-002 Direct '
  'Works Cost Library Module, §12.1 step 9). INSERT/UPDATE/DELETE revoked '
  'from anon and authenticated -- data fully migrated to dwl_resources / '
  'dwl_resource_prices. Table retained as pre-migration audit trail, not '
  'dropped. Its only UI writer (/dashboard/qs/rate-libraries) has been '
  'deleted; verified no other write path exists in apps/web as of '
  '2026-07-21.';

-- ── 3. qs_cost_items / qs_cost_divisions / qs_cost_sections ─────────────
-- EXCLUDED. See header (generic /api/procurement/[resource] allow-list).
-- Left fully writable pending orchestrator decision. Their SELECT-only
-- read path (getCostItems/getCostDivisions in qs-service.ts, consumed by
-- components/qs/boq-builder.tsx) is completely unaffected either way,
-- since this migration never touches SELECT grants.

-- ── 4. company_rate_library / company_rate_library_lines -> dwl_work_items / dwl_work_item_resources ──
-- Verified clean: no reference anywhere in apps/web outside docs.
revoke insert, update, delete on public.company_rate_library from anon, authenticated;
revoke insert, update, delete on public.company_rate_library_lines from anon, authenticated;

comment on table public.company_rate_library is
  'FROZEN READ-ONLY as of 20260721000002 (QS-SOP-002 §12.1 step 9). '
  'INSERT/UPDATE/DELETE revoked from anon and authenticated -- data fully '
  'migrated to dwl_work_items (20260720000014_dwl_phase6_migrate_company_rate_library.sql). '
  'Table retained as pre-migration audit trail, not dropped. Verified no '
  'application write path exists in apps/web as of 2026-07-21.';

comment on table public.company_rate_library_lines is
  'FROZEN READ-ONLY as of 20260721000002 (QS-SOP-002 §12.1 step 9). '
  'INSERT/UPDATE/DELETE revoked from anon and authenticated -- data fully '
  'migrated to dwl_work_item_resources (20260720000014_dwl_phase6_migrate_company_rate_library.sql). '
  'Table retained as pre-migration audit trail, not dropped. Verified no '
  'application write path exists in apps/web as of 2026-07-21.';

-- ── 5. tender_unit_rates / tender_unit_rate_lines -> dwl_work_items / dwl_work_item_resources ──
-- Verified clean of direct app-layer writes in apps/web. See header for the
-- SECURITY DEFINER caveat (recalc_from_price_item / recalc_from_unit_rate),
-- addressed below via EXECUTE revocation on those two functions.
revoke insert, update, delete on public.tender_unit_rates from anon, authenticated;
revoke insert, update, delete on public.tender_unit_rate_lines from anon, authenticated;

comment on table public.tender_unit_rates is
  'FROZEN READ-ONLY as of 20260721000002 (QS-SOP-002 §12.1 step 9). '
  'INSERT/UPDATE/DELETE revoked from anon and authenticated -- data fully '
  'migrated to dwl_work_items (20260720000015_dwl_phase6_migrate_tender_unit_rates.sql). '
  'Table retained as pre-migration audit trail, not dropped. Verified no '
  'application write path exists in apps/web as of 2026-07-21; EXECUTE also '
  'revoked from anon/authenticated on the SECURITY DEFINER functions '
  'recalc_from_price_item()/recalc_from_unit_rate() which could otherwise '
  'write to this table regardless of this REVOKE (see below).';

comment on table public.tender_unit_rate_lines is
  'FROZEN READ-ONLY as of 20260721000002 (QS-SOP-002 §12.1 step 9). '
  'INSERT/UPDATE/DELETE revoked from anon and authenticated -- data fully '
  'migrated to dwl_work_item_resources (20260720000015_dwl_phase6_migrate_tender_unit_rates.sql). '
  'Table retained as pre-migration audit trail, not dropped. Verified no '
  'application write path exists in apps/web as of 2026-07-21; EXECUTE also '
  'revoked from anon/authenticated on the SECURITY DEFINER function '
  'recalc_from_price_item() which could otherwise write to this table '
  'regardless of this REVOKE (see below).';

-- ── 6. tender_price_list_items -> dwl_resources / dwl_resource_prices ───
-- Verified clean: no reference anywhere in apps/web. The SECURITY DEFINER
-- function recalc_from_price_item() reads this table (join/subquery) and
-- writes an audit-log row that names it in a text column, but never
-- performs INSERT/UPDATE/DELETE against the table itself -- confirmed via
-- pg_get_functiondef. No change needed on that function for this table's
-- sake (the EXECUTE revoke below is driven by its writes to
-- tender_unit_rates/tender_unit_rate_lines, not by anything it does to
-- this table).
revoke insert, update, delete on public.tender_price_list_items from anon, authenticated;

comment on table public.tender_price_list_items is
  'FROZEN READ-ONLY as of 20260721000002 (QS-SOP-002 §12.1 step 9). '
  'INSERT/UPDATE/DELETE revoked from anon and authenticated -- data fully '
  'migrated to dwl_resources / dwl_resource_prices '
  '(20260720000015_dwl_phase6_migrate_tender_unit_rates.sql covered the '
  'price-list-item portion of that migration). Table retained as '
  'pre-migration audit trail, not dropped. Verified no application write '
  'path exists in apps/web as of 2026-07-21. NOT to be confused with '
  'tender_price_list (distinct table, still live -- see the standalone '
  'note below; do not apply this same treatment to it).';

-- ── Close the SECURITY DEFINER loophole on the two tables frozen above ──
-- Both functions are unreachable from the app today (no .rpc() caller
-- anywhere in apps/web, no DB trigger invokes them), so revoking EXECUTE
-- changes no live behavior. Without this, anon/authenticated could still
-- call these RPCs directly over PostgREST and write to tender_unit_rates /
-- tender_unit_rate_lines even after the table-level REVOKE above, because
-- SECURITY DEFINER functions run with the function owner's privileges, not
-- the caller's. postgres/service_role retain EXECUTE (unaffected) for any
-- legitimate admin/back-office use.
-- Both functions exist only in production (no migration declares them), so
-- guard on existence to keep a fresh local DB (supabase start) replayable.
do $$
begin
  if to_regprocedure('public.recalc_from_price_item(uuid)') is not null then
    revoke execute on function public.recalc_from_price_item(uuid) from anon, authenticated;
  end if;
  if to_regprocedure('public.recalc_from_unit_rate(uuid)') is not null then
    revoke execute on function public.recalc_from_unit_rate(uuid) from anon, authenticated;
  end if;
end
$$;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- STANDALONE NOTE -- tender_price_list (SOP §12.1 step 9, "retire" clause):
-- NOT ACTED ON IN THIS MIGRATION. Confirmed via
-- `supabase db query --linked "select count(*) from tender_price_list"`
-- (2026-07-21) that it still has 0 live rows, matching the SOP's row count.
-- However the SOP's characterization of it as "superseded in practice by
-- tender_price_list_items" and safe to retire is WRONG on the write-path
-- evidence found here: tender_price_list is a DIFFERENT table from
-- tender_price_list_items, and it is the live, actively-mounted backing
-- table for the "Price List" tab of
-- apps/web/app/dashboard/tenders/cost-estimation/page.tsx (PriceListTab is
-- imported and rendered there today, not dead code). Its full CRUD --
-- getPriceList, createPriceListItem, updatePriceListItem,
-- deletePriceListItem, bulkInsertPriceList, pullFromUnitRateLibrary -- all
-- read/write apps/web/lib/tender-cost-service.ts's "tender_price_list"
-- table, live, right now. 0 rows here most likely means no tender in this
-- environment has used the Price List tab yet, not that the feature is
-- dead or superseded.
--
-- Recommendation: do NOT freeze and do NOT drop tender_price_list under
-- this task. Flag to the orchestrator/QS Manager that SOP §12 misidentifies
-- this table's status, and that the "retire tender_price_list" action item
-- in §12.1 step 9 should be corrected or dropped from the SOP rather than
-- executed, unless the Price List tab is independently deprecated first.
-- ═══════════════════════════════════════════════════════════════════════
