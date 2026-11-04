# DCOS Tender QTO Module — Database Schema

Companion to `11-QTO-Module-Design.md`. Defines the V1 relational schema for the QTO
module. All tables live in `public`, use `uuid` primary keys, timestamps with
`timestamptz`, and standard audit columns (`created_at`, `updated_at`, `created_by`).

Convention: RLS enabled on every table with `authenticated` policies, consistent with
the rest of DCOS.

---

## 1. ERD

```text
tender_register
      │
      ├──< qto_document_register
      │
      ├──< qto_drawing_register ──< qto_drawing_revisions
      │            │                        │
      │            └───────────┬────────────┘
      │                        │
      ├──< qto_packages        │
      │                        │
      ├──< qto_items ──────────┘            design_rfi
      │      │  │  │  │                       │
      │      │  │  │  └──< qto_reviews        │
      │      │  │  │                          │
      │      │  │  ├──< qto_calculations ──< qto_calculation_lines
      │      │  │  │
      │      │  │  ├──< qto_measurements
      │      │  │  ├──< qto_assumptions
      │      │  │  ├──< qto_clarifications ────> design_rfi (rfi_id)
      │      │  │  └──< qto_revisions
      │      │  │
      │      │  └──< qto_boq_links >── tender_boq_items
      │      │
      └──────┴──< qto_audit_log
```

---

## 2. Table Definitions

### 2.1 `qto_document_register`

Tender document register (specifications, BOQ, addenda, clarifications, instructions).

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | default gen_random_uuid() |
| tender_id | uuid FK → tender_register(id) | |
| document_no | text NOT NULL | |
| title | text NOT NULL | |
| document_type | text NOT NULL | dwg, pdf, xlsx, docx, specification, boq, tender_instruction, addendum, clarification, other |
| discipline | text | ARC, STR, CIV, MEP, GEN |
| building | text | e.g. BA, BB, BX |
| revision | text | |
| issue_date | date | |
| received_date | date | |
| source | text | Client, Consultant, Internal |
| file_path | text | Supabase Storage path |
| file_type | text | |
| file_version | text | |
| status | text NOT NULL default 'received' | received, registered, superseded, archived |
| remarks | text | |
| created_by | uuid → auth.users | |
| created_at | timestamptz default now() | |
| updated_at | timestamptz default now() | |

Indexes: `tender_id`, `document_type`, `discipline`, `building`, `document_no`.

### 2.2 `qto_drawing_register`

Drawing master record.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| tender_id | uuid FK → tender_register(id) | |
| drawing_no | text NOT NULL | e.g. S-203 |
| title | text NOT NULL | |
| discipline | text | |
| building | text | |
| drawing_type | text | layout, detail, schedule, elevation, section |
| status | text default 'registered' | registered, current, superseded, archived |
| related_document_id | uuid FK → qto_document_register(id) | |
| current_revision_id | uuid FK → qto_drawing_revisions(id) | maintained by trigger |
| uploaded_by | uuid | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| remarks | text | |

Unique: `(tender_id, drawing_no)`.

### 2.3 `qto_drawing_revisions`

One row per revision — historical revisions are never overwritten.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| drawing_id | uuid FK → qto_drawing_register(id) ON DELETE CASCADE | |
| revision | text NOT NULL | P01, P02, ... |
| revision_date | date | |
| status | text NOT NULL default 'current' | current, superseded, obsolete |
| file_path | text | Storage path (DWG/PDF) |
| file_type | text | dwg, pdf |
| pdf_path | text | optional converted PDF for viewing |
| scale | text | e.g. 1:100 |
| units | text default 'mm' | drawing units |
| supersedes_revision_id | uuid FK self | |
| uploaded_by | uuid | |
| created_at | timestamptz | |
| remarks | text | |

Unique: `(drawing_id, revision)`.

### 2.4 `qto_packages`

Assignable QTO scope packages (building/discipline/work section) for QS allocation and
progress tracking.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| tender_id | uuid FK → tender_register(id) | |
| building | text | |
| discipline | text | |
| work_section | text | |
| package_code | text | |
| assigned_to | uuid → auth.users | |
| status | text default 'not_started' | not_started, in_progress, self_checked, submitted, approved |
| progress_pct | numeric default 0 | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 2.5 `qto_items`

The central QTO entity. Status workflow per design doc §7.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| tender_id | uuid FK → tender_register(id) | |
| qto_no | text NOT NULL | e.g. QTO-000821 (running number) |
| building | text | |
| discipline | text | |
| work_section | text | |
| element | text | |
| item_code | text | e.g. PC-01 |
| description | text NOT NULL | |
| unit | text NOT NULL | m, m², m³, No., kg, tonne |
| quantity | numeric | net computed quantity |
| measurement_method | text | formula, area, schedule, estimate, count |
| source_type | text default 'D1' | D1,S1,F1,A1,B1,H1,P1,E1 |
| confidence | text default 'MEDIUM' | HIGH, MEDIUM, LOW, PROVISIONAL |
| drawing_id | uuid FK → qto_drawing_register(id) | primary source drawing |
| drawing_revision_id | uuid FK → qto_drawing_revisions(id) | primary source revision |
| page_no | int | PDF page |
| grid_location | text | |
| detail_ref | text | |
| specification_ref | text | |
| status | text default 'DRAFT' | DRAFT, MEASURED, SELF CHECKED, SUBMITTED FOR CHECK, QS CHECKED, APPROVED, REJECTED, POSTED TO BOQ |
| revision_no | int default 1 | QTO item revision counter |
| is_locked | boolean default false | true when approved/posted |
| assumption | text | |
| prepared_by | uuid | |
| prepared_date | timestamptz | |
| checked_by | uuid | |
| checked_date | timestamptz | |
| approved_by | uuid | |
| approved_date | timestamptz | |
| remarks | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Indexes: `tender_id`, `drawing_id`, `drawing_revision_id`, `status`, `qto_no`,
`(building, discipline)`.

### 2.6 `qto_calculations`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| qto_item_id | uuid FK → qto_items(id) ON DELETE CASCADE | |
| formula | text NOT NULL | safe expression, e.g. `2.40*2.40*0.80*12` |
| result | numeric | |
| method | text default 'formula' | formula, area, schedule, estimate |
| display_text | text | human-readable calculation, e.g. `2.40 × 2.40 × 0.80 × 12` |
| created_by | uuid | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 2.7 `qto_calculation_lines`

Ordered add/deduct/dimension lines.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| calculation_id | uuid FK → qto_calculations(id) ON DELETE CASCADE | |
| seq | int NOT NULL | ordering |
| sign | text NOT NULL default '+' | + or - |
| description | text | |
| amount | numeric | |
| unit | text | |
| measurement_id | uuid FK → qto_measurements(id) | nullable link |
| source | text | dimension/input/opening/deduction |

### 2.8 `qto_measurements`

Canvas measurement records captured in the workspace.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| qto_item_id | uuid FK → qto_items(id) ON DELETE CASCADE | |
| drawing_revision_id | uuid FK → qto_drawing_revisions(id) | |
| drawing_id | uuid FK → qto_drawing_register(id) | |
| page_no | int | |
| measure_type | text NOT NULL | point, length, polyline, area, perimeter, count |
| points | jsonb | coordinate array (PDF-space) |
| length | numeric | in drawing units |
| area | numeric | in drawing units² |
| count | int | |
| unit | text | |
| scale_calibration | jsonb | {calibLengthPx, calibLengthUnits} |
| label | text | |
| created_by | uuid | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 2.9 `qto_assumptions`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| tender_id | uuid FK → tender_register(id) | |
| qto_item_id | uuid FK → qto_items(id) | nullable |
| drawing_id | uuid FK → qto_drawing_register(id) | nullable |
| assumption_no | text | |
| description | text NOT NULL | |
| reason | text | |
| risk_level | text default 'MEDIUM' | LOW, MEDIUM, HIGH |
| status | text default 'OPEN' | OPEN, RESOLVED, PENDING_RFI |
| rfi_id | uuid FK → design_rfi(id) | optional link |
| created_by | uuid | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 2.10 `qto_clarifications`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| tender_id | uuid FK → tender_register(id) | |
| qto_item_id | uuid FK → qto_items(id) | |
| drawing_id | uuid FK → qto_drawing_register(id) | |
| clarification_no | text | |
| description | text NOT NULL | |
| reason | text | |
| status | text default 'OPEN' | OPEN, RESPONDED, CLOSED |
| response | text | client/consultant response |
| risk_level | text default 'MEDIUM' | |
| rfi_id | uuid FK → design_rfi(id) | optional existing RFI |
| rfi_no | text | |
| created_by | uuid | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 2.11 `qto_reviews`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| qto_item_id | uuid FK → qto_items(id) ON DELETE CASCADE | |
| reviewer_id | uuid → auth.users | |
| decision | text NOT NULL | approve, reject, return, comment |
| comment | text | required for reject/return |
| from_status | text | |
| to_status | text | |
| created_at | timestamptz | |

### 2.12 `qto_revisions`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| qto_item_id | uuid FK → qto_items(id) ON DELETE CASCADE | |
| revision_no | int NOT NULL | |
| quantity | numeric | |
| unit | text | |
| drawing_revision_id | uuid FK → qto_drawing_revisions(id) | |
| status | text | |
| change_reason | text | |
| snapshot | jsonb | full item snapshot |
| created_by | uuid | |
| created_at | timestamptz | |

### 2.13 `qto_boq_links`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| qto_item_id | uuid FK → qto_items(id) ON DELETE CASCADE | |
| boq_item_id | uuid FK → tender_boq_items(id) ON DELETE CASCADE | |
| quantity | numeric NOT NULL | contribution |
| created_by | uuid | |
| created_at | timestamptz | |

Unique: `(qto_item_id, boq_item_id)`.

### 2.14 `qto_audit_log`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| tender_id | uuid FK → tender_register(id) | |
| qto_item_id | uuid FK → qto_items(id) | nullable |
| user_id | uuid → auth.users | |
| action | text NOT NULL | created, edited, submitted, checked, rejected, approved, revised, posted_to_boq |
| entity | text | table name |
| entity_id | uuid | |
| old_values | jsonb | |
| new_values | jsonb | |
| comment | text | |
| created_at | timestamptz default now() | |

Index: `(tender_id, created_at)`, `qto_item_id`.

---

## 3. Triggers

1. `set_qto_updated_at` — maintain `updated_at` on mutating tables.
2. `qto_drawing_current_revision` — after insert/update on `qto_drawing_revisions`,
   set `current_revision_id` and mark other revisions `superseded` when a new revision is
   marked `current`.
3. `qto_item_audit` — insert into `qto_audit_log` for status transitions and edits
   (mirrors the existing `qs_audit_log` pattern).

---

## 4. RLS Policies

Every table: `ENABLE ROW LEVEL SECURITY` with policies granting `authenticated` users
select/insert/update/delete, matching the established DCOS pattern. Application-layer
permissions (RBAC) further constrain what each role may do.

---

## 5. Notes

- Running QTO numbers (`QTO-000001`) can be generated from a `seq` column or an insert
  trigger using a per-tender sequence; a dedicated `qto_item_running_no` function is used
  by the service layer.
- `tender_boq_items` already exists (`20260531000055_tender_cost_estimation.sql`) and is
  the BOQ target for `qto_boq_links`.
- `design_rfi` already exists (`20260531000040_design_shared.sql`) and is reused for RFI
  links; a fresh RFI creation from a clarification is a future enhancement.
