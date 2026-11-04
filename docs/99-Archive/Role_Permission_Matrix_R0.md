# 🔐 DCOS — Role & Permission Matrix
## Digital Construction Operating System

**Document:** Role & Permission Matrix
**Version:** R1
**Status:** For Review
**Architecture Principle:** Three-layer access model — Internal Roles / Functional Overlays / External Stakeholders

---

## 📋 Table of Contents

1. Purpose and Scope
2. Three-Layer Access Model Overview
3. Layer A — Internal Role Hierarchy (L0–L6)
4. Layer B — Functional Role Overlays
5. Layer C — External Stakeholder Roles
6. Permission Type Codes
7. Module Permission Matrix
8. Approval Authority Matrix (with Value Thresholds)
9. Data Visibility Rules
10. Self-Approval Conflict Rules
11. External Access Boundary Rules
12. Workflow Integration Rules
13. Admin Configuration Notes

---

# 1. Purpose and Scope

This document defines:

- Who can view, create, edit, approve, and control records
- Across all modules in DCOS
- Across three access layers: internal hierarchy, functional role, and external stakeholder
- Including value-based approval thresholds, data visibility boundaries, and conflict-of-interest controls

This matrix governs all user access decisions at the application layer. It must be enforced by the RBAC engine and cannot be bypassed by any module-level logic.

**Scope covers all 25 modules defined in the DCOS System Architecture, including:**
Task Management, Document Control, Procurement, Construction, QA/QC, HSE, HR, Account/Finance, Planning, Inventory, Equipment, Subcontractor Management, Commissioning/Handover, DLP, Claims, Reporting, and Admin Configuration.

---

# 2. Three-Layer Access Model Overview

```
┌─────────────────────────────────────────────────────────┐
│  LAYER A — Internal Role Hierarchy                       │
│  L0 Super Admin → L1 MD → L2 GM → L3 PM → L4 → L5 → L6 │
├─────────────────────────────────────────────────────────┤
│  LAYER B — Functional Role Overlays                      │
│  Document Controller / QA Inspector / Procurement /      │
│  HSE / QS / Storekeeper / HR Officer / Accountant / BIM  │
├─────────────────────────────────────────────────────────┤
│  LAYER C — External Stakeholder Roles                    │
│  Client / Consultant / Subcontractor / Supplier /        │
│  Regulatory Authority / External Auditor                 │
└─────────────────────────────────────────────────────────┘
```

**Effective permission = Layer A base + Layer B functional overlay + Layer C external boundary**

All three layers must be evaluated at every access decision. Layer C always applies the most restrictive boundary regardless of Layer A or B assignments.

---

# 3. Layer A — Internal Role Hierarchy

## 3.1 Role Definitions

| Level | Role | Scope | Description |
|-------|------|-------|-------------|
| L0 | Super Admin | Platform-wide / Multi-tenant | Platform owner role. Manages tenants, system configuration, and platform-level security. Does not interact with project execution data. |
| L1 | Managing Director | Full company | Full company control. Final approval authority. Sees all projects, all financial data, all departments. |
| L2 | General Manager / Director | Company-wide operations | Oversees all projects and departments. Second-level approval authority for high-value items. |
| L3 | Project Manager | Assigned project(s) | Full control within assigned projects. Primary approval authority for project execution. |
| L4 | Department / Discipline Manager | Own department across projects | Controls department workflow, validates output, reviews submissions from own discipline. |
| L5 | Senior Engineer / Senior Officer | Assigned tasks and documents | Executes, reviews, and validates within own discipline and assigned scope. |
| L6 | Engineer / Staff / Supervisor / Storekeeper | Own assigned tasks only | Execution and submission. No approval authority. |

## 3.2 Role Hierarchy Rule

```
L0 > L1 > L2 > L3 > L4 > L5 > L6
```

Higher level inherits all permissions of the level below unless explicitly restricted by module-specific rules or data visibility boundaries.

---

# 4. Layer B — Functional Role Overlays

Functional roles sit on top of the L-level hierarchy and restrict or extend permissions within specific modules. An L4 in Procurement does not have the same permissions as an L4 in HR.

## 4.1 Functional Role Map

| Functional Role | Typical L-Level | Module Scope | Key Permissions |
|-----------------|-----------------|--------------|-----------------|
| Document Controller | L4–L5 | Document Control, Transmittals | Upload, revise, transmit, distribute, archive documents |
| Procurement Officer | L5–L6 | PR, RFQ, PO, Suppliers | Create PR/RFQ, receive quotations, prepare PO draft |
| QA/QC Inspector | L5–L6 | ITP, Inspections, NCR, Punch List | Create inspection request, record results, create NCR |
| HSE Officer | L4–L5 | Permits, Incidents, Toolbox, Risk | Issue permits, log incidents, conduct toolbox talks |
| QS / Cost Engineer | L4–L5 | BOQ, Budget, Variation, Claims, IPC | Measure, value, prepare payment certificates |
| Site Supervisor | L5–L6 | Daily Report, Manpower, Progress, Photos | Create daily reports, update progress, log resources |
| Storekeeper | L6 | Stock Receipt, Issue, Transfer, Count | Receive materials, issue to site, run stock counts |
| HR Officer | L4 | Employee, Leave, Timesheet, Payroll Input | Manage employee records, process leave, export payroll |
| Accountant | L4 | Invoice, Payment, Cost Ledger, Cash Flow | Process invoices, prepare payments, manage cost records |
| BIM Coordinator | L4–L5 | BIM Models, Clash, Coordination | Upload models, manage clash reports, coordination decisions |
| Planning Engineer | L4–L5 | Schedule, Baseline, Lookahead, S-Curve | Maintain schedule, report progress, identify delays |
| Subcontractor Manager | L4 | Subcontract, Claims, Progress, Payment | Manage subcontract scope, evaluate claims |

## 4.2 Functional Role Rule

A user must have both a base L-level and a functional role assignment. The functional role limits what modules they can access even if their L-level would otherwise permit broader access.

**Example:**
An L4 HR Officer cannot access procurement PO records, even though L4 generally permits procurement viewing.
An L5 QA Inspector can create NCRs, even though L5 does not generally have create authority in other modules.

---

# 5. Layer C — External Stakeholder Roles

## 5.1 External Role Definitions

| Code | Role | Who They Are | System Relationship |
|------|------|--------------|---------------------|
| EXT-CLT | Client / Project Owner | Employer, developer, government authority | Contract principal. Approves milestones, reviews progress, signs off handover. |
| EXT-CON | Consultant / PMC / Engineer | Architect, structural engineer, PMC, supervision consultant | Technical reviewer and approver on behalf of Client. |
| EXT-SUB | Subcontractor | Works subcontractor, specialist contractor | Executes scope, submits progress, receives inspection, submits claims. |
| EXT-SUP | Supplier / Vendor | Material supplier, equipment vendor | Receives PO, confirms delivery schedule, submits delivery note and invoice. |
| EXT-REG | Regulatory Authority | Municipality, fire department, utility, government body | Reviews and approves authority submission packages. |
| EXT-AUD | External Auditor | Financial auditor, ISO auditor, lender's technical advisor | Read-only access within defined audit scope. Cannot modify any record. |

## 5.2 External Role Universal Rules

These rules apply to all EXT roles without exception:

- External users are always scoped to a specific project. They cannot see or browse other projects.
- External users see only records where they are the assigned party, originator, named addressee, or formally transmitted recipient.
- External users cannot see internal notes, internal cost breakdown beyond their own contract, HR data, payroll, or other subcontractors' or suppliers' information.
- Document transmittal is the access gate. A document only becomes visible to an external party after it has been formally issued via transmittal in the Document Control module.
- External users can never delete any record in the system.
- External users cannot configure workflows, notification rules, or system settings.
- External users access the system through a dedicated external portal view, not the internal workspace.

## 5.3 External Role Permission Table

| Action | EXT-CLT | EXT-CON | EXT-SUB | EXT-SUP | EXT-REG | EXT-AUD |
|--------|---------|---------|---------|---------|---------|---------|
| View project dashboard | V | V | V (own scope) | — | V (limited) | V |
| View project schedule | V | V | V (own scope) | — | — | V |
| View documents (transmitted) | V | V | V (own scope) | — | V (authority pkg) | V |
| Download documents | V | V | V (own scope) | — | V | V |
| Approve / reject documents | A | A | — | — | A (authority docs) | — |
| Upload documents to transmittal | — | C/S | C/S | — | — | — |
| Submit RFI | — | C/S | C/S | — | — | — |
| Respond to RFI | — | A | — | — | — | — |
| View task list | V | V | V (own tasks) | — | — | — |
| Update task progress | — | — | E/S | — | — | — |
| Submit inspection request | — | — | C/S | — | — | — |
| View inspection records | V | V | V (own scope) | — | — | V |
| Sign off inspection | — | A | — | — | A (authority) | — |
| View NCR | V | V | V (own scope) | — | — | V |
| Respond to NCR | — | — | C/S | — | — | — |
| View procurement status | — | — | — | V (own PO) | — | — |
| Confirm delivery schedule | — | — | — | S | — | — |
| Submit delivery note | — | — | — | C/S | — | — |
| Submit invoice | — | — | C/S | C/S | — | — |
| View financial data | V (own IPC, VO) | — | V (own claim) | V (own PO/invoice) | — | V (assigned scope) |
| Export reports | — | — | — | — | — | V (assigned) |
| Sign handover package | A | A | — | — | A (authority) | — |
| View DLP records | V | V | V (own scope) | — | — | — |
| Submit DLP defect | — | — | C/S | — | — | — |
| View audit trail | — | — | — | — | — | V (own scope) |

---

# 6. Permission Type Codes

| Code | Meaning | Description |
|------|---------|-------------|
| V | View | Read and open records |
| C | Create | Create new records |
| E | Edit | Modify existing records |
| D | Delete | Delete or permanently remove records |
| S | Submit | Submit records for review or approval |
| A | Approve | Approve or formally accept records |
| R | Reject | Reject with mandatory comment |
| X | Export | Export data or generate downloadable reports |
| T | Transmit | Issue documents via formal transmittal |
| CF | Configure | Configure module settings, templates, workflows |
| RS | Reassign | Reassign tasks or approval responsibilities to another user |

**Combined cell notation:**
- `V/C/E` = User has View, Create, and Edit
- `C/S` = User can Create and Submit
- `A/R` = User can Approve and Reject (always paired)
- `—` = No access

---

# 7. Module Permission Matrix

## 7.1 Task Management

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 | EXT-CLT | EXT-CON | EXT-SUB |
|--------|----|----|----|----|----|----|----|---------|---------|---------| 
| View Task | — | V | V | V | V | V | V | V | V | V (own) |
| Create Task | CF | C | C | C | C | — | — | — | — | — |
| Assign Task | CF | C | C | C | C | — | — | — | — | — |
| Reassign Task | CF | RS | RS | RS | RS | — | — | — | — | — |
| Update Task Progress | — | E | E | E | E | E | E | — | — | E (own) |
| Submit Task | — | S | S | S | S | S | S | — | — | S (own) |
| Approve Task | — | A/R | A/R | A/R | — | — | — | — | — | — |
| Delete Task | CF | D | D | D | — | — | — | — | — | — |
| Export Task Report | CF | X | X | X | X | X | — | — | — | — |
| Configure Task Workflow | CF | — | — | — | — | — | — | — | — | — |

---

## 7.2 Document Control

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 | EXT-CLT | EXT-CON | EXT-SUB | EXT-REG | EXT-AUD |
|--------|----|----|----|----|----|----|----|---------|---------|---------|---------|---------| 
| View Document | — | V | V | V | V | V | V | V (TX) | V (TX) | V (TX) | V (TX) | V |
| Upload Document | — | C | C | C | C | C | — | — | C/S | C/S | — | — |
| Edit Document Metadata | — | E | E | E | E | E | — | — | — | — | — | — |
| Submit for Review | — | S | S | S | S | S | — | — | S | S | — | — |
| Approve Document | — | A/R | A/R | A/R | — | — | — | A/R | A/R | — | A/R (auth) | — |
| Issue for Construction | — | — | T | T | T | — | — | — | — | — | — | — |
| Transmit to External | — | T | T | T | T | — | — | — | — | — | — | — |
| Download Document | — | V | V | V | V | V | V | V (TX) | V (TX) | V (TX) | V (TX) | V |
| Archive Document | — | D | D | — | — | — | — | — | — | — | — | — |
| Delete Document | — | D | D | — | — | — | — | — | — | — | — | — |
| Export Document Register | — | X | X | X | X | — | — | — | — | — | — | X |
| Configure Doc Types | CF | CF | — | — | — | — | — | — | — | — | — | — |

> **(TX)** = Access only after formal transmittal. Un-transmitted documents are invisible to external roles.

---

## 7.3 Procurement (PR / RFQ / PO)

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 | EXT-SUP | EXT-CLT | EXT-CON |
|--------|----|----|----|----|----|----|----|---------|---------|---------| 
| View Procurement | — | V | V | V | V | V | V | V (own) | — | — |
| Create PR | — | C | C | C | C | C | — | — | — | — |
| Approve PR (standard) | — | A/R | A/R | A/R | — | — | — | — | — | — |
| Create RFQ | — | C | C | C | C | — | — | — | — | — |
| Receive Quotation | — | C | C | C | C | C | — | — | — | — |
| Evaluate Quotation | — | E | E | E | E | E | — | — | — | — |
| Prepare PO Draft | — | C | C | C | C | — | — | — | — | — |
| Approve PO (standard) | — | A/R | A/R | — | — | — | — | — | — | — |
| Issue PO to Supplier | — | T | T | T | — | — | — | — | — | — |
| Confirm PO Receipt | — | — | — | — | — | — | — | S | — | — |
| Confirm Delivery Schedule | — | — | — | — | — | — | — | S | — | — |
| Close Procurement Record | — | — | A | A | — | — | — | — | — | — |
| Export Procurement Report | — | X | X | X | X | — | — | — | — | — |
| Configure Supplier Master | CF | CF | CF | — | CF | — | — | — | — | — |

> **Approval thresholds for PR and PO are defined in Section 8.**

---

## 7.4 Inventory / Stock Management

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 (Storekeeper) |
|--------|----|----|----|----|----|----|------------------| 
| View Stock Records | — | V | V | V | V | V | V |
| Receive Material (GRN) | — | — | — | — | C | C | C |
| Issue Material to Site | — | — | — | — | C | C | C |
| Transfer Between Stores | — | — | — | — | C | C | C |
| Adjust Stock | — | — | — | — | A/R | — | S |
| Conduct Stock Count | — | — | — | — | A | E | C/S |
| Set Reorder Level | — | — | — | — | CF | — | — |
| Export Stock Report | — | X | X | X | X | — | — |

---

## 7.5 Construction Management

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 | EXT-CLT | EXT-CON | EXT-SUB |
|--------|----|----|----|----|----|----|----|---------|---------|---------| 
| View Site Dashboard | — | V | V | V | V | V | V | V | V | V (own) |
| Create Daily Report | — | C | C | C | C | C | C | — | — | C |
| Submit Daily Report | — | S | S | S | S | S | S | — | — | S |
| Approve Daily Report | — | A/R | A/R | A/R | — | — | — | — | — | — |
| Update Progress | — | E | E | E | E | E | E | — | — | E (own) |
| Upload Site Photo | — | C | C | C | C | C | C | — | — | C |
| Log Manpower | — | C | C | C | C | C | C | — | — | C (own) |
| Log Equipment Usage | — | C | C | C | C | C | C | — | — | — |
| Create Issue Log | — | C | C | C | C | C | C | — | C | C |
| Resolve Issue Log | — | A/R | A/R | A/R | A/R | — | — | — | — | — |
| Export Progress Report | — | X | X | X | X | — | — | — | — | — |

---

## 7.6 QA/QC

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 | EXT-CLT | EXT-CON | EXT-SUB | EXT-REG |
|--------|----|----|----|----|----|----|----|---------|---------|---------|---------| 
| View Inspection Records | — | V | V | V | V | V | V | V | V | V (own) | V |
| Create ITP | — | C | C | C | C | C | — | — | — | — | — |
| Approve ITP | — | A/R | A/R | A/R | — | — | — | A/R | A/R | — | — |
| Create Inspection Request | — | C | C | C | C | C | — | — | — | C/S | — |
| Record Inspection Result | — | E | E | E | E | E | — | — | — | — | — |
| Approve / Pass Inspection | — | A/R | A/R | A/R | A/R | — | — | — | A/R | — | A/R (auth) |
| Create NCR | — | C | C | C | C | — | — | — | C | — | — |
| Respond to NCR | — | E | E | E | E | E | E | — | — | C/S | — |
| Close NCR | — | A/R | A/R | A/R | — | — | — | — | A/R | — | — |
| Create Punch List | — | C | C | C | C | C | — | — | C | — | — |
| Close Punch List Item | — | A/R | A/R | A/R | — | — | — | A/R | A/R | — | — |
| Export QA/QC Report | — | X | X | X | X | — | — | — | — | — | — |

---

## 7.7 HSE

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 | EXT-CLT | EXT-CON | EXT-SUB |
|--------|----|----|----|----|----|----|----|---------|---------|---------| 
| View HSE Dashboard | — | V | V | V | V | V | V | V | V | V (own) |
| Create Risk Assessment | — | C | C | C | C | C | — | — | — | C |
| Approve Risk Assessment | — | A/R | A/R | A/R | A/R | — | — | — | — | — |
| Issue Work Permit | — | — | — | — | A/R | — | — | — | — | — |
| Request Work Permit | — | S | S | S | S | S | S | — | — | S |
| Record Toolbox Talk | — | C | C | C | C | C | C | — | — | C |
| Report Incident | — | C | C | C | C | C | C | — | — | C |
| Investigate Incident | — | E | E | E | E | — | — | — | — | — |
| Close Incident | — | A/R | A/R | A/R | — | — | — | — | — | — |
| Export HSE Report | — | X | X | X | X | — | — | — | — | — |

---

## 7.8 HR Module

| Action | L0 | L1 | L2 | L3 | L4 (HR) | L5 | L6 | EXT roles |
|--------|----|----|----|----|---------|----|----|----------| 
| View Employee Records | — | V | V | V | V | V (own dept) | — | — |
| Create / Edit Employee | — | C/E | C/E | — | C/E | — | — | — |
| Deactivate Employee | — | D | D | — | D | — | — | — |
| Submit Leave Request | — | S | S | S | S | S | S | — |
| Approve Leave | — | A/R | A/R | A/R | A/R | — | — | — |
| Submit Timesheet | — | S | S | S | S | S | S | — |
| Approve Timesheet | — | A/R | A/R | A/R | A/R | — | — | — |
| View Payroll Data | — | V | V | — | V (HR) | — | — | — |
| Export Payroll Data | — | X | X | — | X (HR) | — | — | — |
| Manage Public Holidays | CF | CF | CF | — | CF | — | — | — |

> External stakeholder roles have **no access** to any HR module data.

---

## 7.9 Account / Finance

| Action | L0 | L1 | L2 | L3 | L4 (Acct) | L5 | L6 | EXT-CLT | EXT-SUB | EXT-SUP | EXT-AUD |
|--------|----|----|----|----|-----------|----|----|---------|---------|---------|---------|
| View Project Budget | — | V | V | V | V | — | — | — | — | — | V |
| View Budget vs Actual | — | V | V | V | V | — | — | — | — | — | V |
| Create Budget | — | C | C | C | C | — | — | — | — | — | — |
| Approve Budget | — | A/R | A/R | — | — | — | — | — | — | — | — |
| Create Invoice (AP/AR) | — | C | C | C | C | — | — | — | C/S | C/S | — |
| Approve Invoice | — | A/R | A/R | — | A/R | — | — | — | — | — | — |
| Create Payment Request | — | C | C | C | C | — | — | — | — | — | — |
| Approve Payment | — | A/R | A/R | — | — | — | — | — | — | — | — |
| Create Variation Order | — | C | C | C | C | — | — | — | — | — | — |
| Approve Variation Order | — | A/R | A/R | — | — | — | — | A/R | — | — | — |
| View Own IPC / Claim | — | — | — | — | — | — | — | V | V | V | — |
| Export Financial Report | — | X | X | X | X | — | — | — | — | — | X |
| Configure Chart of Accounts | CF | CF | CF | — | CF | — | — | — | — | — | — |

---

## 7.10 Planning & Scheduling

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 | EXT-CLT | EXT-CON |
|--------|----|----|----|----|----|----|----|---------|---------| 
| View Schedule | — | V | V | V | V | V | V | V | V |
| Create Baseline Schedule | — | C | C | C | C | — | — | — | — |
| Approve Baseline | — | A/R | A/R | A/R | — | — | — | A/R | A/R |
| Update Actual Progress | — | E | E | E | E | E | E | — | — |
| Create Lookahead Plan | — | C | C | C | C | C | — | — | — |
| Record Delay | — | C | C | C | C | C | — | — | — |
| Approve Delay Analysis | — | A/R | A/R | A/R | — | — | — | — | — |
| Export Schedule Report | — | X | X | X | X | — | — | — | — |

---

## 7.11 Commissioning & Handover

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 | EXT-CLT | EXT-CON | EXT-REG |
|--------|----|----|----|----|----|----|----|---------|---------|---------| 
| View Commissioning Records | — | V | V | V | V | V | V | V | V | V |
| Create Test Record | — | C | C | C | C | C | — | — | — | — |
| Submit Test Record | — | S | S | S | S | S | — | — | — | — |
| Approve Test Record | — | A/R | A/R | A/R | — | — | — | — | A/R | A/R (auth) |
| Create Handover Package | — | C | C | C | C | — | — | — | — | — |
| Sign Off Handover | — | A/R | A/R | A/R | — | — | — | A/R | A/R | — |
| Upload O&M Manual | — | C | C | C | C | C | — | — | — | — |
| Upload As-Built Drawings | — | C | C | C | C | C | — | — | — | — |
| Close Project | — | A/R | A/R | — | — | — | — | — | — | — |

---

## 7.12 Reporting & KPI

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 | EXT-CLT | EXT-CON | EXT-AUD |
|--------|----|----|----|----|----|----|----|---------|---------|---------| 
| View Executive Dashboard | — | V | V | — | — | — | — | — | — | V |
| View Project Dashboard | — | V | V | V | V | V | — | V | V | V |
| View Department Dashboard | — | V | V | V | V | — | — | — | — | — |
| Generate Standard Report | — | X | X | X | X | — | — | — | — | X |
| Create Custom Report | — | X | X | X | — | — | — | — | — | — |
| Export Report | — | X | X | X | X | — | — | X (own) | — | X |
| Configure KPI Settings | CF | CF | CF | — | — | — | — | — | — | — |

---

## 7.13 Admin Configuration

| Action | L0 | L1 | L2 | L3 | L4 | L5 | L6 | EXT roles |
|--------|----|----|----|----|----|----|----|-----------| 
| Manage Tenant / Company | CF | — | — | — | — | — | — | — |
| Manage Users | CF | CF | CF | — | — | — | — | — |
| Assign Roles | CF | CF | CF | — | — | — | — | — |
| Change Permissions | CF | CF | — | — | — | — | — | — |
| Configure Approval Workflow | CF | CF | CF | CF | — | — | — | — |
| Configure Notification Rules | CF | CF | CF | CF | — | — | — | — |
| Configure Document Types | CF | CF | CF | — | CF (DC) | — | — | — |
| Configure WBS Templates | CF | CF | CF | CF | — | — | — | — |
| Configure Cost Codes | CF | CF | CF | — | CF (Acct) | — | — | — |
| Configure Public Holidays | CF | CF | CF | — | CF (HR) | — | — | — |
| View Audit Logs | CF | V | V | V | V (own dept) | — | — | — |
| Export Audit Logs | CF | X | X | X | — | — | — | — |

---

# 8. Approval Authority Matrix

## 8.1 Standard Approval Matrix

| Process | L3 | L2 | L1 | Notes |
|---------|----|----|----|----|
| Task Approval | ✓ | ✓ | ✓ | L3 minimum |
| Document Approval (Internal) | ✓ | ✓ | ✓ | L3 minimum |
| Document Approval (Issue for Construction) | ✓ | ✓ | ✓ | L3 minimum |
| RFI Closure | ✓ | ✓ | ✓ | L3 minimum |
| NCR Closure (Minor) | ✓ | ✓ | ✓ | L4 (QA Manager) minimum |
| NCR Closure (Major / Critical) | ✓ | ✓ | ✓ | L3 minimum; L2 for Critical |
| Inspection Approval | ✓ | ✓ | ✓ | L4 (QA Inspector with authority) |
| Timesheet Approval | ✓ | ✓ | ✓ | L3 minimum |
| Leave Approval | ✓ | ✓ | ✓ | L3 minimum; L4 for routine |
| Daily Report Approval | ✓ | ✓ | ✓ | L3 minimum |

## 8.2 Value-Based Approval Matrix

### Purchase Requisition (PR)

| Value Tier | Threshold | Approver Required |
|------------|-----------|-------------------|
| Tier 1 | < $5,000 | L3 Project Manager |
| Tier 2 | $5,000 – $50,000 | L3 + L2 |
| Tier 3 | > $50,000 | L3 + L2 + L1 |

### Purchase Order (PO)

| Value Tier | Threshold | Approver Required |
|------------|-----------|-------------------|
| Tier 1 | < $10,000 | L3 Project Manager |
| Tier 2 | $10,000 – $100,000 | L2 General Manager |
| Tier 3 | > $100,000 | L1 Managing Director |

### Payment / Invoice Approval

| Value Tier | Threshold | Approver Required |
|------------|-----------|-------------------|
| Tier 1 | < $5,000 | L3 Project Manager |
| Tier 2 | $5,000 – $50,000 | L2 General Manager |
| Tier 3 | > $50,000 | L1 Managing Director |

### Variation Order / Change Order

| Value Tier | Threshold | Approver Required |
|------------|-----------|-------------------|
| Tier 1 | < $10,000 | L3 + L4 (QS) |
| Tier 2 | $10,000 – $100,000 | L2 + L3 |
| Tier 3 | > $100,000 | L1 + Client (EXT-CLT) |

### Contract Award / Subcontract

| Value Tier | Threshold | Approver Required |
|------------|-----------|-------------------|
| Any | All values | L1 Managing Director |
| Major contract | > $500,000 | L1 + Board (if applicable) |

### Document Approval by Submission Type

| Submission Type | Approver Required |
|-----------------|-------------------|
| Internal review only | L4 Discipline Manager |
| Issue for Construction | L3 Project Manager |
| External issue to Client/Consultant | L3 + L2 |
| Authority submission (regulatory) | L2 minimum |

## 8.3 Threshold Configuration Rule

Value thresholds must be configurable by Company Admin per project or company default. They must not be hard-coded. Different projects or companies may have different authority schedules.

---

# 9. Data Visibility Rules

## 9.1 Internal Role Visibility

| Role | Project Access | Financial Scope | HR Scope | Admin Scope |
|------|----------------|-----------------|----------|-------------|
| L0 Super Admin | Platform config only | Platform billing only | Platform only | Full platform |
| L1 Managing Director | All company projects | Full P&L, all budgets, all cost | Full company HR | Full company |
| L2 General Manager | All company projects | All project budgets, committed cost, cash flow | Department HR | Department config |
| L3 Project Manager | Assigned projects only | Own project budget, cost, IPC, VO | Own project team | Project config |
| L4 Manager | Own dept across assigned projects | Own department cost codes and POs | Own department staff | Department config |
| L5 Senior | Assigned tasks, discipline records | No financial access | Own records only | None |
| L6 Staff | Own tasks only | None | Own timesheets and leave | None |

## 9.2 External Role Visibility

| External Role | Project Access | Document Scope | Financial Scope | HR Scope |
|---------------|----------------|----------------|-----------------|----------|
| EXT-CLT | Named project only | Transmitted documents and own approvals | Own IPCs, VO, Final Account | None |
| EXT-CON | Named project only | Assigned review documents, transmitted docs | None | None |
| EXT-SUB | Named project, own scope | Transmitted to them, own submissions | Own contract value, own claims | None |
| EXT-SUP | Named project, own POs | Own PO documents | Own PO value, own invoices | None |
| EXT-REG | Named project, authority scope | Authority submission packages | None | None |
| EXT-AUD | Named project, assigned audit scope | Defined audit document set | Assigned financial scope | None |

## 9.3 Confidentiality Rules

- One subcontractor must never see another subcontractor's contract value, claims, or documents.
- One supplier must never see another supplier's pricing, quotations, or PO values.
- Internal cost breakdown, margin, and profit data must never be visible to any external role.
- Tender data for other projects must not be visible to any project-level user outside those projects.
- HR and payroll data is internal only — no external role has any access under any condition.

---

# 10. Self-Approval Conflict Rules

## 10.1 Core Conflict Prohibition

```
IF submitter_id = approver_id → BLOCK — enforced at workflow engine level
IF document_creator_id = approver_id → BLOCK
IF PR_requester_id = PR_approver_id → BLOCK
IF PO_preparer_id = PO_approver_id → BLOCK
IF invoice_creator_id = payment_approver_id → BLOCK
IF NCR_creator_id = NCR_closer_id → BLOCK (unless L1 emergency override)
```

## 10.2 Emergency Override Rule

In rare cases, L1 (Managing Director) may need to act on an urgent record they initiated.

Conditions:
- Emergency override is logged in the audit trail with mandatory reason code
- A second confirmation step is required
- Notification is automatically sent to L0 Super Admin
- Override cannot be used for financial records above Tier 2 threshold without Board confirmation

## 10.3 Conflict Scope by Module

| Module | Conflict Rule |
|--------|---------------|
| Document Control | Uploader cannot be the approver on the same revision |
| Procurement | PR requestor cannot approve their own PR; PO drafter cannot approve |
| Account / Finance | Invoice creator cannot approve payment; QS who prepared IPC cannot approve it |
| HR | Employee cannot approve their own leave or timesheet |
| QA/QC | Engineer who performed work cannot approve their own inspection |
| Task | Task executor cannot be sole approver of their own task (reviewer must differ) |

---

# 11. External Access Boundary Rules

## 11.1 What External Users Can Never Access

Regardless of any other configuration, the following are always blocked for all EXT roles:

| Blocked Area | Reason |
|-------------|--------|
| Internal notes and comments (marked internal) | Confidential internal coordination |
| Other parties' contract values, claims, invoices | Commercial confidentiality |
| HR records — any employee data | Privacy and regulatory |
| Payroll, salary, compensation data | Privacy and regulatory |
| Tender records for other projects | Commercial confidentiality |
| Audit logs (general) | Internal governance (EXT-AUD has limited scope only) |
| Admin configuration screens | Internal system control |
| Approval workflow configuration | Internal system control |
| User management and role management | Internal system control |
| Notification rule configuration | Internal system control |
| Budget breakdown beyond summary level | Commercial confidentiality (unless Client-side for CLT) |

## 11.2 Transmittal Gate Rule

A document is invisible to all EXT roles until a formal transmittal record has been created linking that document revision to that external party. This applies to:

- Drawings
- Specifications
- Calculation notes
- Method statements
- Inspection records
- Any document type

The transmittal must include: document number, revision, date of issue, recipient party, and issuer.

## 11.3 External User Session Rules

- External users must be assigned to a specific project by a Company Admin or Project Manager before they can log in to any project workspace.
- Removing a stakeholder from a project immediately revokes all access to that project.
- External users accessing the system via shared credentials is prohibited; each contact person must have their own login.

---

# 12. Workflow Integration Rules

## 12.1 Internal Workflow Authority by Level

```
L6  →  Create / Submit
L5  →  Review / Validate
L4  →  Validate / Escalate
L3  →  Approve / Reject (project level)
L2  →  Approve / Reject (company level, high value)
L1  →  Final Approval (highest value, contract, payment)
```

## 12.2 External Party Workflow Integration

```
EXT-SUB / EXT-SUP  →  Submit (progress, delivery, invoice)
EXT-CON / EXT-CLT  →  Review / Approve (documents, RFI, inspections)
EXT-REG            →  Approve (authority submission packages)
Internal (L3+)     →  Override rejection or re-submit with revision
```

## 12.3 Multi-Level Approval Flow (Standard)

```
Originator (any level) → Submit
  ↓
Reviewer (L5 or L4 depending on module)
  ↓
Approver (L3–L1 depending on value tier and module)
  ↓
External Approval (if required by contract or regulation)
  ↓
Closed / Issued
```

Rejection at any step returns the record to the originator with mandatory comment.

## 12.4 Workflow Escalation Rule

```
Action required notification sent
  ↓ No response within configured time
Reminder sent to responsible user
  ↓ Still no response
Escalate to Department Manager (L4)
  ↓ Still no response
Escalate to Project Manager (L3)
  ↓ Still no response
Escalate to General Manager (L2) / Project Director
  ↓ Critical items only
Escalate to Managing Director (L1)
```

Escalation timing is configurable per event type in Admin Configuration.

## 12.5 Parallel vs Sequential Approval

| Scenario | Rule |
|----------|------|
| Standard document review | Sequential (reviewer → approver) |
| Multi-discipline coordination | Parallel (all discipline leads review simultaneously) |
| High-value PO | Sequential (L3 → L2 → L1) |
| Client and internal approval | Internal first → then external issue |
| Authority submission | Internal approval → then submit to authority for external approval |

---

# 13. Admin Configuration Notes

## 13.1 What Must Be Configurable (Not Hard-Coded)

| Setting | Configurable By |
|---------|----------------|
| Approval authority thresholds (value tiers) | L1 / Company Admin |
| Approval chain per module | L1 / Company Admin |
| Escalation timing per event | L2 / L3 / Company Admin |
| Notification channels per event | L2 / L3 / Company Admin |
| Document types and numbering format | L4 (Document Controller) / Company Admin |
| WBS node types and hierarchy depth | L3 / Company Admin |
| Cost codes | L4 (Accountant) / Company Admin |
| Public holidays calendar | L4 (HR) / Company Admin |
| QA/QC checklist templates | L4 (QA Manager) / Company Admin |
| HSE permit templates | L4 (HSE Manager) / Company Admin |
| External stakeholder project assignments | L3 / Company Admin |

## 13.2 What Must Be Hard-Coded (Not Configurable)

| Rule | Reason |
|------|--------|
| Self-approval prohibition | Governance and audit integrity |
| External user cannot access HR data | Privacy |
| Audit logs are append-only | Legal traceability |
| Password and sensitive fields never stored in audit values | Security |
| L0 Super Admin cannot access live project execution data | Tenant isolation |
| Financial logs retained minimum 7 years | Legal and regulatory |

## 13.3 Permission Change Audit Rule

Any change to user roles, permissions, or access scope must:
- Be logged in the Audit Log as a CRITICAL severity event
- Generate a notification to Company Admin and L1
- Record the old role, new role, changed-by user, and timestamp
- Require secondary confirmation for L1 role assignments

---

# Appendix A — Role Code Reference

| Code | Role |
|------|------|
| L0 | Super Admin |
| L1 | Managing Director |
| L2 | General Manager / Director |
| L3 | Project Manager |
| L4 | Department / Discipline Manager |
| L5 | Senior Engineer / Senior Officer |
| L6 | Staff / Engineer / Supervisor |
| DC | Document Controller (functional) |
| PO | Procurement Officer (functional) |
| QA | QA/QC Inspector (functional) |
| HSE | HSE Officer (functional) |
| QS | QS / Cost Engineer (functional) |
| SS | Site Supervisor (functional) |
| SK | Storekeeper (functional) |
| HR | HR Officer (functional) |
| AC | Accountant (functional) |
| BIM | BIM Coordinator (functional) |
| PE | Planning Engineer (functional) |
| EXT-CLT | External: Client / Owner |
| EXT-CON | External: Consultant / PMC |
| EXT-SUB | External: Subcontractor |
| EXT-SUP | External: Supplier |
| EXT-REG | External: Regulatory Authority |
| EXT-AUD | External: External Auditor |

---

# Appendix B — Permission Code Reference

| Code | Meaning |
|------|---------|
| V | View |
| C | Create |
| E | Edit |
| D | Delete |
| S | Submit |
| A | Approve |
| R | Reject |
| X | Export |
| T | Transmit |
| CF | Configure |
| RS | Reassign |
| — | No access |
| A/R | Approve and Reject (always paired) |
| C/S | Create and Submit |
| C/E | Create and Edit |

---

# Appendix C — Approval Authority Summary

| Process | L6 | L5 | L4 | L3 | L2 | L1 | EXT |
|---------|----|----|----|----|----|----|-----|
| Task | — | — | — | ✓ | ✓ | ✓ | — |
| Document (Internal) | — | — | — | ✓ | ✓ | ✓ | — |
| Document (Client/Consultant) | — | — | — | ✓ | ✓ | ✓ | EXT-CLT / EXT-CON |
| RFI | — | — | — | ✓ | ✓ | ✓ | EXT-CON |
| PR (< $5K) | — | — | — | ✓ | ✓ | ✓ | — |
| PR ($5K–$50K) | — | — | — | ✓ | ✓ | ✓ | — |
| PR (> $50K) | — | — | — | ✓ | ✓ | ✓ | — |
| PO (< $10K) | — | — | — | ✓ | ✓ | ✓ | — |
| PO ($10K–$100K) | — | — | — | — | ✓ | ✓ | — |
| PO (> $100K) | — | — | — | — | — | ✓ | — |
| Payment (< $5K) | — | — | — | ✓ | ✓ | ✓ | — |
| Payment ($5K–$50K) | — | — | — | — | ✓ | ✓ | — |
| Payment (> $50K) | — | — | — | — | — | ✓ | — |
| NCR Close | — | — | ✓ (minor) | ✓ | ✓ | ✓ | — |
| Handover | — | — | — | ✓ | ✓ | ✓ | EXT-CLT / EXT-CON |
| Contract Award | — | — | — | — | — | ✓ | — |

---

**Document:** DCOS Role & Permission Matrix
**Version:** R1
**Status:** For Review
**Next Review:** After MVP Phase 1 completion
