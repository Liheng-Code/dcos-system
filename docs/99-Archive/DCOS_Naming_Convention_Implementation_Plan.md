# DCOS Naming Convention — Implementation Plan

**Reference**: DCOS-NCS-001 R1.0 — Standard Naming Convention  
**Status**: Draft for review  
**Design Principle**: Pure additive feature. Existing manual code entry untouched. The naming convention is a **template** that new projects can optionally adopt.

---

## Table of Contents

1. [Design Decisions](#1-design-decisions)
2. [Phase 0 — Convention Configuration Admin](#2-phase-0--convention-configuration-admin)
3. [Phase 1 — Project Code Template](#3-phase-1--project-code-template)
4. [Phase 2 — WBS Code Structure Template](#4-phase-2--wbs-code-structure-template)
5. [Phase 3 — Document Naming Template](#5-phase-3--document-naming-template)
6. [Phase 4 — Budget Package Integration](#6-phase-4--budget-package-integration)
7. [Phase 5 — Transmittal System](#7-phase-5--transmittal-system)
8. [New Database Tables](#8-new-database-tables)
9. [New Frontend Components](#9-new-frontend-components)

---

## 1. Design Decisions

| # | Decision | Implementation |
|---|----------|----------------|
| 1 | **Discipline codes** | Unified DB table with ALL codes from both convention doc + existing frontend constants. Project-level active subset via `project_numbering_rules.discipline_codes` |
| 2 | **WBS task code format** | `[Building]-[LevelCode]-[Discipline]-[NNN]` (e.g. `BA-G00-ARC-001`). Configurable format stored in project settings |
| 3 | **Auto vs manual** | Hybrid — auto-generate by default, toggleable override per field. Manual entry validates against format regex + uniqueness |
| 4 | **Company code format** | 4 uppercase letters, enforced in `companies.code` column + UI validation |
| 5 | **Priority** | TBD — Phase 0 (admin config) must come first architecturally since Phases 1–5 depend on reference data |
| 6 | **UX/UI** | All new components are additive — side-by-side panels, toggle sections, or new pages |
| 7 | **Existing code** | Zero modifications to existing components. Every new feature is a new file/component. Existing wizard steps keep their manual flow alongside the new toggle |

---

## 2. Phase 0 — Convention Configuration Admin

**Purpose**: Seed and manage the master reference data that all project templates draw from.

**Location**: `/dashboard/settings/naming-convention` (new settings section)

### 2.1 · Discipline Codes Manager

- Table of all discipline codes from both convention doc and existing frontend:

| Source | Codes |
|--------|-------|
| Convention doc (Section 6.2) | ARC, STR, MEC, ELE, PLB, FFG, CIV, BIM |
| Existing frontend constants | ARC, STR, MEP, CVL, GEO, QS, HSE, QA, PRC, GEN |

- Merged into a unified `discipline_codes` DB table
- Each code has an `active` flag
- Projects select their active subset via `project_numbering_rules.discipline_codes` (JSONB array)

**UI**: CRUD table with inline edit, search, toggle active/inactive.

### 2.2 · Company Abbreviation Editor

- Inline edit on `companies.code` column
- Enforced to 4 uppercase letters
- Validation: A–Z only, exactly 4 chars, unique

**UI**: Company list table with editable code column.

### 2.3 · Stakeholder Abbreviation Editor

- New `stakeholder_abbreviations` table
- Each stakeholder (from `stakeholders` table) gets a 3–4 letter code
- Used for transmittal issuer/receiver segments

**UI**: Stakeholder list with editable abbreviation column.

### 2.4 · Document Type Sync Tool

- Button to sync `document_types` seed data to match Section 7 of the convention
- Shows diff preview: what will be added, what differs
- Section 7 codes to add (not currently in DB seeds):

| Code | Document Name | Category |
|------|---------------|----------|
| MCL | Main Contractor Letter | Site |
| CL | Client Letter | Site |
| AFI | Available for Inspection | Site |
| ITP | Inspection & Test Plan | Site |
| DR | Daily Report | Site |
| WR | Weekly Report | Site |
| MR | Monthly Report | Site |
| SCH | Schedule | Site |
| MSRA | Method Statement — Request for Approval | Site |
| MRA | Material Request for Approval | Site |
| NOD | Notice of Delay | Site |
| NOC | Notice of Claim | Site |
| CVI | Confirmation of Verbal Instruction | Site |
| AI | Architect Instruction | Site |
| NPCC | Notice of Potential Contra Charge | Site |
| IPC | Interim Payment Certificate | Commercial |
| BQ | Bill of Quantities | Commercial |
| PR | Purchase Requisition | Commercial |
| PO | Purchase Order | Commercial |
| INV | Invoice | Commercial |
| PAY | Payment Certificate | Commercial |
| FA | Final Account | Commercial |
| RET | Retention Statement | Commercial |
| EOI | Expression of Interest | Procurement |
| PQ | Prequalification | Procurement |
| TDP | Tender Package | Procurement |
| TDO | Tender Opening | Procurement |
| TDI | Tender Interview | Procurement |
| SV | Site Visit | Procurement |
| TER | Tender Evaluation Report | Procurement |
| TDA | Tender Committee Approval | Procurement |
| SCA | Subcontract Agreement | Procurement |
| MSA | Master Service Agreement | Procurement |
| KOMI | Kickoff Meeting — Internal | Procurement |
| KOMX | Kickoff Meeting — External | Procurement |

### 2.5 · Budget Package Sections Editor

- Tree view of groups A–F with all sections per the convention
- Each section editable: add, rename, reorder
- Seeded from convention doc Section 8

| Group | Sections |
|-------|----------|
| A — Early Works | A.1–A.9 |
| B — Sub-Structure | B.1–B.4 |
| C — Architecture External | C.1–C.11 |
| D — Interior Finishes | D.1–D.3 |
| E — Fittings & Equipment | E.1–E.8 |
| F — Building Services (MEP) | F.1–F.12 |

### 2.6 · Reference Table Viewers (Read-Only)

- **Level Type Prefixes**: B, G, L, M, R, PH, ZZ, XX (convention-defined, read-only)
- **Zone Type Codes**: DZone1–4, CZone1–3, DAll, CAll, DZZ, DXX (convention-defined, read-only)

---

## 3. Phase 1 — Project Code Template

**Purpose**: Auto-generate `P[NNN]-[ShortName]` during project creation with hybrid override.

### 3.1 · UX — Wizard Step 1 (Basic Info)

Add a toggle at the top of Step 1:

```
Use Naming Convention Template: [ON / OFF]

When ON:
  ┌─ Project Code ──────────────────────────────────────────┐
  │  P[003]-[HTBT  ]                                         │
  │   ↑ auto     ↑ auto-suggested from project name          │
  │              (max 6 chars, uppercase, no spaces)         │
  │                                                          │
  │  ⚡ Auto-generated from sequence counter                  │
  │  ✏ Override [ ]  → manual entry with format validation   │
  └──────────────────────────────────────────────────────────┘

When OFF:
  [Existing manual fields — no change]
```

### 3.2 · Auto-Generation Logic

1. Sequence counter reads `project_code_sequences` table for prefix `P`
2. Next value: `P003` (zero-padded, 3 digits)
3. Short name: auto-suggested from project name (first 6 uppercase chars, strip spaces/symbols)
4. User can edit short name (max 6 chars, uppercase only, no spaces)
5. Full code: `P003-HTBT`
6. On save: sequence incremented, code written to `projects.project_code`

### 3.3 · Override Rules

- User toggles "Override" to enter custom project_code
- Validation regex: `^P\d{3}-[A-Z0-9]{1,6}$`
- Uniqueness check against existing `projects.project_code`
- Short name still required for WBS/document generation

### 3.4 · New DB Table

```sql
CREATE TABLE project_code_sequences (
  prefix text PRIMARY KEY,          -- 'P'
  last_sequence integer NOT NULL,   -- last assigned number
  CONSTRAINT last_sequence_positive CHECK (last_sequence >= 0)
);
```

### 3.5 · New Component

**`naming-project-code-gen.tsx`** — Drop-in replacement section for Step 1 when template is ON. Handles sequence reading, short-name suggestion, override toggle, and validation.

---

## 4. Phase 2 — WBS Code Structure Template

**Purpose**: When creating WBS from the "Building Construction" template, codes auto-generate following the convention hierarchy.

### 4.1 · UX — WBS Template Configuration (Wizard Step 6)

When "Use Naming Convention Template" is ON and WBS method is "Use Template":

```
┌─ Building Setup ───────────────────────────────────────────┐
│ Building Code: [ BA ▼ ]                                    │
│                BA  Building A — Primary Tower               │
│                BB  Building B — Secondary Structure         │
│                BC  Building C — Podium / Retail             │
│                ...                                         │
│                BX  External Works (reserved)                │
│                BY  Landscape (reserved)                     │
│                BZ  Permanent Boundary (reserved)            │
│                                                             │
│ Building Name: [Tower]                                     │
│                                                             │
│ ▼ Level Configuration                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Basements:  [3]  → BA-01-B03, BA-02-B02, BA-03-B01     │ │
│ │ Ground:     [1]  → BA-04-G00                            │ │
│ │ Upper Lvls: [30] → BA-05-L01 ... BA-34-L30              │ │
│ │ Penthouses: [1]  → BA-35-PH01                           │ │
│ │ Roof:       [1]  → BA-36-R00                            │ │
│ │                                                         │ │
│ │ Sequence auto-numbered from lowest physical → highest   │ │
│ │                                                         │ │
│ │ ⚡ Preview: BA-01-B03, BA-02-B02, ..., BA-36-R00        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ▼ Zone Setup                                                │
│ Design Zones:                                               │
│ [☑ DZone1 Wet/Service] [☑ DZone2 Core/Circulation]         │
│ [☑ DZone3 Primary Func A] [☐ DZone4 Primary Func B]        │
│ [☑ DAll]                                                   │
│                                                             │
│ Construction Zones:                                         │
│ [☑ CZone1] [☑ CZone2] [☐ CZone3] [☑ CAll]                 │
│                                                             │
│ ▼ Room Numbering                                            │
│ Start Room No.: [001]                                       │
│ Pattern: [Building].[Seq].[Level]-R[NNN]                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 · Auto-Generation Rules

| Node Type | wbs_code Format | Example |
|-----------|----------------|---------|
| Building | `[Building Code]` | `BA` |
| Level | `[Building]-[Seq]-[LevelType][No]` | `BA-04-G00` |
| Zone | `[Full Level Code]-[Zone Code]` | `BA-04-G00-DZone1` |
| Room | `[Building].[Seq].[Level]-R[NNN]` | `BA.04.G00-R001` |
| Task | `[Building]-[LevelCode]-[Discipline]-[NNN]` | `BA-G00-ARC-001` |

### 4.3 · New Components

| Component | Purpose |
|-----------|---------|
| `naming-wbs-building-config.tsx` | Building code selector with reserved codes highlighted |
| `naming-wbs-level-config.tsx` | Level generator — basement/ground/upper/penthouse/roof count inputs, auto-sequence |
| `naming-wbs-zone-config.tsx` | Zone type checkboxes (Design + Construction) |
| `naming-wbs-room-numbering.tsx` | Room numbering start and pattern |
| `naming-wbs-code-preview.tsx` | Live preview of generated WBS hierarchy |

### 4.4 · New DB Tables / Seed Data

- `building_codes` reference table (BA–BZ, skip I,O, reserved BX/BY/BZ flags)
- `level_type_prefixes` reference table (B, G, L, M, R, PH, ZZ, XX)
- `zone_type_codes` reference table (DZone1–4, DAll, DZZ, DXX, CZone1–3, CAll)

### 4.5 · WBS Task Code Format

```
[Building]-[LevelCode]-[Discipline]-[NNN]
Example: BA-G00-ARC-001

- Building: BA (from building_codes table)
- LevelCode: G00 (from level hierarchy)
- Discipline: ARC (from discipline_codes table)
- NNN: 3-digit zero-padded sequence (auto-increments per building+level+discipline)
```

Alternative (room-level precision):
```
[Room Ref]-[Discipline]-[NNN]
Example: BA.04.G00-R001-ARC-001
```

---

## 5. Phase 3 — Document Naming Template

**Purpose**: Auto-generate `document_number` from the project's format mask when creating documents.

### 5.1 · UX — Project Numbering Rules (Wizard Step 7)

Previously static; now functional when template is ON:

```
┌─ Project Numbering Rules ──────────────────────────────────┐
│ Format Mask:                                                │
│ [PROJECT]-[COMPANY]-[DISC]-[BUILDING]-[LEVEL]-[NNN]-[REV]  │
│                                                             │
│ (Drag-and-drop segments to reorder)                         │
│                                                             │
│ Active Discipline Codes:                                    │
│ [☑ ARC] [☑ STR] [☑ MEC] [☑ ELE] [☑ PLB] [☑ FFG]          │
│ [☑ CIV] [☑ BIM] [☑ QS] [☐ HSE] [☐ QA] [☐ GEN]             │
│ [☐ PRC]                                                     │
│                                                             │
│ Active Document Types:                                      │
│ [☑ RFI] [☑ NCR] [☑ MOM] [☑ IPC] [☑ VO] ... (from Section 7)│
│                                                             │
│ Revision Format: [R00 ▼] / [Rev.N ▼]                        │
│                                                             │
│ Running Number Scope:                                       │
│ [○ Per project] [● Per discipline] [○ Per doc type]         │
│                                                             │
│ ⚡ Preview: P001-HTBT-CMED-ARC-BA-G00-001-R00              │
│                                                             │
│ [Save to project_numbering_rules]                           │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 · UX — Document Creation

```
Existing document creation (unchanged):     New template-assisted:
┌─ Document Number: [______________] ──────┐  ┌─ Document Number ─────────────────┐
│  (manual entry, placeholder shows         │  │ ⚡ P001-HTBT-CMED-ARC-BA-G00-    │
│   e.g. "P001-STR-DWG-001")              │  │                        001-R00   │
└──────────────────────────────────────────┘  │          ↑ auto from project +    │
                                              │            wbs path + sequence    │
                                              │                                    │
                                              │ Discipline: [ARC ▼]               │
                                              │ Building:   [BA ▼]                │
                                              │ Level:      [G00 ▼]               │
                                              │ Doc Type:   [DWG ▼]               │
                                              │                                    │
                                              │ Override [ ]  (validates against  │
                                              │   project format mask)            │
                                              └────────────────────────────────────┘
```

### 5.3 · New DB Writes

- `project_numbering_rules` table gets populated on wizard Step 7 save (currently this table exists but is never written to)
- Running number counters stored in `document_running_numbers` table per project+discipline+doctype

### 5.4 · New Components

| Component | Purpose |
|-----------|---------|
| `naming-numbering-rules.tsx` | Functional Step 7 — format mask builder, discipline/doctype selectors |
| `naming-document-create.tsx` | Document creation with auto-numbering, discipline/building/level dropdowns |
| `naming-document-number-preview.tsx` | Live preview of the generated document number |

---

## 6. Phase 4 — Budget Package Integration

**Purpose**: Link budget setup to convention groups A–F, auto-generate codes for PR/PO/VO.

### 6.1 · UX — Budget Setup (Wizard Step 9)

Previously static; now functional when template is ON:

```
┌─ Budget Package Setup ─────────────────────────────────────┐
│ Contract Value: [1,234,567]                                 │
│ Contingency: [5]%                                          │
│                                                             │
│ ▼ Package Sections (select all that apply)                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Group A — Early Works                                   │ │
│ │   [☑] A.1  Topography Survey                           │ │
│ │   [☑] A.2  Soil Investigation                          │ │
│ │   [☑] A.3  Mine / UXO Clearance                        │ │
│ │   [☑] A.4  Soil Leveling                               │ │
│ │   ...                                                   │ │
│ │ Group B — Sub-Structure                                 │ │
│ │   [☑] B.1  Foundation / Piling                         │ │
│ │   [☑] B.2  Basement                                    │ │
│ │   ...                                                   │ │
│ │ Group F — Building Services (MEP)                       │ │
│ │   [☑] F.1  Sanitary Installations                      │ │
│ │   [☑] F.2  Air Conditioning System                     │ │
│ │   ...                                                   │ │
│ │   [☑] F.12 Lightning Protection                        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Cost Code Template: [B.1.01-XX ▼] (auto from selected)      │
│                                                             │
│ [Save to project_budget_settings]                           │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 · Auto-Generation Rules for PR/PO/VO

```
PR:  [Project]-[Company]-[Budget Section]-[Package No.]-[PR.NNN]-[REV]-[CIRC]
PO:  [Project]-[Company]-[Budget Section]-[Package No.]-[PO.NNN]-[REV]-[CIRC]
VO:  [Project]-[Company]-[Budget Section]-[VO.NNN]-[REV]-[CIRC]

Example:
  P001-HTBT-CMED-B.1.01-18.PR.001-R00-INT01
  P001-HTBT-CMED-B.1.01-26.PO.001-R00-INT01
```

### 6.3 · New Components

| Component | Purpose |
|-----------|---------|
| `naming-budget-packages.tsx` | Wizard Step 9 — section selector tree view with select-all toggle |

---

## 7. Phase 5 — Transmittal System

**Purpose**: New transmittal feature with auto-generated codes and document routing.

### 7.1 · UX — Transmittal Creation

```
Documents Page → New Transmittal button:

┌─ Create Transmittal ────────────────────────────────────────┐
│ Transmittal Code:  P001-HTBT-DT-CMED-GGD-005               │
│                    ↑ auto     ↑fixed  ↑auto  ↑auto  ↑auto  │
│                    project           issuer rcver  seq      │
│                                                             │
│ Issuing Company:  [CMED ▼]   (from companies table)         │
│ Receiving Party:  [GGD  ▼]   (from stakeholder_abbreviations)│
│                                                             │
│ ▼ Attached Documents                                       │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ☑ P001-HTBT-CMED-ARC-BA-G00-001-R02  (Arch Gnd Fl)   │ │
│ │ ☑ P001-HTBT-CMED-STR-BA-B01-003-R00  (Str Bsmt 1)    │ │
│ │ ☐ P001-HTBT-CMED-MEC-BA-L05-007-R01  (Mech Lvl 5)    │ │
│ │ + Add Document                                          │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                             │
│ Subject: [Transmittal of Architectural & Structural drgs]   │
│                                                             │
│ [ Send ] [ Save as Draft ]                                   │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 · Transmittal Code Format

```
[Project Code]-DT-[Issuer Abbr]-[Receiver Abbr]-[NNN]

Segments:
- Project Code: P001-HTBT (from projects.project_code)
- DT: Fixed prefix "Document Transmittal"
- Issuer Abbr: 4-letter company code (from companies.code)
- Receiver Abbr: 3-4 letter stakeholder abbreviation
- NNN: 3-digit zero-padded sequential (per project)

Example: P001-HTBT-DT-CMED-GGD-005
```

### 7.3 · New DB Tables

```sql
CREATE TABLE transmittals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  transmittal_code text NOT NULL,
  issuer_company_id uuid NOT NULL REFERENCES companies(id),
  receiver_stakeholder_id uuid NOT NULL REFERENCES stakeholders(id),
  subject text,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, transmittal_code)
);

CREATE TABLE transmittal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transmittal_id uuid NOT NULL REFERENCES transmittals(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id),
  UNIQUE(transmittal_id, document_id)
);
```

### 7.4 · New Pages/Components

| Component | Purpose |
|-----------|---------|
| `naming-transmittal-create.tsx` | Transmittal creation form |
| `naming-transmittal-list.tsx` | Transmittal inbox/outbox list |
| `naming-transmittal-detail.tsx` | Transmittal detail view |

**Page location**: `/dashboard/documents/transmittals`

---

## 8. New Database Tables

| Table | Phase | Purpose |
|-------|-------|---------|
| `discipline_codes` | 0 | Unified discipline reference (ARC, STR, MEC, ELE, PLB, FFG, CIV, BIM, MEP, CVL, GEO, QS, HSE, QA, PRC, GEN) |
| `stakeholder_abbreviations` | 0 | Short 3–4 letter codes for transmittal routing |
| `budget_package_sections` | 0 | Groups A–F with all sections, editable |
| `building_codes` | 2 | BA–BZ with reserved flags (skip I,O) |
| `level_type_prefixes` | 2 | B, G, L, M, R, PH, ZZ, XX (read-only) |
| `zone_type_codes` | 2 | DZone1–4, DAll, DZZ, DXX, CZone1–3, CAll (read-only) |
| `project_code_sequences` | 1 | Auto-increment counter for P[NNN] |
| `wbs_running_numbers` | 2 | Per-project counters for WBS task sequences |
| `document_running_numbers` | 3 | Per-project+discipline+doctype counters |
| `transmittals` | 5 | Transmittal records |
| `transmittal_documents` | 5 | Junction: transmittal ↔ documents |

---

## 9. New Frontend Components

| Component | Phase | Location |
|-----------|-------|----------|
| `naming-convention-admin-page.tsx` | 0 | `/dashboard/settings/naming-convention` |
| `naming-discipline-codes.tsx` | 0 | Sub-component of admin page |
| `naming-company-abbreviations.tsx` | 0 | Sub-component of admin page |
| `naming-stakeholder-abbreviations.tsx` | 0 | Sub-component of admin page |
| `naming-document-types-sync.tsx` | 0 | Sub-component of admin page |
| `naming-budget-sections-editor.tsx` | 0 | Sub-component of admin page |
| `naming-project-code-gen.tsx` | 1 | Wizard Step 1 toggle section |
| `naming-wbs-building-config.tsx` | 2 | Wizard Step 6 sub-component |
| `naming-wbs-level-config.tsx` | 2 | Wizard Step 6 sub-component |
| `naming-wbs-zone-config.tsx` | 2 | Wizard Step 6 sub-component |
| `naming-wbs-room-numbering.tsx` | 2 | Wizard Step 6 sub-component |
| `naming-wbs-code-preview.tsx` | 2 | Wizard Step 6 live preview |
| `naming-numbering-rules.tsx` | 3 | Wizard Step 7 (functional version) |
| `naming-document-create.tsx` | 3 | Document creation with auto-gen |
| `naming-document-number-preview.tsx` | 3 | Sub-component of document create |
| `naming-budget-packages.tsx` | 4 | Wizard Step 9 (functional version) |
| `naming-transmittal-create.tsx` | 5 | Transmittal creation form |
| `naming-transmittal-list.tsx` | 5 | Transmittal list page |
| `naming-transmittal-detail.tsx` | 5 | Transmittal detail view |

---

*End of plan — DCOS-NCS-001 Implementation*
