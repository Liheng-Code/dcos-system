# 10-01 Daily Reporting — Design Review and Phase Todos

Reviews `DCOS_10-01_Daily_Reporting_Module_Design_R1.md` against the current repo (checked 2026-10-04).

---

## 1. Review

### 1.1 Verdict

The design is strong: immutable versions, reporter/verified/certified quantity split, rules-vs-AI separation, status-only group messages, and No-Work as an explicit report. The problems are not in the concept. They are in how it meets the codebase that already exists, and in Phase 1 being too large.

### 1.2 Conflicts with what already exists

| # | Finding | Evidence in repo | Consequence |
|---|---|---|---|
| R1 | **A daily report module already ships.** `site_daily_reports` is one editable, deletable report per project per date, with no unit, no versions, no state fields. | `20260531000044_site_execution.sql`, `20260928000005..8`, `lib/construction/site/daily-report-service.ts`, `components/construction/site/*` | R1 says nothing about migration. Need an explicit evolve-or-replace decision, a data backfill, and a cut-over plan. |
| R2 | **Existing submit pushes unapproved data downstream.** `sync_daily_report_to_planning()` writes progress, `plan_productivity_logs` and `delay_register` at submit. R1 says planning receives approved data only (§19, Phase 3). | `17-Site-Daily-Report-Planning-Integration.md` | Direct contradiction. The sync trigger must move from submit to approval, or planning will consume unverified quantities. |
| R3 | **The shared engines R1 relies on do not exist.** No Approval Workflow Engine, Notification Engine or Audit Trail Engine. Each module has its own tables (`procurement_audit_log`, `qs_notifications`, `qs_claim_approvals`, `project_approval_flows`, ...). | migrations grep | `DR_REVIEW` template, Notification Matrix and §17 audit events have no host. Decide: build thin shared helpers, or use `project_approval_flows` plus `dr_*` tables like other modules. |
| R4 | **Auth model mismatch.** R1 assumes Module 03-01 (`app_user`, `identity_link`, session tokens, offline assertions, `tenant_id`). Repo uses Supabase Auth + `profiles` + `company_id` in a JWT hook. | `20260623000001_add_company_id_to_profiles_jwt_hook.sql` | Telegram session exchange must mint a Supabase-compatible session (edge function + custom JWT). "Offline assertion" has no equivalent and must be designed on Supabase refresh tokens. |
| R5 | **Vocabulary mismatch.** R1 uses `wbs_node_id + activity_id`; the existing report links `wbs_tasks` + `wbs_task_steps`. Delay categories differ (R1 §9.4 has 11, existing has 8). | `site_daily_report_activities` | Map once, in Phase 0, before schema work. |
| R6 | **Reusable pieces exist:** `subcontracts`, `delay_register`, `public_holidays`, `site_progress_photos`, storage bucket, running-number tables, HR employee master, `module-boundaries.mjs` / `public.ts` pattern. | migrations, `lib/construction/site/public.ts` | Use them. Report numbers (`DR-2026-000148`) should follow the existing running-number pattern. |

### 1.3 Gaps and internal inconsistencies in R1

| # | Issue | Recommendation |
|---|---|---|
| G1 | **Offline sync vs intake hard-fail.** §10.1 says hard errors create no record; D18 says offline site work is never dropped. A report that passed local rules but fails server rules at sync (rule set changed, WBS scope changed, user suspended) is undefined. | At sync, intake failures go to a `REQUIRES_REVIEW` holding state with the payload kept. Never discard. Hard-reject only online. |
| G2 | **"Keep both as distinct versions" vs `UNIQUE(unit_id, report_date)`.** Fine for versions of one report, but "both" from two devices is two originals. | Define: kept-both = second payload becomes a CORRECTION version of the same report; original payloads stay in `dr_sync_conflict`. |
| G3 | **Verified quantity lives in an "immutable" table.** `dr_activity_progress.verified_qty` is set at approval, but versions are append-only. | Store verified quantities in a separate `dr_verified_quantity` (version_id, line_id, value, remark, decided_by) or only in `dr_review_decision`. Leave line tables write-once. |
| G4 | **Two sources of truth.** `payload` jsonb and line tables both hold the content. | `payload` is authoritative. Line tables are projections written by one DB function in the same transaction as the version insert. Add a reconcile check. |
| G5 | **`wbs_scope uuid[]` has no referential integrity.** | Use a join table `reporting_unit_wbs_scope`. |
| G6 | **Immutability is stated, not enforced.** RLS does not stop service-role writes. | Triggers that raise on UPDATE/DELETE for version, evidence hash, audit, decision tables; revoke UPDATE/DELETE grants. Test it. |
| G7 | **PM is a single point of failure in Phase 1.** O8 (who publishes when PM is absent) is deferred to Phase 2. Leave, sickness and resignation are certain. | Pull a minimal "alternate approver / acting PM" into Phase 1 (config on the project, audited). |
| G8 | **Late window end is undefined.** After 09:00 next day, what happens to a report? | Define: accepted with LATE + BACKDATED flags, PM-visible, no hard block. Needed by the missing-report job. |
| G9 | **Delay notice is raised only after approval** (§16.1). Contract time bars usually run from awareness, and approval can lag 24–48 h. | Notify Contract Admin at submission as "potential notice"; formal task on approval. Confirm with the contract admin. |
| G10 | **Summary churn.** Every late approval or amendment supersedes an Official revision. | Rule: only publish a revision when included data changed, and batch within a cut-off window. |
| G11 | **NO_WORK then real work same day.** DUP_REPORT blocks it. | Allow NO_WORK to be superseded by a WORK version before the cut-off, with reason. |
| G12 | **Photo malware scanning has no host.** Supabase Storage does not scan. | Scan worker (ClamAV or similar) between `Uploading` and `Available`; evidence invisible until scanned. |
| G13 | **PWA offline limits not listed in §25.** iOS has no Background Sync and evicts storage for non-installed web apps. | Add to verify list; plan foreground sync, install prompt, and persistent-storage request. |
| G14 | **No test strategy.** CLAUDE.md says no test runner is configured. | Immutability, idempotency, RLS and rules need automated tests from the first migration (a `daily-report-sync.test.ts` already exists to extend). |
| G15 | **RLS for external users unspecified.** Subcontractor reporters must see only their unit; WBS scope must be enforced in RLS, not just the UI. | Design policies per table (unit membership + project + scope) and test with a non-member. |
| G16 | **No i18n/Khmer infrastructure noted.** | Check whether the app has an i18n layer before promising Khmer UI in Phase 1. |

### 1.4 Phase 1 is too large

Phase 1 combines the new report model, PM review, offline PWA and Telegram. R1 itself calls this the largest risk. Split it:

- **1A** Online core (web form + review + summary). Proves the model.
- **1B** Field App PWA offline.
- **1C** Telegram identity, binding and Mini App.

Cut order if scope must shrink: 1C polish, then 1B background features. Never cut immutability or the unit/version model.

### 1.5 Decisions needed before Phase 0 closes

| # | Decision | Recommendation |
|---|---|---|
| Q1 | Evolve `site_daily_reports` or build `daily_report` beside it? | Build the new model beside it; migrate and retire the old one. The old model cannot become immutable and versioned in place. |
| Q2 | Move planning sync from submit to approval? | Yes (see R2). |
| Q3 | Shared engines or per-module tables? | Per-module `dr_*` tables now, behind a small service interface so they can be swapped. |
| Q4 | Telegram session design on Supabase Auth | Edge function exchanging initData for a Supabase session; spike first. |
| Q5 | Is subcontractor reporting external users with Supabase accounts? | Confirm against `stakeholder_staff` and invitation flow. |

---

## 2. Todos by Phase

Legend: `[ ]` open. Owner hints use existing agents: **DB** database-engineer, **BE** backend-engineer, **FE** frontend-engineer, **ARCH** system-architect, **QA** code-reviewer.

### Phase 0 — Decisions and foundations

- [~] ARCH: Resolve Q1–Q5 and record as ADRs. *Drafted as proposals in `Phase0-01`; awaiting owner confirmation.*
- [x] ARCH: Map R1 vocabulary to repo. See `Phase0-02`. O3/O4 defaulted.
- [~] ARCH: Resolve open items O1, O2, O5, O6, O8. *Defaults proposed in `Phase0-01`; awaiting confirmation.*
- [x] ARCH: Fix the G1–G16 design points. See `Phase0-03` (R2 amendments; R1 itself not reissued).
- [x] ARCH: Write the cut-over plan. See `Phase0-04`.
- [~] BE: Spike Telegram / Supabase session. *Desk research done; live checks and session spike not run (need bot token and devices). See `Phase0-05`. Gates 1C only.*
- [~] BE: Spike PWA offline on Android and iOS. *Checklist written; not run (needs devices). Gates 1B only.*
- [~] QA: Test runner. *Vitest already exists. DB/RLS harness still to build in 1A (G14).*
- [~] DOCS: 12-doc pack. *Folder and tracker README created; documents themselves start in 1A.*
- [x] DB: `construction` boundary entries. *Already covered in `module-boundaries.mjs`; new route/lib paths fall under existing `lib/construction` and `components/construction`. Nav entry deferred to 1A.*

### Phase 1A — Online core

Built 2026-10-04. Detail and what is still unverified: `Phase1A-Delivery-Notes.md`.

**Database**
- [x] Reporting units, members, WBS scope table, schedule, non-working days, approvers.
- [x] `dr_reports`, immutable `dr_report_versions`, line tables, running numbers.
- [x] `dr_evidence` with hash and device/server timestamps; private bucket.
- [x] Rule definitions and results; seed of intake and no-history post-submit rules.
- [x] Review decisions, verified quantities, delay classification, correction requests and items.
- [x] Missing reports, project daily summaries, audit log, notification outbox.
- [x] RLS per unit and per project, with negative tests.
- [~] Backfill of old `site_daily_reports`: function written and tested on fixtures; **not run on real data**.

**Backend**
- [x] Submit pipeline (auth → context → rules → atomic persist → idempotent receipt).
- [x] Intake and post-submit rules.
- [x] Draft save, withdraw, item-level resubmit, No Work report and its replacement (G11).
- [~] Evidence upload: signed upload, content-type signature check and hash written; **no malware scanner**; upload path untested end to end.
- [x] Review service with verified quantities and mandatory comments.
- [x] Post-approval amendment and summary revision.
- [x] Alternate approver (G7).
- [x] Missing-report job, reminders, escalation timers.
- [~] Notifications: in-app tested; Telegram/email delivery written, **not tested against live services**.
- [x] Summary compile, coverage, publish, no-change guard (G10).
- [x] Planning sync on approval (R2); potential delay notice at submission (G9).
- [x] Audit events.

**Frontend** — walked through in a browser on 2026-10-04 (09-Test-Plan §4)
- [x] Setup: create unit with scope, add reporter, save schedule, project switch.
- [x] Report form with pre-filled activities, live rules, review-before-submit, No Work report.
- [x] Evidence capture, upload and viewing.
- [x] My Reports / returned items, item-level correction, withdraw, answer to an information request, amendment.
- [x] Review inbox and review package (return, request information, approve with verified quantity).
- [x] Daily summary, publish, revision 2.
- [x] Missing Reports board and excuse.
- [~] Notification bell opening the report: changed, **not verified by click**.
- [ ] Retire the old register/editor (per project, after cut-over).

**Quality**
- [x] Tests: 96 database assertions, 26 unit tests, 10 integration tests (opt-in).
- [x] Malware scanning with ClamAV, tested against a real daemon with the EICAR file.
- [x] Security self-review and hardening (`20261004000013`).
- [x] 12-document pack.
- [ ] Independent code and security review (not done by a second reviewer).
- [ ] Live Telegram and email delivery test.
- [ ] Legacy import on real data.

### Phase 1B — Field App PWA, full offline

Built 2026-10-04. Detail and what is still unverified: `Phase1B-Delivery-Notes.md`.

- [x] Offline credential model: per-device grant with expiry, extension on check-in, revocation, device registration.
- [x] Never-drop handling (G1): flagged REQUIRES_REVIEW, conflict, or quarantine. Only a never-authorised push is refused.
- [x] DB: `dr_devices`, `dr_offline_grants`, `dr_version_origins`, `dr_sync_conflicts`, `dr_reports.review_flags`.
- [x] `/api/dr/sync/pull` (forms, rule set, assignments, recent reports, grant).
- [x] `/api/dr/sync/push` (idempotent), `/sync/evidence` (EVIDENCE_PENDING → SYNCED), `/sync/conflicts/:id/resolve`.
- [x] PWA: `/field` with its own manifest, service worker cache, IndexedDB local-first store, persistent-storage request.
- [x] Local rule execution from the cached rule set (same engine as the server).
- [~] Photo upload: stored on the device, compressed on a constrained connection, uploaded after the report with retry. **Not chunked or resumable.**
- [x] Sync status bar and per-item state; conflict resolution in the Field App and for the approver (G2).
- [ ] PIN / biometric unlock. Not built.
- [ ] Merge editor for conflicts. Not built (keep existing / keep offline as new version only).
- [ ] Admin screen to revoke offline access. Function only.
- [ ] Field tests on real Android and iOS devices; sync-lag measurement. **Not done: headless desktop browser only.**

### Phase 1C — Telegram

- [ ] DB: `identity_link` (telegram), `telegram_link_code`, `telegram_group_binding` with one-active constraints.
- [ ] BE: Bot webhook (signature-verified), privacy mode, link-code flow, binding flow, migration and removal handling.
- [ ] BE: Launch token issue/validate; `getChatMember` check at session exchange; session exchange edge function (Q4).
- [ ] BE: Telegram notification adapter with status-only group messages, DM fallback to in-app/SMS, rate-limit handling.
- [ ] FE: Mini App shell reusing the form; draft autosave and queued submit for short signal loss.
- [ ] FE: Admin Telegram bindings screen and migration alerts.
- [ ] Verify remaining §25 items (6–9); pick SMS provider.
- [ ] QA: Abuse tests (forged initData, replayed token, user removed from group, foreign group).

### Phase 2 — Assurance

- [ ] Delegated reviewer step (template/config change, not code).
- [ ] Statistical rules (PROGRESS_JUMP, PROGRESS_REGRESS, PRODUCTIVITY_ABNORMAL, QTY_RANGE) with minimum-history gate.
- [ ] Photo perceptual hash and PHOTO_REUSE.
- [ ] AI: capability registry, `ai_run` / `ai_finding`, insert-only DB role, prompt-injection controls, per-project budget.
- [ ] AI: evidence assessment, text/cross-report reasoning, correction and summary drafting.
- [ ] Khmer/mixed-language evaluation on real samples before enabling per project.
- [ ] PM acceptance-rate tracking for AI findings.
- [ ] Management overview dashboard.
- [ ] Delay-event feed to Contract Administration.

### Phase 3 — Integration

- [ ] Planning actuals feed from approved data (finalise R2 design).
- [ ] RFI / QA/QC / HSE linkage (issues → RFI, inspection requests → QA/QC, incidents → HSE).
- [ ] Equipment and material usage → cost allocation to WBS.
- [ ] Measurement support for sub-IPC (read-only, no write path to IPC).
- [ ] KPI dashboards and trends.
- [ ] React Native Field App with background sync (mobile-engineer).

### Phase 4 — Intelligence

- [ ] Cross-project anomaly detection.
- [ ] Productivity benchmarking.
- [ ] Unit performance scoring.
- [ ] Forecasting inputs for EVM.

---

## 3. Suggested next step

Run Phase 0. Q1 (new model beside the old one) and Q2 (planning sync at approval) decide the Phase 1A schema, so settle those first.
