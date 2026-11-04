# DCOS Tender QTO Module — Master Design

**Module:** Quantity Surveying — Quantity Takeoff (Tender Stage)
**Reference:** `DCOS — Tender QTO Module.md` (master design prompt)
**Status:** Design for V1 implementation

---

## 1. Executive Overview

The QTO module converts tender drawings (DWG/PDF) received from the Client/Consultant
into **controlled, traceable, checked and approved quantities** that flow into the Tender BOQ.

QTO is **not a calculator**. It is a controlled measurement and audit system. Every quantity
must answer:

```text
WHAT?   WHERE?   FROM WHICH DRAWING?   WHICH REVISION?
HOW WAS IT MEASURED?   WHO MEASURED IT?   WHO CHECKED IT?
WHEN?   WHAT ASSUMPTIONS?   CURRENT STATUS?
```

V1 scope solves one problem extremely well:

> A QS receives DWG/PDF tender drawings and converts them into controlled, traceable,
> checked and approved quantities.

V1 does **not** include: Revit/BIM QTO, AI automatic quantity extraction, automatic DWG
object recognition, automatic pricing.

---

## 2. Real QS Tender Workflow

```text
Create Tender → Upload Client DWG/PDF → Register Drawing → Register Revision
→ Open Drawing → Select Measurement Tool → Measure → Create QTO Item
→ Enter Formula → Add / Deduct → Record Drawing Reference → Save
→ Self Check → Submit for QS Review → QS Manager Checks → Approve
→ Generate QTO Summary → Transfer to BOQ
```

### 2.1 Tender → QTO bridge

```text
CLIENT TENDER DOCUMENTS → DRAWINGS → QUANTITY TAKEOFF → BOQ → COST ESTIMATION → TENDER PRICE
```

### 2.2 Multi-building support

Projects may contain many buildings. QTO WBS:

```text
Project → Tender → Building → Discipline → Work Section → Element → QTO Item
```

Example:

```text
Project ABC → TND-2026-001 → BA Tower → Structural → Concrete Works → Foundation
→ Pile Cap → PC-01 → QTO Item
```

---

## 3. System Architecture

```text
DCOS → Tender → Document Register → Drawing Register → QTO Workspace
→ QTO Register → QTO Review → Approval → QTO Summary → BOQ Mapping → Tender BOQ
```

### 3.1 Feature placement in DCOS

- Route base: `/dashboard/tenders/qto/*` (inside the pre-contract / Tender & Estimate area).
- Module key for RBAC: `qto` (independent actions; reuses role model from `tender`/`qs`).
- Nav group registered in `lib/qs-nav.ts` under the **Tendering** group, visible only when
  the selected project is pre-contract (`isPrecontract`).

---

## 4. Module Structure

| Screen | Route | Purpose |
| --- | --- | --- |
| QTO Dashboard | `/dashboard/tenders/qto` | Progress, KPIs, risk register |
| Document Register | `/dashboard/tenders/qto/documents` | Tender document register |
| Drawing Register | `/dashboard/tenders/qto/drawings` | Drawings + revision control |
| QTO Workspace | `/dashboard/tenders/qto/workspace` | 3-panel measurement interface |
| QTO Register | `/dashboard/tenders/qto/register` | Table of all QTO items |
| QTO Item Detail | `/dashboard/tenders/qto/qto/[id]` | Calculation, add/deduct, assumptions |
| QTO Review | `/dashboard/tenders/qto/review` | Check / approve / reject |
| QTO Summary | `/dashboard/tenders/qto/summary` | Aggregated approved quantities |
| BOQ Mapping | `/dashboard/tenders/qto/boq-mapping` | Link QTO → `tender_boq_items` |
| Revision History | `/dashboard/tenders/qto/revisions` | Compare QTO revisions |

---

## 5. Information Architecture

QTO section navigation (header tabs):

```text
Dashboard | Documents | Drawings | QTO Workspace | QTO Register | Review | Summary | BOQ Mapping | Revisions
```

---

## 6. User Roles & Permissions

### Roles

| Role | Capabilities |
| --- | --- |
| QS / Estimator | View documents/drawings; create & edit own QTO; measure; formulas; add/deduct; assumptions; self-check; submit |
| Senior QS | Review QTO; check calculations; return/reject; approve when authorized; view all QS measurements |
| QS Manager / Tender Manager | View all QTO; assign packages; monitor progress; approve; lock approved quantities; generate summary; push to BOQ |
| Admin | Configure system, users, permissions, libraries |

### Permission actions (module `qto`)

| Action | Description |
| --- | --- |
| `qto_dashboard` | View QTO dashboard |
| `qto_documents` | Manage tender document register |
| `qto_drawings` | Manage drawing register + revisions |
| `qto_workspace` | Use QTO measurement workspace |
| `qto_register` | View/create/edit QTO items |
| `qto_review` | Review / return / reject QTO |
| `qto_approval` | Approve QTO and lock quantities |
| `qto_summary` | Generate QTO summary |
| `qto_boq_mapping` | Map QTO to BOQ items |
| `qto_export` | Export QTO reports / Excel |

### Role matrix (seed)

| Role | dashboard | documents | drawings | workspace | register | review | approval | summary | boq_mapping | export |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L0 / L1 / L2 | V | V,C,E,D | V,C,E,D | V,C,E | V,C,E,D | V,C,E | V,C,E | V,E | V,E | V,X |
| L3 | V | V,C,E | V,C,E | V,C,E | V,C,E | V,C,E | V | V | V | V,X |
| QS | V | V,C,E | V,C,E | V,C,E | V,C,E | V | V | V | V | V,X |
| AC | V | V | V | V | V | V | V | V | V | V,X |
| L4 / L5 | V | V | V | V | V | V | V | V | V | V |
| L6 | — | — | — | — | — | — | — | — | — | — |
| EXT-CLT / EXT-CON | V | V | V | V | V | V | V | V | V | V |

(`V` view, `C` can_create, `E` edit, `D` delete, `X` export. Matrix is seeded in the RBAC
migration; the admin Role & Permissions UI is the source of truth afterward.)

---

## 7. QTO Status Engine

```text
DRAFT → MEASURED → SELF CHECKED → SUBMITTED FOR CHECK → QS CHECKED → APPROVED → POSTED TO BOQ
```

Reject loop:

```text
QS CHECKED → REJECTED → REVISION REQUIRED → MEASURED
```

Status transitions and permitted actors:

| From | To | Actor |
| --- | --- | --- |
| DRAFT | MEASURED | Preparer (QS) |
| MEASURED | SELF CHECKED | Preparer (QS) |
| SELF CHECKED | SUBMITTED FOR CHECK | Preparer (QS) |
| SUBMITTED FOR CHECK | QS CHECKED | Reviewer (Senior QS) |
| QS CHECKED | APPROVED | Reviewer / QS Manager |
| QS CHECKED | REJECTED | Reviewer (must provide comment) |
| REJECTED | REVISION REQUIRED | Reviewer |
| APPROVED | POSTED TO BOQ | QS Manager / Tender Manager |
| APPROVED | (locked) | — |

Validation: a preparer **cannot** approve their own QTO (segregation of duties).
Approved QTO cannot be silently edited — editing creates a new revision.

---

## 8. QTO Workspace Layout (core screen)

```text
┌────────────────────────────────────────────────────────────────────┐
│ DCOS > Tender > QTO > BA > Structural > Concrete                   │
├────────────────┬──────────────────────────────────┬───────────────┤
│ DRAWING        │        DRAWING VIEWER            │ QTO PANEL     │
│ NAVIGATOR      │                                  │ QTO ID        │
│                │        PDF CANVAS                │ Description   │
│ BA Tower       │     + measurement overlay        │ Measurement   │
│  Structural    │                                  │ Calculation   │
│   S-101 P01    │  [Measure][Length][Area][Count]  │ Quantity      │
│   S-203 P03 ★  │                                  │ Unit          │
│   A-101 P03    │  [Pan][Zoom][Fit][Scale Calibr.] │ Source        │
│                │                                  │ Assumption    │
│                │                                  │ Status        │
└────────────────┴──────────────────────────────────┴───────────────┘
```

- Left: drawing navigator grouped by Building → Discipline, showing current revision.
- Center: PDF viewer with canvas/SVG measurement overlay.
- Right: QTO item panel (progressive disclosure — required fields first).

---

## 9. DWG / PDF Handling Architecture

### V1 decision

- **PDF** drawings are rendered in-app with `pdfjs-dist` and measured directly on a
  canvas overlay (length / area / count / polyline / perimeter).
- **DWG** files are preserved and stored in object storage (Supabase Storage). Browsers
  cannot render native DWG without a commercial service, so in V1 the QS opens the DWG
  externally and records measurements manually via the formula engine, referencing the
  drawing number/revision. The original DWG is never overwritten.
- Scale calibration: the QS sets a reference dimension (e.g. a known wall length) to
  convert canvas pixels to drawing units.

### Future

BIM/IFC QTO (already partially present via `bim_element_takeoff`) and commercial DWG
viewers can be plugged into the same `qto_measurements` engine without schema change.

---

## 10. QTO Measurement Engine

Measurement records (`qto_measurements`) capture:

```text
type: point | length | polyline | area | perimeter | count
points: JSON coordinates (relative to PDF page)
length: computed from calibrated scale
area: shoelace algorithm on closed polygon
count: 1 per click (items counted)
unit: m | m² | m³ | No. | kg | tonne
```

The measurement links to:

```text
drawing_id → drawing_revision_id → page_no → qto_item_id
```

---

## 11. Calculation Engine

Store the calculation logic, not just the result.

```text
Pile Cap PC-01: Length 2.40 × Width 2.40 × Depth 0.80 × Qty 12 = 55.296 m³
```

- `qto_calculations`: formula string (safe expression), result, method (formula | area |
  schedule | estimate).
- `qto_calculation_lines`: ordered input parameters (name, value, operator).
- Reopenable: users can reopen and edit the calculation; history preserved in `qto_revisions`.

---

## 12. Addition / Deduction Engine

```text
Gross wall area     +500.00 m²
Door openings        -35.00 m²
Window openings      -50.00 m²
-----------------------------
Net wall area        415.00 m²
```

- `qto_calculation_lines` stores each `+`/`-` line (description, sign, amount, linked
  measurement or deduction).
- Net quantity = sum of signed lines. Calculation history is never flattened.

---

## 13. Drawing Revision Control

```text
S-203 Rev P01 → S-203 Rev P02 → S-203 Rev P03   (each stored separately)
```

- `qto_drawing_register` holds the drawing; `qto_drawing_revisions` holds each revision
  file + status (`superseded` | `current` | `obsolete`).
- QTO items reference a specific revision.
- Warning: cannot submit a QTO that references a superseded revision.

---

## 14. QTO Review & Approval

Reviewer compares Drawing + Measurement + Calculation + Quantity + Unit + Assumption.

Actions: **Approve** | **Reject** (comment required) | **Return for revision** | **Add review note**.

- `qto_reviews`: reviewer, decision, comment, timestamp, before/after status.
- Approval locks the quantity; further edits create a new revision.

---

## 15. QTO / RFI Integration

When a QS cannot determine a quantity:

```text
QTO → Create Clarification / RFI → Client/Consultant Response → Update QTO
```

- `qto_clarifications` records the clarification, reason, related QTO, related drawing,
  risk level, status, and an optional link to the existing `design_rfi` table
  (`rfi_no`, `rfi_id`).
- A QTO with an open clarification is flagged `On Hold` at the UI layer.

---

## 16. QTO Revision Management

Approved QTO is never overwritten:

```text
QTO-000821 Rev 01  Qty 55.296 m³  Approved
QTO-000821 Rev 02  Qty 61.450 m³  Draft   (after new drawing revision)
```

- `qto_revisions` stores full history; the QTO register shows the current revision and
  links to prior ones.

---

## 17. QTO Dashboard

Manager control room:

```text
KPI cards: Total QTO | Measured | Checked | Approved
Progress by building / discipline (bars)
Risk register (missing drawing, pending RFI, assumptions, revision pending)
```
Color is never the only signal — text/status always shown.

---

## 18. Risk Management

Track: missing drawing · unclear information · pending RFI · provisional quantity ·
assumption · superseded drawing · unverified quantity · revision pending.

Confidence per QTO item: `HIGH | MEDIUM | LOW | PROVISIONAL`.

---

## 19. QTO → BOQ Integration

- Multiple approved QTO items roll up into one `tender_boq_items` row.
- `qto_boq_links` stores the mapping (qto_item_id ↔ boq_item_id, contribution quantity).
- Traceability: BOQ quantity → QTO items → calculations → drawings.

---

## 20. Future QTO → Cost Estimation

Prepared for (not built in V1):

```text
QTO → BOQ → Material → Labour → Equipment → Productivity → Rate → Direct Cost
→ Overhead → Profit → Tender Price
```

---

## 21. Business Rules

1. Source traceability — every quantity must have a drawing/calculation source.
2. Calculation transparency — never hide the calculation.
3. Revision control — never overwrite tender history.
4. Responsibility — every quantity has preparer and checker.
5. Auditability — every important action is logged.
6. Practical workflow — reduce QS workload, not increase it.
7. Multi-building support.
8. Future integration (QTO → BOQ → Cost → Tender, BIM → QTO).
9. Human control — AI may assist, QS approval is authoritative.

---

## 22. Validation Rules

| Area | Rule |
| --- | --- |
| Drawing | Cannot submit QTO if drawing revision is superseded |
| Quantity | Quantity must be >= 0 |
| Unit | Measurement unit must match quantity unit family (length/area/volume/count) |
| Formula | Formula must produce a valid finite result |
| Revision | Warn if QTO references an old drawing revision |
| Approval | Preparer cannot approve own QTO |

---

## 23. Audit Trail

Track: created · edited · submitted · checked · rejected · approved · revised · posted to BOQ.

Store: user, timestamp, action, previous value, new value, comment (`qto_audit_log`,
mirroring the `qs_audit_log` trigger pattern).

---

## 24. Security / RBAC

- Role-based access control via `role_permissions` (module `qto`).
- Project/tender-level scoping: all queries filter by `selectedProjectId` / tender id.
- Files in Supabase Storage with bucket-level access; original DWG/PDF preserved.
- Approved QTO protected from silent modification.

---

## 25. Reports / Excel Export

Export (xlsx, using the existing `xlsx` library):
QTO register · detailed QTO · QTO summary · BOQ transfer · revision comparison ·
assumption register · risk register · drawing coverage.

---

## 26. Seed Data

Realistic tower / podium / external works example (see `seed_qto_data.sql`):

| QTO ID | Building | Discipline | Work Section | Element | Description | Qty | Unit | Drawing | Rev |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QTO-000001 | BA Tower | Structural | Concrete Works | Pile Cap | RC pile cap PC-01 | 55.296 | m³ | S-203 | P03 |
| QTO-000002 | BA Tower | Architectural | Wall Finishes | Painting | Internal wall painting | 415.00 | m² | A-204 | P02 |
| QTO-000003 | BB Podium | Structural | Concrete Works | Column | Column concrete C-01 | 32.400 | m³ | S-301 | P02 |

---

## 27. V1 Development Scope

In scope: tender document register, drawing register + revision control, PDF viewer +
canvas measurement, QTO items, calculation + add/deduct engine, assumptions, review &
approval, revision history, summary, BOQ mapping, audit, RBAC, Excel export.

Out of scope (V1): BIM/IFC as primary workflow, AI quantity extraction, DWG native
rendering, automatic pricing.

## 28. V2 / V3 Roadmap

- **V2**: DWG native rendering (commercial viewer), BIM quantity import into the same
  engine, AI drawing intelligence (number/revision/title extraction), AI QTO validation.
- **V3**: QTO → cost estimation pipeline, AI tender risk scoring, 5D links.

---

## 29. Recommended Technical Architecture

- Frontend: Next.js App Router, TypeScript, Tailwind + shadcn/ui, `pdfjs-dist`,
  `lucide-react`, `xlsx`, TanStack Table.
- Backend: direct Supabase (PostgreSQL + Storage) via a typed service layer
  (`lib/qto-service.ts`), consistent with existing QS/Tender modules.
- Storage: DWG/PDF in Supabase Storage; metadata in PostgreSQL.

---

## 30. Implementation Priorities

1. DB schema + RBAC seed (foundation).
2. Service layer + nav wiring.
3. QTO Register + Item detail (calculation engine).
4. Drawing register + Document register.
5. PDF viewer + measurement canvas + workspace.
6. Review/approval + status engine.
7. Summary + BOQ mapping.
8. Reports/export + audit.
9. Typecheck / lint / build gate.
