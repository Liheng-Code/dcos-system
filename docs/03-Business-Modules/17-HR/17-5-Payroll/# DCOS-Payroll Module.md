# DCOS HR & Payroll Module Design R3

## Workflow, Approval Matrix, Notification Matrix & Enterprise Control

**Document Code:** DCOS-HR-PAY-R3
**Version:** R3
**Status:** Enterprise Design
**Country:** Cambodia

---

# 25. Payroll Status Lifecycle

Every payroll period must follow a controlled workflow.

```text
Draft
↓
Collect Attendance
↓
Collect Timesheet
↓
Collect Overtime
↓
Calculate Payroll
↓
HR Review
↓
Finance Verification
↓
Management Approval
↓
Locked
↓
Export to Finance
↓
Paid
↓
Closed
```

---

## Status Definitions

| Status               | Description               |
| -------------------- | ------------------------- |
| Draft                | Payroll period created    |
| Collecting           | Attendance / OT gathering |
| Calculated           | Payroll generated         |
| Under Review         | HR reviewing              |
| Finance Verification | Finance checking          |
| Pending Approval     | Awaiting final approval   |
| Approved             | Payroll approved          |
| Locked               | No further editing        |
| Exported             | Sent to finance           |
| Paid                 | Salary paid               |
| Closed               | Payroll period completed  |

---

# 26. Payroll Workflow Engine

## Step 1 — Payroll Period Creation

HR creates payroll period.

Example:

```text
June 2026
01-Jun-2026
30-Jun-2026
```

System:

```text
Status = Draft
```

---

## Step 2 — Attendance Collection

Sources:

* Manual
* Excel Import
* QR Check-In
* Biometric
* Mobile Check-In

System validates:

```text
Missing Attendance
Late Attendance
Absent Days
```

---

## Step 3 — Timesheet Collection

System verifies:

```text
All timesheets approved
```

Before payroll calculation.

---

## Step 4 — Overtime Collection

System verifies:

```text
All OT approved
```

Before payroll calculation.

---

## Step 5 — Payroll Calculation

System generates:

```text
Gross Salary
Tax Relief
Taxable Salary
TOS
NSSF
Net Salary
```

Status:

```text
Calculated
```

---

## Step 6 — HR Review

Review:

* Salary changes
* OT abnormalities
* Missing attendance
* Missing tax profile

Status:

```text
Under Review
```

---

## Step 7 — Finance Verification

Finance verifies:

* Salary budget
* Department budget
* Project labor cost
* Cash availability

Status:

```text
Finance Verification
```

---

## Step 8 — Management Approval

Approver:

* HR Manager
* Director
* CEO

Configurable

Status:

```text
Approved
```

---

## Step 9 — Lock Payroll

System:

```text
No Editing Allowed
```

Only super admin unlock.

Status:

```text
Locked
```

---

## Step 10 — Salary Payment

Payment:

* Bank Transfer
* Cash
* ABA
* ACLEDA
* Wing

Status:

```text
Paid
```

---

# 27. Payroll Approval Matrix

## Small Company

| Action           | Approver   |
| ---------------- | ---------- |
| OT Approval      | Supervisor |
| Leave Approval   | Supervisor |
| Payroll Review   | HR         |
| Payroll Approval | Director   |

---

## Medium Company

| Action                 | Reviewer        | Approver           |
| ---------------------- | --------------- | ------------------ |
| OT                     | Supervisor      | Department Manager |
| Attendance Correction  | HR Officer      | HR Manager         |
| Payroll Run            | HR Officer      | HR Manager         |
| Payroll Approval       | HR Manager      | Finance Manager    |
| Payroll Final Approval | Finance Manager | Director           |

---

## Enterprise Company

| Action               | Level 1         | Level 2         | Level 3 |
| -------------------- | --------------- | --------------- | ------- |
| Payroll Run          | HR Officer      | HR Manager      | -       |
| Payroll Verification | Finance Officer | Finance Manager | -       |
| Payroll Approval     | HR Director     | CFO             | CEO     |

---

# 28. Payroll Notification Matrix

## Notification Channels

* In-App
* Email
* Telegram
* Mobile Push

---

## Payroll Event Matrix

| Event                         | Notify     |
| ----------------------------- | ---------- |
| Payroll Period Created        | HR Team    |
| Attendance Missing            | Employee   |
| Timesheet Missing             | Employee   |
| OT Pending Approval           | Supervisor |
| Payroll Calculated            | HR Manager |
| Payroll Verification Required | Finance    |
| Payroll Approval Required     | Director   |
| Payroll Approved              | Finance    |
| Payroll Paid                  | Employee   |
| Payroll Rejected              | HR         |

---

## Payroll Alert Priority

| Priority | Description       |
| -------- | ----------------- |
| Low      | Information       |
| Normal   | Reminder          |
| High     | Approval Required |
| Critical | Payroll Blocker   |

---

# 29. Payroll System Alert Matrix

## Attendance Alerts

| Trigger              | Alert           |
| -------------------- | --------------- |
| Missing Attendance   | Notify Employee |
| 3 Consecutive Absent | Notify Manager  |
| Late > 5 Times       | Notify HR       |

---

## Timesheet Alerts

| Trigger                | Alert             |
| ---------------------- | ----------------- |
| Missing Timesheet      | Notify Employee   |
| Unapproved Timesheet   | Notify Supervisor |
| Payroll Cutoff Reached | Escalate          |

---

## Overtime Alerts

| Trigger               | Alert          |
| --------------------- | -------------- |
| OT > 40 Hours         | Notify HR      |
| OT > Department Limit | Notify Manager |
| OT Budget Exceeded    | Notify Finance |

---

## Payroll Alerts

| Trigger                                   | Alert    |
| ----------------------------------------- | -------- |
| Missing Tax Profile                       | Critical |
| Missing NSSF Profile                      | Critical |
| Salary Change >20%                        | Critical |
| Duplicate Employee                        | Critical |
| Negative Salary                           | Critical |
| Payroll Difference vs Previous Month >30% | Critical |

---

# 30. Payroll Audit Log

Audit Required:

```text
Salary Change
Tax Profile Change
NSSF Change
Payroll Run
Payroll Approval
Payroll Rejection
Payroll Export
Payroll Payment
Payslip Download
```

---

## Audit Severity

| Action           | Severity |
| ---------------- | -------- |
| View Payslip     | Low      |
| Generate Payroll | Medium   |
| Salary Change    | High     |
| Tax Change       | High     |
| Payroll Approval | High     |
| Payroll Unlock   | Critical |

---

# 31. Payroll Permission Matrix

## HR Officer

Can:

* Create Employee
* Attendance
* OT
* Run Payroll

Cannot:

* Approve Payroll
* Unlock Payroll

---

## HR Manager

Can:

* Approve Payroll
* Approve Salary Change

Cannot:

* Pay Salary

---

## Finance

Can:

* Verify Payroll
* Export Payroll
* Pay Salary

Cannot:

* Edit Employee Salary

---

## Director

Can:

* Final Approval
* View All Payroll

---

## Employee

Can:

* View Own Payslip
* View Own Attendance
* View Own Leave

Cannot:

* View Others

---

# 32. Payroll Exception Handling

## Missing Tax Profile

```text
Block Payroll
```

---

## Missing NSSF

```text
Block Payroll
```

---

## Missing Attendance

```text
Warning
```

---

## Missing Timesheet

```text
Block Project Cost Allocation
```

---

## Unapproved OT

```text
Exclude From Payroll
```

---

# 33. Payroll Closing Procedure

Month End:

```text
Attendance Closed
↓
Timesheet Closed
↓
OT Closed
↓
Payroll Generated
↓
Approved
↓
Locked
↓
Paid
↓
Closed
```

No modification after:

```text
Locked
```

---

# 34. Payroll Cost Allocation Workflow

Unique DCOS Feature

```text
Employee
↓
Timesheet
↓
Project
↓
WBS
↓
Task
↓
Payroll Cost Allocation
```

Example:

```text
Liheng Salary

Project A = 60%
Project B = 40%

Automatically Allocate
```

---

# 35. Payroll Integration Matrix

| Module          | Integration     |
| --------------- | --------------- |
| HR              | Employee        |
| Attendance      | Attendance      |
| Leave           | Leave Deduction |
| Timesheet       | Cost Allocation |
| Task Management | Productivity    |
| Project Setup   | Labor Cost      |
| WBS             | Cost Allocation |
| Finance         | Salary Payment  |
| Reporting       | KPI Dashboard   |
| Audit Log       | Compliance      |
| Notification    | Alerts          |

---

# 36. Payroll Dashboard

## HR Dashboard

Cards:

* Total Employees
* Payroll Cost
* OT Cost
* Leave Cost
* Pending Approval

---

## Finance Dashboard

Cards:

* Monthly Payroll
* Payroll Budget
* Payroll Variance
* Cash Required

---

## Executive Dashboard

Cards:

* Total Headcount
* Payroll Cost Trend
* Labor Cost by Project
* Labor Productivity
* Cost per Employee

---

# End of Document

DCOS_HR_Payroll_Module_Design_R3
Enterprise Workflow + Approval + Notification + Audit Version
