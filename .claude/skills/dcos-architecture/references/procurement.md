# Procurement (key: `procurement`)

> Mapped 2026-10-22 from code, migrations and docs; updated the same day after the P0–P2 hardening merge (`a9a8b6b`, doc `04-11/13`). Code wins if it disagrees; fix this file.

## 1. Purpose and pages
- Covers suppliers and prequalification, then PR → (budget confirmation) → RFQ → quotations → award → PO, followed by delivery, goods receipt and invoice matching.
- **Release:** `release.ts` has no `procurement` key, so the code default is `development`. But `20260724000004_seed_nav_item_settings.sql` seeds 16 procurement rows as active, so what actually shows depends on the DB.
- Manifest `lib/modules/manifests/procurement.ts` (RBAC module `procurement`), nav from `PROCUREMENT_GROUPS` in `lib/procurement/procurement-nav.ts`.
- **Overview:** dashboard, `/analytics`, `/boq` (BOQ reference).
- **Suppliers:** `/supplier-portal` (`?sub=rfqs|pos|delivery`), `/suppliers`, `/prequalification`, `/supplier-performance`.
- **Sourcing & Receiving:**
  - `/pr` (new, `[id]`, edit, budget-confirmation), `/rfq` (new, `[id]`), `/po` (new, `[id]`).
  - `/auto-reorder`, `/goods-receipt`, `/invoice-matches`, `/notifications`, `/audit-log`.
- **Settings:** `/approval-bands` (value bands and exchange rates; editable with `po.configure`, read-only otherwise). It's hidden by default like the rest of the module until it's released.
- Pages are thin client shells around components. There are **no `app/api` routes**, and `ProcPermissionGuard` is used by no page.

## 2. Data model
- **Core flow (`20260531000005`):**
  - `procurement_suppliers`: status active/inactive/blacklisted/suspended. Has `tenant_id` and `supplier_name`; **no `company_name`**.
  - `procurement_prs`: project_id, wbs_node_id, task_id; approval_status draft/submitted/under_budget_review/approved/returned/rejected/closed/cancelled.
  - `procurement_pr_items`.
  - `procurement_pos`: status draft/submitted/approved/issued/partially_delivered/delivered/closed/on_hold/cancelled (+ under_invoice_match). **No `tenant_id`.**
  - `procurement_po_items`, `procurement_delivery_notes`, `procurement_goods_receipts`.
- **RFQ (`20260531000006`):**
  - `procurement_rfqs`: status draft/issued/quotations_received/under_evaluation/awarded/rejected_all/cancelled.
  - `procurement_rfq_suppliers`.
  - `procurement_quotations`: status pending/evaluated/awarded/rejected, `is_awarded`.
  - `procurement_quotation_items`.
  - Adds `rfq_id` / `quotation_id` on POs.
- **Comparison and award (`20261022101310`):**
  - `procurement_quotation_items.lead_time_days`, `notes`.
  - `procurement_rfqs.recommended_supplier_id`, `recommended_quotation_id`, `awarded_by`, `award_overrides_recommendation`, `award_exception`, `created_by`.
  - A guarded unique index on `procurement_pos.po_number`.
- **Other tables:**
  - `procurement_invoice_matches` (`…0007`), `procurement_notifications` + PR/PO status triggers (`…0012`), `procurement_audit_log` + `proc_audit_trigger` on the core tables (`…0013`).
  - Supplier PQ: `supplier_pq_records`, `supplier_pq_documents`, `supplier_approved_trades`, `supplier_performance_scores` (`20260531000057`).
  - Budget confirmations + items (`20260729000005`), `procurement_po_revisions` (`20260729000010`).
  - `procurement_inventory` was created (`…0014`) and dropped (`20260727000009`).
- **Hardening (P0–P2, `20261022130910` … `20261022153000`):**
  - New columns on workflow tables: `created_by` (forced to `auth.uid()`), `submitted_by` / `submitted_at`, `status_reason`, `status_changed_by` / `status_changed_at`.
  - `procurement_approval_bands`: value bands per doc 07 §4. Seeded holders: L0/L1 band 5, L2 band 4, L3 band 3; bands 1–2 have no holders.
  - `procurement_fx_settings` (base currency USD) and `procurement_fx_rates` (append-only). Procurement no longer reads `exchange_rates` / `currencies`.
  - `procurement_number_seq`: race-safe numbering.
- **Triggers:**
  - `trg_check_pr_item_quantity` (`20260729000003`) blocks requisitioning more than `qs_boq_items.quantity`.
  - PR/PO status feeds Planning's `task_constraints` (`20260919000019`).
  - `proc_transition_guard`: status, approval and award columns change only inside the transition functions (`dcos.proc_transition`).
  - `proc_edit_lock_guard`: content is locked once a record leaves draft (PRs, POs, RFQs, quotations + items, invoice matches).
  - `proc_force_created_by`, `proc_insert_provenance_guard`: clients can't set provenance or insert pre-approved rows.
  - `proc_numbers_immutable`: numbers can't change after insert.
  - `proc_invoice_match_amounts`: invoice-match amounts and variance are computed on the server.
  - Band guards (`proc_bands_identity_guard`, `proc_bands_validate_trigger`) and FX guards (`proc_fx_rates_guard`, `proc_fx_base_guard`).
  - `proc_audit_trigger` (security definer) on every table, including budget confirmations. Audit rows of sealed quotations are hidden via `proc_audit_row_visible`.
- **RPCs (all security definer):**
  - `procurement_transition_pr | _po | _rfq | _invoice_match(p_id, p_to, p_reason)`
  - `procurement_confirm_budget(p_pr_id, p_header, p_items)`
  - `procurement_award_rfq(p_rfq_id, p_quotation_id, p_reason)`
  - `procurement_score_quotation(p_id, p_technical, p_commercial)`
  - `procurement_sync_po_delivery(p_po_id)`
  - `procurement_next_number(p_kind, p_project_id, p_year)`
  - `procurement_po_band_info(p_po_id)`, `procurement_set_approval_bands(p_bands)`
  - Helpers: `proc_check_sod`, `proc_require_permission`, `proc_clean_reason`, `proc_user_max_band`, `proc_po_required_band`, `proc_po_base_amount`, `proc_rfq_bids_open(_at)`, `proc_today` (Asia/Bangkok).
- **RLS:**
  - Every `procurement_*` / `supplier_*` table checks `(select has_permission('procurement', <resource>, …))`: select = view, insert = can_create, update = edit.
  - No delete policies, except PR/PO items on editable parents. Budget confirmations have no client writes.
  - Audit log: no client insert. Notifications: recipient only, no client insert.
  - Quotations, quotation items and their audit rows are **sealed**: hidden until the end of the RFQ deadline date (Bangkok), with no admin bypass. The person who entered a quote sees their own.
  - No project scoping yet (decision D1, deferred to P3). Users without procurement permission see nothing, which includes the dashboard and control-room counts and the Inventory GRN PO picker.

## 3. Code map
- **`lib/procurement/`:**
  - `procurement-queries.ts`: client-side data access per table, plus wrappers for the transition, award, budget, scoring and band RPCs (`procErrorMessage` maps `PROC_*` errors to messages). It also reads and writes `qs_boq_items`, `qs_boq_sections`, `qs_v_boq_requisition_status` and `inv_items`.
  - Pure mirrors of the SQL rules, with tests:
    - `procurement-transitions.ts`: transition tables, segregation of duties, reason rules.
    - `approval-bands.ts`: band selection and uplift.
    - `rfq-comparison.ts`: `buildRfqComparison`, `requiredReasonLength`, `MAX_AWARD_REASON_LENGTH=2000`.
  - `supplier-prequalification-service.ts`.
  - `procurement-nav.ts`.
- **Components:** `pr-form`, `pr-detail`, `rfq-form`, `rfq-detail`, `rfq-comparison`, `po-form`, `po-detail`, `goods-receipt-form`, `invoice-match-*`, `budget-confirmation-*`, `supplier-*`, `auto-reorder`, `use-procurement-permissions`, `reason-dialog` (reject / return / cancel / override), `approval-bands-settings` + `fx-rates-section`, `transition-style.ts`.
- **Public API (`PUBLIC_API.procurement`):** `procurement-nav.ts`, and `components/procurement/raise-pr-from-boq-dialog.tsx` (`RaisePrFromBoqDialog`).

## 4. Invariants
- **Award, enforced in `procurement_award_rfq`:**
  - The caller needs `has_permission('procurement','rfq','approve')`.
  - The RFQ is `quotations_received` or `under_evaluation` and not already awarded, and **the RFQ creator cannot award it**.
  - The quotation belongs to the RFQ and is not rejected or expired.
  - A reason is required, 1–2000 characters. The minimum is **50** for an override of the recommendation (BR-09, D3) and for a single source; 20 for another currency, missing lines, or fewer than 3 quotes.
  - Award and scoring are refused while bids are sealed.
- **What the award writes, in one transaction:** RFQ `awarded` plus a recommendation snapshot, other quotations `rejected`, and a draft PO with lines copied from the quotation and a server-assigned number.
- **Status changes only through the transition functions** (`proc_transition_guard`). A direct update raises `PROC_TRANSITION_RPC_ONLY`.
  - Each function checks the allowed transition with compare-and-set, and the permission field for the step (submit / approve / reject / edit).
  - A reason is required for reject, return and cancel.
- **Segregation of duties (BR-18):** the approver can't be the creator or the submitter, admins included (`proc_check_sod`). The quotation scorer can't be the person who entered it.
- **No delete (BR-16, D2):** cancel with a reason (PR) or deactivate (supplier).
- **Content locks once a record leaves draft** (`proc_edit_lock_guard`).
- **Value bands (BR-05, D5):** PO approval requires the approver's maximum band ≥ the PO's required band, otherwise `PROC_BAND_EXCEEDED`.
  - The required band uses the base-currency value (the greater of the header and the line sum), at the FX rate of the approval date.
  - It rises by +1 for an override or single-source award, or an over-budget PR.
  - Bands change only through `procurement_set_approval_bands` (`po.configure`, audited as critical).
- **Sealed bids (BR-07):** quotations are invisible until the end of the RFQ deadline date (Bangkok). Cancel / reject-all doesn't open them early. Issuing an RFQ needs a deadline ≥ today.
- **Numbering:** `{PROJ}-{PR|PO|RFQ}-{YYYY}-{NNNN}` (e.g. `PJR-2026-003-PO-2026-0001`), assigned by the server (`procurement_number_seq`) and immutable. Older numbers were left as they were. Unique indexes on PR, RFQ and PO numbers.
- **No PR requisitions more than the BOQ quantity** (DB trigger).
- **Invoice-match amounts and variance are computed on the server.**
- **UI mirrors** (`procurement-transitions.ts`, `approval-bands.ts`, `rfq-comparison.ts`) only shape the screens; the database is the enforcement.

## 5. Integration points
See `integration-map.md`, rows tagged **Procurement**.
- **QS BOQ → PR:** `boq-builder.tsx` opens `RaisePrFromBoqDialog`, which inserts the PR with `boq_item_id`. A quantity trigger guards it, and `qs_v_boq_requisition_status` reports back.
- **Inventory GRN ← PO:**
  - `inv_grns.po_id` / `inv_grn_lines.po_item_id`. `lib/inventory/inv-service.ts` requires the PO to be approved, issued or partially delivered, and blocks over-receipt.
  - Procurement's own `goods-receipt-form` writes separate delivery notes and goods receipts. That's a second receipt path.
- **Account AP:** `ap_invoices` references supplier, `po_id` and `gr_id` (`20260531000028`).
- **Planning:** PR/PO status → `task_constraints` (`lib/planning/constraint-feed-mapping.ts`). PRs carry `task_id`.
- **Inventory → Procurement:** auto-reorder creates draft PRs.
- **Suppliers:** `procurement_suppliers` has no link to `stakeholders`, and is separate from QS `dwl_suppliers`. Subcontract `vendor_id` references `procurement_suppliers`.
- **Direct table access from outside the module:** `lib/dashboard/dashboard-queries.ts`, `lib/control-room-service.ts`, Inventory, Account.

## 6. Status and gaps
- **Built:** the full PR→RFQ→award→PO flow, budget confirmation, goods receipt, invoice match, prequalification, notifications and audit log.
- **Hardened 2026-10-22: P0–P2 of doc 13 done** (merge `a9a8b6b`).
- **Tests:**
  - Vitest: `lib/procurement/__tests__/` covers rfq-comparison, procurement-transitions, approval-bands and sealed-bids.
  - SQL acceptance suites: `docs/04-Business-Modules/04-11-Procurement/tests/` (P1 153/153, P2 123/123, run in rolled-back transactions).
  - No browser tests.
- **Fixed:** the Inventory `tenant_id` filter and the Account `company_name` column (`7005df5`).
- **Remaining gaps:**
  - Supplier PQ / status / blacklist can be written directly with `supplier.edit`.
  - Goods receipts and PO revisions aren't append-only, and there's no over-receipt cap.
  - An override approve doesn't need a higher-level approver, and there's no SoD exception register.
  - Band 5 has no step-up authentication (D6), no band delegation, and no dual-custody bid opening (BR-08).
  - Project scoping (P3, D1) and PQ eligibility plus QS writes through the public API (P4).
- **Open decisions:**
  - Roles without procurement permission now see 0 in other modules' widgets (dashboard, control room, Inventory GRN picker; supplier-portal logins too). Accept that, or gate the widgets.
  - The FX rate date: the approval date was chosen by the lane, not confirmed by the user.
  - Release of the module and the Approval Bands page (`release.ts`).
  - Holders for bands 1–2.
- **Security outside the module:**
  - The `procurement-attachments` storage bucket is public, so sealed quotation PDFs can be read via their URL. Make it private with signed URLs (core).
  - `exchange_rates` / `currencies` let any signed-in user write, including flipping `is_base` (owner: Account/QS).
- **Before `/dbpush`:** check production for PO lines with a delivered quantity but no goods receipts, because `procurement_sync_po_delivery` recomputes it from receipts.
- **Cleanup:** the award dialog still uses a native `<textarea>` and radios. Switch to `components/ui/textarea` / `radio-group`.
- **Docs:** `docs/04-Business-Modules/04-11-Procurement/` 01–12 is the target design, mostly not implemented (`company_id` on every table, no DELETE, value-band authority, `proc.*` permission codes). Two files are both numbered 12.
