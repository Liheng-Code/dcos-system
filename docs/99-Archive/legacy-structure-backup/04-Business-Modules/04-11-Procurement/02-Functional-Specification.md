# DCOS — Module 04-11 Procurement
## Document 02 — Functional Specification

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-02 |
| Version | R1 |
| Depends On | Doc 01 Business Requirement |
| Status | For Development |

---

## 1. Entity Model Overview

| Code | Entity | Owner | Purpose |
|---|---|---|---|
| MR | Material Requisition | Site / Design | "I need this material, here, by this date" |
| PR | Purchase Requisition | Procurement / QS | Consolidated, budget-validated request to buy |
| RFQ | Request for Quotation | Procurement | Invitation to a bidder list |
| QT | Quotation | Supplier | Priced offer against an RFQ |
| CBA | Comparative Bid Analysis | Procurement | Normalised comparison + recommendation |
| PO | Purchase Order | Procurement | The binding commitment |
| POA | PO Amendment | Procurement | Versioned change to an issued PO |
| CO | Call-Off | Site / Procurement | Drawdown against a blanket PO |
| ASN | Advance Shipping Notice | Supplier | "It has left, arriving on this date" |
| GRN | Goods Receipt Note | **Inventory (04-12)** | Physical receipt — referenced, not owned |
| MAR | Material Approval Request | **Material Test (04-13)** | Consultant approval — referenced, not owned |

```text
MR (many)
 └─► PR (one, consolidated)
      └─► RFQ (one or many packages)
           └─► QT (many, one per invited supplier)
                └─► CBA (one per RFQ)
                     └─► PO (one or many, per awarded supplier)
                          ├─► POA (versioned amendments)
                          ├─► CO  (call-offs, blanket PO only)
                          ├─► ASN (supplier notices)
                          └─► GRN (Inventory) ─► Invoice (Finance) ─► 3-way match
```

---

## 2. Numbering Conventions

| Entity | Format | Example |
|---|---|---|
| MR | `{PROJ}-MR-{YYYY}-{NNNN}` | `P001-MR-2026-0184` |
| PR | `{PROJ}-PR-{YYYY}-{NNNN}` | `P001-PR-2026-0042` |
| RFQ | `{PROJ}-RFQ-{YYYY}-{NNNN}` | `P001-RFQ-2026-0031` |
| QT | `{RFQ}-Q{NN}` | `P001-RFQ-2026-0031-Q03` |
| PO | `{PROJ}-PO-{YYYY}-{NNNN}` | `P001-PO-2026-0117` |
| POA | `{PO}-A{NN}` | `P001-PO-2026-0117-A02` |
| CO | `{PO}-CO{NNN}` | `P001-PO-2026-0117-CO014` |

Sequences are per project, per year, per entity, allocated atomically at first save. Numbers are never reused, never renumbered, and never reissued after cancellation.

---

## 3. Functional Area F1 — Material Requisition (MR)

### F1.1 Create MR

| Field | Type | Rule |
|---|---|---|
| project_id | ref | From context, locked |
| wbs_node_id | ref | **Mandatory.** Leaf or intermediate node; must be status `Active` |
| discipline | enum | ARC / STR / MEP / CIVIL / TEMP / GEN |
| requested_by | ref | Current user |
| required_on_site_date | date | **Mandatory.** Warning if earlier than today + standard lead time for the item |
| priority | enum | Normal / Urgent / Emergency |
| justification | text | Mandatory when priority ≠ Normal |
| lines[] | array | ≥ 1 line |

**Line fields:** `item_id` (from item master) or `free_text_description`, `specification`, `quantity`, `uom`, `wbs_node_id` (defaults from header, overridable), `linked_task_id` (optional), `attachments[]`.

### F1.2 Behaviour

| Behaviour | Specification |
|---|---|
| Offline creation | MR is creatable offline on mobile; queued with device timestamp; synced with status `Draft` |
| Item master lookup | Type-ahead on item code, description, and specification; recent-items shortcut per project |
| Free-text items | Permitted, but flagged for Procurement to codify; free-text > 20% of a project's MR lines raises an admin warning |
| Duplicate detection | Warn if the same item + WBS node has an open MR/PR within the last 14 days |
| Photo attachment | Encouraged for damaged/replacement items; mandatory when reason code = `REWORK` |
| Stock check | On submission, system displays available free stock at project warehouses; requester may convert to a stock issue request instead of proceeding |
| Consolidation | Procurement selects multiple `Approved` MRs across WBS nodes into one PR; the link is retained both ways |

### F1.3 MR Status Model

`Draft` → `Submitted` → `Under Review` → `Approved` → `Consolidated into PR` → `Closed`
Alternate: `Returned for Clarification` → `Submitted`; `Rejected`; `Cancelled`; `Fulfilled from Stock`

---

## 4. Functional Area F2 — Purchase Requisition (PR)

### F2.1 PR Header

| Field | Rule |
|---|---|
| pr_no | Auto |
| project_id / package_name | Package name is free text, e.g. "Rebar — Tower B Levels 1-8" |
| procurement_type | Material / Service / Plant Hire / Consumable / Free-Issue |
| source_mrs[] | Linked MR references |
| required_on_site_date | Earliest of the linked MR dates |
| currency | Project contract currency default, overridable |
| estimated_value | Sum of line estimates in base currency |
| budget_status | `Within` / `Override Requested` / `Override Approved` / `No Budget Line` |
| single_source_flag | Boolean + justification |
| prepared_by / approval_route | System-resolved from value band |

### F2.2 PR Line

| Field | Rule |
|---|---|
| item_id / description / specification | Specification is mandatory for permanent-works materials |
| quantity, uom | UoM must match the BOQ item UoM or carry a conversion factor |
| wbs_node_id | **Mandatory** (BR-01) |
| boq_item_id | Mandatory, or `non_boq_reason_code` + QS endorsement (BR-02) |
| boq_allowable_rate | Read-only, pulled from BOQ Engine at PR creation |
| estimated_rate | Buyer's estimate |
| variance_vs_boq | Auto-calculated %, colour-coded; > +10% requires a note |
| required_date | Line-level, may differ from header |
| mar_required | Auto-set true when the item is classified as permanent works |

### F2.3 Budget Validation Engine

```text
For each PR line:
  allowable  = boq_item.allowable_amount + approved_vo_amount
  committed  = SUM(approved PO lines on this boq_item, base currency)
  actual     = SUM(matched invoice lines on this boq_item)
  available  = allowable - committed - actual
  requested  = estimated_rate × quantity (converted to base currency)

  IF requested <= available            → line_budget_status = WITHIN
  ELSE IF requested <= available × 1.1 → line_budget_status = MARGINAL   (warn, proceed)
  ELSE                                 → line_budget_status = EXCEEDED   (block)
```

Header `budget_status = EXCEEDED` blocks submission. The requester may raise an **Override Request** carrying: variance amount, reason code (`RATE_INCREASE`, `QTY_INCREASE`, `SCOPE_CHANGE`, `BOQ_ERROR`, `VO_PENDING`), narrative, and proposed recovery (VO claim / value engineering / absorb). Override approval sits one level above the normal band and is always logged as `HIGH` severity.

### F2.4 Approval Matrix (Default — configurable per company/project)

| Value Band (base currency) | Approval Chain |
|---|---|
| ≤ 1,000 | Procurement Officer → Procurement Manager |
| 1,001 – 10,000 | Procurement Manager → Project Manager |
| 10,001 – 50,000 | Project Manager → QS Manager → Project Director |
| 50,001 – 250,000 | Project Director → Commercial Manager → Company Admin |
| > 250,000 | Company Admin → Board Approver (step-up AAL 3 mandatory) |
| Any value, budget override | Normal chain **+ one level** |
| Any value, single-source | Normal chain **+ Project Director** |

Segregation of duties (BR-18): the system removes the preparer from the approver list for that record, even if their role qualifies.

### F2.5 PR Status Model

`Draft` → `Submitted` → `Under Review` → `Budget Check` → `Pending Approval` → `Approved` → `RFQ In Progress` → `Awarded` → `Closed`
Alternate: `Returned` → `Draft`; `Rejected`; `On Hold`; `Cancelled`; `Partially Awarded`

---

## 5. Functional Area F3 — RFQ and Quotation Intake

### F3.1 RFQ Creation

| Field | Rule |
|---|---|
| rfq_no, title, scope_summary | |
| source_pr_ids[] | One or many PRs may form one RFQ package |
| lines[] | Derived from PR lines; buyer may split a PR across multiple RFQ packages |
| invited_suppliers[] | Only suppliers with PQ status `Approved` for the trade category (BR-06) |
| issue_date, closing_datetime | Closing must be ≥ 24h after issue for standard, ≥ 2h for emergency |
| delivery_terms | Incoterm (EXW, FOB, CIF, DDP) + delivery location + WBS node |
| payment_terms | Net 30 / Net 60 / Advance % / LC / Milestone |
| currency_allowed[] | Which currencies bidders may quote in |
| required_documents[] | Technical datasheet, mill cert sample, warranty, HSE data sheet, delivery programme |
| evaluation_method | Lowest Compliant / Weighted Score (technical % + commercial %) |

**Minimum bidder count by value band** (configurable):

| PO value band | Min. invited | Min. valid responses |
|---|---:|---:|
| ≤ 1,000 | 1 | 1 |
| 1,001 – 10,000 | 3 | 2 |
| 10,001 – 100,000 | 4 | 3 |
| > 100,000 | 5 | 3 |

Falling short requires a `LIMITED_MARKET` justification and one additional approval level.

### F3.2 Sealed Quotation Control (BR-07, BR-08)

```text
Quotation submitted (portal or manual entry by Procurement Officer)
→ commercial fields (rates, totals, discounts, payment terms) encrypted at rest
→ visible fields before closing: supplier name, submission timestamp, doc count, completeness flag
→ commercial fields return NULL from the API for ALL roles before closing_datetime
→ at/after closing: two authorised users perform "Open Bids"
     - both identities + timestamp recorded on rfq_opening_event
     - opening is a single irreversible action
→ commercial fields become visible to the evaluation team only
→ any read attempt on sealed fields before opening → AUDIT severity CRITICAL
```

Manual entry (the common case in SEA markets) follows the same rule: the officer keys the values into a sealed form, cannot re-read them, and the original PDF is attached and hash-stamped.

### F3.3 Quotation Normalisation

Quotations are rarely comparable as submitted. The system normalises before comparison:

| Dimension | Normalisation |
|---|---|
| Currency | Convert to base currency at the RFQ closing-date rate; original preserved |
| UoM | Apply item conversion factor (e.g. supplier quotes per tonne, BOQ is per kg) |
| Incoterm | Add estimated freight, insurance, duty, and clearance to EXW/FOB quotes to reach a DDP-equivalent landed cost |
| Payment terms | Discount to net present value at the company's configured cost of capital |
| Discounts | Apply line, order-value, and early-settlement discounts explicitly |
| Exclusions | Bidder exclusions (offloading, testing, wastage) priced as an allowance |

The comparison view shows **both** the as-quoted and the normalised landed figure. Never hide the arithmetic from a QS; they will not trust it.

### F3.4 Technical Evaluation

Per line, per bidder: `Compliant` / `Deviation (minor)` / `Deviation (major)` / `Non-Compliant`, with a mandatory note on any non-compliant status and an optional weighted technical score (0-100) when `evaluation_method = Weighted Score`.

A bidder with any `Non-Compliant` line is excluded from the lowest-compliant calculation but stays visible in the CBA — excluded bidders must remain in the record for audit.

### F3.5 Comparative Bid Analysis (CBA)

Auto-generated, containing: bidder columns × line rows, as-quoted and normalised totals, technical status per line, ranking, lowest-compliant highlight, BOQ allowable comparison, savings/overrun vs PR estimate, and a recommendation block.

Award to other than the lowest compliant (BR-09) requires a justification of ≥ 50 characters selecting a reason code: `TECHNICAL_SUPERIORITY`, `DELIVERY_PROGRAMME`, `PAYMENT_TERMS`, `PAST_PERFORMANCE`, `CLIENT_NOMINATED`, `WARRANTY`, `LOCAL_CONTENT`.

### F3.6 RFQ Status Model

`Draft` → `Issued` → `Open for Bidding` → `Closed for Bidding` → `Bids Opened` → `Under Evaluation` → `Recommendation Pending` → `Awarded` → `Closed`
Alternate: `Cancelled` · `Re-tendered` · `Failed — Insufficient Bids`

---

## 6. Functional Area F4 — Purchase Order

### F4.1 PO Generation

Generated from the awarded quotation with zero re-keying. The system carries forward: supplier, lines, rates, currency, incoterm, payment terms, delivery schedule, and the source PR/RFQ/QT references. Editable before approval: delivery dates, split-delivery schedule, special conditions, ship-to address.

### F4.2 PO Types

| Type | Behaviour |
|---|---|
| Standard | Fixed quantity, fixed value, defined delivery schedule |
| Blanket / Call-Off | Agreed rates + ceiling value + validity period; quantity drawn down via Call-Off records |
| Service | Milestone or period-based; receipt is a Service Entry Sheet, not a GRN |
| Plant Hire | Rate per day/week/month, on-hire and off-hire dates, minimum hire period |
| Free-Issue | Zero commercial value, full quantity control, client as the supplier of record |
| Emergency | Retrospective PR link mandatory within 3 working days (BR-15) |

### F4.3 Pre-Issue Gates

Checked in order; the first failure blocks issue and states which gate failed:

1. Supplier PQ status `Approved`, category matches, approval not expired (BR-06)
2. Budget still available at approval time — re-checked, not trusted from PR time
3. MAR approved for every permanent-works line (BR-14)
4. Approver is not the preparer (BR-18)
5. Step-up authentication if value ≥ threshold (BR-17)
6. Supplier bank details verified and change-audited (fraud control)
7. Blanket ceiling not exceeded for call-offs (BR-11)

### F4.4 Commitment Posting

On PO status `Approved`, the system posts a commitment per line to the Cost Engine:

```text
cost_commitment {
  boq_item_id, wbs_node_id, po_line_id,
  committed_amount_base, committed_amount_txn, currency, fx_rate_snapshot,
  committed_at, status = OPEN
}
```

Commitment is **relieved** as actual cost is recognised at three-way match, and closed at PO close-out with any unspent balance released back to available budget. This release is the step most systems forget, and it is why committed cost reports drift upward forever.

### F4.5 PO Amendment (POA)

| Change | Effect |
|---|---|
| Quantity ↑, rate ↑, scope ↑ | New version, full re-approval at the **new total value** band, commitment adjusted |
| Quantity ↓, cancellation of lines | New version, approval one level, commitment released |
| Delivery date change only | Version increment, Procurement Manager approval, supplier notified, no commitment change |
| Ship-to / contact change | Version increment, no approval, audit logged |
| Supplier bank detail change | **Never via amendment** — separate verified process in Supplier module, dual approval, CRITICAL audit |

Every version is retained in full. The PDF of each issued version is stored immutably.

### F4.6 Delivery, Expediting and Receipt

| Function | Specification |
|---|---|
| Delivery schedule | Per line, one or many scheduled deliveries with qty and date |
| Expediting status | `Not Started` / `Confirmed` / `In Production` / `Ready` / `Shipped` / `In Transit` / `Customs` / `At Site` / `Received` |
| Expediting log | Dated contact record per PO line — who was called, what they said, next action date |
| ASN | Supplier-submitted or Procurement-entered: shipment ref, qty, ETA, carrier, documents |
| Gate receipt | Site Engineer confirms arrival on mobile with photo; creates a **pending GRN** in Inventory |
| GRN mirror | Inventory posts the confirmed GRN; Procurement updates `delivered_qty` read-only |
| Over-delivery | Within tolerance → accepted; beyond → PM approval or return-to-supplier record |
| Short delivery | PO line stays `Partially Delivered`; expediting reopens automatically |
| Rejection | QA/QC rejection creates a Non-Conforming Material record and a supplier debit note trigger |

### F4.7 Three-Way Match

```text
Invoice received (Finance)
→ match on po_no + supplier
→ per line: invoice_qty  vs  matched GRN qty      (tolerance: 0)
            invoice_rate vs  PO rate              (tolerance: 0)
            invoice_total vs GRN qty × PO rate    (tolerance: 2% or 50, configurable)
→ ALL PASS      → status MATCHED     → released to payment scheduling
→ ANY FAIL      → status EXCEPTION   → routed to Procurement Officer with variance detail
→ EXCEPTION resolution: accept variance (approval by value band) | request credit note |
                        raise POA | reject invoice
```

Auto-posting an unmatched invoice is not a feature. It is how money leaves a company quietly.

### F4.8 PO Close-Out

Triggered when all lines are fully delivered and invoiced, or manually with reason (`SHORT_CLOSED`, `CANCELLED_BY_AGREEMENT`, `SUPPLIER_DEFAULT`, `NO_LONGER_REQUIRED`). Close-out releases the residual commitment, freezes the PO against amendment (BR-10), triggers supplier performance scoring, and captures the warranty start date where applicable.

### F4.9 PO Status Model

`Draft` → `Pending Approval` → `Approved` → `Issued` → `Acknowledged` → `In Production` → `Partially Delivered` → `Fully Delivered` → `Partially Invoiced` → `Fully Invoiced` → `Closed`
Alternate: `Rejected` · `On Hold` · `Amended` · `Short Closed` · `Cancelled` · `Disputed`

---

## 7. Functional Area F5 — Long-Lead Item Register

| Function | Specification |
|---|---|
| Register | Items flagged `is_long_lead` with a standard procurement lead time (days) per item and per region |
| Backward planning | `order_by_date = required_on_site_date − (supplier_lead_time + shipping + customs + approval_cycle_days)` |
| CPM linkage | `required_on_site_date` pulled from the linked schedule activity's early start; changes to the programme re-drive the order-by date |
| Alerting | Amber at order_by_date + 7 days remaining; red at order_by_date; critical when the linked activity is on the critical path |
| Dashboard | Long-lead board sorted by float, showing status against order-by date |

This is the single feature that prevents "we didn't order the lifts in time" — the most expensive sentence in high-rise construction.

---

## 8. Functional Area F6 — Supplier Portal (Phase 3)

| Capability | Notes |
|---|---|
| RFQ inbox and response | Line-by-line pricing, document upload, clarification Q&A thread |
| Sealed submission | Supplier can amend until closing; sees a countdown, not other bidders |
| PO acknowledgement | Accept / query with reason; acknowledgement is a contractual event, timestamped |
| ASN submission | Shipment, qty, ETA, packing list, documents |
| Invoice submission | Against PO/GRN, with automatic mismatch feedback before submission |
| Document library | Mill certs, warranties, insurance, PQ renewals |

Portal access uses external identity per 03-01 §8.3, contract-scoped and expiring.

---

## 9. Configuration Parameters

| Parameter | Scope | Default |
|---|---|---|
| `approval_value_bands` | Company / Project | Per §4.4 |
| `min_bidders_by_band` | Company | Per §5.1 |
| `budget_marginal_tolerance_pct` | Project | 10% |
| `over_delivery_tolerance_pct` | Project | 5% |
| `invoice_match_tolerance_pct` / `_abs` | Company | 2% / 50 base |
| `emergency_regularisation_days` | Company | 3 working days |
| `step_up_threshold` | Company | 50,000 base |
| `rfq_min_open_hours_standard` / `_emergency` | Company | 24 / 2 |
| `enforce_pq_gate` | Company | Off in Phase 2, On in Phase 3 |
| `enforce_mar_gate` | Project | On |
| `duplicate_mr_window_days` | Project | 14 |
| `non_boq_reason_codes` | Company | PRELIM, TEMP_WORKS, VO_PENDING, OVERHEAD |

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| PR list load (1,000 records) | < 1.5 s |
| CBA generation (5 bidders × 200 lines) | < 3 s |
| Budget check on PR submission | < 800 ms |
| PO PDF generation | < 4 s |
| Mobile MR creation, offline | Instant local write; sync < 30 s on reconnect |
| Committed cost report | < 5 s standard, async with notification if > 10,000 lines |
| Concurrent approvers | 200 without contention on the approval queue |
| Sealed field encryption | AES-256 at rest, key per project, no plaintext in logs or backups |

---

*Digital Construction Operating System — Procurement — Doc 02 Functional Specification — Internal Controlled Document*
