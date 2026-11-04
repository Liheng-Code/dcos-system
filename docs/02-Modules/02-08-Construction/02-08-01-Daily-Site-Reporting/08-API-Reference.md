# DCOS — Daily Reporting Module
## 08 — API Reference

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-API-001 |
| Version | R1 (as built, Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |
| Code | `apps/web/app/api/dr/**`, `apps/web/lib/construction/daily-reporting/{server,submission}.ts` |

---

## 1. Conventions

- **Authentication:** the Supabase session cookie. No session → `401 {"code":"UNAUTHORIZED"}`.
- **Context is resolved on the server.** Project, unit membership, scope and rules come from the database, never from the request body.
- **Errors:** `{ "error": "<message>", "code": "<DR_CODE>" }`.
- **Reads** of lists and details are done by the client directly against Supabase under row-level security; they have no route.

| Code | HTTP | Meaning |
|---|---|---|
| `DR_INTAKE_REJECTED` | 422 | Rule errors; `results` lists every finding; nothing stored |
| `DR_REQ_FIELD` | 400 / 422 | Malformed body, or a required value missing |
| `DR_INV_UNIT` | 403 | Not a reporter of the unit, or unit not active |
| `DR_INV_WBS` | 422 | Activity outside project or scope |
| `DR_DATE_FUTURE` | 422 | Report date in the future |
| `DR_DUP_REPORT` | 409 | Report exists for unit and date |
| `DR_STATE` | 409 | Action not allowed in the current state |
| `DR_STALE` | 409 | A newer version exists |
| `DR_SOD` | 403 | Submitter cannot approve own version |
| `DR_FORBIDDEN` | 403 | Not an approver / not allowed |
| `DR_NO_CHANGE` | 409 | Summary unchanged since last revision |
| `DR_NOT_FOUND` | 404 | Report or record not found |
| `DR_EVIDENCE` | 422 | File rejected (type, size, virus, missing) |
| `DR_IDEMPOTENCY` | 400 / 409 | Key missing, or already used by another unit |
| `DR_CONSTRAINT` | 422 | A value outside its allowed range |
| `DR_INTERNAL` | 500 | Unexpected error |

## 2. Reporting

### GET `/api/dr/forms/:unitId?date=YYYY-MM-DD`

Form context for a unit and date. Caller must be a member of the unit or an approver.

Returns: `unit`, `schedule`, `activities[]` (scoped; `planned_today`), `rules[]` (resolved for the project), `existing` report with `existing_payload`, `existing_evidence[]` and open `correction`, `draft`, `previous_next_day[]`, `approved_progress{}`, `known_uom{}`, `today_local`.

### PUT `/api/dr/drafts`

Body `{ unit_id, report_date, payload }`. Stores the draft as typed (not validated). → `{ saved: true }`

### POST `/api/dr/reports?unit=<uuid>&date=YYYY-MM-DD`

Submit. Header **`Idempotency-Key`** (required).

```json
{
  "payload": { "schema_version": 1, "…": "see 04-Database-Schema §6" },
  "report_kind": "WORK",
  "evidence": [{ "storage_key": "…", "target_section": "activities", "target_line_id": "l_2" }],
  "reason": null,
  "client_created_at": "2026-10-04T08:38:00Z"
}
```

`201` → `{ "receipt": { "report_id", "report_no", "version_no", "replayed": false, "late", "backdated" }, "warnings": [RuleResult] }`
Same key again → `200` with `replayed: true`.
`422 DR_INTAKE_REJECTED` → `{ results: [RuleResult], existing_report_id? }`.

`reason` is required when replacing a No Work report with a work report.

### POST `/api/dr/reports/:id/versions`

Resubmit after a return. Header `Idempotency-Key`. Body `{ payload, evidence, reason }` (`reason` = reply to the approver). The server applies only the edits to returned items. → `{ receipt, warnings }`

### POST `/api/dr/reports/:id/amend`

Amend an approved report. Header `Idempotency-Key`. Body `{ payload, evidence, reason }` (`reason` required). → `{ receipt, warnings }`

### POST `/api/dr/reports/:id/withdraw`

Before review starts. → `{ withdrawn: true }`

### POST `/api/dr/reports/:id/info`

Body `{ response }`. Answers an open information request. → `{ answered: true }`

## 3. Evidence

### POST `/api/dr/evidence/upload-url`

Body `{ unit_id, report_date, mime_type }`. Caller must be a reporter of the unit. → `{ storage_key, token }`. Upload with `supabase.storage.from('dr-evidence').uploadToSignedUrl(storage_key, token, file)`. The file becomes evidence only when a submission lists its `storage_key` and it passes the checks.

### POST `/api/dr/evidence/view`

Body `{ evidence_ids: [] }` (max 100). → `{ urls: { <id>: <signed url, 10 min> } }` for the files the caller may see and that passed the checks. Each call is audited per report.

## 4. Review

### PATCH `/api/dr/review/:reportId`

Marks the report In review. → `{ opened: true }`

### POST `/api/dr/review/:reportId`

```json
{
  "version_no": 2,
  "decision": "APPROVE_WITH_REMARK",
  "comment": "Verified on site",
  "verified": [{ "line_id": "l_2", "verified_qty": 38, "remark": "Measured 38 m2" }],
  "delay_classes": [{ "line_id": "l_3", "delay_type": "compensable" }],
  "correction_items": []
}
```

`decision`: `APPROVE` · `APPROVE_WITH_REMARK` · `REQUEST_INFO` · `RETURN`. For `RETURN`, `correction_items` needs at least one `{ target_section, target_line_id?, reason, required_action? }`.

→ `{ decision_id, correction_id, planning_sync: { activities_synced, errors, delays_logged } }`

## 5. Summary and missing reports

### POST `/api/dr/summaries/publish`

Body `{ project_id, date, narrative? }`. → `{ summary_id, revision_no }`

### POST `/api/dr/missing/:id/excuse`

Body `{ reason }`. → `{ excused: true }`

## 6. Scheduled

### GET or POST `/api/dr/cron/tick`

Header `Authorization: Bearer <CRON_SECRET>`. Runs `dr_run_schedule()` and delivers up to 100 pending notifications. → `{ schedule: { missing_raised, reminders }, delivery: { sent, failed } }`

## 7. RuleResult

```json
{
  "rule_code": "EVIDENCE_MIN",
  "rule_version": 1,
  "status": "FAILED",
  "severity": "WARNING",
  "message": "This activity needs at least 1 photo(s); 0 attached.",
  "params": { "required": 1, "attached": 0 },
  "target": { "section": "activities", "line_id": "l_2" }
}
```

## 8. Limits

Payload: up to 300 lines per section, 4,000 characters per text field, 200 evidence references. Evidence: 20 MB per file.

## 9. Client service

`lib/construction/daily-reporting/service.ts` wraps these routes and the read queries (`listReports`, `getReportDetail`, `getSummaries`, `listMissingReports`, setup functions). `DrApiError` carries `code`, `status` and `results`.
