# DCOS — Module 04: Task Management
## 02 — Functional Specification (FS)

| Field | Value |
|---|---|
| Document Code | DCOS-M04-FS-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Traceability | Implements BRD DCOS-M04-BRD-001 |
| Status | Issued for Development |

---

## 1. Functional Overview

```text
                     ┌────────────────────────────┐
                     │   Task Management Engine   │
                     └────────────┬───────────────┘
        ┌─────────────┬───────────┼───────────┬──────────────┐
        │             │           │           │              │
   Task Creation  Assignment  Sequencing  Execution     Governance
   - manual       - user      - FS/SS/    - progress    - approval
   - template     - crew        FF/SF     - evidence    - hold
   - bulk WBS     - subcon    - lag/lead  - resources   - rejection
   - from module  - watchers  - calendar  - checklist   - cancel
        │             │           │           │              │
        └─────────────┴───────────┼───────────┴──────────────┘
                                  │
             ┌────────────────────┼────────────────────┐
             │                    │                    │
        Roll-Up Engine     Event Publisher      Audit Writer
        task → WBS →       notifications,       append-only
        project            integrations         history
```

---

## 2. Task Taxonomy

### 2.1 Task Types

| Code | Task Type | Typical Owner | Progress Method | Gate |
|---|---|---|---|---|
| TT-DES | Design Task | Discipline Engineer | Percentage / Milestone | Design review approval |
| TT-DWG | Drawing Production | Draftsman / Engineer | Milestone / Checklist | Document approval |
| TT-RFI | RFI Response Task | Assigned responder | Milestone | Response accepted |
| TT-CON | Construction Activity | Site Supervisor | Quantity / Percentage | QA inspection |
| TT-INS | Inspection Task | QA/QC Inspector | Milestone | Inspection result |
| TT-SUR | Survey / Setting Out | Surveyor | Milestone | Verification |
| TT-PRC | Procurement Activity | Procurement Officer | Milestone | PR/PO status |
| TT-MAT | Material Submittal | Engineer / QS | Milestone | Consultant approval |
| TT-HSE | Safety Activity | HSE Officer | Checklist | HSE sign-off |
| TT-COM | Commissioning / Testing | MEP Engineer | Checklist | Test result |
| TT-SNG | Snag / Punch Item | Site Engineer | Milestone | Re-inspection |
| TT-ADM | Administrative Task | Any | Milestone | Optional |

### 2.2 Task Classification Attributes

| Attribute | Values |
|---|---|
| `task_class` | ACTIVITY, DELIVERABLE, MILESTONE, CHECKLIST |
| `priority` | LOW, NORMAL, HIGH, CRITICAL |
| `work_category` | PERMANENT_WORKS, TEMPORARY_WORKS, ENABLING, REWORK, VARIATION, SNAG, INTERNAL |
| `is_critical_path` | Boolean, set by Planning module |
| `is_milestone` | Boolean |
| `execution_mode` | OWN_LABOUR, SUBCONTRACT, SUPPLIER, CONSULTANT |

---

## 3. Task Lifecycle

### 3.1 Status Model

```text
                          ┌──────────┐
                          │  DRAFT   │
                          └────┬─────┘
                               │ publish
                          ┌────▼─────┐
              ┌───────────│   OPEN   │
              │           └────┬─────┘
              │                │ assign
              │           ┌────▼───────┐
              │           │  ASSIGNED  │
              │           └────┬───────┘
              │                │ start (dependency + permit check)
              │           ┌────▼─────────┐        ┌──────────┐
              │           │ IN_PROGRESS  │◄──────►│ ON_HOLD  │
              │           └────┬─────────┘        └──────────┘
              │                │ mark complete
              │           ┌────▼───────┐
              │           │ COMPLETED  │
              │           └────┬───────┘
              │                │ submit
              │           ┌────▼─────────────────────┐
              │           │ SUBMITTED_FOR_APPROVAL   │
              │           └────┬──────────────┬──────┘
              │        approve │              │ reject
              │           ┌────▼─────┐   ┌────▼───────┐
              │           │ APPROVED │   │  REJECTED  │──┐
              │           └────┬─────┘   └────────────┘  │
              │                │ close                   │ resume
              │           ┌────▼─────┐                   │
              │           │  CLOSED  │                   │
              │           └──────────┘                   │
              │                                          │
              │  cancel (PM+)                            │
         ┌────▼──────┐                                   │
         │ CANCELLED │             IN_PROGRESS ◄─────────┘
         └───────────┘
```

### 3.2 Status Definitions and Permitted Transitions

| From | To | Trigger | Required Role | Conditions |
|---|---|---|---|---|
| DRAFT | OPEN | Publish | Creator / PM | Mandatory fields complete |
| OPEN | ASSIGNED | Assign | PM, Discipline Manager, Supervisor | Assignee active on project |
| ASSIGNED | IN_PROGRESS | Start | Assignee | Predecessors satisfied; permit valid (if gated); drawing not superseded (if gated) |
| IN_PROGRESS | ON_HOLD | Hold | Assignee, Supervisor, PM | Hold reason code + responsible party mandatory |
| ON_HOLD | IN_PROGRESS | Resume | Same or higher role | Hold closure note |
| IN_PROGRESS | COMPLETED | Mark complete | Assignee | Progress = 100%; mandatory evidence attached; checklist closed |
| COMPLETED | SUBMITTED_FOR_APPROVAL | Submit | Assignee | Approval route resolved |
| SUBMITTED_FOR_APPROVAL | APPROVED | Approve | Configured approver | Inspection passed (if gated); approver ≠ submitter |
| SUBMITTED_FOR_APPROVAL | REJECTED | Reject | Configured approver | Comment mandatory |
| REJECTED | IN_PROGRESS | Rework | Assignee | Auto on acknowledgement; `rejection_count` +1 |
| APPROVED | CLOSED | Close | PM, Supervisor, or auto-close rule | All child tasks closed; no open NCR linked |
| Any (except CLOSED) | CANCELLED | Cancel | PM or above | Reason mandatory; successors flagged for review |
| CLOSED | IN_PROGRESS | Reopen | PM or above | Reason mandatory; logged as CRITICAL audit event |

### 3.3 Hold Reason Taxonomy (configurable master)

| Code | Reason | Default Responsible Party | Delay Claimable |
|---|---|---|---|
| HR-DES | Design information not available | Consultant / Client | Yes |
| HR-RFI | Awaiting RFI response | Consultant | Yes |
| HR-MAT | Material not delivered | Contractor / Supplier | Conditional |
| HR-EQP | Equipment unavailable / breakdown | Contractor | No |
| HR-LAB | Manpower shortage | Contractor / Subcontractor | No |
| HR-ACC | Access not available | Client / Other contractor | Yes |
| HR-WTH | Weather | Neutral / Force majeure | Contract-dependent |
| HR-APP | Awaiting authority approval | Authority | Yes |
| HR-PMT | Permit not issued | Contractor / HSE | No |
| HR-INS | Awaiting inspection | Client / Consultant | Yes |
| HR-PAY | Commercial / payment dispute | Client | Yes |
| HR-VAR | Awaiting variation instruction | Client | Yes |
| HR-SAF | Safety stoppage | Contractor / HSE | No |
| HR-OTH | Other (free text mandatory) | To be selected | To be assessed |

---

## 4. Functional Requirements

### 4.1 Task Creation

| Ref | Requirement |
|---|---|
| FR-TM-001 | The system shall provide four creation paths: single task form, task template instantiation, bulk generation across selected WBS nodes, and system-generated task from another module. |
| FR-TM-002 | The task form shall enforce mandatory fields: project, WBS node, discipline, task type, title, planned start, planned finish, assignee (unless created as DRAFT). |
| FR-TM-003 | The system shall auto-generate `task_code` on publish using the project's configured pattern, default `{PROJECT}-{DISCIPLINE}-{WBS_SHORT}-T{SEQ:4}` (e.g. `P001-STR-B01L05-T0042`). |
| FR-TM-004 | Bulk generation shall accept a template and a multi-select of WBS nodes, producing one task per node with token substitution ({{wbs_name}}, {{level}}, {{zone}}). |
| FR-TM-005 | Sub-tasks shall be creatable under a parent task to a configurable depth (default 3 levels). Parent progress shall be derived from sub-tasks when sub-tasks exist. |
| FR-TM-006 | The system shall support recurring tasks with daily, weekly, monthly, or working-day-only recurrence, generating instances up to a configurable horizon (default 30 days ahead). |
| FR-TM-007 | Creation against a WBS node with status CLOSED, ARCHIVED or ON_HOLD shall be rejected with a clear message. |
| FR-TM-008 | The system shall support cloning an existing task, including checklist, resource plan and links, excluding progress and history. |

### 4.2 Assignment

| Ref | Requirement |
|---|---|
| FR-TM-010 | The system shall support one `assignee_id` (accountable) and unlimited `collaborators` and `watchers`. |
| FR-TM-011 | The system shall support assignment to a crew record (crew = named group of workers with a supervisor) as an alternative to an individual. |
| FR-TM-012 | The system shall support assignment to a subcontractor organisation, with an optional named subcontractor user. |
| FR-TM-013 | Reassignment shall require permission `task.reassign` and a reason, and shall notify both previous and new assignee. |
| FR-TM-014 | The system shall warn (not block) when an assignee's open workload exceeds a configurable threshold (default 15 active tasks). |
| FR-TM-015 | Approvers shall be resolved at submission time from the approval template for {project, discipline, task type}, with fallback to the WBS-responsible manager, then the Project Manager. |

### 4.3 Dependencies and Scheduling

| Ref | Requirement |
|---|---|
| FR-TM-020 | The system shall support dependency types FS, SS, FF, SF with integer `lag_days` (negative values permitted as lead). |
| FR-TM-021 | The system shall reject any dependency that creates a cycle, identifying the offending path in the error message. |
| FR-TM-022 | The system shall compute `dependency_status` for each task: READY, BLOCKED, PARTIALLY_READY. |
| FR-TM-023 | Attempting to start a BLOCKED task shall be prevented; users with `task.override_dependency` may override with a mandatory reason, logged at HIGH severity. |
| FR-TM-024 | Planned dates shall respect the project calendar (working days, public holidays, configured shift pattern). |
| FR-TM-025 | Actual start shall be set automatically on first transition to IN_PROGRESS; actual finish on transition to COMPLETED. Both shall be editable by authorised roles with reason. |
| FR-TM-026 | When a predecessor's actual finish moves beyond its planned finish, all successors shall be flagged `schedule_impact = true` and the Planning module notified for cascade recalculation. |
| FR-TM-027 | The system shall store baseline dates (`baseline_start`, `baseline_finish`, `baseline_id`) separately from planned dates; baseline fields are read-only outside baseline operations. |
| FR-TM-028 | The system shall calculate and display variance: `date_variance_days = actual_finish − baseline_finish` (or forecast finish if incomplete). |

### 4.4 Progress and Execution

| Ref | Requirement |
|---|---|
| FR-TM-030 | The system shall support four progress methods: PERCENTAGE, QUANTITY, CHECKLIST, MILESTONE. |
| FR-TM-031 | For QUANTITY tasks, progress % = (cumulative actual quantity ÷ planned quantity) × 100, capped at 100 unless over-run is authorised. |
| FR-TM-032 | For CHECKLIST tasks, progress % = (weighted completed items ÷ total weight) × 100. |
| FR-TM-033 | For MILESTONE tasks, progress is 0 or 100 only. |
| FR-TM-034 | Every progress submission shall create an immutable `task_progress_logs` row capturing previous value, new value, delta, method, note, evidence references, device, and geolocation. |
| FR-TM-035 | Progress decrease shall require permission `task.correct_progress` and a mandatory reason. |
| FR-TM-036 | The system shall support daily progress entry against a date (`progress_date`), allowing backdated entry within a configurable window (default 7 days) for supervisors. |
| FR-TM-037 | The system shall compute `forecast_finish` from current progress rate and remaining quantity, and display it against planned finish. |

### 4.5 Evidence and Attachments

| Ref | Requirement |
|---|---|
| FR-TM-040 | The system shall accept photo, video (≤ 60s), PDF, and document attachments against a task and against each progress log. |
| FR-TM-041 | Photos captured through the mobile app shall be stamped with capture timestamp, user, task code, WBS path, and GPS coordinates where permitted. |
| FR-TM-042 | Task types may be configured with `min_photos_on_completion` (default 2 for TT-CON) enforced at submission. |
| FR-TM-043 | Photos shall be compressed to a configurable maximum dimension on cellular upload; original resolution shall upload when on WiFi. |
| FR-TM-044 | Attachments shall be virus-scanned before persistence; infected files quarantined with admin alert. |
| FR-TM-045 | Deleting an attachment shall be a soft delete retaining the audit record and thumbnail reference. |

### 4.6 Resource Logging

| Ref | Requirement |
|---|---|
| FR-TM-050 | The system shall allow logging of manpower against a task by trade, headcount, normal hours and overtime hours, per date. |
| FR-TM-051 | The system shall allow logging of equipment against a task by equipment asset, working hours, idle hours and breakdown hours, per date. |
| FR-TM-052 | The system shall allow logging of material consumption against a task by item code and quantity, decrementing site stock where inventory is active. |
| FR-TM-053 | Resource logs shall roll up to the Daily Report for the same project/date, avoiding double entry. |
| FR-TM-054 | Manpower logs shall be exposed to the HR/Timesheet module for labour cost allocation to WBS. |
| FR-TM-055 | The system shall compute task productivity = actual quantity ÷ total man-hours, where both are present. |

### 4.7 Checklists

| Ref | Requirement |
|---|---|
| FR-TM-060 | A task may carry a checklist instantiated from a checklist template (Admin Configuration). |
| FR-TM-061 | Checklist items shall support: pass/fail/NA response, weight, mandatory flag, comment, photo, and responsible role. |
| FR-TM-062 | A task with unresolved mandatory checklist items shall not reach COMPLETED. |
| FR-TM-063 | A failed mandatory checklist item shall offer one-click creation of a linked NCR or snag task. |

### 4.8 Governance Gates

| Ref | Requirement |
|---|---|
| FR-TM-070 | Task types may be flagged `requires_inspection`; such tasks shall not reach APPROVED without a linked Inspection Request with result PASSED. |
| FR-TM-071 | Task types may be flagged `requires_permit`; start shall be blocked unless a valid, unexpired HSE permit of the required type is linked. |
| FR-TM-072 | Task types may be flagged `requires_drawing_link`; start shall be blocked if no drawing is linked, and warned if the linked drawing revision is SUPERSEDED. |
| FR-TM-073 | Task types may be flagged `requires_method_statement`; submission shall be blocked without an approved method statement document link. |
| FR-TM-074 | The system shall block approval where the approver is the submitter, unless `allow_self_approval` is set true for that task type. |
| FR-TM-075 | Where a task is linked to an open NCR, closure shall be blocked until the NCR is closed. |

### 4.9 Collaboration

| Ref | Requirement |
|---|---|
| FR-TM-080 | The system shall support threaded comments on a task with @mention of users and roles. |
| FR-TM-081 | Mentioned users shall be notified and auto-added as watchers unless they opt out. |
| FR-TM-082 | Comments shall be immutable after 15 minutes; edits within the window shall be logged. |
| FR-TM-083 | The system shall support internal-only comments not visible to external stakeholder roles (Client, Consultant, Subcontractor, Supplier). |

### 4.10 Roll-Up and Aggregation

| Ref | Requirement |
|---|---|
| FR-TM-090 | The system shall recalculate WBS node progress on every task progress change, propagating to all ancestors. |
| FR-TM-091 | Roll-up weighting shall be configurable per project: EQUAL, DURATION, COST, QUANTITY. Default: COST where BOQ linkage exists, otherwise DURATION. |
| FR-TM-092 | Cancelled tasks shall be excluded from roll-up denominators; on-hold tasks shall remain included. |
| FR-TM-093 | Recalculation shall complete within 3 seconds for a WBS branch of 1,000 tasks; heavier trees shall recalculate asynchronously with a progress indicator. |
| FR-TM-094 | The system shall maintain a materialised view `v_wbs_progress` refreshed on change for dashboard performance. |

### 4.11 Search, Filter and Views

| Ref | Requirement |
|---|---|
| FR-TM-100 | The task list shall support filtering by project, WBS branch, discipline, task type, status, priority, assignee, date range, overdue flag, hold reason, critical path flag, and tags. |
| FR-TM-101 | The system shall provide saved views per user ("My open tasks", "My approval queue", "Late in my discipline"). |
| FR-TM-102 | The system shall provide list, board (Kanban by status), calendar, and Gantt-lite (read-only bars) presentations. |
| FR-TM-103 | Full-text search shall cover task code, title, description, and comment content within tenant scope. |
| FR-TM-104 | Bulk actions shall be supported for assign, reschedule, tag, status change (where legal), and export, subject to permission and a confirmation dialog. |
| FR-TM-105 | Export shall be available as XLSX and CSV, respecting the user's current filters and column selection, and shall be logged as an audit EXPORT event. |

### 4.12 Offline and Mobile

| Ref | Requirement |
|---|---|
| FR-TM-110 | The mobile client shall cache the user's assigned tasks for the active project, plus linked drawing thumbnails and checklists. |
| FR-TM-111 | Offline actions supported: start task, update progress, add photo, complete checklist item, add comment, mark complete, request hold. |
| FR-TM-112 | Offline actions shall queue with a client-generated idempotency key; the server shall reject duplicate replays. |
| FR-TM-113 | Conflict rule — approval and status fields: server wins. Field observation data (photos, quantities, notes): device wins and appends. Irreconcilable conflicts enter a resolution queue for the supervisor. |
| FR-TM-114 | The sync status of every locally modified task shall be visible on the task card (Pending / Syncing / Synced / Failed). |

---

## 5. Calculations

| Metric | Formula |
|---|---|
| Task progress (quantity) | `LEAST(100, cumulative_actual_qty / planned_qty * 100)` |
| Task progress (checklist) | `SUM(weight WHERE status='PASS' OR 'NA') / SUM(weight) * 100` |
| WBS node progress (duration-weighted) | `Σ(task_progress × planned_duration) / Σ(planned_duration)` |
| WBS node progress (cost-weighted) | `Σ(task_progress × task_budget_value) / Σ(task_budget_value)` |
| Task age (days) | `now() − created_at` |
| Overdue days | `GREATEST(0, now()::date − planned_finish)` where status not in (APPROVED, CLOSED, CANCELLED) |
| Hold duration | `Σ(resume_time − hold_time)` across all hold periods |
| Productivity | `actual_quantity / total_manhours` |
| Forecast finish | `actual_start + (planned_duration ÷ progress_rate_factor)` where `progress_rate_factor = achieved% ÷ elapsed%` |
| Rejection rate | `rejection_count / submissions` per assignee per period |
| Approval latency (h) | `approved_at − submitted_at` |

---

## 6. Validation Rules

| Ref | Validation | Message |
|---|---|---|
| VR-01 | `planned_finish >= planned_start` | "Planned finish cannot be before planned start." |
| VR-02 | WBS node belongs to the same project | "Selected WBS node does not belong to this project." |
| VR-03 | Assignee has access to the project | "User is not assigned to this project." |
| VR-04 | Progress between 0 and 100 | "Progress must be between 0 and 100." |
| VR-05 | Quantity task must have UoM and planned quantity | "Unit of measure and planned quantity are required for quantity-based tasks." |
| VR-06 | Dependency not self-referencing | "A task cannot depend on itself." |
| VR-07 | No dependency cycle | "This dependency creates a loop: {path}." |
| VR-08 | Hold requires reason code | "Select a hold reason and responsible party." |
| VR-09 | Rejection requires comment ≥ 10 characters | "Please state the reason for rejection." |
| VR-10 | Completion requires mandatory evidence | "Attach at least {n} photo(s) before submitting." |
| VR-11 | Approver ≠ submitter (unless allowed) | "You cannot approve a task you submitted." |
| VR-12 | Permit valid at start time | "A valid {permit_type} permit is required before starting this task." |
| VR-13 | Task code unique within project | "Task code already exists in this project." |
| VR-14 | Backdated progress within window | "Progress can only be backdated up to {n} days." |

---

## 7. Notification Events (module contribution)

| Event Code | Trigger | Recipients | Priority | Channels |
|---|---|---|---|---|
| TASK.ASSIGNED | Task assigned/reassigned | Assignee, Discipline Manager | Normal | In-app, Telegram |
| TASK.DUE_TODAY | Planned finish = today | Assignee | High | In-app, Telegram (morning digest) |
| TASK.OVERDUE | Past planned finish, not complete | Assignee, Supervisor, PM | High | In-app, Email, Telegram |
| TASK.CRITICAL_OVERDUE | Overdue and on critical path | + Project Director | Critical | In-app, Email, Telegram |
| TASK.BLOCKED | Predecessor unsatisfied at attempted start | Assignee, Discipline Manager | High | In-app, Telegram |
| TASK.PREDECESSOR_DONE | Predecessor approved | Successor assignee | Normal | In-app |
| TASK.SUBMITTED | Submitted for approval | Approver | High | In-app, Telegram |
| TASK.REJECTED | Rejected | Assignee, Discipline Manager | High | In-app, Email |
| TASK.APPROVED | Approved | Assignee; PM if milestone | Normal | In-app |
| TASK.ON_HOLD | Placed on hold | PM, Discipline Manager, Planner | High | In-app, Email |
| TASK.HOLD_AGEING | Held beyond configured days (default 5) | PM, Project Director | Critical | In-app, Email, Telegram |
| TASK.CANCELLED | Cancelled | Assignee, successors' assignees, PM | High | In-app, Email |
| TASK.COMMENT_MENTION | User @mentioned | Mentioned user | Normal | In-app |
| TASK.REOPENED | Closed task reopened | Assignee, PM, Approver | High | In-app, Email |

---

## 8. Reports Produced

| Report | Purpose | Primary Audience |
|---|---|---|
| My Task List | Personal execution queue | All operational users |
| Task Workload by User / Crew | Resource balancing | Discipline Manager, PM |
| Late Task Register | Overdue exposure by discipline and WBS | PM, Director |
| Delay / Hold Register | Held tasks with reason, party, duration — claim evidence | PM, Contracts, QS |
| Task Aging Report | Time in each status; bottleneck identification | PM |
| Approval Latency Report | Median time in approval by approver | PM, Director |
| Progress by WBS | Roll-up view of physical progress | All management |
| Productivity Report | Output per man-hour by trade and activity | PM, QS, Planner |
| Rework / Rejection Report | Rejection counts by assignee, subcontractor, discipline | QA Manager, PM |
| Subcontractor Task Performance | On-time %, rejection rate per subcontractor | Commercial, PM |
| Critical Path Task Status | Status of tasks flagged critical | PM, Director, Planner |

---

## 9. Configuration Parameters (Admin)

| Parameter | Default | Scope |
|---|---|---|
| `task_code_pattern` | `{PROJECT}-{DISCIPLINE}-{WBS_SHORT}-T{SEQ:4}` | Project |
| `rollup_weighting` | COST → fallback DURATION | Project |
| `max_subtask_depth` | 3 | Tenant |
| `backdate_window_days` | 7 | Project |
| `workload_warning_threshold` | 15 | Tenant |
| `hold_ageing_alert_days` | 5 | Project |
| `auto_close_after_approval_days` | 3 (0 = manual only) | Project |
| `min_photos_on_completion` per task type | 2 for TT-CON, 0 others | Tenant |
| `allow_self_approval` per task type | false | Tenant |
| `overdue_escalation_days` | 1 to manager, 3 to director | Project |
| `recurrence_generation_horizon_days` | 30 | Tenant |
| `photo_max_dimension_cellular_px` | 1600 | Tenant |

---

## 10. Non-Functional Requirements

| Ref | Requirement |
|---|---|
| NFR-TM-01 | Task list of 1,000 rows renders in under 1.5 seconds (server-side pagination, 50 per page). |
| NFR-TM-02 | Task detail loads in under 1 second including 20 most recent activity entries. |
| NFR-TM-03 | WBS roll-up on single task update completes in under 3 seconds. |
| NFR-TM-04 | Mobile task update round-trip under 5 seconds on 3G excluding photo upload. |
| NFR-TM-05 | Offline cache supports at least 500 tasks and 200 cached images per device. |
| NFR-TM-06 | All task endpoints enforce PostgreSQL row-level security by `tenant_id` and project access. |
| NFR-TM-07 | Every state transition writes an audit record synchronously in the same transaction. |
| NFR-TM-08 | Task API rate limit 200 requests/minute per tenant, configurable per tier. |
| NFR-TM-09 | UI available in English and Khmer; date formats and calendar respect project locale. |
| NFR-TM-10 | Accessibility: keyboard navigable list and forms; contrast ratio ≥ 4.5:1. |

---

**End of Document — DCOS-M04-FS-001**
