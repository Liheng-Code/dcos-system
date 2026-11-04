# 02 — Functional Specification
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/02-Functional-Specification.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Owner: Planning Manager
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-06-14

---

## 1. Feature List

### F1 — Programme Structure Management

Create and manage the programme hierarchy (programmes, phases, and activities) linked to the
WBS spine.

**Business Rules**

BR1.01  Every PLN programme must be associated with exactly one project (project_id). A project
        may have multiple programmes (e.g., Master Programme, Fitout Programme, Commissioning
        Programme) but exactly one programme may carry the status 'master' at any given time.

BR1.02  Programme activities are linked to wbs_nodes. The link is optional at the programme
        level but mandatory for any activity that will drive IPC progress or EOT claims. An
        activity without a wbs_node_id is a planning-only activity (schedule buffer, float bar,
        summary bar).

BR1.03  Activities may be organised into summary bands (programme bands) that group related
        activities for display purposes. Summary band progress is computed as the weighted
        average of their child activities, weighted by the activity's planned_duration_days.
        No direct manual override of summary band progress is permitted.

BR1.04  An activity cannot have a planned_start_date after its planned_finish_date. The system
        must reject such entries with a validation error before save.

BR1.05  Duration (planned_duration_days) is calculated from planned_start_date and
        planned_finish_date using the project calendar (working days only). The calendar is
        sourced from project_calendars (existing table from Module 06 — Project Setup).

BR1.06  A programme may not be deleted if it has an active baseline or if it is referenced by
        an approved IPC. It may only be soft-deleted (deleted_at set, not CASCADE deleted).

BR1.07  Activity codes follow the project's established WBS code format where a wbs_node_id is
        linked, or a PLN-local activity code for planning-only activities. Duplicate activity
        codes within a programme are rejected.

---

### F2 — Dependency Management (Logical Links)

Define finish-to-start, start-to-start, finish-to-finish, and start-to-finish relationships
between activities, with optional lag or lead time.

**Business Rules**

BR2.01  The supported dependency types are:
        - FS: Finish-to-Start (B cannot start until A finishes) — most common
        - SS: Start-to-Start (B cannot start until A starts)
        - FF: Finish-to-Finish (B cannot finish until A finishes)
        - SF: Start-to-Finish (B cannot finish until A starts) — rare; allowed but flagged

BR2.02  Lag is expressed in working days. Positive lag = delay between relationships.
        Negative lag = lead time (activity B can start N days before predecessor A finishes).
        Lag_days may be any integer including negative. Fractional lag is not supported.

BR2.03  Circular dependency detection: when a new link is added, the system must check for
        cycles in the dependency graph. If a cycle is detected, the link must be rejected with
        the cycle path identified in the error message.

BR2.04  Cross-programme dependencies are not supported in this phase. All dependencies must
        be between activities within the same programme.

BR2.05  Deleting an activity that has successor dependencies must prompt the user to confirm
        deletion of dependent links. Activities with approved IPC references cannot be deleted.

---

### F3 — Critical Path Calculation

Automatically compute the critical path (CP) and total float for every activity in the
programme whenever data changes.

**Business Rules**

BR3.01  Critical path calculation uses the standard CPM forward-pass / backward-pass algorithm:
        - Forward pass: computes Early Start (ES) and Early Finish (EF) for each activity.
        - Backward pass: computes Late Start (LS) and Late Finish (LF) for each activity.
        - Total Float = LS – ES = LF – EF.
        - Critical activities have Total Float = 0 (or negative if schedule is behind).

BR3.02  The CPM calculation is triggered automatically on the server side whenever any of
        the following changes: activity planned dates, activity progress, dependency record,
        or programme baseline acceptance. CPM runs asynchronously via a background job; the
        UI shows a "Recalculating critical path…" banner until completion.

BR3.03  CPM results (es, ef, ls, lf, total_float_days, is_critical) are stored on the
        activity record and are read-only for users. The planner may not manually override
        CPM-computed float.

BR3.04  When a previously non-critical activity's total_float_days reaches 0 or below, an
        alert of type 'critical_path_change' is emitted to the Project Manager and Planner.

BR3.05  When the calculated programme end date (from CPM forward pass) exceeds the contract
        completion date (projects.end_date), an alert 'programme_overrun' is emitted to the
        Project Manager, Planner, and (if configured) the Client representative.

BR3.06  Activities with no successors (terminal activities) have Late Finish = contract
        completion date. If the project has no end_date set, CPM cannot run and the system
        must display a validation warning.

---

### F4 — Baseline Management

Capture, store, and compare programme baselines (Contract Baseline, Revised Baselines).

**Business Rules**

BR4.01  The Contract Baseline (baseline_type = 'contract') is the first accepted baseline. It
        may only be set once per programme by a user with the Planner or PM role. Once set,
        no field of the contract baseline record may be modified — it is immutable.

BR4.02  Additional baselines (baseline_type = 'revised') may be created at any time by the
        Planner. A revised baseline requires a mandatory reason_for_revision text of at least
        50 characters.

BR4.03  Baseline data is stored as a point-in-time snapshot of all activity records
        (planned dates, durations, dependencies) in the snapshot_data JSONB field. The
        snapshot must be self-contained: deleting an activity from the live programme must
        not corrupt the baseline snapshot.

BR4.04  Only one baseline may be set as 'active' per programme at any time. Setting a new
        baseline as active automatically sets the previous active baseline to inactive.
        Emits audit event on baseline activation change.

BR4.05  The Gantt view must be capable of displaying the contract baseline bar alongside the
        current planned bar and the actual progress bar for each activity (three-bar view).

BR4.06  Baseline variance is computed as:
        - Date variance = current planned_finish_date – baseline_finish_date (positive = delay)
        - Progress variance = actual_progress_pct – baseline_progress_pct_at_data_date
        Both variances are displayed on the activity record and on the programme comparison
        report.

BR4.07  A programme submitted to the client (via Document Control) must be associated with a
        named baseline at the time of submission. The document package must reference the
        baseline_id.

---

### F5 — Progress Update and Data Date

Record actual progress, actual start/finish dates, and remaining duration for each activity,
controlled by a programme data date.

**Business Rules**

BR5.01  A data date is the cut-off date for progress reporting. Actual progress figures only
        carry meaning in relation to the data date. Each progress update record must carry
        the data_date on which it was recorded.

BR5.02  Actual progress (actual_progress_pct) is entered by the Site Engineer or Planner
        for each activity as a percentage from 0 to 100. It may not decrease once confirmed
        (i.e., regressing progress requires a correction entry with mandatory justification).
        Emits audit event.

BR5.03  Actual start date (actual_start_date) is set by the Site Engineer when work begins.
        It may be earlier or later than planned_start_date. Once set, it cannot be cleared
        (it may be corrected with an audit trail).

BR5.04  Actual finish date (actual_finish_date) is set when actual_progress_pct = 100 and
        confirmed by the Planner or PM. Setting actual_finish_date automatically locks the
        activity (no further progress updates without unlocking by Planner or PM role).
        Emits audit event.

BR5.05  Remaining duration (remaining_duration_days) is either system-calculated
        (planned_duration_days × (1 – actual_progress_pct/100)) or manually overridden by
        the Planner. When manually overridden, the CPM re-runs using the remaining duration
        to project the forecast finish date.

BR5.06  Progress updates submitted by Site Engineers are in 'pending' status. The Planner
        reviews and either approves (status → 'confirmed') or rejects (status → 'rejected'
        with mandatory rejection_reason). Only 'confirmed' progress figures are used in
        CPM calculations, baseline comparison, S-curve, and IPC data.

BR5.07  The Programme data date may only be advanced forward; it cannot be moved backwards.
        Emits audit event when data date is advanced.

---

### F6 — Lookahead Schedule

Generate, distribute, and track 2-week and 4-week lookahead schedules from the master
programme.

**Business Rules**

BR6.01  A lookahead is generated for a specified window (lookahead_type: '2_week' or
        '4_week') starting from the Monday of the programme's current data date week.
        The lookahead includes all activities with planned_start_date or planned_finish_date
        within the window.

BR6.02  Activities included in a lookahead are the live planned activities from the master
        programme — not a separate parallel set. The lookahead is a filtered view, not a
        clone.

BR6.03  At the end of the lookahead window, the system records which activities were
        planned in that window and their actual completion status. This forms the lookahead
        completion record used in productivity metrics.

BR6.04  Lookahead Plan Completion Rate (PCR) is calculated as:
        PCR = (activities completed within window / activities planned within window) × 100
        PCR is displayed on the Programme Dashboard and feeds the KPI module.

BR6.05  Lookahead reports are printable/exportable as PDF. Distribution to the construction
        team is via the Notification Engine (in-app and email). Each lookahead snapshot is
        stored as a document record linked to the programme.

BR6.06  Site Engineers may not modify the lookahead template or window dates. Only the
        Planner may configure the lookahead parameters.

---

### F7 — Programme Import (CSV/Excel)

Allow initial import of a programme from a structured CSV or Excel template to avoid
re-entry of an existing Primavera P6 or MS Project programme.

**Business Rules**

BR7.01  The import template is a fixed DCOS format (downloadable from the module). Column
        mapping to arbitrary export formats is not supported.

BR7.02  The import template columns are:
        activity_code, activity_name, planned_start_date (YYYY-MM-DD),
        planned_finish_date (YYYY-MM-DD), predecessor_codes (comma-separated),
        dependency_types (comma-separated FS/SS/FF/SF), lag_days (comma-separated integers),
        wbs_code (optional — links to existing wbs_nodes.wbs_code), responsible_party.

BR7.03  Import is a two-stage operation: (a) dry-run validation produces a row-by-row error
        report with no data written; (b) confirmed import after user reviews the dry-run
        report. Both stages emit audit event.

BR7.04  On import, if a wbs_code matches an existing wbs_nodes.wbs_code in the project, the
        activity is linked. If it does not match, the activity is created as a planning-only
        activity without a wbs_node_id — this is flagged in the validation report but does
        not block import.

BR7.05  Import may only be performed into a programme with status 'draft'. Once a programme
        has status 'active' or higher, import is blocked. An active programme may only be
        updated activity-by-activity.

BR7.06  Duplicate activity_codes within the same import file are rejected at dry-run stage.

---

### F8 — Programme Approval Workflow

Submit programme revisions for internal and client review using the shared Approval Workflow
Engine.

**Business Rules**

BR8.01  Programme submission status lifecycle:
        draft → submitted_internal → approved_internal → submitted_client →
        approved_client | rejected_client

        On rejection at any stage, the programme returns to 'draft' with mandatory
        rejection_reason recorded. Emits audit event on every transition.

BR8.02  Only the Planner role may initiate a submission (draft → submitted_internal).

BR8.03  Internal approval is performed by the PM or a delegated senior engineer. The approver
        may not be the same person as the submitter (four-eyes principle — enforced by system).

BR8.04  Client submission packages the programme Gantt chart (as PDF), the baseline data,
        and the transmittal record into a single document bundle. This bundle is dispatched
        through the Document Control module and the Transmittal register.

BR8.05  An approved_client programme revision automatically marks its associated baseline as
        'client_accepted'. This status is used by the EOT module to determine the agreed
        programme for delay analysis.

BR8.06  A new programme revision cannot be submitted while a previous revision is in
        'submitted_internal' or 'submitted_client' status. Only one revision may be in
        flight at a time per programme.

---

### F9 — S-Curve and Progress Reporting

Generate planned-vs-actual S-curve data from the programme for dashboard and formal reports.

**Business Rules**

BR9.01  The S-curve represents cumulative planned progress and cumulative actual progress over
        time. It is computed from the scheduled distribution of activity durations across
        calendar dates.

BR9.02  Planned curve data points are derived from the active baseline's planned dates and
        durations. Each activity's planned contribution per day =
        (1 / planned_duration_days) × activity_weight_pct where weight_pct is proportional
        to planned_duration_days relative to total programme duration. Daily contributions
        are accumulated across all activities.

BR9.03  Actual curve data points are derived from confirmed progress records keyed to their
        data dates.

BR9.04  S-curve data is materialised into pln_scurve_snapshots after each data date advance.
        On-demand recomputation is available for date ranges not yet snapshotted. For PDF
        export, the data is computed server-side by a Supabase RPC function.

BR9.05  The S-curve report must display: (a) planned S-curve line, (b) actual S-curve line,
        (c) current data date marker, (d) variance area. All in the standard DCOS report
        layout.

BR9.06  A monthly progress report is auto-generated at each data date advance showing:
        planned progress to data date, actual progress to data date, variance, top 5
        critical delayed activities, and CPM-forecast completion date. This report is
        stored as a document linked to the programme.

---

### F10 — Delay Analysis

Record delay events and compute their programme impact for EOT and claims support.

**Business Rules**

BR10.01 A delay event is a structured record capturing: delay_type, responsible_party,
        impacted_activity_ids[], delay_start_date, delay_end_date, delay_duration_days,
        and description. Delay events are independent records associated with the programme.

BR10.02 Supported delay_type values:
        'employer_caused', 'force_majeure', 'weather', 'utility_disruption',
        'design_change', 'instruction', 'contractor_caused', 'concurrent'

BR10.03 Delay events may be raised by the Planner or PM. Client representatives may view
        delay events but may not create or modify them.

BR10.04 Each delay event links to one or more impacted activities. The system records the
        impacted activity's total_float_days at the time the delay event is raised and at
        the time it is closed. This provides the 'float consumed' figure for EOT.

BR10.05 Delay events have a status lifecycle:
        'open' → 'under_review' → 'agreed' | 'disputed'
        Emits audit event on every transition.

BR10.06 The EOT module may consume delay events via API. A delay event with status 'agreed'
        or 'disputed' may be attached to an EOT claim. Once attached to an accepted EOT, the
        delay event is locked (no modifications without Planner role override + audit entry).

---

### F11 — Programme Dashboard

Provide a real-time dashboard showing programme health indicators for the Project Manager.

**Business Rules**

BR11.01 The programme dashboard must display, at minimum:
        - Overall planned vs actual progress (%) at the data date
        - S-curve thumbnail (planned vs actual)
        - Critical path activities count
        - Number of activities with negative float
        - Activities starting in the next 14 days (upcoming activities)
        - Activities that were planned to finish before data date but are not 100% (overdue)
        - Lookahead PCR (last completed lookahead window)
        - Programme status and last approved revision

BR11.02 Dashboard tiles for activity counts use Supabase real-time subscription. S-curve
        data is loaded on demand (not subscribed).

BR11.03 The dashboard is read-only for all roles except the Programme data date advance
        control, which is restricted to Planner and PM roles.

---

## 2. Status Codes and Valid Transitions

### 2.1 Programme Status

```
draft
  │
  ├─► submitted_internal  (Planner submits for internal review)
  │         │
  │         ├─► approved_internal  (PM approves)
  │         │         │
  │         │         ├─► submitted_client  (Planner submits to client)
  │         │         │         │
  │         │         │         ├─► approved_client  (Client/PMC approves)
  │         │         │         │
  │         │         │         └─► rejected_client  (→ returns to draft)
  │         │         │
  │         │         └─► rejected_internal  (→ returns to draft)
  │         │
  │         └─► rejected_internal  (→ returns to draft)
  │
  └─► active  (Planner activates an approved_client programme as the working programme)
        │
        └─► superseded  (when a newer revision is activated)

Special: archived  (set by admin; programme is closed and read-only)
```

Transition rules:
- Only Planner may move: draft → submitted_internal
- Only PM may move: submitted_internal → approved_internal | rejected_internal
- Only Planner may move: approved_internal → submitted_client
- Only PM or Document Controller may move: submitted_client → approved_client | rejected_client
- Rejected programmes return to 'draft' — rejection_reason is mandatory before transition

### 2.2 Activity Status

```
not_started
  │
  ├─► in_progress  (actual_start_date set and actual_progress_pct > 0)
  │         │
  │         ├─► completed  (actual_progress_pct = 100, actual_finish_date confirmed)
  │         │
  │         └─► on_hold  (Planner or PM suspends activity)
  │                 │
  │                 └─► in_progress  (Planner or PM resumes activity)
  │
  └─► cancelled  (activity removed from scope; soft-deleted, not physically deleted)
```

Transition rules:
- not_started → in_progress: triggered when actual_start_date is set
- in_progress → completed: requires actual_progress_pct = 100 AND Planner/PM confirmation
- in_progress → on_hold: Planner or PM only; on_hold_reason mandatory
- completed → in_progress: Planner or PM only; mandatory justification; emits audit
- Any → cancelled: Planner or PM only; blocked if activity has active IPC reference

### 2.3 Progress Update Status

```
pending  →  confirmed  (Planner approves the site engineer's entry)
         →  rejected   (Planner rejects; mandatory rejection_reason)
```

### 2.4 Delay Event Status

```
open  →  under_review  →  agreed
                       →  disputed
```

### 2.5 Baseline Status

```
draft  →  active  (baseline is set as the working reference)
                →  superseded  (when a newer baseline becomes active)

Contract baseline sub-type: once created, immutable — may not be deleted or modified.
```

---

## 3. Workflow Decision Points and Rejection Paths

### 3.1 Programme Submission (Internal)

**Decision point:** PM reviews submitted_internal programme.

Approve path: PM confirms → status moves to approved_internal. Notification to Planner:
"Programme [name] revision [n] approved for internal review."

Reject path: PM provides rejection_reason (mandatory, minimum 20 characters). Status returns
to draft. Notification to Planner: "Programme [name] revision [n] returned for revision:
[rejection_reason]." A new revision must be created — the rejected revision is read-only.

### 3.2 Programme Submission (Client)

**Decision point:** Client/PMC responds to the transmittal.

Approve path: Document Controller marks transmittal as accepted → programme moves to
approved_client. The associated baseline gains status client_accepted. Notification to PM,
Planner, and all project team members.

Reject path: Client provides comments (captured in the transmittal response). Programme status
→ rejected_client. Notification to PM and Planner with client comments attached. The Planner
must create a new revision addressing the comments before re-submitting.

### 3.3 Progress Update Review

**Decision point:** Planner reviews site engineer's pending progress updates for a given data date.

Approve path: Planner marks individual updates as confirmed. CPM re-runs asynchronously.
S-curve snapshot is materialised. Notification to Site Engineer: "Your progress update for
[activity] has been confirmed."

Reject path: Planner marks update as rejected with rejection_reason. Site Engineer is notified
and must re-enter the figure with a correction justification.

### 3.4 Baseline Activation

**Decision point:** Planner creates a new revised baseline.

Activate path: Planner sets the new baseline as active. Previous active baseline is
automatically set to superseded. Emits audit event. CPM re-runs against new baseline.
Notification to PM: "A new programme baseline [name] has been activated."

Cancel path: If the new baseline is abandoned before activation, it may be deleted with no
further consequence beyond the creation audit log entry.

### 3.5 Activity Completion Un-lock

**Decision point:** Planner or PM requests to revert a completed activity to in_progress.

Approve path (Planner/PM self-approves): Planner or PM provides mandatory justification.
Activity status reverts to in_progress. actual_finish_date is cleared. If the activity is
referenced by a confirmed IPC, the IPC module receives a system alert 'activity_uncompleted'
and the IPC must be reviewed before the next submission.

Block path: If the activity is referenced by a submitted or certified IPC, the un-complete
action is blocked. The Planner must contact the QS to reverse the IPC reference first.

---

## 4. Integration Points with Other DCOS Modules

| Integration | Direction | Purpose |
|---|---|---|
| Module 07 — WBS Management | PLN reads from WBS | Activity records link to wbs_nodes via wbs_node_id. WBS hierarchy determines programme structure groupings. |
| Module 08 — Task Management | Bidirectional | wbs_tasks provide the execution-level task layer. PLN activity and wbs_task share wbs_node_id as the common join key; progress is not duplicated — IPC reads from PLN only. |
| Module 06 — Project Setup | PLN reads from PRJ | project_calendars provides working day definitions for duration calculations. projects.end_date is the contract completion date for CPM. |
| Module 10 — Approval Workflow Engine | PLN uses | Programme submission and approval flows route through the shared Approval Workflow Engine. |
| Module 11 — Notification Engine | PLN publishes | All delay alerts, approval notifications, lookahead distribution, and CPM alerts publish to the Notification Engine. |
| Module 12 — Audit Log Engine | PLN writes | All state changes, baseline activations, and progress confirmations emit events to the Audit Engine. |
| Module 09 — Document Control | PLN writes | Approved programme revisions and lookahead snapshots are registered as documents with version and transmittal records. |
| Module 34 — IPC / Progress Claim | PLN publishes (pull) | IPC reads confirmed actual_progress_pct from pln_activities via RPC. No duplicate storage. |
| Module 39 — Extension of Time | PLN publishes | Agreed delay event records (with float consumed, impacted activities, and baseline comparison) are consumable by the EOT module via RPC. |
| Module 13 — Reporting & KPI | PLN publishes | S-curve data, PCR metric, critical path activity count, and schedule performance index feed the KPI reporting module. |
| Module 40 — HR | PLN reads | Resource assignments in PLN link to HR employee/labour records for planned manpower visibility. Read-only in Phase 2. |
| Module 27 — Procurement | Bidirectional | Material delivery dates from purchase orders create planning constraints visible in the lookahead. |

---

## 5. Feature-to-Module Cross-Reference

| Feature | Module Code | Notes |
|---|---|---|
| F1 — Programme Structure | PLN | Owns all pln_programmes and pln_activities records |
| F2 — Dependencies | PLN | Owns dependency graph in pln_activity_links; no cross-programme links in Phase 2 |
| F3 — Critical Path | PLN | CPM engine — async server-side Supabase RPC function |
| F4 — Baseline Management | PLN | Snapshot stored as JSONB in pln_baselines; immutable contract baseline |
| F5 — Progress Updates | PLN | pending → confirmed flow; IPC pulls confirmed progress via RPC |
| F6 — Lookahead | PLN | Filtered view of master programme; PCR metric; starts from Monday of data date week |
| F7 — Programme Import | PLN | CSV/Excel only; two-stage dry-run + confirm |
| F8 — Approval Workflow | PLN + APP | PLN triggers; Approval Workflow Engine executes; four-eyes enforced by system |
| F9 — S-Curve | PLN + RPT | PLN materialises snapshots into pln_scurve_snapshots; RPT renders charts |
| F10 — Delay Analysis | PLN + EOT | PLN owns pln_delay_events; EOT consumes via RPC |
| F11 — Dashboard | PLN | PM-facing real-time health view; Supabase subscription on count tiles |
