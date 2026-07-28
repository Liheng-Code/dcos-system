# Inventory / Stock Module — API Specification
**Document Code:** DCOS-API-26-001 | **Version:** R1 | **Date:** 2026-07-27 (originally June 2026)
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

**Revision Note (R1):** Adds endpoints for Tools (issue/return), the formalised Returns lifecycle, Locations, and label/barcode generation, per CWIMS Appendix A.3 Stage 1+2. Item Master and Store endpoints (Sections 1–2) gain new fields (barcode, is_dg, is_batch_managed, shelf_life_days, capacity, broadened store_type). Author: Solution Architect. Status: Draft.

All endpoints require a valid Supabase JWT. `tenant_id` is extracted from `auth.jwt() ->> 'tenant_id'` — never from the request body.

Base path: `/api/inv`

---

## 1. Item Master

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/items` | List all active items (paginated, filterable by category) | All staff |
| GET | `/items/:id` | Get item detail | All staff |
| POST | `/items` | Create new item | Procurement Manager, Admin |
| PATCH | `/items/:id` | Update item | Procurement Manager, Admin |
| PATCH | `/items/:id/deactivate` | Soft-delete item | Admin |

**POST /items body:**
```json
{
  "name": "Reinforcing Bar 10mm",
  "category": "structural",
  "unit_of_measure": "kg",
  "default_cost_code": "MAT-STR-01",
  "min_stock_level": 500,
  "max_stock_level": 5000,
  "reorder_quantity": 2000,
  "lead_time_days": 7,
  "is_inspection_required": true,
  "is_dg": false,
  "is_batch_managed": false,
  "shelf_life_days": null
}
```

`barcode` is not accepted on create — call `POST /items/:id/generate-barcode` (Section 13) to assign one after creation.

---

## 2. Stores

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/stores?project_id=` | List stores for a project | All staff |
| GET | `/stores/:id` | Get store detail | All staff |
| POST | `/stores` | Create store | Project Manager, Admin |
| PATCH | `/stores/:id` | Update store | Project Manager, Admin |
| PATCH | `/stores/:id/close` | Close store | Project Manager, Admin |

**POST /stores body:**
```json
{
  "project_id": "uuid",
  "store_code": "STR-PRJ01-002",
  "name": "Yard Store — Laydown Area B",
  "store_type": "yard",
  "location_description": "North laydown yard, Gate 2",
  "responsible_user_id": "uuid",
  "capacity_qty": 500,
  "capacity_uom": "m2"
}
```
`store_type` accepts `central`, `site`, `temporary`, `yard`, `dg` (broadened from the original `main`/`sub`/`temporary`).

---

## 3. Stock Balances

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/stock?project_id=&store_id=` | Get current stock by store (optionally filtered by item, category) | All staff |
| GET | `/stock/:store_id/:item_id` | Get stock for a specific item in a store | All staff |
| GET | `/stock/low-stock?project_id=` | List all items at or below reorder point | Storekeeper, Supervisor, PM |

---

## 4. Goods Received Notes (GRN)

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/grns?project_id=&status=` | List GRNs for project | All staff |
| GET | `/grns/:id` | GRN detail with lines | All staff |
| POST | `/grns` | Create draft GRN | Storekeeper |
| PATCH | `/grns/:id` | Update draft GRN | Storekeeper |
| POST | `/grns/:id/confirm` | Confirm GRN → update stock | Storekeeper |
| POST | `/grns/:id/cancel` | Cancel GRN | Storekeeper, Store Supervisor |
| POST | `/grns/:grn_id/lines/:line_id/inspect` | Submit QAQC inspection result for a line | QAQC Engineer |

**POST /grns body:**
```json
{
  "project_id": "uuid",
  "store_id": "uuid",
  "po_id": "uuid",
  "supplier_delivery_note": "DN-2026-001",
  "vehicle_plate": "PP-1234-A",
  "driver_name": "Sok Dara",
  "received_date": "2026-06-15",
  "lines": [
    {
      "item_id": "uuid",
      "po_line_id": "uuid",
      "quantity_received": 1500,
      "unit_cost": 1.25,
      "batch_number": "BATCH-2026-001",
      "condition_notes": "Good condition, sealed bags"
    }
  ]
}
```

**POST /grns/:grn_id/lines/:line_id/inspect body:**
```json
{
  "inspection_status": "approved",
  "inspection_notes": "Complies with BS 4449. Certificate on file."
}
```

---

## 5. Material Requisitions (Issue)

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/mrs?project_id=&status=` | List MRs for project | All staff |
| GET | `/mrs/:id` | MR detail with lines | All staff |
| POST | `/mrs` | Create draft MR | Site Engineer, Supervisor |
| PATCH | `/mrs/:id` | Update draft MR | Site Engineer (own) |
| POST | `/mrs/:id/submit` | Submit for approval | Site Engineer |
| POST | `/mrs/:id/approve` | Approve MR | Site Supervisor, Project Manager |
| POST | `/mrs/:id/reject` | Reject MR | Site Supervisor, Project Manager |
| POST | `/mrs/:id/issue` | Confirm physical issue | Storekeeper |
| POST | `/mrs/:id/cancel` | Cancel MR | Site Engineer, Supervisor, PM |

**POST /mrs body:**
```json
{
  "project_id": "uuid",
  "store_id": "uuid",
  "wbs_node_id": "uuid",
  "task_id": "uuid",
  "cost_code": "MAT-STR-01",
  "required_date": "2026-06-20",
  "lines": [
    {
      "item_id": "uuid",
      "quantity_requested": 300
    }
  ]
}
```

**POST /mrs/:id/issue body:**
```json
{
  "lines": [
    {
      "mr_line_id": "uuid",
      "quantity_issued": 280
    }
  ]
}
```

---

## 6. Material Returns to Store

Header/lines persisted in `inv_returns` / `inv_return_lines` (see `04-Database-Schema.md`). Lifecycle: Draft → Submitted → Inspected → Posted (CWIMS UC-03 / Doc 07 §7.8).

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/returns?project_id=&status=` | List material returns | All staff |
| GET | `/returns/:id` | Return detail with lines | All staff |
| POST | `/returns` | Create draft return | Site Engineer, Supervisor, Storekeeper |
| PATCH | `/returns/:id` | Update draft return | Site Engineer (own), Storekeeper |
| POST | `/returns/:id/submit` | Submit for inspection | Site Engineer, Supervisor |
| POST | `/returns/:id/inspect` | Storekeeper records condition per line | Storekeeper |
| POST | `/returns/:id/approve-window` | Store Supervisor approves an out-of-return-window return | Store Supervisor |
| POST | `/returns/:id/post` | Post return — re-credits reusable lines, raises write-off adjustment for damaged/waste lines | Storekeeper, Store Supervisor |
| POST | `/returns/:id/cancel` | Cancel return before inspection | Site Engineer, Supervisor, Storekeeper |

**POST /returns body:**
```json
{
  "project_id": "uuid",
  "store_id": "uuid",
  "original_mr_id": "uuid",
  "return_reason": "Excess from task completion",
  "lines": [
    {
      "mr_line_id": "uuid",
      "item_id": "uuid",
      "quantity_returned": 20
    }
  ]
}
```

**POST /returns/:id/inspect body:**
```json
{
  "lines": [
    {
      "return_line_id": "uuid",
      "condition": "reusable",
      "condition_notes": "Unopened bags, good condition"
    },
    {
      "return_line_id": "uuid",
      "condition": "damaged",
      "condition_notes": "Torn bags, wet"
    }
  ]
}
```
`evidence_document_ids` on the return header is required before `inspect` can be submitted if any line's condition is `damaged` or `waste`.

---

## 7. Transfers

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/transfers?project_id=` | List transfers involving project | All staff |
| GET | `/transfers/:id` | Transfer detail | All staff |
| POST | `/transfers` | Create transfer request | Store Supervisor |
| POST | `/transfers/:id/approve` | Approve (source / destination) | Store Supervisor |
| POST | `/transfers/:id/dispatch` | Mark as dispatched | Storekeeper (source) |
| POST | `/transfers/:id/receive` | Confirm receipt | Storekeeper (destination) |
| POST | `/transfers/:id/reject` | Reject transfer | Store Supervisor |

---

## 8. Return to Supplier

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/supplier-returns?project_id=` | List supplier returns | All staff |
| GET | `/supplier-returns/:id` | Detail | All staff |
| POST | `/supplier-returns` | Create return | Storekeeper, Store Supervisor |
| POST | `/supplier-returns/:id/approve` | Approve | Store Supervisor |
| POST | `/supplier-returns/:id/confirm-dispatch` | Confirm physical return | Storekeeper |

---

## 9. Stock Adjustments

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/adjustments?project_id=` | List adjustments | All staff |
| GET | `/adjustments/:id` | Adjustment detail | All staff |
| POST | `/adjustments` | Create adjustment (pending approval) | Storekeeper, Store Supervisor |
| POST | `/adjustments/:id/approve` | Approve adjustment | Store Supervisor |
| POST | `/adjustments/:id/reject` | Reject adjustment | Store Supervisor |

---

## 10. Physical Stock Take

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/stocktakes?project_id=` | List stock takes | All staff |
| GET | `/stocktakes/:id` | Stock take detail with lines | All staff |
| POST | `/stocktakes` | Initiate stock take (locks store) | Store Supervisor |
| POST | `/stocktakes/:id/submit-count` | Submit counted quantities | Storekeeper |
| POST | `/stocktakes/:id/approve-line` | Approve individual variance line | Store Supervisor |
| POST | `/stocktakes/:id/complete` | Complete and post adjustments | Store Supervisor |
| POST | `/stocktakes/:id/cancel` | Cancel stock take (unlocks store) | Store Supervisor |

---

## 11. Movement Ledger

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/movements?store_id=&item_id=&from_date=&to_date=` | Movement history for an item in a store | All staff |
| GET | `/movements/export?project_id=` | Export full movement log (CSV) | QS, PM, Admin |

---

## 12. Reports (read-only)

| Method | Path | Purpose |
|---|---|---|
| GET | `/reports/stock-summary?project_id=` | Current stock summary by store and category |
| GET | `/reports/consumption?project_id=&from_date=&to_date=` | Material consumption by WBS node and cost code |
| GET | `/reports/aging?project_id=` | Items with no movement in > 30/60/90 days |
| GET | `/reports/low-stock?project_id=` | Items at or below reorder point |
| GET | `/reports/cost-posting?project_id=&from_date=&to_date=` | Cost transactions by cost code (for Cost Control reconciliation) |

---

## 13. Tools (Custody Tracking)

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/tools?status=&project_id=` | List tools | All staff |
| GET | `/tools/:id` | Tool detail, including current custody if issued | All staff |
| POST | `/tools` | Create tool | Admin, Store Supervisor |
| PATCH | `/tools/:id` | Update tool | Admin, Store Supervisor |
| PATCH | `/tools/:id/deactivate` | Deactivate tool (blocked if an issue is open) | Admin |
| GET | `/tool-issues?project_id=&status=&custodian_id=` | List tool issue/return records | All staff |
| GET | `/tool-issues/:id` | Tool issue detail | All staff |
| POST | `/tool-issues` | Request/issue a tool to a custodian | Storekeeper, Requester |
| POST | `/tool-issues/:id/approve` | Approve a restricted-tool issue request | Supervisor |
| POST | `/tool-issues/:id/reject` | Reject a restricted-tool issue request | Supervisor |
| POST | `/tool-issues/:id/return` | Record return and condition-in | Storekeeper |
| POST | `/tool-issues/:id/mark-lost` | Mark tool lost, raise loss-charge adjustment | Storekeeper, Store Supervisor |

**POST /tools body:**
```json
{
  "tool_code": "TL-DRL-0107",
  "name": "Hilti Rotary Hammer Drill",
  "serial_number": "SN-88213",
  "category": "power_tool",
  "purchase_value": 450.00,
  "is_restricted": false,
  "home_store_id": "uuid"
}
```

**POST /tool-issues body:**
```json
{
  "tool_id": "uuid",
  "project_id": "uuid",
  "wbs_node_id": "uuid",
  "custodian_id": "uuid",
  "due_date": "2026-08-05",
  "condition_out_notes": "Good condition, full case, charger included",
  "condition_out_document_id": "uuid"
}
```
If `inv_tools.is_restricted = true`, status is set to `pending_approval` and the tool is not released to the custodian until `POST /tool-issues/:id/approve` succeeds.

**POST /tool-issues/:id/return body:**
```json
{
  "condition_in": "good",
  "condition_in_document_id": "uuid",
  "condition_notes": "Returned in working order"
}
```

---

## 14. Locations

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/locations?store_id=` | List locations for a store (flat or tree) | All staff |
| GET | `/locations/:id` | Location detail | All staff |
| POST | `/locations` | Create location | Admin, Project Manager, Store Supervisor |
| PATCH | `/locations/:id` | Update location | Admin, Project Manager, Store Supervisor |
| PATCH | `/locations/:id/deactivate` | Deactivate (blocked if stock or open GRN/transfer/tool issue references it) | Admin, Project Manager |

**POST /locations body:**
```json
{
  "store_id": "uuid",
  "parent_location_id": "uuid",
  "location_code": "Z01-A03-R02-B15",
  "location_type": "bin",
  "is_dg_allowed": false,
  "capacity_qty": 200,
  "capacity_uom": "bags"
}
```

---

## 15. Labels / Barcode / QR

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| POST | `/items/:id/generate-barcode` | Generate/assign a barcode/QR value to an item | Procurement Manager, Admin |
| POST | `/locations/:id/generate-barcode` | Generate/assign a QR value to a location | Admin, Store Supervisor |
| POST | `/tools/:id/generate-barcode` | Generate/assign a QR value to a tool | Admin, Store Supervisor |
| GET | `/labels/print?type=item\|location\|tool&ids=` | Generate a printable label batch (Code-128 for items/locations, QR for tools) | Storekeeper, Store Supervisor, Admin |
| POST | `/scan/resolve` | Resolve a scanned barcode/QR value to its entity — used by scan-driven data entry on GRN, MR issue, tool issue/return | All staff |

**POST /scan/resolve body:**
```json
{
  "code": "signed-qr-payload-or-barcode-value"
}
```
**Response:** entity type, entity id, and display fields, or a `INV_TENANT_SCOPE_VIOLATION` error if the code's tenant checksum does not match the caller's tenant. Every label reprint via `/labels/print` is audit-logged (who, when, which records).

---

## Error Responses

All endpoints return standard DCOS error envelope:

```json
{
  "error": {
    "code": "INV_NEGATIVE_STOCK",
    "message": "Issued quantity (300) exceeds available stock (280) for item Rebar 10mm",
    "details": {
      "item_id": "uuid",
      "available": 280,
      "requested": 300
    }
  }
}
```

**Common error codes:**

| Code | Meaning |
|---|---|
| `INV_NEGATIVE_STOCK` | Issue would result in negative stock |
| `INV_STORE_LOCKED` | Store is locked for stock take |
| `INV_PO_NOT_FOUND` | GRN references a non-existent or non-approved PO |
| `INV_OVER_PO_QUANTITY` | GRN quantity exceeds remaining PO balance |
| `INV_QUARANTINE_ISSUE` | Attempted issue from quarantined stock |
| `INV_INVALID_TRANSITION` | Invalid status transition |
| `INV_APPROVAL_REQUIRED` | Action requires approval not yet granted |
| `INV_TENANT_SCOPE_VIOLATION` | Scanned barcode/QR resolves to a record in a different tenant — request rejected, not resolved |
| `INV_TOOL_ALREADY_ISSUED` | Tool has an open (unreturned) issue and cannot be issued to another custodian |
| `INV_TOOL_APPROVAL_REQUIRED` | Restricted tool cannot be released until Supervisor approval is granted |
| `INV_RETURN_WINDOW_EXCEEDED` | Return submitted after the configured return window; requires Store Supervisor approval before posting |
