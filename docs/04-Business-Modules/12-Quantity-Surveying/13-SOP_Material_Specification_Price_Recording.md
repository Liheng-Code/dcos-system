# SOP — Material Specification & Price Recording

| Document Control | |
|---|---|
| Document Title | SOP — Material Specification & Price Recording (Cost & Rate Library) |
| Document No. | QS-SOP-004 |
| Version | 1.0 |
| Owner | QS Manager |
| Applies To | DCOS System (Supabase / PostgreSQL) — Cost & Rate Library, Material layer |
| Status | For Implementation |
| Relationship to other SOPs | Extends **QS-SOP-002** (`07-SOP_Direct_Works_Cost_Library_Module.md`) Phase 1 — Level 1 Resources, Suppliers, Price History. Uses the same coding standard (§6 D2), unit dictionary (§6 D3), one-approver rule (§4), and append-only price rule (§7 Step 1.4.1). Design basis: **DCOS-DS-12-012** (`12-Material-Specification-Price-Recording-Design.md`). Row-generation aid: **DCOS-TMPL-12-014** (`14-AI-Prompt_Material_Spec_Row_Generator.md`). |

---

## 1. Purpose

Define the step-by-step procedure for QS and Procurement staff to record, into the DCOS Cost & Rate Library:

1. A **material** and its identity (code, unit, price-driving description).
2. One or more **specifications**, each with dated **revisions**.
3. **Suppliers** and the **supplier ↔ material** links.
4. **Prices**, each as a permanent historical record with an effective-cost breakdown, moved through **Draft → Submitted → Verified → Approved**.
5. Ongoing **price follow-up** — chasing quotations, refreshing rates, retiring expired ones — without ever overwriting history.

**Core principle (from QS-SOP-002):** *Record once → Verify → Approve → Preserve history → Search → Compare → Reuse for estimation.* A price is never edited; a change is a new row.

---

## 2. Scope

| In scope | Out of scope |
|---|---|
| Material master + attributes, specifications + revisions | Rate build-up recipes, assemblies, parametric estimates (QS-SOP-002 Phases 2–5) |
| Supplier profile + supplier-material links | RFQ issue / procurement award workflow (Procurement module) |
| Price recording, effective-cost breakdown, approval workflow | Feeding effective cost into work-item rates (design Phase I — separate authorisation) |
| Quotation records (header + items) held in the library | Purchase orders, invoices, goods receipt |
| Price follow-up, expiry, supersession | Forecasting, price-trend analytics (design Phase J) |

---

## 3. Roles

| Role | Responsibility |
|---|---|
| **QS Manager (Owner)** | Approves new materials, specifications, and coding. **Sole approver** of prices moving to `Approved`. Signs off each phase acceptance test. Runs the quarterly library health check. |
| **Estimator / QS** | Creates materials and specifications, writes price-driving descriptions, enters quotations, records prices, submits prices for approval, chases quotation renewals. |
| **Procurement** | Registers suppliers, maintains supplier profiles and supplier-material links, enters supplier quotations, feeds actual purchase prices monthly. |
| **Reviewer (QS or Procurement lead)** | Verifies submitted prices (arithmetic, source document, unit, currency) before they reach the QS Manager. |
| **Developer / Admin** | Runs migrations, maintains views and RLS, runs the controlled Excel import. |

**Rule — one approver.** No price becomes `Approved` (and therefore usable by official estimation) without QS Manager approval. `created_by` is recorded on every row.

---

## 4. Prerequisites

Before recording begins:

1. DCOS-DS-12-012 signed off (schema, Excel→DB mapping, coding decision D1).
2. Cost & Rate Library migrations applied through at least design Phase C-E (material attributes, specs, supplier links, price breakdown, price submissions).
3. The recorder has the `qs_libraries` permission with `can_create` (and `can_submit` to submit prices; `can_approve` is QS-Manager-only).
4. Source documents in hand — at minimum, for each material being recorded: one supplier quotation **or** one dated market-survey note, plus a manufacturer datasheet for the specification.

---

## 5. Coding & units (locked — do not deviate)

### 5.1 Material code — `M-<GRP3>-<NNN>`

| Segment | Rule |
|---|---|
| `M` | Material. (Labor `L`, Equipment `E`, Subcontract `S` — not covered by this SOP.) |
| `<GRP3>` | Exactly 3 letters identifying the sub-family. Ceiling families: **`CLG`** = ceiling system, **`CLF`** = ceiling frame / suspension, **`CLA`** = ceiling access panel / accessory. New group codes require QS Manager approval and an entry in the group register. |
| `<NNN>` | Zero-padded 3-digit serial, contiguous within the group, starting `001`. |

The template's `MAT-CL-###` codes are **not** used as the material code. Carry the old code as a tag `legacy:MAT-CL-001` on the material for spreadsheet cross-reference.

### 5.2 Specification ID — `SPEC-<GRP3>-<NNN>-R<rr>`

Matches the material's group + serial; `-R01` for the first revision, `-R02` for the next, etc. **A revision is never edited** — a change is a new `-Rnn` row.

### 5.3 Supplier code — `SUP-<NNN>`. Supplier-material link — `SM-<NNN>`. Quotation — `QT-<YYYY>-<NNN>`. Price — `PRC-<NNNN>`.

### 5.4 Units — locked dictionary

`m, m2, m3, kg, ton, pc, set, day, hr, ls, month, l, bag, box, roll, sheet, no, %`

Convert every source unit at entry: `m²`→`m2`, `nr` / `No.`→`no`, `lin.m` / `length`→`m`, `sqm`→`m2`. **One material = one unit, forever.** If a supplier quotes in a different unit, convert the price to the material's unit and note the conversion in the price `Notes`.

### 5.5 Currency

Allowed: `USD, KHR, EUR, THB, VND, CNY, SGD, JPY`. Base reporting currency is `USD`. **Store the original transaction currency and price.** Never overwrite a historical price because an exchange rate moved.

---

## 6. Procedure A — Record a new material

> Screen: **QS → Libraries → Materials & Specifications → New Material.**

1. **Confirm it is genuinely new.** Search the library by name, brand, and any supplier product code. If a material with the same price-driving specification exists, **do not create a duplicate** — add a supplier link or a price to the existing one instead (Procedures C, D).
2. **Assign the code** per §5.1.
3. **Write the price-driving description.** It must state grade / size / class / thickness — the attributes that make the price what it is.
   - Reject: "Gypsum board ceiling".
   - Accept: "12.5 mm gypsum board suspended ceiling on GI T-grid (main/cross runners 1200/600 mm), perimeter channel, hangers — board to EN 520".
4. **Set the unit** (§5.4) — permanent.
5. **Fill the attributes:** category, subcategory, discipline, material type, standard, grade, brand, model, manufacturer, package size, dimension, weight, colour/finish, application/related element, tags. Unknown fields → leave blank; do **not** invent.
6. Add the legacy tag `legacy:<old code>` if migrating from the spreadsheet.
7. Set **Status = Active** (or `draft` if the specification is not yet confirmed).
8. Save. `created_by` / `created_date` are recorded automatically.

**Bulk option:** use DCOS-TMPL-12-014 to draft `01_Material_Master` rows from source documents, review against its §6 checklist, then hand the workbook to the Developer/Admin for the controlled import (§11).

---

## 7. Procedure B — Record a specification and its revisions

> Screen: **Material detail → Specification tab → New Specification** (then **New Revision**).

1. On the material, create the specification header: `Specification ID` (§5.2), specification name, discipline.
2. Add **Revision R01** with: standard, grade, strength/performance, dimension, thickness, density, unit, manufacturer, brand; technical / installation / testing / approval requirements; **effective date**; expiry date (blank = open-ended); status `active`.
3. Attach or reference the datasheet as the `source_document`.
4. When the specification changes (new datasheet, revised standard, tighter performance): **add Revision R02** — never edit R01. Set R01 status to `superseded` and give R02 an effective date ≥ R01's.
5. The library shows the **current** specification = the latest revision whose effective date has passed and whose expiry date has not.

**Rule:** a revision row, once saved, is immutable (enforced in the database — no update/delete).

---

## 8. Procedure C — Register a supplier and link it to materials

> Screen: **QS → Libraries → Suppliers** (profile) and **Material detail → Suppliers tab** (link).

1. **Supplier:** search first. If new, create with `SUP-<NNN>`, company name, and profile fields: trading name, supplier type (`Manufacturer / Distributor / Importer / Local Supplier / Specialist Supplier / General Supplier`), contact person + position + phone + email, address, country, province/city, website, product categories, payment terms, delivery terms, lead time, MOQ, credit terms.
2. **Ratings** (reliability, quality, price competitiveness, overall 1–5) — enter only if evidence exists (delivery history, QA records). **Do not fabricate supplier performance data.** The overall 1–5 rating maps to the library's `A/B/C` band automatically.
3. **Link (supplier-material):** on the material's Suppliers tab, add `SM-<NNN>` with supplier product code, supplier product name, brand/manufacturer (if the supplier's differs), specification reference, package size, MOQ, lead time, active flag.
4. A material may be linked to many suppliers; a supplier to many materials. One `(supplier, material)` pair = one link (duplicates are rejected).
5. To stop using a supplier for a material, set the link **inactive** — do not delete it (history references it).

---

## 9. Procedure D — Record a price

> Screen: **Material detail → Price History tab → Record Price** (direct) or **Submit Price for Approval** (workflow).

### 9.1 Every price row needs

- Material, supplier, **effective date** (`valid_from`), quotation expiry (`quote_valid_until`) where the source is a quotation.
- **Currency** (original) and **Basic Unit Price** (the quoted / listed price, before adjustments).
- **Breakdown:** discount, delivery cost, handling cost, tax, other charges. Leave at 0 if not applicable.
- **Source type:** `quotation` (supplier quote), `purchase` (actual PO/invoice price), `market_survey` (observed, no formal quote), `estimate` (derived, no source — last resort).
- **Source document** reference (quotation number + PDF, price list, survey note).
- **Location**, payment terms, delivery terms, lead time, quantity (if the price is quantity-dependent).
- **`Notes` with a `Basis:` clause** — where the number came from. A price row without a basis is invalid.

### 9.2 Effective unit cost

`Effective Unit Cost = Basic Unit Price − Discount + Delivery Cost + Handling Cost + Other Charges + Tax`

The system computes and stores this automatically. Show the arithmetic in `Notes` whenever any breakdown component is non-zero. Compare suppliers on **effective** cost, not basic price.

### 9.3 Direct entry vs approval workflow

| Path | When | Result |
|---|---|---|
| **Record Price (direct)** | Market surveys, actual purchases, internal estimates — where no formal approval is required | Inserts an append-only `dwl_resource_prices` row, `price_status = approved`, immediately visible as the current price |
| **Submit Price for Approval** | Supplier quotations that will feed official estimation / tenders | Creates a **submission** (not yet a price). Goes to Reviewer → QS Manager. Only on approval is the immutable price row created. |

### 9.4 The workflow

```
Estimator/QS/Procurement   → Create submission (Draft)
                           → Submit
Reviewer                   → Verify   (checks arithmetic, source doc, unit, currency, basis)
                             └─ or Reject (with reason) → no price row is ever created
QS Manager                 → Approve  → system inserts the permanent price row
                           → Price becomes the current approved rate
```

- The reviewer and the approver must be different people from the submitter where staffing allows.
- A rejected submission is corrected and re-submitted, or abandoned. Nothing reaches the price history until approval.
- Approval writes `approved_by` / `approved_at` onto the price row.

### 9.5 Never overwrite

If a supplier sends a new price, **add a new row** with the new effective date. The old row stays. Example:

```
2025-06   Supplier A   USD 8.20 / m2   (kept)
2026-02   Supplier A   USD 8.90 / m2   (kept)
2026-08   Supplier A   USD 9.40 / m2   (new current)
```

Editing or deleting a saved price row is blocked by the database.

---

## 10. Procedure E — Price follow-up (ongoing)

The library only stays useful if prices are refreshed. This procedure is a **calendar routine**, not a one-off.

### 10.1 Routine calendar

| Frequency | Task | Owner |
|---|---|---|
| **Weekly** | Enter every new supplier quotation received that week — as a submission if it will feed estimation, else direct. Every quotation gets a `quote_valid_until` from the supplier's document. | Estimator / Procurement |
| **Weekly** | Work the **chase list** (§10.2) — follow up quotations requested but not yet received; follow up quotations expiring within 21 days. | Estimator |
| **Monthly** | Enter actual purchase prices from Procurement (`source_type = purchase`) for materials bought that month. | Procurement |
| **Monthly** | Review the **Expiring Quotations** panel (14 / 30 / 60 / 90-day windows). For each: request a renewal, or mark the price `expired` if the material is dormant. | QS Manager |
| **Per tender** | Before issuing an estimate, confirm the reference rate for each major material is `approved` and its latest quotation is < 90 days old; if not, raise a chase. | Estimator |
| **Quarterly** | **Library health check** — list materials with no price update in > 6 months; materials with only one supplier; prices with `source_type = estimate` still unreplaced; suppliers with no active link. Assign follow-ups. | QS Manager |

### 10.2 The chase list

A running log (spreadsheet tab, task board, or the Price Approvals screen filtered to `draft`/`submitted`) with, per line:

| Field | Meaning |
|---|---|
| Material code + name | what is being priced |
| Supplier | who was asked |
| RFQ / request ref + date sent | the outbound request |
| Expected-by date | when the quote is due |
| Status | `requested` / `received` / `entered` / `approved` / `declined` / `no-response` |
| Last chase date + next chase date | keeps the follow-up cadence visible |
| Notes | partial info, verbal indication, reason for delay |

**Working rule:** chase at request + 3 working days, then weekly. After 3 unanswered chases, mark `no-response`, record it, and widen the supplier list. Never enter a verbally-indicated price as a real row — hold it on the chase list until a written source arrives.

### 10.3 Superseding a price

When a newer approved price for the same material + supplier exists, set the previous row's `price_status` to `superseded` (it stays in history and in trend charts). When a quotation passes its `quote_valid_until` with no renewal, set `expired`. The current-price view always shows the latest effective, non-expired, approved row.

### 10.4 Significant price movement

If a new price differs from the previous approved price for the same material by more than **±10%**, flag it in the submission `Notes` and notify the QS Manager before approval. Large moves are recorded, not smoothed — historical truth is preserved (`2025 = $80`, `2026 = $92`, `2026-09 = $97` all remain).

---

## 11. Controlled Excel import (bulk)

For first-load or large batches, use the workbook + importer instead of screen-by-screen entry.

1. Populate `DCOS_Cost_Rate_Library_Material_Spec_Price_Template.xlsx` — manually or via DCOS-TMPL-12-014.
2. Self-check against DCOS-TMPL-12-014 §6 (codes, units, currency, effective cost, basis, vocabulary, cross-refs).
3. Hand to Developer/Admin. The importer runs **Upload → Validate → Preview → Show Errors → Confirm → Create → Audit**.
4. Invalid rows (negative price, unknown unit, missing supplier, duplicate code, missing basis) are listed in the preview and **nothing is written** until they are fixed and re-uploaded.
5. Imported prices land as **submissions** unless the sheet explicitly marks them `APPROVED` with a cited source; the QS Manager still confirms the batch.
6. The import is logged (who, when, row counts, file name) in the audit trail.

---

## 12. Acceptance tests

Run before declaring this SOP live in an environment:

| # | Test | Pass criteria |
|---|---|---|
| 1 | Create material `M-CLG-001` with a bare description ("gypsum ceiling") | Rejected at review — description lacks price-driving spec |
| 2 | Create spec `SPEC-CLG-001-R01`, then add `R02` with a later effective date | Current-spec view returns only `R02`; `R01` shows `superseded`; editing `R01` is blocked |
| 3 | Link supplier `SUP-001` to `M-CLG-001` twice | Second link rejected (duplicate) |
| 4 | Record a price with basic 8.90, discount 5%, delivery 0.60 | Effective unit cost stored = 9.06; arithmetic present in `Notes` |
| 5 | Enter a second price for the same material/supplier, later date | Both rows retained; current-price view shows the newer; older row still queryable |
| 6 | Submit a quotation price; Reviewer verifies; QS Manager approves | Exactly one immutable price row created, `approved_by` set, visible as current |
| 7 | Reviewer rejects a submission | No price row exists anywhere for it |
| 8 | Non-approver attempts to approve | Blocked by the system, not just a hidden button |
| 9 | Attempt to edit or delete a saved price row | Blocked by the database |
| 10 | Expiring-quotation panel, 14-day window | Lists every price whose `quote_valid_until` is within 14 days |
| 11 | Bulk import a sheet with one negative price and one unknown unit | Preview lists both errors; zero rows written |
| 12 | Quarterly health-check query | Returns materials with no price in > 6 months and single-supplier materials |

Sign-off: QS Manager ______________________  Date ____________

---

## 13. Change control

Changes to the coding standard (§5.1–5.3), the unit dictionary (§5.4), or the approval workflow (§9.4) require a new version of this SOP approved by the QS Manager. Adding a new `<GRP3>` group code does not require an SOP revision but must be recorded in the group register.

*End of QS-SOP-004 v1.0.*
