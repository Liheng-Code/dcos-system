# Preliminaries Cost Library — Design Specification

**Document:** DCOS-DS-12-003  
**Status:** Draft  
**Date:** 2026-07-18

---

## 1. Overview

Transform the Excel-based prelim cost build-up into a reusable, parameter-driven library inside DCOS. Users set **project parameters** (site area, storeys, workforce, duration, etc.), and the system **auto-calculates** all Z-code prelim items with full component-level build-ups.

### Goals
- Replace manual Excel prelim calculations with a system-driven approach
- Reuse the same cost library across all tenders/projects
- Allow per-project parameter adjustments (site size, duration, workforce)
- Provide full transparency with component-level drill-down
- Auto-populate `tender_preliminaries_items` from the library

---

## 2. Database Schema

### 2.1 `prelim_library_items` — Master line items

Reusable across all projects. Stores the Z-code hierarchy with calculation modes.

```sql
CREATE TABLE public.prelim_library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_code TEXT,                          -- NULL = top-level section (Z.01, Z.30, Z.50, Z.70)
  code TEXT NOT NULL UNIQUE,                 -- Z.01.05.01
  description TEXT NOT NULL,                 -- "Tower crane rental"
  unit TEXT NOT NULL DEFAULT 'Item',         -- Item / Month / m2 / Floor / Lot / Sum
  calc_mode TEXT NOT NULL DEFAULT 'fixed'    -- fixed | param | sum_children
    CHECK (calc_mode IN ('fixed', 'param', 'sum_children')),
  default_qty NUMERIC(15,2) DEFAULT 1,      -- Fallback qty when no formula
  formula TEXT,                              -- Expression referencing P01-P12, e.g. "P06"
  sort_order INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'temporary_works'
    CHECK (category IN ('temporary_works', 'staff', 'design', 'risk')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.2 `prelim_library_components` — Component-level build-ups

Each line item can have multiple components (sub-items) that sum to the item's rate.

```sql
CREATE TABLE public.prelim_library_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.prelim_library_items(id) ON DELETE CASCADE,
  description TEXT NOT NULL,                 -- "Tower crane rental"
  qty_formula TEXT NOT NULL DEFAULT '1',     -- Expression: "1", "80", "P09", "(P06/50)"
  unit TEXT NOT NULL DEFAULT 'no',           -- no / worker / m2 / mo / lot / trip / man-day
  rate NUMERIC(15,2) NOT NULL DEFAULT 0,     -- Unit cost in USD
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.3 `tender_prelim_settings` — Per-project parameter overrides

Each tender gets its own Site Data parameters. Defaults come from the library constants.

```sql
CREATE TABLE public.tender_prelim_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id UUID NOT NULL UNIQUE REFERENCES public.tender_register(id) ON DELETE CASCADE,
  params JSONB NOT NULL DEFAULT '{}',        -- {"P01": 130, "P02": 800, ...}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.4 RLS Policies

All three tables get full CRUD policies for authenticated users (matching existing tender tables pattern).

---

## 3. Site Data Parameters

Default values from the Excel (P01-P12):

| Ref | Parameter | Default | Unit | Formula Derivatives |
|---|---|---|---|---|
| P01 | Site perimeter (hoarding line) | 130 | m | |
| P02 | Building footprint | 800 | m2 | |
| P03 | Building perimeter | 115 | m | |
| P04 | Storeys above ground | 10 | no | |
| P05 | Building height | 36 | m | |
| P06 | Facade area (P03 × P05) | 4140 | m2 | = P03 * P05 |
| P07 | Programme duration | 18 | months | |
| P08 | Structure phase duration | 10 | months | |
| P09 | Scaffold rental duration | 12 | months | |
| P10 | Peak workforce | 80 | no | |
| P11 | Floors incl. roof (edge protection) | 11 | no | |
| P12 | Gross floor area (P02 × P04) | 8000 | m2 | = P02 * P04 |

---

## 4. Calculation Engine

A pure TypeScript function that evaluates the library against a parameter set.

### Algorithm

1. **Resolve parameters** — merge defaults with project overrides, compute derived values (P06 = P03 × P05, P12 = P02 × P04)
2. **For each library item:**
   - If `calc_mode = "fixed"` → qty = `default_qty`
   - If `calc_mode = "param"` → evaluate `formula` with params → qty = result
   - If `calc_mode = "sum_children"` → qty = sum of child items' amounts
3. **For each component of the item:**
   - Evaluate `qty_formula` with params → component qty
   - component_amount = qty × rate
4. **Item rate** = sum of all component amounts
5. **Item amount** = qty × rate
6. **Return** the full tree with subtotals per section

### Formula Evaluation

Simple safe expression evaluator supporting:
- Parameter references: `P01`, `P02`, ..., `P12`
- Arithmetic: `+`, `-`, `*`, `/`
- Parentheses
- Numeric literals

No external formula library needed — a basic recursive descent parser (~50 lines).

---

## 5. UI Design

### 5.1 Route

`/dashboard/tenders/cost-library` — new page under Tender module

### 5.2 Layout

```
┌─────────────────────────────────────────────────────┐
│  Preliminaries Cost Library                         │
│  Reusable build-up templates for Z-code prelims     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Site Data Panel]  [Calculated Tree]  [Item Editor]│
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.3 Site Data Panel (left or top)

- 12 parameter inputs with labels, values, units
- "TO VERIFY" badges on items needing drawing confirmation
- "Apply & Recalculate" button
- Derived values shown as calculated (grayed, not editable)

### 5.4 Calculated Tree (main content)

- Collapsible tree grouped by Z.01, Z.30, Z.50, Z.70
- Each row: code, description, unit, qty, rate ($), amount ($)
- Section subtotals
- Grand total at bottom
- Click any row → opens Item Editor panel
- "Apply to Tender" button (when accessed from a tender context)

### 5.5 Item Editor (right panel or modal)

- Shows code, description, unit, qty formula
- Component table: description, qty, unit, rate, amount
- Add/edit/delete components
- Live rate recalculation

### 5.6 Apply to Tender Dialog

- Select target tender
- Preview: shows what will be inserted/updated
- "Replace all" vs "Merge (update existing codes)" option
- Confirm → bulk-insert into `tender_preliminaries_items`

---

## 6. Integration Points

### 6.1 Existing Preliminaries Tab

Add a **"Load from Cost Library"** button to `preliminaries-tab.tsx` that:
1. Opens the library view with the tender's parameters
2. User reviews/adjusts
3. Confirm → inserts calculated items into `tender_preliminaries_items`

### 6.2 Sidebar Navigation

Add nav item: "Cost Library" under Quantity Surveying > Tender & Estimate

### 6.3 Bid Summary

No changes needed — `recalculateBidSummaryFromBoq()` already sums `tender_preliminaries_items.amount` into `tender_bid_summaries.preliminaries`.

---

## 7. Files to Create/Modify

| # | File | Action | Phase |
|---|---|---|---|
| 1 | `supabase/migrations/20260718000001_prelim_cost_library.sql` | New | 1 |
| 2 | `supabase/migrations/20260718000002_prelim_library_seed.sql` | New | 1 |
| 3 | `apps/web/lib/prelim-library-service.ts` | New | 1 |
| 4 | `apps/web/components/qs/tenders/cost-library/site-data-panel.tsx` | New | 2 |
| 5 | `apps/web/components/qs/tenders/cost-library/prelim-tree.tsx` | New | 2 |
| 6 | `apps/web/app/dashboard/tenders/cost-library/page.tsx` | New | 2 |
| 7 | `apps/web/components/qs/tenders/cost-library/item-editor.tsx` | New | 3 |
| 8 | `apps/web/components/qs/tenders/cost-library/apply-dialog.tsx` | New | 3 |
| 9 | `apps/web/components/qs/tenders/cost-estimation/preliminaries-tab.tsx` | Modify | 4 |
| 10 | `apps/web/components/dashboard/sidebar.tsx` | Modify | 4 |

---

## 8. Implementation Phases

| Phase | Scope | Deliverables |
|---|---|---|
| **Phase 1** | DB schema + seed data + service + calculation engine | Backend complete |
| **Phase 2** | Library page with Site Data panel + calculated tree | Main UI visible |
| **Phase 3** | Item editor + component drill-down + apply to tender | Full workflow |
| **Phase 4** | Integration with existing preliminaries tab + sidebar | Production-ready |
