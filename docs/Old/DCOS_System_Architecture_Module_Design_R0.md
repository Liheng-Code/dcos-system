# Digital Construction Operating System (DCOS)
## Full System Architecture and Module Design

**Document Type:** System Architecture Design  
**Version:** 1.1  
**Prepared For:** Construction Company Web Application  
**Architecture Principle:** One unified WBS-driven platform, modular by discipline  
**Recommended Build Style:** Start as a modular monolith, scale toward services when modules become heavy  

---

## 1. Executive Summary

The Digital Construction Operating System (DCOS) is a unified web application for managing a construction company across stakeholders, projects, disciplines, lifecycle stages, documents, tasks, procurement, construction execution, HR, account, and reporting.

The correct architecture is not many disconnected systems. The correct architecture is:

> **One core platform + shared WBS engine + modular discipline workspaces.**

This means all modules share the same project, WBS, user, document, approval, notification, audit, and reporting backbone. Each discipline then has its own specialized workspace and workflows.

Example:

- Architecture uses the same project and WBS, but manages drawings, finishes, material boards, RFIs, and approvals.
- Structure uses the same project and WBS, but manages structural drawings, calculation notes, rebar, design checks, and site clarification.
- MEP uses the same project and WBS, but manages equipment, embedded sleeves, services routing, testing, and commissioning.
- Procurement uses the same WBS/project data, but manages PR, RFQ, PO, supplier, delivery, and stock.
- Construction uses the same WBS/project data, but manages tasks, manpower, site reports, progress, QA/QC, and handover.

The WBS is the spine. Every task, document, approval, cost, material, drawing, issue, and report should connect back to a project and WBS location.

---

## 2. Core Design Philosophy

### 2.1 One Unified System

DCOS should be designed as one company operating system, not as separate apps for each department.

**Why:**

- Construction work is interdependent.
- Design affects procurement.
- Procurement affects site execution.
- Site issues affect cost and schedule.
- HR and timesheet affect productivity and payroll.
- Account needs approved cost, payment, invoice, and contract data.

If each department works in isolation, the system becomes digital Excel chaos. Same old mess, new screen.

### 2.2 Modular by Discipline

Although the system is unified, each discipline must have its own module because each department has different workflows.

**Core modules share:**

- Project setup
- WBS setup
- Stakeholder setup
- User and role setup
- Document control
- Approval workflow
- Notification engine
- Audit trail
- Reporting engine

**Discipline modules specialize:**

- Architecture
- Structure
- MEP
- Procurement
- Construction
- HR
- Account

### 2.3 WBS-Driven Control

Every record should answer five questions:

1. Which project?
2. Which WBS location?
3. Which discipline?
4. Which responsible party?
5. What status?

Recommended WBS hierarchy:

```text
Company / Tenant
└── Project
    └── Building / Area
        └── Level
            └── Zone
                └── Room / Space / Element
                    └── Task / Document / Cost / Material / Inspection
```

The WBS must support dynamic depth, because real projects are messy. A factory, tower, hospital, road, and infrastructure project will not always follow the same structure.

---

## 3. High-Level System Architecture

```text
User Interface Layer
├── Executive Dashboard
├── Project Dashboard
├── WBS / Task Workspace
├── Discipline Workspaces
├── Document Center
├── Procurement Center
├── Construction Site Workspace
├── HR Workspace
├── Account Workspace
└── Admin Configuration

Application Layer
├── Authentication & RBAC
├── Company / Tenant Management
├── Stakeholder Management
├── Project Management
├── WBS Engine
├── Task Engine
├── Document Control Engine
├── Approval Workflow Engine
├── Notification Engine
├── Audit Trail Engine
├── Reporting & KPI Engine
└── Integration Engine

Module Layer
├── Architecture Design Module
├── Structural Design Module
├── MEP Design Module
├── Procurement Module
├── Construction Module
├── HR Module
├── Account / Finance Module
├── QA/QC Module
├── HSE Module
├── BIM Coordination Module
└── Handover / DLP Module

Data Layer
├── PostgreSQL / Supabase Database
├── File Storage
├── Realtime Channels
├── Audit Logs
└── Report Views
```

---

## 4. Recommended Technology Stack

### 4.1 MVP Stack

For first production version:

| Layer | Recommended Tool | Purpose |
|---|---|---|
| Frontend | Next.js + React + TypeScript | Web application |
| UI | Tailwind CSS + shadcn/ui | Professional dashboard UI |
| Backend | Supabase first, Node.js later if needed | Auth, database, storage, realtime |
| Database | Supabase PostgreSQL | Main structured data |
| File Storage | Supabase Storage or S3/R2 | Drawings, photos, PDFs, BIM files |
| Deployment | Vercel | Frontend deployment |
| Notification | Email + Telegram Bot + in-app notification | Alerts and approvals |
| Reports | PostgreSQL views + dashboard charts | KPI and management reporting |

### 4.2 Scale-Up Stack

When the system becomes large:

| Layer | Recommended Tool | Purpose |
|---|---|---|
| Backend API | Node.js / NestJS | Heavy business logic |
| Queue | BullMQ / Redis | Background jobs |
| Cache | Redis | Performance |
| Search | PostgreSQL full-text or Meilisearch | Document/task search |
| Object Storage | Cloudflare R2 / AWS S3 | Large file storage |
| Monitoring | Sentry + Grafana | Error and performance tracking |
| CI/CD | GitHub Actions | Automated deployment |

---

## 5. Master Module Map

| No. | Module | Main Purpose | WBS Required |
|---:|---|---|---|
| 1 | Stakeholder Setup | Manage project parties | Optional / Project-level |
| 2 | Company / Tenant Setup | Manage company profile and access | No |
| 3 | Project Setup | Manage tender and awarded projects | Yes |
| 4 | WBS Management | Project breakdown structure | Yes |
| 5 | User / Role / Permission | Access control | No |
| 6 | Architecture Design | ARC drawings and design tasks | Yes |
| 7 | Structural Design | STR drawings, calculations, reviews | Yes |
| 8 | MEP Design | MEP drawings, coordination, testing data | Yes |
| 9 | Procurement | PR, RFQ, PO, suppliers, delivery | Yes |
| 10 | Construction | Site tasks, progress, daily reports | Yes |
| 11 | Document Control | Documents, revision, transmittals | Yes / Project-level |
| 12 | Planning & Scheduling | Baseline, Gantt, dependencies | Yes |
| 13 | QA/QC | ITP, inspections, NCR, punch list | Yes |
| 14 | HSE | Safety permits, incidents, toolbox | Yes |
| 15 | HR | Staff, attendance, leave, payroll support | Optional |
| 16 | Account / Finance | Payment, AP/AR, cost, invoice | Project/WBS for project cost |
| 17 | Inventory / Stock | Material receipt, issue, transfer | Yes |
| 18 | Equipment | Plant and equipment usage | Yes |
| 19 | Subcontractor | Contract, claim, progress, payment | Yes |
| 20 | Commissioning / Handover | Testing, O&M, warranties, handover | Yes |
| 21 | DLP | Defect liability tracking | Yes |
| 22 | Claims & Disputes | EOT, cost claims, evidence | Yes |
| 23 | Lessons Learned | Knowledge and historical data | Project-level |
| 24 | Reporting & KPI | Dashboards and management reports | Yes |
| 25 | Admin Configuration | Master data and system settings | No |

---

# 6. Module 1 — Stakeholder Setup

## 6.1 Purpose

The stakeholder module manages all project parties and their relationship to projects, contracts, documents, approvals, and communication.

## 6.2 Stakeholder Types

1. Project Owner / Client
2. Project Manager
3. Contractor / Main Contractor
4. Architects and Designers
5. Subcontractors
6. Suppliers / Vendors
7. Regulatory Authorities
8. Consultants
9. Testing Agencies
10. Utility Authorities
11. Insurance / Bonding Parties
12. Internal Company Departments

## 6.3 Main Features

- Stakeholder profile
- Organization profile
- Contact persons
- Role in project
- Contract relationship
- Approval authority
- Communication preference
- Document access level
- Performance evaluation
- Blacklist / preferred list status

## 6.4 Key Data Fields

| Field | Description |
|---|---|
| stakeholder_id | Unique ID |
| company_id | Tenant/company owner |
| stakeholder_type | Client, contractor, supplier, authority, etc. |
| organization_name | Company name |
| contact_person | Main representative |
| email | Contact email |
| phone | Contact phone |
| address | Office address |
| project_role | Role in current project |
| approval_level | Can approve / review / view |
| status | Active, inactive, blacklisted, preferred |
| notes | Internal notes |

## 6.5 Workflow

```text
Create stakeholder
→ assign stakeholder type
→ add contact person
→ link to project
→ assign project responsibility
→ define document access
→ define approval authority
→ monitor communication and performance
```

---

# 7. Module 2 — Project Setup

## 7.1 Purpose

The project setup module creates and controls all company projects, including tender stage and awarded stage.

## 7.2 Project Types

### Pre-Contract / Tender Project

Used before award.

Main control:

- Tender information
- Client information
- BOQ estimate
- Pre-bid clarification
- Tender drawings
- Tender schedule
- Risk register
- Bid submission
- Tender status

### Post-Contract / Awarded Project

Used after award.

Main control:

- Contract information
- Project team
- Baseline schedule
- Budget
- WBS
- Documents
- Procurement
- Construction execution
- Progress claim
- Handover

## 7.3 Main Features

- Multi-project portfolio
- Project creation wizard
- Project code management
- Project phase setup
- Contract setup
- Budget setup
- WBS setup
- Stakeholder assignment
- Project calendar
- Project document numbering
- Project dashboard

## 7.4 Key Data Fields

| Field | Description |
|---|---|
| project_id | Unique ID |
| project_code | Project code |
| project_name | Project name |
| project_type | Tender / Awarded / Internal |
| client_id | Linked client |
| contract_type | Lump sum, design-build, unit rate, etc. |
| contract_value | Approved contract value |
| currency | USD, KHR, etc. |
| start_date | Planned start |
| end_date | Planned finish |
| project_status | Tender, active, on-hold, completed, closed |
| project_manager_id | Responsible PM |

## 7.5 Project Lifecycle Integration

The project module must support:

1. Initiation
2. Planning
3. Execution
4. Monitoring & Controlling
5. Closure

Each project phase should have its own checklist, required documents, approvals, and dashboard status.

---

# 8. Module 3 — WBS Management

## 8.1 Purpose

WBS is the core control engine of DCOS. It organizes the project into manageable, reportable, trackable parts.

## 8.2 Recommended WBS Structure

```text
Project
├── Building / Area
│   ├── Level
│   │   ├── Zone
│   │   │   ├── Room / Space
│   │   │   │   ├── Element
│   │   │   │   │   └── Task
```

## 8.3 Main Features

- Dynamic WBS tree
- Manual WBS code input
- Optional auto-code generation later
- Parent-child node relationship
- WBS breadcrumb path
- WBS progress roll-up
- WBS cost roll-up
- WBS delay signal
- WBS document linking
- WBS issue linking
- WBS permission filtering

## 8.4 WBS Data Fields

| Field | Description |
|---|---|
| wbs_id | Unique ID |
| project_id | Linked project |
| parent_id | Parent WBS node |
| node_type | Building, level, zone, room, element, task group |
| wbs_code | User-defined code |
| wbs_name | Node name |
| full_path | Full WBS path |
| sort_order | Display order |
| progress_percent | Roll-up progress |
| status | Active, closed, on hold |

## 8.5 WBS Code Example

```text
P001-B01-L05-Z03-R045-STR-SLAB
```

Meaning:

- P001 = Project
- B01 = Building 01
- L05 = Level 05
- Z03 = Zone 03
- R045 = Room 045
- STR = Structural
- SLAB = Slab work

## 8.6 WBS Rules

- WBS code must be unique within project.
- WBS should not be deleted if linked records exist.
- WBS can be archived after project closure.
- WBS progress must roll up from child tasks.
- Task can only start if WBS is active.

---

# 9. Module 4 — User, Role, and Permission

## 9.1 Purpose

Control who can view, create, approve, edit, and delete records.

## 9.2 Recommended Roles

| Role | Purpose |
|---|---|
| Super Admin | Full platform control |
| Company Admin | Company-level setup |
| Director / CEO | Executive dashboard and approval visibility |
| Project Manager | Project-level control |
| Discipline Lead | Department control |
| Engineer | Task and document execution |
| Document Controller | Document register and transmittal control |
| QS / Cost Engineer | BOQ, cost, claim, IPC |
| Procurement Officer | PR, RFQ, PO, supplier |
| Store Keeper | Stock receipt and issue |
| Site Supervisor | Site task and daily report |
| QA/QC Inspector | Inspection and NCR |
| HSE Officer | Safety records |
| HR Officer | Employee, leave, payroll data |
| Accountant | Payment, invoice, ledger |
| Subcontractor User | Limited project access |
| Client / Consultant | Review and approval access |
| Viewer | Read-only access |

## 9.3 Permission Matrix

Each module should support:

- View
- Create
- Edit
- Delete
- Submit
- Review
- Approve
- Reject
- Export
- Configure

## 9.4 Access Control Rule

Use role-based access control plus project-level assignment.

```text
User permission = Role permission + Project access + Discipline access + Workflow responsibility
```

---

# 10. Module 5 — Architecture Design Module

## 10.1 Purpose

Manage architectural design information, drawings, room data, finishes, specifications, design coordination, and approvals.

## 10.2 Main Features

- Architectural drawing register
- Layout plans
- Elevations and sections
- Room data sheet
- Door/window schedule
- Finishing schedule
- Material board
- Design review comments
- RFI and clarification
- Authority submission
- Design coordination with structure and MEP

## 10.3 Typical Records

| Record | Purpose |
|---|---|
| ARC Drawing | Design drawing register |
| Room Data Sheet | Room requirement and finish |
| Door Schedule | Door type, size, hardware |
| Window Schedule | Window type and size |
| Finish Schedule | Floor, wall, ceiling finishes |
| Material Approval | Material selection and approval |
| Design RFI | Clarification request |
| Review Comment | Design issue tracking |

## 10.4 Workflow

```text
Create architectural item
→ link to project and WBS
→ upload drawing/specification
→ submit for internal review
→ coordinate with STR/MEP
→ revise if needed
→ submit to client/consultant
→ approve
→ issue for construction
```

---

# 11. Module 6 — Structural Design Module

## 11.1 Purpose

Manage structural drawings, design calculations, structural review, rebar/shop drawing coordination, and structural site clarification.

## 11.2 Main Features

- Structural drawing register
- Calculation note register
- Design criteria
- Load summary
- Model file register
- Foundation design records
- Column, beam, slab, wall design records
- Rebar drawing review
- Shop drawing review
- Structural RFI
- Design change control
- Site technical query

## 11.3 Typical Records

| Record | Purpose |
|---|---|
| STR Drawing | Structural design drawing |
| Calculation Note | Design calculation record |
| Design Review | Internal technical review |
| Model Register | ETABS/SAFE/SAP/Revit file tracking |
| Rebar Review | Rebar shop drawing approval |
| Technical Query | Site issue clarification |
| Design Change | Revision impact control |

## 11.4 Key Checks

- Drawing revision status
- Calculation note approval
- Design assumption log
- Coordination with architecture opening
- Coordination with MEP sleeves and penetrations
- Construction issue response time

---

# 12. Module 7 — MEP Design Module

## 12.1 Purpose

Manage Mechanical, Electrical, Plumbing, Fire Fighting, ELV, and related MEP design coordination.

## 12.2 MEP Sub-Disciplines

- Mechanical
- Electrical
- Plumbing
- Fire Fighting
- ELV
- HVAC
- Drainage
- Water supply
- Power
- Lighting
- Communication
- Security

## 12.3 Main Features

- MEP drawing register
- Equipment schedule
- Load schedule
- System schematic
- Sleeve/opening coordination
- Material submittal
- MEP RFI
- Testing and commissioning data
- Interface with BIM clash detection

## 12.4 Workflow

```text
Create MEP design item
→ link to WBS
→ upload drawing/specification
→ coordinate with ARC/STR
→ check clash/opening/sleeve
→ submit for review
→ approve
→ issue for construction
→ transfer to commissioning module
```

---

# 13. Module 8 — Procurement Module

## 13.1 Purpose

Control the full procurement chain from material request to supplier payment support.

## 13.2 Main Features

- Material request
- Purchase requisition (PR)
- RFQ
- Supplier quotation comparison
- Technical evaluation
- Commercial evaluation
- Purchase order (PO)
- Delivery tracking
- Material receiving
- Invoice matching
- Procurement dashboard

## 13.3 Procurement Flow

```text
Site/design/QS raises material need
→ create PR
→ approve PR
→ issue RFQ
→ receive quotations
→ technical comparison
→ commercial comparison
→ select supplier
→ issue PO
→ supplier delivery
→ store receipt
→ invoice match
→ payment request to account
```

## 13.4 Key Data Fields

| Field | Description |
|---|---|
| pr_id | Purchase requisition ID |
| project_id | Linked project |
| wbs_id | Linked WBS |
| requested_by | Requestor |
| required_date | Needed date |
| item_code | Material/item code |
| quantity | Required quantity |
| budget_code | Cost code |
| approval_status | Draft/submitted/approved/rejected |

## 13.5 Controls

- PR cannot proceed without approved budget or override approval.
- PO should link to supplier and approved quotation.
- Material receipt must update inventory.
- Invoice should match PO and receipt.

---

# 14. Module 9 — Construction Management Module

## 14.1 Purpose

Manage site execution, tasks, progress, manpower, equipment, daily reports, issues, photos, and field approvals.

## 14.2 Main Features

- Site task creation
- Task assignment
- Task dependency
- Progress update
- Daily report
- Site photo log
- Manpower log
- Equipment log
- Material usage
- Issue log
- Work inspection request
- Concrete pour record
- Site dashboard

## 14.3 Task Status Flow

```text
Open
→ Assigned
→ In Progress
→ Completed
→ Submitted for Approval
→ Approved
→ Closed
```

Rejected work returns to:

```text
Rejected → In Progress
```

On hold path:

```text
Any active status → On Hold → Resume
```

## 14.4 Site Execution Workflow

```text
Create construction task
→ assign to team/supervisor
→ check dependency
→ start work
→ update progress
→ upload photos
→ log manpower/equipment/material
→ submit completion
→ QA/QC inspection
→ approve or reject
→ close task
```

## 14.5 Key Reports

- Daily site report
- Weekly progress report
- Monthly progress report
- Manpower histogram
- Equipment utilization
- Material consumption
- Delay report
- Issue aging report

---

# 15. Module 10 — Document Control Module

## 15.1 Purpose

Control documents, revisions, approvals, transmittals, and distribution.

## 15.2 Main Features

- Document register
- Document type master
- Revision control
- Status control
- Approval workflow
- Transmittal
- Comment and markup
- Document search
- Permission control
- Document distribution log

## 15.3 Document Status Flow

```text
Draft
→ Submitted
→ Under Review
→ Approved / Approved with Comment / Rejected
→ Issued for Construction
→ Superseded
→ Archived
```

## 15.4 Common Document Types

- Drawing
- Specification
- Calculation note
- RFI
- Material approval request
- Method statement
- Shop drawing
- Inspection request
- Daily report
- Weekly report
- Monthly report
- NCR
- Site instruction
- Letter
- Minutes of meeting
- Payment certificate
- Variation order
- Handover document

## 15.5 Document Number Example

```text
P001-STR-DWG-B01-L05-001-R02
```

---

# 16. Module 11 — Planning and Scheduling Module

## 16.1 Purpose

Manage baseline schedule, dependencies, look-ahead planning, delay tracking, and progress forecasting.

## 16.2 Main Features

- Master schedule
- Task duration
- Start and finish date
- Dependency links
- Gantt view
- Critical path
- Look-ahead plan
- Weekly work plan
- Baseline vs actual
- Delay reason
- Progress S-curve

## 16.3 Dependency Types

| Type | Meaning |
|---|---|
| FS | Finish to Start |
| SS | Start to Start |
| FF | Finish to Finish |
| SF | Start to Finish |

## 16.4 Schedule Fields on Task

| Field | Description |
|---|---|
| planned_start | Planned start date |
| planned_finish | Planned finish date |
| actual_start | Actual start date |
| actual_finish | Actual finish date |
| duration | Planned duration |
| progress_percent | Actual progress |
| dependency_status | Ready, blocked, delayed |
| delay_reason | Reason for delay |

---

# 17. Module 12 — QA/QC Module

## 17.1 Purpose

Control quality inspection, test plan, NCR, corrective action, and punch list.

## 17.2 Main Features

- Inspection and Test Plan (ITP)
- Inspection request
- Checklist
- Hold point / witness point
- Test report
- NCR
- Corrective action
- Punch list
- Quality dashboard

## 17.3 QA/QC Workflow

```text
Create ITP
→ create inspection request
→ inspect work
→ record result
→ approve / reject
→ if rejected, create NCR
→ assign corrective action
→ reinspect
→ close NCR
```

---

# 18. Module 13 — HSE Module

## 18.1 Purpose

Control safety compliance, incidents, permits, risk assessment, and safety training.

## 18.2 Main Features

- Toolbox talk
- Safety induction
- Risk assessment
- Permit to work
- Incident report
- Near miss report
- Safety observation
- Safety inspection
- PPE checklist
- HSE dashboard

## 18.3 Common Safety Permits

- Hot work permit
- Confined space permit
- Work at height permit
- Excavation permit
- Lifting permit
- Electrical isolation permit

---

# 19. Module 14 — Inventory / Stock Module

## 19.1 Purpose

Control material, tools, equipment stock, receipt, issue, return, transfer, and adjustment.

## 19.2 Main Features

- Item master
- Warehouse setup
- Stock receiving
- Stock issue
- Stock transfer
- Stock adjustment
- Minimum stock alert
- Material request from site
- Inventory valuation
- Stock aging

## 19.3 Stock Flow

```text
PO approved
→ material delivered
→ store receives material
→ inspection if required
→ stock quantity increases
→ site requests issue
→ store issues material
→ stock quantity decreases
→ consumption links to WBS
```

---

# 20. Module 15 — HR Module

## 20.1 Purpose

Manage employees, attendance, leave, timesheets, payroll support, and performance.

## 20.2 Main Features

- Employee master
- Department setup
- Position setup
- Attendance
- Leave request
- Leave approval
- Timesheet
- Overtime
- Public holiday calendar
- Payroll input
- Performance KPI

## 20.3 Timesheet Flow

```text
Employee creates timesheet
→ selects project/WBS/task
→ inputs normal hours/overtime
→ attaches proof if required
→ submits
→ supervisor reviews
→ HR/account verifies
→ approved record locked
→ payroll export
```

---

# 21. Module 16 — Account / Finance Module

## 21.1 Purpose

Control project financial records, payment, invoice, cash flow, cost tracking, and accounting support.

## 21.2 Main Features

- Chart of account
- Project budget
- Cost code
- AP invoice
- AR invoice
- Payment request
- Supplier payment
- Subcontractor payment
- Client payment certificate
- Cash flow
- Budget vs actual
- Variation order
- Final account

## 21.3 Financial Control Flow

```text
Budget approved
→ PR/PO/Subcontract linked to budget
→ delivery/progress verified
→ invoice submitted
→ three-way match
→ account review
→ payment approval
→ payment record
→ project cost updated
```

---

# 22. Module 17 — Reporting and KPI Module

## 22.1 Purpose

Give management real-time control over project health.

## 22.2 Dashboard Levels

| Level | Dashboard |
|---|---|
| Board / CEO | Company portfolio dashboard |
| Director | Department and project performance |
| Project Manager | Project progress, cost, risk, issue |
| Discipline Lead | Department workload and deliverables |
| Engineer / Supervisor | Assigned task and daily work |
| Client / Consultant | Approval and progress view |

## 22.3 Key KPIs

### Project KPIs

- Overall progress
- Planned vs actual progress
- Delay days
- Critical tasks
- Open issues
- Pending approvals
- Cost variance
- Procurement delay
- RFI aging
- NCR aging

### Department KPIs

- Task completion rate
- Late task count
- Workload by person
- Approval response time
- Document revision count
- Productivity per employee

### Financial KPIs

- Budget vs actual
- Committed cost
- Paid amount
- Pending invoice
- Variation value
- Forecast final cost

---

# 23. Module 18 — Admin Configuration

## 23.1 Purpose

Admin configuration controls the master setup of the system.

## 23.2 Configuration Areas

- Company profile
- User roles
- Permissions
- Departments
- Disciplines
- Project types
- WBS node types
- Document types
- Approval workflow templates
- Notification rules
- Public holiday calendar
- Cost codes
- Material codes
- Labor rates
- Equipment types
- QA/QC checklist templates
- HSE checklist templates

## 23.3 Admin Rule

Do not hard-code business rules. Put them in admin configuration wherever possible.

Example:

- Approval chain should be configurable.
- Document status should be configurable.
- WBS depth should be flexible.
- Public holidays should be configurable.
- Cost codes should be configurable.

---

# 24. Cross-Module Core Engines

## 24.1 Approval Workflow Engine

Used by:

- Documents
- RFIs
- PR / PO
- Timesheets
- Leave requests
- Payment requests
- Inspections
- NCR closeout
- Handover packages

Generic approval flow:

```text
Draft
→ Submitted
→ Reviewer 1
→ Reviewer 2
→ Approver
→ Approved / Rejected
→ Closed
```

## 24.2 Notification Engine

Notification triggers:

- Task assigned
- Task overdue
- Document submitted
- Approval required
- RFI response required
- PR approved
- PO issued
- Delivery received
- NCR created
- Timesheet rejected
- Payment approved

Notification channels:

- In-app
- Email
- Telegram
- Push notification later

## 24.3 Audit Trail Engine

Every important action must be logged:

- Create
- Update
- Delete
- Submit
- Approve
- Reject
- Upload
- Download
- Assign
- Reassign
- Login
- Export

Audit fields:

| Field | Description |
|---|---|
| audit_id | Unique ID |
| user_id | Who did it |
| action | What action |
| module | Which module |
| record_id | Affected record |
| old_value | Previous value |
| new_value | New value |
| timestamp | When |
| ip_address | Source |


## 24.4 Detailed Module Plan — Audit Log

### 24.4.1 Purpose

The Audit Log module is the system black box recorder. It records every important user action, system action, approval decision, data change, file activity, login event, permission change, and workflow movement across DCOS.

The goal is simple: **nothing important should happen in the system without leaving evidence.**

Audit Log is not only for IT. In a construction company, it protects management, project teams, QS, procurement, document control, HR, account, and site staff by providing traceability when disputes, delays, claims, wrong approvals, missing documents, or cost changes happen.

### 24.4.2 Business Objectives

- Provide full accountability for all users and departments.
- Track who created, changed, approved, rejected, deleted, exported, downloaded, or submitted records.
- Support claims, disputes, internal investigation, and management review.
- Protect the company from undocumented decisions.
- Support ISO-style quality management and document control traceability.
- Help admins detect misuse, unusual activity, or unauthorized access.
- Give management confidence that the system is controlled, not just used.

### 24.4.3 Scope of Audit Log

Audit Log should cover all critical modules:

| Module | Audit Required Actions |
|---|---|
| Authentication | Login, logout, failed login, password reset, session timeout |
| User / Role / Permission | Create user, deactivate user, role change, permission update |
| Project Setup | Create project, update project info, archive project, change project status |
| WBS Management | Create WBS node, rename WBS, move WBS node, delete/archive WBS node |
| Task Management | Create task, assign task, start task, update progress, submit, approve, reject, close |
| Document Control | Upload, revise, submit, review, approve, reject, issue, download, archive |
| Design / BIM | Drawing revision, model upload, clash update, coordination decision |
| Procurement | PR creation, approval, RFQ issue, quotation evaluation, PO approval, PO issue |
| Stock / Inventory | Material receive, issue, transfer, adjustment, stock count correction |
| Construction | Daily report submit, manpower update, site photo upload, progress update |
| QA/QC | Inspection result, NCR creation, NCR closeout, checklist approval |
| HSE | Incident report, toolbox talk record, permit issue, permit closure |
| HR | Leave request, approval, rejection, attendance correction, payroll adjustment |
| Account / Finance | Invoice submit, payment approve, journal entry, cost adjustment |
| Admin Configuration | Workflow rule change, notification rule change, document type change |
| Reporting | Export report, download report, generate official report |

### 24.4.4 Audit Event Categories

| Category | Description | Example |
|---|---|---|
| Security Event | Related to access and authentication | Failed login, password changed |
| Data Event | Related to record create/update/delete | Task updated, WBS renamed |
| Workflow Event | Related to status movement | RFI submitted, PO approved |
| Approval Event | Related to approve/reject decisions | Timesheet rejected with comment |
| Document Event | Related to file/document activity | Drawing downloaded, revision uploaded |
| Financial Event | Related to money, cost, payment | Payment certificate approved |
| System Event | Related to automated system actions | Auto-reminder sent, overdue flag created |
| Admin Event | Related to configuration and permission | Role permission changed |
| Integration Event | Related to external systems | Telegram notification failed |

### 24.4.5 Audit Log Data Model

Recommended table: `audit_logs`

| Field | Type | Description |
|---|---|---|
| id | uuid | Unique audit log ID |
| tenant_id | uuid | Company / tenant ID |
| project_id | uuid, nullable | Related project if applicable |
| wbs_node_id | uuid, nullable | Related WBS location if applicable |
| module_code | text | Module name/code, e.g. TASK, DOC, PR, QA |
| entity_type | text | Record type, e.g. task, document, purchase_order |
| entity_id | uuid/text | ID of affected record |
| action_type | text | CREATE, UPDATE, DELETE, SUBMIT, APPROVE, REJECT, LOGIN, EXPORT |
| action_label | text | Human-readable action name |
| user_id | uuid, nullable | User who performed the action |
| user_name_snapshot | text | User name at the time of action |
| user_role_snapshot | text | User role at the time of action |
| department_snapshot | text | Department at the time of action |
| old_values | jsonb | Previous values before change |
| new_values | jsonb | New values after change |
| changed_fields | jsonb | List of fields changed |
| status_from | text, nullable | Previous workflow status |
| status_to | text, nullable | New workflow status |
| comment | text, nullable | User comment / rejection reason / approval note |
| reason_code | text, nullable | Optional reason category |
| ip_address | text, nullable | User IP address |
| user_agent | text, nullable | Browser/device information |
| device_type | text, nullable | Web, mobile, tablet, API |
| source_channel | text | WEB, MOBILE, SYSTEM, API, TELEGRAM |
| severity | text | LOW, MEDIUM, HIGH, CRITICAL |
| is_system_generated | boolean | True if generated by system automation |
| correlation_id | text, nullable | Groups related audit events together |
| created_at | timestamp | Event time |

### 24.4.6 Audit Log Severity Rules

| Severity | Meaning | Example |
|---|---|---|
| Low | Normal routine action | User viewed task, normal update |
| Medium | Important business action | Task reassigned, document submitted |
| High | Approval, rejection, financial, or sensitive action | PO approved, payment rejected |
| Critical | Security, deletion, permission, major finance, or system-risk action | Role changed, payment deleted, failed login repeated |

### 24.4.7 What Should Be Logged

Log these actions by default:

```text
CREATE
UPDATE
DELETE
ARCHIVE
RESTORE
SUBMIT
APPROVE
REJECT
CLOSE
REOPEN
ASSIGN
REASSIGN
UPLOAD
DOWNLOAD
EXPORT
IMPORT
LOGIN
LOGOUT
FAILED_LOGIN
PASSWORD_CHANGE
ROLE_CHANGE
PERMISSION_CHANGE
STATUS_CHANGE
WORKFLOW_CHANGE
CONFIG_CHANGE
SYSTEM_TRIGGER
NOTIFICATION_SENT
NOTIFICATION_FAILED
```

### 24.4.8 What Should Not Be Over-Logged

Do not flood the audit log with low-value noise.

Avoid logging every minor page view unless required by security policy. Instead, log meaningful actions that affect data, workflow, access, approval, cost, schedule, documents, or compliance.

Recommended approach:

- Track record views only for sensitive documents, finance, payroll, legal, and claims.
- Track downloads and exports always.
- Track create/update/delete/approve/reject always.
- Track dashboard view only if it contains confidential executive or financial information.

### 24.4.9 Audit Log UI Design

The Audit Log UI should be available mainly for Admin, Project Director, Project Manager, QA Manager, Document Controller, HR Manager, and Account Manager depending on permission.

Recommended screens:

#### A. Global Audit Log Screen

Purpose: company-wide traceability.

Filters:

- Date range
- Project
- Module
- User
- Role
- Department
- Action type
- Severity
- Entity type
- Status from/to
- IP address
- Source channel

Columns:

| Time | User | Role | Project | Module | Action | Record | Status Change | Severity |
|---|---|---|---|---|---|---|---|---|
| 2026-05-06 09:15 | Sokha | PM | Tower A | Task | Approved | STR-B01-L03-T004 | Completed → Approved | High |

#### B. Record-Level Audit Timeline

Every major record should have an **Activity / History** tab.

Example for one task:

```text
09:00 Created by Project Manager
09:05 Assigned to Site Engineer
10:20 Started by Site Engineer
14:30 Progress updated from 20% to 60%
16:00 Submitted for review
17:10 Rejected by Supervisor: photo evidence missing
Next day 08:30 Resubmitted
09:15 Approved by Supervisor
```

#### C. Audit Detail Drawer

When clicking one audit row, show:

- Action summary
- User information
- Before/after values
- Comment/reason
- Related attachments
- IP/device/source
- Linked record
- Related notification log
- Related approval action

### 24.4.10 Before / After Value Display

For update actions, show changes clearly:

| Field | Before | After |
|---|---|---|
| Due Date | 2026-05-10 | 2026-05-15 |
| Assigned User | Engineer A | Engineer B |
| Status | Open | In Progress |
| Priority | Medium | High |

This is more readable than showing raw JSON only.

### 24.4.11 Audit Log Permissions

| Role | Permission |
|---|---|
| Super Admin | View all audit logs across tenants if platform owner |
| Company Admin | View all company audit logs |
| Project Director | View all project audit logs |
| Project Manager | View logs for assigned projects |
| Discipline Manager | View logs for own discipline/project |
| Document Controller | View document audit logs |
| HR Manager | View HR audit logs |
| Accountant | View finance/account audit logs |
| Engineer / Staff | View limited history of records they are involved in |
| Subcontractor / Supplier | View only their own submitted record history |
| Client / Consultant | View only external workflow history where they are included |

### 24.4.12 Audit Log Retention Policy

Recommended retention:

| Data Type | Retention |
|---|---|
| Security logs | 3–7 years |
| Project workflow logs | Project duration + DLP + 5 years |
| Financial logs | 7–10 years depending company/legal requirement |
| HR/payroll logs | 7–10 years depending company/legal requirement |
| General low-risk logs | 2–3 years |

Do not delete critical audit logs casually. Archive them to cheaper storage if needed.

### 24.4.13 Audit Log Rules

- Audit logs should be append-only.
- Normal users must never edit audit logs.
- Admins should not be able to modify audit history; only archive/export based on permission.
- Deleting business records should not delete audit logs.
- If a record is deleted, audit log must keep record snapshot.
- Sensitive fields such as passwords must never be stored in audit values.
- Financial and approval events must require comments when rejected or manually overridden.
- Critical admin actions should optionally require two-step confirmation.

### 24.4.14 Audit Log API Endpoints

Suggested endpoints:

```text
GET    /api/audit-logs
GET    /api/audit-logs/:id
GET    /api/audit-logs/entity/:entityType/:entityId
GET    /api/audit-logs/project/:projectId
GET    /api/audit-logs/user/:userId
POST   /api/audit-logs/export
```

Audit log creation should normally happen internally through backend services, not through public frontend calls.

### 24.4.15 Audit Log Integration With Other Engines

Audit Log should connect with:

- Approval Workflow Engine
- Notification Engine
- Document Control Engine
- Task Engine
- Reporting Engine
- RBAC / Permission Engine
- Integration Engine

Example:

```text
User approves PO
→ Approval action recorded
→ PO status changes
→ Audit log created
→ Notification sent to procurement/account
→ Notification log recorded
→ Dashboard KPI updated
```

### 24.4.16 Audit Log Reports

Recommended audit reports:

- User activity report
- Approval decision report
- Deleted/archived record report
- Permission change report
- Document download/export report
- Failed login/security report
- Overridden workflow report
- Financial approval audit report
- Late approval escalation report

---

## 24.5 Detailed Module Plan — Notification Matrix

### 24.5.1 Purpose

The Notification Matrix defines **who should be notified, when they should be notified, by which channel, and with what priority**.

Without a notification matrix, the system becomes noisy. Everyone gets everything, nobody reads anything, and critical actions die quietly in the corner like an unassigned RFI.

The rule is simple:

> Notify the right person, at the right time, for the right reason, through the right channel.

### 24.5.2 Notification Objectives

- Make sure responsible users know when action is required.
- Escalate overdue or blocked items automatically.
- Keep stakeholders informed without creating spam.
- Support approval workflows across departments.
- Improve accountability and response time.
- Provide management visibility for critical project risks.
- Support in-app, email, Telegram, and future mobile push notifications.

### 24.5.3 Notification Channels

| Channel | Purpose | Recommended Use |
|---|---|---|
| In-App Notification | Main system notification center | All normal alerts and action items |
| Email | Formal and record-based communication | Approvals, document issue, financial, client-facing items |
| Telegram Bot | Fast operational alert | Site, task, urgent approval, RFI, procurement delivery |
| Mobile Push | Future field operation alert | Assigned task, inspection, urgent site issue |
| Dashboard Badge | Passive management visibility | Pending approval count, overdue task count |
| SMS | Optional critical fallback | Emergency, safety, system downtime |

### 24.5.4 Notification Priority Levels

| Priority | Meaning | Example | Channel Rule |
|---|---|---|---|
| Low | Information only | Comment added, record viewed | In-app only |
| Normal | User should know | Task updated, document uploaded | In-app + optional email |
| High | Action required | Approval required, RFI response needed | In-app + email + Telegram |
| Critical | Urgent risk or deadline impact | Safety incident, overdue critical task, payment block | In-app + email + Telegram + escalation |

### 24.5.5 Notification Types

| Type | Description |
|---|---|
| Information | No action required, just awareness |
| Action Required | User must approve, review, respond, upload, or update |
| Reminder | Existing pending action is approaching deadline |
| Escalation | Pending/overdue action is raised to higher role |
| System Alert | System or integration event |
| Digest | Grouped summary sent daily/weekly |

### 24.5.6 Core Notification Matrix

| Trigger Event | Notify Who | Priority | Channel | Timing |
|---|---|---|---|---|
| New task assigned | Assignee, Discipline Manager | Normal | In-app, Telegram | Immediately |
| Task due today | Assignee | High | In-app, Telegram | Morning digest / configurable |
| Task overdue | Assignee, Discipline Manager, PM | High | In-app, Email, Telegram | Daily until resolved |
| Critical task overdue | Assignee, Discipline Manager, PM, Project Director | Critical | In-app, Email, Telegram | Immediate + daily escalation |
| Task dependency completed | Next task assignee | Normal | In-app | Immediately |
| Task blocked by dependency | Assignee, Discipline Manager | High | In-app, Telegram | Immediately |
| Task submitted for review | Reviewer / Supervisor | High | In-app, Telegram | Immediately |
| Task rejected | Assignee, Discipline Manager | High | In-app, Email | Immediately |
| Task approved / closed | Assignee, PM if milestone task | Normal | In-app | Immediately |
| Document uploaded | Document Controller, related reviewers | Normal | In-app | Immediately |
| Document submitted for review | Reviewer / Approver | High | In-app, Email | Immediately |
| Document rejected | Originator, Document Controller | High | In-app, Email | Immediately |
| Document approved | Originator, Document Controller, relevant team | Normal | In-app, Email if official |
| Drawing issued for construction | PM, Discipline Manager, Site Team, Document Controller | High | In-app, Email, Telegram | Immediately |
| RFI created | Assigned responder, PM, Document Controller | High | In-app, Email | Immediately |
| RFI response submitted | RFI originator, PM | High | In-app, Email | Immediately |
| RFI overdue | Assigned responder, PM, Project Director | Critical | In-app, Email, Telegram | Daily escalation |
| PR submitted | Procurement Manager / Approver | High | In-app, Email | Immediately |
| PR approved | Requester, Procurement Officer | Normal | In-app | Immediately |
| PO approved | Procurement, Supplier if external issue, Account | High | In-app, Email | Immediately |
| Delivery received | Procurement, Storekeeper, Requester, Site Engineer | Normal | In-app, Telegram | Immediately |
| Stock below reorder level | Storekeeper, Procurement Officer | High | In-app, Telegram | Immediately |
| Material request rejected | Requester, Site Supervisor | Normal | In-app | Immediately |
| Inspection scheduled | Inspector, Site Engineer, Subcontractor | Normal | In-app, Telegram | Immediately |
| Inspection failed | Site Engineer, QA/QC Manager, PM, Subcontractor | High | In-app, Email, Telegram | Immediately |
| NCR created | Responsible party, QA/QC Manager, PM | Critical | In-app, Email, Telegram | Immediately |
| NCR overdue | Responsible party, QA/QC Manager, PM, Project Director | Critical | In-app, Email, Telegram | Daily escalation |
| Safety incident reported | HSE Officer, HSE Manager, PM, Project Director | Critical | In-app, Email, Telegram, SMS optional | Immediately |
| Toolbox talk required | Site Supervisor, HSE Officer | Normal | In-app, Telegram | Daily morning |
| Timesheet submitted | Supervisor / Approver | Normal | In-app | Immediately |
| Timesheet rejected | Employee | High | In-app, Email optional | Immediately |
| Leave request submitted | Supervisor / HR | Normal | In-app, Email | Immediately |
| Leave approved/rejected | Employee, HR | Normal | In-app, Email | Immediately |
| Invoice submitted | Accountant / Approver | High | In-app, Email | Immediately |
| Payment approved | Account, PM, Requester | High | In-app, Email | Immediately |
| Budget overrun threshold reached | PM, Project Director, QS Manager, Account Manager | Critical | In-app, Email, Telegram | Immediately |
| Admin role changed | Company Admin, Security/Admin owner | Critical | In-app, Email | Immediately |
| Failed login repeated | Company Admin / Security owner | Critical | In-app, Email | Immediately |
| Report exported | Record owner / Admin if sensitive | Normal/High | Audit only or In-app | Immediately |

### 24.5.7 Notification Matrix Data Model

Recommended tables:

#### `notification_templates`

| Field | Description |
|---|---|
| id | Unique ID |
| template_code | Unique template code |
| title_template | Notification title with variables |
| message_template | Body message with variables |
| module_code | Related module |
| event_code | Related event |
| default_priority | Low / Normal / High / Critical |
| supported_channels | In-app, email, Telegram, push |
| is_active | Enable/disable template |

#### `notification_rules`

| Field | Description |
|---|---|
| id | Unique ID |
| tenant_id | Company / tenant ID |
| project_id | Optional project-specific rule |
| module_code | Module name/code |
| event_code | Trigger event |
| recipient_strategy | Role, user, department, stakeholder, dynamic relation |
| recipient_roles | Roles to notify |
| recipient_users | Fixed users if required |
| channels | Delivery channels |
| priority | Priority override |
| delay_minutes | Delay before sending if needed |
| escalation_enabled | True/false |
| escalation_after_hours | Escalation timing |
| escalation_roles | Roles to notify when escalated |
| quiet_hours_enabled | True/false |
| digest_enabled | True/false |
| is_active | Enable/disable rule |

#### `notifications`

| Field | Description |
|---|---|
| id | Notification ID |
| tenant_id | Company / tenant ID |
| project_id | Related project |
| recipient_user_id | User receiving notification |
| module_code | Related module |
| entity_type | Related record type |
| entity_id | Related record ID |
| event_code | Trigger event |
| title | Final rendered title |
| message | Final rendered message |
| priority | Low / Normal / High / Critical |
| type | Info / action / reminder / escalation / system |
| action_url | Link to related screen |
| is_read | Read/unread flag |
| read_at | Read time |
| status | Pending, sent, failed, cancelled |
| created_at | Created time |

#### `notification_delivery_logs`

| Field | Description |
|---|---|
| id | Delivery log ID |
| notification_id | Related notification |
| channel | In-app, email, Telegram, push |
| delivery_status | Pending, sent, failed, retried |
| provider_response | Email/Telegram/push response |
| retry_count | Number of retries |
| sent_at | Sent time |
| failed_reason | Failure reason |

### 24.5.8 Recipient Strategy

The system should not only notify fixed users. It must support dynamic recipient logic.

| Strategy | Example |
|---|---|
| Assigned User | Notify task assignee |
| Created By | Notify task/document creator |
| Current Approver | Notify current approval step user |
| Project Role | Notify Project Manager of the project |
| Discipline Role | Notify Structural Manager only for STR records |
| Department | Notify Procurement Department |
| Stakeholder Type | Notify Client, Consultant, Supplier, Subcontractor |
| WBS Responsible | Notify engineer responsible for Building B / Level 03 |
| Custom User | Notify selected fixed user |
| Escalation Chain | Notify PM → Project Director → Company Admin |

### 24.5.9 Notification Template Examples

Task assigned:

```text
Title: New Task Assigned: {{task_code}}
Message: You have been assigned to {{task_name}} at {{wbs_path}}. Planned finish date: {{planned_finish_date}}.
Action: Open Task
```

RFI overdue:

```text
Title: Critical RFI Overdue: {{rfi_number}}
Message: RFI {{rfi_number}} has been overdue for {{overdue_days}} day(s). Responsible party: {{responsible_name}}.
Action: Open RFI
```

PO approved:

```text
Title: PO Approved: {{po_number}}
Message: Purchase Order {{po_number}} for {{supplier_name}} has been approved with value {{currency}} {{amount}}.
Action: Open PO
```

Safety incident:

```text
Title: Critical Safety Incident Reported
Message: Safety incident reported at {{project_name}} / {{wbs_path}}. Immediate review required by HSE and PM.
Action: Open Incident
```

### 24.5.10 Notification UI Design

#### A. Notification Bell

Top-right global bell with:

- Unread count badge
- Priority color indicator
- Quick list of latest notifications
- Filter: All / Unread / Action Required / Critical

#### B. Notification Center

Full page with:

- Search
- Filter by project/module/priority/type/date
- Mark as read
- Open related record
- Snooze reminder
- Bulk action

#### C. Action Required Inbox

This is very important for managers.

Show only items that require user decision:

- Approve document
- Review RFI
- Approve PR/PO
- Approve timesheet
- Close NCR
- Respond to issue

#### D. Admin Notification Matrix Screen

Admin should be able to configure rules:

| Event | Recipients | Channels | Priority | Escalation | Active |
|---|---|---|---|---|---|
| Task Overdue | Assignee, Discipline Manager, PM | In-app, Telegram | High | 24h to Director | Yes |
| RFI Overdue | Responder, PM | In-app, Email, Telegram | Critical | 48h to Director | Yes |

### 24.5.11 Escalation Rules

Recommended escalation logic:

```text
Action required notification sent
→ User does not act within configured time
→ Reminder sent
→ Still no action
→ Escalate to manager
→ Still no action
→ Escalate to project director / company admin
```

Example escalation timing:

| Event | First Reminder | First Escalation | Final Escalation |
|---|---:|---:|---:|
| Task overdue | Same day | 1 day | 3 days |
| RFI overdue | Same day | 1 day | 2 days |
| NCR overdue | Same day | 1 day | 2 days |
| PR approval pending | 1 day | 2 days | 4 days |
| PO approval pending | 1 day | 2 days | 3 days |
| Payment approval pending | 1 day | 2 days | 3 days |
| Safety incident | Immediate | 1 hour | 4 hours |

### 24.5.12 Anti-Spam Rules

To keep the system clean:

- Group low-priority updates into daily digest.
- Do not send repeated alerts every few minutes.
- Critical events bypass digest and send immediately.
- Allow users to mute informational notifications, but not critical workflow actions.
- Avoid notifying the same user twice for the same event through the same channel.
- Combine similar notifications where possible.
- Use quiet hours for non-critical email/Telegram alerts.

### 24.5.13 Notification Status Lifecycle

```text
Generated
→ Queued
→ Sent
→ Delivered
→ Read
→ Actioned
```

Failure path:

```text
Generated
→ Queued
→ Failed
→ Retry
→ Failed Permanently
```

### 24.5.14 Notification API Endpoints

Suggested endpoints:

```text
GET    /api/notifications
GET    /api/notifications/unread-count
PATCH  /api/notifications/:id/read
PATCH  /api/notifications/mark-all-read
POST   /api/notifications/:id/snooze
GET    /api/notification-rules
POST   /api/notification-rules
PATCH  /api/notification-rules/:id
DELETE /api/notification-rules/:id
GET    /api/notification-templates
POST   /api/notification-templates
PATCH  /api/notification-templates/:id
```

### 24.5.15 Notification Integration With Audit Log

Every important notification should create a delivery record.

Audit example:

```text
Task T-001 submitted for review
→ Notification generated to Supervisor
→ Telegram delivery failed
→ Email delivery sent
→ Audit log records notification failure
→ System retries Telegram delivery
```

This helps admin understand whether the system did its job or the user simply ignored the notification.

### 24.5.16 Recommended MVP Notification Rules

For MVP, start with only the important ones:

1. Task assigned
2. Task submitted for review
3. Task rejected
4. Task overdue
5. Document submitted for review
6. Document approved/rejected
7. RFI created
8. RFI overdue
9. PR approval required
10. PO approved
11. Timesheet submitted/rejected
12. NCR created/overdue
13. Safety incident reported
14. Failed login repeated
15. Role/permission changed

Do not build 100 notification rules on day one. Start tight, then expand. A notification system should ring like a bell, not scream like a broken alarm.

---

---

# 25. Recommended Database Core Tables

## 25.1 Core Tables

```text
companies
users
roles
permissions
user_roles
projects
project_stakeholders
stakeholders
wbs_nodes
disciplines
departments
tasks
task_assignments
task_dependencies
documents
document_types
document_revisions
approval_workflows
approval_steps
notifications
audit_logs
comments
attachments
```

## 25.2 Module Tables

```text
arc_items
str_items
mep_items
rfis
submittals
purchase_requisitions
purchase_orders
suppliers
stock_items
stock_transactions
daily_reports
inspection_requests
ncrs
safety_incidents
employees
attendance_records
leave_requests
timesheets
invoices
payment_requests
budget_items
cost_codes
```

---

# 26. Recommended UI Structure

## 26.1 Main Navigation

```text
Dashboard
Projects
WBS / Task Workspace
Design
Procurement
Construction
Documents
QA/QC
HSE
HR
Account
Reports
Admin
```

## 26.2 WBS / Task Workspace Layout

```text
Left Panel: WBS Tree
Top Bar: Project / WBS Breadcrumb / Filters
Main Panel: Task List or Task Detail
Right Panel: Status, Approvals, Documents, Comments
Discipline Tabs: ARC / STR / MEP / Procurement / Construction
```

## 26.3 Recommended UI Modes

### WBS Mode

Clean structure view:

- WBS tree
- Progress roll-up
- Cost roll-up
- Delay indicator
- Document count

### Execution Mode

Task control view:

- Task list
- Start/finish dates
- Status
- Dependencies
- Assigned users
- Delay
- Approval state

### Dashboard Mode

Management control view:

- KPIs
- Charts
- Risks
- Bottlenecks
- Aging reports

---

# 27. Project Lifecycle Design

## 27.1 Initiation

Main features:

- Project idea / opportunity
- Client profile
- Tender registration
- Feasibility review
- Risk review
- Go/no-go decision

## 27.2 Planning

Main features:

- Project setup
- WBS setup
- Baseline schedule
- Budget setup
- Team setup
- Stakeholder setup
- Document numbering
- Procurement plan
- QA/HSE plan

## 27.3 Execution

Main features:

- Design tasks
- Procurement tasks
- Construction tasks
- Daily report
- Material delivery
- Inspections
- Site coordination
- Progress update

## 27.4 Monitoring and Controlling

Main features:

- Dashboard
- Delay tracking
- Cost tracking
- RFI aging
- NCR aging
- Procurement status
- Variation tracking
- Cash flow
- Approval bottleneck

## 27.5 Closure

Main features:

- Final inspection
- Handover package
- As-built drawings
- O&M manual
- Warranty register
- Final account
- Lessons learned
- Project archive

---

# 28. MVP Build Priority

Do not build everything at once. That is how software dreams become graveyards.

## Phase 1 — Core MVP

1. Authentication and roles
2. Project setup
3. Stakeholder setup
4. WBS management
5. Task management
6. Document control
7. Basic approval workflow
8. Basic dashboard
9. Daily report
10. RFI management

## Phase 2 — Execution Control

1. Procurement PR/PO
2. Inventory stock
3. QA/QC inspection
4. HSE safety
5. Timesheet
6. Progress report

## Phase 3 — Financial Control

1. BOQ
2. Budget
3. Payment certificate
4. Invoice
5. Cost report
6. Variation order

## Phase 4 — Advanced Control

1. BIM coordination
2. Gantt and CPM
3. Mobile offline
4. Telegram integration
5. AI analytics
6. Forecasting

---

# 29. Final Recommendation

The best design for DCOS is:

```text
One unified construction operating system
+ shared WBS control engine
+ shared document and approval engines
+ modular discipline workspaces
+ project lifecycle dashboard
+ strong admin configuration
```

Do not split Architecture, Structure, MEP, Procurement, and Construction into separate disconnected systems. Keep them together under one project and one WBS. The departments may work in different rooms, but the building is one building. Same logic for software.

The first serious build should focus on:

- Project setup
- Stakeholder setup
- WBS tree
- Task management
- Document control
- Approval workflow
- Basic reporting

After the core is stable, add procurement, construction execution, HR, account, QA/QC, HSE, inventory, and advanced dashboards.

A clean foundation beats fancy features. Every time.

---

# 30. Appendix — Suggested Master Status Lists

## Task Status

```text
Open
Assigned
In Progress
On Hold
Completed
Submitted for Approval
Approved
Rejected
Closed
Cancelled
```

## Document Status

```text
Draft
Submitted
Under Review
Approved
Approved with Comment
Rejected
Issued for Construction
Superseded
Archived
```

## Procurement Status

```text
Draft PR
Submitted PR
Approved PR
RFQ Issued
Quotation Received
Evaluation
PO Draft
PO Approved
PO Issued
Delivered
Partially Delivered
Closed
Cancelled
```

## Payment Status

```text
Draft
Submitted
Under Review
Approved
Rejected
Paid
Partially Paid
Closed
```

## Inspection Status

```text
Draft
Submitted
Scheduled
Inspected
Passed
Failed
Reinspection Required
Closed
```

---

# 31. Appendix — Suggested First Database ERD Grouping

```text
Group A: Security
- companies
- users
- roles
- permissions
- user_roles

Group B: Project Core
- projects
- stakeholders
- project_stakeholders
- wbs_nodes
- disciplines
- departments

Group C: Task Core
- tasks
- task_assignments
- task_dependencies
- task_progress_logs
- task_comments

Group D: Document Core
- documents
- document_types
- document_revisions
- document_transmittals
- document_comments

Group E: Workflow Core
- approval_workflows
- approval_steps
- approval_actions
- notifications
- audit_logs

Group F: Construction Execution
- daily_reports
- manpower_logs
- equipment_logs
- material_usage_logs
- site_photos

Group G: Procurement and Stock
- purchase_requisitions
- purchase_orders
- suppliers
- stock_items
- stock_transactions

Group H: HR and Account
- employees
- attendance_records
- leave_requests
- timesheets
- invoices
- payment_requests
- cost_codes
```

---

**End of Document**
