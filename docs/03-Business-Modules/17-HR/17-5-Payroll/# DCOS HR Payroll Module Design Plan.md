# DCOS HR Payroll Module Design Plan

## PMO Module Design Template

### Digital Construction Operating System (DCOS)

**Module Name:** Payroll Management
**Module Code:** HR-04
**Version:** R1
**Country:** Cambodia
**Compliance:** Cambodia Labor Law + GDT Tax on Salary (TOS) + NSSF

---

# 01. Module Charter

## Purpose

The Payroll Module is responsible for calculating employee compensation based on attendance, leave, overtime, allowances, deductions, tax obligations, NSSF contributions, and company policies.

The module integrates with:

* Employee Master
* Attendance
* Leave
* Timesheet
* Overtime
* Project Cost
* Finance
* Accounting
* Audit Log
* Notification Engine

---

## Objectives

* Automate payroll calculation
* Comply with Cambodia Labor Law
* Comply with Cambodia Tax on Salary (TOS)
* Comply with Cambodia NSSF
* Allocate labor cost to Project → WBS → Task
* Reduce manual payroll calculation
* Generate payroll reports automatically

---

# 02. Business Requirement Document (BRD)

## Stakeholders

* HR Officer
* HR Manager
* Finance Officer
* Finance Manager
* Director
* Employee

---

## Business Problems

Current payroll process:

* Manual Excel
* Human error
* Duplicate calculation
* Difficult audit
* No project labor cost allocation

---

## Business Goals

* One-click payroll generation
* Automatic tax calculation
* Automatic NSSF calculation
* Automatic seniority calculation
* Automatic project cost allocation

---

# 03. Scope

## Included

* Salary Structure
* Payroll Run
* Payroll Approval
* Payslip
* Tax Calculation
* NSSF Calculation
* Seniority
* Allowance
* Deduction
* Payroll Reports
* Payroll Dashboard

---

## Excluded

* Recruitment
* Performance Appraisal
* Loan Management
* Accounting Journal Posting
* Bank API

---

# 04. SOP AS-IS

```text
Attendance

↓

Excel

↓

OT

↓

Excel

↓

Manual Tax

↓

Manual Payroll

↓

Payslip

↓

Bank
```

Problems:

* Slow
* Error
* No audit
* No workflow

---

# 05. SOP TO-BE

```text
Attendance

↓

Leave

↓

Timesheet

↓

OT

↓

Payroll Engine

↓

Tax

↓

NSSF

↓

Approval

↓

Payslip

↓

Finance

↓

Project Cost Allocation
```

---

# 06. Workflow

```text
Create Payroll Period

↓

Collect Attendance

↓

Collect Leave

↓

Collect OT

↓

Generate Seniority

↓

Generate Payroll

↓

HR Review

↓

Finance Verify

↓

Director Approve

↓

Payroll Lock

↓

Generate Payslip

↓

Salary Payment

↓

Accounting Export

↓

Project Cost Allocation
```

---

# 07. User Journey

## HR

Create Payroll

↓

Run Payroll

↓

Review

↓

Submit

---

## Finance

Verify Payroll

↓

Verify Budget

↓

Approve

↓

Pay Salary

---

## Employee

Login

↓

View Payslip

↓

Download PDF

---

# 08. Permission Matrix

| Role            | Permission       |
| --------------- | ---------------- |
| HR Officer      | Run Payroll      |
| HR Manager      | Approve Payroll  |
| Finance Officer | Verify Payroll   |
| Finance Manager | Approve Payment  |
| Director        | Final Approval   |
| Employee        | View Own Payslip |

---

# 09. Approval Matrix

| Action               | Approver   |
| -------------------- | ---------- |
| Payroll Run          | HR Officer |
| Payroll Review       | HR Manager |
| Payroll Verification | Finance    |
| Payroll Final        | Director   |

Status:

Draft

↓

Calculated

↓

Review

↓

Verified

↓

Approved

↓

Locked

↓

Paid

---

# 10. Notification Matrix

| Trigger              | Notify     |
| -------------------- | ---------- |
| Payroll Created      | HR         |
| Payroll Generated    | HR Manager |
| Payroll Verification | Finance    |
| Payroll Approval     | Director   |
| Payroll Paid         | Employee   |
| Payroll Rejected     | HR         |

Priority:

* Info
* Warning
* Critical

Channels:

* In-App
* Email
* Telegram

---

# 11. UI Design

## Screen 1

Payroll Dashboard

Cards:

* Employees
* Payroll Cost
* OT Cost
* Tax
* NSSF

Charts:

* Monthly Payroll
* Department Payroll
* Project Labor Cost

---

## Screen 2

Payroll Period

Table:

* Period
* Status
* Employee Count
* Gross
* Net

Buttons:

* Create
* Run
* Lock
* Export

---

## Screen 3

Payroll Detail

Tabs:

* Summary
* Earnings
* Deductions
* Tax
* NSSF
* Seniority
* Payslip

---

## Screen 4

Payroll Configuration

Tabs:

* Salary Component
* OT
* Tax
* NSSF
* Seniority
* Exchange Rate

---

# 12. Database Design

Main Tables

```text
employees

employee_salary

attendance

leave

timesheet

overtime

payroll_period

payroll_run

payroll_detail

payslip

tax_rule

nssf_rule

seniority_rule

salary_component

payroll_cost_allocation
```

---

# 13. Data Dictionary

Example

## payroll_detail

| Field       | Type    |
| ----------- | ------- |
| id          | UUID    |
| employee_id | UUID    |
| payroll_id  | UUID    |
| gross       | Decimal |
| tax         | Decimal |
| nssf        | Decimal |
| seniority   | Decimal |
| deduction   | Decimal |
| net         | Decimal |

---

# 14. API Design

## Payroll

GET

```http
/api/payroll
```

POST

```http
/api/payroll/run
```

POST

```http
/api/payroll/approve
```

GET

```http
/api/payslip
```

GET

```http
/api/payroll/dashboard
```

---

# 15. Dashboard

HR Dashboard

* Total Employee
* Gross Payroll
* Tax
* NSSF
* Seniority
* Pending Approval

Finance Dashboard

* Cash Required
* Payroll Cost
* Department Cost

Executive Dashboard

* Payroll Trend
* Labor Cost
* Payroll KPI

---

# 16. Reports

* Payroll Register
* Payslip
* Tax Report
* NSSF Report
* Seniority Report
* Allowance Report
* Deduction Report
* Payroll Journal
* Department Payroll
* Project Payroll
* WBS Payroll

---

# 17. Audit Log

Track:

* Salary Change
* Tax Rule Change
* NSSF Change
* Seniority Change
* Payroll Run
* Payroll Approval
* Payroll Unlock
* Payroll Payment
* Payslip Download

Severity:

Low

Medium

High

Critical

---

# 18. Integration

Employee Master

↓

Attendance

↓

Leave

↓

Timesheet

↓

OT

↓

Payroll

↓

Finance

↓

Accounting

↓

Project

↓

WBS

↓

Task

↓

Labor Cost

---

# 19. UAT

Test Cases

□ Payroll Run

□ Attendance Import

□ Leave Deduction

□ OT Calculation

□ Seniority Calculation

□ Tax Calculation

□ NSSF Calculation

□ Payslip

□ Approval

□ Lock Payroll

□ Export Finance

□ Cost Allocation

---

# 20. Go-Live Checklist

□ Employee Imported

□ Salary Imported

□ Tax Rule Configured

□ NSSF Configured

□ Seniority Configured

□ Salary Component Configured

□ Exchange Rate Configured

□ Payroll Calendar Configured

□ Payroll Period Created

□ Attendance Imported

□ Leave Imported

□ OT Imported

□ Payroll Tested

□ Finance Tested

□ UAT Passed

□ Director Approved

□ Go Live

---

# Enterprise Recommendation

The Payroll Module should be driven by a configurable **Payroll Engine**:

```text
Basic Salary
+ Allowances
+ Overtime
+ Bonus
+ Seniority
────────────────────────
= Gross Earnings

- Warning Letter Deduction
- Unpaid Leave
- Loan
- Advance Salary
- Other Deductions
────────────────────────
= Adjusted Earnings

↓

Cambodia TOS

↓

NSSF

↓

Net Salary

↓

Finance Export

↓

Project → WBS → Task Labor Cost Allocation
```

This architecture allows DCOS to support Cambodia payroll regulations while integrating payroll directly into project cost control, productivity analysis, and enterprise reporting.
