# Pre-Contract → Post-Contract Conversion Flow

## Overview

This document describes the complete flow for converting a project from the pre-contract (tender) phase to the post-contract (execution) phase in DCOS.

---

## Step-by-Step Process

### 1. Create Tender (Tender Register)
- New project created with `project_type='tender'`
- `project_precontract_details` linked to the project

### 2. Work the Tender (Tender Management + Cost Estimation)
- Invite bidders, issue addenda, handle Q&A
- Build BOQ, Price List, Preliminaries, Bid Summary
- Set risks, margins, costs

### 3. Receive Bids (Submissions)
- Bidders submit their proposals

### 4. Evaluate Bids (Bid Evaluation)
- Score bidders, recommend a winner

### 5. Award the Tender (Bid Evaluation → Award tab)
- Create `tender_award_records`
- Update `project_precontract_details.award_status = 'awarded'`

### 6. Convert to Post-Contract (Precontract Detail → "Convert to Post-Contract" button)
- `AwardConversionDialog` opens with carry-over options:
  - ☑ WBS structure (clone)
  - ☑ BOQ items → locked baseline
  - ☑ Preliminaries → locked baseline
  - ☑ Price List → locked rates
  - ☑ Risk Register → carry over
  - ☑ Contract Register → auto-create
- Click "Create & Assign"

### 7. Setup Wizard (ProjectSetupWizard - 11 steps)
- Configure calendar, WBS, numbering
- Set approval flows, budget, notifications
- Activate project (`status → 'active'`)

### 8. Post-Contract Execution
- Click project in Post-Contract tab → `PostcontractDetail` opens
  - **Overview:** KPIs (contract value, BOQ total, variations, claims, retention)
  - **Contract:** Contract Register details
  - **BOQ:** Link to QS BOQ module (locked baseline + revisions)
  - **Variations:** Link to QS Variations module
  - **Claims:** Link to QS Claims module
  - **Payments:** Link to QS Payments module
  - **Snapshot:** Tender bid summary captured at conversion

---

## Visual Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    PRE-CONTRACT PHASE                       │
│                                                             │
│  Tender Register → Management → Cost Estimation → Submissions│
│       ↓              ↓              ↓              ↓        │
│  Create Tender   Invite Bidders   Build BOQ     Receive Bids│
│                                  Price List                 │
│                                  Prelims                    │
│                                  Bid Summary                │
│                                                             │
│                         ↓                                   │
│                   Bid Evaluation                            │
│                         ↓                                   │
│                      Award                                  │
│                         ↓                                   │
│              ┌─────────────────────┐                        │
│              │ "Convert to Post-   │                        │
│              │  Contract" Button   │                        │
│              └──────────┬──────────┘                        │
└─────────────────────────┼───────────────────────────────────┘
                          ↓
┌─────────────────────────┼───────────────────────────────────┐
│              AWARD CONVERSION DIALOG                        │
│                                                             │
│  ☑ Copy WBS structure                                      │
│  ☑ Carry over BOQ items (locked baseline)                  │
│  ☑ Carry over preliminaries (locked baseline)              │
│  ☑ Carry over price list                                   │
│  ☑ Carry over risk register                                │
│  ☑ Auto-create contract register                           │
│                                                             │
│              [Create & Assign]                              │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────┼───────────────────────────────────┐
│                   POST-CONTRACT PHASE                       │
│                                                             │
│  1. New projects row created (type='awarded')               │
│     └─→ source_tender_project_id links back to tender       │
│                                                             │
│  2. Data carried over as LOCKED baseline:                   │
│     ├─→ qs_boq + qs_boq_sections + qs_boq_items (locked)   │
│     ├─→ qs_boq (preliminary type, locked)                  │
│     ├─→ qs_price_list_items                                │
│     ├─→ qs_risk_items                                      │
│     ├─→ qs_contract_snapshots (bid summary)                │
│     └─→ contract_register (auto-created)                   │
│                                                             │
│  3. ProjectSetupWizard opens (11 steps)                    │
│     └─→ Configure calendar, WBS, numbering, approvals      │
│         └─→ Activate project                               │
│                                                             │
│  4. Execution begins                                       │
│     └─→ PostcontractDetail shows KPIs and links to:        │
│         ├─→ QS BOQ (locked baseline + revisions)          │
│         ├─→ QS Variations                                  │
│         ├─→ QS Claims (IPCs)                               │
│         ├─→ QS Payments                                    │
│         └─→ Contract Register                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

| Aspect | Decision |
|--------|----------|
| **Data ownership** | Tender data stays in tender tables (historical) |
| **Carry-over** | Copied to postcontract tables, marked as `locked` baseline |
| **BOQ locking** | `baseline_status = 'locked'`, `locked_at` timestamp set |
| **Contract register** | Auto-created from `tender_award_records` during conversion |
| **Project linking** | `source_tender_project_id` FK links post-contract back to tender |
| **Two separate projects** | Tender project (`type='tender'`) + Post-contract project (`type='awarded'`) |

---

## Database Tables

### Pre-Contract Tables (Tender Data)

| Table | Purpose |
|-------|---------|
| `tender_register` | Master tender record |
| `tender_boq_items` | BOQ line items |
| `tender_price_list` | Price list rates |
| `tender_preliminaries_items` | Preliminaries items |
| `tender_bid_summaries` | Bid summary (overhead, profit, contingency, VAT) |
| `tender_risk_items` | Risk register |
| `tender_submissions` | Bidder submissions |
| `bid_evaluations` | Evaluation records |
| `bid_evaluation_scores` | Evaluation scores |
| `tender_award_records` | Award decision |
| `tender_win_loss` | Win/loss analysis |

### Post-Contract Tables (Execution Data)

| Table | Purpose |
|-------|---------|
| `projects` (type='awarded') | Post-contract project record |
| `contract_register` | Head contract + subcontracts |
| `qs_boq` | BOQ headers (main_works, preliminary, variation) |
| `qs_boq_sections` | BOQ sections |
| `qs_boq_items` | BOQ line items (locked baseline) |
| `qs_price_list_items` | Postcontract price list |
| `qs_risk_items` | Postcontract risk register |
| `qs_contract_snapshots` | Tender bid summary snapshot |
| `qs_variation_orders` | Variation orders |
| `qs_progress_claims` | Interim Payment Certificates (IPCs) |
| `qs_retention_ledger` | Retention deductions/releases |
| `qs_cost_transactions` | Cost tracking |

### Bridge Tables

| Table | Purpose |
|-------|---------|
| `project_precontract_details` | Links project to tender register |
| `projects.source_tender_project_id` | FK linking post-contract project back to tender |

---

## File Changes (This Implementation)

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260725000001_qs_contract_snapshots.sql` | Tender bid summary snapshot table |
| `supabase/migrations/20260725000002_qs_risk_items.sql` | Postcontract risk register table |
| `supabase/migrations/20260725000003_qs_price_list_items.sql` | Postcontract price list table |
| `apps/web/components/dashboard/postcontract-dashboard.tsx` | KPI dashboard for postcontract projects |
| `apps/web/components/project/projects/postcontract-detail.tsx` | Tabbed detail view (7 tabs) |

### Modified Files

| File | Changes |
|------|---------|
| `apps/web/lib/qs-service.ts` | Added 8 conversion functions + types |
| `apps/web/components/project/projects/award-conversion-dialog.tsx` | Rewritten with data carry-over options |
| `apps/web/components/project/projects/project-list-page.tsx` | Added postcontract detail click handler |

---

## Service Functions Added

| Function | Purpose |
|----------|---------|
| `carryOverBoq()` | Creates locked BOQ baseline from tender BOQ items |
| `carryOverPreliminaries()` | Creates locked preliminaries baseline |
| `carryOverPriceList()` | Copies tender price list to postcontract |
| `carryOverRisks()` | Copies tender risks to postcontract |
| `createContractSnapshot()` | Stores tender bid summary as snapshot |
| `autoCreateContractRegister()` | Creates head contract from award record |
| `getContractSnapshot()` | Fetches snapshot for dashboard |
| `getPostcontractKpis()` | Calculates postcontract KPIs |

---

*Document generated: July 25, 2026*
