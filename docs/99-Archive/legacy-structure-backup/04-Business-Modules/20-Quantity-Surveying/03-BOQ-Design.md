# Bill of Quantities (BOQ) — Design Specification
**Document Code:** DCOS-DS-12-003 | **Version:** R0 | **Date:** July 2026
**Module:** Quantity Surveying (12-3 BOQ) | **Domain:** Commercial

---

## 1. Overview

The BOQ module manages Bills of Quantities — the definitive list of work items with quantities and rates that forms the commercial baseline of a construction project. Each BOQ item can link to a standard cost code (from the Cost Library) and a WBS node, enabling cost traceability from budget through to actual spend.

---

## 2. Data Model

### 2.1 `qs_boq` — BOQ Header

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK → `projects(id)`, NOT NULL |
| `boq_number` | TEXT | Human-readable BOQ identifier |
| `title` | TEXT | BOQ title (e.g., "Main Bill of Quantities") |
| `description` | TEXT | Optional description |
| `boq_type` | TEXT | Enum: `preliminary`, `main_works`, `variation`, `provisional_sum`, `supplement` |
| `version` | INTEGER | Version number, increments on amendment |
| `status` | TEXT | Enum: `draft`, `active`, `locked`, `superseded` |
| `currency_code` | TEXT | ISO currency code (default: USD) |
| `exchange_rate` | NUMERIC(14,6) | Exchange rate to base currency |
| `created_by` | UUID | FK → `auth.users(id)` |

### 2.2 `qs_boq_sections` — BOQ Sections (Grouping Level)

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK → `projects(id)` |
| `boq_id` | UUID | FK → `qs_boq(id)` |
| `seq` | INTEGER | Sort order within BOQ |
| `title` | TEXT | Section title (e.g., "Sub-Structure Works") |
| `description` | TEXT | Optional scope description |

### 2.3 `qs_boq_items` — BOQ Line Items

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK → `projects(id)` |
| `boq_section_id` | UUID | FK → `qs_boq_sections(id)` |
| `wbs_node_id` | UUID | FK → `wbs_nodes(id)`, nullable |
| `cost_item_id` | UUID | FK → `qs_cost_items(id)`, nullable |
| `seq` | INTEGER | Line item sequence number |
| `description` | TEXT | Item description |
| `unit` | TEXT | Unit of measure (e.g., m², m³, ea, LS) |
| `quantity` | NUMERIC(15,3) | Quantity |
| `unit_rate` | NUMERIC(12,2) | Rate per unit |
| `total_amount` | NUMERIC(15,2) | GENERATED: `quantity × unit_rate` |
| `contingency_pct` | NUMERIC(5,2) | Contingency percentage applied to this item |
| `is_provisional` | BOOLEAN | True if quantity is provisional/estimated |
| `currency` | CHAR(3) | ISO currency code |
| `notes` | TEXT | Internal notes |

### 2.4 `qs_budget_revisions` — Revision Trail

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `project_id` | UUID | FK → `projects(id)` |
| `boq_item_id` | UUID | FK → `qs_boq_items(id)` |
| `revision_number` | INTEGER | Sequential revision number |
| `prev_quantity` | NUMERIC(15,3) | Quantity before revision |
| `new_quantity` | NUMERIC(15,3) | Quantity after revision |
| `prev_unit_rate` | NUMERIC(12,2) | Rate before revision |
| `new_unit_rate` | NUMERIC(12,2) | Rate after revision |
| `prev_total` | NUMERIC(15,2) | Total before revision |
| `new_total` | NUMERIC(15,2) | Total after revision |
| `reason` | TEXT | Reason for revision |
| `revised_by` | UUID | FK → `auth.users(id)` |
| `revised_at` | TIMESTAMPTZ | Revision timestamp |

---

## 3. Business Rules

- Every BOQ item belongs to exactly one BOQ section, which belongs to exactly one BOQ.
- BOQ items can reference a `cost_item_id` from the Cost Library for standard rate lookup.
- BOQ items can reference a `wbs_node_id` for WBS-linked cost tracking.
- The `total_amount` column is a generated column — always `quantity × unit_rate`.
- Budget revisions capture before/after snapshots; no in-place updates to BOQ item quantity/rate.
- BOQ status workflow: `draft → active → locked → superseded`.
- Only `active` BOQs can receive cost transactions and progress claims.

---

## 4. Cost Library Integration

The Cost Library provides standard rates that can be referenced by BOQ items:

- **Divisions:** 18 top-level categories (01–33, CSI MasterFormat)
- **Sections:** Sub-categories within each division
- **Items:** Leaf-level rate items with `base_rate`, `labor_pct`, `material_pct`, `equipment_pct`

When a BOQ item links to a cost item, the `unit_rate` can be auto-populated from `base_rate` and then manually adjusted.

---

## 5. UI Pages

| Page | Route | Description |
|---|---|---|
| Cost Library | `/dashboard/qs/cost-library` | Manage divisions, sections, and rate items |
| BOQ List | `/dashboard/qs/boq` | List of BOQs per project |
| BOQ Detail | `/dashboard/qs/boq/[id]` | Sections and items with inline editing |
| Budget Revisions | `/dashboard/qs/budget-revisions` | Revision history and pending approvals |
| Budget View | `/dashboard/qs/budget` | Summary view of BOQ totals by section |
| Budget vs Actual | `/dashboard/account/budget-vs-actual` | Project-level comparison |
