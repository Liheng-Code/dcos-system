# 04 — Database Schema
**Module:** 21 — IPC / Progress Claim
**Doc Code:** DCOS-MOD21-DB-001 | **Rev:** R0 | **Status:** Draft
**Source rule:** This document is AUTO-GENERATED from migrations in CI.
The narrative notes below are the only hand-maintained part.

---

## 1. Tables

### progress_claims
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid NOT NULL | RLS key |
| project_id | uuid NOT NULL FK projects | |
| ipc_number | text NOT NULL | {PROJECT}-IPC-{NN}; unique per project |
| claim_period_start / end | date | |
| status | text | Draft, Internal Review, PM Endorsement, Submitted, Under Certification, Disputed, Certified, Invoiced, Paid, Partially Paid, Closed |
| revision | int | 0,1,2… resubmission tracking |
| contract_sum_at_claim | numeric(18,2) | original + approved VOs snapshot |
| gross_this_period | numeric(18,2) | computed |
| gross_cumulative | numeric(18,2) | computed |
| retention_this_period | numeric(18,2) | from Retention module |
| retention_cumulative | numeric(18,2) | |
| advance_recovery_this_period | numeric(18,2) | |
| backcharge_total | numeric(18,2) | |
| net_claim | numeric(18,2) | computed |
| certified_net | numeric(18,2) NULL | after certification |
| submitted_at / certified_at | timestamptz NULL | |
| created_by / approved_by | uuid FK users | |
| created_at / updated_at | timestamptz | |

Constraint: unique (project_id, ipc_number); partial unique index — only one
row per project where status in (Draft, Internal Review, PM Endorsement, Submitted).

### ipc_items
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid | RLS |
| ipc_id | uuid FK progress_claims | cascade on claim revision, never delete after submit |
| line_type | text | BOQ, VO, BACKCHARGE, ADJUSTMENT |
| boq_item_id | uuid NULL FK boq_items | when line_type = BOQ |
| variation_order_id | uuid NULL FK variation_orders | when line_type = VO |
| description_snapshot | text | frozen at submit |
| unit / rate_snapshot | text / numeric(18,4) | frozen at submit |
| qty_previous_cum | numeric(18,4) | |
| qty_this_period | numeric(18,4) | may be negative (BR: comment required) |
| qty_cumulative | numeric(18,4) | computed; ≥ 0 |
| value_this_period | numeric(18,2) | computed |
| overrun_flag | boolean | cumulative > BOQ qty |
| overrun_comment | text NULL | required when overrun_flag |
| wbs_node_id | uuid NULL FK wbs_nodes | measurement location |
| sort_order | int | |

### ipc_certifications
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid | RLS |
| ipc_item_id | uuid FK ipc_items | |
| certified_qty | numeric(18,4) | |
| certified_value | numeric(18,2) | |
| variance_value | numeric(18,2) | computed = claimed − certified |
| reason_code | text | UNDER_MEASURE, RATE_DISPUTE, QUALITY_HOLD, DOC_MISSING, OTHER |
| reason_note | text | |
| certified_by_name | text | client-side person (snapshot) |
| recorded_by | uuid FK users | internal user entering it |
| created_at | timestamptz | |

### ipc_advance_recoveries
| Field | Type | Notes |
|---|---|---|
| id, tenant_id, ipc_id | | |
| advance_id | uuid FK advance_payments | |
| recovery_amount | numeric(18,2) | |
| balance_after | numeric(18,2) | |

### ipc_backcharges
| Field | Type | Notes |
|---|---|---|
| id, tenant_id, ipc_id | | |
| backcharge_ref | text | source reference (site instruction, damage report) |
| description | text | |
| amount | numeric(18,2) | positive = deduction |
| agreed_flag | boolean | disputed back-charges shown but excluded from net until agreed |

## 2. Relationships

```
projects 1—n progress_claims 1—n ipc_items n—1 boq_items
                                ipc_items n—1 variation_orders
                                ipc_items 1—n ipc_certifications
progress_claims 1—n ipc_advance_recoveries n—1 advance_payments
progress_claims —→ retention_records (written by Retention module on certify)
progress_claims —→ ar_invoices (Accounting, on Invoiced)
```

## 3. RLS & Indexing Notes (hand-maintained)

- All tables: `tenant_id` RLS policy per platform standard (see Architecture/RLS-Model).
- Hot path index: `ipc_items (ipc_id, sort_order)`; `progress_claims (project_id, status)`.
- `ipc_items` rows after submit are immutable — enforced by trigger that blocks
  UPDATE when parent status NOT IN ('Draft'), except certification-related fields
  via the certification service role.
- Money columns never FLOAT. numeric only.
