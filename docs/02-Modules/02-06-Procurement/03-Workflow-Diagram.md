# DCOS — Module 04-11 Procurement
## Document 03 — Workflow Diagram

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-03 |
| Version | R1 |
| Depends On | Doc 02 Functional Specification |
| Status | For Development |

---

## 1. Master Flow — Requisition to Payment

```text
┌─ SITE / DESIGN / QS ────────────────────────────────────────────────┐
│  Material need identified at a WBS location                          │
│         │                                                            │
│         ▼                                                            │
│   Create MR ──► stock availability check ──► fulfil from stock? ─Yes─┼─► Stock Issue Request
│         │                                          │No               │      (04-12 Inventory)
│         ▼                                          ▼                 │
│   Discipline Lead reviews spec & quantity                            │
└─────────┬───────────────────────────────────────────────────────────┘
          ▼
┌─ PROCUREMENT / QS ──────────────────────────────────────────────────┐
│  Consolidate approved MRs ──► create PR                              │
│         │                                                            │
│         ▼                                                            │
│   QS validates WBS + BOQ linkage                                     │
│         │                                                            │
│         ▼                                                            │
│   BUDGET CHECK ──── EXCEEDED ──► Override Request ──► +1 approval    │
│         │ WITHIN / MARGINAL                    │                     │
│         ▼                                      │ rejected            │
│   Value-banded approval chain ◄────────────────┘                     │
│         │                                                            │
│         ▼  PR Approved                                               │
└─────────┬───────────────────────────────────────────────────────────┘
          ▼
┌─ SOURCING ──────────────────────────────────────────────────────────┐
│  Single source? ──Yes──► justification ──► Project Director approval │
│         │No                                        │                 │
│         ▼                                          │                 │
│   Build bidder list (PQ-approved only)             │                 │
│         ▼                                          │                 │
│   Issue RFQ ──► bidding window open ──► clarification Q&A            │
│         ▼                                          │                 │
│   CLOSING DATETIME reached (quotes sealed)         │                 │
│         ▼                                          │                 │
│   Dual-custody BID OPENING                         │                 │
│         ▼                                          │                 │
│   Normalisation ──► Technical eval ──► Commercial eval               │
│         ▼                                          │                 │
│   Comparative Bid Analysis + recommendation ◄──────┘                 │
│         ▼                                                            │
│   Award decision ──► not lowest? ──► justification + 1 approval      │
└─────────┬───────────────────────────────────────────────────────────┘
          ▼
┌─ COMMITMENT ────────────────────────────────────────────────────────┐
│  Generate PO from awarded quotation                                  │
│         ▼                                                            │
│   PRE-ISSUE GATES: PQ · budget re-check · MAR · SoD · step-up · bank │
│         │ any fail ──► blocked, reason shown                         │
│         ▼ all pass                                                   │
│   Approval chain ──► PO APPROVED ──► POST COMMITMENT to Cost Engine   │
│         ▼                                                            │
│   Issue PO to supplier ──► supplier acknowledgement                   │
└─────────┬───────────────────────────────────────────────────────────┘
          ▼
┌─ EXECUTION ─────────────────────────────────────────────────────────┐
│   Expediting cycle ──► ASN ──► delivery to site gate                 │
│         ▼                                                            │
│   Site gate receipt (mobile, photo) ──► pending GRN                  │
│         ▼                                                            │
│   Storekeeper confirms GRN (04-12) ──► QA/QC inspection              │
│         │ reject ──► NCM record ──► return / debit note              │
│         ▼ accept                                                     │
│   Stock increases · PO delivered_qty updated                         │
└─────────┬───────────────────────────────────────────────────────────┘
          ▼
┌─ SETTLEMENT ────────────────────────────────────────────────────────┐
│   Supplier invoice ──► THREE-WAY MATCH (PO · GRN · Invoice)          │
│         │ exception ──► resolve: accept / credit note / POA / reject │
│         ▼ matched                                                    │
│   Actual cost posted · commitment relieved                           │
│         ▼                                                            │
│   Payment scheduling (06-08 Finance)                                 │
│         ▼                                                            │
│   PO CLOSE-OUT ──► residual commitment released                      │
│         ▼                                                            │
│   Supplier performance scoring (04-10)                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Swimlane — Standard Purchase (Value Band 10,001–50,000)

| Step | Site Engineer | Discipline Lead | Proc. Officer | QS | Proc. Mgr | PM | Proj. Director | Storekeeper | Finance |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Create MR | | | | | | | | |
| 2 | | Review spec | | | | | | | |
| 3 | | | Consolidate → PR | | | | | | |
| 4 | | | | Validate BOQ + budget | | | | | |
| 5 | | | | | Approve | | | | |
| 6 | | | | | | Approve | | | |
| 7 | | | | | | | Approve | | |
| 8 | | | Issue RFQ (4 bidders) | | | | | | |
| 9 | | | Open bids (with QS) | Co-open | | | | | |
| 10 | | Technical eval | Commercial eval | | | | | | |
| 11 | | | Prepare CBA | Endorse | Recommend | | | | |
| 12 | | | | | | Approve award | Approve PO | | |
| 13 | | | Issue PO | | | | | | |
| 14 | Confirm gate arrival | | Expedite | | | | | Raise GRN | |
| 15 | | | Resolve exceptions | | | | | | 3-way match |
| 16 | | | Close PO | Verify commitment release | | | | | Pay |

---

## 3. Budget Override Sub-Flow

```text
PR line budget_status = EXCEEDED
        │
        ▼
Requester raises Override Request
   ├─ variance amount (auto)
   ├─ reason code: RATE_INCREASE | QTY_INCREASE | SCOPE_CHANGE | BOQ_ERROR | VO_PENDING
   ├─ narrative (mandatory, ≥ 100 chars)
   └─ recovery plan: VO claim | value engineering | absorb into contingency
        │
        ▼
QS Manager review ──► reject ──► PR returned to Draft
        │ endorse
        ▼
Normal approval chain + ONE additional level
        │
        ├─ reason = VO_PENDING ──► auto-create linked entry in Variation Order register
        ├─ reason = BOQ_ERROR  ──► auto-raise BOQ correction request to 06-01
        └─ reason = SCOPE_CHANGE ──► notify Contract Administration (entitlement check)
        │
        ▼
Override Approved ──► PR proceeds ──► AUDIT severity HIGH ──► appears on
                                       Budget Override Register (monthly board pack)
```

An override is not a failure of the system. Silently allowing the overspend would be.

---

## 4. Sealed Bid Opening Sub-Flow

```text
RFQ status = Open for Bidding
   ├─ Supplier submits (portal) OR Officer keys in sealed form
   ├─ Commercial fields encrypted; API returns NULL for all roles
   └─ Visible: supplier name · submission time · document count · completeness
        │
        ▼  closing_datetime reached
RFQ status = Closed for Bidding    (no further submissions accepted)
        │
        ▼
"Open Bids" requires TWO authorised users, both authenticated in the same session window
   ├─ User A initiates → 10-minute window
   ├─ User B confirms  → opening executes
   └─ Either identity missing → cannot proceed
        │
        ▼
rfq_opening_event recorded: both user ids, timestamp, ip, bid count, hash of each quote
        │
        ▼
RFQ status = Bids Opened   ← IRREVERSIBLE
        │
        ▼
Commercial fields decrypted for the named evaluation team only
```

**Failure paths:** fewer than the minimum valid bids → `Failed — Insufficient Bids` → re-tender or `LIMITED_MARKET` justification. Late submission → recorded as `Late — Not Considered`, retained in the record, never deleted.

---

## 5. Blanket PO Call-Off Sub-Flow

```text
Blanket PO approved: agreed rates + ceiling value + validity period
        │
        ▼
Site raises Call-Off (item, qty, delivery date, WBS node)
        │
        ▼
System check: (cumulative called-off + this call-off) ≤ ceiling?
        ├─ No  ──► blocked ──► raise POA to increase ceiling (full approval band)
        └─ Yes ──► Procurement Manager approval (single level)
        │
        ▼
Call-off released to supplier ──► delivery ──► GRN against the call-off
        │
        ▼
Drawdown updated: called-off · delivered · invoiced · remaining ceiling
        │
        ▼
Alert at 80% of ceiling · block at 100% · alert 30 days before validity expiry
```

Used for ready-mix concrete, aggregate, fuel, rebar, and formwork consumables — anything ordered forty times a month at an agreed rate.

---

## 6. Emergency Purchase Sub-Flow

```text
Site raises Emergency Purchase Request (priority = Emergency, justification mandatory)
        │
        ▼
Verbal / immediate authorisation by PM or Project Director (recorded in system with identity)
        │
        ▼
Emergency PO issued ──► status = Issued (Pending Regularisation)
        │                └─ flagged on every dashboard until regularised
        ▼
Material delivered · GRN raised normally
        │
        ▼
Within 3 working days: retrospective PR created, BOQ linked, budget check run
        ├─ regularised ──► PO flag cleared ──► normal settlement
        └─ NOT regularised by day 3 ──► escalation to Project Director
                                   ──► buyer's emergency authority auto-suspended
                                   ──► appears on Emergency Purchase Exception Report
```

The emergency route must be fast enough that nobody is tempted to buy off-system. It must also be uncomfortable enough that nobody uses it twice a week.

---

## 7. Delivery Exception Handling

```text
Delivery arrives at gate
        │
        ├─ No matching open PO ──────► REFUSE ENTRY · log Unmatched Delivery
        │                              notify Procurement + PM (High)
        │
        ├─ Qty > ordered + tolerance ─► accept up to tolerance
        │                              excess: PM approval OR return-to-supplier note
        │
        ├─ Qty < ordered ────────────► accept partial · line stays Partially Delivered
        │                              expediting reopens · supplier notified
        │
        ├─ Wrong item / spec ────────► reject · Non-Conforming Material (04-13)
        │                              supplier debit note trigger · performance score hit
        │
        ├─ Damaged in transit ───────► conditional receipt with photo evidence
        │                              claim on carrier/supplier · QA/QC decision
        │
        └─ Missing test certificate ─► receive to QUARANTINE bin
                                       stock unavailable for issue until cert uploaded (04-13)
```

---

## 8. State Transition Matrix — Purchase Order

| From ↓ / To → | Pending Appr. | Approved | Issued | Acknowledged | Partially Del. | Fully Del. | Fully Inv. | Closed | Cancelled | On Hold |
|---|---|---|---|---|---|---|---|---|---|---|
| Draft | ✔ | | | | | | | | ✔ | |
| Pending Approval | | ✔ | | | | | | | ✔ | ✔ |
| Approved | | | ✔ | | | | | | ✔ | ✔ |
| Issued | | | | ✔ | ✔ | ✔ | | | ✔ | ✔ |
| Acknowledged | | | | | ✔ | ✔ | | | ✔ | ✔ |
| Partially Delivered | | | | | | ✔ | | ✔¹ | ✔¹ | ✔ |
| Fully Delivered | | | | | | | ✔ | ✔ | | ✔ |
| Fully Invoiced | | | | | | | | ✔ | | |
| Closed | | | | | | | | | | |

¹ Short close or cancellation from a partially delivered state requires a reason code and PM approval; delivered quantities remain payable.

**Rejection path:** `Pending Approval` → `Rejected` → `Draft` (with approver comment, mandatory). A rejected PO never returns directly to `Approved`.

---

## 9. Cross-Module Event Flow

```text
PR APPROVED
  → Cost Engine: soft reservation created (informational, not committed)
  → Notification: procurement queue

PO APPROVED
  → Cost Engine: cost_commitment OPEN posted per line
  → BOQ Engine: committed amount incremented on boq_item
  → Supplier module: active PO count incremented
  → Audit: severity HIGH
  → Notification: supplier, requester, storekeeper, accountant

GRN CONFIRMED (Inventory event)
  → PO line delivered_qty updated (read-only mirror)
  → Expediting status → Received
  → Inventory: stock increased at bin/warehouse
  → Material Test: certificate requirement check
  → Notification: requester "your material has arrived"

INVOICE MATCHED (Finance event)
  → Cost Engine: commitment relieved, actual cost posted
  → BOQ Engine: actual amount incremented
  → Payment scheduling triggered

PO CLOSED
  → Cost Engine: residual commitment released to available budget
  → Supplier module: performance score event (delivery, quality, compliance)
  → Warranty register: warranty start date captured (Handover module)
  → Lessons Learned: unit rate written to the historical rate library (09-xx)
```

That final arrow matters more than it looks. The rate you actually paid on Tower B is the rate you should be bidding with on Tower C.

---

## 10. Escalation Timings

| Pending Item | First Reminder | Escalation 1 | Escalation 2 |
|---|---|---|---|
| MR awaiting discipline review | 1 day | 2 days → Discipline Manager | 4 days → PM |
| PR awaiting approval | 1 day | 2 days → next level | 4 days → Project Director |
| Budget override awaiting decision | 4 hours | 1 day → Project Director | 2 days → Company Admin |
| RFQ awaiting supplier response | 2 days before closing | At closing → Procurement Manager | — |
| Bids awaiting evaluation | 2 days | 4 days → Procurement Manager | 7 days → PM |
| PO awaiting approval | 1 day | 2 days → next level | 3 days → Project Director |
| PO awaiting supplier acknowledgement | 2 days | 4 days → Procurement Officer | 7 days → Procurement Manager |
| Delivery overdue vs scheduled date | Same day | 3 days → PM | 7 days → Project Director (critical path: immediate) |
| Long-lead item past order-by date | Immediate | Same day → PM | 1 day → Project Director |
| Invoice exception unresolved | 2 days | 5 days → Procurement Manager | 10 days → Finance Manager |
| Emergency PO not regularised | Day 2 | Day 3 → Project Director | Day 4 → authority suspended |

---

*Digital Construction Operating System — Procurement — Doc 03 Workflow Diagram — Internal Controlled Document*
