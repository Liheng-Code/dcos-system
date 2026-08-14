# SOP Addendum — Direct Works Cost Library ↔ Tender BOQ Integration

| Document Control | |
|---|---|
| Document Title | Direct Works Cost Library ↔ Tender BOQ Integration (Library-Driven BOQ Pricing) |
| Document No. | QS-SOP-003 |
| Version | 0.3 — All open human-decision items resolved; ready for Phase 9 build (see Revision Log below) |
| Owner | QS Manager |
| Applies To | DCOS System (Supabase/PostgreSQL) — `tender_boq_items`, `dwl_*` |
| Status | **Ready for Build** — `commercial-qs` reviewed (v0.2), remaining OQ-7/7a and OQ-8 decided by user/QS Manager on 2026-07-21 (v0.3). No open human-decision items remain (see Hand-off Checklist). |
| Relationship to Other SOPs | Addendum to `07-SOP_Direct_Works_Cost_Library_Module.md` (QS-SOP-002). QS-SOP-002 built the library and repointed the FK (§12, §12.1 Phase 6b). This document closes the gap that Phase 6b left open: **the FK points the right way, but no UI ever populates it from the library.** Does not touch, and explicitly defers, QS-SOP-002 §12.1 step 8 (`qs_boq_items.cost_item_id` / `boq-builder.tsx`) — see §2. |

Design authority: DCOS System Architect. This document is a design pack, not code. No table, view, or component listed here has been created or modified by this document — all SQL and TSX shown is illustrative of intent for `database-engineer` / `frontend-engineer` / `backend-engineer` to build from, and is written to be unambiguous, not to be copy-pasted verbatim without their own review.

### Revision Log

- **v0.3 (this revision) — ready for build.** The two items left open after `commercial-qs` review (OQ-7/7a, OQ-8) were decided by the user/QS Manager on 2026-07-21 and are now closed as resolved decisions, not open questions:
  1. **OQ-7/OQ-7a resolved** — BR9's pick-time guardrail threshold is confirmed at **10%** (not 20%, not left unset). The discipline-scoped third-bucket alternative (§6.4 Response 2) is **explicitly rejected** for this build — not silently deferred — recorded as "considered, rejected; revisit only if BR9's real-usage warning-firing rate shows the 2-bucket model is genuinely inadequate for a specific discipline." §6.3, §6.4, and BR9 updated accordingly.
  2. **OQ-8 resolved** — `tender_provisional_sums`/`tender_dayworks` integration with the DWL library is **explicitly out of scope** for QS-SOP-003, to be scoped as its own separate follow-up SOP/ticket. Recorded as a closed, deferred decision, not a silently dropped one.
  3. Hand-off Checklist updated — all human-decision items now checked off; document status moved to **Ready for Build**.
- **v0.2** — `commercial-qs` review of v0.1 returned pass-with-guardrails: two rework items and one guardrail recommendation, all incorporated here.
  1. **§7.3 step 4 corrected** — it previously claimed Refresh recomputes `unit_rate` "exactly as `updateBoqItem()` already does." Factually wrong: `updateBoqItem()` does not recompute `unit_rate` (plain passthrough there) and has zero UI call sites today. §7.3 step 4 now specifies that the Refresh implementation must compute `unit_rate` itself, explicitly, using `createBoqItem()`'s formula.
  2. **BR1 narrowed** — was triggering `rate_source → 'manual'` on *any* of the four rate fields, including margin-only edits, which directly contradicted BR2's claim that provenance (and therefore Refresh) survives a routine tweak, since §6.2 expects a margin edit on nearly every library pick. BR1 now triggers only on `labor_net_cost`/`material_net_cost` edits; BR2 updated to match.
  3. **§6.3/§6.4 guardrail added** — the real seeded work item (`03.02.010`) is already at 15.2% equipment+subcon share of its `net_direct_rate`, close to the 20% quarterly-review trigger, and a quarterly health check is too slow for a bid that closes in days. Added a pick-time warning (§6.4, BR9) with a proposed (not finalized) ~10% threshold, plus a recorded alternative (discipline-scoped third bucket) — see OQ-7/7a.
  4. **BR7 extended** — the refresh confirmation dialog now also shows the resulting `unit_rate` before/after at the row's current margins, not just the `net_direct_rate` delta.
  5. Folded in three lower-priority review notes: badge visual-weight guidance (§7, after BR6), a new Open Question on `tender_provisional_sums`/`tender_dayworks` (OQ-8), and a rounding-precision QA flag on BR3 at Assembly scale (OQ-9).
- **v0.1** — initial draft, System Architect.

---

## 1. Purpose

Verified directly against the live migration history and the live component code (not assumed) on 2026-07-21:

- `tender_boq_items.unit_rate_id` now has a live FK to `dwl_work_items(id)` (`20260721000001_repoint_tender_boq_items_unit_rate_id.sql`).
- `tender_boq_items.dwl_work_item_id` is a **second**, separately-added FK to the **same table** (`20260720000016_dwl_phase6_shadow_columns.sql`) — see §3.3 for why this is a problem this document must resolve, not inherit silently.
- `boq-tab.tsx` (the only UI that writes `tender_boq_items` today) never sets either column. Every row is either hand-typed or comes from `tender-cost-import-dialog.tsx`'s spreadsheet import, which populates `price_list_item_id` (→ `tender_price_list`, a **different, still-live** table — not `dwl_*`) or leaves the row fully manual.
- Net effect: the DWL module (5 screens, 4-level recipe cascade, append-only pricing) is fully built and has zero influence on any BOQ actually produced in the tender module. The FK repoint was necessary but not sufficient.

This document designs the missing link: a **library picker** that lets an estimator search the DWL library and create a `tender_boq_items` row from a Work Item or Assembly, with the resource-level rate build-up **frozen into the row at the moment of picking**, and a manual **staleness / refresh** mechanism so a priced line never moves silently.

---

## 2. Scope

| In Scope | Out of Scope |
|---|---|
| Shared library-picker component (Work Items + Assemblies, from `dwl_v_work_item_rates` + `dwl_v_assembly_rates`) | `qs_boq_items` / `qs_cost_items` / `boq-builder.tsx` repoint (QS-SOP-002 §12.1 step 8 — separate, still-open decision; explicitly NOT decided here) |
| New `tender_boq_items` columns needed to support an Assembly pick (none exist today — verified, see §4.1) | Any change to `qs_cost_items`, `company_rate_library`, `tender_unit_rates`, or the other frozen legacy tables (QS-SOP-002 §12.1 step 9 already closed those) |
| `rate_build_up jsonb` snapshot shape | Formal multi-step approval workflow on `tender_boq_items` (no `status` column exists on this table today — confirmed; see §7.5) |
| Staleness detection + manual "Refresh from Library" | Auto-refresh / auto-repricing of any kind — explicitly rejected, matches the append-only philosophy already established for `dwl_resource_prices` |
| Margin/markup interaction between a blended library rate and the existing `labor_margin_pct`/`material_margin_pct` fields | A new margin bucket structure (three-way labor/material/plant split) product-wide — considered and deferred for MVP, see §6.3 |
| Pick-time margin-basis guardrail (equipment+subcon share of `net_direct_rate`) — §6.4, BR9 | A third cost bucket scoped product-wide — deferred, see §6.3/OQ-7 (discipline-scoped alternative recorded, not selected) |
| RLS/permission read-through from the tender module into `dwl_v_*` views | Any change to `dwl_*` table RLS itself (already fixed correctly in `20260720000017_fix_dwl_tenant_isolation.sql`) |
| `tender-cost-import-dialog.tsx` spreadsheet path — left as-is, untouched, coexisting fallback | Bulk "refresh all stale lines" action — deferred to a later phase, see §9 |

---

## 3. Current State (verified, not assumed)

### 3.1 `boq-tab.tsx` today
100% manual entry (`labor_net_cost`/`labor_margin_pct`/`material_net_cost`/`material_margin_pct` typed into a form) or spreadsheet import via `tender-cost-import-dialog.tsx`. No reference anywhere in the component to `unit_rate_id`, `dwl_work_item_id`, or any `dwl_*` table/view.

### 3.2 `tender_boq_items` actual columns (read from all three migrations that touch it, not inferred)

| Migration | Columns added |
|---|---|
| `20260531000055_tender_cost_estimation.sql` (base table) | `id, tender_id, section, item_code, description, unit, quantity, unit_rate, total_amount (generated), rate_build_up jsonb, wbs_node_id, sort_order, created_at`. RLS: `using (true)` for all of select/insert/update, to `authenticated` — the same permissive GAP-01 pattern QS-SOP-002 §7 Step 1.1a explicitly said not to repeat in `dwl_*`. **No `tenant_id` column exists on this table at all.** |
| `20260711000006_tender_boq_items_qs_extension.sql` | `discipline, budget_code_id, building_code, level, sub_section, sub_element, material_type, element_group, element_id, brand, supplier, package_name, actual_quantity, labor_net_cost, labor_margin_pct, material_net_cost, material_margin_pct, price_list_item_id (→ tender_price_list), rate_source ('manual'\|'price_list'), notes` |
| `20260720000016_dwl_phase6_shadow_columns.sql` | `dwl_work_item_id uuid references dwl_work_items(id)` (nullable, backfilled for the 9 pre-existing rows) |
| `20260721000001_repoint_tender_boq_items_unit_rate_id.sql` | Retargeted the *existing* `unit_rate_id` column's FK from `tender_unit_rates(id)` to `dwl_work_items(id)`; added `legacy_tender_unit_rate_id uuid` (plain, not foreign-keyed, historical marker only) |

**No `dwl_assembly_id` or any assembly-referencing column exists anywhere on `tender_boq_items`.** The task brief's suspicion was correct — a new column is required to support picking an Assembly. See §4.1.

### 3.3 A pre-existing redundancy this design must not extend blindly

After the two most recent migrations, **`unit_rate_id` and `dwl_work_item_id` both point to `dwl_work_items(id)`** — two differently-named columns doing the same job. This wasn't proposed in the task brief; it fell out of the cutover sequence (`dwl_work_item_id` was added as a shadow/staging column in Phase 6b before the `unit_rate_id` repoint, and was never retired once `unit_rate_id` itself started pointing at the same target). This is flagged as an **Open Question (§12, OQ-1)** — this design does not resolve it unilaterally, but it does pick a stance for anything newly built: **`dwl_work_item_id` is the semantically-correct, forward-looking column; `unit_rate_id` is legacy-named and should not be relied on for new logic.** New code writes both (to avoid breaking whatever still reads `unit_rate_id` via PostgREST embedded-relationship queries) until the redundancy is formally resolved.

### 3.4 `dwl_v_work_item_explosion` — exact columns (read from `20260720000006_dwl_phase2_work_items.sql`, matches SOP §8 Step 2.2 exactly)

```
work_item_code, sort_order, resource_code, resource_desc, resource_unit,
consumption, waste_pct, unit_price, line_cost, source_type, is_expired, basis_note
```

Two gaps relative to what this integration needs, both confirmed by reading the view definition directly:

1. **No `work_item_id`** — only `work_item_code` (text). Every existing consumer (`dwl-work-items-list-page.tsx`) already works around this by querying `.eq("work_item_code", workItem.code)`. A picker that resolves an Assembly's constituent work items by `dwl_assembly_items.work_item_id` (uuid) would need an extra join back to `dwl_work_items.code` just to query the explosion view — workable, but fragile and an extra round trip per constituent.
2. **No `resource_category`** — `dwl_resources.category` (`material`/`labor`/`equipment`/`subcon`) is not exposed by the view at all, even though it's the one thing needed to bucket a blended rate into the two cost buckets `tender_boq_items` actually has (§6).

Both are additive, non-breaking view changes (new selected columns, same joins, same grouping). **Required before Phase 3 (§9) can be built** — see §4.2.

### 3.5 Permissions — how `boq-tab.tsx` and `dwl-*` pages differ today

`use-tender-permissions.ts` and `use-qs-permissions.ts` are structurally identical — both call the same `getUserPermissions(supabase, user.id, moduleKey)` / `hasPermission(...)` helpers, differing only in the module key string (`"tender"` vs `"qs"`). `boq-tab.tsx` gates its buttons with `can("tender_boq", "can_create")` / `can("tender_boq", "delete")`. There is no cross-module permission conflict to design around — see §8.

---

## 4. Data Model

### 4.1 New / changed columns on `tender_boq_items`

```sql
-- New: assembly linkage (does not exist today — verified §3.2)
alter table public.tender_boq_items
  add column if not exists dwl_assembly_id uuid references public.dwl_assemblies(id);

create index if not exists idx_tender_boq_items_dwl_assembly
  on public.tender_boq_items(dwl_assembly_id);

-- A BOQ line is priced from at most ONE library source: a Work Item OR an
-- Assembly, never both. (Manual/price_list rows have neither set.)
alter table public.tender_boq_items
  add constraint tender_boq_items_one_library_source_chk
  check (dwl_work_item_id is null or dwl_assembly_id is null);

-- rate_source gains two new values; existing 'manual' / 'price_list' rows
-- and behavior are completely untouched.
alter table public.tender_boq_items drop constraint if exists tender_boq_items_rate_source_check;
alter table public.tender_boq_items
  add constraint tender_boq_items_rate_source_check
  check (rate_source in ('manual', 'price_list', 'dwl_work_item', 'dwl_assembly'));
```

`legacy_tender_unit_rate_id` (added 2026-07-21) and `unit_rate_id` are left exactly as-is — this document does not touch the Phase 6b repoint.

**BR1** — A BOQ line's `rate_source` is `'dwl_work_item'` or `'dwl_assembly'` if and only if it was created (or last refreshed, §7) from the picker and has not since had its **net cost** fields hand-edited. Only editing `labor_net_cost` or `material_net_cost` flips `rate_source` back to `'manual'`. **Editing `labor_margin_pct`/`material_margin_pct` alone does NOT flip `rate_source`.**

*Correction (commercial-qs review, v0.2):* this is deliberately narrower than the `changesRate` condition as currently written in `updateBoqItem()` (`tender-cost-service.ts`), which trips on *any* of the four rate fields, margins included. Since §6.2 requires the estimator to type a margin on essentially every library pick (margins default to `0`), triggering `rate_source → 'manual'` on a margin-only edit would silently strip the Refresh affordance (§7.3, gated on `rate_source`) from almost every library-sourced line the moment the estimator does the one mandatory, expected action in the workflow — directly contradicting BR2's claim that provenance survives a routine tweak. That contradiction was present in v0.1 and is closed here. Build note: `updateBoqItem()` has zero call sites in the UI today (confirmed) — this narrowed condition is new behavior to implement for the two new source values, not an existing proven path being extended verbatim.

**BR2** — `dwl_work_item_id` and `dwl_assembly_id` are set once, at pick time, and are **not** cleared by any subsequent edit — a net-cost override or a margin-only edit alike (BR1 only resets `rate_source`, and only on a net-cost edit, never the FK) — so "this line was originally sourced from Assembly X, but has since been hand-edited" remains answerable from the row itself. This is deliberate: it preserves provenance for the Refresh action (§7) to still work after a manual net-cost tweak — and, per BR1, Refresh remains available after a margin-only edit too, which is the common case — and for reporting ("how many BOQ items ever touched the library, even if since edited").

### 4.2 Required additive changes to `dwl_v_work_item_explosion`

```sql
create or replace view public.dwl_v_work_item_explosion
with (security_invoker = true)
as
select
  wi.id as work_item_id,            -- NEW
  wi.code as work_item_code,
  wir.sort_order,
  r.code as resource_code,
  r.description as resource_desc,
  r.unit as resource_unit,
  r.category as resource_category,  -- NEW
  wir.consumption,
  wir.waste_pct,
  cp.unit_price,
  round(wir.consumption * (1 + wir.waste_pct) * cp.unit_price, 4) as line_cost,
  cp.source_type,
  cp.is_expired,
  wir.basis_note
from public.dwl_work_items wi
join public.dwl_work_item_resources wir on wir.work_item_id = wi.id
join public.dwl_resources r on r.id = wir.resource_id
join public.dwl_v_current_prices cp on cp.resource_id = wir.resource_id
order by wi.code, wir.sort_order;
```

Purely additive (2 new selected columns, identical joins/grouping/ordering) — does not change any existing consumer's output, including `dwl-work-items-list-page.tsx`'s current `.select("work_item_code, sort_order, ...")` (an explicit column list, unaffected by new columns being available). This is a required dependency for §6 — flag to `database-engineer` before Phase 3 (§9) starts.

### 4.3 `rate_build_up jsonb` — exact shape

Matches `dwl_v_work_item_explosion`'s actual returned columns (post-§4.2) plus the aggregation needed for an Assembly pick and the category bucketing needed for §6. One shape serves both a Work Item pick (single component) and an Assembly pick (multiple components, each scaled by its `qty_per_unit` design ratio):

```jsonc
{
  "source": "dwl_work_item",          // or "dwl_assembly"
  "source_id": "uuid",                 // dwl_work_items.id or dwl_assemblies.id
  "source_code": "03.02.010",          // or "ASM-WALL-010"
  "snapshot_at": "2026-07-21T09:14:00Z",
  "snapshot_net_direct_rate": 88.42,   // dwl_v_work_item_rates / dwl_v_assembly_rates .net_direct_rate at pick time, per unit of the picked item
  "labor_net_cost": 12.10,             // sum of lines where resource_category = 'labor'
  "material_net_cost": 76.32,          // sum of lines where resource_category in ('material','equipment','subcon') — see BR5
  "lines": [
    {
      "work_item_code": "03.02.010",   // the constituent work item this line came from (= source_code itself for a direct Work Item pick)
      "qty_per_unit": 1.0,             // dwl_assembly_items.qty_per_unit; 1.0 for a direct Work Item pick
      "resource_code": "M-CON-001",
      "resource_desc": "Ready-mix concrete C30, slump 10±2cm",
      "resource_unit": "m3",
      "resource_category": "material",
      "consumption": 1.0,
      "waste_pct": 0.03,
      "unit_price": 62.00,
      "line_cost": 63.86,              // per unit of the constituent work item (dwl_v_work_item_explosion.line_cost, unscaled)
      "extended_cost": 63.86,          // line_cost * qty_per_unit — per unit of the item actually picked
      "source_type": "quotation",
      "is_expired": false,
      "basis_note": "Spillage + column over-pour, site records"
    }
  ]
}
```

**BR3** — `sum(lines[].extended_cost)` must equal `snapshot_net_direct_rate` within rounding tolerance (±0.01) at the moment of snapshot — this is the same reconciliation check `dwl-work-items-list-page.tsx` already performs client-side for the library screen itself (`Math.abs(lineSum - rate.net_direct_rate) < 0.01`); reuse that exact tolerance and comparison pattern here rather than inventing a new one.

*QA flag (added per `commercial-qs` review, v0.2):* `dwl_v_work_item_explosion.line_cost` rounds to 4dp per line (`round(..., 4)` in the view SQL), while `dwl_v_work_item_rates.net_direct_rate` sums the **unrounded** per-line expression (confirmed from the view definition — the `round(...)` only wraps the exposed `line_cost` column, not the header view's `sum(...)`). This is a non-issue on the single seeded 7-line work item. It has **not** been validated against a real multi-constituent Assembly (30–40+ lines across several work items), where per-line rounding accumulation could plausibly exceed ±0.01. Re-validate BR3's tolerance against a real Assembly before sign-off — see OQ-9.

**BR4** — The snapshot is written once at pick time and again (wholesale replacement, not merge) at Refresh time (§7). It is never partially patched.

---

## 5. Building the snapshot — Work Item vs Assembly

**Work Item pick:** one query to `dwl_v_work_item_explosion where work_item_id = :id` (post-§4.2; today would have to be `work_item_code`, functionally identical for this one case) produces the `lines[]` directly, `qty_per_unit = 1.0` for all of them, `source_code`/`source_id` = the work item's own code/id.

**Assembly pick:** two-step —
1. `dwl_assembly_items where assembly_id = :id` → list of `(work_item_id, qty_per_unit, basis_note)`.
2. For each constituent, `dwl_v_work_item_explosion where work_item_id = <that id>` → its lines, each multiplied by that constituent's `qty_per_unit` into `extended_cost`.

Concatenate all constituents' lines into one flat `lines[]` array (§4.3 shape already carries `work_item_code` per line specifically so a multi-component assembly snapshot remains traceable back to which constituent produced which line — this is not optional, it's the "why is this the rate" audit value the DWL module exists for, per QS-SOP-002 §13 Phase 7 screen #2).

**BR5** — Category bucketing rule (also see §6): `equipment` and `subcon` resource lines fold into `material_net_cost`, not a separate bucket, because `tender_boq_items` only has two cost buckets today (`labor_net_cost`/`material_net_cost`) — see §6.3 for why a third bucket was considered and rejected for MVP.

---

## 6. Margin / Markup Interaction — the decision the task brief flagged as needing one

### 6.1 The tension

`dwl_v_work_item_rates.net_direct_rate` / `dwl_v_assembly_rates.net_direct_rate` are single blended numbers — by design, per QS-SOP-002's own definition of "Net Direct Rate" (§3: "no overhead, no profit; markups applied at project level only"). `boq-tab.tsx`'s manual-entry form and `createBoqItem()`'s actual rate math have **two** separate buckets with **two** separate margins:

```
labor_rate    = labor_net_cost    * (1 + labor_margin_pct / 100)
material_rate = material_net_cost * (1 + material_margin_pct / 100)
unit_rate     = labor_rate + material_rate
```

(read directly from `tender-cost-service.ts`'s `createBoqItem()` — not inferred). A single blended library rate does not map onto two independently-marked-up buckets without a rule.

### 6.2 Decision: bucket by `dwl_resources.category` at snapshot time, reuse the existing two-bucket math unchanged

- `resource_category = 'labor'` → its `extended_cost` sums into `labor_net_cost`.
- `resource_category in ('material', 'equipment', 'subcon')` → sums into `material_net_cost`.
- The existing `labor_margin_pct` / `material_margin_pct` fields, and the existing `unit_rate = labor_rate + material_rate` formula, are **completely unchanged**. A library-picked line behaves exactly like a manual line from the moment it's created — same computation, same edit form, same `updateBoqItem()` path. Margins default to `0` on first pick (estimator types the intended margin exactly as they do today for a manual line — picking from the library only changes *where the net cost numbers came from*, never bypasses the margin step).

This is the smallest change that (a) reuses 100% of the existing, already-shipped rate computation and UI, (b) requires zero change to `createBoqItem`/`updateBoqItem`'s method signatures beyond passing through the new fields, and (c) preserves the labor/material cost transparency the DWL module was built to provide.

### 6.3 Alternatives considered and rejected

**Rejected A — single blended margin field, `unit_rate = net_direct_rate * (1 + margin_pct/100)`.** Bypasses the labor/material split entirely. Would require `boq-tab.tsx` to branch its entire rate-entry UI and `createBoqItem`/`updateBoqItem` to support two mutually exclusive computation modes (typed two-bucket vs blended-margin). Throws away exactly the per-resource cost transparency (`rate_build_up`) this whole integration is meant to surface. Rejected.

**Rejected B for MVP (see §6.4 for the guardrail added instead of relying on this alone) — a third cost bucket** (`plant_net_cost`/`plant_margin_pct`) mirroring `dwl_resources`'s four categories more precisely (material / labor / equipment / subcon → three buckets: labor / material / plant+subcon). More accurate, but touches the manual-entry form, `createBoqItem`, `updateBoqItem`, `bulkInsertBoqItems`, and every other tab that shares this rate model (`price-list-tab.tsx`, `dayworks-tab.tsx`) for a benefit that only matters if equipment/subcon lines are a large enough share of real recipes to distort the labor/material split.

*Correction (commercial-qs review, v0.2):* the evidence is not as reassuring as v0.1 stated. A hand-computed check of the actual seeded reference work item (`03.02.010`, using real `dwl_v_work_item_explosion` data) shows equipment (`E-PMP-001`) + subcon (`S-TST-001`) together are already **15.2% of its real `net_direct_rate` (99.34 total)** — close to the 20% quarterly-review trigger below, on the *only* real data point in the library today, not "both small relative to the concrete material line" as v0.1 characterized it. Subcontract cost conventionally carries a materially lower margin than materials in real QS practice (5–10% vs 10–18%+), and for subcontract-heavy trades (MEP, façade), a work item can be 90–100% subcontract — meaning `material_net_cost` for those items effectively **is** the subcontract sum, and applying `material_margin_pct` to it is not a rounding nuance, it is the wrong margin basis on the majority of the rate. **Relying solely on a quarterly lagging-indicator health check (QS-SOP-002 §14) is too slow — a bid closes in days, not a quarter.**

Two responses were proposed. **Decided by user/QS Manager, 2026-07-21 (was OQ-7/OQ-7a, now resolved — see Revision Log):**

- **Response 1 — SELECTED: a pick-time guardrail (§6.4), not a schema change.** Warn the estimator at the moment of picking (and refreshing) if the resolved recipe/assembly's equipment+subcon share of `net_direct_rate` exceeds 10% (BR9). Fast, no migration, works for every discipline uniformly. This is the build decision.
- **Response 2 — REJECTED for this build, not deferred-and-silent: a discipline-scoped third bucket** (MEP, façade, specialist subcontract trades carrying their own `plant_net_cost`/`plant_margin_pct`) rather than the product-wide two-bucket model. Considered and explicitly rejected as a user/QS Manager decision, not left open. **Revisit condition (recorded, not a standing open question): only if BR9's warning-firing rate in real usage shows the 2-bucket model is genuinely inadequate for a specific discipline** — i.e. if the 10% guardrail is firing routinely and consistently on a particular trade's real tenders, not on the strength of the one seeded work item alone.

### 6.4 Pick-time guardrail (added per `commercial-qs` review; threshold confirmed by user/QS Manager decision, 2026-07-21)

At pick time, and again at Refresh time (§7.3) since a refresh can shift the resource mix, after resolving the recipe/assembly explosion (§5) compute:

```
equipment_subcon_share = (sum of extended_cost where resource_category in ('equipment','subcon')) / snapshot_net_direct_rate
```

If `equipment_subcon_share` exceeds **10%**, show a **non-blocking** warning in the same pick/refresh confirmation dialog as BR7, naming the share (e.g. "This rate is 42% equipment/subcontract — `material_margin_pct` will apply to that amount too. Review the margin before accepting.") — not a hard stop. Blocking the pick outright would make the library unusable for genuinely subcontract-heavy trades (MEP, façade) where a high share is normal, not exceptional.

**BR9** — The pick/refresh confirmation dialog (BR7) shows the `equipment_subcon_share` warning whenever it exceeds **10%**; below threshold, no warning is shown, to avoid alert fatigue on ordinary concrete/blockwork/finishes items where the share is naturally near zero.

**Threshold value — RESOLVED (was OQ-7a): 10%, decided by user/QS Manager on 2026-07-21.** `commercial-qs` proposed ~10% as a starting point during review, given the one real seeded item is already at 15.2% and the product's own §6.3 quarterly-review trigger is 20% (a pick-time warning set at 20% would almost never fire on real data). The user/QS Manager confirmed 10% as final for this build — not an architect default, a business decision. Should still be stored as config (not hardcoded) so it can be retuned later without a code change, but the value to ship with is 10%.

---

## 7. Staleness Detection and "Refresh from Library"

Two genuinely different kinds of staleness exist and must not be conflated into one badge:

### 7.1 Library-side staleness (already exists, nothing new to build)
`dwl_v_work_item_rates.has_expired_price` / `dwl_v_assembly_rates.has_expired_price` — true right now if any resource in the recipe has a `quote_valid_until` in the past. This is a statement about the **live library**, independent of any BOQ line. Surfacing it on a BOQ line (via the still-live `dwl_work_item_id`/`dwl_assembly_id`) tells the estimator "the library itself has a stale quote behind this rate" — label: **"Library price expired"**.

### 7.2 BOQ-line staleness (new — the actual "has this line drifted" question)
Compare `rate_build_up.snapshot_net_direct_rate` (frozen) against the **current** `dwl_v_work_item_rates.net_direct_rate` / `dwl_v_assembly_rates.net_direct_rate` for the same `dwl_work_item_id`/`dwl_assembly_id`, for rows where `rate_source in ('dwl_work_item','dwl_assembly')`. Difference beyond a tolerance (recommend the same ±0.01 used elsewhere in this module, or a %-based threshold — see OQ-4) → label: **"Rate changed since priced"**.

**BR6** — Both badges can be true at once and mean different things; the UI must not merge them into a single generic "stale" flag. A line can have a current, non-expired library rate that has simply moved (BR6a: price rose, e.g. cement +$0.50/bag, without anything expiring) — that's 7.2 without 7.1.

**Presentation guidance (added per `commercial-qs` review):** the two badges should not carry equal visual weight. §7.2 ("Rate changed since priced") is the actionable, primary signal — it's the one Refresh actually responds to — and should be styled to stand out (e.g. prominent warning color, first in reading order). §7.1 ("Library price expired") is informational/secondary — it explains a possible cause but does not by itself mean the BOQ line's price is wrong yet — and should be styled with less visual weight (e.g. muted badge, secondary position). This is presentation guidance for `frontend-engineer`, not a data-model change.

**Implementation shape** (design intent, not code): `boq-tab.tsx` already loads all rows via `getBoqItemsGrouped()`; extend that load to also batch-fetch `dwl_v_work_item_rates`/`dwl_v_assembly_rates` filtered to the distinct set of `dwl_work_item_id`/`dwl_assembly_id` values present on the loaded page (one `IN (...)` query each, mirroring the client-side merge pattern `dwl-work-items-list-page.tsx` already uses for `dwl_v_work_item_rates`) and compute both badges client-side per row. No new view or RPC is required for this — it's the same merge-in-the-frontend pattern already proven in this module.

### 7.3 "Refresh from Library" — exact behavior

Available only on rows where `rate_source in ('dwl_work_item', 'dwl_assembly')` (there is nothing to refresh *from* on a manual or price-list row — those keep their own, separate "pull from price list" affordance, unchanged).

On click:
1. Re-run the exact snapshot procedure of §5 against the row's `dwl_work_item_id` or `dwl_assembly_id` (whichever is set) — a **fresh** query, not a diff/patch of the old snapshot.
2. Overwrite `rate_build_up` wholesale with the new snapshot (BR4).
3. Overwrite `labor_net_cost` and `material_net_cost` with the newly bucketed totals.
4. **Do not touch `labor_margin_pct` / `material_margin_pct`.** The estimator's markup decision is preserved across a refresh — refreshing updates *what the library says the direct cost is*, never re-decides the estimator's margin. **The Refresh implementation must itself compute and write the new `unit_rate` — it must not rely on `updateBoqItem()` to do this for it.**

  *Correction (commercial-qs review, v0.2):* v0.1 claimed this happens "exactly as `updateBoqItem()` already does for any net-cost change today." That is factually wrong. `updateBoqItem()` (`tender-cost-service.ts`, lines ~568–596) does **not** recompute `unit_rate` — it is a plain passthrough field in that function; only `createBoqItem()` (lines ~529–531) computes `labor_rate`/`material_rate`/`unit_rate` explicitly. `updateBoqItem()` also has **zero call sites anywhere in the UI today** — there is no existing, proven behavior for Refresh to inherit. **The Refresh implementation must compute `unit_rate = (labor_net_cost * (1 + labor_margin_pct/100)) + (material_net_cost * (1 + material_margin_pct/100))` explicitly — the same formula `createBoqItem()` uses — and write it in the same update call as the new net costs.** `total_amount` is a generated column (`quantity * unit_rate`) and updates automatically once `unit_rate` is written correctly, but `unit_rate` itself is not generated — leaving it untouched on a net-cost refresh would silently ship a stale `unit_rate` and `total_amount`: a live mispricing bug. `frontend-engineer`/`backend-engineer`: build against this corrected wording, not v0.1's.
5. Update `snapshot_at` inside the new `rate_build_up` payload (§4.3).
6. Emits an audit event (§7.4) — a refresh silently changing a priced line's underlying cost is exactly the kind of action QS-SOP-002's own audit principles (created_by/basis_note everywhere) require to be traceable.

**BR7** — Refresh requires a confirmation step before committing, showing:
  - old vs new `snapshot_net_direct_rate` (value and %), and
  - **old vs new resulting `unit_rate`**, computed at the row's current (unchanged) margins — added per `commercial-qs` review, so the estimator sees the concrete bid-price impact of accepting the refresh, not just an abstract net-cost delta.

This matches the "never auto-overwrite a priced line" principle from the task brief and closes the "margin silently re-applied to a different base" risk flagged in BR8. This is a UI confirmation, not a workflow approval gate (no approval workflow exists on this table — §7.5).

**BR8 (answering the task brief's explicit question) — margins are NOT re-confirmed on refresh.** They carry forward unchanged. Rationale: `tender_boq_items` has no approval/workflow status column, so there is no natural place to route a "confirm margin" step, and forcing a re-type of every margin on every refresh would make refresh punitive enough that estimators avoid using it, defeating its purpose. The trade-off (a margin set for a $60 net cost silently applying to a since-changed $75 net cost) is accepted at MVP and flagged as OQ-5 for the QS Manager to override if experience shows it's a problem — recommend revisiting after the first live tender uses this feature, not before.

### 7.4 Audit trail

`qs_audit_log` (generic trigger, `qs_audit_trigger_fn()`) was already attached to **13 tables** before this design (5 from `20260612000004_qs_audit_log.sql`, 7 from `20260615000001_qs_data_integrity.sql`, 1 — `wbs_node_quantities` — from `20260718000002_create_wbs_node_quantities.sql`), and is **now attached to 14** with `tender_boq_items` added via `20260722000006_qs_audit_tender_boq_items.sql` (`AFTER INSERT OR UPDATE OR DELETE`, same generic function — no new trigger logic needed, it already does generic `to_jsonb(OLD)`/`to_jsonb(NEW)` capture) so that Pick / Refresh / manual-override transitions on `tender_boq_items` are all captured the same way IPCs, VOs, and retention already are. This was additive and low-risk (the function already existed and is proven in production use elsewhere in QS).

### 7.5 No workflow gate exists — flagged, not invented

`tender_boq_items` has no `status` column (verified — absent from all three migrations that define it) and no approval workflow. `tender_bid_summaries` does have `status` (`draft`/`review`/`final`/`submitted`). Recommend (OQ-6, not decided here): once a tender's current `tender_bid_summaries` revision is `'submitted'`, editing or refreshing any of that tender's `tender_boq_items` rows should probably be blocked — but `boq-tab.tsx` does not check bid-summary status today for *any* edit (manual or otherwise), so adding that check only for library-sourced refresh would be an inconsistent, partial fix. This is a pre-existing gap in the tender module, not something introduced by this design — flagged for the QS Manager to scope as its own follow-up, not silently patched here.

---

## 8. RLS / Permission Implications

**No new RLS policy is required on any `dwl_*` table.** `dwl_v_work_item_rates`, `dwl_v_assembly_rates`, and (post-§4.2) `dwl_v_work_item_explosion` are all `security_invoker = true` and enforce tenant isolation via `tenant_id = (select company_id from profiles where id = auth.uid())` against the *querying user's own* profile row (fixed in `20260720000017_fix_dwl_tenant_isolation.sql`) — this check does not care which module's screen is issuing the query. A `boq-tab.tsx` read of `dwl_v_work_item_rates` is exactly as tenant-safe as a `dwl-work-items-list-page.tsx` read of the same view, with zero new policy work.

**Application-level gating** — no new permission action is needed. `useTenderPermissions().can("tender_boq", "can_create")` (already used to gate the existing "Import"/"Add Item" buttons in `boq-tab.tsx`) also gates the new "Add from Library" entry point; `can("tender_boq", "edit")` gates "Refresh from Library" the same way it would gate any other edit to the row.

**Gap flagged, not fixed here (OQ-2):** `tender_boq_items` itself has no `tenant_id` column and ships with a permissive `using (true)` RLS policy for `authenticated` — the same GAP-01 pattern QS-SOP-002 explicitly refused to repeat in `dwl_*`. This design's new `dwl_assembly_id` column and the picker flow do not introduce this gap (it already exists on every row in the table today), but they do mean a BOQ line can now carry a reference into a tenant-scoped table (`dwl_assemblies`/`dwl_work_items`) from a row that itself has no tenant scoping at all. In DCOS's current single-tenant reality (one company, MCC) this has no observable effect. It becomes a real cross-tenant leak the day a second tenant is onboarded. Recommend the QS Manager/Developer treat "add `tenant_id` + real RLS to `tender_boq_items`" as a prerequisite hardening item tracked alongside this integration, not as part of it — it is a tender-module-wide gap, not specific to the library picker.

---

## 9. Phased Build Order

1. **Shared library-picker component** (`LibraryRatePicker` or similar name — final naming is `frontend-engineer`'s call) — search/browse `dwl_v_work_item_rates` + `dwl_v_assembly_rates` by code/description, shows unit, `net_direct_rate`, `has_expired_price` badge, recipe/component count. Read-only. Buildable and testable in isolation before touching `tender_boq_items` at all. Designed to be reusable later from `boq-builder.tsx` (§2 scope note — that wiring is a separate, later decision, but the component itself should not be built tender-module-specific).
2. **Database changes** (§4.1, §4.2) — `dwl_assembly_id` column + one-source CHECK constraint, `rate_source` enum extension, `dwl_v_work_item_explosion` additive columns. Must land before step 3.
3. **`boq-tab.tsx` wiring** — "Add from Library" alongside the existing "Import"/"Add Item" buttons, opens the picker, on selection runs the snapshot procedure (§5), applies the margin bucketing (§6.2), creates the row via an extended `createBoqItem()`.
4. **Staleness badges + Refresh from Library** (§7) — depends on step 3 existing rows to have something to refresh; attach `qs_audit_log` trigger to `tender_boq_items` in this same phase (§7.4), since refresh is the first write path in this table that specifically needs an audit trail.
5. **Separately, later, its own decision** — `qs_boq_items`/`qs_cost_items`/`boq-builder.tsx` repoint (QS-SOP-002 §12.1 step 8). Do not start this until steps 1–4 are live and the picker component has proven itself in the tender module.

---

## 10. Explicit Pushback on the Proposed Direction

The task brief asked to be told what's wrong, not just have the plan formalized. Four things:

1. **Point 2 of the proposal ("check whether `tender_boq_items` even has an assembly FK today") was the right instinct — it does not, and a plain new `dwl_assembly_id` column is not quite enough on its own.** Without the one-source CHECK constraint (§4.1), nothing stops a row from having both `dwl_work_item_id` and `dwl_assembly_id` set, which would make the snapshot procedure (§5) ambiguous about which one produced `rate_build_up`. Added the constraint; this wasn't in the original proposal.
2. **The proposal didn't surface the `unit_rate_id` / `dwl_work_item_id` redundancy** (§3.3) — it already exists in the schema today, independent of this integration, and a new `dwl_assembly_id` column sitting alongside two existing FKs to the work-item side makes the inconsistency more visible, not less. This design does not fix it (that's a separate cutover decision, OQ-1) but it would have been wrong to add a third differently-patterned column without naming the two that already disagree.
3. **"Snapshot-on-pick, not live-link" was correctly proposed, but the proposal didn't specify what happens to `labor_margin_pct`/`material_margin_pct` on first pick.** Resolved in §6.2: they default to 0 and the estimator types them exactly as for a manual row — picking from the library only ever supplies net cost, never a margin decision.
4. **The proposal's staleness point (point 3) treated "staleness" as one concept.** It is two (§7.1 vs §7.2), and conflating them would produce a badge that's sometimes misleading (a line can look "expired" because of a stale library quote while its own snapshot rate is still perfectly current, or vice versa). Split explicitly.

Nothing else in the proposed direction needed correcting — the overall shape (shared picker, snapshot not live-link, manual refresh only, manual/import as fallback, `qs_boq_items` out of scope) holds up.

---

## Open Questions

*Items 7, 7a, and 8 below were open as of v0.2 and have since been decided by the user/QS Manager on 2026-07-21 — retained at their original numbers for traceability, marked RESOLVED, and no longer block build. All other items remain genuinely open (non-blocking) follow-ups.*

1. **`unit_rate_id` vs `dwl_work_item_id` redundancy (§3.3)** — both now point to `dwl_work_items(id)`. Options: **A)** keep writing both indefinitely (current interim stance in this design) — safest, zero risk of breaking an unknown PostgREST embedded-relationship reader, but leaves permanent schema debt. **B)** grep every remaining reader of `unit_rate_id`'s embedded relationship, migrate them to `dwl_work_item_id`, then drop `unit_rate_id`. **Recommendation: A now, B as a tracked follow-up** — this integration should not be the vehicle for a column deprecation that touches code outside its scope.
2. **`tender_boq_items` has no `tenant_id`/real RLS (§8)** — pre-existing, not introduced here, but this integration deepens the cross-table reference into a tenant-scoped table. Recommendation: track as a prerequisite tender-module hardening item, distinct from this build.
3. **Should the picker be scoped by `boq_section` / discipline to the BOQ line being created**, or show the full library unfiltered? Options: **A)** unfiltered search (simplest, matches how `dwl-work-items-list-page.tsx` already searches) **B)** pre-filter by the section the estimator is currently adding to. **Recommendation: A for MVP** — the library is small (150–300 resources, ~60 work items target per QS-SOP-002 §14) and a search box is enough; revisit if/when the library grows past a size where scrolling an unfiltered list becomes the bottleneck.
4. **Staleness tolerance for §7.2 ("rate changed since priced")** — flat ±$0.01 (matches the reconciliation tolerance already used in `dwl-work-items-list-page.tsx`) or a %-based threshold (e.g. >2%) to avoid flagging noise from sub-cent rounding on high-value items? **Recommendation: flat ±0.01 for MVP, consistent with existing precedent in this module** — revisit only if real usage shows false-positive staleness badges on high-value lines.
5. **Margins not re-confirmed on Refresh (BR8)** — accepted risk at MVP. Recommendation: revisit after first live tender use, not before.
6. **Workflow gate on `tender_boq_items` edits once a tender is submitted (§7.5)** — no `status`-based edit lock exists anywhere on this table today, for any edit type. Recommendation: scope as a separate tender-module hardening item; do not build a partial lock that only covers library-sourced refresh while manual edits remain unguarded.
7. **RESOLVED (2026-07-21, user/QS Manager decision) — Third cost bucket scope (§6.3/§6.4).** Decided: keep the 2-bucket model product-wide, rely on the pick-time guardrail (§6.4, BR9) plus the existing quarterly health check. The discipline-scoped third-bucket alternative (`plant_net_cost`/`plant_margin_pct` for MEP/façade/specialist subcontract trades) was considered and **explicitly rejected** for this build, not left open — see §6.3 Response 2. Revisit only if BR9's real-usage warning-firing rate shows the 2-bucket model is genuinely inadequate for a specific discipline; that is a recorded revisit condition, not a standing open question.
7a. **RESOLVED (2026-07-21, user/QS Manager decision) — Pick-time guardrail threshold (§6.4, BR9): 10%, final.** `commercial-qs` proposed ~10% during review as a starting point; the user/QS Manager confirmed 10% as the value to ship with — a business decision, not an architect default. Stored as config, not hardcoded, so it can be retuned later without a code change, but 10% is what Phase 3/4 builds against.
8. **RESOLVED (2026-07-21, user/QS Manager decision) — `tender_provisional_sums` / `tender_dayworks` (`20260722000001_tender_provisional_sums_dayworks.sql`) integration with the DWL library is out of scope for QS-SOP-003.** Decided as a deliberate deferral, not silently dropped: `tender_dayworks.rate` remains a flat column with no labor/material split and no library FK for the duration of this build. Despite dayworks rates (labor gang day-rate, plant hire day-rate) arguably being an even more natural fit for the DWL Level-1 resource library (`dwl_resources`/`dwl_resource_prices`) than the work-item recipe cascade this document wires up, this integration is explicitly scoped as its **own separate follow-up SOP/ticket**, to be raised after this build ships — not bundled into QS-SOP-003.
9. **Rounding-precision re-validation at Assembly scale (BR3)** — `line_cost` is rounded per-line (4dp) but `net_direct_rate` sums unrounded values; only validated so far against the single 7-line seeded work item. Recommendation: re-run BR3's ±0.01 reconciliation check against a real 30–40+ line Assembly before Phase 3/4 sign-off, since rounding accumulation at that scale is untested.

## Hand-off Checklist — STATUS: READY FOR PHASE 9 BUILD (v0.3, 2026-07-21)

- [x] Doc 01-equivalent (§1–2, Purpose/Scope) approved by human
- [x] Doc 02-equivalent (§4–7, data model + business rules BR1–BR9) approved by human
- [x] `tender_boq_items` new-column list reviewed (§4.1) — `tenant_id` gap on this table explicitly acknowledged as pre-existing and out of scope, not silently accepted as fine
- [x] `dwl_v_work_item_explosion` additive change (§4.2) confirmed — required dependency for `database-engineer`, land before Phase 3 (§9) starts
- [x] All staleness/refresh paths (§7) reviewed — no auto-overwrite path exists anywhere in this design; §7.3 step 4's `unit_rate` computation is built explicitly in the Refresh code path, not assumed to come from `updateBoqItem()`
- [x] BR1–BR9 numbers assigned and traceable to test cases before build; BR1/BR2 net-cost-vs-margin distinction specifically covered by a test case (pick → edit margin only → confirm `rate_source` and Refresh availability both survive)
- [x] Integration points listed (§8 — no new RLS, no new permission actions, existing `can("tender_boq", ...)` reused)
- [x] Money columns confirmed `numeric(15,2)` on `tender_boq_items` (existing precision on this table, not `numeric(18,2)` — pre-existing inconsistency with the general DCOS money-column standard, not introduced or corrected here; flag separately if a table-wide precision fix is ever scoped)
- [x] `commercial-qs` review completed on v0.1 — verdict: pass-with-guardrails. Two required rework items (§7.3 step 4 `unit_rate` factual correction; BR1/BR2 contradiction) and one guardrail (§6.4 pick-time warning, BR9) incorporated in v0.2.
- [x] **OQ-7/OQ-7a decided (2026-07-21, user/QS Manager)** — BR9 threshold final at 10%; discipline-scoped third bucket explicitly rejected for this build (revisit condition recorded, not a standing question). See §6.3/§6.4 and Open Questions item 7/7a.
- [x] **OQ-8 decided (2026-07-21, user/QS Manager)** — `tender_provisional_sums`/`tender_dayworks` DWL integration deferred to its own separate follow-up SOP/ticket; explicitly out of scope for this build. See Open Questions item 8.

**Remaining items are non-blocking, tracked follow-ups, not conditions of build:** OQ-1 (`unit_rate_id`/`dwl_work_item_id` redundancy), OQ-2 (`tender_boq_items` tenant/RLS hardening), OQ-3 (picker scoping), OQ-4 (staleness tolerance), OQ-5 (margin re-confirmation on Refresh), OQ-6 (workflow gate on submitted tenders), OQ-9 (rounding-precision re-validation at Assembly scale — should be checked during Phase 3/4 QA, not before build starts). None of these were raised by `commercial-qs` as build-blocking, and none require a decision before `frontend-engineer`/`database-engineer` can start Phase 9 (§9) work.
