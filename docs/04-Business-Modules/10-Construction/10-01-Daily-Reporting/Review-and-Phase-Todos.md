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

## 2. Todo plan by phase (status as of 2026-10-05)

Source of truth for scope: `DCOS_10-01_Daily_Reporting_Module_Design_R1.md` §22 (phasing) and `Phase0-03-Design-R2-Amendments.md`. Detail of what was built and what is unverified: `Phase1A-Delivery-Notes.md`, `Phase1B-Delivery-Notes.md`.

Legend: `[x]` done and verified locally · `[~]` built, not fully verified · `[ ]` open. Owners: **DB** database-engineer, **BE** backend-engineer, **FE** frontend-engineer, **ARCH** system-architect, **QA** code-reviewer, **OWNER** needs a decision or action from the project owner. Production steps are the owner's (`/dbpush`); nothing below touches production.

### Status at a glance

| Phase | Scope (R1 §22) | Status | Blocked by |
|---|---|---|---|
| 0 | Decisions, vocabulary, cut-over plan | Done except two device spikes | Real devices, bot token |
| 1A | Online core: units, form, rules, review, summary | Built and walked through locally | Independent review, live delivery test, real-data import, release switch |
| 1B | Field App, full offline | Built, tested on headless desktop only | Real Android and iOS devices |
| 1C | Telegram identity, binding, Mini App | Built, tested with a stubbed Telegram API only | Mini App registration, a test group, phones |
| 2 | Assurance: AI, statistical rules, delegation, overview | Not started | 10+ approved report days per unit; Khmer samples |
| 3 | Integration: planning, RFI/QAQC/HSE, cost, IPC support, React Native | Not started | Phase 2 data; owner priorities |
| 4 | Intelligence: anomaly, benchmarking, scoring, EVM inputs | Not started | Months of approved history |

---

### Phase 0 — Decisions and foundations (close out)

- [x] ARCH: Q1–Q5 confirmed by the owner 2026-10-04 (`Phase0-01`); vocabulary mapped (`Phase0-02`); G1–G16 resolved as amendments (`Phase0-03`); cut-over plan (`Phase0-04`).
- [ ] ARCH: Reissue the design as **R2** by applying `Phase0-03` to R1 (R1 is now stored in the repo; the amendments still live in a side file). Also fix the numbering mismatch (`04-14` vs `10-01`) in the Documentation Tracker.
- [ ] OWNER: Confirm the eight "decisions made while building" in `Phase1A-Delivery-Notes.md` §5 and the six in `Phase1B-Delivery-Notes.md` §6 (segregation of duties, who sets approvers, empty scope = whole project, recipients, 72 h grant, etc.).
- [ ] OWNER: Close the R1 §26 open items still on defaults: O1 deadline and cut-off, O2 evidence minimum per discipline, O5 bulk approve, O6 languages, O7 photo retention, O8 who publishes when the PM is absent.
- [ ] BE: PWA offline spike on a real Android phone and a real iPhone (checklist in `Phase0-05`). Gates the 1B sign-off.
- [ ] BE: Telegram live checks for R1 §25 items 1–4 against the real bot. Gates 1C.

### Phase 1A — Online core (finish and release)

Built; the remaining work is verification, release and cut-over.

**Verification**
- [ ] QA: Independent code and security review of migrations `…010`–`…020`, the `app/api/dr` routes and RLS. So far there has only been a self-review.
- [ ] BE: Live email delivery test (set `RESEND_API_KEY`, `RESEND_FROM`) and live Telegram DM test with the existing HR bot token.
- [ ] FE: Click-test the notification bell opening a Daily Reporting report.
- [ ] BE: Run the app with `CLAMAV_HOST` and `DR_EVIDENCE_SCAN_REQUIRED=true` and see scan-required behaviour through the UI.
- [ ] QA: Extend RLS tests with an external (`EXT-SUB`) account created through User Management; the Q5 invitation flow was never exercised.

**Release**
- [ ] DB/BE: Regenerate `database.types.ts` and remove any casts that exist only because the types were stale.
- [ ] BE: Schedule `GET /api/dr/cron/tick` (every 5–15 min, `CRON_SECRET`) in the deployment; without it, time-based reminders and escalations only fire when someone uses the module.
- [ ] FE: Add the page to `apps/web/lib/modules/release.ts` once verification above is done (the default is development, so it stays hidden until listed).
- [ ] OWNER: Pick one pilot project; configure units, reporters, schedule and approver in Setup; switch it on.
- [ ] DB: Run `dr_backfill_project()` on a **copy** of real data first, review the `LEGACY` unit result, then on the pilot project. Take a backup before running.
- [ ] OWNER: Promote migrations `20261004000010`–`…020` to production via `/dbpush` after the above (not done by Claude).

**Cut-over (per project, after the pilot is stable)**
- [ ] FE: Retire the old register and editor ("Site Diary (legacy)") for migrated projects; keep the old tables read-only (never dropped in Phase 1).
- [ ] BE: Remove the submit-time planning sync for migrated projects so only the approval-time sync remains.

**Gaps to fill**
- [ ] OWNER/DB: There is no Contract Administrator role in the role list, so delay notices currently go to QS. Decide whether to add the role.
- [ ] OWNER: Approvers and the alternate approver can only be set by a system administrator (by decision). Confirm that is workable for day-to-day PM leave cover (G7).

**Exit criteria:** the pilot project has run 10 working days with no data loss; independent review findings are closed; delivery tests pass against live email and Telegram.

### Phase 1B — Field App, full offline (finish)

- [ ] QA: Field tests on a real Android phone and iPhone: install to home screen, persistent storage granted and denied, airplane-mode capture, reload offline, sync on focus, measure sync lag.
- [ ] QA: Long offline period, large queue (30+ photos), low storage, expired grant.
- [ ] FE: PIN / biometric unlock (design §12.3). Today the app relies on the device lock and the 72 h grant.
- [ ] FE/BE: Admin screen to revoke offline access (the function `dr_revoke_offline_access` already exists).
- [ ] FE: Merge editor for conflicts (the server already supports `MERGE`).
- [ ] BE: Chunked, resumable photo upload (currently one signed upload, 20 MB limit, retried whole).
- [ ] FE: Clean up photos left in IndexedDB after being removed from a draft.
- [ ] QA: Quarantine path through the browser (covered by database tests only so far).
- [ ] BE: Investigate the sign-out on immediate reload seen on the production build (refresh-token reuse interval). It is in the shared sign-in layer, not this module.

**Exit criteria:** a reporter in a basement with no signal files a report with photos on a real phone, and it syncs without loss when signal returns.

### Phase 1C — Telegram (built, not tested live)

Built 2026-10-05 without a live Telegram connection. Detail and what is still unverified: `Phase1C-Delivery-Notes.md`.

- [x] DB: `dr_telegram_bindings` (one active per unit, one active per chat, history kept), binding codes, launch tokens, group status outbox. Identity reuses the HR link flow; no second link table.
- [x] BE: Bot flows in groups: `/bind <code>`, `/report`, bot removed → Suspended, bot re-added, migration to a supergroup held for confirmation.
- [x] BE: Launch token (opaque, 24 h, rotated by cron) and session exchange with the `getChatMember` check; Mini App session limited to one unit and to the four reporter routes.
- [x] BE: Status-only group lines from the audit trail (no quantities, findings or comments).
- [x] FE: Mini App page reusing the report form; re-send after short signal loss.
- [x] FE: Telegram groups card in Setup (bind, change, confirm migration, re-issue button, unbind).
- [x] QA: Abuse tests, 48 database assertions and 37 unit tests (forged or stale `initData`, swapped start parameter, expired or foreign token, non-reporter, user removed from the group, session used for another unit).
- [x] FE/BE: Telegram-only reporter: one-page Mini App form (owner's mock-up), custom fields per unit (R1 §9.5), one-tap Telegram invite, and correction and information answers inside the Mini App.
- [ ] OWNER: Give the app a public HTTPS address (deployment or a temporary tunnel) so the Mini App can open inside Telegram; nothing else blocks it.
- [ ] BE: **Live checks against the real bot** (R1 §25 items 1–8): Mini App launch from a group and the start parameter in `initData`, privacy mode, `my_chat_member` updates reaching the webhook, pinning, group migration, rate limits, camera and file access in the web view.
- [x] BE: Dedicated bot `@DCOSSiteReport_Bot` connected: own token, webhook route, private-chat linking, direct messages, command menus. The attendance bot is untouched.
- [ ] OWNER: Test locally with `node scripts/dr-telegram-poll.mjs`: link an account, bind a test group, check status lines, remove and re-add the bot.
- [ ] OWNER: Register the Mini App with BotFather (`/newapp`, URL `<app url>/dr-miniapp`) and set `TELEGRAM_DR_MINIAPP_LINK`.
- [ ] OWNER: After deployment, set the bot's environment variables and register the webhook (`Phase1C-Delivery-Notes.md` §6).
- [ ] OWNER: Confirm the decisions in `Phase1C-Delivery-Notes.md` §5, in particular that Daily Reporting direct messages now come from the new bot.
- [ ] FE: Walk the Setup card and the Mini App through on a real phone.
- [ ] BE: SMS fallback for users who have not started the bot privately; pick the provider (R1 §25 item 9).
- [ ] BE: Gateway integration test with a Mini App session (needs a disposable database).
- [ ] FE: Khmer text for bot messages and the Mini App (depends on the i18n decision in Phase 2).

**Exit criteria:** a foreman submits from the project group on a real phone; a user removed from the group cannot launch.

### Phase 2 — Assurance

Prerequisite: pilot units have approved history and Phase 1 is stable.

- [ ] BE: Statistical rules (`PROGRESS_JUMP`, `PROGRESS_REGRESS`, `PRODUCTIVITY_ABNORMAL`, `QTY_RANGE`) behind the minimum-history gate (default 10 approved days).
- [ ] BE: Perceptual hash on evidence and the `PHOTO_REUSE` rule.
- [ ] ARCH/DB: Delegated reviewer step as a workflow configuration change, not code; settle O8 (who publishes in the PM's absence).
- [ ] DB: `ai_capability_registry`, `ai_run`, `ai_finding` with an **insert-only** database role and no write path to report, version, review or summary tables.
- [ ] BE: AI capabilities: evidence assessment, text and cross-report reasoning, correction and summary drafting. Advisory and asynchronous, schema-validated output, untrusted-input prompting, categorical assessments (no numeric confidence), per-project daily budget.
- [ ] OWNER/QA: Collect real Khmer and mixed-language samples and evaluate before enabling text interpretation on any project; otherwise limit AI to evidence assessment.
- [ ] FE: Show AI findings only in the PM review package; correction requests show only what the PM approved.
- [ ] BE: Track the PM acceptance rate per finding type; disable weak capabilities.
- [ ] FE: Management Overview dashboard (a view across published summaries) and compliance board.
- [ ] BE: Delay-event feed to Contract Administration (formal task on approval; the potential notice at submission already exists).
- [ ] FE/ARCH: Decide on an i18n layer. None was found in the app, so a Khmer UI (O6) needs infrastructure first.

**Exit criteria:** AI findings never block a report; the PM acceptance rate is measured for at least one project.

### Phase 3 — Integration

- [ ] BE: Planning actuals feed from approved data (finalise the R2 design; the basic approval-time sync already exists).
- [ ] BE: Issues → RFI, inspection requests → QA/QC, incidents → HSE (today these are link fields only).
- [ ] BE: Equipment hours and material usage → cost allocation to WBS.
- [ ] BE: Measurement support for sub-IPC: read-only reported and verified quantities, **no write path to IPC** (D15).
- [ ] FE: KPI dashboards and trend analysis (R1 §20).
- [ ] BE/mobile-engineer: React Native Field App with background sync (this also removes the iOS Background Sync limit).

### Phase 4 — Intelligence

- [ ] Cross-project anomaly detection.
- [ ] Productivity benchmarking from approved history.
- [ ] Unit performance scoring (timeliness, accuracy, correction rate).
- [ ] Forecasting inputs for EVM.

---

## 3. Suggested order of work

1. **First:** independent review of 1A; live email and Telegram DM test; `dr_backfill_project()` on a copy of real data; owner confirms the build-time decisions. These are cheap and decide whether anything needs rework.
2. **Next:** release switch, cron, one pilot project; start the Android and iPhone field test in parallel (1B sign-off).
3. **Then:** Phase 1C live checks with the real bot and a test group; the launch pattern in groups is the biggest unknown and is still unproven.
4. **After 10+ approved days of pilot data:** Phase 2 statistical rules first (deterministic, cheap), AI after the Khmer evaluation.
5. Phases 3 and 4 are planned once Phase 2 data exists; do not start them early.

Cut order if scope must shrink (R1 §22): Mini App convenience features first; never offline capture or the immutable version model.
