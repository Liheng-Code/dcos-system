# DCOS_HR_Employee_Master_Document_Policy_R2.md

# Digital Construction Operating System (DCOS)

# HR Employee Master Policy & Data Governance Standard

**Document Code:** DCOS-HR-EMP-001
**Version:** R2 Enterprise Edition
**Module:** Human Resource Management → Employee Master
**Classification:** Internal Controlled Document

---

# 1. Purpose

The Employee Master Module is the **Single Source of Truth (SSOT)** for all employee information within DCOS.

Every HR, Payroll, Attendance, Leave, Project Assignment, Timesheet, Asset Assignment, and Access Control module shall reference Employee Master instead of storing duplicated employee information.

The objective is to:

* Standardize employee identification
* Standardize HR master data
* Support Cambodia Labor Law
* Support Cambodia NSSF
* Support Cambodia GDT payroll tax
* Support Payroll & Leave automation
* Support Organization Chart
* Support Project Assignment
* Support Enterprise RBAC
* Support Audit Trail

---

# 2. Employee ID Standard

## Policy

Employee ID shall be:

* Unique
* Permanent
* Auto Generated
* Read Only
* Never Reused
* Never Edited

## Format

```text
EMP-YYYY-NNNN
```

Example

```text
EMP-2026-0001
EMP-2026-0002
EMP-2026-0003
```

Alternative Enterprise Format

```text
KH-DCOS-HR-000001
```

---

# 3. Company Email Standard

Recommended

```text
firstname.lastname@company.com
```

Example

```text
liheng.pouth@dcos.com
```

Alternative

```text
liheng@dcos.com
```

Rules

* Lowercase only
* No duplicate
* No space
* Auto generate by HR

---

# 4. Employee Status Standard

```text
Draft
Probation
Active
Suspended
Long Leave
Resigned
Terminated
Retired
Deceased
Archived
```

Only Active employee can login.

---

# 5. Department Master Standard

| Code | Department                |
| ---- | ------------------------- |
| CEO  | Executive Office          |
| PMO  | Project Management Office |
| ARC  | Architecture              |
| STR  | Structure                 |
| MEP  | MEP Engineering           |
| BIM  | BIM Coordination          |
| QS   | Quantity Survey           |
| PROC | Procurement               |
| CON  | Construction              |
| QAQC | QA/QC                     |
| HSE  | HSE                       |
| HR   | Human Resources           |
| ACC  | Accounting                |
| FIN  | Finance                   |
| DOC  | Document Control          |
| ADM  | Administration            |
| IT   | Information Technology    |
| LOG  | Logistics                 |
| WH   | Warehouse                 |
| LEG  | Legal                     |

---

# 6. Position Master Standard

## Executive

| Code    | Position          |
| ------- | ----------------- |
| EXE-001 | Managing Director |
| EXE-002 | General Manager   |

---

## Management

| Code    | Position             |
| ------- | -------------------- |
| MGR-001 | Project Manager      |
| MGR-002 | Architecture Manager |
| MGR-003 | Structure Manager    |
| MGR-004 | MEP Manager          |
| MGR-005 | Procurement Manager  |
| MGR-006 | Site Manager         |
| MGR-007 | HR & Admin Manager   |
| MGR-008 | Account Manager      |

---

## Senior Level

| Code    | Position                     |
| ------- | ---------------------------- |
| SEN-001 | Senior Architecture Engineer |
| SEN-002 | Senior Structure Engineer    |
| SEN-003 | Senior MEP Engineer          |
| SEN-004 | Senior Procurement Officer   |
| SEN-005 | Senior Site Engineer         |
| SEN-006 | Senior HR & Admin Officer    |
| SEN-007 | Senior Accountant            |

---

## Engineer / Officer

| Code    | Position              |
| ------- | --------------------- |
| ENG-001 | Architecture Engineer |
| ENG-002 | Structure Engineer    |
| ENG-003 | MEP Engineer          |
| OFF-001 | Procurement Officer   |
| ENG-004 | Site Engineer         |
| OFF-002 | HR & Admin Officer    |
| OFF-003 | Accountant            |
| OFF-004 | Project Coordinator   |

---

## Technical Staff

| Code    | Position       |
| ------- | -------------- |
| TEC-001 | Technician     |
| TEC-002 | Foreman        |
| TEC-003 | Operator       |
| TEC-004 | Store Keeper   |
| TEC-005 | Driver         |
| TEC-006 | Cleaner        |
| TEC-007 | Security Guard |

---

## Position Rules

* One employee shall have one Primary Position.
* Acting Position is optional.
* Promotion history shall be maintained.
* Position cannot be deleted after assignment.
* Inactive Position shall be archived.

---

# 7. Employment Type

```text
Permanent
Fixed Term
Probation
Intern
Consultant
Daily Worker
Part Time
Contract Staff
Freelance
Subcontract Labor
```

---

# 8. Probation Standard

Supported

```text
30 Days
60 Days
90 Days
180 Days
No Probation
```

System shall automatically:

* Calculate probation end date
* Notify employee
* Notify manager
* Notify HR
* Trigger confirmation workflow

---

# 9. Employment Category

```text
Executive
Management
Professional
Technical
Administration
Site Staff
Labor
Intern
```

---

# 10. Nationality

ISO Country Standard

Example

```text
Cambodian
Vietnamese
Thai
Chinese
Japanese
Singaporean
```

---

# 11. Gender

```text
Male
Female
Other
Prefer Not To Say
```

---

# 12. Marital Status

```text
Single
Married
Divorced
Widowed
Separated
```

Used for Cambodia payroll tax calculation.

---

# 13. Identification Documents

Employee may register

* National ID
* Passport
* Visa
* Work Permit
* Driving License

Store

* Document Number
* Issue Date
* Expiry Date
* Attachment

System reminder before expiry.

---

# 14. Payroll Type

```text
Monthly Salary
Daily Wage
Hourly Wage
Project Based
Commission
```

---

# 15. Bank Account Policy

Store

* Bank Name
* Account Name
* Account Number
* Swift Code

Editable only by Payroll Admin.

Audit Log mandatory.

---

# 16. Organization Assignment

Every employee shall belong to

```text
Company
Department
Division
Section
Team
Reporting Manager
```

One Primary Department only.

---

# 17. Project Assignment

Store

* Project
* Role
* Allocation %
* Start Date
* End Date

Maximum allocation = 100%.

---

# 18. Leave Group

Example

```text
Office Staff
Site Staff
Manager
Director
Intern
Labor
```

Leave entitlement references Leave Group.

---

# 19. Payroll Group

Example

```text
Monthly USD
Monthly KHR
Daily Wage
Executive
Project Staff
```

Payroll engine references Payroll Group.

---

# 20. Cambodia Compliance Fields

Employee Master should support:

* Khmer Name
* English Name
* National ID Number
* Passport Number
* NSSF Number
* Tax Identification Number (TIN)
* Employment Contract Number
* Employment Start Date
* Seniority Start Date
* Labor Category
* Work Permit Number
* Visa Number
* Visa Expiry
* Permanent Address
* Current Address
* Emergency Contact
* Emergency Phone

Automatic Reminder

* Contract Expiry
* Probation Expiry
* Visa Expiry
* Work Permit Expiry
* National ID Expiry
* Passport Expiry

---

# 21. Additional Enterprise Fields

## Payroll

* Pay Grade
* Salary Scale
* Currency
* Cost Center
* Payroll Group
* Payment Method
* Bank Branch
* Payroll Location

---

## HR

* Blood Type
* Education Level
* Major
* University
* Graduation Year
* Professional License
* Skill Matrix
* Training Record
* Certificate
* Language Skill

---

## Emergency

* Contact Name
* Relationship
* Phone
* Address

---

## Asset Assignment

* Laptop
* Mobile Phone
* SIM Card
* Vehicle
* PPE
* Access Card

---

## Security

* RFID Card
* Fingerprint ID
* Face Recognition ID
* Door Access Group
* Parking Access

---

## Uniform

* Shirt Size
* Pant Size
* Safety Shoe Size
* Helmet Size
* Vest Size

---

# 22. Employee Document Checklist

Mandatory

* CV
* Employment Contract
* National ID
* Employee Photo
* Bank Information
* Emergency Contact
* Academic Certificate
* NSSF Registration

Optional

* Passport
* Visa
* Work Permit
* Driving License
* Medical Checkup
* Professional License
* Training Certificate

---

# 23. Audit Policy

System shall log

* Create Employee
* Update Employee
* Department Transfer
* Position Transfer
* Salary Change
* Manager Change
* Bank Change
* Status Change
* Email Change
* Project Assignment Change

Employee records shall never be physically deleted.

Archive only.

---

# 24. Employee Master UI Recommendation

Employee Master should be separated into enterprise tabs that match the data governance model.

```text
Employee Master

├── Tab 1 Basic Information
├── Tab 2 Employment Information
├── Tab 3 Organization Assignment
├── Tab 4 Payroll Information
├── Tab 5 Leave & Attendance Setup
├── Tab 6 Project Assignment
├── Tab 7 Qualification & Training
├── Tab 8 Identification Documents
├── Tab 9 Asset & Access Control
└── Tab 10 Audit Log & History
```

Minimum R2.1 tab coverage:

```text
1. Basic Information
2. Employment Information
3. Organization Assignment
4. System Access & RBAC
5. Payroll, Tax & NSSF
6. Bank & Payment
7. Leave & Attendance Setup
8. Project / WBS Assignment
9. Qualification, Training & Certification
10. Identification Documents
11. Asset, Uniform & Access Control
12. Audit Log & History
```

Estimated fields:

* 120~180 fields
* Fully configurable
* Enterprise-ready

---

# 25. R2.1 Employee Master Design Addendum

This section records the missing design items identified when comparing the policy with the current Employee Master module.

## 25.1 Employee Master System of Record

The implementation shall treat the employee profile table as the parent Employee Master record.

Mandatory governance rules:

* Employee ID is system generated from join date.
* Employee ID is read only after creation.
* Employee ID shall never be manually edited from the profile screen.
* Employee ID shall never be reused after resignation, termination, retirement, death, or archive.
* Employee records shall be archived, not physically deleted.
* Downstream modules shall reference Employee Master by employee UUID and display Employee ID as the business code.

## 25.2 Lifecycle Workflow

Employee Master shall support the following lifecycle:

```text
Draft
Pending Approval
Approved
Active / Probation
Suspended / Long Leave
Resigned / Terminated / Retired / Deceased
Archived
```

Workflow actions required:

* Create Draft Employee
* Submit for Approval
* HR Review
* Department Manager Approval
* Payroll Review for salary, tax, NSSF, and bank data
* Activate Employee
* Suspend Employee
* Confirm / Extend / Fail Probation
* Resign Employee
* Terminate Employee
* Retire Employee
* Mark Deceased
* Archive Employee

Direct creation of an active user account shall be allowed only when the configured approval policy permits it.

## 25.3 Controlled Master Data

The following fields shall use controlled master data instead of unrestricted free text:

* Company
* Department
* Division
* Section
* Team
* Position
* Grade
* Employment Type
* Employment Category
* Work Location
* Cost Center
* Leave Group
* Payroll Group
* Attendance Site
* Shift / Work Calendar
* Project Role
* Asset Type
* Access Group

Inactive master data values shall remain available for historical records but shall not be assignable to new active employees.

## 25.4 Cambodia Compliance Profile

Employee Master shall include a Cambodia compliance profile with:

* Khmer Name
* English Name
* National ID Number and Expiry Date
* Passport Number and Expiry Date
* Visa Number and Expiry Date
* Work Permit Number and Expiry Date
* NSSF Number
* Tax Identification Number (TIN)
* Employment Contract Number
* Contract Start Date
* Contract End Date
* Seniority Start Date
* Labor Category
* Permanent Address
* Current Address
* Emergency Contact Name
* Emergency Contact Relationship
* Emergency Contact Phone
* Emergency Contact Address

The system shall generate reminders for probation expiry, contract expiry, visa expiry, work permit expiry, passport expiry, National ID expiry, and certification expiry.

## 25.5 Document Checklist

Employee Master shall expose a document checklist with mandatory and optional items.

Mandatory items:

* CV
* Employment Contract
* National ID or Passport
* Employee Photo
* Bank Information
* Emergency Contact
* Academic Certificate
* NSSF Registration

Each document shall track type, file, number where applicable, issue date, expiry date, verification status, verified by, verified date, and reminder status.

## 25.6 Project, WBS, Leave, Attendance, Asset, and Access Setup

Employee Master shall include direct profile tabs or linked panels for:

* Project Assignment
* WBS Assignment
* Resource Forecast
* Cost Allocation Percent
* Leave Group
* Attendance Site
* Shift / Work Calendar
* RFID Card
* Fingerprint ID
* Face Recognition ID
* Door Access Group
* Parking Access
* Laptop, mobile phone, SIM card, PPE, vehicle, and access card
* Uniform sizes

Total active project and WBS allocation shall not exceed 100% unless an authorized exception is approved and audited.

## 25.7 Sensitive Update Approval

Employee data updates shall be classified:

* Normal Update: phone, address, photo, emergency contact.
* Controlled Update: department, position, manager, employment type, project assignment, leave group, attendance setup.
* Sensitive Update: salary, bank, tax, NSSF, status, employee ID, email, system access.

Controlled and sensitive updates shall require reason, effective date, approval reference, old value, new value, changed by, and changed date.

## 25.8 HR Audit and History

Employee Master shall maintain HR audit history separate from user-management audit history.

Required history:

* Status History
* Department History
* Position History
* Manager History
* Salary History
* Bank Account History
* Tax / NSSF History
* Project Assignment History
* Leave Group History
* Attendance Site / Shift History
* System Access History
* Document Verification History

Audit records shall be immutable and reportable.

## 25.9 Permissions and Data Privacy

Access shall follow the SOP permission matrix:

* HR Manager: full profile, approval, archive.
* HR Officer: create and normal update.
* Payroll Officer: payroll, tax, NSSF, salary, and bank sections only.
* Department Manager: team visibility and controlled approval.
* Project Manager: project-team visibility and assignment approval.
* Employee: self profile view and personal change request only.
* System Admin: user account and RBAC link only.

Sensitive compensation, tax, NSSF, bank, identification, and document data shall be hidden unless the role explicitly requires access.

## 25.10 Reports and Dashboards

Employee Master shall provide:

* Employee Master Report
* Employee Movement Report
* Probation Due Report
* Contract Expiry Report
* Document Expiry Report
* Certification Expiry Report
* Project Manpower Report
* Leave Group Report
* Attendance Site Assignment Report
* Salary History Report
* Data Completeness Report
* Audit Change Report

Dashboard KPIs shall include total headcount, active headcount, probation due, contract expiry due, documents due, certifications due, new joiners, resignations, turnover, and project manpower allocation.

---

# 26. Reference Standards

This policy is developed based on international HRIS best practices and Cambodia employment regulations.

## Cambodia References

* Cambodia Labour Law (1997 and amendments)
* Ministry of Labour and Vocational Training (MLVT)
* National Social Security Fund (NSSF)
* General Department of Taxation (GDT)

## International References

* ISO 30414 Human Capital Reporting
* ISO 9001 Document Control Principles
* SAP SuccessFactors Employee Central
* Oracle HCM Cloud
* Microsoft Dynamics 365 Human Resources
* Odoo Enterprise HR
* Enterprise Master Data Governance (MDM)
* Construction ERP Best Practices (Procore, CMiC, Oracle Primavera Unifier)

---

# 27. Enterprise Design Principle

Employee Master shall be the Parent Table for:

```text
Attendance
E-Leave
Payroll
Overtime
Recruitment
Training
Performance Appraisal
Organization Chart
Project Assignment
Timesheet
Asset Assignment
Access Control
Travel Request
Expense Claim
Disciplinary Record
Medical Record
Document Control
Visitor Management
AI Employee Assistant
```

No duplicated employee information shall exist outside Employee Master.

Employee Master is the official **Single Source of Truth (SSOT)** for the DCOS Human Resource Management System.
