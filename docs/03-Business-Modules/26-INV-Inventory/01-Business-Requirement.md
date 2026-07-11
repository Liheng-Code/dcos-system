# Inventory / Stock Module — Business Requirement
**Document Code:** DCOS-BR-26-001 | **Version:** R0 | **Date:** June 2026
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3
**Status:** Draft — Pending Human Approval

---

## 1. Business Context

On a construction project, materials represent 50–65% of total project cost. Without a controlled store, materials are:

- Over-ordered and stockpiled, tying up cash
- Under-ordered and unavailable when needed, stopping work
- Issued to site without records, making cost tracking impossible
- Lost to theft, damage, or expiry
- Untraceable when quality issues arise (no batch records)

The DCOS Inventory module digitises the site store operation — from goods receipt through to site issue, transfer between stores, return, and write-off. Every gram of cement and every metre of rebar is traceable to a project, WBS node, and cost code.

This module is the bridge between the Procurement module (what was ordered and received) and the Cost Control module (what was consumed and against which budget line).

---

## 2. Primary Actors

| Actor | Role in this module |
|---|---|
| Storekeeper | Operates the store: creates GRN, processes issues, transfers, returns, adjustments |
| Store Supervisor | Supervises storekeeper; approves adjustments, write-offs, and inter-site transfers |
| Site Engineer / Supervisor | Raises material requisitions (issues) from the store against active tasks |
| Quantity Surveyor (QS) | Tracks material cost against BOQ and budget; reviews material cost reports |
| Procurement Officer | Confirms delivery against PO; triggers GRN creation |
| Project Manager | Reviews stock status, aging materials, and slow-moving stock |
| QAQC Engineer | Reviews material test certificates and approves inspection-linked receipt |
| Finance / Accountant | Reviews material valuation and cost postings |

---

## 3. Business Objectives

1. Provide real-time visibility of stock on hand across all project stores.
2. Ensure every material movement (in, out, transfer, return, adjustment) is recorded and approved.
3. Link every material issue to a project, WBS node, task, and cost code for accurate cost tracking.
4. Enforce minimum/maximum stock levels with automated reorder alerts.
5. Maintain a complete material traceability chain — from PO to delivery to site use — including batch numbers and test certificates.
6. Eliminate unauthorised material removal from stores.
7. Support physical stock take (cycle count) with system reconciliation.

---

## 4. Success Criteria

| Criterion | Measure |
|---|---|
| All material movements recorded | 100% of issues, receipts, transfers have a system record |
| Material cost traceable to WBS | Every issue is linked to a WBS node and cost code |
| Reorder alerts triggered | Store staff receive low-stock alerts before reaching zero |
| Physical stock take reconciliation | System stock vs physical count variance < 1% by value |
| GRN-to-PO matching | Every GRN references a valid approved PO |
| Material traceability | Any material can be traced from PO → GRN batch → issue → WBS location |

---

## 5. Key Business Rules

- BR1: Every stock movement must reference a valid project.
- BR2: Goods Received Notes (GRN) must reference an approved Purchase Order (PO).
- BR3: Material issues must reference a Material Requisition approved by a site engineer or supervisor.
- BR4: Stock balance can never go below zero — the system must block issues that exceed available stock.
- BR5: Material adjustments (corrections, write-offs) require Store Supervisor approval.
- BR6: Inter-project transfers require approval from both the source and destination project's Store Supervisor.
- BR7: Every stock movement posts a cost transaction to the Cost Control module (linked to cost code and WBS).
- BR8: Physical stock take must be locked (no movements) during count; discrepancies require approval before posting.
- BR9: Materials requiring QAQC inspection must be quarantined (status = Under Inspection) until approved — they cannot be issued from quarantine.
- BR10: Material return to supplier must reference the original GRN and PO.

---

## 6. Out of Scope

- **Subcontractor-supplied materials:** Materials supplied by subcontractors under lump-sum sub-contracts are tracked in the Subcontractor module, not Inventory.
- **Plant and equipment:** Tracked in the Equipment module (Module 30).
- **Full accounting / AP integration:** Invoice matching and payment are in the Procurement module and Accounting module.
- **Warehouse management system (WMS) features:** Bin locations, barcode scanning (Phase 4 enhancement).
- **Demand forecasting / AI reorder:** Phase 7 (AI module).

---

## 7. Related Modules

| Module | Relationship |
|---|---|
| Procurement (PRC) | GRN created from approved PO; supplier details from Supplier master |
| WBS (WBS) | Every issue linked to a WBS node |
| Task (TSK) | Material issues reference active tasks |
| Cost Control (COST) | Every movement posts a cost transaction |
| BOQ (BOQ) | Material budget codes and unit rates from BOQ |
| QAQC (QAQC) | Incoming inspection trigger; quarantine flag; test certificate linkage |
| Notification Engine (NTF) | Low-stock alerts, pending approvals, overdue actions |
| Audit Log Engine (AUD) | All movements logged immutably |
| Reporting (RPT) | Inventory dashboards, aging reports, consumption analysis |
