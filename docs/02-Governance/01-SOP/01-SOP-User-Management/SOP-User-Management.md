\# SOP-User-Management.md



\# Digital Construction Operating System (DCOS)



\## Standard Operating Procedure (SOP)



\## User Management



Document No: DCOS-SOP-UM-001

Version: 1.0

Status: Approved

Owner: System Administrator

Effective Date: TBD



\---



\# 1. Purpose



This procedure establishes the standard process for:



\* User registration

\* User activation

\* User maintenance

\* Role assignment

\* Permission management

\* User suspension

\* User termination



within the Digital Construction Operating System (DCOS).



The objective is to ensure:



\* Proper access control

\* Data security

\* User accountability

\* Compliance with governance requirements



\---



\# 2. Scope



This SOP applies to:



\## Internal Users



```text

CEO

Director

Department Manager

Project Manager

Engineer

QAQC

HSE

Procurement

HR

Finance

Document Controller

Administrator

```



\---



\## External Users



```text

Client

Consultant

Supplier

Subcontractor

Authority

Inspector

```



\---



\# 3. Objectives



The User Management process shall ensure:



\### Security



Only authorized users can access DCOS.



\---



\### Accountability



Every activity is traceable to a user.



\---



\### Compliance



Access follows role-based permissions.



\---



\### Data Protection



Users access only information necessary for their duties.



\---



\# 4. User Lifecycle



\## Standard Lifecycle



```text

User Request

&#x20;    ↓

Approval

&#x20;    ↓

Account Creation

&#x20;    ↓

Role Assignment

&#x20;    ↓

Project Assignment

&#x20;    ↓

Active User

&#x20;    ↓

Modification

&#x20;    ↓

Suspension

&#x20;    ↓

Termination

&#x20;    ↓

Archive

```



\---



\# 5. Roles \& Responsibilities



\## Requestor



Responsible for:



\* Requesting new users

\* Requesting changes

\* Requesting removal



Usually:



```text

Department Manager

Project Manager

HR Manager

```



\---



\## System Administrator



Responsible for:



\* Creating users

\* Maintaining users

\* Deactivating users



\---



\## HR Manager



Responsible for:



\* Employment verification

\* New employee onboarding

\* Employee termination notification



\---



\## Department Manager



Responsible for:



\* Role approval

\* Project assignment approval



\---



\## Platform Owner



Responsible for:



\* Governance enforcement

\* High-level access approval



\---



\# 6. User Types



\## Internal User



Employees of organization.



Examples:



```text

Engineer

Manager

HR

Finance

```



\---



\## External User



Outside organization.



Examples:



```text

Consultant

Supplier

Subcontractor

Client

```



\---



\## System User



Automated accounts.



Examples:



```text

Integration Service

Notification Service

AI Service

```



\---



\# 7. User Request Procedure



\## Step 1



Manager submits user request.



Required information:



```text

Full Name

Email

Department

Position

Role

Projects

User Type

```



\---



\## Step 2



Approval required.



Approval hierarchy:



```text

Department Manager

&#x20;     ↓

System Administrator

```



\---



\## Step 3



Account created.



Status:



```text

Pending Activation

```



\---



\# 8. User Creation Procedure



\## Required Fields



| Field       | Required |

| ----------- | -------- |

| Employee ID | Yes      |

| Full Name   | Yes      |

| Email       | Yes      |

| Department  | Yes      |

| Position    | Yes      |

| User Type   | Yes      |

| Role        | Yes      |



\---



\## System Generated Fields



```text

User ID

Username

Created Date

Audit Record

```



\---



\## User ID Format



```text

USR-000001

```



Examples:



```text

USR-000001

USR-000002

USR-000003

```



\---



\## Username Format



```text

firstname.lastname

```



Example:



```text

liheng.pouth

```



\---



\# 9. Account Activation



\## Initial Password



System generated.



\---



\## First Login



User must:



```text

Change Password

```



Mandatory.



\---



\## MFA



Future requirement:



```text

Multi-Factor Authentication

```



Enabled for:



```text

Finance

Payroll

Administrators

```



\---



\# 10. Role Assignment Procedure



All permissions follow:



```text

RBAC

Role Based Access Control

```



\---



\## Direct Permission Assignment



Not allowed.



\---



Users receive permissions only through:



```text

Role

```



Assignment.



\---



\# 11. Standard Roles



\## Executive



Access:



```text

Portfolio Dashboard

Executive Reports

```



\---



\## Project Manager



Access:



```text

Projects

Tasks

Documents

Reports

Approvals

```



\---



\## Engineer



Access:



```text

Assigned Tasks

Documents

Reviews

```



\---



\## QAQC



Access:



```text

Inspection

NCR

Punch List

```



\---



\## Procurement



Access:



```text

PR

RFQ

PO

Suppliers

```



\---



\## Finance



Access:



```text

Invoices

Payments

Reports

```



\---



\## Administrator



Full system access.



\---



\# 12. Project Assignment Procedure



Users shall only access assigned projects.



\---



\## Assignment Flow



```text

User

&#x20;   ↓

Role

&#x20;   ↓

Project

```



\---



\## Example



```text

Engineer A



Role:

Structural Engineer



Projects:

GDT

HTBT

```



\---



\# 13. Permission Matrix Rules



Every permission belongs to:



```text

Module

Action

```



\---



Examples:



| Module      | Action    |

| ----------- | --------- |

| Task        | Create    |

| Task        | Update    |

| Task        | Approve   |

| Document    | Upload    |

| Document    | Review    |

| Procurement | Create PR |



\---



\# 14. User Modification Procedure



Changes requiring approval:



```text

Role Change

Department Change

Project Assignment

```



\---



Approval:



```text

Manager

\+

System Admin

```



\---



\# 15. Password Policy



Minimum:



```text

8 Characters

```



Recommended:



```text

12 Characters

```



\---



Must contain:



```text

Uppercase

Lowercase

Number

Special Character

```



\---



Example:



```text

Dcos@2026!

```



\---



\# 16. Password Reset Procedure



User requests reset.



\---



System Admin:



```text

Reset Password

```



\---



User must change password upon next login.



\---



\# 17. User Suspension Procedure



Reasons:



```text

Investigation

Security Incident

Extended Leave

Contract Expired

```



\---



Status:



```text

Suspended

```



\---



Suspended users:



```text

Cannot Login

```



\---



\# 18. User Termination Procedure



Triggered by:



```text

Resignation

Termination

Contract End

```



\---



HR notifies System Administrator.



\---



Actions:



```text

Deactivate Account

Remove Sessions

Lock Access

```



\---



\# 19. User Archive Procedure



Former users remain in database.



Purpose:



```text

Audit History

```



\---



User records:



```text

Read Only

```



\---



Never deleted.



\---



\# 20. Access Review Procedure



Monthly review.



Verify:



```text

Active Users

Roles

Project Access

Unused Accounts

```



\---



\# 21. Inactive Account Policy



Account inactive:



```text

90 Days

```



System automatically:



```text

Disable Account

```



\---



Reactivation requires approval.



\---



\# 22. Security Controls



Users prohibited from:



```text

Sharing Accounts

Sharing Passwords

Using Generic Accounts

```



\---



Every user must have:



```text

Unique Login

```



\---



\# 23. Audit Requirements



System must log:



```text

Login

Logout

Password Reset

Role Change

Project Assignment

User Creation

User Deactivation

```



\---



Audit records cannot be deleted.



\---



\# 24. Notification Rules



Notify:



\### User Created



To:



```text

User

Manager

```



\---



\### Role Changed



To:



```text

User

Manager

```



\---



\### Password Reset



To:



```text

User

```



\---



\### Account Disabled



To:



```text

User

Manager

```



\---



\# 25. User Status Definitions



| Status    | Meaning             |

| --------- | ------------------- |

| Pending   | Awaiting activation |

| Active    | Can use system      |

| Suspended | Temporarily blocked |

| Disabled  | Access removed      |

| Archived  | Historical record   |



\---



\# 26. KPI Monitoring



\## Active User Count



Measure:



```text

Current Active Users

```



\---



\## Login Success Rate



Target:



```text

>99%

```



\---



\## Unauthorized Access Attempts



Target:



```text

0

```



\---



\## Access Review Compliance



Target:



```text

100%

```



\---



\# 27. Exception Management



Exceptions require:



```text

Business Justification

Manager Approval

Platform Owner Approval

```



Examples:



```text

Temporary Elevated Access

Cross-Project Access

Emergency Access

```



\---



\# 28. Integration Requirements



User Management integrates with:



```text

RBAC

Project Setup

Stakeholder Management

Approval Engine

Notification Engine

Audit Engine

HR Module

Payroll Module

```



\---



\# 29. Definition of Done



A user is considered fully onboarded when:



```text

Account Created

Role Assigned

Project Assigned

Password Changed

First Login Completed

```



All five conditions must be satisfied.



\---



\# 30. Final Statement



User Management is the foundation of security, accountability, and governance within DCOS.



Every action in DCOS must be attributable to a unique user identity.



No access shall be granted without authorization.



No permission shall exist without governance.



Every user.

Every role.

Every project.



Must be controlled through the procedures defined in this document.



