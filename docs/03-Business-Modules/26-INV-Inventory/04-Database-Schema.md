# Inventory / Stock Module — Database Schema
**Document Code:** DCOS-DB-26-001 | **Version:** R0 | **Date:** June 2026
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

---

## Tables

---

### Table: `inventory_items`
**Purpose:** Item master catalogue — shared across all projects within a tenant.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| item_code | text | NOT NULL, UNIQUE per tenant | System-generated e.g. MAT-00001 |
| name | text | NOT NULL | Material description |
| category | text | NOT NULL | CHECK (category in ('structural','civil','mep','finishes','consumables','others')) |
| sub_category | text | | Admin-configurable sub-category |
| unit_of_measure | text | NOT NULL | e.g. kg, m, m², m³, pcs, roll, bag, tonne |
| default_cost_code | text | | Links to BOQ cost code |
| min_stock_level | numeric(18,4) | | Reorder point trigger |
| max_stock_level | numeric(18,4) | | Over-stock threshold |
| reorder_quantity | numeric(18,4) | | Default quantity for auto-draft PR |
| lead_time_days | integer | | Average lead time for re-ordering |
| is_inspection_required | boolean | NOT NULL, default false | Flag for QAQC inspection on receipt |
| is_active | boolean | NOT NULL, default true | Soft-delete flag |
| created_by | uuid | FK → auth.users(id) | |
| updated_by | uuid | FK → auth.users(id) | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id)`, `(tenant_id, item_code)`, `(tenant_id, category)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_stores`
**Purpose:** Physical stores within a project. A project may have multiple stores.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| project_id | uuid | NOT NULL, FK → projects(id) | |
| store_code | text | NOT NULL | e.g. STR-PRJ01-001 |
| name | text | NOT NULL | e.g. "Main Store — Tower A", "Sub-Store Level 5" |
| store_type | text | NOT NULL | CHECK (store_type in ('main','sub','temporary')) |
| location_description | text | | Physical location on site |
| responsible_user_id | uuid | FK → auth.users(id) | Storekeeper in charge |
| status | text | NOT NULL | CHECK (status in ('active','closed')) |
| created_by | uuid | FK → auth.users(id) | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, project_id)`, `(tenant_id, store_code)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_stock`
**Purpose:** Current stock balance per item per store. One record per item+store combination.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| store_id | uuid | NOT NULL, FK → inventory_stores(id) | |
| item_id | uuid | NOT NULL, FK → inventory_items(id) | |
| project_id | uuid | NOT NULL, FK → projects(id) | Denormalised for fast project-level queries |
| quantity_available | numeric(18,4) | NOT NULL, default 0 | Available for issue |
| quantity_reserved | numeric(18,4) | NOT NULL, default 0 | Reserved by approved MRs not yet issued |
| quantity_under_inspection | numeric(18,4) | NOT NULL, default 0 | Received, pending QAQC |
| quantity_quarantined | numeric(18,4) | NOT NULL, default 0 | Quality hold |
| unit_cost_fifo | numeric(18,2) | | Current FIFO cost per unit |
| last_movement_at | timestamptz | | Timestamp of last movement |
| updated_at | timestamptz | NOT NULL, default now() | |

**Unique:** `(tenant_id, store_id, item_id)`
**Indexes:** `(tenant_id, project_id)`, `(tenant_id, store_id, item_id)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
**Note:** This is a running-balance table. All updates are via stock movement transactions — never direct write.

---

### Table: `inventory_grns` (Goods Received Notes)
**Purpose:** Header record for each delivery receipt.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| project_id | uuid | NOT NULL, FK → projects(id) | |
| store_id | uuid | NOT NULL, FK → inventory_stores(id) | |
| grn_number | text | NOT NULL, UNIQUE per project | System-generated e.g. GRN-PRJ01-0001 |
| po_id | uuid | NOT NULL, FK → procurement_pos(id) | Must reference approved PO |
| po_number | text | NOT NULL | Denormalised for display |
| supplier_id | uuid | FK → suppliers(id) | |
| supplier_delivery_note | text | | Supplier's delivery note number |
| vehicle_plate | text | | |
| driver_name | text | | |
| received_date | date | NOT NULL | |
| received_time | time | | |
| received_by | uuid | NOT NULL, FK → auth.users(id) | Storekeeper |
| status | text | NOT NULL | CHECK (status in ('draft','confirmed','cancelled')) |
| remarks | text | | |
| document_ids | uuid[] | | References to uploaded delivery documents |
| confirmed_at | timestamptz | | |
| confirmed_by | uuid | FK → auth.users(id) | |
| created_by | uuid | FK → auth.users(id) | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, project_id)`, `(tenant_id, po_id)`, `(tenant_id, grn_number)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_grn_lines`
**Purpose:** Line items for each GRN.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| grn_id | uuid | NOT NULL, FK → inventory_grns(id) | |
| item_id | uuid | NOT NULL, FK → inventory_items(id) | |
| po_line_id | uuid | FK → procurement_po_lines(id) | Reference to PO line |
| quantity_ordered | numeric(18,4) | NOT NULL | From PO |
| quantity_received | numeric(18,4) | NOT NULL | Actual received quantity |
| unit_cost | numeric(18,2) | NOT NULL | Unit price from PO |
| total_cost | numeric(18,2) | GENERATED | quantity_received * unit_cost |
| batch_number | text | | Manufacturer batch/lot number |
| test_certificate_ref | text | | Reference to test certificate document |
| inspection_required | boolean | NOT NULL, default false | |
| inspection_status | text | CHECK (inspection_status in ('not_required','pending','approved','rejected')) | |
| inspected_by | uuid | FK → auth.users(id) | QAQC Engineer |
| inspected_at | timestamptz | | |
| inspection_notes | text | | |
| condition_notes | text | | Storekeeper's condition observation at receipt |
| created_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, grn_id)`, `(tenant_id, item_id)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_material_requisitions` (MR)
**Purpose:** Header for material issue requests from site.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| project_id | uuid | NOT NULL, FK → projects(id) | |
| store_id | uuid | NOT NULL, FK → inventory_stores(id) | Source store |
| mr_number | text | NOT NULL, UNIQUE per project | e.g. MR-PRJ01-0001 |
| wbs_node_id | uuid | NOT NULL, FK → wbs_nodes(id) | WBS location for cost posting |
| task_id | uuid | FK → tasks(id) | Linked task |
| cost_code | text | NOT NULL | Budget cost code |
| required_date | date | NOT NULL | Date materials needed on site |
| requested_by | uuid | NOT NULL, FK → auth.users(id) | Site Engineer |
| status | text | NOT NULL | CHECK (status in ('draft','submitted','approved','issued','partially_issued','rejected','cancelled')) |
| approved_by | uuid | FK → auth.users(id) | |
| approved_at | timestamptz | | |
| rejection_reason | text | | |
| remarks | text | | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, project_id)`, `(tenant_id, wbs_node_id)`, `(tenant_id, status)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_mr_lines`
**Purpose:** Line items for each Material Requisition.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| mr_id | uuid | NOT NULL, FK → inventory_material_requisitions(id) | |
| item_id | uuid | NOT NULL, FK → inventory_items(id) | |
| quantity_requested | numeric(18,4) | NOT NULL | |
| quantity_approved | numeric(18,4) | | Set at approval time |
| quantity_issued | numeric(18,4) | NOT NULL, default 0 | Cumulative issued |
| unit_cost_at_issue | numeric(18,2) | | FIFO cost at time of issue |
| remarks | text | | |
| created_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, mr_id)`, `(tenant_id, item_id)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_movements`
**Purpose:** Append-only ledger of all stock movements. The source of truth for all balance calculations.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| project_id | uuid | NOT NULL, FK → projects(id) | |
| store_id | uuid | NOT NULL, FK → inventory_stores(id) | |
| item_id | uuid | NOT NULL, FK → inventory_items(id) | |
| movement_type | text | NOT NULL | CHECK (movement_type in ('grn_receipt','mr_issue','return_to_store','transfer_out','transfer_in','return_to_supplier','adjustment','stocktake_adjustment','write_off')) |
| reference_type | text | NOT NULL | 'grn' / 'mr' / 'transfer' / 'adjustment' / 'stocktake' |
| reference_id | uuid | NOT NULL | ID of the parent GRN / MR / Transfer / Adjustment |
| reference_number | text | NOT NULL | Human-readable reference |
| quantity | numeric(18,4) | NOT NULL | Positive = in; Negative = out |
| unit_cost | numeric(18,2) | NOT NULL | Cost per unit at time of movement |
| total_cost | numeric(18,2) | NOT NULL | quantity * unit_cost (signed) |
| wbs_node_id | uuid | FK → wbs_nodes(id) | For issues — WBS cost attribution |
| cost_code | text | | For issues — cost code attribution |
| balance_after | numeric(18,4) | NOT NULL | Running balance after this movement |
| movement_date | date | NOT NULL | |
| created_by | uuid | NOT NULL, FK → auth.users(id) | |
| created_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, project_id)`, `(tenant_id, store_id, item_id)`, `(tenant_id, reference_id)`, `(tenant_id, movement_date)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
**Note:** This table is append-only. No UPDATE or DELETE. Corrections are made via offsetting movements.

---

### Table: `inventory_transfers`
**Purpose:** Header for inter-store and inter-project material transfers.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| transfer_number | text | NOT NULL, UNIQUE per tenant | e.g. TRF-00001 |
| transfer_type | text | NOT NULL | CHECK (transfer_type in ('intra_project','inter_project')) |
| source_project_id | uuid | NOT NULL, FK → projects(id) | |
| source_store_id | uuid | NOT NULL, FK → inventory_stores(id) | |
| destination_project_id | uuid | NOT NULL, FK → projects(id) | |
| destination_store_id | uuid | NOT NULL, FK → inventory_stores(id) | |
| status | text | NOT NULL | CHECK (status in ('pending','approved','in_transit','received','discrepancy','resolved','rejected','cancelled')) |
| transfer_reason | text | NOT NULL | |
| requested_by | uuid | NOT NULL, FK → auth.users(id) | |
| source_approved_by | uuid | FK → auth.users(id) | |
| source_approved_at | timestamptz | | |
| dest_approved_by | uuid | FK → auth.users(id) | For inter-project — destination approver |
| dest_approved_at | timestamptz | | |
| dispatched_by | uuid | FK → auth.users(id) | |
| dispatched_at | timestamptz | | |
| received_by | uuid | FK → auth.users(id) | |
| received_at | timestamptz | | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, source_project_id)`, `(tenant_id, destination_project_id)`, `(tenant_id, status)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_transfer_lines`
**Purpose:** Line items for each transfer.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| transfer_id | uuid | NOT NULL, FK → inventory_transfers(id) | |
| item_id | uuid | NOT NULL, FK → inventory_items(id) | |
| quantity_requested | numeric(18,4) | NOT NULL | |
| quantity_dispatched | numeric(18,4) | | Set when dispatched |
| quantity_received | numeric(18,4) | | Set when received |
| unit_cost | numeric(18,2) | | |
| created_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, transfer_id)`, `(tenant_id, item_id)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_stocktakes`
**Purpose:** Physical stock take session header.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| project_id | uuid | NOT NULL, FK → projects(id) | |
| store_id | uuid | NOT NULL, FK → inventory_stores(id) | |
| stocktake_number | text | NOT NULL, UNIQUE per tenant | e.g. ST-PRJ01-001 |
| status | text | NOT NULL | CHECK (status in ('open','counting','pending_approval','completed','cancelled')) |
| initiated_by | uuid | NOT NULL, FK → auth.users(id) | |
| initiated_at | timestamptz | NOT NULL, default now() | |
| completed_by | uuid | FK → auth.users(id) | |
| completed_at | timestamptz | | |
| total_variance_value | numeric(18,2) | | Sum of absolute variance values |
| notes | text | | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, project_id, store_id)`, `(tenant_id, status)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_stocktake_lines`
**Purpose:** Per-item count lines for a stock take.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| stocktake_id | uuid | NOT NULL, FK → inventory_stocktakes(id) | |
| item_id | uuid | NOT NULL, FK → inventory_items(id) | |
| system_quantity | numeric(18,4) | NOT NULL | Quantity at time of lock |
| counted_quantity | numeric(18,4) | | Entered by counter |
| variance | numeric(18,4) | GENERATED | counted_quantity - system_quantity |
| variance_percent | numeric(10,4) | GENERATED | variance / system_quantity * 100 |
| unit_cost | numeric(18,2) | | For variance value calculation |
| variance_value | numeric(18,2) | GENERATED | variance * unit_cost |
| is_approved | boolean | NOT NULL, default false | |
| approved_by | uuid | FK → auth.users(id) | |
| approved_at | timestamptz | | |
| explanation | text | | Required when variance > tolerance |
| created_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, stocktake_id)`, `(tenant_id, item_id)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_adjustments`
**Purpose:** Manual stock adjustment records (outside GRN, MR, transfer workflows).

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| project_id | uuid | NOT NULL, FK → projects(id) | |
| store_id | uuid | NOT NULL, FK → inventory_stores(id) | |
| adjustment_number | text | NOT NULL, UNIQUE per project | |
| reason_code | text | NOT NULL | CHECK (reason_code in ('damage','expiry','counting_error','theft_loss','correction','stocktake_reconciliation','write_off')) |
| reason_description | text | NOT NULL | |
| status | text | NOT NULL | CHECK (status in ('pending_approval','approved','rejected')) |
| requested_by | uuid | NOT NULL, FK → auth.users(id) | |
| approved_by | uuid | FK → auth.users(id) | Store Supervisor |
| approved_at | timestamptz | | |
| rejection_reason | text | | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, project_id)`, `(tenant_id, status)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inventory_adjustment_lines`
**Purpose:** Line items for adjustments.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| adjustment_id | uuid | NOT NULL, FK → inventory_adjustments(id) | |
| item_id | uuid | NOT NULL, FK → inventory_items(id) | |
| quantity_before | numeric(18,4) | NOT NULL | System balance before adjustment |
| quantity_adjusted | numeric(18,4) | NOT NULL | Positive = increase, Negative = decrease |
| quantity_after | numeric(18,4) | NOT NULL | |
| unit_cost | numeric(18,2) | | |
| cost_impact | numeric(18,2) | GENERATED | quantity_adjusted * unit_cost |
| created_at | timestamptz | NOT NULL, default now() | |

---

## Relationships Summary

```
inventory_items          ← shared per tenant (no project_id)
inventory_stores         → projects
inventory_stock          → stores + items (running balance)
inventory_grns           → stores + procurement_pos
inventory_grn_lines      → grns + items
inventory_material_requisitions → stores + wbs_nodes + tasks
inventory_mr_lines       → material_requisitions + items
inventory_movements      → stores + items (append-only ledger)
inventory_transfers      → source_store + destination_store
inventory_transfer_lines → transfers + items
inventory_stocktakes     → stores
inventory_stocktake_lines → stocktakes + items
inventory_adjustments    → stores
inventory_adjustment_lines → adjustments + items
```

---

## Migration Notes

- Create `inventory_items` before `inventory_stock` (FK dependency)
- Create `inventory_stores` before `inventory_stock`, `inventory_grns`, `inventory_material_requisitions`
- `inventory_movements` is the audit ledger — enable RLS with append-only policy (INSERT only, no UPDATE/DELETE for non-admins)
- Sequence generators for: `grn_number`, `mr_number`, `transfer_number`, `stocktake_number`, `adjustment_number` — use PostgreSQL sequences per project
- Money columns: all `numeric(18,2)` — never `float` or `decimal` without precision
