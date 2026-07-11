# Budget Code System — Design Specification
**Document Code:** DCOS-DS-12-002 | **Version:** R0 | **Date:** July 2026
**Module:** Quantity Surveying (12-1 Budget Code) | **Domain:** Commercial

---

## 1. Overview

The Budget Code system provides a standardised classification structure for all construction costs. Every commercial document — Purchase Requisition, Purchase Order, Variation Order — carries a budget code that identifies the cost category. This enables consistent cost reporting, budget vs actual comparison, and cross-project benchmarking.

Budget codes follow the format `[Group].[Section]` (e.g., `B.1`, `F.12`) and are managed through two database tables plus per-project settings.

---

## 2. Data Model

### 2.1 `budget_package_sections` — Standard Budget Code Definitions

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `group_code` | TEXT | Group letter: A, B, C, D, E, F |
| `group_name` | TEXT | Group display name (e.g., "Sub-Structure") |
| `section` | TEXT | Section code: `A.1`, `B.3`, `F.10` (format: `{group}.{number}`) |
| `section_name` | TEXT | Short section name (e.g., "Foundation / Piling") |
| `description` | TEXT | Full scope description |
| `sort_order` | INTEGER | Display ordering within group |
| `is_active` | BOOLEAN | Whether this section is available for new documents |

**Constraint:** Unique `(group_code, section)` — prevents duplicate codes.

### 2.2 `project_budget_settings` — Per-Project Budget Configuration

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK → `projects(id)`, unique per project |
| `contingency` | NUMERIC | Contingency amount or percentage for the project |
| `cost_code_template` | TEXT | Template pattern for generated cost codes (e.g., `A.01-XX`) |
| `approval_limit_rule` | TEXT | JSON rule defining approval thresholds by role |
| `selected_sections` | JSONB | Array of selected section IDs — limits available budget codes for this project |

### 2.3 `budget_running_numbers` — Document Auto-Numbering

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK → `projects(id)` |
| `budget_section` | TEXT | Budget section code (e.g., `B.1`) |
| `package_number` | INTEGER | Package number within the section |
| `document_type` | TEXT | `PR`, `PO`, or `VO` |
| `last_sequence` | INTEGER | Last used sequence number for auto-increment |
| **Unique** | | `(project_id, budget_section, package_number, document_type)` |

---

## 3. Group Structure (A–F)

| Group | Code | Sections | Covers |
|---|---|---|---|
| Early Works | A | 9 | Survey, soil, demolition, clearing, utilities, groundworks |
| Sub-Structure | B | 4 | Foundation, basement, ground slab, podium |
| Architecture External | C | 11 | Walls, finishes, doors, windows, roofing, partitions |
| Interior Finishes | D | 3 | Wall, floor, ceiling finishes |
| Fittings & Equipment | E | 8 | Fittings, kitchen, signage, artwork, planting, pest control |
| Building Services (MEP) | F | 12 | Sanitary, HVAC, ventilation, plumbing, drainage, fire, electrical, ELV, lifts, generators, lightning |

**Total: 47 standard sections.**

---

## 4. Integration Points

### 4.1 Procurement — PR/PO Documents
- `procurement_prs.budget_code` — Header-level budget code on Purchase Requisitions
- `procurement_pr_items.budget_code` — Line-level budget code override
- Budget code is a free-text field (not foreign-key constrained) for flexibility, but should match a valid `section` from `budget_package_sections`

### 4.2 Naming Convention — Master Document Codes
Budget code appears as the `[Package No.]` segment in document codes:
`[Project Code]-[Company]-[Package No.]-[Doc Type].[Running No.]-[Revision]-[Circulation]`

Example: `P001-HTBT-CMED-B.1.01-01.PR.000-R00-INT01`
- `P001` = Project Code
- `HTBT` = Company
- `CMED` = Organisation
- `B.1.01` = Budget section `B.1`, package `01`
- `PR.000` = PR document, sequence 000

### 4.3 QS — BOQ / Cost Tracking
- Budget codes are not directly stored on BOQ items; cost tracking uses BOQ items and cost library codes
- The `cost_code_template` field in `project_budget_settings` defines the naming pattern for project-specific cost codes derived from budget sections

### 4.4 Inventory — Material Cost Allocation
- Material issues reference budget codes via the linked BOQ item or WBS node
- Budget codes provide the cost classification for inventory valuation reports

---

## 5. UI Design

### 5.1 Budget Sections Editor (`naming-budget-sections-editor.tsx`)
- CRUD table for managing `budget_package_sections`
- Grouped by group_code with collapsible sections
- Inline editing of section names and descriptions

### 5.2 Project Budget Settings (`naming-budget-packages.tsx`)
- Per-project configuration panel
- Select which budget sections apply to the project (checkboxes by group)
- Set cost code template pattern
- Configure contingency and approval limit rules

### 5.3 Budget Code Selector in PR Forms
- Dropdown/autocomplete field filtered by the project's selected sections
- Format: `B.1 — Foundation / Piling`
- Validation against `budget_package_sections` (optional, configurable)

---

## 6. API Endpoints

Budget code data is served through the generic resource CRUD routes:

| Resource | Endpoint | Methods |
|---|---|---|
| `budget_package_sections` | `/api/procurement/budget_package_sections` | GET, POST |
| `budget_package_sections/:id` | `/api/procurement/budget_package_sections/:id` | GET, PUT, DELETE |
| Budget settings | Served via project settings endpoints | — |
| Budget running numbers | Computed server-side on document creation | — |

---

## 7. Reporting

| Report | Source | Description |
|---|---|---|
| Budget Code Reference | `budget_package_sections` | Complete list of all standard budget codes (see `Budget Code.xlsx`) |
| Project Budget Settings | `project_budget_settings` + `projects` | Per-project budget configuration summary |
| Budget vs Actual | `account_budget_vs_actual` view | Project-level budget vs actual cost comparison |
| Cost by Budget Code | `procurement_pr_items.budget_code` | Procurement spend classified by budget section |
