# 06-Planning-Scheduling.md

# Digital Construction Operating System (DCOS)

## Planning & Scheduling Management Module

Module Code: PLN

Module Name: Planning & Scheduling

Domain: Project Control

Owner: Planning Manager

Priority: Phase 1 Core Module

---

# 1. Purpose

The Planning & Scheduling module provides project time management, progress control, forecasting, resource planning, and delay analysis capabilities.

The module serves as the master scheduling engine for DCOS.

---

# 2. Business Objectives

The module shall:

✓ Plan project execution

✓ Control schedule performance

✓ Forecast project completion

✓ Manage critical activities

✓ Manage resources

✓ Support Extension of Time (EOT)

✓ Support Claims

✓ Support Executive Reporting

---

# 3. Planning Philosophy

DCOS follows:

```text
Project
   ↓
WBS
   ↓
Task
   ↓
Schedule
   ↓
Progress
   ↓
Forecast
```

Scheduling does not create work.

Scheduling controls work.

---

# 4. Planning Architecture

```text
Master Schedule
      │
      ├── Baseline
      ├── Current Schedule
      ├── Lookahead
      ├── Resources
      ├── Progress
      ├── Delays
      └── Forecast
```

---

# 5. Main Submodules

## 5.1 Schedule Management

Purpose:

Manage project schedules.

---

## 5.2 Gantt Management

Purpose:

Visual scheduling.

---

## 5.3 Dependency Management

Purpose:

Activity relationships.

---

## 5.4 Resource Planning

Purpose:

Labor, equipment, materials.

---

## 5.5 Progress Management

Purpose:

Progress tracking.

---

## 5.6 Lookahead Planning

Purpose:

Short-term execution planning.

---

## 5.7 Delay Management

Purpose:

Delay monitoring.

---

## 5.8 Forecasting

Purpose:

Predict future performance.

---

## 5.9 EOT Support

Purpose:

Extension of Time analysis.

---

# 6. Schedule Levels

## Level 1

Executive Schedule

Purpose:

Portfolio reporting.

---

## Level 2

Master Schedule

Purpose:

Project overview.

---

## Level 3

Control Schedule

Purpose:

Project control.

---

## Level 4

Detailed Schedule

Purpose:

Execution planning.

---

## Level 5

Lookahead Schedule

Purpose:

Daily and weekly planning.

---

# 7. Schedule Hierarchy

```text
Project
    ↓
WBS
    ↓
Phase
    ↓
Activity
    ↓
Task
```

---

# 8. Schedule Activity

Activity fields:

```text
Activity ID

Activity Name

WBS

Discipline

Duration

Start Date

Finish Date

Progress

Owner

Status
```

---

# 9. Activity Status

| Status      | Description     |
| ----------- | --------------- |
| Not Started | 0%              |
| In Progress | 1-99%           |
| Completed   | 100%            |
| Delayed     | Behind Schedule |
| On Hold     | Suspended       |
| Cancelled   | Removed         |

---

# 10. Dependency Management

Supported Types:

---

## Finish To Start (FS)

```text
Activity A Finish
      ↓
Activity B Start
```

Most common.

---

## Start To Start (SS)

```text
Activity A Start
      ↓
Activity B Start
```

---

## Finish To Finish (FF)

```text
Activity A Finish
      ↓
Activity B Finish
```

---

## Start To Finish (SF)

```text
Activity A Start
      ↓
Activity B Finish
```

Rare.

---

# 11. Lag & Lead

## Lag

Waiting period.

Example:

```text
Concrete Casting
      ↓
7 Day Lag
      ↓
Formwork Removal
```

---

## Lead

Overlap period.

Example:

```text
Start MEP before ceiling completed
```

---

# 12. Baseline Management

Baseline is:

```text
Approved Original Schedule
```

---

Rules:

Baseline cannot be modified.

---

New baseline requires approval.

---

# 13. Current Schedule

Contains:

```text
Actual Dates

Updated Progress

Forecast Dates

Current Logic
```

---

# 14. Critical Path Management

System calculates:

```text
Critical Activities

Near Critical Activities

Total Float

Free Float
```

---

Critical Activities:

```text
Float = 0
```

---

# 15. Float Management

## Total Float

Available delay before project completion impacted.

---

## Free Float

Available delay before successor impacted.

---

# 16. Resource Planning

Resources:

```text
Labor

Equipment

Materials

Subcontractors
```

---

# 17. Resource Loading

Example:

```text
L05 Slab Casting

Labor = 35

Equipment = 2 Pumps

Concrete = 450m³
```

---

# 18. Resource Histogram

Display:

```text
Labor Demand

Equipment Demand

Material Demand
```

By time.

---

# 19. Progress Measurement

Methods:

---

## Physical Progress

```text
Completed Quantity
÷
Total Quantity
```

---

## Weighted Progress

```text
Activity Weight
×
Progress
```

---

## Milestone Progress

```text
0% or 100%
```

---

# 20. Progress Rollup

```text
Task
 ↓
Activity
 ↓
WBS
 ↓
Project
```

Automatic.

---

# 21. Lookahead Planning

## Weekly Lookahead

Duration:

```text
1 Week
```

---

## Three Week Lookahead

Duration:

```text
3 Weeks
```

---

## Six Week Lookahead

Duration:

```text
6 Weeks
```

Recommended.

---

# 22. Constraint Management

Track:

```text
Drawing Not Approved

Material Not Delivered

RFI Outstanding

Inspection Pending

Access Not Available
```

---

# 23. Delay Management

Delay types:

```text
Excusable

Non-Excusable

Compensable

Non-Compensable
```

---

# 24. Delay Register

Fields:

```text
Delay ID

Description

Start Date

Finish Date

Impact Days

Cause

Responsible Party
```

---

# 25. Forecasting

Calculate:

```text
Forecast Finish

Forecast Duration

Forecast Cost Impact

Forecast Productivity
```

---

# 26. Milestone Management

Examples:

```text
Contract Award

NTP

Foundation Complete

Structure Complete

TOP

Practical Completion

Final Completion
```

---

# 27. Procurement Integration

Planning linked to:

```text
Procurement Package

RFQ

PO

Delivery
```

---

Example:

```text
Curtain Wall

Design
 ↓
Procurement
 ↓
Delivery
 ↓
Installation
```

---

# 28. Construction Integration

Construction progress automatically updates:

```text
Schedule Activities
```

---

# 29. Task Integration

Tasks update:

```text
Activity Progress
```

Automatically.

---

# 30. Document Integration

Activities linked to:

```text
Drawings

Specifications

Method Statements

Submittals
```

---

# 31. Dashboard

## Executive Dashboard

```text
Overall Progress

SPI

Critical Path

Forecast Completion

Major Delays
```

---

## Planning Dashboard

```text
Critical Activities

Float Analysis

Resource Loading

Lookahead
```

---

## Project Manager Dashboard

```text
Progress

Delays

Milestones

Forecast
```

---

# 32. Schedule KPIs

## SPI

Schedule Performance Index

Formula:

```text
Earned Value
÷
Planned Value
```

---

## Schedule Variance

Formula:

```text
Earned Value
-
Planned Value
```

---

## Delay Days

Formula:

```text
Forecast Finish
-
Baseline Finish
```

---

# 33. EOT Support

Supports:

```text
Delay Events

Time Impact Analysis

Window Analysis

As-Planned vs As-Built
```

---

# 34. Claims Support

Provide:

```text
Delay Records

Activity Logs

Baseline

Updates

Critical Path
```

---

# 35. Planning Workflow

```text
Create Schedule
      ↓
Review
      ↓
Approve Baseline
      ↓
Execute
      ↓
Update Progress
      ↓
Forecast
      ↓
Report
```

---

# 36. Permissions

## Planning Manager

```text
Full Access
```

---

## Project Manager

```text
View

Approve

Review
```

---

## Engineers

```text
Update Progress
```

---

## Executive

```text
View Only
```

---

# 37. Database Tables

## schedules

```text
id
project_id
schedule_name
baseline_version
status
```

---

## schedule_activities

```text
id
schedule_id
activity_id
activity_name
duration
start_date
finish_date
```

---

## activity_dependencies

```text
id
predecessor_id
successor_id
dependency_type
lag_days
```

---

## progress_updates

```text
id
activity_id
progress_percent
update_date
```

---

## delay_register

```text
id
delay_code
description
impact_days
```

---

# 38. API Endpoints

```text
GET     /schedules

POST    /schedules

GET     /activities

POST    /activities

POST    /activities/update-progress

POST    /activities/create-baseline

GET     /critical-path
```

---

# 39. Audit Requirements

Log:

```text
Create Schedule

Modify Activity

Create Baseline

Update Progress

Approve Baseline

Change Logic

Delay Registration
```

---

# 40. Definition of Done

Planning module is complete when:

✓ Master Schedule Exists

✓ Baseline Exists

✓ Activities Linked

✓ Dependencies Configured

✓ Progress Rollup Enabled

✓ Lookahead Available

✓ Delay Register Active

✓ Forecast Available

✓ Dashboards Available

---

# 41. Future Enhancements

Future features:

```text
Primavera Integration

MS Project Integration

4D BIM Simulation

AI Delay Prediction

AI Resource Optimization

Digital Twin Scheduling
```

---

# 42. Final Statement

Planning & Scheduling is the time control engine of DCOS.

Tasks execute work.

WBS organizes work.

Documents support work.

Procurement supplies work.

Construction performs work.

Planning controls when work happens, measures whether it is on time, and predicts whether the project will finish successfully.

Without Planning, there is no project control.
