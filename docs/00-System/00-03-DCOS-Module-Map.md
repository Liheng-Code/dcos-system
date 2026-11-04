\# DCOS-Module-Map.md



\# Digital Construction Operating System (DCOS)



\## Enterprise Module Map



Version: 1.0

Status: Approved

Document Type: Master Module Catalog

Owner: DCOS Architecture Team



\---



\# 1. Purpose



This document defines the complete module map of the Digital Construction Operating System.



The module map is used to control:



\* System scope

\* Module ownership

\* Implementation priority

\* Module dependencies

\* Business coverage

\* Future expansion



This document is the master reference for all DCOS modules.



\---



\# 2. Module Classification



DCOS modules are grouped into 10 major domains:



```text

01 Foundation

02 Project Control

03 Design \& Engineering

04 Procurement \& Supply Chain

05 Construction Execution

06 QAQC \& HSE

07 Commercial \& Contract

08 Enterprise Support

09 Handover \& Post-Contract

10 Intelligence \& Integration

```



\---



\# 3. Master Module Map



| No. | Module Code | Module Name                  | Domain               | Phase   | Owner                 |

| --: | ----------- | ---------------------------- | -------------------- | ------- | --------------------- |

|  01 | COM         | Company / Tenant Setup       | Foundation           | Phase 1 | System Admin          |

|  02 | USR         | User Management              | Foundation           | Phase 1 | HR / Admin            |

|  03 | RBAC        | Role \& Permission            | Foundation           | Phase 1 | System Admin          |

|  04 | ADM         | Admin Configuration          | Foundation           | Phase 1 | System Admin          |

|  05 | STK         | Stakeholder Management       | Foundation           | Phase 1 | PMO                   |

|  06 | PRJ         | Project Setup                | Project Control      | Phase 1 | PMO                   |

|  07 | WBS         | WBS Management               | Project Control      | Phase 1 | PMO                   |

|  08 | TSK         | Task Management              | Project Control      | Phase 1 | PMO                   |

|  09 | DOC         | Document Control             | Project Control      | Phase 1 | Document Controller   |

|  10 | APP         | Approval Workflow Engine     | Core Engine          | Phase 1 | Platform Owner        |

|  11 | NTF         | Notification Engine          | Core Engine          | Phase 1 | Platform Owner        |

|  12 | AUD         | Audit Log Engine             | Core Engine          | Phase 1 | Platform Owner        |

|  13 | RPT         | Reporting \& KPI              | Core Engine          | Phase 1 | Management            |

|  14 | PLN         | Planning \& Scheduling        | Project Control      | Phase 2 | Planning Manager      |

|  15 | ARC         | Architecture Design          | Design               | Phase 2 | Architecture Lead     |

|  16 | STR         | Structural Design            | Design               | Phase 2 | Structural Lead       |

|  17 | MEP         | MEP Design                   | Design               | Phase 2 | MEP Lead              |

|  18 | BIM         | BIM Coordination             | Design               | Phase 2 | BIM Manager           |

|  19 | RFI         | RFI Management               | Design / Site        | Phase 2 | PMO                   |

|  20 | SUB         | Submittal Management         | Design / Procurement | Phase 2 | Document Controller   |

|  21 | CON         | Construction Management      | Execution            | Phase 2 | Construction Manager  |

|  22 | DSR         | Daily Site Report            | Execution            | Phase 2 | Site Manager          |

|  23 | QAQC        | QAQC Management              | QAQC                 | Phase 2 | QAQC Manager          |

|  24 | NCR         | NCR Management               | QAQC                 | Phase 2 | QAQC Manager          |

|  25 | HSE         | HSE Management               | HSE                  | Phase 2 | HSE Manager           |

|  26 | INV         | Inventory / Stock            | Supply Chain         | Phase 3 | Store Manager         |

|  27 | PRC         | Procurement                  | Supply Chain         | Phase 3 | Procurement Manager   |

|  28 | SUP         | Supplier Management          | Supply Chain         | Phase 3 | Procurement Manager   |

|  29 | SCON        | Subcontractor Management     | Supply Chain         | Phase 3 | Commercial Manager    |

|  30 | EQP         | Equipment Management         | Execution            | Phase 3 | Plant Manager         |

|  31 | BOQ         | BOQ Engine                   | Commercial           | Phase 3 | QS Manager            |

|  32 | BGT         | Budget Control               | Commercial           | Phase 3 | QS / Finance          |

|  33 | COST        | Cost Control                 | Commercial           | Phase 3 | QS Manager            |

|  34 | IPC         | Progress Claim / IPC         | Commercial           | Phase 3 | QS Manager            |

|  35 | RET         | Retention Management         | Commercial           | Phase 3 | QS / Finance          |

|  36 | VO          | Variation Order              | Commercial           | Phase 3 | QS Manager            |

|  37 | CNT         | Contract Administration      | Contract             | Phase 4 | Contract Manager      |

|  38 | CLM         | Claims \& Disputes            | Contract             | Phase 4 | Contract Manager      |

|  39 | EOT         | Extension of Time            | Contract             | Phase 4 | Planning / Contract   |

|  40 | HR          | Human Resource               | Enterprise           | Phase 4 | HR Manager            |

|  41 | PAY         | Payroll                      | Enterprise           | Phase 4 | HR / Finance          |

|  42 | ACC         | Accounting                   | Enterprise           | Phase 4 | Finance Manager       |

|  43 | FIN         | Finance Management           | Enterprise           | Phase 4 | Finance Manager       |

|  44 | FX          | Multi-Currency / FX          | Enterprise           | Phase 4 | Finance Manager       |

|  45 | COMM        | Commissioning                | Handover             | Phase 5 | Commissioning Manager |

|  46 | HND         | Handover Management          | Handover             | Phase 5 | PMO                   |

|  47 | DLP         | Defect Liability Period      | Post-Contract        | Phase 5 | DLP Manager           |

|  48 | FM          | Facility Management Handover | Post-Contract        | Phase 5 | FM Manager            |

|  49 | LES         | Lessons Learned              | Knowledge            | Phase 5 | PMO                   |

|  50 | MOB         | Mobile Field App             | Platform             | Phase 6 | Platform Owner        |

|  51 | INT         | Integration Layer            | Platform             | Phase 6 | Technical Lead        |

|  52 | AI          | AI Assistant                 | Intelligence         | Phase 7 | Platform Owner        |

|  53 | AIPM        | AI Project Manager           | Intelligence         | Phase 7 | PMO                   |

|  54 | AICOST      | AI Cost Forecasting          | Intelligence         | Phase 7 | QS / Finance          |

|  55 | DTWIN       | Digital Twin                 | Intelligence         | Future  | BIM / FM              |



\---



\# 4. Domain Breakdown



\## 4.1 Foundation Modules



Purpose:



Create the system base.



Modules:



```text

Company / Tenant Setup

User Management

Role \& Permission

Admin Configuration

Stakeholder Management

```



These modules must be built first because all other modules depend on them.



\---



\## 4.2 Project Control Modules



Purpose:



Control project structure, tasks, documents, schedule, and reporting.



Modules:



```text

Project Setup

WBS Management

Task Management

Document Control

Planning \& Scheduling

Reporting \& KPI

```



The WBS is the backbone of DCOS.



Every task, document, inspection, cost, material, and issue should connect to WBS.



\---



\## 4.3 Design \& Engineering Modules



Purpose:



Control design production, coordination, reviews, approvals, and technical records.



Modules:



```text

Architecture Design

Structural Design

MEP Design

BIM Coordination

RFI Management

Submittal Management

```



These modules connect design teams with procurement, construction, QAQC, and document control.



\---



\## 4.4 Procurement \& Supply Chain Modules



Purpose:



Control purchasing, suppliers, subcontractors, material receiving, and stock movement.



Modules:



```text

Procurement

Supplier Management

Subcontractor Management

Inventory / Stock

Material Traceability

```



Procurement must link to:



```text

BOQ

Budget

WBS

Project

Supplier

Inventory

Cost Control

```



\---



\## 4.5 Construction Execution Modules



Purpose:



Control physical site work.



Modules:



```text

Construction Management

Daily Site Report

Equipment Management

Mobile Field App

Drawing Markup

```



Construction execution must connect:



```text

Task

WBS

QAQC

HSE

Material

Manpower

Equipment

Progress

```



\---



\## 4.6 QAQC \& HSE Modules



Purpose:



Control quality and safety compliance.



Modules:



```text

QAQC Management

NCR Management

HSE Management

Inspection Management

Safety Permit

Toolbox Talk

```



QAQC and HSE must be treated as control gates, not side documents.



\---



\## 4.7 Commercial \& Contract Modules



Purpose:



Control project money and contractual entitlement.



Modules:



```text

BOQ Engine

Budget Control

Cost Control

IPC

Retention

Variation Order

Contract Administration

Claims \& Disputes

Extension of Time

```



This domain is what turns DCOS from a task system into an enterprise construction management system.



\---



\## 4.8 Enterprise Support Modules



Purpose:



Support company operation.



Modules:



```text

HR

Payroll

Accounting

Finance

Multi-Currency

```



These modules support staff, payroll, finance, and enterprise reporting.



\---



\## 4.9 Handover \& Post-Contract Modules



Purpose:



Control project closeout and post-handover obligations.



Modules:



```text

Commissioning

Handover

DLP

Facility Management Handover

Lessons Learned

```



A construction project is not finished when site work ends.



It is finished when handover, DLP, final account, and knowledge capture are complete.



\---



\## 4.10 Intelligence \& Integration Modules



Purpose:



Connect DCOS with external systems and future intelligence.



Modules:



```text

Integration Layer

AI Assistant

AI Project Manager

AI Cost Forecasting

Digital Twin

```



AI must not replace workflow control.



AI should support decisions, detect risks, and recommend actions.



\---



\# 5. Implementation Phase Map



\## Phase 1 — Core Foundation



```text

Company

User

RBAC

Admin

Stakeholder

Project

WBS

Task

Document Control

Approval Workflow

Notification

Audit Log

Basic Dashboard

```



Outcome:



```text

Operational DCOS Backbone

```



\---



\## Phase 2 — Project Execution



```text

Planning

Design Modules

BIM Coordination

RFI

Submittal

Construction

Daily Report

QAQC

NCR

HSE

```



Outcome:



```text

Digital Project Execution Control

```



\---



\## Phase 3 — Commercial Control



```text

Procurement

Supplier

Inventory

Subcontractor

Equipment

BOQ

Budget

Cost Control

IPC

Retention

Variation Order

```



Outcome:



```text

Commercially Controlled Project Platform

```



\---



\## Phase 4 — Enterprise Support



```text

Contract Administration

Claims

EOT

HR

Payroll

Accounting

Finance

Multi-Currency

```



Outcome:



```text

Enterprise Operating Platform

```



\---



\## Phase 5 — Handover \& Knowledge



```text

Commissioning

Handover

DLP

Facility Management

Lessons Learned

```



Outcome:



```text

Complete Project Lifecycle Control

```



\---



\## Phase 6 — Field \& Integration



```text

Mobile Field App

Integration Layer

Drawing Markup

Offline Sync

Telegram Bot

Email Integration

```



Outcome:



```text

Connected Field and Integrated Platform

```



\---



\## Phase 7 — Intelligence



```text

AI Assistant

AI Project Manager

AI Cost Forecasting

AI Risk Detection

Digital Twin

```



Outcome:



```text

Construction Intelligence Platform

```



\---



\# 6. Module Dependency Map



\## Foundation Dependency



```text

Company

&#x20;   ↓

Users

&#x20;   ↓

Roles / Permissions

&#x20;   ↓

Projects

&#x20;   ↓

WBS

&#x20;   ↓

Tasks / Documents

```



\---



\## Execution Dependency



```text

WBS

&#x20;   ↓

Tasks

&#x20;   ↓

Construction Progress

&#x20;   ↓

QAQC / HSE

&#x20;   ↓

Reports

```



\---



\## Commercial Dependency



```text

BOQ

&#x20;   ↓

Budget

&#x20;   ↓

Procurement

&#x20;   ↓

Inventory

&#x20;   ↓

Cost Control

&#x20;   ↓

IPC / Payment

```



\---



\## Document Dependency



```text

Document Control

&#x20;   ↓

Revision Control

&#x20;   ↓

Approval Workflow

&#x20;   ↓

Transmittal

&#x20;   ↓

Audit Log

```



\---



\## Contract Dependency



```text

Contract

&#x20;   ↓

Instruction / Notice

&#x20;   ↓

Variation / Claim

&#x20;   ↓

EOT / Cost Impact

&#x20;   ↓

Final Account

```



\---



\# 7. Module Documentation Requirement



Every module must have the following documents:



```text

01-Business-Requirement.md

02-Functional-Specification.md

03-Workflow.md

04-Database-Schema.md

05-API-Specification.md

06-UI-UX-Design.md

07-Permission-Matrix.md

08-Notification-Matrix.md

09-Audit-Requirements.md

10-Reports-KPI.md

11-UAT-Test-Cases.md

12-SOP.md

```



No module should enter production without complete documentation.



\---



\# 8. Module Status Classification



Each module shall use one of these statuses:



| Status         | Meaning                            |

| -------------- | ---------------------------------- |

| Planned        | Module identified but not designed |

| Designed       | Module specification completed     |

| In Development | Development in progress            |

| UAT            | Under user acceptance testing      |

| Production     | Live and active                    |

| Enhancement    | Existing module under improvement  |

| Deprecated     | Module replaced or no longer used  |



\---



\# 9. Module Priority Rules



Priority is decided by:



1\. Dependency importance

2\. Business impact

3\. User frequency

4\. Risk reduction

5\. Cost control impact



Highest priority modules:



```text

Project Setup

WBS

Task

Document Control

Approval Workflow

Audit Log

Notification

BOQ

Budget

Procurement

IPC

```



\---



\# 10. Module Ownership Rules



Every module must have:



```text

Business Owner

Technical Owner

Data Owner

Support Owner

```



Example:



| Module           | Business Owner           | Technical Owner | Data Owner          | Support Owner |

| ---------------- | ------------------------ | --------------- | ------------------- | ------------- |

| Procurement      | Procurement Manager      | Technical Lead  | Procurement Manager | Support Admin |

| Payroll          | HR Manager               | Technical Lead  | HR / Finance        | Support Admin |

| Document Control | Document Control Manager | Technical Lead  | Document Controller | Support Admin |

| BOQ              | QS Manager               | Technical Lead  | QS Manager          | Support Admin |



\---



\# 11. Core Integration Rules



No module may create duplicate versions of these core objects:



```text

Project

User

WBS

Document

Approval

Notification

Audit Log

```



All modules must reuse the shared core engines.



\---



\# 12. Module Completion Checklist



A module is considered complete only when:



```text

Business workflow approved

Database schema approved

API endpoints defined

UI screens approved

Permission matrix approved

Notification rules approved

Audit rules approved

Reports defined

UAT test cases passed

SOP completed

Training material completed

Production release approved

```



\---



\# 13. Final Recommendation



DCOS must be developed as one connected enterprise platform.



The module map must not be treated as a simple feature list.



It is the operating structure of the entire platform.



Every module must connect back to:



```text

Project

WBS

User

Document

Workflow

Audit

Report

```



If a module does not connect to the core backbone, it becomes another isolated tool.



That must be avoided.



The strength of DCOS is not the number of modules.



The strength of DCOS is that all modules work together as one construction operating system.



