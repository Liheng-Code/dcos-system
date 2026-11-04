# DCOS Master Libraries Design Plan

## Digital Construction Operating System (DCOS)

**Document Version:** R1.0
**Module:** Master Libraries
**Purpose:** Reusable Project Generation Engine

---

# 1. Introduction

The **Master Libraries** are the foundation of the DCOS platform.

Instead of manually creating the WBS tree for every project, DCOS should maintain reusable master libraries that can generate complete project structures automatically.

This approach provides:

* Standardization
* Faster project setup
* Better data consistency
* Reusable templates
* Reduced human error
* Enterprise scalability

The Master Libraries should be maintained by **PMO/System Administrator**, while Project Managers only select templates and generate projects.

---

# 2. Overall Architecture

```text
MASTER LIBRARIES
│
├── Phase Library
├── Building Library
├── Level Library
├── Zone Library
├── Room Library
├── Element Library
├── Discipline Library
└── Task Group Library
        │
        ▼
Project Template Builder
        │
        ▼
Project Generator Wizard
        │
        ▼
Project WBS Instance
```

---

# 3. Library Relationship

```text
Phase
    │
    ▼
Building
    │
    ▼
Level
    │
    ▼
Zone
    │
    ▼
Room
    │
    ▼
Element
    │
    ▼
Discipline
    │
    ▼
Task Group
```

Every library should be reusable by multiple project templates.

---

# 4. Phase Library

## Purpose

Define project lifecycle stages.

## Table

Phase_Master

| Field       | Type    |
| ----------- | ------- |
| id          | UUID    |
| phase_code  | VARCHAR |
| phase_name  | VARCHAR |
| sequence_no | INTEGER |
| description | TEXT    |
| is_active   | BOOLEAN |

---

## Sample Data

| Code   | Name          |
| ------ | ------------- |
| PH-001 | Tender        |
| PH-002 | Design        |
| PH-003 | Procurement   |
| PH-004 | Construction  |
| PH-005 | Testing       |
| PH-006 | Commissioning |
| PH-007 | Handover      |
| PH-008 | DLP           |
| PH-009 | Closeout      |

---

# 5. Building Library

## Purpose

Store reusable building structures.

## Table

Building_Master

| Field         | Type    |
| ------------- | ------- |
| id            | UUID    |
| building_code | VARCHAR |
| building_name | VARCHAR |
| building_type | VARCHAR |
| description   | TEXT    |
| is_active     | BOOLEAN |

---

## Sample Data

| Code    | Building          |
| ------- | ----------------- |
| BLD-001 | Main Tower        |
| BLD-002 | Podium            |
| BLD-003 | Warehouse         |
| BLD-004 | Factory           |
| BLD-005 | Office Building   |
| BLD-006 | Residential Tower |
| BLD-007 | Club House        |
| BLD-008 | Parking Building  |
| BLD-009 | Plant Room        |

---

# 6. Level Library

## Purpose

Store reusable floor definitions.

## Table

Level_Master

| Field      | Type    |
| ---------- | ------- |
| id         | UUID    |
| level_code | VARCHAR |
| level_name | VARCHAR |
| sort_order | INTEGER |
| level_type | VARCHAR |
| is_active  | BOOLEAN |

---

## Sample Data

| Code   | Level        |
| ------ | ------------ |
| LVL-B4 | Basement 4   |
| LVL-B3 | Basement 3   |
| LVL-B2 | Basement 2   |
| LVL-B1 | Basement 1   |
| LVL-G  | Ground Floor |
| LVL-M  | Mezzanine    |
| LVL-L2 | Level 2      |
| LVL-L3 | Level 3      |
| LVL-L4 | Level 4      |
| LVL-RF | Roof         |
| LVL-RT | Roof Top     |

---

# 7. Zone Library

## Purpose

Store standard zoning patterns.

## Table

Zone_Master

| Field       | Type    |
| ----------- | ------- |
| id          | UUID    |
| zone_code   | VARCHAR |
| zone_name   | VARCHAR |
| description | TEXT    |

---

## Sample Data

| Code   | Zone      |
| ------ | --------- |
| ZN-001 | North     |
| ZN-002 | South     |
| ZN-003 | East      |
| ZN-004 | West      |
| ZN-005 | Core      |
| ZN-006 | Wing A    |
| ZN-007 | Wing B    |
| ZN-008 | Wing C    |
| ZN-009 | External  |
| ZN-010 | Roof Zone |

---

# 8. Room Library

## Purpose

Store reusable room types.

## Table

Room_Master

| Field       | Type    |
| ----------- | ------- |
| id          | UUID    |
| room_code   | VARCHAR |
| room_name   | VARCHAR |
| category    | VARCHAR |
| discipline  | VARCHAR |
| description | TEXT    |

---

## Sample Data

Office

Meeting Room

Lift Lobby

Toilet

Pantry

Corridor

Stair

Electrical Room

Mechanical Room

Pump Room

AHU Room

MDF Room

IDF Room

Server Room

Loading Bay

Store Room

Refuge Area

Control Room

Kitchen

Dining Area

etc.

---

# 9. Element Library

## Purpose

Store construction elements.

## Categories

Structure

Architecture

MEP

Landscape

External Work

Temporary Work

Equipment

---

## Table

Element_Master

| Field        | Type    |
| ------------ | ------- |
| id           | UUID    |
| element_code | VARCHAR |
| element_name | VARCHAR |
| category     | VARCHAR |
| discipline   | VARCHAR |

---

## Sample Structure

Pile

Pile Cap

Footing

Column

Beam

Slab

Wall

Core Wall

Stair

Ramp

Roof Slab

---

## Sample Architecture

Door

Window

Curtain Wall

Ceiling

Tile

Paint

Stone

Partition

Waterproofing

Canopy

---

## Sample MEP

Pipe

Cable Tray

Lighting

Socket

Fire Pump

AHU

FCU

Chiller

Duct

Valve

Sprinkler

CCTV

Data Rack

---

# 10. Discipline Library

## Purpose

Store company disciplines.

## Table

Discipline_Master

| Field           | Type    |
| --------------- | ------- |
| id              | UUID    |
| discipline_code | VARCHAR |
| discipline_name | VARCHAR |
| sequence_no     | INTEGER |

---

## Sample Data

Architecture

Structure

MEP

BIM

Planning

Procurement

Construction

QAQC

HSE

QS

Commercial

Document Control

Commissioning

HR

Finance

Administration

---

# 11. Task Group Library

## Purpose

Store reusable work packages.

## Table

TaskGroup_Master

| Field           | Type    |
| --------------- | ------- |
| id              | UUID    |
| task_group_code | VARCHAR |
| task_group_name | VARCHAR |
| category        | VARCHAR |

---

## Sample Data

Design

Calculation Note

Drawing

Shop Drawing

Material Approval

Method Statement

Procurement

Construction

Inspection

Testing

Commissioning

As-built

Punch List

Handover

Closeout

---

# 12. Project Template Builder

This is the heart of DCOS.

Instead of creating WBS manually, PMO creates reusable templates.

Example:

```text
High Rise Office

├── Phase
│
├── Main Tower
│
├── Basement
├── Ground
├── Typical Floor
├── Roof
│
├── Core
├── North
├── South
│
├── Office
├── Toilet
├── Lift Lobby
│
├── Structure
├── Architecture
├── MEP
│
└── Task Groups
```

The template is stored permanently.

---

# 13. Project Generator Wizard

When creating a project:

```text
Create Project

↓

Select Template

High Rise Office

↓

Input Variables

Tower Name
Basement Count
Floor Count
Zone Pattern

↓

Generate

↓

Complete WBS Created
```

No manual creation required.

---

# 14. Recommended User Permission

## System Admin

* Full CRUD
* Import
* Export
* Archive

---

## PMO

* Create Library
* Edit Library
* Create Template

---

## Project Manager

* View Library
* Generate Project
* Cannot modify master library

---

## Engineer

* View only

---

# 15. Benefits

## Traditional Method

```text
Create Project

↓

Create Building

↓

Create Level

↓

Create Zone

↓

Create Room

↓

Create Element

↓

Create Discipline

↓

Create Task Group

↓

Finish
```

Estimated:

2~6 Hours

---

## DCOS Master Library Method

```text
Create Project

↓

Select Template

↓

Input Number of Floors

↓

Click Generate

↓

Project Ready
```

Estimated:

10~30 Seconds

---

# 16. Future Enhancement

The next evolution should include an **AI Project Generator**.

Example:

```text
User:

Create Office Tower

35 Floors

2 Basements

4 Zones

Generate

↓

AI creates

Project

Building

Levels

Zones

Rooms

Elements

Disciplines

Task Groups

Dependencies

Schedule

Resource Plan

Complete WBS
```

This would make DCOS one of the most advanced construction management platforms available.
