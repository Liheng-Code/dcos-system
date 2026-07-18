# DCOS Task Template Library Design

## Digital Construction Operating System (DCOS)

**Module:** Task Template Library
**Version:** R1.0

---

# 1. Purpose

The Task Template Library is the standard repository of reusable construction activities.

Instead of creating tasks manually for every project, DCOS will generate project tasks automatically from predefined templates.

The Task Template Library becomes the **knowledge base** of the company.

Every future project can reuse proven task sequences from previous projects.

---

# 2. Architecture

```text
Master Libraries
│
├── Phase
├── Building
├── Level
├── Zone
├── Room
├── Element
├── Discipline
├── Task Group
└── Task Template
            │
            ▼
Project Template
            │
            ▼
Project Generator
            │
            ▼
Project Tasks
```

---

# 3. Task Template Categories

The library should be separated into:

```
01 Design Tasks

02 Procurement Tasks

03 Construction Tasks

04 QAQC Tasks

05 HSE Tasks

06 Inspection Tasks

07 Testing Tasks

08 Commissioning Tasks

09 Handover Tasks

10 Administration Tasks
```

---

# 4. Database Table

Task_Template_Master

| Field               | Description         |
| ------------------- | ------------------- |
| template_id         | UUID                |
| template_code       | Unique Code         |
| task_name           | Task Name           |
| phase_id            | Phase               |
| discipline_id       | Discipline          |
| task_group_id       | Task Group          |
| default_duration    | Days                |
| default_weight      | KPI Weight          |
| predecessor         | Default predecessor |
| successor           | Default successor   |
| milestone           | Yes/No              |
| approval_required   | Yes/No              |
| default_priority    | Low/Medium/High     |
| requires_document   | Yes/No              |
| requires_photo      | Yes/No              |
| requires_checklist  | Yes/No              |
| requires_inspection | Yes/No              |
| auto_assign_role    | Default Role        |
| description         | Task Description    |
| active              | Active              |

---

# 5. Standard Task Fields

Each task template should contain:

```
Task Code

Task Name

Task Description

Phase

Discipline

Task Group

Duration

Unit

Weight

Priority

Milestone

Deliverable

Required Document

Approval Workflow

Responsible Role

Dependency

Successor

Required Checklist

Inspection Required

Photo Required

Remarks
```

---

# 6. Example Design Task Templates

## Structure

| Code      | Task                     |
| --------- | ------------------------ |
| STR-D-001 | Prepare Design Criteria  |
| STR-D-002 | Prepare Loading Summary  |
| STR-D-003 | ETABS Modelling          |
| STR-D-004 | SAFE Modelling           |
| STR-D-005 | Structural Analysis      |
| STR-D-006 | Member Design            |
| STR-D-007 | Foundation Design        |
| STR-D-008 | Prepare Calculation Note |
| STR-D-009 | Internal Check           |
| STR-D-010 | Issue IFC Drawing        |

---

## Architecture

| Code      | Task              |
| --------- | ----------------- |
| ARC-D-001 | Layout Plan       |
| ARC-D-002 | Elevation         |
| ARC-D-003 | Section           |
| ARC-D-004 | Room Data Sheet   |
| ARC-D-005 | Finish Schedule   |
| ARC-D-006 | Door Schedule     |
| ARC-D-007 | Window Schedule   |
| ARC-D-008 | Material Board    |
| ARC-D-009 | Internal Review   |
| ARC-D-010 | Issue IFC Drawing |

---

## MEP

| Code      | Task                 |
| --------- | -------------------- |
| MEP-D-001 | HVAC Design          |
| MEP-D-002 | Electrical Design    |
| MEP-D-003 | Plumbing Design      |
| MEP-D-004 | Fire Fighting Design |
| MEP-D-005 | ELV Design           |
| MEP-D-006 | Load Calculation     |
| MEP-D-007 | Equipment Schedule   |
| MEP-D-008 | Clash Coordination   |
| MEP-D-009 | Internal Review      |
| MEP-D-010 | IFC Drawing          |

---

# 7. Procurement Task Templates

Example

| Code     | Task                   |
| -------- | ---------------------- |
| PROC-001 | Raise Material Request |
| PROC-002 | Prepare PR             |
| PROC-003 | PR Approval            |
| PROC-004 | RFQ Issue              |
| PROC-005 | Receive Quotation      |
| PROC-006 | Technical Evaluation   |
| PROC-007 | Commercial Evaluation  |
| PROC-008 | Issue PO               |
| PROC-009 | Delivery Follow-up     |
| PROC-010 | Material Receiving     |

---

# 8. Construction Task Templates

Concrete Work

| Code    | Task                  |
| ------- | --------------------- |
| CON-001 | Survey Setting Out    |
| CON-002 | Install Formwork      |
| CON-003 | Install Rebar         |
| CON-004 | MEP Embedded Check    |
| CON-005 | Internal Inspection   |
| CON-006 | Consultant Inspection |
| CON-007 | Concrete Casting      |
| CON-008 | Concrete Curing       |
| CON-009 | Formwork Removal      |
| CON-010 | Repair Defect         |

---

# 9. QAQC Task Templates

| Code   | Task               |
| ------ | ------------------ |
| QA-001 | Prepare ITP        |
| QA-002 | Inspection Request |
| QA-003 | Inspection         |
| QA-004 | Raise NCR          |
| QA-005 | Corrective Action  |
| QA-006 | Re-inspection      |
| QA-007 | NCR Close          |

---

# 10. HSE Task Templates

| Code    | Task              |
| ------- | ----------------- |
| HSE-001 | Toolbox Meeting   |
| HSE-002 | Risk Assessment   |
| HSE-003 | Work Permit       |
| HSE-004 | Safety Inspection |
| HSE-005 | Incident Report   |
| HSE-006 | Corrective Action |

---

# 11. Task Dependency Template

Example

```text
Survey
    ↓
Formwork
    ↓
Rebar
    ↓
MEP Embedded
    ↓
Inspection
    ↓
Concrete Casting
    ↓
Curing
    ↓
Remove Formwork
```

Dependencies should be stored inside the template.

---

# 12. Auto Assignment Rules

Each task template should define:

| Task              | Default Role        |
| ----------------- | ------------------- |
| Design            | Design Engineer     |
| Shop Drawing      | BIM Engineer        |
| PR                | Procurement Officer |
| RFQ               | Procurement Manager |
| Inspection        | QAQC Engineer       |
| Concrete Casting  | Site Engineer       |
| Safety Inspection | HSE Officer         |

When the project team is assigned, DCOS automatically maps tasks to project members.

---

# 13. Auto Document Requirements

Example

| Task              | Deliverable      |
| ----------------- | ---------------- |
| ETABS Modelling   | ETABS File       |
| Calculation Note  | PDF              |
| Shop Drawing      | DWG/PDF          |
| Material Approval | MAR              |
| Inspection        | IR               |
| Concrete Casting  | Pour Card        |
| Handover          | As-built Drawing |

The system should automatically check whether required deliverables are uploaded before allowing task completion.

---

# 14. Project Generation Flow

```text
Create Project
        │
        ▼
Select Project Template
        │
        ▼
Generate WBS
        │
        ▼
Attach Task Templates
        │
        ▼
Auto Generate Thousands of Tasks
        │
        ▼
Auto Create Dependencies
        │
        ▼
Auto Assign Default Roles
        │
        ▼
Ready for Scheduling
```

---

# 15. Future AI Enhancement

Eventually DCOS should support **AI Task Generation**.

Example:

```
User:

Create 35-storey office tower.

2 basements.

Post-tension slabs.

Curtain wall facade.

Generate tasks.

↓

AI generates:

- 2,500 Tasks
- Dependencies
- Durations
- Deliverables
- QA Checklists
- Inspection Points
- Procurement Packages
- Milestones
```

The PM only needs to review and adjust instead of creating tasks manually.
