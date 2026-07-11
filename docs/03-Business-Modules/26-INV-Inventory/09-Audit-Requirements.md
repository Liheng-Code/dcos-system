# Inventory / Stock Module — Audit Requirements
**Document Code:** DCOS-AUD-26-001 | **Version:** R0 | **Date:** June 2026
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

---

## 1. Audit Philosophy

The Inventory module manages physical materials that have direct monetary value. The audit trail must be comprehensive enough that:

1. Any stock discrepancy can be investigated to its root cause
2. Any material can be traced from PO → GRN → store → site issue → WBS cost posting
3. Any unauthorised access or manipulation attempt is visible
4. Physical stock take variances are explained and approved by a named person
5. Financial auditors can reconcile material cost to project cost reports

---

## 2. Audit Log Events

All events are written to the system-wide `audit_logs` table via the Audit Engine. Format: `module = 'INV'`, `entity_type`, `entity_id`, `action`, `actor_id`, `old_value (JSON)`, `new_value (JSON)`, `ip_address`, `created_at`.

### Item Master

| Event | Action Code | Captured Data |
|---|---|---|
| Item created | `INV.ITEM.CREATE` | Full item record |
| Item updated | `INV.ITEM.UPDATE` | Old vs new field values |
| Item deactivated | `INV.ITEM.DEACTIVATE` | Reason, actor |
| Item reactivated | `INV.ITEM.REACTIVATE` | Actor |
| Reorder level changed | `INV.ITEM.REORDER_CHANGE` | Old vs new levels |

### Stores

| Event | Action Code | Captured Data |
|---|---|---|
| Store created | `INV.STORE.CREATE` | Full store record |
| Store updated | `INV.STORE.UPDATE` | Changed fields |
| Store closed | `INV.STORE.CLOSE` | Actor, timestamp |

### GRN

| Event | Action Code | Captured Data |
|---|---|---|
| GRN created (draft) | `INV.GRN.CREATE` | Header + all lines |
| GRN draft updated | `INV.GRN.UPDATE` | Changed lines, quantities |
| GRN confirmed | `INV.GRN.CONFIRM` | Actor, timestamp, total value received |
| GRN cancelled | `INV.GRN.CANCEL` | Actor, reason |
| Inspection result submitted | `INV.GRN.INSPECT` | Item, result (approved/rejected), inspector, notes |
| QAQC rejection — return triggered | `INV.GRN.QAQC_REJECT` | Item, reason, return record created |

### Material Requisition

| Event | Action Code | Captured Data |
|---|---|---|
| MR created | `INV.MR.CREATE` | Header + lines, WBS node, cost code |
| MR submitted | `INV.MR.SUBMIT` | Actor, timestamp |
| MR approved | `INV.MR.APPROVE` | Approver, timestamp, any quantity adjustments |
| MR rejected | `INV.MR.REJECT` | Approver, rejection reason |
| MR issued (partial or full) | `INV.MR.ISSUE` | Storekeeper, actual quantities issued per line |
| MR cancelled | `INV.MR.CANCEL` | Actor, reason |

### Material Return

| Event | Action Code | Captured Data |
|---|---|---|
| Return raised | `INV.RETURN.CREATE` | Actor, original MR reference, items, quantities |
| Return confirmed (Reusable) | `INV.RETURN.CONFIRM_REUSABLE` | Storekeeper, items, quantities added back |
| Return confirmed (Damaged) | `INV.RETURN.CONFIRM_DAMAGED` | Storekeeper, damage description, write-off triggered |
| Write-off approved | `INV.RETURN.WRITEOFF_APPROVED` | Approver, items, quantities, cost impact |

### Transfers

| Event | Action Code | Captured Data |
|---|---|---|
| Transfer request created | `INV.TRF.CREATE` | Requestor, source, destination, items |
| Transfer approved (source) | `INV.TRF.APPROVE_SOURCE` | Approver, timestamp |
| Transfer approved (destination) | `INV.TRF.APPROVE_DEST` | Approver, timestamp |
| Transfer rejected | `INV.TRF.REJECT` | Rejector, reason |
| Transfer dispatched | `INV.TRF.DISPATCH` | Dispatcher, actual quantities, timestamp |
| Transfer received (full) | `INV.TRF.RECEIVE` | Receiver, received quantities, timestamp |
| Transfer discrepancy recorded | `INV.TRF.DISCREPANCY` | Both parties, dispatched vs received variances |
| Transfer discrepancy resolved | `INV.TRF.DISCREPANCY_RESOLVED` | Approver, final agreed quantities |

### Adjustments

| Event | Action Code | Captured Data |
|---|---|---|
| Adjustment created | `INV.ADJ.CREATE` | Actor, items, quantities (before/after), reason |
| Adjustment approved | `INV.ADJ.APPROVE` | Approver, timestamp, cost impact |
| Adjustment rejected | `INV.ADJ.REJECT` | Rejector, reason |

### Physical Stock Take

| Event | Action Code | Captured Data |
|---|---|---|
| Stock take initiated (store locked) | `INV.ST.INITIATE` | Initiator, store, timestamp |
| Count submitted | `INV.ST.COUNT_SUBMIT` | Counter, all counted quantities |
| Variance line approved | `INV.ST.VAR_APPROVE` | Approver, item, system qty, physical qty, variance, explanation |
| Stock take completed | `INV.ST.COMPLETE` | Approver, total variance value, adjustments posted |
| Stock take cancelled (store unlocked) | `INV.ST.CANCEL` | Actor, reason, timestamp |

### Stock Movements (all movement types)

Every row inserted into `inventory_movements` is itself the audit record. The movements table is append-only and captures actor, timestamp, reference, quantities, and costs for every stock change. No separate audit event is needed for movements — the movements table IS the ledger.

---

## 3. Immutability Rules

| Table | Rule |
|---|---|
| `inventory_movements` | INSERT only. No UPDATE or DELETE permitted. Corrections via offsetting movements only. |
| `inventory_grns` (confirmed) | No UPDATE after status = Confirmed. Corrections via Credit GRN. |
| `inventory_stocktakes` (completed) | No UPDATE after status = Completed. |
| `audit_logs` | INSERT only. No UPDATE or DELETE by any user. |

---

## 4. Data Retention

| Data | Retention Period | Notes |
|---|---|---|
| Movement ledger | 7 years minimum | Financial audit requirement |
| GRN records | 7 years | Tied to procurement records |
| Stock take records | 7 years | Financial audit |
| Adjustment records | 7 years | |
| Audit log entries | 7 years | System-wide policy |
| Low-stock alert history | 2 years | Operational only |
| Notification history | 1 year | |

---

## 5. Special Audit Scenarios

### Scenario A: Missing materials discovered on site
Audit investigation path:
1. Check `inventory_movements` for the item and store → identify last movement
2. Check `inventory_mr_lines` → identify who issued and when
3. Check `audit_logs` for `INV.MR.ISSUE` → confirm Storekeeper who processed issue
4. Compare with `wbs_nodes` task completion → was material consumed or missing?

### Scenario B: GRN quantity dispute with supplier
Audit investigation path:
1. Check `inventory_grn_lines` for the GRN → recorded received quantity
2. Check `audit_logs` for `INV.GRN.CONFIRM` → Storekeeper and timestamp
3. Check attached delivery note scan (document attachment on GRN)
4. Cross-reference with procurement PO quantity

### Scenario C: Stock take shows large negative variance
Audit investigation path:
1. Check `inventory_stocktake_lines` → which items have variance
2. Check `inventory_movements` for those items since last stock take → trace all issues and receipts
3. Check `audit_logs` for any adjustments → were adjustments approved or unauthorized?
4. Check MR issues to confirm valid WBS task references
