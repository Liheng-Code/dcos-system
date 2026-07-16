# Implementation Plan — FS-QS-012 GFA & Cost per m²

**Feature:** FS-QS-012 — GFA, Site Area & Cost per m² Measurement and Reporting
**Guideline:** DCOS-QS-GDL-001 V1.0
**Date:** 2026-07-16
**Status:** Approved for Implementation

---

## 1. Problem Statement

The QS module needs to track **cost per m²** per floor/level for GFA benchmarking per DCOS-QS-GDL-001, but the current WBS backbone has no floor area storage, no basement flagging, no GFA rollup, and no Standard Final Cost Summary report.

## 2. What the Guideline Requires

| Requirement | Guideline Ref | Current Status |
|---|---|---|
| Store GFA in `wbs_node_quantities` (metric_code = `GFA`) | §11 line 428 | Not built |
| Store Site Area at Project node (`SITE_AREA`) | §11 line 421 | Not built |
| GFA entered per LEVEL from drawings (never derived) | §3 line 157, §11 line 415 | Not built |
| Basement levels flagged for below-ground split | §11 line 417 | Not built |
| Auto-rollup to building & project (parents read-only) | §11 line 422 | Not built |
| Revision control: reason + audit log on GFA change | §11 line 423-424 | Not built |
| Validation: warn if cost > 0 but GFA = 0 | §10 line 411 | Not built |
| Standard Final Cost Summary (5-line format) | §9 lines 334-369 | Not built |
| External works ÷ Site Area (never in building numerator) | §5 lines 198-201 | Not built |
| Split $/m² for basements | §7 lines 292-305 | Not built |
| Elemental cost/m² table (per trade ÷ GFA total) | §6 lines 250-271 | Not built |

## 3. Implementation Steps

| Step | What | Files |
|---|---|---|
| 1 | SQL migration: `wbs_node_quantities` table + `is_basement` + `gfa_at_snapshot` | NEW migration |
| 2 | TS types: add `WbsNodeQuantity`, `GfaSummary`, `CostPerSqmSummary` | `wbs-types.ts` |
| 3 | QS service: add 6 GFA/cost-m² functions | `qs-service.ts` |
| 4 | New component: quantities tab | `wbs-node-quantities-tab.tsx` (NEW) |
| 5 | WBS workspace: add quantities tab | `wbs-node-workspace.tsx` |
| 6 | WBS cost tab: add cost/m² card | `wbs-cost-tab.tsx` |
| 7 | WBS node edit: add is_basement | `wbs-node-edit-sheet.tsx` |
| 8 | QS dashboard: add KPI card | `page.tsx` |
| 9 | Seed data: school example from guideline | NEW seed file |
| 10 | FS-QS-012 spec document | NEW doc |
| 11 | DDS-001 master index update | Existing doc |

## 4. File Change Summary

| File | Action |
|---|---|
| `supabase/migrations/20260716000001_wbs_gfa_metrics.sql` | NEW |
| `apps/web/components/wbs/wbs-types.ts` | EDIT |
| `apps/web/lib/qs-service.ts` | EDIT |
| `apps/web/components/wbs/wbs-node-quantities-tab.tsx` | NEW |
| `apps/web/components/wbs/wbs-node-workspace.tsx` | EDIT |
| `apps/web/components/wbs/wbs-cost-tab.tsx` | EDIT |
| `apps/web/components/wbs/wbs-node-edit-sheet.tsx` | EDIT |
| `apps/web/app/dashboard/qs/page.tsx` | EDIT |
| `supabase/seeds/seed_gfa_school_example.sql` | NEW |
| `docs/03-Business-Modules/12-Quantity-Surveying/FS-QS-012_GFA_Cost_per_m2_Measurement.md` | NEW |
| `docs/01-Governance/02-Design/QS/DCOS-QS-DDS-001_V2_Documentation_Master_Index.md` | EDIT |

## 5. Expected Standard Final Cost Summary

| Line | Description | Cost | Denominator | $/m² |
|---|---|---|---|---|
| 1 | Building — above ground | $3,595,200 | 8,560 m² GFA | $420.00 |
| 2 | Building — basement | $722,500 | 850 m² GFA | $850.00 |
| A | Building subtotal | $4,317,700 | 9,410 m² GFA | $458.84 |
| 3 | External works | $180,000 | 4,500 m² site | $40.00 |
| B | TOTAL CONTRACT | $4,497,700 | — | — |
| memo | Whole project ÷ GFA | $4,497,700 | 9,410 m² | $477.97 |
