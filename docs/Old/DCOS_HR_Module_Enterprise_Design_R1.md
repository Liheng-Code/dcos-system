# DCOS_HR_Module_Enterprise_Design_R1

## Digital Construction Operating System (DCOS)

**Module:** Human Resources Information System (HRIS)
**Version:** R1
**Classification:** Enterprise Module Design
**Prepared For:** DCOS Platform
**Architecture Principle:** People → Projects → WBS → Productivity → Payroll → Cost Control

---

# 1. Purpose

The Human Resources Information System (HRIS) is responsible for managing the complete employee lifecycle inside the Digital Construction Operating System (DCOS).

The HR module serves as the central repository for employee information, organizational structure, workforce allocation, attendance, leave management, timesheets, competency tracking, recruitment, performance evaluation, and workforce analytics.

The HR module must integrate directly with:

* Project Management
* WBS Management
* Task Management
* Timesheet Management
* Payroll
* Cost Control
* Reporting & KPI

The objective is simple:

> Right people, with the right skills, assigned to the right project, at the right time.

---

# 2. Business Objectives

The HR module shall:

* Centralize employee information
* Manage organizational hierarchy
* Track employee assignments
* Monitor attendance
* Manage leave requests
* Capture timesheets
* Track competencies and certifications
* Evaluate employee performance
* Support recruitment activities
* Manage employee assets
* Provide workforce analytics

---

# 3. HR Module Structure

```text
HR Module
│
├── Organization Management
├── Employee Management
├── Resource Allocation
├── Attendance Management
├── Leave Management
├── Timesheet Management
├── Training Management
├── Competency Management
├── Performance Management
├── Recruitment Management
├── Employee Asset Management
└── Workforce Dashboard
```

---

# 4. Organization Management

## Purpose

Manage company organizational structure.

---

## Main Features

### Department Management

Examples:

```text
General Management
Design Department
Construction Department
Procurement Department
QA/QC Department
HSE Department
HR Department
Finance Department
```

### Team Management

Examples:

```text
Structural Team
Architecture Team
MEP Team
Site Team A
Site Team B
Procurement Team
```

### Position Management

Examples:

```text
CEO
General Manager
Design Manager
Senior Structural Engineer
Structural Engineer
Draftsman
Site Engineer
QA/QC Engineer
```

---

## Organization Chart

```text
CEO
│
├── General Manager
│
├── Design Department
│   ├── Structural Team
│   ├── Architecture Team
│   └── MEP Team
│
├── Construction Department
├── Procurement Department
├── QA/QC Department
├── HSE Department
├── HR Department
└── Finance Department
```

---

## Database Tables

```sql
departments
teams
positions
reporting_structure
```

---

# 5. Employee Management

## Purpose

Maintain complete employee records.

---

## Employee Profile

### Personal Information

| Field         | Description          |
| ------------- | -------------------- |
| Employee ID   | Unique employee code |
| Full Name     | Employee name        |
| Gender        | Male/Female          |
| Date of Birth | DOB                  |
| Nationality   | Country              |
| Phone         | Mobile number        |
| Email         | Company email        |
| Address       | Residential address  |
| Photo         | Employee photo       |

---

### Employment Information

| Field           | Description         |
| --------------- | ------------------- |
| Department      | Assigned department |
| Team            | Assigned team       |
| Position        | Job title           |
| Grade           | Employee grade      |
| Employment Type | Permanent/Contract  |
| Join Date       | Date joined         |
| Direct Manager  | Reporting manager   |
| Status          | Active/Inactive     |

---

### Employee Documents

```text
Employment Contract
Passport
National ID
Work Permit
Visa
Engineering License
Certificates
Training Records
```

---

## Database Tables

```sql
employees
employee_documents
employee_certifications
```

---

# 6. Resource Allocation

## Purpose

Allocate employees to projects and WBS.

This is one of the most important HR functions in DCOS.

---

## Allocation Hierarchy

```text
Employee
↓
Project
↓
Building
↓
Level
↓
Zone
↓
WBS
```

---

## Example

```text
Liheng
Project:
GDT Tower

Discipline:
Structure

Role:
Structural Lead

Assigned WBS:
Tower A
Level 05
Zone 03
```

---

## Main Features

* Project assignment
* Discipline assignment
* WBS assignment
* Resource loading
* Resource forecasting
* Availability planning

---

## Database Tables

```sql
employee_project_assignments
employee_wbs_assignments
resource_forecasts
```

---

# 7. Attendance Management

## Purpose

Track employee attendance.

---

## Attendance Methods

### Office Staff

```text
Web Check-in
Biometric Device
RFID Card
```

### Site Staff

```text
GPS Check-in
Mobile App
QR Check-in
```

---

## Attendance Status

```text
Present
Absent
Late
Leave
Holiday
Business Trip
Work From Home
Site Work
```

---

## Attendance Workflow

```text
Employee Check-In
↓
System Records Time
↓
Manager Review
↓
HR Verification
↓
Final Attendance Record
```

---

## Database Tables

```sql
attendance_records
attendance_logs
attendance_adjustments
```

---

# 8. Leave Management

## Purpose

Manage leave requests and approvals.

---

## Leave Types

```text
Annual Leave
Sick Leave
Emergency Leave
Maternity Leave
Paternity Leave
Compensation Leave
Unpaid Leave
Business Leave
```

---

## Leave Workflow

```text
Employee Request
↓
Supervisor Approval
↓
Department Manager Review
↓
HR Verification
↓
Approved / Rejected
```

---

## Database Tables

```sql
leave_requests
leave_balances
leave_types
```

---

# 9. Timesheet Management

## Purpose

Track manpower hours against projects and WBS.

This is a core module for construction companies.

---

## Example

```text
Date:
01-Jun-2026

Task:
PT Slab Review

Project:
GDT Tower

WBS:
B01-L05-Z03

Hours:
4
```

---

## Features

### Daily Timesheet

Record daily activities.

### Weekly Timesheet

Weekly summary.

### Multi-Task Allocation

Example:

```text
Morning:
Task A = 4 Hours

Afternoon:
Task B = 4 Hours
```

### Overtime Recording

```text
OT 1.5x
OT 2.0x
Holiday OT
```

---

## Workflow

```text
Employee Submit
↓
Supervisor Review
↓
HR Verify
↓
Approved
↓
Payroll Export
```

---

## Database Tables

```sql
timesheets
timesheet_entries
timesheet_approvals
```

---

# 10. Training Management

## Purpose

Track employee training history.

---

## Training Categories

```text
Safety Induction
Working at Height
Scaffolding
First Aid
BIM Training
Revit Training
Technical Training
Management Training
```

---

## Features

* Training register
* Attendance tracking
* Certificate upload
* Expiry monitoring
* Renewal reminders

---

## Database Tables

```sql
training_courses
training_records
training_certificates
```

---

# 11. Competency Management

## Purpose

Track employee skills and qualifications.

---

## Example

| Employee | Skill            |
| -------- | ---------------- |
| Tangkea  | ETABS            |
| Tangkea  | SAFE             |
| Lis      | Revit            |
| The      | AutoCAD          |
| Kosal    | BIM Coordination |

---

## Features

* Skill matrix
* Competency levels
* Certification records
* Competency gap analysis

---

## Database Tables

```sql
skills
employee_skills
competency_levels
```

---

# 12. Performance Management

## Purpose

Measure employee performance.

---

## Structural Engineer KPIs

```text
Task Completion %
Late Tasks
Drawing Output
RFI Response Time
Review Quality
```

---

## Site Engineer KPIs

```text
Inspection Pass Rate
Progress Achievement
Issue Resolution Rate
```

---

## Procurement KPIs

```text
PO Processing Time
Supplier Performance
Delivery Compliance
```

---

## Performance Workflow

```text
KPI Collection
↓
Supervisor Evaluation
↓
Manager Review
↓
Employee Feedback
↓
Final Score
```

---

## Database Tables

```sql
employee_kpis
performance_reviews
performance_scores
```

---

# 13. Recruitment Management

## Purpose

Manage hiring process.

---

## Recruitment Workflow

```text
Department Request
↓
HR Review
↓
Management Approval
↓
Candidate Search
↓
Interview
↓
Offer
↓
Hiring
↓
Onboarding
```

---

## Features

```text
Job Requisition
Candidate Database
Interview Scheduling
Offer Letter
Onboarding Checklist
```

---

## Database Tables

```sql
job_requisitions
candidates
interviews
offer_letters
```

---

# 14. Employee Asset Management

## Purpose

Track company assets assigned to employees.

---

## Asset Types

```text
Laptop
Phone
Access Card
Vehicle
PPE
Survey Equipment
```

---

## Workflow

```text
Asset Request
↓
Asset Assignment
↓
Usage Tracking
↓
Return
↓
Close
```

---

## Database Tables

```sql
employee_assets
asset_assignments
asset_returns
```

---

# 15. Workforce Dashboard

## Purpose

Provide management visibility.

---

## HR Dashboard KPIs

### Workforce Summary

```text
Total Employees
Active Employees
New Joiners
Resigned Employees
```

---

### Attendance Summary

```text
Present Today
Absent Today
Leave Today
Late Arrivals
```

---

### Resource Utilization

```text
Allocated Employees
Unallocated Employees
Project Loading %
```

---

### Timesheet Summary

```text
Total Hours
Overtime Hours
Productive Hours
Non-Productive Hours
```

---

### Competency Summary

```text
Expiring Certificates
Training Due
Skill Gaps
```

---

# 16. Integration with DCOS

## Project Module

```text
Employee
↓
Project Assignment
```

---

## WBS Module

```text
Employee
↓
WBS Assignment
```

---

## Task Module

```text
Employee
↓
Assigned Tasks
```

---

## Payroll Module

```text
Attendance
+
Leave
+
Timesheet
↓
Payroll
```

---

## Cost Control Module

```text
Timesheet
↓
Labor Cost
↓
Project Cost
```

---

# 17. Permissions

| Role               | Access            |
| ------------------ | ----------------- |
| HR Manager         | Full Access       |
| HR Officer         | HR Operations     |
| Department Manager | Team Access       |
| Project Manager    | Project Resources |
| Employee           | Own Records       |
| Admin              | Full System       |

---

# 18. Recommended MVP Build Sequence

## Phase 1

```text
Organization Management
Employee Management
Resource Allocation
Attendance
Leave
```

---

## Phase 2

```text
Timesheet
Performance KPI
```

---

## Phase 3

```text
Training
Competency
Recruitment
Asset Management
```

---

## Phase 4

```text
Payroll Integration
AI Workforce Analytics
Resource Forecasting
```

---

# 19. Final Recommendation

The HR module should focus on:

```text
People Management
Resource Management
Attendance
Leave
Timesheet
Performance
Competency
Recruitment
```

The HR module should NOT directly perform:

```text
Payroll Accounting
Financial Posting
Budget Management
Project Costing
Procurement
```

Instead:

```text
HR
↓
Timesheet
↓
Payroll
↓
Finance
↓
Project Cost Control
```

This architecture keeps HR clean, scalable, and fully aligned with the WBS-driven Digital Construction Operating System (DCOS).
