# DCOS_HR_ELeave_Module_Design_R1_Part3.md

# Digital Construction Operating System (DCOS)

# HR Management Module

# E-Leave Management Module Design (R1)

## Part 3

---

# Table of Contents

17. Audit Log Design

18. Integration Architecture

19. User Acceptance Test (UAT)

20. Go-Live Checklist

Appendix A - Leave Status Matrix

Appendix B - Leave Policy Matrix

Appendix C - System Configuration

Appendix D - Future Enhancement (R2)

---

# 17 Audit Log Design

---

# 17.1 Purpose

Every leave transaction shall be traceable.

The audit log records:

* Who
* What
* When
* Before Value
* After Value
* Reason
* Device
* IP Address

The audit log cannot be modified by normal users.

---

# 17.2 Audit Events

| Event             | Log Required |
| ----------------- | ------------ |
| Apply Leave       | YES          |
| Save Draft        | YES          |
| Edit Leave        | YES          |
| Submit Leave      | YES          |
| Cancel Leave      | YES          |
| Approve Leave     | YES          |
| Reject Leave      | YES          |
| Adjust Balance    | YES          |
| Carry Forward     | YES          |
| Upload Attachment | YES          |
| Delete Attachment | YES          |
| Policy Change     | YES          |
| Holiday Change    | YES          |
| Export Report     | YES          |
| Payroll Export    | YES          |

---

# 17.3 Audit Table

```text
audit_leave_log
```

| Field            | Type      |
| ---------------- | --------- |
| id               | UUID      |
| module           | VARCHAR   |
| action           | VARCHAR   |
| user_id          | UUID      |
| user_name        | VARCHAR   |
| role             | VARCHAR   |
| employee_id      | UUID      |
| leave_request_id | UUID      |
| old_value        | JSON      |
| new_value        | JSON      |
| reason           | TEXT      |
| ip_address       | TEXT      |
| browser          | TEXT      |
| device           | TEXT      |
| created_at       | TIMESTAMP |

---

# 17.4 Audit Timeline Example

```text
08:15 Employee Create Leave

↓

08:16 Save Draft

↓

08:20 Submit

↓

08:30 Supervisor Approve

↓

08:45 HR Verify

↓

08:50 Attendance Sync

↓

08:51 Payroll Sync

↓

08:52 Dashboard Update

↓

08:53 Audit Completed
```

---

# 17.5 Audit Permission

| Role       | View            |
| ---------- | --------------- |
| Employee   | Own Record      |
| Supervisor | Department      |
| Manager    | Department      |
| HR         | All             |
| Payroll    | Payroll Related |
| Admin      | All             |

---

# 18 Integration Architecture

---

# 18.1 Module Integration

```text
Employee Master

↓

Organization Chart

↓

Leave Module

↓

Approval Engine

↓

Notification Engine

↓

Attendance Module

↓

Payroll Module

↓

Dashboard

↓

Audit Log
```

---

# 18.2 Employee Master Integration

Receive

* Employee ID
* Name
* Department
* Position
* Company
* Join Date
* Status
* Supervisor
* Manager

Automatically synchronized.

---

# 18.3 Attendance Integration

Approved Leave automatically:

* Mark Leave
* Skip Absent
* Skip Late
* Skip OT

Cancelled Leave:

Rollback attendance automatically.

---

# 18.4 Payroll Integration

Payroll receives

* Paid Leave
* Unpaid Leave
* Sick Leave
* Maternity Leave
* Leave Deduction
* Leave Balance

Export Frequency

Monthly

Automatic

---

# 18.5 Notification Integration

Channel

* In-App
* Email
* Telegram
* Mobile Push (Future)

Trigger

* Submit
* Approve
* Reject
* Cancel
* Balance Low
* Tomorrow Leave
* Policy Update

---

# 18.6 Calendar Integration

Integrated with

* Company Calendar
* Public Holiday
* Team Calendar
* Meeting Calendar

Prevent overlapping leave.

---

# 18.7 Organization Chart Integration

Approval hierarchy automatically follows

```text
Employee

↓

Supervisor

↓

Department Manager

↓

HR

↓

Completed
```

No manual approver selection required.

---

# 18.8 Dashboard Integration

Dashboard updates automatically

* Remaining Leave
* Pending Leave
* Department Leave
* Leave Trend
* Leave Liability

Realtime.

---

# 18.9 Storage Integration

Supabase Storage

Store

* Medical Certificate
* Attachment
* Supporting Documents

Folder

```text
leave/

employee/

year/

document.pdf
```

---

# 19 User Acceptance Test (UAT)

---

# TC001

Apply Annual Leave

Expected

Approved successfully

---

# TC002

Apply Leave More Than Balance

Expected

Validation Error

Cannot Submit

---

# TC003

Apply During Holiday

Expected

Holiday skipped automatically

---

# TC004

Apply Half Day

Expected

0.5 Day

---

# TC005

Apply Sick Leave Without Attachment

Expected

Reject

Medical Required

---

# TC006

Apply Marriage Leave

Expected

Manager Approval Required

---

# TC007

Cancel Pending Leave

Expected

Cancelled

---

# TC008

Cancel Approved Leave

Expected

HR Approval Required

---

# TC009

Supervisor Reject

Expected

Employee Receive Reason

---

# TC010

Employee Edit

Expected

Resubmit

---

# TC011

Carry Forward

Expected

Automatic

Year End

---

# TC012

Attendance Sync

Expected

Attendance Updated

---

# TC013

Payroll Sync

Expected

Payroll Updated

---

# TC014

Department Calendar

Expected

Leave Display

---

# TC015

Leave Balance Update

Expected

Remaining Reduced

---

# TC016

Attachment Upload

Expected

File Saved

---

# TC017

Attachment Delete

Expected

Audit Log Created

---

# TC018

HR Adjustment

Expected

Audit Created

---

# TC019

Export Excel

Expected

Success

---

# TC020

Export PDF

Expected

Success

---

# UAT Acceptance Criteria

* 100% Test Pass
* No Critical Bug
* No Payroll Error
* No Attendance Error
* Leave Balance Accurate
* Dashboard Accurate

---

# 20 Go Live Checklist

---

## Master Data

```text
☐ Company

☐ Department

☐ Position

☐ Employee

☐ Leave Type

☐ Leave Policy

☐ Public Holiday

☐ Company Calendar

☐ Carry Forward Rule

☐ Approval Matrix

☐ Role Permission
```

---

## Integration

```text
☐ Employee Master

☐ Attendance

☐ Payroll

☐ Dashboard

☐ Audit

☐ Notification

☐ Telegram

☐ Email

☐ Storage
```

---

## Security

```text
☐ RBAC

☐ Audit

☐ Session Timeout

☐ API Security

☐ File Permission
```

---

## Reports

```text
☐ Daily Report

☐ Monthly Report

☐ Annual Report

☐ Leave Balance

☐ Leave Liability

☐ Payroll Export

☐ Department Summary
```

---

## UAT

```text
☐ HR Complete

☐ Payroll Complete

☐ Employee Complete

☐ Manager Complete

☐ PMO Sign Off
```

---

## Production

```text
☐ Database Backup

☐ Data Migration

☐ Notification Enabled

☐ Telegram Enabled

☐ Email Enabled

☐ Storage Ready

☐ Dashboard Ready

☐ Monitoring Ready

☐ Go Live
```

---

# Appendix A

## Leave Status Matrix

The module uses 7 status values for leave requests:

| # | Status                | Description |
|---|-----------------------|-------------|
| 1 | `draft`                | Initial state — request created but not yet submitted |
| 2 | `submitted`            | Submitted and awaiting approval from approver chain |
| 3 | `approved`             | Fully approved by all required approvers |
| 4 | `rejected`             | Rejected by an approver at any step |
| 5 | `cancelled`            | Hard-cancelled (administrative action) |
| 6 | `withdrawn`            | Withdrawn by employee (from submitted) OR cancellation approved |
| 7 | `pending_cancellation` | Employee requested cancellation of an approved leave; awaiting approver decision |

### Status Transition Diagram

```
                  ┌──────────┐
                  │  draft   │
                  └────┬─────┘
                       │ submit
                       ▼
                  ┌──────────┐
         ┌───────│ submitted│───────┐
         │       └────┬─────┘       │
         │            │             │
         │ withdraw   │ approve     │ reject
         │            ▼             │
         │       ┌──────────┐       │
         │       │ approved │       │
         │       └────┬─────┘       │
         │            │             │
         │  request   │ cancel      │
         │  cancel    ▼             │
         │       ┌────────────────┐ │
         │       │pending_cancell.│ │
         │       └───┬───────┬────┘ │
         │           │       │      │
         │    approve│deny   │      │
         │           ▼       ▼      │
         │       ┌──────────┐       │
         └──────▶│withdrawn │  ┌──────────┐
                 └──────────┘  │ rejected │
                               └──────────┘
                                       │
                              employee │ edit
                                       ▼
                                  ┌──────────┐
                                  │  draft   │
                                  └──────────┘
```

### Standard Flow — Apply & Approve

```
Draft → Submitted → Approved → Completed
```

### Reject Flow

```
Submitted → Rejected → Draft (employee edits) → Submitted (resubmit)
```

### Withdraw Flow (for submitted/pending requests)

```
Submitted → Withdrawn
```

- Employee action, no approval required
- Leaves, attendance, and payroll unaffected (never synced)
- All assigned approvers notified

### Cancel Flow (for approved requests)

```
Approved → Pending Cancellation → Withdrawn  (if approved by approver)
                                → Approved    (if denied by approver)
```

- Employee initiates with a cancellation reason
- Approver reviews and decides
- On approval: balance restored, attendance rollback, payroll flag set
- On denial: request reverts to approved — no change

---

# Appendix B

## Leave Policy Matrix

| Type          | Paid | Attachment | Carry Forward |
| ------------- | ---- | ---------- | ------------- |
| Annual        | YES  | NO         | YES           |
| Sick          | YES  | YES        | NO            |
| Marriage      | YES  | YES        | NO            |
| Paternity     | YES  | YES        | NO            |
| Maternity     | YES  | YES        | NO            |
| Compassionate | YES  | YES        | NO            |
| Study         | YES  | YES        | NO            |
| Emergency     | YES  | NO         | NO            |
| Unpaid        | NO   | NO         | NO            |
| Special       | YES  | YES        | Configurable  |

---

# Appendix C

## Configuration Parameters

```text
Annual Leave Days

Carry Forward

Maximum Carry

Half Day Enable

Hourly Leave Enable

Medical Attachment Required

Approval Level

Auto Payroll Sync

Auto Attendance Sync

Holiday Skip

Weekend Skip

Leave Blackout Period

Delegate Required

Cancellation Limit

Notice Period
```

---

# Appendix D

# Future Enhancement (R2)

Enterprise Features

* Multi Company
* Multi Country
* Cambodia Labor Law Configuration
* AI Leave Recommendation
* Leave Forecast
* Leave Liability Cost
* Team Manpower Impact
* Project Leave Conflict Detection
* Resource Planning Integration
* Auto Replacement Assignment
* Mobile App
* OCR Medical Certificate
* Face Recognition Verification
* Biometric Integration
* HR Analytics
* Executive Dashboard
* AI Chatbot Leave Assistant
* Telegram Mini App
* Offline Mobile Support

---

# End of Document

**DCOS_HR_ELeave_Module_Design_R1**

**Status:** Enterprise PMO Functional Specification

**Revision:** R1

**Prepared For:** Digital Construction Operating System (DCOS)

**Next Module:** DCOS_HR_Attendance_Module_Design_R1
