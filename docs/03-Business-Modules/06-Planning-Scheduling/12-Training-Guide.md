# 12 — Training Guide
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/12-Training-Guide.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Status: Draft
Version: 1.0
Date: 2026-06-14

---

## Purpose and Audience

This guide is for all project team members who will use the PLN module. It is structured by role.
Each section covers the screens you will use, the actions you can take, and what to do when
things go wrong.

**Roles covered:**
- Planner / Scheduler (full module)
- Project Manager (dashboard, approval, monitoring)
- Site Engineer (progress submission only)
- Construction Manager (lookahead, read-only)
- QS / Commercial Manager (IPC progress reading)
- Client / PMC Representative (client portal)

---

## Section 1: Getting Started (All Roles)

### 1.1 Navigating to the PLN Module

1. Log in to DCOS at your organisation's DCOS URL.
2. Select your project from the project selector (top of sidebar or dashboard landing page).
3. In the left sidebar, find "Planning" under the Project Control section. Click it.
4. You will land on the Programme List (PLN-01).

If you do not see "Planning" in the sidebar, your role does not have access to this module on
this project. Contact your Project Administrator.

### 1.2 Understanding Programme Status

The programme's status badge tells you where it is in the review cycle:

| Badge colour | Status | Meaning |
|---|---|---|
| Grey | Draft | Being built. Not yet submitted. |
| Amber | Submitted | Under review (internal or client). |
| Blue | Active | The working programme. Progress is being tracked. |
| Green | Approved | Approved by client. |
| Muted | Archived | Closed. Read-only. |

---

## Section 2: Planner — Full Module Training

### 2.1 Creating a New Programme

1. On PLN-01 (Programme List), click "New Programme".
2. Fill in: Programme Name, Type (select Master), Contract Start Date, Contract End Date.
3. Click Create. You are taken to PLN-02 (Programme Dashboard).
4. The programme is in Draft status. You must now add activities.

### 2.2 Building Activities in the Gantt View

1. From PLN-02, click "View Gantt" → PLN-03.
2. Click "Add Activity" in the toolbar.
3. Enter: Activity Code (unique), Activity Name, Planned Start, Planned Finish, Responsible Party.
4. The duration is calculated automatically from the dates using the project calendar.
5. Click Save. The activity appears in the Gantt list.
6. Repeat for all activities. Use the indent controls to nest activities under summary bands.

**Tip:** Order your activities logically top-to-bottom. The Gantt will display them in `sort_order`. You can drag rows to reorder.

### 2.3 Adding Dependencies

1. In PLN-03, click an activity to open PLN-04 (Activity Detail Sheet).
2. Go to the "Dependencies" section (bottom of Details tab).
3. Click "Add Predecessor". Select the predecessor activity from the dropdown.
4. Select the dependency type (FS is the default and most common).
5. Enter lag_days if applicable (positive = delay; negative = lead time).
6. Click Add. The dependency is validated for cycles immediately.
7. If you see a "Circular Dependency" error, you have connected activities in a loop. Review your logic.

**Critical Path:** After adding all dependencies, the system calculates the critical path automatically. Red bars in the Gantt are on the critical path (total float = 0). Review these carefully — any delay on a red activity delays the project end date.

### 2.4 Setting the Contract Baseline

This is the most important action in the module. Do it once, correctly.

1. Go to PLN-02 → "Baselines" → "Set Contract Baseline".
2. Enter baseline name: recommend format "Contract Baseline - [Project Ref] - [Date]".
3. Click Create. The system captures a snapshot of all activities.
4. You cannot change the contract baseline after this point. If there is an error, contact your Project Administrator.

### 2.5 Reviewing and Confirming Progress Updates

1. Go to PLN-05 (Progress Review): PLN-02 → "Review Progress".
2. You will see a table of all pending updates from Site Engineers.
3. For each row:
   - Compare the submitted % against your site inspection records.
   - Click "Confirm" if accurate.
   - Click "Reject" if inaccurate — you must enter a rejection reason.
4. After reviewing all updates, click "Advance Data Date". Enter the cut-off date for this reporting period.
5. Confirm. The S-curve will update and CPM will re-run.

**What happens after advancing the date:**
- The programme dashboard updates with new planned vs actual figures.
- Any activities whose float has dropped to 0 trigger a Critical Path Change alert.
- A monthly progress report is auto-generated.

### 2.6 Submitting the Programme for Approval

1. From PLN-02, click the status badge → Programme Actions → Submit for Internal Review.
2. The PM receives a notification.
3. After PM approves: repeat → Submit to Client.
4. Select the baseline to associate with this submission.
5. DCOS creates a transmittal. Hand off to the Document Controller to dispatch.

### 2.7 Creating and Publishing a Lookahead

1. Go to PLN-07 (Lookahead Manager): PLN-02 → "Lookahead".
2. Click "Generate New Lookahead". Select 2-week or 4-week.
3. Review the list of activities in the window.
4. Click "Publish". All Construction Managers and Site Engineers receive the lookahead via in-app notification and email.
5. At end of the window, return here and mark each item complete or incomplete. Click "Close Lookahead" to record the PCR.

### 2.8 Common Planner Mistakes to Avoid

| Mistake | Consequence | How to prevent |
|---|---|---|
| Setting contract baseline before all activities are added | Baseline captures incomplete data; CPM comparison will be wrong | Always add ALL activities and dependencies before setting baseline |
| Advancing data date before confirming all pending updates | Updates remain pending; S-curve does not reflect all progress | Use PLN-05, filter by Pending, ensure 0 pending before advancing |
| Deleting activities that have confirmed IPC references | Blocked by system, but will cause confusion | Cancel the activity (status → cancelled) instead of deleting |
| Raising delay events without linking impacted activities | Float-consumed data is lost; EOT claim support is weakened | Always link all relevant activities when creating the delay event |

---

## Section 3: Project Manager — Monitoring and Approval

### 3.1 Your Daily View

When you log in, navigate to Planning → [Programme Name] → PLN-02 (Dashboard).

Focus on:
- **Schedule Status badge** (top right): On Track / At Risk / Overrun
- **Overdue activities tile** (red number): activities that should have finished but haven't
- **Critical path count**: if this is growing, the programme is in trouble
- **S-curve chart**: is the actual (green) line above or below the planned (blue)?

If you receive a "Critical Path Change" or "Programme Overrun" notification, navigate here immediately and review the Gantt (PLN-03) to understand which activities are affected.

### 3.2 Approving the Programme (Internal Review)

1. You will receive an in-app notification: "Programme submitted for your review."
2. Navigate to PLN-02 → Status Badge → Review.
3. Check: Does the programme make construction sense? Is the critical path logical? Are all contract milestones shown as milestones (diamond shape)?
4. If satisfied: Click Approve.
5. If changes are needed: Click Reject. Enter a clear rejection reason (minimum 20 characters) describing exactly what needs to change. The Planner will be notified.

**Important:** You cannot approve a programme that you submitted. This is a system rule (four-eyes principle). If you are the only person with PM access, assign a second PM user or contact your Administrator.

---

## Section 4: Site Engineer — Submitting Progress

### 4.1 Your Weekly Routine

Every Friday (or as per your project's reporting cycle):

1. Log in to DCOS → Planning → [Programme Name].
2. In the Gantt View (PLN-03), find your assigned activities (filter by Responsible Party = your name, or check with the Planner for your activity list).
3. For each activity where work has occurred this week:
   - Click the activity → PLN-04 opens.
   - Enter the actual progress percentage (e.g., 45 for 45%).
   - If work started for the first time this week: enter the Actual Start Date.
   - If work completed this week: enter 100% and the Actual Finish Date.
   - Add notes if there is anything the Planner should know (material delay, weather, etc.).
   - Click Submit.
4. Your update shows "Pending" until the Planner confirms on Monday.

### 4.2 Common Situations

**"My update was rejected"**
You will receive a notification with the Planner's rejection reason. Read it carefully. Return to PLN-04 for that activity, enter the corrected percentage, and re-submit with a note explaining the correction.

**"I cannot decrease the progress percentage"**
The system does not allow progress to go backward without a formal correction. If you genuinely overclaimed progress last week, speak to the Planner. They can initiate a correction request.

**"I forgot to submit last Friday"**
Submit now. Use last Friday's date as the data_date in your notes. The Planner will confirm with the correct data date when they advance it. Do not assume your update will be included in the current week's data if you submit late.

---

## Section 5: Construction Manager — Lookahead and Monitoring

### 5.1 Reading the Lookahead

Every Monday morning you will receive an in-app notification and email with the current lookahead.

Click the notification or navigate to Planning → Lookahead → [Current Lookahead].

The lookahead shows:
- All activities scheduled to start or finish in the next 2 weeks
- Planned start and finish dates
- Responsible parties

Use this to plan your daily work allocation, material deliveries, and subcontractor coordination.

### 5.2 Marking Lookahead Items Complete

If you have permission to update completion status (check with Planner):
1. Navigate to PLN-07 (Lookahead Manager) → current published lookahead.
2. Tick the checkbox next to activities that have been completed.
3. This feeds the Plan Completion Rate (PCR) metric which the PM monitors.

### 5.3 Read-Only Access

As a Construction Manager, you cannot modify programme activities, dates, or dependencies. If you identify an error or need to request a change, contact the Planner directly. The Planner has authority to modify the programme.

---

## Section 6: QS / Commercial Manager — Reading Progress for IPC

### 6.1 Accessing Progress Data for IPC

You do not enter data in the PLN module. The IPC module reads certified progress directly from PLN.

When preparing an IPC:
1. Navigate to the IPC module → [IPC Application].
2. In the Physical Progress section, click "Refresh from Programme".
3. The IPC module calls the PLN progress API and populates confirmed actual_progress_pct for each WBS-linked activity.
4. Review the figures. If a figure appears wrong, contact the Planner. Only the Planner can correct confirmed progress in PLN.
5. Do not override PLN figures in the IPC without coordinating with the Planner. The audit trail must remain consistent.

### 6.2 Checking the S-Curve

For monthly reports or client meetings:
1. Navigate to Planning → [Programme] → S-Curve (PLN-09).
2. Select the date range and baseline.
3. Export to PDF if needed for the client report package.

---

## Section 7: Client / PMC Representative — Programme Portal

### 7.1 Accessing the Programme

When the contractor submits a programme revision and it is approved, you will receive a notification: "A programme revision has been approved. [Revision name] is now available for your review."

1. Log in to DCOS → Planning → [Programme Name] → Client View.
2. You will see the approved revision only. Draft or internally-approved revisions are not visible.

### 7.2 What You Can See

- The full Gantt chart (read-only)
- Overall planned vs actual progress
- S-curve (planned vs actual)
- Delay events that are "Agreed" or "Under Review"
- Data date and last update information

### 7.3 What You Cannot Do

You cannot enter progress, modify activities, or approve the programme through the portal. All formal approvals go through the transmittal process managed by the Document Controller. If you have comments on the programme, communicate them through the official transmittal response.

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| Activity | A schedulable unit of work with a start date, finish date, and duration |
| Baseline | A saved snapshot of the programme at a specific point in time |
| CPM | Critical Path Method — an algorithm to identify the longest path through the programme |
| Critical Path | The sequence of activities with zero float. Any delay on the critical path delays project completion |
| Data Date | The cut-off date for progress reporting. All actual progress relates to this date |
| Float (Total Float) | The amount of time an activity can be delayed without affecting the project end date |
| FS | Finish-to-Start dependency: successor cannot start until predecessor finishes |
| Lookahead | A short-range (2 or 4 week) filtered view of upcoming planned activities |
| PCR | Plan Completion Rate: the percentage of lookahead activities actually completed in the window |
| Programme | The full construction schedule containing all activities and their relationships |
| S-Curve | A cumulative progress chart over time (planned vs actual) |
| Summary Band | A group bar in the Gantt that represents a collection of child activities |

## Appendix B: Who to Contact

| Issue | Contact |
|---|---|
| Cannot log in | System Administrator |
| Programme dates look wrong | Planner |
| Progress update rejected | Planner |
| IPC progress figure disagreement | Planner + QS (both must agree) |
| Cannot see programme in portal | Document Controller |
| CPM looks wrong / no critical path | Planner |
| Delay event status dispute | PM |
