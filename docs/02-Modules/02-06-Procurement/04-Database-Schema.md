# DCOS — Module 04-11 Procurement
## Document 04 — Database Schema

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-04 |
| Version | R1 |
| Database | PostgreSQL 15+ / Supabase |
| ERD Group | Group G (Procurement & Stock) — extended |
| Source | Generated from migrations; hand-annotated |
| Status | For Development |

---

## 1. Conventions

| Convention | Rule |
|---|---|
| Primary keys | `uuid` default `gen_random_uuid()` |
| Tenant column | Every table carries `company_id uuid NOT NULL` with RLS enabled — no exception |
| Project column | Every transactional table carries `project_id uuid NOT NULL` |
| Money | `numeric(18,4)`; never `float` |
| Quantity | `numeric(18,4)` |
| Currency | `char(3)` ISO 4217, plus `_base` twin column for company base currency |
| FX | Every money row stores `fx_rate numeric(18,8)` and `fx_rate_date` snapshot — never recalculated |
| Timestamps | `timestamptz`, UTC |
| Audit columns | `created_by`, `created_at`, `updated_by`, `updated_at` on every table |
| Soft delete | `cancelled_at`, `cancelled_by`, `cancellation_reason` — **no `DELETE` is permitted on any table in this module** |
| Status | `text` with `CHECK` constraint, not `enum` type (enums are painful to alter in production) |
| Naming | `snake_case`, singular table names |

---

## 2. Entity Relationship Overview

```text
material_requisition ──< material_requisition_line
        │ (m:n via pr_mr_link)
purchase_requisition ──< purchase_requisition_line ──> boq_item / wbs_node
        │                        └──< pr_budget_check
        │                        └──< pr_budget_override
        ▼
rfq ──< rfq_line
 │   └──< rfq_invited_supplier
 │   └──< rfq_clarification
 │   └──  rfq_opening_event (1:1)
 ▼
quotation ──< quotation_line
 │      └──< quotation_evaluation
 ▼
comparative_bid_analysis ──< cba_line_comparison
 ▼
purchase_order ──< purchase_order_line ──< po_delivery_schedule
 │   ├──< purchase_order_amendment ──< po_amendment_line
 │   ├──< po_call_off ──< po_call_off_line
 │   ├──< po_expediting_log
 │   ├──< advance_shipping_notice ──< asn_line
 │   ├──< po_document
 │   └──> cost_commitment (06-01 Cost Engine)
        │
        ▼ (referenced, not owned)
goods_receipt_note (04-12) · material_approval_request (04-13) · supplier (04-10) · invoice (06-08)
```

---

## 3. Table Definitions

### 3.1 `material_requisition`

| Column | Type | Null | Description |
|---|---|---|---|
| mr_id | uuid PK | | |
| company_id | uuid FK | N | Tenant — RLS key |
| project_id | uuid FK | N | |
| mr_no | text | N | `P001-MR-2026-0184`, unique per project |
| wbs_node_id | uuid FK | N | Header WBS location |
| discipline | text | N | ARC / STR / MEP / CIVIL / TEMP / GEN |
| requested_by | uuid FK | N | app_user |
| requested_date | date | N | |
| required_on_site_date | date | N | |
| priority | text | N | Normal / Urgent / Emergency |
| justification | text | Y | Mandatory when priority ≠ Normal |
| status | text | N | See Doc 02 §3.3 |
| source_channel | text | N | WEB / MOBILE / MOBILE_OFFLINE |
| device_timestamp | timestamptz | Y | Offline capture time — differs from `created_at` |
| consolidated_pr_id | uuid FK | Y | Set when consolidated |
| reviewed_by / reviewed_at | uuid / timestamptz | Y | |
| rejection_reason | text | Y | |
| cancelled_at / cancelled_by / cancellation_reason | | Y | |

**Indexes:** `(company_id, project_id, status)`, `(wbs_node_id)`, `(requested_by, status)`, `(required_on_site_date)` partial where status not closed.
**Constraint:** `UNIQUE (project_id, mr_no)`.

### 3.2 `material_requisition_line`

| Column | Type | Null | Description |
|---|---|---|---|
| mr_line_id | uuid PK | | |
| mr_id | uuid FK | N | ON DELETE RESTRICT |
| company_id / project_id | uuid FK | N | Denormalised for RLS |
| line_no | int | N | |
| item_id | uuid FK | Y | Item master; null when free text |
| free_text_description | text | Y | One of `item_id` / this is required |
| specification | text | Y | |
| quantity | numeric(18,4) | N | > 0 |
| uom | text | N | |
| wbs_node_id | uuid FK | N | Defaults from header |
| linked_task_id | uuid FK | Y | |
| required_date | date | N | |
| stock_available_qty | numeric(18,4) | Y | Snapshot at submission |
| fulfilled_from_stock_qty | numeric(18,4) | Y | Default 0 |
| status | text | N | Open / Consolidated / Stock Issued / Cancelled |
| pr_line_id | uuid FK | Y | Back-reference after consolidation |

**Constraint:** `CHECK (item_id IS NOT NULL OR free_text_description IS NOT NULL)`.

### 3.3 `purchase_requisition`

| Column | Type | Null | Description |
|---|---|---|---|
| pr_id | uuid PK | | |
| company_id / project_id | uuid FK | N | |
| pr_no | text | N | Unique per project |
| package_name | text | N | "Rebar — Tower B L1-8" |
| procurement_type | text | N | Material / Service / Plant Hire / Consumable / Free-Issue |
| required_on_site_date | date | N | |
| currency | char(3) | N | |
| estimated_value_txn | numeric(18,4) | N | |
| estimated_value_base | numeric(18,4) | N | |
| fx_rate / fx_rate_date | numeric(18,8) / date | N | |
| budget_status | text | N | WITHIN / MARGINAL / EXCEEDED / OVERRIDE_APPROVED / NO_BUDGET_LINE |
| single_source_flag | boolean | N | Default false |
| single_source_justification | text | Y | Mandatory when flag true |
| is_emergency | boolean | N | Default false |
| emergency_po_id | uuid FK | Y | For retrospective regularisation |
| regularisation_due_date | date | Y | |
| prepared_by | uuid FK | N | |
| approval_workflow_id | uuid FK | Y | Approval Engine instance |
| status | text | N | See Doc 02 §4.5 |
| approved_at / approved_by | timestamptz / uuid | Y | |
| rejection_reason | text | Y | |
| cancelled_at / cancelled_by / cancellation_reason | | Y | |

**Indexes:** `(company_id, project_id, status)`, `(budget_status)` partial where `= 'EXCEEDED'`, `(approval_workflow_id)`, `(regularisation_due_date)` partial where not null.

### 3.4 `purchase_requisition_line`

| Column | Type | Null | Description |
|---|---|---|---|
| pr_line_id | uuid PK | | |
| pr_id / company_id / project_id | uuid FK | N | |
| line_no | int | N | |
| item_id | uuid FK | Y | |
| description / specification | text | N / Y | |
| quantity | numeric(18,4) | N | |
| uom | text | N | |
| uom_conversion_factor | numeric(18,6) | N | To BOQ UoM; default 1 |
| wbs_node_id | uuid FK | N | **BR-01** |
| boq_item_id | uuid FK | Y | |
| non_boq_reason_code | text | Y | Required when `boq_item_id` null — **BR-02** |
| qs_endorsed_by / qs_endorsed_at | uuid / timestamptz | Y | Required for non-BOQ lines |
| boq_allowable_rate | numeric(18,4) | Y | Snapshot at PR creation |
| estimated_rate_txn | numeric(18,4) | N | |
| estimated_amount_base | numeric(18,4) | N | |
| variance_vs_boq_pct | numeric(9,4) | Y | Generated column |
| required_date | date | N | |
| mar_required | boolean | N | Permanent works flag |
| mar_id | uuid FK | Y | → 04-13 |
| line_budget_status | text | N | WITHIN / MARGINAL / EXCEEDED |
| awarded_qty | numeric(18,4) | N | Default 0 |
| status | text | N | Open / In RFQ / Awarded / Partially Awarded / Cancelled |

**Constraint:** `CHECK (boq_item_id IS NOT NULL OR non_boq_reason_code IS NOT NULL)`.

### 3.5 `pr_budget_check`

Immutable record of every budget evaluation — the evidence that the check ran.

| Column | Type | Description |
|---|---|---|
| check_id | uuid PK | |
| pr_id / pr_line_id | uuid FK | |
| boq_item_id | uuid FK | |
| allowable_amount / committed_amount / actual_amount / available_amount | numeric(18,4) | Snapshot values |
| requested_amount | numeric(18,4) | |
| result | text | WITHIN / MARGINAL / EXCEEDED |
| checked_at | timestamptz | |
| checked_by | uuid FK | |

**Append-only.** No update, no delete.

### 3.6 `pr_budget_override`

| Column | Type | Description |
|---|---|---|
| override_id | uuid PK | |
| pr_id | uuid FK | |
| variance_amount_base | numeric(18,4) | |
| reason_code | text | RATE_INCREASE / QTY_INCREASE / SCOPE_CHANGE / BOQ_ERROR / VO_PENDING |
| narrative | text | ≥ 100 chars enforced at API |
| recovery_plan | text | VO_CLAIM / VALUE_ENGINEERING / ABSORB_CONTINGENCY |
| linked_vo_id | uuid FK | Nullable → Variation Order module |
| requested_by / requested_at | uuid / timestamptz | |
| qs_endorsed_by / qs_endorsed_at | uuid / timestamptz | |
| approved_by / approved_at | uuid / timestamptz | |
| status | text | Requested / Endorsed / Approved / Rejected |

### 3.7 `pr_mr_link`

| Column | Type | Description |
|---|---|---|
| link_id | uuid PK | |
| pr_line_id / mr_line_id | uuid FK | |
| quantity_taken | numeric(18,4) | Supports partial consolidation |

### 3.8 `rfq`

| Column | Type | Null | Description |
|---|---|---|---|
| rfq_id | uuid PK | | |
| company_id / project_id | uuid FK | N | |
| rfq_no | text | N | |
| title / scope_summary | text | N / Y | |
| issue_date | date | Y | |
| closing_datetime | timestamptz | N | |
| incoterm | text | Y | EXW / FOB / CIF / DDP |
| delivery_location | text | N | |
| delivery_wbs_node_id | uuid FK | Y | |
| payment_terms | text | N | |
| allowed_currencies | text[] | N | |
| required_documents | text[] | Y | |
| evaluation_method | text | N | LOWEST_COMPLIANT / WEIGHTED_SCORE |
| technical_weight_pct / commercial_weight_pct | numeric(5,2) | Y | Sum = 100 when weighted |
| min_bidders_required | int | N | From config band |
| limited_market_justification | text | Y | When invited < minimum |
| status | text | N | See Doc 02 §5.6 |
| bids_opened_at | timestamptz | Y | |
| awarded_at | timestamptz | Y | |

### 3.9 `rfq_line`, `rfq_invited_supplier`, `rfq_clarification`

**`rfq_line`:** `rfq_line_id`, `rfq_id`, `line_no`, `pr_line_id` FK, `description`, `specification`, `quantity`, `uom`, `wbs_node_id`, `boq_item_id`, `required_date`.

**`rfq_invited_supplier`:** `invite_id`, `rfq_id`, `supplier_id` FK (→ 04-10), `pq_status_snapshot`, `pq_category_matched`, `invited_at`, `invited_by`, `contact_email`, `contact_phone`, `viewed_at`, `response_status` (`Not Responded` / `Declined` / `Submitted` / `Late` / `Withdrawn`), `decline_reason`.

**`rfq_clarification`:** `clarification_id`, `rfq_id`, `supplier_id`, `question`, `asked_at`, `answer`, `answered_by`, `answered_at`, `is_broadcast` (answers to all bidders — the fairness control), `broadcast_at`.

### 3.10 `rfq_opening_event` (1:1 with RFQ)

| Column | Type | Description |
|---|---|---|
| opening_id | uuid PK | |
| rfq_id | uuid FK UNIQUE | |
| initiated_by / initiated_at | uuid / timestamptz | User A |
| confirmed_by / confirmed_at | uuid / timestamptz | User B — must differ from A |
| bid_count | int | Bids present at opening |
| quotation_hashes | jsonb | SHA-256 per quotation at moment of opening |
| initiator_ip / confirmer_ip | inet | |

**Append-only, insert-once.** `CHECK (initiated_by <> confirmed_by)`.

### 3.11 `quotation`

| Column | Type | Null | Description |
|---|---|---|---|
| quotation_id | uuid PK | | |
| company_id / project_id / rfq_id | uuid FK | N | |
| quotation_no | text | N | `{RFQ}-Q03` |
| supplier_id | uuid FK | N | |
| supplier_ref | text | Y | Supplier's own reference |
| submission_datetime | timestamptz | N | |
| is_late | boolean | N | Generated: `submission_datetime > rfq.closing_datetime` |
| currency | char(3) | N | |
| validity_days | int | N | |
| validity_expiry_date | date | N | |
| incoterm / delivery_lead_time_days / payment_terms | text / int / text | N | |
| quoted_total_txn | numeric(18,4) | N | **Encrypted at rest until opening** |
| normalised_total_base | numeric(18,4) | Y | Computed post-opening |
| freight_amount / insurance_amount / duty_amount / clearance_amount | numeric(18,4) | Y | Landed-cost build-up |
| discount_amount / discount_basis | numeric(18,4) / text | Y | |
| exclusions | text | Y | |
| is_sealed | boolean | N | False after opening |
| technical_status | text | Y | Compliant / Minor Deviation / Major Deviation / Non-Compliant |
| technical_score / commercial_score / total_score | numeric(6,2) | Y | Weighted method |
| rank | int | Y | |
| is_awarded | boolean | N | Default false |
| original_document_id | uuid FK | Y | Attached PDF |
| original_document_hash | text | Y | SHA-256 of the uploaded original |
| status | text | N | Draft / Submitted / Late / Withdrawn / Opened / Evaluated / Awarded / Unsuccessful |

**Encryption:** `quoted_total_txn` and all `quotation_line` money columns use `pgcrypto` with a per-project key held in the KMS. Views used by the API return `NULL` for these columns when `is_sealed = true`.

### 3.12 `quotation_line`

`quotation_line_id`, `quotation_id`, `rfq_line_id` FK, `line_no`, `supplier_item_ref`, `offered_description`, `offered_specification`, `quantity`, `uom`, `uom_conversion_factor`, `unit_rate_txn` *(encrypted)*, `line_amount_txn` *(encrypted)*, `unit_rate_base`, `normalised_unit_rate_base`, `lead_time_days`, `technical_status`, `deviation_note`, `is_alternative` (bidder's alternative offer), `parent_line_id`.

### 3.13 `quotation_evaluation`

| Column | Type | Description |
|---|---|---|
| evaluation_id | uuid PK | |
| quotation_id / quotation_line_id | uuid FK | Line-level nullable for header eval |
| evaluation_type | text | TECHNICAL / COMMERCIAL |
| evaluator_id | uuid FK | |
| result | text | Compliant / Minor Deviation / Major Deviation / Non-Compliant |
| score | numeric(6,2) | |
| comments | text | Mandatory when result ≠ Compliant |
| evaluated_at | timestamptz | |

### 3.14 `comparative_bid_analysis`

| Column | Type | Description |
|---|---|---|
| cba_id | uuid PK | |
| rfq_id | uuid FK | |
| generated_at / generated_by | timestamptz / uuid | |
| lowest_compliant_quotation_id | uuid FK | |
| recommended_quotation_id | uuid FK | |
| is_lowest_recommended | boolean | Generated comparison |
| deviation_reason_code | text | TECHNICAL_SUPERIORITY / DELIVERY_PROGRAMME / PAYMENT_TERMS / PAST_PERFORMANCE / CLIENT_NOMINATED / WARRANTY / LOCAL_CONTENT |
| deviation_justification | text | ≥ 50 chars when not lowest |
| estimated_saving_base | numeric(18,4) | vs PR estimate |
| variance_vs_boq_base | numeric(18,4) | |
| recommended_by / endorsed_by / approved_by | uuid FK | |
| status | text | Draft / Pending Endorsement / Pending Approval / Approved / Rejected |
| snapshot_pdf_id | uuid FK | Immutable CBA at approval |

### 3.15 `purchase_order`

| Column | Type | Null | Description |
|---|---|---|---|
| po_id | uuid PK | | |
| company_id / project_id | uuid FK | N | |
| po_no | text | N | Unique per project |
| po_type | text | N | STANDARD / BLANKET / SERVICE / PLANT_HIRE / FREE_ISSUE / EMERGENCY |
| current_version | int | N | Default 1 |
| supplier_id | uuid FK | N | |
| supplier_pq_snapshot | jsonb | N | PQ status, categories, expiry at issue — evidence, not a live lookup |
| source_pr_id / source_rfq_id / source_quotation_id | uuid FK | Y | |
| currency | char(3) | N | |
| fx_rate / fx_rate_date | numeric(18,8) / date | N | Snapshot at approval |
| subtotal_txn / tax_amount_txn / total_amount_txn | numeric(18,4) | N | |
| total_amount_base | numeric(18,4) | N | |
| ceiling_amount_txn | numeric(18,4) | Y | Blanket PO only |
| validity_start / validity_end | date | Y | Blanket PO only |
| incoterm / payment_terms / warranty_months | text / text / int | Y | |
| delivery_location / delivery_wbs_node_id | text / uuid | N / Y | |
| advance_payment_pct | numeric(5,2) | Y | |
| retention_pct | numeric(5,2) | Y | Supply retention, rare but real |
| issued_at / issued_by | timestamptz / uuid | Y | |
| acknowledged_at | timestamptz | Y | Supplier acknowledgement — contractual event |
| step_up_assertion_id | text | Y | From 03-01 §6.2 — non-repudiation |
| prepared_by / approved_by / approved_at | uuid / uuid / timestamptz | | `CHECK (prepared_by <> approved_by)` — **BR-18** |
| status | text | N | See Doc 02 §6.9 |
| closed_at / close_reason | timestamptz / text | Y | |
| cancelled_at / cancelled_by / cancellation_reason | | Y | |

**Indexes:** `(company_id, project_id, status)`, `(supplier_id, status)`, `(po_no)`, `(status)` partial where open, `(delivery_wbs_node_id)`.

### 3.16 `purchase_order_line`

| Column | Type | Description |
|---|---|---|
| po_line_id | uuid PK | |
| po_id / company_id / project_id | uuid FK | |
| line_no | int | |
| pr_line_id / quotation_line_id | uuid FK | Traceability back to source |
| item_id / description / specification | | |
| quantity | numeric(18,4) | Ordered |
| uom / uom_conversion_factor | text / numeric | |
| unit_rate_txn / line_amount_txn / line_amount_base | numeric(18,4) | |
| tax_code / tax_rate / tax_amount_txn | text / numeric | |
| wbs_node_id | uuid FK | **NOT NULL** |
| boq_item_id | uuid FK | |
| cost_code_id | uuid FK | |
| mar_id | uuid FK | Permanent works gate — **BR-14** |
| required_date | date | |
| delivered_qty | numeric(18,4) | **Read-only mirror from GRN events** |
| invoiced_qty / invoiced_amount_base | numeric(18,4) | Mirror from Finance |
| returned_qty | numeric(18,4) | |
| expediting_status | text | See Doc 02 §6.6 |
| line_status | text | Open / Partially Delivered / Fully Delivered / Short Closed / Cancelled |

**Constraint:** `CHECK (delivered_qty <= quantity * (1 + over_delivery_tolerance))` enforced at service layer, not DB, because tolerance is configurable.

### 3.17 `purchase_order_amendment` / `po_amendment_line`

**Header:** `amendment_id`, `po_id`, `amendment_no` (`A01`), `version_from` / `version_to`, `amendment_type` (`VALUE_INCREASE` / `VALUE_DECREASE` / `QTY_CHANGE` / `DATE_CHANGE` / `SCOPE_CHANGE` / `ADMIN_CHANGE` / `CANCELLATION`), `reason`, `old_total_base`, `new_total_base`, `delta_base`, `requires_reapproval` (boolean), `approval_workflow_id`, `prepared_by`, `approved_by`, `approved_at`, `issued_at`, `snapshot_pdf_id`, `status`.

**Line:** `amendment_line_id`, `amendment_id`, `po_line_id`, `field_changed`, `old_value` jsonb, `new_value` jsonb.

Bank-detail changes are explicitly **not** permitted here (BR / fraud control) — enforced by a `CHECK` on `field_changed`.

### 3.18 `po_call_off` / `po_call_off_line`

**Header:** `call_off_id`, `po_id` (blanket only), `call_off_no`, `requested_by`, `requested_at`, `delivery_date`, `wbs_node_id`, `total_amount_txn`, `cumulative_before`, `cumulative_after`, `ceiling_remaining`, `approved_by`, `approved_at`, `status`.

**Line:** `call_off_line_id`, `call_off_id`, `po_line_id`, `quantity`, `unit_rate_txn` (must equal the blanket rate — enforced), `amount_txn`, `delivered_qty`.

### 3.19 `po_delivery_schedule`

`schedule_id`, `po_line_id`, `sequence_no`, `scheduled_qty`, `scheduled_date`, `revised_date`, `revision_reason`, `delivered_qty`, `status` (`Planned` / `Confirmed` / `Shipped` / `Delivered` / `Overdue` / `Cancelled`).

### 3.20 `po_expediting_log`

`log_id`, `po_id`, `po_line_id`, `contact_date`, `contacted_by`, `contact_method` (`Phone` / `Email` / `Visit` / `Portal`), `supplier_contact_name`, `status_reported`, `notes`, `next_action_date`, `risk_flag` (boolean), `attachment_id`.

The expediting log is the contemporaneous record that wins a delay claim three years later. Treat it as evidence, not as a nice-to-have.

### 3.21 `advance_shipping_notice` / `asn_line`

**Header:** `asn_id`, `po_id`, `supplier_id`, `asn_ref`, `shipment_date`, `eta_date`, `carrier`, `vehicle_ref`, `container_no`, `document_ids[]`, `status` (`Notified` / `In Transit` / `Customs` / `Arrived` / `Received` / `Cancelled`), `created_via` (`PORTAL` / `MANUAL`).

**Line:** `asn_line_id`, `asn_id`, `po_line_id`, `shipped_qty`, `packing_ref`, `batch_lot_ref` (feeds 04-13 traceability).

### 3.22 `po_document`

`document_id`, `po_id`, `document_type` (`PO_PDF` / `AMENDMENT_PDF` / `QUOTATION` / `CBA` / `TECH_SUBMITTAL` / `CERT` / `PACKING_LIST` / `INVOICE_COPY` / `CORRESPONDENCE`), `version`, `file_path`, `file_hash`, `uploaded_by`, `uploaded_at`, `is_immutable`.

Issued PO and CBA PDFs are written once with `is_immutable = true` and are never regenerated. Regenerating a PDF from live data is how a company ends up unable to prove what it actually sent.

### 3.23 `procurement_config`

`config_id`, `company_id`, `project_id` (nullable — project overrides company), `parameter_key`, `parameter_value` jsonb, `effective_from`, `effective_to`, `updated_by`, `updated_at`. Holds every value in Doc 02 §9.

### 3.24 `long_lead_item`

`long_lead_id`, `company_id`, `project_id`, `item_id`, `description`, `supplier_lead_time_days`, `shipping_days`, `customs_days`, `approval_cycle_days`, `required_on_site_date`, `linked_schedule_activity_id`, `order_by_date` (generated), `current_status`, `linked_pr_id`, `linked_po_id`, `is_critical_path` (mirror from CPM), `risk_status` (`Green` / `Amber` / `Red` / `Breached`).

---

## 4. Row-Level Security

Every table follows the same pattern, per 03-01 §5.5:

```sql
ALTER TABLE purchase_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY po_tenant_isolation ON purchase_order
  USING (company_id = (auth.jwt() ->> 'tid')::uuid);

CREATE POLICY po_project_scope ON purchase_order
  USING (project_id::text = ANY (
    SELECT jsonb_array_elements_text(auth.jwt() -> 'prj')
  ));
```

**Supplier portal isolation** (Phase 3) adds a third policy so an external user sees only their own records:

```sql
CREATE POLICY po_supplier_self ON purchase_order
  USING (
    (auth.jwt() ->> 'typ') <> 'supplier'
    OR supplier_id = (auth.jwt() ->> 'org')::uuid
  );
```

Sealed quotation protection is enforced by a security-definer view, not by application code:

```sql
CREATE VIEW v_quotation_safe AS
SELECT q.quotation_id, q.rfq_id, q.supplier_id, q.submission_datetime,
       q.status, q.is_late,
       CASE WHEN q.is_sealed THEN NULL ELSE q.quoted_total_txn END AS quoted_total_txn,
       CASE WHEN q.is_sealed THEN NULL ELSE q.normalised_total_base END AS normalised_total_base
FROM quotation q;
```

The API never selects from `quotation` directly. Direct table grants are revoked from all application roles.

---

## 5. Key Constraints and Triggers

| Object | Purpose |
|---|---|
| `trg_pr_line_wbs_required` | Rejects insert/update where `wbs_node_id IS NULL` (BR-01) |
| `trg_pr_line_boq_or_reason` | Enforces BR-02 |
| `trg_po_sod_check` | Rejects `approved_by = prepared_by` (BR-18) |
| `trg_po_commitment_post` | On status → `Approved`, inserts `cost_commitment` rows |
| `trg_po_commitment_release` | On status → `Closed` / `Cancelled`, releases residual commitment |
| `trg_blanket_ceiling_check` | Rejects call-off exceeding ceiling (BR-11) |
| `trg_quotation_seal_guard` | Rejects any `SELECT` path on sealed columns outside the safe view; logs CRITICAL audit |
| `trg_no_delete_procurement` | `BEFORE DELETE` on every table → `RAISE EXCEPTION` (BR-16) |
| `trg_po_line_delivered_qty_readonly` | Only the Inventory service role may update `delivered_qty` |
| `trg_audit_emit` | Writes to `audit_logs` per R0 §24.4.5 on every state change |
| `trg_number_allocate` | Atomic sequence allocation per project/year/entity |

---

## 6. Materialised Views for Reporting

| View | Refresh | Purpose |
|---|---|---|
| `mv_committed_cost_by_boq` | Every 15 min + on PO approval | Committed vs allowable per BOQ item |
| `mv_committed_cost_by_wbs` | Every 15 min | Roll-up to WBS tree |
| `mv_po_delivery_status` | Every 5 min | Open PO lines with delivery risk |
| `mv_procurement_cycle_time` | Nightly | MR→PR→RFQ→PO→GRN durations per record |
| `mv_supplier_spend` | Nightly | Spend by supplier, trade, project, period |
| `mv_savings_analysis` | Nightly | PR estimate vs awarded vs BOQ allowable |
| `mv_three_way_match_status` | Every 15 min | Match, exception, and ageing |

Reports read views. Reports never scan transaction tables directly — a QS running a company-wide committed cost report at month-end should not be able to slow down a site engineer raising an MR.

---

## 7. Retention and Archiving

| Data | Active | Archive | Justification |
|---|---|---|---|
| PO, PO lines, amendments | Project + 3 years | 10 years | Contract limitation period |
| Quotations and CBA | Project + 3 years | 10 years | Award challenge / audit evidence |
| PR, MR | Project + 2 years | 7 years | Operational |
| Expediting logs | Project + 3 years | 10 years | Delay claim evidence |
| PO/CBA PDFs | Project + 5 years | 15 years | Cold storage; latent defects |
| Budget checks and overrides | Project + 5 years | 10 years | Financial audit |
| Opening events | Permanent | Permanent | Bid integrity — never archived out of reach |

---

*Digital Construction Operating System — Procurement — Doc 04 Database Schema — Internal Controlled Document*
