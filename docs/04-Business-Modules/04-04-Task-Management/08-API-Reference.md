# DCOS — Module 04: Task Management
## 08 — API Reference

| Field | Value |
|---|---|
| Document Code | DCOS-M04-API-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Base URL | `https://api.dcos.{domain}/api/v1` |
| Auth | `Authorization: Bearer <JWT>` |
| Content Type | `application/json; charset=utf-8` |

---

## 1. Conventions

### 1.1 Headers

| Header | Required | Purpose |
|---|---|---|
| `Authorization` | Yes | Bearer JWT containing `tenant_id`, `user_id`, `roles`, `user_scope` |
| `X-Project-Id` | Recommended | Active project context; validated against the resource |
| `Idempotency-Key` | Yes for POST/PATCH state changes | Prevents duplicate application, especially from mobile |
| `X-Client` | Yes | `web`, `mobile-ios`, `mobile-android`, `api`, `telegram` |
| `X-Request-Id` | Optional | Correlates with audit `correlation_id`; generated if absent |

### 1.2 Standard Response Envelope

```json
{
  "data": { },
  "meta": { "request_id": "…", "server_time": "2026-08-10T02:15:44Z" }
}
```

List responses:

```json
{
  "data": [ ],
  "pagination": { "page": 1, "page_size": 50, "total": 483, "total_pages": 10 },
  "meta": { "request_id": "…" }
}
```

### 1.3 Error Format

```json
{
  "error": {
    "code": "TASK_BLOCKED_BY_DEPENDENCY",
    "message": "Task cannot start: 2 predecessors are not complete.",
    "http_status": 409,
    "details": {
      "blocking_tasks": [
        {"task_id":"…","task_code":"P001-STR-B01L05-T0038","status":"IN_PROGRESS"},
        {"task_id":"…","task_code":"P001-MEP-B01L05-T0039","status":"SUBMITTED_FOR_APPROVAL"}
      ],
      "override_permission": "task.override_dependency"
    },
    "request_id": "…"
  }
}
```

### 1.4 Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 422 | Field-level validation errors in `details.fields` |
| `TASK_NOT_FOUND` | 404 | Not found, or not visible in the caller's scope |
| `PERMISSION_DENIED` | 403 | Visible but not permitted |
| `ILLEGAL_STATUS_TRANSITION` | 409 | Transition not allowed from current status |
| `TASK_BLOCKED_BY_DEPENDENCY` | 409 | Predecessors unsatisfied |
| `PERMIT_REQUIRED` | 409 | No valid HSE permit linked |
| `EVIDENCE_REQUIRED` | 409 | Minimum photo count not met |
| `CHECKLIST_INCOMPLETE` | 409 | Mandatory checklist items pending |
| `INSPECTION_REQUIRED` | 409 | Approval blocked pending inspection pass |
| `SELF_APPROVAL_NOT_ALLOWED` | 409 | Approver equals submitter |
| `DEPENDENCY_CYCLE` | 422 | Dependency would create a loop |
| `WBS_NODE_INACTIVE` | 422 | Target WBS node closed/archived/on hold |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key, different payload |
| `RATE_LIMITED` | 429 | Tenant rate limit exceeded |
| `TENANT_MISMATCH` | 404 | Cross-tenant access attempt (logged CRITICAL) |

### 1.5 Rate Limits

200 requests/minute/tenant by default; sync endpoints have a separate 60 requests/minute/device budget. Responses include `X-RateLimit-Remaining` and `Retry-After`.

---

## 2. Task Resource

### 2.1 List Tasks

```http
GET /tasks
```

| Query Parameter | Type | Notes |
|---|---|---|
| `project_id` | uuid | Required |
| `wbs_node_id` | uuid | Filter to node |
| `include_descendants` | bool | Default `true` when `wbs_node_id` present |
| `status` | csv | e.g. `IN_PROGRESS,ON_HOLD` |
| `discipline` | csv | `STR,MEP` |
| `task_type_code` | csv | `TT-CON` |
| `assignee_id` | uuid | |
| `subcontractor_id` | uuid | |
| `priority` | csv | |
| `overdue` | bool | |
| `on_hold` | bool | |
| `critical_path` | bool | |
| `is_rework` | bool | |
| `planned_start_from` / `planned_start_to` | date | |
| `planned_finish_from` / `planned_finish_to` | date | |
| `updated_since` | timestamptz | Delta sync |
| `q` | string | Full-text over code, title, description |
| `tags` | csv | |
| `sort` | string | `planned_finish`, `-progress_percent`, `priority`, `task_code` |
| `page`, `page_size` | int | Default 1 / 50, max 200 |
| `fields` | csv | Sparse fieldset |

**200 Response**

```json
{
  "data": [
    {
      "id": "8c2f…",
      "task_code": "P001-STR-B01L05-T0042",
      "title": "Slab reinforcement fixing — Zone 3",
      "project_id": "…",
      "wbs_node_id": "…",
      "wbs_path": "P001 / Building 01 / Level 05 / Zone 03",
      "discipline": "STR",
      "task_type_code": "TT-CON",
      "task_class": "ACTIVITY",
      "status": "IN_PROGRESS",
      "priority": "HIGH",
      "progress_method": "QUANTITY",
      "planned_quantity": 12.5,
      "actual_quantity": 9.7,
      "unit_of_measure": "ton",
      "progress_percent": 77.60,
      "planned_start": "2026-08-04",
      "planned_finish": "2026-08-08",
      "actual_start": "2026-08-04T01:12:00Z",
      "actual_finish": null,
      "forecast_finish": "2026-08-10",
      "overdue_days": 2,
      "dependency_status": "READY",
      "is_critical_path": true,
      "inspection_status": "REQUIRED",
      "hold_total_days": 2.5,
      "rejection_count": 0,
      "assignee": {"id":"…","name":"Sokha Chan","role":"Site Engineer"},
      "supervisor": {"id":"…","name":"Vichea Lim"},
      "updated_at": "2026-08-10T02:15:44Z"
    }
  ],
  "pagination": {"page":1,"page_size":50,"total":483,"total_pages":10}
}
```

### 2.2 Get Task

```http
GET /tasks/{task_id}?include=links,checklist,holds,dependencies,latest_progress
```

Returns the full task object plus requested sub-resources. Financial fields are omitted entirely when the caller lacks `task.view_financial`.

### 2.3 Create Task

```http
POST /tasks
Idempotency-Key: 7c1a…
```

```json
{
  "project_id": "…",
  "wbs_node_id": "…",
  "task_type_code": "TT-CON",
  "discipline": "STR",
  "title": "Slab reinforcement fixing — Zone 3",
  "description": "Y16 @150 both ways, per drawing rev 03",
  "work_category": "PERMANENT_WORKS",
  "execution_mode": "OWN_LABOUR",
  "priority": "HIGH",
  "progress_method": "QUANTITY",
  "planned_quantity": 12.5,
  "unit_of_measure": "ton",
  "planned_start": "2026-08-04",
  "planned_finish": "2026-08-08",
  "assignee_id": "…",
  "supervisor_id": "…",
  "tags": ["slab-cycle","L05"],
  "links": [
    {"entity_type":"DRAWING_REV","entity_id":"…","link_role":"GOVERNING"}
  ],
  "publish": true
}
```

**201 Response** — created task object with generated `task_code` and resolved gate configuration:

```json
{
  "data": {
    "id": "…",
    "task_code": "P001-STR-B01L05-T0042",
    "status": "ASSIGNED",
    "gates": {
      "requires_inspection": true,
      "requires_permit": false,
      "min_photos_on_completion": 2,
      "requires_method_statement": false
    }
  }
}
```

### 2.4 Bulk Generate from Template

```http
POST /tasks/bulk-generate
```

```json
{
  "project_id": "…",
  "template_code": "TPL-SLAB-CYCLE-STR",
  "wbs_node_ids": ["…","…","…"],
  "start_date": "2026-09-01",
  "node_offset_days": 5,
  "assignee_map": {"STR": "user-uuid", "MEP": "user-uuid"},
  "dry_run": false
}
```

**202 Response** (asynchronous when > 1,000 tasks):

```json
{
  "data": {
    "job_id": "…",
    "status": "QUEUED",
    "estimated_tasks": 240,
    "poll_url": "/jobs/…"
  }
}
```

`dry_run: true` returns the full preview without persisting.

### 2.5 Update Task

```http
PATCH /tasks/{task_id}
```

Accepts descriptive and scheduling fields only. Status changes are **not** accepted here — use the action endpoints. Read-only fields (`task_code`, baseline dates, float, counters) are rejected with `VALIDATION_FAILED`.

---

## 3. Lifecycle Actions

All action endpoints return the updated task object and are idempotent on `Idempotency-Key`.

### 3.1 Assign / Reassign

```http
POST /tasks/{task_id}/assign
```

```json
{ "assignee_id": "…", "supervisor_id": "…", "reason": "Resource rebalancing" }
```

`reason` is mandatory when the task already has an assignee.

### 3.2 Start

```http
POST /tasks/{task_id}/start
```

```json
{ "actual_start": "2026-08-04T08:00:00+07:00", "override_dependency": false, "override_reason": null }
```

- `409 TASK_BLOCKED_BY_DEPENDENCY` with the blocking list when predecessors are unsatisfied.
- `409 PERMIT_REQUIRED` when the task type requires a permit and none is valid.
- Setting `override_dependency: true` requires `task.override_dependency` and a non-empty `override_reason`; logged at HIGH severity and notified to the PM.

### 3.3 Update Progress

```http
POST /tasks/{task_id}/progress
Idempotency-Key: AND-93F1:1754800001:progress
```

```json
{
  "progress_date": "2026-08-10",
  "quantity_this_entry": 4.2,
  "note": "Zone 3 bay 2 complete; bay 3 rebar short 0.8 t",
  "manhours_this_entry": 96,
  "attachment_ids": ["…","…","…"],
  "gps": {"lat": 11.5564, "lng": 104.9282},
  "client_captured_at": "2026-08-10T09:12:00+07:00"
}
```

For percentage tasks send `new_percent` instead of `quantity_this_entry`. Corrections require `"is_correction": true` and `"correction_reason"`, plus permission `task.correct_progress`.

**200 Response**

```json
{
  "data": {
    "progress_log_id": "…",
    "task_id": "…",
    "previous_percent": 44.00,
    "new_percent": 77.60,
    "cumulative_quantity": 9.7,
    "wbs_rollup": [
      {"wbs_node_id":"…","full_path":"… / Zone 03","progress_percent":71.20},
      {"wbs_node_id":"…","full_path":"… / Level 05","progress_percent":58.40}
    ]
  }
}
```

### 3.4 Hold / Resume

```http
POST /tasks/{task_id}/hold
```

```json
{
  "hold_reason_code": "HR-DES",
  "responsible_party": "CONSULTANT",
  "expected_resume_date": "2026-08-15",
  "note": "Awaiting response on RFI-018 — slab opening coordination",
  "linked_entity_type": "RFI",
  "linked_entity_id": "…"
}
```

```http
POST /tasks/{task_id}/resume
{ "release_note": "RFI-018 responded 12 Aug; opening confirmed." }
```

### 3.5 Complete / Submit / Recall

```http
POST /tasks/{task_id}/complete
{ "actual_finish": "2026-08-11T16:30:00+07:00", "note": "All bays complete" }
```

`409 EVIDENCE_REQUIRED` / `409 CHECKLIST_INCOMPLETE` when gates are unmet, with `details.required` stating the shortfall.

```http
POST /tasks/{task_id}/submit
{ "comment": "Ready for review. Inspection IR-0231 passed." }
```

```http
POST /tasks/{task_id}/recall
{ "reason": "Photo set incomplete — resubmitting" }
```

### 3.6 Approve / Reject

```http
POST /tasks/{task_id}/approve
{ "comment": "Verified against drawing R03.", "certified_quantity": 12.5 }
```

```http
POST /tasks/{task_id}/reject
{
  "comment": "Rebar spacing at grid C/4 not per drawing rev 03.",
  "raise_ncr": true,
  "create_rework_task": true
}
```

**200 Response (reject)**

```json
{
  "data": {
    "task": {"id":"…","status":"REJECTED","rejection_count":1},
    "created": {"ncr_id":"…","rework_task_id":"…"}
  }
}
```

### 3.7 Close / Reopen / Cancel

```http
POST /tasks/{task_id}/close        { "note": "Handed to next trade" }
POST /tasks/{task_id}/reopen       { "reason": "Client raised defect during walk-through" }
POST /tasks/{task_id}/cancel       { "reason": "Superseded by variation VO-014" }
```

`reopen` requires `task.reopen`, writes a CRITICAL audit event and flags QS review if any quantity was certified.

---

## 4. Sub-Resources

### 4.1 Dependencies

```http
GET    /tasks/{task_id}/dependencies
POST   /tasks/{task_id}/dependencies
DELETE /tasks/{task_id}/dependencies/{dependency_id}
```

```json
POST body
{ "predecessor_id": "…", "dep_type": "FS", "lag_days": 2, "is_hard": true }
```

`422 DEPENDENCY_CYCLE` returns the offending path in `details.path`.

**GET response**

```json
{
  "data": {
    "predecessors": [
      {"dependency_id":"…","task_id":"…","task_code":"…T0038","title":"Formwork erection",
       "dep_type":"FS","lag_days":0,"status":"IN_PROGRESS","satisfied":false}
    ],
    "successors": [
      {"dependency_id":"…","task_id":"…","task_code":"…T0046","title":"Concrete pour",
       "dep_type":"FS","lag_days":0,"status":"ASSIGNED"}
    ],
    "dependency_status": "BLOCKED"
  }
}
```

### 4.2 Progress Logs

```http
GET /tasks/{task_id}/progress?from=&to=&page=
```

Read-only history. No PUT or DELETE — corrections are new entries.

### 4.3 Checklist

```http
GET   /tasks/{task_id}/checklist
POST  /tasks/{task_id}/checklist            { "template_code": "CHK-REBAR-PRE-POUR" }
PATCH /tasks/{task_id}/checklist/items/{item_id}
```

```json
PATCH body
{ "result": "FAIL", "comment": "Cover blocks missing at grid C/4", "attachment_ids": ["…"], "raise_ncr": true }
```

### 4.4 Resources

```http
GET  /tasks/{task_id}/resources?date=
POST /tasks/{task_id}/resources/manpower
POST /tasks/{task_id}/resources/equipment
POST /tasks/{task_id}/resources/material
```

```json
POST manpower
{ "log_date": "2026-08-10", "entries": [
    {"trade_code":"STEEL_FIXER","headcount":8,"normal_hours":8,"overtime_hours":2},
    {"trade_code":"HELPER","headcount":4,"normal_hours":8,"overtime_hours":0}
]}
```

```json
POST material
{ "log_date":"2026-08-10","item_code":"REBAR-Y16","quantity":4.2,
  "unit_of_measure":"ton","batch_no":"LOT-2026-0788" }
```

### 4.5 Links

```http
GET    /tasks/{task_id}/links
POST   /tasks/{task_id}/links
DELETE /tasks/{task_id}/links/{link_id}
```

```json
POST body
{ "entity_type": "RFI", "entity_id": "…", "link_role": "BLOCKER" }
```

### 4.6 Attachments

```http
POST /tasks/{task_id}/attachments/upload-url
```

```json
Request  { "file_name": "IMG_0231.jpg", "mime_type": "image/jpeg", "file_size_bytes": 2843122, "kind": "PHOTO" }
Response { "upload_id": "u_881", "upload_url": "https://…", "expires_at": "2026-08-10T03:00:00Z" }
```

```http
POST /tasks/{task_id}/attachments/confirm
{ "upload_ids": ["u_881","u_882"], "progress_log_id": "…",
  "captured_at": "2026-08-10T09:12:00+07:00", "gps": {"lat":11.5564,"lng":104.9282} }

GET    /tasks/{task_id}/attachments
DELETE /tasks/{task_id}/attachments/{attachment_id}   (soft delete)
```

### 4.7 Comments and Watchers

```http
GET  /tasks/{task_id}/comments
POST /tasks/{task_id}/comments   { "body": "@vichea please confirm rebar delivery", "is_internal": true }
POST /tasks/{task_id}/watchers   { "user_ids": ["…"] }
DELETE /tasks/{task_id}/watchers/{user_id}
```

### 4.8 Activity Timeline

```http
GET /tasks/{task_id}/activity?page=&types=STATUS,ASSIGN,PROGRESS,APPROVAL
```

```json
{
  "data": [
    {"at":"2026-08-11T09:15:00Z","type":"APPROVAL","action":"APPROVED",
     "actor":{"id":"…","name":"Vichea Lim","role":"Site Supervisor"},
     "comment":"Verified against drawing R03","severity":"HIGH"},
    {"at":"2026-08-10T02:15:44Z","type":"PROGRESS","action":"UPDATE",
     "actor":{"id":"…","name":"Sokha Chan"},
     "before":{"progress_percent":44.00},"after":{"progress_percent":77.60},
     "source_channel":"MOBILE"}
  ]
}
```

---

## 5. Collection Operations

### 5.1 Bulk Actions

```http
POST /tasks/bulk
```

```json
{
  "task_ids": ["…","…"],
  "action": "REASSIGN",
  "payload": { "assignee_id": "…", "reason": "Crew reallocation" }
}
```

Supported actions: `REASSIGN`, `RESCHEDULE`, `TAG`, `UNTAG`, `SET_PRIORITY`, `CANCEL`, `ARCHIVE`.

**207 Multi-Status Response**

```json
{
  "data": {
    "succeeded": 18,
    "failed": 2,
    "results": [
      {"task_id":"…","status":"OK"},
      {"task_id":"…","status":"ERROR","code":"PERMISSION_DENIED"}
    ]
  }
}
```

### 5.2 Export

```http
POST /tasks/export
{ "format": "XLSX", "filters": { …same as list… }, "columns": ["task_code","title","status","progress_percent","assignee","planned_finish"] }
```

Returns `202` with a `job_id`; the completed file is delivered via notification with a signed, expiring URL. Every export writes an audit EXPORT event including the filter set and row count.

---

## 6. Panels and Reports

```http
GET /tasks/my                      # grouped: overdue, due today, in progress, rejected, upcoming, blocked
GET /tasks/action-required         # approval inbox for the caller
GET /tasks/summary?project_id=&group_by=discipline|status|assignee|wbs
GET /reports/tasks/late?project_id=
GET /reports/tasks/delay-register?project_id=&from=&to=&responsible_party=
GET /reports/tasks/productivity?project_id=&discipline=&from=&to=
GET /reports/tasks/approval-latency?project_id=&from=&to=
GET /reports/tasks/workload?project_id=&discipline=
```

**`GET /tasks/summary` response**

```json
{
  "data": {
    "group_by": "status",
    "totals": {"tasks": 483, "overdue": 37, "on_hold": 9, "critical_overdue": 4},
    "groups": [
      {"key":"IN_PROGRESS","count":126,"avg_progress":48.2},
      {"key":"ON_HOLD","count":9,"avg_hold_days":6.4}
    ]
  }
}
```

---

## 7. Mobile Sync Endpoints

```http
GET  /sync/tasks?project_id=&updated_since=&page=
POST /sync/batch
GET  /sync/conflicts?device_id=
POST /sync/conflicts/{conflict_id}/resolve   { "resolution": "REPOST_TO_TASK", "target_task_id": "…" }
```

See `05-Integration-Specification.md §6.3` for payload shapes and conflict rules.

---

## 8. Configuration Endpoints (Admin)

```http
GET|POST|PATCH  /config/task-types
GET|POST|PATCH  /config/task-hold-reasons
GET|POST|PATCH  /config/task-templates
GET|PATCH       /config/projects/{project_id}/task-settings
```

`task-settings` covers `task_code_pattern`, `rollup_weighting`, `backdate_window_days`, `hold_ageing_alert_days`, `auto_close_after_approval_days`, `overdue_escalation_days`.

---

## 9. Webhooks (Outbound)

Tenants may register endpoints for `task.*` events.

```http
POST {tenant_webhook_url}
X-DCOS-Signature: sha256=…
X-DCOS-Event: task.approved
X-DCOS-Delivery: uuid
```

```json
{
  "event_id": "…",
  "event_type": "task.approved",
  "event_version": "1.0",
  "tenant_id": "…",
  "project_id": "…",
  "occurred_at": "2026-08-11T09:15:00Z",
  "actor_id": "…",
  "data": {
    "task_id": "…",
    "task_code": "P001-STR-B01L05-T0042",
    "wbs_path": "P001 / Building 01 / Level 05 / Zone 03",
    "certified_quantity": 12.5,
    "unit_of_measure": "ton"
  }
}
```

Signature: HMAC-SHA256 over the raw body using the tenant webhook secret. Retries: 5 attempts with exponential back-off over 24 hours, then dead-letter with an admin alert. Consumers must be idempotent on `event_id`.

---

## 10. Versioning and Deprecation

| Rule | Detail |
|---|---|
| Version in path | `/api/v1` |
| Additive changes | New optional fields may appear without a version bump; clients must ignore unknown fields |
| Breaking changes | New major version; previous version supported for 12 months |
| Deprecation signalling | `Deprecation` and `Sunset` response headers plus documentation notice 90 days ahead |
| Field removal | Never silent — deprecated fields return `null` with a warning header for one minor cycle before removal |

---

**End of Document — DCOS-M04-API-001**
