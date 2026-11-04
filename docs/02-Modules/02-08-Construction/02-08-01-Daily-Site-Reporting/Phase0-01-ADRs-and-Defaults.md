# Phase 0 — ADRs and Defaults

Status: **Proposed — awaiting owner confirmation.** Each decision below is my recommendation. Nothing in Phase 1A should start until Q1, Q2 and Q5 are confirmed.

> **Superseded in part.** Decisions were confirmed by the owner on 2026-10-04. Further corrections found while building Phase 1A (Telegram and edge functions already exist; ADR-4 spike not needed; ADR-5 uses the existing `EXT-SUB` role) are in `Phase1A-Delivery-Notes.md` §6.

## 0. Corrections to the earlier review

Checked against the repo while preparing Phase 0:

| Earlier statement | Correction |
|---|---|
| G14 "no test runner configured" | Wrong. Vitest is configured (`apps/web/vitest.config.ts`, `pnpm test`) with many tests, including `lib/construction/site/__tests__/daily-report-sync.test.ts`. What is missing is a **database/RLS test harness**. |
| R4 "`company_id` in a JWT hook" | Partly. Core tables (`projects`, `site_*`, `subcontracts`, `delay_register`) have **no tenant or company column**; they are scoped by `project_id` only. `company_id` is on `profiles`. |
| G15 RLS for externals | Worse than noted. All site tables and `delay_register` use `TO authenticated USING (true)`. Any logged-in user can read and write every project's reports. |
| R3 shared engines | Confirmed absent. No Supabase edge functions directory exists either. |

Consequence: the new module cannot "inherit" tenant isolation. It must carry its own RLS, and it needs a project-membership helper (see ADR-3).

---

## ADR-1 (Q1): New model beside the old one

**Decision:** Create `daily_report` / `daily_report_version` and the `dr_*` tables beside `site_daily_reports`. Migrate old data in, then retire the old tables and UI.

**Why:** The old row is mutable, deletable, one-per-project-per-date, has no unit and no version history, and its RLS is open. Making it immutable in place would break the planning RPCs and UI that depend on it, and a half-migrated table is worse than two clean ones.

**Consequences:** Two models coexist until cut-over (see `Phase0-04-Cutover-Plan.md`). Old tables are kept read-only after cut-over, never dropped in Phase 1.

## ADR-2 (Q2): Planning sync moves from submit to approval

**Decision:** `sync_daily_report_to_planning()` is re-pointed to run on approval of a version. It reads `verified` quantities where the PM adjusted them, otherwise reported. Until approval, nothing flows to `wbs_tasks`, `plan_productivity_logs` or `delay_register`.

**Why:** Reported ≠ verified (design D15). Today an unreviewed subcontractor figure can move schedule progress.

**Exception:** A delay event with `notice_required` creates a **potential delay** flag for Contract Admin at submission (design gap G9), but does not write `delay_register` until approval.

**Transition:** During the overlap, the old report keeps its current submit-time sync. The new model's sync is approval-time. A project is switched per project, never both.

## ADR-3 (Q3): Per-module tables behind a service interface

**Decision:** Build `dr_audit_log`, `dr_notifications` and the review/decision tables in the module, following the pattern of `qs_claim_approvals` / `qs_notifications` / `qs_audit_log`. Access them only through `lib/construction/daily-reporting/` interfaces (`AuditSink`, `Notifier`, `ReviewWorkflow`) so a future shared engine can replace them.

**Also decided:** Add one shared SQL helper, `public.dr_has_project_access(project_id, unit_id)`, used by every `dr_*` RLS policy. Do not copy the `USING (true)` pattern.

**Why:** No shared engine exists, and building one first would block this module.

## ADR-4 (Q4): Telegram session via edge function minting a Supabase session

**Decision:** An edge function validates `initData` (HMAC with the bot token, `auth_date` freshness) and the signed launch token, resolves the linked user, and returns a Supabase session for that user. Preferred mechanism: admin `generateLink` token exchanged client-side. Fallback: custom-signed JWT.

**Status:** Mechanism is **not yet proven**. See `Phase0-05-Spike-Findings.md`. It is a gate for Phase 1C only; Phase 1A and 1B do not depend on it.

## ADR-5 (Q5): Subcontractor reporters need real Supabase accounts

**Decision:** Subcontractor reporters are invited users with a `profiles` row and a `reporting_unit_member` row. `subcontracts.vendor_id` points to `procurement_suppliers`, and no external-user invite flow was found in the migrations.

**Open:** Confirm whether an external invite/login flow exists outside the migrations. If not, it is a Phase 1A prerequisite (account creation, expiry tied to `subcontracts.end_date`, restricted role).

---

## Defaults for open items (change any of these)

| # | Item | Default | Note |
|---|---|---|---|
| O1 | Deadline / cut-off | Deadline 18:00, reminder 16:00, late window to 09:00 next day, project local time | Per-unit configurable. After the window: accepted with `LATE` + `BACKDATED`, never hard-blocked (G8). |
| O2 | Minimum evidence | 1 photo per reported activity, `WARNING` severity in Phase 1 | Make `ERROR` configurable per discipline later. |
| O3 | Trade list / UoM master | Reuse existing trade and UoM masters from planning (`plan_*`, `master-libraries`); see mapping doc | No new master created. |
| O4 | BOQ linkage depth | `boq_item_id` nullable, **not populated** in Phase 1 | Revisit in Phase 3 with sub-IPC support. |
| O5 | Bulk approve | **Off** in Phase 1. Clean reports are one-click, one at a time | Revisit after review-turnaround data exists. |
| O6 | Languages | English in Phase 1A; Khmer UI string layer prepared but not committed | No i18n framework was found in the app. Needs a decision before Khmer UI is promised. |
| O7 | Photo retention | Keep for project duration + DLP + 5 years, same as audit | Cold tiering deferred. |
| O8 | Who publishes when PM absent | A project-level **alternate approver**, set by Company Admin, audited, time-boxed | Pulled into Phase 1A (G7). |

## Confirmation needed from you

1. Q1, Q2, Q3 as above.
2. Q5: is there an external user invite flow I missed, or do we build it?
3. O6: is Khmer UI required at go-live?
4. Any default above you want changed.
