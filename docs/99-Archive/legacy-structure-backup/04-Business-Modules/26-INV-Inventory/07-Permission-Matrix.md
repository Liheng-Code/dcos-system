# Inventory / Stock Module — Permission Matrix
**Document Code:** DCOS-PM-26-001 | **Version:** R1 | **Date:** 2026-07-27 (originally June 2026)
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

**Revision Note (R1):** Adds a `tools` permission action and enhances the existing Material Return section for the formalised return lifecycle, per CWIMS Appendix A.3 Stage 1+2. Returns reuse the existing `material_return` action (already seeded in `20260621000002_seed_inv_permissions.sql`) — no duplicate action was created. Author: Solution Architect. Status: Draft.

---

## Role Definitions (INV scope)

| Role | Description | RBAC Code(s) |
|---|---|---|
| System Admin | Full access to all modules and configuration | L0, L1, L2 |
| Project Manager (PM) | Full visibility; can approve high-value items; oversees all stores | L3 (L4 = deputy/site manager tier where used) |
| Store Supervisor | Manages store(s); approves adjustments, write-offs, transfers | SS |
| Storekeeper | Operates the store — creates GRN, issues, receives returns, issues/receives tools | SK |
| Site Engineer | Raises and views own Material Requisitions; requests tools; initiates returns | L5, L6 |
| Site Supervisor | Approves Material Requisitions from site team; approves restricted tool issues | SS |
| Procurement Officer | Views stock; creates draft PRs from low-stock alerts | PO |
| Quantity Surveyor (QS) | Views all stock, movements, and cost reports; no write access | QS |
| QAQC Engineer | Reviews and approves/rejects inspection lines on GRN | QA |
| Finance / Accountant | Views cost reports and movement ledger | AC |
| Director / CEO | Read-only dashboard and reports | L1/L2 read-only scope |
| External Auditor | Read-only access to adjustments, stock takes, movements, reports | EXT-AUD |

**Note:** The seeded RBAC layer (`role_permissions` table, `module = 'inventory'`) uses a single `SS` code for supervisory approval actions. This document's separate "Store Supervisor" and "Site Supervisor" labels both resolve to the `SS` role code — the system does not currently distinguish store-facing vs. site-facing supervision as separate roles.

---

## Permission Matrix

### Item Master

| Action | Admin | PM | Store Supervisor | Storekeeper | Site Engineer | Site Supervisor | Procurement Officer | QS | QAQC |
|---|---|---|---|---|---|---|---|---|---|
| View items | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create item | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Edit item | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Deactivate item | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Store Management

| Action | Admin | PM | Store Supervisor | Storekeeper | Site Engineer | Others |
|---|---|---|---|---|---|---|
| Create store | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit store | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Close store | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View store | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Stock Balances

| Action | Admin | PM | Store Supervisor | Storekeeper | Site Engineer | Site Supervisor | QS | Finance |
|---|---|---|---|---|---|---|---|---|
| View stock balance | ✅ | ✅ | ✅ | ✅ | ✅ (project) | ✅ | ✅ | ✅ |
| View movement ledger | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Export movements | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |

### Goods Received Note (GRN)

| Action | Admin | PM | Store Supervisor | Storekeeper | Procurement | QAQC | Others |
|---|---|---|---|---|---|---|---|
| Create GRN | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit draft GRN | ✅ | ❌ | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| Confirm GRN | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancel GRN | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Submit inspection result | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| View GRN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Read-only |

### Material Requisition (MR)

| Action | Admin | PM | Store Supervisor | Storekeeper | Site Engineer | Site Supervisor | QS |
|---|---|---|---|---|---|---|---|
| Create MR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit draft MR | ✅ | own | ✅ | ✅ | own | own | ❌ |
| Submit MR | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Approve MR | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Reject MR | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Issue (confirm) | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| View MR | ✅ | ✅ | ✅ | ✅ | ✅ (own) | ✅ | ✅ |

### Material Return to Store

Action = `material_return` (existing RBAC action, reused — no new action created).

| Action | Admin | PM | Store Supervisor | Storekeeper | Site Engineer | Site Supervisor | QS |
|---|---|---|---|---|---|---|---|
| Create / submit return | ✅ | ❌ | ✅ | ✅ | ✅ (own) | ✅ | ❌ |
| Inspect & record condition | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve out-of-window return | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Post return (re-credit / write-off) | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve write-off | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View / export returns | ✅ | ✅ | ✅ | ✅ | ✅ (own) | ✅ | ✅ (export) |

### Locations (Store Bin Hierarchy)

| Action | Admin | PM | Store Supervisor | Storekeeper | Others |
|---|---|---|---|---|---|
| View locations | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create location | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit location | ✅ | ✅ | ✅ | ❌ | ❌ |
| Deactivate location | ✅ | ✅ | ❌ | ❌ | ❌ |
| Generate barcode/QR for location | ✅ | ❌ | ✅ | ✅ | ❌ |

### Tools (Custody Tracking)

Action = `tools` (new RBAC action).

| Action | Admin | PM | Store Supervisor | Storekeeper | Requester (any site staff) | Site Supervisor | QS |
|---|---|---|---|---|---|---|---|
| View tools / issue history | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / edit tool (master) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Deactivate tool | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Request tool | ✅ | ✅ | ✅ | ✅ (on behalf of) | ✅ | ✅ | ❌ |
| Approve restricted tool issue | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Issue tool (release to custodian) | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Confirm return / record condition-in | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Mark tool lost (raise loss charge) | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Generate barcode/QR for tool | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |

### Transfers

| Action | Admin | PM | Store Supervisor | Storekeeper | Others |
|---|---|---|---|---|---|
| Create transfer | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approve intra-project | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approve inter-project (source) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approve inter-project (dest) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Dispatch | ✅ | ❌ | ✅ | ✅ (source) | ❌ |
| Confirm receipt | ✅ | ❌ | ✅ | ✅ (dest) | ❌ |
| View transfers | ✅ | ✅ | ✅ | ✅ | Read-only |

### Stock Adjustment

| Action | Admin | PM | Store Supervisor | Storekeeper | Others |
|---|---|---|---|---|---|
| Create adjustment | ✅ | ❌ | ✅ | ✅ (create only, cannot self-approve) | ❌ |
| Approve adjustment | ✅ | ✅ | ✅ (others' adjustments) | ❌ | ❌ |
| Reject adjustment | ✅ | ✅ | ✅ | ❌ | ❌ |
| View adjustments | ✅ | ✅ | ✅ | ✅ | QS: ✅ |

### Physical Stock Take

| Action | Admin | PM | Store Supervisor | Storekeeper | Others |
|---|---|---|---|---|---|
| Initiate stock take | ✅ | ✅ | ✅ | ❌ | ❌ |
| Enter count quantities | ✅ | ❌ | ✅ | ✅ | ❌ |
| Approve variances | ✅ | ✅ | ✅ | ❌ | ❌ |
| Complete stock take | ✅ | ✅ | ✅ | ❌ | ❌ |
| Cancel stock take | ✅ | ✅ | ✅ | ❌ | ❌ |
| View stock take | ✅ | ✅ | ✅ | ✅ | QS/Finance: ✅ |

### Reports

| Report | PM | Store Supervisor | Storekeeper | QS | Finance | Director |
|---|---|---|---|---|---|---|
| Stock Summary Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Consumption by WBS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Aging / Slow Moving | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cost Posting Report | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Export full movement CSV | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |

---

## Special Rules

1. **Self-approval blocked:** A Storekeeper cannot approve their own adjustment. The system must enforce different approver from requester.
2. **Separation of duties:** GRN creation (Storekeeper) and QAQC inspection (QAQC Engineer) must be different persons.
3. **High-value adjustments:** Adjustments where `|cost_impact| > 5,000` (configurable threshold) require Project Manager approval in addition to Store Supervisor.
4. **Inter-project transfer:** Both project Store Supervisors must approve — the system holds the transfer until both approvals are received.
5. **External users (Suppliers):** No access to the Inventory module. Suppliers interact only via the Procurement Supplier Portal.
6. **One custodian per tool:** A tool cannot be issued to a second custodian while an issue record for it is still open (`pending_approval`/`issued`/`overdue`). Enforced by a partial unique index at the database layer, not permissions alone.
7. **Restricted tools require Supervisor approval:** A Storekeeper cannot release a tool flagged `is_restricted` to a custodian until a Supervisor has approved the request — mirrors the self-approval-blocked pattern used for adjustments.
8. **Tenant-scoped scanning:** Barcode/QR generation permissions follow the underlying record's permissions (item, location, tool) — no separate "barcode" action exists. A scan that resolves to a different tenant's record is rejected at the API layer (`INV_TENANT_SCOPE_VIOLATION`) regardless of the scanning user's role.
