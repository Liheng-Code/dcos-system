# DCOS — Module 04: Task Management
## 03 — Use Cases

| Field | Value |
|---|---|
| Document Code | DCOS-M04-UC-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Traceability | Implements FS DCOS-M04-FS-001 |

---

## Use Case Index

| ID | Use Case | Primary Actor | Priority |
|---|---|---|---|
| UC-TM-01 | Create a construction task against a WBS location | Site Supervisor | Must |
| UC-TM-02 | Bulk-generate tasks across WBS nodes from a template | Project Manager | Must |
| UC-TM-03 | Assign and reassign a task | Discipline Manager | Must |
| UC-TM-04 | Start a task with dependency and permit checks | Site Engineer | Must |
| UC-TM-05 | Update progress from the field (offline) | Site Engineer | Must |
| UC-TM-06 | Place a task on hold and record delay cause | Site Supervisor | Must |
| UC-TM-07 | Submit a completed task for approval | Site Engineer | Must |
| UC-TM-08 | Approve or reject a submitted task | Supervisor / Discipline Manager | Must |
| UC-TM-09 | Raise an inspection request from a completed task | Site Engineer | Must |
| UC-TM-10 | Handle a failed inspection and rework loop | QA/QC Inspector | Must |
| UC-TM-11 | Create and manage task dependencies | Planner | Must |
| UC-TM-12 | Log manpower, equipment and material against a task | Site Supervisor | Must |
| UC-TM-13 | Manage a design deliverable task through review | Discipline Engineer | Must |
| UC-TM-14 | Assign and monitor subcontractor tasks | Project Manager | Must |
| UC-TM-15 | Cancel a task and manage successor impact | Project Manager | Should |
| UC-TM-16 | Reopen a closed task | Project Manager | Should |
| UC-TM-17 | Review discipline workload and rebalance | Discipline Manager | Should |
| UC-TM-18 | Produce the delay register for a claim | QS / Contracts | Should |
| UC-TM-19 | Client/consultant views progress (read-only) | Client | Could |
| UC-TM-20 | Resolve an offline sync conflict | Site Supervisor | Must |

---

## UC-TM-01 — Create a Construction Task Against a WBS Location

| Attribute | Detail |
|---|---|
| Actor | Site Supervisor (secondary: Project Manager) |
| Goal | Register a discrete unit of site work at a specific location so it can be assigned, executed and measured |
| Trigger | Look-ahead plan requires work to be issued to a crew |
| Preconditions | Project active; WBS node exists and is active; user has `task.create` on the project |
| Postconditions | Task exists in OPEN or ASSIGNED status with a unique code; audit CREATE record written |

**Main Flow**

1. User opens the WBS/Task Workspace and selects the WBS node (e.g. `P001-B01-L05-Z03`).
2. User selects **New Task**. The project, WBS node and full path are pre-filled.
3. User selects task type `TT-CON — Construction Activity` and discipline `STR`.
4. User enters title ("Slab reinforcement fixing — Zone 3"), description, and work category `PERMANENT_WORKS`.
5. User selects progress method `QUANTITY`, enters planned quantity 12.5 and unit `ton`.
6. User sets planned start and planned finish; system validates against the project calendar and warns if dates fall on non-working days.
7. User selects assignee (or crew) and priority.
8. User links the governing drawing revision from Document Control and, optionally, the BOQ item.
9. System evaluates the task type configuration and displays required gates (permit required: no; inspection required: yes; min photos: 2).
10. User saves. System generates `task_code`, sets status ASSIGNED (assignee present), writes audit entry, and emits `TASK.ASSIGNED`.
11. Assignee receives in-app and Telegram notification.

**Alternate Flows**

- **A1 — Save as draft:** User saves without assignee → status DRAFT, no notification, task hidden from execution lists.
- **A2 — Create from template:** User selects a template; checklist, resource plan, default duration and gates are pre-populated; user adjusts and saves.
- **A3 — Sub-task:** User creates the task from within a parent task; parent progress switches to derived mode.

**Exception Flows**

- **E1 — WBS node closed:** System blocks with "Cannot create a task under a closed WBS node."
- **E2 — Duplicate code:** Sequence collision → system retries next sequence number transparently.
- **E3 — Assignee not on project:** Validation VR-03 error; user must add the person to the project team first.

---

## UC-TM-02 — Bulk-Generate Tasks Across WBS Nodes

| Attribute | Detail |
|---|---|
| Actor | Project Manager / Planner |
| Goal | Create a repeating work package across many locations without manual repetition |
| Preconditions | WBS structure built; task template exists |
| Postconditions | N tasks created, one per selected node, in a single audited batch |

**Main Flow**

1. User opens **Tasks → Bulk Generate**.
2. User selects template "Slab cycle — STR" containing 6 activity templates (setting out, formwork, rebar, MEP embed check, pour, curing).
3. User multi-selects WBS nodes — Levels 03 to 12, Zones 1 to 4 (40 nodes).
4. User sets start date for the first node and a lag pattern (e.g. +5 working days per level).
5. System previews the generated set: 240 tasks with codes, dates, assignees and inter-task dependencies from the template.
6. User adjusts assignees by discipline, then confirms.
7. System creates tasks in a transaction, applies intra-template dependencies within each node and cross-node dependencies where the template defines them, writes one batch audit record plus per-task records.
8. System notifies assignees with a single grouped notification per user.

**Exception Flows**

- **E1 — Partial failure:** Any node failing validation aborts the whole batch; system reports the failing nodes. No partial creation.
- **E2 — Volume guard:** Batches above 1,000 tasks run asynchronously; user is notified on completion.

---

## UC-TM-03 — Assign and Reassign a Task

**Main Flow**

1. Discipline Manager opens the task and selects **Assign**.
2. System lists eligible users filtered by project access, discipline and role, showing each candidate's current open-task count.
3. Manager selects assignee; system warns if the candidate exceeds the workload threshold (FR-TM-014) but does not block.
4. Manager confirms; system updates `assignee_id`, writes audit with old/new value, emits `TASK.ASSIGNED`.

**Alternate Flow — Reassignment**

- Manager selects a different assignee on an already-assigned task. System requires a reason from a picklist (resource conflict, competency, leave, performance, scope change, other). Both previous and new assignee are notified. Rejection and progress history remain with the task, not the person.

**Exception**

- User lacks `task.reassign` → action hidden; direct API call returns 403 with audit HIGH severity entry.

---

## UC-TM-04 — Start a Task with Dependency and Permit Checks

| Attribute | Detail |
|---|---|
| Actor | Site Engineer |
| Preconditions | Task in ASSIGNED status; user is assignee or supervisor |
| Postconditions | Status IN_PROGRESS; `actual_start` set; predecessors verified |

**Main Flow**

1. Engineer opens the task and selects **Start Work**.
2. System evaluates dependency status. All predecessors satisfied → READY.
3. System evaluates gates: `requires_permit = true` for hot works → system checks for a valid, unexpired permit linked to the task.
4. System checks the linked drawing revision status — if SUPERSEDED, a blocking or warning dialog appears per configuration.
5. All checks pass. System sets status IN_PROGRESS, stamps `actual_start`, writes audit, and emits no notification (low value).

**Exception Flows**

- **E1 — Blocked by predecessor:** System displays the blocking task(s) with their status and assignee, and offers "Request override". Override requires `task.override_dependency`, a mandatory reason, and generates a HIGH-severity audit entry plus notification to the PM.
- **E2 — No valid permit:** Start blocked. System offers a deep link to raise the permit request in the HSE module.
- **E3 — Superseded drawing:** System shows current revision and offers one-click relink to the latest issued revision.
- **E4 — Task on hold:** Start unavailable; user must resume first.

---

## UC-TM-05 — Update Progress from the Field (Offline)

| Attribute | Detail |
|---|---|
| Actor | Site Engineer on mobile, no connectivity |
| Goal | Record what was actually built today with evidence, without waiting for signal |
| Preconditions | Task cached on device; task in IN_PROGRESS |
| Postconditions | Local progress log queued; synced when connectivity returns; WBS roll-up recalculated server-side |

**Main Flow**

1. Engineer opens the mobile app; task list shows cached assigned tasks with an offline banner.
2. Engineer opens "Slab reinforcement fixing — Zone 3" and taps **Update Progress**.
3. Engineer enters actual quantity for today: 4.2 ton. System shows cumulative 9.7 / 12.5 ton = 77.6%.
4. Engineer captures 3 photos through the in-app camera. Each is stamped with time, user, task code, WBS path and GPS.
5. Engineer adds a note ("Zone 3 bay 2 complete, bay 3 rebar delivered short by 0.8 t").
6. Engineer taps **Save**. Record is written to local storage with an idempotency key; task card shows **Pending sync**.
7. Connectivity returns. Sync agent posts the queued log with the idempotency key.
8. Server validates, appends `task_progress_logs` row, uploads compressed photos (cellular) and marks originals for WiFi upload.
9. Server recalculates task progress and WBS roll-up; audit entry written with `source_channel = MOBILE`.
10. Device receives confirmation; card shows **Synced**.

**Exception Flows**

- **E1 — Duplicate replay:** Server detects a repeated idempotency key and returns the original result without creating a second log.
- **E2 — Task changed server-side (e.g. cancelled):** Sync returns conflict; entry moves to the conflict queue (see UC-TM-20) and the user is alerted.
- **E3 — Cumulative exceeds planned quantity:** System accepts up to 100% and flags the excess for supervisor authorisation; over-run requires `task.authorise_overrun`.
- **E4 — Photo upload fails:** Progress log persists; photos retry with exponential back-off; task shows a partial-sync indicator.

---

## UC-TM-06 — Place a Task on Hold and Record Delay Cause

| Attribute | Detail |
|---|---|
| Actor | Site Supervisor |
| Goal | Stop work and create a defensible record of who caused the stoppage |
| Postconditions | Status ON_HOLD; hold record open with reason code and responsible party; PM notified |

**Main Flow**

1. Supervisor opens the task and selects **Put On Hold**.
2. System requires: hold reason code (from master), responsible party, expected resume date, and a note.
3. Supervisor selects `HR-DES — Design information not available`, responsible party `Consultant`, and links the open RFI record.
4. Supervisor optionally attaches a photo of the affected area.
5. System sets ON_HOLD, opens a `task_holds` record with `hold_start`, writes audit, emits `TASK.ON_HOLD` to PM, Discipline Manager and Planner.
6. Hold duration accrues daily and appears in the Delay Register.

**Alternate Flow — Resume**

- Supervisor selects **Resume**, adds a closure note; system closes the hold record with `hold_end`, computes duration, returns status to IN_PROGRESS.

**Exception**

- Hold exceeding `hold_ageing_alert_days` triggers `TASK.HOLD_AGEING` escalation to the Project Director.

---

## UC-TM-07 — Submit a Completed Task for Approval

**Main Flow**

1. Engineer sets progress to 100% (or completes the final checklist item).
2. Engineer selects **Mark Complete**. System validates: progress 100%, mandatory checklist items resolved, minimum photo count met, method statement linked where required.
3. Status becomes COMPLETED; `actual_finish` stamped.
4. Engineer selects **Submit for Approval**. System resolves the approval route from the template for {project, discipline, task type} — here: Supervisor → Discipline Manager.
5. Status becomes SUBMITTED_FOR_APPROVAL; `TASK.SUBMITTED` notification sent to the first approver; task appears in the approver's Action Required inbox.

**Exception Flows**

- **E1 — Evidence missing:** Submission blocked with "Attach at least 2 photos before submitting."
- **E2 — No approver resolvable:** System falls back to WBS-responsible manager, then PM; if still unresolved, blocks with an admin alert.
- **E3 — Open NCR linked:** Submission permitted, closure blocked later — the NCR is surfaced as a warning at submission.

---

## UC-TM-08 — Approve or Reject a Submitted Task

| Attribute | Detail |
|---|---|
| Actor | Supervisor, then Discipline Manager |
| Preconditions | Task in SUBMITTED_FOR_APPROVAL; actor is the current approval step owner |

**Main Flow (Approve)**

1. Approver opens the Action Required inbox and selects the task.
2. Approver reviews progress history, photos, checklist results and linked inspection.
3. Approver selects **Approve**, optionally adding a comment.
4. If more approval steps remain, task stays SUBMITTED_FOR_APPROVAL and routes to the next approver; otherwise status becomes APPROVED.
5. System writes approval action + audit, emits `TASK.APPROVED`, marks successors' `dependency_status` for recalculation, and emits `TASK.PREDECESSOR_DONE` to successor assignees.
6. If `auto_close_after_approval_days` is configured, task auto-closes after the interval; otherwise a PM closes manually.

**Alternate Flow (Reject)**

1. Approver selects **Reject** and enters a mandatory comment ("Rebar spacing at grid C/4 not per drawing rev 03; photo evidence insufficient").
2. Approver optionally raises a linked NCR or snag task in the same action.
3. Status becomes REJECTED, `rejection_count` incremented; `TASK.REJECTED` sent to assignee and Discipline Manager.
4. Assignee acknowledges; task returns to IN_PROGRESS with progress retained but completion cleared.

**Exception Flows**

- **E1 — Approver is submitter:** Blocked unless `allow_self_approval` is true for the task type.
- **E2 — Inspection-gated task without passed inspection:** Approve action disabled with explanation.
- **E3 — Approver on leave:** Delegation rule (from Admin Configuration) routes to the delegate; delegation is recorded in the audit trail.

---

## UC-TM-09 — Raise an Inspection Request from a Completed Task

**Main Flow**

1. On a task with `requires_inspection = true`, the engineer selects **Request Inspection**.
2. System pre-fills the Inspection Request with project, WBS node, discipline, task code, ITP reference, drawing links and completion photos.
3. Engineer sets the requested inspection date/time and notify parties (internal QA, consultant).
4. System creates the IR in the QA/QC module with a bidirectional link, sets the task's `inspection_status = REQUESTED`, and notifies the inspector.

**Postcondition:** Task cannot be approved until the linked IR returns PASSED.

---

## UC-TM-10 — Handle a Failed Inspection and Rework

**Main Flow**

1. Inspector records the inspection result as FAILED with findings.
2. QA/QC module raises an NCR and pushes the result to the task: `inspection_status = FAILED`.
3. System returns the task to IN_PROGRESS, sets `is_rework = true`, links the NCR, and notifies assignee, supervisor and PM.
4. Engineer performs corrective work, updates progress and evidence, and re-submits.
5. A re-inspection is requested; on PASS, the NCR closes and the task may proceed to approval.

**Business Notes**

- Rework tasks are excluded from productivity numerator but included in man-hour denominator, so rework cost is visible.
- Rework attributable to a subcontractor is flagged for potential back-charge in the Subcontractor module.

---

## UC-TM-11 — Create and Manage Task Dependencies

**Main Flow**

1. Planner opens the task and selects **Dependencies → Add Predecessor**.
2. Planner searches within the project (filter by WBS branch and discipline), selects the predecessor, chooses type FS and lag +2 days.
3. System validates that no cycle is created and that both tasks are in the same project.
4. System saves the link, recomputes `dependency_status` for the successor and flags the Planning module for CPM recalculation.

**Alternate Flow — Cross-discipline dependency**

- MEP first-fix depends on STR slab pour approval. On approval of the predecessor, the MEP assignee is notified that work is now released.

**Exception**

- Cycle detected: "This dependency creates a loop: T0042 → T0055 → T0061 → T0042."

---

## UC-TM-12 — Log Manpower, Equipment and Material Against a Task

**Main Flow**

1. Supervisor opens the task and selects **Resources → Log for {date}**.
2. Manpower: adds trade rows (steel fixer × 8 @ 8h normal + 2h OT; helper × 4 @ 8h).
3. Equipment: adds tower crane TC-01, 4h working, 1h idle.
4. Material: issues 4.2 t rebar Y16 from site store against the task; inventory decrements and the consumption links to the WBS node.
5. System saves logs, computes productivity (4.2 t ÷ 96 man-hours), and merges the entries into the project Daily Report for that date.

**Exception**

- Stock insufficient → warning with option to record consumption anyway (creating a negative-stock exception for the storekeeper) or to raise a material request.

---

## UC-TM-13 — Manage a Design Deliverable Task Through Review

**Main Flow**

1. Discipline Manager creates task type `TT-DWG` for "Level 05 slab reinforcement layout", progress method MILESTONE, linked to the drawing register entry.
2. Engineer produces the drawing, uploads revision R00 to Document Control from within the task.
3. Engineer submits the task; the approval route is Internal Check → Discipline Lead → Client/Consultant (external step).
4. Consultant returns "Approved with Comment". Document Control records the status; the task is approved and a follow-up task is auto-created for comment incorporation (revision R01).
5. On issue for construction, dependent construction tasks are released and their assignees notified.

---

## UC-TM-14 — Assign and Monitor Subcontractor Tasks

**Main Flow**

1. PM assigns tasks with `execution_mode = SUBCONTRACT` to subcontractor organisation "ABC Formwork Co."
2. The subcontractor user logs in with restricted access, seeing only tasks for their organisation on their project.
3. Subcontractor updates progress and uploads evidence; internal supervisor verifies before approval (self-approval disabled for external assignees).
4. Verified progress feeds subcontractor measurement for the sub-IPC in the Subcontractor module.
5. Rejections and rework tasks attributable to the subcontractor accumulate into a performance score and potential back-charges.

**Exception**

- Subcontractor attempts to view another organisation's task → 403 plus CRITICAL audit entry.

---

## UC-TM-15 — Cancel a Task and Manage Successor Impact

**Main Flow**

1. PM selects **Cancel** on a task made redundant by a design change.
2. System requires a reason and shows the impact: successors, linked documents, consumed resources, and progress achieved to date.
3. PM confirms. Status becomes CANCELLED; the task is excluded from roll-up denominators; successors are flagged `dependency_review_required` and their assignees notified.
4. Any consumed cost/quantity remains in the record for commercial assessment (abortive work / variation claim).

**Rule:** Cancellation never deletes. The record and its history remain permanently queryable.

---

## UC-TM-16 — Reopen a Closed Task

**Main Flow**

1. PM opens a closed task and selects **Reopen**, entering a mandatory reason.
2. System returns the task to IN_PROGRESS, retains all history, increments `reopen_count`, writes a CRITICAL audit entry and notifies the original approver, assignee and QA where inspection was involved.
3. Any commercial measurement already certified against the task is flagged for QS review.

---

## UC-TM-17 — Review Discipline Workload and Rebalance

**Main Flow**

1. Discipline Manager opens **Reports → Workload by User**.
2. View shows open tasks, overdue count, total remaining planned hours, and next-7-day load per user.
3. Manager identifies overload, multi-selects tasks and applies a bulk reassignment with reason.
4. System notifies affected users and logs each reassignment individually.

---

## UC-TM-18 — Produce the Delay Register for a Claim

**Main Flow**

1. QS opens **Reports → Delay / Hold Register** and filters by project, date range and responsible party = Client/Consultant.
2. Report lists every hold event: task code, WBS path, reason code, responsible party, hold start/end, duration, linked RFI/EI reference, and whether the task was on the critical path.
3. QS exports to XLSX for inclusion in the EOT submission; export is recorded as an audit EXPORT event with the applied filters.

**Business Value:** The register is contemporaneous evidence, produced automatically from daily operations rather than reconstructed after the fact.

---

## UC-TM-19 — Client / Consultant Read-Only Progress View

**Main Flow**

1. Client user logs in with external role scope and opens the project.
2. Client sees WBS progress roll-up, milestone status and tasks where the client is an approval participant. Internal comments, costs, resource logs and subcontractor data are hidden.
3. Where contractually included, the client acts as an approval step on nominated tasks and their decision is recorded in the approval trail.

---

## UC-TM-20 — Resolve an Offline Sync Conflict

**Main Flow**

1. A device syncs progress for a task that was cancelled server-side while offline.
2. Server returns a conflict; the entry lands in the **Sync Conflicts** queue visible to the device owner and their supervisor.
3. Supervisor reviews both versions side by side (device data with timestamps vs server state).
4. Supervisor chooses to discard, or to re-post the field data to a replacement task; photos are never discarded — they are moved to the project photo library with their original metadata.
5. Resolution is audited with both versions retained.

---

## Traceability Matrix (Use Case → Requirements)

| Use Case | Business Requirements | Functional Requirements |
|---|---|---|
| UC-TM-01 | BR-TM-001, 002, 003, 006 | FR-TM-001..003, 007 |
| UC-TM-02 | BR-TM-001, 003 | FR-TM-004 |
| UC-TM-03 | BR-TM-010..014 | FR-TM-010..014 |
| UC-TM-04 | BR-TM-021, 045 | FR-TM-022, 023, 071, 072 |
| UC-TM-05 | BR-TM-030..035, 060..062 | FR-TM-030..037, 110..114 |
| UC-TM-06 | BR-TM-042 | FR-TM-070 (hold), §3.3 |
| UC-TM-07 | BR-TM-033, 040 | FR-TM-042, 062, 073 |
| UC-TM-08 | BR-TM-040, 041, 044 | FR-TM-070, 074 |
| UC-TM-09 | BR-TM-044 | FR-TM-070 |
| UC-TM-10 | BR-TM-041, 044 | FR-TM-063, 070 |
| UC-TM-11 | BR-TM-020, 024 | FR-TM-020..023 |
| UC-TM-12 | BR-TM-053 | FR-TM-050..055 |
| UC-TM-13 | BR-TM-052 | FR-TM-072, 052 |
| UC-TM-14 | BR-TM-011, 014 | FR-TM-012, 074 |
| UC-TM-15 | BR-TM-043, 046 | FR-TM-092 |
| UC-TM-16 | BR-TM-047 | §3.2 reopen |
| UC-TM-17 | BR-TM-012 | FR-TM-014, 100..104 |
| UC-TM-18 | BR-TM-042, BO-05 | §8 Reports |
| UC-TM-19 | BR-TM-014 | FR-TM-083 |
| UC-TM-20 | BR-TM-061, 062 | FR-TM-112, 113 |

---

**End of Document — DCOS-M04-UC-001**
