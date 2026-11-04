# Tender BOQ: Alternate Rates

**Module:** Quantity Surveying (qs) · **Status:** Built 2026-10-22 (branch `feat/qs-boq-alternates`)
**Migration:** `supabase/migrations/20261022101055_qs_boq_item_alternates.sql`

## 1. Purpose

A tender BOQ line can carry one or more priced alternatives (a different material, spec or brand) beside its base rate. The base rate stays the only figure in the tender price; alternates are a memo the estimator (or client) can compare, and any one can be promoted to become the base.

## 2. Rules

| # | Rule |
|---|---|
| ALT-1 | Alternates are **memo only**. Direct Works, the tender total, bid summary revisions and $/m² read `tender_boq_items` only and never include alternates. |
| ALT-2 | An alternate uses its parent line's **quantity and unit**. Alt amount = parent quantity × alternate unit rate. |
| ALT-3 | Alternate unit rate = labour net × (1 + labour margin %) + material net × (1 + material margin %), rounded to 2 dp **in the database** (same build-up as the base line). |
| ALT-4 | Each alternate shows **Δ vs base** = alt amount − base amount: positive = *Add*, negative = *Omit*. |
| ALT-5 | The BOQ tab summary groups alternates by Alt number (Alt 1, Alt 2 …): number of lines, alternate value, and Δ vs base. It follows the active filters and is labelled "not in tender total". Alternates on one line are mutually exclusive, so a single gross sum of all alternates is never shown as a price. |
| ALT-6 | **Make base rate** is an atomic swap: the alternate's description, notes, rate build-up, unit rate and provenance (rate source, DWL work item / assembly, price list item, cost DB item, rate snapshot, brand, supplier, material type) become the base line, and the old base is kept as that alternate. Item code, section, WBS, unit and quantity stay on the base line. Swapping twice restores the original. |
| ALT-7 | A swap changes Direct Works. Existing bid summary revisions are snapshots and are **not** changed; the UI warns that the latest revision is out of date. |
| ALT-8 | The tender price lock (`tender_lock_guard`) applies: no add, edit, delete or swap while the tender is in internal review, approval or submitted. |
| ALT-9 | Editing an alternate's net cost tags it `rate_source = 'manual'` (as SOP-QS-003 BR1 for base lines). A description- or notes-only edit keeps a swapped-in library rate verbatim. |

## 3. Data model

`public.tender_boq_item_alternates`

| Column | Notes |
|---|---|
| `id`, `tender_id`, `boq_item_id` | `tender_id` is set from the parent by trigger; cascade delete with the line or tender. |
| `alt_no` | 1, 2, … unique per line. |
| `description`, `notes` | |
| `labor_net_cost`, `labor_margin_pct`, `material_net_cost`, `material_margin_pct` | Rate build-up. |
| `unit_rate` | Computed by trigger unless `is_manual_rate` (set after a swap so the swapped-in rate is kept verbatim). |
| `rate_source`, `dwl_work_item_id`, `dwl_assembly_id`, `price_list_item_id`, `source_cost_db_item_id`, `rate_build_up`, `brand`, `supplier`, `material_type` | Provenance, carried through a swap. |

RPC: `tender_boq_promote_alternate(p_alternate_id uuid) returns uuid` (security invoker). Changes are audited by `qs_audit_trigger_fn` into `qs_audit_log` (full old/new rows for both tables).

## 4. UI (Tender → Cost Estimation → BOQ tab, Flat and Detail views)

- Line with alternates: violet **Alt n** badge and chevron; expanded sub-rows show Alt number, description, rates, alt amount and Δ vs base.
- Actions: *Add alternate* per line; *Make base rate*, edit and delete per alternate. Hidden when the tender is locked.
- Add/edit dialog shows the parent line read-only and a live preview of alt rate, amount and Δ.
- *Make base rate* confirms the rate change and the Direct Works change before swapping.

## 5. Code

- `apps/web/lib/qs/boq-alternates.ts`: pure helpers (amount, Δ, summary by Alt number), tested in `lib/qs/__tests__/boq-alternates.test.ts`.
- `apps/web/lib/qs/tender-cost-service.ts`: `getBoqAlternates`, `createBoqAlternate`, `updateBoqAlternate`, `deleteBoqAlternate`, `promoteBoqAlternate`.
- `apps/web/components/qs/tenders/cost-estimation/`: `boq-tab.tsx`, `boq-alternate-dialog.tsx`, `boq-alternate-rows.tsx`.

## 6. Not yet in scope

Alternates on the bid summary, client-facing BOQ exports, and accepting a set of alternates together (e.g. "take Alt 1 across all lines").
