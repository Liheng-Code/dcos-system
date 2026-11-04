# Inventory / Stock Module — Notification Matrix
**Document Code:** DCOS-NTF-26-001 | **Version:** R1 | **Date:** 2026-07-27 (originally June 2026)
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

**Revision Note (R1):** Adds a CWIMS Doc 22 event-type cross-reference (Section below) and new events for Tool custody and formalised Return posting. Each event now records against `inv_notifications.event_type` (see `04-Database-Schema.md`). Author: Solution Architect. Status: Draft.

---

## CWIMS Event Type Cross-Reference

CWIMS Doc 22 names 11 event types by `event_type` code (as persisted on `inv_notifications`). Most already exist below under a DCOS-numbered event (N#); the table maps each CWIMS `event_type` to its DCOS event number, adding new event numbers only where no equivalent existed.

| CWIMS `event_type` | Maps to | Notes |
|---|---|---|
| `low_stock` | N12 | Reorder point reached |
| `out_of_stock` | N13 | Zero stock |
| `approval_required` | N6 (MR), N19 (Adjustment), N14 (Transfer) — generic tag also applies to N31 (restricted tool) | Generic "approval needed" tag across workflows |
| `grn_posted` | N2 | GRN confirmed |
| `mr_approved` | N7 | MR approved |
| `transfer_dispatched` | N16 | Transfer dispatched |
| `transfer_overdue` | N17 | Transfer not received within SLA |
| `return_posted` | N29 (new) | Material Return posted to store (distinct from N26, which is return-to-**supplier** approval) |
| `adjustment_posted` | N20 | Adjustment approved/posted |
| `count_variance` | N32 (new) | Per-line count variance outside tolerance, flagged during counting (distinct from N24/N25, which cover the stock take session as a whole) |
| `overdue_tool_return` | N28 (new) | Tool not returned by due date |

---

## Notification Events

| # | Trigger Event | Recipients | Priority | Channels | Timing | Message Template |
|---|---|---|---|---|---|---|
| N1 | GRN created (draft) | Store Supervisor | Low | In-app | Immediate | "GRN {grn_number} created for PO {po_number}. Pending confirmation." |
| N2 | GRN confirmed | Procurement Officer, QS | Low | In-app | Immediate | "GRN {grn_number} confirmed. {total_qty} units received. Stock updated." |
| N3 | GRN line requires inspection | QAQC Engineer, Store Supervisor | High | In-app + Email | Immediate | "Incoming materials on GRN {grn_number} require QAQC inspection. {item_names}. Please inspect within 24 hours." |
| N4 | QAQC inspection approved | Storekeeper, Procurement Officer | Medium | In-app | Immediate | "Inspection approved for {item_name} on GRN {grn_number}. Stock is now available." |
| N5 | QAQC inspection rejected | Storekeeper, Store Supervisor, Procurement Officer | High | In-app + Email | Immediate | "QAQC REJECTED: {item_name} on GRN {grn_number}. Reason: {reason}. Return-to-supplier required." |
| N6 | MR submitted for approval | Site Supervisor, Project Manager | High | In-app + Email | Immediate | "Material Requisition {mr_number} submitted by {requester_name} for WBS {wbs_code}. Required date: {required_date}." |
| N7 | MR approved | Requesting Site Engineer, Storekeeper | Medium | In-app | Immediate | "MR {mr_number} approved. Storekeeper will prepare materials for {required_date}." |
| N8 | MR rejected | Requesting Site Engineer | High | In-app + Email | Immediate | "MR {mr_number} rejected. Reason: {rejection_reason}. Please revise and resubmit." |
| N9 | MR overdue (not issued by required date) | Storekeeper, Store Supervisor, Site Supervisor | High | In-app + Email | Daily at 08:00 | "OVERDUE: MR {mr_number} required by {required_date} has not been issued. Action required." |
| N10 | MR issued (partial) | Site Engineer, Site Supervisor | Medium | In-app | Immediate | "MR {mr_number} partially issued: {issued_qty}/{approved_qty} units. Remaining: {balance_qty}." |
| N11 | MR issued (complete) | Site Engineer, Site Supervisor | Low | In-app | Immediate | "MR {mr_number} fully issued to site. Please confirm receipt on site." |
| N12 | Stock falls to reorder point | Storekeeper, Store Supervisor, Procurement Officer | High | In-app + Email | Immediate (on movement) | "LOW STOCK: {item_name} in {store_name} is at reorder point ({available_qty} {uom} remaining). Draft PR may be required." |
| N13 | Stock reaches zero | Storekeeper, Store Supervisor, Procurement Officer, PM | Critical | In-app + Email | Immediate | "ZERO STOCK: {item_name} in {store_name} has reached zero. Any pending MRs for this item cannot be fulfilled." |
| N14 | Transfer request created | Destination Store Supervisor | High | In-app + Email | Immediate | "Transfer request {transfer_number} from {source_store} requires your approval. Items: {item_list}." |
| N15 | Transfer approved (both sides) | Both Storekeepers | Medium | In-app | Immediate | "Transfer {transfer_number} fully approved. Source storekeeper: please prepare and dispatch." |
| N16 | Transfer dispatched | Destination Storekeeper, Destination Supervisor | High | In-app + Email | Immediate | "Materials in Transfer {transfer_number} have been dispatched from {source_store}. Please prepare to receive." |
| N17 | Transfer not received within SLA | Destination Supervisor, Source Supervisor, PM | High | In-app + Email | After SLA breach | "Transfer {transfer_number} dispatched {days} days ago and not yet confirmed as received. Please investigate." |
| N18 | Transfer discrepancy | Both Supervisors, PM | High | In-app + Email | Immediate | "Discrepancy on Transfer {transfer_number}: dispatched {dispatched_qty} but received {received_qty}. Resolution required." |
| N19 | Adjustment submitted (pending approval) | Store Supervisor | High | In-app | Immediate | "Stock Adjustment {adjustment_number} by {storekeeper_name} requires your approval. Reason: {reason_code}." |
| N20 | Adjustment approved | Storekeeper, QS | Medium | In-app | Immediate | "Stock Adjustment {adjustment_number} approved by {approver_name}. Stock balance updated." |
| N21 | Adjustment rejected | Storekeeper | Medium | In-app + Email | Immediate | "Stock Adjustment {adjustment_number} rejected. Reason: {rejection_reason}." |
| N22 | High-value adjustment | Project Manager | High | In-app + Email | Immediate | "HIGH-VALUE adjustment {adjustment_number} (impact: {cost_impact}) requires your approval in addition to Store Supervisor." |
| N23 | Stock take initiated (store locked) | All users with active MRs/GRNs in the store | High | In-app + Email | Immediate | "STORE LOCKED: {store_name} is locked for physical stock take {stocktake_number}. No movements allowed until {estimated_completion}." |
| N24 | Stock take completed | PM, QS, Finance | Medium | In-app | Immediate | "Stock Take {stocktake_number} completed for {store_name}. Total variance: {variance_value}. Report attached." |
| N25 | Stock take not completed within 24h | Store Supervisor, PM | High | In-app + Email | 24h after initiation | "Stock Take {stocktake_number} has been locked for over 24 hours. Complete or cancel to restore store operations." |
| N26 | Return-to-supplier approved | Storekeeper, Procurement Officer | Medium | In-app | Immediate | "Return-to-Supplier {rts_number} approved. Please coordinate physical return with {supplier_name}." |
| N27 | Items in quarantine > 48h (no inspection decision) | QAQC Engineer, Store Supervisor | High | In-app + Email | 48h after quarantine | "QUARANTINE OVERDUE: {item_name} on GRN {grn_number} has been under inspection for 48 hours. Please complete inspection." |
| N28 | Tool overdue (not returned by due date) | Custodian, Supervisor | High | In-app + Telegram | Daily until returned | "OVERDUE TOOL: {tool_code} {tool_name} issued to {custodian_name} on {issue_date}, due {due_date}, overdue {overdue_days} day(s). Please return or extend with supervisor approval." |
| N29 | Material Return posted (Reusable) | Requester (returner), QS | Normal | In-app | Immediate | "Return {return_number} posted. {quantity} {uom} of {item_name} re-credited to {store_name}. Cost reversal posted to {wbs_code}." |
| N30 | Tool issued to custodian | Custodian | Low | In-app | Immediate | "Tool {tool_code} {tool_name} issued to you, due {due_date}. Please return on time." |
| N31 | Restricted tool issue requires Supervisor approval | Supervisor | High | In-app + Email | Immediate; reminder 24h | "Restricted tool {tool_code} {tool_name} requested by {requester_name} requires your approval before release." |
| N32 | Count variance outside tolerance (per line, during counting) | Store Supervisor, Finance | High | In-app + Email | Immediate | "COUNT VARIANCE: {item_name} in {store_name} — system {system_qty}, counted {counted_qty}, variance {variance_qty} ({variance_value}). Explanation required." |

---

## Notification Rules

### Priority Levels

| Level | Definition | Response SLA |
|---|---|---|
| Critical | Zero stock — site work risk | Immediate action required — < 2 hours |
| High | Approaching zero stock / approval overdue / store locked | Same-day response required |
| Medium | Standard workflow notifications | Next working day |
| Low | Informational — no action required | No SLA |

### Escalation Rules

| Condition | Escalation To | After |
|---|---|---|
| MR not approved within 24h of submission | Project Manager | 24h |
| MR not issued within 24h of approval | Store Supervisor | 24h |
| Transfer not received within 72h of dispatch | Both Supervisors + PM | 72h |
| Inspection not completed within 48h | QAQC Manager + Store Supervisor | 48h |
| Stock take not completed within 48h | Project Manager | 48h |
| Adjustment pending approval > 24h | Project Manager | 24h |
| Restricted tool issue request pending > 24h | Store Supervisor | 24h |
| Tool overdue > 7 days | Store Supervisor, Project Manager | 7 days |

### Channel Selection Logic

| Channel | When Used |
|---|---|
| In-app only | Low priority informational updates |
| In-app + Email | High priority requiring action; overdue items |
| Email only | [Not used for INV — always combined with in-app] |
| SMS / Telegram | Critical only (Zero Stock events) — Phase 4 integration |
| Mobile Push | Phase 6 (Mobile App) |

---

## Digest Notifications

The following notifications are bundled into a daily digest (08:00 project time) rather than sent individually to reduce noise:

- All Low Stock items: daily summary to Storekeeper + Procurement Officer
- All MRs pending approval: daily summary to Supervisors
- All overdue transfers: daily summary to Store Supervisors + PM
- All pending adjustments: daily summary to Store Supervisor
- All overdue tools: daily summary to Store Supervisor (individual overdue reminders to the custodian remain immediate, per N28)
