# Inventory / Stock Module — UI/UX Design
**Document Code:** DCOS-UI-26-001 | **Version:** R0 | **Date:** June 2026
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

---

## 1. Screen Inventory

| # | Screen Name | Primary User | Route |
|---|---|---|---|
| S1 | Inventory Dashboard | PM, QS, Store Supervisor | `/dashboard/inventory` |
| S2 | Stock Balance List | Storekeeper, All staff | `/dashboard/inventory/stock` |
| S3 | Item Master List | Admin, Procurement | `/dashboard/inventory/items` |
| S4 | Item Master Detail / Create / Edit | Admin, Procurement | `/dashboard/inventory/items/[id]` |
| S5 | Store Management | Admin, PM | `/dashboard/inventory/stores` |
| S6 | GRN List | Storekeeper, PM | `/dashboard/inventory/grns` |
| S7 | GRN Create / Detail | Storekeeper | `/dashboard/inventory/grns/[id]` |
| S8 | Material Requisition List | All staff | `/dashboard/inventory/mrs` |
| S9 | Material Requisition Create | Site Engineer | `/dashboard/inventory/mrs/new` |
| S10 | Material Requisition Detail / Approval | Supervisor, Storekeeper | `/dashboard/inventory/mrs/[id]` |
| S11 | Material Return List | Storekeeper, Site Engineer | `/dashboard/inventory/returns` |
| S12 | Material Return Detail | Storekeeper | `/dashboard/inventory/returns/[id]` |
| S13 | Transfer List | Supervisor | `/dashboard/inventory/transfers` |
| S14 | Transfer Create / Detail | Supervisor, Storekeeper | `/dashboard/inventory/transfers/[id]` |
| S15 | Return to Supplier List / Detail | Storekeeper, Supervisor | `/dashboard/inventory/supplier-returns` |
| S16 | Adjustment List / Detail | Store Supervisor | `/dashboard/inventory/adjustments` |
| S17 | Stock Take List | Supervisor | `/dashboard/inventory/stocktakes` |
| S18 | Stock Take Detail / Count Entry | Storekeeper, Supervisor | `/dashboard/inventory/stocktakes/[id]` |
| S19 | Movement Ledger | QS, PM, Auditor | `/dashboard/inventory/movements` |
| S20 | Low Stock Alert Panel | Storekeeper, Procurement | `/dashboard/inventory/alerts` |

---

## 2. Screen Layouts

### S1 — Inventory Dashboard

**Layout:** Summary cards (top row) + two charts + action shortcuts

**Summary Cards (top row):**
- Total Stock Value (this project) — large figure, formatted as currency
- Items Below Reorder Point — number with orange badge if > 0
- Pending GRNs to Confirm — count with link
- Pending MRs to Approve — count with link
- Pending Transfers — count
- Stock Take In Progress — indicator (red if locked)

**Charts (second row):**
- Left: Top 10 Materials by Value (horizontal bar chart)
- Right: Material Consumption by WBS Node (last 30 days — stacked bar)

**Quick Actions:**
- [+ Create GRN] [+ Create MR] [View Low Stock] [Start Stock Take]

**Table (below charts):** Recent Movements — last 20 movements with item, movement type, quantity, WBS, date

---

### S2 — Stock Balance List

**Layout:** Filter bar + data table

**Filters:** Project (dropdown), Store (dropdown), Category (multi-select), Status (Available / Under Inspection / Quarantined), Low Stock Only (toggle)

**Table columns:**
| Item Code | Item Name | Category | UoM | Available | Reserved | Under Inspection | Reorder Point | Status | Last Movement |

**Row colour rules:**
- Red background: Available quantity = 0
- Orange background: Available ≤ Reorder Point
- Normal: Available > Reorder Point

**Row actions:** [View Movements] [Create MR] [Create Adjustment]

**Empty state:** "No stock records for this project/store. GRNs will populate stock once confirmed."

---

### S7 — GRN Create / Detail

**Layout:** Two-column form (left: GRN header; right: PO summary) + line item table below

**Header fields:**
- Project (read-only if navigated from project context)
- Store (dropdown)
- PO Reference (searchable dropdown — shows PO number, supplier name, PO date)
- Supplier Delivery Note Number
- Vehicle Plate / Driver Name
- Received Date & Time

**On PO selection:** Auto-populate PO lines in the table below (read from PO)

**Line item table:**
| Item | UoM | PO Qty | Outstanding | Received Qty | Unit Cost | Batch No. | Condition | Inspection Required |

**Status banner:** If status = Confirmed — show green "GRN Confirmed" badge and disable all edits
If any line has inspection_required = true — show yellow "Pending QAQC Inspection" banner with list of pending items

**Actions:** [Save Draft] [Confirm GRN] [Cancel]

---

### S9 — Material Requisition Create

**Layout:** Header form + searchable item picker + line table

**Header fields:**
- Project (read-only from context)
- Store (dropdown)
- WBS Node (searchable tree picker — shows WBS hierarchy)
- Task (searchable dropdown — filtered to WBS node)
- Cost Code (auto-populated from task/WBS, editable)
- Required Date (date picker)
- Remarks

**Item picker (right panel):**
- Search by name or code
- Shows current available balance inline
- Add button adds to line table

**Line table:**
| Item | UoM | Available Stock | Requested Qty | Notes |
If Available Stock < Requested Qty — row turns orange with "Insufficient Stock" warning

**Actions:** [Save Draft] [Submit for Approval]

---

### S10 — Material Requisition Detail / Approval

**Layout:** Detail view with approval action bar (top) + line items

**Status badge** (prominent, top-right): Draft / Submitted / Approved / Issued / Rejected / Cancelled

**Approval action bar** (for Supervisor role when status = Submitted):
- [Approve MR] [Reject MR with reason]

**Issue action bar** (for Storekeeper role when status = Approved):
- Line-by-line: "Issue Qty" input field per line (defaults to approved qty, editable down)
- [Confirm Issue]

**Information panels:**
- Left: MR header details (WBS, task, cost code, required date, requested by)
- Right: Approval history timeline (requested → submitted → approved → issued)

---

### S18 — Stock Take Detail / Count Entry

**Layout:** Full-page count sheet with status banner

**Status banner:**
- Open: "Store is LOCKED — No movements allowed until stock take is completed or cancelled."
- Counting: "Count in progress — enter physical quantities below."
- Pending Approval: "Count submitted — awaiting supervisor approval of variances."

**Count table:**
| Item Code | Item Name | Category | UoM | System Qty | Physical Count | Variance | Variance % | Value Variance | Explanation |

- System Qty column: shows "---" when status = Open (counter cannot see system qty while counting)
- Physical Count: editable number input when status = Counting
- Variance + Value Variance: highlighted red when > tolerance
- Explanation: required text field when variance > tolerance

**Actions:**
- [Start Counting] (Supervisor — Open → Counting)
- [Submit Count] (Storekeeper — Counting → Pending Approval)
- [Approve All] / [Approve Line] / [Complete Stock Take] (Supervisor)
- [Cancel Stock Take] (Supervisor — only when Open or Counting)

---

## 3. Navigation Flow

```
Inventory Dashboard
├── Stock Balance List → Row → Movement Ledger (filtered)
├── GRN List → GRN Detail → GRN Confirm
├── Material Requisition List → MR Detail → Approve/Issue
├── Transfer List → Transfer Detail → Approve/Dispatch/Receive
├── Adjustment List → Adjustment Detail → Approve
├── Stock Take List → Stock Take Detail → Count → Complete
└── Low Stock Alerts → Item Detail → Create MR or PR
```

---

## 4. Component Reference

| shadcn/ui Component | Used in |
|---|---|
| `DataTable` | All list screens |
| `Dialog` | Confirm GRN, Approve/Reject MR, Approve Adjustment |
| `Sheet` | Quick MR creation from stock balance screen |
| `Select` | Store picker, Category filter |
| `Combobox` | Item search, WBS node picker, PO picker |
| `Badge` | Status badges, stock alert badges |
| `Progress` | Consumed vs issued (WBS consumption view) |
| `Alert` | Stock locked banner, low-stock warnings |
| `Tabs` | GRN detail (Header / Lines / Documents / Audit) |
| `DatePicker` | Required date, received date |

---

## 5. Status Badge Colours

| Status | Colour | shadcn variant |
|---|---|---|
| Draft | Gray | `secondary` |
| Submitted | Blue | `default` |
| Approved | Blue | `default` |
| Issued / Confirmed | Green | custom green |
| Partially Issued | Amber | custom amber |
| Under Inspection | Amber | custom amber |
| Rejected / Cancelled | Red | `destructive` |
| In Transit | Amber | custom amber |
| Received | Green | custom green |
| Discrepancy | Red | `destructive` |

---

## 6. Empty States

| Screen | Empty State Message |
|---|---|
| Stock Balance | "No stock recorded for this store. Create a GRN to receive the first delivery." |
| GRN List | "No GRNs found. Click 'Create GRN' to record a delivery." |
| MR List | "No material requisitions yet. Click 'New MR' to request materials for a task." |
| Low Stock | "All items are above their reorder points." (green check icon) |
| Stock Take | "No stock takes recorded. Click 'Start Stock Take' to begin a physical count." |

---

## 7. Mobile Considerations (Phase 3 web-responsive; Phase 6 native)

- GRN Create: camera capture for delivery note photo → auto-attach to GRN
- MR Approval: one-tap approve / reject with optional comment
- Stock Check: quick search by item name or code → shows current balance
- All tables: horizontal scroll on mobile with frozen first column (item name)
