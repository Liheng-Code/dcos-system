-- Migration: 20260722000007_dwl_phase6_freeze_qs_cost_items.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) §12.1 step 9 --
--          freeze qs_cost_items / qs_cost_divisions / qs_cost_sections
--          read-only. These three were EXCLUDED from
--          20260721000002_dwl_phase6_freeze_legacy_tables.sql because the
--          generic /api/procurement/[resource] proxy allow-listed them for
--          POST/PUT/DELETE via the service-role client, gated only on
--          "is any authenticated user" -- a table-level REVOKE would not
--          have blocked that path.
--
-- Unblocked by: deletion of apps/web/app/api/procurement/[resource]/route.ts
--               and .../[resource]/[id]/route.ts (2026-07-21, see
--               docs/03-Business-Modules/12-Quantity-Surveying/
--               09-Session-Status-DWL-BOQ-Integration.md item #1). No
--               resource is allow-listed via that pattern anymore -- the
--               proxy itself no longer exists, not just narrowed.
--
-- Verified clean (2026-07-21):
--   - No .insert()/.update()/.delete() against these three tables anywhere
--     in apps/web (qs-service.ts's getCostDivisions/getCostItems are
--     select-only; boq-builder.tsx only reads).
--   - The dedicated CRUD page (/dashboard/qs/cost-library) is deleted.
--   - No SECURITY DEFINER function writes to any of the three (grepped
--     supabase/migrations for "SECURITY DEFINER"; qs_audit_trigger_fn only
--     inserts into qs_audit_log, never into these tables).
--   - Data already migrated to dwl_work_items (%-split exploded into
--     dwl_work_item_resources) per
--     20260720000013_dwl_phase6_migrate_qs_cost_items.sql.
--
-- Not dropped -- retained as pre-migration audit trail, per SOP wording.

begin;

revoke insert, update, delete on public.qs_cost_items from anon, authenticated;
revoke insert, update, delete on public.qs_cost_divisions from anon, authenticated;
revoke insert, update, delete on public.qs_cost_sections from anon, authenticated;

comment on table public.qs_cost_items is
  'FROZEN READ-ONLY as of 20260722000007 (QS-SOP-002 §12.1 step 9). '
  'INSERT/UPDATE/DELETE revoked from anon and authenticated -- data fully '
  'migrated to dwl_work_items / dwl_work_item_resources '
  '(20260720000013_dwl_phase6_migrate_qs_cost_items.sql). Table retained as '
  'pre-migration audit trail, not dropped. Verified no application write '
  'path exists in apps/web as of 2026-07-21; the only reachable write path '
  '(the generic /api/procurement/[resource] proxy) was deleted, not just '
  'narrowed, on the same date.';

comment on table public.qs_cost_divisions is
  'FROZEN READ-ONLY as of 20260722000007 (QS-SOP-002 §12.1 step 9). '
  'INSERT/UPDATE/DELETE revoked from anon and authenticated -- data fully '
  'migrated to dwl_work_items. Table retained as pre-migration audit trail, '
  'not dropped. Verified no application write path exists in apps/web as of '
  '2026-07-21; the only reachable write path (the generic '
  '/api/procurement/[resource] proxy) was deleted, not just narrowed, on '
  'the same date.';

comment on table public.qs_cost_sections is
  'FROZEN READ-ONLY as of 20260722000007 (QS-SOP-002 §12.1 step 9). '
  'INSERT/UPDATE/DELETE revoked from anon and authenticated -- data fully '
  'migrated to dwl_work_items. Table retained as pre-migration audit trail, '
  'not dropped. Verified no application write path exists in apps/web as of '
  '2026-07-21; the only reachable write path (the generic '
  '/api/procurement/[resource] proxy) was deleted, not just narrowed, on '
  'the same date.';

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- STANDALONE NOTE -- unit_rate_library (SOP §12.1 step 9): NOT ACTED ON
-- IN THIS MIGRATION. Still has a live, actively-mounted write path:
-- apps/web/components/tenders/cost-estimation/unit-rates-tab.tsx performs
-- supabase.from("unit_rate_library").insert(...)/.delete()/.select()
-- directly, mounted at apps/web/app/dashboard/tenders/unit-rates/page.tsx.
-- This contradicts SOP §12.1's page-repoint table, which claims this page
-- was already repointed to dwl_v_work_item_rates -- it was not. Freezing
-- this table now would break a live, actively-used feature.
--
-- Decision needed (tracked in session status doc, item #2, second half):
-- either repoint unit-rates-tab.tsx to dwl_v_work_item_rates (matching
-- every other repointed page) before freezing, or explicitly decide to
-- leave unit_rate_library live/unmigrated for now. Not decided here.
-- ═══════════════════════════════════════════════════════════════════════
