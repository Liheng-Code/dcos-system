# Phase 0 — Design R2 Amendments

Amendments to `DCOS_10-01_Daily_Reporting_Module_Design_R1.md`. Apply these when R1 is reissued as R2. Items marked **(ADR)** depend on a decision in `Phase0-01-ADRs-and-Defaults.md`.

| ID | R1 section | Amendment |
|---|---|---|
| G1 | §10.1, §12.4, D9/D18 | **Intake failures at offline sync never drop data.** Online: hard errors reject, nothing persisted, attempt audited. Offline sync: a failure of server-side intake rules stores the payload as a version with `sync_state = REQUIRES_REVIEW` and attaches the failed rules. The PM resolves it. Only structural failures that make the payload unparseable go to a quarantine record, which is kept and shown to the PM. |
| G2 | §10.6, §15.13 | **Kept both** means: the incoming payload becomes the next `CORRECTION` version of the existing report; the original incoming payload is preserved in `dr_sync_conflict.incoming_payload`. Unique `(unit_id, report_date)` is unchanged. |
| G3 | §15.8 | `dr_activity_progress.verified_qty` is **removed**. Verified quantities go in `dr_verified_quantity(version_id, line_id, verified_qty, remark, decided_by, decided_at)`, insert-only, written with the review decision. |
| G4 | §15.7–15.8 | `payload` is authoritative. Line tables are projections written by a single function `dr_project_version(version_id)` in the same transaction as the version insert. A reconcile query compares line totals to payload and is run in tests. |
| G5 | §15.1 | `wbs_scope uuid[]` is replaced by `reporting_unit_wbs_scope(unit_id, wbs_node_id)` with foreign keys. |
| G6 | §15.7, D14 | Immutability is enforced in the database: `BEFORE UPDATE OR DELETE` triggers raising an exception on `daily_report_version`, `dr_review_decision`, `dr_verified_quantity`, `dr_audit_log`, `rule_result`, `ai_finding`, and on hash/timestamp columns of `dr_evidence`. `UPDATE`/`DELETE` privileges are revoked from `authenticated`. Tests prove an update fails even as the table owner via the API role. |
| G7 | §13.4, O8 | **Alternate approver in Phase 1A.** `dr_project_approver(project_id, user_id, role: PRIMARY\|ALTERNATE, valid_from, valid_to)`. Company Admin sets it; every change is audited. The alternate has the same powers only inside the validity window. |
| G8 | §8.3 | After the late window, a report is accepted with `LATE` and `BACKDATED` flags. It is never rejected for time alone. `dr_missing_report` closes as `Late Submitted`. |
| G9 | §16.1 | A delay event with `notice_required` notifies Contract Admin as a **potential notice at submission** (informational, in-app + email). The formal task is created on approval. **(ADR-2)** Confirm with the Contract Administrator that submission-time awareness matches the contract time bar. |
| G10 | §13.8 | An Official summary revision is issued only if the included `(report_id, version_no)` set changed. Revisions are batched: changes after publish create a pending revision, and the PM publishes when ready. No automatic republish. |
| G11 | §10.6 | A `NO_WORK` report may be superseded by a `WORK` version for the same date before the summary cut-off, with a mandatory reason. After cut-off it needs an amendment. |
| G12 | §9.6 | Evidence status machine `Uploading → Scanning → Available`. A scan worker (ClamAV or equivalent) is a required Phase 1A component. Reviewers see nothing until `Available`; quarantined files are listed by hash only. |
| G13 | §12.1, §25 | Add to verify list: iOS has no Background Sync API; Safari may evict storage for non-installed web apps. Field App must (a) request persistent storage, (b) prompt install, (c) sync in the foreground and on app focus, (d) warn when unsynced items are older than a threshold. |
| G14 | CLAUDE.md | Vitest exists. Add a DB test harness (pgTAP via `supabase test db`, or SQL tests in CI) in Phase 1A for RLS, immutability triggers and idempotency. |
| G15 | §7.6, §15 | Every `dr_*` table gets policies through `dr_has_project_access(project_id, unit_id)`. Reporters see only their unit; PM/Director see the project; WBS scope applies at write time. Negative tests: non-member, member of another unit, suspended member, expired `valid_to`. **(ADR-3)** |
| G16 | §21 | Khmer is not committed for Phase 1A (O6). A string-resource layer is introduced in the form components so Khmer can be added without refactoring. |

## Further amendments from the repo check

| ID | R1 section | Amendment |
|---|---|---|
| A1 | §6, §15 | Remove `tenant_id`. Scope by `project_id` (ADR-3, mapping doc §1). |
| A2 | §19 | Approval, Notification and Audit "engines" become per-module services with interfaces (ADR-3). |
| A3 | §19, Phase 3 | The planning sync is **approval-time and starts in Phase 1A**, not Phase 3 (ADR-2). Phase 3 keeps only the richer feed (actual start/finish forecasts, EVM inputs). |
| A4 | §9.4 | Delay causes map to `delay_register.delay_type` only after PM confirmation (mapping doc §2). |
| A5 | §15.6 | `daily_report` gets `source_site_report_id` (nullable FK to old `site_daily_reports`) to trace migrated rows. |
| A6 | §18 | API paths are Next.js route handlers under `app/api/dr/...` (R1 paths shown relative). Edge functions only for Telegram session exchange and the evidence scan callback. |
| A7 | §7.3 | The "same format as 03-01 §5.4 session token" requirement is replaced by "a standard Supabase session". `client_type` is recorded in the audit event, not the token. |
