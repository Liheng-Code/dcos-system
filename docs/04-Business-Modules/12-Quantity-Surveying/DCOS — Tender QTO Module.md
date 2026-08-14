# DCOS — Tender QTO Module

## Master System Design Prompt for Claude AI

---

## 1. ROLE

You are a **Senior Quantity Surveying Manager, Tender Manager, Construction Cost Manager, Business Analyst, UX/UI Architect, and Full-Stack System Architect** with extensive experience in real construction tendering and Quantity Takeoff (QTO).

You are helping design the **Quantity Takeoff (QTO) Module** inside **DCOS — Digital Construction Operating System**.

The system must be designed based on **real construction tendering practice**, not as a generic calculator application.

The primary user is a **Quantity Surveyor (QS)** working during the tender stage.

The QS normally receives tender information from the Client / Consultant in the following formats:

* DWG
* PDF
* Excel
* BOQ
* Specifications
* Schedules
* Addendum
* Tender clarifications
* Other supporting documents

For the first version of the system, assume that the **main source of quantity measurement is 2D DWG/PDF drawings**.

Do NOT make BIM/Revit the primary workflow in V1.

The architecture must, however, allow BIM-based QTO to be added later.

---

# 2. SYSTEM CONTEXT

The overall DCOS tender workflow is:

```text
DCOS
 │
 └── TENDER
      │
      ├── Tender Information
      ├── Tender Documents
      ├── Drawing Register
      ├── Scope / WBS
      │
      └── QTO MODULE
           │
           └── BOQ
                │
                └── COST ESTIMATION
                     │
                     └── TENDER PRICE
```

The QTO module is the bridge between:

```text
CLIENT TENDER DOCUMENTS
        ↓
DRAWINGS
        ↓
QUANTITY TAKEOFF
        ↓
BOQ
        ↓
COST ESTIMATION
        ↓
TENDER PRICE
```

---

# 3. CORE QTO WORKFLOW

Design the system around the following workflow:

```text
                    DCOS
                     │
                  TENDER
                     │
                  QTO MODULE
                     │
      ┌──────────────┼──────────────┐
      │              │              │
 DOCUMENT         DRAWING        QTO WORKSPACE
 REGISTER         REGISTER            │
      │              │          ┌─────┼─────┐
      │              │          │     │     │
      │              │       Measure Formula Deduct
      │              │          │     │     │
      └──────────────┴──────────┴─────┴─────┘
                             │
                         QTO REGISTER
                             │
                       QTO CHECK / REVIEW
                             │
                          APPROVAL
                             │
                         QTO SUMMARY
                             │
                            BOQ
                             │
                      COST ESTIMATION
                             │
                       TENDER PRICE
```

This workflow is the foundation of the system.

---

# 4. MAIN OBJECTIVE

Design a professional QTO system that allows a QS to:

1. Receive tender documents.
2. Register tender documents.
3. Register drawings.
4. Control drawing revisions.
5. Open DWG/PDF drawings.
6. Review drawings before measurement.
7. Measure quantities from drawings.
8. Record measurement information.
9. Create calculation formulas.
10. Add and deduct quantities.
11. Record QTO assumptions.
12. Link quantities to drawing references.
13. Link quantities to building / discipline / work section / element.
14. Perform self-checking.
15. Submit QTO for checking.
16. Allow another QS / QS Manager to review.
17. Approve QTO.
18. Generate QTO summaries.
19. Transfer approved quantities to BOQ.
20. Eventually connect BOQ to cost estimation and tender pricing.

---

# 5. IMPORTANT DESIGN PRINCIPLE

Do NOT design QTO as only a calculator.

QTO is a **controlled measurement and audit system**.

Every quantity must answer:

```text
WHAT?
WHERE?
FROM WHICH DRAWING?
WHICH REVISION?
HOW WAS IT MEASURED?
WHO MEASURED IT?
WHO CHECKED IT?
WHEN WAS IT CHECKED?
WHAT ASSUMPTIONS WERE USED?
WHAT IS THE CURRENT STATUS?
```

The system must maintain traceability from:

```text
QTO Quantity
     ↓
QTO Calculation
     ↓
Drawing Reference
     ↓
Drawing Revision
     ↓
Tender Document
     ↓
Tender
```

---

# 6. USER ROLES

Design role-based access control.

At minimum:

### QS / Estimator

Can:

* View tender documents
* View drawings
* Create QTO
* Measure quantities
* Edit own QTO
* Add calculations
* Add deductions
* Add assumptions
* Submit QTO for checking

### Senior QS

Can:

* Review QTO
* Check calculations
* Return QTO
* Approve QTO if authorized
* View all QS measurements

### QS Manager / Tender Manager

Can:

* View all QTO
* Assign QTO packages
* Monitor progress
* Review QTO status
* Approve QTO
* Lock approved quantities
* Generate QTO summary
* Push QTO to BOQ

### Admin

Can:

* Configure system
* Manage users
* Manage permissions
* Configure libraries

---

# 7. TENDER STRUCTURE

The QTO module must support multi-building projects.

Example:

```text
PROJECT
│
└── TENDER
    │
    ├── BA — Tower Building
    │   ├── Architectural
    │   ├── Structural
    │   ├── Civil
    │   └── Other
    │
    ├── BB — Podium Building
    │   ├── Architectural
    │   ├── Structural
    │   └── Civil
    │
    └── BX — External Works
        ├── Earthworks
        ├── Roads
        ├── Drainage
        ├── Utilities
        └── Landscape
```

The system must NOT assume that a project has only one building.

---

# 8. QTO WBS

The QTO system should follow:

```text
Project
 ↓
Tender
 ↓
Building
 ↓
Discipline
 ↓
Work Section
 ↓
Element
 ↓
QTO Item
```

Example:

```text
Project ABC
└── Tender TND-2026-001
    └── BA Tower
        └── Structural
            └── Concrete Works
                └── Foundation
                    └── Pile Cap
                        └── PC-01
                            └── QTO Item
```

Allow the system to support additional WBS levels if required.

---

# 9. DOCUMENT REGISTER

Create a Tender Document Register.

Required fields:

* Document ID
* Document Number
* Document Title
* Document Type
* Discipline
* Building
* Revision
* Issue Date
* Received Date
* Source
* File Name
* File Type
* File Version
* Status
* Remarks
* Uploaded By
* Uploaded Date

Document types may include:

* DWG
* PDF
* XLSX
* DOCX
* Specification
* BOQ
* Tender Instruction
* Addendum
* Clarification
* Other

---

# 10. DRAWING REGISTER

Create a dedicated Drawing Register.

Example:

| Drawing No. | Title             | Discipline    | Building | Revision | Status  |
| ----------- | ----------------- | ------------- | -------- | -------- | ------- |
| S-101       | Foundation Layout | Structural    | BA       | P01      | Current |
| S-102       | Column Layout     | Structural    | BA       | P02      | Current |
| A-101       | Ground Floor Plan | Architectural | BA       | P03      | Current |

Required fields:

* Drawing ID
* Drawing Number
* Drawing Title
* Discipline
* Building
* Drawing Type
* Revision
* Revision Date
* Status
* Drawing File
* Related Document
* Supersedes
* Superseded By
* Uploaded By
* Uploaded Date
* Remarks

---

# 11. DRAWING REVISION CONTROL

Revision control is mandatory.

Example:

```text
S-203 Rev P01
       ↓
S-203 Rev P02
       ↓
S-203 Rev P03
```

Do NOT overwrite historical revisions.

Store them as separate versions.

Example:

```text
QTO-000821
│
├── Based on S-203 Rev P01
│   Qty = 48.500 m³
│
├── Based on S-203 Rev P02
│   Qty = 52.300 m³
│
└── Based on S-203 Rev P03
    Qty = 55.296 m³
```

The system must identify the current revision.

The system must warn users if they are measuring from a superseded drawing.

---

# 12. DRAWING REVIEW BEFORE QTO

Before measurement, the QS should be able to review:

* Drawing title
* Drawing number
* Revision
* Scale
* Units
* Drawing status
* Applicable specification
* Related drawings
* Missing information
* Design assumptions
* Clarification requirements

Create a pre-QTO checklist.

Example:

```text
[ ] Correct drawing revision
[ ] Correct scale
[ ] Correct unit
[ ] Drawing readable
[ ] Required details available
[ ] Specification available
[ ] Related drawings checked
[ ] Missing information recorded
```

---

# 13. QTO WORKSPACE

This is the most important screen.

Design a professional 3-panel workspace:

```text
┌────────────────────────────────────────────────────────────────────┐
│ DCOS > Tender > QTO > BA > Structural > Concrete                  │
├────────────────┬──────────────────────────────────┬───────────────┤
│ DRAWING        │                                  │ QTO PANEL     │
│ NAVIGATOR      │        DRAWING VIEWER            │               │
│                │                                  │ QTO ID        │
│ Architecture   │                                  │ Description   │
│ Structural     │          DWG / PDF               │ Measurement   │
│ Civil          │           CANVAS                 │ Calculation   │
│                │                                  │ Quantity      │
│ S-101          │                                  │ Unit          │
│ S-102          │                                  │ Source        │
│ S-103          │                                  │ Assumption    │
│                │                                  │ Status        │
└────────────────┴──────────────────────────────────┴───────────────┘
```

---

# 14. DRAWING VIEWER

The viewer should support, where technically possible:

### Navigation

* Pan
* Zoom in
* Zoom out
* Fit drawing
* Full screen
* Search
* Layer visibility

### Measurement

* Point
* Length
* Polyline
* Area
* Count
* Perimeter
* Distance
* Angle if useful

### Markup

* Highlight
* Rectangle
* Cloud
* Text
* Arrow
* Measurement label

### QTO linkage

When a measurement is created, allow the user to link it to a QTO item.

Example:

```text
Drawing
 ↓
Select area
 ↓
Measure
 ↓
Create QTO Item
 ↓
Save measurement
```

---

# 15. DWG SUPPORT

DWG is the primary tender drawing source.

Investigate technically feasible approaches for:

* DWG viewing
* DWG rendering
* Layer extraction
* Geometry extraction
* Measurement
* Coordinate handling
* Unit detection
* Annotation
* Export

Do NOT assume that a browser can directly render native DWG without an appropriate library/service.

Propose a realistic architecture for DWG handling.

If direct DWG editing is impractical, provide a controlled viewing/measurement workflow.

The system must preserve the original DWG file.

---

# 16. PDF SUPPORT

PDF must also be supported because tender teams frequently receive PDF drawings.

Support:

* PDF viewer
* Page navigation
* Zoom
* Pan
* Measurement
* Markup
* Drawing reference
* Page reference
* QTO linkage

For PDF-based QTO, store:

```text
Document
Drawing
Page
Revision
Measurement
QTO Item
```

---

# 17. QTO ITEM

Every QTO measurement must create or update a QTO Item.

Example:

```text
QTO ID       : QTO-000821
Tender       : TND-2026-001
Building     : BA
Discipline   : Structural
Work Section : Concrete Works
Element      : Pile Cap
Item Code    : PC-01
Description  : Reinforced concrete pile cap
Unit         : m³
Quantity     : 55.296
```

---

# 18. QTO ITEM REQUIRED DATA

Each QTO item should include:

### Identification

* QTO ID
* Tender ID
* Building
* Discipline
* Work Section
* Element
* Item Code
* Description

### Measurement

* Unit
* Quantity
* Measurement Method
* Calculation
* Formula
* Additions
* Deductions
* Net Quantity

### Source

* Drawing Number
* Drawing Title
* Drawing Revision
* Page if PDF
* Grid / Location
* Detail Reference
* Specification Reference

### Responsibility

* Prepared By
* Prepared Date
* Checked By
* Checked Date
* Approved By
* Approved Date

### Control

* Status
* Revision
* Confidence
* Assumption
* Remarks

---

# 19. MEASUREMENT METHODS

The system should initially support:

### 1. Length

Unit:

```text
m
```

Examples:

* Kerb
* Skirting
* Handrail
* Pipe
* Cable tray

### 2. Area

Unit:

```text
m²
```

Examples:

* Painting
* Plaster
* Waterproofing
* Tiles
* Roofing

### 3. Volume

Unit:

```text
m³
```

Examples:

* Concrete
* Excavation
* Backfill

### 4. Count

Unit:

```text
No.
```

Examples:

* Doors
* Windows
* Fixtures
* Manholes

### 5. Weight

Unit:

```text
kg / tonne
```

Examples:

* Rebar
* Structural steel

### 6. Formula-Based

Support formulas using dimensions.

Example:

```text
Concrete Volume

Length × Width × Depth
```

---

# 20. CALCULATION ENGINE

The calculation engine must not only store the final quantity.

It must store the calculation logic.

Example:

```text
Pile Cap PC-01

Length = 2.40 m
Width  = 2.40 m
Depth  = 0.80 m
Qty    = 12 No.

Calculation:

2.40 × 2.40 × 0.80 × 12

Result:

55.296 m³
```

Store both:

```text
Input Parameters
+
Formula
+
Result
```

The user must be able to reopen the calculation later.

---

# 21. ADDITION / DEDUCTION ENGINE

Support:

```text
+
-
=
```

Example:

```text
Gross wall area     +500.00 m²
Door openings        -35.00 m²
Window openings      -50.00 m²
--------------------------------
Net wall area        415.00 m²
```

The system must maintain the detailed calculation lines.

Do not store only:

```text
415 m²
```

Store the complete calculation history.

---

# 22. QTO ASSUMPTIONS

Allow the QS to record assumptions.

Example:

```text
Assumption:
Wall height taken as 3.60m based on typical floor-to-floor height
because architectural wall elevation is not provided.
```

Each assumption should have:

* Assumption ID
* Description
* Reason
* Related QTO
* Related drawing
* Risk level
* Status
* Related RFI if applicable

---

# 23. QTO CLARIFICATION / RFI LINK

If a QS cannot determine a quantity due to missing information, the system should allow:

```text
QTO
 ↓
Create Clarification / RFI
 ↓
Client / Consultant Response
 ↓
Update QTO
```

Example:

```text
QTO-000821
Status: On Hold

Reason:
Foundation depth unclear.

RFI:
RFI-STR-014

Client Response:
Foundation depth confirmed = 800mm

QTO:
Updated
```

This is extremely important in real tendering.

---

# 24. QTO STATUS

Use a controlled status workflow:

```text
DRAFT
 ↓
MEASURED
 ↓
SELF CHECKED
 ↓
SUBMITTED FOR CHECK
 ↓
QS CHECKED
 ↓
APPROVED
 ↓
POSTED TO BOQ
```

If rejected:

```text
QS CHECKED
 ↓
REJECTED
 ↓
REVISION REQUIRED
 ↓
MEASURED
```

---

# 25. QTO REVIEW

The reviewer must be able to compare:

```text
Drawing
+
Measurement
+
Calculation
+
Quantity
+
Unit
+
Assumption
```

Review actions:

* Approve
* Reject
* Comment
* Request correction
* Add review note

Example:

```text
Review Comment:

"Please verify deduction of opening O-04
against drawing A-203 Rev P03."
```

---

# 26. QTO REVISION

Do not overwrite approved QTO.

Example:

```text
QTO-000821 Rev 01
Qty = 55.296 m³
Status = Approved

Client issues drawing revision.

QTO-000821 Rev 02
Qty = 61.450 m³
Status = Draft
```

Maintain full history.

---

# 27. QTO SUMMARY

Create a summary dashboard.

Example:

```text
TENDER QTO SUMMARY

BA Tower
─────────────────────────────
Structural Concrete      8,520 m³
Reinforcement             920 ton
Formwork                 31,500 m²

BB Podium
─────────────────────────────
Structural Concrete      4,210 m³
Reinforcement             480 ton

BX External
─────────────────────────────
Excavation               12,500 m³
Drainage                  2,400 m
```

Allow filtering by:

* Building
* Discipline
* Work Section
* Element
* Drawing
* QS
* Status
* Revision

---

# 28. QTO PROGRESS DASHBOARD

Create management-level monitoring.

Example:

```text
QTO PROGRESS

BA Tower
Structural       100%
Architecture      82%
Civil              0%

BB Podium
Structural         95%
Architecture       76%

BX External
Civil               60%
Landscape             0%
```

Also show:

```text
Total QTO Items       1,245
Measured              1,080
Self Checked            920
QS Checked              850
Approved                780
Pending                 395
```

---

# 29. QTO RISK DASHBOARD

Track:

```text
Missing Drawing
Unclear Information
Pending RFI
Provisional Quantity
Assumption
Superseded Drawing
Unverified Quantity
Revision Pending
```

Example:

```text
QTO RISK

🔴 Missing Information       12
🟠 Pending RFI                8
🟡 Assumption                15
🟣 Provisional Quantity       7
🔵 Revision Pending           4
🟢 Fully Checked            328
```

Do not rely only on color. Always show text/status.

---

# 30. CONFIDENCE LEVEL

Each QTO quantity should have a confidence classification.

Example:

```text
HIGH
MEDIUM
LOW
PROVISIONAL
```

Or:

```text
HIGH
MEDIUM
LOW
```

with additional flags for:

```text
Assumption
Provisional
RFI Pending
```

Example:

```text
Quantity = 2,450 m²

Confidence: MEDIUM
Reason:
Architectural ceiling layout not fully developed.
```

---

# 31. QTO SOURCE CLASSIFICATION

Create a controlled source type:

```text
D1 = Detailed Drawing
S1 = Schedule
F1 = Formula
A1 = Area / Unit Calculation
B1 = BIM Model
H1 = Historical / Benchmark
P1 = Provisional
E1 = QS Estimate
```

For V1, prioritize:

```text
D1
S1
F1
A1
P1
E1
```

BIM/B1 should be future-ready.

---

# 32. BOQ INTEGRATION

Approved QTO must be transferable into BOQ.

Relationship:

```text
QTO
 ↓
QTO Summary
 ↓
BOQ Item
```

Example:

```text
QTO:

PC-01 = 55.296 m³
PC-02 = 32.400 m³
PC-03 = 42.120 m³

Total = 129.816 m³

        ↓

BOQ:

Concrete to pile caps
Unit = m³
Qty  = 129.816
```

Allow multiple QTO items to contribute to one BOQ item.

Example:

```text
QTO-001
QTO-002
QTO-003
QTO-004
       ↓
BOQ-STR-CON-001
```

---

# 33. QTO → BOQ TRACEABILITY

The BOQ quantity must always be traceable back to QTO.

Example:

```text
BOQ-STR-CON-001
Concrete Works
Qty = 1,250.50 m³

Source:

QTO-00001
QTO-00002
QTO-00003
...
```

The QS should be able to click:

```text
BOQ Quantity
     ↓
View QTO
     ↓
View Calculation
     ↓
View Drawing
```

---

# 34. COST ESTIMATION FUTURE INTEGRATION

Do not build full cost estimation into QTO V1.

Prepare the architecture for:

```text
QTO
 ↓
BOQ
 ↓
Material
 ↓
Labour
 ↓
Equipment
 ↓
Productivity
 ↓
Rate
 ↓
Direct Cost
 ↓
Overhead
 ↓
Profit
 ↓
Tender Price
```

---

# 35. DATABASE DESIGN

Design a relational database.

At minimum consider:

```text
projects
tenders
tender_documents
drawings
drawing_revisions

qto_packages
qto_items
qto_measurements
qto_calculations
qto_calculation_lines

qto_assumptions
qto_clarifications
qto_reviews
qto_revisions

boq_items
qto_boq_links
```

Create relationships between all entities.

Provide:

1. ERD
2. Table definitions
3. Primary keys
4. Foreign keys
5. Indexes
6. Audit fields
7. Status fields
8. Revision fields

---

# 36. AUDIT TRAIL

Every important QTO action must be recorded.

Track:

```text
Created
Edited
Submitted
Checked
Rejected
Approved
Revised
Posted to BOQ
```

Store:

* User
* Timestamp
* Action
* Previous value
* New value
* Comment

Approved QTO must be protected from silent modification.

---

# 37. UI MODULE STRUCTURE

Design the QTO module with the following screens:

### Screen 01 — QTO Dashboard

Show:

* Total QTO
* Progress
* Pending review
* Approved
* Risk
* QTO by building
* QTO by discipline

### Screen 02 — Document Register

Manage tender documents.

### Screen 03 — Drawing Register

Manage drawings and revisions.

### Screen 04 — Drawing Review

Review drawing metadata and completeness.

### Screen 05 — QTO Workspace

Main measurement interface.

### Screen 06 — QTO Register

Table of all QTO items.

### Screen 07 — QTO Calculation Detail

Show formulas and calculation lines.

### Screen 08 — QTO Review

Review and approval workflow.

### Screen 09 — QTO Summary

Aggregate approved quantities.

### Screen 10 — BOQ Mapping

Map QTO items to BOQ.

### Screen 11 — QTO Revision History

Compare revisions.

### Screen 12 — QTO Reports

Export:

* QTO report
* Quantity summary
* Measurement sheet
* Drawing reference report
* QTO revision report
* QTO status report

---

# 38. QTO REGISTER UI

Create a professional table.

Example:

| QTO ID  | Building | Discipline | Element    | Description |    Qty | Unit | Drawing | Rev | Status   |
| ------- | -------- | ---------- | ---------- | ----------- | -----: | ---- | ------- | --- | -------- |
| QTO-001 | BA       | STR        | Foundation | Concrete    | 55.296 | m³   | S-203   | P03 | Approved |
| QTO-002 | BA       | STR        | Column     | Concrete    | 32.400 | m³   | S-301   | P02 | Checked  |
| QTO-003 | BB       | ARC        | Wall       | Blockwork   | 450.00 | m²   | A-204   | P01 | Draft    |

Support:

* Search
* Filter
* Sort
* Group
* Bulk selection
* Export
* Column customization

---

# 39. UX PRINCIPLES

The system must be designed for QS productivity.

Avoid:

* Excessive popups
* Unnecessary pages
* Repetitive data entry
* Hidden calculations
* Unclear status
* Overly decorative UI

Prioritize:

* Fast measurement
* Keyboard shortcuts
* Clear drawing references
* Calculation transparency
* Easy correction
* Revision traceability
* Bulk operations
* Strong filtering
* Audit trail

---

# 40. IMPORTANT UX FEATURE — QUICK QTO

A QS should be able to perform a quick measurement.

Example:

```text
Select Drawing
       ↓
Select Measurement Type
       ↓
Measure
       ↓
Enter Description
       ↓
Enter Work Section
       ↓
Save QTO
```

Do not force the QS to fill 30 fields before saving a measurement.

Use progressive disclosure.

Required fields first.

Advanced information later.

---

# 41. QTO KEYBOARD SHORTCUTS

Consider:

```text
M = Measure
L = Length
A = Area
C = Count
V = Volume
D = Deduction
P = Pan
Z = Zoom
S = Save
Esc = Cancel
```

Allow shortcuts to be configurable later.

---

# 42. REPORTING

Generate professional tender reports.

### Report 01 — QTO Detailed Report

```text
QTO ID
Building
Discipline
Work Section
Description
Quantity
Unit
Calculation
Drawing
Revision
Prepared By
Checked By
Status
```

### Report 02 — QTO Summary

```text
Building
Discipline
Work Section
Total Quantity
```

### Report 03 — Drawing Coverage

Show which drawings have been measured.

### Report 04 — QTO Revision Report

Show quantity changes between drawing revisions.

### Report 05 — QTO Assumption Report

List all assumptions.

### Report 06 — QTO Risk Report

List incomplete or risky quantities.

---

# 43. EXCEL EXPORT

Provide Excel export for:

* QTO Register
* Detailed QTO
* QTO Summary
* BOQ Transfer
* Revision Comparison
* Assumption Register
* Risk Register

Export should preserve:

* QTO ID
* Formula
* Quantity
* Unit
* Drawing
* Revision
* Status

---

# 44. FUTURE BIM ARCHITECTURE

Do not implement BIM as the main V1 workflow.

But design the database so future integration can support:

```text
Revit
IFC
BIM Model
     ↓
Model Element
     ↓
Element ID
     ↓
QTO Item
```

Future example:

```text
Revit Element ID
= 123456

Category
= Structural Columns

Type
= C-01

Quantity
= 25 No.

       ↓

QTO-000821
```

The same QTO engine should eventually accept:

```text
DWG Measurement
PDF Measurement
Manual Formula
BIM Quantity
Schedule Quantity
```

---

# 45. FUTURE AI FEATURES

Design the system to eventually support AI, but do NOT make AI mandatory for V1.

Future AI capabilities:

### Drawing Intelligence

AI can identify:

* Drawing number
* Revision
* Title
* Discipline
* Building

### Quantity Assistance

AI may help detect:

* Columns
* Beams
* Slabs
* Walls
* Doors
* Windows

### QTO Validation

AI can flag:

```text
Potential missing quantities
Unusual quantity
Duplicate measurement
Possible wrong unit
Possible superseded drawing
```

### Tender Risk

AI can identify:

```text
Missing drawings
Missing specifications
Conflicting information
Unclear dimensions
Unresolved RFI
High-risk assumptions
```

AI must be an assistant.

The QS remains responsible for final quantity approval.

---

# 46. SYSTEM VALIDATION RULES

Implement validation such as:

### Drawing validation

```text
Cannot submit QTO if drawing is superseded.
```

### Quantity validation

```text
Quantity must be greater than or equal to zero.
```

### Unit validation

```text
m² measurement cannot be saved as m³.
```

### Formula validation

```text
Formula must produce a valid result.
```

### Revision validation

```text
Warn if QTO references an old drawing revision.
```

### Approval validation

```text
Prepared By cannot approve own QTO
```

where segregation of duties is required.

---

# 47. PERFORMANCE REQUIREMENTS

Tender drawings can be large.

Design for:

* Large DWG files
* Large PDF files
* Multiple drawings
* Thousands of QTO items
* Multiple concurrent QS users
* Fast search
* Fast filtering
* Autosave
* Measurement persistence

Do not load every project drawing at once.

Use:

* Lazy loading
* Pagination
* Caching
* Background processing
* File streaming
* Indexed database queries

---

# 48. SECURITY

Tender information is commercially sensitive.

Implement:

* Role-based access control
* Project-level permissions
* Tender-level permissions
* Document permissions
* Audit logs
* File access control
* Secure download
* Version control

Users must only see tenders/projects they are authorized to access.

---

# 49. DASHBOARD DESIGN

Design the main QTO dashboard like a QS manager's control room.

Example:

```text
┌─────────────────────────────────────────────────────────┐
│ TENDER QTO DASHBOARD                                    │
├───────────┬───────────┬───────────┬─────────────────────┤
│ QTO ITEMS │ MEASURED  │ CHECKED   │ APPROVED            │
│ 1,245     │ 1,080     │ 850       │ 780                 │
├───────────┴───────────┴───────────┴─────────────────────┤
│                                                         │
│ QTO PROGRESS BY BUILDING                                │
│                                                         │
│ BA Tower       ████████████████████ 90%                │
│ BB Podium      █████████████████░░░ 82%                │
│ BX External    ███████████░░░░░░░░ 60%                │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ RISKS                                                   │
│                                                         │
│ Missing Drawing       12                                │
│ RFI Pending            8                                │
│ Assumptions           15                                │
│ Revision Pending       4                                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

# 50. TECHNOLOGY ARCHITECTURE

Assume the DCOS platform uses:

### Frontend

* React
* TypeScript
* Vite or Next.js
* Modern component architecture

### Backend

* Node.js
* TypeScript
* REST API or suitable API architecture

### Database

* PostgreSQL

### File Storage

Use object storage for:

* DWG
* PDF
* Excel
* Supporting documents

Do NOT store large DWG/PDF binaries directly inside PostgreSQL.

Store metadata in PostgreSQL and files in object storage.

---

# 51. API DESIGN

Design API endpoints such as:

```text
GET    /api/tenders/:tenderId/qto
POST   /api/tenders/:tenderId/qto

GET    /api/qto/:qtoId
PUT    /api/qto/:qtoId
DELETE /api/qto/:qtoId

POST   /api/qto/:qtoId/measurements
POST   /api/qto/:qtoId/calculations
POST   /api/qto/:qtoId/deductions

POST   /api/qto/:qtoId/submit
POST   /api/qto/:qtoId/review
POST   /api/qto/:qtoId/approve

GET    /api/qto/:qtoId/revisions

GET    /api/tenders/:tenderId/qto-summary

POST   /api/qto/:qtoId/link-boq
```

Adjust endpoint design according to the final architecture.

---

# 52. DELIVERABLES REQUIRED FROM YOU

Do not only describe the system.

Produce the following design deliverables.

## A. System Architecture

Show:

```text
DCOS
 ↓
Tender
 ↓
Document
 ↓
Drawing
 ↓
QTO
 ↓
BOQ
 ↓
Cost Estimation
```

## B. User Journey

Show the complete QS workflow.

## C. Information Architecture

Show all QTO screens and navigation.

## D. UX/UI Design

Create high-quality UI layouts for:

1. QTO Dashboard
2. Document Register
3. Drawing Register
4. Drawing Review
5. QTO Workspace
6. QTO Register
7. Calculation Detail
8. Review
9. Approval
10. QTO Summary
11. BOQ Mapping
12. Revision History

## E. Database

Provide:

* ERD
* Tables
* Columns
* Data types
* Relationships
* Indexes
* Constraints

## F. API

Provide:

* Endpoints
* HTTP methods
* Request payload
* Response payload
* Validation
* Authorization

## G. Workflow

Provide:

* Status workflow
* Approval workflow
* Revision workflow
* RFI workflow
* BOQ transfer workflow

## H. Validation

Provide business rules and validation logic.

## I. Seed Data

Create realistic construction tender examples.

Use:

* Tower Building
* Podium Building
* External Works

Use realistic:

* Structural items
* Architectural items
* Civil items
* Concrete
* Reinforcement
* Formwork
* Blockwork
* Plaster
* Painting
* Waterproofing
* Excavation
* Backfill
* Drainage

---

# 53. SAMPLE QTO DATA

Use examples such as:

```text
QTO-000001
Building: BA Tower
Discipline: Structural
Work Section: Concrete
Element: Pile Cap

Description:
Reinforced concrete pile cap PC-01

Drawing:
S-203

Revision:
P03

Calculation:
2.40 × 2.40 × 0.80 × 12

Quantity:
55.296

Unit:
m³

Method:
Formula

Confidence:
High

Status:
Approved
```

Another:

```text
QTO-000002
Building: BA Tower
Discipline: Architectural
Work Section: Wall Finishes

Description:
Internal wall painting

Gross Area:
500.00 m²

Door Deduction:
35.00 m²

Window Deduction:
50.00 m²

Net Quantity:
415.00 m²

Drawing:
A-204 Rev P02

Method:
Area + Deduction
```

---

# 54. DESIGN PHILOSOPHY

The system must follow these principles:

### Principle 1 — Source Traceability

Every quantity must have a source.

### Principle 2 — Calculation Transparency

Never hide the calculation.

### Principle 3 — Revision Control

Never overwrite tender history.

### Principle 4 — Responsibility

Every quantity has a preparer and checker.

### Principle 5 — Auditability

Every important action is recorded.

### Principle 6 — Practical QS Workflow

The system must reduce QS workload rather than increase administration.

### Principle 7 — Multi-Building Support

Never assume a single building.

### Principle 8 — Future Integration

Prepare for:

```text
QTO → BOQ → Cost → Tender
```

and eventually:

```text
BIM → QTO → BOQ → Cost
```

### Principle 9 — Human Control

AI may assist but QS approval remains authoritative.

---

# 55. DO NOT DESIGN THESE IN V1

Avoid unnecessary complexity in the first implementation.

Do NOT make V1 dependent on:

* Revit
* BIM
* AI automatic quantity extraction
* Automatic DWG object recognition
* Advanced 5D BIM
* Automatic pricing
* Full procurement
* Construction progress measurement

V1 should solve one problem extremely well:

> **A QS receives DWG/PDF tender drawings and converts them into controlled, traceable, checked and approved quantities.**

---

# 56. V1 SUCCESS CRITERIA

The QTO V1 is successful if a QS can complete this workflow:

```text
1. Create Tender
       ↓
2. Upload Client DWG
       ↓
3. Register Drawing
       ↓
4. Register Revision
       ↓
5. Open Drawing
       ↓
6. Select Measurement Tool
       ↓
7. Measure
       ↓
8. Create QTO Item
       ↓
9. Enter Formula
       ↓
10. Add / Deduct
       ↓
11. Record Drawing Reference
       ↓
12. Save
       ↓
13. Self Check
       ↓
14. Submit for QS Review
       ↓
15. QS Manager Checks
       ↓
16. Approve
       ↓
17. Generate QTO Summary
       ↓
18. Transfer to BOQ
```

The complete process should be fast, traceable, auditable and suitable for real construction tendering.

---

# 57. FINAL REQUEST

Now act as the **Lead System Architect + QS Manager + UX Designer**.

Based on everything above, design the complete **DCOS Tender QTO Module**.

Do not give a generic software answer.

Think like a real QS team receiving tender DWG drawings from a Client.

Provide the result in this order:

1. Executive Overview
2. Real QS Tender Workflow
3. System Architecture
4. Module Structure
5. Information Architecture
6. User Roles & Permissions
7. Detailed User Journey
8. Screen-by-Screen UI Design
9. QTO Workspace Layout
10. DWG/PDF Handling Architecture
11. QTO Measurement Engine
12. Calculation Engine
13. Addition/Deduction Engine
14. Drawing Revision Control
15. QTO Review & Approval Workflow
16. QTO/RFI Integration
17. QTO Revision Management
18. QTO Dashboard
19. QTO Risk Management
20. QTO → BOQ Integration
21. Future QTO → Cost Estimation Integration
22. Database ERD
23. Database Schema
24. API Architecture
25. Business Rules
26. Validation Rules
27. Audit Trail
28. Security / RBAC
29. Excel / Report Export
30. Seed Data
31. V1 Development Scope
32. V2 / V3 Future Roadmap
33. Recommended Technical Architecture
34. Implementation Priorities

When presenting UI, use realistic construction terminology and realistic sample data.

The final design must be **production-oriented, scalable, auditable and suitable for a professional construction company QS/Tender department.**

Do not oversimplify the QTO process.

Do not treat QTO as a simple calculator.

Treat QTO as the **controlled measurement foundation of the Tender Costing system**.
