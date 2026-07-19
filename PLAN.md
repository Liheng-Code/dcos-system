# QS + Tender Module Roles & Permissions Plan

## Problem Statement

The QS module has 8 seeded permission actions but they're invisible in the admin UI because `"qs"` is missing from the `MODULES` array. The Tender module (Pre-Contract > Cost Estimation) has 11 tabs and zero permission enforcement. Both need to be wired into the RBAC system.

## Current State

| Module | Seeded Actions | In Admin UI | Permission Checks |
|--------|---------------|-------------|-------------------|
| `qs` | 8 actions | **No** — `"qs"` missing from `MODULES` | Yes — 27 call sites |
| `tender` | 0 actions | **No** — not in `MODULES` | **None** |

## Scope

1. Make existing QS permissions visible in admin Role & Permissions UI
2. Create full Tender module permission system

---

## Part 1: Make QS Permissions Visible

**File:** `apps/web/components/settings/role-permissions-page.tsx`

Add `{ key: "qs", label: "Quantity Surveying" }` to `MODULES` array.

---

## Part 2: Tender Module — Permission Actions (11 actions)

| Action | Tab | Description |
|--------|-----|-------------|
| `tender_register` | Register | View/create/edit tenders |
| `tender_boq` | Tender BOQ | BOQ items, import, pricing |
| `tender_price_list` | Price List | Unit rate library |
| `tender_preliminaries` | Preliminaries | Prelims items |
| `tender_bid_summary` | Bid Summary | Bid build-up, OH&P |
| `tender_cover` | Cover Page | Tender cover/scope |
| `tender_sub_quotes` | Sub Quotes | Subcontractor quotes |
| `tender_risks` | Risk Items | Risk register |
| `tender_cost_summary` | Cost Summary | Cost summary tables |
| `tender_cost_per_m2` | Cost / m² | Tender-phase rate |
| `tender_budget` | Project Budget | Budget vs estimate |

---

## Part 3: Tender Permission Seeds

SQL migration: `supabase/migrations/20260719000001_seed_tender_rbac.sql`

### Role-to-Action Matrix

| Role | tender_register | tender_boq | tender_price_list | tender_preliminaries | tender_bid_summary | tender_cover | tender_sub_quotes | tender_risks | tender_cost_summary | tender_cost_per_m2 | tender_budget |
|------|----------------|------------|-------------------|---------------------|-------------------|-------------|-------------------|-------------|-------------------|-------------------|--------------|
| L0 | V,C,E,D,S | V,C,E,D,X | V,C,E,D,X | V,C,E,D | V,C,E,S,A | V,X,T | V,C,E,D | V,C,E,D | V,X | V,X | V,E |
| L1 | V,C,E,D,S | V,C,E,D,X | V,C,E,D,X | V,C,E,D | V,C,E,S,A | V,X,T | V,C,E,D | V,C,E,D | V,X | V,X | V,E |
| L2 | V,C,E,D,S | V,C,E,D,X | V,C,E,D,X | V,C,E,D | V,C,E,S | V,X,T | V,C,E,D | V,C,E,D | V,X | V,X | V,E |
| L3 | V,C,E,S | V,C,E,X | V,C,E,X | V,C,E | V,C,E,S | V,X | V,C,E | V,C,E | V,X | V,X | V,E |
| QS | V,C,E | V,C,E,D,X | V,C,E,D,X | V,C,E | V,C,E,S | V,X | V,C,E | V,C,E | V,X | V,X | V |
| AC | V | V,X | V,X | V | V,S,A | V,X | V | V | V,X | V,X | V |
| L4 | V | V | V | V | V | V | V | V | V | V | V |
| L5 | V | V | V | V | V | V | V | V | V | V | V |
| L6 | — | — | — | — | — | — | — | — | — | — | — |
| EXT-CLT | V | V | — | — | V,S,A | V | — | V | V | V | — |
| EXT-CON | V | V | — | — | V | V | — | V | V | V | — |
| EXT-SUB | — | V | — | — | — | — | V | — | — | — | — |

---

## Part 4: Tender Permission Hook

New file: `apps/web/hooks/use-tender-permissions.ts`

Same pattern as `use-qs-permissions.ts` — loads permissions for `module="tender"`, exposes `can(action, field)`.

---

## Part 5: Admin UI — Add Both Modules

**File:** `apps/web/components/settings/role-permissions-page.tsx`

Add to `MODULES`:
- `{ key: "qs", label: "Quantity Surveying" }`
- `{ key: "tender", label: "Pre-Contract / Tendering" }`

---

## Part 6: Component Permission Checks

| Component | Check |
|-----------|-------|
| `boq-tab.tsx` | `can("tender_boq", "can_create")`, `can("tender_boq", "delete")` |
| `price-list-tab.tsx` | `can("tender_price_list", "can_create")`, `can("tender_price_list", "delete")` |
| `preliminaries-tab.tsx` | `can("tender_preliminaries", "can_create")`, `can("tender_preliminaries", "delete")` |
| `bid-summary-tab.tsx` | `can("tender_bid_summary", "can_create")`, `can("tender_bid_summary", "approve")` |
| `cover-summary-tab.tsx` | `can("tender_cover", "export")` |
| `sub-quotes-tab.tsx` | `can("tender_sub_quotes", "can_create")`, `can("tender_sub_quotes", "delete")` |
| `risks-tab.tsx` | `can("tender_risks", "can_create")`, `can("tender_risks", "delete")` |
| `cost-summary-tab.tsx` | `can("tender_cost_summary", "view")` |
| `project-budget-tab.tsx` | `can("tender_budget", "edit")` |
| `page.tsx` (tab router) | Filter tabs by `can(action, "view")` |

---

## Execution Order

1. Save plan ✅
2. Create SQL migration
3. Add modules to admin UI
4. Create use-tender-permissions.ts hook
5. Add permission checks to tender components
6. Update tab router
7. Run typecheck
