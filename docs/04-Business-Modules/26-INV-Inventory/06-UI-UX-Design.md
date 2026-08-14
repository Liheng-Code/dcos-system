# Inventory / Stock Module — UI/UX Design
**Document Code:** DCOS-UI-26-001 | **Version:** R1 | **Date:** 2026-07-27 (originally June 2026)
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

**Revision Note (R1):** Adds detailed screen layouts for Item Master (S3/S4) and Store/Location Management (S5) — listed in R0 but not previously detailed — plus Material Return (S11/S12, enhanced), and new screens for Tools (S21–S23) and Barcode Label Printing (S24), per CWIMS Appendix A.3 Stage 1+2. Author: Solution Architect. Status: Draft.

---

## 1. Screen Inventory

| # | Screen Name | Primary User | Route |
|---|---|---|---|
| S1 | Inventory Dashboard | PM, QS, Store Supervisor | `/dashboard/inventory` |
| S2 | Stock Balance List | Storekeeper, All staff | `/dashboard/inventory/stock` |
| S3 | Item Master List | Admin, Procurement | `/dashboard/inventory/items` |
| S4 | Item Master Detail / Create / Edit | Admin, Procurement | `/dashboard/inventory/items/[id]` |
| S5 | Store & Location Management | Admin, PM, Store Supervisor | `/dashboard/inventory/stores` |
| S6 | GRN List | Storekeeper, PM | `/dashboard/inventory/grns` |
| S7 | GRN Create / Detail | Storekeeper | `/dashboard/inventory/grns/[id]` |
| S8 | Material Requisition List | All staff | `/dashboard/inventory/mrs` |
| S9 | Material Requisition Create | Site Engineer | `/dashboard/inventory/mrs/new` |
| S10 | Material Requisition Detail / Approval | Supervisor, Storekeeper | `/dashboard/inventory/mrs/[id]` |
| S11 | Material Return List | Storekeeper, Site Engineer | `/dashboard/inventory/returns` |
| S12 | Material Return Create / Detail | Site Engineer, Storekeeper | `/dashboard/inventory/returns/[id]` |
| S13 | Transfer List | Supervisor | `/dashboard/inventory/transfers` |
| S14 | Transfer Create / Detail | Supervisor, Storekeeper | `/dashboard/inventory/transfers/[id]` |
| S15 | Return to Supplier List / Detail | Storekeeper, Supervisor | `/dashboard/inventory/supplier-returns` |
| S16 | Adjustment List / Detail | Store Supervisor | `/dashboard/inventory/adjustments` |
| S17 | Stock Take List | Supervisor | `/dashboard/inventory/stocktakes` |
| S18 | Stock Take Detail / Count Entry | Storekeeper, Supervisor | `/dashboard/inventory/stocktakes/[id]` |
| S19 | Movement Ledger | QS, PM, Auditor | `/dashboard/inventory/movements` |
| S20 | Low Stock Alert Panel | Storekeeper, Procurement | `/dashboard/inventory/alerts` |
| S21 | Tools List | Storekeeper, Store Supervisor, All staff | `/dashboard/inventory/tools` |
| S22 | Tool Issue | Storekeeper, Requester | `/dashboard/inventory/tools/issue` |
| S23 | Tool Return / Detail | Storekeeper | `/dashboard/inventory/tools/[id]` |
| S24 | Barcode Label Printing | Storekeeper, Store Supervisor, Admin | `/dashboard/inventory/labels` |

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

### S3 — Item Master List

**Purpose:** Browse, search, and manage the tenant-wide material catalogue.

**Layout:** Filter bar + data table

**Filters:** Category (multi-select), Status (Active/Inactive), Has Barcode (toggle), DG only (toggle)

**Table columns:**
| Barcode | Item Code | Name | Category | UoM | Reorder Point | Batch Managed | DG | Status |

**Buttons:** [+ New Item], row actions: [Edit] [Generate Barcode] [Deactivate]

**Validation:** None at list level — validation lives in S4 create/edit form.

**Permissions:** View — all staff. Create/Edit — Procurement Manager, Admin. Deactivate — Admin only (per `07-Permission-Matrix.md`).

**Empty state:** "No items in the catalogue yet. Click 'New Item' to add the first material."

---

### S4 — Item Master Detail / Create / Edit

**Purpose:** Create or maintain a single item master record, including the CWIMS Stage 2 fields (barcode, DG, batch management, shelf life).

**Layout:** Single-column form, grouped into cards: General, Stock Control, Traceability, Barcode.

**General card:** Name, Category, Sub-category, Unit of Measure, Default Cost Code.

**Stock Control card:** Min Stock Level, Max Stock Level, Reorder Point, Reorder Quantity, Lead Time (days), Is Inspection Required (toggle).

**Traceability card:** Is Batch Managed (toggle — informational this phase; batch-level FIFO/FEFO is a later-phase enhancement), Shelf Life (days, enabled only when Is Batch Managed is on), Is Dangerous Goods (toggle — informational this phase; DG workflow is a later-phase enhancement).

**Barcode card:** Shows current barcode/QR value (read-only) with [Generate Barcode] / [Print Label] buttons; blank state shows "No barcode assigned" with a [Generate Barcode] button.

**Buttons:** [Save] [Save & Generate Barcode] [Deactivate] (Admin only, edit mode)

**Validation:** Name, Category, UoM required. Item Code is system-generated, read-only. Shelf Life must be a positive integer when Is Batch Managed is on. Reorder Point ≤ Max Stock Level.

**Permissions:** Create/Edit — Procurement Manager, Admin. Deactivate — Admin. View — all staff (read-only form when not permitted to edit).

**Workflow:** Draft item → Save → active item available for GRN/MR/Stock screens immediately (no approval step for item master changes).

---

### S5 — Store & Location Management

**Purpose:** Manage stores and, within each store, the Zone → Aisle → Rack → Bin location hierarchy.

**Layout:** Two-panel: left = store list, right = selected store's detail with a **Locations** tab (tree view).

**Store list (left panel):** Store Code, Name, Type (Central/Site/Temporary/Yard/DG), Project, Status. [+ New Store] button.

**Store detail — General tab:** Store Code, Name, Store Type, Project, Location Description, Responsible User (Storekeeper), Capacity (Qty + UoM), Status. [Edit] [Close Store] buttons.

**Store detail — Locations tab:** Expandable tree (Zone → Aisle → Rack → Bin) with columns: Code, Type, DG Allowed, Capacity, Status. Row actions: [+ Add Child Location] [Edit] [Generate Barcode/QR] [Deactivate]. Capacity shown as a small usage bar when stock/put-away data is available; over-declared-capacity rows show an amber "Near capacity" badge (warning only, not a hard block, this phase).

**Buttons:** [+ New Store], [+ New Location] (top-level Zone, from Locations tab)

**Validation:** Store Code unique per project. Location Code unique per store. A Bin/Rack/Aisle must have a parent location one level up (BR-F13-01). Cannot deactivate a location that has stock or an open GRN/transfer/tool issue referencing it (BR-F13-06).

**Permissions:** Create/Edit store — Project Manager, Admin. Create/Edit location — Project Manager, Store Supervisor, Admin. View — all staff.

**Empty state (Locations tab):** "No locations set up for this store yet. Add a Zone to begin building the bin hierarchy."

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

### S11 — Material Return List

**Purpose:** Track all material returns from site to store, across their Draft → Submitted → Inspected → Posted lifecycle.

**Layout:** Filter bar + data table

**Filters:** Project, Store, Status, Condition (mixed/reusable/damaged/waste), Outside Return Window (toggle)

**Table columns:**
| Return No. | Original MR | Store | Requested By | Items | Status | Outside Window? | Return Date |

**Row colour rules:** Amber background when `is_outside_return_window = true` and awaiting Store Supervisor approval.

**Buttons:** [+ New Return], row action [View]

**Permissions:** View — all staff. Create — Site Engineer, Site Supervisor, Storekeeper.

**Empty state:** "No material returns recorded. Click 'New Return' to return unused materials to store."

---

### S12 — Material Return Create / Detail

**Purpose:** Raise a return against an original MR and take it through Storekeeper inspection to posting.

**Layout:** Header form (create) or header + status timeline (detail), with a line item table below.

**Header fields (create):** Project (context), Store, Original MR (searchable dropdown — shows issued lines and remaining returnable quantity per line), Return Reason, Evidence photo upload (required if any line will be marked damaged/waste at inspection).

**Line item table:** Item | UoM | Qty Issued (from MR) | Qty Already Returned | Qty to Return | Condition (populated at inspection step, not at creation)

**Status banner:** Draft / Submitted ("Awaiting Storekeeper inspection") / Inspected / Posted (green, read-only) / Outside Return Window ("Requires Store Supervisor approval — valued at current stock cost").

**Inspection panel (Storekeeper, when status = Submitted):** Per-line Condition selector (Reusable / Damaged / Waste) + Condition Notes; [Submit Inspection] button becomes [Post Return] once all lines are classified.

**Actions:** [Save Draft] [Submit] (requester) · [Submit Inspection] [Post Return] (Storekeeper) · [Approve Return Window] (Store Supervisor, only when outside window) · [Cancel]

**Validation:** Return quantity per line cannot exceed (issued − already returned) on the referenced MR line. At least one evidence photo required before Post if any line condition is Damaged or Waste.

**Permissions:** Create/Submit — Site Engineer, Site Supervisor, Storekeeper. Inspect/Post — Storekeeper. Approve return window — Store Supervisor.

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

### S21 — Tools List

**Purpose:** Browse the Tool Master and see current custody status at a glance.

**Layout:** Filter bar + data table

**Filters:** Status (Available/Issued/Maintenance/Lost/Disposed), Restricted only (toggle), Home Store, Overdue only (toggle)

**Table columns:**
| Tool Code | Name | Serial No. | Category | Restricted | Status | Current Custodian | Due Date |

**Row colour rules:** Red background when Status = Issued and past due date (Overdue); amber when due within 24 hours.

**Buttons:** [+ New Tool] (Admin/Store Supervisor), [Issue Tool], row action [View]

**Permissions:** View — all staff. Create/edit tool — Admin, Store Supervisor. Issue — Storekeeper.

**Empty state:** "No tools in the Tool Master yet. Click 'New Tool' to register the first serialised tool."

---

### S22 — Tool Issue

**Purpose:** Issue a tool to a custodian, with Supervisor approval gating for restricted tools.

**Layout:** Single-column form.

**Fields:** Tool (searchable/scan input — shows current status; blocked selection if already Issued), Custodian (searchable user picker), Project, WBS Node (optional), Due Date (date picker), Condition-Out Notes, Condition-Out Photo (camera capture or upload).

**Status banner:** If the selected tool is Restricted — yellow "Requires Supervisor approval before release" banner.

**Actions:** [Request Issue] (creates `pending_approval` when restricted, or issues immediately when not restricted)

**Validation:** Tool must be Status = Available. Due Date must be on/after today. Condition-out photo required for restricted tools.

**Permissions:** Create request — any requester or Storekeeper on their behalf. Approve — Supervisor. Final release — Storekeeper.

---

### S23 — Tool Return / Detail

**Purpose:** View a tool issue's full custody record and process its return.

**Layout:** Detail view with status timeline (Pending Approval → Issued → [Overdue] → Returned/Damaged/Lost) + return action panel.

**Information panels:** Tool details, custodian, project/WBS, issue date, due date, condition-out photo.

**Return action panel (Storekeeper, when status = Issued/Overdue):** Condition-In selector (Good / Damaged / Lost), Condition Notes, Condition-In Photo. [Confirm Return] button — label changes to [Confirm Return — Raise Damage Report] or [Confirm Return — Raise Loss Charge] depending on the selected condition.

**Actions:** [Approve] / [Reject] (Supervisor, when Pending Approval) · [Confirm Return] (Storekeeper) · [Mark Lost] (Storekeeper, Store Supervisor)

**Permissions:** Approve/Reject — Supervisor. Confirm Return / Mark Lost — Storekeeper, Store Supervisor. View — all staff.

---

### S24 — Barcode Label Printing

**Purpose:** Generate and print Code-128/QR labels for items, locations, and tools, in single or batch mode.

**Layout:** Left panel — search/select records (tabs: Items / Locations / Tools) with checkboxes; right panel — label preview + print queue.

**Left panel:** Search + filter (same filters as S3/S5/S21 respectively), multi-select checkboxes, "Select all on page" option.

**Right panel:** Live preview of the label layout (code, description, UoM for items/locations; code + QR for tools), count of labels queued, [Generate & Print] button.

**Buttons:** [Generate & Print], [Clear Selection]

**Validation:** At least one record selected. Records without an assigned barcode/QR are auto-assigned one at print time.

**Permissions:** Storekeeper, Store Supervisor, Admin.

**Audit note:** Every print/reprint action is logged (who, when, which records) per `09-Audit-Requirements.md`.

---

## 3. Navigation Flow

```
Inventory Dashboard
├── Stock Balance List → Row → Movement Ledger (filtered)
├── Item Master List → Item Detail → Generate Barcode / Print Label
├── Store & Location Management → Store Detail → Locations Tab → Add/Edit Location
├── GRN List → GRN Detail → GRN Confirm
├── Material Requisition List → MR Detail → Approve/Issue
├── Material Return List → Return Detail → Inspect → Post
├── Transfer List → Transfer Detail → Approve/Dispatch/Receive
├── Adjustment List → Adjustment Detail → Approve
├── Stock Take List → Stock Take Detail → Count → Complete
├── Tools List → Tool Issue / Tool Return Detail → Approve (if restricted) → Return
├── Barcode Label Printing → Select Records → Generate & Print
└── Low Stock Alerts → Item Detail → Create MR or PR (reorder-alert bridge to Procurement)
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
| `Tabs` | GRN detail (Header / Lines / Documents / Audit); Store detail (General / Locations) |
| `DatePicker` | Required date, received date, tool due date |
| `Tree` | Location hierarchy (S5 Locations tab) |

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
| Inspected | Blue | `default` |
| Posted | Green | custom green |
| Issued (Tool) | Blue | `default` |
| Overdue (Tool) | Red | `destructive` |
| Returned (Tool) | Green | custom green |
| Damaged / Lost (Tool) | Red | `destructive` |
| Pending Approval (Tool) | Amber | custom amber |

---

## 6. Empty States

| Screen | Empty State Message |
|---|---|
| Stock Balance | "No stock recorded for this store. Create a GRN to receive the first delivery." |
| GRN List | "No GRNs found. Click 'Create GRN' to record a delivery." |
| MR List | "No material requisitions yet. Click 'New MR' to request materials for a task." |
| Low Stock | "All items are above their reorder points." (green check icon) |
| Stock Take | "No stock takes recorded. Click 'Start Stock Take' to begin a physical count." |
| Tools List | "No tools in the Tool Master yet. Click 'New Tool' to register the first serialised tool." |
| Material Return | "No material returns recorded. Click 'New Return' to return unused materials to store." |

---

## 7. Mobile Considerations (Phase 3 web-responsive; Phase 6 native)

- GRN Create: camera capture for delivery note photo → auto-attach to GRN
- MR Approval: one-tap approve / reject with optional comment
- Stock Check: quick search by item name or code → shows current balance
- Barcode/QR scan: device camera used as the input method for item/location/tool fields wherever a scan icon appears (GRN line entry, MR issue picking, Tool Issue/Return) — falls back to manual search/entry if camera access is unavailable
- All tables: horizontal scroll on mobile with frozen first column (item name)
