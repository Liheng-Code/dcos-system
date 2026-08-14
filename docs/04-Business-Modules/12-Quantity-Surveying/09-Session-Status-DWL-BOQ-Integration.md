# Session Status — Direct Works Library ↔ Tender BOQ Integration

**Date:** 2026-07-21
**Scope covered:** QS-SOP-002 Phase 6b (legacy cutover) + QS-SOP-003 (library-to-BOQ integration, all 4 build phases) + a critical security finding discovered along the way.

---

## 1. Where things stand right now

### Done and verified live
- **QS-SOP-002 Phase 6b** (legacy cutover): `tender_boq_items.unit_rate_id` repointed to `dwl_work_items`; 6 legacy rate tables frozen read-only; legacy CRUD pages removed.
- **QS-SOP-003 Phase 9, all 4 steps** — the Direct Works Cost Library is now actually usable from the Tender BOQ tab, not just built in isolation:
  1. `LibraryRatePicker` component (search/browse Work Items + Assemblies).
  2. DB: `tender_boq_items.dwl_assembly_id` column, one-library-source CHECK, `rate_source` widened to allow `dwl_work_item`/`dwl_assembly`, `dwl_v_work_item_explosion` view exposes `work_item_id`/`resource_category`.
  3. "Add from Library" wired into `boq-tab.tsx`, with the §5 snapshot procedure (Work Item vs. Assembly) and §6.2 margin bucketing.
  4. Staleness badges (library-expired vs. rate-drifted, kept visually distinct), "Refresh from Library" (built as its own preview/commit pair so cancel = no write), the BR9 10% equipment/subcontract pick-time warning, and the `qs_audit_log` trigger attached to `tender_boq_items`.
- **A pre-existing, unrelated production bug found and fixed along the way**: `tender_boq_items` was missing `rate_source`/`price_list_item_id` — columns the live app code depended on for every "Add Item"/import action. Root-caused (untracked drift, not a code bug) and restored.

### SQL files you needed to run — **zero pending right now**
Every migration from this session's work is applied and confirmed live:

| Migration | Who applied it | Status |
|---|---|---|
| `20260722000004_tender_boq_dwl_assembly_link.sql` | Me (CLI) | ✅ Applied, verified |
| `20260722000005_restore_tender_boq_items_rate_source_drift.sql` | **You** (SQL editor) | ✅ Applied, verified, tracking reconciled |
| `20260722000006_qs_audit_tender_boq_items.sql` | Me (CLI) | ✅ Applied, verified |

**Separately, pre-existing and NOT part of this work stream**: `supabase migration list` shows 3 older local migration files still unapplied remotely — `20260722000001_tender_provisional_sums_dayworks.sql`, `20260722000002_tender_submission_rbac.sql`, `20260722000003_tender_exclude_items.sql`. These were already sitting in the repo before this session started; I have not touched, reviewed, or applied them. Flagging for your awareness only — not something you need to act on unless you want them investigated too.

---

## 2. Remaining / open tasks

### ✅ Closed
**`/api/procurement/[resource]` authorization gap — fully resolved (2026-07-21), not just mitigated.** Originally a generic CRUD proxy covering 113 tables (finance, HSE, contracts, subcontracts, tender awards, QS, procurement) using the service-role Supabase client with only an "is someone logged in" check — no role/permission check at all. Investigation confirmed only one real caller existed in the whole app (`deleteBidSummary` → `tender_bid_summaries`), and — worse — found that ~all the higher-risk tables already have permissive `USING (true)` RLS policies anyway, so the underlying exposure was bigger than this one route.

**What happened:**
1. ✅ Narrowed `ALLOWED_RESOURCES` in both route files down to just `tender_bid_summaries` (mechanical first pass).
2. ✅ Opened a tracked, separate follow-up for systemic RLS remediation: see [DCOS-RLS-Security-Remediation-Tracker.md](../../01-DCOS-Foundation/DCOS-RLS-Security-Remediation-Tracker.md). Direct grep found the exposure larger than first estimated — 377 `USING (true)` policies across 231 tables in 48 migration files (vs. the earlier "282+/56+" approximation). Owner and priority sequencing confirmed 2026-07-21 (see §below) — the actual remediation phases (ADR, per-domain fixes) are a separate, much larger effort not started here.
3. ✅ **Decided and executed:** no resource comes back via this proxy pattern at all — the generic proxy itself was the anti-pattern (112 of 113 allow-listed resources had zero real callers; it was speculative surface area, not feature-driven). Found that `tender_bid_summaries`' other CRUD (`createBidSummaryRevision`, `updateBidSummary`) already called the Supabase client directly, and the table already has a permissive `using (true)` delete policy (`20260711000010_tender_module_delete_policies.sql`) — so the proxy indirection wasn't even load-bearing for its one real caller. Rewrote `deleteBidSummary()` in `tender-cost-service.ts` to call the client directly, matching its siblings, and **deleted both proxy route files** (`apps/web/app/api/procurement/[resource]/route.ts` and `.../[resource]/[id]/route.ts`) along with the now-empty `api/procurement/` directory. Zero remaining code references confirmed via grep.
   - **Policy for the future:** if a genuine need arises for a new resource's CRUD API, build a small dedicated route for that resource alone, with explicit role/permission checks — gated on that specific table's RLS having been remediated (per the tracker), not on the whole 231-table tracker finishing.
   - **Noted, not fixed here:** the bid-summary delete button in `bid-summary-tab.tsx` isn't gated by `can(...)` the way create/submit are — pre-existing UI-level gap, unrelated to the proxy, flagged for awareness only.

### ✅ Closed (half) / 🟡 Needs a decision (other half)
**Fate of `unit_rate_library` + `qs_cost_items` family.**
- ✅ **`qs_cost_items` / `qs_cost_divisions` / `qs_cost_sections` — frozen read-only (2026-07-21).** These were excluded from the original Phase 6 freeze (`20260721000002`) solely because the now-deleted procurement proxy allow-listed them for service-role writes. With that proxy gone (item #1) and no other write path found anywhere in `apps/web` (verified: only `select` reads in `qs-service.ts`/`boq-builder.tsx`, CRUD page already deleted, no `SECURITY DEFINER` function touches them), freezing was unblocked and applied via `20260722000007_dwl_phase6_freeze_qs_cost_items.sql`. Verified live on `swyhplzjhdypvkhstpgp`: INSERT/UPDATE/DELETE revoked from `anon`/`authenticated` on all three tables.
- ✅ **`unit_rate_library` — decided: leave live, do not freeze or repoint now (2026-07-21).** This table has a genuinely live UI writer: `unit-rates-tab.tsx` does direct `.insert()`/`.delete()`/`.select()` against it, mounted at `/dashboard/tenders/unit-rates` and **linked in the main sidebar nav** (`sidebar.tsx:518`, "Unit Rate Library") — a real, discoverable feature, not dead code. This contradicts SOP §12.1's claim that this page was already repointed to `dwl_v_work_item_rates` — it was not. Investigated repointing it: `dwl_work_items` is a recipe model (rate = sum of resource-line consumption × price via `dwl_v_work_item_rates`), not a flat rate field, so "repoint" would mean rebuilding "Add Rate" as a full work-item + resource-recipe creation flow — a real feature redesign, not a form swap. Decision: don't fold that into this session. Leave `unit_rate_library` live and writable; track "redesign Unit Rate Library screen against DWL" as its own separate, properly-scoped future task (candidate for `frontend-engineer`/`system-architect`) if it's ever prioritized. SOP §12.1's page-repoint table should be corrected to reflect this page was never actually repointed.
- **SOP's incorrect claim that `tender_price_list` is dead/retirable.** ✅ Already corrected in the SOP doc (see closed items above).

### ✅ Closed — documentation fixes
- QS-SOP-003 §7.4's claim that `qs_audit_log` was attached to "5 tables" before this work corrected to the actual 13 (now 14 with `tender_boq_items`), with sourcing per migration file.
- SOP's incorrect claim that `tender_price_list` is dead/retirable corrected (it's live, backs the Price List tab) — in both the migration table and the step-9 sequencing text.
- SOP's page-repoint table corrected to reflect `unit-rates-tab.tsx` was never actually repointed to `dwl_v_work_item_rates` (see item above).

### ✅ Closed — dayworks/provisional-sums
- **`dayworks-tab.tsx` / `provisional-sums-tab.tsx` missing-functions issue — resolved by deletion (2026-07-21).** Scoping found the feature was ~90% built (matching DB migration, matching RBAC seed migration, complete UI) but never wired into the cost-estimation page's tab list, and the 8 backing functions/types were never added to `tender-cost-service.ts` — confirmed via grep, not `git diff` (repo has no commit history to diff against). Decision: delete rather than complete. Removed: `apps/web/components/tenders/cost-estimation/dayworks-tab.tsx`, `provisional-sums-tab.tsx`, and their two unapplied migrations `20260722000001_tender_provisional_sums_dayworks.sql` / `20260722000002_tender_submission_rbac.sql`. Both migrations were unapplied remotely, so no live schema needed rollback. This also clears the 48 pre-existing `tsc` errors those two components caused.

### ✅ Closed — RLS tracker ownership
- Tracker owner and priority ordering confirmed 2026-07-21 (see [DCOS-RLS-Security-Remediation-Tracker.md](../../01-DCOS-Foundation/DCOS-RLS-Security-Remediation-Tracker.md) header/§6). Owning the tracker is not the same as authorizing the remediation work itself — the ADR and per-domain fixes remain future, explicitly-triggered follow-on work, not started here.

---

## 3. Status

**Every item originally tracked in this document is now closed.** Nothing outstanding requires a decision from this session's scope. The only forward-looking, explicitly-deferred items (tracked elsewhere, not forgotten):
- RLS tracker's actual remediation phases (ADR + per-domain fixes) — owned and sequenced, not yet triggered.
- `unit_rate_library` / DWL redesign — flagged as a future, separately-scoped feature task, not started.
