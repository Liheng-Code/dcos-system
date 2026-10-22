# Procurement (key: `procurement`)

> Mapped 2026-10-22 from code, migrations and docs. Code wins if it disagrees; fix this file.

## 1. Purpose and pages
- Covers suppliers and prequalification, then PR → (budget confirmation) → RFQ → quotations → award → PO, followed by delivery, goods receipt and invoice matching.
- **Release:** `release.ts` has no `procurement` key, so the code default is `development`. But `20260724000004_seed_nav_item_settings.sql` seeds 16 procurement rows as active, so what actually shows depends on the DB.
- Manifest `lib/modules/manifests/procurement.ts` (RBAC module `procurement`), nav from `PROCUREMENT_GROUPS` in `lib/procurement/procurement-nav.ts`.
- **Overview:** dashboard, `/analytics`, `/boq` (BOQ reference).
- **Suppliers:** `/supplier-portal` (`?sub=rfqs|pos|delivery`), `/suppliers`, `/prequalification`, `/supplier-performance`.
- **Sourcing & Receiving:**
  - `/pr` (new, `[id]`, edit, budget-confirmation), `/rfq` (new, `[id]`), `/po` (new, `[id]`).
  - `/auto-reorder`, `/goods-receipt`, `/invoice-matches`, `/notifications`, `/audit-log`.
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
- **Triggers:**
  - `trg_check_pr_item_quantity` (`20260729000003`) blocks requisitioning more than `qs_boq_items.quantity`.
  - PR/PO status feeds Planning's `task_constraints` (`20260919000019`).
- **RPC:** `procurement_award_rfq(uuid, uuid, text)` (security invoker, granted to authenticated). It's the only server-side business rule in the module.
- **RLS (confirmed):**
  - Every procurement table has `to authenticated using (true)` for select, insert, update and delete ("MVP; tighten later", never tightened).
  - Exceptions: notifications are limited to the recipient; the audit log is select and insert only.
  - The only `has_permission('procurement', …)` check is inside the award RPC.

## 3. Code map
- **`lib/procurement/`:**
  - `procurement-queries.ts`: client-side data access per table, `getRfqComparisonData`, `awardRfq` (calls the RPC). It also reads and writes `qs_boq_items`, `qs_boq_sections`, `qs_v_boq_requisition_status` and `inv_items`.
  - `rfq-comparison.ts` (pure, mirrors the SQL rules: `buildRfqComparison`, `requiredReasonLength`, `MAX_AWARD_REASON_LENGTH=2000`).
  - `supplier-prequalification-service.ts`.
  - `procurement-nav.ts`.
- **Components:** `pr-form`, `pr-detail`, `rfq-form`, `rfq-detail`, `rfq-comparison`, `po-form`, `po-detail`, `goods-receipt-form`, `invoice-match-*`, `budget-confirmation-*`, `supplier-*`, `auto-reorder`, `use-procurement-permissions`.
- **Public API (`PUBLIC_API.procurement`):** `procurement-nav.ts`, and `components/procurement/raise-pr-from-boq-dialog.tsx` (`RaisePrFromBoqDialog`).

## 4. Invariants
- **Award, enforced in `procurement_award_rfq`:**
  - The caller needs `has_permission('procurement','rfq','approve')`.
  - The RFQ is `quotations_received` or `under_evaluation` and not already awarded, and **the RFQ creator cannot award it**.
  - The quotation belongs to the RFQ and is not rejected or expired.
  - A reason is required, 1–2000 characters. The minimum rises to 20 for an override of the recommendation, another currency, missing lines, or fewer than 3 quotes, and to 50 for a single source.
- **What the award writes, in one transaction:** RFQ `awarded` plus a recommendation snapshot, other quotations `rejected`, and a draft PO with lines copied from the quotation.
- **UI mirrors:** `rfq-detail.tsx` (statuses + `can("rfq","approve")`) and `rfq-comparison.tsx` (creator check). These mirror the RPC; they are not the enforcement.
- **No PR requisitions more than the BOQ quantity** (DB trigger).
- **Not enforced on the server:**
  - PR and PO status transitions and segregation of duties (BR-18): they're client-side `update` calls in `pr-detail.tsx` / `po-detail.tsx`.
  - Numbering:
    - The award RPC makes POs as `PO-YYYY-<6 hex>`, but `po-form.tsx` uses `{project}-{company}-PO-NNN`, worked out client-side as max+1, which can race.
    - PRs are also numbered max+1 client-side.
    - RFQs are `RFQ-YYYY-<4 chars>`.
    - None of these match the documented `{PROJ}-PO-{YYYY}-{NNNN}`.

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
- **Tests:** only `lib/procurement/__tests__/rfq-comparison.test.ts`. Nothing tests the RPC or the components.
- **Security (highest priority):**
  - `using (true)` RLS on all tables.
  - No tenant isolation on most tables.
  - Award fields can be written directly outside the RPC.
  - No server-side transition or segregation-of-duties guard.
- **Confirmed bugs (local DB 2026-10-22):**
  - `lib/inventory/inv-service.ts` filters `procurement_pos` by `tenant_id`, a column that doesn't exist.
  - `lib/account/account-service.ts:221` selects `procurement_suppliers.company_name`, a column that doesn't exist (it's `supplier_name`).
- **Cleanup:** the award dialog uses a native `<textarea>` and radios. Switch to the new `components/ui/textarea` / `radio-group`. Unify PO numbering.
- **Docs:** `docs/04-Business-Modules/04-11-Procurement/` 01–12 is the target design, mostly not implemented (`company_id` on every table, no DELETE, value-band authority, `proc.*` permission codes). Two files are both numbered 12.
