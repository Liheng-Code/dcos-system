# DCOS_HR_ELeave_Probation_Policy_Design_R1.md

# Digital Construction Operating System (DCOS)

# HR Management Module

# E-Leave Probation Policy Design

Revision R1

---

# 1. Purpose

This document defines the business rules, workflow, database design, approval logic, and system behavior for **employees under probation period** in the DCOS E-Leave Management Module.

The objective is to ensure leave management complies with company policy while maintaining fairness and preventing misuse during probation.

---

# 2. Business Background

Employees under probation normally have different leave entitlements compared to permanent employees.

Different companies may have different policies:

* No Annual Leave during probation
* Annual Leave accrues but cannot be used
* Sick Leave allowed
* Unpaid Leave allowed
* Special Leave requires HR approval

Therefore, DCOS shall support **configurable probation leave policies**, rather than hard-coded logic.

---

# 3. Business Objectives

The system shall:

* Detect employee probation status automatically
* Apply probation leave policy
* Restrict unavailable leave types
* Allow configurable leave rules
* Integrate with payroll
* Integrate with attendance
* Generate audit logs
* Support future policy changes without programming

---

# 4. Employee Status Classification

| Status    | Description                     |
| --------- | ------------------------------- |
| Probation | Employee under probation period |
| Confirmed | Permanent employee              |
| Contract  | Fixed-term employee             |
| Temporary | Temporary employee              |
| Intern    | Internship employee             |
| Resigned  | Inactive employee               |

The leave engine shall determine policy based on Employee Status.

---

# 5. Recommended DCOS Policy

## During Probation

| Leave Type          | Allowed                  |
| ------------------- | ------------------------ |
| Annual Leave        | No                       |
| Sick Leave          | Yes                      |
| Unpaid Leave        | Yes                      |
| Marriage Leave      | No                       |
| Compassionate Leave | Yes                      |
| Emergency Leave     | Yes                      |
| Maternity Leave     | According Company Policy |
| Paternity Leave     | According Company Policy |
| Study Leave         | No                       |
| Special Leave       | HR Approval              |

---

# 6. Alternative Enterprise Policies

## Policy A

No Leave During Probation

Suitable for:

* Manufacturing
* Factory
* Construction Site

---

## Policy B

Annual Leave Accrues but Cannot Use

Suitable for:

* International Company
* Enterprise ERP

Recommended for DCOS.

---

## Policy C

Limited Annual Leave

Example

Maximum 2 Days

Require HR Approval

---

## Policy D

Same as Permanent

Rarely Used

---

# 7. Recommended DCOS Logic

Annual Leave shall accrue monthly but remain locked until employee confirmation.

Example

Annual Leave

18 Days

Monthly Accrual

18 ÷ 12

=

1.5 Days

---

Employee

Join Date

01-Jan-2026

Probation

3 Months

Confirmation

01-Apr-2026

| Month    | Accrued  | Available |
| -------- | -------- | --------- |
| January  | 1.5      | 0         |
| February | 1.5      | 0         |
| March    | 1.5      | 0         |
| April    | Unlocked | 4.5       |

Employee receives accumulated balance after confirmation.

---

# 8. Business Workflow

```text
Employee Login

↓

Check Employment Status

↓

Probation ?

↓

YES

↓

Read Probation Policy

↓

Leave Type Allowed ?

↓

YES

↓

Submit

↓

Approval

↓

Attendance

↓

Payroll

↓

Complete

↓

NO

↓

Show Error

Cannot Apply
```

---

# 9. Leave Validation Engine

Validation Sequence

```text
Check Status

↓

Check Probation

↓

Check Leave Type

↓

Check Balance

↓

Check Holiday

↓

Check Weekend

↓

Check Overlap

↓

Check Attachment

↓

Submit
```

---

# 10. Example Validation

Employee

Probation

Apply Annual Leave

System

```text
Probation

↓

Annual Leave Not Allowed

↓

Reject

↓

Display Message
```

Message

```text
Annual Leave cannot be used during probation period.

Please contact HR.
```

---

Employee

Probation

Apply Sick Leave

System

```text
Probation

↓

Sick Leave Allowed

↓

Medical Required

↓

Submit
```

---

# 11. Employee Master Update

Add Fields

| Field                | Type    |
| -------------------- | ------- |
| employment_status    | VARCHAR |
| probation_start_date | DATE    |
| probation_end_date   | DATE    |
| confirmation_date    | DATE    |
| confirmed_by         | UUID    |

---

# 12. Database Design

New Table

```text
leave_employment_policy
```

| Field               | Type      |
| ------------------- | --------- |
| id                  | UUID      |
| employment_status   | VARCHAR   |
| leave_type          | VARCHAR   |
| allowed             | BOOLEAN   |
| requires_hr         | BOOLEAN   |
| requires_attachment | BOOLEAN   |
| monthly_accrual     | BOOLEAN   |
| usable              | BOOLEAN   |
| created_at          | TIMESTAMP |

---

# 13. Policy Configuration Screen

HR

↓

Configuration

↓

Leave Policy

↓

Employment Status Policy

| Status    | Annual | Sick | Unpaid | Marriage |
| --------- | ------ | ---- | ------ | -------- |
| Probation | NO     | YES  | YES    | NO       |
| Permanent | YES    | YES  | YES    | YES      |
| Contract  | YES    | YES  | YES    | YES      |
| Intern    | NO     | YES  | YES    | NO       |

HR can configure without programming.

---

# 14. Confirmation Process

```text
Employee

↓

Complete Probation

↓

Manager Confirm

↓

HR Approve

↓

Status Change

↓

Permanent

↓

Unlock Leave Balance

↓

Notify Employee
```

---

# 15. Leave Balance Example

Employee

Join

01-Jan-2026

Probation

3 Months

Annual Leave

18 Days

Monthly Accrual

1.5 Days

---

January

1.5

Locked

---

February

3.0

Locked

---

March

4.5

Locked

---

Confirmation

01-Apr

Unlocked

Available

4.5 Days

---

# 16. Payroll Integration

Approved Leave

↓

Payroll

Paid Leave

Unpaid Leave

Deduction

Leave Liability

Automatically updated.

---

# 17. Attendance Integration

Approved Leave

↓

Attendance

Present

Leave

Holiday

Absent

Automatically updated.

---

# 18. Notification Matrix

| Event                    | Employee | HR  | Manager |
| ------------------------ | -------- | --- | ------- |
| Probation Leave Rejected | YES      |     |         |
| Confirmation Complete    | YES      | YES | YES     |
| Leave Balance Unlocked   | YES      |     |         |
| Policy Changed           | YES      | YES | YES     |

---

# 19. Audit Log

The system records:

* Policy Read
* Leave Validation
* Rejected Leave
* Confirmation
* Unlock Balance
* Policy Change

Every transaction shall be immutable.

---

# 20. Enterprise Recommendation

For DCOS Enterprise Edition, the Leave Engine should calculate entitlement using **three policy layers**:

```text
Company Policy

↓

Employment Status Policy

↓

Seniority Policy

↓

Department Policy

↓

Project Blackout Policy

↓

Employee Leave Balance

↓

Approval Workflow
```

Example:

* Company Annual Leave = 18 Days
* Seniority = +2 Days
* Probation = Locked
* Project Critical Period = No Leave Allowed
* Final Result = Balance Exists but Leave Application Blocked

This layered policy engine allows HR to manage complex leave rules without changing source code and supports future expansion for multi-company and multi-country operations.

---

**Document Status:** PMO Functional Specification

**Module:** HR E-Leave

**Document Code:** DCOS-HR-ELV-PROBATION-R1

**Revision:** R1
