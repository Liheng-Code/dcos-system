# Global Cost Database Architecture in Construction Estimation & BOQ Dynamics

| Document Control | |
|---|---|
| Document Title | Global Cost Database Architecture in Construction Estimation & BOQ Dynamics — Reference & DCOS Applicability |
| Document No. | DCOS-DS-12-015 |
| Status | Draft — for review |
| Date | 2026-09-23 |
| Owner | QS Manager |
| Relationship to other docs / Pairs with | Reference architecture for §6 gap analysis below. Cross-references: `02-Budget-Code-Design.md` (classification), `03-BOQ-Design.md` §4 (MasterFormat framing), `07-SOP_Direct_Works_Cost_Library_Module.md` & `08-SOP_Direct_Works_Library_Tender_BOQ_Integration.md` (resource-recipe library), `10-QS-Element-Library-Design.md` (element classification), `11-QTO-Module-Design.md` (measurement, validation rules, BIM roadmap), `12-Material-Specification-Price-Recording-Design.md` / `13-SOP_Material_Specification_Price_Recording.md` / `14-AI-Prompt_Material_Spec_Row_Generator.md` (existing AI-assisted workflow) |

---

## Executive Summary

In modern construction engineering and quantity surveying, a **Global Cost Database** serves as the single source of financial truth, bridging architectural designs, quantity takeoffs (QTO), and live post-contract cost management. Rather than relying on static, flat price lists or fragmented regional spreadsheets, contemporary estimation platforms—exemplified by open-source solutions like **OpenConstructionERP** powered by the **CWICR** (*Construction Works and Resources*) repository—employ a **resource-backed, multi-region catalog engine**.

This report examines the structural architecture, search mechanics, resource decomposition methodology, and lifecycle integration of a Global Cost Database within the broader context of **Bill of Quantities (BOQ) Dynamics**, 5D BIM modeling, and enterprise cost control. Sections 1–5 are a vendor-agnostic reference description of that architecture. Section 6 evaluates DCOS's own Quantity Surveying module against it, and Section 7 turns the gap analysis into a phased feature roadmap.

---

## 1. Scale, Scope & Global Coverage

A robust Global Cost Database must accommodate regional market differences, currencies, trade classifications, and national regulatory standards without fragmenting the underlying data model.

### 1.1 Regional Market Editions & Scope
* **120,000+ Cost Items Across 48 Market Editions:** Provides localized unit rates, currency conversions, and multi-language descriptions across 48 economic regions.
* **55,000+ Core CWICR Items:** Built on open research from the *DataDrivenConstruction* lab, the CWICR dataset standardizes work items across 12 major trade categories:
  * Earthworks & Site Preparation
  * Substructure & Concrete Works
  * Masonry & Brickwork
  * Structural Steel & Metalwork
  * Roofing, Waterproofing & Insulation
  * Facades & Fenestration
  * HVAC & Mechanical Systems
  * Electrical & Telecommunications
  * Plumbing & Drainage
  * Interior Finishes & Drywall
  * Landscaping & Civil Works
  * Equipment & Temporary Works (Preliminaries)

### 1.2 Integration of Official National Cost Standards
The database integrates official national cost bases and classification hierarchies directly into its catalog structure:

| Country / Region | Official Cost Standard | Classification Framework | Primary Currency |
| :--- | :--- | :--- | :--- |
| **Germany / DACH** | DIN 276 / GAEB | Cost Groups (KG 100–700) | EUR |
| **United Kingdom** | NRM 1 / NRM 2 / RICS | Elemental / Work Section | GBP |
| **United States** | MasterFormat / UniFormat | CSI Divisions (00–48) | USD |
| **Turkey** | BirimFiyat (12,361 works) | National Ministry Norms | TRY |
| **China (Beijing)** | GB/T 50500 (11,312 works) | Municipal Quantity Norms | CNY |
| **Russia / CIS** | GESN / FER / TER (55,719 works) | Federal Resource Norms | RUB |
| **Brazil** | SINAPI (9,723 compositions) | Analytical Compositions | BRL |
| **Spain (Andalusia)** | BCCA / FIEBDC-3 (BC3) | Regional Tariffs | EUR |
| **Italy (Tuscany)** | Prezzario Regionale | Regional Price Book | EUR |

---

## 2. Resource-Based "Recipe" Architecture

The fundamental technical advancement of modern cost databases is the shift from **flat unit rates** to **composite resource recipes**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      BOQ POSITION UNIT RATE                             │
│                  e.g., $295.00 / m³ Concrete Wall                       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│   LABOR HOURS    │        │ MATERIAL QUAN.   │        │ EQUIPMENT TIME   │
│ • Mason: 1.2 hrs │        │ • Concrete: 1m³  │        │ • Pump: 0.15 hrs │
│ • Helper: 0.8 hrs│        │ • Rebar: 120 kg  │        │ • Crane: 0.10 hrs│
└──────────────────┘        └──────────────────┘        └──────────────────┘
```

### 2.1 The 3-Element Cost Head Split
Behind every work item itemized in the database sits a multi-component recipe defined by three foundational cost heads:
1. **Labor Hours by Trade:** Quantitative trade hours (e.g., formworker, steel fixer, electrician) derived from national labor constants.
2. **Material Quantities & Specifications:** Raw material consumption rates per unit measure, including waste factors and binding wire/lap allowances.
3. **Machine & Equipment Operational Time:** Plant and heavy equipment operational hours (e.g., concrete pump, tower crane, excavator).

### 2.2 Dynamic Portfolio Re-Pricing
Because BOQ line items remain linked to the underlying resource catalog rather than static numbers:
* When a local wage rate, steel supply index, or fuel price changes in the master catalog, the platform can automatically recalculate every linked estimate and BOQ position across a firm's entire active portfolio.
* Multi-currency projects can maintain local material supply in local currency (e.g., Turkish lira) while consolidating final estimate totals in standard reporting currencies (e.g., USD or EUR).

---

## 3. Search Mechanics & Semantic AI Matching

Accessing over 120,000 cost items quickly requires a hybrid search architecture combining traditional relational queries with artificial intelligence.

### 3.1 Dual Vector Search Engine
To support semantic search—where users can search by intent rather than exact keyword matches (e.g., searching *"foundation wall"* retrieves *"reinforced partition C30/37 with formwork"*):
* **Sentence-Transformer Embeddings:** Descriptions are converted into dense numerical vectors in multi-dimensional space.
* **LanceDB Backend:** Embedded, in-process vector database running **384-dimensional embeddings** locally with zero server overhead.
* **Qdrant Backend:** Optional production vector server utilizing **3072-dimensional pre-built snapshots**.

### 3.2 AI & Computer Vision Cost Matching
When draft estimates are auto-generated from construction site photos (via computer vision models like GPT-4o + YOLO), flat PDF drawings, or plain text prompts:
1. The AI engine generates a draft BOQ with estimated quantities and preliminary rates.
2. A **CostDB Matching Pass** queries the regional cost database via vector similarity.
3. Guessed AI prices are replaced with verified, audit-ready regional market unit rates.

---

## 4. BOQ Dynamics & Lifecycle Workflow Integration

A Global Cost Database reaches its full value when integrated seamlessly into the complete quantity surveying lifecycle:

```
┌──────────────────────────┐      ┌──────────────────────────┐      ┌──────────────────────────┐
│  CAD / BIM / PDF QTO     │ ───► │   BOQ EDITOR & RULES     │ ───► │  5D EVM & CASH FLOW      │
│  (Multi-Format Ingest)   │      │  (AG Grid + Validation)  │      │  (S-Curve & Forecasting) │
└──────────────────────────┘      └────────────┬─────────────┘      └──────────────────────────┘
                                               │
                                   ┌───────────▼───────────┐
                                   │  GLOBAL COST DATABASE │
                                   │ (Resource Rates & DB) │
                                   └───────────────────────┘
```

### 4.1 Digital Measurement to BOQ Linkage
* **Multi-CAD Ingest:** Converters parse IFC, RVT, DWG, and DGN files into structured quantities.
* **Bulk Element Linking:** 3D WebGL viewers allow quantity surveyors to select 3D building elements (e.g., 100 BIM walls) and bulk-link them directly to a cost database item, transferring aggregated volumes (\(m^3\)) and areas (\(m^2\)) into the estimate.

### 4.2 Automated Rule Validation & Compound Markups
* **42 Background Validation Rules:** Before tendering, the system screens estimates for missing quantities, zero rates, duplicate positions, and classification compliance (e.g., DIN 276 or MasterFormat hierarchy).
* **Compounding Markups:** Net totals derived from resource rates are adjusted by structured markups applied in compounding order:
  $$\text{Net Total} \longrightarrow +\text{Overhead (\%)} \longrightarrow +\text{Profit (\%)} \longrightarrow +\text{Contingency (\%)} \longrightarrow +\text{VAT/Tax (\%)}$$

### 4.3 4D/5D Post-Contract Financial Control
* **Earned Value Management (EVM):** Linked BOQ cost baselines automatically generate 4D Gantt schedules and calculate live EVM metrics (**SPI, CPI, Estimate at Completion [EAC]**, and **Variance at Completion [VAC]**).
* **Change Orders & Final Accounts:** Priced BOQ lines serve as the reference benchmark for issuing variations, certifying monthly interim payment applications, and settling audit-ready final accounts upon project close-out.

---

## 5. Summary & Strategic Recommendations

1. **Adopt Resource-Based Costing:** Move away from static unit rate sheets toward composite recipes (Labor + Material + Equipment) to ensure rapid re-pricing in volatile markets.
2. **Standardize Classification Schemas:** Implement national standards (MasterFormat, DIN 276, NRM) within the cost database to enable cross-project portfolio benchmarking.
3. **Leverage Semantic Vector Search:** Implement vector search backends (LanceDB/Qdrant) to reduce estimator search time and eliminate descriptive naming discrepancies.
4. **Connect Takeoff to 5D Models:** Unify quantity takeoff (2D DWG, 3D BIM, PDF) with the central cost database to ensure real-time financial updates whenever project designs evolve.

---

## 6. Applicability to DCOS's Quantity Surveying Module — Gap Analysis

The sections above describe a generic reference architecture. This section evaluates DCOS's actual, current Quantity Surveying module against each concept, with direct file and migration citations. The overall picture is more favorable than a typical gap analysis assumes: DCOS already implements the core resource-recipe architecture and has genuinely schedule-linked 5D EVM — stronger, in that respect, than the reference framing. A smaller number of items are real, well-defined gaps, and one item (BOQ rate freezing on lock) is a deliberate design choice the reference architecture's "auto-recalculate everything" framing would get wrong if copied literally.

### 6.1 Resource-recipe costing (cf. §2)

**Has:** DCOS already implements the full 3-level recipe pattern — `dwl_resources` (`supabase/migrations/20260720000003_dwl_phase1_resources.sql`) → `dwl_work_item_resources` (recipe lines: consumption + waste %, `20260720000006_dwl_phase2_work_items.sql`) → `dwl_assembly_items` (design-ratio recipe of work items, `20260720000008_dwl_phase3_assemblies.sql`). Each level has a live derived-rate view (`dwl_v_work_item_rates`, `dwl_v_assembly_rates`) that recomputes from the latest resource price automatically. Price rows carry an effective landed cost (discount, delivery, handling, tax) on top of the base unit price.

**Difference, not a gap:** DCOS's resource category split is 4-way — `material | labor | equipment | subcon` — rather than the reference architecture's 3-element Labor/Material/Equipment split. This is a framing difference (Subcontract as its own head reflects how DCOS's commercial team actually works), not a missing capability.

### 6.2 National classification standards (cf. §1.2)

**Has:** `budget_codes` / `budget_code_groups` (`20260711000003_budget_codes.sql`) — a proprietary, firm-standard elemental classification (A.00–Z.70), explicitly documented as "the firm's standard elemental cost classification, reused per tender," not derived from an external standard.

**Gap:** No mapping to DIN 276, RICS NRM, or CSI MasterFormat exists anywhere in the schema or current docs, even though MasterFormat was the stated basis of an earlier, now-superseded classification (`Old/06-QS-Cost-Control-System-Guide.md`) and is still referenced as historical framing in `01-Business-Requirement.md` and `03-BOQ-Design.md` §4. See §7 (Phase 2b) for a proposed reconciliation.

**Out of scope here:** `budget_codes` (A–Z, used by BOQ/DWL) and the separate `budget_package_sections` table (A–F, used by document numbering, `02-Budget-Code-Design.md` §2.1) are two internally overlapping classification schemes. That duplication is already tracked under the ongoing QS module consolidation work and is not re-litigated in this document.

### 6.3 Multi-currency / multi-region (cf. §1.1, §2.2)

**Has:** Real per-project currency support — `qs_project_currency` (one base currency per project) and `qs_exchange_rates` (project-scoped, point-in-time FX rates), plus a currency/exchange-rate pair settable per BOQ header.

**Gap:** No structured region or country key exists on `dwl_resources` or `dwl_resource_prices` — only a free-text `location` field defaulting to "Phnom Penh." There is no concept of selectable regional "market edition" rate libraries; DCOS is implicitly single-region.

### 6.4 Dynamic re-pricing (cf. §2.2)

**Has, and genuinely live where it should be:** At the library level, `dwl_v_current_prices`/`dwl_v_work_item_rates`/`dwl_v_assembly_rates` are plain SQL views that recompute from the latest append-only `dwl_resource_prices` row on every query — no trigger or background job is needed; this already matches the reference architecture's "instant recalculation" expectation.

**Deliberately not propagated once picked or locked — correct, not a gap:** When a rate is picked into a BOQ line, it snapshots to a frozen value (`tender_boq_items.rate_build_up`). Staleness against the current library rate is detected and shown as a badge (`getBoqItemStaleness` in `apps/web/lib/tender-cost-service.ts`), and propagation requires an explicit, user-triggered "Refresh from Library" action (`commitBoqLibraryRefresh`). Once a BOQ or contract is locked or carried over (`qs_boq.status='locked'`, `qs_price_list_items`, `qs_contract_snapshots`), prices are permanently frozen by design. **This should not change**: a signed contract's rates must not silently move because a supplier's price changed in the library afterward. The reference architecture's "automatically recalculate every linked estimate across the portfolio" (§2.2) is the right behavior for draft estimates, and the wrong behavior for locked contracts — DCOS already draws that line correctly.

### 6.5 Search mechanics (cf. §3.1)

**Gap — genuine:** There is no semantic or vector search anywhere in DCOS today. Material search (`apps/web/components/qs/dwl-materials-list-page.tsx`), cost-item search (`dwl-cost-item-library-list-page.tsx`), and QTO item search (`apps/web/lib/qto-service.ts:436`) are all plain client-side `.includes()` substring filters or Postgres `ILIKE`. No embedding, vector database, or AI package exists in `apps/web/package.json`.

### 6.6 AI & computer vision matching (cf. §3.2)

**Has, narrowly:** A single AI-assisted workflow exists for material-spec data entry (`14-AI-Prompt_Material_Spec_Row_Generator.md`) — a copy-paste prompt a human runs manually in an external LLM chat tool, with output re-keyed into Excel and imported through a controlled, human-reviewed bulk-import pipeline (`13-SOP_Material_Specification_Price_Recording.md`). There is no in-app AI call, no automatic supplier/material matching, and no vector-similarity price-matching pass.

### 6.7 Digital measurement → BOQ linkage (cf. §4.1)

**Has:** QTO already has a real, FK-backed link into BOQ — `qto_boq_links` maps `qto_item_id ↔ boq_item_id` with a contribution quantity (`apps/web/lib/qto-service.ts`, `docs/.../11-QTO-Module-Design.md` §19). This is a genuine relational linkage, not manual copy-paste. QTO itself, however, is 2D manual on-screen measurement against PDF; DWG files are stored and opened externally, not parsed.

**The highest-leverage gap in this whole document:** A separate, genuinely working IFC/BIM 3D viewer already exists in the Design module (`apps/web/components/bim/ifc-viewer.tsx`, built on `web-ifc`/`three.js`/`@thatopen/components`), with a one-click "Extract Takeoff" action (`bim-toolbar.tsx`) that pulls IFC Property Set quantities into a staging table, `bim_element_takeoff` (`20260717000004_create_bim_element_takeoff.sql`, whose own header comment describes it as "non-destructive staging data... a human later reviews/aggregates these rows into a real BOQ"). No code anywhere connects `bim_element_takeoff` to `qto_items`, `qto_boq_links`, `qs_boq_items`, or `tender_boq_items` — the hard technical work (IFC parsing, 3D rendering, quantity extraction) is already built and working, it simply dead-ends before reaching QS. See §7 Phase 1a.

### 6.8 Automated BOQ validation rules (cf. §4.2, first bullet)

**Gap — genuine, at both layers:** No CHECK constraint enforces a positive quantity or rate on `qs_boq_items` (both default to `0`, unrestricted), no uniqueness constraint prevents duplicate item codes, and no application-level function validates a BOQ before it moves from `approved` to `locked` (`updateBoqBaselineStatus` in `apps/web/lib/qs-service.ts` only stamps status). QTO already has a comparable validation-rule pattern for measurements (superseded-drawing block, non-negative quantity, unit-family match, segregation of duties — `11-QTO-Module-Design.md` §22) that a BOQ-level equivalent could mirror.

### 6.9 Compounding markups (cf. §4.2, second bullet)

**Different from the reference model — a commercial decision, not a bug:** DCOS computes Overhead% and Profit% independently off the same shared base (Direct Cost + Preliminaries combined), rather than sequentially compounding Profit on top of Overhead-on-top-of-Net as the reference formula describes (`20260711000009_tender_bid_summaries_oh_profit_base_fix.sql`, verified against a real contractor's tender cover sheet per its own migration comment). Contingency and Risk Allowance are flat dollar amounts, not percentage-driven, despite percentage fields existing on the type. VAT% is the only value applied to a genuinely final subtotal. **`[TBD — human to confirm]`**: whether DCOS should adopt strict sequential compounding, or whether the current parallel-percentage-on-shared-base model (already validated against a real tender document) is the intended commercial practice.

### 6.10 5D EVM & cash-flow (cf. §4.3) — a strength, not a gap

DCOS's EVM is genuinely schedule-linked, not cost-only: `calculateEvmFromTasks` (`apps/web/lib/evm-service.ts`) reads real `wbs_tasks.baseline_start_date`/`baseline_finish_date` to derive Planned Value, and blends it with BOQ-sourced Budget at Completion and cost-transaction Actual Cost. The S-curve / cash-flow forecast has a genuinely auto-derived path — `get_scurve_series` and `capture_progress_snapshot` (`20260908000001_scurve_series.sql`, `20260531000009_create_snapshot_rpc.sql`) compute planned/actual progress and cost directly from `wbs_tasks` baseline dates and budgets — alongside a separate manual monthly baseline-entry tool (`qs_cost_baseline`) for cases where a hand-tuned curve is wanted. This already exceeds the reference architecture's framing of EVM as something that merely "automatically generates" from a BOQ baseline; DCOS's version is genuinely tied to the live 4D schedule.

---

## 7. Recommended DCOS Feature Roadmap

Phased by risk and effort. Each item names the exact existing DCOS tables/services it extends — none of these require rebuilding what already exists.

### Phase 1 — low risk, connects pieces that already exist, no new dependencies

**a. Bridge `bim_element_takeoff` into QTO/BOQ.** The IFC extraction, 3D viewer, and staging table already work (§6.7). Add a review-and-promote step — modeled on QTO's existing "approve measurement" pattern — that lets a QS user select staged `bim_element_takeoff` rows and create/link `qto_items` (or `qs_boq_items` directly), reusing `qto_boq_links` for the linkage. This closes the single largest gap in this document for the least new engineering, because the hard part (BIM parsing) is done.

**b. BOQ pre-lock validation rule engine.** Add a validation pass — missing quantity, zero rate, duplicate item code, budget-code compliance — that runs before `updateBoqBaselineStatus` allows a transition from `approved` to `locked`, mirroring the rule-table pattern QTO already has (`11-QTO-Module-Design.md` §22). Additive; does not change existing BOQ data or the freeze-on-lock behavior in §6.4.

*Status (2026-09-25): implemented at the application layer.* Rules live in `apps/web/lib/qs-boq-validation.ts`; `updateBoqBaselineStatus` and `updateBoq` (`apps/web/lib/qs-service.ts`) refuse a lock while any error remains, and the builder's Lock/Re-lock button opens `components/qs/boq-lock-dialog.tsx`. Errors block: empty BOQ, blank description/unit, negative quantity or rate, duplicate item code, and zero quantity or rate on a priced main-works/variation/supplement item. Warnings do not block: the same zero cases on provisional or preliminary items, duplicate item number, missing item code, missing budget code, inactive budget code. It is advisory only — RLS on the BOQ tables is open and nothing in the database blocks a locked row being edited, so the procurement BOQ editor and direct API calls can still bypass it. **`[TBD — human to confirm]`**: a database trigger/RPC backstop, and validating at award conversion (`carryOverBoq`/`carryOverPreliminaries` insert already-locked rows without checks).

*Correction to §6.8:* two of the six QTO rules cited above as the pattern to mirror — "quantity ≥ 0" and "measurement unit must match the quantity unit family" — are documented in `11-QTO-Module-Design.md` §22 but are not implemented in `qto-service.ts` or the database (only the superseded-drawing block, formula-finite check and preparer-cannot-approve rules are). The BOQ validator above is therefore the first place a non-negative quantity check actually runs (QTO items themselves are still unchecked); unit-family matching is not implemented anywhere yet.

### Phase 2 — moderate effort, additive, no schema-breaking change

**a. Semantic search over the resource/cost-item/element libraries.** Add Postgres `pgvector` (available as a standard Supabase extension) and a lightweight embedding step over `dwl_resources`, `dwl_cost_items`/Cost Item Library, and the Element Library, to replace or augment today's `.includes()`/`ILIKE` search (§6.5). Scope this to search only — not AI-drafted BOQ generation — as the safer first increment; the existing manual AI-prompt workflow (§6.6) is left untouched.

*Status (2026-09-25): implemented as hybrid search.*
- **Index.** `public.qs_library_search` (migration `20260925000002_qs_library_search.sql`) is one index over resources (`dwl_resources` plus material attributes), element descriptions, and elements that have no descriptions. Sync triggers keep it current. It combines Postgres full-text search, `pg_trgm` trigram matching (typos, substrings, codes) and a `pgvector` embedding, fused by reciprocal rank in `search_qs_library()`.
- **Embeddings.** They come from the built-in `gte-small` model (384 dimensions) inside the Supabase edge runtime, with no API key and no third party. `qs-library-search` embeds the query. `qs-library-embed` fills rows whose embedding is missing, including rows added or edited since the last run, via a "Refresh search" button on the Material Master and Element Library pages. Both functions are in `supabase/functions/`.
- **Keyword fallback.** If the edge function is unavailable, the app calls the RPC keyword-only (`apps/web/lib/qs-library-search.ts`).
- **Surfaces wired so far:**
  - the tender BOQ element picker
  - the price-list element picker (which previously had no search)
  - the Material Master list and the two resource pickers used when building cost items
  - the Element Library page (which can now search description text)
  The other library search boxes still filter client-side.
- **Operational notes:**
  - The edge runtime caps CPU per request, so the embed worker processes a small slice per call (budget `QS_EMBED_TIME_BUDGET_MS`, default 700 ms). Backfilling the 1,683 local rows took about 90 s.
  - Edge functions reach production only through the user's `/dbpush functions`.
  - Re-embedding after edits is on demand (the Refresh button), not automatic. **`[TBD — human to confirm]`**: a scheduled refresh (pg_cron plus pg_net) needs per-environment function URLs and secrets.
  - Assemblies, work items and the remaining search boxes can join the same index and hook later.

**b. External classification crosswalk.** Add an optional pair of columns to `budget_codes` (e.g. `external_standard`, `external_code`) so firms or clients that need MasterFormat/NRM/DIN 276 cross-referencing can record it, without replacing the proprietary A–Z scheme (§6.2). This also reconciles the pre-existing MasterFormat references in `01-Business-Requirement.md`, `03-BOQ-Design.md` §4, and the archived `Old/06-` guide, which currently point at a standard the live schema doesn't actually implement.

*Status (2026-09-25): implemented as a mapping table, not a pair of columns.* Most A–Z codes are elemental, so a single code usually spans several MasterFormat divisions (for example C.01 External Wall covers 04/05/07/08), and clients often want two standards at once. A pair of columns could hold neither case.
- **Table.** `public.budget_code_external_refs` (migration `20260925000003_budget_code_external_refs.sql`) holds any number of references per code. Each has a standard (`csi_masterformat`, `csi_uniformat`, `rics_nrm1`, `rics_nrm2`, `din_276`, `other`), a code, an optional title and version, and an optional primary flag. There is one primary per code per standard, enforced by a partial unique index.
- **Keyed on the budget code's `id`,** because codes are editable in the UI.
- **Budget Codes page.** Refs are edited inline in `apps/web/app/dashboard/tenders/budget-codes/page.tsx`, gated by the existing `qs_libraries` permissions.
- **Tender submission print.** It shows a code's primary refs next to its heading.
- **No mappings are seeded.** The crosswalk is a QS judgement call, entered by the team.

### Phase 3 — larger, needs a product or vendor decision

**a. In-app AI-assisted quantity/BOQ drafting from drawings or photos.** Builds on the Phase 1a BIM bridge and the existing manual AI-prompt workflow (§6.6), moving toward an integrated LLM call rather than a copy-paste prompt. **`[TBD — human to confirm]`**: this requires adding an AI SDK dependency and an ongoing inference cost, which is a vendor and budget decision, not purely an engineering one.

*Status (2026-09-25): implemented with the Anthropic Claude API (vendor chosen by the product owner).* The flow is draft first, then review.
- **Entry point.** On the tender BOQ tab, **AI Draft from Drawing** is gated by `tender_boq.can_create`. The QS picks either:
  - a current (not superseded or obsolete) PDF revision from the tender's QTO drawing register, with up to 20 pages, or
  - a PNG/JPEG image of up to 5 MB.
  An optional instruction can be added.
- **Route.** `apps/web/app/api/tenders/[tenderId]/ai-boq-draft/route.ts` cuts only the selected pages out with `pdf-lib`, then sends them to `claude-opus-5` with:
  - a cached system prompt of QS measurement rules (measure only what is shown, never invent dimensions, net quantities, no rates)
  - structured output: summary, warnings, and lines with unit, quantity or null, basis, location, section, confidence and assumptions
  Off-list units are mapped onto the BOQ unit list; any unit that can't be mapped becomes `ls` with low confidence.
- **Library matching.** Each line gets its top-3 matches from the Phase 2a hybrid search.
- **Review.** Nothing is written to `tender_boq_items` until the QS accepts lines in the review table (`ai-boq-draft-dialog.tsx`), where they can:
  - edit the description, unit and quantity
  - pick a library match, which prices the line from the element description's net rates plus the tender margins
  - set the required budget code
  Low-confidence and unmeasured lines start unticked. Accepted items carry `AI draft <id> · basis · assumptions` in `notes`.
- **Audit and cost.** Every run, including failed and refused runs, is logged with its token usage in `tender_ai_boq_drafts` (migration `20260925000004`), with the number of lines accepted.
- **Data and configuration:**
  - The drawing pages are sent to Anthropic.
  - The key `ANTHROPIC_API_KEY` is server-only, set in `.env.local` and in the Vercel project env. Without it, the route returns `NOT_CONFIGURED`.
  - Server-side refusal fallbacks (`fallbacks: "default"`) are enabled.
  - The route allows up to 300 s (`maxDuration`).

**b. Multi-region "market edition" rate libraries.** Only relevant if DCOS expands its estimating scope beyond its current Cambodia-focused operation (§6.3).

*Status (2026-09-25): deferred by the product owner.* Not until work outside Cambodia is being priced.

### What should not change

BOQ and contract rate freezing on lock (§6.4) is correct commercial practice, not a gap to close. Any future work here should preserve that a locked BOQ or a carried-over post-contract price list never silently re-prices itself against a later library change.

---

## 8. References

* `docs/04-Business-Modules/12-Quantity-Surveying/02-Budget-Code-Design.md` — `budget_codes` vs. `budget_package_sections`, cited in §6.2.
* `docs/04-Business-Modules/12-Quantity-Surveying/03-BOQ-Design.md` §4 — MasterFormat framing referenced in §6.2.
* `docs/04-Business-Modules/12-Quantity-Surveying/07-SOP_Direct_Works_Cost_Library_Module.md` and `08-SOP_Direct_Works_Library_Tender_BOQ_Integration.md` — the resource-recipe library described in §6.1.
* `docs/04-Business-Modules/12-Quantity-Surveying/10-QS-Element-Library-Design.md` — element classification referenced in §6.2 and §7 Phase 2a.
* `docs/04-Business-Modules/12-Quantity-Surveying/11-QTO-Module-Design.md` §19 (QTO→BOQ integration), §22 (validation rules), §27–28 (BIM/AI roadmap notes) — cited throughout §6.7, §6.8, §7.
* `docs/04-Business-Modules/12-Quantity-Surveying/12-Material-Specification-Price-Recording-Design.md`, `13-SOP_Material_Specification_Price_Recording.md`, `14-AI-Prompt_Material_Spec_Row_Generator.md` — the existing manual AI-assisted workflow, cited in §6.6.
* `supabase/migrations/20260720000003_dwl_phase1_resources.sql`, `20260720000006_dwl_phase2_work_items.sql`, `20260720000008_dwl_phase3_assemblies.sql` — resource-recipe schema, §6.1.
* `supabase/migrations/20260711000003_budget_codes.sql` — classification schema, §6.2.
* `supabase/migrations/20260613000001_qs_multi_currency.sql` — currency schema, §6.3.
* `supabase/migrations/20260711000009_tender_bid_summaries_oh_profit_base_fix.sql` — markup formula, §6.9.
* `supabase/migrations/20260717000004_create_bim_element_takeoff.sql` — BIM staging table, §6.7.
* `supabase/migrations/20260908000001_scurve_series.sql`, `20260531000009_create_snapshot_rpc.sql` — auto-derived S-curve, §6.10.
* `apps/web/lib/tender-cost-service.ts`, `qs-service.ts`, `evm-service.ts`, `qto-service.ts` — service-layer evidence throughout §6.
* `apps/web/components/bim/ifc-viewer.tsx`, `bim-toolbar.tsx` — the existing IFC viewer and "Extract Takeoff" action, §6.7.
* QS module consolidation plan (tracked separately, not duplicated here) — `budget_codes`/`budget_package_sections` internal overlap noted in §6.2.

*End of DCOS-DS-12-015 Draft.*
