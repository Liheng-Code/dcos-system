# DCOS — Module 04: Task Management
## 05 — Integration Specification

| Field | Value |
|---|---|
| Document Code | DCOS-M04-INT-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Scope | Internal module integration, platform engines, and external systems |

---

## 1. Integration Philosophy

Task Management is a **hub**, not an island. It has three integration surfaces:

| Surface | Direction | Mechanism |
|---|---|---|
| Core Engines (WBS, Approval, Notification, Audit, RBAC) | Bidirectional, synchronous | Direct service calls within the modular monolith; same DB transaction where consistency is required |
| Sibling Modules (QA/QC, HSE, Procurement, Document, HR, BOQ, Planning) | Bidirectional, mostly asynchronous | Domain event bus (`task.*` topics) + typed link records in `task_links` |
| External Systems (Telegram, Email, ERP, mobile app, BIM) | Outbound events + inbound webhooks | Integration Layer with signed payloads and retry policy |

**Rule:** Task Management never writes directly into another module's tables. It emits events and holds link references. Consumers own their own data.

---

## 2. Internal Integration Map

```text
                        ┌─────────────────────────┐
        WBS Engine ────▶│                         │────▶ Planning / CPM
        (parent,        │                         │      (actual dates, progress,
         roll-up)   ◀───│    TASK MANAGEMENT      │       delay events, float write-back)
                        │                         │
   Document Control ───▶│  tasks                  │────▶ QA/QC
   (drawing rev,    ◀───│  progress               │      (inspection request,
    method stmt)        │  holds                  │◀──── inspection result, NCR)
                        │  resources              │
        Procurement ───▶│  links                  │────▶ HR / Timesheet
        (PR/PO, GRN)◀───│  events                 │      (manhours by WBS)
                        │                         │
              HSE ─────▶│                         │────▶ BOQ / Cost / IPC
        (permits)   ◀───│                         │      (quantity, valuation)
                        └───────────┬─────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
        Approval Engine       Notification Engine     Audit Engine
```

---

## 3. Integration Contracts by Module

### 3.1 WBS Management (Module 06)

| Direction | Interaction | Contract |
|---|---|---|
| Inbound | Task must reference a valid, active WBS node | `wbs.getNode(id)` returns `{id, project_id, status, full_path, depth}`. Task creation rejected if `status ∈ {CLOSED, ARCHIVED, ON_HOLD}` |
| Inbound | WBS node moved or renamed | Subscribes to `wbs.node.moved` → refresh `wbs_path_snapshot` on affected tasks (async batch) |
| Inbound | WBS node delete attempted | WBS calls `task.countByNode(nodeId)`; non-zero blocks deletion |
| Outbound | Progress roll-up | On any progress change, calls `fn_rollup_wbs_progress(node_id)` synchronously in-transaction; ancestors updated recursively |
| Outbound | Task counts and status summary for WBS tree badges | `mv_wbs_progress` materialised view |

**Consistency rule:** roll-up is transactional with the progress log write. A failed roll-up rolls back the progress entry.

### 3.2 Approval Workflow Engine (Module 47)

| Direction | Interaction | Contract |
|---|---|---|
| Outbound | Task submitted | `approval.createInstance({entity_type:'TASK', entity_id, template_code, project_id, discipline, submitted_by, context:{task_code, wbs_path, value}})` → returns `approval_instance_id` |
| Inbound | Step decision | Engine calls back `task.onApprovalDecision({instance_id, decision, step_no, is_final, actor_id, comment})` |
| Rules | Approver ≠ submitter unless `allow_self_approval`; delegation resolved by the engine; parallel steps supported for multi-discipline sign-off |
| Failure | If no approver can be resolved, engine returns `NO_ROUTE`; task remains COMPLETED and an admin alert is raised |

Template resolution order: `{project, discipline, task_type}` → `{project, task_type}` → `{tenant, task_type}` → default single-step to WBS-responsible manager.

### 3.3 Notification Engine (Module 46)

Task Management publishes events; the Notification Engine owns recipient resolution, channel selection, throttling and escalation.

```json
POST /internal/notifications/emit
{
  "event_code": "TASK.OVERDUE",
  "tenant_id": "…",
  "project_id": "…",
  "entity_type": "TASK",
  "entity_id": "…",
  "occurred_at": "2026-08-10T02:00:00Z",
  "context": {
    "task_code": "P001-STR-B01L05-T0042",
    "task_title": "Slab reinforcement fixing — Zone 3",
    "wbs_path": "P001 / Building 01 / Level 05 / Zone 03",
    "assignee_id": "…",
    "supervisor_id": "…",
    "discipline": "STR",
    "planned_finish": "2026-08-08",
    "overdue_days": 2,
    "is_critical_path": true,
    "action_url": "/projects/P001/tasks/…"
  },
  "recipient_hints": ["ASSIGNEE","SUPERVISOR","PROJECT_MANAGER"]
}
```

Full event list in `02-Functional-Specification.md §7`.

### 3.4 Audit Trail Engine (Module 48)

| Requirement | Implementation |
|---|---|
| Every create/update/status change/export writes an audit row | DB trigger `trg_task_audit` in the same transaction |
| `module_code` | `TASK` |
| `entity_type` | `task`, `task_progress_log`, `task_hold`, `task_dependency`, `task_assignment` |
| Severity mapping | CREATE/UPDATE = LOW; ASSIGN/REASSIGN/HOLD = MEDIUM; APPROVE/REJECT/CANCEL = HIGH; REOPEN/OVERRIDE_DEPENDENCY/CROSS_TENANT_ATTEMPT = CRITICAL |
| Old/new values | `old_values`, `new_values`, `changed_fields` populated from the trigger's `OLD`/`NEW` records, excluding `search_vector` |
| Correlation | A single user action spanning several tables shares one `correlation_id` |

### 3.5 Document Control (Module 37)

| Direction | Interaction | Contract |
|---|---|---|
| Outbound | Link a governing drawing to a task | `task_links` row `{entity_type:'DRAWING_REV', link_role:'GOVERNING', revision_snapshot:'R03'}` |
| Inbound | Drawing superseded | Subscribes to `document.revision.superseded` → tasks linked to the old revision are flagged; if `block_on_superseded_dwg`, start/submit is blocked and the assignee notified |
| Inbound | Drawing issued for construction | `document.issued_for_construction` → dependent tasks with `dependency_status = BLOCKED` on document availability become READY; assignees notified |
| Outbound | Task output document | Design tasks producing a deliverable create the document record from within the task and link `link_role:'OUTPUT'` |

### 3.6 QA/QC (Module 27)

| Direction | Interaction | Contract |
|---|---|---|
| Outbound | Request inspection | `qaqc.createInspectionRequest({task_id, project_id, wbs_node_id, discipline, itp_ref, requested_datetime, evidence_ids})` → returns `ir_id`; task sets `inspection_status = REQUESTED` |
| Inbound | Inspection result | `task.onInspectionResult({task_id, ir_id, result, findings, ncr_id?})` → PASSED unlocks approval; FAILED returns task to IN_PROGRESS with `is_rework = true` and links the NCR |
| Inbound | NCR closed | `task.onNcrClosed({task_id, ncr_id})` → removes closure block |
| Outbound | Snag task creation | Punch list items in QA/QC generate tasks of type `TT-SNG` with `origin_module = 'QAQC'` |

### 3.7 HSE (Module 28)

| Direction | Interaction | Contract |
|---|---|---|
| Outbound | Permit validity check on start | `hse.getActivePermit({project_id, wbs_node_id, permit_type, at_time})` → `{permit_id, valid_until}` or null |
| Inbound | Permit revoked / expired | `task.onPermitInvalidated({permit_id})` → all IN_PROGRESS tasks relying on that permit are auto-held with reason `HR-PMT`; supervisor and HSE officer notified |
| Outbound | Safety stoppage | HSE stop-work order sets linked tasks to ON_HOLD with reason `HR-SAF` |

### 3.8 Planning & Scheduling (Module 23)

| Direction | Interaction | Contract |
|---|---|---|
| Outbound | Actual dates and progress | Planning reads `v_task_summary` and `task_progress_logs` for schedule update |
| Outbound | Delay events | Planning reads `v_task_delay_register` for time impact analysis |
| Inbound | CPM results | Planning writes `total_float_d`, `free_float_d`, `is_critical_path` back to `tasks` via `planning.applyCpmResults(batch)`. These fields are read-only to Task Management |
| Inbound | Baseline set/revised | `planning.applyBaseline({baseline_id, tasks:[{task_id, baseline_start, baseline_finish}]})`; baseline fields become immutable outside this call |
| Outbound | Schedule impact flag | On predecessor slip, emits `task.schedule_impact` for CPM recalculation |

### 3.9 Procurement (Module 18) and Inventory (Module 20)

| Direction | Interaction | Contract |
|---|---|---|
| Outbound | Material requirement from task | Task creates a Material Request with `task_id`, `wbs_node_id`, item, quantity, required-by date (derived from `planned_start`) |
| Inbound | Delivery received | `procurement.grn.posted` → tasks waiting on that material with hold reason `HR-MAT` are surfaced for resume; assignee notified |
| Outbound | Material consumption | `task_resource_material` posts a stock issue transaction referencing `task_id` and `wbs_node_id` |
| Inbound | Stock unavailable | Store issue rejection returns to the task as a warning and optional auto-hold |

### 3.10 HR / Timesheet (Module 41)

| Direction | Interaction | Contract |
|---|---|---|
| Outbound | Man-hours by task and WBS | Nightly job publishes `task.manhours.daily` aggregate `{project_id, wbs_node_id, task_id, trade, date, normal_hours, ot_hours, headcount}` |
| Inbound | Timesheet approval status | Approved timesheet hours reconcile against task manpower logs; discrepancy report generated for the supervisor |
| Rule | Task manpower logs are operational records; payroll uses approved timesheets. The two are reconciled, not merged |

### 3.11 BOQ / Cost / IPC (Modules 29, 30, 32) — Phase 2

| Direction | Interaction | Contract |
|---|---|---|
| Outbound | Physical quantity for measurement | `boq.getMeasurementInput({project_id, period})` reads approved task quantities by `boq_item_id` and `wbs_node_id` |
| Inbound | Budget value per task | Cost module writes `budget_value` and `cost_code` for cost-weighted roll-up |
| Rule | Only quantities from tasks in status APPROVED or CLOSED are eligible for certification |
| Rule | Reopening a certified task raises a QS review flag and a CRITICAL audit event |

### 3.12 Subcontractor Management (Module 19) — Phase 2

| Direction | Interaction | Contract |
|---|---|---|
| Outbound | Subcontractor progress | Approved tasks with `execution_mode = SUBCONTRACT` feed sub-IPC measurement |
| Outbound | Performance signals | Rejection count, on-time completion %, rework tasks feed the supplier/subcontractor performance score |
| Outbound | Back-charge trigger | Rework tasks attributable to a subcontractor create a candidate back-charge record |

---

## 4. Domain Events Published

All events are published to the internal bus and are available to the Integration Layer for external delivery.

| Event | Payload Key Fields | Consumers |
|---|---|---|
| `task.created` | task_id, task_code, project_id, wbs_node_id, discipline, type, assignee_id | Notification, Audit, Planning |
| `task.assigned` | task_id, assignee_id, previous_assignee_id, reason | Notification, HR |
| `task.started` | task_id, actual_start, dependency_override(bool) | Planning, Daily Report |
| `task.progress_updated` | task_id, new_percent, quantity, progress_date, logged_by | WBS, Planning, BOQ, Reporting |
| `task.held` | task_id, reason_code, responsible_party, hold_start, claimable | Planning, Contracts, Notification |
| `task.resumed` | task_id, hold_end, duration_days | Planning |
| `task.completed` | task_id, actual_finish, evidence_count | QA/QC, Notification |
| `task.submitted` | task_id, approval_instance_id, approver_id | Approval, Notification |
| `task.approved` | task_id, approved_at, approver_id, quantity | BOQ, Subcontract, Planning, WBS |
| `task.rejected` | task_id, comment, rejection_count | Notification, QA |
| `task.cancelled` | task_id, reason, successor_ids | Planning, Cost |
| `task.reopened` | task_id, reason, reopen_count | Audit(CRITICAL), Cost, QA |
| `task.schedule_impact` | task_id, successor_ids, slip_days | Planning |
| `task.manhours.daily` | aggregate rows | HR, Cost |

**Envelope**

```json
{
  "event_id": "uuid",
  "event_type": "task.approved",
  "event_version": "1.0",
  "tenant_id": "uuid",
  "project_id": "uuid",
  "occurred_at": "2026-08-10T07:22:11Z",
  "actor_id": "uuid",
  "correlation_id": "uuid",
  "idempotency_key": "task.approved:{task_id}:{approved_at}",
  "data": { }
}
```

Delivery guarantees: **at-least-once**. Consumers must be idempotent on `idempotency_key`.

---

## 5. Inbound Commands Accepted

| Command | Caller | Effect |
|---|---|---|
| `task.onApprovalDecision` | Approval Engine | Advances or rejects the task |
| `task.onInspectionResult` | QA/QC | Sets `inspection_status`; triggers rework loop on FAIL |
| `task.onNcrClosed` | QA/QC | Clears closure block |
| `task.onPermitInvalidated` | HSE | Auto-hold with reason HR-PMT |
| `task.onDocumentSuperseded` | Document Control | Flags/blocks affected tasks |
| `task.onMaterialDelivered` | Procurement | Surfaces held tasks for resume |
| `planning.applyCpmResults` | Planning | Writes float and critical path flags |
| `planning.applyBaseline` | Planning | Writes baseline dates |
| `task.generateFromTemplate` | Any module | Creates system-originated tasks with `origin_module`/`origin_record_id` |

---

## 6. External Integrations

### 6.1 Telegram Bot

| Item | Specification |
|---|---|
| Purpose | Fast operational alerts and one-tap acknowledgement for site users |
| Outbound | Task assigned, overdue, blocked, rejected, held-ageing, safety stoppage |
| Message format | Title line, task code, WBS path, due date, deep link `dcos://task/{id}` and web fallback URL |
| Inbound commands | `/mytasks`, `/task {code}`, `/progress {code} {value}`, `/ack {code}`, `/hold {code} {reason}` |
| Authentication | Telegram user must be linked to a DCOS user via a one-time code; link stored in `user_channel_bindings` |
| Security | Inbound commands are re-validated against RBAC server-side. Telegram identity alone never grants authority |
| Failure handling | Delivery failure logged in `notification_delivery_logs`; retried 3× with back-off; falls back to email |

### 6.2 Email

| Item | Specification |
|---|---|
| Outbound | Approval requests, rejections, escalations, weekly digests |
| Reply handling | Reply-to address `task+{task_id}+{token}@dcos.{domain}`; inbound parser appends the reply body as a task comment, attachments as task attachments |
| Security | Token is HMAC-signed and single-purpose; expired tokens are rejected and logged |

### 6.3 Mobile Application Sync API

| Item | Specification |
|---|---|
| Protocol | REST over HTTPS with JWT; delta sync by `updated_since` cursor |
| Pull | `GET /api/v1/sync/tasks?project_id=&updated_since=&page=` returns tasks, checklists, links, and drawing manifest |
| Push | `POST /api/v1/sync/batch` with array of queued operations, each carrying `idempotency_key` and `client_created_at` |
| Conflict rules | Status/approval fields: server wins. Progress logs, photos, comments: append (device data never discarded). Cancelled/permission-lost: conflict queue |
| Media | Photos uploaded separately to signed storage URLs; the sync payload references upload IDs |
| Bandwidth | Cellular: compressed images ≤ 1600px. WiFi: original resolution queued |
| Cache manifest | Server returns `cache_manifest` listing task IDs, checklist versions and drawing thumbnails the device should hold |

**Batch push example**

```json
POST /api/v1/sync/batch
{
  "device_id": "AND-93F1",
  "operations": [
    {
      "idempotency_key": "AND-93F1:1754800001:progress",
      "operation": "PROGRESS",
      "task_id": "…",
      "client_created_at": "2026-08-10T09:12:00+07:00",
      "payload": {
        "progress_date": "2026-08-10",
        "quantity_this_entry": 4.2,
        "unit_of_measure": "ton",
        "note": "Zone 3 bay 2 complete",
        "gps": {"lat": 11.5564, "lng": 104.9282},
        "attachment_upload_ids": ["u_881","u_882","u_883"]
      }
    }
  ]
}
```

**Response**

```json
{
  "results": [
    {"idempotency_key":"AND-93F1:1754800001:progress","status":"APPLIED",
     "task_id":"…","new_progress_percent":77.60,"server_time":"2026-08-10T02:15:44Z"}
  ],
  "conflicts": [],
  "server_cursor": "2026-08-10T02:15:44Z"
}
```

### 6.4 ERP / Accounting (Phase 4)

| Item | Specification |
|---|---|
| Direction | Outbound only from Task Management |
| Data | Approved quantities per cost code and WBS, man-hours per cost code |
| Mechanism | Nightly batch file (JSON/CSV) or webhook to the ERP adapter |
| Reconciliation | Adapter returns accepted/rejected line references; rejections raise an exception report |

### 6.5 BIM (Phase 5)

| Item | Specification |
|---|---|
| Direction | Bidirectional reference only |
| Contract | Task may carry `ifc_guid[]` linking to model elements; BIM viewer colours elements by task status/progress |
| Constraint | Model files are never modified by Task Management |

---

## 7. Error Handling and Retry Policy

| Failure | Behaviour |
|---|---|
| Synchronous engine call fails (Approval, WBS roll-up) | Transaction rolls back; user sees an actionable error; audit entry written with severity HIGH |
| Event publication fails | Event persisted in the outbox table and retried by a background worker (exponential back-off, max 24h, then dead-letter) |
| External delivery fails (Telegram/Email) | Logged in `notification_delivery_logs`; 3 retries; fallback channel; admin visibility in the Integration Log |
| Inbound command references unknown task | Rejected with `404`, logged, no partial state |
| Inbound command is a duplicate | Idempotency key match returns the original result, no side effects |
| Consumer module unavailable | Task operation still completes; the event stays queued. Task Management is never blocked by a downstream module except for the mandatory gates (WBS, Approval, Audit) |

---

## 8. Integration Testing Requirements

| Ref | Test |
|---|---|
| IT-01 | Task approval triggers successor dependency recalculation and notification within 5 seconds |
| IT-02 | Progress update propagates to all WBS ancestors with correct weighting |
| IT-03 | Failed inspection returns task to IN_PROGRESS and links the NCR |
| IT-04 | Permit revocation auto-holds all dependent in-progress tasks |
| IT-05 | Superseded drawing blocks start where configured, warns where not |
| IT-06 | Duplicate mobile sync payload does not create duplicate progress logs |
| IT-07 | Cross-tenant event payloads are rejected and audited as CRITICAL |
| IT-08 | CPM write-back does not alter user-editable schedule fields |
| IT-09 | Outbox replay after a consumer outage delivers events exactly once to an idempotent consumer |
| IT-10 | Telegram `/progress` command from an unauthorised user is rejected and logged |

---

**End of Document — DCOS-M04-INT-001**
