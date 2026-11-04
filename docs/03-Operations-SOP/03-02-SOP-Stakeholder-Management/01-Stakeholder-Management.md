# 01-Stakeholder-Management

## Module Design Specification

Module Code: STK
Module Name: Stakeholder Management
Domain: Foundation Module
Priority: Phase 1 (Core Foundation)
Business Owner: PMO Manager
Technical Owner: Platform Owner

---

# 1. Purpose

The Stakeholder Management module provides a centralized registry of all organizations, companies, teams, and individuals involved in project execution.

This module acts as the master source for:

* Clients
* Consultants
* Contractors
* Suppliers
* Subcontractors
* Authorities
* Testing Agencies
* Internal Departments
* Internal Teams

No stakeholder information should be created directly inside projects.

All stakeholders must originate from this module.

---

# 2. Business Objectives

## Objective 1

Single source of stakeholder information.

---

## Objective 2

Avoid duplicate company records.

---

## Objective 3

Allow one stakeholder to participate in multiple projects.

---

## Objective 4

Track stakeholder performance and history.

---

## Objective 5

Support future AI analysis.

Examples:

```text
Best Supplier

Slowest Consultant

Highest NCR Contractor

Highest Performing Team
```

---

# 3. Stakeholder Hierarchy

```text
Company
    │
    ├── Departments
    │
    ├── Teams
    │
    └── Members
```

---

# 4. Stakeholder Categories

## Internal Stakeholders

```text
Management

Engineering

Procurement

Planning

Construction

QAQC

HSE

HR

Finance

Document Control
```

---

## External Stakeholders

```text
Client

Consultant

Subcontractor

Supplier

Authority

Testing Agency

Facility Management
```

---

# 5. Stakeholder Architecture

```text
Stakeholder Registry
       │
       ├── Companies
       │
       ├── Teams
       │
       ├── Members
       │
       ├── Projects
       │
       └── Performance Records
```

---

# 6. Main Entities

## Stakeholder Company

Examples:

```text
General Department of Taxation

CMED Construction

Hattha Bank

Sika Cambodia

Bureau Veritas
```

---

## Team

Examples:

```text
Structural Design Team

MEP Design Team

Procurement Team

QAQC Team
```

---

## Member

Examples:

```text
Liheng Pouth

Tangkea Sok

Kosal Chea

Lis Vann

The Dara
```

---

# 7. Company Types

| Code | Type                |
| ---- | ------------------- |
| CLI  | Client              |
| CON  | Consultant          |
| MC   | Main Contractor     |
| SUB  | Subcontractor       |
| SUP  | Supplier            |
| AUT  | Authority           |
| TST  | Testing Agency      |
| FM   | Facility Management |
| INT  | Internal Company    |

---

# 8. Company Master Information

## General Information

```text
Company Name

Short Name

Company Code

Registration Number

Tax Number

Website

Company Type
```

---

## Contact Information

```text
Address

Country

Province

City

Phone

Email

Website
```

---

## Commercial Information

```text
Credit Terms

Payment Terms

Currency

Contract Capacity

Business Categories
```

---

## Compliance Information

```text
Business License

Insurance

Certificates

Trade License

Expiry Dates
```

---

# 9. Team Master Information

## Team Details

```text
Team Name

Team Code

Department

Manager

Description
```

---

## Example

```text
STR-TEAM-01

Structural Design Team
```

---

# 10. Member Master Information

## Personal Information

```text
Employee ID

Full Name

Position

Department

Email

Phone
```

---

## Organization Information

```text
Company

Team

Manager

Role
```

---

## System Information

```text
User Account

Permission Role

Status
```

---

# 11. Stakeholder Registration Workflow

```text
Create Company
      ↓
Create Teams
      ↓
Create Members
      ↓
Review
      ↓
Approve
      ↓
Active
```

---

# 12. Project Assignment Workflow

```text
Stakeholder Registry
        ↓
Select Project
        ↓
Assign Company
        ↓
Assign Team
        ↓
Assign Members
        ↓
Activate Project Access
```

---

# 13. Example Project Assignment

## Project

```text
GDT Office Tower
```

---

## Client

```text
General Department of Taxation
```

---

## Consultant

```text
Design Consultant

Supervision Consultant
```

---

## Main Contractor

```text
CMED Construction
```

---

## Subcontractors

```text
Pile Contractor

Facade Contractor

MEP Contractor
```

---

# 14. Stakeholder Relationship Matrix

```text
Project
     │
     ├── Client
     │
     ├── Consultant
     │
     ├── Contractor
     │
     ├── Supplier
     │
     ├── Authority
     │
     └── Testing Agency
```

---

# 15. Performance Evaluation

## Supplier Score

Criteria:

```text
Quality

Delivery

Cost

Responsiveness
```

---

## Consultant Score

Criteria:

```text
Review Time

RFI Response

Drawing Quality
```

---

## Subcontractor Score

Criteria:

```text
Quality

Safety

Progress

Cooperation
```

---

# 16. Dashboard

## Executive View

```text
Total Stakeholders

Active Stakeholders

Top Suppliers

Top Subcontractors

High Risk Stakeholders
```

---

## Project Manager View

```text
Assigned Stakeholders

Pending Approvals

Performance Ratings

Expired Licenses
```

---

# 17. Notifications

System alerts:

```text
License Expiry

Insurance Expiry

Contract Expiry

Project Assignment

Performance Review Due
```

---

# 18. Audit Requirements

Log:

```text
Create Company

Update Company

Create Team

Update Team

Assign Project

Remove Project

Performance Evaluation
```

---

# 19. Permission Matrix

## Administrator

```text
Full Access
```

---

## PMO

```text
Create
Edit
Assign
View
```

---

## Department Manager

```text
View
Assign
Review
```

---

## Project Manager

```text
Assign Project
View Stakeholders
```

---

## General User

```text
View Only
```

---

# 20. Database Structure

## stakeholder_companies

```text
id
company_code
company_name
company_type
status
```

---

## stakeholder_teams

```text
id
company_id
team_code
team_name
manager_id
```

---

## stakeholder_members

```text
id
company_id
team_id
user_id
position
```

---

## project_stakeholders

```text
id
project_id
company_id
stakeholder_role
```

---

## stakeholder_performance

```text
id
stakeholder_id
project_id
score
comments
```

---

# 21. API Endpoints

```text
GET     /stakeholders

POST    /stakeholders

PUT     /stakeholders/{id}

DELETE  /stakeholders/{id}

GET     /stakeholders/{id}/projects

POST    /projects/{id}/stakeholders

GET     /stakeholders/performance
```

---

# 22. UI Screens

## Screen 1

Stakeholder Dashboard

---

## Screen 2

Company Registry

---

## Screen 3

Company Details

---

## Screen 4

Team Management

---

## Screen 5

Member Management

---

## Screen 6

Project Assignment

---

## Screen 7

Performance Evaluation

---

## Screen 8

Stakeholder Directory

---

# 23. Future AI Features

AI can analyze:

```text
Best Supplier

Best Consultant

Best Subcontractor

High Risk Vendor

Slow Response Stakeholder
```

---

# 24. Success Criteria

The Stakeholder Module is considered complete when:

✓ Company Registry Exists

✓ Team Registry Exists

✓ Member Registry Exists

✓ Project Assignment Exists

✓ Performance Tracking Exists

✓ Audit Trail Exists

✓ Notification Rules Exist

✓ Dashboard Exists

✓ API Exists

✓ Permission Matrix Exists

---

# 25. Core Principle

Stakeholders are created once and reused many times.

Projects should never create stakeholder records directly.

All projects must consume stakeholder information from the centralized Stakeholder Registry.

This ensures consistency, traceability, performance history, and enterprise scalability across all DCOS projects.


My recommendation for DCOS is to split the Stakeholder module into 4 sub-modules:
01-Stakeholder-Management/
│
├── 01-Company-Registry
├── 02-Team-Registry
├── 03-Member-Registry
├── 04-Project-Assignment
│
├── 05-Performance-Management
├── 06-Compliance-Tracking
├── 07-Directory-Dashboard
└── 08-Stakeholder-Portal (Future)
