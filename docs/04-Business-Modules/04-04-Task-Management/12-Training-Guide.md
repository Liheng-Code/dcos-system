# DCOS — Module 04: Task Management
## 12 — Training Guide

| Field | Value |
|---|---|
| Document Code | DCOS-M04-TRN-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Audience | All DCOS users, by role |
| Delivery | Classroom + hands-on sandbox + on-site coaching |

---

## 1. Training Philosophy

Construction software fails on adoption, not on features. This programme is built on three rules:

1. **Train on the real project, not a demo.** Users learn on their own WBS, their own drawings, their own crew names.
2. **Train the field first.** If site engineers do not update tasks, no management dashboard has any value. Office training follows field training, not the other way round.
3. **Train to competence, not to attendance.** Every course ends with a practical exercise the trainee must complete unaided.

---

## 2. Training Paths

| Path | Audience | Duration | Prerequisite |
|---|---|---|---|
| **T1 — Field Execution** | Site Engineer, Foreman, Subcontractor user | 2.5 h | DCOS login, mobile app installed |
| **T2 — Site Supervision** | Site Supervisor, Section Engineer | 3.5 h | T1 |
| **T3 — Discipline Management** | Discipline Manager, BIM Coordinator, QA/QC, HSE | 3 h | T1 |
| **T4 — Project Control** | Project Manager, Planner | 4 h | T2, T3 |
| **T5 — Commercial Use** | QS, Cost Engineer, Contracts | 2.5 h | T1 |
| **T6 — Executive View** | Project Director, Company Admin | 1.5 h | — |
| **T7 — System Configuration** | Company Admin, System Owner | 3 h | T4 |
| **T8 — External Users** | Subcontractor, Client, Consultant | 1 h | — |

---

## 3. T1 — Field Execution (2.5 hours)

**Objective:** the trainee can receive, start, progress, evidence, hold and submit a task on a mobile device, offline, without help.

### Module T1.1 — Why tasks exist (20 min)

- Where a task sits: Project → Building → Level → Zone → Task.
- What the task record proves later: what was built, when, by whom, against which drawing, with what evidence.
- Real example: a dispute resolved (or lost) on the strength of a progress record.

**Key message:** *"The task is not paperwork. It is the receipt for your work."*

### Module T1.2 — Your task list (20 min)

Hands-on: open **My Tasks**; identify Overdue, Due Today, Blocked, Rejected groups; read a task card — code, WBS path, due date, progress, flags.

### Module T1.3 — Starting work (20 min)

Hands-on: start a task; encounter a blocked start deliberately and read the blocker list; check the drawing revision; check a permit-gated task.

**Key message:** *"If the system blocks the start, there is a reason. Fix the reason — do not build anyway."*

### Module T1.4 — Recording progress (40 min) — *the most important module*

Hands-on, outdoors if possible:

1. Open a quantity-based task; enter today's actual quantity, not a guess at a percentage.
2. Take three photographs through the app — show what the photos must actually depict.
3. Add a note written for a stranger reading it in two years.
4. Save while in airplane mode; watch the Pending indicator; reconnect; watch it Sync.

**Practice drill:** each trainee records progress on 3 real tasks under 60 seconds each.

### Module T1.5 — When work stops (20 min)

Hands-on: place a task on hold; choose the correct reason; set the responsible party; link the RFI; attach a photo; resume it.

**Key message:** *"A hold recorded today is evidence. A hold remembered next month is an argument."*

### Module T1.6 — Completing and submitting (20 min)

Hands-on: complete a checklist; hit an evidence-required block deliberately; attach photos; submit; receive a rejection; read it; correct; resubmit.

### Module T1.7 — Offline working (20 min)

Airplane-mode drill: 5 updates offline, restart the app, confirm the queue survived, reconnect, confirm all synced. Cover the sync centre and what a failed sync looks like.

### T1 Assessment

| # | Task | Pass Criterion |
|---|---|---|
| 1 | Start an assigned task | Correct task, gates checked |
| 2 | Record quantity progress with 3 photos and a note, offline | Completed under 90 s, data survives restart |
| 3 | Place a task on hold with the correct reason and a linked RFI | Correct reason and responsible party |
| 4 | Complete a checklist and submit | Blocked correctly when evidence missing, then submitted |
| 5 | Explain what happens to a rejected task | Correct answer unaided |

---

## 4. T2 — Site Supervision (3.5 hours)

**Objective:** the supervisor can issue a week's work, verify submissions, run the daily close-out, and manage delay records.

| Module | Content | Hands-On |
|---|---|---|
| T2.1 Issuing work (45 min) | Task sizing (one crew, one location, one work type, 1–10 days), templates, bulk generation with preview | Generate a week's tasks for a real zone |
| T2.2 Assignment and workload (30 min) | Assign, reassign with reason, read the workload warning, balance a crew | Rebalance an overloaded engineer |
| T2.3 Dependencies in practice (30 min) | Recording real sequence, hard vs soft, notify predecessors, when *not* to override | Build a 6-task slab cycle chain |
| T2.4 Daily verification (45 min) | Reviewing evidence, approving with a verification basis, rejecting specifically, raising NCRs from rejection | Approve 5 and reject 3 submissions with acceptable comments |
| T2.5 Delay management (30 min) | Reviewing open holds, chasing blockers, escalation | Clear a stale hold list |
| T2.6 Daily close-out routine (30 min) | The 15-minute end-of-day discipline: approvals cleared, resources logged, tomorrow's list confirmed | Full close-out simulation |

### T2 Assessment

Issue 10 tasks with correct WBS, dates, dependencies and gates; verify and decide on 8 submissions with defensible comments; produce the open-hold list and state the action for each.

---

## 5. T3 — Discipline Management (3 hours)

| Module | Content |
|---|---|
| T3.1 | Discipline workspace: filtering to your discipline across the whole project |
| T3.2 | Design deliverable tasks: drawing production, internal check, external review, comment incorporation |
| T3.3 | Cross-discipline dependencies: ARC opening ↔ STR ↔ MEP sleeve coordination |
| T3.4 | Approval discipline: clearing the Action Required inbox daily, delegation before leave |
| T3.5 | Workload and turnaround: reading the workload and approval-latency reports |
| T3.6 | Quality signals: rejection and rework reports — reading them as process feedback, not blame |
| T3.7 | For QA/QC and HSE: inspection request handling, failed inspection → NCR → rework loop; permit-gated tasks and safety holds |

**Assessment:** manage a simulated week — 40 tasks, 12 submissions, 3 rejections with NCRs, 2 holds, one delegation set up correctly.

---

## 6. T4 — Project Control (4 hours)

| Module | Content |
|---|---|
| T4.1 | Project task setup: numbering, roll-up weighting, calendar, templates, gates, approval routes (SOP-TM-01 walkthrough) |
| T4.2 | Bulk generation at scale — with the preview discipline drilled hard |
| T4.3 | Progress roll-up mechanics: how a task percentage becomes a project percentage, and why the weighting choice matters commercially |
| T4.4 | Reading the control set: late register, delay register, aging, approval latency, blocked tasks, critical path status |
| T4.5 | Overrides, cancellations and reopening: when each is appropriate and what each costs in audit terms |
| T4.6 | Weekly management review (SOP-TM-08) run as a live meeting simulation |
| T4.7 | Adoption management: spotting the project where tasks are created but never updated, and fixing it early |

**Assessment:** set up a new project end-to-end; generate a 3-week look-ahead; run a full weekly review from live reports; produce a delay register and state the notice position for two events.

---

## 7. T5 — Commercial Use (2.5 hours)

| Module | Content |
|---|---|
| T5.1 | Reading task quantities: what is approved, what is claimable, what is not |
| T5.2 | Month-end close: cut-off discipline, reconciliation, variance investigation (SOP-TM-09) |
| T5.3 | The delay register as claim evidence: reason codes, responsible parties, linked references, critical path flags |
| T5.4 | Productivity and man-hours: reading output per man-hour, understanding rework cost |
| T5.5 | Rework and back-charges: identifying subcontractor-attributable rework |
| T5.6 | What weakens a claim: retrospective holds, generic reasons, missing links, photographs without context |

**Assessment:** produce a month-end measurement extract and a period delay register; identify three weaknesses in a deliberately flawed sample register.

---

## 8. T6 — Executive View (1.5 hours)

| Module | Content |
|---|---|
| T6.1 | Portfolio dashboard: progress, late exposure, held work, critical path status across projects |
| T6.2 | Reading the signals: approval latency (management is the bottleneck), override frequency (planning is wrong), hold ageing (blockers are not being cleared) |
| T6.3 | Data trust: how to tell whether a project's numbers are real — update frequency, evidence rate, correction rate |
| T6.4 | Escalations that reach you and what to do with them |

**Key message:** *"A green dashboard from a project where nobody updates tasks is worse than no dashboard."*

---

## 9. T7 — System Configuration (3 hours)

| Module | Content |
|---|---|
| T7.1 | Task types and gates: inspection, permit, drawing, method statement, photo minimums |
| T7.2 | Hold reason master: codes, responsible-party defaults, claimability — configured with Contracts, not alone |
| T7.3 | Task templates: building a reusable slab cycle, fit-out sequence, MEP first-fix |
| T7.4 | Numbering patterns and project settings |
| T7.5 | Approval templates and delegation rules |
| T7.6 | Notification rules for task events, and how not to create alert fatigue |
| T7.7 | Roles and permissions for task actions; separation of duty |
| T7.8 | What must never be changed mid-project: roll-up weighting, numbering pattern, WBS depth strategy |

**Assessment:** configure a complete task-type set with gates, three templates, and an approval route for a new project; explain the impact of each choice.

---

## 10. T8 — External Users (1 hour)

### Subcontractor (45 min)

- Logging in and finding your assigned scope only.
- Updating progress with evidence.
- Submitting for the main contractor's verification.
- Understanding that rejections and rework are recorded and may affect payment and performance scoring.
- What you cannot see and why.

### Client / Consultant (30 min)

- Viewing project and WBS progress.
- Where you appear as an approver and what your decision means contractually.
- Reading the evidence attached to a submission.
- What is not visible to you (costs, internal comments, resource data, subcontractor identity).

---

## 11. Quick Reference Cards

### Card A — Site Engineer, Daily Rhythm

```text
MORNING
 □ Open My Tasks
 □ Check Blocked / On Hold / Rejected
 □ Start today's tasks (resolve any blocker first)
 □ Confirm drawing revision + permit

DURING
 □ Photograph as you go, through the app
 □ Stop work? Record the hold TODAY

END OF DAY
 □ Update progress on every task worked
 □ Log manpower / equipment / material
 □ Write a note someone can read in 2 years
 □ Check sync = Synced before leaving coverage
```

### Card B — Supervisor, End of Shift

```text
 □ Action Required inbox = zero
 □ Verify before approving (you are signing for it)
 □ Reject specifically: what, where, against what
 □ Review open holds — anything over 5 days?
 □ Confirm tomorrow's list is assigned
```

### Card C — Status Meanings

| Status | Means |
|---|---|
| Assigned | Yours, not started |
| In Progress | Started, work ongoing |
| On Hold | Stopped, reason recorded |
| Completed | Work finished, not yet submitted |
| Submitted | Waiting for approval |
| Rejected | Needs rework — read the reason |
| Approved | Verified by your supervisor |
| Closed | Finished and locked |

### Card D — Choosing a Hold Reason

| If work stopped because… | Use |
|---|---|
| Drawing or information missing | HR-DES |
| Waiting for an RFI answer | HR-RFI |
| Material not on site | HR-MAT |
| Equipment down or unavailable | HR-EQP |
| Not enough workers | HR-LAB |
| Cannot get access to the area | HR-ACC |
| Rain, wind, flood | HR-WTH |
| Waiting for authority approval | HR-APP |
| Permit not issued | HR-PMT |
| Waiting for inspection | HR-INS |
| Waiting for a variation instruction | HR-VAR |
| Safety stoppage | HR-SAF |

---

## 12. Common Mistakes and Corrections

| Mistake | Why It Matters | Correct Practice |
|---|---|---|
| Updating a week's progress on Friday | Dates become wrong; delay evidence is lost | Update daily |
| Entering a percentage instead of the actual quantity | Progress becomes opinion; measurement breaks | Enter actual quantity on quantity tasks |
| One photo of the whole site | Proves nothing about the specific work | Photograph the actual work, close enough to identify it |
| "Waiting for client" as a free-text note instead of a hold | No delay record, no claim | Record a hold with the correct code and link |
| Approving without seeing the work | Transfers unverified work into the certified position | Verify, then approve with the basis stated |
| "Rejected — not good" | Assignee cannot act; the loop repeats | State what, where, and against which requirement |
| Creating one giant task for a whole floor | Progress becomes guesswork | One crew, one location, one work type, 1–10 days |
| Overriding a blocked start routinely | The sequence protection stops meaning anything | Escalate; fix the programme logic |
| Keeping a private spreadsheet in parallel | Two versions of the truth | Use the system; report gaps so they get fixed |
| Sharing a login | Destroys accountability; disciplinary matter | Own account, always |

---

## 13. Frequently Asked Questions

**"I have no signal on site — do I lose my work?"**
No. Everything you enter is saved on the device first. The card shows Pending until it syncs. Stay in the app until it shows Synced when you get coverage; if you close the app, the queue is still there.

**"The system blocked my start. Can I just build it anyway?"**
Build it if it is safe and instructed — but resolve the block in the system first, or record the reason. Work performed against a blocked task with no record is work you cannot prove and may not be paid for.

**"My supervisor rejected my task and I disagree."**
Respond in the comment thread with facts and photographs. If it remains unresolved, escalate to the Discipline Manager. Do not resubmit unchanged.

**"Can I delete a task I created by mistake?"**
Only while it is still a Draft. Once it has been published or worked on, cancel it with a reason. Nothing that recorded real work is ever deleted.

**"Why do I have to enter both quantity and photos?"**
The quantity is for measurement and payment. The photos are for proof. One without the other is weak in a dispute.

**"Someone else did the work — can I enter it for them?"**
A supervisor may enter on behalf of a crew and must say so in the note. An office user entering site progress they did not witness is a control failure.

**"Why can't I approve my own task?"**
Because a single person cannot both perform and certify work. It protects you as much as the company.

**"The progress percentage looks wrong at Level 05."**
Roll-up is weighted — usually by cost or duration — so a large task moves the number more than a small one. Ask your PM which weighting the project uses; it is set once and locked.

---

## 14. Trainer Notes

| Point | Guidance |
|---|---|
| Sandbox | Every trainee gets a sandbox project mirroring their real WBS. Never train on live data. |
| Devices | Trainees use their own phones. If the app will not run on a trainee's device, that is a deployment finding, not a training problem. |
| Language | Deliver field training in Khmer with English terminology introduced for the system labels. Quick reference cards printed bilingually and laminated. |
| Literacy and confidence | Some field staff will be unfamiliar with app workflows. Pair them; allow a second session; never single anyone out. |
| Timing | Train the site team no more than one week before go-live on their project. Training three months early is training wasted. |
| Reinforcement | Trainer on site for the first 5 working days after go-live, walking the site during end-of-day updates. |
| Refresher | 30-minute refresher after 1 month, targeted at the mistakes actually observed in the data. |

---

## 15. Competency Record

| Field | Value |
|---|---|
| Trainee name / ID | |
| Role and project | |
| Course completed | T1 / T2 / T3 / T4 / T5 / T6 / T7 / T8 |
| Date and trainer | |
| Assessment result | Competent / Requires further coaching |
| Areas for reinforcement | |
| Re-assessment date (if required) | |

Competency records are held by HR and linked to the user's DCOS profile. Certain permissions — bulk generation, dependency override, task configuration — are granted only after the corresponding course is passed.

---

## 16. Post-Training Support

| Channel | Use |
|---|---|
| In-app help and tooltips | Immediate, contextual |
| Quick reference cards (laminated, site office) | Daily reminders |
| Project super-user (one per project) | First line of support — a peer, not a helpdesk |
| Telegram support group | Fast questions during working hours |
| Support ticket | Defects and access problems |
| Monthly user forum | Feedback into the product backlog — users see their suggestions implemented, which sustains adoption |

---

**End of Document — DCOS-M04-TRN-001**
