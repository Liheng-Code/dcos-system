# SOP-Project-Setup.md

# Digital Construction Operating System (DCOS)

## Standard Operating Procedure (SOP)

## Project Setup

Document No: DCOS-SOP-PS-001
Version: 1.0
Status: Approved
Owner: PMO Manager
Effective Date: TBD

---

# 1. Purpose

This procedure establishes the standard process for creating, configuring, and activating projects within the Digital Construction Operating System (DCOS).

The purpose is to ensure:

* Consistent project structure
* Standardized WBS
* Controlled project governance
* Accurate stakeholder assignment
* Proper permissions
* Consistent reporting

All DCOS modules depend on Project Setup.

---

# 2. Scope

This procedure applies to:

```text
Tender Projects

Awarded Projects

Internal Projects

Construction Projects

Design Projects

Infrastructure Projects

Maintenance Projects
```

---

# 3. Objectives

Project Setup shall ensure:

### Standardization

All projects follow the same structure.

---

### Traceability

Every project activity is traceable.

---

### Scalability

Projects can support future growth.

---

### Governance

Project data is controlled.

---

# 4. Project Lifecycle

```text
Project Request
      ↓
Project Registration
      ↓
Project Configuration
      ↓
Stakeholder Assignment
      ↓
Team Assignment
      ↓
WBS Configuration
      ↓
Workflow Configuration
      ↓
Budget Configuration
      ↓
Project Activation
      ↓
Execution
      ↓
Project Closeout
```

---

# 5. Roles & Responsibilities

## PMO Manager

Responsible for:

```text
Project Creation Approval

Project Governance

Project Closure Approval
```

---

## Project Manager

Responsible for:

```text
Project Setup

Team Assignment

WBS Verification
```

---

## System Administrator

Responsible for:

```text
Technical Configuration

Access Management

Project Activation
```

---

## Department Managers

Responsible for:

```text
Resource Assignment

Team Approval
```

---

# 6. Project Creation Workflow

```text
Request Project
      ↓
Review Information
      ↓
Approve Creation
      ↓
Generate Project Code
      ↓
Configure Project
      ↓
Activate
```

---

# 7. Project Registration

## Required Information

### General

```text
Project Name

Project Code

Project Type

Client

Location

Currency

Time Zone
```

---

### Contract

```text
Contract Number

Contract Value

Contract Start Date

Contract End Date
```

---

### Management

```text
Project Director

Project Manager

Engineering Manager

Planning Manager
```

---

# 8. Project Code Standard

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

Project codes are unique.

Project codes cannot be changed.

---

# 9. Project Classification

## By Business Type

```text
Tender

Awarded

Internal
```

---

## By Industry

```text
Building

Infrastructure

Industrial

Energy

Water

Maintenance
```

---

## By Contract Type

```text
Lump Sum

Unit Rate

Design & Build

EPC

Turnkey
```

---

# 10. Stakeholder Assignment

Project stakeholders must originate from:

```text
Stakeholder Registry
```

Only.

---

## Assignment Process

```text
Select Project
      ↓
Assign Client
      ↓
Assign Consultant
      ↓
Assign Contractor
      ↓
Assign Suppliers
      ↓
Assign Authorities
```

---

## Required Stakeholders

```text
Client

Consultant

Main Contractor
```

Mandatory.

---

# 11. Project Team Assignment

## Internal Team Structure

```text
Project Director
      ↓
Project Manager
      ↓
Department Managers
      ↓
Engineers
```

---

## Assignment Rules

Users must:

```text
Exist in User Registry

Have Valid Role

Have Active Status
```

---

# 12. Project Organization Chart

Example:

```text
Project Director
       │
Project Manager
       │
 ┌─────┼─────┬─────┐
 ▼     ▼     ▼     ▼

ENG   QS   QAQC  HSE
```

---

Organization chart is mandatory before activation.

---

# 13. WBS Configuration

## Standard Structure

```text
Project
    ↓
Building
    ↓
Level
    ↓
Zone
    ↓
Room
    ↓
Element
    ↓
Task
```

---

## Example

```text
Tower A
   ↓
L05
   ↓
ZA
   ↓
Meeting Room
   ↓
Column
   ↓
Task
```

---

# 14. Project Calendar Setup

## Working Days

Example:

```text
Monday-Saturday
```

---

## Working Hours

Example:

```text
08:00-17:00
```

---

## Holidays

Configured per project.

---

## Special Calendars

Examples:

```text
Night Shift

24 Hour Operation

Shutdown Period
```

---

# 15. Document Numbering Configuration

Project must define:

```text
Project Code

Building Code

Discipline Codes

Document Types
```

---

Example:

```text
GDT-STR-DWG-TA-L05-001-R01
```

---

# 16. Approval Workflow Configuration

Configure:

```text
Task Approval

Document Approval

Procurement Approval

Leave Approval

Claim Approval
```

---

All workflows use:

```text
Approval Engine
```

Only.

---

# 17. Notification Configuration

Configure:

```text
In-App

Email

Telegram
```

Rules.

---

Examples:

```text
Task Assigned

Approval Required

Document Rejected
```

---

# 18. Budget Structure Setup

Configure:

```text
Cost Breakdown Structure

Budget Categories

Cost Codes
```

---

Example:

```text
01 Preliminary

02 Substructure

03 Superstructure

04 Architecture

05 MEP
```

---

# 19. Procurement Structure Setup

Configure:

```text
Procurement Packages

Package Codes

Vendor Categories
```

---

Example:

```text
PKG-001 Piling

PKG-002 Excavation

PKG-003 Rebar
```

---

# 20. Dashboard Configuration

Enable:

```text
Executive Dashboard

PM Dashboard

Department Dashboard
```

---

Configure KPI ownership.

---

# 21. Project Activation Checklist

Before activation:

✓ Project Information Complete

✓ Stakeholders Assigned

✓ Team Assigned

✓ WBS Configured

✓ Calendar Configured

✓ Workflows Configured

✓ Notifications Configured

✓ Budget Configured

✓ Dashboard Configured

✓ Permissions Assigned

---

# 22. Activation Workflow

```text
Project Setup
      ↓
PM Review
      ↓
PMO Approval
      ↓
System Activation
```

---

## Status

Before:

```text
Draft
```

---

After:

```text
Active
```

---

# 23. Project Status Definitions

| Status           | Meaning               |
| ---------------- | --------------------- |
| Draft            | Under Setup           |
| Pending Approval | Waiting Activation    |
| Active           | Live Project          |
| On Hold          | Temporarily Suspended |
| Completed        | Finished              |
| Archived         | Historical Record     |

---

# 24. Project Change Management

Changes requiring approval:

```text
Project Manager

Contract Value

Project Duration

WBS Structure

Major Stakeholders
```

---

Approval:

```text
PMO Manager
```

Required.

---

# 25. Project Closure Procedure

Requirements:

```text
Tasks Closed

Documents Closed

Claims Closed

Contracts Closed

Financial Closeout Complete
```

---

Workflow:

```text
Request Closure
      ↓
Review
      ↓
Approval
      ↓
Archive
```

---

# 26. Project Archive Rules

Archived projects:

```text
Read Only
```

---

Cannot:

```text
Create Tasks

Create Documents

Create Procurement Records
```

---

# 27. Audit Requirements

Log:

```text
Project Creation

Project Update

Stakeholder Assignment

Team Assignment

WBS Modification

Activation

Closure
```

---

Audit logs cannot be deleted.

---

# 28. Notification Requirements

Notify:

```text
Project Created

Project Activated

Project On Hold

Project Closed
```

---

Recipients:

```text
Project Team

Managers

Administrators
```

---

# 29. KPI Monitoring

## Setup Duration

Measure:

```text
Request → Activation
```

---

## Setup Completeness

Target:

```text
100%
```

---

## Configuration Accuracy

Target:

```text
Zero Critical Errors
```

---

# 30. Integration Requirements

Project Setup integrates with:

```text
User Management

Stakeholder Management

WBS Management

Task Management

Document Control

Planning

Procurement

QAQC

HSE

Commercial

HR

Finance
```

Every module depends on Project Setup.

---

# 31. Definition of Done

A project is considered successfully configured when:

✓ Project Registered

✓ Stakeholders Assigned

✓ Team Assigned

✓ WBS Configured

✓ Calendar Configured

✓ Workflows Configured

✓ Budget Configured

✓ Permissions Assigned

✓ Dashboard Enabled

✓ Activated

All conditions must be satisfied.

---

# 32. Final Statement

Project Setup is the foundation of every project within DCOS.

No task, document, procurement package, inspection, cost record, or report shall exist without an active project.

Project Setup establishes the structure, governance, permissions, workflows, and controls that all other modules depend upon.

A well-configured project creates a well-controlled project.

A poorly configured project creates operational risk across the entire system.
