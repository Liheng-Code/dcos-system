# Build Prompt — GFA, Site Area & Cost per m² Measurement and Reporting

**Module:** Quantity Surveying → Cost Control → GFA & Cost per m²
**System:** DCOS (Digital Construction Operating System)
**Stack:** Next.js 14 + React + TypeScript + Tailwind, Supabase (PostgreSQL + RLS), existing WBS and QS modules
**Ref documents:** DCOS-QS-GDL-001 V1.0 (GFA & Cost per m² Guideline), SOP-QS-001 R3, DCOS-QS-DDS-001 V2.0, FS-QS-001 (template reference)

---

## 1. Role & Objective

You are a senior full-stack developer building the GFA measurement and cost-per-m² reporting engine for a construction ERP. Implement the measurement, storage, rollup, and reporting of Gross Floor Area (GFA) and Site Area per the DCOS house convention, and produce the mandatory cost-per-m² benchmarks that every tender review, management report, and client document requires.

The core principle, one line:

```
Drawing (floor plan) → GFA per LEVEL (wbs_node_quantities) → Rollup to building/project →
BOQ cost per WBS node → Cost ÷ GFA = $/m² → Standard Final Cost Summary (§9 format)
```

Key rules from DCOS-QS-GDL-001:

1. **GFA is ENTERED from drawings, never derived.** Do not sum from BOQ items or room areas.
2. **GFA is entered per LEVEL** and rolls up to building and project. Parents are read-only.
3. **Basement levels are flagged** — split reporting is mandatory (above-ground $/m² vs basement $/m²).
4. **External works** (BX/BY/BZ buildings) divide by **SITE AREA**, never by GFA.
5. **Revision control**: every GFA change requires a reason and audit log.
6. **Validation**: no level may have cost > 0 with GFA = 0.

---

## 2. Database Schema (Supabase / PostgreSQL)

### 2.1 `wbs_node_quantities` (NEW table)

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| project_id | uuid FK → projects | cascade delete |
| wbs_node_id | uuid FK → wbs_nodes | cascade delete |
| metric_code | text | CHECK ('GFA', 'SITE_AREA', 'BUILDING_FOOTPRINT') |
| value | numeric(14,2) | must be > 0 for GFA/SITE_AREA |
| unit | text | default 'm2' |
| source_ref | text | drawing revision reference (mandatory on create) |
| is_current | boolean | default true; only one active per (wbs_node_id, metric_code) |
| revised_reason | text | required when updating existing current record |
| revised_at | timestamptz | set on update |
| revised_by | uuid FK → profiles | set on update |
| created_by | uuid FK → profiles | |
| created_at | timestamptz | default now() |

Constraints:
- `unique(wbs_node_id, metric_code, is_current)` partial unique where is_current = true
- `check(value > 0)` for GFA and SITE_AREA metric codes
- `check(source_ref is not null and length(source_ref) > 0)`

### 2.2 `wbs_nodes` — add column

| Column | Type | Rules |
|---|---|---|
| is_basement | boolean | default false; only meaningful for node_type = 'level' |

### 2.3 `progress_snapshots` — add column

| Column | Type | Rules |
|---|---|---|
| gfa_at_snapshot | numeric(14,2) | GFA value captured at snapshot time for historical $/m² |

RLS: authenticated read, authenticated write (matching existing `wbs_nodes` pattern).

---

## 3. Calculation Rules (authoritative formulas)

### 3.1 GFA per level

```
gfa_level = value FROM wbs_node_quantities
            WHERE metric_code = 'GFA' AND is_current = true
            AND wbs_node_id = :level_node_id
```

### 3.2 GFA rollup (building)

```
gfa_above_ground = Σ gfa_level WHERE is_basement = false AND parent = building_node
gfa_basement     = Σ gfa_level WHERE is_basement = true  AND parent = building_node
gfa_total        = gfa_above_ground + gfa_basement
```

### 3.3 GFA rollup (project)

```
project_gfa_above_ground = Σ gfa_level WHERE is_basement = false (all buildings)
project_gfa_basement     = Σ gfa_level WHERE is_basement = true  (all buildings)
project_gfa_total        = project_gfa_above_ground + project_gfa_basement
```

### 3.4 Site Area

```
site_area = value FROM wbs_node_quantities
            WHERE metric_code = 'SITE_AREA' AND is_current = true
            AND wbs_node_id = :project_node_id
```

### 3.5 Building cost (per §5 of guideline)

```
building_cost = Σ qs_boq_items.total_amount
  WHERE wbs_node is within the building WBS branch
  AND building_code NOT IN ('BX', 'BY', 'BZ')
```

### 3.6 External works cost

```
external_cost = Σ qs_boq_items.total_amount
  WHERE wbs_node is within building branches BX, BY, or BZ
```

### 3.7 Standard Final Cost Summary (§9 mandatory format)

| Line | Description | Numerator | Denominator | Result |
|---|---|---|---|---|
| 1 | Building works — above ground | above_ground_cost | gfa_above_ground | $/m² |
| 2 | Building works — basement | basement_cost | gfa_basement | $/m² |
| A | Building subtotal (blended) | building_cost_total | gfa_total | $/m² |
| 3 | External works | external_cost | site_area | $/m² site |
| B | TOTAL CONTRACT | total_contract | — | — |
| memo | Whole project ÷ GFA | total_contract | gfa_total | memo only |

### 3.8 Elemental cost/m² (per §6 Step 3)

```
elemental_cost_per_sqm[element] = element_cost ÷ gfa_total
```

Where elements map to budget groups A-F:
- A (Early Works) + B (Sub-Structure) → Substructure
- C (Architecture External) + D (Interior Finishes) → Architectural
- E (Fittings & Equipment) → Fittings
- F (Building Services MEP) → MEP
- Preliminaries → tracked separately

### 3.9 Rounding

Store 4 decimals; display 2. Never round intermediates. (Same rule as FS-QS-001 §3.5.)

---

## 4. Recalculation Chain (critical behavior)

### 4.1 GFA edit trigger

```
1. On GFA edit at level node:
   a. Validate: value > 0, source_ref not empty
   b. Set old record is_current = false
   c. Insert new row with is_current = true
   d. Write to wbs_audit_log (action = 'GFA_UPDATE', old_value, new_value, revised_reason)
   e. Recalculate building rollup (gfa_above_ground, gfa_basement, gfa_total)
   f. Recalculate all $/m² for this building
   g. Show toast: "GFA updated: 850 m² → 870 m². Building $/m² recalculated."
```

### 4.2 Validation trigger

```
On any cost transaction or BOQ item insert:
  IF wbs_node has cost > 0 AND GFA = 0 (or missing):
    SHOW warning: "Level [code] has cost but no GFA entered.
    Cost/m² cannot be calculated. Enter GFA from the Quantities panel."
```

### 4.3 Freeze rule

```
When wbs_baselines.is_active = true for this project:
  GFA edits are allowed but require revised_reason
  Existing snapshots retain their gfa_at_snapshot value
```

### 4.4 Snapshot behavior

```
On capture_progress_snapshot():
  Capture current GFA for each level node → store in progress_snapshots.gfa_at_snapshot
  Historical $/m² = historical_cost ÷ historical_gfa_at_snapshot
```

---

## 5. UI Specifications

### 5.1 WBS Node Workspace — new "quantities" tab

Add to TABS array in `wbs-node-workspace.tsx`: `["details", "quantities", "cost", "edit", "permissions"]`

**Quantities tab — level nodes:**

| Section | Content |
|---|---|
| GFA Input | Numeric field: "GFA (m²)" with source_ref text input. Save button. |
| Current Value | Display: "Current GFA: 850 m²" with source badge "DWG-ARC-003 Rev.B" |
| Basement Toggle | Checkbox: "Below ground level" (sets is_basement) — only for level nodes |
| Revision History | Table: Date, Value, Source, Revised By, Reason. Last 10 revisions. |
| Cost/m² Display | "Building cost/m²: $420.00" (read-only, computed) |

**Quantities tab — building nodes:**

| Section | Content |
|---|---|
| GFA Rollup (read-only) | Above ground: X m² · Basement: Y m² · Total: Z m² |
| Cost/m² Summary | Line 1: $420.00/m² (above ground) · Line 2: $850.00/m² (basement) · Line A: $458.84/m² (blended) |
| Elemental Table | Budget group → Cost → $/m² (read-only) |

**Quantities tab — project nodes:**

| Section | Content |
|---|---|
| Site Area Input | Numeric field: "Site Area (m²)" with source_ref. Save button. |
| GFA Total | Read-only rollup from all buildings |
| Standard Final Cost Summary | The mandatory 5-line table from §9 |
| External $/m² | $40.00/m² site (separate line, never in building numerator) |

### 5.2 WBS Cost Tab — enhanced

Add new card at the top of `wbs-cost-tab.tsx`:

```
┌─────────────────────────────────────────┐
│  Cost per m² — GFA: 8,560 m²           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │ Above    │ │ Basement │ │ Blended  ││
│  │ $420.00  │ │ $850.00  │ │ $458.84  ││
│  │ /m²      │ │ /m²      │ │ /m²      ││
│  └──────────┘ └──────────┘ └──────────┘│
│  ⚠ Level L03 has cost but no GFA      │
└─────────────────────────────────────────┘
```

### 5.3 QS Dashboard — new KPI card

Add to the existing 4-card grid in `page.tsx`:

```
Card 5: "Building $/m²"
  Value: $458.84 (blended)
  Subtitle: "Above ground: $420.00 · Basement: $850.00"
```

### 5.4 WBS Node Edit — is_basement checkbox

In `wbs-node-edit-sheet.tsx`, add a checkbox when node_type = 'level':
```
☑ Below ground level (basement) — affects split reporting
```

---

## 6. API Endpoints

```
GET    /api/wbs/:nodeId/quantities           — list metrics for a node
POST   /api/wbs/:nodeId/quantities           — create/upsert metric (with revision control)
PATCH  /api/wbs/:nodeId/quantities/:metricId — update with reason
GET    /api/projects/:projectId/gfa-summary  — rollup GFA across all levels
GET    /api/projects/:projectId/cost-per-sqm — the full §9 standard summary
GET    /api/projects/:projectId/elemental-cost — elemental $/m² breakdown
```

Guards: authenticated; GFA edits require revised_reason; audit log entries for every mutation.

---

## 7. Mock Data Templates — School Example (Cases A–D from Guideline)

### 7.1 WBS structure

```
BA — Building A (School)
├── BA-01-G00 Ground Floor (GFA: 850 m²)
├── BA-02-L01 Level 1 (GFA: 850 m²)
├── BA-03-L02 Level 2 (GFA: 850 m²)
├── BA-04-L03 Level 3 (GFA: 850 m²)
├── BA-05-L04 Level 4 (GFA: 850 m²)
├── BA-06-L05 Level 5 (GFA: 850 m²)
├── BA-07-L06 Level 6 (GFA: 850 m²)
├── BA-08-L07 Level 7 (GFA: 850 m²)
├── BA-09-L08 Level 8 (GFA: 850 m²)
├── BA-10-L09 Level 9 (GFA: 850 m²)
├── BA-11-R00 Roof (GFA: 60 m² — enclosed rooms only)
└── BA-12-B01 Basement (GFA: 850 m², is_basement: true)
```

### 7.2 GFA measurements

| Level | Plate Area | Rule | GFA |
|---|---|---|---|
| Ground floor | 850 m² | 100% | 850 |
| Levels 1–9 (9 floors) | 9 × 850 m² | 100% | 7,650 |
| Roof: lift motor room + tank room | 60 m² | Enclosed 100% | 60 |
| Roof: open deck | 400 m² | Uncovered 0% | 0 |
| **GFA above ground** | | | **8,560 m²** |
| Basement (1 floor) | 850 m² | 100% | 850 |
| **GFA total** | | | **9,410 m²** |

### 7.3 Cost seed (matching §6 Step 3)

| Element | Budget Group | Cost (USD) | $/m² |
|---|---|---|---|
| Substructure (piling, pile caps, ground beams) | A+B | 428,000 | 50.00 |
| Superstructure (concrete frame) | C (partial) | 1,112,800 | 130.00 |
| Architectural works & finishes | C+D | 1,027,200 | 120.00 |
| MEP services | F | 856,000 | 100.00 |
| Preliminaries | (all groups) | 171,200 | 20.00 |
| **Building total** | | **3,595,200** | **420.00** |

### 7.4 Basement extension (matching §7 Case B)

| Level | GFA | Cost (USD) | $/m² |
|---|---|---|---|
| B01 Basement | 850 m² | 722,500 | 850.00 |

### 7.5 External works (matching §8 Case C)

BX — External Works building:
| Site Area | External Cost (USD) | $/m² site |
|---|---|---|
| 4,500 m² | 180,000 | 40.00 |

### 7.6 Expected Standard Final Cost Summary

| Line | Description | Cost (USD) | Denominator | $/m² |
|---|---|---|---|---|
| 1 | Building works — above ground | 3,595,200 | 8,560 m² GFA | 420.00 |
| 2 | Building works — basement | 722,500 | 850 m² GFA | 850.00 |
| A | Building subtotal (blended) | 4,317,700 | 9,410 m² GFA | 458.84 |
| 3 | External works | 180,000 | 4,500 m² site | 40.00 |
| B | TOTAL CONTRACT | 4,497,700 | — | — |
| memo | Whole project ÷ GFA (memo only) | 4,497,700 | 9,410 m² | 477.97 |

---

## 8. Acceptance Tests (must pass exactly)

**T1 — GFA entry.** Enter GFA 850 m² for level G00, source "DWG-ARC-001 Rev.A" → record created with is_current = true.

**T2 — GFA revision.** Edit GFA to 870 m² with reason "Design revision R2" → old record is_current = false, new record created, wbs_audit_log entry with old_value=850, new_value=870.

**T3 — Building rollup.** 9 levels × 850 m² + 60 m² roof rooms → gfa_above_ground = 8,560 m².

**T4 — Building $/m².** $3,595,200 ÷ 8,560 = **$420.00**.

**T5 — Basement split.** $722,500 ÷ 850 = **$850.00**.

**T6 — Blended.** ($3,595,200 + $722,500) ÷ (8,560 + 850) = $4,317,700 ÷ 9,410 = **$458.84**.

**T7 — External works.** $180,000 ÷ 4,500 = **$40.00/m² site**.

**T8 — External exclusion.** External cost NOT included in building numerator → Building $/m² remains $420.00.

**T9 — Standard Final Cost Summary.** All 6 lines match §9 format exactly (see §7.6).

**T10 — Validation warning.** BOQ item posted to level with GFA = 0 → warning toast displayed.

**T11 — Snapshot GFA.** Historical $/m² = historical_cost ÷ gfa_at_snapshot → correct historical value preserved.

**T12 — BX exclusion.** BX building costs excluded from building $/m² numerator → only BA costs counted.

---

## 9. Out of Scope (do not build now)

- Import GFA from Excel (future FS-QS-005)
- BIM model area extraction
- Automatic area calculation from floor plan drawings
- Multiple currency cost/m² (future FS-QS-008 margin engine)
- GFA by zone subdivision (only level-level granularity now)
- Client-facing sell-side cost/m² (firewall rule, SOP-QS-05A)
- WBS node quantities panel for non-building node types (element, discipline, task_group)

## 10. Definition of Done

- [ ] `wbs_node_quantities` table created with RLS and constraints
- [ ] `is_basement` column added to `wbs_nodes`
- [ ] `gfa_at_snapshot` column added to `progress_snapshots`
- [ ] Quantities tab visible on WBS node workspace for level/building/project nodes
- [ ] GFA input with source_ref and revision history
- [ ] Building rollup (above ground / basement / total) auto-calculated
- [ ] Standard Final Cost Summary renders per §9 format
- [ ] Elemental $/m² table renders per §6
- [ ] Cost tab shows cost/m² card with split reporting
- [ ] QS Dashboard shows Building $/m² KPI card
- [ ] Validation warning when cost > 0 but GFA = 0
- [ ] Audit log entries for every GFA change
- [ ] Snapshot captures GFA at snapshot time
- [ ] All acceptance tests T1–T12 pass
- [ ] Mock data seeds the §7 school example with expected values
- [ ] Migration SQL is idempotent and reversible

---

**End of Document — FS-QS-012 V1.0**
