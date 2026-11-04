# DCOS Procurement Module Specification — R1

| Field | Detail |
|---|---|
| System | Digital Construction Operating System (DCOS) |
| Module | Procurement |
| Document Type | Module Specification |
| Version | R1 |
| Status | Draft |
| Prepared For | DCOS Development |
| Date | 2026-05-31 |

---

# 1. Purpose

The Procurement Module controls the full procurement chain inside DCOS — from material request and purchase requisition through supplier selection, purchase order, delivery tracking, goods receipt, and invoice matching.

It ensures that every procurement transaction is traceable to a project and WBS node, subject to budget control, approved through defined workflow stages, and recorded in the audit trail.

Core principle:

> The right material, at the right quantity, from the right supplier, delivered to the right place, at the right time, at the right price.

---

# 2. Business Context

On a construction site, procurement is not simple purchasing. It is a multi-step process involving:

- Site engineers identifying material needs
- QS checking budget availability
- Procurement officers sourcing and comparing suppliers
- Technical teams evaluating compliance
- Commercial teams negotiating price
- Storekeepers receiving and inspecting goods
- Accountants matching invoices

Every step involves different users, different data, and different approvals. The system must support all of them without creating bottlenecks.

The procurement chain must also feed into project cost control — every PO and delivery should be traceable back to a project and WBS code so that management knows where money is being spent.

---

# 3. Key Users and Stakeholders

| Role | Responsibility |
|---|---|
| Site Engineer / Supervisor | Raise material requests against tasks |
| Quantity Surveyor (QS) | Budget check, cost code assignment |
| Procurement Officer | Create PR, issue RFQ, compare quotations, issue PO |
| Procurement Manager | Approve PR, approve supplier selection, approve PO |
| Project Manager | Oversee procurement, approve high-value items |
| Storekeeper | Receive goods, inspect, update inventory |
| Supplier (External) | Submit quotations, deliver goods, upload delivery notes |
| Accountant / Finance | Invoice matching, payment processing |
| Company Director | Approve large or non-budgeted purchases |

---

# 4. Module Scope

## 4.1 Included

- Material / service request from site
- Purchase Requisition (PR) with budget check
- RFQ (Request for Quotation) with supplier invitations
- Quotation comparison (technical + commercial)
- Purchase Order (PO) issuance
- Delivery tracking and status
- Goods Receipt (GR) with inspection
- 3-way invoice matching (PO x GR x Invoice)
- Supplier master data management
- Procurement dashboard and KPIs
- Integration with project, WBS, inventory, account, and notification engines

## 4.2 Excluded / Future Phase

- Contract management (subcontractor agreements, variation orders) — handled by Subcontractor Module
- Full AP / AR finance — handled by Account Module
- Procurement with auction or reverse-auction
- Enterprise supplier portal with full RFQ response workflow (external portal UI in Phase 2)
- Automated reorder triggered by inventory minimum stock (Phase 2)

---

# 5. Core Features

| Feature | Description | Priority |
|---|---|---|
| Material / Service Request | Site users request materials linked to project, WBS, and task | High |
| Purchase Requisition (PR) | Formal PR with line items, budget code, required date | High |
| PR Approval Workflow | Multi-step approval with budget check | High |
| Supplier Master | Supplier registry with contact, bank, category, performance history | High |
| RFQ Management | Create RFQ from PR, invite suppliers, track responses | Medium |
| Quotation Comparison | Side-by-side technical + commercial evaluation | Medium |
| Supplier Award | Select winning supplier, record basis of award | Medium |
| Purchase Order (PO) | Issue PO linked to awarded quotation, with delivery schedule | High |
| Delivery Tracking | Track expected vs actual delivery, partial deliveries | High |
| Goods Receipt (GR) | Receive items with quantity check, inspection result, inventory update | High |
| Invoice Matching | 3-way match: PO quantity x GR quantity x Invoice amount | Medium |
| Procurement Dashboard | Pending approvals, delivery status, budget consumption, KPIs | High |
| Supplier Performance | On-time delivery %, reject rate, response time | Low |
| Budget Control | PR cannot proceed without valid budget or override approval | High |

---

# 6. Main Workflow

```
Material need identified (site / design / QS)
    │
    ▼
Create Purchase Requisition (PR)
    │
    ▼
Budget check (QS / system)
    ├── Budget OK  ──► Submit PR
    └── Budget insufficient ──► Rejected (return to requester)

    ▼
PR Approval (Procurement Manager / PM)
    ├── Approved ──► Proceed
    ├── Rejected ──► Return to requester with comment
    └── Need Revision ──► Return to procurement officer

    ▼
Create RFQ (if required)
    │
    ▼
Issue RFQ to Suppliers
    │
    ▼
Receive Quotations
    │
    ▼
Technical Evaluation (engineer / QA)
    ├── Pass ──► Proceed
    └── Fail ──► Reject quotation, request alternative

    ▼
Commercial Evaluation (procurement / QS)
    │
    ▼
Select Supplier → Record award basis
    │
    ▼
Create Purchase Order (PO)
    │
    ▼
PO Approval (Procurement Manager / PM)
    ├── Approved ──► Issue to Supplier
    └── Rejected ──► Return to procurement officer

    ▼
Supplier Delivers Material
    │
    ▼
Goods Receipt (Storekeeper)
    ├── Quantity & condition OK ──► Accept → Update inventory
    ├── Partial ──► Accept partial, flag balance
    └── Damaged / Wrong ──► Reject → Return to supplier

    ▼
Invoice Received (Supplier)
    │
    ▼
Invoice Matching (Accountant)
    ├── PO = GR = Invoice ──► Approve for payment
    ├── Mismatch ──► Hold, resolve with procurement / supplier
    └── Over-invoice ──► Reject

    ▼
Close PO
```

Rejection / return paths exist at every stage. Any rejection must include a reason and optional corrective instruction.

---

# 7. Status Lifecycle

## 7.1 Purchase Requisition (PR)

| Status | Meaning | Next Possible Status |
|---|---|---|
| Draft | Being prepared, not yet submitted | Submitted, Cancelled |
| Submitted | Pending budget check and approval | Under Budget Review, Returned |
| Under Budget Review | QS verifying budget line | Approved, Rejected, Returned |
| Approved | Budget OK and approved by manager | RFQ Issued, PO Created, Closed |
| Returned | Sent back with revision request | Draft, Cancelled |
| Rejected | Denied (no budget / not justified) | Closed, Resubmitted (new version) |
| Closed | Fully processed | None |
| Cancelled | Abandoned before completion | None |

## 7.2 RFQ

| Status | Meaning | Next Possible Status |
|---|---|---|
| Draft | Being prepared | Issued, Cancelled |
| Issued | Sent to suppliers | Quotations Received, Expired |
| Quotations Received | At least one quotation received | Under Evaluation |
| Under Evaluation | Technical + commercial review | Awarded, Rejected All, Returned |
| Awarded | Supplier selected | PO Created, Closed |
| Rejected All | No quotation accepted | Closed, Resubmit RFQ |
| Cancelled | Abandoned | None |

## 7.3 Purchase Order (PO)

| Status | Meaning | Next Possible Status |
|---|---|---|
| Draft | Being prepared | Submitted, Cancelled |
| Submitted | Pending approval | Approved, Returned, Rejected |
| Approved | Approved, ready to issue | Issued |
| Issued | Sent to supplier | Delivered, Partially Delivered, Cancelled |
| Partially Delivered | Some items received | Delivered, Awaiting Balance |
| Delivered | All items received | Closed, Under Invoice Match |
| Under Invoice Match | Awaiting 3-way match | Closed, On Hold |
| Closed | Fully completed | None |
| On Hold | Issue under resolution | Delivered, Closed, Cancelled |
| Cancelled | Abandoned | None |

## 7.4 Goods Receipt

| Status | Meaning | Next Possible Status |
|---|---|---|
| Pending | Delivery expected | Scheduled, Cancelled |
| Scheduled | Delivery date confirmed | In Transit, Cancelled |
| In Transit | On the way | Delivered, Partially Delivered |
| Delivered | Fully received | Accepted, Rejected |
| Partially Delivered | Partial receipt | Accepted Partial, Awaiting Balance |
| Accepted | Passed inspection | Closed |
| Accepted Partial | Partial passed | Closed, Awaiting Balance |
| Rejected | Failed inspection / wrong goods | Return to Supplier, Cancelled |

---

# 8. Data Model

## 8.1 suppliers

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | Unique ID |
| tenant_id | uuid | Yes | Company / tenant |
| supplier_code | text | Yes | Unique supplier code |
| supplier_name | text | Yes | Legal name |
| supplier_type | text | Yes | Local, international, manufacturer, distributor, etc. |
| contact_person | text | No | Main contact |
| email | text | No | Contact email |
| phone | text | No | Contact phone |
| address | text | No | Business address |
| tax_id | text | No | Tax registration |
| bank_name | text | No | Bank name |
| bank_account | text | No | Bank account number |
| currency | text | No | Preferred currency |
| payment_terms | text | No | e.g. Net 30, Net 60 |
| categories | jsonb | No | Product/service categories they supply |
| status | text | Yes | Active, Inactive, Blacklisted, Suspended |
| performance_score | numeric | No | Calculated from delivery / quality data |
| notes | text | No | Internal notes |
| created_at | timestamp | Yes | |
| updated_at | timestamp | Yes | |

## 8.2 purchase_requisitions

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | Unique ID |
| tenant_id | uuid | Yes | Company / tenant |
| pr_number | text | Yes | Auto-generated PR number |
| project_id | uuid | Yes | Linked project |
| wbs_node_id | uuid | Yes | Linked WBS node |
| task_id | uuid | No | Linked task if applicable |
| requested_by | uuid | Yes | User who requested |
| required_date | date | Yes | Date material needed on site |
| delivery_location | text | No | Site location / warehouse |
| priority | text | No | Normal, High, Urgent, Emergency |
| budget_code | text | No | Cost code / budget line |
| budget_checked | boolean | No | Has QS confirmed budget? |
| budget_checked_by | uuid | No | QS who confirmed |
| budget_check_notes | text | No | Budget check remarks |
| approval_status | text | Yes | Draft, Submitted, Under Budget Review, Approved, Returned, Rejected, Closed, Cancelled |
| approved_by | uuid | No | Approver |
| approved_at | timestamp | No | |
| total_estimated_cost | numeric | No | Sum of line items estimated cost |
| notes | text | No | General notes |
| created_at | timestamp | Yes | |
| updated_at | timestamp | Yes | |

## 8.3 pr_items

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | |
| pr_id | uuid | Yes | Linked PR |
| line_no | integer | Yes | Line number |
| item_code | text | No | Material / item code |
| item_description | text | Yes | Description of item |
| unit | text | Yes | Unit of measure (pcs, m, kg, lot) |
| quantity | numeric | Yes | Requested quantity |
| estimated_unit_price | numeric | No | Estimated price per unit |
| estimated_total | numeric | No | Estimated total line cost |
| budget_code | text | No | Per-line budget code override |
| specification_ref | text | No | Link to spec / drawing |
| notes | text | No | Line notes |

## 8.4 rfqs

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | |
| tenant_id | uuid | Yes | |
| pr_id | uuid | Yes | Source PR |
| rfq_number | text | Yes | Auto-generated |
| issue_date | date | No | When issued |
| response_deadline | date | No | Last date for quotations |
| evaluation_method | text | No | Lowest price, weighted, technical + commercial |
| status | text | Yes | Draft, Issued, Quotations Received, Under Evaluation, Awarded, Rejected All, Cancelled |
| awarded_supplier_id | uuid | No | Selected supplier |
| award_reason | text | No | Basis of award |
| awarded_at | timestamp | No | |
| created_at | timestamp | Yes | |
| updated_at | timestamp | Yes | |

## 8.5 rfq_suppliers

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | |
| rfq_id | uuid | Yes | |
| supplier_id | uuid | Yes | |
| invited_at | timestamp | No | |
| responded | boolean | No | Has supplier responded |
| created_at | timestamp | Yes | |

## 8.6 quotations

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | |
| rfq_id | uuid | Yes | |
| supplier_id | uuid | Yes | |
| quotation_ref | text | No | Supplier's quotation number |
| received_at | timestamp | No | |
| currency | text | Yes | Quote currency |
| valid_until | date | No | Quote validity |
| payment_terms | text | No | Supplier proposed terms |
| delivery_lead_time | integer | No | Lead time in days |
| total_amount | numeric | Yes | Total quoted amount |
| technical_score | numeric | No | Evaluation score (0–100) |
| commercial_score | numeric | No | Evaluation score (0–100) |
| combined_score | numeric | No | Weighted combined score |
| evaluation_notes | text | No | Evaluator comments |
| is_awarded | boolean | No | Was this quotation selected |
| status | text | Yes | Pending, Evaluated, Awarded, Rejected |
| attachment | text | No | Uploaded quotation document |
| created_at | timestamp | Yes | |
| updated_at | timestamp | Yes | |

## 8.7 quotation_items

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | |
| quotation_id | uuid | Yes | |
| pr_item_id | uuid | Yes | Matching PR line |
| line_no | integer | Yes | |
| unit_price | numeric | Yes | Quoted unit price |
| quantity | numeric | Yes | Quoted quantity |
| total | numeric | Yes | Line total |
| delivery_date | date | No | Promised delivery |

## 8.8 purchase_orders

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | |
| tenant_id | uuid | Yes | |
| po_number | text | Yes | Auto-generated PO number |
| project_id | uuid | Yes | |
| wbs_node_id | uuid | Yes | |
| pr_id | uuid | No | Source PR |
| rfq_id | uuid | No | Source RFQ if applicable |
| quotation_id | uuid | No | Source quotation |
| supplier_id | uuid | Yes | Selected supplier |
| issued_date | date | No | Date issued to supplier |
| delivery_date_expected | date | No | Expected delivery |
| delivery_address | text | No | Delivery location |
| currency | text | Yes | |
| total_amount | numeric | Yes | PO total |
| tax_amount | numeric | No | Tax |
| grand_total | numeric | Yes | Total including tax |
| payment_terms | text | No | Agreed payment terms |
| delivery_terms | text | No | Incoterms or equivalent |
| status | text | Yes | Draft, Submitted, Approved, Issued, Partially Delivered, Delivered, Under Invoice Match, Closed, On Hold, Cancelled |
| approved_by | uuid | No | |
| approved_at | timestamp | No | |
| issued_by | uuid | No | Who issued to supplier |
| notes | text | No | |
| created_at | timestamp | Yes | |
| updated_at | timestamp | Yes | |

## 8.9 po_items

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | |
| po_id | uuid | Yes | |
| pr_item_id | uuid | No | Source PR line |
| line_no | integer | Yes | |
| item_code | text | No | |
| item_description | text | Yes | |
| unit | text | Yes | |
| quantity_ordered | numeric | Yes | Ordered quantity |
| quantity_delivered | numeric | Yes | Cumulative delivered |
| quantity_accepted | numeric | Yes | Cumulative accepted after inspection |
| unit_price | numeric | Yes | |
| total_price | numeric | Yes | |
| delivery_date_expected | date | No | Per-line delivery promise |
| notes | text | No | |

## 8.10 delivery_notes

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | |
| po_id | uuid | Yes | Linked PO |
| supplier_id | uuid | Yes | |
| delivery_note_ref | text | No | Supplier's DN number |
| delivery_date | date | Yes | Actual delivery date |
| received_by | uuid | Yes | Storekeeper who received |
| status | text | Yes | Pending, In Transit, Delivered, Partially Delivered, Accepted, Rejected |
| remarks | text | No | |
| attachment | text | No | Delivery document / photo |
| created_at | timestamp | Yes | |

## 8.11 goods_receipts

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | |
| delivery_note_id | uuid | Yes | Linked delivery |
| po_item_id | uuid | Yes | Linked PO line |
| quantity_received | numeric | Yes | Quantity physically received |
| quantity_accepted | numeric | Yes | Quantity accepted (after inspection) |
| quantity_rejected | numeric | Yes | Quantity rejected |
| rejection_reason | text | No | Reason if rejected |
| inspection_result | text | No | Passed, Failed, Conditional |
| inspected_by | uuid | No | Inspector |
| inspected_at | timestamp | No | |
| warehouse_location | text | No | Where stored |
| batch_lot_no | text | No | Batch / lot tracking |
| notes | text | No | |
| created_at | timestamp | Yes | |

## 8.12 invoice_matches

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | Yes | |
| po_id | uuid | Yes | |
| supplier_id | uuid | Yes | |
| invoice_ref | text | Yes | Supplier invoice number |
| invoice_date | date | Yes | |
| invoice_amount | numeric | Yes | Amount on invoice |
| matched_gr_amount | numeric | Yes | Amount from goods receipts |
| matched_po_amount | numeric | Yes | Amount from PO |
| variance_amount | numeric | Yes | Difference |
| variance_reason | text | No | Explanation of variance |
| status | text | Yes | Pending, Matched, Variance Detected, Approved, Rejected |
| approved_by | uuid | No | |
| approved_at | timestamp | No | |
| notes | text | No | |
| created_at | timestamp | Yes | |
| updated_at | timestamp | Yes | |

---

# 9. Permissions

| Role | PR | RFQ | Quotation | PO | GR | Supplier | Invoice Match |
|---|---|---|---|---|---|---|---|
| Site Engineer | View, Create | View | – | View | View | – | – |
| Procurement Officer | Full | Full | Full | Full | View | Full | View |
| Procurement Manager | Approve | Approve | Approve | Approve | – | Full | View |
| Quantity Surveyor | Budget Check | View | View | View | – | View | – |
| Project Manager | Approve (threshold) | View | View | Approve (threshold) | View | View | View |
| Storekeeper | View | – | – | View | Full | View | – |
| Accountant | View | – | – | View | View | View | Full |
| Company Director | Approve (high-value) | – | – | Approve (high-value) | – | – | Approve (variance) |
| Supplier (Portal) | – | – | Submit | View | Submit DN | View own | – |

Actions: View, Create, Edit, Submit, Approve, Reject, Delete, Export.

Delete is restricted to Draft status only for all records.

---

# 10. Notification Rules

| Trigger | Recipients | Channel | Priority |
|---|---|---|---|
| PR submitted for approval | Procurement Manager, PM, QS | In-app, Email | High |
| PR approved | Requester, Procurement Officer | In-app | Normal |
| PR rejected | Requester | In-app, Email | High |
| PR returned with revision request | Requester, Procurement Officer | In-app | Normal |
| Budget check required | QS assigned | In-app, Email | High |
| RFQ issued to supplier | Invited suppliers | Email | High |
| Quotation received | Procurement Officer | In-app | Normal |
| Quotation deadline approaching | Procurement Officer | In-app, Telegram | Normal |
| Quotation overdue | Procurement Officer, Supplier | In-app, Telegram | High |
| Quotation evaluation completed | Procurement Manager | In-app | Normal |
| PO submitted for approval | Procurement Manager, PM | In-app, Email | High |
| PO approved | Procurement Officer, Supplier, Storekeeper | In-app, Email | High |
| PO rejected | Procurement Officer | In-app, Email | High |
| PO issued to supplier | Supplier | Email | High |
| Delivery scheduled | Storekeeper, Requester | In-app | Normal |
| Delivery in transit | Storekeeper, Requester | In-app, Telegram | Normal |
| Delivery overdue | Procurement Officer, Supplier | In-app, Telegram | High |
| Goods received | Requester, Procurement Officer | In-app | Normal |
| Goods rejected (quality issue) | Procurement Officer, QA, PM | In-app, Email | Critical |
| Invoice match variance detected | Accountant, Procurement Officer | In-app, Email | High |
| Invoice match approved | Procurement Officer, Supplier (if external) | In-app, Email | Normal |
| Supplier blacklisted / suspended | Procurement Manager, Company Admin | In-app, Email | High |

---

# 11. Audit Log Rules

| Action | Severity | Required Snapshot |
|---|---|---|
| PR created | Medium | PR header + items |
| PR submitted | Medium | Full PR status |
| PR approved | High | Approval decision, comment |
| PR rejected | High | Rejection reason, full PR snapshot |
| Budget check passed | Medium | Budget code, checked by |
| Budget check overridden | High | Override reason, approver |
| RFQ issued | Medium | RFQ + supplier list |
| Quotation received | Low | Quotation summary |
| Quotation awarded | High | Award reason, comparison scores |
| PO created | Medium | PO header + items |
| PO submitted | Medium | Full PO snapshot |
| PO approved | High | Approval decision, comment |
| PO rejected | High | Rejection reason |
| PO issued to supplier | High | PO + supplier contact |
| Delivery received | Medium | Delivery note + quantities |
| Goods rejected on receipt | High | Rejection reason, photo evidence |
| Inventory updated from GR | Medium | Before/after stock levels |
| Invoice match approved | High | Match details, variance resolution |
| Invoice mismatch detected | High | Variance amount, expected vs actual |
| Supplier created | Low | Supplier profile |
| Supplier deactivated | High | Supplier snapshot, reason |
| PR/PO deleted | Critical | Full record snapshot |
| Export procurement report | Low | Report type, filters |

---

# 12. UI / UX Requirements

## 12.1 Procurement Dashboard

Top-level view showing:

- **Pending Approvals** (PR count, PO count) — quick action buttons
- **Delivery Status** (expected today, overdue, in transit)
- **Budget Consumption** (spent vs allocated per project)
- **Recent Activity** (latest PR/PO actions)
- **Supplier Performance** (quick view of on-time delivery %)

## 12.2 PR List Screen

Columns:

| PR# | Project | WBS | Requestor | Required Date | Status | Priority | Total Est. | Actions |
|---|---|---|---|---|---|---|---|---|

Filters: project, status, date range, priority, requestor.

Bulk actions: Export selected PRs.

## 12.3 PR Detail / Form

- Header section: project, WBS, task (optional), requestor, required date, delivery location, priority
- Items table: inline add/edit with item code, description, unit, quantity, estimated price
- Budget check badge (green/red)
- Approval timeline on side panel
- Attachments section (specs, drawings)
- Comments / activity log

## 12.4 RFQ Workspace

- Create RFQ from approved PR with auto-populated items
- Supplier selection: multi-select from supplier master, auto-invite
- Quotation comparison view: side-by-side table with price, lead time, terms
- Technical score column + commercial score column
- Highlight best offer per line item
- Award button with reason input

## 12.5 PO List & Detail

Columns:

| PO# | Supplier | Project | Total | Status | Expected Delivery | % Delivered | Actions |
|---|---|---|---|---|---|---|---|

PO Detail:

- Header: supplier info, payment terms, delivery terms, currency
- Items: ordered qty, delivered qty, accepted qty, unit price, total
- Delivery schedule (expected vs actual)
- Goods receipt history
- Invoice match status
- Document attachments

## 12.6 Goods Receipt Screen

- Search / select PO by number or supplier
- Auto-populate PO line items
- Enter received quantity, accepted quantity, rejected quantity
- Inspection result dropdown (Passed / Failed / Conditional)
- Rejection reason field (shown only when rejected > 0)
- Batch/lot number, warehouse location
- Photo upload for damaged goods

## 12.7 Invoice Matching Screen

- Search PO or supplier
- 3-way match display:

| Line Item | PO Qty | PO Price | GR Qty | GR Accepted | Invoice Qty | Invoice Price | Variance |
|---|---|---|---|---|---|---|---|

- Auto-calculate variance per line
- Flag lines with mismatch
- Approve or hold with reason

## 12.8 Supplier List / Detail

Columns:

| Code | Name | Category | Contact | Status | Performance Score | Last PO | Actions |
|---|---|---|---|---|---|---|---|

Supplier detail: profile, contact persons, bank info, past POs, performance history.

## 12.9 Supplier Portal (Phase 2)

Limited external-facing view where a supplier can:

- View invited RFQs
- Submit quotations with document upload
- View issued POs
- Submit delivery notices
- View payment status

---

# 13. Reports and KPIs

| Report / KPI | Purpose | User |
|---|---|---|
| Procurement Pipeline | All PR/PO grouped by status | Procurement Manager, PM |
| PR Cycle Time | Average days from PR creation to approval | Procurement Manager |
| PO Cycle Time | Average days from PO approval to delivery | Procurement Manager |
| Supplier On-Time Delivery | % delivered on or before promised date | Procurement Manager |
| Supplier Reject Rate | % of goods rejected on receipt | Procurement Manager, QA |
| Budget vs Actual Spend | PO total by budget code vs allocated budget | QS, PM, Accountant |
| Top Materials by Spend | Rank materials by total PO value | Management |
| Delivery Overdue Aging | Overdue deliveries grouped by days | Procurement, Site |
| Pending Approvals | All PR/PO awaiting action | Procurement Manager, PM |
| Procurement Activity Log | User action timeline | Admin, PM |
| Cost Variance by PO | PO amount vs PR estimate | QS, Procurement |

---

# 14. Integration Points

| Connected Module | Relationship |
|---|---|
| Project Setup | All procurement records link to a project |
| WBS Management | PR/PO linked to WBS node for cost allocation and progress tracking |
| Task Management | Material request can originate from a construction task |
| Inventory / Stock | Goods receipt updates stock quantity; stock issues consume against WBS |
| Account / Finance | Invoice match triggers AP entry; PO value updates project committed cost |
| Document Control | Attach specifications, drawings, delivery notes, inspection reports to PR/PO |
| Approval Workflow Engine | All PR/PO approvals use the shared approval engine |
| Notification Engine | Procurement events trigger notifications per matrix above |
| Audit Log | All procurement actions logged with snapshot |
| Reporting Engine | Procurement KPIs feed into project and executive dashboards |

---

# 15. Acceptance Criteria

- [ ] User can create a PR linked to project and WBS
- [ ] PR cannot be submitted without a budget code assigned
- [ ] PR cannot be approved without budget check (or override approval)
- [ ] PR rejection returns with reason and goes back to Draft for revision
- [ ] RFQ can be created from an approved PR with auto-populated items
- [ ] Quotations can be received, compared side-by-side, and scored
- [ ] Supplier award locks the quotation and records the reason
- [ ] PO can only be created from an awarded RFQ (or directly with approval for small purchases)
- [ ] PO cannot exceed PR quantity without re-approval
- [ ] PO issued status sends notification to supplier
- [ ] Goods receipt can be created against a PO and partial deliveries are supported
- [ ] Goods receipt with inspection failure creates rejection record and notifies procurement
- [ ] Goods receipt updates inventory stock automatically
- [ ] Invoice matching detects and flags quantity and price variances
- [ ] Invoice cannot be approved if variance exceeds configured threshold
- [ ] All status changes are recorded in audit log with full snapshot
- [ ] All notification rules fire correctly per trigger
- [ ] Users without permission cannot view, create, edit, approve, or delete records they should not access
- [ ] Export procurement data generates a CSV / Excel file
- [ ] Dashboard KPIs reflect real-time data from procurement tables

---

# 16. Implementation Notes

## 16.1 MVP Scope (Phase 1)

Build these features first:

1. Supplier master (CRUD)
2. Purchase Requisition (create, submit, approve, reject)
3. Purchase Order (create from PR, approve, issue)
4. Goods Receipt (receive against PO, partial support)
5. Basic procurement dashboard (pending approvals, delivery status)
6. Integration with project, WBS, inventory, notification, and audit

Defer to Phase 2:

- RFQ / quotation comparison
- Invoice matching
- Supplier portal
- Advanced supplier performance scoring
- Automated reorder

## 16.2 Supabase RLS Considerations

- Procurement Officer: full access to procurement tables
- Project Manager: read + approve on records within their project
- Site Engineer: create PR + read PO for their project only
- Storekeeper: read PO + create goods receipt
- Supplier: no direct DB access; use limited API endpoints

## 16.3 Suggested Table Creation Order

```
1. suppliers
2. purchase_requisitions + pr_items
3. purchase_orders + po_items
4. delivery_notes
5. goods_receipts
6. rfqs + rfq_suppliers + quotations + quotation_items
7. invoice_matches
```

## 16.4 Budget Control Logic

```text
PR total estimated cost > remaining budget → BLOCK submission
  → Allow override only with Procurement Manager + PM approval
  → Record override reason in audit log
PR total <= remaining budget → ALLOW normal flow
```

## 16.5 Numbering Convention

```text
PR format:   PR-{YYYY}-{sequential:04d}          e.g. PR-2026-0042
RFQ format:  RFQ-{YYYY}-{sequential:04d}         e.g. RFQ-2026-0008
PO format:   PO-{YYYY}-{sequential:04d}           e.g. PO-2026-0031
DN format:   DN-{YYYY}-{sequential:04d}           e.g. DN-2026-0015
```

## 16.6 Key Validation Rules

- PR line quantity must be > 0
- PO quantity per line cannot exceed PR quantity (unless override)
- PO cannot be issued without approved status
- Goods receipt quantity cannot exceed PO ordered quantity
- Invoice match variance > 5% (configurable) requires manual review
- Deleting a PR/PO is allowed only in Draft status
- Supplier cannot be deleted if linked to active PO
