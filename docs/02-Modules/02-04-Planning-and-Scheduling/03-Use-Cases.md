# 03 — Use Cases
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/03-Use-Cases.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Owner: Planning Manager
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-06-14

---

## Overview

This document defines the primary use cases for Module PLN. Each use case describes one
actor performing one primary scenario. Alternate paths cover rejection, error, and
guard conditions. Business rule references (BR n.nn) are cross-referenced to Doc 02.

Actors covered: Planner, Project Manager (PM), Site Engineer, Construction Manager,
QS / Commercial Manager, Client / PMC Representative, Document Controller.

---

## UC01 — Create Programme and Set Contract Baseline

**Actor:** Planner
**Feature:** F1 — Programme Structure Management, F4 — Baseline Management
**Precondition:**
- A project record exists with a valid `end_date` (contract completion date).
- The WBS has been published (wbs_nodes populated) for the project.
- The Planner has role `planner` or `planning_manager` on the project.
- No programme with `programme_type = 'master'` and `status != 'archived'` exists for this project.

**Trigger:** Planner selects "New Programme" from the Programme module home for a project.

### Main Flow

1. Planner provides programme details: name, description, programme_type (`master`),
   and confirms the contract completion date (pre-filled from `projects.end_date`).
2. System validates: no existing master programme (non-archived) for the project
   (BR1.01). Creates `pln_programmes` record with `status = 'draft'`.
3. Planner creates activities one by one (or proceeds to UC02 for bulk import):
   a. Provides activity_code, activity_name, planned_start_date, planned_finish_date.
   b. Optionally selects a linked wbs_node from the project WBS hierarchy.
   c. System validates planned_start_date < planned_finish_date (BR1.04).
   d. System calculates planned_duration_days using the project calendar (BR1.05).
   e. System rejects duplicate activity_code within the programme (BR1.07).
   f. System saves `pln_activities` record with `status = 'not_started'`.
4. Planner defines dependencies between activities (see UC flow detail in F2):
   selects predecessor activity, dependency_type (FS/SS/FF/SF), and lag_days.
   System runs circular dependency check (BR2.03); rejects if cycle detected.
5. Planner triggers "Calculate Critical Path". System queues async CPM calculation
   (BR3.02); UI shows "Recalculating critical path…" banner.
6. CPM completes: activities display `es`, `ef`, `ls`, `lf`, `total_float_days`,
   `is_critical` fields (BR3.01, BR3.03).
7. Planner reviews the Gantt and critical path. When satisfied, selects
   "Create Contract Baseline".
8. System prompts for baseline_name. Planner confirms. System creates a
   `pln_baselines` record with `baseline_type = 'contract'`, `status = 'active'`,
   and serialises all current activity data into `snapshot_data` JSONB (BR4.01, BR4.03).
9. Audit Engine records: programme created, activities created (count), contract
   baseline created, with user and timestamp (SC9, BR4.01).
10. System emits notification to PM: "Contract baseline set for programme [name]."

### Alternate Path A — Project End Date Not Set

At step 5, CPM cannot run. System displays: "CPM calculation requires a contract
completion date on the project. Please set projects.end_date before proceeding."
(BR3.06). Planner must navigate to Project Setup and set the date before returning.

### Alternate Path B — Duplicate Activity Code

At step 3e, system rejects the save with error: "Activity code [code] already exists
in this programme. Activity codes must be unique within a programme." (BR1.07).
Planner amends the code and resubmits.

### Alternate Path C — Programme Already Exists

At step 2, if a non-archived master programme exists, system rejects creation with:
"This project already has an active master programme: [name]. A project may have
only one master programme at a time." (BR1.01). Planner may open the existing
programme or archive it before creating a new one.

---

## UC02 — Import Programme from CSV

**Actor:** Planner
**Feature:** F7 — Programme Import
**Precondition:**
- A `pln_programmes` record exists with `status = 'draft'` for the project.
- Planner has the DCOS import CSV template (downloaded from the module).
- The CSV file conforms to the template column specification (BR7.02).

**Trigger:** Planner selects "Import from CSV" on the programme edit page.

### Main Flow

1. Planner uploads the CSV file. System confirms file is a valid CSV with the
   expected column headers (BR7.01); rejects non-conforming files immediately.
2. System performs **dry-run validation** (BR7.03):
   a. Parses every row for field types and mandatory values.
   b. Validates planned_start_date < planned_finish_date per row (BR1.04).
   c. Detects duplicate activity_codes within the file (BR7.06).
   d. Matches wbs_code values against existing `wbs_nodes.wbs_code` for the project;
      flags unmatched rows as "planning-only" (BR7.04).
   e. Checks predecessor_codes reference activity_codes present in the same file;
      flags missing references.
   f. Builds dependency graph in memory; detects cycles (BR2.03).
3. System presents dry-run report: row count, error count, warning count, row-by-row
   table with status (OK / ERROR / WARNING) and message per row.
4. If errors exist: Planner downloads the error report, corrects the CSV, and repeats
   from step 1. System does not write any data during dry-run.
5. If no errors (warnings may remain): Planner reviews warnings and selects
   "Confirm Import".
6. System performs **confirmed import**:
   a. Creates `pln_activities` records for all rows.
   b. Links wbs_node_id where wbs_code matched; leaves null where unmatched.
   c. Creates `pln_activity_links` records for all predecessor relationships.
   d. Queues async CPM calculation (BR3.02).
7. Audit Engine records: import event, row count, warnings count, user, timestamp (BR7.03).
8. System displays: "Import complete. [N] activities created. [W] warnings. Critical
   path calculation in progress."

### Alternate Path A — Programme Not in Draft

At step 1, if the programme `status != 'draft'`, system blocks the import with:
"Programme import is only available for programmes in Draft status. This programme
is currently [status]." (BR7.05).

### Alternate Path B — File Too Large / Wrong Format

At step 1, if file is not a CSV or exceeds size limit (e.g., 10 MB), system rejects
with a file validation error before any processing.

### Alternate Path C — All Rows Have Errors

At step 3, if error count = row count, system highlights that the import cannot
proceed. Planner must fix the CSV before re-uploading.

---

## UC03 — Submit Programme for Internal Approval

**Actor:** Planner (submitter), Project Manager (approver)
**Feature:** F8 — Programme Approval Workflow
**Precondition:**
- Programme exists with `status = 'draft'`.
- A contract baseline exists for the programme (BR4.07).
- No other revision of this programme is in `submitted_internal` or `submitted_client`
  status (BR8.06).
- Planner is not the same user who will approve (four-eyes principle; enforced at
  approval step, not submission step).

**Trigger:** Planner selects "Submit for Internal Review" on the programme page.

### Main Flow

1. System validates preconditions: draft status, baseline exists, no in-flight
   revision (BR8.06). Blocks if any condition fails with descriptive message.
2. Planner provides optional submission notes. Confirms submission.
3. System transitions programme `status → 'submitted_internal'`. Records
   `submitted_at`, `submitted_by`. Audit event emitted.
4. Approval Workflow Engine creates an approval task assigned to the PM role for
   this project (BR8.03).
5. Notification Engine sends PM: "Programme [name] Revision [n] has been submitted
   for internal review by [Planner name]. Action required."
6. PM opens the programme review page. Sees the Gantt, activity list, critical path,
   baseline comparison, and submission notes.
7. PM selects "Approve":
   a. System validates PM is not the same person as the submitter (BR8.03).
   b. System transitions `status → 'approved_internal'`. Records `approved_by`,
      `approved_at`. Audit event emitted.
   c. Notification sent to Planner: "Programme [name] Revision [n] has been
      approved for internal review."

### Alternate Path A — PM Rejects

At step 7, PM selects "Reject":
a. PM must provide `rejection_reason` (minimum 20 characters). System blocks
   rejection without it.
b. System transitions `status → 'draft'`. Rejection reason recorded. Audit event.
c. Notification to Planner: "Programme [name] Revision [n] has been returned for
   revision: [rejection_reason]."
d. Rejected programme revision becomes read-only. Planner must create a new revision.

### Alternate Path B — Approver is Submitter

At step 7a, if the PM user is the same person who submitted (e.g., PM submitted on
behalf of the Planner using dual roles), system blocks with: "The approver cannot
be the same person as the submitter. Four-eyes principle is enforced." (BR8.03).
Another authorised PM or delegated senior engineer must approve.

### Alternate Path C — Precondition: No Baseline

At step 1, if no baseline exists, system blocks with: "A programme baseline is
required before submission. Please create and activate a baseline first." (BR4.07).

---

## UC04 — Submit Programme to Client

**Actor:** Planner (initiates), Document Controller (packages and dispatches)
**Feature:** F8 — Programme Approval Workflow, integration with Document Control
**Precondition:**
- Programme has `status = 'approved_internal'`.
- An active baseline is associated with the programme.
- No other revision is currently in `submitted_client` status (BR8.06).

**Trigger:** Planner selects "Submit to Client" on an internally approved programme.

### Main Flow

1. System validates programme is `approved_internal`. Planner confirms the
   associated baseline to be included in the client package (BR4.07).
2. System transitions `status → 'submitted_client'`. Audit event emitted.
3. System generates the client submission package (BR8.04):
   a. Programme Gantt chart rendered as PDF (server-side).
   b. Baseline data summary appended.
   c. Transmittal cover sheet created in the Document Control module with
      auto-populated fields (document title, revision, date, originator).
4. Document Controller receives notification: "Programme [name] Revision [n] is
   ready for client dispatch. Please review and issue the transmittal."
5. Document Controller reviews the package, adds any cover letter comments,
   and issues the transmittal to the Client/PMC Representative.
6. Client/PMC acknowledges receipt. Document Controller records acknowledgement.
7. Client/PMC reviews and responds:
   - **If approved:** Document Controller marks transmittal as accepted.
     System transitions programme `status → 'approved_client'`.
     The associated baseline `status → 'client_accepted'` (BR8.05).
     Notification sent to PM, Planner, and all project team members.
8. Audit event emitted on client acceptance: programme approved_client, baseline
   client_accepted, with timestamp and Document Controller user.

### Alternate Path A — Client Rejects

At step 7, Client/PMC rejects the programme (provides comments via transmittal
response). Document Controller records the rejection and comments.
System transitions `status → 'rejected_client'`. Notification to PM and Planner
with client comments attached. Planner must create a new programme revision
addressing the comments before re-submitting. (BR8.01 rejection path.)

### Alternate Path B — Planner Recalls Before Client Response

Between steps 5 and 7, Planner may recall the submission (with PM approval) if
a critical error is discovered. System transitions `status → 'draft'`. Transmittal
is marked cancelled in Document Control. Audit event recorded.

---

## UC05 — Advance Data Date and Confirm Progress

**Actor:** Planner (with PM oversight)
**Feature:** F5 — Progress Update and Data Date
**Precondition:**
- Programme has `status = 'active'` (or `approved_client` being used as working programme).
- All site engineer progress updates for the reporting period are in `pending` or
  `confirmed` status in `pln_progress_updates`.
- Planner has confirmed or rejected all pending updates for this data date cycle.

**Trigger:** Planner selects "Advance Data Date" from the Programme Dashboard.

### Main Flow

1. Planner selects the new data_date. System validates: new date > current
   `pln_programmes.data_date` (BR5.07). Rejects backward movement.
2. System displays a pre-advance checklist:
   - Count of pending (unreviewed) progress updates for activities with
     planned dates before the new data_date.
   - Count of activities with planned_finish_date before new data_date but
     `actual_progress_pct < 100` (overdue activities).
3. Planner reviews pending items, confirms or rejects each pending progress update
   (or delegates to step-by-step review — see UC06 for Site Engineer submission flow).
4. Planner confirms "Advance Data Date" with no blocking unreviewed updates.
5. System updates `pln_programmes.data_date`. Audit event emitted (BR5.07).
6. System triggers:
   a. Async CPM recalculation using confirmed progress data (BR3.02).
   b. Materialisation of S-curve snapshot into `pln_scurve_snapshots` (BR9.04).
   c. Generation of monthly progress report document (BR9.06).
7. After CPM completes:
   a. If any previously non-critical activity now has `total_float_days <= 0`,
      alert 'critical_path_change' sent to PM and Planner (BR3.04).
   b. If CPM forecast completion date > `projects.end_date`, alert
      'programme_overrun' sent to PM, Planner, and configured Client rep (BR3.05).
8. Dashboard updates: S-curve refreshes, overdue count refreshes, critical path
   count refreshes (BR11.01).

### Alternate Path A — Backward Date Rejected

At step 1, if proposed data_date <= current data_date, system blocks with:
"The data date may only be advanced forward. Current data date: [date]." (BR5.07).

### Alternate Path B — Unreviewed Pending Updates Remain

At step 4, if unreviewed pending updates exist for activities due before the new
data_date, system warns: "[N] progress updates remain unreviewed for this period.
Advancing the data date without reviewing them will leave them in pending status
and they will not be included in CPM or S-curve calculations." Planner may proceed
with acknowledgement or cancel to review first.

---

## UC06 — Site Engineer Submits Progress Update

**Actor:** Site Engineer
**Feature:** F5 — Progress Update and Data Date
**Precondition:**
- Programme is `active`. Data date is set.
- Site Engineer is assigned to one or more activities (`responsible_party_id`).
- The reporting cycle is open (Planner has not yet closed the data date advance
  for this period).

**Trigger:** Site Engineer navigates to "My Activities" in the PLN module and selects
an activity to update.

### Main Flow

1. Site Engineer views the list of activities assigned to them, filtered to show
   activities in `not_started` or `in_progress` status.
2. Site Engineer selects an activity and enters:
   a. `actual_progress_pct` — current percentage complete (0–100).
   b. `actual_start_date` — if the activity has just started (BR5.03).
   c. Optional: `notes` — field observation notes.
3. System validates:
   a. `actual_progress_pct >= previous confirmed actual_progress_pct` (BR5.02).
      If lower, requires mandatory correction justification.
   b. `actual_start_date` is not in the future.
   c. If `actual_progress_pct = 100`, flags that activity completion must be
      confirmed by Planner or PM before `actual_finish_date` is set (BR5.04).
4. System saves `pln_progress_updates` record with `status = 'pending'`.
   The activity display shows the pending update (greyed, not yet applied to CPM).
5. Notification sent to assigned Planner: "Progress update submitted for [activity
   name] by [Site Engineer name]. Review required."
6. Planner reviews the pending update (see UC05 step 3 for review flow):
   - **If confirmed:** `pln_progress_updates.status → 'confirmed'`. Activity
     `actual_progress_pct` updated. If 100%, Planner sets `actual_finish_date`
     and activity `status → 'completed'` (BR5.04). CPM queued for recalculation.
     Notification to Site Engineer: "Your progress update for [activity] has
     been confirmed."
   - **If rejected:** `pln_progress_updates.status → 'rejected'` with
     `rejection_reason` (mandatory). Notification to Site Engineer: "Your
     progress update for [activity] was rejected: [rejection_reason]. Please
     re-enter with a correction."

### Alternate Path A — Progress Regression Without Justification

At step 3a, if the entered `actual_progress_pct` is less than the last confirmed
value and no justification is provided, system blocks with: "Progress may not
decrease without a correction justification. Please provide a reason." (BR5.02).

### Alternate Path B — Activity Locked (Completed)

If the Site Engineer attempts to update an activity with `status = 'completed'`,
system blocks with: "This activity is marked as completed and is locked. Contact
the Planner or PM to unlock it for further updates." (BR5.04).

### Alternate Path C — Construction Manager Reviews Lookahead

Construction Manager does not submit progress. They view the 2-week lookahead
(generated by the Planner, see UC08) and may add comments via the activity
comment thread. They flag resource conflicts or readiness issues as comments —
not as formal progress updates. This is a read-plus-comment role.

---

## UC07 — CPM Alert — Critical Path Change

**Actor:** Project Manager (recipient), Planner (recipient and respondent)
**Feature:** F3 — Critical Path Calculation, F11 — Programme Dashboard
**Precondition:**
- Programme is `active` with a confirmed contract baseline.
- A progress update has been confirmed or an activity date has been modified,
  triggering async CPM recalculation.

**Trigger:** CPM background job completes and detects that one or more activities
have changed critical path status (total_float_days dropped to ≤ 0) (BR3.04).

### Main Flow

1. CPM job completes and writes updated `total_float_days` and `is_critical` to
   `pln_activities` records.
2. System compares new `is_critical = true` activities against the pre-calculation
   set. Identifies newly critical activities.
3. System emits alert 'critical_path_change' for each newly critical activity
   (BR3.04). Notification Engine delivers:
   - In-app alert to PM: "Critical path change detected on programme [name].
     Activity [activity_code — activity_name] is now on the critical path.
     Total float: [N] days."
   - Email notification to PM and Planner with summary of all newly critical
     activities and their remaining duration.
4. PM opens the Programme Dashboard. The critical path count tile has updated.
   The Gantt highlights new critical activities in red.
5. PM and Planner review the impact:
   a. PM may view the delay-to-completion projection (CPM forecast vs contract date).
   b. Planner assesses whether to raise a Delay Event (see UC09).
6. If `CPM forecast completion > projects.end_date`, an additional
   'programme_overrun' alert is emitted (BR3.05) to PM, Planner, and configured
   Client representative.
7. Audit log records: CPM recalculation run, affected activity IDs, float values
   before and after, alert event.

### Alternate Path A — CPM Calculation Fails

If the background CPM job encounters an error (e.g., dependency graph integrity
issue), it records a failure event and sends a system alert to the Planner:
"CPM calculation failed for programme [name]. Reason: [error]. Please review
activity dependencies and retry." The UI banner stays at "Recalculating…" until
the job succeeds or the Planner manually retries.

### Alternate Path B — No Change on Recalculation

If CPM completes and no activity changes critical path status, no alert is emitted.
The CPM run is recorded in the audit log as a silent recalculation. Dashboard
refreshes silently.

---

## UC08 — Generate Lookahead Schedule

**Actor:** Planner (generates), Construction Manager and Site Engineers (consumers)
**Feature:** F6 — Lookahead Schedule
**Precondition:**
- Programme is `active` with a current data_date set.
- The programme has activities with planned dates within the lookahead window.

**Trigger:** Planner selects "Generate Lookahead" on the Programme page and selects
lookahead type (2-week or 4-week).

### Main Flow

1. Planner selects lookahead_type: '2_week' or '4_week'.
2. System calculates the window start: Monday of the week containing the current
   data_date (BR6.01). Window end = start + 14 days (or 28 days for 4-week).
3. System queries `pln_activities` for all activities where `planned_start_date`
   or `planned_finish_date` falls within the window AND `status != 'cancelled'`
   (BR6.01, BR6.02).
4. System creates `pln_lookaheads` record with `lookahead_type`, `window_start`,
   `window_end`, `programme_id`, `generated_at`, `generated_by`.
5. System creates `pln_lookahead_items` records for each included activity,
   capturing a snapshot of current planned dates, responsible_party, and
   current `actual_progress_pct`.
6. System renders the lookahead as a PDF (or on-screen table) showing:
   activity code, activity name, responsible party, planned start, planned finish,
   current progress, is_critical flag.
7. Planner reviews the lookahead and confirms distribution.
8. Notification Engine distributes to Construction Manager and all Site Engineers
   assigned to activities in the window (BR6.05):
   - In-app notification with a link to the lookahead view.
   - Email with the PDF attached.
9. Lookahead snapshot is registered as a document in Document Control (BR6.05).
10. At the end of the window, system auto-evaluates completion:
    For each `pln_lookahead_items` record, checks if the activity reached
    `actual_progress_pct = 100` within the window. Records completion status.
    Calculates PCR = completed / planned × 100 (BR6.04). Stores on
    `pln_lookaheads.plan_completion_rate`.

### Alternate Path A — No Activities in Window

At step 3, if no activities fall within the computed window, system warns:
"No activities found in the [N]-week lookahead window [start] to [end]. The
programme may not have activities planned for this period." Planner may still
generate an empty lookahead (for documentation purposes) or cancel.

### Alternate Path B — Site Engineer Views Lookahead

Site Engineer receives the notification, opens the lookahead in the portal, and
views only activities assigned to them. They cannot modify the lookahead window,
template, or dates (BR6.06). If they have progress to report, they use the
progress update flow (UC06).

---

## UC09 — Raise Delay Event

**Actor:** Planner (or PM)
**Feature:** F10 — Delay Analysis
**Precondition:**
- Programme is `active`.
- One or more activities have experienced delay (date slippage or float consumption
  visible on the Gantt).
- Actor has `planner` or `pm` role.

**Trigger:** Planner selects "Raise Delay Event" from the Delay Events register
within the programme.

### Main Flow

1. Planner opens the Delay Event creation form and provides:
   - `delay_type`: selected from controlled list (BR10.02):
     employer_caused, force_majeure, weather, utility_disruption,
     design_change, instruction, contractor_caused, concurrent.
   - `responsible_party`: free text or stakeholder reference.
   - `delay_start_date` and `delay_end_date`.
   - `delay_duration_days`: system-calculated from dates, or manually entered.
   - `description`: narrative of the delay event (mandatory).
2. Planner links the delay event to one or more impacted activities by selecting
   from the programme activity list (BR10.01).
3. System records `total_float_days` at the time of the delay event creation for
   each linked activity (BR10.04). This is the "float at time of event" snapshot.
4. System saves `pln_delay_events` record with `status = 'open'`.
   Creates `pln_delay_event_activities` junction records for each impacted activity.
5. Audit event emitted: delay event created, impacted activity IDs, delay type,
   actor, timestamp.
6. PM receives notification: "New delay event [ID] raised on programme [name]:
   [delay_type] — [N] activities impacted."
7. PM or senior reviewer transitions the event to `status = 'under_review'`.
8. After investigation, PM or Planner transitions:
   - → `'agreed'`: delay is acknowledged by all parties. Records `closed_at`,
     `closed_by`. System records `total_float_days` at closure for each impacted
     activity (BR10.04). Event becomes available for EOT module (BR10.06).
   - → `'disputed'`: delay is contested. Records dispute notes. Event remains
     visible to Client/PMC (read-only).
9. Audit event emitted on every status transition (BR10.05).

### Alternate Path A — Client Views Delay Events

Client/PMC Representative opens the Delay Events register. They see all events with
`status != 'open'` (or all events per configured visibility rule). They may view
details but cannot create, modify, or transition any event (BR10.03).

### Alternate Path B — EOT Module Attaches a Delay Event

After the delay event reaches `status = 'agreed'` or `'disputed'`, the EOT module
operator selects this event to attach to an EOT claim (BR10.06). Once attached to
an accepted EOT, the delay event is locked. Any modification attempt by the Planner
is blocked with: "This delay event is attached to an accepted EOT claim and is
locked. Contact the EOT module owner to unlock." (BR10.06).

### Alternate Path C — Delay Type Is Concurrent

If `delay_type = 'concurrent'`, system adds a warning flag to the event record and
to the delay register view: "Concurrent delays require legal review before inclusion
in an EOT claim." This is informational only — it does not block creation.

---

## UC10 — QS Reads Progress for IPC

**Actor:** QS / Commercial Manager
**Feature:** F9 — S-Curve and Progress Reporting; Integration with Module 34 — IPC
**Precondition:**
- Programme is `active` with at least one data date advance completed.
- `pln_activities` records have `actual_progress_pct` figures in `confirmed` status.
- The IPC module has an IPC draft in progress for the same project.

**Trigger:** QS opens an IPC line item that references an activity linked to a
wbs_node and selects "Fetch Progress from PLN".

### Main Flow

1. IPC module calls the PLN RPC `pln_get_confirmed_progress(project_id, data_date)`
   (BR5.06, SC3). The RPC returns a result set of:
   - `wbs_node_id`, `activity_code`, `activity_name`,
   - `actual_progress_pct` (confirmed only),
   - `data_date`, `actual_start_date`, `actual_finish_date`.
2. IPC module auto-populates the `progress_pct` field on IPC line items that have
   a matching `wbs_node_id` from the PLN result set.
3. QS reviews the populated progress figures in the IPC line item table.
   For each line item, the QS sees the PLN-sourced progress figure (read-only
   field, source-labelled "From PLN") alongside the IPC quantity measurement.
4. QS confirms the IPC line items. The progress figure cannot be overridden in the
   IPC module — it must be challenged by returning to PLN and requesting the
   Planner to correct the confirmed progress (SC3).
5. QS proceeds with IPC submission using the certified PLN progress figures.
   No separate reconciliation step is needed between the planner's progress
   record and the QS payment application (SC3).
6. Audit trail in IPC references the `pln_progress_updates.id` records that were
   the source of each progress figure, preserving end-to-end traceability.

### Alternate Path A — No Confirmed Progress for an Activity

At step 1, if an IPC line item's linked activity has no confirmed progress
(all updates are still `pending`), the RPC returns `actual_progress_pct = null`
for that activity. The IPC module displays: "No confirmed progress available for
[activity_code]. Ask the Planner to confirm the pending progress update before
this IPC period closes."

### Alternate Path B — Mismatched wbs_node_id

If an IPC line item references a `wbs_node_id` that is not linked to any
`pln_activities` record (the activity was created as planning-only with no
wbs_node_id link), the progress field on the IPC item is not auto-populated.
QS must either manually enter a progress figure (with mandatory justification)
or request the Planner to link the activity to the WBS node.

---

## Open Questions (Use Cases)

OQ-UC-01: Should the Construction Manager be able to add formal "activity readiness
          confirmations" to lookahead items (a structured yes/no for each activity,
          not just a free-text comment)? If yes, `pln_lookahead_items` needs a
          `readiness_status` field and a new UC is required.

OQ-UC-02: In UC04 (Submit to Client), does the Client/PMC Representative have a
          named DCOS user account, or do they interact purely via email transmittal?
          If via email only, the Document Control module handles the response and no
          PLN-side client login is needed.

OQ-UC-03: For UC09, when a Delay Event is created from a CPM alert (UC07), should
          the system pre-populate the impacted activities from the alert, or should
          the Planner always select them manually? Pre-population would reduce data
          entry but could lead to incorrect linkage.

OQ-UC-04: The monthly progress report (BR9.06) is auto-generated at each data date
          advance. Who is the formal document originator in Document Control — the
          Planner who advanced the data date, or the system (a service account)?
          This affects the transmittal signature block.

OQ-UC-05: In UC10, if the QS needs to dispute a confirmed progress figure (i.e.,
          the QS believes the site measurement does not support 60% when PLN says
          60%), what is the formal dispute path? Currently the QS must verbally
          contact the Planner. Should PLN have a formal "progress query" sub-workflow?
