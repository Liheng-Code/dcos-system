# Inventory / Stock Module — Permission Matrix
**Document Code:** DCOS-PM-26-001 | **Version:** R0 | **Date:** June 2026
**Module Code:** INV | **Domain:** Supply Chain | **Phase:** 3

---

## Role Definitions (INV scope)

| Role | Description |
|---|---|
| System Admin | Full access to all modules and configuration |
| Project Manager (PM) | Full visibility; can approve high-value items; oversees all stores |
| Store Supervisor | Manages store(s); approves adjustments, write-offs, transfers |
| Storekeeper | Operates the store — creates GRN, issues, receives returns |
| Site Engineer | Raises and views own Material Requisitions |
| Site Supervisor | Approves Material Requisitions from site team |
| Procurement Officer | Views stock; creates draft PRs from low-stock alerts |
| Quantity Surveyor (QS) | Views all stock, movements, and cost reports; no write access |
| QAQC Engineer | Reviews and approves/rejects inspection lines on GRN |
| Finance / Accountant | Views cost reports and movement ledger |
| Director / CEO | Read-only dashboard and reports |

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

| Action | Admin | PM | Store Supervisor | Storekeeper | Site Engineer | Site Supervisor |
|---|---|---|---|---|---|---|
| Create return | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Confirm return & condition | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Approve write-off | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

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
