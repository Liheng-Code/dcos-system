# QS Module — Gap Analysis vs SOP-QS-001

**Date:** 2026-07-14  
**Reference:** SOP-QS-001 R1  
**Status:** Active implementation gaps

---

## 1. Current Navigation Structure

The main sidebar (`sidebar.tsx`) already provides complete navigation:

```
Quantity Surveying
├── Tender & Estimate
│   ├── Tender Register          /dashboard/tenders/register
│   ├── Cost Estimation          /dashboard/tenders/cost-estimation
│   ├── Budget Codes             /dashboard/tenders/budget-codes
│   ├── Tender Management        /dashboard/tenders/tender-management
│   ├── Submissions              /dashboard/tenders/submissions
│   └── Bid Evaluation           /dashboard/tenders/bid-evaluation
├── Cost Control
│   ├── BOQ                      /dashboard/qs/boq
│   ├── Cost Control             /dashboard/qs?tab=cost-control
│   ├── Contingency              /dashboard/qs?tab=contingency
│   ├── Earned Value             /dashboard/qs/evm
│   ├── Portfolio                /dashboard/qs?tab=portfolio
│   ├── Audit Log                /dashboard/qs?tab=audit
│   ├── Currency                 /dashboard/qs?tab=currency
│   ├── Cost Library             /dashboard/qs/cost-library
│   ├── Progress Claims          /dashboard/qs/claims
│   └── Variations               /dashboard/qs/variations
├── Subcon Mgmt
│   ├── Back Charges             /dashboard/subcontractors/back-charges
│   └── Performance Notices      /dashboard/subcontractors/performance-notices
└── Contract Admin
    ├── Contract Register        /dashboard/contracts/register
    ├── Notices                  /dashboard/contracts/notices
    ├── Employer Instructions    /dashboard/contracts/employer-instructions
    ├── Correspondence           /dashboard/contracts/correspondence
    └── Entitlements             /dashboard/contracts/entitlements
```

---

## 2. Identified Gaps

### Gap 1: Sidebar Missing 4 Entries (routes exist, no sidebar link)

| Route | Target Group | Component |
|---|---|---|
| `/dashboard/qs/retention` | Cost Control (after Progress Claims) | `RetentionRegister` |
| `/dashboard/qs/payments` | Cost Control (after Retention) | `PaymentVoucherList` |
| `/dashboard/subcontractors/ipcs` | Subcon Mgmt (new item) | `SubIpcListPage` |
| `/dashboard/subcontractors/variations` | Subcon Mgmt (new item) | `VariationsPage` |

### Gap 2: RBAC Enforcement on 9 Components (Critical)

Components that lack `useQsPermissions` checks:

| Component | Action to Guard | Permission Call |
|---|---|---|
| `cost-control.tsx` | Record cost button | `can("costs", "can_create")` |
| `portfolio-view.tsx` | Full view | `can("boq", "view")` |
| `audit-log.tsx` | Full view | `can("variation_orders", "view")` |
| `currency-settings.tsx` | Configure | `can("cost_library", "configure")` |
| `budget-view.tsx` | Export CSV | `can("boq", "export")` |
| `cost-scurve.tsx` | Capture snapshot | `can("costs", "can_create")` |
| `merged-variations-view.tsx` | Sub-VO create/delete | `can("variation_orders", "can_create")` |
| `evm-view.tsx` | Full view | `can("boq", "view")` |

### Gap 3: BOQ Builder Missing Fields (High)

SOP-QS-05 requires fields not in the BOQ builder UI:

| Field | In DB Type? | In createBoqItem? | In UI? |
|---|---|---|---|
| `is_provisional` | Yes | Optional | **NO** |
| `contingency_pct` | Yes | Optional | **NO** |
| `wbs_node_id` | Yes | Optional | No (lower priority) |
| `notes` | Yes | Optional | No (lower priority) |

### Gap 4: Cost Entry Payment Status Workflow (High)

SOP-QS-07 requires `pending → approved → paid` workflow:

- `payment_status` field exists in DB type (`QsCostTransaction`)
- Badge displays `payment_status` in table
- **No way to set or change it** — no dropdown, no approval buttons
- **No `updateCostTransactionStatus` function** in `qs-service.ts`
- `createCostTransaction` payload missing `currency`/`exchange_rate` in type signature

### Gap 5: Hardcoded USD Currency (Medium)

| File | Line | Issue |
|---|---|---|
| `cost-control.tsx` | 34 | `money()` helper hardcoded to `"USD"` |
| `boq-builder.tsx` | 193, 275, 315 | Hardcoded `$` prefix |
| `qs/page.tsx` | 76, 80-83 | `formatCurrency`/`formatCurrencyShort` hardcoded to `"USD"` |

### Gap 6: Minor UI Issues (Low)

- QS page tab content duplicates sidebar navigation for Cost Control, Contingency, Portfolio, Audit, Currency
- Subcon Mgmt group has only 2 items — missing Sub-IPCs and Sub-Variations

---

## 3. Implementation Plan

### Phase 1: Sidebar Navigation Fixes
- **File:** `sidebar.tsx`
- Add 4 missing NavItem entries

### Phase 2: RBAC Enforcement
- **Files:** 8 components
- Add `useQsPermissions` + `can()` checks

### Phase 3: BOQ Builder Fields
- **File:** `boq-builder.tsx`
- Add `is_provisional` checkbox and `contingency_pct` input

### Phase 4: Cost Entry Workflow
- **Files:** `qs-service.ts`, `cost-entry.tsx`
- Add `updateCostTransactionStatus` function
- Add approve/paid buttons with permission guards

### Phase 5: Currency Fix
- **Files:** `cost-control.tsx`, `boq-builder.tsx`, `qs/page.tsx`
- Fetch project base currency, use dynamic formatting

### Phase 6: QS Page Cleanup
- **File:** `qs/page.tsx`
- Remove duplicate tab content for features with sidebar routes

---

## 4. Files Impacted

| Phase | Files |
|---|---|
| Phase 1 | `sidebar.tsx` |
| Phase 2 | `cost-control.tsx`, `portfolio-view.tsx`, `audit-log.tsx`, `currency-settings.tsx`, `budget-view.tsx`, `cost-scurve.tsx`, `merged-variations-view.tsx`, `evm-view.tsx` |
| Phase 3 | `boq-builder.tsx` |
| Phase 4 | `qs-service.ts`, `cost-entry.tsx` |
| Phase 5 | `cost-control.tsx`, `boq-builder.tsx`, `qs/page.tsx` |
| Phase 6 | `qs/page.tsx` |

**Total: 12 files modified, 0 new files**

---

## 5. Execution Order

| Phase | Depends On | Can Parallel |
|---|---|---|
| Phase 1 | None | Yes |
| Phase 2 | None | Yes |
| Phase 3 | None | Yes (with 4, 5) |
| Phase 4 | None | Yes (with 3, 5) |
| Phase 5 | None | Yes (with 3, 4) |
| Phase 6 | Phase 1, 5 | No |

---

*End of Gap Analysis*
