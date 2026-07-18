# SOP-Task-Management.md

# Digital Construction Operating System (DCOS)

## Standard Operating Procedure (SOP)

## Task Management

Document No: DCOS-SOP-TSK-001
Version: 1.0
Status: Approved
Owner: PMO Manager
Effective Date: TBD

---

# 1. Purpose

This procedure establishes the standard process for:

* Task creation
* Task assignment
* Task execution
* Task monitoring
* Task approval
* Task closure

within DCOS.

The objective is to provide accountability, visibility, traceability, and performance measurement across all projects.

---

# 2. Scope

This SOP applies to all project tasks.

Including:

```text
Design Tasks

Procurement Tasks

Construction Tasks

QAQC Tasks

HSE Tasks

Commercial Tasks

Commissioning Tasks

DLP Tasks
```

---

# 3. Objectives

Task Management shall ensure:

### Accountability

Every task has an owner.

---

### Visibility

Progress is visible.

---

### Traceability

History is recorded.

---

### Governance

Approvals are controlled.

---

### Performance

Team productivity is measurable.

---

# 4. Task Philosophy

DCOS follows:

```text
Project
 ↓
WBS
 ↓
Task
 ↓
Execution
 ↓
Approval
 ↓
Progress
```

No task shall exist without WBS assignment.

---

# 5. Core Roles

## Assignee

Task Owner.

Usually:

```text
Manager

Team Leader

Lead Engineer

Project Manager
```

Responsibilities:

```text
Create Task

Assign Receiver

Review Work

Approve Work

Reject Work
```

---

## Receiver

Task Executor.

Usually:

```text
Engineer

Drafter

Procurement Officer

Site Engineer

Inspector
```

Responsibilities:

```text
Accept Task

Execute Task

Update Progress

Submit Task
```

---

# 6. Task Lifecycle

## Standard Workflow

```text
Draft
   ↓
Assigned
   ↓
In Progress
   ↓
Pending Approval
   ↓
Approved
   ↓
Closed
```

---

## Rejection Workflow

```text
Pending Approval
      ↓
Rejected
      ↓
In Progress
      ↓
Resubmit
```

---

# 7. Task Status Definitions

| Status           | Description                  |
| ---------------- | ---------------------------- |
| Draft            | Created but not assigned     |
| Assigned         | Assigned to receiver         |
| In Progress      | Receiver accepted task       |
| Pending Approval | Work completed and submitted |
| Approved         | Assignee approved            |
| Rejected         | Returned for correction      |
| Closed           | Finalized                    |
| Cancelled        | Task terminated              |

---

# 8. Task Categories

## Design Tasks

Examples:

```text
Calculation Note

Design Drawing

Shop Drawing Review

Material Review

Method Statement Review

RFI Response
```

---

## Procurement Tasks

Examples:

```text
Create PR

Issue RFQ

Quotation Evaluation

Issue PO

Material Follow-Up
```

---

## Construction Tasks

Examples:

```text
Rebar Installation

Formwork

Concrete Casting

Block Work

Painting
```

---

## QAQC Tasks

Examples:

```text
Inspection

NCR Review

Punch List
```

---

## HSE Tasks

Examples:

```text
Safety Inspection

Toolbox Talk

Permit Review
```

---

# 9. Task Creation Procedure

## Step 1

Create task.

Required fields:

```text
Task Title

Task Category

Task Type

Project

WBS

Priority

Due Date
```

---

## Step 2

Attach supporting information.

Examples:

```text
Drawings

Specifications

Photos

Links

Documents
```

---

## Step 3

Status:

```text
Draft
```

---

# 10. Task Assignment Procedure

## Assignment Flow

```text
Create Task
      ↓
Assign Receiver
      ↓
Notify Receiver
      ↓
Assigned
```

---

## Assignment Rules

Receiver must:

```text
Active User

Project Member

Correct Discipline
```

---

# 11. Task Acceptance Procedure

Receiver reviews:

```text
Scope

Documents

Deadline

Deliverables
```

---

Receiver may:

```text
Accept

Request Clarification
```

---

After acceptance:

```text
Status = In Progress
```

---

# 12. Task Execution Procedure

Receiver performs work.

---

Allowed actions:

```text
Update Progress

Add Comments

Upload Files

Add Photos

Create Issues
```

---

Progress updates:

```text
0%

25%

50%

75%

100%
```

Or actual percentages.

---

# 13. Daily Progress Update

Required for:

```text
Construction

Design

Procurement
```

Tasks longer than:

```text
3 Days
```

---

Update includes:

```text
Progress %

Comments

Attachments
```

---

# 14. Task Submission Procedure

When work completed:

Receiver submits.

---

Status:

```text
Pending Approval
```

---

Required:

```text
Deliverables Uploaded

Progress = 100%

Comments Completed
```

---

# 15. Approval Procedure

Assignee reviews:

```text
Deliverables

Quality

Completeness

Compliance
```

---

Assignee may:

```text
Approve

Reject
```

---

# 16. Rejection Procedure

Required:

```text
Reason

Corrective Action
```

Mandatory.

---

Status:

```text
Rejected
```

---

Automatically returns:

```text
In Progress
```

---

# 17. Task Closure Procedure

After approval:

```text
Approved
      ↓
Closed
```

---

Closure conditions:

✓ Approved

✓ Progress 100%

✓ Deliverables Complete

✓ No Open Issues

---

# 18. Priority Levels

| Priority | Description         |
| -------- | ------------------- |
| Critical | Immediate attention |
| High     | High urgency        |
| Medium   | Standard            |
| Low      | Low urgency         |

---

# 19. Task Dependency

Supported types:

| Code | Description      |
| ---- | ---------------- |
| FS   | Finish to Start  |
| SS   | Start to Start   |
| FF   | Finish to Finish |
| SF   | Start to Finish  |

---

Example:

```text
Concrete Casting

depends on

Rebar Inspection
```

FS Dependency.

---

# 20. Recurring Tasks

Examples:

```text
Weekly Meeting

Daily Report

Monthly Progress Report
```

---

System automatically generates tasks.

---

# 21. Notifications

Notify:

### Task Assigned

To Receiver

---

### Task Accepted

To Assignee

---

### Progress Updated

To Assignee

---

### Pending Approval

To Assignee

---

### Rejected

To Receiver

---

### Approved

To Receiver

---

Channels:

```text
In-App

Email

Telegram
```

---

# 22. Escalation Rules

## Level 1

Task overdue 1 day.

Notify:

```text
Receiver
```

---

## Level 2

Task overdue 3 days.

Notify:

```text
Receiver

Assignee
```

---

## Level 3

Task overdue 7 days.

Notify:

```text
Department Manager
```

---

## Level 4

Task overdue 14 days.

Notify:

```text
Project Manager
```

---

# 23. Task Dashboard

## Receiver Dashboard

```text
My Tasks

Overdue Tasks

Pending Approval

Completed Tasks
```

---

## Assignee Dashboard

```text
Assigned Tasks

Pending Review

Delayed Tasks

Team Performance
```

---

## Manager Dashboard

```text
Department Progress

Overdue Tasks

Resource Loading

Task KPI
```

---

# 24. KPI Monitoring

## Completion Rate

```text
Completed

÷

Assigned
```

---

## Approval Turnaround

```text
Submission

↓

Approval
```

---

## Overdue Percentage

```text
Overdue

÷

Total Tasks
```

---

## First-Time Approval Rate

```text
Approved First Review

÷

Total Submitted
```

---

# 25. Audit Requirements

Log:

```text
Create Task

Assign Task

Accept Task

Update Progress

Submit Task

Approve Task

Reject Task

Close Task
```

---

Audit records cannot be deleted.

---

# 26. Permission Matrix

## Administrator

```text
Full Access
```

---

## Assignee

```text
Create

Assign

Review

Approve

Reject
```

---

## Receiver

```text
Accept

Update

Submit
```

---

## Viewer

```text
Read Only
```

---

# 27. Database Structure

## tasks

```text
id

task_code

title

description

project_id

wbs_id

status

priority

due_date
```

---

## task_assignments

```text
id

task_id

assignee_id

receiver_id
```

---

## task_progress

```text
id

task_id

progress_percent

remarks
```

---

## task_comments

```text
id

task_id

comment
```

---

## task_attachments

```text
id

task_id

file_id
```

---

# 28. API Endpoints

```text
GET     /tasks

POST    /tasks

PUT     /tasks/{id}

POST    /tasks/{id}/assign

POST    /tasks/{id}/accept

POST    /tasks/{id}/submit

POST    /tasks/{id}/approve

POST    /tasks/{id}/reject
```

---

# 29. Integration Requirements

Task Management integrates with:

```text
Project Setup

WBS Management

Document Control

Planning

QAQC

Procurement

Construction

Approval Engine

Notification Engine

Audit Engine
```

---

# 30. Definition of Done

A task is considered complete when:

✓ Assigned

✓ Accepted

✓ Executed

✓ Submitted

✓ Approved

✓ Closed

✓ Audit Logged

✓ Progress Rolled Up

---

# 31. Governance Rules

No task shall exist without:

```text
Project

WBS

Assignee

Receiver
```

---

No task may bypass:

```text
Approval Workflow
```

---

No task may be deleted after execution begins.

---

# 32. Final Statement

Task Management is the execution engine of DCOS.

Projects are planned through WBS.

Work is executed through tasks.

Performance is measured through tasks.

Progress is calculated through tasks.

Every deliverable, activity, review, approval, inspection, and construction operation ultimately flows through the Task Management process.

If WBS is the backbone of DCOS, Task Management is the heartbeat.
