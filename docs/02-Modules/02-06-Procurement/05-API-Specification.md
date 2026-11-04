# DCOS — Module 04-11 Procurement
## Document 05 — API Specification

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-05 |
| Version | R1 |
| Base Path | `/api/v1/procurement` |
| Auth | Bearer DCOS access token (03-01 §5.4) |
| Status | For Development |

---

## 1. Global Conventions

| Concern | Standard |
|---|---|
| Versioning | Path-based `/api/v1/...`; breaking changes bump the major version |
| Tenant | Resolved from `tid` claim. **Never** accepted from body or query — a `company_id` in a request body is rejected with 400 |
| Project scope | Resolved from `prj` claim; a request for an out-of-scope project returns 404, not 403 (do not leak existence) |
| Pagination | `?page=1&page_size=50` (max 200); response envelope carries `total`, `page`, `page_size` |
| Sorting | `?sort=-created_at,po_no` |
| Filtering | `?status=Approved&supplier_id=...&required_date_from=2026-01-01` |
| Idempotency | `Idempotency-Key` header **required** on all POST that create financial commitments (PR submit, PO approve, PO issue, call-off) |
| Concurrency | `If-Match` with the record's `version` ETag on all PATCH; mismatch → 409 |
| Errors | RFC 7807 problem+json |
| Rate limit | 600 req/min/user; 60/min on report and export endpoints |
| Money in payloads | Always an object: `{ "amount": "12500.0000", "currency": "USD" }` — strings, never floats |
| Dates | ISO 8601; datetimes always with offset |

### 1.1 Error Envelope

```json
{
  "type": "https://docs.dcos.app/errors/budget-exceeded",
  "title": "Budget exceeded",
  "status": 422,
  "code": "PROC_BUDGET_EXCEEDED",
  "detail": "PR line 3 exceeds available budget on BOQ item C-03-014 by USD 4,180.00",
  "instance": "/api/v1/procurement/purchase-requisitions/9f1c.../submit",
  "errors": [
    { "line_no": 3, "boq_item_id": "…", "available": "8320.0000",
      "requested": "12500.0000", "variance": "4180.0000" }
  ]
}
```

### 1.2 Module Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `PROC_WBS_REQUIRED` | 422 | Line missing WBS node (BR-01) |
| `PROC_BOQ_OR_REASON_REQUIRED` | 422 | Missing BOQ item and non-BOQ reason (BR-02) |
| `PROC_BUDGET_EXCEEDED` | 422 | Budget check failed (BR-04) |
| `PROC_OVERRIDE_REQUIRED` | 409 | Submission blocked pending override approval |
| `PROC_SUPPLIER_NOT_QUALIFIED` | 422 | PQ status invalid or category mismatch (BR-06) |
| `PROC_MAR_NOT_APPROVED` | 422 | Permanent-works line without approved MAR (BR-14) |
| `PROC_SOD_VIOLATION` | 403 | Approver is the preparer (BR-18) |
| `PROC_STEP_UP_REQUIRED` | 403 | AAL 3 assertion missing or stale (BR-17) |
| `PROC_BIDS_SEALED` | 403 | Commercial data requested before opening (BR-07) |
| `PROC_DUAL_CUSTODY_REQUIRED` | 409 | Second opener not yet confirmed (BR-08) |
| `PROC_INSUFFICIENT_BIDS` | 422 | Below minimum valid responses |
| `PROC_JUSTIFICATION_REQUIRED` | 422 | Non-lowest award without justification (BR-09) |
| `PROC_PO_CLOSED` | 409 | Amendment attempted on a closed PO (BR-10) |
| `PROC_CEILING_EXCEEDED` | 422 | Call-off exceeds blanket ceiling (BR-11) |
| `PROC_TOLERANCE_EXCEEDED` | 422 | Over-delivery or invoice variance beyond tolerance |
| `PROC_DELETE_FORBIDDEN` | 405 | Delete attempted; use cancel (BR-16) |
| `PROC_STATE_INVALID` | 409 | Transition not permitted from current status |

---

## 2. Material Requisition

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/material-requisitions` | Create MR (draft) |
| GET | `/material-requisitions` | List / filter |
| GET | `/material-requisitions/{id}` | Detail with lines |
| PATCH | `/material-requisitions/{id}` | Update draft |
| POST | `/material-requisitions/{id}/submit` | Submit for review |
| POST | `/material-requisitions/{id}/review` | Approve / return / reject |
| POST | `/material-requisitions/{id}/cancel` | Cancel with reason |
| GET | `/material-requisitions/{id}/stock-availability` | Free stock per line across project warehouses |
| POST | `/material-requisitions/{id}/fulfil-from-stock` | Convert lines to a stock issue request |
| POST | `/material-requisitions/sync` | **Mobile offline batch upload** |

### 2.1 `POST /material-requisitions`

```json
{
  "project_id": "prj_001",
  "wbs_node_id": "wbs_b01_l05_z03",
  "discipline": "STR",
  "required_on_site_date": "2026-09-14",
  "priority": "Normal",
  "lines": [
    { "item_id": "itm_rebar_t16", "quantity": "4200.0000", "uom": "kg",
      "wbs_node_id": "wbs_b01_l05_z03", "required_date": "2026-09-14" },
    { "free_text_description": "Waterstop PVC 200mm",
      "specification": "Hydrophilic, per spec 03-30-00",
      "quantity": "180.0000", "uom": "m" }
  ]
}
```

**201** returns the MR with allocated `mr_no` and, per line, `stock_available_qty` and a `duplicate_warning` block where a matching open MR exists within the configured window.

### 2.2 `POST /material-requisitions/sync`

Accepts an array of offline-captured MRs, each with `client_ref` (device UUID) and `device_timestamp`. Response maps `client_ref → mr_id` and reports per-record `status` of `created`, `duplicate_ignored`, or `rejected` with reason. Idempotent on `client_ref` — a retried sync never creates a second MR.

---

## 3. Purchase Requisition

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/purchase-requisitions` | Create PR |
| POST | `/purchase-requisitions/consolidate` | Create PR from selected MR lines |
| GET | `/purchase-requisitions` | List / filter |
| GET | `/purchase-requisitions/{id}` | Detail |
| PATCH | `/purchase-requisitions/{id}` | Update draft |
| POST | `/purchase-requisitions/{id}/budget-check` | Run check without submitting |
| POST | `/purchase-requisitions/{id}/submit` | Submit (runs budget check, blocks on EXCEEDED) |
| POST | `/purchase-requisitions/{id}/override` | Raise budget override request |
| POST | `/purchase-requisitions/{id}/override/{oid}/endorse` | QS endorsement |
| POST | `/purchase-requisitions/{id}/approve` | Approve current step |
| POST | `/purchase-requisitions/{id}/reject` | Reject with mandatory comment |
| POST | `/purchase-requisitions/{id}/return` | Return to preparer |
| POST | `/purchase-requisitions/{id}/cancel` | Cancel |
| GET | `/purchase-requisitions/{id}/approval-trail` | Full approval history |
| GET | `/purchase-requisitions/{id}/budget-checks` | Append-only check history |

### 3.1 `POST /purchase-requisitions/{id}/budget-check`

**200** response:

```json
{
  "pr_id": "…",
  "budget_status": "EXCEEDED",
  "checked_at": "2026-08-13T04:12:09Z",
  "lines": [
    { "line_no": 1, "boq_item_id": "boq_c03_014",
      "allowable": "142000.0000", "committed": "118400.0000",
      "actual": "15280.0000", "available": "8320.0000",
      "requested": "12500.0000", "result": "EXCEEDED",
      "variance": "4180.0000", "variance_pct": "50.24" },
    { "line_no": 2, "result": "WITHIN" }
  ],
  "override_required": true,
  "override_approval_level": "Project Director"
}
```

The check is **recorded** every time it runs, even when the caller ignores the result. That record is the evidence in BR-04.

---

## 4. RFQ and Quotation

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/rfqs` | Create RFQ from PR lines |
| GET | `/rfqs` · `/rfqs/{id}` | List / detail |
| PATCH | `/rfqs/{id}` | Update draft |
| POST | `/rfqs/{id}/suppliers` | Add invited supplier (PQ validated) |
| DELETE | `/rfqs/{id}/suppliers/{sid}` | Remove before issue |
| POST | `/rfqs/{id}/issue` | Issue to bidders, start window |
| GET | `/rfqs/{id}/clarifications` | Q&A thread |
| POST | `/rfqs/{id}/clarifications/{cid}/answer` | Answer; `broadcast: true` sends to all bidders |
| POST | `/rfqs/{id}/extend` | Extend closing datetime (reason mandatory, all bidders notified) |
| POST | `/rfqs/{id}/open-bids/initiate` | **User A** — opens a 10-minute confirmation window |
| POST | `/rfqs/{id}/open-bids/confirm` | **User B** — executes opening, irreversible |
| GET | `/rfqs/{id}/opening-event` | Dual-custody evidence record |
| POST | `/rfqs/{id}/cancel` · `/retender` | Cancel or re-tender |
| POST | `/rfqs/{id}/quotations` | Manual quotation entry (sealed) |
| GET | `/rfqs/{id}/quotations` | List — commercial fields NULL while sealed |
| POST | `/quotations/{id}/evaluate` | Technical / commercial evaluation |
| POST | `/quotations/{id}/withdraw` | Record withdrawal |
| GET | `/rfqs/{id}/cba` | Generate / retrieve comparative bid analysis |
| POST | `/rfqs/{id}/cba/recommend` | Submit recommendation |
| POST | `/rfqs/{id}/cba/approve` | Approve award decision |
| POST | `/rfqs/{id}/award` | Award to quotation(s), creates PO draft(s) |

### 4.1 Sealed Behaviour on `GET /rfqs/{id}/quotations`

Before `closing_datetime` or before opening, for **every** role including Company Admin:

```json
{
  "sealed": true,
  "closing_datetime": "2026-08-20T17:00:00+07:00",
  "quotations": [
    { "quotation_id": "…", "supplier_name": "Mekong Steel Co.",
      "submission_datetime": "2026-08-18T11:42:00+07:00",
      "document_count": 4, "completeness": "COMPLETE",
      "quoted_total": null, "lines": null }
  ]
}
```

Any request carrying `?include=commercial` before opening returns **403 `PROC_BIDS_SEALED`** and writes an audit event at severity `CRITICAL` with the requesting identity. This is a deliberate trap: legitimate clients never ask.

### 4.2 `POST /rfqs/{id}/open-bids/confirm`

Requires: caller ≠ initiator, both authenticated within the window, both holding `procurement.rfq.open` permission, and step-up assertion. **200** returns the opening event with the per-quotation hashes.

### 4.3 `POST /rfqs/{id}/award`

```json
{
  "awards": [
    { "quotation_id": "qt_003", "line_nos": [1, 2, 3, 5] },
    { "quotation_id": "qt_001", "line_nos": [4] }
  ],
  "deviation_reason_code": "DELIVERY_PROGRAMME",
  "deviation_justification": "Qt_003 is 3.1% above lowest but commits to 21-day delivery against 45 days; L5 slab pour is on the critical path.",
  "step_up_assertion_id": "sa_01HZX…"
}
```

Split awards across bidders are supported and common. **201** returns the created PO drafts.

---

## 5. Purchase Order

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/purchase-orders` | Create PO (from award or direct for single-source/emergency) |
| GET | `/purchase-orders` · `/{id}` | List / detail |
| PATCH | `/purchase-orders/{id}` | Update draft |
| GET | `/purchase-orders/{id}/pre-issue-checks` | Run all seven gates, return pass/fail each |
| POST | `/purchase-orders/{id}/submit` | Submit for approval |
| POST | `/purchase-orders/{id}/approve` | Approve (step-up required above threshold) |
| POST | `/purchase-orders/{id}/reject` | Reject with comment |
| POST | `/purchase-orders/{id}/issue` | Issue to supplier, generate immutable PDF |
| POST | `/purchase-orders/{id}/acknowledge` | Record supplier acknowledgement |
| POST | `/purchase-orders/{id}/hold` · `/resume` | Hold with reason |
| POST | `/purchase-orders/{id}/cancel` | Cancel with reason |
| POST | `/purchase-orders/{id}/close` | Close-out, release residual commitment |
| GET | `/purchase-orders/{id}/pdf` | Retrieve issued PDF (specific version) |
| GET | `/purchase-orders/{id}/versions` | Version history |
| GET | `/purchase-orders/{id}/commitment` | Commitment posted / relieved / residual |

### 5.1 `GET /purchase-orders/{id}/pre-issue-checks`

```json
{
  "can_issue": false,
  "checks": [
    { "gate": "SUPPLIER_PQ", "result": "PASS", "detail": "Approved for STEEL_SUPPLY until 2027-03-31" },
    { "gate": "BUDGET", "result": "PASS", "detail": "Available USD 24,800 vs PO USD 18,240" },
    { "gate": "MAR", "result": "FAIL", "detail": "Line 2 (rebar T16) MAR-2026-0044 status Under Review" },
    { "gate": "SEGREGATION_OF_DUTIES", "result": "PASS" },
    { "gate": "STEP_UP", "result": "PENDING", "detail": "Required above USD 50,000 — not applicable" },
    { "gate": "SUPPLIER_BANK_VERIFIED", "result": "PASS", "detail": "Verified 2026-04-02, unchanged" },
    { "gate": "BLANKET_CEILING", "result": "N/A" }
  ]
}
```

Front-end calls this on the PO screen so the buyer sees a blocked gate *before* clicking approve, not after.

### 5.2 Amendments, Call-Offs, Delivery

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/purchase-orders/{id}/amendments` | Create amendment |
| POST | `/purchase-orders/{id}/amendments/{aid}/approve` | Approve (band by new total) |
| POST | `/purchase-orders/{id}/amendments/{aid}/issue` | Issue amended PO |
| POST | `/purchase-orders/{id}/call-offs` | Raise call-off (blanket only) |
| POST | `/call-offs/{id}/approve` | Approve call-off |
| GET | `/purchase-orders/{id}/drawdown` | Ceiling, called-off, delivered, invoiced, remaining |
| GET/PATCH | `/purchase-orders/{id}/delivery-schedule` | Per-line schedule |
| POST | `/purchase-orders/{id}/expediting` | Add expediting log entry |
| GET | `/purchase-orders/{id}/expediting` | Log history |
| POST | `/purchase-orders/{id}/asn` | Record ASN |
| POST | `/purchase-orders/{id}/gate-receipt` | **Mobile** site gate arrival → pending GRN |
| GET | `/purchase-orders/{id}/receipts` | GRN mirror (read-only, from 04-12) |
| GET | `/purchase-orders/{id}/match-status` | Three-way match state per line |
| POST | `/purchase-orders/{id}/match-exceptions/{eid}/resolve` | Accept / credit-note / amend / reject |

### 5.3 `POST /purchase-orders/{id}/gate-receipt`

Mobile, offline-capable. Payload carries `client_ref`, `device_timestamp`, per-line `received_qty`, `delivery_note_ref`, `photos[]`, `condition` (`GOOD` / `DAMAGED` / `PARTIAL`), and optional `batch_lot_ref`. Creates a **pending GRN** in Inventory. The storekeeper confirms it there; this endpoint never posts stock directly.

---

## 6. Long-Lead and Configuration

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/long-lead-items` | Register with risk status |
| POST | `/long-lead-items` | Add item to register |
| PATCH | `/long-lead-items/{id}` | Update lead times / linkage |
| POST | `/long-lead-items/recalculate` | Re-derive order-by dates from current CPM |
| GET | `/config` | Effective config (company + project override) |
| PUT | `/config` | Update parameter (Company Admin, audited) |

---

## 7. Reporting Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/reports/committed-cost` | By BOQ item / WBS / cost code / trade |
| GET | `/reports/procurement-status` | Pipeline by stage with ageing |
| GET | `/reports/cycle-time` | MR→PR→RFQ→PO→GRN durations |
| GET | `/reports/savings` | PR estimate vs awarded vs BOQ allowable |
| GET | `/reports/supplier-spend` | Spend by supplier / trade / period |
| GET | `/reports/delivery-performance` | On-time delivery by supplier |
| GET | `/reports/three-way-match` | Match, exception, ageing |
| GET | `/reports/single-source` | Single-source register with justifications |
| GET | `/reports/budget-overrides` | Override register |
| GET | `/reports/emergency-purchases` | Emergency PO regularisation status |
| POST | `/reports/{key}/export` | Async export → job id → notification on complete |

Exports above 10,000 rows return **202** with a job reference. Synchronous export of an entire company's PO history is not offered; it is how a database gets taken down at month-end.

---

## 8. Webhooks / Domain Events

Published to the Integration Engine. All carry `event_id`, `company_id`, `project_id`, `occurred_at`, `correlation_id`, and a `data` payload.

| Event | Consumers |
|---|---|
| `procurement.mr.submitted` | Notification |
| `procurement.pr.approved` | Cost Engine (soft reservation), Notification |
| `procurement.pr.override_approved` | Cost Engine, Contract Admin, Audit |
| `procurement.rfq.issued` | Supplier portal, Notification |
| `procurement.rfq.bids_opened` | Audit (CRITICAL), Notification |
| `procurement.rfq.awarded` | Supplier module, Notification |
| `procurement.po.approved` | **Cost Engine (commitment), BOQ Engine, Audit (HIGH)** |
| `procurement.po.issued` | Supplier portal, Inventory (expect delivery), Notification |
| `procurement.po.amended` | Cost Engine, Finance, Notification |
| `procurement.po.delivery_overdue` | Notification, Planning (schedule risk) |
| `procurement.po.closed` | Cost Engine (release), Supplier scoring, Lessons Learned (rate library) |
| `procurement.match.exception_raised` | Finance, Notification |

### 8.1 Events Consumed

| Event | Source | Effect |
|---|---|---|
| `inventory.grn.confirmed` | 04-12 | Update `delivered_qty`, expediting status, close delivery schedule line |
| `inventory.grn.rejected` | 04-12 | Reopen expediting, trigger supplier performance event |
| `material.mar.approved` | 04-13 | Clear the MAR gate on PO lines |
| `finance.invoice.matched` | 06-08 | Relieve commitment, post actual |
| `supplier.pq.suspended` | 04-10 | Block new PO to that supplier; flag open POs for review |
| `boq.item.revised` | 06-01 | Recalculate allowable on open PRs; flag affected lines |
| `schedule.activity.rescheduled` | Planning | Recalculate long-lead order-by dates |
| `auth.user.deactivated` | 03-01 | Reassign that user's pending approvals and open PRs |

---

## 9. Integration Layer Notes

| Target | Direction | Format |
|---|---|---|
| Client e-procurement portal | Outbound PO | Configurable JSON or CSV via webhook + SFTP fallback |
| Accounting / ERP | Outbound PO + GRN + match result | Chart-of-accounts mapped, batched nightly |
| Supplier email | Outbound RFQ / PO | PDF attachment + reply-to parsing for quotations |
| Telegram bot | Outbound alerts | Approval-required and delivery-arrived alerts with deep links |

---

*Digital Construction Operating System — Procurement — Doc 05 API Specification — Internal Controlled Document*
