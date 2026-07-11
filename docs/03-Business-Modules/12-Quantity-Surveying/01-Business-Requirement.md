# Quantity Surveying Module — Business Requirement
**Document Code:** DCOS-BR-12-001 | **Version:** R0 | **Date:** July 2026
**Module Code:** QS | **Domain:** Commercial | **Phase:** 2
**Status:** Draft — Pending Human Approval

---

## 1. Business Context

Quantity Surveying is the financial control function of a construction project. Every dollar spent must trace back to a budget line, a BOQ item, and a cost code. Without a digital QS system:

- Budgets are set but never tracked against actual spend in real time
- Variation orders pile up without impact assessment on total project cost
- Progress claims are prepared manually, prone to arithmetic errors
- Retention is forgotten, leaving money uncollected at project close
- Cost overruns are discovered too late to take corrective action

The DCOS QS module digitises the full commercial lifecycle — from budget code setup and BOQ creation through cost capture, variation control, progress claims, and retention release. Every cost transaction is linked to a BOQ item, WBS node, and budget code, giving project leadership real-time visibility of financial health.

---

## 2. Primary Actors

| Actor | Role in this module |
|---|---|
| Quantity Surveyor (QS) | Manages BOQ, cost library, budget revisions, variation orders, progress claims, retention |
| QS Manager | Approves budget revisions, variation orders, contingency drawdowns |
| Project Manager | Reviews cost reports, approves claims and variations |
| Procurement Officer | Links PR/PO cost lines to BOQ items and budget codes |
| Site Engineer / Supervisor | Submits material requisitions linked to BOQ line items |
| Finance / Accountant | Reviews budget vs actual reports, posts cost transactions |
| Storekeeper | Issues materials against BOQ-linked tasks for cost tracking |

---

## 3. Business Objectives

1. Establish a standardised budget code structure (Groups A-F) for consistent cost classification across all projects.
2. Provide a cost code library (CSI MasterFormat-based) with standard divisions, sections, and unit rates for rapid BOQ creation.
3. Support multiple BOQs per project (main works, preliminaries, variations, provisional sums, supplements).
4. Track every budget revision with before/after snapshots, reason codes, and approval trail.
5. Capture actual costs from procurement (PO/invoice), site operations (timesheets), and inventory (material issues) linked to BOQ items.
6. Manage variation orders with multi-step approval workflow and automatic impact on contract sum.
7. Generate interim payment certificates (progress claims) with automatic calculation of work completed, materials stored, and retention.
8. Maintain a retention ledger with deduction and release tracking.
9. Track contingency drawdowns with approval controls.
10. Produce time-phased cost baseline (S-curve) for planned vs actual comparison.

---

## 4. Success Criteria

| Criterion | Measure |
|---|---|
| Budget code adoption | 100% of PR/PO documents use a valid budget code from the standard structure |
| Cost library usage | All BOQ items reference a cost code from the standard library |
| Budget revision audit trail | Every change to a BOQ item quantity or rate is recorded with reason |
| Cost capture rate | 95% of project costs are linked to a BOQ item within 7 days of incurrence |
| Variation order cycle time | Average VO approval cycle < 10 business days from submission |
| Progress claim accuracy | System-calculated claim values match manual recalc within 0.1% |
| Retention recovery | 100% of retention deductions tracked with release trigger dates |
| Contingency tracking | All contingency drawdowns approved and logged with remaining balance visible |

---

## 5. Key Business Rules

- BR1: Every BOQ item must belong to a BOQ section, and every BOQ section must belong to a BOQ header.
- BR2: BOQ items can optionally reference a cost code from the standard cost library and a WBS node.
- BR3: Budget revisions require before/after snapshots of quantity, unit rate, and total amount.
- BR4: Only one BOQ revision per BOQ item can be pending approval at a time.
- BR5: Cost transactions must reference a BOQ item or WBS node (or both) for traceability.
- BR6: Variation orders follow a multi-step approval workflow configurable per project.
- BR7: Progress claims are calculated as: (prev completed + this period work + materials stored) - retention.
- BR8: Retention release requires practical completion or DLP completion as trigger events.
- BR9: Contingency drawdowns require QS Manager approval and must reference a specific BOQ item.
- BR10: Every financial transaction in the QS module is immutable via the audit log.

---

## 6. Budget Code Structure (Groups A-F)

Budget codes follow the format `[Group].[Section]` and are used as the `[Package No.]` segment in the Master Document Code:

| Group | Name | Sections |
|---|---|---|
| **A** | Early Works | A.1–A.9 (Topography, Soil Investigation, Mine Clearance, Earthworks, Demolition, Clearing, Utilities, Renovation, Groundworks) |
| **B** | Sub-Structure | B.1–B.4 (Foundation/Piling, Basement, Ground Floor Slab, Super-Structure Podium) |
| **C** | Architecture External | C.1–C.11 (Exterior Wall, Finishing, Doors, Windows, Floor, Soffit, Stair/Ramp, Roofing, Partitions, Internal Doors, Special Installation) |
| **D** | Interior Finishes | D.1–D.3 (Wall Finish, Floor Finish, Ceiling Finish) |
| **E** | Fittings & Equipment | E.1–E.8 (General Fittings, Kitchen, Special Purpose, Signage, Art/Decor, Non-Mech Equipment, Planting, Bird/Vermin Control) |
| **F** | Building Services (MEP) | F.1–F.12 (Sanitary, Air Conditioning, Ventilation, Plumbing, Drainage, Fire Fighting, Electrical Power, Electrical Lighting, ELV, Lifts, Generators, Lightning Protection) |

**Total: 47 standard budget sections across 6 groups.**

See `Budget Code.xlsx` for the complete reference.

---

## 7. Sub-Modules

| Code | Sub-Module | Description |
|---|---|---|
| 12-1 | Budget Code | Budget code structure (Groups A-F), project budget settings, cost code template |
| 12-2 | Cost Library | Standard cost code divisions, sections, and rate library (CSI MasterFormat) |
| 12-3 | BOQ | Bill of Quantities header, sections, line items with quantities and rates |
| 12-4 | Budget Revisions | Change tracking on BOQ item quantities, rates, and totals with approval |
| 12-5 | Cost Control | Actual cost transactions from procurement, site, and inventory linked to BOQ |
| 12-6 | Variation Orders | VO creation, multi-step approval, contract sum impact |
| 12-7 | Progress Claims | Interim payment certificates with work-in-place and materials-on-hand valuation |
| 12-8 | Retention | Retention deduction, release tracking, and expiration alerts |
| 12-9 | Contingency | Contingency budget tracking and drawdown approvals |
| 12-10 | Cost Baseline | Time-phased planned cost (S-curve) for earned value analysis |

---

## 8. Out of Scope

- **Full earned value management (EVM):** Phase 5 enhancement with SPI/CPI metrics.
- **Automated cost forecasting / EAC:** Phase 7 (AI module).
- **Subcontractor payment applications:** Managed in the Subcontractor module.
- **Invoice matching and AP:** Managed in the Procurement module and Accounting module.
- **Document management for BOQ attachments:** Phase 4 enhancement.
- **Integration with external QS software (Candy, CostX):** Phase 6.

---

## 9. Related Modules

| Module | Relationship |
|---|---|
| Project Setup (PRJ) | Project-level budget settings, cost code template, selected sections |
| WBS (WBS) | BOQ items link to WBS nodes; cost transactions link to WBS |
| Procurement (PRC) | PR/PO budget codes validated against budget structure; PO costs flow to QS cost transactions |
| Inventory (INV) | Material issues post cost to BOQ-linked WBS nodes |
| HR / Payroll (HR) | Timesheet labor costs flow to QS cost transactions |
| Accounting (ACC) | Budget vs actual reports; journal lines aggregated for actual cost |
| Naming Convention (NMT) | Budget code used as Package No. in master document codes |
| Notification Engine (NTF) | VO approval requests, retention release reminders, budget revision alerts |
| Audit Log Engine (AUD) | QS financial audit log (12 tables) tracked immutably |
| Reporting (RPT) | Budget vs actual dashboards, cost reports, S-curve charts |
