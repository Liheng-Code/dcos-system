# SOP-Attendance-System.md

# Digital Construction Operating System (DCOS)
## Standard Operating Procedure (SOP)
## Attendance Management System

Document No: DCOS-SOP-HR-ATT-001  
Module: 17-3 Attendance Management System  
Version: 1.0  
Status: Draft  
Owner: HR Manager / IT Administrator  
Effective Date: TBD

---

# 1. Purpose

The Attendance Management System provides a centralized platform to record, monitor, approve, and analyze employee attendance across office and construction sites.

The module integrates with:

- Employee Master
- Project Assignment
- E-Leave
- Payroll
- OT Management
- Cost Allocation
- Task Management
- HR Dashboard
- AI Workforce Analytics

Attendance data becomes the official source for payroll calculation and manpower reporting.

---

# 2. Scope

Applicable to:

```
Office Staff

Site Engineers

Site Supervisors

Foremen

Workers

Managers

Contract Employees

Interns

Consultants
```

Supports:

```
Office

Construction Site

Remote Work

Business Trip

Multiple Project Sites
```

---

# 3. Objectives

The Attendance Module shall:

✓ Record attendance automatically

✓ Reduce attendance fraud

✓ Support multi-site operations

✓ Support payroll calculation

✓ Support labor cost allocation

✓ Support manpower analysis

✓ Support OT calculation

✓ Support AI manpower forecasting

---

# 4. Attendance Architecture

```
Employee Master
        │
        ▼
Attendance
        │
        ├── Clock In
        ├── Clock Out
        ├── Break
        ├── OT
        ├── Leave
        ├── Business Trip
        └── Work From Home
        │
        ▼
Payroll
        │
        ▼
Finance
```

---

# 5. Attendance Sources

The system shall support multiple attendance methods.

## Mobile App

```
GPS
Photo
Timestamp
```

---

## QR Code

```
Site QR

Office QR
```

---

## Face Recognition

```
AI Face Recognition

Liveness Detection
```

---

## Fingerprint Machine

```
Biometric Device

Real-time Sync
```

---

## RFID Card

```
Employee Card

Gate Reader
```

---

## Manual Entry

HR Authorized Only.

---

## Telegram Bot

```
/checkin

/checkout
```

Location verified automatically.

---

# 6. Daily Attendance Workflow

```
Employee

↓

Clock In

↓

GPS Verification

↓

Photo Verification

↓

Attendance Saved

↓

Working

↓

Break

↓

Return

↓

Clock Out

↓

Attendance Completed

↓

Payroll Calculation
```

---

# 7. Attendance Status

| Status | Description |
|----------------|----------------|
| Present | Normal attendance |
| Late | Late arrival |
| Early Leave | Left before schedule |
| Absent | No attendance |
| Leave | Approved leave |
| Business Trip | Official assignment |
| WFH | Work From Home |
| Holiday | Public Holiday |
| Weekend | Weekend |
| OT | Overtime |

---

# 8. Clock In Rules

Employee may:

```
Clock In

Once per day
```

System records:

```
Employee

Date

Time

GPS

Photo

Device

IP

Project

Location
```

---

# 9. Clock Out Rules

System records:

```
Time

GPS

Photo

Working Hours

OT

Location
```

---

# 10. GPS Validation

Every attendance record stores:

```
Latitude

Longitude

Address

Accuracy

Distance from Site
```

Rules:

```
Within 100m

Success
```

Outside:

```
Manager Approval Required
```

---

# 11. Selfie Verification

Optional:

```
Employee Photo

Face Match

Liveness Detection
```

Prevent buddy punching.

---

# 12. Working Calendar

Supports:

```
Monday-Friday

Monday-Saturday

Shift Work

24 Hours

Custom Calendar
```

---

# 13. Working Hours

Example

```
08:00

↓

12:00

Lunch

↓

13:00

↓

17:00
```

Configurable.

---

# 14. Shift Management

Supports:

```
Morning

Afternoon

Night

Rotation

Custom Shift
```

---

# 15. Break Management

Example

```
Lunch

12:00-13:00
```

Or

```
Tea Break

15 Minutes
```

Automatically excluded.

---

# 16. Late Calculation

Example

```
Office Start

08:00

Employee

08:15

Late

15 Minutes
```

---

# 17. Early Leave

Example

```
Office End

17:00

Employee

16:30

Early Leave

30 Minutes
```

---

# 18. Overtime Management

Workflow

```
Employee

↓

Request OT

↓

Manager Approval

↓

OT Recorded

↓

Payroll
```

---

# 19. OT Categories

```
Weekday OT

Weekend OT

Holiday OT

Night OT
```

Each uses different multiplier.

---

# 20. Construction Site Attendance

Supports:

```
Site A

Site B

Site C

Warehouse

Factory

Office
```

Automatically detected by GPS.

---

# 21. Multi Project Assignment

Engineer may work:

```
Morning

Project A

Afternoon

Project B
```

Attendance allocates cost proportionally.

---

# 22. Timesheet

Daily:

```
08:00-12:00

Foundation

4 Hours
```

```
13:00-17:00

Tower

4 Hours
```

Linked to:

```
Project

WBS

Task

Cost Code
```

---

# 23. Attendance Correction

Workflow

```
Employee

↓

Correction Request

↓

Manager Review

↓

HR Approval

↓

Attendance Updated
```

Audit trail mandatory.

---

# 24. Missing Attendance

Workflow

```
Missing Check In

↓

Employee Request

↓

Manager Approval

↓

HR Review

↓

Correction
```

---

# 25. Business Trip

Workflow

```
Employee

↓

Request

↓

Approval

↓

Attendance Auto Created
```

---

# 26. Work From Home

Workflow

```
Employee

↓

WFH Request

↓

Approval

↓

Clock In

↓

GPS

↓

Photo

↓

Attendance
```

---

# 27. Leave Integration

Approved leave automatically creates:

```
Leave Attendance
```

No duplicate attendance allowed.

---

# 28. Payroll Integration

Attendance automatically calculates:

```
Working Days

Late

Absent

OT

Leave

Holiday

Penalty
```

Payroll consumes attendance.

---

# 29. Cost Allocation

Attendance allocated to:

```
Project

Building

Level

WBS

Task

Cost Code
```

Supports project labor cost reporting.

---

# 30. Attendance Dashboard

HR Dashboard

```
Present

Late

Absent

Leave

OT

Attendance Rate
```

---

Project Manager Dashboard

```
Today's Manpower

Project Attendance

Absent Engineers

Late Engineers

OT Workers
```

---

Executive Dashboard

```
Total Employees

Attendance %

Labor Cost

OT Cost

Absent Rate

Turnover
```

---

# 31. AI Analytics

AI automatically detects:

```
Frequent Late

Frequent Absent

Attendance Fraud

High OT

Site Manpower Shortage

Project Labor Risk
```

AI recommends:

```
Replace Staff

Transfer Engineer

Reduce OT

Increase Labor

Optimize Resources
```

---

# 32. Notifications

Notify:

```
Late Arrival

Absent

Missing Checkout

OT Pending

Correction Pending

Business Trip Approved
```

Recipients:

```
Employee

Manager

HR

Project Manager
```

---

# 33. Audit Requirements

Log:

```
Clock In

Clock Out

GPS Change

Attendance Edit

Attendance Correction

OT Approval

WFH Approval

Leave Sync
```

Audit logs cannot be deleted.

---

# 34. Permission Matrix

| Role | View | Clock | Edit | Approve |
|-----------------|------------|------------|------------|------------|
| HR Admin | Yes | Yes | Yes | Yes |
| HR Officer | Yes | Yes | Yes | Yes |
| Manager | Team | Team | No | Team |
| Project Manager | Project | No | No | Project |
| Employee | Self | Self | Request | Self |

---

# 35. Database Tables

## attendance

```
id

employee_id

attendance_date

clock_in

clock_out

status

gps_lat

gps_lng

photo_url
```

---

## attendance_breaks

```
id

attendance_id

break_start

break_end
```

---

## overtime_requests

```
id

employee_id

project_id

hours

status
```

---

## attendance_corrections

```
id

attendance_id

reason

requested_by

approved_by
```

---

## attendance_timesheets

```
id

attendance_id

project_id

wbs_id

task_id

hours
```

---

# 36. API Endpoints

```
GET /attendance

POST /attendance/checkin

POST /attendance/checkout

POST /attendance/break

POST /attendance/correction

POST /attendance/ot

GET /attendance/report

GET /attendance/dashboard
```

---

# 37. UI Screens

## Attendance Dashboard

Displays:

```
Present

Absent

Late

Leave

OT

Today's Manpower
```

---

## Attendance Register

Columns:

```
Employee

Project

Clock In

Clock Out

Working Hours

OT

Status
```

---

## Daily Attendance Map

Displays:

```
GPS Locations

Office

Site A

Site B

Site C
```

---

## Timesheet Screen

Displays:

```
Project

WBS

Task

Hours

Remarks
```

---

## Attendance Approval Screen

Displays:

```
Corrections

OT

WFH

Business Trip

Approval Status
```

---

# 38. KPI Reports

```
Attendance Rate

Late Rate

Absent Rate

OT Hours

Labor Utilization

Project Manpower

Attendance by Department

Attendance by Project

Attendance by Site
```

---

# 39. Governance Rules

1. Attendance cannot exist without Employee Master.
2. Attendance cannot exist after employee termination.
3. Attendance cannot overlap approved leave.
4. Attendance corrections require approval.
5. Payroll uses approved attendance only.
6. GPS validation is mandatory for mobile attendance.
7. Attendance edits require audit logging.
8. Project labor allocation must equal recorded working hours.

---

# 40. Definition of Done

Attendance Module is complete when:

```
✓ Clock In Works

✓ Clock Out Works

✓ GPS Validation Works

✓ Face Verification Works

✓ QR Attendance Works

✓ OT Works

✓ Leave Integration Works

✓ Payroll Integration Works

✓ Cost Allocation Works

✓ Dashboard Works

✓ Reports Work

✓ Notifications Work

✓ Audit Logs Work

✓ AI Analytics Work
```

---

# 41. Final Statement

The Attendance Management System is the workforce execution engine of DCOS.

It connects employees to projects, projects to labor cost, labor cost to payroll, and payroll to finance.

Every hour worked, every overtime request, every leave record, and every manpower allocation should originate from this module to ensure complete transparency, accountability, and enterprise-grade workforce management across all construction projects.