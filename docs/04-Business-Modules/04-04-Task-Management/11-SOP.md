# DCOS — Module 04: Task Management
## 11 — Standard Operating Procedure (SOP)

| Field | Value |
|---|---|
| Document Code | DCOS-M04-SOP-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Applies To | All project staff using DCOS Task Management |
| Review Cycle | Annually, or after any major process change |

---

## 1. Purpose and Scope

This SOP defines how work is issued, executed, evidenced, approved and closed in DCOS. It applies to all disciplines, all projects, and all users including subcontractors granted system access.

**The governing principle:** if work happened on the project, it exists as a task in DCOS. If it is not in DCOS, it did not happen — for the purposes of progress, payment, claims and audit.

---

## 2. Roles and Responsibilities

| Role | Responsibility in Task Management |
|---|---|
| **Project Manager** | Owns the project's task structure. Approves the WBS-to-task mapping, sets roll-up weighting, resolves escalations, authorises overrides, cancellations and reopening. |
| **Planner** | Maintains dependencies, planned dates and baseline. Reviews delay events weekly. |
| **Discipline Manager** | Issues and balances tasks within their discipline. Approves deliverables. Monitors turnaround and rejection rates. |
| **Site Supervisor** | Issues daily work, verifies field submissions, performs first-line approval, closes out the day. |
| **Engineer / Site Engineer** | Executes assigned tasks, updates progress daily with evidence, raises holds honestly and promptly. |
| **QA/QC Inspector** | Responds to inspection requests, records results, drives rework loops. |
| **HSE Officer** | Ensures permit-gated tasks have valid permits; applies safety holds. |
| **QS / Cost Engineer** | Verifies quantities on approved tasks; uses the delay register for claims. |
| **Document Controller** | Ensures tasks reference the current drawing revision. |
| **Subcontractor User** | Updates progress on assigned scope; submits for verification. |

---

## 3. SOP-TM-01 — Project Task Setup (Start of Project)

**Frequency:** Once per project, before any work is issued.
**Owner:** Project Manager, supported by the Planner.

| Step | Action | Responsible | Output |
|---|---|---|---|
| 1 | Confirm the WBS is complete to the level at which work will be controlled (normally Zone or Element). | PM + Planner | Approved WBS |
| 2 | Set the project task numbering pattern and confirm it matches company convention. | PM | `task_code_pattern` |
| 3 | Set the roll-up weighting method (cost-weighted where BOQ exists, otherwise duration-weighted). Record the decision in the project charter. | PM + QS | `rollup_weighting` locked |
| 4 | Confirm the project calendar: working days, shift pattern, public holidays. | PM + HR | Project calendar |
| 5 | Select the task templates to be used and adapt them to the project's construction method. | PM + Discipline Managers | Project template set |
| 6 | Configure gate requirements per task type: inspection required, permit required, minimum photos, method statement required. | PM + QA + HSE | Task type configuration |
| 7 | Confirm approval routes per discipline and task type, including delegates for planned absences. | PM + Discipline Managers | Approval templates |
| 8 | Confirm hold reason codes and responsible-party defaults with the Contracts team. | PM + Contracts | Hold reason master |
| 9 | Assign project team members, disciplines and WBS coverage. | PM | Project membership |
| 10 | Generate the first look-ahead of tasks and review with the site team before issuing. | PM + Supervisors | Issued task set |

**Do not skip step 3.** Changing roll-up weighting mid-project makes historical progress incomparable and invites a dispute between site and commercial.

---

## 4. SOP-TM-02 — Issuing Work (Weekly Look-Ahead)

**Frequency:** Weekly, before the look-ahead meeting.
**Owner:** Site Supervisor / Discipline Manager.

| Step | Action |
|---|---|
| 1 | Review the 3-week look-ahead from Planning. Identify the activities to be issued as tasks. |
| 2 | Generate tasks from templates against the correct WBS nodes. Use **Preview** before confirming any bulk generation. |
| 3 | Check each task has: correct WBS node, discipline, measurable quantity and unit where applicable, realistic dates against the project calendar. |
| 4 | Link the governing drawing revision. If the drawing is not yet issued for construction, create the task but do not assign a start date — record the dependency instead. |
| 5 | Set dependencies. Every task that cannot start independently must have its predecessor recorded. Verbal sequencing is not sequencing. |
| 6 | Assign an accountable person (or crew, or subcontractor) and a supervisor. Never leave a task unassigned once issued. |
| 7 | Check the workload warning. If a person exceeds the threshold, rebalance before issuing rather than after they fall behind. |
| 8 | Confirm gate requirements are visible on each task and that the team understands them (inspection required, photos required, permit required). |
| 9 | Issue. Assignees are notified automatically — do not re-issue instructions by WhatsApp. |

**Task sizing guidance:** a well-formed construction task is one crew, one location, one work type, one to ten days. Larger than that and progress becomes guesswork. Smaller and the system becomes paperwork.

---

## 5. SOP-TM-03 — Daily Field Execution

**Frequency:** Daily.
**Owner:** Site Engineer / assigned executor.

### Morning

| Step | Action |
|---|---|
| 1 | Open **My Tasks** on mobile before leaving the site office. Confirm the day's list and check for anything marked Blocked, On Hold or Rejected. |
| 2 | For each task to be started: tap **Start Work**. If the system blocks the start, do not proceed with the work — resolve the blocker or record a hold. Starting work that the system says is blocked is a discipline issue, not a system issue. |
| 3 | Confirm the governing drawing on the task is the current revision. If it shows superseded, stop and contact the Document Controller. |
| 4 | Confirm any required permit is in place. |

### During the Day

| Step | Action |
|---|---|
| 5 | Capture photos as work proceeds — not at the end of the day from memory. Photos taken through the app carry time, location and task reference automatically. |
| 6 | If work stops for any reason, record a hold **on the same day**, with the correct reason and responsible party. A hold recorded three days late is worth much less as claim evidence. |

### End of Day (before leaving site)

| Step | Action |
|---|---|
| 7 | Update progress on every task worked on today. Enter actual quantity where the task is quantity-based, not an estimated percentage. |
| 8 | Log manpower and equipment actually used. |
| 9 | Log material consumed against the task. |
| 10 | Add a short note describing what was achieved and any issue encountered. Write it for someone reading it in two years during a dispute. |
| 11 | Check the sync indicator. If entries show **Pending**, remain within coverage until they show **Synced**, or confirm before leaving that the queue is intact. |

**Rule:** progress is entered by the person who did or supervised the work, on the day it happened. Progress entered by an office user on behalf of site is a control failure.

---

## 6. SOP-TM-04 — Completing and Submitting a Task

**Owner:** Assignee.

| Step | Action |
|---|---|
| 1 | Confirm the work is genuinely complete against the drawing and specification — not "nearly done". |
| 2 | Complete all checklist items. Answer honestly; a failed item is information, not a failure of the person. |
| 3 | Confirm the required minimum photos are attached and that they actually show the completed work, not a general site view. |
| 4 | Tap **Mark Complete**. If the system blocks submission, read the message: it will state exactly what is missing. |
| 5 | Where the task requires inspection, raise the **Inspection Request** from within the task so that all evidence transfers automatically. |
| 6 | Tap **Submit for Approval** and add a short note for the approver. |
| 7 | Monitor the task. If it is rejected, read the reason, correct the work, and resubmit — do not argue in the comment thread before fixing the issue. |

---

## 7. SOP-TM-05 — Verification and Approval

**Frequency:** Daily, at end of shift.
**Owner:** Site Supervisor (first line), Discipline Manager (second line).

| Step | Action |
|---|---|
| 1 | Open **Action Required** at the end of each working day. Clear the queue daily. Items ageing beyond 24 hours escalate automatically and reflect on the approver, not the submitter. |
| 2 | For each submission: review the progress history, photos, checklist results and inspection status. Verify against the drawing revision recorded on the task. |
| 3 | Where the work was not physically verified, do not approve. Approval is a statement that the work was checked. |
| 4 | **Approve** with a brief comment stating the basis of verification (e.g. "Inspected 11 Aug with consultant; conforms to R03"). |
| 5 | **Reject** with a specific, actionable reason: what is wrong, where, and against what requirement. "Not good" is not a rejection reason. |
| 6 | Where the defect is a quality non-conformance, tick **Raise NCR** during rejection so that QA/QC picks it up formally. |
| 7 | Where rework is attributable to a subcontractor, note it — it feeds performance scoring and potential back-charge. |

**Separation of duty:** you may not approve a task you submitted. If you find yourself as both, escalate to your manager rather than requesting the self-approval setting.

---

## 8. SOP-TM-06 — Managing Holds and Delay Events

**Owner:** Site Supervisor to record, Project Manager to manage, Contracts/QS to exploit.

| Step | Action |
|---|---|
| 1 | Record the hold on the day work stops, without exception. |
| 2 | Select the reason code that matches reality. Do not default to "Other" — the code drives the delay analysis and claim position. |
| 3 | Set the responsible party accurately. If the cause is our own (labour, equipment, planning), record it as ours. Falsifying responsibility destroys the credibility of the entire register when it is examined. |
| 4 | Link the blocking record: RFI, employer's instruction, permit, purchase requisition. A hold with a linked reference is evidence; a hold without one is an assertion. |
| 5 | Attach a photograph of the affected area where relevant. |
| 6 | Set an expected resume date and review it — do not leave stale holds open. |
| 7 | Resume promptly when the blocker clears, adding a release note. |
| 8 | **Weekly:** the PM reviews all open holds. Any hold older than 5 days must have an owner, an action and an escalation. |
| 9 | **Monthly:** the QS extracts the Delay Register for the period and reviews it against contractual notice obligations. Missing a notice deadline because the hold was recorded but never reviewed is an avoidable loss. |

---

## 9. SOP-TM-07 — Dependency and Sequence Control

**Owner:** Planner, supported by Supervisors.

| Step | Action |
|---|---|
| 1 | Record dependencies when tasks are created, not after work stalls. |
| 2 | Use hard dependencies only where the sequence is physically or contractually mandatory. Over-constraining creates false blockages and encourages overrides. |
| 3 | When a start is blocked, use **Notify predecessors** first. Escalate second. Override last. |
| 4 | An override may only be used with the PM's authority and a written reason. Every override is reported. |
| 5 | **Weekly:** the Planner reviews all overrides used. A pattern of overrides means the programme logic is wrong and must be corrected, not worked around. |

---

## 10. SOP-TM-08 — Weekly Management Review

**Frequency:** Weekly, in the project progress meeting.
**Owner:** Project Manager.

| Item | Source | Question to Answer |
|---|---|---|
| Progress by WBS | Progress report | Is physical progress consistent with the programme? |
| Late task register | Late report | What is late, who owns it, what is the recovery action? |
| Delay / hold register | Delay report | What stopped us, who caused it, is a notice required? |
| Approval latency | Latency report | Are managers holding up the site? |
| Rejection / rework | Rework report | Where is quality failing and why? |
| Blocked tasks | Task list filter | What is the constraint on next week's work? |
| Dependency overrides | Audit report | Is the programme logic realistic? |
| Adoption | Adoption dashboard | Are tasks being updated daily, or is the data fiction? |

Actions from this review are recorded as tasks in DCOS, assigned and dated. Meeting minutes without corresponding tasks are decorative.

---

## 11. SOP-TM-09 — Month-End Close

**Frequency:** Monthly, aligned to the progress claim cycle.
**Owner:** QS with the Project Manager.

| Step | Action |
|---|---|
| 1 | Confirm all tasks with work completed in the period have been submitted and approved. Unapproved work cannot be certified. |
| 2 | Freeze the measurement cut-off date and communicate it to the site team 3 days in advance. |
| 3 | Extract approved quantities by WBS and BOQ item for the measurement. |
| 4 | Reconcile task quantities against physical measurement. Investigate any variance above the agreed tolerance. |
| 5 | Extract the Delay Register for the period for the claim and notice position. |
| 6 | Extract man-hours by WBS for cost allocation and productivity reporting. |
| 7 | Record any task correction made during reconciliation with a reason — corrections are visible and auditable. |
| 8 | Archive the period's report set to the project document register. |

---

## 12. SOP-TM-10 — Cancellation, Reopening and Corrections

| Situation | Procedure |
|---|---|
| **Work no longer required** | PM cancels the task with a reason. Review successors. If work had been performed, record the quantity achieved before cancelling — abortive work may be claimable. |
| **Defect found after closure** | PM reopens the task with a reason, or raises a new snag task linked to the original. Reopening a certified task requires QS notification. |
| **Progress entered incorrectly** | Do not attempt to hide it. Enter a correction with a reason. Both entries remain visible. |
| **Wrong task assigned to wrong WBS node** | If no progress recorded: correct the node. If progress recorded: cancel with reason and create the correct task, referencing the original. |
| **Duplicate tasks created** | Cancel the duplicate with reason "Duplicate of {task code}". Never delete. |

**Never** attempt to correct data by asking an administrator to modify the database. All corrections happen through the system so they are visible in the audit trail.

---

## 13. Data Quality Standards

| Standard | Requirement |
|---|---|
| Daily update | Every task in progress is updated on every working day it is worked on |
| Evidence | Every completed construction task carries at least the configured minimum photos, showing the actual work |
| Honest progress | Reported progress reflects physical completion, not effort expended or optimism |
| Same-day holds | Holds recorded on the day work stopped |
| Specific rejections | Rejection comments state what, where, and against which requirement |
| Linked references | Holds and blocked tasks reference the RFI, EI, permit or PR that caused them |
| Current drawings | Tasks reference the current issued revision |
| No orphan work | No site work performed without a corresponding task |

Data quality is measured monthly and reported by project. Persistent failure is a performance matter, not an IT matter.

---

## 14. Escalation Path

```text
Task overdue / blocked
   → Assignee acts within 1 day
   → Site Supervisor within 2 days
   → Discipline Manager within 3 days
   → Project Manager within 5 days
   → Project Director beyond 5 days, or immediately if critical path
```

| Trigger | Immediate Escalation To |
|---|---|
| Safety-related hold | HSE Manager and PM, immediately |
| Critical path task overdue | PM and Project Director, same day |
| Hold open beyond 5 days | Project Director |
| Approval pending beyond 3 days | Manager of the approver |
| Repeated rejections (3+) on one task | Discipline Manager and QA Manager |
| Suspected falsified progress or evidence | Project Director and Company Admin, immediately |

---

## 15. Prohibited Practices

| Practice | Why It Is Prohibited |
|---|---|
| Entering progress for work not yet performed | Falsifies progress, cost and claims; may constitute fraud in a payment context |
| Reusing photographs from another location or date | Destroys the evidential value of the entire photographic record |
| Recording holds retrospectively at month-end to build a claim | Contemporaneity is what makes records credible; retrospective records invite challenge |
| Bypassing a blocked start without an authorised override | Removes the protection the sequence exists to provide |
| Approving work not physically verified | Transfers unverified work into the certified position |
| Managing tasks in parallel on a private spreadsheet | Creates two versions of the truth and defeats the purpose of the platform |
| Sharing login credentials | Destroys accountability and audit integrity; a disciplinary matter |
| Requesting database-level edits to "clean up" records | Bypasses the audit trail |

---

## 16. Records and Retention

| Record | Retention |
|---|---|
| Task record and status history | Project duration + 10 years |
| Progress logs | Project duration + 10 years |
| Site photographs | Project duration + 10 years (latent defect exposure) |
| Resource logs | Project duration + 7 years (payroll and claims) |
| Delay register extracts | Permanent for the project file |
| Monthly measurement extracts | Per financial retention policy (7–10 years) |

---

## 17. Related Documents

| Code | Title |
|---|---|
| DCOS-M04-BRD-001 | Business Requirement |
| DCOS-M04-FS-001 | Functional Specification |
| DCOS-M04-UX-001 | UI/UX Design |
| DCOS-M04-RBAC-001 | RBAC Matrix |
| DCOS-M04-TRN-001 | Training Guide |
| DCOS-M06-SOP-001 | WBS Management SOP |
| DCOS-M27-SOP-001 | QA/QC Inspection SOP |
| DCOS-M28-SOP-001 | HSE Permit SOP |

---

**End of Document — DCOS-M04-SOP-001**
