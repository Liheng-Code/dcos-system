# DCOS Tender QTO Module — API Specification

Companion to `11-QTO-Module-Design.md`. DCOS QS/Tender modules use a typed service layer
(`lib/*-service.ts`) over the Supabase client rather than HTTP route handlers for CRUD.
This spec documents the **service-layer API** consumed by the QTO screens, and the small
set of HTTP endpoints added where server-side logic is required (export, upload).

---

## 1. Conventions

- All reads are scoped by `tender_id` and the selected project (`selectedProjectId`).
- All writes are guarded by RBAC (`use-tender-permissions`-style `can(action, field)`).
- Payload types are defined in `lib/qto-service.ts`.
- Auth: Supabase session (`createClient()`).

---

## 2. Service-layer functions (`lib/qto-service.ts`)

### 2.1 Documents (`qto_document_register`)

| Function | Returns | Notes |
| --- | --- | --- |
| `listDocuments(tenderId)` | `DocumentRecord[]` | filters: type, discipline, building, status |
| `createDocument(payload)` | `DocumentRecord` | uploads file to Storage + inserts row |
| `updateDocument(id, patch)` | `DocumentRecord` | |
| `deleteDocument(id)` | `void` | |
| `getDocumentFileUrl(path)` | `string` | signed/asset URL |

### 2.2 Drawings (`qto_drawing_register` / `qto_drawing_revisions`)

| Function | Returns | Notes |
| --- | --- | --- |
| `listDrawings(tenderId)` | `DrawingWithRevision[]` | joins current revision |
| `createDrawing(payload)` | `DrawingRecord` | |
| `addRevision(drawingId, payload)` | `RevisionRecord` | marks previous revisions superseded |
| `setCurrentRevision(drawingId, revisionId)` | `void` | trigger also maintains this |
| `getDrawingRevisions(drawingId)` | `RevisionRecord[]` | |
| `getCurrentRevision(drawingId)` | `RevisionRecord` | |
| `updateDrawing(id, patch)` | `DrawingRecord` | |
| `getDrawingFileUrl(path)` | `string` | |

### 2.3 QTO items

| Function | Returns | Notes |
| --- | --- | --- |
| `listQtoItems(tenderId, filters)` | `QtoItem[]` | building, discipline, status, qs, drawing |
| `getQtoItem(id)` | `QtoItemDetail` | + calculations, lines, measurements, reviews, revisions |
| `createQtoItem(payload)` | `QtoItem` | generates next `qto_no` |
| `updateQtoItem(id, patch)` | `QtoItem` | blocked when `is_locked`; creates revision |
| `deleteQtoItem(id)` | `void` | only DRAFT |
| `changeStatus(id, to, opts)` | `QtoItem` | enforces workflow + segregation of duties |
| `submitForCheck(id)` | `QtoItem` | requires SELF CHECKED + non-superseded revision |
| `lockItem(id)` | `QtoItem` | on approval |
| `createRevision(id, changeReason)` | `QtoItem` | snapshots current, bumps revision_no, DRAFT |

### 2.4 Calculations

| Function | Returns | Notes |
| --- | --- | --- |
| `addCalculation(itemId, {formula, displayText, method})` | `Calculation` | evaluates safe formula |
| `updateCalculation(id, patch)` | `Calculation` | recomputes result |
| `addCalculationLine(calcId, line)` | `CalculationLine` | sign + / - |
| `listCalculationLines(calcId)` | `CalculationLine[]` | ordered by seq |
| `recomputeNetQuantity(itemId)` | `{ quantity }` | sums signed lines |

### 2.5 Measurements

| Function | Returns | Notes |
| --- | --- | --- |
| `addMeasurement(itemId, payload)` | `Measurement` | drawing_revision_id, page_no, type, points, scale |
| `listMeasurements(itemId)` | `Measurement[]` | |
| `updateMeasurement(id, patch)` | `Measurement` | |
| `deleteMeasurement(id)` | `void` | |

### 2.6 Assumptions & clarifications

| Function | Returns | Notes |
| --- | --- | --- |
| `listAssumptions(tenderId)` | `Assumption[]` | |
| `addAssumption(payload)` | `Assumption` | |
| `listClarifications(tenderId)` | `Clarification[]` | |
| `addClarification(payload)` | `Clarification` | may create/link `design_rfi` |
| `respondClarification(id, response)` | `Clarification` | |

### 2.7 Reviews

| Function | Returns | Notes |
| --- | --- | --- |
| `listReviews(qtoItemId)` | `Review[]` | |
| `addReview(qtoItemId, {decision, comment})` | `Review` | enforces transitions + comment-on-reject |

### 2.8 Summary & BOQ mapping

| Function | Returns | Notes |
| --- | --- | --- |
| `getQtoSummary(tenderId, filters)` | `SummaryRow[]` | building/discipline/work section rollups |
| `getProgress(tenderId)` | `ProgressStats` | counts by status + by package |
| `getRiskRegister(tenderId)` | `RiskItem[]` | |
| `listBoqLinks(tenderId)` | `BoqLink[]` | |
| `linkToBoq(itemIds, boqItemId)` | `BoqLink[]` | creates `qto_boq_links` |
| `unlinkFromBoq(linkId)` | `void` | |

### 2.9 Revision history

| Function | Returns | Notes |
| --- | --- | --- |
| `getRevisionHistory(qtoItemId)` | `Revision[]` | |
| `compareRevisions(itemId, revA, revB)` | `Diff` | quantity/unit/status delta |

---

## 3. HTTP endpoints (server-side only)

Used where business logic must not run in the browser.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/qto/upload` | validate + stream DWG/PDF into Supabase Storage, return path |
| GET | `/api/qto/export?tenderId=` | generate xlsx export workbook and return URL |
| GET | `/api/qto/summary/report?tenderId=` | PDF/print-ready QTO summary report |

Note: where the existing pattern suffices (direct Supabase from the service layer), the
HTTP endpoints are thin or omitted. Export logic may live in the service layer using the
`xlsx` library and a signed Storage URL, matching existing tender export flows.

---

## 4. Authorization

- Read/write enforcement per action: `can("qto_documents", "can_create")`,
  `can("qto_review", "edit")`, `can("qto_approval", "approve")`, etc.
- Segregation of duties: `changeStatus(..., "APPROVED")` is rejected server-side when
  `reviewer_id === prepared_by` is required to differ.
- Row-level: all queries filtered by `tender_id` derived from an authorized tender.

---

## 5. Error contract

Service functions return `{ data, error }` (Supabase style). Validation failures map to
`error.code`:

| Code | Meaning |
| --- | --- |
| `QTO_SUPERSEDED_DRAWING` | cannot submit against superseded revision |
| `QTO_SELF_APPROVAL` | preparer cannot approve own item |
| `QTO_LOCKED` | item is approved/posted, edits rejected |
| `QTO_INVALID_TRANSITION` | status change not allowed |
| `QTO_INVALID_FORMULA` | expression did not evaluate |
| `QTO_NEGATIVE_QUANTITY` | quantity < 0 |
