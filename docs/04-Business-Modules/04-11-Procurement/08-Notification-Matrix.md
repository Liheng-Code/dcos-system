# DCOS — Module 04-11 Procurement
## Document 08 — Notification Matrix

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-08 |
| Version | R1 |
| Depends On | Notification Engine (R0 §24.5) |
| Status | For Development |

---

## 1. Principle

Procurement generates more notification volume than any other module — every requisition, approval, quotation, order, delivery, and invoice is an event with an interested party. If this matrix is built carelessly, the Project Manager mutes procurement notifications in week two and the escalation chain becomes decorative.

The discipline applied here:

> **Action Required notifications go to one named person. Everything else is a digest.**

A notification with three recipients is a notification nobody owns.

---

## 2. Channel Strategy for This Module

| Channel | Used For | Not Used For |
|---|---|---|
| In-app | Everything — the system of record for notification | — |
| Email | Approvals, PO issue to supplier, formal correspondence, digests | Routine status changes |
| Telegram | Site-facing urgency: delivery arrived, delivery overdue, emergency PO, long-lead breach | Anything commercial-in-confidence |
| Mobile push | Assigned action for field roles: gate receipt due, MR approved | Value-bearing content |
| SMS | Nothing in this module by default | — |
| Digest | Low and Normal priority, batched daily 07:00 local | Anything Critical |

**Commercial confidentiality rule:** notification payloads sent over Telegram or push must never contain rates, totals, margins, or supplier pricing. They carry the record reference and a deep link. The value is visible after authentication, not in a group chat.

---

## 3. Core Notification Matrix

| # | Trigger Event | Recipient | Priority | Channel | Timing |
|---|---|---|---|---|---|
| **Material Requisition** |
| N-01 | MR submitted | Discipline Lead (of the MR discipline) | Normal | In-app, Push | Immediate |
| N-02 | MR approved | Requester, Procurement Officer | Normal | In-app | Immediate |
| N-03 | MR returned for clarification | Requester | High | In-app, Push | Immediate |
| N-04 | MR rejected | Requester | High | In-app, Push | Immediate |
| N-05 | MR can be fulfilled from stock | Requester, Storekeeper | Normal | In-app | Immediate |
| N-06 | MR pending review > 2 days | Discipline Lead | High | In-app, Email | Daily until actioned |
| N-07 | Duplicate MR detected at same WBS | Procurement Officer | Low | Digest | Daily |
| **Purchase Requisition** |
| N-08 | PR submitted | Current approver (single named user) | High | In-app, Email | Immediate |
| N-09 | PR approved (final) | Preparer, Procurement Officer, QS | Normal | In-app | Immediate |
| N-10 | PR rejected | Preparer | High | In-app, Email | Immediate |
| N-11 | PR returned | Preparer | High | In-app, Email | Immediate |
| N-12 | PR pending approval > 1 day | Current approver | High | In-app, Email | Daily |
| N-13 | PR pending approval > 2 days | Approver + next level | High | In-app, Email, Telegram | Daily |
| N-14 | PR pending approval > 4 days | Project Director | Critical | In-app, Email, Telegram | Immediate + daily |
| **Budget** |
| N-15 | Budget override requested | QS Manager | High | In-app, Email | Immediate |
| N-16 | Budget override endorsed | Project Director | High | In-app, Email | Immediate |
| N-17 | Budget override approved | Requester, QS, PM, Commercial Manager | High | In-app, Email | Immediate |
| N-18 | Budget override rejected | Requester, QS | High | In-app, Email | Immediate |
| N-19 | BOQ item committed cost reaches 80% of allowable | QS, PM | Normal | In-app | Once per threshold crossing |
| N-20 | BOQ item committed cost reaches 100% of allowable | QS, PM, Commercial Manager, Project Director | **Critical** | In-app, Email, Telegram | Immediate |
| N-21 | Project committed cost exceeds budget threshold | PM, Project Director, Commercial Manager, Company Admin | **Critical** | In-app, Email, Telegram | Immediate |
| **RFQ and Bidding** |
| N-22 | RFQ issued | Invited suppliers | High | Email (+ portal) | Immediate |
| N-23 | RFQ closing in 48 hours, no response | Supplier, Procurement Officer | High | Email | Once |
| N-24 | RFQ closing in 24 hours | Invited suppliers who have not submitted | High | Email | Once |
| N-25 | Clarification raised by a bidder | Procurement Officer, Discipline Lead | Normal | In-app | Immediate |
| N-26 | Clarification answered (broadcast) | All invited suppliers | Normal | Email | Immediate |
| N-27 | RFQ closed — ready to open | Procurement Manager, QS (opening pair) | High | In-app, Email | Immediate |
| N-28 | Bid opening initiated, awaiting second authoriser | Eligible second authorisers | High | In-app, Push | Immediate |
| N-29 | Bid opening completed | Procurement Manager, QS, PM | High | In-app, Email | Immediate |
| N-30 | Insufficient valid bids received | Procurement Manager, PM | High | In-app, Email | At closing |
| N-31 | Bids awaiting evaluation > 2 days | Evaluators | High | In-app, Email | Daily |
| N-32 | Quotation validity expiring in 7 days | Procurement Officer | High | In-app, Email | Once, then daily from 3 days |
| N-33 | Award decision approved | Procurement Officer, QS, PM | Normal | In-app | Immediate |
| N-34 | Unsuccessful bidder notification | Bidder | Normal | Email | On award (configurable per company) |
| **Purchase Order** |
| N-35 | PO submitted for approval | Current approver | High | In-app, Email | Immediate |
| N-36 | PO blocked by pre-issue gate | Preparer | High | In-app | Immediate, with named gate |
| N-37 | PO approved | Preparer, Procurement Officer, Accountant | High | In-app, Email | Immediate |
| N-38 | PO rejected | Preparer | High | In-app, Email | Immediate |
| N-39 | PO issued | Supplier, requester, storekeeper, QS | High | Email (supplier), In-app (internal) | Immediate |
| N-40 | PO not acknowledged by supplier > 2 days | Procurement Officer | Normal | In-app, Email | Daily to day 7 |
| N-41 | PO amendment approved | Supplier, Accountant, QS, requester | High | In-app, Email | Immediate |
| N-42 | PO on hold | Supplier, requester, Accountant | High | In-app, Email | Immediate |
| N-43 | PO cancelled | Supplier, requester, Accountant, QS | High | In-app, Email | Immediate |
| N-44 | PO closed | QS, Accountant, Procurement Manager | Normal | In-app | Immediate |
| N-45 | PO awaiting approval > 2 days | Approver + next level | High | In-app, Email, Telegram | Daily |
| N-46 | PO awaiting approval > 3 days | Project Director | **Critical** | In-app, Email, Telegram | Immediate |
| **Blanket / Call-Off** |
| N-47 | Call-off raised | Procurement Manager | Normal | In-app | Immediate |
| N-48 | Blanket ceiling reaches 80% | Procurement Manager, QS | High | In-app, Email | Once per threshold |
| N-49 | Blanket ceiling reached | Procurement Manager, QS, PM | **Critical** | In-app, Email, Telegram | Immediate |
| N-50 | Blanket PO validity expiring in 30 days | Procurement Manager | Normal | In-app | Once, then at 14 and 7 days |
| **Delivery and Expediting** |
| N-51 | ASN received from supplier | Storekeeper, requester, Site Supervisor | Normal | In-app, Telegram | Immediate |
| N-52 | Delivery due tomorrow | Storekeeper, Site Supervisor | Normal | In-app, Telegram | Morning digest |
| N-53 | Delivery arrived at gate | Requester, Storekeeper, QA/QC (if inspection required) | High | In-app, Telegram, Push | Immediate |
| N-54 | GRN confirmed | Requester, Procurement Officer, Accountant | Normal | In-app | Immediate |
| N-55 | Delivery overdue (1 day) | Procurement Officer, requester | High | In-app, Telegram | Immediate |
| N-56 | Delivery overdue (3 days) | Procurement Manager, PM | High | In-app, Email, Telegram | Daily |
| N-57 | Delivery overdue, critical-path item | PM, Project Director, Procurement Manager | **Critical** | In-app, Email, Telegram | Immediate + daily |
| N-58 | Delivery rejected at inspection | Procurement Officer, Supplier, QA/QC Manager, requester | High | In-app, Email | Immediate |
| N-59 | Over-delivery beyond tolerance | PM, Procurement Officer, Storekeeper | High | In-app | Immediate |
| N-60 | Unmatched delivery at gate (no open PO) | Procurement Officer, PM, Storekeeper | High | In-app, Telegram | Immediate |
| N-61 | Material received to quarantine (missing certificate) | QA/QC, Storekeeper, Procurement Officer | High | In-app | Immediate |
| N-62 | Expediting action due today | Assigned Procurement Officer | Normal | In-app | Morning digest |
| **Long-Lead** |
| N-63 | Long-lead item 14 days from order-by date | Procurement Manager, PM | High | In-app, Email | Once, then at 7 and 3 days |
| N-64 | Long-lead order-by date reached, not ordered | Procurement Manager, PM, Project Director | **Critical** | In-app, Email, Telegram | Immediate + daily |
| N-65 | Long-lead order-by date breached, critical path | PM, Project Director, Company Admin | **Critical** | In-app, Email, Telegram | Immediate + daily until ordered |
| N-66 | Schedule change moved a long-lead order-by date earlier | Procurement Manager | High | In-app, Email | Immediate |
| **Invoice and Match** |
| N-67 | Invoice received against PO | Procurement Officer, Accountant | Normal | In-app | Immediate |
| N-68 | Three-way match passed | Accountant | Low | Digest | Daily |
| N-69 | Match exception raised | Procurement Officer (assigned owner) | High | In-app, Email | Immediate |
| N-70 | Match exception unresolved > 5 days | Procurement Manager | High | In-app, Email | Daily |
| N-71 | Match exception unresolved > 10 days | Finance Manager, PM | **Critical** | In-app, Email | Daily |
| N-72 | Variance acceptance approved | Accountant, Procurement Officer, QS | High | In-app | Immediate |
| **Emergency and Compliance** |
| N-73 | Emergency PO issued | PM, Project Director, Procurement Manager, Accountant | **Critical** | In-app, Email, Telegram | Immediate |
| N-74 | Emergency PO not regularised, day 2 | Buyer, Procurement Manager | High | In-app, Email | Immediate |
| N-75 | Emergency PO not regularised, day 3 | Project Director, Company Admin | **Critical** | In-app, Email, Telegram | Immediate |
| N-76 | Single-source PR raised | Project Director, Commercial Manager | High | In-app, Email | Immediate |
| N-77 | Award to other than lowest compliant | PM, Commercial Manager, Project Director | High | In-app, Email | Immediate |
| N-78 | Supplier PQ expired with open POs | Procurement Manager, Company Admin | High | In-app, Email | Immediate |
| N-79 | Supplier suspended or blacklisted with open POs | Procurement Manager, PM, Project Director, Accountant | **Critical** | In-app, Email | Immediate |
| N-80 | Sealed bid access attempted before opening | Company Admin, Project Director, IT/Security | **Critical** | In-app, Email | Immediate |
| N-81 | Approval value band configuration changed | Company Admin, Commercial Manager, Finance Manager | **Critical** | In-app, Email | Immediate |
| N-82 | Supplier bank details changed | Finance Manager, Company Admin | **Critical** | In-app, Email | Immediate |
| N-83 | Bulk export of procurement data > 500 records | Company Admin | High | In-app | Immediate |

---

## 4. Digest Design

Three digests replace what would otherwise be several hundred individual messages a week.

### 4.1 Daily Procurement Digest — 07:00 local

| Recipient | Content |
|---|---|
| Procurement Officer | My pending actions · expediting due today · deliveries expected today · match exceptions assigned to me · quotations expiring this week |
| Procurement Manager | Team pending actions with ageing · PRs and POs awaiting my approval · bids ready to open · ceiling and validity warnings |
| QS / Cost Engineer | New commitments posted yesterday · BOQ items crossing 80% · overrides pending endorsement · non-BOQ lines awaiting endorsement |
| Storekeeper | Deliveries expected today with PO and item detail · quarantined items awaiting certificates |
| Site Supervisor / Engineer | My MRs status changes · deliveries arriving at my WBS locations today |

### 4.2 Weekly Procurement Report — Monday 08:00

To PM, Project Director, Commercial Manager: pipeline value by stage, committed vs budget by trade, cycle-time trend, overdue delivery count, long-lead risk board, emergency and single-source counts, top five approval bottlenecks by person and average delay.

That last item is uncomfortable by design. Approval delay is the most common procurement failure and it is invisible unless someone is named.

### 4.3 Monthly Control Exception Pack — 1st working day

To Project Director, Commercial Manager, Company Admin, and internal audit: budget override register, single-source register, non-lowest award register, emergency purchase register, SoD exception register, match exceptions written off, PQ-expired supplier activity, and sealed-bid access attempts.

---

## 5. Anti-Spam Rules

| Rule | Application |
|---|---|
| One owner per action notification | `Action Required` goes to the single current approver, not the whole chain |
| Threshold-crossing only | Budget alerts fire once when crossing 80% and once at 100%, not on every subsequent PR |
| Escalation replaces, not repeats | When an item escalates, the original recipient gets one "escalated" notice, not a continuing daily stream |
| Combine by record | Five approved lines on one PR generate one notification, not five |
| Combine by recipient | A user receiving six Normal notifications in a batch window gets one grouped in-app entry |
| Supplier throttling | A supplier receives at most one RFQ reminder and one PO chase per record |
| Quiet hours | 20:00–06:00 local suppresses Normal and Low on Telegram and email; Critical always sends |
| Mutable | Users may mute Low and Normal per event type; **Critical and Action Required cannot be muted** |
| No double-channel | The same event never sends both push and Telegram to the same user |

---

## 6. Template Examples

**PR awaiting approval:**

```text
Title:   Approval Required: {{pr_no}} — {{package_name}}
Message: {{preparer_name}} submitted {{pr_no}} for {{currency}} {{amount}}.
         {{line_count}} lines · Required on site {{required_date}}
         {{#if budget_override}}⚠ Budget override approved by {{override_approver}}{{/if}}
Action:  Review & Approve
```

**Delivery arrived (Telegram — no commercial data):**

```text
📦 Delivery arrived — {{project_name}}
{{po_no}} · {{supplier_name}}
{{item_summary}} for {{wbs_path}}
Received by {{receiver_name}} at {{time}}
→ Confirm GRN
```

**Long-lead breach:**

```text
Title:   🔴 CRITICAL: Long-lead order date passed — {{item_description}}
Message: {{item_description}} required on site {{required_on_site_date}}.
         Order-by date was {{order_by_date}} ({{days_overdue}} days ago).
         Total lead time {{total_lead_days}} days.
         {{#if critical_path}}This item is on the critical path.{{/if}}
Action:  Open Long-Lead Register
```

**Budget ceiling reached:**

```text
Title:   🔴 Budget exhausted: {{boq_code}} {{boq_description}}
Message: Committed cost has reached 100% of allowable on {{boq_code}}.
         Allowable {{allowable}} · Committed {{committed}} · Actual {{actual}}
         {{open_pr_count}} open PR(s) reference this item and will be blocked.
Action:  Open Cost Position
```

**Sealed bid access attempt:**

```text
Title:   🔴 SECURITY: Sealed bid access attempt — {{rfq_no}}
Message: {{user_name}} ({{role}}) attempted to read commercial data on {{rfq_no}}
         before the scheduled opening at {{closing_datetime}}.
         Source: {{ip_address}} · {{device}}
Action:  Open Audit Record
```

---

## 7. Recipient Resolution Strategies

| Strategy | Used By |
|---|---|
| Current approver (workflow step) | N-08, N-35, and every approval notification |
| Record creator | Rejection, return, and status-change notifications to the preparer |
| WBS responsible | Delivery notifications routed to the engineer responsible for the destination WBS node |
| Discipline role | MR review to the lead of the MR's discipline |
| Project role | PM, Project Director resolved per project, not per company |
| Supplier organisation | Portal and email notifications scoped to `supplier_id` |
| Escalation chain | Approver → Manager → PM → Project Director → Company Admin |
| Assigned owner | Match exceptions and expediting actions have a named owner, not a queue |
| Security group | Sealed-bid and configuration alerts to Company Admin + IT |

---

## 8. MVP Notification Set

Do not build all 83 rules in Phase 2. Start with these fifteen; they cover the failure modes that actually cost money:

1. N-08 PR submitted → approver
2. N-12/13/14 PR approval escalation
3. N-17 Budget override approved
4. N-20 BOQ committed reaches 100%
5. N-27 RFQ closed, ready to open
6. N-29 Bid opening completed
7. N-35 PO submitted for approval
8. N-39 PO issued
9. N-45/46 PO approval escalation
10. N-53 Delivery arrived at gate
11. N-55/56/57 Delivery overdue
12. N-64 Long-lead order-by breached
13. N-69 Match exception raised
14. N-73 Emergency PO issued
15. N-80 Sealed bid access attempt

Everything else goes into the daily digest until the volume proves it needs its own channel. A notification system should ring like a bell, not scream like a broken alarm — and procurement is where that alarm gets broken first.

---

*Digital Construction Operating System — Procurement — Doc 08 Notification Matrix — Internal Controlled Document*
