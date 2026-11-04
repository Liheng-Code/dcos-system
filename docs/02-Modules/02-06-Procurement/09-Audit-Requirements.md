# DCOS — Module 04-11 Procurement
## Document 09 — Audit Requirements

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-09 |
| Version | R1 |
| Depends On | Audit Trail Engine (R0 §24.4) |
| Status | For Development |

---

## 1. Why Procurement Audit Matters More Than Most

Procurement is the module most likely to be examined by someone hostile: an internal auditor investigating a kickback, a client disputing a cost-plus claim, an arbitrator assessing a delay, or a tax authority testing whether the invoice matches the goods. In every one of those scenarios the question is the same and it is never asked politely.

> **Who decided this, on what information, with what authority, and can you prove it?**

The audit requirements below exist so the answer is a query, not an archaeology project.

Three events in this module are permanently non-negotiable: **bid opening**, **budget override**, and **PO approval**. If those three are complete, most disputes are survivable.

---

## 2. Audit Coverage Requirements

| Entity | Actions Requiring Audit | Minimum Severity |
|---|---|---|
| Material Requisition | Create, submit, review, approve, reject, return, cancel, offline sync | LOW–MEDIUM |
| Purchase Requisition | Create, edit, submit, budget check, approve, reject, return, cancel | MEDIUM |
| Budget Check | Every execution, including passes | MEDIUM |
| Budget Override | Request, endorse, approve, reject | **HIGH** |
| RFQ | Create, supplier add/remove, issue, extend, clarification answer, cancel, re-tender | MEDIUM |
| Bid Opening | Initiate, confirm, execute, any pre-opening access attempt | **CRITICAL** |
| Quotation | Entry, amendment, withdrawal, late flag, evaluation | HIGH |
| CBA | Generation, recommendation, non-lowest justification, approval | HIGH |
| Purchase Order | Create, submit, approve, reject, issue, acknowledge, hold, cancel, close | **HIGH** |
| PO Amendment | Create, approve, issue — with full field-level diff | **HIGH** |
| Call-Off | Raise, approve, ceiling breach attempt | MEDIUM |
| Expediting | Log entry, status change, risk flag | LOW |
| Gate Receipt | Confirm, photo attach, over/short/reject decision | MEDIUM |
| Match Exception | Raise, resolve, variance acceptance | **HIGH** |
| Configuration | Any parameter change, especially value bands and tolerances | **CRITICAL** |
| Reports | Export, bulk download | MEDIUM–HIGH by volume |

---

## 3. Event Catalogue

All events follow the Audit Trail Engine schema (R0 §24.4.5) with `module_code = 'PROC'`.

| Event Code | Entity | Severity | Mandatory Payload |
|---|---|---|---|
| `PROC.MR_CREATED` | material_requisition | LOW | wbs_node, discipline, line count, source_channel |
| `PROC.MR_SYNCED_OFFLINE` | material_requisition | MEDIUM | device_id, device_timestamp, server_timestamp, drift_seconds |
| `PROC.MR_APPROVED` / `_REJECTED` | material_requisition | MEDIUM | approver, comment |
| `PROC.PR_CREATED` | purchase_requisition | MEDIUM | estimated_value, source MR refs |
| `PROC.PR_BUDGET_CHECKED` | pr_budget_check | MEDIUM | per line: allowable, committed, actual, available, requested, result |
| `PROC.PR_SUBMITTED` | purchase_requisition | MEDIUM | value, budget_status, approval route resolved |
| `PROC.PR_OVERRIDE_REQUESTED` | pr_budget_override | **HIGH** | variance, reason_code, narrative, recovery_plan |
| `PROC.PR_OVERRIDE_ENDORSED` | pr_budget_override | **HIGH** | endorser, comment |
| `PROC.PR_OVERRIDE_APPROVED` | pr_budget_override | **HIGH** | approver, authority band, step-up assertion id |
| `PROC.PR_APPROVED` / `_REJECTED` / `_RETURNED` | purchase_requisition | MEDIUM | approver, step, comment, delegation reference if acting |
| `PROC.RFQ_ISSUED` | rfq | MEDIUM | bidder list with PQ snapshot, closing datetime, min bidders vs invited |
| `PROC.RFQ_SUPPLIER_ADDED` / `_REMOVED` | rfq_invited_supplier | MEDIUM | supplier, actor, reason |
| `PROC.RFQ_EXTENDED` | rfq | HIGH | old closing, new closing, reason, bidders notified |
| `PROC.RFQ_CLARIFICATION_ANSWERED` | rfq_clarification | MEDIUM | question, answer, broadcast flag, recipients |
| `PROC.QUOTE_RECEIVED` | quotation | MEDIUM | supplier, submission time, is_late, document hash — **no values while sealed** |
| `PROC.QUOTE_SEAL_ACCESS_ATTEMPT` | quotation | **CRITICAL** | user, role, ip, device, endpoint, rfq, time to closing |
| `PROC.BIDS_OPENING_INITIATED` | rfq_opening_event | **CRITICAL** | initiator, ip, window expiry |
| `PROC.BIDS_OPENED` | rfq_opening_event | **CRITICAL** | both identities, both ips, bid count, per-quotation SHA-256 hash |
| `PROC.QUOTE_EVALUATED` | quotation_evaluation | HIGH | evaluator, type, result, score, comments |
| `PROC.CBA_GENERATED` | comparative_bid_analysis | HIGH | ranking, lowest compliant, normalisation adjustments applied |
| `PROC.CBA_NON_LOWEST_RECOMMENDED` | comparative_bid_analysis | **HIGH** | recommended, lowest, delta, reason_code, justification text in full |
| `PROC.AWARD_APPROVED` | rfq | **HIGH** | awarded quotations, split allocation, approver, step-up assertion |
| `PROC.PO_CREATED` | purchase_order | MEDIUM | supplier, value, source refs |
| `PROC.PO_GATE_BLOCKED` | purchase_order | HIGH | which gate, detail, attempting user |
| `PROC.PO_APPROVED` | purchase_order | **HIGH** | approver, authority band, value in txn + base, fx snapshot, **step_up_assertion_id**, preparer (SoD evidence) |
| `PROC.PO_ISSUED` | purchase_order | **HIGH** | supplier, delivery method, PDF hash, version |
| `PROC.PO_ACKNOWLEDGED` | purchase_order | MEDIUM | supplier user, timestamp, any query raised |
| `PROC.PO_AMENDED` | purchase_order_amendment | **HIGH** | amendment type, field-level old/new, value delta, reapproval flag, approver |
| `PROC.PO_CANCELLED` / `_SHORT_CLOSED` | purchase_order | **HIGH** | reason code, residual commitment released |
| `PROC.PO_CLOSED` | purchase_order | MEDIUM | final delivered, final invoiced, residual released |
| `PROC.COMMITMENT_POSTED` / `_RELIEVED` / `_RELEASED` | cost_commitment | **HIGH** | boq_item, wbs_node, amount, trigger event |
| `PROC.CALLOFF_RAISED` / `_APPROVED` | po_call_off | MEDIUM | value, cumulative, ceiling remaining |
| `PROC.CALLOFF_CEILING_BREACH_ATTEMPT` | po_call_off | HIGH | attempted value, ceiling, overage |
| `PROC.GATE_RECEIPT_CONFIRMED` | purchase_order_line | MEDIUM | receiver, qty, condition, photo refs, geo if available |
| `PROC.DELIVERY_OVER_TOLERANCE` | purchase_order_line | HIGH | ordered, delivered, tolerance, decision, approver |
| `PROC.DELIVERY_REJECTED` | purchase_order_line | HIGH | reason, NCM reference, qty |
| `PROC.MATCH_EXCEPTION_RAISED` | invoice match | **HIGH** | variance type, amounts on all three documents |
| `PROC.MATCH_VARIANCE_ACCEPTED` | invoice match | **HIGH** | variance amount, approver, authority band, justification |
| `PROC.CONFIG_CHANGED` | procurement_config | **CRITICAL** | parameter, old value, new value, scope, effective date |
| `PROC.SOD_VIOLATION_BLOCKED` | any | HIGH | attempted action, user, record, rule triggered |
| `PROC.BAND_CEILING_REJECTED` | purchase_order | HIGH | user's band, record value, attempted action |
| `PROC.REPORT_EXPORTED` | report | MEDIUM (HIGH if > 500 rows) | report key, filters, row count, format, destination |

---

## 4. Immutable Snapshot Requirements

Some data must be frozen at the moment of decision, because the live source will change and the decision must remain explicable.

| Snapshot | Taken At | Why |
|---|---|---|
| `boq_allowable_rate` on PR line | PR creation | The BOQ may be revised by a VO later; the buyer decided on the rate they saw |
| `pr_budget_check` row | Every check | Proves the check ran and what it returned |
| `supplier_pq_snapshot` on PO | PO issue | PQ status may lapse later; the PO was valid when issued |
| `fx_rate` + `fx_rate_date` on PO | PO approval | Value band authority was evaluated at this rate |
| Quotation document hash | Quotation receipt | Proves the attached PDF was not swapped |
| Per-quotation hash on opening event | Bid opening | Proves no quotation was altered between submission and opening |
| CBA PDF | CBA approval | The comparison as approved, not as it would render today |
| PO PDF per version | Each issue | Proof of exactly what was sent to the supplier |
| Approval route resolved | Submission | The chain as it stood, even if roles change afterwards |
| Delegation reference | Any delegated approval | Records both delegate and delegator |

**Rule:** no PDF in this module is ever regenerated from live data for a historical record. Regeneration produces a document that looks official and is not what was sent. That distinction has decided arbitrations.

---

## 5. Record-Level Activity Timeline

Every PR, RFQ, and PO carries an Activity tab rendering its full history in plain language:

```text
02 Aug  09:14   PR-2026-0042 created by Dara Chan (Procurement Officer)
                from MR-0184, MR-0191, MR-0203
02 Aug  09:31   Budget check run — EXCEEDED on BOQ C-03-014 by USD 4,180.00
02 Aug  10:02   Budget override requested — reason: RATE_INCREASE
                "Steel market moved 11% since tender. VO claim to follow under Cl. 13.7"
02 Aug  14:20   Override endorsed by Sokha Lim (QS Manager)
03 Aug  08:45   Override approved by Vichea Ros (Project Director) — step-up verified
03 Aug  08:46   PR approved — routed to RFQ
05 Aug  11:00   RFQ-0031 issued to 4 bidders, closing 20 Aug 17:00
20 Aug  17:00   Bidding closed — 3 valid, 1 late (Riverside Trading, 21 Aug 08:02)
21 Aug  09:12   Bid opening initiated by Sokha Lim (QS Manager)
21 Aug  09:18   Bid opening confirmed by Chan Rithy (Procurement Manager) — 3 bids opened
23 Aug  16:40   CBA approved — award to Mekong Steel (rank 1, lowest compliant)
24 Aug  10:05   PO-0117 approved by Vichea Ros — USD 12,284.00 — step-up sa_01HZX...
24 Aug  10:07   PO-0117 issued to Mekong Steel — PDF v1 (hash 3f9a...)
```

The timeline is generated from audit events, never written separately. Two sources of history is one source too many.

---

## 6. Reconstruction Requirements

The system must be able to answer these questions from audit data alone, without inference:

| Question | Answered By |
|---|---|
| Who authorised this spend and under what authority? | `PROC.PO_APPROVED` — approver, band, step-up assertion |
| Was competitive tendering followed? | `PROC.RFQ_ISSUED` invited list + `PROC.BIDS_OPENED` count + CBA |
| Could anyone have seen a competitor's price before opening? | `PROC.QUOTE_SEAL_ACCESS_ATTEMPT` — nil result is itself the evidence |
| Why was the cheapest bidder not selected? | `PROC.CBA_NON_LOWEST_RECOMMENDED` — full justification text |
| Was the budget checked, and what did it say? | `pr_budget_check` rows, every execution |
| Who approved spending over budget, and what was the recovery plan? | `PROC.PR_OVERRIDE_APPROVED` |
| Did the same person raise and approve this? | `prepared_by` / `approved_by` on the record + `PROC.SOD_VIOLATION_BLOCKED` for attempts |
| What did we actually send to the supplier? | Immutable PO PDF per version with hash |
| When did we know the delivery was late, and what did we do? | `po_expediting_log` + delivery overdue events |
| Was this invoice matched or waved through? | `PROC.MATCH_EXCEPTION_RAISED` / `_VARIANCE_ACCEPTED` |
| Was the supplier qualified at the time of order? | `supplier_pq_snapshot` on the PO |
| Who changed the approval thresholds, and when? | `PROC.CONFIG_CHANGED` |

If any of these requires a developer to write a query against transaction tables, the audit design has failed.

---

## 7. Fraud-Detection Signals

The audit data should surface these patterns automatically on the monthly control pack. None of them is proof of anything. All of them are worth a conversation.

| Signal | Pattern |
|---|---|
| Split purchasing | Multiple POs to one supplier, same period, same trade, each just under an approval band threshold |
| Threshold clustering | Statistical bunching of PO values immediately below band boundaries |
| Single-bidder concentration | One supplier winning > 60% of awards in a trade category |
| Phantom competition | Same losing bidders appearing repeatedly with consistently uncompetitive prices |
| Late-quote advantage | A bidder repeatedly submitting in the final hour and repeatedly winning by a narrow margin |
| Rapid approval | PR to PO cycle far below the team median for that value band |
| Buyer-supplier affinity | One buyer handling a disproportionate share of one supplier's awards |
| Amendment creep | Repeated small amendments after award, cumulatively significant |
| Match tolerance abuse | A supplier's invoices consistently landing just inside the acceptance tolerance |
| Emergency route abuse | One buyer or one supplier over-represented in emergency purchases |
| Bank change proximity | Supplier bank detail change shortly before a large payment |
| Off-hours approval | Approvals consistently outside working hours from unusual locations |

These are reports, not blocks. The system flags; a person decides.

---

## 8. Retention

| Data | Active | Archive | Basis |
|---|---|---|---|
| PO approval, issue, amendment events | Project + 5 years | 10 years | Contract limitation |
| Bid opening events and hashes | **Permanent** | **Permanent** | Bid integrity — never archived out of reach |
| Budget override events | Project + 5 years | 10 years | Financial audit |
| Quotation and CBA events | Project + 3 years | 10 years | Award challenge |
| Match exception and variance acceptance | Project + 5 years | 10 years | Financial audit |
| Expediting logs | Project + 3 years | 10 years | Delay claim evidence |
| MR and routine status events | Project + 2 years | 7 years | Operational |
| Config change events | **Permanent** | **Permanent** | Control environment |
| Export and access events | 2 years | 7 years | Security |

Archived audit data remains queryable through the audit search interface with an acknowledged latency, per the platform archiving policy. "Archived" must never mean "gone".

---

## 9. Audit Integrity Controls

| Control | Implementation |
|---|---|
| Append-only | `INSERT` only on `audit_logs`; `UPDATE` and `DELETE` revoked from all application and admin roles |
| No deletion via cascade | Procurement tables have no `DELETE` path (BR-16); audit survives record cancellation |
| Snapshot on cancellation | Cancelling a PR or PO writes a full record snapshot into the audit payload |
| Hash chaining | Each audit row stores the hash of the previous row for its `correlation_id` — tampering breaks the chain visibly |
| Sensitive field exclusion | Bank details, passwords, and sealed quote values never appear in `old_values` / `new_values` |
| Correlation | Every procurement chain shares a `correlation_id` from MR through to payment, so the full story retrieves as one query |
| Time source | Server time is authoritative; device timestamps stored separately with computed drift, never substituted |
| Backup | Audit data included in every backup and in the DR replication stream; restoration tested monthly |

---

## 10. Audit Reports Delivered by This Module

| Report | Audience | Frequency |
|---|---|---|
| Procurement approval register | Internal audit, Commercial Manager | Monthly |
| Budget override register | Project Director, Board | Monthly |
| Single-source and non-lowest award register | Commercial Manager, internal audit | Monthly |
| Bid opening compliance report | Internal audit | Monthly |
| Sealed-bid access attempt report | Company Admin, IT/Security | Monthly (immediate on any event) |
| Emergency purchase register with regularisation status | Project Director | Weekly |
| Segregation of duties exception register | Internal audit, Company Admin | Monthly |
| Match variance acceptance register | Finance Manager, internal audit | Monthly |
| Configuration change log | Company Admin | Monthly |
| Fraud signal pack (§7) | Internal audit, Company Admin | Monthly |
| Supplier award concentration analysis | Commercial Manager | Quarterly |
| Full procurement chain reconstruction | Claims team, legal | On demand |

---

*Digital Construction Operating System — Procurement — Doc 09 Audit Requirements — Internal Controlled Document*
