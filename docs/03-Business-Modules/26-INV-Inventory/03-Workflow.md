# Inventory / Stock Module — Workflow
**Document Code:** DCOS-WF-26-001 | **Version:** R0 | **Date:** June 2026
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

---

## 1. Goods Received Note (GRN) Workflow

```
[Procurement PO Approved]
        │
        ▼
Supplier delivers to site store
        │
        ▼
Storekeeper creates GRN
  - References PO number
  - Enters delivery note number
  - Enters received quantities per line
  - Notes condition / damage observed
  - Attaches delivery documentation (photo or scan)
        │
        ├──[No inspection required]──────────────────────────────►
        │                                                          │
        ├──[Inspection required per item or PO flag]              │
        │        │                                                 │
        │        ▼                                                 │
        │  Stock status = Under Inspection                         │
        │  Notification → QAQC Engineer                           │
        │        │                                                 │
        │        ├──[QAQC Approved]──►  Status = Available  ──────►
        │        │                                                 │
        │        └──[QAQC Rejected]──►  Return-to-Supplier        │
        │                              record created             │
        │                              Stock NOT added            │
        ▼                                                          │
  GRN Confirmed ◄─────────────────────────────────────────────────┘
        │
        ▼
  Stock balance updated (Available)
  Cost commitment posted to Cost Control
  GRN document filed to Document Engine
```

---

## 2. Material Requisition (Issue) Workflow

```
Site Engineer identifies material need for task
        │
        ▼
Raises Material Requisition (MR)
  - Selects project, WBS node, task
  - Selects cost code
  - Lists items and quantities required
  - Sets required date
  - Status: Draft
        │
        ▼
Submits MR for approval
  - Status: Submitted
  - Notification → Site Supervisor / Project Engineer
        │
        ├──[Sufficient stock available]
        │        │
        │        ▼
        │  Approver reviews and approves
        │  Status: Approved
        │        │
        │        ▼
        │  Storekeeper notified
        │  Storekeeper picks and issues materials physically
        │  Confirms issue quantities in system
        │  Status: Issued / Partially Issued
        │        │
        │        ▼
        │  Stock balance reduced
        │  Cost transaction posted → Cost Control
        │  WBS cost updated
        │
        ├──[Insufficient stock]
        │        │
        │        ▼
        │  System flags low/no stock warning
        │  Approver can:
        │    → Reject MR (request smaller quantity)
        │    → Approve partial quantity
        │    → Approve full (auto-triggers low-stock alert + draft PR)
        │
        └──[Rejected]
                 │
                 ▼
           Site Engineer notified with rejection reason
           Can revise and resubmit or cancel
```

---

## 3. Material Return to Store Workflow

```
Site Engineer / Supervisor identifies unused materials on site
        │
        ▼
Raises Material Return (references original MR)
  - Selects items and return quantities
  - Provides reason for return
        │
        ▼
Storekeeper receives returned materials
  - Inspects condition
  - Records condition per item: Reusable / Damaged / Waste
        │
        ├──[All Reusable]
        │        │
        │        ▼
        │  Stock added back to Available
        │  Reversal cost transaction posted to Cost Control
        │
        ├──[Damaged or Waste portion]
        │        │
        │        ▼
        │  Write-off record created for damaged/waste portion
        │  Write-off requires Store Supervisor approval
        │        │
        │        ├──[Approved]──► Write-off posted, cost written off
        │        │
        │        └──[Rejected]──► Reason recorded, Storekeeper to re-inspect
        │
        └──[Mixed: Reusable + Damaged]
                 Both paths followed for respective quantities
```

---

## 4. Inter-Store Transfer Workflow

```
Store Supervisor (Source) identifies transfer need
        │
        ▼
Creates Transfer Request
  - Source store, destination store
  - Items and quantities
  - Transfer reason
  - Status: Pending
        │
        ├──[Intra-project: same project, different stores]
        │        │
        │        ▼
        │  Store Supervisor approves own request (or Project Manager)
        │  Status: Approved
        │
        └──[Inter-project: different projects]
                 │
                 ▼
           Notification → Destination Store Supervisor
           Destination approves transfer
           Status: Approved
                 │
                 ▼
Source Storekeeper picks and physically dispatches materials
Confirms dispatch in system
Source stock deducted → Status: In Transit
        │
        ▼
Destination Storekeeper receives materials
  - Confirms received quantity
        │
        ├──[Quantity matches]──► Status: Received
        │                        Destination stock increased
        │                        Cost adjustment posted both sides
        │
        └──[Quantity discrepancy]──► Status: Discrepancy
                                     Both supervisors notified
                                     Discrepancy resolved (approved by PM)
                                     Adjustment posted per agreed quantities
```

---

## 5. Physical Stock Take Workflow

```
Store Supervisor initiates Stock Take for a store
        │
        ▼
Store LOCKED — no movements in/out until complete
Notification to all users with pending transactions for this store
        │
        ▼
System generates Count Sheet
  - All items currently in system with system quantity hidden
  - Physical count quantity field blank
        │
        ▼
Storekeeper(s) physically count all items
Enter physical quantities into system
        │
        ▼
System calculates variance per item
  (Physical − System = Variance, and Variance %)
        │
        ├──[All variances within tolerance]
        │        │
        │        ▼
        │  Auto-approved
        │
        └──[Variances exceed tolerance]
                 │
                 ▼
           Store Supervisor reviews variances
           Provides explanation per line
           Approves or rejects individual line adjustments
                 │
                 ▼
Adjustments posted to system balances
Stock Take record sealed (immutable)
Store UNLOCKED
Adjustment transactions posted to Cost Control
Report generated and saved to Document Engine
```

---

## 6. Material Return to Supplier Workflow

```
QAQC Rejects material OR Storekeeper identifies defect/over-delivery
        │
        ▼
Storekeeper raises Return-to-Supplier (RTS)
  - References GRN and PO
  - Lists items and quantities to return
  - Selects reason: Defective / Over-delivery / Wrong Item / QAQC Rejection
  - Attaches supporting photos/documents
        │
        ▼
Store Supervisor approves RTS
        │
        ▼
Materials physically loaded and returned to supplier
Storekeeper uploads signed Delivery Return Note (DRN)
Confirms physical return in system
        │
        ▼
Stock deducted from inventory
Credit note request sent to Procurement / Accounting module
GRN marked with partial return notation
```

---

## 7. Status Transition Diagrams

### GRN
```
Draft ──► Confirmed (terminal)
      └─► Cancelled (terminal)
```

### Material Requisition
```
Draft ──► Submitted ──► Approved ──► Issued (terminal)
                    │            └─► Partially Issued ──► Issued (terminal)
                    │            └─► Cancelled
                    ├──► Rejected (terminal)
                    └──► Cancelled
       └──────────────────────────────────► Cancelled (from Draft)
```

### Transfer
```
Pending ──► Approved ──► In Transit ──► Received (terminal)
        │            │              └─► Discrepancy ──► Resolved (terminal)
        └──► Rejected │
             (terminal)└──► Cancelled
```

### Stock Take
```
Open ──► Counting ──► Pending Approval ──► Completed (terminal)
                  └───────────────────────► Cancelled (terminal)
```
