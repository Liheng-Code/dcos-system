# DCOS-Naming-Convention.md

# Digital Construction Operating System (DCOS)

## Enterprise Naming Convention Standard

Version: 1.0
Status: Approved
Document Type: Enterprise Standard

---

# 1. Purpose

This document defines the official naming conventions used throughout the Digital Construction Operating System (DCOS).

The objective is to ensure:

* Consistency
* Searchability
* Traceability
* Automation compatibility
* Data quality

This standard applies to:

* Projects
* WBS
* Tasks
* Documents
* Users
* Companies
* Assets
* Cost Codes
* Procurement Records
* Contracts
* Database Objects
* APIs
* Source Code

---

# 2. General Naming Rules

## Rule 01

Use English only.

✅ Correct

```text
Structural Design
Concrete Pour
Purchase Request
```

❌ Incorrect

```text
សំណង់
设计
```

---

## Rule 02

Avoid special characters.

Allowed:

```text
A-Z
0-9
-
_
```

Not Allowed:

```text
#
@
$
%
&
*
?
/
\
```

---

## Rule 03

No spaces in system codes.

✅

```text
PRJ-001
WBS-L05
TASK-0001
```

❌

```text
Project 001
Task 1
```

---

## Rule 04

Codes are permanent.

Once generated:

```text
Cannot Change
```

---

# 3. Company Naming Convention

## Company Code

Format:

```text
COM-XXX
```

Examples:

```text
COM-CMED
COM-GDT
COM-PPH
```

---

## Company ID

Format:

```text
CMP-00001
```

Examples:

```text
CMP-00001
CMP-00002
CMP-00003
```

---

# 4. Project Naming Convention

## Project Code

Format:

```text
PRJ-YYYY-XXX
```

Examples:

```text
PRJ-2026-001
PRJ-2026-002
PRJ-2026-003
```

---

## Project Short Name

Format:

```text
PROJECT-ACRONYM
```

Examples:

```text
GDT
HTBT
ABC
```

---

## Full Project Name

Format:

```text
Project Name
```

Examples:

```text
General Department of Taxation Tower

Hattha Bank Headquarters

Phnom Penh Commercial Center
```

---

# 5. WBS Naming Convention

## WBS Structure

Format:

```text
Project
Building
Level
Zone
Room
Element
Task
```

---

## Building Code

Format:

```text
BLD-01
BLD-02
```

Examples:

```text
BLD-TOWERA
BLD-PODIUM
BLD-PARKING
```

---

## Level Code

Format:

```text
L01
L02
L03
B1
B2
RF
```

Examples:

```text
L05
L20
RF
B2
```

---

## Zone Code

Format:

```text
ZA
ZB
ZC
ZD
```

Examples:

```text
ZA
ZB
```

---

## Room Code

Format:

```text
RM-XXXX
```

Examples:

```text
RM-MEETING01
RM-TOILET01
RM-LOBBY01
```

---

## Element Code

Use standardized element library.

Examples:

```text
STR-001
STR-002
ARC-001
MEP-001
```

Reference element library.

---

# 6. Task Naming Convention

## Task Number

Format:

```text
TSK-000001
```

Examples:

```text
TSK-000001
TSK-000002
```

---

## Task Title

Format:

```text
[Discipline] + Action + Location
```

Examples:

```text
STR - Review Pile Layout

ARC - Submit Material Approval

MEP - Install Cable Tray Level 05

CON - Cast Column C12
```

---

## Task Template Code

Format:

```text
TMP-TSK-XXXX
```

Examples:

```text
TMP-TSK-0001
TMP-TSK-0002
```

---

# 7. Document Naming Convention

## Document Number Structure

Format:

```text
PROJECT-DIS-TYPE-BLD-LVL-SEQ-REV
```

---

## Example

```text
GDT-STR-DWG-TA-L05-001-R02
```

Meaning:

```text
GDT      Project

STR      Discipline

DWG      Drawing

TA       Tower A

L05      Level 05

001      Sequence

R02      Revision
```

---

## Discipline Codes

| Code | Discipline         |
| ---- | ------------------ |
| ARC  | Architecture       |
| STR  | Structure          |
| MEP  | MEP                |
| BIM  | BIM                |
| QS   | Quantity Survey    |
| PM   | Project Management |

---

## Document Type Codes

| Code | Description             |
| ---- | ----------------------- |
| DWG  | Drawing                 |
| CAL  | Calculation             |
| SPC  | Specification           |
| RPT  | Report                  |
| BOQ  | Bill of Quantity        |
| MOS  | Method Statement        |
| ITP  | Inspection Test Plan    |
| MAR  | Material Approval       |
| MIR  | Material Inspection     |
| RFI  | Request For Information |

---

## Revision Format

```text
R00
R01
R02
```

Examples:

```text
R00 Draft

R01 First Issue

R02 Revision
```

---

# 8. Procurement Naming Convention

## Purchase Request

Format:

```text
PR-YYYY-00001
```

Examples:

```text
PR-2026-00001
```

---

## RFQ

Format:

```text
RFQ-YYYY-00001
```

---

## Purchase Order

Format:

```text
PO-YYYY-00001
```

---

## Goods Receipt

Format:

```text
GRN-YYYY-00001
```

---

# 9. QAQC Naming Convention

## Inspection Request

Format:

```text
IR-YYYY-00001
```

---

## NCR

Format:

```text
NCR-YYYY-00001
```

---

## Punch List

Format:

```text
PL-YYYY-00001
```

---

# 10. HSE Naming Convention

## Incident

Format:

```text
INC-YYYY-00001
```

---

## Permit

Format:

```text
PER-YYYY-00001
```

---

## Toolbox Talk

Format:

```text
TBT-YYYY-00001
```

---

# 11. Commercial Naming Convention

## BOQ Item

Format:

```text
BOQ-XX-XXX
```

Examples:

```text
BOQ-CON-001

BOQ-REB-002

BOQ-FIN-003
```

---

## Budget Code

Format:

```text
BGT-XXXXX
```

---

## Cost Code

Format:

```text
CST-XXXXX
```

---

## Variation Order

Format:

```text
VO-YYYY-00001
```

---

## IPC

Format:

```text
IPC-YYYY-00001
```

---

# 12. Contract Naming Convention

## Contract Number

Format:

```text
CNT-YYYY-00001
```

---

## Claim Number

Format:

```text
CLM-YYYY-00001
```

---

## EOT Number

Format:

```text
EOT-YYYY-00001
```

---

# 13. User Naming Convention

## User ID

Format:

```text
USR-000001
```

---

## Username

Format:

```text
firstname.lastname
```

Examples:

```text
liheng.pouth

tangkea.sok

kosal.chea
```

---

## Email

Format:

```text
firstname.lastname@company.com
```

Examples:

```text
liheng.pouth@dcos.com
```

---

# 14. Stakeholder Naming Convention

## Stakeholder Code

Format:

```text
STK-00001
```

---

## External Company

Format:

```text
EXT-COMPANYNAME
```

Examples:

```text
EXT-CMED

EXT-GDT

EXT-HATTHA
```

---

# 15. Asset Naming Convention

## Equipment

Format:

```text
EQP-00001
```

Examples:

```text
EQP-00001 Excavator

EQP-00002 Tower Crane
```

---

## Vehicle

Format:

```text
VEH-00001
```

---

# 16. Storage Folder Naming Convention

## Project Folder

Format:

```text
PRJ-2026-001_GDT
```

---

## Discipline Folder

Format:

```text
01_Project_Management

02_Architecture

03_Structure

04_MEP

05_QAQC

06_HSE

07_Commercial
```

---

# 17. Database Naming Convention

## Tables

Format:

```text
snake_case
```

Examples:

```text
projects

project_members

task_assignments

document_revisions
```

---

## Primary Keys

Format:

```text
id
```

---

## Foreign Keys

Format:

```text
table_id
```

Examples:

```text
project_id

task_id

user_id
```

---

# 18. API Naming Convention

## REST Endpoint

Format:

```text
/api/module/action
```

Examples:

```text
/api/projects

/api/tasks

/api/documents
```

---

## URL Style

Use:

```text
kebab-case
```

Examples:

```text
/project-setup

/task-template

/document-control
```

---

# 19. Source Code Naming Convention

## React Component

Format:

```text
PascalCase
```

Examples:

```text
TaskBoard.tsx

ProjectSetup.tsx

DocumentRegister.tsx
```

---

## Variables

Format:

```text
camelCase
```

Examples:

```text
projectName

taskStatus

approvalLevel
```

---

## Constants

Format:

```text
UPPER_CASE
```

Examples:

```text
MAX_UPLOAD_SIZE

DEFAULT_ROLE
```

---

# 20. Status Naming Convention

Use standardized statuses only.

---

## Task Status

```text
Draft
Assigned
In Progress
Pending Approval
Approved
Rejected
Closed
```

---

## Document Status

```text
Draft
Submitted
Review
Approved
Rejected
Archived
```

---

## Procurement Status

```text
Draft
RFQ
Quoted
Approved
Ordered
Delivered
Closed
```

---

# 21. Reserved Prefixes

| Prefix | Description                 |
| ------ | --------------------------- |
| PRJ    | Project                     |
| WBS    | WBS                         |
| TSK    | Task                        |
| DOC    | Document                    |
| PR     | Purchase Request            |
| PO     | Purchase Order              |
| RFQ    | Request for Quotation       |
| NCR    | Non-Conformance Report      |
| IR     | Inspection Request          |
| VO     | Variation Order             |
| IPC    | Interim Payment Certificate |
| CNT    | Contract                    |
| CLM    | Claim                       |
| EOT    | Extension of Time           |
| EQP    | Equipment                   |
| USR    | User                        |

---

# 22. Governance Rules

The following cannot be changed without Governance Board approval:

```text
Project Code Structure

Document Numbering Structure

WBS Structure

Cost Code Structure

API Naming Structure
```

---

# 23. Final Statement

Naming conventions are the language of DCOS.

Every project, document, task, contract, cost record, inspection, and workflow must follow the standards defined in this document.

Consistency creates:

* Searchability
* Traceability
* Automation
* Scalability

If naming standards are followed from the beginning, DCOS can scale from one project to thousands of projects without losing structure or control.
