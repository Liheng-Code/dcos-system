# QS (Quantity Surveying) Module — Design Review

> Generated: 2026-06-06
> Scope: Schema, Service Layer, UI Components, Data Flow

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Architecture & Entity Relationships](#2-data-architecture--entity-relationships)
3. [Full Project Lifecycle Flow](#3-full-project-lifecycle-flow)
4. [Screen & Component Navigation](#4-screen--component-navigation)
5. [Critical Issues](#5-critical-issues)
6. [Moderate Issues](#6-moderate-issues)
7. [Minor Issues](#7-minor-issues)
8. [Services-to-Schema Gap Analysis](#8-services-to-schema-gap-analysis)
9. [Recommended Roadmap](#9-recommended-roadmap)

---

## 1. System Overview

```
PROJECT
  │
  ├── WBS TREE (wbs_nodes, self-referencing hierarchy)
  │     └── WBS Tasks (wbs_tasks — progress, budget_cost, actual_cost)
  │
  ├── COST LIBRARY (Enterprise MasterFormat-like catalog)
  │     ├── qs_cost_divisions  (00–49)
  │     ├── qs_cost_sections
  │     └── qs_cost_items      (base_rate, labor/mat/equip split)
  │
  ├── BOQ (Bill of Quantities) — per project, multiple BOQs
  │     ├── qs_boq              (header — type, version, currency)
  │     ├── qs_boq_sections     (groupings within a BOQ)
  │     └── qs_boq_items        (line items — links to WBS + Cost Library)
  │
  ├── COST TRACKING
  │     ├── qs_cost_transactions  (invoices, POs, timesheets, etc.)
  │     ├── qs_budget_revisions   (before/after on locked BOQ items)
  │     └── qs_cost_baseline      (time-phased planned vs actual, S-curve)
  │
  ├── VARIANTS & ADJUSTMENTS
  │     ├── qs_variation_orders + qs_vo_items + qs_vo_approvals
  │     ├── qs_contingency_drawdowns
  │     └── qs_retention_ledger
  │
  ├── PROGRESS CLAIMS (IPC)
  │     ├── qs_progress_claims
  │     └── qs_claim_items        (auto-copied from BOQ items)
  │
  ├── CURRENCY
  │     ├── qs_project_currency   (base currency per project)
  │     └── qs_exchange_rates     (point-in-time rates)
  │
  └── AUDIT
        └── qs_audit_log          (trigger-based, 5 tables covered)
```

### Key Data Flow

```
WBS Node ◄─── qs_boq_items.wbs_node_id ───► BOQ Item
                                              │
                                              │  qs_cost_transactions.boq_item_id
                                              │  qs_budget_revisions.boq_item_id
                                              ▼  qs_vo_items.boq_item_id
                                          Cost / VO / Claims / Contingency
                                              │
                                              ▼
                                          Budget vs Actual
                                          Variance Reports
                                          EVM (CPI/SPI/EAC)
```

---

## 2. Data Architecture & Entity Relationships

### 2.1 Cost Library (Enterprise-wide, no project_id)

```
qs_cost_divisions
  id (PK)
  code (UNIQUE)
  name
  seq
  │
  └── qs_cost_sections
        id (PK)
        division_id (FK → qs_cost_divisions, CASCADE)
        code
        name
        seq
        │
        └── qs_cost_items
              id (PK)
              section_id (FK → qs_cost_sections, CASCADE)
              code
              description
              unit
              base_rate (NUMERIC 12,2)
              labor_pct (NUMERIC 5,2)
              material_pct (NUMERIC 5,2)
              equipment_pct (NUMERIC 5,2)
              is_active
```

### 2.2 BOQ (Project-scoped, Multi-BOQ)

```
qs_boq
  id (PK)
  project_id (FK → projects)
  boq_number
  title
  boq_type (preliminary|main_works|variation|provisional_sum|supplement)
  version
  status (draft|active|locked|superseded)
  currency_code
  exchange_rate
  created_by (FK → auth.users)
  │
  └── qs_boq_sections
        id (PK)
        project_id (FK → projects)
        boq_id (FK → qs_boq, nullable — added late)
        seq
        title
        description
        section_code (nullable — added late, NEVER PERSISTED)
        baseline_status (draft|approved|locked|revised)
        approved_by / approved_at / locked_at
        │
        └── qs_boq_items
              id (PK)
              project_id (FK → projects)
              boq_section_id (FK → qs_boq_sections, CASCADE)
              wbs_node_id (FK → wbs_nodes, SET NULL) ◄── WBS LINK
              cost_item_id (FK → qs_cost_items, SET NULL)
              seq / item_no / item_code (item_no/code NEVER PERSISTED)
              description
              unit / quantity (15,3) / unit_rate (12,2)
              total_amount (GENERATED: qty × rate)
              contingency_pct
              is_provisional
              baseline_status / revision_reason / effective_date
              currency
```

### 2.3 Cost Tracking

```
qs_cost_transactions
  id (PK)
  project_id (FK → projects)
  boq_item_id (FK → qs_boq_items, SET NULL) ◄── LINKS COST TO BOQ
  wbs_node_id (FK → wbs_nodes, SET NULL)     ◄── DIRECT WBS LINK (redundant)
  transaction_type (invoice|po|timesheet|delivery|other)
  cost_category (labor|material|equipment|subcontract|other)
  description
  quantity / unit / unit_cost / total_cost
  reference_number / vendor_name
  cost_date / invoice_date
  payment_status (pending|approved|paid)
  approved_by / approved_at
  currency / exchange_rate / base_currency_amount (GENERATED)

qs_budget_revisions
  id (PK)
  project_id (FK → projects)
  boq_item_id (FK → qs_boq_items, CASCADE)
  prev_quantity / new_quantity
  prev_unit_rate / new_unit_rate
  prev_total / new_total
  reason
  revised_by / revised_at
  approved_by / approved_at / effective_date
  ⚠ No revision_number — can't determine sequence

qs_cost_baseline
  id (PK)
  project_id (FK → projects)
  period_date (UNIQUE with project_id)
  planned_cost / cumulative_planned
  ⚠ Aggregate only — no WBS/BOQ granularity
```

### 2.4 Variation Orders

```
qs_variation_orders
  id (PK)
  project_id (FK → projects)
  vo_number
  title / vo_type / description
  total_amount (manually maintained — should be computed)
  schedule_impact_days
  status (draft|submitted|approved|rejected|implemented)
  submitted_by/at, approved_by/at
  currency
  │
  ├── qs_vo_items
  │     id (PK)
  │     vo_id (FK → qs_variation_orders, CASCADE)
  │     boq_item_id (FK → qs_boq_items, SET NULL)
  │     description / unit / quantity / unit_rate / total_amount (GENERATED)
  │
  └── qs_vo_approvals
        id (PK)
        vo_id (FK → qs_variation_orders, CASCADE)
        step (UNIQUE per vo_id)
        approver_role / user_id
        decision (pending|approved|rejected)
```

### 2.5 Progress Claims (IPC)

```
qs_progress_claims
  id (PK)
  project_id (FK → projects)
  claim_number (UNIQUE per project)
  period_start / period_end
  original_contract_sum / net_vo_amount ⚠ (manual)
  total_completed_stored / retention_pct / retention_amount ⚠ (manual)
  prev_certificates_total / current_payment_due ⚠ (manual)
  status (draft|submitted|client_reviewed|certified|paid)
  certified_amount / paid_at
  client_adjustment_total
  │
  └── qs_claim_items
        id (PK)
        claim_id (FK → qs_progress_claims, CASCADE)
        boq_section_id / boq_item_id
        description / unit / scheduled_value
        prev_completed / this_period / materials_stored
        total_to_date (GENERATED: prev + this + stored)
        pct_complete (GENERATED)
        client_adjustment / adjustment_reason
        certified_this_period / certified_materials_stored
        UNIQUE(claim_id, boq_item_id) ⚠ NULLs not enforced
```

### 2.6 Retention & Contingency

```
qs_retention_ledger
  id (PK)
  project_id (FK → projects)
  claim_id (FK → qs_progress_claims, SET NULL)
  transaction_type (deduction|release)
  amount
  release_trigger (practical_completion|dlp_completion|other)
  approval_status (pending|approved|rejected)
  expected_release_date / actual_release_date

qs_contingency_drawdowns
  id (PK)
  project_id (FK → projects)
  boq_item_id (FK → qs_boq_items, SET NULL)
  amount / reason
  status (pending|approved|rejected)
  approved_by / approved_at
  ⚠ No FK to qs_variation_orders — can't trace trigger
```

### 2.7 Cross-Cutting Summary

| Entity | Project-scoped? | WBS Link? | Audit Trail? | Currency Aware? |
|---|---|---|---|---|
| Cost Library | Enterprise | — | No | No |
| BOQ Sections | Yes | — | No | Via parent |
| BOQ Items | Yes | **Yes** (FK) | **No** ❗ | Per-item |
| Cost Transactions | Yes | Dual (item + direct) | **No** ❗ | Yes |
| Budget Revisions | Yes | Via BOQ | Yes | No |
| Cost Baseline | Yes | **No** ❗ | No | No |
| Variation Orders | Yes | Via VO Items | Yes | Yes |
| VO Items | Via parent | Optional (missing FK) | **No** ❗ | Via parent |
| Progress Claims | Yes | Via Claim Items | Yes | No |
| Claim Items | Via parent | Via BOQ item | **No** ❗ | Via parent |
| Retention Ledger | Yes | — | Yes | No |
| Contingency Drawdowns | Yes | Via BOQ | Yes | No |

---

## 3. Full Project Lifecycle Flow

```
PHASE 1: SETUP
  Create Project
    └─ Build WBS Tree (wbs_nodes)
         └─ Create WBS Tasks (wbs_tasks)

PHASE 2: BUDGET (BOQ)
  Create BOQ (qs_boq)
    └─ Add Sections (qs_boq_sections)
         └─ Add Items (qs_boq_items)
              ├─ Link to WBS Node (wbs_node_id) ◄── CRITICAL LINK
              └─ Link to Cost Library (cost_item_id)
  Lock Baseline (baseline_status = 'locked')

PHASE 3: EXECUTION (COST TRACKING)
  Record Cost Transactions (qs_cost_transactions)
    └─ Link to BOQ Item (boq_item_id)
  Budget vs Actual Variance (computed in getBudgetSummary)
    Budget = SUM(boq_items.total_amount)
    Actual = SUM(cost_transactions WHERE type ≠ 'po')
  Update Task Progress (wbs_tasks.progress%)

PHASE 4: VARIANTS & ADJUSTMENTS
  Variation Orders → Update contract sum
  Budget Revisions → Audit trail of BOQ changes
  Contingency Drawdowns → Release from contingency reserve

PHASE 5: PROGRESS CLAIMS (IPC)
  Create Claim → Auto-copies BOQ items
  Certify → Creates retention deduction
  Pay → Creates payment voucher

PHASE 6: EVM & REPORTING
  S-Curve (qs_cost_baseline)
  EVM Dashboard (CPI/SPI/EAC from task progress + BOQ budget)
  Portfolio View (cross-project)

PHASE 7: PROCUREMENT INTEGRATION
  PR/PO Reference WBS Node
  Read-only BOQ view for procurement team
```

---

## 4. Screen & Component Navigation

```
/qs (tabbed dashboard)
  ├── Budget & Variance tab
  ├── Budget Revisions tab
  ├── Contingency tab
  ├── Cost Transactions tab
  ├── EVM Dashboard tab
  ├── S-Curve tab
  ├── Portfolio tab
  ├── Audit Log tab
  └── Currency tab

/qs/boq (BOQ Manager)
  └── /qs/boq/[id] (BOQ Builder)
        ├── CreateBoqSlideIn
        └── UpdateBoqSlideIn

/qs/variations (VO Manager)
/qs/claims (IPC Manager)
/qs/retention (Retention Ledger)
/qs/cost-library (Cost Code Manager)
/qs/payments (Payment Vouchers)

/wbs/[id] (WBS Detail)
  └── WbsCostTab
        ├── Cost Summary Cards
        ├── Budget Rollup (recursive tree)
        ├── BOQ Allocations Table
        ├── Cost Transactions Table
        └── WbsEvmPanel
```

---

## 5. Critical Issues

### C1 — `updateClaimStatus` column name mismatch

**Location:** `apps/web/lib/qs-service.ts:1147`

**Problem:** The query uses `projects(name)` but the `projects` table column is `project_name`. This causes a PostgreSQL error whenever a claim status transitions to "paid".

**Impact:** Payment vouchers cannot be generated from claims. Production blocker.

**Fix:** Change `projects(name)` to `projects(project_name)`.

---

### C2 — `boq-list.tsx` references non-existent columns

**Location:** `apps/web/components/procurement/boq-list.tsx`

**Problem:** The component's local interfaces reference:
- `section_code` on `qs_boq_sections` — **never added to DB**
- `item_no` and `item_code` on `qs_boq_items` — **never added to DB**

All three fields always return null. The UI falls back to `seq` for display, masking the gap.

**Impact:** Users cannot assign semantic item numbers/codes. BOQ items display row numbers (seq) instead.

**Fix:** Either:
- (a) Add migration to create these columns, or
- (b) Remove them from the component interface if the feature was deferred

---

### C3 — RLS policies wide open

**Location:** All QS migration files

**Problem:** Every QS table has RLS policies like:
```sql
CREATE POLICY "qs_boq_auth" ON public.qs_boq
  FOR ALL USING (true) WITH CHECK (true);
```

The `role_permissions` table is seeded with granular QS permissions (migration `20260612000001`) but **these are never referenced by RLS policies**. The role-based access control is purely documentary.

**Impact:** Any authenticated user can view/edit any project's BOQ, cost transactions, claims, etc. No tenant isolation at the database level.

**Fix:** Replace `USING (true)` policies with policies that check the user's project membership and role. The `projects` table has `owner_id`; the `role_permissions` table maps roles to permissions.

---

### C4 — `account_budget_vs_actual` view sums all revisions

**Location:** `supabase/migrations/20260531000039_account_reporting_views.sql`

**Problem:** The view does `SUM(new_total)` over all `qs_budget_revisions` rows. If a BOQ item has multiple revisions, ALL revisions' `new_total` values are summed — not just the latest one.

**Example:** Item budget = $10,000. Revised to $12,000, then to $11,000. The view reports $10,000 + $12,000 + $11,000 = $33,000 instead of $11,000.

**Impact:** Budget reports are unreliable for any project that has performed budget revisions.

**Fix:** Use `DISTINCT ON (boq_item_id) ORDER BY boq_item_id, revised_at DESC` or a subquery to select only the latest revision per item.

---

## 6. Moderate Issues

### M1 — Missing index on `qs_budget_revisions(project_id)`

**Location:** `supabase/migrations/20260531000023`

**Problem:** `getBudgetRevisions` filters by `project_id` but the only index is on `boq_item_id`. The reporting view `account_budget_vs_actual` also groups by `project_id` without index support.

**Fix:** `CREATE INDEX idx_qs_budget_revisions_project ON qs_budget_revisions(project_id);`

---

### M2 — `initializeClaimItems` includes draft BOQ items

**Location:** `apps/web/lib/qs-service.ts:989-993`

**Problem:** The function reads ALL `qs_boq_items` for the project without filtering by `baseline_status = 'approved'`. Draft/rejected items appear in claims and must be manually zeroed out.

**Fix:** Add `WHERE baseline_status IN ('approved', 'locked')` to the BOQ items query.

---

### M3 — Cost transactions always return full project data

**Location:** `apps/web/lib/qs-service.ts:693`

**Problem:** `getCostTransactions` returns ALL transactions for a project. Functions like `getWbsCommercialSummary` and `getWbsBudgetRollup` fetch everything and filter client-side. Problematic for large projects.

**Fix:** Add optional `boq_item_id`/`wbs_node_id` filter parameters to the service function.

---

### M4 — Cost baseline lacks WBS granularity

**Location:** `qs_cost_baseline` table

**Problem:** The baseline stores monthly planned cost as a single aggregate per project. Can't answer "what was the planned cost for Foundations in March?" at the database level.

**Fix:** Add `wbs_node_id` (nullable FK) to `qs_cost_baseline` to allow WBS-level baseline entries, or create a separate `qs_wbs_cost_baseline` table.

---

### M5 — `qs_budget_revisions` lacks revision sequence

**Problem:** No `revision_number` column. If two revisions happen on the same day (same `revised_at`), their order is ambiguous.

**Fix:** Add `revision_number INTEGER NOT NULL DEFAULT 1` with unique constraint per `(boq_item_id, revision_number)`. Auto-increment based on existing count per `boq_item_id`.

---

### M6 — Audit gap on key financial tables

**Problem:** The `qs_audit_log` trigger is attached to only 5 tables. Missing from:

| Table | Risk |
|-------|------|
| `qs_boq_items` | Most critical — budget values change without audit |
| `qs_cost_transactions` | Actual costs entered without trace |
| `qs_boq_sections` | Section-level baseline changes |
| `qs_boq` | BOQ header changes (type, status, currency) |
| `qs_vo_items` | VO line items |
| `qs_claim_items` | Claim line items |
| `qs_cost_baseline` | Baseline distribution changes |

**Fix:** Create a generic `qs_audit_trigger_fn()` invocation for each additional table.

---

### M7 — `qs_claim_items` UNIQUE constraint allows NULL duplicates

**Problem:** PostgreSQL allows multiple `NULL` values in a unique constraint. `UNIQUE(claim_id, boq_item_id)` allows duplicate rows where `boq_item_id IS NULL`.

**Fix:** Replace with partial unique index:
```sql
CREATE UNIQUE INDEX idx_qs_claim_items_unique
  ON qs_claim_items(claim_id, boq_item_id)
  WHERE boq_item_id IS NOT NULL;
```

---

### M8 — `qs_progress_claims.net_vo_amount` is manually maintained

**Problem:** The `net_vo_amount` column is entered manually rather than derived from actual VOs linked to the claim period. Can diverge from actual VO totals.

**Fix:** Either:
- (a) Remove the column and compute from `qs_variation_orders` filtered by date range, or
- (b) Add a junction table `qs_claim_vos(claim_id, vo_id)` and make `net_vo_amount` a generated sum.

---

### M9 — No FK from contingency drawdowns to VOs

**Problem:** Contingency drawdowns reference a BOQ item but not the VO that triggered the drawdown. Can't trace "which VO caused this contingency release?"

**Fix:** Add `vo_id UUID REFERENCES qs_variation_orders(id) ON DELETE SET NULL` to `qs_contingency_drawdowns`.

---

## 7. Minor Issues

### N1 — Numeric precision inconsistencies

| Concept | Used As | Precision |
|---------|---------|-----------|
| Monetary amounts (most tables) | `total_cost`, `amount`, `total_amount` | `NUMERIC(15,2)` |
| `qs_cost_transactions.base_currency_amount` | Converted amount | `NUMERIC(18,2)` ⚠ |
| `qs_boq.exchange_rate` | BOQ rate | `NUMERIC(14,6)` |
| `qs_exchange_rates.rate` | Exchange rate | `NUMERIC(18,6)` ⚠ |
| `qs_cost_transactions.exchange_rate` | Exchange rate | `NUMERIC(18,6)` |

**Fix:** Normalize to `NUMERIC(15,2)` for monetary amounts and `NUMERIC(18,6)` for exchange rates.

---

### N2 — No CHECK constraint on cost breakdown percentages

**Location:** `qs_cost_items`

**Problem:** `labor_pct + material_pct + equipment_pct` can exceed 100%. The seeded data always sums to exactly 100%, but nothing prevents bad data.

**Fix:** `CHECK (labor_pct + material_pct + equipment_pct <= 100 AND labor_pct >= 0 AND material_pct >= 0 AND equipment_pct >= 0)`

---

### N3 — `qs_boq_sections.boq_id` nullable

**Problem:** The `boq_id` FK was added late (migration `20260614000001`). Backfill handles existing rows, but concurrent inserts between migration deployment and application update could create orphan sections.

**Fix:** After migration backfill completes, `ALTER TABLE qs_boq_sections ALTER COLUMN boq_id SET NOT NULL;`

---

### N4 — `seq` columns not migrated to BIGINT

**Problem:** The project-wide migration `20260527000022_alter_sort_order_to_bigint.sql` migrated sort_order to BIGINT on other tables, but QS tables created later use `INTEGER` for `seq`.

**Fix:** Create migration to alter `seq` columns to `BIGINT` on `qs_boq_sections`, `qs_boq_items`, `qs_cost_divisions`, `qs_cost_sections`.

---

### N5 — `prev_completed` double-counts in claim initialization

**Location:** `apps/web/lib/qs-service.ts:1013`

**Problem:** In `initializeClaimItems`, the previous claim's `this_period + materials_stored` is stored as the new claim's `prev_completed`. But the generated column `total_to_date = prev_completed + this_period + materials_stored` means each claim's `prev_completed` should be the prior claim's FULL `total_to_date`, not a recomputed sum.

**Example:** Claim 1: prev=0, this=90, stored=10 → total=100. Claim 2 prev should be 100 (total of claim 1), but code computes 90+10=100 (same result now, but breaks if claim 1 had client adjustments).

**Fix:** Store `prev_completed` from the prior claim's `total_to_date` column (with adjustments applied), not a recomputation.

---

## 8. Services-to-Schema Gap Analysis

### 8.1 `qs-service.ts` — All functions verified

| Function | Status | Notes |
|----------|--------|-------|
| `getBoqList` | ✅ | All columns exist |
| `getBoq` | ✅ | |
| `getBoqByNumber` | ✅ | |
| `getNextBoqNumber` | ✅ | |
| `createBoq` | ✅ | |
| `updateBoq` | ✅ | |
| `deleteBoq` | ✅ | |
| `getCostDivisions` | ✅ | |
| `getCostItems` | ✅ | Join path valid |
| `getBoqSections` | ✅ | |
| `createBoqSection` | ✅ | |
| `deleteBoqSection` | ✅ | |
| `getBoqItems` | ✅ | Join to `cost_items`, `wbs_nodes` valid |
| `createBoqItem` | ✅ | |
| `deleteBoqItem` | ✅ | |
| `updateBoqBaselineStatus` | ✅ | |
| `getBudgetSummary` | ✅ | |
| `getProjectCommercialSummary` | ✅ | |
| `getWbsCommercialSummary` | ✅ | |
| `getWbsBudgetRollup` | ✅ | Client-side tree building |
| `getCostTransactions` | ✅ | But fetches all — see M3 |
| `createCostTransaction` | ✅ | |
| `deleteCostTransaction` | ✅ | |
| `getVariationOrders` | ✅ | |
| `createVariationOrder` | ✅ | |
| `updateVoStatus` | ✅ | |
| `getVoItems` | ✅ | |
| `createVoItem` | ✅ | |
| `deleteVoItem` | ✅ | |
| `getProgressClaims` | ✅ | |
| `createProgressClaim` | ✅ | See M2 |
| `initializeClaimItems` | ⚠️ | No baseline_status filter, see M2, N5 |
| `getClaimItems` | ✅ | |
| `updateClaimItem` | ✅ | |
| `recalculateClaim` | ✅ | |
| `updateClaimStatus` | ❌ | **C1** — `projects(name)` breaks |
| `getRetentionLedger` | ✅ | |
| `getRetentionBalance` | ✅ | |
| `createRetentionRelease` | ✅ | |
| `approveRetentionRelease` | ✅ | |
| `getVoApprovals` | ✅ | |
| `submitVoApprovalDecision` | ✅ | |
| `getQsAuditLog` | ✅ | |
| `getCostBaseline` | ✅ | |
| `upsertCostBaselineEntries` | ✅ | |
| `deleteCostBaselineEntry` | ✅ | |
| `getContingencyBalance` | ✅ | |
| `getContingencyDrawdowns` | ✅ | |
| `createContingencyDrawdown` | ✅ | |
| `approveContingencyDrawdown` | ✅ | |
| `getBudgetRevisions` | ⚠️ | Missing `project_id` index — M1 |
| `approveBudgetRevision` | ✅ | |
| `getQsPaymentVouchers` | ✅ | |
| `getProjectBaseCurrency` | ✅ | |
| `setProjectBaseCurrency` | ✅ | |
| `getExchangeRates` | ✅ | |
| `upsertExchangeRate` | ✅ | |
| `deleteExchangeRate` | ✅ | |

### 8.2 `evm-service.ts` — Verified

| Function | Status | Notes |
|----------|--------|-------|
| `getProjectCostAnalytics` | ⚠️ | Fetches ALL `wbs_tasks` — should filter by `project_id` |
| `getCostSnapshots` | ✅ | |
| `getWbsNodeCostBreakdown` | ✅ | |

### 8.3 `boq-list.tsx` (Procurement) — Direct DB access

| Query | Status | Notes |
|-------|--------|-------|
| `projects` SELECT | ✅ | |
| `qs_boq_sections` SELECT | ❌ | **C2** — `section_code` doesn't exist |
| `qs_boq_items` SELECT | ❌ | **C2** — `item_no`, `item_code` don't exist |

---

## 9. Recommended Roadmap

### Phase 1 — Fix the Crashes (Day 1)

| # | Task | Effort |
|---|------|--------|
| 1.1 | Fix `projects(name)` → `projects(project_name)` in `updateClaimStatus` | 5 min |
| 1.2 | Add migration for `section_code` on `qs_boq_sections`, `item_no`/`item_code` on `qs_boq_items` | 30 min |
| 1.3 | Verify `boq-list.tsx` works after migration | 15 min |

### Phase 2 — Data Integrity (Week 1)

| # | Task | Effort |
|---|------|--------|
| 2.1 | Fix `account_budget_vs_actual` view (DISTINCT ON latest revision) | 30 min |
| 2.2 | Add missing index on `qs_budget_revisions(project_id)` | 5 min |
| 2.3 | Add partial unique index on `qs_claim_items` to prevent NULL duplicates | 15 min |
| 2.4 | Add CHECK constraint on `qs_cost_items` percentage columns | 15 min |
| 2.5 | Make `qs_boq_sections.boq_id` NOT NULL after verifying backfill | 15 min |

### Phase 3 — Security & Audit (Week 2)

| # | Task | Effort |
|---|------|--------|
| 3.1 | Implement project-scoped RLS policies using `role_permissions` | 2 days |
| 3.2 | Add audit triggers to `qs_boq_items`, `qs_cost_transactions`, `qs_vo_items`, `qs_claim_items`, `qs_boq_sections`, `qs_boq`, `qs_cost_baseline` | 1 day |

### Phase 4 — Features & Refinements (Week 3-4)

| # | Task | Effort |
|---|------|--------|
| 4.1 | Add `revision_number` to `qs_budget_revisions` with auto-sequence | 1 hr |
| 4.2 | Add `vo_id` FK to `qs_contingency_drawdowns` | 30 min |
| 4.3 | Filter BOQ items by `baseline_status = 'approved'` in `initializeClaimItems` | 15 min |
| 4.4 | Add optional `boq_item_id`/`wbs_node_id` filter to `getCostTransactions` | 1 hr |
| 4.5 | Fix `prev_completed` calculation in `initializeClaimItems` to use prior `total_to_date` | 30 min |
| 4.6 | Normalize numeric precision (15,2 → 18,2 for monetary, 18,6 for rates) | 1 hr |
| 4.7 | Migrate `seq` columns to `BIGINT` | 1 hr |

### Phase 5 — Architecture (Future)

| # | Task | Effort |
|---|------|--------|
| 5.1 | Add `wbs_node_id` to `qs_cost_baseline` for WBS-level variance | 2 days |
| 5.2 | Add commitment tracking (PO/subcontract register) | 3-5 days |
| 5.3 | Create QS-specific reporting views (`qs_cost_summary`, `qs_vo_register`) | 2 days |
| 5.4 | Implement Cost Breakdown Structure (CBS) linking cost codes to WBS | 3 days |
| 5.5 | Add EVM computation tables (BCWS, BCWP, ACWP, CPI, SPI) | 2 days |
| 5.6 | Link `qs_progress_claims.net_vo_amount` to actual VO records via junction table | 1 day |

---

## Appendix: Migration File Index

| File | Contents |
|------|----------|
| `20260531000022_create_qs_cost_library.sql` | `qs_cost_divisions`, `qs_cost_sections`, `qs_cost_items` |
| `20260531000023_create_qs_boq_tables.sql` | `qs_boq_sections`, `qs_boq_items`, `qs_budget_revisions` |
| `20260531000024_create_qs_cost_transactions.sql` | `qs_cost_transactions` |
| `20260531000025_drop_redundant_boq_tables.sql` | Cleanup legacy boq_* |
| `20260531000026_extend_qs_boq_ui_fields.sql` | `item_no`, `item_code`, `section_code` (adds to TypeScript types but NOT to DB — see C2) |
| `20260531000032_create_qs_variation_orders.sql` | `qs_variation_orders`, `qs_vo_items`, `qs_vo_approvals` |
| `20260531000033_create_qs_progress_claims.sql` | `qs_progress_claims`, `qs_claim_items` |
| `20260531000034_create_qs_retention_ledger.sql` | `qs_retention_ledger` |
| `20260531000048_qs_core_depth.sql` | Baseline status, IPC certification depth, retention approval |
| `20260612000001_qs_rbac_and_vo_approvals.sql` | VO approval unique constraint + role_permissions seeding |
| `20260612000002_qs_contingency_drawdowns.sql` | `qs_contingency_drawdowns` |
| `20260612000003_qs_cost_baseline_distribution.sql` | `qs_cost_baseline` |
| `20260612000004_qs_audit_log.sql` | `qs_audit_log` + trigger function + 5 table triggers |
| `20260613000001_qs_multi_currency.sql` | Multi-currency columns + `qs_project_currency` + `qs_exchange_rates` |
| `20260614000001_create_qs_boq_header.sql` | `qs_boq` header table + backfill |
| `20260531000039_account_reporting_views.sql` | `account_budget_vs_actual` view |

---
