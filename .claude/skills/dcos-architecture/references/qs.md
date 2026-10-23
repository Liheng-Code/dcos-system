# Quantity Surveying (key: `qs`)

> Mapped 2026-10-22 from code, migrations and docs. Code wins if it disagrees; fix this file.

## 1. Purpose and pages
- **Pre-contract:** tenders, the cost and rate library, estimation, BOQ, bid.
- **Post-contract:** contract BOQ, cost control, VOs, IPC/claims, retention, subcontracts, contract admin.
- **Release:** `release.ts` has no `qs` key, so every page is `development`. Manifest `lib/modules/manifests/qs.ts` (RBAC modules `qs` and `tender`), nav from `QS_GROUPS` in `lib/qs/qs-nav.ts`.
- **Tender & Estimate:**
  - `/dashboard/tenders/{register, tender-management, cost-estimation, submissions, bid-evaluation}`, `budget-codes`, `cost-library` (Prelim Cost Library).
  - `unit-rates` is legacy and not in the nav.
- **Cost & Rate Library:** `/dashboard/qs/dwl-*` (materials, divisions, labour, equipment and subcontractor rates, resources, suppliers, price approvals, price dashboard, import). `dwl-cost-items`, `dwl-estimate` and `element-library` are also here; `dwl-work-items` and `dwl-assemblies` are hidden. `cost-database` holds saved tender BOQ versions.
- **QTO:** `/dashboard/qto`, `/dashboard/qto/[id]`.
- **AI:** `app/api/tenders/[tenderId]/ai-boq-draft` drafts a BOQ from a drawing (logged to `tender_ai_boq_drafts`; it never writes the BOQ).
- **Post-contract:**
  - `/dashboard/qs` (dashboard, with cost-control, contingency, portfolio, audit and currency tabs), `overview`, `boq`, `boq/[id]`, `evm`.
  - `claims` (IPC, sub-IPCs, retention, advance recovery, payments), `claims/[id]/certify`, `variations`.
  - `/dashboard/subcontractors` (+ back-charges, performance notices) and `/dashboard/contracts/{register, notices, employer-instructions, correspondence, entitlements}`.

## 2. Data model
- **Tender tables:**
  - `tender_register` + invitations, addenda, queries and submissions (`20260531000054`).
  - `tender_boq_items` (`total_amount` generated as qty × rate) and `tender_bid_summaries` (`…055`).
  - `tender_award_records` (`…056`), `tender_price_list` (`20260717000003`), `tender_preliminaries_items` (`20260711000007`), `tender_prelim_settings` + `prelim_library_items` (`20260717000007`).
  - `project_precontract_details` (`20260712000001`), `tender_returnables` (`20260925000005`).
  - `tender_workstreams` + the `tender_stage` column (`20260928000001`), `tender_bid_approvals` (`…02`), `tender_cost_databases` (+ items, `…09`).
  - `tender_boq_item_alternates` (`20261022101055`).
- **QS WBS templates:**
  - `qs_wbs_templates` / `_items` / `_locations` (`20261020000007`).
  - `qs_wbs_template_planning_links` (`20261021000017`), `tender_qs_wbs_template_applications` (`…18`).
  - Lifecycle with an immutability trigger (`…19`, `…20`), node kinds (`…21`), `prelim_profiles` (`…13`).
- **Post-contract:**
  - `qs_boq` (`20260614000001`), `qs_boq_items` (`20260531000023`), `qs_cost_transactions` (`…024`).
  - `qs_variation_orders` (`…032`), `qs_progress_claims` + `qs_claim_items` (`…033`), `qs_retention_ledger` (`…034`), `qs_advance_recovery_ledger` (`20260728000002`), `qs_claim_approvals` (`…03`).
  - `qs_cost_baseline` (`20260612000003`), `qs_audit_log` (`…04`), `qs_contract_snapshots` (`20260725000001`).
  - `qs_element_library` (`20260722000009`), `qs_library_search` (`20260925000002`).
- **Contracts and QTO:** `subcontracts` + `subcontract_ipcs` (`20260531000049`), `contract_register` (`…051`), `qto_*` (`20260805000001`).
- **Cost & Rate Library (`dwl_*`):**
  - `dwl_resources` + `dwl_resource_prices` (`20260720000003`), `dwl_work_items` (`…06`), `dwl_assemblies` (`…08`).
  - Tenant-isolated through `profiles.company_id` (`…17`). The legacy rate tables are frozen read-only (`20260721000002`).
- **Core CSI library (2026-10-23, `20261023122000`; see `docs/01-DCOS-Foundation/DCOS-CSI-Division-Standard.md`):** QS divisions are now the core `csi_divisions` / `csi_sections` (MasterFormat 2016), edited in Administration > Master Libraries > CSI Divisions.
  - `dwl_material_categories.division_code` → FK `csi_divisions`. `qs_cost_divisions.csi_division_code` and `qs_cost_sections.csi_section_code` are FKs (trigger `qs_cost_division_csi_default` rejects a non-CSI code).
  - `dwl_work_items.csi_section_code` / `csi_division_code` (nullable FKs; trigger `dwl_work_item_csi_sync`). Backfilled for 86 of 305 items; the rest need classifying.
  - `qs_wbs_template_items.masterformat_code` → FK `csi_sections`, `NOT VALID`.
  - **Frozen:** `dwl_material_divisions` and `dwl_material_division_sections` (writes rejected; dropped in a later cleanup). The Material Divisions page is read-only with a link to Administration.
  - Old FK `dwl_material_categories` → `dwl_material_divisions` still limits categories to the old 25 codes until cleanup.
  - Planning reads the new RPCs `plan_act_csi_division_counts()` and `plan_act_bank_search(q text, p_division_code text)`, which filter `dwl_work_items` by CSI division.
- **Triggers:**
  - `tender_lock_guard` on 12 tender pricing tables + `tender_commercial_items` + alternates.
  - `qs_audit_trigger_fn()` on tender BOQ tables and alternates.
  - `tender_boq_item_alternates_prepare`: rounds the rate to 2 dp and forces `tender_id` from the parent.
- **Functions:** `tender_is_locked(uuid)`, `tender_boq_promote_alternate(uuid)` (security invoker), `can_award_tender(uid)` (`20260928000004`).
- **Views:** `dwl_v_resource_costing_rates` (`20260928000011`) is **the one rate every costing view uses**: `coalesce(all_in_rate, effective_unit_cost, unit_price)`. Also `dwl_v_work_item_explosion`, `dwl_v_assembly_costing_summary`, `account_budget_vs_actual`.
- **RLS:**
  - Most tender and `qs_*` tables: `using (true)` for any authenticated user.
  - `dwl_*`: tenant-isolated.
  - QS WBS templates: `can_manage_master_libraries()`.
  - `qs_risk_items` and `qs_contract_snapshots`: extra insert policies through `can_award_tender`.

## 3. Code map
- **Services in `lib/qs/`:**
  - `qs-service.ts` (~3.1k lines): post-contract BOQ, cost, VOs, claims and IPC approvals, retention, advance recovery, contingency, budget revisions, currency, GFA, award carry-over, BOQ-for-PR queries.
  - `tender-cost-service.ts` (~2.6k lines): tender BOQ, `rate_build_up`, price list, prelims, bid summaries, cost/m², QS WBS template instantiation, alternates, `isTenderLocked`.
  - `tender-lifecycle.ts`: stages and workstreams. `tender-approval.ts`: bid approval gate and submission. `tender-value.ts`: which figure is the tender value.
  - `prelim-library-service.ts`, `boq-alternates.ts` (pure), `qto-service.ts`, `contract-service.ts`, `tender-cost-database.ts`, `tender-ai-boq-draft.ts`, `qs-library-search.ts`, `qs-wbs-template-{profiles,planning-links}.ts`.
- **Components:** `components/qs/boq-builder.tsx`, `cost-control.tsx`, `progress-claim-list.tsx`, `certification-page.tsx`, `variation-order-list.tsx`, ~50 `dwl-*` pages and dialogs, `tenders/{cost-estimation, cost-library, element-library, submissions}`, `qto/*`.
- **Public API (`PUBLIC_API.qs`):**
  - `qs-nav.ts`.
  - `public.ts`: `getContractSnapshot`, `getPostcontractKpis`, `getWbsBudgetRollup`, `getWbsCommercialSummary`, `carryOver{Boq,Preliminaries,PriceList,Risks}`, `createContractSnapshot`, `createQsBoqItem`, `getBoqList`, `getBoqSections`, plus print and PR types (`BoqItemForPr`).
  - `public-tender.ts`: `createTenderBoqItem`, `getBudgetCodes`, `getQsWbsTemplates`, `getQsWbsTemplateDetails`, the QS↔Planning link list/save/deactivate, plus print types.
  - `tender-lifecycle.ts`, `tender-value.ts`, `tender-approval.ts`, `hooks/use-tender-permissions.ts`, `components/qs/cost-control.tsx`.

## 4. Invariants
- **Price lock.** Pricing is locked while `tender_stage` is in internal_review, approval, submitted, awaiting_result, awarded, unsuccessful or closed.
  - Enforced in the DB by `tender_is_locked` + `tender_lock_guard` (`20260928000002`). Every **new tender pricing table must get the guard.**
  - One exception: status-only updates on `tender_bid_summaries`.
  - Admin escape hatch: `set local dcos.tender_unlock = 'on'`. The normal way back is Return to Tendering, or an addendum re-opening the tender.
- **`tender_stage` belongs to `tender-lifecycle.ts`.** `setTenderStage` checks the transition table and compare-and-sets on the expected stage, and keeps legacy `award_status` in sync. This is a convention, with no DB check, so never update `tender_stage` directly.
- **Tender value** = the approved `bid_price`, then the latest `tender_bid_summaries` revision, then legacy `estimated_value` (`tenderValue()`). Management approval freezes `bid_price`.
- **Alternates never count** in Direct Works, the tender total or the bid summary: `getDirectWorksTotal` reads only `tender_boq_items` (rule ALT-1, doc 19).
- **Unit rate** = `labor_net*(1+labor%) + material_net*(1+material%)` (`boqUnitRate`).
- **`rate_build_up`** is a frozen jsonb snapshot, replaced wholesale on Refresh.
  - `basis: "installed_cost"` means a Cost Item Library pick; no basis means a recipe explosion.
  - Equipment and subcontract fold into material. The 10% guardrail warns and never blocks.
- **Award converts in place** (`components/project/projects/award-conversion-dialog.tsx`):
  - stage `awarded`, `project_type` 'tender'→'awarded', `contract_value` set;
  - `carryOver*` + `createContractSnapshot`;
  - Planning baseline set from the tender programme.

## 5. Integration points
See `integration-map.md`, rows tagged **QS**.
- **Planning:** the tender bridge dialog through `lib/planning/public`; `cost-scurve` through `planning/schedule-service`; DB tables `plan_act_qs_bridge`, `plan_act_quantity_links`; IPC progress through `get_node_progress_asof`.
- **QS↔Planning template links:** edited in Administration's Master Libraries through `public-tender`.
- **Procurement:** `boq-builder` opens Procurement's public `RaisePrFromBoqDialog`. Procurement **also reads and writes `qs_boq_items` / `qs_boq_sections` directly**, outside the QS public API.
- **Project core:** precontract screens drive `tender-lifecycle` and `tender-approval`; `wbs-cost-tab` uses `public`. QS imports `lib/project/wbs/wbs-template` and `lib/project-categories`.
- **Design/BIM:** BOQ promotion calls `createTenderBoqItem` / `createQsBoqItem`.
- **Construction:** subcontractor pages use the public `dr-subcontract-measurement`.
- **Licensing:** a tender counts toward the licence only once `tender_stage = 'awarded'` (`20261019000001`).

## 6. Status and gaps
- **Built:** tender lifecycle, estimation, library and BOQ, prelims by category, QS WBS templates (doc 18 still marked incomplete), alternates, post-contract BOQ, VO, IPC and retention. **Nothing is released.**
- **Tests:** only `lib/qs/__tests__` (boq-alternates, material-fingerprint, material-import-classify, tender-value). There are no tests for the lifecycle, the approval flow, the lock or the big services.
- **Security:** `using (true)` RLS on most tender and `qs_*` tables.
- **Not enforced in the DB:** the tender_stage transitions, and the post-contract BOQ `baseline_status` lock (app-side `checkBoqForLock`; DB unverified).
- **Dead or legacy:** `pullFromUnitRateLibrary` has no callers; the unit-rates page.
- **Open items:** provisional sums and dayworks are not linked to the cost library (OQ-8); the `cost_per_m2_internal` permission has nothing to gate.
- **Docs:** `docs/04-Business-Modules/12-Quantity-Surveying/` (00–19; 18 = WBS templates, 19 = alternates ALT-1..9) and `21-IPC-Progress-Claim/` (01–12, R0, mostly draft).
