# SOP-PLN-001.md

# Digital Construction Operating System (DCOS)

## Standard Operating Procedure (SOP)

## Planning & Scheduling Management

Document No: DCOS-SOP-PLN-001
Version: 1.0
Status: Approved
Owner: Planning Manager
Effective Date: TBD

---

# 1. Purpose

This procedure establishes the standard process for:

* Creating and managing project schedules
* Setting and protecting baselines
* Measuring and reporting progress
* Managing critical path and float
* Tracking delays and supporting EOT claims
* Providing lookahead planning for execution

within DCOS.

The objective is to provide a single authoritative time-control engine for all projects.

---

# 2. Scope

This SOP applies to:

```text
Building Projects

Infrastructure Projects

Industrial Projects

Design Projects

Maintenance Projects

Internal Projects
```

All activities must be linked to the project schedule within DCOS.

---

# 3. Objectives

The Planning & Scheduling module shall provide:

### Time Control

Project execution within approved schedule.

---

### Visibility

Schedule status visible to all stakeholders in real time.

---

### Accountability

Activity ownership assigned at task level.

---

### Early Warning

SPI alerts, float alerts, and delay detection before impact.

---

### Claims Support

Accurate records of delays, baselines, and critical path for EOT analysis.

---

# 4. Planning Philosophy

```text
Project
   ↓
WBS
   ↓
Activity
   ↓
Schedule
   ↓
Progress
   ↓
Forecast
```

Scheduling does not create work.

Scheduling controls when work happens.

---

# 5. Roles and Responsibilities

## RACI Matrix

| Action | Planning Manager | Project Manager | Engineer | Executive |
|--------|-----------------|-----------------|----------|-----------|
| Create Schedule | R | A | C | I |
| Set Baseline | R | A | I | I |
| Update Progress | C | A | R | I |
| Approve Baseline | C | R/A | I | I |
| Rebaseline Request | R | A | I | I |
| Approve Rebaseline | C | A | I | I |
| Log Delay | R | A | C | I |
| Classify Delay Type | R | A | C | I |
| EOT Submission | R | A | C | I |
| View Schedule | R | R | R | R |

**R = Responsible, A = Accountable, C = Consulted, I = Informed**

---

# 6. Activity Naming Convention

## Activity ID Format

```text
ACT-[DISCIPLINE]-[NNNN]
```

Examples:

```text
ACT-STR-0001   Structural Steel Erection Level 5
ACT-ARC-0042   Curtain Wall Installation Zone A
ACT-MEP-0103   HVAC Ductwork Level 3
ACT-FIN-0201   Floor Tiling Lobby
```

---

## Activity Name Format

```text
[Action] [Element] [Location]
```

Examples:

```text
Install Rebar B2 Slab

Pour Concrete L05 Zone A

Fix Drywall Tower A Level 12
```

---

# 7. Schedule Levels

## Level 1 — Executive Schedule

Audience: Portfolio / Board

Duration scale: Months

Shows: Major phases and milestones only

---

## Level 2 — Master Schedule

Audience: Project Manager, Client

Duration scale: Weeks to months

Shows: All WBS phases and key activities

---

## Level 3 — Control Schedule

Audience: Planning Manager

Duration scale: Weeks

Shows: All activities with dependencies and resources

---

## Level 4 — Detailed Schedule

Audience: Department Managers, Site Teams

Duration scale: Days

Shows: Individual task-level activities

---

## Level 5 — Lookahead Schedule

Audience: Foremen, Engineers

Duration scale: 1–6 weeks

Shows: Upcoming tasks, constraints, assignments

---

# 8. Activity Status

| Status | Description | Progress |
|--------|-------------|----------|
| Not Started | Planned, not begun | 0% |
| In Progress | Work underway | 1–99% |
| Completed | Work finished | 100% |
| Delayed | Behind baseline | Any |
| On Hold | Suspended | Frozen |
| Cancelled | Removed from scope | N/A |

---

## Status Transition Rules

```text
Not Started
    ↓ (Engineer starts work)
In Progress
    ↓ (Engineer updates to 100%)
Completed
    ↓ (PM verifies)
[Closed in WBS]
```

Authorization:

```text
Not Started → In Progress:   Engineer
In Progress → Completed:     Engineer + PM review
Completed → Closed:          Planning Manager
Any → On Hold:               Project Manager
Any → Cancelled:             Project Manager (approval required)
```

---

# 9. Dependency Types

## Finish to Start (FS)

Successor starts after predecessor finishes.

Most common relationship.

---

## Start to Start (SS)

Successor starts after predecessor starts.

---

## Finish to Finish (FF)

Successor finishes after predecessor finishes.

---

## Start to Finish (SF)

Successor finishes after predecessor starts.

Rare.

---

## Lag and Lead

Lag: Positive delay between activities.

```text
Concrete Pour → [7 day lag] → Formwork Removal
```

Lead: Negative lag (overlap).

```text
MEP Rough-in → [-3 day lead] → Drywall
```

---

# 10. Baseline Management

## Definition

The baseline is the approved original schedule, frozen at project start.

---

## Rules

✓ Baseline cannot be modified after approval.

✓ All current schedule changes are tracked as variance against baseline.

✓ A new baseline requires formal approval.

✓ Old baselines are archived (not deleted).

---

## Baseline Setting Procedure

```text
Schedule Complete
      ↓
Internal Review (Planning Manager)
      ↓
PM Review and Sign-off
      ↓
Client Approval (if contractually required)
      ↓
Baseline Frozen in DCOS
      ↓
Snapshot Captured
```

---

## Rebaseline Procedure

Required when:

```text
Scope Change Approved

Force Majeure Event

Client-Approved Extension of Time
```

Process:

```text
Rebaseline Request (Planning Manager)
      ↓
PM Approval
      ↓
Client Notification
      ↓
New Baseline Set in DCOS
      ↓
Previous Baseline Archived
```

---

# 11. Critical Path Management

The system calculates:

```text
Early Start (ES)
Early Finish (EF)
Late Start (LS)
Late Finish (LF)
Total Float
Free Float
```

---

## Critical Activity

```text
Total Float = 0 days
```

Displayed in red in Gantt chart.

---

## Near Critical Activity

```text
Total Float ≤ 5 days
```

Monitor closely.

---

## Float Alert

System triggers alert when:

```text
Any activity reaches Total Float = 0
```

Notifies: Planning Manager, Project Manager.

---

# 12. Progress Measurement Methods

## Physical Progress

```text
Completed Quantity ÷ Total Quantity × 100%
```

Used for: Earthworks, concrete pours, piping, cabling.

---

## Weighted Progress

```text
Σ (Activity Weight × Activity Progress) ÷ Σ Weights
```

Used for: Multi-activity WBS rollup.

Weights based on: Budget cost or planned hours.

---

## Milestone Progress

```text
0% (Not reached) or 100% (Achieved)
```

Used for: Contract milestones, inspections, approvals.

---

## Progress Rollup

```text
Task
 ↓ (weighted by budget_cost)
WBS Node
 ↓
Project
```

Automatic. Calculated by DCOS on each progress update.

---

# 13. Data Date

The Data Date (also called Time Now or Status Date) is the cutoff date for progress reporting.

All progress recorded as of the Data Date.

Future activities are planned from the Data Date.

---

## Data Date Update Cycle

```text
Weekly update cycle (every Monday)

Progress collected: Friday–Sunday

Data Date set: Monday morning

Forecast recalculated: Monday
```

---

# 14. Lookahead Planning

## 2-Week Lookahead

Daily planning for immediate execution.

---

## 4-Week Lookahead

Standard operational lookahead. Recommended.

---

## 6-Week Lookahead

Strategic lookahead. Used for procurement and resource planning.

---

## Constraint Management

Track:

```text
Drawing Not Approved → Responsible: Design Manager

Material Not Delivered → Responsible: Procurement Manager

RFI Outstanding → Responsible: Engineer

Inspection Pending → Responsible: QA Manager

Access Not Available → Responsible: Site Manager
```

Each constraint: Owner assigned, resolution date tracked.

---

# 15. Delay Management

## Delay Types

| Type | Description | Time Entitlement | Cost Entitlement |
|------|-------------|------------------|------------------|
| Excusable | Beyond contractor control (weather, force majeure) | Yes | No |
| Non-Excusable | Contractor fault | No | No |
| Compensable | Client-caused delay | Yes | Yes |
| Non-Compensable | Third party, not client | Yes | No |

---

## Delay Register Fields

```text
Delay Code (auto: DLY-001)
Description
Linked Task
Delay Type
Cause
Responsible Party
Start Date
Finish Date
Impact Days (auto-calculated)
Status (Open / Resolved / Disputed)
Notes
```

---

## Delay Classification Procedure

```text
Delay Detected
      ↓
Engineer Logs in Delay Register
      ↓
Planning Manager Reviews and Classifies Type
      ↓
PM Approves Classification
      ↓
EOT Assessment (if excusable or compensable)
```

---

# 16. Forecasting

## Forecast Finish Date

```text
Forecast Finish = Data Date + (Remaining Duration ÷ Current Productivity)
```

---

## SPI-Based Forecast

```text
Forecast Finish = Baseline Finish + (Delay Days ÷ SPI)
```

---

## Forecast KPIs

```text
Forecast Finish Date
Forecast Duration (remaining days)
Forecast Cost Impact
SPI (Schedule Performance Index)
```

---

# 17. Schedule KPIs

## SPI (Schedule Performance Index)

```text
SPI = Earned Value ÷ Planned Value
```

| SPI | Meaning |
|-----|---------|
| ≥ 1.0 | Ahead of or on schedule |
| 0.9–1.0 | Minor delay — monitor |
| < 0.9 | Significant delay — action required |

---

## SPI Alert

System triggers alert when:

```text
SPI < 0.9
```

Notifies: Planning Manager, Project Manager.

---

## Schedule Variance (SV)

```text
SV = Earned Value – Planned Value
```

Negative = behind schedule.

---

## Delay Days

```text
Delay Days = Forecast Finish – Baseline Finish
```

---

# 18. EOT Support

DCOS supports EOT analysis with:

```text
Delay Register Records

Delay Event Dates and Impact

Baseline Schedule

Current Schedule Updates

Critical Path History

As-Planned vs As-Built Comparison
```

---

## EOT Methodologies Supported

```text
Time Impact Analysis (TIA)

Window Analysis

As-Planned vs As-Built
```

---

# 19. Permissions

| Action | Planning Manager | Project Manager | Engineer | Executive |
|--------|-----------------|-----------------|----------|-----------|
| View Schedule | ✓ | ✓ | ✓ | ✓ |
| Create Activity | ✓ | — | — | — |
| Edit Activity | ✓ | — | — | — |
| Update Progress | ✓ | ✓ | ✓ | — |
| Set Baseline | ✓ | Approve only | — | — |
| Log Delay | ✓ | ✓ | ✓ | — |
| Delete Activity | ✓ | — | — | — |
| Approve Rebaseline | — | ✓ | — | — |

---

# 20. Notifications

System auto-notifies on:

```text
SPI < 0.9 → Planning Manager, Project Manager

Total Float = 0 → Planning Manager, Project Manager

Delay Logged → Planning Manager, Project Manager

Baseline Set → All Stakeholders

Milestone Reached → PM, Executive

Milestone Overdue → Planning Manager, PM
```

Channels:

```text
In-App Alert

Email (if enabled in user preferences)

Telegram (if configured)
```

---

# 21. Audit Requirements

Log all:

```text
Schedule Created

Activity Added or Modified

Baseline Set

Progress Updated

Delay Logged

Rebaseline Approved

Constraint Added or Resolved
```

Audit logs cannot be deleted.

---

# 22. Database Tables

## wbs_tasks (scheduling fields)

```text
start_date
end_date
baseline_start_date
baseline_finish_date
dependency_task_ids (array)
dependency_types (array)
dependency_lag_days (array)
constraint_type
constraint_date
is_milestone
progress
delay_status
delay_reason
```

---

## plan_calendars

```text
id
project_id
name
monday–sunday (boolean flags)
is_default
```

---

## plan_calendar_exceptions

```text
id
calendar_id
exception_date
is_working
reason
```

---

## delay_register

```text
id
project_id
wbs_task_id
delay_code
description
delay_type
cause
responsible_party
start_date
finish_date
impact_days (computed)
status
```

---

## progress_snapshots

```text
id
project_id
snapshot_date
planned_progress
actual_progress
planned_cost
actual_cost
```

---

# 23. API Endpoints

```text
GET     /wbs-tasks?project_id=X             List all tasks for project
POST    /wbs-tasks                           Create task
PUT     /wbs-tasks/:id                       Update task / progress
GET     /rpc/get_critical_path_tasks         CPM calculation
GET     /rpc/get_schedule_variance           Baseline vs actual
GET     /rpc/get_lookahead_tasks             Rolling lookahead
POST    /rpc/set_project_baseline            Freeze baseline
POST    /rpc/capture_progress_snapshot       Snapshot S-curve
GET     /delay-register?project_id=X        List delay events
POST    /delay-register                      Log delay event
PUT     /delay-register/:id                  Update delay status
GET     /plan-calendars?project_id=X        List calendars
POST    /plan-calendars                      Create calendar
```

---

# 24. Common Mistakes

Avoid:

```text
Setting baseline before schedule is complete

Updating baseline without PM approval

Not linking tasks to correct WBS node

Entering progress without updating delay_status

Logging delays without classifying type

Skipping Data Date update (causes stale forecasts)

Using task progress instead of physical quantities for earthworks
```

---

# 25. Definition of Done

Planning module is complete for a project when:

✓ All WBS activities have scheduled dates

✓ Dependencies configured for all successor activities

✓ Baseline set and approved

✓ Calendars configured (work days, holidays)

✓ Progress rollup enabled and tested

✓ Lookahead available (4-week minimum)

✓ Delay Register active

✓ Forecast visible on dashboard

✓ SPI/EVM dashboard displaying data

✓ Notifications configured for Planning Manager and PM

---

# 26. Future Enhancements

```text
Primavera P6 Import / Export

MS Project Integration

4D BIM Schedule Simulation

AI Delay Prediction

Monte Carlo Risk Analysis

Resource Leveling Algorithm

Digital Twin Scheduling
```

---

# 27. Final Statement

Planning & Scheduling is the time control engine of DCOS.

Tasks execute work.

WBS organizes work.

Documents support work.

Procurement supplies work.

Construction performs work.

Planning controls when work happens, measures whether it is on time, and predicts whether the project will finish on schedule.

Without Planning, there is no project control.
