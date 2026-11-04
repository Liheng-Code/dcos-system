# DCOS — Daily Reporting Module
## 05 — Integration Specification

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-INT-001 |
| Version | R1 (as built, Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |

---

## 1. Overview

| Module | Direction | What | When | Status |
|---|---|---|---|---|
| Project / WBS | → DR | Projects, time zone, WBS nodes, activities (`wbs_tasks`), steps | Form load | Built |
| Planning & Scheduling | → DR | Activities planned for the date, current progress, unit and suggested trade (`get_daily_report_planning_context`) | Form load | Built |
| Planning & Scheduling | DR → | Progress, step progress, actual dates, status, productivity logs | **On approval** | Built |
| Planning (delay register) | DR → | Delay rows with the approver's classification | On approval | Built |
| Subcontractor Management | → DR | Subcontract link on a unit | Setup | Built (link only) |
| User Management / RBAC | → DR | Accounts, roles, `construction / daily_reporting` permission | Always | Built |
| Notifications | DR → | `task_alerts` (in-app), Telegram DM, email | Each event | Built |
| HSE | DR → | Incident notice to HSE role holders | At submission | Notice only |
| Legacy Site Diary | → DR | One-off import per project | Cut-over | Function built |
| QA/QC, RFI, Inventory, Equipment, IPC, Claims | — | Record linkage and cost allocation | Phase 3 | Not built |

## 2. Planning: inbound

`get_daily_report_planning_context(project_id, date)` returns open activities with progress, dates, quantity unit, suggested trade and steps. The gateway filters them to the unit's WBS scope (scope nodes and all their descendants). Activities whose planned dates span the report date are pre-filled.

## 3. Planning: outbound, on approval

`dr_sync_version_to_planning(version_id)` runs inside the approval transaction.

| Target | Rule |
|---|---|
| `wbs_task_steps.progress` | From the line's step progress; `end_date` set when a step reaches 100 |
| `wbs_tasks.progress` | Through `submit_progress()`, so the schedule's own governance applies: direct update, or a planner review when `progress_review_enabled` is on. The note carries the report number. |
| `wbs_tasks.actual_start_date / actual_finish_date / status / field_observation_notes` | As the legacy sync: earliest start kept; finish and `closed` at 100% with a finish date; `open` → `in_progress` when progress is between 0 and 100 |
| `plan_productivity_logs` | One row per activity line with crew and hours; `quantity_done` = **verified quantity if adjusted, otherwise reported**; `source = 'site_diary'` |
| `delay_register` (+ `delay_register_tasks`) | One row per delay line that the approver classified; `delay_type` is the approver's choice; `cause` is the reported cause |

`dr_planning_links` records the productivity log, progress review and delay register row created for each report line. An amendment therefore **updates** the same productivity log and never creates a second delay row.

Failure of `submit_progress` for one activity (for example a locked completed activity) is recorded on the link row and counted in the result; it does not undo the approval.

**Difference from the legacy flow:** the legacy `sync_daily_report_to_planning()` runs at submit. It is unchanged and still used by the legacy screen. A project must use one flow or the other.

## 4. Delay cause to classification

| Reported cause | Proposed classification |
|---|---|
| Employer caused, Access not released | Compensable |
| Design information, Third-party utility, Authority | Excusable |
| Weather, Force majeure | Non-compensable |
| Contractor caused, Subcontractor caused, Material supply, Other | Non-excusable |

The proposal is a default in the review screen only. The approver's selection is what is stored and sent to the register.

## 5. Notifications

- **In-app:** rows in `task_alerts` with `alert_type` `dr_*`, `metadata.href` pointing to the report, and a `source_key` that prevents duplicates. The notification bell opens `metadata.href`.
- **Telegram DM and email:** rows in `dr_notification_outbox`, delivered by `drainOutbox()` after each API write and by `GET /api/dr/cron/tick`. Uses the shared bot sender (`lib/hr/telegram/bot.ts`) and Resend (`lib/email/resend.ts`). Up to three attempts; the last error is stored.
- Recipient preferences come from `profiles.notification_preferences`. Critical items are emailed even when the email toggle is off.
- No message is posted to any group.

## 6. Recipient resolution

| Group | Resolved as |
|---|---|
| Approvers | `dr_project_approvers` in their dates; otherwise `projects.project_manager_id` |
| Management | Project members holding role L1 or L2 |
| HSE | Project members holding role HSE |
| QS | Project members holding role QS |
| Unit reporters | Active REPORTER members of the unit |

There is no Contract Administrator role; delay notices go to QS and management.

## 7. Scheduled work

| Job | Where | Frequency |
|---|---|---|
| `dr_run_schedule()` | pg_cron job `dr_run_schedule` | Every 15 minutes |
| Outbox delivery | `GET /api/dr/cron/tick` with `Authorization: Bearer <CRON_SECRET>` | Every 5–15 minutes (external scheduler) |

## 8. Malware scanner

`lib/construction/daily-reporting/scanner.ts` streams each new file to a ClamAV daemon (`CLAMAV_HOST`, `CLAMAV_PORT`) using clamd's INSTREAM command. Result recorded in `dr_evidence.scan_engine` (`clamav`, or `signature-check` when no scan was made). With `DR_EVIDENCE_SCAN_REQUIRED=true`, evidence is refused when no scan could be made.

## 9. Legacy import

`dr_backfill_project(project_id)` (service role): creates one `LEGACY` in-house unit, imports each non-draft legacy report as version 1 with channel IMPORT, keeps the most recent when a date has several, maps old delay categories to the new causes, marks verified/closed reports as approved, and never touches planning tables. Idempotent.

## 10. Module boundaries

`app/api/dr`, `lib/construction/daily-reporting` and `components/construction/daily-reporting` belong to the `construction` module in `module-boundaries.mjs`. The module imports only core and the public APIs of other modules.
