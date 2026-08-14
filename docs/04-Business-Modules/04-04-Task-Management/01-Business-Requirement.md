# DCOS — Module 04: Task Management
## 01 — Business Requirement Document (BRD)

| Field | Value |
|---|---|
| Document Code | DCOS-M04-BRD-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Parent Document | DCOS System Architecture Module Design (R0) + Gap Analysis (R1) |
| Build Phase | Phase 1 — Core Platform |
| Classification | Internal — Controlled |
| Status | Issued for Design |

---

## 1. Purpose

Task Management is the execution engine of DCOS. Every unit of work performed by any discipline — a design drawing to be produced, a rebar cage to be fixed, an RFQ to be floated, a snag to be cleared, a permit to be renewed — is represented as a **Task** attached to a **WBS node** inside a **Project**.

Without this module, DCOS is a filing cabinet. With it, DCOS becomes an operating system: work is assigned, sequenced, progressed, evidenced, inspected, approved, costed and reported through one consistent mechanism regardless of which department performs it.

---

## 2. Business Context

### 2.1 Current State (Problem)

A typical construction company in the target market runs execution on:

- Excel task trackers per department, never reconciled with each other.
- WhatsApp/Telegram groups where instructions are issued and then lost.
- Verbal site instructions with no written trace.
- Progress percentages reported by opinion, not by evidence.
- Programme (Primavera/MS Project) maintained by one planner, disconnected from what the site actually did yesterday.
- No link between "work done" and "cost incurred" or "material consumed".

Consequences: duplicated work, missed dependencies, unrecorded delay events, weak claim positions, progress claims prepared from memory, and no accountability trail when a dispute starts.

### 2.2 Target State

One task record that is simultaneously:

| Consumer | What they take from the task |
|---|---|
| Site Supervisor | Today's work list, sequence, and required permits |
| Discipline Manager | Workload, bottlenecks, late items in their discipline |
| Planner | Actual start/finish feeding baseline vs actual and CPM |
| QA/QC | Trigger for Inspection Request at completion |
| QS / Commercial | Physical progress feeding BOQ measurement and IPC |
| Document Controller | Which drawing revision the task was executed against |
| Project Manager | Delay register, critical path exposure, approval queue |
| Management | Real-time progress S-curve and productivity KPIs |

---

## 3. Scope

### 3.1 In Scope

| Ref | Capability |
|---|---|
| SC-01 | Task creation (manual, from template, from WBS bulk generation, from another module) |
| SC-02 | Task classification by type, discipline, priority, and work category |
| SC-03 | Mandatory WBS linkage and project linkage for every task |
| SC-04 | Single and multi-user assignment, crew assignment, subcontractor assignment |
| SC-05 | Task dependencies (FS, SS, FF, SF) with lag/lead |
| SC-06 | Task lifecycle and status governance, including hold, rejection and cancellation |
| SC-07 | Progress update by percentage, by quantity, or by checklist completion |
| SC-08 | Evidence capture — photos, documents, measurements, geotag, timestamp |
| SC-09 | Resource logging against a task — manpower, equipment, material |
| SC-10 | Task-level approval routing through the shared Approval Workflow Engine |
| SC-11 | Task-level commenting, mentions, and watcher subscription |
| SC-12 | Recurring and template-driven tasks (e.g. daily housekeeping, weekly toolbox) |
| SC-13 | Task linkage to Documents, RFIs, NCRs, Inspection Requests, PRs, Variations |
| SC-14 | Progress roll-up from task → WBS node → project |
| SC-15 | Full audit trail of every task state and field change |
| SC-16 | Offline task update from mobile with conflict resolution |
| SC-17 | Task reporting: workload, late tasks, aging, productivity, delay register |

### 3.2 Out of Scope (handled by other modules)

| Item | Owning Module |
|---|---|
| Critical path calculation, float, baseline versioning | 23 — Planning & Scheduling |
| Inspection checklist definition and NCR lifecycle | 27 — QA/QC |
| Permit issue and safety clearance | 28 — HSE |
| Payroll conversion of logged hours | 41 — HR |
| Cost rate application and earned value calculation | 29/31 — BOQ / EVM |
| Document revision control and transmittal | 37 — Document Control |
| Drawing annotation | 26 — Drawing Markup & Redline |

Task Management **produces** the data these modules consume, and **consumes** their governing rules — but does not re-implement them.

---

## 4. Business Objectives

| Ref | Objective | Success Measure |
|---|---|---|
| BO-01 | Make all project work visible in one place | ≥ 95% of site and design work executed as system tasks within 3 months of go-live |
| BO-02 | Establish accountability for every unit of work | 100% of tasks have a named assignee and a named approver |
| BO-03 | Replace opinion-based progress with evidence-based progress | ≥ 90% of completed tasks carry photo or measurement evidence |
| BO-04 | Reduce approval latency | Median submit-to-approve time under 24 hours |
| BO-05 | Create a defensible delay record | 100% of tasks placed On Hold carry a coded reason and responsible party |
| BO-06 | Enable accurate progress roll-up | WBS progress computed by system, not entered manually, at all parent levels |
| BO-07 | Feed commercial measurement | ≥ 80% of quantity-based tasks record actual quantity against BOQ item |
| BO-08 | Support field reality | Site users able to complete a task update in under 60 seconds on mobile, offline |

---

## 5. Business Requirements

### 5.1 Structural Requirements

| Ref | Requirement | Priority |
|---|---|---|
| BR-TM-001 | Every task must belong to exactly one project and one WBS node. A task without WBS linkage cannot be saved. | Must |
| BR-TM-002 | Every task must carry a discipline code (ARC, STR, MEP, CIV, PRC, CON, QAQC, HSE, ADM, COM). | Must |
| BR-TM-003 | Task codes must be unique within a project and follow the configured numbering rule. | Must |
| BR-TM-004 | A task may be a parent of sub-tasks to a configurable depth (default 3). | Should |
| BR-TM-005 | Tasks must support classification as milestone, deliverable, or activity. | Should |
| BR-TM-006 | A task must not be creatable against a WBS node that is closed, archived, or on hold. | Must |

### 5.2 Assignment and Responsibility

| Ref | Requirement | Priority |
|---|---|---|
| BR-TM-010 | Every task must have one accountable assignee; additional collaborators may be added. | Must |
| BR-TM-011 | Tasks must be assignable to internal users, crews, or subcontractor organisations. | Must |
| BR-TM-012 | Reassignment must be permitted only to roles with the reassign permission, and must be logged with reason. | Must |
| BR-TM-013 | Each task must name a reviewer/approver, defaulted from the discipline approval template. | Must |
| BR-TM-014 | Subcontractor users must see only tasks assigned to their organisation. | Must |

### 5.3 Sequencing and Time

| Ref | Requirement | Priority |
|---|---|---|
| BR-TM-020 | Tasks must support FS, SS, FF and SF dependencies with positive or negative lag in days. | Must |
| BR-TM-021 | The system must block start of a task whose predecessor constraint is unsatisfied, unless overridden by an authorised role with a recorded reason. | Must |
| BR-TM-022 | Planned start, planned finish, actual start and actual finish must be captured separately. | Must |
| BR-TM-023 | Baseline dates must be immutable once the schedule baseline is set; changes require a baseline revision. | Must |
| BR-TM-024 | Circular dependency creation must be rejected by the system. | Must |
| BR-TM-025 | Tasks must support a constraint type (ASAP, Start No Earlier Than, Finish No Later Than, Must Finish On). | Should |

### 5.4 Progress and Evidence

| Ref | Requirement | Priority |
|---|---|---|
| BR-TM-030 | Progress measurement method must be selectable per task: percentage, quantity-based, checklist-based, or milestone (0/100). | Must |
| BR-TM-031 | Quantity-based tasks must record planned quantity, unit of measure and cumulative actual quantity. | Must |
| BR-TM-032 | Progress may only increase unless a correction is made by an authorised role with reason. | Must |
| BR-TM-033 | The system must be configurable to require photo evidence before a task can be submitted. | Must |
| BR-TM-034 | Site photos must carry timestamp, uploader, and GPS coordinates where the device permits. | Should |
| BR-TM-035 | Every progress entry must be stored as an immutable log line, not an overwrite of a single field. | Must |

### 5.5 Governance and Control

| Ref | Requirement | Priority |
|---|---|---|
| BR-TM-040 | Task completion must route through the shared Approval Workflow Engine, with configurable steps per discipline and task type. | Must |
| BR-TM-041 | Rejection must require a comment; the task returns to In Progress with rejection count incremented. | Must |
| BR-TM-042 | On Hold must require a hold reason code and responsible party (Client / Consultant / Contractor / Subcontractor / Supplier / Weather / Authority / Force Majeure). | Must |
| BR-TM-043 | Cancellation must require authorisation at PM level or above and a recorded reason. | Must |
| BR-TM-044 | Tasks configured as inspection-gated must not reach Approved without a passed Inspection Request. | Must |
| BR-TM-045 | Tasks may be configured to require an active permit (HSE) before start. | Should |
| BR-TM-046 | Deleting a task is prohibited after first status change; only cancellation or archival is allowed. | Must |
| BR-TM-047 | All task actions must generate audit log entries per the Audit Trail Engine specification. | Must |

### 5.6 Integration and Roll-Up

| Ref | Requirement | Priority |
|---|---|---|
| BR-TM-050 | WBS node progress must be computed from child task progress using a configurable weighting method (equal, duration-weighted, cost-weighted, quantity-weighted). Default: cost-weighted where BOQ link exists, otherwise duration-weighted. | Must |
| BR-TM-051 | A task must be linkable to one or more BOQ items for commercial measurement. | Must |
| BR-TM-052 | A task must be linkable to documents, drawings, RFIs, NCRs, inspection requests, PRs and variation orders. | Must |
| BR-TM-053 | Logged manpower hours must be exportable to timesheet/HR for labour cost allocation. | Should |
| BR-TM-054 | Task events must publish to the Notification Engine according to the notification matrix. | Must |

### 5.7 Field Operations

| Ref | Requirement | Priority |
|---|---|---|
| BR-TM-060 | Task list, task detail, progress update and photo capture must function offline on mobile. | Must |
| BR-TM-061 | Offline changes must queue locally and sync on reconnection, with server-wins conflict rule for approval fields and device-wins for field observation data. | Must |
| BR-TM-062 | Users must always be able to see their sync state (pending / synced / failed). | Must |
| BR-TM-063 | Cached drawings linked to a task must be viewable offline. | Should |

---

## 6. Key Stakeholders

| Stakeholder | Interest in Module |
|---|---|
| Project Director | Portfolio-level late task exposure, escalation queue |
| Project Manager | Sequencing, delay register, approval bottlenecks, resource conflicts |
| Discipline Manager (ARC/STR/MEP) | Deliverable workload, review queue, design task turnaround |
| Planner / Scheduler | Actual dates, progress, delay causes feeding programme update |
| Site Supervisor | Daily work assignment, crew allocation, completion submission |
| Engineer | Own task list, technical execution, evidence upload |
| QA/QC Inspector | Inspection triggers from completed tasks |
| HSE Officer | Permit-gated tasks, safety-critical activity visibility |
| QS / Cost Engineer | Quantity measurement, BOQ linkage, progress valuation |
| Document Controller | Drawing revision used per task, superseded-drawing exposure |
| Subcontractor | Assigned scope, submission of completion, back-charge exposure |
| Client / Consultant | Read-only progress view and approval where contractually included |

---

## 7. Business Rules Summary

| Ref | Rule |
|---|---|
| RULE-01 | No task without a project and WBS node. |
| RULE-02 | No progress without a log entry. |
| RULE-03 | No completion without evidence, where evidence is mandated by task type. |
| RULE-04 | No approval without an authorised approver distinct from the submitter, unless self-approval is explicitly permitted for the task type. |
| RULE-05 | No hold without a reason code and responsible party. |
| RULE-06 | No deletion of executed work — cancel or archive only. |
| RULE-07 | No start against a superseded drawing revision where drawing linkage is mandatory. |
| RULE-08 | No inspection-gated approval without a passed inspection. |
| RULE-09 | No silent date change — baseline dates change only through baseline revision. |
| RULE-10 | No cross-tenant visibility under any condition. |

---

## 8. Assumptions

1. WBS Management, Authentication/RBAC, Project Setup, Document Control and the Approval Workflow Engine are delivered before or alongside this module.
2. Discipline master data, hold reason codes, and task type configuration are maintained in Admin Configuration, not hard-coded.
3. Mobile application shell (React Native) with local storage is available for Phase 1 field usage.
4. Users on site have intermittent, not continuous, connectivity.
5. BOQ Engine may not be available at Phase 1 go-live; BOQ linkage fields are designed now and activated in Phase 2.

## 9. Constraints

| Constraint | Implication |
|---|---|
| Multi-tenant single database with row-level security | Every task table carries `tenant_id`; all queries are tenant-scoped |
| Phase 1 backend on Supabase/PostgreSQL | Heavy computation (CPM, roll-up) implemented as SQL views/functions, not application loops |
| Mobile bandwidth on site | Photo compression mandatory on cellular; full resolution deferred to WiFi |
| Existing company numbering conventions | Task numbering format must be configurable per company and per project |

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Site teams do not adopt; tasks created but never updated | Progress data becomes fiction | Mobile-first UX, one-tap progress, supervisor daily close-out KPI, adoption dashboard |
| Over-granular task breakdown creates administrative burden | Users abandon system | Task templates and bulk generation; guidance that a task ≈ one crew, one location, one work type, 1–10 days |
| Progress roll-up weighting disputes between site and commercial | Conflicting progress figures | Single configured weighting rule per project, locked by PM, visible in reports |
| Offline sync conflicts corrupt records | Data integrity loss | Field-level conflict rules, sync conflict queue with manual resolution UI |
| Approval bottleneck at manager level | Work blocked, adoption drops | Escalation rules and Action Required inbox per notification matrix |

---

## 11. Success Criteria (Go-Live Acceptance)

| Ref | Criterion |
|---|---|
| AC-01 | A PM can create a project WBS and generate 200 tasks from templates in under 30 minutes. |
| AC-02 | A site engineer can update progress with 3 photos on a 3G connection in under 60 seconds. |
| AC-03 | WBS parent progress recalculates within 3 seconds of a child task update. |
| AC-04 | A task rejected by a supervisor returns to the assignee with the rejection reason visible on the mobile task card. |
| AC-05 | The delay register report lists every held task with reason code, responsible party, and hold duration. |
| AC-06 | Cross-tenant access attempt on any task endpoint returns 404/403 and is logged as a CRITICAL audit event. |
| AC-07 | A task's activity timeline reconstructs the full history of the work item without gaps. |

---

## 12. Dependencies

| Depends On | Nature |
|---|---|
| 02 — User / Role / Permission | Assignment, approval authority, RLS |
| 05 — Project Setup | Project context, calendar, numbering |
| 06 — WBS Management | Mandatory parent structure and roll-up target |
| 37 — Document Control | Drawing/document linkage and revision status |
| 46 — Notification Engine | Assignment, overdue, escalation alerts |
| 47 — Approval Workflow Engine | Task submission and approval routing |
| 48 — Audit Trail Engine | Immutable action history |
| 49 — Mobile Field Application | Offline execution surface |

---

**End of Document — DCOS-M04-BRD-001**
