# DCOS Procurement Module — Implementation Plan R1

| Field | Detail |
|---|---|
| System | Digital Construction Operating System (DCOS) |
| Module | Procurement |
| Document Type | Implementation Plan |
| Version | R1 |
| Status | Draft |
| Prepared For | DCOS Development |
| Date | 2026-05-31 |

---

# Phase 1 — Core Procurement (MVP)

Build the essential procurement chain: Supplier → PR → PO → Goods Receipt. No RFQ/auction, no invoice matching, no supplier portal.

## Scope

| Feature | Priority | Deliverable |
|---|---|---|
| Supplier Master CRUD | P0 | Supplier table + list/detail page |
| Purchase Requisition (PR) | P0 | PR create, submit, approve, reject |
| PR Items | P0 | Line items with quantity, estimate, budget code |
| PR Approval Workflow | P0 | Submit → Budget Check → Approve / Reject |
| Budget Check Integration | P0 | QS validates budget before approval |
| Purchase Order (PO) | P0 | PO create from PR, approve, issue |
| PO Items | P0 | Ordered quantity, delivered tracking |
| Goods Receipt (GR) | P0 | Receive against PO, partial support |
| GR Inspection | P0 | Pass / Fail / Conditional with rejection reason |
| Integration: Project & WBS | P0 | All records link to project + WBS |
| Integration: Inventory | P0 | GR updates stock quantity |
| Integration: Notification | P0 | PR submitted, approved, rejected; PO issued; GR received |
| Integration: Audit Log | P0 | All create/submit/approve/reject actions logged |
| Procurement Dashboard | P1 | Pending approvals, delivery status, basic KPIs |

## Database Tables to Create

```
1. suppliers
2. purchase_requisitions
3. pr_items
4. purchase_orders
5. po_items
6. delivery_notes
7. goods_receipts
```

## UI Screens to Build

| Screen | Description |
|---|---|
| Supplier List / Detail | CRUD with status management |
| PR List | Filterable table with status, project, requestor |
| PR Create / Edit Form | Header + items table, project/WBS picker |
| PR Detail View | Status badge, approval timeline, items, attachments |
| PO List | Filterable table with supplier, status, delivery |
| PO Create / Edit Form | Select PR, auto-populate items, set supplier |
| PO Detail View | Items with delivery progress, GR history |
| Goods Receipt Form | Select PO, enter received quantities, inspection result |
| Procurement Dashboard | Widgets: pending approvals, deliveries due, budget consumption |

## API Endpoints (Phase 1)

```
GET    /api/suppliers
POST   /api/suppliers
GET    /api/suppliers/:id
PUT    /api/suppliers/:id
DELETE /api/suppliers/:id   (soft delete, only if no active PO)

GET    /api/purchase-requisitions
POST   /api/purchase-requisitions
GET    /api/purchase-requisitions/:id
PUT    /api/purchase-requisitions/:id
POST   /api/purchase-requisitions/:id/submit
POST   /api/purchase-requisitions/:id/approve
POST   /api/purchase-requisitions/:id/reject
POST   /api/purchase-requisitions/:id/return
DELETE /api/purchase-requisitions/:id   (Draft only)

GET    /api/purchase-orders
POST   /api/purchase-orders
GET    /api/purchase-orders/:id
PUT    /api/purchase-orders/:id
POST   /api/purchase-orders/:id/approve
POST   /api/purchase-orders/:id/reject
POST   /api/purchase-orders/:id/issue
DELETE /api/purchase-orders/:id   (Draft only)

GET    /api/delivery-notes
POST   /api/delivery-notes
GET    /api/delivery-notes/:id

GET    /api/goods-receipts
POST   /api/goods-receipts
GET    /api/goods-receipts/:id

GET    /api/procurement/dashboard   (aggregated KPIs)
```

## Permissions Setup (Phase 1)

| Role | Supplier | PR | PO | GR |
|---|---|---|---|---|
| Site Engineer | – | View, Create | View | – |
| Procurement Officer | Full | Full | Full | View |
| Procurement Manager | Full | Approve | Approve | – |
| QS | View | Budget Check | View | – |
| PM | View | Approve (threshold) | Approve (threshold) | View |
| Storekeeper | View | View | View | Full |

## Notification Rules (Phase 1)

| Trigger | Recipients |
|---|---|
| PR submitted | Procurement Manager, PM, QS |
| PR approved | Requester, Procurement Officer |
| PR rejected | Requester |
| PO submitted | Procurement Manager, PM |
| PO approved | Procurement Officer, Supplier |
| PO rejected | Procurement Officer |
| Goods received | Requester, Procurement Officer |
| Goods rejected on receipt | Procurement Officer, PM |

---

# Phase 2 — Competitive Bidding

Add RFQ, quotation management, and supplier evaluation.

## Scope

| Feature | Priority | Deliverable |
|---|---|---|
| RFQ Management | P0 | Create RFQ from PR, invite suppliers |
| RFQ Issuance | P0 | Send invitations, track responses |
| Quotation Submission | P0 | Suppliers submit quotations with line items |
| Quotation Comparison | P0 | Side-by-side technical + commercial comparison |
| Scoring & Evaluation | P1 | Weighted scoring, auto-rank offers |
| Supplier Award | P0 | Select winner, record award basis |
| RFQ Dashboard | P1 | Active RFQs, response rate, overdue responses |
| Integration: Notification | P0 | RFQ issued, quotation received, award decision |

## Additional Database Tables

```
8. rfqs
9. rfq_suppliers
10. quotations
11. quotation_items
```

## Additional UI Screens

| Screen | Description |
|---|---|
| RFQ List | Filterable by PR, status, supplier |
| RFQ Create / Edit | Select PR, pick suppliers, set deadline |
| RFQ Detail | Items, invited suppliers, response status |
| Quotation Comparison | Side-by-side price/scores, auto-highlight best offer |
| Award Decision | Select winner, input reason, generate PO |

## Additional API Endpoints

```
GET    /api/rfqs
POST   /api/rfqs
GET    /api/rfqs/:id
PUT    /api/rfqs/:id
POST   /api/rfqs/:id/issue
POST   /api/rfqs/:id/award
POST   /api/rfqs/:id/cancel

GET    /api/quotations
POST   /api/quotations
GET    /api/quotations/:id
PUT    /api/quotations/:id
```

---

# Phase 3 — Financial Close

Add invoice matching and budget control enhancements.

## Scope

| Feature | Priority | Deliverable |
|---|---|---|
| Invoice Registration | P0 | Record supplier invoice against PO |
| 3-Way Matching | P0 | PO quantity vs GR quantity vs Invoice amount |
| Variance Detection | P0 | Auto-flag mismatches above threshold |
| Invoice Approval | P0 | Approve/hold/reject matched invoices |
| Budget Consumption Tracking | P1 | Real-time spend vs budget per WBS/cost code |
| Invoice Matching Dashboard | P1 | Pending matches, variances, aging |

## Additional Database Tables

```
12. invoice_matches
```

## Additional UI Screens

| Screen | Description |
|---|---|
| Invoice Match List | Filterable by PO, supplier, status |
| Invoice Match Detail | 3-way comparison table, highlight variances |
| Invoice Approval | Approve / hold / reject with reason |

## Additional API Endpoints

```
GET    /api/invoice-matches
POST   /api/invoice-matches
GET    /api/invoice-matches/:id
PUT    /api/invoice-matches/:id
POST   /api/invoice-matches/:id/approve
POST   /api/invoice-matches/:id/reject
```

---

# Phase 4 — Supplier Portal & Advanced Features

External-facing capabilities and advanced analytics.

## Scope

| Feature | Priority | Deliverable |
|---|---|---|
| Supplier Portal (External) | P0 | Limited UI for suppliers |
| Supplier Self-Registration | P1 | Suppliers create own account |
| RFQ Response (Supplier) | P0 | Suppliers view RFQ, submit quotation |
| PO View (Supplier) | P0 | Suppliers view issued POs |
| Delivery Notice (Supplier) | P0 | Suppliers submit delivery notifications |
| Payment Status View (Supplier) | P1 | Suppliers see payment status |
| Supplier Performance Scoring | P1 | Auto-calculated on-time % + reject % + response time |
| Automated Reorder | P2 | Auto-create PR when stock hits minimum level |
| Procurement Analytics | P1 | Trend analysis, forecasting, spend analytics |
| Bulk Operations | P1 | Bulk import suppliers, bulk approve PRs |

## Additional Considerations

- Supplier portal requires authentication (Supabase anonymous or limited JWT)
- Public-facing API endpoints need rate limiting
- File upload for quotation documents and delivery photos
- Email integration for supplier communications

---

# Summary — Build Sequence

```
Phase 1 (MVP):   Suppliers → PR → PO → GR
                 │
                 ▼
Phase 2:         RFQ → Quotations → Award → Supplier Comparison
                 │
                 ▼
Phase 3:         3-Way Invoice Matching → Budget Tracking
                 │
                 ▼
Phase 4:         Supplier Portal → Advanced Analytics → Automation
```

Each phase builds on the previous. Phase 1 establishes the core data and workflow. Phase 2 adds competitive sourcing. Phase 3 closes the financial loop. Phase 4 extends to external users and intelligence.
