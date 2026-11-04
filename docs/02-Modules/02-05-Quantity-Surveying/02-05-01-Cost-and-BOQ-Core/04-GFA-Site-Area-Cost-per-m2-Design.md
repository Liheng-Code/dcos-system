# GFA, Site Area & Cost per m² — Design Specification
**Document Code:** DCOS-DS-12-004 | **Version:** R2 | **Date:** 2026-07-18
**Module:** Quantity Surveying (12-11 GFA / Cost-per-m²) | **Domain:** Commercial
**Implements:** `DCOS-QS-GDL-001` V1.1 — *GFA, Site Area & Cost per m² Measurement & Reporting Guideline*

**Status:** All 5 rollout phases (§9) implemented 2026-07-18 — migrations written (not yet applied to a live database; run your own `supabase db push`), service layer, WBS UI, QS Dashboard tab, and reporting all shipped. Two implementation notes worth knowing before using it on a real project:
- `qs_boq_items` had no link to Budget Code Groups A-F at all before this build (only `tender_boq_items` did). A `budget_code_id` column was added to `qs_boq_items` alongside `elemental_category` so the §3 mapping table can resolve — but it's opt-in per item; there is no automatic tender→live BOQ conversion in this codebase today (`award-conversion-dialog.tsx` only flips `project_type`), so tagging still has to happen on the live BOQ item itself.
- The `cost_per_m2_internal` RBAC permission (§5) is seeded and enforced, but there is currently no actual internal cost-basis (no-margin) figure computed anywhere in the schema to gate — `qs_boq_items.total_amount` is the only rate tracked, and it's already the sell/contract figure. The permission is a ready hook for when a real cost-vs-sell split is added; until then, the firewall's practical effect is limited to hiding internal-only sections (elemental breakdown, GFA data-quality warnings) from `EXT-CLT`/`EXT-CON` roles, which is implemented.

**R2 addendum (2026-07-18) — Tender-phase Cost/m²:** the original build only covered the post-award/live-project phase (`qs_boq_items` + WBS-level `wbs_node_quantities`). A QS needs a $/m² sanity check right after pricing, before the bid goes out — not just after award — so a lighter-weight "Cost / m²" tab was added to `Cost Estimation` (`apps/web/app/dashboard/tenders/cost-estimation/page.tsx`), scoped by `tenderId`. It deliberately does **not** reuse the split-basement/elemental-breakdown machinery: `tender_boq_items.level` is a free-text field, not a real `wbs_node_id` (no WBS picker exists in `boq-tab.tsx`), so there is no per-level GFA to split against yet. Instead it adds a single `gfa_total`/`gfa_source` pair on `tender_register` (migration `20260718000005`) and computes one blended rate — `(Direct Works + Preliminaries) ÷ GFA total` — reusing the same `CostPerM2Footnote` component as the live-project view. Full elemental/basement parity at tender stage would require wiring `tender_boq_items` to real WBS nodes first; deferred until there's a concrete need for it pre-award.

---

## 1. Overview

This module turns the house convention in `DCOS-QS-GDL-001` into a data model, calculation service, and reporting screen. Today the guideline exists as a policy document only — no `wbs_node_quantities` table, no `GFA`/`SITE_AREA` metric, and no cost-per-m² card exist anywhere in the codebase (confirmed by search). This is a greenfield build inside the existing QS module, not a modification of prior work.

Three things the guideline requires that the current schema does not yet support:

1. A place to record **GFA per WBS level node**, split above-ground vs basement, with a mandatory source reference and a reason-logged revision trail.
2. A place to record **Site Area once per project**, independent of the WBS rollup.
3. A **cost-allocation and reporting layer** that divides building cost by GFA total, basement cost by GFA basement, and external-works cost by Site Area — never mixing the three — and renders the mandatory Section 9 "Standard Final Cost Summary" format with the Section 5.1 basis footnote.

Everything below is designed to sit on top of the existing `wbs_nodes`, `qs_boq_items`, `qs_cost_transactions`, and `role_permissions` tables rather than duplicate them.

---

## 2. Data Model

### 2.1 `wbs_nodes` — new columns

| Column | Type | Description |
|---|---|---|
| `is_below_ground` | BOOLEAN NOT NULL DEFAULT false | Flags a `level` node as a basement level. Drives the above/below GFA split (§3 Step 1) and the mandatory split-vs-blended reporting (§7). |
| `is_external_works` | BOOLEAN NOT NULL DEFAULT false | Flags a node (typically a `zone` or `discipline` node) as the root of the external-works scope. Any BOQ item or cost transaction linked to this node or a descendant is automatically classified as External Works — divided by Site Area, never GFA (§4, §8). |

Both are plain flags on the existing table — no new node_type values needed, no migration risk to existing rows (defaults `false`).

### 2.2 `projects` — new columns

| Column | Type | Description |
|---|---|---|
| `site_area` | NUMERIC(14,2) | Legal land area from title deed / survey plan (m²). Entered once per project (§4). |
| `site_area_source` | TEXT | Reference to the title deed / survey plan / contract works-area boundary drawing (§4). |

**Design decision:** the guideline's system-reference line says metrics are "stored in `wbs_node_quantities` (metric_code GFA / SITE_AREA)", implying Site Area is entered by selecting a "Project node" in the same tree UI as GFA. The current `wbs_nodes` schema has no `project`-type node — the project itself is a row in `projects`, not a WBS node. Rather than inventing a synthetic root WBS node, Site Area is stored directly on `projects`. The UI still satisfies the guideline's UX: the WBS tree's root item (the project name) is clickable and opens the same "Quantities" panel used for level nodes, just backed by `projects.site_area` instead of `wbs_node_quantities`. This is called out here because it's the one place this design deviates from the guideline's literal wording — flag if you'd rather model a real project-level WBS node instead.

### 2.3 `wbs_node_quantities` — new table (GFA only)

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `wbs_node_id` | UUID | FK → `wbs_nodes(id)` ON DELETE CASCADE |
| `metric_code` | TEXT | CHECK IN (`'GFA'`) — kept as an enum column (not just a dedicated `gfa` column) so future metrics (e.g. NLA, roof area) can reuse the table without a new migration |
| `value` | NUMERIC(14,2) | CHECK `value >= 0` |
| `unit` | TEXT NOT NULL DEFAULT `'m2'` | |
| `source` | TEXT | Drawing revision reference (e.g. "A-102 Rev C") — mandatory at the UI layer per the "GFA is entered, never derived" rule (§3 Non-Negotiable Rule 1) |
| `revision_reason` | TEXT | Required on UPDATE only (not on first INSERT) — enforced in the service layer, not a DB constraint, since a reason can't exist before the first value does |
| `created_by` / `updated_by` | UUID | FK → `auth.users(id)` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |
| — | | UNIQUE (`wbs_node_id`, `metric_code`) — one GFA value per level node, edited in place (with the audit trigger below capturing the before/after) |

GFA is only ever entered on `wbs_nodes.node_type = 'level'` (enforced in the service layer / UI, not a DB constraint, to avoid a cross-table CHECK). Roof-level enclosed rooms (lift motor room, tank room) are entered as GFA on the roof-level node like any other level (§3, §11) — no separate "room" modeling needed for this metric.

### 2.4 Rollup query (no new table needed)

Because every `wbs_nodes` row already carries `project_id` directly (not just at the root), the above/below/total rollup is a flat aggregate — no recursive CTE required:

```sql
select
  n.is_below_ground,
  sum(q.value) as gfa
from public.wbs_node_quantities q
join public.wbs_nodes n on n.id = q.wbs_node_id
where n.project_id = $1
  and n.node_type = 'level'
  and q.metric_code = 'GFA'
group by n.is_below_ground;
```

This backs `GFA above ground`, `GFA basement`, and `GFA total` everywhere in the guideline (§2, §6, §7).

### 2.5 Audit trail — reuse `qs_audit_log`

Add `wbs_node_quantities` to the existing trigger array in `qs_audit_trigger_fn()` (`supabase/migrations/20260612000004_qs_audit_log.sql`) alongside `qs_variation_orders`, `qs_progress_claims`, etc. This gives GFA edits the same immutable before/after JSON log as every other QS financial change, satisfying "the change is audit-logged" (§3 Non-Negotiable Rule 3) with zero new audit infrastructure. The `revision_reason` column captures *why*; the audit log captures *what changed and when*.

### 2.6 Historical snapshot rule

"Historical $/m² snapshots keep the GFA that was current at their time" (§3). The existing `qs_cost_baseline_distribution` / S-curve snapshot tables already freeze cost figures at a point in time; this design adds the corresponding GFA figure to any future GFA-aware snapshot by copying the *current* `gfa_total` / `gfa_above` / `gfa_basement` values into the snapshot row at creation time — snapshots never re-query live GFA. No schema change needed beyond ensuring any new snapshot table that reports $/m² includes its own frozen GFA columns rather than a live FK join.

---

## 3. Elemental Cost Mapping — the one real design gap

The guideline's mandatory elemental table (§6 Step 3) has five lines: **Substructure, Superstructure, Architectural works & finishes, MEP services, Preliminaries.** The existing Budget Code structure (Groups A–F, 47 sections, see `02-Budget-Code-Design.md`) is organized differently — e.g. Group B ("Sub-Structure") covers Foundation/Piling, Basement, Ground Floor Slab and Super-Structure Podium together, and there is no dedicated "Superstructure/Frame" group at all.

Rather than restructure the 47-section Budget Code (used across BOQ, procurement, and cost transactions) to fit a 5-line report, this design adds a **separate, small classification purpose-built for the elemental $/m² report**:

| Column | Location | Description |
|---|---|---|
| `elemental_category` | new column on `qs_boq_items` | ENUM: `substructure`, `superstructure`, `architectural`, `mep`, `external_works`, `prelims`. Nullable — only required for items that need to appear in the §6/§9 elemental summary. |

Defaulting rules applied at write-time (service layer), so QS engineers rarely set this by hand:
- `boq.boq_type = 'preliminary'` → `elemental_category = 'prelims'` automatically (§5.1 house rule: prelims as their own line, never distributed).
- `wbs_node.is_external_works = true` (item's `wbs_node_id` is that node or a descendant) → `elemental_category = 'external_works'` automatically, and the item is excluded from the building GFA numerator entirely (§4, §8).
- Everything else defaults to a mapping table `qs_budget_section_elemental_map (budget_section_code, elemental_category)` seeded once (e.g. Group B sections → `substructure`, Group C/D/E → `architectural`, Group F → `mep`), editable by the QS Manager for edge cases (e.g. a Group B "Super-Structure Podium" section that should read as `superstructure` not `substructure`).

This keeps the detailed 47-section commercial coding untouched and gives the 5-line elemental report its own thin, overridable classification — standard practice in QS (elemental cost analysis is conventionally a separate breakdown from the bill structure).

---

## 4. Calculation Rules (service layer — `lib/qs-service.ts`)

All formulas below map directly to guideline sections; no new business logic is invented beyond what §5/§6/§7/§8 already specify.

| Function | Formula | Guideline ref |
|---|---|---|
| `getProjectGfaSummary(projectId)` | Returns `{ gfaAbove, gfaBasement, gfaTotal }` via the §2.4 rollup query | §2, §6 |
| `getBuildingCostPerM2(projectId)` | `buildingCost ÷ gfaTotal` where `buildingCost` = sum of all non-external BOQ items (incl. prelims, piling, roof — everything except `elemental_category = 'external_works'`) | §5, §6 |
| `getSplitCostPerM2(projectId)` | `{ aboveGroundRate: aboveGroundCost ÷ gfaAbove, basementRate: basementCost ÷ gfaBasement, blendedRate: (aboveGroundCost+basementCost) ÷ gfaTotal }` — **both split and blended are always returned together**, never blended alone (§7 mandatory) | §7 |
| `getElementalBreakdown(projectId)` | Groups BOQ item totals by `elemental_category`, each ÷ `gfaTotal` | §5, §6 Step 3 |
| `getExternalWorksCostPerM2(projectId)` | `externalWorksCost ÷ project.site_area` — a wholly separate calculation, never combined with building cost in the denominator | §4, §8 |
| `getFinalCostSummary(projectId)` | Assembles the exact §9 "Standard Final Cost Summary" row set (lines 1/2/A/3/B/memo) in one call, ready for the report renderer | §9 |
| `apportionPrelimsToSplit(projectId)` | Optional refined view: `aboveShare = totalPrelims × (dcAbove ÷ dcTotal)`, `basementShare = totalPrelims − aboveShare` — used only when the basement decision itself is under analysis, per §7 Step 3; the simple presentation (prelims fully in the above-ground line) remains the default for routine summaries | §7 Step 3 |

**Guardrail carried into the service layer, not just the UI:** if `elemental_category = 'external_works'` and the caller asks for a "building $/m²", throw / warn rather than silently summing it into the numerator — this is the exact §8 "classic mistake" the guideline exists to prevent, so it's worth a hard check in code, not just a convention.

**Guardrail from the checklist (§10):** "No level has cost > 0 with GFA = 0" — implement as a dashboard warning banner (query: any `wbs_node.node_type = 'level'` with linked BOQ item totals > 0 and no `wbs_node_quantities` row) rather than a blocking constraint, since the guideline explicitly says "DCOS warns — do not ignore the warning", not "DCOS blocks".

---

## 5. Sell vs Cost — Dual-Rate Firewall (§5.1)

The guideline requires every $/m² figure to be clearly labelled **sell-basis** (incl. OH&P, what clients see) or **cost-basis** (internal margin analysis, "visible to QS Manager+ only, per SOP-QS-05A"). The existing `role_permissions` table already has this exact shape of rule for other QS actions (e.g. `claims`, `retention` have different `view` scopes per role code).

Add one row set for a new `action = 'cost_per_m2_internal'`:

| Role | view | Rationale |
|---|---|---|
| `L0`, `L1`, `L2`, `QS` | true | QS Manager+ / Commercial Director tier — matches every other "company"-scope QS action already in the table |
| `L3`, `L4`, `L5`, `L6`, `AC`, `EXT-CLT`, `EXT-CON`, `EXT-SUB` | false | Everyone else sees sell-basis figures only |

The sell-basis figure (`action = 'cost_per_m2'`) stays visible to the same broad set as `boq`/`claims` today. This reuses the exact firewall pattern already enforced elsewhere in QS RBAC — no new mechanism, one more `role_permissions` row set plus a check in the report renderer before it includes the cost-basis column/line.

---

## 6. UI

### 6.1 WBS tree — "Quantities" panel (§11)

- Selecting a `level` node opens a "Quantities" panel (new, small — a sibling to the existing node detail panel) with a single `GFA (m²)` field + `source` field. Saving with no prior value is a plain insert; saving over an existing value prompts for `revision_reason` (mirrors the existing budget-revision reason-prompt pattern already used in `budget-revisions.tsx`).
- Selecting the project root of the tree opens the same panel shape, backed by `projects.site_area` / `site_area_source` instead.
- A `level` node flagged `is_below_ground` shows a small "Basement" badge in the tree, consistent with how the sidebar already badges precontract-stage projects.

### 6.2 QS Dashboard — new "Cost / m²" card + tab

Following the existing pattern in `cost-control.tsx` (`SUB_TABS` + `MetricCard`):

```ts
const SUB_TABS = [
  { id: "overview",  label: "Cost Dashboard" },
  { id: "variance",  label: "Budget & Variance" },
  { id: "revisions", label: "Budget Revisions" },
  { id: "costs",     label: "Cost Transactions" },
  { id: "cost-per-m2", label: "Cost / m²" },   // new
] as const;
```

The new `CostPerM2Dashboard` component (new file, `components/qs/cost-per-m2-dashboard.tsx`) renders, top to bottom:

1. Four `MetricCard`s: Building $/m² (blended), Above-ground $/m², Basement $/m², External $/m² (site) — reusing the existing `MetricCard` component as-is.
2. "No area data" warning banner when the §10 checklist guardrail trips.
3. Elemental breakdown table (§6 Step 3 shape).
4. The exact §9 Standard Final Cost Summary table (lines 1/2/A/3/B/memo), with the memo line visually de-emphasized and labelled "not a benchmark" per §9's reading notes.
5. The mandatory §5.1 basis footnote, rendered verbatim, always visible under the summary — not optional, not collapsible.

This slots into the existing `?tab=` sidebar convention (`sidebar.tsx`'s `TabNavItem`) as a sixth QS sub-tab, e.g. `/dashboard/qs?tab=cost-per-m2`, matching the pattern already fixed for the other five QS tabs.

### 6.3 Client-facing export

Per §9 / SOP-QS-05A, any client-facing export of the Final Cost Summary must show sell-basis figures only. The report renderer checks the `cost_per_m2_internal` permission (§5) before including a cost-basis column, exactly like the existing role-gated exports elsewhere in QS.

---

## 7. Reporting Design

| Report | Trigger | Content |
|---|---|---|
| Standard Final Cost Summary | On-demand, per project | Exact §9 table, elemental table below it, GFA convention reference line, §5.1 footnote |
| GFA data-quality warning | Dashboard banner, always-on | §10 checklist item 5 (cost > 0, GFA = 0) |
| Basis-labelled $/m² everywhere else | Any report/screen that surfaces a $/m² figure outside this dashboard (e.g. tender review, executive dashboard) | Must carry or reference the §5.1 footnote — a shared `<CostPerM2Footnote>` component should be built once and reused, not re-typed per screen |

---

## 8. Business Rules (condensed, BR-numbered to match `01-Business-Requirement.md` style)

- **BR-G1:** No $/m² figure may be issued in a tender review, management report, or client document without the §5.1 basis footnote.
- **BR-G2:** GFA values are entered per level node from a drawing reference; never derived by summing BOQ or room-level quantities.
- **BR-G3:** Basement GFA and cost are always reported both split and blended — never blended only.
- **BR-G4:** External works cost is divided by Site Area only, and is never added into the building $/m² numerator. A combined "whole project ÷ GFA" figure may appear only as a labelled memo line.
- **BR-G5:** Editing an existing GFA value requires a reason and is captured in the QS audit log; historical $/m²-bearing snapshots retain the GFA value current at their own creation time.
- **BR-G6:** Preliminaries appear as their own elemental line by default; pro-rata distribution into other elements is allowed only when a client format demands it, and must be noted when used.
- **BR-G7:** Cost-basis (internal, no-margin) $/m² figures are visible only to QS Manager tier and above (`L0`/`L1`/`L2`/`QS`); all other roles and all client-facing exports see sell-basis figures only.

---

## 9. Rollout Phases

1. **Migration** — `wbs_nodes` new columns, `projects` new columns, `wbs_node_quantities` table + RLS + audit trigger registration, `qs_boq_items.elemental_category` + seed `qs_budget_section_elemental_map`, `role_permissions` rows for `cost_per_m2` / `cost_per_m2_internal`.
2. **Service layer** — the functions in §4 added to `lib/qs-service.ts`, following the existing export/type conventions already in that file.
3. **WBS UI** — Quantities panel on level nodes + project root (§6.1).
4. **QS Dashboard UI** — new `cost-per-m2` sub-tab, `CostPerM2Dashboard` component, sidebar wiring (§6.2), consistent with the sidebar `TabNavItem` fix already shipped.
5. **Reporting** — Final Cost Summary renderer + shared footnote component + client-export firewall check (§6.3, §7).

Each phase is independently shippable and testable; nothing in phase *n* blocks demoing phase *n−1* on real project data.

---

## 10. Decisions (confirmed 2026-07-18)

1. **Site Area location** — confirmed: stored on `projects` (§2.2), no synthetic project-level WBS node.
2. **Elemental classification** — confirmed: separate `elemental_category` column + mapping table (§3), Budget Code Groups A–F left untouched.
3. **`is_external_works` scope** — confirmed: external works already sits in its own WBS branch/zone on real projects, so a single node-level flag (§2.1) is sufficient to classify everything beneath it; no per-BOQ-item override flag needed.

Design is final. Proceeding to Phase 1 (migration) per §9.
