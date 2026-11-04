# DCOS — Daily Reporting Module
## 04 — Database Schema

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-DB-001 |
| Version | R1 (as built, Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |
| Migrations | `20261004000010_dr_core_schema.sql`, `…011_dr_functions.sql`, `…012_dr_legacy_backfill.sql`, `…013_dr_hardening.sql` |

---

## 1. Principles

1. **Scoped by project.** No tenant column; every table carries `project_id` (directly or through its parent).
2. **Payload is authoritative.** `dr_report_versions.payload` holds the whole report. Line tables are projections written by `dr_project_version()` in the same transaction.
3. **Append-only records.** Triggers reject UPDATE and DELETE on version, line, rule-result, decision, verified-quantity and audit tables.
4. **No client write path to records.** `authenticated` has SELECT only. Writes happen in `dr_*` functions executable by `service_role` only.
5. **One access predicate.** `dr_has_project_access(project_id, unit_id)` is used by every record policy.

## 2. Tables

### Configuration (written under RLS by a project's Daily Reporting admin)

| Table | Purpose | Key columns |
|---|---|---|
| `dr_reporting_schedules` | Deadline, reminder, late window, working days, time zone | `project_id`, `deadline_time`, `reminder_time`, `late_window_hours`, `working_days int[]`, `timezone` (null = project's) |
| `dr_non_working_days` | Project holidays and shutdowns | PK (`project_id`, `day`) |
| `dr_reporting_units` | The party that reports | `unit_code` (unique per project), `unit_type`, `subcontract_id`, `department_id`, `status`, `required_sections`, `evidence_min_policy`, `mobilised_at` |
| `dr_reporting_unit_wbs_scope` | Scope nodes | PK (`unit_id`, `wbs_node_id`) |
| `dr_reporting_unit_members` | Reporters and viewers | `member_role`, `is_lead`, `valid_from`, `valid_to`, `status` |
| `dr_project_approvers` | Primary / alternate approver | `approver_role`, `valid_from`, `valid_to` (system administrator only) |
| `dr_rule_definitions` | Rule severity and parameters | `project_id` null = global; project row overrides |

### Records

| Table | Purpose | Notes |
|---|---|---|
| `dr_reports` | One row per unit per date | Unique (`unit_id`, `report_date`); `report_no` `DR-YYYY-NNNNNN`; four state fields; `late_flag`, `backdated_flag`, `imported_flag`; `current_version_no`, `approved_version_no` |
| `dr_report_versions` | Immutable versions | `version_kind` ORIGINAL / CORRECTION / AMENDMENT; `payload`; `content_hash` (SHA-256); `idempotency_key` unique per project; `channel`; `change_reason` |
| `dr_drafts` | Server draft per unit and date | Mutable by design |
| `dr_activity_progress`, `dr_manpower`, `dr_equipment`, `dr_materials`, `dr_delay_events`, `dr_issues`, `dr_instructions_received`, `dr_inspection_requests`, `dr_weather`, `dr_safety`, `dr_area_access`, `dr_next_day_plan` | Projections per version | Keyed by `version_id` + `line_id`; CHECK constraints on ranges |
| `dr_evidence` | Files | `storage_key`, `sha256`, `mime_type`, `size_bytes`, `captured_at_device`, `received_at_server`, `scan_status`, `scan_engine`; only scan fields may change |
| `dr_rule_results` | Findings stored with a version | Reviewer-only |
| `dr_review_decisions` | Decisions | CHECK: comment required unless APPROVE |
| `dr_verified_quantities` | PM-accepted quantities | Unique (`version_id`, `line_id`); remark required |
| `dr_delay_classifications` | PM's contractual classification | Backlink to `delay_register` |
| `dr_correction_requests`, `dr_correction_items` | Returns and information requests | Items target a section and optionally a line |
| `dr_missing_reports` | Missing records | Unique (`unit_id`, `report_date`); `escalation_level` |
| `dr_project_daily_summaries` | Summary rows | Revision 0 = Live; ≥1 = published |
| `dr_planning_links` | What each report line created in planning | Makes the approval sync repeatable |
| `dr_audit_log` | Append-only event log | |
| `dr_notification_outbox` | Telegram / email queue | `source_key` unique |
| `dr_running_numbers` | Report number counter per year | Service role only |

Also: `projects.dr_enabled`, and the `task_alerts.alert_type` check extended with `dr_*` types.

## 3. State fields on `dr_reports`

| Field | Values |
|---|---|
| `submission_state` | DRAFT · QUEUED_OFFLINE · SUBMITTED · RETURNED · WITHDRAWN |
| `assurance_state` | PENDING · RULES_DONE · AI_RUNNING · COMPLETE · AI_UNAVAILABLE · NOT_APPLICABLE |
| `review_state` | AWAITING_REVIEW · IN_REVIEW · INFO_REQUESTED · RETURNED · APPROVED · APPROVED_WITH_REMARK · AMENDMENT_PENDING |
| `sync_state` | LOCAL_ONLY · SYNCING · SYNCED · CONFLICT · REQUIRES_REVIEW · EVIDENCE_PENDING |

Phase 1A uses SUBMITTED / RETURNED / WITHDRAWN, NOT_APPLICABLE, all review states, and SYNCED.

## 4. Functions

### Access helpers (callable by `authenticated`)

| Function | Returns true when |
|---|---|
| `dr_is_unit_member(unit, user)` | Active membership valid today |
| `dr_can_review(project, user)` | Admin; or approver in its dates; or the project manager when no primary approver is set |
| `dr_can_view_project(project)` | Reviewer; or project member whose role has `construction/daily_reporting` view with scope other than `own` |
| `dr_has_project_access(project, unit)` | `dr_can_view_project` or member of the unit |
| `dr_can_admin(project)` | Admin; project manager; or project member with the `configure` permission |

### Write gateway (service role only; first argument `p_actor`)

| Function | Does |
|---|---|
| `dr_save_draft` | Upsert the server draft |
| `dr_submit_report` | Idempotent submit; intake assertions; late flags; version + projections + evidence + rule results; closes a missing record; notifies |
| `dr_resubmit_report` | Next version after a return |
| `dr_answer_info` | Records the answer; back to review |
| `dr_withdraw_report` | Before review starts |
| `dr_open_review` | AWAITING_REVIEW → IN_REVIEW |
| `dr_decide_review` | Decision, verified quantities, delay classes, correction request; on approval runs the planning sync |
| `dr_submit_amendment` | Amendment version, AMENDMENT_PENDING |
| `dr_publish_summary` | Next Official revision; refuses unchanged content |
| `dr_excuse_missing` | Excuse with a reason |
| `dr_audit_intake_rejected` | Logs a rejected attempt |
| `dr_backfill_project` | Imports legacy site diary rows (cut-over) |

### Internal

`dr_set_actor`, `dr_audit`, `dr_notify`, `dr_reviewers`, `dr_management`, `dr_role_members`, `dr_unit_reporters`, `dr_unit_schedule`, `dr_is_working_day`, `dr_next_report_no`, `dr_project_version`, `dr_write_version`, `dr_assert_intake`, `dr_sync_version_to_planning`, `dr_refresh_live_summary`, `dr_run_schedule` (pg_cron, every 15 minutes).

### Triggers

| Trigger | Table | Effect |
|---|---|---|
| `trg_<table>_immutable` | 17 record tables | Reject UPDATE / DELETE |
| `trg_dr_evidence_guard` | `dr_evidence` | Only scan fields may change; no delete |
| `trg_dr_delay_classification_guard` | `dr_delay_classifications` | Only the register backlink may be set |
| `trg_dr_guard_project_switch` | `projects` | Only a Daily Reporting admin changes `dr_enabled` |
| `trg_dr_validate_schedule` | `dr_reporting_schedules` | Known time zone; reminder before deadline; valid working days |

## 5. Row-level security

| Tables | Read | Write |
|---|---|---|
| Units, scope, members, schedules, non-working days | Project-wide viewers and the unit's members | `dr_can_admin` |
| Approvers | Project members | System administrator |
| Rule definitions | All signed-in users | Admin (global) / `dr_can_admin` (project) |
| Reports, versions, line tables, evidence, verified quantities, missing reports | `dr_has_project_access` | None (gateway) |
| Rule results, delay classifications, planning links, summaries | `dr_can_view_project` | None |
| Review decisions | `dr_can_view_project`; the unit sees only "approved with remark" | None |
| Correction requests and items | Anyone who can see the report (not drafts) | None |
| Audit log | Approvers | None |
| Outbox, running numbers | Service role only | Service role only |

## 6. Payload (schema version 1)

```json
{
  "schema_version": 1,
  "no_work_reason": null,
  "weather": { "condition": "Sunny", "hours_lost": 0, "note": null },
  "manpower": [{ "line_id": "l_1", "trade": "Carpenter", "planned_count": 10, "reported_count": 8, "hours": 8 }],
  "activities": [{ "line_id": "l_2", "task_id": "<wbs_tasks.id>", "work_status": "in_progress",
                   "progress_before": 0, "progress_today": 35, "reported_qty": 40, "uom": "m2",
                   "headcount": 4, "hours_normal": 8, "hours_ot": 0, "step_progress": [] }],
  "equipment": [], "materials": [],
  "delays": [{ "line_id": "l_3", "cause_category": "EMPLOYER_CAUSED", "description": "…", "hours_lost": 2, "notice_required": false }],
  "issues": [], "instructions": [], "inspections": [], "area_access": [],
  "safety": { "toolbox_talk_held": true, "incident_count": 0, "near_miss_count": 0 },
  "next_day": [{ "line_id": "l_4", "task_id": "<wbs_tasks.id>", "planned_manpower": 8 }]
}
```

`line_id` is stable across versions; rules, evidence, correction items, verified quantities and planning links all refer to it.

## 7. Storage

Private bucket `dr-evidence`, 20 MB per file, JPEG / PNG / WebP / HEIC / PDF. Key: `<project_id>/<unit_id>/<report_date>/<uuid>.<ext>`. No storage policies: access is by signed URL issued by the API.

## 8. Relationship to legacy tables

`site_daily_reports` and related tables are unchanged. `dr_reports.source_site_report_id` links an imported report to its origin. Planning tables written at approval: `wbs_tasks`, `wbs_task_steps`, `wbs_task_progress_reviews` (through `submit_progress`), `plan_productivity_logs`, `delay_register`, `delay_register_tasks`.
