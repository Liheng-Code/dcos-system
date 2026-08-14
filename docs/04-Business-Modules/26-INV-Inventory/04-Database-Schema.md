# Inventory / Stock Module — Database Schema
**Document Code:** DCOS-DB-26-001 | **Version:** R1 | **Date:** 2026-07-27 (originally June 2026)
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

**Revision Note (R1):** Adds tables for CWIMS Appendix A.3 Stage 1+2 gap items — `inv_locations`, `inv_returns` / `inv_return_lines`, `inv_tools` / `inv_tool_issues`, `inv_notifications` — plus new columns on `inv_items` and `inv_stores`. These tables are being implemented by a parallel database-engineer migration; this section documents the target design. Author: Solution Architect. Status: Draft.

**Naming note:** the tables actually implemented in `supabase/migrations/20260621000001_create_inv_module_tables.sql` use the `inv_` prefix (e.g. `inv_items`, `inv_stores`, `inv_grns`) rather than the `inventory_` prefix shown in the table headers below (an earlier naming-convention drift in this document that predates this revision). All **new** tables and columns added in this revision use the implemented `inv_` prefix to match the actual schema. When reading the pre-existing tables below, treat `inventory_items` as `inv_items`, `inventory_stores` as `inv_stores`, and so on.

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
| barcode | text | UNIQUE per tenant, nullable | System-assigned Code-128 barcode / QR value (CWIMS FR-014) |
| is_dg | boolean | NOT NULL, default false | Dangerous-goods flag — captured this phase for readiness; DG compliance workflow itself is deferred to a later phase |
| is_batch_managed | boolean | NOT NULL, default false | Marks item for batch/lot capture at GRN — captured this phase for readiness; batch-level FIFO/FEFO picking and traceability are deferred to a later phase |
| shelf_life_days | integer | | Shelf life for expiry tracking — captured this phase for readiness; FEFO enforcement and expiry alerts are deferred to a later phase |
| created_by | uuid | FK → auth.users(id) | |
| updated_by | uuid | FK → auth.users(id) | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id)`, `(tenant_id, item_code)`, `(tenant_id, category)`, `(tenant_id, barcode)`
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
| store_type | text | NOT NULL | CHECK (store_type in ('central','site','temporary','yard','dg')) — broadened from the original (`main`,`sub`,`temporary`) per CWIMS Doc 11 §11.1 (five facility types) |
| location_description | text | | Physical location on site |
| responsible_user_id | uuid | FK → auth.users(id) | Storekeeper in charge |
| capacity_qty | numeric(18,4) | | Declared store capacity (informational warning, not a hard block, this phase) |
| capacity_uom | text | | Unit of measure for capacity_qty |
| status | text | NOT NULL | CHECK (status in ('active','closed')) |
| created_by | uuid | FK → auth.users(id) | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, project_id)`, `(tenant_id, store_code)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
**Migration note:** existing rows with `store_type = 'main'` map to `'central'` and `store_type = 'sub'` map to `'site'` under the broadened enum; the CHECK constraint is replaced after the data backfill.

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

### Table: `inv_locations`
**Purpose:** Bin/location hierarchy within a store (Zone → Aisle → Rack → Bin). New for CWIMS Stage 2 — F13, CWIMS Doc 11 §11.1 `locations` master table.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| store_id | uuid | NOT NULL, FK → inv_stores(id) | |
| parent_location_id | uuid | FK → inv_locations(id), nullable | Self-referencing — null for top-level Zones |
| location_code | text | NOT NULL | e.g. `Z01-A03-R02-B15` |
| location_type | text | NOT NULL | CHECK (location_type in ('zone','aisle','rack','bin')) |
| is_dg_allowed | boolean | NOT NULL, default false | May hold dangerous-goods items — flag only; DG enforcement is a later-phase workflow |
| capacity_qty | numeric(18,4) | | Declared capacity (informational warning, not a hard block, this phase) |
| capacity_uom | text | | |
| status | text | NOT NULL, default 'active' | CHECK (status in ('active','inactive')) |
| created_by | uuid | FK → auth.users(id) | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Unique:** `(store_id, location_code)`
**Indexes:** `(tenant_id, store_id)`, `(tenant_id, parent_location_id)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
**Note:** Stock balances remain tracked at store level in `inv_stock` this phase (BR-F13-05, `02-Functional-Specification.md`). Location references on GRN/transfer lines this phase are put-away records only, not a balance dimension. Bin-level balance tracking is a later-phase enhancement.

---

### Table: `inv_returns`
**Purpose:** Header for Material Return to Store — formalises the return document (condition, evidence, inspection) previously implied only by movement/write-off records. New for CWIMS Stage 2 — F5 (enhanced), CWIMS UC-03 / Doc 07 §7.2.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| project_id | uuid | NOT NULL, FK → projects(id) | |
| store_id | uuid | NOT NULL, FK → inv_stores(id) | |
| return_number | text | NOT NULL, UNIQUE per project | e.g. RET-PRJ01-0001 |
| original_mr_id | uuid | NOT NULL, FK → inv_material_requisitions(id) | |
| return_reason | text | NOT NULL | |
| status | text | NOT NULL, default 'draft' | CHECK (status in ('draft','submitted','inspected','posted','cancelled')) |
| is_outside_return_window | boolean | NOT NULL, default false | Set when submitted > 30 days (configurable) after original issue — BR-F5-07 |
| evidence_document_ids | uuid[] | | Photo evidence; required when any line condition is damaged/waste |
| requested_by | uuid | NOT NULL, FK → auth.users(id) | Site Engineer/Supervisor |
| inspected_by | uuid | FK → auth.users(id) | Storekeeper |
| inspected_at | timestamptz | | |
| window_approved_by | uuid | FK → auth.users(id) | Store Supervisor — required only when is_outside_return_window = true |
| window_approved_at | timestamptz | | |
| posted_by | uuid | FK → auth.users(id) | |
| posted_at | timestamptz | | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, project_id)`, `(tenant_id, original_mr_id)`, `(tenant_id, status)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inv_return_lines`
**Purpose:** Line items for each Material Return, with condition and cost impact.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| return_id | uuid | NOT NULL, FK → inv_returns(id) | |
| mr_line_id | uuid | FK → inv_mr_lines(id) | |
| item_id | uuid | NOT NULL, FK → inv_items(id) | |
| quantity_returned | numeric(18,4) | NOT NULL, CHECK (quantity_returned > 0) | Cannot exceed original quantity_issued on the referenced MR line |
| condition | text | NOT NULL | CHECK (condition in ('reusable','damaged','waste')) |
| unit_cost | numeric(18,2) | | Original issue cost, or current cost if outside return window |
| cost_impact | numeric(18,2) | | Reversal credit (reusable) or write-off value (damaged/waste), signed |
| write_off_adjustment_id | uuid | FK → inv_adjustments(id) | Set when condition is damaged/waste and a write-off adjustment is raised |
| condition_notes | text | | |
| created_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, return_id)`, `(tenant_id, item_id)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inv_tools`
**Purpose:** Tool Master — serialised, returnable hand tools tracked by custody. New for CWIMS Stage 2 — F11, CWIMS UC-07 / FR-012, Doc 11 §11.1 `tools` master table. Distinct from plant/equipment (Module 30, EQP — deferred to a later phase).

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| tool_code | text | NOT NULL, UNIQUE per tenant | e.g. TL-DRL-0107 |
| name | text | NOT NULL | |
| serial_number | text | UNIQUE per tenant, nullable | |
| category | text | | |
| purchase_value | numeric(18,2) | | For loss-charge calculation |
| is_restricted | boolean | NOT NULL, default false | Requires Supervisor approval before issue |
| home_store_id | uuid | FK → inv_stores(id) | Store the tool is issued from / returned to |
| status | text | NOT NULL, default 'available' | CHECK (status in ('available','issued','maintenance','lost','disposed')) |
| is_active | boolean | NOT NULL, default true | Soft-delete flag — cannot deactivate while an issue is open (BR-F11-07) |
| created_by | uuid | FK → auth.users(id) | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id)`, `(tenant_id, tool_code)`, `(tenant_id, status)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

---

### Table: `inv_tool_issues`
**Purpose:** Custody chain for tools — one open (unreturned) row per tool at any time (BR-F11-02).

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| tool_id | uuid | NOT NULL, FK → inv_tools(id) | |
| project_id | uuid | NOT NULL, FK → projects(id) | |
| wbs_node_id | uuid | FK → wbs_nodes(id) | Optional |
| custodian_id | uuid | NOT NULL, FK → auth.users(id) | Requester who holds the tool |
| issued_by | uuid | NOT NULL, FK → auth.users(id) | Storekeeper |
| issued_at | timestamptz | NOT NULL, default now() | |
| due_date | date | NOT NULL | |
| condition_out_notes | text | | |
| condition_out_document_id | uuid | | Photo at issue |
| requires_approval | boolean | NOT NULL, default false | Copied from `inv_tools.is_restricted` at issue time |
| approved_by | uuid | FK → auth.users(id) | Supervisor — required when requires_approval = true |
| approved_at | timestamptz | | |
| status | text | NOT NULL, default 'issued' | CHECK (status in ('pending_approval','issued','overdue','returned','damaged','lost','rejected')) |
| returned_at | timestamptz | | |
| received_by | uuid | FK → auth.users(id) | Storekeeper who processed the return |
| condition_in | text | | CHECK (condition_in in ('good','damaged','lost')) |
| condition_in_document_id | uuid | | Photo at return |
| loss_charge_amount | numeric(18,2) | | Set when condition_in = 'lost' |
| loss_charge_adjustment_id | uuid | FK → inv_adjustments(id) | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, tool_id)`, `(tenant_id, custodian_id)`, `(tenant_id, project_id)`, `(tenant_id, status)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
**Constraint:** partial unique index on `(tool_id) WHERE status in ('pending_approval','issued','overdue')` enforces one open issue per tool.

---

### Table: `inv_notifications`
**Purpose:** Per-module notification event record for the INV module — follows the same pattern as `inv_audit_log` (a module-local, append-only table) rather than duplicating the shared DCOS Notification Engine. Records that a CWIMS-defined event fired, for which entity, at what priority, to which recipients; the shared Notification Engine (Module 11, NTF) performs actual delivery across channels. See `08-Notification-Matrix.md` for the full event catalogue.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | NOT NULL | RLS isolation |
| event_type | text | NOT NULL | CHECK (event_type in ('low_stock','out_of_stock','approval_required','grn_posted','mr_approved','transfer_dispatched','transfer_overdue','return_posted','adjustment_posted','count_variance','overdue_tool_return')) |
| entity_type | text | NOT NULL | 'grn' / 'mr' / 'transfer' / 'return' / 'adjustment' / 'stocktake' / 'tool_issue' / 'item' |
| entity_id | uuid | NOT NULL | |
| project_id | uuid | FK → projects(id) | |
| priority | text | NOT NULL | CHECK (priority in ('low','normal','medium','high','critical')) |
| recipient_ids | uuid[] | NOT NULL | Profile ids notified |
| channels | text[] | NOT NULL | e.g. `{in_app,email,telegram}` |
| message | text | NOT NULL | |
| sent_at | timestamptz | NOT NULL, default now() | |
| created_at | timestamptz | NOT NULL, default now() | |

**Indexes:** `(tenant_id, event_type)`, `(tenant_id, entity_type, entity_id)`, `(tenant_id, project_id)`
**RLS:** `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`

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
inv_locations            → inv_stores (self-referencing hierarchy: zone → aisle → rack → bin)
inv_returns              → inv_stores + inv_material_requisitions
inv_return_lines         → inv_returns + inv_mr_lines + inv_items (+ inv_adjustments on write-off)
inv_tools                → inv_stores (home store)
inv_tool_issues          → inv_tools + projects + wbs_nodes + auth.users (custodian) (+ inv_adjustments on loss)
inv_notifications        → polymorphic (entity_type + entity_id) — no FK, matches audit-log pattern
```

---

## Migration Notes

- Create `inventory_items` before `inventory_stock` (FK dependency)
- Create `inventory_stores` before `inventory_stock`, `inventory_grns`, `inventory_material_requisitions`
- `inventory_movements` is the audit ledger — enable RLS with append-only policy (INSERT only, no UPDATE/DELETE for non-admins)
- Sequence generators for: `grn_number`, `mr_number`, `transfer_number`, `stocktake_number`, `adjustment_number` — use PostgreSQL sequences per project
- Money columns: all `numeric(18,2)` — never `float` or `decimal` without precision
- **R1 additions:** Create `inv_locations` after `inv_stores`. Create `inv_returns`/`inv_return_lines` after `inv_material_requisitions`/`inv_mr_lines`. Create `inv_tools` after `inv_stores`; create `inv_tool_issues` after `inv_tools`. `inv_notifications` has no hard FKs (polymorphic, like `inv_audit_log`) so it can be created any time after `inv_stores`/`projects` exist.
- Backfill `inv_stores.store_type` (`main`→`central`, `sub`→`site`) before applying the broadened CHECK constraint.
- Sequence generator for `return_number` — same per-project pattern as `grn_number`/`mr_number`. `tool_code` is tenant-wide, not per-project.
- Add a partial unique index on `inv_tool_issues(tool_id) WHERE status in ('pending_approval','issued','overdue')` to enforce one open custody record per tool (BR-F11-02).
