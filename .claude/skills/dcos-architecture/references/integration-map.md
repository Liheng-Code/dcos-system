# Cross-module integration map

Every place one module reads, writes or calls another. A change to a row here is cross-module: run it from the main window or as an Agent Team (`/lanes team`), not inside one lane.

Mechanism key:
- **public**: through the owner's `PUBLIC_API` file (allowed).
- **db**: a shared table, FK, trigger or RPC.
- **direct**: imports or queries another module's internals (a debt: route it through public or core).

> Mapped 2026-10-22 for Planning, QS and Procurement (Procurement rows updated after the P0–P2 hardening merge). Rows that involve only pending modules aren't listed yet.

| From → To | What | Mechanism | Where | Notes |
|---|---|---|---|---|
| QS → Planning | Tender BOQ → activity quantities and durations (bridge) | public + db | `components/qs/tenders/cost-estimation/tender-planning-bridge-dialog.tsx` → `lib/planning/public.ts`; `plan_act_qs_bridge`, `plan_act_quantity_links`, `plan_task_work` | Doc 21. Bridge phases 1–3 are built. |
| Planning → QS | Reads BOQ lines for the bridge, BOQ mapping and productivity | db (direct read) | `lib/planning/activity-library/qs-bridge-service.ts`, `boq-mapping-service.ts`, `productivity-service.ts` read `qs_boq_items`, `tender_boq_items` | Read-only. |
| Planning → QS | Activity Database reads the QS cost library: `dwl_work_items`, `dwl_work_item_resources`, `dwl_resources`; FK `plan_act_master_work_items.work_item_id` → `dwl_work_items` | db (direct read + FK) | `lib/planning/activity-library/activity-database-service.ts`; migration `20261023091500` | Read-only. M/E hrs are edited in QS `/dashboard/qs/dwl-work-items`. Open: may Planning write `dwl_work_item_resources`? Doc 23. |
| QS → core CSI | Material categories, cost divisions/sections, work items and WBS template items reference the core MasterFormat 2016 library | db (FK) + core service | `dwl_material_categories.division_code`, `qs_cost_divisions.csi_division_code`, `qs_cost_sections.csi_section_code`, `dwl_work_items.csi_section_code`, `qs_wbs_template_items.masterformat_code`; `lib/csi-divisions.ts` | `20261023122000`. Edited in Administration > Master Libraries > CSI Divisions (`can_manage_master_libraries()`). Old `dwl_material_divisions*` frozen. |
| Planning → core CSI | Activity masters carry a CSI division and section; visible code `D<div>-NNN`; division pane and bank search | db (FK) + core service | `plan_act_masters.csi_division_code/csi_section_code`, `plan_act_division_counters`; `plan_act_csi_division_counts()`, `plan_act_bank_search(text, text)`; `lib/csi-divisions.ts` | Shared key with QS: the same division finds BOQ items (`dwl_work_items.csi_division_code`) and activities. `plan_act_divisions` frozen. See `docs/01-DCOS-Foundation/DCOS-CSI-Division-Standard.md`. |
| Planning → QS | Task progress for IPC certification | db | RPC `get_node_progress_asof` (`20260919000013`) | |
| QS → Planning | Cost S-curve | public | `components/qs/cost-scurve.tsx` → `lib/planning/schedule-service.ts` | |
| Admin → QS + Planning | QS template ↔ Planning template links | public | `components/administration/qs-wbs-planning-link-editor.tsx` → `lib/qs/public-tender.ts`; `qs_wbs_template_planning_links` | |
| Project → QS + Planning | Award conversion: stage, carry-over, contract snapshot, Planning baseline | public | `components/project/projects/award-conversion-dialog.tsx` → `lib/qs/tender-lifecycle.ts`, `lib/qs/public.ts`, `lib/planning/baseline-service.ts` | Award converts in place. |
| Project → QS | Tender lifecycle and approval driven from project screens | public | `precontract-detail.tsx`, `precontract/*`, `tender-board` → `tender-lifecycle.ts`, `tender-approval.ts` | `tender_stage` only through `setTenderStage`. |
| QS → Procurement | Raise a PR from BOQ lines | public | `components/qs/boq-builder.tsx` → `components/procurement/raise-pr-from-boq-dialog.tsx` | |
| Procurement → QS | Reads and **writes** `qs_boq_items` / `qs_boq_sections`; requisition status | **direct** + db | `lib/procurement/procurement-queries.ts`; view `qs_v_boq_requisition_status`; trigger `trg_check_pr_item_quantity` | Debt: writes bypass the QS public API. |
| Procurement → Planning | PR/PO status → task material constraints | db | trigger feed `20260919000019`; `lib/planning/constraint-feed-mapping.ts` | |
| Procurement → Inventory | PO → GRN | db | `inv_grns.po_id`, `inv_grn_lines.po_item_id`; `lib/inventory/inv-service.ts` | Fixed 2026-10-22 (`7005df5`): the `tenant_id` filter is gone. The PO picker only shows POs the user can read under procurement RLS. Procurement also has its own goods-receipt path. |
| Inventory → Procurement | Auto-reorder creates draft PRs | direct | `components/procurement/auto-reorder.tsx`, `inv_items` | |
| Procurement → Account | AP invoices against PO and GR | db | `ap_invoices` (`20260531000028`); `lib/account/account-service.ts` | Fixed 2026-10-22 (`7005df5`): `company_name:supplier_name` alias. |
| Procurement → Construction (subcontracts) | Subcontract vendor is a procurement supplier | db | `subcontracts.vendor_id` → `procurement_suppliers` | |
| HR → Planning | Timesheets → productivity logs | db | trigger `trg_plan_productivity_log_from_timesheet` | |
| Construction ↔ Planning | Daily report → schedule progress; site diary panel | db + public | `sync_daily_report_to_planning`, `dr_sync_version_to_planning`; `@/lib/construction/site/public`; site forms → `lib/planning/work-calendar.ts` | |
| Planning → Document Control | Programme transmittal | db | RPC `create_programme_transmittal`; `documents`, `document_revisions` | |
| Design → QS | BIM quantities → BOQ items | public | `lib/design/bim/bim-boq-promotion-service.ts` → `createTenderBoqItem`, `createQsBoqItem` | |
| Design → Planning | BIM takeoff → activity quantities | db (read) | `bim_models`, `bim_element_takeoff` via `lib/planning/activity-library/bim-quantity-service.ts` | |
| Construction → QS | Subcontract measurement | public | `dr-subcontract-measurement` | |
| Core → Planning | Dashboards, EVM, control room | public | `lib/evm-service.ts`, `lib/control-room-service.ts`, `components/dashboard/*` → `schedule-service.ts` | |
| Core → Procurement | Dashboard and control room counts | **direct** | `lib/dashboard/dashboard-queries.ts`, `lib/control-room-service.ts` | Reads tables directly. Since the hardening, users without procurement view permission get 0 (open decision: gate the widgets by permission). |
| Licensing → QS | A tender counts toward the licence only once awarded | db | `20261019000001_licensing.sql` | |
