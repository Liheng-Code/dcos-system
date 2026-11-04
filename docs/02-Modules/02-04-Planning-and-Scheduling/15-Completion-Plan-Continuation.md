# 15-Completion-Plan-Continuation.md

# Planning & Scheduling — Completion Plan Continuation (Phase 2 residual + Phase 3)

Status: Approved (2026-09-18) — supersedes the open items in `14-Completion-Plan.md`.
Reader context: `14-Completion-Plan.md` is the governing plan (3 phases, 22 items). The Phase 2 **database layer** for items 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8 is already authored as migrations `supabase/migrations/20260919000007..014` and applied via the Supabase SQL Editor. This document is the design for the **application layer those migrations leave unwired**, for **item 2.4** (which has no design at all), and for **all of Phase 3** (which has neither migrations nor engines).

Scope decisions recorded here:
- Phase 1 is treated as delivered (migrations `20260919…01..06`, `lib/planning/schedule-audit.ts`, `schedule-kpis.ts`, `notifications/dispatch.ts`, `email/resend.ts`, the alerts evaluate route, Vitest infra, `wbs-constraint-readiness.tsx`).
- The `@react-pdf/renderer` dependency is added for the monthly report (2.8). Resend stays SDK-free (plain `fetch`, `RESEND_API_KEY` / `RESEND_FROM`).
- All engines are pure TypeScript on `scheduleProject()`; no schedule logic is re-implemented in SQL. Database writes go through `use-sheet-data.ts` helpers or RPCs. Migrations are authored one file at a time and applied by hand through the Supabase SQL Editor.
- RLS stays on the established `is_project_member()` + `has_permission('planning', <action>, <field>)` pattern.

---

## Status map (what already exists vs what this document designs)

| Item | DB layer | App layer |
|---|---|---|
| 2.1 Role-based RLS | ✅ `…07` seed, `…08` RLS v2 | ⬜ Members tab, hook wiring, EXT-CLT redirect → **R2.1** |
| 2.2 Progress review | ✅ `…09` (reviews table + `submit_progress`/`decide_progress_review`) | ⬜ review queue UI, notify, lock surfacing → **R2.2** |
| 2.3 Revision approval | ✅ `…10` (`transition_revision`, step approvals) | ⬜ workflow UI, **transmittal creation missing** → **R2.3** |
| 2.4 Client view | ❌ nothing | ❌ nothing → **R2.4** |
| 2.5 Delay governance | ✅ `…11` (multi-task + lifecycle + float cols) | ⬜ register UI unaware of new columns → **R2.5** |
| 2.6 EOT hand-off | ✅ `…12` (`create_eot_notice_from_delay`) | ⬜ no caller → **R2.6** |
| 2.7 IPC contract | ✅ `…13` (provenance cols + `get_node_progress_asof`) | ⬜ qs-service seeding + EVM (✅ already anchored) → **R2.7** |
| 2.8 Monthly report | ✅ `…14` (`plan_report_jobs` + enqueue) | ⬜ no generator/route → **R2.8** |
| 3.1 TIA | ❌ | ❌ → **3.1** |
| 3.2 Levelling | ❌ | ❌ → **3.2** |
| 3.3 Procurement feed | ❌ | ❌ → **3.3** |
| 3.4 Docs/RFI/insp feed | ❌ | ❌ → **3.4** |
| 3.5 Tests | — | ❌ → **3.5** |

---

## Cross-cutting

- **CT-1 `gen:types`.** Add `"gen:types": "supabase gen types typescript --project-id <PROJECT_ID> > apps/web/lib/supabase/database.types.ts"` to `apps/web/package.json`. Types are currently stale (missing `plan_schedule_settings`, `wbs_task_steps`, `activity_step_template_*`). Regenerate after each migration batch lands.
- **CT-2 Migration authorship.** Migrations below are numbered `…15..20`, each one file, applied by hand through the Supabase SQL Editor. Every migration carries a header noting its schema-verification facts read from the source migrations, matching the `…01..14` style.
- **CT-3 Module borders.** Phase 2 app-layer work keeps *Planning's* write path centralized: `schedule-audit.ts` (F1) for audit, `notifications/dispatch.ts` (F3) for alerts, `applySchedule()` in `use-sheet-data.ts` for bulk date writes, RPCs for lifecycle transitions.

---

## Phase 2 residual

### R2.1 — Members & permission wiring (completes 2.1)

**Migration `20260919000015_project_members_rls.sql`:**
- Replace the four permissive `project_members_*` policies (created permissive in `…01`, `20260919000001:67-77`) with the standard 4-policy pattern gated on the new action `members`:
  - `select`: `is_project_member(project_id)`.
  - `insert`/`update`/`delete`: `is_project_member(project_id) and has_permission('planning','members','edit')`.
- Additive `role_permissions` seed for action `members` (the `…07` seed list omitted it): L0–L4, PE full access; L5/L6 view only. All other roles get no row.
- Schema verification: `project_members` exact columns from `…01` (project_id, user_id, role_code references roles, added_by, created_at, PK (project_id, user_id)).

**UI:**
- New `apps/web/components/planning/plan-project-members.tsx`: lists `project_members` joined to `profiles` (full_name, email), add-member dialog (profile picker + role_code picker), remove. Gated by `can('members','edit')` from `use-planning-permissions`.
- Surface from the Planning settings area (`plan-schedule-view.tsx` settings gear or a Settings sub-tab).

**Wiring `use-planning-permissions`** (currently zero consumers — `apps/web/hooks/use-planning-permissions.ts`):
- `plan-page-shell.tsx`: consume the hook; when `isClientOrConsultant`, redirect to `/portal/programme`; otherwise gate edit affordances by `canEditSchedule`, baseline actions by `canEditBaseline`, resource edits by `can('resources','edit')`, look-ahead closes by `canEditLookahead`.
- `use-sheet-data.ts`: expose the guards to the sheet (`canEditTaskDates`, etc.) so the grid disables editing for view-only roles.

### R2.2 — Progress review UI (completes 2.2)

Existing: `apps/web/components/planning/use-sheet-data.ts:1254-1258` already calls `rpc("submit_progress")`. The DB has `wbs_task_progress_reviews` and both RPCs with policies gated on `progress_review` action.

**New `apps/web/components/planning/plan-progress-reviews.tsx`:**
- Pending queue per project: proposer, previous vs proposed %, comment, action buttons Confirm/Reject calling `decide_progress_review(p_review_id, 'confirmed'|'rejected', comment)`. Gated by `canReviewProgress`.
- Closed history filter. Pending badge count surfaced in the sheet's status UI.

**Settings toggle:** a small settings panel section for `progress_review_enabled` + `lock_on_complete` (columns added by `…09`); progress cell shows a lock at 100% when `lock_on_complete`.

**Reviewer notification:** new server route `apps/web/app/api/planning/progress-reviews/notify/route.ts`:
- Method POST, body `{ project_id, review_ids?, action, actor_uid }`.
- Pattern of the alerts route (`apps/web/app/api/planning/alerts/[projectId]/evaluate/route.ts`): user client for auth, admin client for writes.
- User client for auth; admin client (`createAdminClient`) for `dispatchScheduleAlert(adminClient, { …, alertType: 'progress_review_requested' | 'progress_review_decided', recipientIds: reviewers, sourceKey: … })`. Recipients = project members with `progress_review approve` role codes (PE/L0-L4). `sourceKey` e.g. `progress-review:{reviewId}:request` (dedupe-safe).
- Called from the client after a successful `submit_progress` (all reviewers) and after `decide_progress_review` (the proposer).

**Sequencing note #9 (gantt-view.tsx direct writes):** the legacy secondary renderer is still able to write `wbs_tasks` directly and bypass the soft lock (see migration `…09` header for why the lock is RPC-level, not a trigger). Redirect its progress write sites to `rpc("submit_progress")` when `progress_review_enabled`, else keep the direct update wrapped in `logScheduleAudit`. Call sites to touch: `apps/web/components/planning/gantt-view.tsx` (~611/650/719/744).

### R2.3 — Revision approval UI + transmittal creation (completes 2.3)

**Gap:** `20260919000010` adds `plan_schedule_revisions.transmittal_id` but never creates the transmittal; the Completion Plan's "creates a transmittal through the existing Document Control tables" half is unimplemented.

**Migration `20260919000016_programme_transmittal.sql`:**
- New RPC `create_programme_transmittal(p_revision_id uuid, p_issuer_company_id uuid, p_receiver_stakeholder_id uuid) returns jsonb`:
  - Validate the revision is `approved_client`.
  - Ensure a `document_type` 'Programme' exists (upsert by name). Schema verification needed on `document_types` columns before writing (verify against `20260527000010_create_document_control.sql`).
  - Insert a `documents` row: keyed to the project, `wbs_node_id` null, `document_number` `PRG-R{n}` (n = revision_number), `status 'ifc'`, `title` from stream name.
  - Sequence `transmittal_code` via `transmittal_running_numbers` (increment `last_sequence`), insert `transmittals` (status `sent`), link via `transmittal_documents`, set `plan_schedule_revisions.transmittal_id`.
  - Audit row (`Transmittal Created`-style action in the F1 vocabulary — additive).
  - Security invoker; permission-gated by `has_permission('planning','programme','approve')` at the UI layer (RPC side performs the same check defensively).
- Keep `transition_revision` untouched: the UI calls `client_approve` first, then `create_programme_transmittal`.

**Revision workflow UI:** extend the revisions sub-tab of `PlanManageSchedulesDialog` (`plan-manage-schedules-dialog.tsx:405` already lists revisions and supports create/delete versions):
- Status badge per revision (draft / submitted_internal / approved_internal / submitted_client / approved_client / rejected).
- Transition buttons gated by `canSubmitProgramme` (submit, submit_client) and `canApproveProgramme` (approve, reject, client_approve, client_reject), each calling `transition_revision`. Four-eyes violations surface the RPC error verbatim.
- Transmittal button on `approved_client` revisions → dialog for issuer company + receiver stakeholder → calls R2.3 RPC; shows `transmittal_code`.

**Notification route** `apps/web/app/api/planning/revisions/notify/route.ts`: mirror of the R2.2 notify route; types `programme_revision_submitted` / `programme_revision_decided`; recipients = members with `programme approve` (or the next-in-chain approver role_code from `plan_revision_approvals`); dedupe `sourceKey = revision:{id}:{status}`.

### R2.4 — Client read-only programme view (no prior design — full)

**Key fact:** the `…07` seed already grants `EXT-CLT`/`EXT-CON` `('planning','programme','view')`, and `…08` RLS already lets a project-member client read `plan_schedule_revisions` rows. Item 2.4 is therefore a **projection + presentation** concern, not new gating.

**Migration `20260919000017_client_programme_view.sql`:**
- Security-invoker view `public.v_plan_client_programme`:
  - `project_id`, `project_code`, `project_name`, `data_date`, `revision_number`, `approved_at`, `programme jsonb` (= latest `approved_client` revision's `snapshot_data`).
  - Built on `plan_schedule_revisions` join `plan_schedule_streams` join `projects`; filters to `status = 'approved_client'` and a window/row_number per project for "latest".
  - Permissions: `grant select` to `authenticated`; RLS of the underlying tables applies automatically (EXT-CLT client must be a project member — enforced by `…08`).
- Document in the migration header that snapshot_data's exact shape must be read from `capture_schedule_revision()` before the client page parses it.

**Client page:** `apps/web/app/portal/programme/[projectId]/page.tsx`:
- Fetches the view row for the project; treats missing row as "no client-approved programme yet".
- Renders read-only Gantt (reuse gantt components with a `readOnly` capability — tasks/props from the snapshot), a milestones table (0-duration tasks), the project finish vs contract end chip, and an S-curve slice using `scurve-comparison.ts` if snapshot includes curve data (else omit).
- No edit affordances; project header + footer with the approved date.

**Redirect:** R2.1 wiring redirects EXT-CLT/EXT-CON from internal Planning pages to this portal route.

### R2.5 — Delay governance UI (completes 2.5)

`plan-delay-register.tsx` currently reads/writes only the legacy `delay_register` columns and is unaware of `delay_register_tasks`, the lifecycle, or the float columns (`…11`).

**New pure helper `apps/web/lib/planning/delay-governance.ts`:**
- `captureDelayFloat(tasks, cal, dataDate, taskIds): { floatWd: number | null; critical: boolean }` — runs `scheduleProject`, returns the minimum total float / criticality across the affected tasks. Used at open (writes `float_at_open`, `critical_at_open`) and recomputed at close (`float_at_close`).

**Register upgrade:**
- Multi-task picker (checkbox task table) writing `delay_register_tasks` rows.
- Lifecycle stepper for the six states (`notified → assessed → submitted → agreed/rejected → closed`), replacing the free-form status field's role.
- Open/Close actions setting `opened_at` / `closed_at` / `closed_by`, capturing float at each boundary.
- Keeps the legacy single-task `wbs_task_id` convenience column in sync with the first chosen task (its backfill already seeded row 1 from legacy links).

### R2.6 — EOT hand-off UI (completes 2.6)

`create_eot_notice_from_delay` (`…12`) has zero callers. Add to the delay register:
- "Raise EOT notice" action on an `agreed` delay → dialog: contract picker (`contract_register` rows for the project), optional deadline → calls the RPC → shows the generated `notice_no` and links to the Contracts module.
- Display `eot_notice_id` when a notice already exists (read-only link).

### R2.7 — IPC contract app layer (completes 2.7)

Migration `…13` added `qs_claim_items.planning_pct`/`planning_snapshot_date`/`override_reason`, `qs_progress_claims.data_date`, and `get_node_progress_asof`. `qs-service.ts` does not consume any of it yet.

**Claim seeding (`initializeClaimItems`, `apps/web/lib/qs-service.ts:1098`):**
- After building `prevMap`, call `rpc("get_node_progress_asof", { p_project_id: projectId, p_date: claim.data_date ?? period_end })`.
- Join through `qs_boq_items.wbs_node_id` to the node→pct map; per row set `planning_pct`, `planning_snapshot_date`, and pre-fill `this_period = max(0, round(planning_pct/100 * scheduled_value) − prev_completed)`.
- Documented fallback (from `…13` header): a caller without a planning grant reads live `wbs_nodes.progress_percent` instead of as-of.

**QS planning view grant (recorded decision):** add an additive `role_permissions` seed granting `('planning','schedule','view')` to QS (and a small set: DC, SS) so the IPC figure is always the as-of snapshot, not the live fallback. Ship inside migration `…17` or a dedicated additive seed.

**Override validation:** in the claim-item edit path (`qs-service.ts` update handler for `qs_claim_items`), any manual change where the value deviates from the `planning_pct`-derived figure requires `override_reason` (app-level prompt before save).

**data_date anchor:** the progress-claim create form defaults `data_date` to the project's current `projects.data_date`.

### R2.8 — Monthly progress report (completes 2.8)

Migration `…14` provides `plan_report_jobs` and makes `advance_data_date()` enqueue a job on month change. No generator exists.

**Dependency:** add `@react-pdf/renderer` to `apps/web/package.json`.

**Report route** `apps/web/app/api/planning/reports/[reportJobId]/generate/route.ts`:
- Pattern of the alerts evaluate route (user client for auth, admin client for writes).
- Steps: load job (must be `queued` or `failed` for retry) → set `running` → load project + tasks + calendar + settings (same queries as the alerts route) → assemble KPI + delay analysis (`schedule-kpis.ts`, `delay-analysis.ts`, `scurve-comparison.ts`) → render `<MonthlyReport/>` (new `apps/web/lib/reports/monthly-report-pdf.tsx`, React PDF) → `toBuffer()` → upload to the document storage bucket → insert `documents` row (`document_type` 'Planning Report', status `ifc`) → update job `document_id`/`done` → `dispatchScheduleAlert('monthly_report_ready', PM + planners)`.

**Invocation (no cron guarantee):** `advanceDataDate()` returns `report_job_id`; the client (`use-sheet-data.ts` `advanceDataDate`) fires the route fire-and-forget after a successful advance. A Reports sub-tab lists jobs with status, a Download link (document id), a manual Generate and a retry for `failed` jobs.

---

## Phase 3 — analysis engines & integration feeds

### 3.1 — Time Impact Analysis (prospective, contract-grade)

**Engine `apps/web/lib/planning/time-impact-analysis.ts` (pure):**
- `type FragnetActivity = EngineTask & { code?, name? }`; `type FragnetLink = EngineDep & { fromName?, toName? }`.
- `runTia(input): TiaResult` where `input = { tasks, cal, dataDate, fragnet: { activities: EngineTask[]; links: EngineDep[] } }`:
  1. Clone the live tasks. Freeze completed work: progress 100% tasks pinned (`manuallyScheduled` true, keep their dates); start partial tasks from `nextWorkingDay(cal, dataDate, 1)` with remaining duration; untouched otherwise.
  2. Insert fragnet activities (fresh ids) and links (fragnet→fragnet, fragnet→existing, existing→fragnet) into the clone.
  3. Re-run `scheduleProject`; also run once on the frozen clone *without* the fragnet as the base.
  4. Compare `projectFinish(base)` vs `projectFinish(impacted)` → `slipWd` via `signedWorkingDayGap`; per-milestone deltas; whether the critical path changed.
- Zero mutation of the live schedule; no AI; single project.
- Returns `TiaResult { ok, baseFinish, impactedFinish, slipWd, milestoneImpacts: [{taskId, code, base, impacted, slipWd}], criticalPathChanged, baseFloat, impactedFloat }`.

**Migration `20260919000018_tia_scenarios.sql`:**
- `plan_tia_scenarios(id uuid PK, project_id FK, delay_id FK delay_register null, name text not null, data_date date not null, base_finish date, impacted_finish date, slip_wd int, input_json jsonb, result_json jsonb, created_by FK profiles, created_at, updated_at)`.
- RLS: 4-policy pattern on action `tia` (seeded in `…07`). Index on (project_id, created_at).

**UI `apps/web/components/planning/plan-tia.tsx`:**
- Left: scenario list + "New scenario". Fragnet editor: add activities (code, name, duration wd) and links (from/to/type/lag), with a live cycle check (reuse `topoOrder` via `scheduleProject` returning `ok:false`).
- Run → side-by-side base-vs-impacted Gantt (reuse the dual-overlay pattern from `plan-schedule-view.tsx` Compare B) + slip summary + milestone table.
- Save scenario; "Push impact to delay" on a linked delay updates `delay_register.impact_days` from `slip_wd` so the R2.6 EOT notice carries it.

### 3.2 — Resource levelling (within total float)

**Engine `apps/web/lib/planning/resource-levelling.ts` (pure):**
- Inputs `{ tasks: EngineTask[], assignments: { taskId, resourceId, unitsPerDay }[], capacity: Map<resourceId, number>, cal, dataDate, priority: { field: 'task_code'|'wbs_code'|'owner'|'id', order: 'asc'|'desc' } | fallback }`.
- Method: for each working day from dataDate, aggregate demand per resource; while a resource exceeds capacity, pick the lowest-priority not-started task **with total float** occupying that resource that day and push its start one working day (`addWorkingDays(cal, start, 1)`), never later than its `lateStart`; re-run `scheduleProject` after each move. Repeat until resolved or float exhausted.
- Never extends the project: residual conflicts are returned, not silently resolved.
- Output `{ appliedMoves: [{ taskId, from, to, reason, resourceId }], residualConflicts: [{ resourceId, date, demand, capacity, taskIds }], datesAfter, ok, cycle? }`.

**UI `apps/web/components/planning/plan-resource-levelling.tsx`:** configure priority rule, Run (pure) → preview table + before/after, Apply → maps proposed dates through `applySchedule()` (audited + alert-evaluated like any edit). Apply gated by `can('levelling','edit')`; preview is `view`.

### 3.3 — Procurement → materials constraints

`…06` already added `task_constraints.source/source_ref`. Consumers now:

**Migration `20260919000019_procurement_constraint_feed.sql`:**
- Central helper `refresh_task_constraint(p_task_id uuid, p_constraint_type text)`: resolves status from the driving source rows (see below) and upserts `task_constraints` **skipping any row with `source = 'manual'`**.
- Triggers (plain DML, no recursion; only touch rows the caller owns):
  - `procurement_prs`: when `approval_status` becomes `approved` and `task_id` set → upsert `(task_id,'materials','pending', source='pr', source_ref=id)`; `rejected`/`cancelled` → `missing`.
  - `procurement_pos`: on delivery transitions. `issued`/`partially_delivered` → `pending`; `delivered` → resolve ok via its PR/`wbs_node_id` task; `on_hold`/`cancelled` → `missing`.
  - `procurement_po_items`: `delivery_date_expected` on the item updates the same row's `notes` display date.
- Freeze rule: the readiness component's manual upsert sets `source = 'manual'` (small edit to `wbs-constraint-readiness.tsx`), so user overrides stop the feed.

**Readiness attribution:** `wbs-constraint-readiness.tsx` tooltips show `source`/`notes` (which PR/PO drives a materials dot); the click-to-cycle keeps working but first-run sets `source='manual'` only when a row is new.

### 3.4 — Documents / RFI / inspections → constraints

**Migration `20260919000020_document_rfi_inspection_feed.sql`:** same `refresh_task_constraint` mechanism, three sources:
- `documents`/`document_revisions`: status `approved`/`ifc` → `drawings 'ok'`; `submitted`/`under_review` → `pending`; `draft`/`rejected` → `missing`. Task derivation: explicit `document_revision_task_links` where `link_type='constraint'` first; else the document's `wbs_node_id` → its tasks.
- `design_rfi`: `status='open'` → related tasks' `permits 'missing'`; `answered`/`closed` → re-resolve.
- `inspection_requests` hold points: `inspection_results` rows (`pending`/`fail`) whose `itp_item.inspection_type='hold'` → related tasks' `permits 'missing'` until `passed`.
- Manual rows skipped (same rule as 3.3).

### 3.5 — Tests (Vitest, infra already in place)

- `__tests__/time-impact-analysis.test.ts`: fragnet on the critical path shifts the impacted finish by its own working days; a fragnet fully inside float causes no slip; completed work is frozen at the data date; a fragnet cycle reports `ok:false`.
- `__tests__/resource-levelling.test.ts`: over-allocation moved within float; over-allocation on a critical task reported, not silently moved; priority order respected; no move ever past lateStart.
- `__tests__/constraint-feed-mapping.test.ts`: the pure status-resolution mapping reused by both the triggers (via the shared helper) and the readiness tooltips.

---

## Migration manifests (files to author and apply in order)

1. `supabase/migrations/20260919000015_project_members_rls.sql` — R2.1 (project_members RLS + `members` action seed).
2. `supabase/migrations/20260919000016_programme_transmittal.sql` — R2.3 transmittal creation (+ ensure 'Programme' document_type).
3. `supabase/migrations/20260919000017_client_programme_view.sql` — R2.4 view (+ additive QS/DC/SS planning schedule-view seed, item R2.7).
4. `supabase/migrations/20260919000018_tia_scenarios.sql` — 3.1.
5. `supabase/migrations/20260919000019_procurement_constraint_feed.sql` — 3.3.
6. `supabase/migrations/20260919000020_document_rfi_inspection_feed.sql` — 3.4.

Register each in `…15..20` filename order so the Supabase SQL Editor applies them in dependency order. Regenerate types (CT-1) after each batch.

## Verification

- Clean `tsc --noEmit`, `eslint`, `vitest run` after each phase batch.
- Manual per phase: members tab refuses a non-member; a client sees only the approved programme (R2.1/R2.4); a locked task at 100% refuses a progress edit (R2.2); a submitted revision enforces four-eyes and the approved one creates a transmittal (R2.3); a fragnet on the critical path visibly shifts the forecast finish and a levelling preview removes an over-allocation within float (3.1/3.2); a delivered PO flips the materials dot from pending to ok unless overridden (3.3).