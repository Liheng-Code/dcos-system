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
| 1C | Telegram identity, binding, Mini App | Live in production since 2026-10-05; first report submitted from a group | Remaining live checks, SMS fallback, Khmer text |
| 2 | Assurance: AI, statistical rules, delegation, overview | Started 2026-10-05: statistical rules built | 10+ approved report days per unit; Khmer samples |
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
- [x] OWNER: Migrations `20261004000010`–`20261005000020` promoted to production via `/dbpush` on 2026-10-05.

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

### Phase 1C — Telegram (live in production)

Built and deployed 2026-10-05. A foreman submitted DR-2026-000001 from the project group on a real phone. Detail: `Phase1C-Delivery-Notes.md`.

- [x] DB: `dr_telegram_bindings` (one active per unit, one active per chat, history kept), binding codes, launch tokens, group status outbox. Identity reuses the HR link flow; no second link table.
- [x] BE: Bot flows in groups: `/bind <code>`, `/report`, bot removed → Suspended, bot re-added, migration to a supergroup held for confirmation.
- [x] BE: Launch token (opaque, 24 h, rotated by cron) and session exchange with the `getChatMember` check; Mini App session limited to one unit and to the four reporter routes.
- [x] BE: Status-only group lines from the audit trail (no quantities, findings or comments).
- [x] FE: Mini App page reusing the report form; re-send after short signal loss.
- [x] FE: Telegram groups card in Setup (bind, change, confirm migration, re-issue button, unbind).
- [x] QA: Abuse tests, 48 database assertions and 37 unit tests (forged or stale `initData`, swapped start parameter, expired or foreign token, non-reporter, user removed from the group, session used for another unit).
- [x] FE/BE: Telegram-only reporter: one-page Mini App form (owner's mock-up), custom fields per unit (R1 §9.5), one-tap Telegram invite, and correction and information answers inside the Mini App.
- [x] OWNER: Public HTTPS address: the Vercel production deployment.
- [x] BE: Live against the real bot: Mini App launch from a group with the start parameter in `initData`, `/bind`, pinning, photo upload in the web view.
- [x] FE/BE: A submission is posted to the group in full; approvers can open the Mini App read-only; the Mini App shows the submitted report.
- [ ] BE: Live checks still open: a user removed from the group is refused, bot removed and re-added, group migration to a supergroup, rate limits.
- [x] BE: Dedicated bot `@DCOSSiteReport_Bot` connected: own token, webhook route, private-chat linking, direct messages, command menus. The attendance bot is untouched.
- [x] OWNER: Mini App registered with BotFather; `TELEGRAM_DR_MINIAPP_LINK` set.
- [x] OWNER: Bot environment variables set in Vercel and the webhook registered.
- [ ] OWNER: Confirm the decisions in `Phase1C-Delivery-Notes.md` §5, in particular that Daily Reporting direct messages now come from the new bot.
- [x] FE: Setup card and Mini App walked through on a real phone.
- [ ] BE: SMS fallback for users who have not started the bot privately; pick the provider (R1 §25 item 9).
- [ ] BE: Gateway integration test with a Mini App session (needs a disposable database).
- [ ] FE: Khmer text for bot messages and the Mini App (depends on the i18n decision in Phase 2).

**Exit criteria:** a foreman submits from the project group on a real phone; a user removed from the group cannot launch.

### Phase 2 — Assurance

Prerequisite: pilot units have approved history and Phase 1 is stable.

- [~] BE: Statistical rules (`PROGRESS_JUMP`, `PRODUCTIVITY_ABNORMAL`, `QTY_RANGE`; `PROGRESS_REGRESS` existed since 1A) behind the minimum-history gate (default 10 approved days). Built 2026-10-05, migration `20261005000030`, 16 unit tests. Not yet seen against real approved history: no unit has 10 approved days. Thresholds are first guesses to tune on pilot data.
- [~] FE/DB: Rules card in Setup, built 2026-10-05, migration `20261005000060`: a project administrator switches an after-submit rule off, changes its thresholds (including the `QTY_RANGE` ranges per unit of measure) or returns it to the default. Intake rules are listed and cannot be changed per project. Every change bumps the rule version and is written to the audit log. 11 database assertions, 11 unit tests. Not yet clicked through in a browser. Global defaults are still changed in the database only.
- [~] BE: Perceptual hash on evidence and the `PHOTO_REUSE` rule. Built 2026-10-05, migration `20261005000040`, 13 unit tests. Compares within the unit, 60 days back; warns on the same file or a look-alike. Not yet tried with real site photos; photos registered earlier have no perceptual hash (same-file match only); HEIC photos are matched by same file only; photos attached late by the offline app are hashed but not checked.
- [~] ARCH/DB: Delegated reviewer. O8 settled by the owner 2026-10-05: the alternate approver that exists since 1A covers the PM's absence (same authority inside its dates, set by a system administrator); no second review step. Added 2026-10-05, migration `20261005000050`: cover can be dated to start in the future, and setting, changing or removing an approver is written to the audit log. 15 database assertions. The Setup screen change has not been clicked through in a browser. Open: the alternate is not told when appointed (they get review notifications once the cover starts).
- [~] DB: AI tables, built 2026-10-05, migration `20261005000070`: `dr_ai_capabilities` (registry), `dr_ai_project_settings` (off by default, daily limit), `dr_ai_runs` and `dr_ai_findings` (append-only), `dr_ai_finding_feedback`. Deviation from the design: there is no separate database role. The app has one server role, so the limit is enforced by the two functions that are the only write path (`dr_ai_claim`, `dr_ai_record_run`); the only report column they write is `assurance_state`. 40 database assertions.
- [~] BE/FE: **Evidence assessment** capability, built 2026-10-05. Runs after the response to a submission (and from the cron tick), on photos tied to activities only (at most 8 activities, 3 photos each, downscaled). Four categorical assessments, no confidence figure; reporter text and photo content are marked as untrusted; the answer is accepted only through a fixed schema. Shown in the approver's review package only, with a useful / not useful rating per flagged finding; the acceptance rate is shown in Setup. 16 unit tests with a stubbed model. **Not verified against the real model**: no API key was available locally, so the request shape and model name are untested. Needs `ANTHROPIC_API_KEY` on the server, and the project switched on in Setup. Not covered: photos the offline app attaches after its report.
- [ ] BE: Remaining AI capabilities: text and cross-report reasoning, correction and summary drafting (held for the Khmer evaluation below). Advisory and asynchronous, schema-validated output, untrusted-input prompting, categorical assessments (no numeric confidence), per-project daily budget.
- [ ] OWNER/QA: Collect real Khmer and mixed-language samples and evaluate before enabling text interpretation on any project; otherwise limit AI to evidence assessment.
- [ ] FE: Show AI findings only in the PM review package; correction requests show only what the PM approved.
- [ ] BE: Track the PM acceptance rate per finding type; disable weak capabilities.
- [~] FE: Management Overview dashboard (a view across published summaries) and compliance board. Built 2026-10-05 as the "Overview" tab: totals, one row per project the user may see (compliance, late, missing, manpower trend, delays, issues, incidents) and the unit compliance board of the selected project, over 7, 14 or 30 days. Official summaries only; unpublished days are listed and not counted. 10 unit tests on the calculation. No migration. Not yet opened in a browser, and no summary has been published yet, so it has not been seen with real figures. Open: progress versus plan, project comparison charts, export.
- [x] BE: Delay-event feed to Contract Administration. Checked 2026-10-05: already in place since 1A. A delay marked "notice required" alerts QS at submission and again, as Critical, on approval, and approved delays are written to the delay register. Still open as an owner decision: there is no Contract Administrator role, so the alert goes to QS (see Phase 1A gaps).
- [ ] FE/ARCH: Decide on an i18n layer. None was found in the app, so a Khmer UI (O6) needs infrastructure first.

**Exit criteria:** AI findings never block a report; the PM acceptance rate is measured for at least one project.

### Phase 3 — Integration

- [ ] BE: Planning actuals feed from approved data (finalise the R2 design; the basic approval-time sync already exists).
- [~] BE/FE: Issues → RFI, inspection requests → QA/QC, incidents → HSE. Built 2026-10-05, migration `20261005000080`: a "Follow-up records" card in the review package lets the approver raise a design RFI from an issue, an inspection request from an inspection line, or an HSE incident from the safety section, each linked back to the report line and audited. The toolbox talk of an approved report is written to the HSE register automatically. Raising is deliberate, one record at a time: nothing a reporter typed becomes a record elsewhere by itself. 22 database assertions. Not yet clicked through in a browser. Open: the link opens the other module's list, not the record itself; the other modules do not show which report a record came from except in its text; the Mini App form has no inspection or incident fields, so those lines come from the web form only.
- [ ] BE: Equipment hours and material usage → cost allocation to WBS.
- [~] BE/FE: Measurement support for sub-IPC, built 2026-10-05, migration `20261005000090`: a "Site Measurement" tab on the subcontract page shows, for a period (or a certificate's period), the reported and verified quantity per activity from approved reports of the units linked to the subcontract, with days reported, progress, the contract items on the same WBS node, and a CSV export. Reports not yet approved are counted and left out. Read-only: one stable `security invoker` function, **no write path to IPC** (D15). 11 database assertions, 3 unit tests. Not yet clicked through in a browser. Needs each reporting unit linked to its subcontract in Setup. Open: activities are pointed at contract items by WBS node only; there is no mapping of activities to contract items.
- [~] FE: KPI dashboards and trend analysis (R1 §20). Built 2026-10-05 as part of the "Performance" tab (see Phase 4): reports per week by outcome. Not yet clicked through in a browser. Open: trends of manpower, delays and progress against plan.
- [ ] BE/mobile-engineer: React Native Field App with background sync (this also removes the iOS Background Sync limit).

### Phase 4 — Intelligence

Started 2026-10-05 at the owner's request, ahead of the months of history the plan asks for; the screens fill as reports are approved. Migration `20261005000100` (one read-only function, `dr_performance`). 9 database assertions, 9 unit tests. Not yet clicked through in a browser.

- [ ] Cross-project anomaly detection.
- [~] Productivity benchmarking from approved history. Built: output per worker per day by activity and unit, from verified quantities, against the project's median day for that activity. Within one project only: activities are not comparable across projects yet (no shared activity catalogue). Needs reports that give both a quantity and a headcount on the activity line.
- [~] Unit performance scoring (timeliness, accuracy, correction rate). Built: "Performance" tab for project-wide viewers, weakest unit first. Score = on time 40 + accepted without return 30 + quantities left unchanged by the approver 30; no score under 5 reports due; a part with no data is left out and the rest re-weighted. The weights are a first proposal for the owner to confirm. Reporting units do not see it.
- [ ] Forecasting inputs for EVM.

---

## 3. Suggested order of work

1. **First:** independent review of 1A; live email and Telegram DM test; `dr_backfill_project()` on a copy of real data; owner confirms the build-time decisions. These are cheap and decide whether anything needs rework.
2. **Next:** release switch, cron, one pilot project; start the Android and iPhone field test in parallel (1B sign-off).
3. **Then:** Phase 1C live checks with the real bot and a test group; the launch pattern in groups is the biggest unknown and is still unproven.
4. **After 10+ approved days of pilot data:** Phase 2 statistical rules first (deterministic, cheap), AI after the Khmer evaluation.
5. Phases 3 and 4 are planned once Phase 2 data exists; do not start them early.

Cut order if scope must shrink (R1 §22): Mini App convenience features first; never offline capture or the immutable version model.
