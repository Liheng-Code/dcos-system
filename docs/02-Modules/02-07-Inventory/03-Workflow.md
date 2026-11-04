# Inventory / Stock Module — Workflow
**Document Code:** DCOS-WF-26-001 | **Version:** R1 | **Date:** 2026-07-27 (originally June 2026)
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

**Revision Note (R1):** Material Return workflow (Section 3) enhanced with Damage Report / Disposal steps and the return-window rule per CWIMS UC-03 / Doc 07 §7.2. Tool Issue / Return workflow (Section 8) added per CWIMS UC-07 / Doc 07 §7.4. Author: Solution Architect. Status: Draft.

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

Ref: CWIMS UC-03 / Doc 07 §7.2. Recorded as its own return header/lines record (`inv_returns` / `inv_return_lines`) — see `04-Database-Schema.md`.

```
Site identifies surplus / wrong / damaged material on site
        │
        ▼
Site Engineer / Supervisor creates Material Return (Draft)
  - References original MR (and MR line where applicable)
  - Selects items, return quantities, and reason
  - Attaches photo evidence (required if condition is expected to be Damaged/Waste)
        │
        ▼
Submits Return (Status: Submitted)
  - Notification → Storekeeper
        │
        ├──[Within return window: 30 days of issue, configurable]
        │        Valued at original issue cost
        │
        └──[Outside return window]
                 Requires Store Supervisor approval; valued at current stock
                 cost, variance posted to project cost
        │
        ▼
Storekeeper inspects (Status: Inspected)
  - Records condition per item: GOOD (Reusable) / DAMAGED / SCRAP (Waste)
        │
        ├──[GOOD]
        │        │
        │        ▼
        │  Stock re-credited to Available at issue value
        │  Reversal cost transaction posted to Cost Control (reverses WBS cost)
        │
        ├──[DAMAGED]
        │        │
        │        ▼
        │  Item moved to Damaged location/status
        │  Damage Report raised → repair / supplier claim / dispose decision
        │  If disposed: write-off adjustment raised (requires Store Supervisor approval)
        │
        └──[SCRAP]
                 │
                 ▼
           Disposal workflow (see `12-SOP.md`)
           Write-off adjustment raised (requires Store Supervisor approval)
        │
        ▼
Return Posted (Status: Posted)
  Audit + notification to Site Engineer, Store Supervisor, PM, QS
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

## 7. Tool Issue / Return Workflow

Ref: CWIMS UC-07 / Doc 07 §7.4.

```
Requester (any site staff) identifies need for a tool
        │
        ▼
Requester (or Storekeeper on their behalf) scans/selects tool in Tool Master
        │
        ├──[Tool is restricted]
        │        │
        │        ▼
        │  Supervisor approval required
        │        │
        │        ├──[Approved]──────────────────────────────►
        │        └──[Rejected]──► Requester notified, workflow ends
        │
        └──[Tool is not restricted]────────────────────────────►
                                                                  │
        ◄─────────────────────────────────────────────────────────┘
        ▼
Storekeeper issues tool to custodian
  - Records custodian, project/WBS, due date, condition-out photo
  - Status: Issued
        │
        ▼
Tool in use with custodian
  - Daily overdue check: if due date passed and not returned → Status: Overdue
  - Overdue alert to custodian + Supervisor, repeats daily until returned
        │
        ▼
Custodian returns tool — Storekeeper scans tool and records condition-in
        │
        ├──[Good]──────► Status: Returned. Tool status → Available.
        │
        ├──[Damaged]───► Status: Damaged. Damage Report raised;
        │                tool held pending repair/disposal decision.
        │
        └──[Lost]──────► Status: Lost. Loss-charge adjustment raised
                          against custodian per company policy.
```

---

## 8. Status Transition Diagrams

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

### Material Return
```
Draft ──► Submitted ──► Inspected ──► Posted (terminal)
      └──► Cancelled (terminal, from Draft or Submitted)
```

### Tool Issue
```
Pending Approval ──► Issued ──► Returned (terminal)
        │                  └──► Overdue ──► Returned (terminal)
        │                              └──► Lost (terminal)
        │                  └──► Damaged (terminal)
        └──► Rejected (terminal)
```
