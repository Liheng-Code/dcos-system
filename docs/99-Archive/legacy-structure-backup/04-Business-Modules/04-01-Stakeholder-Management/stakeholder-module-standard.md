# standards/stakeholder-module-standard.md

## DCOS Stakeholder Module Standard

---

### 1. Design Goal

Stakeholder module must feel like a control panel for responsibility.

It is not a contact list.  
It is not a CRM.  
It is not for storing names only.  

It is a system to control:
- Who is responsible
- Who approves
- Who executes
- Who is accountable

---

### 2. Core Layout

Use this layout as default:

Sidebar + Top Bar + Main Workspace + Detail Panel

---

### 3. Main Navigation

Sidebar modules:

- Dashboard
- Projects
- WBS / Tasks
- Design (ARC / STR / MEP)
- Procurement
- Construction
- Documents
- QA/QC
- HSE
- HR
- Account
- Reports
- Admin

Stakeholder module located under:

Admin → Stakeholder Management

---

### 4. Screen Structure

#### 4.1 Left Panel — Stakeholder Type Filter

Purpose:
Quick classification and filtering

Display:

- All Stakeholders
- Client / Owner
- Consultant
- Subcontractor
- Supplier
- Authority
- Testing Agency

Rules:

- Show count per type
- Active filter highlight
- Fast switching (no reload delay)

---

#### 4.2 Top Bar — Control Actions

Include:

- Search (organization / contact / role)
- Filter button
- Add Stakeholder button

Rules:

- Search must be instant
- Add button always visible
- No hidden actions

---

#### 4.3 Main Workspace — Stakeholder Register

Display as table/list:

Columns:

- Organization Name
- Stakeholder Type
- Contact Person
- Project Role
- Approval Level
- Status

Rules:

- Clean row spacing
- No visual clutter
- Status color must be clear:
  - Active → Green
  - Pending → Yellow
  - Inactive → Grey

Interaction:

- Click row → open detail panel
- Hover → highlight row

---

#### 4.4 Right Panel — Detail Panel

Purpose:
Single source of truth for stakeholder

Sections:

1. Basic Information
2. Project Assignment
3. Approval Authority
4. Access Control
5. Workflow Responsibility
6. Performance Tracking

---

### 5. Stakeholder Detail Content

#### 5.1 Basic Information

- Organization Name
- Stakeholder Type
- Contact Person
- Email
- Phone
- Address

---

#### 5.2 Project Assignment

- Project Name
- Role in Project
- Discipline (ARC / STR / MEP / etc.)
- Start / End Date

---

#### 5.3 Approval Authority

Define clearly:

- No Approval
- Review Only
- Approve
- Final Approval

Rules:

- Must not be ambiguous
- Must align with workflow

---

#### 5.4 Access Control

Define:

- Full Access
- Limited Access
- Read-only

Optional:

- WBS-based restriction

Example:

- Building B01 only
- Level L05 only

---

#### 5.5 Workflow Responsibility

Show participation:

- Task execution
- Document review
- RFI response
- Inspection approval
- Procurement involvement

Rules:

- Toggle ON/OFF
- Must reflect real workflow

---

#### 5.6 Performance Tracking

Display:

- Response time
- Approval delay
- Task completion rate
- Reliability score (%)

Visual:

- Progress bar
- Warning if < 80%

---

### 6. Interaction Flow

#### Create Stakeholder

Create stakeholder  
→ Select type  
→ Input organization info  
→ Add contact  
→ Save  

---

#### Assign to Project

Select stakeholder  
→ Assign project  
→ Define role  
→ Define approval level  
→ Define access  
→ Assign WBS (optional)  
→ Activate  

---

### 7. Workflow Rules

- Stakeholder must exist before assignment
- Stakeholder must be assigned before workflow
- Approval cannot proceed without assigned approver
- Every action must link to stakeholder

---

### 8. Notification Behavior

System must notify based on role:

- Task assigned → Engineer
- Task overdue → Engineer + PM
- RFI created → Consultant
- RFI overdue → Consultant + Director
- PO approved → Supplier

Rules:

- No spam
- Only relevant users
- Critical alerts escalate

---

### 9. UX Rules

- No unnecessary animation
- No fancy colors
- No social-style UI

Design must feel like:

A construction control room

Not a marketing app

---

### 10. Data Integrity Rules

- No duplicate stakeholder in same project
- Approval level must be defined
- External users must have limited access
- All actions logged in audit log

---

### 11. Integration

This module must connect to:

- Project Module
- WBS Module
- Task Module
- Document Control
- Procurement
- QA/QC
- Notification System
- Audit Log

---

### 12. MVP Scope

Start with:

- Stakeholder register
- Project assignment
- Role & permission
- Basic approval logic

Do NOT overbuild early.

---

### 13. Final Principle

If this module is weak:

→ System becomes chaos

If this module is strong:

→ Project becomes controlled

---

END OF STANDARD