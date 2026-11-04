# DCOS — Module 04-11 Procurement
## Document 01 — Business Requirement

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-01 |
| Module Path | `04-Procurement / 04-11-Procurement` |
| Module Scope | Material Requisition → PR → RFQ → Quotation → Evaluation → PO → Delivery → GRN handoff → PO close-out |
| Tier | T1 — Full 12-document set |
| Build Phase | Phase 2 (Commercial Foundation) |
| Version | R1 — Initial Issue |
| Parent | DCOS System Architecture Module Design R0 §13 |
| Related | Gap Analysis R1 §4.4, §7 Phase 2 |
| Status | For Development |

---

## 1. Purpose

Procurement is where a construction company's budget stops being a spreadsheet and starts becoming a legally binding commitment. Every purchase order is a contract. Every purchase order signed without a budget check is an unplanned loss that will not be visible until the final account.

This module controls the full commitment chain:

> **Someone needs material → is there budget → who can supply it → at what price → who approved it → did it arrive → does the invoice match.**

The module owns the request-to-order cycle. It does **not** own supplier onboarding (04-10 Supplier Prequalification), stock movement (04-12 Inventory), material testing (04-13 Material Test & Traceability), subcontract packages (04-14 Subcontractor Management), or payment (06-xx Account/Finance). It hands off cleanly to each.

---

## 2. Business Context — Why Construction Procurement Is Different

Generic ERP procurement assumes a warehouse, a stable catalogue, repeat orders, and one delivery address. Construction breaks all four.

| Construction Reality | Requirement It Creates |
|---|---|
| Material is consumed at a **location**, not a cost centre | Every PR line must carry a WBS node and a BOQ item — no exceptions |
| The BOQ rate was priced at tender, months before purchase | PR must show BOQ allowable rate vs quoted rate so overspend is visible **before** the PO, not after |
| Rebar, lifts, chillers, curtain wall are **long-lead** | Long-lead register with required-on-site date driven from the CPM schedule, procurement lead time backwards-planned |
| Materials for permanent works need client/consultant approval | PO for permanent materials must be blocked until Material Approval Request (MAR) is approved |
| Deliveries arrive at a gate with no storekeeper at 06:30 | GRN must be raisable from mobile, offline, by a site engineer, with photo |
| Concrete, aggregate, and fuel are **call-off**, not one-shot | Blanket / call-off PO with drawdown against an agreed rate and total ceiling |
| Client sometimes supplies material free of charge | Free-issue material tracked as zero-value receipt but full quantity control |
| Site runs out of a critical item on a Friday night | Emergency purchase route with retrospective approval and a hard audit flag |
| A supplier quotes in USD, invoices in KHR, ships from Thailand | Multi-currency PO, incoterms, customs duty, and landed-cost handling |
| The same steel supplier also has a subcontract | One supplier record, two commercial relationships — never duplicate the vendor |
| Disputes surface 3 years later at final account | Append-only evidence of who evaluated, who approved, and what the quotes actually were |

**The failure this module exists to prevent:** a project that is 40% complete, 60% committed, and nobody knows it until the QS runs a manual reconciliation in Excel.

---

## 3. Business Objectives

| # | Objective | Measure of Success |
|---|---|---|
| BO-01 | Every purchase is traceable to a WBS location and a BOQ item | 100% of PO lines carry `wbs_node_id` + `boq_item_id` (or an approved non-BOQ reason code) |
| BO-02 | No commitment exceeds available budget without conscious override | 0 POs issued over budget without a logged override approval |
| BO-03 | Committed cost is visible in real time | Committed cost report accurate to within 1 working day at any point |
| BO-04 | Competitive pricing is demonstrable | ≥ 3 quotations on ≥ 90% of PO value above threshold; single-source justified and approved |
| BO-05 | Long-lead items do not delay the programme | 0 critical-path delays attributed to late procurement |
| BO-06 | Procurement cycle time is measured and reduced | PR→PO median cycle within target per value band |
| BO-07 | Bid integrity is protected | Quotations sealed until closing; opening event logged with dual custody |
| BO-08 | Invoices are matched, not trusted | 100% of supplier invoices pass three-way match or are exception-flagged |
| BO-09 | Material approval precedes permanent-works purchase | 0 POs for permanent materials issued without an approved MAR |
| BO-10 | The audit trail survives the dispute | Full evaluation and approval history retained 10 years, append-only |

---

## 4. Key Stakeholders

| Stakeholder | Role in This Module |
|---|---|
| Site Engineer / Supervisor | Raises Material Requisition from site; confirms delivery at gate |
| Discipline Lead (ARC/STR/MEP) | Confirms technical specification and quantity on PR |
| QS / Cost Engineer | Validates BOQ linkage, allowable rate, and budget availability |
| Procurement Officer | Runs RFQ, collects quotations, prepares comparative bid analysis |
| Procurement Manager | Approves supplier selection, issues PO within delegated authority |
| Project Manager | Approves PR and PO within project delegated authority |
| Project Director / Company Admin | Approves high-value PO, single-source, and budget override |
| Storekeeper | Receives material, raises GRN, updates stock |
| QA/QC Inspector | Inspects incoming material, links test certificates, rejects non-conforming |
| Accountant / Finance | Three-way match, invoice booking, payment scheduling |
| Supplier | Receives RFQ, submits quotation, receives PO, submits ASN and invoice |
| Auditor / Claims Team | Reads evaluation and approval evidence years later |

---

## 5. Scope

### 5.1 In Scope

- Material Requisition (MR) from site, design, or QS
- Purchase Requisition (PR) with WBS + BOQ + budget validation
- Budget availability check and override approval route
- RFQ issue to prequalified suppliers, sealed quotation intake
- Quotation registration, normalisation, and comparison
- Technical evaluation (compliance / deviation) and commercial evaluation
- Comparative Bid Analysis (CBA) and recommendation to award
- Single-source / sole-source justification workflow
- Purchase Order issue, amendment, cancellation, close-out
- Blanket / call-off PO with drawdown control
- Delivery schedule, expediting, and partial delivery tracking
- Advance Shipping Notice (ASN) and gate receipt trigger
- Handoff to Inventory for GRN; handoff to Finance for three-way match
- Long-lead item register linked to the CPM schedule
- Free-issue and client-supplied material orders
- Emergency purchase with retrospective approval
- Procurement dashboards, cycle-time and savings reporting

### 5.2 Out of Scope (owned elsewhere)

| Concern | Owning Module |
|---|---|
| Supplier registration, PQ, approved trade categories, blacklist | 04-10 Supplier Prequalification |
| Physical stock receipt, bin location, issue, transfer, valuation | 04-12 Inventory / Stock |
| Mill certificates, cube tests, batch traceability | 04-13 Material Test & Traceability |
| Subcontract packages, sub-IPC, back-charges, retention on subs | 04-14 Subcontractor Management |
| BOQ item master, rates, budget baseline | 06-01 BOQ Engine |
| Invoice booking, payment run, AP ledger, FX gain/loss | 06-08 Account / Finance |
| Approval routing engine, delegation, escalation | Approval Workflow Engine |
| Identity, step-up authentication on PO approval | 03-01 Authentication |

**Boundary note on GRN:** the GRN *record* belongs to Inventory. Procurement owns the PO line's `delivered_qty` as a derived, read-only mirror. Two modules must never both claim to be the source of truth for received quantity, or the reconciliation will not close.

---

## 6. Functional Requirements Summary

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Raise MR from web or mobile against a WBS node with required-on-site date | Must |
| FR-02 | Consolidate multiple MRs into a single PR | Must |
| FR-03 | PR line mandatory fields: item, spec, qty, UoM, WBS node, BOQ item, required date | Must |
| FR-04 | Real-time budget check: `BOQ allowable − committed − actual ≥ PR value` | Must |
| FR-05 | Block PR submission on budget failure; permit override with mandatory reason + higher approval | Must |
| FR-06 | Value-banded approval matrix, configurable per company and per project | Must |
| FR-07 | Issue RFQ to ≥ 3 approved suppliers; enforce minimum bidder count by value band | Must |
| FR-08 | Quotations sealed until RFQ closing datetime; opening requires two authorised users | Must |
| FR-09 | Auto-normalise quotations to a common currency, UoM, and incoterm for comparison | Must |
| FR-10 | Technical evaluation with compliant / deviation / non-compliant per line | Must |
| FR-11 | Auto-generate Comparative Bid Analysis with lowest-compliant highlighted | Must |
| FR-12 | Selection of other than lowest requires written justification | Must |
| FR-13 | Single-source purchase requires justification and Project Director approval | Must |
| FR-14 | Generate PO from awarded quotation without re-keying | Must |
| FR-15 | Block PO issue for permanent-works materials without approved MAR | Must |
| FR-16 | PO amendment with version history and re-approval when value or scope changes | Must |
| FR-17 | Blanket PO with ceiling value and call-off drawdown tracking | Should |
| FR-18 | Delivery schedule per PO line; expediting status and supplier ASN | Must |
| FR-19 | Partial delivery, over-delivery tolerance, and short-delivery handling | Must |
| FR-20 | Three-way match: PO ↔ GRN ↔ Invoice with configurable tolerance | Must |
| FR-21 | Emergency purchase route with retrospective approval within N days | Should |
| FR-22 | Long-lead register with backward-planned order-by date from CPM | Should |
| FR-23 | Multi-currency PO with rate snapshot at issue date | Must |
| FR-24 | Free-issue / client-supplied material order at zero value with full qty control | Should |
| FR-25 | Supplier portal access for RFQ response, ASN, and invoice submission | Could (Phase 3) |

---

## 7. Business Rules

| ID | Rule |
|---|---|
| BR-01 | A PR line without a WBS node cannot be submitted. |
| BR-02 | A PR line without a BOQ item requires a non-BOQ reason code (`PRELIM`, `TEMP_WORKS`, `VO_PENDING`, `OVERHEAD`) and QS endorsement. |
| BR-03 | Committed cost is created at **PO approval**, not at PR approval. PR creates a soft reservation only. |
| BR-04 | Budget check uses: `available = boq_allowable + approved_vo − committed − actual`. |
| BR-05 | Approval authority is by **PO value in company base currency**, evaluated at the FX rate on the approval date. |
| BR-06 | A PO may only be issued to a supplier with PQ status `Approved` for the relevant trade category and a non-expired approval. |
| BR-07 | Quotation values are invisible to all users, including Procurement, until the RFQ closing datetime has passed. |
| BR-08 | RFQ opening requires two distinct authorised users; both identities are recorded on the opening event. |
| BR-09 | Award to other than the lowest compliant bidder requires a justification of ≥ 50 characters and one approval level above the normal band. |
| BR-10 | A PO cannot be amended after status `Closed`. Raise a new PO. |
| BR-11 | Cumulative call-off value against a blanket PO cannot exceed the ceiling without an approved amendment. |
| BR-12 | Over-delivery is accepted only within the configured tolerance (default 5% or 1 UoM, whichever is greater); beyond that requires PM approval. |
| BR-13 | Invoice value exceeding matched GRN value beyond tolerance (default 2% / USD 50) is blocked and exception-flagged, never auto-posted. |
| BR-14 | A PO for permanent-works material is blocked unless the linked MAR status is `Approved`. Temporary works and consumables are exempt. |
| BR-15 | Emergency purchases must be regularised with a retrospective PR and approval within 3 working days, or the buyer is escalated to the Project Director. |
| BR-16 | Deleting a PR, RFQ, quotation, or PO is never permitted. Cancel with reason. |
| BR-17 | PO approval requires step-up authentication (AAL 3) above the configured threshold, per 03-01 §6.2. |
| BR-18 | The same user cannot both prepare and approve a PR or PO — segregation of duties is enforced by the system, not by policy. |

---

## 8. Assumptions

1. The BOQ Engine (06-01) is live and holds contract BOQ items with allowable rates before Procurement goes live.
2. Supplier Prequalification (04-10) provides an approved supplier register with trade categories.
3. The Approval Workflow Engine supports value-banded, project-scoped, multi-level routing with delegation.
4. Multi-currency rates are supplied by the FX module; Procurement stores a rate snapshot, never recalculates history.
5. Inventory (04-12) owns GRN and exposes it to Procurement via event and read API.
6. Mobile field app supports offline MR creation and gate receipt confirmation.

---

## 9. Constraints

| Constraint | Impact |
|---|---|
| Phase 2 build — BOQ Engine must ship first or concurrently | Procurement cannot enforce BR-04 without it; interim mode uses budget lines only |
| Supplier PQ module is Phase 3 in the Gap Analysis | Phase 2 uses a simple approved-supplier flag; full PQ gating switches on in Phase 3 |
| Cambodia / SEA suppliers frequently quote by WhatsApp or PDF | Quotation intake must support manual entry with attachment, not only portal submission |
| Site connectivity is unreliable | MR creation and gate receipt must work offline; PR/PO approval must not |
| Some clients mandate their own e-procurement portal | Integration Layer must support PO export in a defined schema |

---

## 10. Success Criteria

| Criterion | Target at 6 Months Post Go-Live |
|---|---|
| PR lines with valid WBS + BOQ linkage | ≥ 98% |
| PO value covered by ≥ 3 quotations (above threshold) | ≥ 90% |
| Median PR → PO cycle time, standard items | ≤ 7 working days |
| Median PR → PO cycle time, emergency route | ≤ 1 working day |
| Committed cost report reconciles to PO register | 100%, no manual adjustment |
| Invoices passing three-way match first time | ≥ 85% |
| Deliveries received against a valid open PO | ≥ 95% |
| Procurement-attributed critical-path delays | 0 |
| Emergency purchases as % of PO count | ≤ 5% and trending down |

---

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Site bypasses the system for urgent purchases | Uncontrolled cost, no audit trail | Fast emergency route inside the system with retrospective approval — make the compliant path the easy path |
| BOQ not yet loaded when procurement starts | Budget check unenforceable | Interim budget-line mode; hard switch to BOQ mode once loaded, with a migration reconciliation |
| Suppliers refuse to use a portal | Quotation intake stalls | Manual quotation entry with mandatory attachment of the original PDF; portal is optional, not required |
| Approval bottleneck at PM level | Procurement cycle time blows out | Delegation, escalation after configured hours, and an approver workload KPI on the dashboard |
| Single-source becomes the default habit | Loss of competitive pricing | Single-source % tracked as a board-level KPI; Project Director approval mandatory |
| Quotation leakage before opening | Bid integrity destroyed, legal exposure | Field-level encryption of quote values until closing; dual-custody opening; access attempts audited as CRITICAL |
| Over-committed budget discovered late | Cost overrun | Real-time committed cost; PR blocked at source, not reported after the fact |
| Duplicate supplier records | Spend analysis meaningless, PQ bypassed | Supplier master owned solely by 04-10; Procurement references, never creates |

---

## 12. Dependencies

| Depends On | Nature | Blocking? |
|---|---|---|
| 03-01 Authentication | Identity, step-up on PO approval | Yes |
| 03-02 RBAC | Role and delegated authority resolution | Yes |
| WBS Engine | WBS node reference on every line | Yes |
| 06-01 BOQ Engine | Allowable rate and budget baseline | Yes (BR-04) |
| Approval Workflow Engine | Value-banded routing | Yes |
| 04-10 Supplier Prequalification | Approved supplier register | Partial (Phase 3 hard gate) |
| 04-12 Inventory / Stock | GRN events | Yes |
| 04-13 Material Test & Traceability | MAR status for BR-14 | Partial |
| 06-08 Account / Finance | Invoice, three-way match outcome, payment | Yes |
| 07-01 Multi-Currency / FX | Rate snapshot on PO | Partial |
| Notification Engine | Approval, expediting, and delivery alerts | Yes |
| Audit Trail Engine | Append-only procurement evidence | Yes |
| Planning & Scheduling (CPM) | Required-on-site dates for long-lead backward planning | No (degrades to manual dates) |

---

*Digital Construction Operating System — Procurement — Doc 01 Business Requirement — Internal Controlled Document*
