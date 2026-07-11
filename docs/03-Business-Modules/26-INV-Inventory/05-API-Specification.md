# Inventory / Stock Module — API Specification
**Document Code:** DCOS-API-26-001 | **Version:** R0 | **Date:** June 2026
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

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
  "is_inspection_required": true
}
```

---

## 2. Stores

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/stores?project_id=` | List stores for a project | All staff |
| GET | `/stores/:id` | Get store detail | All staff |
| POST | `/stores` | Create store | Project Manager, Admin |
| PATCH | `/stores/:id` | Update store | Project Manager, Admin |
| PATCH | `/stores/:id/close` | Close store | Project Manager, Admin |

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

| Method | Path | Purpose | Auth Role |
|---|---|---|---|
| GET | `/returns?project_id=` | List material returns | All staff |
| GET | `/returns/:id` | Return detail | All staff |
| POST | `/returns` | Create return | Site Engineer, Supervisor, Storekeeper |
| POST | `/returns/:id/confirm` | Storekeeper confirms receipt and condition | Storekeeper |

**POST /returns body:**
```json
{
  "project_id": "uuid",
  "store_id": "uuid",
  "original_mr_id": "uuid",
  "lines": [
    {
      "mr_line_id": "uuid",
      "item_id": "uuid",
      "quantity_returned": 20,
      "condition": "reusable",
      "return_reason": "Excess from task completion"
    }
  ]
}
```

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
