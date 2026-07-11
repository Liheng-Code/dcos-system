# 08 — API Reference
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/08-API-Reference.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Status: Draft
Version: 1.0
Date: 2026-06-14

---

## Conventions

- All routes live under `apps/web/app/api/pln/`
- All requests require `Authorization: Bearer <supabase_jwt>`
- Tenant isolation is enforced by RLS — no tenant_id in request body
- Dates: ISO 8601 (`YYYY-MM-DD`)
- Progress: numeric string `"75.00"` (decimal, 2dp)
- Duration: integer (calendar/working days)
- Error responses: `{ "error": "message", "code": "PLN_ERR_CODE" }`

---

## POST /api/pln/programmes

Create a new programme for a project.

**Request body:**
```json
{
  "project_id": "uuid",
  "programme_name": "Master Programme",
  "description": "Contract award programme",
  "programme_type": "master",
  "contract_start_date": "2026-07-01",
  "contract_end_date": "2027-12-31"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "programme_name": "Master Programme",
  "status": "draft",
  "revision_number": 0,
  "data_date": null,
  "created_at": "2026-06-14T10:00:00Z"
}
```

**Errors:**
- `400 PLN_INVALID_DATES` — contract_end_date before contract_start_date
- `409 PLN_MASTER_EXISTS` — is_master=true but a master programme already exists for this project

---

## GET /api/pln/programmes/[id]/activities

List all activities for a programme with CPM results.

**Query params:** `?include_cancelled=false` (default false)

**Response 200:**
```json
{
  "programme_id": "uuid",
  "data_date": "2026-06-14",
  "activities": [
    {
      "id": "uuid",
      "activity_code": "A001",
      "activity_name": "Foundation Works",
      "activity_type": "normal",
      "status": "in_progress",
      "parent_activity_id": null,
      "is_summary_band": false,
      "wbs_node_id": "uuid",
      "planned_start_date": "2026-07-01",
      "planned_finish_date": "2026-08-15",
      "planned_duration_days": 32,
      "actual_start_date": "2026-07-03",
      "actual_finish_date": null,
      "actual_progress_pct": "45.00",
      "remaining_duration_days": 18,
      "responsible_party": "Civil Team",
      "is_critical": true,
      "total_float_days": 0,
      "cpm_early_start": "2026-07-01",
      "cpm_early_finish": "2026-08-15",
      "cpm_late_start": "2026-07-01",
      "cpm_late_finish": "2026-08-15",
      "sort_order": 1
    }
  ]
}
```

---

## POST /api/pln/programmes/[id]/activities

Create a new activity.

**Request body:**
```json
{
  "activity_code": "A002",
  "activity_name": "Structural Steel Erection",
  "activity_type": "normal",
  "planned_start_date": "2026-08-16",
  "planned_finish_date": "2026-10-30",
  "responsible_party": "Steel Sub",
  "wbs_node_id": "uuid",
  "parent_activity_id": null,
  "sort_order": 2
}
```

**Response 201:** Activity object (same shape as GET list item).

**Errors:**
- `400 PLN_INVALID_DATES` — start after finish
- `409 PLN_DUPLICATE_CODE` — activity_code already exists in this programme

---

## POST /api/pln/programmes/[id]/links

Create a dependency link. Runs cycle check before inserting.

**Request body:**
```json
{
  "predecessor_id": "uuid",
  "successor_id": "uuid",
  "dependency_type": "FS",
  "lag_days": 0
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "predecessor_id": "uuid",
  "successor_id": "uuid",
  "dependency_type": "FS",
  "lag_days": 0
}
```

**Errors:**
- `400 PLN_SELF_LINK` — predecessor_id = successor_id
- `409 PLN_DUPLICATE_LINK` — same pair + type already exists
- `422 PLN_CIRCULAR_DEPENDENCY` — adding this link creates a cycle; body includes `"cycle_path": ["A001","A003","A002","A001"]`

---

## POST /api/pln/programmes/[id]/baselines

Create a baseline snapshot.

**Request body:**
```json
{
  "baseline_name": "Contract Baseline",
  "baseline_type": "contract",
  "reason_for_revision": null
}
```

For revised baselines, `reason_for_revision` must be >= 50 characters.

**Response 201:**
```json
{
  "id": "uuid",
  "baseline_name": "Contract Baseline",
  "baseline_type": "contract",
  "status": "draft",
  "snapshot_activity_count": 45,
  "created_at": "2026-06-14T10:00:00Z"
}
```

**Errors:**
- `409 PLN_CONTRACT_EXISTS` — contract baseline already exists for this programme
- `400 PLN_REASON_TOO_SHORT` — reason_for_revision < 50 chars for revised baseline

---

## PATCH /api/pln/baselines/[id]/activate

Set a baseline as active. Previous active baseline is automatically superseded.

**Request body:** `{}` (no body required)

**Response 200:**
```json
{
  "id": "uuid",
  "status": "active",
  "previous_active_baseline_id": "uuid"
}
```

---

## POST /api/pln/activities/[id]/progress

Submit a progress update (creates pending record).

**Request body:**
```json
{
  "data_date": "2026-06-14",
  "submitted_progress_pct": "65.00",
  "actual_start_date": "2026-07-03",
  "actual_finish_date": null,
  "notes": "Concrete pour completed on levels 1-3"
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "activity_id": "uuid",
  "status": "pending",
  "submitted_progress_pct": "65.00",
  "data_date": "2026-06-14"
}
```

**Errors:**
- `400 PLN_PROGRESS_REGRESSION` — submitted_progress_pct < current confirmed progress (without correction flow)
- `400 PLN_ACTIVITY_LOCKED` — activity is completed and locked; requires unlock first

---

## PATCH /api/pln/progress/[id]/confirm

Confirm a pending progress update. Sets activity.actual_progress_pct to submitted value.

**Request body:** `{}` (no body)

**Response 200:**
```json
{
  "id": "uuid",
  "status": "confirmed",
  "reviewed_by": "uuid",
  "reviewed_at": "2026-06-14T11:30:00Z",
  "activity": {
    "id": "uuid",
    "actual_progress_pct": "65.00"
  }
}
```

**Side effect:** Emits `pln.progress.confirmed` event → triggers async CPM run.

---

## PATCH /api/pln/progress/[id]/reject

Reject a pending progress update.

**Request body:**
```json
{
  "rejection_reason": "Percentage does not match site inspection report dated 2026-06-13."
}
```

**Response 200:**
```json
{
  "id": "uuid",
  "status": "rejected",
  "rejection_reason": "...",
  "reviewed_by": "uuid",
  "reviewed_at": "2026-06-14T11:30:00Z"
}
```

**Errors:**
- `400 PLN_REASON_REQUIRED` — rejection_reason is empty or missing

---

## POST /api/pln/programmes/[id]/advance-date

Advance the programme data date. Triggers CPM and S-curve materialisation.

**Request body:**
```json
{
  "new_data_date": "2026-06-21"
}
```

**Response 200:**
```json
{
  "programme_id": "uuid",
  "previous_data_date": "2026-06-14",
  "new_data_date": "2026-06-21",
  "cpm_job_id": "uuid",
  "scurve_points_written": 7
}
```

**Errors:**
- `400 PLN_DATE_NOT_FORWARD` — new_data_date ≤ current data_date
- `400 PLN_PENDING_UPDATES_EXIST` — unconfirmed pending updates exist (warning, not blocking; include `"pending_count": 3` in response for UI to surface)

---

## POST /api/pln/programmes/[id]/submit

Submit programme for internal review.

**Request body:** `{}`

**Response 200:**
```json
{
  "programme_id": "uuid",
  "status": "submitted_internal",
  "submitted_at": "2026-06-14T12:00:00Z",
  "submitted_by": "uuid"
}
```

**Errors:**
- `400 PLN_NO_ACTIVITIES` — programme has no activities
- `409 PLN_ALREADY_IN_FLIGHT` — another revision is already in submitted_internal or submitted_client

---

## POST /api/pln/programmes/[id]/approve-internal

Approve programme at internal stage.

**Request body:** `{}`

**Response 200:**
```json
{
  "programme_id": "uuid",
  "status": "approved_internal"
}
```

**Errors:**
- `403 PLN_FOUR_EYES` — approver is the same user as submitter

---

## POST /api/pln/programmes/[id]/reject-internal

Reject programme at internal stage (returns to draft).

**Request body:**
```json
{
  "rejection_reason": "Critical path is not correctly linked. Activities A005-A008 have no predecessors."
}
```

**Response 200:**
```json
{
  "programme_id": "uuid",
  "status": "draft",
  "rejection_reason": "..."
}
```

**Errors:**
- `400 PLN_REASON_TOO_SHORT` — rejection_reason < 20 characters

---

## POST /api/pln/programmes/[id]/submit-client

Submit programme to client. Creates transmittal record in Document Control.

**Request body:**
```json
{
  "baseline_id": "uuid"
}
```

**Response 200:**
```json
{
  "programme_id": "uuid",
  "status": "submitted_client",
  "baseline_id": "uuid",
  "transmittal_id": "uuid"
}
```

**Errors:**
- `400 PLN_NO_BASELINE` — baseline_id not found or not associated with this programme

---

## GET /api/pln/programmes/[id]/ipc-progress

Return confirmed progress per wbs_node_id for IPC integration (pull model).

**Query params:** `?data_date=2026-06-14`

**Response 200:**
```json
{
  "programme_id": "uuid",
  "data_date": "2026-06-14",
  "activities": [
    {
      "activity_id": "uuid",
      "activity_code": "A001",
      "wbs_node_id": "uuid",
      "confirmed_progress_pct": "75.00",
      "actual_start_date": "2026-07-03",
      "actual_finish_date": null,
      "status": "in_progress"
    }
  ]
}
```

**Auth restriction:** Requires QS or PM role (PLANNER also permitted). SITE_ENG and CLIENT roles cannot call this endpoint.

---

## GET /api/pln/programmes/[id]/scurve

Get S-curve data points.

**Query params:** `?from=2026-07-01&to=2027-12-31&baseline_id=uuid`

**Response 200:**
```json
{
  "programme_id": "uuid",
  "baseline_id": "uuid",
  "data_date": "2026-06-14",
  "points": [
    {
      "snapshot_date": "2026-07-01",
      "cumulative_planned_pct": "0.00",
      "cumulative_actual_pct": "0.00"
    },
    {
      "snapshot_date": "2026-07-07",
      "cumulative_planned_pct": "1.24",
      "cumulative_actual_pct": "1.10"
    }
  ]
}
```

---

## POST /api/pln/programmes/[id]/import/dry-run

Validate a CSV import file. No data is written.

**Request:** `multipart/form-data` with field `file` (CSV or XLSX).

**Response 200:**
```json
{
  "valid_count": 42,
  "error_count": 3,
  "warning_count": 5,
  "rows": [
    {
      "row_number": 1,
      "activity_code": "A001",
      "result": "valid",
      "wbs_linked": true,
      "message": null
    },
    {
      "row_number": 4,
      "activity_code": "A004",
      "result": "error",
      "wbs_linked": false,
      "message": "planned_start_date (2026-13-01) is not a valid date."
    },
    {
      "row_number": 7,
      "activity_code": "A007",
      "result": "warning",
      "wbs_linked": false,
      "message": "wbs_code 'BLDG-X' not found in this project. Activity will be created as planning-only."
    }
  ]
}
```

---

## POST /api/pln/programmes/[id]/import/confirm

Execute the confirmed import. Only call after dry-run returns error_count = 0.

**Request:** Same multipart as dry-run.

**Response 201:**
```json
{
  "activities_created": 47,
  "links_created": 38,
  "wbs_linked_count": 42,
  "planning_only_count": 5,
  "warnings": 5
}
```

**Errors:**
- `409 PLN_PROGRAMME_NOT_DRAFT` — programme is not in draft status
