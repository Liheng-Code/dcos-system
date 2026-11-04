# DCOS-Document-Control-Procedure.md

# Digital Construction Operating System (DCOS)

## Document Control Procedure (DCP)

Document No: DCOS-DCP-001
Version: 1.0
Status: Approved
Owner: Document Control Manager
Effective Date: TBD

---

# 1. Purpose

The purpose of this procedure is to establish a standardized process for:

* Creating documents
* Reviewing documents
* Approving documents
* Distributing documents
* Revising documents
* Archiving documents

within the Digital Construction Operating System (DCOS).

This procedure ensures:

* Correct document versions are used.
* Document history is maintained.
* Approvals are traceable.
* Information is distributed correctly.
* Regulatory and contractual compliance is achieved.

---

# 2. Scope

This procedure applies to all project and company documents managed within DCOS.

Including:

```text
Drawings
Specifications
Calculation Notes
Method Statements
ITP
Reports
BOQ
Contracts
Purchase Orders
Material Approvals
RFI
NCR
Minutes of Meeting
Handover Documents
```

Applicable to:

```text
Internal Staff
Consultants
Clients
Suppliers
Subcontractors
Authorities
```

---

# 3. Objectives

The document control process shall ensure:

### Right Document

Correct document.

### Right Revision

Latest approved revision.

### Right Person

Proper recipient.

### Right Time

Timely distribution.

### Full Traceability

Complete history.

---

# 4. Roles & Responsibilities

## Document Originator

Responsible for:

* Creating document
* Updating document
* Responding to comments

Examples:

```text
Engineer
Designer
QS
Procurement Officer
Site Engineer
```

---

## Reviewer

Responsible for:

* Technical review
* Commenting
* Verification

Examples:

```text
Team Leader
Lead Engineer
Manager
```

---

## Approver

Responsible for:

* Final approval
* Acceptance

Examples:

```text
Department Manager
Project Manager
Client
Consultant
```

---

## Document Controller

Responsible for:

* Register maintenance
* Number assignment
* Distribution
* Revision control
* Archiving

---

## Recipient

Responsible for:

* Reviewing issued documents
* Taking action

Examples:

```text
Site Team
Supplier
Subcontractor
Client
```

---

# 5. Document Classification

## Internal Documents

Used only within organization.

Examples:

```text
Internal Reports
Calculations
Meeting Notes
```

---

## Controlled Documents

Require revision control.

Examples:

```text
Drawings
Specifications
Method Statements
ITP
```

---

## External Documents

Received from outside organizations.

Examples:

```text
Authority Approvals
Supplier Catalogues
Consultant Drawings
```

---

## Confidential Documents

Restricted access.

Examples:

```text
Contracts
Claims
Payroll
Commercial Data
```

---

# 6. Document Lifecycle

## Standard Lifecycle

```text
Draft
 ↓
Submitted
 ↓
Under Review
 ↓
Approved
 ↓
Issued
 ↓
Superseded
 ↓
Archived
```

---

## Rejection Path

```text
Submitted
 ↓
Review
 ↓
Rejected
 ↓
Revise
 ↓
Resubmit
```

---

# 7. Document Numbering Standard

All controlled documents shall follow:

```text
PROJECT-DIS-TYPE-BLD-LVL-SEQ-REV
```

Example:

```text
GDT-STR-DWG-TA-L05-001-R02
```

Meaning:

```text
GDT      Project

STR      Structure

DWG      Drawing

TA       Tower A

L05      Level 05

001      Sequence

R02      Revision
```

Document numbers are unique.

Document numbers cannot be reused.

---

# 8. Document Status Definitions

| Status     | Meaning                    |
| ---------- | -------------------------- |
| Draft      | Being prepared             |
| Submitted  | Sent for review            |
| Review     | Under review               |
| Approved   | Approved for use           |
| Rejected   | Rejected                   |
| Issued     | Distributed                |
| Superseded | Replaced by newer revision |
| Archived   | Closed record              |

---

# 9. Document Creation Process

## Step 1

Originator creates document.

Required fields:

```text
Title
Discipline
Document Type
Project
WBS
Revision
```

---

## Step 2

Document uploaded to DCOS.

System automatically generates:

```text
Document ID
Version
Timestamp
Audit Record
```

---

## Step 3

Status:

```text
Draft
```

---

# 10. Review & Approval Process

## Standard Workflow

```text
Originator
      ↓
Reviewer
      ↓
Approver
```

---

## Multi-Level Workflow

```text
Engineer
    ↓
Lead Engineer
    ↓
Manager
    ↓
Client
```

---

## Review Actions

Reviewer may:

```text
Approve

Approve with Comments

Reject
```

---

## Approval Actions

Approver may:

```text
Approve

Reject
```

---

# 11. Revision Control Procedure

## Revision Numbering

Format:

```text
R00
R01
R02
R03
```

---

## Rules

New revision required when:

```text
Design changes

Specification changes

Scope changes

Correction issued
```

---

## Prohibited

Never overwrite:

```text
Approved Revision
```

New file required.

---

# 12. Document Transmittal Procedure

## Purpose

Formal issue of documents.

---

## Transmittal Flow

```text
Approved Document
       ↓
Create Transmittal
       ↓
Select Recipients
       ↓
Issue
       ↓
Acknowledgement
```

---

## Transmittal Number

Format:

```text
TRM-YYYY-00001
```

Example:

```text
TRM-2026-00001
```

---

# 13. External Document Distribution

External issue allowed only through:

```text
Transmittal
```

Module.

---

Never through:

```text
WhatsApp

Telegram

Personal Email
```

Without registration.

---

# 14. Superseded Document Control

When new revision approved:

System automatically:

```text
Mark old revision superseded

Lock editing

Maintain history
```

---

Site users shall see:

```text
Latest Approved Revision
```

Only.

---

# 15. Document Register Management

DCOS shall maintain:

```text
Master Document Register
```

Containing:

```text
Document Number
Title
Revision
Status
Originator
Approver
Issue Date
Distribution
```

---

# 16. Access Control

Document access controlled by:

```text
Role

Project

Discipline

Permission
```

---

Examples:

```text
Read

Create

Review

Approve

Issue

Archive
```

---

# 17. Audit Trail Requirements

System must record:

```text
Upload

Download

View

Update

Approve

Reject

Issue

Archive
```

For every document.

---

Audit records cannot be deleted.

---

# 18. Notifications

System shall notify users for:

```text
Document Submitted

Review Required

Approval Required

Document Rejected

Document Approved

Document Issued

Revision Updated
```

Channels:

```text
In-App

Email

Telegram
```

---

# 19. Archive Procedure

Documents may be archived when:

```text
Project Completed

Contract Closed

Document Superseded
```

---

Archived documents:

```text
Read Only
```

---

Cannot be modified.

---

# 20. Retention Requirements

| Document Type     | Retention |
| ----------------- | --------- |
| Drawings          | 15 Years  |
| Contracts         | 15 Years  |
| QAQC Records      | 10 Years  |
| HSE Records       | 10 Years  |
| Financial Records | 10 Years  |
| General Documents | 7 Years   |

---

# 21. KPI & Performance Metrics

## Document Turnaround Time

Measure:

```text
Submission → Approval
```

---

## Review Response Time

Measure:

```text
Submission → Review
```

---

## Revision Accuracy

Measure:

```text
Wrong Revision Issues
```

Target:

```text
Zero
```

---

## Approval Compliance

Target:

```text
100%
```

Approved documents must follow workflow.

---

# 22. Non-Conformance

Examples:

```text
Wrong revision used

Missing approval

Unauthorized issue

Missing transmittal

Missing document number
```

Must trigger:

```text
Document NCR
```

Investigation.

---

# 23. Integration Requirements

Document Control integrates with:

```text
Project Setup
WBS
Task Management
Design Modules
Procurement
QAQC
HSE
Commercial
Handover
Audit Engine
Notification Engine
Approval Engine
```

---

# 24. Definition of Controlled Document

A document is considered controlled when:

```text
Document Number Assigned

Revision Assigned

Stored in DCOS

Approval Workflow Applied

Audit Trail Enabled
```

All five conditions must exist.

---

# 25. Final Statement

Document Control is the backbone of information management within DCOS.

No drawing, specification, report, method statement, contract, or approval shall be considered valid unless it is:

* Registered
* Revision Controlled
* Approved
* Traceable
* Distributed through DCOS

The objective is simple:

The right information.
To the right people.
At the right time.
With complete traceability.
