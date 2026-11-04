# SOP-WBS-Management.md

# Digital Construction Operating System (DCOS)

## Standard Operating Procedure (SOP)

## Work Breakdown Structure (WBS) Management

Document No: DCOS-SOP-WBS-001
Version: 1.0
Status: Approved
Owner: PMO Manager
Effective Date: TBD

---

# 1. Purpose

This procedure establishes the standard process for creating, managing, maintaining, and governing the Work Breakdown Structure (WBS) within DCOS.

The purpose is to:

* Standardize project decomposition
* Improve project control
* Enable progress measurement
* Enable cost control
* Enable document classification
* Support task management
* Support reporting and KPI

The WBS is the primary project structure within DCOS.

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

All operational records must be linked to WBS.

---

# 3. Objectives

The WBS shall provide:

### Structure

Project decomposition.

---

### Visibility

Project status visibility.

---

### Accountability

Ownership assignment.

---

### Reporting

Consistent reporting.

---

### Traceability

Location-based records.

---

# 4. WBS Philosophy

## Core Principle

Everything belongs to a location.

Every operational record must answer:

```text
Which Project?

Which Building?

Which Level?

Which Zone?

Which Room?

Which Element?
```

---

## DCOS Standard WBS

```text
Project
   ↓
Building
   ↓
Level
   ↓
Zone
   ↓
Room
   ↓
Element
   ↓
Task
```

---

# 5. WBS Hierarchy

## Level 0

Project

Example:

```text
GDT Office Tower
```

---

## Level 1

Building

Examples:

```text
Tower A

Podium

Basement

External Works
```

---

## Level 2

Level

Examples:

```text
B2

B1

L01

L02

L29

RF
```

---

## Level 3

Zone

Examples:

```text
ZA

ZB

ZC

ZD
```

---

## Level 4

Room

Examples:

```text
Meeting Room

Office Room

Lobby

Toilet

MEP Room
```

---

## Level 5

Element

Examples:

```text
Column

Wall

Beam

Slab

Door

Ceiling
```

---

## Level 6

Task

Examples:

```text
Install Rebar

Review Shop Drawing

Concrete Casting
```

---

# 6. WBS Ownership

## PMO Manager

Responsible for:

```text
WBS Standards

Governance
```

---

## Project Manager

Responsible for:

```text
Project WBS Approval
```

---

## Department Managers

Responsible for:

```text
Review WBS Structure
```

---

## WBS Coordinator

Responsible for:

```text
WBS Maintenance
```

---

# 7. WBS Creation Workflow

```text
Create Project
      ↓
Create Building
      ↓
Create Level
      ↓
Create Zone
      ↓
Create Room
      ↓
Create Element
      ↓
Review
      ↓
Approve
      ↓
Activate
```

---

# 8. WBS Code Structure

## Building

Format:

```text
BLD-XX
```

Examples:

```text
BLD-TA

BLD-PD

BLD-BSM
```

---

## Level

Format:

```text
L01

L02

B1

RF
```

---

## Zone

Format:

```text
ZA

ZB

ZC

ZD
```

---

## Room

Format:

```text
RM-XXXX
```

Examples:

```text
RM-MEETING01

RM-LOBBY01
```

---

## Element

Format:

```text
STR-001

ARC-001

MEP-001
```

---

# 9. WBS Numbering Example

```text
PRJ-2026-001
│
└── BLD-TA
      │
      └── L05
            │
            └── ZA
                  │
                  └── RM-MEETING01
                        │
                        └── STR-004
```

---

# 10. WBS Template Management

## Purpose

Avoid rebuilding WBS repeatedly.

---

## Standard Templates

```text
High-Rise Building

Residential Tower

Factory

Hospital

Infrastructure
```

---

## Clone Workflow

```text
Template
    ↓
Select Project
    ↓
Clone
    ↓
Adjust
    ↓
Activate
```

---

# 11. WBS Status

## Draft

Under setup.

---

## Active

Available for operations.

---

## On Hold

Temporarily unavailable.

---

## Closed

No new records allowed.

---

## Archived

Historical reference.

---

# 12. WBS Activation Rules

Required:

✓ Project Active

✓ Stakeholders Assigned

✓ Team Assigned

✓ Structure Verified

---

Approval:

```text
Project Manager
```

Required.

---

# 13. WBS Modification Procedure

Allowed changes:

```text
Description

Owner

Additional Nodes
```

---

Restricted changes:

```text
Delete Existing Nodes

Move Historical Nodes

Change Active Codes
```

Require approval.

---

# 14. WBS Closure Procedure

A WBS node may be closed when:

```text
All Tasks Closed

All Inspections Closed

All Documents Complete

Progress 100%
```

---

Workflow:

```text
Review
   ↓
Approval
   ↓
Close
```

---

# 15. WBS Dependency Rules

Every module must connect to WBS.

---

## Task Management

```text
Task
↓
WBS
```

---

## Document Control

```text
Document
↓
WBS
```

---

## Procurement

```text
Material
↓
WBS
```

---

## QAQC

```text
Inspection
↓
WBS
```

---

## HSE

```text
Incident
↓
WBS
```

---

## Cost Control

```text
Cost
↓
WBS
```

---

# 16. Progress Calculation

## Task Progress

```text
Task
↓
Element
```

---

## Element Progress

```text
Element
↓
Room
```

---

## Room Progress

```text
Room
↓
Zone
```

---

## Zone Progress

```text
Zone
↓
Level
```

---

## Level Progress

```text
Level
↓
Building
```

---

## Building Progress

```text
Building
↓
Project
```

---

# 17. Example Progress Rollup

```text
Task A = 100%

Task B = 50%

Task C = 0%
```

Element Progress:

```text
(100 + 50 + 0) / 3

= 50%
```

---

System automatically rolls upward.

---

# 18. WBS Assignment Rules

Every WBS node may have:

```text
Owner

Discipline

Department

Manager
```

---

Example:

```text
L05

Owner:
Structural Team
```

---

# 19. WBS Security

Permissions:

| Action  | Permission      |
| ------- | --------------- |
| View    | Allowed         |
| Create  | WBS Manager     |
| Edit    | WBS Manager     |
| Approve | Project Manager |
| Delete  | Administrator   |

---

# 20. WBS Dashboard

## Project Manager

```text
Building Progress

Level Progress

Delayed Areas

Critical Areas
```

---

## Executive

```text
Project Completion

Portfolio Progress

Health Score
```

---

# 21. WBS KPI

Monitor:

```text
Active WBS

Closed WBS

Delayed WBS

Progress %

Open Tasks
```

---

# 22. WBS Notifications

Notify when:

```text
WBS Activated

WBS Closed

Progress Delayed

Owner Changed
```

---

Channels:

```text
In-App

Email

Telegram
```

---

# 23. WBS Audit Requirements

Log:

```text
Create WBS

Edit WBS

Activate WBS

Close WBS

Assign Owner

Change Structure
```

---

Audit logs cannot be deleted.

---

# 24. Database Tables

## wbs_nodes

```text
id
project_id
parent_id
wbs_code
wbs_name
wbs_type
status
```

---

## wbs_assignments

```text
id
wbs_id
owner_id
discipline
```

---

## wbs_progress

```text
id
wbs_id
planned_progress
actual_progress
```

---

# 25. API Endpoints

```text
GET     /wbs

POST    /wbs

PUT     /wbs/{id}

DELETE  /wbs/{id}

POST    /wbs/clone

GET     /wbs/progress
```

---

# 26. Definition of Done

A WBS structure is considered complete when:

✓ Building Created

✓ Levels Created

✓ Zones Created

✓ Rooms Created

✓ Elements Created

✓ Owners Assigned

✓ Approved

✓ Activated

✓ Progress Rollup Enabled

✓ Reporting Enabled

---

# 27. Common Mistakes

Avoid:

```text
Creating Tasks Without WBS

Duplicate WBS Codes

Skipping Zone Level

Mixing Disciplines Into WBS

Using WBS as Cost Code
```

---

# 28. Future Enhancements

Future capabilities:

```text
BIM Integration

4D Planning

AI Progress Forecast

Digital Twin

Location-Based Reporting
```

---

# 29. Governance Rules

WBS is mandatory.

No operational record may exist without WBS linkage.

All modules must consume WBS from the centralized WBS Engine.

Modules shall not create independent location structures.

---

# 30. Final Statement

The WBS is the backbone of DCOS.

Tasks execute work.

Documents store information.

Costs track money.

Inspections verify quality.

But WBS provides the structure that connects them all.

Without WBS, there is no project control.

Every project.
Every location.
Every task.
Every document.

Must belong to a controlled WBS structure.
