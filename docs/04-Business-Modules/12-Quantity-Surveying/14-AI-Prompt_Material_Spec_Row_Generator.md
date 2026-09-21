# AI Prompt — Material Specification & Price Row Generator

| Document Control | |
|---|---|
| Document Title | Reusable AI Prompt — Material / Spec / Supplier / Price Row Generator |
| Document No. | DCOS-TMPL-12-014 |
| Status | Draft — for review |
| Date | 2026-09-10 |
| Owner | QS Manager |
| Pairs with | `DCOS_Cost_Rate_Library_Material_Spec_Price_Template.xlsx` · `12-Material-Specification-Price-Recording-Design.md` (DCOS-DS-12-012) · `13-SOP_Material_Specification_Price_Recording.md` (QS-SOP-004) |

---

## 1. What this is

A **copy-paste prompt** for an LLM (Claude, etc.) that turns a construction element and its source documents (datasheets, supplier quotations, catalogues) into **validated rows in the exact column order** of the Excel format log. Ceiling systems are the fully worked example in §5; the prompt itself is element-agnostic.

**Use it to:**
- Draft a new element's rows before manual review and paste into the workbook.
- Re-shape a supplier quotation PDF into `05_Price_History` + `06/07` quotation rows.
- Produce seed-migration source data (the output maps 1:1 to the `dwl_*` tables per DCOS-DS-12-012 §5).

**Do not use it to:** invent prices, suppliers, standards, or performance figures. Every value must trace to a source document or be left blank and flagged `TO VERIFY`.

---

## 2. How to run it

1. Fill the **INPUTS** block (§4).
2. Attach or paste the source documents.
3. Paste §3 + §4 into the model.
4. Review every output row against §6 (Validation checklist). Fix or flag.
5. Paste into the workbook sheet-by-sheet. Confirm dropdowns don't reject any cell.
6. For DB import, hand the reviewed workbook to the importer (DCOS-DS-12-012 §8).

---

## 3. THE PROMPT (copy from here)

> You are a construction Quantity Surveyor and data-standards specialist populating the **DCOS Cost & Rate Library** recording template. You produce structured tabular data only — you never invent commercial facts.
>
> ### Your task
> From the INPUTS and attached source documents, generate rows for these sheets, **in this exact column order**, as pipe-delimited tables (one table per sheet, header row first). Generate a sheet only if the INPUTS or sources support it; otherwise output `-- <sheet>: no source data --`.
>
> ### Global rules
> 1. **No fabrication.** Every price, supplier name, standard, grade, dimension, and performance figure must come from a source document or the INPUTS. If a required field is unknown, write `TO VERIFY` (text fields) or leave blank (numeric/date fields) — never guess.
> 2. **Material Code** = `M-<GRP3>-<NNN>`: `M` for material, `<GRP3>` a 3-letter group from the INPUTS `group_map`, `<NNN>` a zero-padded 3-digit serial starting at `001` per group. Labor = `L-…`, Equipment = `E-…`, Subcontract = `S-…`. Never use the raw template `MAT-…` prefix. Put any pre-existing template/legacy code in the `Notes`/`Tags` field as `legacy:<code>`.
> 3. **Unit** must be one of the locked dictionary: `m, m2, m3, kg, ton, pc, set, day, hr, ls, month, l, bag, box, roll, sheet, no, %`. Convert source units at generation time (`m²`→`m2`, `nr`/`No.`→`no`, `lin.m`/`length`→`m`, `sqm`→`m2`). One material = one unit, forever.
> 4. **Currency** must be one of `USD, KHR, EUR, THB, VND, CNY, SGD, JPY`. Keep the **original** transaction currency — do not convert prices.
> 5. **Effective Unit Cost** = `Basic Unit Price − Discount + Delivery Cost + Handling Cost + Other Charges + Tax`. Compute it; show your arithmetic in the `Remarks`/`Notes` field for any row where a breakdown component is non-zero.
> 6. **Description** (Material Master) must contain the price-driving specification (grade / size / class / thickness). "Gypsum board ceiling" alone is not acceptable — "12.5 mm gypsum board suspended ceiling on GI T-grid, EN 520" is.
> 7. **Every price row's `Notes`** must contain a `Basis:` clause stating where the number came from (quotation number + date, catalogue, market survey + date). No basis → the row is invalid.
> 8. **Controlled vocabularies** — use only these values:
>    - *Category*: as given in INPUTS `category` (e.g. `Ceiling`).
>    - *Discipline*: `Architectural, Structural, Civil, MEP, Interior, Landscape, Specialist, Façade, Fire & Life Safety, Acoustic`.
>    - *Supplier Type*: `Manufacturer, Distributor, Importer, Local Supplier, Specialist Supplier, General Supplier`.
>    - *Price Status*: `DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, ACTIVE, EXPIRED, SUPERSEDED, ARCHIVED, REJECTED`. Use `UNDER_REVIEW` unless a source explicitly shows an approval.
>    - *Verification Status*: `Pending, Verified, Rejected, Requires Update` (default `Pending`).
>    - *Record Status*: `Active, Inactive, Draft, Archived, Superseded` (default `Active`).
>    - *Standard*: quote the actual standard from the datasheet (`EN 520`, `EN 13964`, `ASTM C635`, `ASTM C636`, `ISO …`), else `Manufacturer Standard` or `Project Specific`.
> 9. **Dates** are `YYYY-MM-DD`. If a quotation shows only a month, use the first day and flag `TO VERIFY` in `Notes`.
> 10. **Do not** mark anything `APPROVED`/`Verified` unless a source document shows it. Demo or illustrative data must say so in `Notes`.
>
> ### Output — column order per sheet
>
> **01_Material_Master**
> `Material Code | Material Name | Category | Subcategory | Discipline | Material Type | Description | Technical Specification (Summary) | Standard | Grade | Brand | Model | Manufacturer | Unit | Package Size | Dimension / Size | Weight | Color / Finish | Application / Related Element | Status | Tags | Notes | Created By | Created Date | Modified By | Modified Date`
>
> **02_Material_Specification**
> `Specification ID | Material Code | Material Name (ref) | Specification Name | Standard | Grade | Strength / Performance | Dimension | Thickness | Density | Unit | Manufacturer | Brand | Technical Requirements | Installation Requirements | Testing Requirements | Approval Requirements | Revision | Effective Date | Expiry Date | Status | Notes`
> *(Specification ID = `SPEC-<GRP3>-<NNN>-R01`; new revision = `-R02`, etc. One row per revision.)*
>
> **03_Supplier_Master**
> `Supplier Code | Company Name | Trading Name | Supplier Type | Contact Person | Position | Phone | Email | Address | Country | Province / City | Website | Product Categories | Payment Terms | Delivery Terms | Lead Time (days) | Min Order Qty | Credit Terms | Supplier Rating (1-5) | Reliability Rating | Quality Rating | Price Competitiveness | Status | Notes`
> *(Supplier Code = `SUP-<NNN>`. Ratings only if a source supports them, else blank.)*
>
> **04_Supplier_Material**
> `Supplier Material ID | Supplier Code | Supplier Name | Material Code | Material Name | Supplier Product Code | Supplier Product Name | Brand | Manufacturer | Specification Ref | Package Size | Min Order Qty | Lead Time (days) | Active / Inactive | Notes`
> *(Supplier Material ID = `SM-<NNN>`.)*
>
> **05_Price_History**
> `Price ID | Material Code | Material Name | Supplier Code | Supplier Name | Project Code | Project Name | Quotation ID | Quotation No. | Date | Effective Date | Expiry Date | Quantity | Unit | Currency | Basic Unit Price | Discount | Delivery Cost | Handling Cost | Tax | Other Charges | Effective Unit Cost | Payment Terms | Delivery Terms | Location | Lead Time (days) | Price Status | Source Document | Verification Status | Approval Status | Created By | Approved By | Created Date | Approved Date | Notes`
> *(Price ID = `PRC-<NNNN>`. Project Code/Name blank for market quotes. One row per price observation — never overwrite an earlier one.)*
>
> **06_Quotation_Header**
> `Quotation ID | Quotation Number | Supplier Code | Supplier Name | Project Code | Project Name | RFQ Number | Quotation Date | Valid Until | Currency | Payment Terms | Delivery Terms | Contact Person | Source Document | Status | Notes`
>
> **07_Quotation_Items**
> `Item ID | Quotation ID | Quotation No. | Item No. | Material Code | Material Name | Supplier Product Code | Description | Specification | Quantity | Unit | Unit Price | Discount | Delivery | Tax | Effective Price | Lead Time (days) | Remarks`
>
> ### After the tables
> Output a short **REVIEW NOTES** section listing: every `TO VERIFY` cell and why; every assumed value; any source ambiguity; any row you could not generate for lack of a source.

*(end of prompt — stop copying here)*

---

## 4. INPUTS block (fill and paste with the prompt)

```
element:            Ceiling
category:           Ceiling
default_discipline: Architectural
default_country:    Cambodia
default_location:   Phnom Penh
default_currency:   USD
created_by:         <your name>
created_date:       <today YYYY-MM-DD>

group_map:          # 3-letter code per sub-family (drives Material Code)
  Ceiling System            = CLG
  Ceiling Frame / Suspension = CLF
  Ceiling Access / Accessory = CLA

serial_start:       001        # per group
tax_rule:           10% on Basic Unit Price   # or "none", or "per quotation"
approval_policy:    Never mark APPROVED/Verified without a source document

source_documents:   # list what you are attaching
  - <supplier quotation PDF QT-...>
  - <manufacturer datasheet ...>
  - <price list / catalogue ...>

known_suppliers:    # optional — pre-existing SUP codes to reuse
  - SUP-001 = <Company Name>
```

---

## 5. Worked example — Ceiling

**Scenario:** record one ceiling system with one specification and one supplier quotation.

**Attached source (excerpt):**
> *Quotation QT-2026-011, dated 2026-08-14, valid to 2026-09-30, from Cambodia Building Materials Co., Ltd. (Phnom Penh).*
> *Item 1 — 12.5 mm gypsum board suspended ceiling system, incl. GI perimeter channel, main & cross T-runners at 1200/600 mm, hangers. Board to EN 520. Ref CBM-GYP-SUS-12.5. USD 8.90 / m². Trade discount 5%. Delivery to site USD 0.60 / m². Lead time 7 days. Payment 30 days.*

**Expected generator output:**

**01_Material_Master**
```
Material Code | Material Name | Category | Subcategory | Discipline | Material Type | Description | Technical Specification (Summary) | Standard | Grade | Brand | Model | Manufacturer | Unit | Package Size | Dimension / Size | Weight | Color / Finish | Application / Related Element | Status | Tags | Notes | Created By | Created Date | Modified By | Modified Date
M-CLG-001 | Gypsum Board Suspended Ceiling 12.5mm | Ceiling | Suspended Ceiling | Architectural | Ceiling System | 12.5 mm gypsum board suspended ceiling on GI T-grid (main/cross runners 1200/600 mm), perimeter channel, hangers | 12.5mm gypsum board on GI concealed/exposed T-grid, EN 520 | EN 520 | Standard | TO VERIFY | TO VERIFY | TO VERIFY | m2 | Sheet | 1200x600 grid; 12.5mm board | TO VERIFY | White / Smooth | Office, hotel, residential ceilings | Active | ceiling;gypsum;suspended;legacy:MAT-CL-001 | Basis: quotation QT-2026-011 (2026-08-14). Brand/manufacturer not stated on quote. | <you> | 2026-09-10 | | 
```

**02_Material_Specification**
```
Specification ID | Material Code | Material Name (ref) | Specification Name | Standard | Grade | Strength / Performance | Dimension | Thickness | Density | Unit | Manufacturer | Brand | Technical Requirements | Installation Requirements | Testing Requirements | Approval Requirements | Revision | Effective Date | Expiry Date | Status | Notes
SPEC-CLG-001-R01 | M-CLG-001 | Gypsum Board Suspended Ceiling 12.5mm | Standard Gypsum Suspended System | EN 520 / EN 13964 | Standard | Fire EI 30 optional | Board 1200x2400; grid 1200/600 | 12.5 mm | ~700 kg/m3 | m2 | TO VERIFY | TO VERIFY | GI main & cross runners, hangers @ max 1200 mm, perimeter channel | Level to +/-3 mm; joints taped & filled; set-out from room centre | Fire test report where EI rating required | Architect / Consultant approval of sample | R01 | 2026-08-14 | | Active | Basis: quotation QT-2026-011 + EN 520 board reference. Density typical, TO VERIFY.
```

**03_Supplier_Master**
```
Supplier Code | Company Name | Trading Name | Supplier Type | Contact Person | Position | Phone | Email | Address | Country | Province / City | Website | Product Categories | Payment Terms | Delivery Terms | Lead Time (days) | Min Order Qty | Credit Terms | Supplier Rating (1-5) | Reliability Rating | Quality Rating | Price Competitiveness | Status | Notes
SUP-001 | Cambodia Building Materials Co., Ltd. | CBM | Distributor | TO VERIFY | | TO VERIFY | TO VERIFY | TO VERIFY | Cambodia | Phnom Penh | | Ceiling; Drywall; Framing | 30 days | Delivered site | 7 | TO VERIFY | | | | | | Active | Basis: quotation QT-2026-011 letterhead. Contact details TO VERIFY.
```

**04_Supplier_Material**
```
Supplier Material ID | Supplier Code | Supplier Name | Material Code | Material Name | Supplier Product Code | Supplier Product Name | Brand | Manufacturer | Specification Ref | Package Size | Min Order Qty | Lead Time (days) | Active / Inactive | Notes
SM-001 | SUP-001 | Cambodia Building Materials Co., Ltd. | M-CLG-001 | Gypsum Board Suspended Ceiling 12.5mm | CBM-GYP-SUS-12.5 | 12.5mm Gypsum Suspended Ceiling System | TO VERIFY | TO VERIFY | SPEC-CLG-001-R01 | Sheet | TO VERIFY | 7 | Active | Basis: quotation QT-2026-011 item 1.
```

**05_Price_History**  *(Effective = 8.90 − 0.445 + 0.60 = 9.055 → 9.06)*
```
Price ID | Material Code | Material Name | Supplier Code | Supplier Name | Project Code | Project Name | Quotation ID | Quotation No. | Date | Effective Date | Expiry Date | Quantity | Unit | Currency | Basic Unit Price | Discount | Delivery Cost | Handling Cost | Tax | Other Charges | Effective Unit Cost | Payment Terms | Delivery Terms | Location | Lead Time (days) | Price Status | Source Document | Verification Status | Approval Status | Created By | Approved By | Created Date | Approved Date | Notes
PRC-0001 | M-CLG-001 | Gypsum Board Suspended Ceiling 12.5mm | SUP-001 | Cambodia Building Materials Co., Ltd. | | | QT-2026-011 | QT-2026-011 | 2026-08-14 | 2026-08-14 | 2026-09-30 | | m2 | USD | 8.90 | 0.445 | 0.60 | 0 | 0 | 0 | 9.06 | 30 days | Delivered site | Phnom Penh | 7 | UNDER_REVIEW | QT-2026-011.pdf | Pending | Pending | <you> | | 2026-09-10 | | Basis: quotation QT-2026-011 (2026-08-14) item 1. Effective = 8.90 - (5% x 8.90 = 0.445) + 0.60 delivery = 9.055, rounded 9.06. Tax not shown on quote.
```

**06_Quotation_Header**
```
Quotation ID | Quotation Number | Supplier Code | Supplier Name | Project Code | Project Name | RFQ Number | Quotation Date | Valid Until | Currency | Payment Terms | Delivery Terms | Contact Person | Source Document | Status | Notes
QT-2026-011 | QT-2026-011 | SUP-001 | Cambodia Building Materials Co., Ltd. | | | TO VERIFY | 2026-08-14 | 2026-09-30 | USD | 30 days | Delivered site | TO VERIFY | QT-2026-011.pdf | UNDER_REVIEW | Basis: attached quotation PDF.
```

**07_Quotation_Items**
```
Item ID | Quotation ID | Quotation No. | Item No. | Material Code | Material Name | Supplier Product Code | Description | Specification | Quantity | Unit | Unit Price | Discount | Delivery | Tax | Effective Price | Lead Time (days) | Remarks
QI-001 | QT-2026-011 | QT-2026-011 | 1 | M-CLG-001 | Gypsum Board Suspended Ceiling 12.5mm | CBM-GYP-SUS-12.5 | 12.5 mm gypsum board suspended ceiling system incl. GI T-grid, perimeter channel, hangers | SPEC-CLG-001-R01 | | m2 | 8.90 | 0.445 | 0.60 | 0 | 9.06 | 7 | Effective = 8.90 - 0.445 + 0.60 = 9.055 -> 9.06
```

**REVIEW NOTES (example)**
- `TO VERIFY`: brand, model, manufacturer, contact person, phone, email, address, MOQ, RFQ number — not stated on the quotation.
- Assumed: board density ~700 kg/m³ (typical EN 520), flagged.
- `Approval Status = Pending` / `Price Status = UNDER_REVIEW` — quotation carries no approval; do not promote without QS Manager sign-off (QS-SOP-004).
- Tax: quote shows none; `tax_rule` in INPUTS was `10%` — **conflict**, left at 0 and flagged; confirm whether VAT is added at PO.

---

## 6. Validation checklist (run on every generated batch)

| Check | Rule |
|---|---|
| Codes | `M-CLG/CLF/CLA-NNN` format; serials contiguous per group; legacy code captured in `Tags`/`Notes` |
| Units | every `Unit` in the locked dictionary; one unit per material across all sheets |
| Currency | in the allowed list; no cross-currency conversion of a quoted price |
| Effective cost | recomputed by hand for ≥3 rows; arithmetic shown in `Notes` when any component ≠ 0 |
| Description | contains grade / size / class / thickness — not a bare noun |
| Basis | every `05` row and every `06` header has a `Basis:` clause |
| Vocabulary | Category / Discipline / Supplier Type / Price Status / Verification Status all on-list |
| Approval | nothing `APPROVED` / `Verified` without a cited source |
| Dates | `YYYY-MM-DD`; month-only sources flagged |
| No fabrication | every non-blank commercial value traces to a source; unknowns are `TO VERIFY` / blank |
| Cross-refs | every `Material Code` / `Supplier Code` / `Quotation ID` used on a child sheet exists on its master sheet |

---

## 7. Mapping to the database (for the importer / seed author)

Each generated sheet maps to the `dwl_*` tables per **DCOS-DS-12-012 §5**. Summary:

| Generated sheet | DB target |
|---|---|
| `01_Material_Master` | `dwl_resources` (`category='material'`) + `dwl_material_attributes` (`legacy:` tag → `legacy_code`) |
| `02_Material_Specification` | `dwl_material_specs` + `dwl_material_spec_revisions` (append-only) |
| `03_Supplier_Master` | `dwl_suppliers` (rating 1–5 → `A/B/C`) + `dwl_supplier_profiles` |
| `04_Supplier_Material` | `dwl_supplier_materials` |
| `05_Price_History` | `dwl_resource_prices` (breakdown columns; `Effective Unit Cost` is a generated column — importer may recompute); non-`APPROVED` rows → `dwl_price_submissions` |
| `06/07_Quotation_*` | `dwl_quotations` / `dwl_quotation_items` (Phase F) |

*End of DCOS-TMPL-12-014 Draft.*
