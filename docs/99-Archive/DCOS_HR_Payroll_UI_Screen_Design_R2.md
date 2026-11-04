# DCOS HR & Payroll Module — UI & Screen Design R2
## Digital Construction Operating System (DCOS)

| Field | Detail |
|---|---|
| Document Code | DCOS-HR-PAY-UI-R2 |
| Version | R2 |
| Module | HR & Payroll |
| Country Compliance | Cambodia Payroll, Tax on Salary (TOS), NSSF |
| Purpose | UI / UX screen design for payroll setup, payroll run, payslip, tax configuration, NSSF configuration, dashboard, and cost allocation |
| Status | Ready for UI mockup / development prompt |

---

# 1. UI Design Principle

The payroll UI must be simple for HR users but controlled enough for management and finance.

The system should separate:

```text
HR prepares payroll
Finance verifies payroll payment
Director approves payroll
System locks payroll after approval
```

Payroll data is sensitive. The UI must protect salary visibility using role-based access control.

---

# 2. Main Navigation Structure

Recommended sidebar structure:

```text
HR
├── Dashboard
├── Employees
├── Attendance
├── Leave
├── Timesheet
├── Overtime
├── Payroll
│   ├── Payroll Dashboard
│   ├── Payroll Runs
│   ├── Payslips
│   ├── Salary Structure
│   ├── Cost Allocation
│   └── Payroll Reports
├── Configuration
│   ├── Tax on Salary (TOS)
│   ├── NSSF Rules
│   ├── Allowance Types
│   ├── Deduction Types
│   ├── OT Rules
│   └── Payroll Periods
└── Audit Log
```

---

# 3. Screen 1 — Payroll Dashboard

## 3.1 Purpose

The Payroll Dashboard gives HR Manager, Finance, and Director a high-level view of monthly payroll status.

## 3.2 Layout

```text
Top Filter Bar
├── Company
├── Project
├── Department
├── Payroll Period
├── Payroll Status
└── Currency

KPI Cards
├── Total Employees
├── Payroll Gross Amount
├── Total TOS
├── Total NSSF Employee
├── Total NSSF Employer
├── Total Net Salary
├── Pending Approval
└── Paid Payroll

Main Content
├── Payroll Status Chart
├── Payroll Cost by Department
├── Payroll Cost by Project
├── Payroll Trend
└── Payroll Alerts
```

## 3.3 KPI Cards

| KPI | Description |
|---|---|
| Total Employees | Number of employees in current payroll period |
| Gross Payroll | Total salary before deductions |
| Total TOS | Total Tax on Salary |
| Employee NSSF | NSSF deducted from employee |
| Employer NSSF | Employer contribution cost |
| Net Payroll | Final salary payable |
| Payroll Pending | Payroll records waiting for review / approval |
| Payroll Paid | Payroll records already paid |

## 3.4 Payroll Alerts

| Alert | Example |
|---|---|
| Missing Tax Profile | 3 employees have no tax profile |
| Missing NSSF Profile | 2 employees have no NSSF number |
| Missing Bank Account | 1 employee missing bank account |
| Timesheet Not Approved | 8 timesheets pending approval |
| OT Pending Approval | 5 overtime requests pending approval |
| Salary Changed This Period | 2 employees have salary adjustment |

## 3.5 Actions

| Button | Action |
|---|---|
| Create Payroll Run | Start a new payroll period |
| View Payroll Runs | Open payroll run list |
| Export Payroll Summary | Export payroll summary Excel / PDF |
| Open Alerts | View payroll validation problems |

---

# 4. Screen 2 — Employee Master

## 4.1 Purpose

Employee Master stores the official staff profile used by HR, payroll, attendance, leave, timesheet, and project cost allocation.

## 4.2 Employee List View

### Table Columns

| Column | Description |
|---|---|
| Employee Code | EMP-0001 |
| Name | Employee full name |
| Department | STR / ARC / MEP / QS / Site / Admin |
| Position | Structural Engineer, Site Engineer, etc. |
| Employment Type | Permanent / Contract / Probation |
| Payroll Type | Monthly |
| Status | Active / Inactive |
| Tax Profile | Complete / Missing |
| NSSF Profile | Complete / Missing |
| Bank Account | Complete / Missing |
| Action | View / Edit |

### Filters

```text
Search by name / employee code
Department
Position
Employment Type
Payroll Type
Status
Tax Profile Status
NSSF Profile Status
```

## 4.3 Employee Detail Screen Tabs

```text
Employee Profile
├── Personal Info
├── Employment Info
├── Payroll Profile
├── Tax Profile
├── NSSF Profile
├── Bank Info
├── Salary History
├── Attendance
├── Timesheet
├── Payslips
└── Audit History
```

## 4.4 Personal Info Form

| Field | Type | Required |
|---|---|---|
| Employee Code | Auto / Manual | Yes |
| Full Name English | Text | Yes |
| Full Name Khmer | Text | Optional |
| Gender | Dropdown | Yes |
| Date of Birth | Date | Optional |
| National ID / Passport | Text | Optional |
| Phone | Text | Optional |
| Email | Text | Optional |
| Address | Text Area | Optional |

## 4.5 Employment Info Form

| Field | Type | Required |
|---|---|---|
| Department | Dropdown | Yes |
| Position | Dropdown | Yes |
| Line Manager | User Picker | Yes |
| Employment Type | Permanent / Contract / Probation | Yes |
| Join Date | Date | Yes |
| End Date | Date | Optional |
| Work Location | Office / Site / Hybrid | Optional |
| Status | Active / Inactive / Resigned / Terminated | Yes |

## 4.6 Payroll Profile Form

| Field | Type | Required |
|---|---|---|
| Payroll Type | Monthly | Yes |
| Currency | USD / KHR | Yes |
| Basic Salary | Number | Yes |
| Salary Effective Date | Date | Yes |
| Payroll Group | Staff / Site Staff / Management | Yes |
| OT Eligible | Yes / No | Yes |
| Tax Applicable | Yes / No | Yes |
| NSSF Applicable | Yes / No | Yes |

## 4.7 Tax Profile Form

| Field | Type | Required |
|---|---|---|
| Tax Residency | Resident / Non-Resident | Yes |
| Marital Status | Single / Married | Yes |
| Spouse Dependent | Yes / No | Yes if married |
| Number of Children | Number | Yes |
| Tax Identification Number | Text | Optional |
| Effective Date | Date | Yes |

## 4.8 NSSF Profile Form

| Field | Type | Required |
|---|---|---|
| NSSF Applicable | Yes / No | Yes |
| NSSF Number | Text | Required if applicable |
| Pension Applicable | Yes / No | Yes |
| Healthcare Applicable | Yes / No | Yes |
| Occupational Risk Applicable | Yes / No | Yes |
| Effective Date | Date | Yes |

## 4.9 Bank Info Form

| Field | Type | Required |
|---|---|---|
| Bank Name | Dropdown | Optional |
| Account Name | Text | Optional |
| Account Number | Text | Optional |
| Payment Method | Bank Transfer / Cash / Cheque | Yes |

## 4.10 Employee Actions

| Button | Action |
|---|---|
| Save Draft | Save incomplete employee data |
| Activate Employee | Make employee available for payroll |
| Edit Salary | Create new salary effective date record |
| Deactivate Employee | Stop employee from future payroll |
| View Payslips | Open payslip history |
| View Audit | Open employee audit timeline |

---

# 5. Screen 3 — Salary Structure

## 5.1 Purpose

Salary Structure defines the monthly salary components used for payroll calculation.

## 5.2 Layout

```text
Employee Selector
├── Employee Name
├── Department
├── Position
├── Payroll Period
└── Effective Date

Salary Components
├── Fixed Earnings
├── Variable Earnings
├── Deductions
└── Employer Contributions
```

## 5.3 Fixed Earnings Table

| Component | Amount | Taxable | Recurring | Effective Date |
|---|---:|---|---|---|
| Basic Salary | 1500 USD | Yes | Yes | 01-Jun-2026 |
| Position Allowance | 100 USD | Yes | Yes | 01-Jun-2026 |
| Phone Allowance | 50 USD | Yes | Yes | 01-Jun-2026 |
| Site Allowance | 100 USD | Yes | Yes | 01-Jun-2026 |

## 5.4 Variable Earnings Table

| Component | Amount | Taxable | Source |
|---|---:|---|---|
| Overtime | Auto | Yes | OT Request |
| Bonus | Manual | Yes | Payroll Input |
| Incentive | Manual | Yes | Payroll Input |

## 5.5 Deduction Table

| Component | Amount | Source |
|---|---:|---|
| Tax on Salary | Auto | TOS Rule |
| NSSF Employee | Auto | NSSF Rule |
| Loan | Manual / Loan Module | Payroll Input |
| Salary Advance | Manual | Payroll Input |

---

# 6. Screen 4 — Tax Configuration: Cambodia TOS

## 6.1 Purpose

This screen allows HR Admin to maintain Cambodia Tax on Salary rules without changing code.

## 6.2 Tabs

```text
Tax Brackets
Dependent Relief
Fringe Benefit Tax
Exchange Rate
Tax Rule History
```

## 6.3 Tax Brackets Table

| From KHR | To KHR | Rate | Effective Date | Status |
|---:|---:|---:|---|---|
| 0 | 1,500,000 | 0% | 01-Jan-2026 | Active |
| 1,500,001 | 2,000,000 | 5% | 01-Jan-2026 | Active |
| 2,000,001 | 8,500,000 | 10% | 01-Jan-2026 | Active |
| 8,500,001 | 12,500,000 | 15% | 01-Jan-2026 | Active |
| 12,500,001 | Unlimited | 20% | 01-Jan-2026 | Active |

## 6.4 Dependent Relief Table

| Relief Type | Amount KHR / Month | Effective Date | Status |
|---|---:|---|---|
| Spouse Dependent | 150,000 | 01-Jan-2026 | Active |
| Child Dependent | 150,000 | 01-Jan-2026 | Active |

## 6.5 Non-Resident Tax

| Rule | Rate | Effective Date | Status |
|---|---:|---|---|
| Non-Resident Salary Tax | 20% | 01-Jan-2026 | Active |

## 6.6 Fringe Benefit Tax

| Rule | Rate | Effective Date | Status |
|---|---:|---|---|
| Fringe Benefit Tax | 20% | 01-Jan-2026 | Active |

## 6.7 Exchange Rate Setup

| Field | Description |
|---|---|
| Payroll Currency | USD / KHR |
| Tax Calculation Currency | KHR |
| Exchange Rate Source | Manual / API |
| Monthly Rate | Example: 4,000 KHR / USD |
| Effective Period | Payroll month |

## 6.8 Actions

| Button | Action |
|---|---|
| Add Tax Bracket | Add new TOS rule |
| Duplicate Current Rule | Create future effective rule |
| Save as Draft | Save but not active |
| Activate Rule | Make rule active from effective date |
| View History | Show previous tax rules |

---

# 7. Screen 5 — NSSF Configuration

## 7.1 Purpose

This screen controls NSSF contribution rules for employee and employer contribution.

## 7.2 Tabs

```text
Pension
Healthcare
Occupational Risk
Contribution Wage Cap
Rule History
```

## 7.3 Pension Rule Table

| Contributor | Rate | Effective Date | Status |
|---|---:|---|---|
| Employee | 2% | 01-Jan-2026 | Active |
| Employer | 2% | 01-Jan-2026 | Active |

## 7.4 Healthcare Rule Table

| Contributor | Rate | Effective Date | Status |
|---|---:|---|---|
| Employer | Configurable | 01-Jan-2026 | Active |
| Employee | Configurable | 01-Jan-2026 | Active / Inactive |

## 7.5 Occupational Risk Rule Table

| Contributor | Rate | Effective Date | Status |
|---|---:|---|---|
| Employer | 0.8% | 01-Jan-2026 | Active |

## 7.6 Contribution Wage Cap

| Field | Description |
|---|---|
| Minimum Wage Base | Optional rule |
| Maximum Wage Base | Optional rule |
| Apply Cap | Yes / No |
| Effective Date | Date |

## 7.7 Validation Rules

- NSSF rule must have an effective date.
- Only one active rule can exist for the same contribution type and date range.
- Old payroll runs must not change when a new rule is activated.
- Locked payroll must preserve snapshot of NSSF rules used.

---

# 8. Screen 6 — Payroll Run List

## 8.1 Purpose

Payroll Run List manages each monthly payroll processing cycle.

## 8.2 Table Columns

| Column | Description |
|---|---|
| Payroll Run No | PAY-2026-06 |
| Period | Jun 2026 |
| Start Date | 01-Jun-2026 |
| End Date | 30-Jun-2026 |
| Employees | Number of employees |
| Gross Amount | Total gross salary |
| TOS | Total tax |
| NSSF Employee | Total employee NSSF |
| Net Salary | Total payable |
| Status | Draft / Reviewed / Approved / Locked / Paid |
| Action | View / Process |

## 8.3 Filters

```text
Payroll Period
Department
Payroll Status
Created By
Approval Status
Payment Status
```

## 8.4 Actions

| Button | Action |
|---|---|
| Create Payroll Run | Create new run |
| Recalculate | Recalculate draft payroll |
| Submit for Review | Submit to HR Manager |
| Export Summary | Excel / PDF |
| View Audit | Open run audit timeline |

---

# 9. Screen 7 — Payroll Run Detail

## 9.1 Purpose

This is the main working screen for HR to calculate and review payroll.

## 9.2 Header

```text
Payroll Run: PAY-2026-06
Period: 01-Jun-2026 to 30-Jun-2026
Status: Draft
Prepared By: HR Officer
```

## 9.3 Summary Cards

| Card | Description |
|---|---|
| Employees Included | Total payroll employees |
| Gross Salary | Total gross salary |
| Tax Relief | Total spouse / child relief |
| Taxable Salary | Total taxable salary |
| TOS | Total salary tax |
| NSSF Employee | Total employee deduction |
| NSSF Employer | Total employer contribution |
| Net Salary | Total amount payable |

## 9.4 Employee Payroll Table

| Employee | Department | Gross | Relief | Taxable | TOS | NSSF Emp. | Deduction | Net | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| EMP-001 | STR | 1,500 | 0 | 1,500 | Auto | Auto | 0 | Auto | Valid |
| EMP-002 | STR | 1,500 | 112.50 | 1,387.50 | Auto | Auto | 0 | Auto | Valid |

## 9.5 Employee Payroll Detail Drawer

When clicking an employee row, open right-side drawer:

```text
Employee Payroll Breakdown
├── Salary Components
├── Attendance Summary
├── OT Summary
├── Allowances
├── Deductions
├── Tax Relief
├── TOS Calculation
├── NSSF Calculation
├── Net Salary
├── Cost Allocation
└── Audit History
```

## 9.6 Payroll Validation Panel

| Validation | Severity |
|---|---|
| Missing tax profile | Critical |
| Missing NSSF profile | Warning |
| Missing bank account | Warning |
| Unapproved timesheet | Critical |
| Unapproved overtime | Critical |
| Negative net salary | Critical |
| Salary changed during period | Warning |

## 9.7 Payroll Run Workflow

```text
Draft
→ Calculated
→ HR Reviewed
→ Finance Verified
→ Director Approved
→ Locked
→ Exported
→ Paid
```

## 9.8 Action Buttons by Status

| Status | Actions |
|---|---|
| Draft | Calculate, Save Draft, Delete |
| Calculated | Recalculate, Submit for HR Review |
| HR Reviewed | Submit to Finance |
| Finance Verified | Submit to Director |
| Director Approved | Lock Payroll |
| Locked | Generate Payslips, Export to Finance |
| Exported | Mark as Paid |
| Paid | View Only |

---

# 10. Screen 8 — Payslip

## 10.1 Purpose

Payslip displays the official monthly salary statement for each employee.

## 10.2 Payslip Layout

```text
Company Header
Employee Information
Payroll Period
Earnings
Allowances
Overtime
Tax Relief
Deductions
Employer Contributions
Net Salary
Approval / Payment Status
```

## 10.3 Employee Information

| Field | Example |
|---|---|
| Employee Code | EMP-0001 |
| Employee Name | Pouth Liheng |
| Department | Structure |
| Position | Structural Engineer |
| Payroll Period | Jun 2026 |
| Payment Method | Bank Transfer |

## 10.4 Earnings Section

| Item | Amount |
|---|---:|
| Basic Salary | 1,500 USD |
| Position Allowance | 100 USD |
| Phone Allowance | 50 USD |
| Overtime | 120 USD |
| Gross Salary | 1,770 USD |

## 10.5 Tax Relief Section

| Item | Amount |
|---|---:|
| Spouse Relief | 150,000 KHR |
| Child Relief | 300,000 KHR |
| Total Relief | 450,000 KHR |

## 10.6 Deduction Section

| Item | Amount |
|---|---:|
| Tax on Salary | Auto |
| NSSF Employee | Auto |
| Loan | Manual |
| Salary Advance | Manual |
| Total Deduction | Auto |

## 10.7 Net Salary Section

```text
Gross Salary
- Total Deductions
= Net Salary
```

## 10.8 Payslip Actions

| Role | Actions |
|---|---|
| HR Officer | Generate / Preview |
| HR Manager | Approve for release |
| Finance | Verify payment |
| Employee | View own payslip only |
| Director | View all payslips summary |

## 10.9 Payslip Security

- Employee can only view own payslip.
- Line Manager cannot view salary unless granted permission.
- HR Officer can prepare but not final approve alone.
- Finance can verify payment but cannot modify salary structure.
- Locked payslip cannot be edited.

---

# 11. Screen 9 — Payroll Cost Allocation

## 11.1 Purpose

Cost Allocation connects payroll cost to DCOS project control.

This is the key difference between normal payroll software and DCOS.

```text
Payroll Cost
→ Department Cost
→ Project Cost
→ WBS Cost
→ Task Cost
```

## 11.2 Allocation Methods

| Method | Description |
|---|---|
| Timesheet Based | Allocate based on approved timesheet hours |
| Manual Percentage | HR / PM manually assigns percentage |
| Department Default | Allocate to department overhead |
| Project Assignment | Allocate to assigned project |
| Mixed Allocation | Combination of project and overhead |

## 11.3 Cost Allocation Screen Layout

```text
Top Filter
├── Payroll Period
├── Department
├── Employee
├── Project
└── Allocation Status

Main Table
├── Employee
├── Total Payroll Cost
├── Project Allocation
├── WBS Allocation
├── Overhead Allocation
├── Unallocated Amount
└── Status
```

## 11.4 Allocation Table

| Employee | Payroll Cost | Project | WBS | Task | Allocation % | Amount | Status |
|---|---:|---|---|---|---:|---:|---|
| Tangkea | 1,500 | P001 | B01-L02-STR | Slab Design | 70% | 1,050 | Allocated |
| Tangkea | 1,500 | P002 | B02-L05-STR | Shop Drawing | 30% | 450 | Allocated |

## 11.5 Allocation Validation Rules

- Total allocation must equal 100%.
- Employee payroll cannot be locked if allocation rule requires project allocation but allocation is incomplete.
- Approved timesheet should override manual allocation if configuration says so.
- Locked payroll preserves allocation snapshot.
- If WBS is archived, historical allocation remains visible.

## 11.6 Cost Allocation Workflow

```text
Payroll Calculated
→ Timesheet Hours Imported
→ System Suggests Allocation
→ HR Reviews
→ PM / Department Manager Confirms
→ Finance Verifies
→ Cost Allocation Locked
→ Project Cost Updated
```

---

# 12. Screen 10 — Payroll Reports

## 12.1 Report List

| Report | User |
|---|---|
| Payroll Register | HR / Finance |
| Payslip Summary | HR |
| Tax on Salary Report | HR / Finance |
| NSSF Report | HR / Finance |
| Payroll Cost by Department | Management |
| Payroll Cost by Project | PM / Director |
| Payroll Cost by WBS | PM / Cost Control |
| Overtime Report | HR / Department Manager |
| Salary Change Report | HR Manager / Director |
| Payroll Audit Report | Admin / HR Manager |

## 12.2 Export Options

```text
PDF
Excel
CSV
Accounting Export Format
```

---

# 13. Role-Based UI Access

| Screen | Employee | HR Officer | HR Manager | Finance | Director | Admin |
|---|---|---|---|---|---|---|
| Payroll Dashboard | No | View | View | View | View | View |
| Employee Master | Own basic only | Full | Full | Limited | View Summary | Full |
| Salary Structure | No | Create/Edit Draft | Approve | View | View | Configure |
| Tax Config | No | View | Edit | View | View | Configure |
| NSSF Config | No | View | Edit | View | View | Configure |
| Payroll Run | No | Prepare | Review | Verify | Approve | Full |
| Payslip | Own only | Generate | Release | Verify Payment | Summary | Full |
| Cost Allocation | No | Prepare | Review | Verify | View | Full |
| Audit Log | No | Limited | HR Logs | Finance Logs | View | Full |

---

# 14. Audit Trail Requirements

Every sensitive action must be recorded.

## Audit Events

```text
Employee created
Employee salary changed
Tax profile changed
NSSF profile changed
Payroll run created
Payroll recalculated
Payroll submitted
Payroll reviewed
Payroll verified by finance
Payroll approved by director
Payroll locked
Payslip generated
Payslip released
Payroll exported
Payroll marked as paid
Cost allocation changed
```

## Audit Detail Must Include

| Field | Description |
|---|---|
| User | Who performed action |
| Role | User role at time of action |
| Date Time | Action timestamp |
| Record | Affected record |
| Old Value | Before change |
| New Value | After change |
| Reason | Reason / comment |
| IP / Device | Security tracking |

---

# 15. UI Validation Rules

## Employee Master

- Employee cannot be activated without department and position.
- Employee cannot enter payroll without payroll profile.
- Tax applicable employee must have tax profile.
- NSSF applicable employee must have NSSF profile.

## Payroll Run

- Payroll cannot be calculated if payroll period is missing.
- Payroll cannot be submitted if critical validation exists.
- Payroll cannot be locked before Director Approval.
- Locked payroll cannot be edited.
- Paid payroll cannot be recalculated.

## Tax Configuration

- Tax bracket ranges cannot overlap.
- Tax bracket must have effective date.
- Only one active rule set per effective period.

## NSSF Configuration

- NSSF rate must have contribution type.
- Contribution rule must have effective date.
- Historical payroll must preserve old NSSF rate snapshot.

---

# 16. Recommended MVP Build Order

## Phase R2.1 — Foundation Screens

```text
1. Employee Master
2. Payroll Profile
3. Tax Profile
4. NSSF Profile
5. Salary Structure
```

## Phase R2.2 — Configuration Screens

```text
1. TOS Configuration
2. NSSF Configuration
3. Allowance Type
4. Deduction Type
5. OT Rule
```

## Phase R2.3 — Payroll Processing Screens

```text
1. Payroll Run List
2. Payroll Run Detail
3. Payroll Validation Panel
4. Employee Payroll Detail Drawer
5. Payslip Preview
```

## Phase R2.4 — Control Screens

```text
1. Payroll Approval Workflow
2. Payroll Cost Allocation
3. Payroll Reports
4. Payroll Dashboard
5. Payroll Audit Log
```

---

# 17. Developer Prompt for UI Implementation

Build a professional HR & Payroll UI module for DCOS using a modern dashboard layout.

The UI must include:

```text
Employee Master
Payroll Dashboard
Salary Structure
Tax Configuration Cambodia TOS
NSSF Configuration
Payroll Run List
Payroll Run Detail
Payslip View
Payroll Cost Allocation
Payroll Reports
Payroll Audit Log
```

Use:

```text
Left sidebar navigation
Top filter bar
KPI cards
Data tables
Right-side detail drawer
Tabbed forms
Approval status badges
Validation warning panel
Export buttons
Audit history timeline
```

Design style:

```text
Clean enterprise dashboard
Construction ERP style
Dense but readable tables
Clear approval status
Sensitive payroll data protected by role permission
```

Payroll must support Cambodia-specific rules:

```text
Cambodia Tax on Salary brackets
Spouse dependent relief
Child dependent relief
Non-resident flat tax
NSSF employee contribution
NSSF employer contribution
Employer occupational risk contribution
Healthcare contribution configuration
Exchange rate for USD to KHR tax calculation
```

The UI must support payroll workflow:

```text
Draft
→ Calculated
→ HR Reviewed
→ Finance Verified
→ Director Approved
→ Locked
→ Exported
→ Paid
```

The cost allocation UI must connect payroll to:

```text
Project
WBS
Task
Department
Overhead
```

The final system must allow HR to calculate payroll, review tax and NSSF, generate payslips, allocate payroll cost to projects, and export approved payroll data to finance.

---

# End of Document

**Document Name:** DCOS_HR_Payroll_UI_Screen_Design_R2.md  
**Version:** R2  
**Status:** Ready for UI Mockup / Development
