# Inventory / Stock Module — Reports & KPI
**Document Code:** DCOS-RPT-26-001 | **Version:** R0 | **Date:** June 2026
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

---

## 1. Dashboard KPI Cards

These appear on the Inventory Dashboard (S1) and the main project dashboard.

| KPI | Formula | Target | Alert Threshold |
|---|---|---|---|
| Total Stock Value (on hand) | SUM(quantity_available × unit_cost_fifo) per project | — | — |
| Items Below Reorder Point | COUNT(items where available ≤ reorder_point) | 0 | > 0 triggers orange badge |
| Items at Zero Stock | COUNT(items where available = 0 and reorder_point > 0) | 0 | Any > 0 triggers red alert |
| GRN Pending Confirmation | COUNT(GRNs where status = 'draft') | 0 | > 2 triggers alert |
| MRs Awaiting Approval | COUNT(MRs where status = 'submitted') | 0 | Any aged > 24h triggers alert |
| Materials Under Inspection (QAQC) | COUNT(GRN lines where inspection_status = 'pending') | 0 | Aged > 48h triggers alert |
| Pending Transfers | COUNT(transfers where status in ('pending','approved')) | 0 | — |
| Stock Take in Progress | 1 if any stocktake status = 'counting'/'pending_approval' else 0 | 0 | Store is locked |

---

## 2. Operational Reports

### R1 — Stock Summary Report

**Purpose:** Current snapshot of all stock on hand by store, category, and item.

**Columns:** Store | Item Code | Item Name | Category | UoM | Available | Reserved | Under Inspection | Quarantined | Unit Cost | Total Value | Reorder Point | Status

**Filters:** Project, Store, Category, Status (Available / Low / Zero)

**Export:** CSV, PDF

**Frequency:** On-demand; auto-generated weekly and emailed to PM + QS

---

### R2 — Material Consumption Report

**Purpose:** What was issued from store to site, broken down by WBS node, task, and cost code.

**Columns:** WBS Node | Task | Cost Code | Item | UoM | Quantity Issued | Unit Cost | Total Cost | Issued By | Issue Date

**Filters:** Project, Date Range, WBS Node, Cost Code, Item

**Grouping options:** By WBS node / By cost code / By item / By week

**Export:** CSV, PDF

**Integration:** Feeds Cost Control module — same data, different view angle

---

### R3 — Aging / Slow-Moving Stock Report

**Purpose:** Identify materials that have been in the store with no movement for 30 / 60 / 90+ days — risk of expiry, deterioration, or over-procurement.

**Columns:** Item Code | Item Name | Category | Store | Quantity Available | Value | Last Movement Date | Days Since Last Movement | GRN Reference (original receipt)

**Filters:** Project, Store, Aging Threshold (30 / 60 / 90 / custom days)

**Colour coding:**
- 30–59 days: yellow
- 60–89 days: orange
- 90+ days: red

**Export:** CSV, PDF

**Frequency:** Weekly automated email to PM, Store Supervisor

---

### R4 — GRN vs PO Reconciliation Report

**Purpose:** Show what was ordered vs what has been delivered to date. Identify open balances and overdue deliveries.

**Columns:** PO Number | Supplier | Item | PO Quantity | GRN Quantity (total received) | Outstanding Quantity | PO Value | GRN Value | Last Delivery Date | Over-delivered?

**Filters:** Project, Date Range, Supplier, PO Status

**Export:** CSV, PDF

---

### R5 — Material Return Report

**Purpose:** Track materials returned to store and write-offs.

**Columns:** Return Number | Original MR | Item | Quantity Returned | Condition (Reusable/Damaged/Waste) | Write-off Quantity | Write-off Value | Return Date | Returned By | Write-off Approved By

**Filters:** Project, Date Range, Condition

---

### R6 — Transfer Report

**Purpose:** All inter-store and inter-project material transfers.

**Columns:** Transfer Number | Transfer Type | Source | Destination | Items | Quantity | Transfer Date | Status | Cost Impact

**Filters:** Project, Date Range, Status, Transfer Type

---

### R7 — Stock Take Summary Report

**Purpose:** Results of each physical stock take — variances, explanations, and adjustments.

**Columns:** Stock Take Number | Store | Date | Total Items Counted | Items with Variance | Total Variance Quantity | Total Variance Value | Initiated By | Completed By | Status

**Line detail:** Per-item variance with explanation and approver

**Export:** PDF (formal record for auditors)

---

### R8 — Material Cost Posting Report

**Purpose:** All cost transactions posted from inventory to Cost Control — for reconciliation.

**Columns:** Date | Movement Type | Reference | Item | WBS Node | Cost Code | Quantity | Unit Cost | Total Cost | Posted By

**Filters:** Project, Date Range, Cost Code, WBS Node, Movement Type

**Integration:** Must match the Cost Control module's INV cost line entries exactly.

---

### R9 — QAQC Inspection Report (Inventory view)

**Purpose:** Status of all incoming material inspection requests — from the Inventory module's perspective.

**Columns:** GRN Number | Item | Batch No. | Received Date | Inspection Status | Inspector | Inspection Date | Result | Test Certificate Reference | Items in Quarantine

**Filters:** Project, Date Range, Inspection Status

---

## 3. Management & Executive Reports

### R10 — Material Budget vs Actual Report

**Purpose:** Compare material costs (from issue records) against BOQ budget per cost code.

**Columns:** Cost Code | Description | BOQ Budget | Quantity Budget | Issued To Date | Issued Value | Variance | % Used | Forecast Final

**Note:** Requires BOQ module integration (Phase 3).

---

### R11 — Procurement vs Consumption Cycle

**Purpose:** Shows whether procurement is aligned with consumption — highlights over-procurement or potential material shortages.

**Columns:** Item | Category | Total Received (qty + value) | Total Issued | In Store | Procurement in Progress (open POs) | Monthly Burn Rate | Weeks of Stock Remaining

---

## 4. KPI Targets (Phase 3 baseline)

| KPI | Target | Measurement |
|---|---|---|
| GRN confirmation within 24h of delivery | 95% | GRNs confirmed same day or next day / total GRNs |
| MR approval turnaround | ≤ 24 hours | 90th percentile MR submit → approve time |
| QAQC inspection completion | ≤ 48 hours | 90th percentile quarantine → inspection result time |
| Physical stock take frequency | Monthly per active store | Count of stock takes per store per month |
| Stock take variance (by value) | < 0.5% | Total variance value / total stock value |
| Zero-stock incidents on critical items | 0 | Count of critical items reaching zero |
| Write-off % of total received | < 2% | Write-off value / total GRN received value |
| Return-to-supplier rate | < 5% | Return-to-supplier value / total GRN value |
