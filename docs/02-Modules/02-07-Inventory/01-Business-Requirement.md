# Inventory / Stock Module — Business Requirement
**Document Code:** DCOS-BR-26-001 | **Version:** R1 | **Date:** 2026-07-27 (originally June 2026)
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3
**Status:** Draft — Pending Human Approval

**Revision Note (R1):** Extended to fold in CWIMS (Construction Warehouse & Inventory Management System) Appendix A.3 Stage 1 (Foundation) + Stage 2 (Control) gap items — Material Return formalisation, Tool Issue/Return custody, Location/bin hierarchy, Barcode/QR generation and scanning, and the reorder-alert bridge to Procurement. See `docs/03-Business-Modules/31-cwims/README.md` for the source reference package. Author: Solution Architect. Status of this revision: Draft — Pending Human Approval.

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
8. Track custody of hand tools issued to site staff — from issue to return — to reduce loss and idle tool spend.
9. Identify items, bins, and tools with barcode/QR codes so store transactions can be scan-driven rather than manually keyed.
10. Organise each store into a zone → aisle → rack → bin location hierarchy so stock can be found and put away consistently.

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
- BR11: Every store location (bin) belongs to exactly one store and sits in a zone → aisle → rack → bin hierarchy; a location cannot be assigned to more than one store.
- BR12: Every serialised tool has exactly one custodian at any time. A tool cannot be re-issued to a new custodian until it has been returned and its return condition recorded.
- BR13: Items, locations, and tools may carry a barcode/QR code. Scanning a code must resolve only to a record belonging to the scanning user's own tenant — a cross-tenant scan is rejected, never silently ignored.
- BR14: When available stock for an item in a store reaches or falls below its reorder point, the system must notify the Storekeeper and Procurement Officer and make the item visible on the reorder-alert bridge to the Procurement module so a Purchase Requisition can be raised.

---

## 6. Out of Scope

- **Subcontractor-supplied materials:** Materials supplied by subcontractors under lump-sum sub-contracts are tracked in the Subcontractor module, not Inventory.
- **Plant and equipment:** Tracked in the Equipment module (Module 30). Equipment Assignment custody integration (CWIMS UC-08) is explicitly deferred to a later phase (CWIMS Appendix A.3 Stage 4) and is not part of this phase's scope.
- **Full accounting / AP integration:** Invoice matching and payment are in the Procurement module and Accounting module.
- **Demand forecasting / AI reorder:** Phase 7 (AI module).
- **Deferred to a later phase (CWIMS Stage 3/4 — not this phase):**
  - Dangerous Goods (DG) compliance workflow — DG-capable store type and DG item flag are captured at foundation level in this phase, but the DG safety checklist / compliance workflow itself is not built.
  - Full wall-to-wall physical inventory (freeze, dual-count, recount rules) — this phase covers cycle counting only (existing Stock Take feature); full physical inventory is a later-phase enhancement.
  - Batch/FEFO valuation and period-close — `is_batch_managed` and `shelf_life_days` are captured on the item master in this phase for readiness, but batch-level FIFO/FEFO picking, expiry enforcement, and month-end valuation period-lock are not built this phase (stock remains FIFO-costed at the item level as already documented in Section 5, Assumptions & Constraints of `02-Functional-Specification.md`).
  - Return write-off record, Store Supervisor approval gate, 30-day return window valuation-variance rule, and mandatory evidence-photo capture on Damaged/Waste return lines (`inv_return_lines.evidence_doc_ids` exists in the schema for this purpose but is not yet wired to any UI or validation) — this phase implements the Draft → Inspected → Posted return lifecycle and correctly excludes Damaged/Waste lines from available stock (logged at `high` audit severity instead), but does not create a formal write-off record or gate posting on approval. BR-F5-05/07/08 describe the target design; they are not yet enforced.
  - Barcode/QR label generation and scanning — `label-print-button.tsx` renders a placeholder printable text label only; no scannable Code-128/QR image, no signed tenant-checksum deep link, and no scan-input UI exist yet. F12 describes the target design; installing a barcode/QR rendering library and wiring scan-driven transactions is a follow-up task.

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
| Equipment (EQP) | Deferred to a later phase — tool custody (this phase) is tracked in Inventory; plant/equipment custody integration (CWIMS UC-08) is out of scope for this phase |
