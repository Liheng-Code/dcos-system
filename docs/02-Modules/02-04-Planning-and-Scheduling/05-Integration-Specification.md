# 05 — Integration Specification
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/05-Integration-Specification.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Status: Draft
Version: 1.0
Date: 2026-06-14

---

## 1. API Endpoints Exposed by PLN

All routes are under `app/api/pln/` and require a valid Supabase JWT in the Authorization header.
Tenant isolation is enforced by RLS on every table.

### 1.1 Programmes

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/api/pln/programmes` | List programmes for a project (`?project_id=`) | All project members |
| POST | `/api/pln/programmes` | Create a new programme | Planner |
| GET | `/api/pln/programmes/[id]` | Get programme detail with activities count, status, data date | All project members |
| PATCH | `/api/pln/programmes/[id]` | Update programme fields (name, description, contract dates) | Planner |
| DELETE | `/api/pln/programmes/[id]` | Soft-delete programme (sets deleted_at) | Planner, PM |

### 1.2 Activities

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/api/pln/programmes/[id]/activities` | List all activities for a programme (with CPM results) | All project members |
| POST | `/api/pln/programmes/[id]/activities` | Create a new activity | Planner |
| PATCH | `/api/pln/activities/[id]` | Update activity fields (dates, name, responsible_party) | Planner |
| PATCH | `/api/pln/activities/[id]/status` | Transition activity status (on_hold, cancel, complete) | Planner, PM |
| DELETE | `/api/pln/activities/[id]` | Soft-delete activity (sets deleted_at, status → cancelled) | Planner |

### 1.3 Dependency Links

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/api/pln/programmes/[id]/links` | List all dependency links for a programme | All project members |
| POST | `/api/pln/programmes/[id]/links` | Create a dependency link (runs cycle check before insert) | Planner |
| PATCH | `/api/pln/links/[id]` | Update link type or lag_days | Planner |
| DELETE | `/api/pln/links/[id]` | Delete a dependency link | Planner |

### 1.4 Baselines

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/api/pln/programmes/[id]/baselines` | List all baselines for a programme | All project members |
| POST | `/api/pln/programmes/[id]/baselines` | Create a baseline snapshot (calls RPC snapshot_pln_baseline) | Planner, PM |
| PATCH | `/api/pln/baselines/[id]/activate` | Set a baseline as active (supersedes current active) | Planner, PM |

### 1.5 Progress Updates

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/api/pln/programmes/[id]/progress` | List pending/recent progress updates | Planner, PM |
| POST | `/api/pln/activities/[id]/progress` | Submit a progress update (status = pending) | Site Engineer, Planner |
| PATCH | `/api/pln/progress/[id]/confirm` | Confirm a progress update | Planner |
| PATCH | `/api/pln/progress/[id]/reject` | Reject a progress update (rejection_reason required) | Planner |

### 1.6 Lookahead

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/api/pln/programmes/[id]/lookaheads` | List published lookaheads | All project members |
| POST | `/api/pln/programmes/[id]/lookaheads` | Generate a new lookahead window | Planner |
| PATCH | `/api/pln/lookaheads/[id]/publish` | Publish lookahead and trigger notifications | Planner |
| PATCH | `/api/pln/lookaheads/[id]/close` | Close a lookahead window and record PCR | Planner |
| PATCH | `/api/pln/lookahead-items/[id]` | Update completion status of an item | Planner, Site Engineer |

### 1.7 Delay Events

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/api/pln/programmes/[id]/delay-events` | List delay events for a programme | All project members |
| POST | `/api/pln/programmes/[id]/delay-events` | Create a delay event with impacted activities | Planner, PM |
| PATCH | `/api/pln/delay-events/[id]` | Update delay event fields | Planner, PM |
| PATCH | `/api/pln/delay-events/[id]/status` | Transition delay event status | Planner, PM |

### 1.8 Programme Workflow

| Method | Path | Purpose | Roles |
|---|---|---|---|
| POST | `/api/pln/programmes/[id]/submit` | Submit programme for internal review | Planner |
| POST | `/api/pln/programmes/[id]/approve-internal` | Approve at internal stage | PM |
| POST | `/api/pln/programmes/[id]/reject-internal` | Reject at internal stage (rejection_reason) | PM |
| POST | `/api/pln/programmes/[id]/submit-client` | Submit to client (creates transmittal) | Planner |
| POST | `/api/pln/programmes/[id]/approve-client` | Record client acceptance | PM, Document Controller |
| POST | `/api/pln/programmes/[id]/reject-client` | Record client rejection (with comments) | PM, Document Controller |

### 1.9 Data Date

| Method | Path | Purpose | Roles |
|---|---|---|---|
| POST | `/api/pln/programmes/[id]/advance-date` | Advance programme data date (calls RPC) | Planner, PM |

### 1.10 Import

| Method | Path | Purpose | Roles |
|---|---|---|---|
| POST | `/api/pln/programmes/[id]/import/dry-run` | Validate CSV import, return error report | Planner |
| POST | `/api/pln/programmes/[id]/import/confirm` | Execute confirmed import | Planner |

### 1.11 S-Curve Data

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/api/pln/programmes/[id]/scurve` | Get S-curve data points for a date range | All project members |

### 1.12 Integration Endpoint (consumed by other modules)

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/api/pln/programmes/[id]/ipc-progress` | Return confirmed progress pct per wbs_node_id as of a data_date (for IPC pull) | QS, PM, System |

---

## 2. Events Published to Other Modules

PLN publishes the following events via the DCOS Notification Engine. All events include
`project_id`, `programme_id`, `triggered_by` (user_id), and `timestamp`.

| Event Type | Trigger | Consumers |
|---|---|---|
| `pln.programme.submitted_internal` | Programme status → submitted_internal | Notification Engine → PM |
| `pln.programme.approved_internal` | Programme status → approved_internal | Notification Engine → Planner |
| `pln.programme.rejected_internal` | Programme status → draft (rejection) | Notification Engine → Planner |
| `pln.programme.submitted_client` | Programme status → submitted_client | Document Control module (creates transmittal) |
| `pln.programme.approved_client` | Programme status → approved_client | Notification Engine → PM, Planner, team |
| `pln.programme.rejected_client` | Programme status → rejected_client | Notification Engine → PM, Planner |
| `pln.baseline.activated` | Baseline status → active | Notification Engine → PM |
| `pln.baseline.client_accepted` | Baseline status → client_accepted | EOT module (can now reference this baseline) |
| `pln.progress.confirmed` | pln_progress_updates.status → confirmed | Notification Engine → Site Engineer; triggers CPM |
| `pln.progress.rejected` | pln_progress_updates.status → rejected | Notification Engine → Site Engineer |
| `pln.cpm.critical_path_change` | Activity total_float_days drops to ≤ 0 | Notification Engine → PM, Planner |
| `pln.cpm.programme_overrun` | CPM forecast end > projects.end_date | Notification Engine → PM, Planner, (Client if configured) |
| `pln.lookahead.published` | Lookahead status → published | Notification Engine → all Construction Managers, Site Engineers |
| `pln.delay_event.raised` | New delay event created | Notification Engine → PM |
| `pln.delay_event.agreed` | Delay event status → agreed | EOT module (delay event now available for claims) |
| `pln.activity.uncompleted` | Completed activity reverted to in_progress | IPC module (alert: linked IPC may need review) |
| `pln.data_date.advanced` | Programme data date advanced | Triggers: CPM run, S-curve materialisation, monthly report generation |

---

## 3. Events Consumed from Other Modules

| Source Module | Event | PLN Action |
|---|---|---|
| Module 09 — Document Control | `doccontrol.transmittal.response_received` | If programme_id linked to transmittal, update programme status (approved_client or rejected_client) |
| Module 34 — IPC | `ipc.application.certified` | Lock activity actual_finish_date if referenced activity is in a certified IPC; block un-complete action |
| Module 27 — Procurement | `procurement.delivery.scheduled` | Create a planning constraint note on linked pln_activity (visible in lookahead but does not auto-adjust dates) |
| Module 06 — Project Setup | `project.end_date_updated` | Re-run CPM on all active programmes for the project |

---

## 4. Supabase RPC Functions (internal)

These are called from Next.js API routes via `supabase.rpc(...)`. Not directly callable from the client browser.

| RPC Name | Signature | Called From |
|---|---|---|
| `run_pln_cpm` | `(p_programme_id uuid) returns int` | `/api/pln/programmes/[id]/advance-date`, progress confirm |
| `check_pln_dependency_cycle` | `(p_programme_id uuid, p_pred_id uuid, p_succ_id uuid) returns boolean` | `/api/pln/programmes/[id]/links` POST |
| `materialise_pln_scurve` | `(p_programme_id uuid, p_data_date date) returns int` | `/api/pln/programmes/[id]/advance-date` |
| `get_pln_activity_progress` | `(p_project_id uuid, p_data_date date) returns table(wbs_node_id uuid, activity_id uuid, confirmed_progress_pct numeric)` | `/api/pln/programmes/[id]/ipc-progress` |
| `snapshot_pln_baseline` | `(p_programme_id uuid, p_name text, p_type text, p_reason text) returns uuid` | `/api/pln/programmes/[id]/baselines` POST |
| `advance_pln_data_date` | `(p_programme_id uuid, p_new_date date) returns void` | `/api/pln/programmes/[id]/advance-date` POST |

---

## 5. External System Dependencies

| System | Dependency | Note |
|---|---|---|
| Project Calendar | `project_calendars` table (Module PRJ) | Used for working-day duration calculation. PLN cannot function without at least a default 5-day calendar per project. |
| Notification Engine | Module 11 internal service | All alerts and distribution. PLN does not send emails directly. |
| Document Control | Module 09 transmittal flow | Programme client submissions create transmittal records via Document Control module API. |
| Audit Log Engine | Module 12 audit service | All state changes call the audit service (not direct DB insert from PLN). |
| Supabase Storage | `supabase.storage` | Lookahead PDFs and programme Gantt exports stored in `{tenant_id}/{project_id}/pln/{programme_id}/` |

---

## 6. Integration Contract — IPC Pull (Priority Contract)

The IPC module's pull contract is documented here as it is the highest-stakes integration.

**Endpoint:** `GET /api/pln/programmes/[id]/ipc-progress?data_date=YYYY-MM-DD`

**Request:** `programme_id` in path, `data_date` as query parameter.

**Response:**
```json
{
  "programme_id": "uuid",
  "data_date": "2026-06-14",
  "activities": [
    {
      "activity_id": "uuid",
      "activity_code": "A001",
      "activity_name": "Foundation Works",
      "wbs_node_id": "uuid",
      "wbs_code": "BLDG-A/LVL-01/ZONE-N",
      "confirmed_progress_pct": 75.00,
      "actual_start_date": "2026-04-01",
      "actual_finish_date": null,
      "status": "in_progress"
    }
  ]
}
```

**Constraint:** Only activities with `wbs_node_id IS NOT NULL` and at least one `confirmed` progress update on or before `data_date` are returned. Activities with no confirmed updates return `confirmed_progress_pct: 0`.

**Auth:** Requires QS, PM, or system service role. Site Engineers and Construction Managers cannot call this endpoint.
