# 14-Completion-Plan.md

# Planning & Scheduling — Completion Plan (22 remaining items, 3 phases)

Status: Approved (2026-09-18) — not yet implemented
Source: Planning Module Coverage Audit (2026-09-18), scoring 48 capabilities against the 13-document spec pack and the 13-MSProject-Gap-Remediation-Plan: 26 complete, 10 partial, 12 not built.
Scope: This document is the execution plan to close all 22 remaining (partial + not-built) items so the module is fit for a live construction project.

---

## Context

The Planning Coverage Audit scored 48 capabilities across 8 areas. The scheduling engine itself is mature (CPM, all four dependency types with lag, eight constraint types, an 11-slot baseline system, work calendars, resources with over-allocation detection, MS Project XML round-trip). The gaps cluster in governance (approvals, alerts, audit, permissions) and cross-module contracts (IPC, EOT, procurement/documents), plus two analysis engines (Time Impact Analysis, resource levelling) that exist only as aspirational master-prompt documents in this folder.

This plan closes all 22 remaining items, delivered in three independently shippable phases, value-first.

**Architecture stays on `wbs_tasks` / `wbs_nodes` + `plan_*`.** The `04-Database-Schema.md` design (a separate `pln_*` table family; ADR-PLN-001) was never built — Planning was implemented directly on the WBS spine instead, which removed the planner/QS reconciliation gap the spec worried about (see SC3). This plan keeps that architecture; `04-Database-Schema.md` and ADR-PLN-001 are scheduled for a rewrite at the end of Phase 3 (see "Doc pack refresh" below) so the docs describe the system actually running.

Every new engine in this plan is a pure TypeScript function built on `scheduleProject()` (`apps/web/lib/planning/schedule-engine.ts`). Every database write goes through `apps/web/components/planning/use-sheet-data.ts` or a Supabase RPC. Migrations are authored only by the `database-engineer` agent, one file at a time, applied by the user via the Supabase SQL Editor (this repo does not use `supabase db push`).

**Confirmed product decisions:**
- All 22 items are in scope, including Time Impact Analysis, procurement/document links, the client portal, and resource levelling (none deferred further).
- IPC integration: Planning's progress % becomes the **source of truth** the QS progress-claim pages read from (not a side-by-side comparison).
- Schedule alerts are delivered in-app (existing `task_alerts` bell), via Telegram (existing bot), and via **email** (new — Resend API).
- Time Impact Analysis is **contract-grade prospective TIA**: a delay event's fragnet (new activities + links) is inserted into a copy of the schedule at the data date, the existing CPM engine re-runs, and the impact on completion and milestones is compared and reported — no AI, single project, no retrospective windows-analysis in this pass.
- Resource levelling delays tasks **within their own total float** using configurable priority rules, previewed as a scenario before being applied; if float is exhausted the conflict is reported, not resolved by extending the project.
- Client / PMC access is a normal DCOS login with the existing `EXT-CLT` role, scoped to their project(s) by row-level security — not a separate public link.
- The monthly progress report renders as a stored PDF via `@react-pdf/renderer`.

---

## Verified reuse points (do not reinvent)

- **Audit:** `wbs_audit_log` insert shape at `apps/web/lib/tasks/assign-task.ts:82`.
- **Alerts:** `task_alerts`, auto-created by the trigger `create_task_alert_from_audit()` on `wbs_audit_log` inserts (`supabase/migrations/20260608000003_update_alert_trigger.sql`); `apps/web/lib/hr/telegram/bot.ts sendMessage()`; `profiles.notification_preferences` jsonb.
- **Roles/permissions:** `roles` / `role_permissions` / `user_roles` (codes L0–L6 internal levels, functional codes including `PE` Planning Engineer, external codes including `EXT-CLT`); `apps/web/lib/permissions.ts hasPermission()`; a copyable non-blanket RLS example at `supabase/migrations/20260527000023_allow_task_delete_permission.sql`.
- **Approvals:** the `qs_claim_approvals` step-chain table (`supabase/migrations/20260728000003_qs_claim_approval_chain.sql`) is the closest existing pattern to copy; `project_approval_flows(flow_type, role_chain)` also exists.
- **Baselines/revisions:** `wbs_baselines(baseline_name, baseline_type contract|revised|current, baseline_date, snapshot_data, is_active, baseline_number, set_by)`; `plan_schedule_streams` + `plan_schedule_revisions` + `capture_schedule_revision()`; `get_schedule_variance()` already computes duration variance but has zero callers.
- **Delay analysis:** `apps/web/lib/planning/delay-analysis.ts analyzeDelays()` already returns `floatConsumedWd`, `becameCritical`, `hitsProjectFinish` per task — the TIA and delay-governance work builds on this, not a new engine.
- **Cross-module hooks:** `contractual_notices(notice_type 'extension_of_time', contract_id NOT NULL, linked_to, linked_id)`; `documents(wbs_node_id, status)` + `document_revision_task_links`; `design_rfi(status)`; `inspection_requests(wbs_task_id, status)` + `itp_items.inspection_type = 'hold'`; `procurement_prs(task_id)`; `procurement_pos(wbs_node_id, delivery_date_expected)`.
- **IPC seam:** `qs_claim_items` seeding in `apps/web/lib/qs-service.ts` (~L1100–1149); `apps/web/lib/evm-service.ts` (currently anchors Planned Value on `Date.now()`, not the project data date).
- **API route pattern:** `apps/web/app/api/hr/overtime/notifications/process/route.ts` (user client for auth, admin client for writes) is the template for the new alert-evaluation and monthly-report routes.
- **Already present, no schema change needed:** `plan_resources.resource_type` (labor|equipment|material|subcontractor); the `supabase` CLI is already a devDependency (types regeneration is possible without adding tooling).

**Hook points inside `apps/web/components/planning/use-sheet-data.ts`:** the central write helper is `applySchedule()` (~L639, updates ~L692, `rpc("apply_schedule_dates")` ~L703) with `writeDeps()` (~L730) wrapping dependency writes. Several actions bypass it with direct `wbs_tasks`/`wbs_nodes` writes: `createTask` (~782), `updateTaskField` (~936), `deleteTask` (~951/988), `setProgress` (~1105), `setWbsCode` (~1257/1268), `createNode`/`renameNode`/`deleteNode` (~1296/1326/1349), `moveTaskToNode` (~1383), `applyNodeMove` (~1418/1427). `dataDate` is read at ~L309 but nothing in the app currently writes `projects.data_date`. The legacy secondary Gantt renderer `apps/web/components/planning/gantt-view.tsx` also writes `wbs_tasks` directly (~611/650/719/744) and must be reconciled with the audit/lock work in Phase 1–2 (see Sequencing).

---

## Shared foundations (built in Phase 1, reused by later phases)

- **F1 — Audit helper.** New `apps/web/lib/planning/schedule-audit.ts`: `logScheduleAudit(supabase, {projectId, taskId?, nodeId?, action, field?, oldValue?, newValue?})`, wrapping the existing `wbs_audit_log` insert shape. Extends (never renames) the action vocabulary already matched by the alert trigger: `Plan Start Changed`, `Plan Finish Changed`, `Duration Changed`, `Dependency Changed`, `Constraint Changed`, `Task Created`, `Task Deleted`, `Task Moved`, `Baseline Set`, `Data Date Advanced`, `Progress Submitted`, `Progress Confirmed`, `Progress Rejected`, `Revision Submitted`, `Revision Approved`, `Revision Rejected`.
- **F2 — Data-date RPC.** `advance_data_date(p_project_id, p_new_date, p_note)`: validates the date only moves forward, updates `projects.data_date`, calls the existing `capture_progress_snapshot`, inserts a project-level audit row, and returns `{old_date, new_date, snapshot_id}`. Extended in Phase 2 to enqueue the monthly report job.
- **F3 — Notification dispatcher.** Server-only `apps/web/lib/notifications/dispatch.ts`: `dispatchScheduleAlert(adminClient, {projectId, recipientIds, alertType, title, body, taskId?, metadata, sourceKey})` — inserts a `task_alerts` row (deduped on `source_key`), sends a Telegram message via the existing `sendMessage()` helper when the recipient has opted in and has a `telegram_chat_id`, and sends an email via a new `apps/web/lib/email/resend.ts` (a plain `fetch` to the Resend API, no SDK dependency; env vars `RESEND_API_KEY`, `RESEND_FROM`). Adds an `schedule_alerts_email` key to `profiles.notification_preferences` and a toggle in the existing notification preferences panel.
- **F4 — Vitest.** Adds `vitest` as a devDependency, a `"test": "vitest run"` script, and `vitest.config.ts`. Tests live under `apps/web/lib/planning/__tests__/` and cover pure functions only (no Supabase mocking).
- **F5 — Project membership + generic permission helper.** Migration authored in Phase 1 (enforced by RLS in Phase 2):
  - `project_members(project_id, user_id, role_code references roles, added_by, created_at, primary key(project_id, user_id))`.
  - `is_project_member(p_project_id) returns boolean` (security definer; admins short-circuit).
  - `has_permission(p_module, p_action, p_field default 'view') returns boolean`, mirroring the semantics of `lib/permissions.ts hasPermission()`.
  - A backfill inserts every `(project_id, owner_id)` pair already present on `wbs_tasks`, plus each project's creator, so no existing user is locked out when RLS tightens in Phase 2.

---

## Phase 1 — Governance quick wins & signals

| # | Item | Effort |
|---|---|---|
| 1.1 | Audit trail of schedule edits | M |
| 1.2 | Data-date control + automatic progress snapshot | S |
| 1.3 | Baseline governance + duration variance | M |
| 1.4 | Planning dashboard PM tiles | M |
| 1.5 | Forecast finish vs contract end | S |
| 1.6 | Schedule alerts (in-app / Telegram / email) | L |
| 1.7 | Resource histogram by type | S |
| 1.8 | Look-ahead constraint readiness UI + Plan-Completion-Rate | M |
| 1.9 | Programme import — decision recorded, no new build | S |
| 1.10 | Vitest baseline for the existing engines | S |

**1.1 Audit trail of schedule edits.** Inside `applySchedule()`, diff the pre/post state per task and call `logScheduleAudit` for each changed field (rippled downstream tasks are logged with `field_name = 'ripple'`); add one-line calls at each of the direct-write actions listed above. Route the legacy `gantt-view.tsx` writes through the same helper, or add equivalent calls and mark the file deprecated. Add index `idx_wbs_audit_log_project_created(project_id, created_at desc)`. UI: a "History" tab in the task detail panels, and a project-level "Schedule Change Log" as a new Reports sub-tab. A database trigger on `wbs_tasks` was rejected — CPM ripple updates would produce hundreds of unattributed rows per edit, whereas the hook already knows the causal edit and actor.

**1.2 Data-date control.** RPC F2. `progress_snapshots` gains `source text check in ('manual','data_date','monthly') default 'manual'`. `use-sheet-data.ts` gains `advanceDataDate()`, which calls the RPC, updates local state, and re-runs the schedule from the new date. New `plan-data-date-dialog.tsx` (date, note, and a warning list of un-started tasks that would be pushed), exposed from the Gantt toolbar and the dashboard header.

**1.3 Baseline governance.** `wbs_baselines` gains `reason text`, `locked boolean default false`, `client_accepted boolean default false`, `client_accepted_at`, `client_accepted_by`. `set_baseline(...)` is extended (`create or replace`, same signature plus optional name/type/reason) to refuse re-setting a locked or contract-type slot, and to require a reason for a `revised` baseline. A `BEFORE UPDATE/DELETE` trigger enforces the lock. A new `accept_baseline_by_client(p_baseline_id)` RPC is permission-gated. `plan-set-baseline-dialog.tsx` gains name/type/reason fields; the Comparison page starts showing the duration variance that `get_schedule_variance()` already computes but nothing currently reads.

**1.4 Planning dashboard PM tiles.** A new pure `apps/web/lib/planning/schedule-kpis.ts` computes overdue count, activities starting in the next 14 days, negative-float count, near-critical count, Plan Completion Rate, and an overall programme status from the tasks already loaded by `useSheetData`. Rendered as tiles on the Planning dashboard, each linking into the Sheet with a matching filter.

**1.5 Forecast finish vs contract end.** Exports a `projectFinish(dates)` helper from `schedule-engine.ts` (reusing the `maxISO` logic already in `delay-analysis.ts`) and shows the forecast finish against `projects.end_date` as a dashboard tile and a Gantt header chip, red when overrun.

**1.6 Schedule alerts.** The `task_alerts` type CHECK is widened with schedule-specific alert types. A new `plan_schedule_state` table persists the last-known critical/near-critical task sets and project finish date so changes can be diffed (the CPM engine itself is in-memory and never persists results). A new API route evaluates the schedule after a write, diffs against the stored state, and calls the F3 dispatcher; `applySchedule()` triggers this evaluation, debounced. A pure server-side re-run of CPM was chosen over a PL/pgSQL re-implementation, so the engine has exactly one source of truth.

**1.7 Resource histogram by type.** No schema change — `plan_resources.resource_type` already exists. A new pure aggregation function feeds a "Histogram" tab on the resource loading page (stacked demand by type against `max_units` capacity).

**1.8 Look-ahead constraint readiness + Plan-Completion-Rate.** `weekly_plans`/`weekly_plan_tasks` gain closure columns (`closed_at`, `pcr`, `actual_progress`, `met`); `task_constraints` gains `source`/`source_ref` so later phases can auto-populate it. A `close_weekly_plan` RPC freezes actual progress against target and computes PCR at close time (not on read, since live progress keeps moving after the week ends). The look-ahead view gains readiness indicators for the six constraint types and a "close week" action with a PCR trend.

**1.9 Programme import.** No new build. The existing MS Project XML sync and Master WBS Excel import remain the supported import paths; the spec's separate fixed-CSV-template importer (F7) is explicitly not built. Recorded here as a decision, not a gap.

**1.10 Vitest baseline.** Tests for `schedule-engine.ts` (all four dependency types with lag, non-working-day calendars, cycle detection, float thresholds, the ALAP/SNLT/FNLT constraint fix), `delay-analysis.ts`, `schedule-kpis.ts`, and the activity-step weighted-progress calculation.

---

## Phase 2 — Workflows, permissions, IPC

| # | Item | Effort |
|---|---|---|
| 2.1 | Role-based RLS on all planning tables | L |
| 2.2 | Progress review flow (pending → confirmed/rejected, lock at 100%) | M |
| 2.3 | Programme revision approval workflow + transmittal | L |
| 2.4 | Client read-only programme view | M |
| 2.5 | Delay-event governance (multi-task, float at open/close, lifecycle) | M |
| 2.6 | EOT hand-off to `contractual_notices` | S |
| 2.7 | IPC contract — Planning progress as source of truth | L |
| 2.8 | Monthly progress report, auto-generated at data-date advance | L |

**2.1 Role-based RLS.** Every planning table's blanket `using (true)` policy is replaced with a pair scoped by `is_project_member(project_id)` and `has_permission('planning', <action>, <field>)`, following one pattern applied per table (calendars, resources, delays, look-ahead, schedule settings, baselines, programme revisions). `role_permissions` is seeded for a new `planning` module across its actions for the existing role codes — internal levels get full access, field staff get view + look-ahead edit, and the external client/consultant codes get view-only access to `programme`. A new permissions hook mirrors the existing QS one and gates the relevant buttons; a project Members tab lets a PM manage `project_members`.

**2.2 Progress review flow.** A per-project toggle turns on a pending → confirmed/rejected review cycle for progress entries (mirroring the existing task-submission pattern elsewhere in the app), with a lock once a task reaches 100% and is marked complete. Reviewers are notified through the same F3 dispatcher and F1 audit trail built in Phase 1.

**2.3 Programme revision approval workflow.** `plan_schedule_revisions` gains a status lifecycle (`draft → submitted_internal → approved_internal → submitted_client → approved_client | rejected`) with a step-chain approvals table copied from the existing QS claim-approval pattern, enforcing four-eyes review. Client approval automatically records a client-accepted baseline and creates a transmittal through the existing Document Control tables.

**2.4 Client read-only programme view.** A security-invoker view exposes only the latest client-approved revision's data to project members; a new client-facing page renders a read-only Gantt, milestones, and S-curve. External client/consultant roles are redirected here instead of the internal Planning pages. This item explicitly depends on 2.1 shipping first.

**2.5 Delay-event governance.** The single-task `delay_register` link becomes multi-task; the register records float and criticality at the moment a delay is opened and again when it is closed, and gains a formal lifecycle (notified → assessed → submitted → agreed/rejected → closed).

**2.6 EOT hand-off.** A new RPC turns an agreed delay event into a formal `contractual_notices` record of type Extension of Time, since no dedicated EOT module exists yet in DCOS — this is the documented, minimal bridge until one is designed.

**2.7 IPC contract.** A new RPC returns confirmed Planning progress per WBS node as of a given date; the QS claim-seeding logic is updated to pre-fill claimed quantities from this figure (any manual override requires a reason), and the EVM service's Planned Value calculation is anchored on the project's data date instead of the current wall-clock time. This closes the spec's central success criterion — a single, reconciled progress figure shared by Planning and QS.

**2.8 Monthly progress report.** Advancing the data date into a new month enqueues a report job; a server route assembles the same KPIs, delay analysis, and S-curve data already built in Phase 1, renders a PDF with `@react-pdf/renderer`, and files it into Document Control automatically, with a completion alert.

---

## Phase 3 — Analysis engines & integrations

| # | Item | Effort |
|---|---|---|
| 3.1 | Time Impact Analysis engine (prospective, contract-grade) | XL |
| 3.2 | Resource levelling (within float, priority rules) | L |
| 3.3 | Procurement → look-ahead constraints | M |
| 3.4 | Documents / RFI / inspections → look-ahead constraints | M |
| 3.5 | Tests for the Phase 3 engines | S |

**3.1 Time Impact Analysis.** A pure engine clones the current schedule, freezes work already completed at the data date, inserts a delay event's fragnet (new activities and links) into the copy, and re-runs the existing CPM engine to compare baseline versus impacted completion and milestone dates — entirely in memory, never mutating the live programme. Scenarios are saved for comparison and a finalised study can push its claimed-day impact into the EOT notice created in 2.6. A new page provides a fragnet editor and a side-by-side base-versus-impacted Gantt.

**3.2 Resource levelling.** A pure engine sweeps forward from the data date, and wherever demand for a resource exceeds its capacity, delays the lowest-priority not-yet-started task by one working day within its own total float (never past its late start), re-running CPM as it goes; residual conflicts that cannot be resolved within float are reported rather than silently extending the project. Results are previewed as a scenario before an explicit Apply, which goes through the normal `applySchedule` path so it is fully audited and alerted like any other schedule change.

**3.3 Procurement → look-ahead constraints.** Purchase-order delivery dates automatically populate the existing `task_constraints` "materials" readiness indicator introduced in 1.8, kept in sync by triggers on the procurement tables; a manual override on any row freezes it against further automatic updates.

**3.4 Documents / RFI / inspections → look-ahead constraints.** Drawing approval status, open RFIs, and inspection hold-point status from the existing Document Control and QA/QC tables likewise populate the "drawings" and "permits" readiness indicators.

**3.5 Tests.** Vitest coverage for the TIA and levelling engines' core behaviours (a fragnet on the critical path shifts the forecast finish by its own duration; a fragnet fully inside float causes no slip; over-allocation on a critical task is reported, not silently moved), plus the pure status-mapping logic reused by the constraint-readiness tooltips.

---

## Sequencing & dependencies

1. The audit helper (F1) precedes the audit trail (1.1), which the alert-diffing (1.6) and the review/approval triggers (2.2, 2.3) depend on.
2. The data-date RPC (F2) precedes the data-date control (1.2), which the as-of IPC snapshots (2.7) and the monthly-report trigger (2.8) depend on.
3. The notification dispatcher (F3) precedes alerts (1.6), which the review, approval, and report flows (2.2, 2.3, 2.8) reuse.
4. Project membership and the generic permission helper (F5) precede role-based RLS (2.1), which must ship before the client view (2.4) and the client-approval step (2.3) — never expose client access ahead of the RLS that scopes it.
5. Weekly-plan closure (1.8) turns the PCR dashboard tile (1.4) from a live estimate into a stored, trustworthy figure.
6. Multi-task delay governance (2.5) precedes the EOT hand-off (2.6), which Time Impact Analysis (3.1) attaches its findings to.
7. The constraint "source" plumbing added in 1.8 is what the procurement and document feeds (3.3, 3.4) populate.
8. The Vitest setup (F4/1.10) precedes the Phase 3 engine tests (3.5).
9. The legacy secondary Gantt renderer's direct writes must be reconciled with the central write path before the progress-lock trigger in 2.2 ships, or its writes will fail with unfriendly errors.

## Types regeneration

A `gen:types` script is added to run the Supabase CLI (already a dependency) and regenerate `apps/web/lib/supabase/database.types.ts`, which is currently stale — it is missing several tables shipped just before this plan (`plan_schedule_settings`, `wbs_task_steps`, `activity_step_template_*`). Regenerate after each phase's migrations land.

## Doc pack refresh

At the end of this work, `docs-writer` revises the architecture decision record to describe Planning-on-`wbs_tasks` (not the never-built `pln_*` design), rewrites `04-Database-Schema.md` to the tables and RPCs that actually exist, closes out `13-MSProject-Gap-Remediation-Plan.md`, and records the notification-channel environment variables introduced here.

## Verification

Each phase is verified with a clean `tsc --noEmit` and `eslint` pass plus a green `vitest run`, alongside phase-specific manual checks: audit rows appearing on edits and a locked baseline refusing re-use in Phase 1; row-level security correctly excluding a non-member and a client seeing only the approved programme in Phase 2; a fragnet on the critical path visibly shifting the forecast finish, and a levelling preview removing an over-allocation within float, in Phase 3.

## Effort

Phase 1 ≈ 2 sprints · Phase 2 ≈ 3 sprints · Phase 3 ≈ 3 sprints (Time Impact Analysis is the dominant item). Roughly 19 migration files across all three phases, each authored by the `database-engineer` agent and applied by hand through the Supabase SQL Editor.
