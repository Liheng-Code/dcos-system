# SOP-OT-Management.md

# Digital Construction Operating System (DCOS)

## Standard Operating Procedure (SOP)

## Overtime (OT) Management System

Document No: DCOS-SOP-HR-OT-001
Module: 17-4 OT Management
Version: 1.0
Status: Draft
Owner: HR Manager / Department Manager
Effective Date: TBD

---

# 1. Purpose

The OT Management module controls all overtime requests, approvals, execution, verification, payroll integration, and labor cost allocation within DCOS.

The module ensures that overtime work is:

* Planned
* Approved
* Executed
* Verified
* Paid correctly
* Allocated to the correct project and cost code

---

# 2. Scope

Applicable to:

```text
Office Staff
Engineers
Site Engineers
Supervisors
Construction Workers
Foremen
Managers
Contract Employees
Project-Based Staff
```

Supports:

```text
Office OT
Site OT
Weekend OT
Holiday OT
Night Shift OT
Emergency OT
```

---

# 3. Objectives

The OT module shall:

✓ Standardize OT requests

✓ Prevent unauthorized overtime

✓ Control labor cost

✓ Integrate with payroll

✓ Allocate project labor cost

✓ Support manpower analytics

✓ Support AI workforce optimization

---

# 4. OT Workflow

```text
Employee

↓

Submit OT Request

↓

Department Manager Review

↓

Project Manager Review (if project work)

↓

HR Review

↓

Approved

↓

Perform OT

↓

Attendance Verification

↓

Payroll Calculation

↓

Finance
```

---

# 5. OT Types

```text
Weekday OT

Weekend OT

Public Holiday OT

Night Shift OT

Emergency OT

Project Critical OT
```

---

# 6. OT Categories

## Planned OT

Approved before work begins.

---

## Emergency OT

Urgent work requiring immediate execution.

Approval can occur afterward with justification.

---

## Mandatory OT

Company-directed overtime.

---

## Voluntary OT

Employee agrees voluntarily.

---

# 7. OT Request Form

Fields:

```text
Employee

Department

Project

WBS

Task

Reason

OT Type

Start Time

End Time

Total Hours

Remarks

Attachment
```

---

# 8. OT Reasons

Examples:

```text
Concrete Casting

Night Pour

Urgent Client Request

Drawing Submission

Shop Drawing Review

Site Inspection

Material Delivery

Critical Delay Recovery

Equipment Breakdown

Emergency Repair
```

---

# 9. Approval Workflow

Office Staff:

```text
Employee

↓

Manager

↓

HR

↓

Approved
```

---

Project Staff:

```text
Employee

↓

Section Head

↓

Project Manager

↓

HR

↓

Approved
```

---

# 10. OT Status

| Status      | Meaning             |
| ----------- | ------------------- |
| Draft       | Created             |
| Submitted   | Waiting Review      |
| Approved    | Authorized          |
| Rejected    | Not Approved        |
| In Progress | Employee Working    |
| Completed   | Work Finished       |
| Verified    | Attendance Verified |
| Paid        | Payroll Completed   |

---

# 11. Attendance Integration

Attendance automatically checks:

```text
Clock Out Time

Approved OT

Actual Working Hours

Difference
```

Example:

```text
Normal

08:00-17:00

OT

17:00-21:00
```

Total:

```text
12 Working Hours
```

---

# 12. Payroll Integration

Payroll automatically receives:

```text
OT Hours

OT Rate

Multiplier

Total OT Amount
```

Formula:

```text
OT Pay

=

Hours

×

Hourly Rate

×

Multiplier
```

---

# 13. OT Multipliers

Company configurable.

Example:

| OT Type     | Multiplier     |
| ----------- | -------------- |
| Weekday     | 1.5x           |
| Weekend     | 2.0x           |
| Holiday     | 3.0x           |
| Night Shift | 2.0x           |
| Emergency   | Company Policy |

---

# 14. Project Cost Allocation

Every OT request must map to:

```text
Project

Building

Level

Zone

WBS

Task

Cost Code
```

Example:

```text
Project A

↓

Tower

↓

L12

↓

Column C5

↓

Concrete Casting

↓

Labor OT
```

---

# 15. Timesheet Integration

OT automatically updates:

```text
Employee Timesheet

Project Timesheet

Department Timesheet
```

---

# 16. Daily OT Limit

Configurable.

Example:

```text
Maximum

4 Hours / Day
```

System warning when exceeded.

---

# 17. Weekly OT Limit

Example:

```text
Maximum

20 Hours / Week
```

Alert generated.

---

# 18. Monthly OT Limit

Example:

```text
Maximum

60 Hours / Month
```

Approval escalation required.

---

# 19. AI Validation

AI detects:

```text
Repeated OT

Excessive OT

Suspicious OT

Project OT Spike

Payroll Anomaly
```

---

# 20. AI Recommendations

AI suggests:

```text
Hire Additional Staff

Transfer Resources

Reduce OT

Reschedule Activities

Optimize Workforce
```

---

# 21. Notification Rules

Notify:

```text
OT Submitted

OT Approved

OT Rejected

OT Completed

OT Verified

OT Paid
```

Recipients:

```text
Employee

Manager

HR

Payroll

Project Manager
```

---

# 22. OT Dashboard

Displays:

```text
Today's OT

Weekly OT

Monthly OT

Pending OT

Approved OT

OT Cost
```

---

# 23. Executive Dashboard

Displays:

```text
Total OT Cost

Top OT Department

Top OT Project

OT Trend

Labor Efficiency
```

---

# 24. Project Manager Dashboard

Displays:

```text
Project OT Hours

Project OT Cost

Critical Activities

Labor Loading

Recovery Plan
```

---

# 25. HR Dashboard

Displays:

```text
Pending OT

Approved OT

Rejected OT

OT by Department

OT by Employee
```

---

# 26. Payroll Dashboard

Displays:

```text
OT Amount

OT Hours

Multiplier

Pending Payment

Paid OT
```

---

# 27. Database Tables

## overtime_requests

```text
id
employee_id
project_id
wbs_id
task_id
ot_type
start_time
end_time
hours
reason
status
```

---

## overtime_approvals

```text
id
ot_request_id
approver
status
remarks
approved_at
```

---

## overtime_rates

```text
id
ot_type
multiplier
effective_date
```

---

## overtime_payroll

```text
id
employee_id
payroll_month
hours
amount
status
```

---

# 28. API Endpoints

```text
GET /api/overtime

POST /api/overtime

GET /api/overtime/{id}

POST /api/overtime/{id}/approve

POST /api/overtime/{id}/reject

POST /api/overtime/{id}/verify

GET /api/overtime/dashboard
```

---

# 29. UI Screens

## Screen 1

OT Dashboard

Displays:

```text
Pending

Approved

Today's OT

Monthly Cost
```

---

## Screen 2

OT Request Form

Fields:

```text
Project

Task

Reason

Start

End

Hours

Attachment
```

---

## Screen 3

OT Approval Queue

Displays:

```text
Employee

Project

Hours

Reason

Approve

Reject
```

---

## Screen 4

OT Analytics

Charts:

```text
Department OT

Project OT

Employee OT

Monthly Trend

Cost Trend
```

---

# 30. Audit Requirements

System logs:

```text
Create OT

Edit OT

Approve OT

Reject OT

Verify OT

Payroll Transfer

Cost Allocation
```

Audit records cannot be deleted.

---

# 31. Permission Matrix

| Role               | View    | Create | Edit              | Approve |
| ------------------ | ------- | ------ | ----------------- | ------- |
| HR Admin           | Yes     | Yes    | Yes               | Yes     |
| HR Officer         | Yes     | Yes    | Yes               | Yes     |
| Department Manager | Team    | Team   | No                | Team    |
| Project Manager    | Project | Team   | No                | Project |
| Payroll Officer    | Yes     | No     | No                | Verify  |
| Employee           | Self    | Self   | Self (Draft Only) | No      |

---

# 32. Governance Rules

1. OT must be linked to an approved employee.
2. OT must not overlap approved leave.
3. OT should be linked to a project or department.
4. OT exceeding company limits requires escalation approval.
5. Payroll processes only verified OT records.
6. Every OT modification requires an audit log.
7. OT cost must be allocated to the correct project cost code.

---

# 33. Definition of Done

The OT Management Module is complete when:

```text
✓ OT Request Works

✓ Approval Workflow Works

✓ Attendance Verification Works

✓ Payroll Integration Works

✓ Cost Allocation Works

✓ Dashboard Works

✓ Reports Work

✓ Notifications Work

✓ AI Analytics Work

✓ Audit Logs Work
```

---

# 34. Final Statement

The OT Management module is the labor extension control engine of DCOS.

It ensures that overtime is justified, approved, measurable, traceable, and financially controlled while integrating seamlessly with Attendance, Payroll, Project Costing, and Workforce Analytics.

Every overtime hour should be accountable to a project, a task, and a business objective, ensuring complete transparency and enterprise-grade labor cost management across all construction projects.
