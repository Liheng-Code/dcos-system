# DCOS_HR_ELeave_Module_Design_R1_Part1.md

---

# Digital Construction Operating System (DCOS)

# HR Management Module

# E-Leave Management Module Design (R1)

| Item          | Detail                    |
| ------------- | ------------------------- |
| Module Name   | E-Leave Management        |
| Module Code   | HR-ELV                    |
| Parent Module | HR Management             |
| Version       | R1                        |
| Status        | PMO Design Specification  |
| Owner         | Human Resource Department |
| System Owner  | PMO                       |
| Platform      | DCOS                      |

---

# Table of Contents

1. Module Charter
2. Business Requirement Document (BRD)
3. Scope & Boundary
4. Current SOP (AS-IS)
5. Future SOP (TO-BE)
6. Business Workflow
7. User Journey
8. Role Permission Matrix
9. Approval Workflow Matrix
10. Notification Matrix

---

# 1. Module Charter

## 1.1 Purpose

The E-Leave module provides a centralized digital platform for managing employee leave requests, approvals, leave balances, leave policies, leave history, and integration with attendance and payroll systems.

The module replaces manual paper forms and Excel tracking while improving transparency, compliance, and efficiency.

---

## 1.2 Objectives

* Digitize leave applications
* Reduce HR administrative workload
* Eliminate manual leave calculations
* Prevent leave balance errors
* Improve approval turnaround time
* Synchronize attendance automatically
* Synchronize payroll automatically
* Provide employee self-service
* Provide management dashboards
* Maintain complete audit trail

---

## 1.3 Business Benefits

* Paperless HR process
* Faster approvals
* Real-time leave balance
* Reduced payroll errors
* Better manpower planning
* Historical leave tracking
* Mobile accessibility
* Better employee experience

---

## 1.4 Module Owner

Human Resource Department

---

## 1.5 Primary Users

* Employee
* Supervisor
* Department Manager
* HR Officer
* Payroll Officer
* HR Manager
* Administrator

---

## 1.6 Success KPI

* 100% Online Leave Request
* Approval Time < 24 Hours
* Payroll Integration Accuracy 100%
* Leave Balance Accuracy 100%
* Zero Duplicate Leave
* Zero Manual Excel Tracking

---

# 2. Business Requirement Document (BRD)

---

## 2.1 Business Background

The company currently manages employee leave through manual forms and Excel files.

This creates:

* Human errors
* Lost forms
* Duplicate leave
* Payroll mistakes
* Slow approvals
* Poor reporting

The E-Leave module will standardize leave management across the company.

---

## 2.2 Business Objectives

The system shall:

* Allow online leave request
* Automatically validate leave balance
* Skip public holidays
* Skip weekends if configured
* Prevent overlapping leave
* Route approvals automatically
* Update attendance automatically
* Update payroll automatically
* Generate reports automatically

---

## 2.3 Functional Requirements

The system shall support:

### Employee

* Apply Leave
* Cancel Leave
* View Balance
* View History
* Upload Attachment
* Track Approval

---

### Supervisor

* Review Leave
* Approve Leave
* Reject Leave
* View Team Calendar

---

### HR

* Configure Leave Policy
* Configure Carry Forward
* Configure Holiday
* Adjust Balance
* Generate Reports

---

### Payroll

* Export Leave
* Calculate Leave Deduction

---

## 2.4 Non Functional Requirements

* Responsive UI
* Mobile Friendly
* Multi Company Support
* Audit Trail
* Notification Engine
* RBAC Security
* High Availability
* API Ready
* Telegram Integration

---

# 3. Scope & Boundary

---

## 3.1 Included Scope

* Leave Request
* Leave Approval
* Leave Cancellation
* Leave Balance
* Leave Calendar
* Public Holiday
* Carry Forward
* Attachment Upload
* Medical Certificate
* Leave Dashboard
* Leave Reports
* Leave History
* Leave Notification

---

## 3.2 Leave Types

The module supports:

* Annual Leave
* Sick Leave
* Unpaid Leave
* Marriage Leave
* Maternity Leave
* Paternity Leave
* Compassionate Leave
* Study Leave
* Emergency Leave
* Special Leave
* Company Leave
* Half Day Leave

---

## 3.3 Excluded Scope

* Payroll Calculation
* Attendance Punch
* Recruitment
* Training
* Performance Review

These modules integrate externally.

---

# 4. Current SOP (AS-IS)

Current process:

```
Employee

↓

Fill Paper Form

↓

Supervisor Sign

↓

Department Manager Sign

↓

HR Receive

↓

Excel Update

↓

Payroll Calculate

↓

Archive
```

---

## Current Problems

* Lost Paper
* Delayed Approval
* Duplicate Entry
* Wrong Balance
* HR Manual Work
* Payroll Error
* No Mobile Access
* No Dashboard

---

# 5. Future SOP (TO-BE)

```
Employee

↓

Apply Leave Online

↓

System Validate Balance

↓

System Validate Holiday

↓

System Validate Existing Leave

↓

Supervisor Review

↓

Department Manager Review (Optional)

↓

HR Verify

↓

Attendance Update

↓

Payroll Update

↓

Dashboard Update

↓

Audit Log
```

---

## Benefits

* Fully Digital
* Auto Validation
* Auto Balance
* Auto Notification
* Auto Payroll Sync
* Auto Attendance Sync

---

# 6. Business Workflow

---

## Standard Leave Process

```
Create Leave

↓

Validate Balance

↓

Validate Holiday

↓

Validate Weekend

↓

Validate Overlap

↓

Save Draft

↓

Submit

↓

Supervisor Review

↓

Manager Review

↓

HR Verify

↓

Approved

↓

Attendance Sync

↓

Payroll Sync

↓

Dashboard Update

↓

Audit Log

↓

Completed
```

---

## Reject Flow

```
Employee Submit

↓

Supervisor Reject

↓

Employee Receive Reason

↓

Edit

↓

Resubmit
```

---

## Withdraw & Cancel Flow

The module supports two separate flows for ending a leave request before the leave is taken:

### Flow A — Withdraw (for submitted/pending requests)

Employee submits → Supervisor has NOT yet acted → Employee can withdraw directly.

```
Submitted

↓

Employee Withdraw Request

↓

(withdraws instantly — no approval required)

↓

Notify All Approvers

↓

Withdrawn
```

- **Status transition:** `submitted` → `withdrawn`
- **No balance impact:** Leave days were never deducted (balance deduction happens only on final approval)
- **No rollback needed:** Attendance and payroll were never updated
- **Notifications sent to:** All assigned approvers (`request_withdrawn` event)

### Flow B — Cancel (for approved requests)

Leave has been approved — employee must request cancellation and await approver decision.

```
Approved

↓

Employee Request Cancellation (+ reason)

↓

Pending Cancellation

↓

Supervisor / Approver Reviews

├── Approve → Withdrawn (balance restored, attendance rollback, payroll flag)
└── Deny   → Reverts to Approved (no change)
```

- **Status transition:** `approved` → `pending_cancellation` → `withdrawn` (or back to `approved`)
- **Balance restored:** Days are returned to `leave_balances.remaining_days` on approval
- **Attendance rollback:** Approved cancellation triggers attendance record reversal
- **Payroll flag:** `payroll_reversal_needed` flag set for next payroll cycle
- **Notifications:**
  - `cancellation_requested` → all approvers (when employee initiates)
  - `cancellation_approved` → employee + approver (when approved)
  - `cancellation_denied` → employee (when denied)

---

# 7. User Journey

---

## Employee Journey

```
Login

↓

Dashboard

↓

My Leave

↓

Apply Leave

↓

Select Type

↓

Select Date

↓

Reason

↓

Attachment

↓

Submit

↓

Track Status
```

---

## Supervisor Journey

```
Dashboard

↓

Pending Leave

↓

Review

↓

Approve

↓

Complete
```

---

## HR Journey

```
Dashboard

↓

Pending Verification

↓

Review Policy

↓

Adjust Balance

↓

Approve

↓

Payroll Sync

↓

Archive
```

---

# 8. Role Permission Matrix

| Function          | Employee | Supervisor | Manager | HR  | Payroll | Admin |
| ----------------- | -------- | ---------- | ------- | --- | ------- | ----- |
| Apply Leave       | YES      | YES        | YES     | YES | YES     | YES   |
| Cancel Leave      | YES      | YES        | YES     | YES | YES     | YES   |
| Approve Leave     | NO       | YES        | YES     | YES | NO      | YES   |
| Reject Leave      | NO       | YES        | YES     | YES | NO      | YES   |
| View Balance      | YES      | YES        | YES     | YES | YES     | YES   |
| Adjust Balance    | NO       | NO         | NO      | YES | NO      | YES   |
| Export Report     | NO       | NO         | YES     | YES | YES     | YES   |
| Delete Leave      | NO       | NO         | NO      | NO  | NO      | YES   |
| Configure Policy  | NO       | NO         | NO      | YES | NO      | YES   |
| Configure Holiday | NO       | NO         | NO      | YES | NO      | YES   |

---

# 9. Approval Workflow Matrix

---

## Annual Leave

```
Employee

↓

Supervisor

↓

Approved
```

---

## Sick Leave (>2 Days)

```
Employee

↓

Supervisor

↓

HR

↓

Approved
```

---

## Marriage Leave

```
Employee

↓

Supervisor

↓

Department Manager

↓

HR

↓

Approved
```

---

## Maternity Leave

```
Employee

↓

Department Manager

↓

HR

↓

Approved
```

---

## Unpaid Leave

```
Employee

↓

Supervisor

↓

Department Manager

↓

HR Manager

↓

Approved
```

---

## Emergency Leave

```
Employee

↓

Supervisor

↓

Approved

↓

HR Notification
```

---

# 10. Notification Matrix

| Event                       | Employee | Supervisor | Manager | HR  | Payroll |
| --------------------------- | -------- | ---------- | ------- | --- | ------- |
| Leave Submitted             |          | YES        |         |     |         |
| Leave Approved              | YES      |            |         |     |         |
| Leave Rejected              | YES      |            |         |     |         |
| Leave Cancelled             | YES      | YES        |         |     |         |
| Balance Low                 | YES      |            |         | YES |         |
| Medical Certificate Missing | YES      |            |         | YES |         |
| Leave Tomorrow Reminder     | YES      |            |         | YES |         |
| Leave Starts Today          | YES      | YES        |         |     |         |
| Leave Ends Tomorrow         | YES      |            |         | YES |         |
| Carry Forward Completed     | YES      |            |         | YES |         |
| Payroll Export Complete     |          |            |         |     | YES     |
| Policy Updated              | YES      | YES        | YES     | YES | YES     |

---

# End of Part 1

**Next Document**

```
DCOS_HR_ELeave_Module_Design_R1_Part2.md

11. UI Screen Design
12. Database ERD
13. Data Dictionary
14. API Specification
15. Dashboard & KPI
16. Reports
```
