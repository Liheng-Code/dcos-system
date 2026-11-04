# DCOS_HR_ELeave_Module_Design_R1_Part2.md

---

# Digital Construction Operating System (DCOS)

# HR Management Module

# E-Leave Management Module Design (R1)

## Part 2

---

# Table of Contents

11. UI/UX Screen Design

12. Database ERD

13. Data Dictionary

14. REST API Specification

15. Dashboard & KPI

16. Reports & Analytics

---

# 11. UI / UX Screen Design

---

# 11.1 Screen List

```text
HR Dashboard

Employee Dashboard

My Leave

Apply Leave

Leave Detail

Leave Calendar

Approval Inbox

Approval Detail

Leave Balance

Leave History

Leave Type Setup

Holiday Calendar

Carry Forward Setup

Policy Setup

HR Adjustment

Leave Report

Admin Configuration
```

---

# 11.2 Employee Dashboard

```text
+------------------------------------------------+

Welcome Liheng

Annual Leave
15 Days

Used
6 Days

Remaining
9 Days

Pending Approval
2

Upcoming Leave
15-Aug-2026

[ Apply Leave ]

--------------------------------------------

Recent Leave

✓ Annual Leave

✓ Sick Leave

✓ Marriage Leave

--------------------------------------------

Calendar

--------------------------------------------

```

---

# 11.3 Apply Leave Screen

```text
+--------------------------------+

Leave Type

[Dropdown]

Annual Leave

--------------------------------

Start Date

[Calendar]

--------------------------------

End Date

[Calendar]

--------------------------------

Total Days

Auto Calculate

--------------------------------

Reason

[Textbox]

--------------------------------

Attachment

Upload File

--------------------------------

Delegate Person

Dropdown

--------------------------------

[ Save Draft ]

[ Submit ]

+--------------------------------+
```

---

# 11.4 Approval Inbox

```text
+------------------------------------------------+

Pending Leave Approval

Employee

Type

Days

Status

Action

-----------------------------------------------

Sokha

Annual

2

Pending

Approve

Reject

-----------------------------------------------

Chan

Sick

1

Pending

Approve

Reject

-----------------------------------------------

```

---

# 11.5 Leave Calendar

```text
Monthly Calendar

July 2026

M T W T F S S

1

2

3

4

5

6

7

8

9

10

Liheng

Annual

11

12

13

14

Sokha

Sick

15

16

17

18

```

Color Legend

Green = Annual

Red = Sick

Blue = Maternity

Yellow = Special

Gray = Holiday

---

# 11.6 HR Leave Balance Screen

```text
Employee

Annual

Used

Remain

Carry

------------------------------------

Liheng

15

5

10

2

Sokha

15

10

5

0

Chan

15

3

12

1

```

---

# 11.7 Leave Policy Screen

Configure

* Annual Leave
* Sick Leave
* Unpaid Leave
* Marriage Leave
* Paternity Leave
* Maternity Leave
* Compassionate Leave
* Study Leave
* Emergency Leave

Configure

* Max Days
* Attachment Required
* Carry Forward
* Approval Level
* Payroll Deduction
* Attendance Sync

---

# 12 Database ERD

---

## Main Tables

```text
employees

departments

positions

leave_types

leave_policy

leave_balance

leave_request

leave_attachment

leave_approval

leave_history

leave_delegate

leave_notification

public_holiday

company_calendar

audit_log
```

---

## ER Relationship

```text
Employee

↓

Leave Balance

↓

Leave Request

↓

Leave Approval

↓

Leave History

↓

Payroll

↓

Attendance

```

---

# 13 Data Dictionary

---

## leave_types

| Field               | Type    |
| ------------------- | ------- |
| id                  | UUID    |
| code                | VARCHAR |
| name                | VARCHAR |
| max_days            | INT     |
| attachment_required | BOOLEAN |
| carry_forward       | BOOLEAN |
| active              | BOOLEAN |

---

## leave_balance

| Field         | Type    |
| ------------- | ------- |
| id            | UUID    |
| employee_id   | UUID    |
| year          | INT     |
| opening       | DECIMAL |
| used          | DECIMAL |
| remaining     | DECIMAL |
| carry_forward | DECIMAL |

---

## leave_request

| Field                    | Type        | Description |
| ------------------------ | ----------- | ----------- |
| id                       | UUID        | Primary key |
| employee_id              | UUID        | FK to profiles (person on leave) |
| leave_type_id            | UUID        | FK to leave_types |
| start_date               | DATE        | Leave start date |
| end_date                 | DATE        | Leave end date |
| days_requested           | NUMERIC     | Calculated total days (supports 0.5) |
| reason                   | TEXT        | Leave reason |
| status                   | VARCHAR     | Workflow status (see Appendix A) |
| submission_date          | TIMESTAMPTZ | When the request was submitted |
| requested_by_id          | UUID        | FK to profiles (person who submitted) |
| approver_1_id            | UUID        | First approver |
| approver_1_status        | TEXT        | pending / approved / rejected |
| approver_1_date          | TIMESTAMPTZ | First approval/rejection timestamp |
| approver_1_notes         | TEXT        | First approver's comment |
| approver_2_id            | UUID        | Second approver |
| approver_2_status        | TEXT        | pending / approved / rejected |
| approver_2_date          | TIMESTAMPTZ | Second approval/rejection timestamp |
| approver_2_notes         | TEXT        | Second approver's comment |
| attachments              | TEXT[]      | Array of file paths/URLs |
| is_half_day              | BOOLEAN     | Whether this is a half-day request |
| half_day_period          | TEXT        | morning / afternoon (when is_half_day = true) |
| cancellation_reason      | TEXT        | Reason provided by employee when requesting cancellation |
| cancellation_date        | TIMESTAMPTZ | When cancellation was requested |
| cancellation_approved_by | UUID        | FK to profiles (approver who approved the cancellation) |
| withdrawal_date          | TIMESTAMPTZ | When the request was withdrawn by employee |
| payroll_reversal_needed  | BOOLEAN     | Flag for payroll to reverse deduction on cancellation |
| created_at               | TIMESTAMPTZ | Record creation timestamp |
| updated_at               | TIMESTAMPTZ | Record last-updated timestamp |

---

## leave_attachment

| Field            | Type      |
| ---------------- | --------- |
| id               | UUID      |
| leave_request_id | UUID      |
| file_name        | VARCHAR   |
| storage_url      | TEXT      |
| uploaded_by      | UUID      |
| uploaded_at      | TIMESTAMP |

---

## leave_approval

| Field            | Type      |
| ---------------- | --------- |
| id               | UUID      |
| leave_request_id | UUID      |
| approver_id      | UUID      |
| level            | INT       |
| status           | VARCHAR   |
| comment          | TEXT      |
| approved_at      | TIMESTAMP |

---

## public_holiday

| Field        | Type    |
| ------------ | ------- |
| id           | UUID    |
| holiday_name | VARCHAR |
| holiday_date | DATE    |
| company_id   | UUID    |

---

# 14 REST API Specification

---

## Employee

```text
GET /api/leave/balance

GET /api/leave/history

GET /api/leave/calendar

POST /api/leave

PUT /api/leave/:id

DELETE /api/leave/:id
```

---

## Approval

```text
GET /api/leave/pending

POST /api/leave/approve

POST /api/leave/reject

POST /api/leave/cancel
```

---

## HR

```text
GET /api/leave/report

GET /api/leave/policy

POST /api/leave/policy

PUT /api/leave/policy

GET /api/holiday

POST /api/holiday
```

---

## Payroll Integration

```text
GET /api/payroll/leave-export

GET /api/payroll/leave-summary
```

---

## Attendance Integration

```text
POST /api/attendance/sync-leave

POST /api/attendance/cancel-leave
```

---

# 15 Dashboard & KPI

---

# 15.1 HR Dashboard

```text
--------------------------------

Today's Leave

15

Pending

4

Approved

21

Rejected

2

--------------------------------

Remaining Annual Leave

245 Days

--------------------------------

Upcoming Leave

8 Employees

--------------------------------

Department Leave Rate

Design

15%

Construction

8%

Procurement

5%

--------------------------------

```

---

# 15.2 Employee Dashboard

```text
Annual Leave

15

Used

6

Remain

9

Pending

2

Approved

5

History

View

```

---

# 15.3 KPI

| KPI                 | Formula           |
| ------------------- | ----------------- |
| Approval Time       | Average Hours     |
| Leave Rate          | Leave/Employee    |
| Sick Leave Rate     | Sick Days/Month   |
| Rejection Rate      | Rejected/Total    |
| Balance Utilization | Used/Entitlement  |
| Department Leave %  | Leave/Dept Staff  |
| Carry Forward       | Carry/Entitlement |

---

# 15.4 Executive Dashboard

Show

* Leave Trend
* Department Leave
* Absentee Rate
* Leave Liability
* Monthly Leave
* Sick Leave Trend
* Leave Cost
* Approval SLA
* Top Leave Users
* Upcoming Leave

---

# 16 Reports & Analytics

---

## Standard Reports

* Daily Leave Report
* Weekly Leave Report
* Monthly Leave Report
* Yearly Leave Report
* Employee Leave History
* Leave Balance Report
* Leave Carry Forward Report
* Leave Liability Report
* Leave Approval Report
* Leave Rejection Report
* Leave Cancellation Report
* Department Leave Summary
* Sick Leave Summary
* Annual Leave Summary
* Payroll Leave Export
* Attendance Leave Export

---

## Export Format

Supported

```text
PDF

Excel

CSV

Print

Email

API

```

---

## Scheduled Reports

Automatically Generate

* Daily 8:00 AM

* Weekly Monday

* Monthly End Month

* Annual Closing

---

## Analytics

Trend Analysis

Department Comparison

Leave Heatmap

Leave Forecast

Leave Cost Analysis

Leave Liability

Approval SLA

Manager Performance

Employee Leave Ranking

Leave Distribution

---

# End of Part 2

Next Document

```text
DCOS_HR_ELeave_Module_Design_R1_Part3.md

17 Audit Log Design

18 Integration Architecture

19 UAT Test Cases

20 Go Live Checklist
```
