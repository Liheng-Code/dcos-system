# SOP-Employee-Master.md

# Digital Construction Operating System (DCOS)

## Standard Operating Procedure

## Employee Master Module

Document No: DCOS-SOP-HR-EMP-001
Module: 17-1 Employee Master
Version: 1.0
Status: Draft / For Review
Owner: HR Manager
Effective Date: TBD

---

# 1. Purpose

The purpose of this SOP is to define the standard process for creating, maintaining, approving, updating, transferring, suspending, resigning, terminating, and archiving employee records inside DCOS.

The Employee Master module is the single source of truth for all employee information used by:

* HR
* Attendance
* E-Leave
* Payroll
* Project Assignment
* Task Assignment
* Cost Allocation
* User Management
* Role Permission
* Reporting

No employee-related module shall create a separate employee record outside the Employee Master.

---

# 2. Scope

This SOP applies to all employee types:

```text
Full-Time Staff
Part-Time Staff
Daily Worker
Monthly Worker
Probation Employee
Intern
Consultant
Site Labor
Project-Based Employee
Contract Employee
```

This SOP applies to all departments:

```text
Management
Engineering
Architecture
Structure
MEP
Planning
QS / Commercial
Procurement
Construction
QAQC
HSE
HR
Finance
Document Control
Admin
IT
```

---

# 3. Objectives

The Employee Master module shall ensure:

* One employee has one official record.
* Employee information is accurate and controlled.
* Employee status is traceable.
* Payroll uses approved employee data only.
* Attendance and leave link to active employees only.
* Project labor cost can be allocated correctly.
* Employee history is retained for audit and compliance.

---

# 4. Employee Lifecycle

```text
Candidate / New Joiner
        ↓
Create Employee Draft
        ↓
HR Review
        ↓
Manager Approval
        ↓
Employee Activated
        ↓
Department / Project Assignment
        ↓
Ongoing Update
        ↓
Transfer / Promotion / Salary Change
        ↓
Resignation / Termination
        ↓
Final Clearance
        ↓
Archived Employee
```

---

# 5. Roles and Responsibilities

| Role                      | Responsibility                                                    |
| ------------------------- | ----------------------------------------------------------------- |
| HR Officer                | Create and update employee draft records                          |
| HR Manager                | Review and approve employee records                               |
| Department Manager        | Confirm position, reporting line, and department assignment       |
| Project Manager           | Confirm project assignment if employee is project-based           |
| Finance / Payroll Officer | Verify salary and bank information                                |
| System Administrator      | Link employee record to user account if system access is required |
| Employee                  | Provide correct personal documents and information                |
| Platform Owner            | Monitor compliance and approve exceptional changes                |

---

# 6. Employee Record Categories

## 6.1 Personal Information

Required fields:

```text
Employee Code
Full Name
Gender
Date of Birth
Nationality
Marital Status
Photo
Phone Number
Email
Current Address
Emergency Contact Name
Emergency Contact Phone
```

---

## 6.2 Employment Information

Required fields:

```text
Company
Department
Team
Position
Job Grade
Employment Type
Employment Status
Join Date
Probation End Date
Reporting Manager
Work Location
```

---

## 6.3 Payroll Information

Restricted access.

Required fields:

```text
Basic Salary
Allowance
Payment Method
Bank Name
Bank Account Number
Tax Status
NSSF Status
Dependent Information
Payroll Group
```

---

## 6.4 Project Assignment Information

Required if employee is assigned to project.

```text
Project
WBS / Site Location
Project Role
Assignment Start Date
Assignment End Date
Cost Allocation %
```

---

## 6.5 Compliance and Documents

Attachments:

```text
National ID / Passport
Employment Contract
CV
Certificates
Work Permit if applicable
Driving License if applicable
Professional License if applicable
Bank Information
Tax Declaration
NSSF Registration
```

---

# 7. Employee Code Standard

Format:

```text
EMP-YYYY-00001
```

Example:

```text
EMP-2026-00001
```

Employee code is permanent and cannot be reused.

---

# 8. Employee Status Definitions

| Status           | Meaning                                         |
| ---------------- | ----------------------------------------------- |
| Draft            | Record created but not approved                 |
| Pending Approval | Waiting for HR Manager approval                 |
| Active           | Employee is active and available for modules    |
| Probation        | Employee is active but under probation          |
| Suspended        | Temporarily blocked from work/system activities |
| Resigned         | Employee resigned and is in clearance process   |
| Terminated       | Employment ended by company decision            |
| Archived         | Historical read-only record                     |

---

# 9. Employee Creation Procedure

## Step 1: Create Draft Employee

HR Officer creates employee draft.

Mandatory fields before save:

```text
Full Name
Department
Position
Employment Type
Join Date
Reporting Manager
Phone Number
```

Status:

```text
Draft
```

---

## Step 2: Upload Required Documents

Minimum attachments:

```text
ID / Passport
Employment Contract
CV
Bank Information
```

---

## Step 3: Submit for Review

HR Officer submits the record.

Status changes:

```text
Draft → Pending Approval
```

Notification sent to:

```text
HR Manager
Department Manager
Payroll Officer if salary data entered
```

---

## Step 4: Review and Approval

HR Manager checks:

```text
Personal Information
Employment Information
Salary Information
Document Completeness
Duplicate Employee Check
```

Department Manager confirms:

```text
Department
Position
Reporting Manager
Work Location
```

Payroll Officer confirms:

```text
Salary
Bank
Tax
NSSF
```

---

## Step 5: Activate Employee

After approval:

```text
Pending Approval → Active
```

System enables employee for:

```text
Attendance
Leave
Payroll
Project Assignment
Task Assignment
Reporting
```

---

# 10. Employee Duplicate Control

Before creating a new employee, system must check:

```text
Full Name
Phone Number
Email
National ID / Passport Number
Bank Account Number
```

If possible duplicate exists:

```text
System Warning
↓
HR Manager Review
↓
Approve Duplicate / Reject Creation
```

---

# 11. Employee Update Procedure

Employee data updates are classified into 3 levels.

## Level 1: Normal Update

Examples:

```text
Phone Number
Address
Emergency Contact
Photo
```

Approval:

```text
HR Officer
```

---

## Level 2: Controlled Update

Examples:

```text
Department
Position
Reporting Manager
Employment Type
Project Assignment
```

Approval:

```text
HR Manager + Department Manager
```

---

## Level 3: Sensitive Update

Examples:

```text
Basic Salary
Allowance
Bank Account
Tax Status
NSSF Status
Employment Status
```

Approval:

```text
HR Manager + Finance / Payroll Manager
```

All sensitive updates must create an audit log.

---

# 12. Department Transfer Procedure

Workflow:

```text
Transfer Request
        ↓
Current Manager Review
        ↓
New Manager Approval
        ↓
HR Approval
        ↓
Effective Date
        ↓
Employee Record Updated
```

System must update:

```text
Department
Team
Position if applicable
Reporting Manager
Permission Role if applicable
Project Assignment if applicable
```

---

# 13. Project Assignment Procedure

Used when employee joins a project team.

Workflow:

```text
Select Employee
        ↓
Select Project
        ↓
Define Project Role
        ↓
Define Cost Allocation %
        ↓
Approve Assignment
        ↓
Activate Project Access
```

Rules:

* One employee may belong to multiple projects.
* Total cost allocation should not exceed 100% unless approved.
* Project assignment must have start date.
* End date is required for temporary assignment.

---

# 14. Employee User Account Link

If employee requires DCOS login:

```text
Employee Master
        ↓
Create User Account
        ↓
Assign Role
        ↓
Assign Project Access
        ↓
Activate Login
```

Rules:

* Employee record and user account are linked.
* Disabling employee must also trigger user access review.
* External users may exist as users but not necessarily employees.

---

# 15. Salary Change Procedure

Salary change may occur due to:

```text
Promotion
Annual Increment
Adjustment
Correction
Contract Renewal
```

Workflow:

```text
Salary Change Request
        ↓
HR Review
        ↓
Finance Review
        ↓
Approval
        ↓
Effective Date
        ↓
Payroll Updated
```

Rules:

* Salary changes cannot apply retroactively unless approved.
* Previous salary must remain in salary history.
* Payroll must use salary effective date.

---

# 16. Probation Management

System tracks:

```text
Join Date
Probation Duration
Probation End Date
Probation Review Status
```

Notification sent:

```text
30 Days Before Probation End
7 Days Before Probation End
On Probation End Date
```

Possible actions:

```text
Confirm Employment
Extend Probation
Terminate Employment
```

---

# 17. Contract Expiry Management

For contract employees, system tracks:

```text
Contract Start Date
Contract End Date
Renewal Status
```

Notifications:

```text
60 Days Before Expiry
30 Days Before Expiry
7 Days Before Expiry
```

Actions:

```text
Renew Contract
End Contract
Convert to Permanent
```

---

# 18. Resignation Procedure

Workflow:

```text
Resignation Submitted
        ↓
Manager Review
        ↓
HR Review
        ↓
Last Working Date Confirmed
        ↓
Clearance Process
        ↓
Final Payroll
        ↓
Archive Employee
```

Clearance items:

```text
Company Assets Returned
Pending Tasks Handover
Project Access Removed
Email / System Access Disabled
Final Salary Calculated
```

---

# 19. Termination Procedure

Workflow:

```text
Termination Decision
        ↓
HR Manager Approval
        ↓
Management Approval
        ↓
Employee Status Updated
        ↓
Access Disabled
        ↓
Clearance
        ↓
Final Payroll
        ↓
Archive
```

Status changes:

```text
Active → Terminated → Archived
```

---

# 20. Employee Archive Rule

Archived employee records:

```text
Read Only
```

Cannot be deleted because historical records are required for:

```text
Payroll History
Attendance History
Task History
Audit Trail
Project Cost History
```

---

# 21. Integration Requirements

Employee Master integrates with:

```text
User Management
RBAC
Attendance
E-Leave
Payroll
Project Setup
Task Management
Timesheet
Cost Control
Notification Engine
Audit Engine
Document Control
```

---

# 22. Notification Rules

| Trigger               | Notify                           |
| --------------------- | -------------------------------- |
| Employee created      | HR Manager                       |
| Employee approved     | HR Officer, Department Manager   |
| Employee activated    | Employee, Manager                |
| Probation near expiry | HR, Manager                      |
| Contract near expiry  | HR, Manager                      |
| Salary changed        | HR Manager, Payroll Officer      |
| Employee transferred  | Current Manager, New Manager, HR |
| Employee resigned     | HR, Manager, Payroll             |
| Employee archived     | HR, System Admin                 |

---

# 23. Audit Requirements

System must log:

```text
Create Employee
Update Employee
Approve Employee
Activate Employee
Change Department
Change Position
Change Salary
Change Bank Account
Assign Project
Suspend Employee
Resign Employee
Terminate Employee
Archive Employee
```

Audit log must show:

```text
Changed By
Changed Date
Old Value
New Value
Reason
Approval Reference
```

---

# 24. Permission Matrix

| Role               | View              | Create | Edit Normal                | Edit Sensitive   | Approve          | Archive |
| ------------------ | ----------------- | ------ | -------------------------- | ---------------- | ---------------- | ------- |
| HR Manager         | Yes               | Yes    | Yes                        | Yes              | Yes              | Yes     |
| HR Officer         | Yes               | Yes    | Yes                        | No               | No               | No      |
| Payroll Officer    | Limited           | No     | No                         | Salary/Bank only | Review           | No      |
| Department Manager | Team only         | No     | Request only               | No               | Dept approval    | No      |
| Project Manager    | Project team only | No     | Project assignment request | No               | Project approval | No      |
| Employee           | Self only         | No     | Personal request           | No               | No               | No      |
| System Admin       | Limited profile   | No     | User link only             | No               | No               | No      |

---

# 25. Database Tables

## employees

```text
id
employee_code
full_name
gender
date_of_birth
nationality
phone
email
department_id
position_id
employment_type
employment_status
join_date
probation_end_date
manager_id
created_at
created_by
updated_at
updated_by
```

---

## employee_documents

```text
id
employee_id
document_type
file_id
issue_date
expiry_date
status
```

---

## employee_salary_history

```text
id
employee_id
basic_salary
allowance
effective_date
reason
approved_by
```

---

## employee_project_assignments

```text
id
employee_id
project_id
wbs_id
project_role
allocation_percent
start_date
end_date
status
```

---

## employee_status_history

```text
id
employee_id
old_status
new_status
reason
effective_date
approved_by
```

---

# 26. API Endpoints

```text
GET     /api/employees
POST    /api/employees
GET     /api/employees/{id}
PATCH   /api/employees/{id}
POST    /api/employees/{id}/submit
POST    /api/employees/{id}/approve
POST    /api/employees/{id}/activate
POST    /api/employees/{id}/transfer
POST    /api/employees/{id}/assign-project
POST    /api/employees/{id}/salary-change
POST    /api/employees/{id}/resign
POST    /api/employees/{id}/terminate
POST    /api/employees/{id}/archive
```

---

# 27. UI Screens

## Screen 1: Employee Dashboard

Shows:

```text
Total Employees
Active Employees
Probation Employees
Contract Expiring
New Joiners
Resigned Employees
```

---

## Screen 2: Employee Register

Columns:

```text
Employee Code
Full Name
Department
Position
Manager
Status
Project
Join Date
```

---

## Screen 3: Employee Profile

Tabs:

```text
Personal Info
Employment
Payroll
Project Assignment
Documents
Leave
Attendance
Performance
Audit Log
```

---

## Screen 4: Employee Creation Wizard

Steps:

```text
Personal Info
Employment Info
Payroll Info
Documents
Review
Submit
```

---

## Screen 5: Transfer / Promotion Screen

Used for controlled employee changes.

---

## Screen 6: Contract & Probation Monitoring

Shows expiring contracts and probation reviews.

---

# 28. KPI and Reports

## HR KPIs

```text
Total Headcount
Active Headcount
New Joiners
Turnover Rate
Probation Due
Contract Expiry Due
Project Manpower Allocation
Department Headcount
```

---

## Reports

```text
Employee Master Report
Employee Movement Report
Project Manpower Report
Probation Report
Contract Expiry Report
Salary History Report
Employee Document Expiry Report
```

---

# 29. Governance Rules

1. Employee code cannot be changed.
2. Employee records cannot be deleted.
3. Salary information is restricted.
4. Bank information is restricted.
5. Active employee must have department and manager.
6. Payroll cannot process inactive employees.
7. Leave cannot be requested for archived employees.
8. Attendance cannot be recorded for archived employees.
9. Employee status changes require approval.
10. Sensitive data changes require audit log and reason.

---

# 30. Definition of Done

Employee Master module is complete when:

```text
Employee Register Exists
Employee Profile Exists
Creation Workflow Works
Approval Workflow Works
Employee ID Auto Generation Is Read Only
Status Lifecycle Works
Controlled Master Data Is Used
Cambodia Compliance Profile Exists
Project Assignment Works
WBS Assignment Works
Leave Group Setup Works
Attendance Site / Shift Setup Works
Salary History Works
Document Upload Works
Document Checklist Works
Document Expiry Reminder Works
Contract Expiry Reminder Works
Probation Review Workflow Works
Status History Works
User Account Link Works
System Access Disable / Revoke Works
Notifications Work
Audit Logs Work
HR History Logs Work
Reports Work
Permissions Work
Sensitive Data Access Is Restricted
Archive Is Read Only
```

---

# 31. R2.1 Implementation Requirements

The following items must be included in the Employee Master design before implementation is considered enterprise ready.

## 31.1 Lifecycle and Status Control

Employee records shall move through:

```text
Draft -> Pending Approval -> Active / Probation -> Suspended / Long Leave -> Resigned / Terminated / Retired / Deceased -> Archived
```

Status changes require reason, effective date, approver, old value, new value, and audit entry.

## 31.2 Employee ID Control

Employee ID shall be auto generated, read only, permanent, and never reused. Manual edit shall be blocked from all normal Employee Master screens.

## 31.3 Master Data Control

Department, team, position, grade, employment type, work location, leave group, payroll group, attendance site, shift, project role, asset type, and access group shall use controlled master data.

## 31.4 Compliance and Documents

The employee profile shall include Cambodia compliance fields for National ID, passport, visa, work permit, NSSF, TIN, employment contract, seniority start date, labor category, emergency contact, and address records.

The document tab shall show checklist completeness, verification status, expiry date, and reminder status.

## 31.5 Assignments and Setup

Employee profile shall expose direct setup for:

```text
Project Assignment
WBS Assignment
Cost Allocation
Leave Group
Attendance Site
Shift / Work Calendar
Asset Assignment
Access Control
Uniform
```

Active project and WBS allocations shall not exceed 100% unless an authorized exception is approved.

## 31.6 Audit, History, and Permissions

HR audit history shall be separate from user-management audit history and shall cover status, department, position, manager, salary, bank, tax, NSSF, project assignment, leave group, attendance setup, document verification, and system access changes.

The permission matrix shall be enforced in UI, API, and database policy. Sensitive salary, tax, NSSF, bank, identification, and document data shall be visible only to authorized roles.

## 31.7 Reports

Employee Master shall include employee master, movement, probation due, contract expiry, document expiry, certification expiry, project manpower, leave group, attendance assignment, salary history, data completeness, and audit change reports.

---

# 32. Final Statement

Employee Master is the foundation of the HR module.

Attendance depends on it.

Leave depends on it.

Payroll depends on it.

Project labor cost depends on it.

Task assignment depends on it.

If Employee Master is not controlled, every HR and payroll process becomes unreliable.

One employee.

One record.

One source of truth.
