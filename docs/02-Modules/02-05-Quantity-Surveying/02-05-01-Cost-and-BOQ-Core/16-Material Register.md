# Material Register — Material Master Fields

Module: Quantity Surveying → Cost & Rate Libraries → **Material Master**
Screen: *Create / Edit Material Record* (`components/qs/dwl-material-form-dialog.tsx`)
Related: [12-Material-Specification-Price-Recording-Design](12-Material-Specification-Price-Recording-Design.md), [13-SOP_Material_Specification_Price_Recording](13-SOP_Material_Specification_Price_Recording.md)

## 1. Register fields

```
Material
├── Code
├── Material Name
├── Category
├── Type
├── Specification
├── Standard
├── Size / Thickness
├── Density
├── Compressive Strength
├── Colour / Finish
├── Unit
├── Effective Date
├── Cost Code
├── Supplier
├── Brand
└── Status
```

## 2. Field mapping

| Register field | Form label | Stored in | Required | Notes |
|---|---|---|---|---|
| Code | Material Code | `dwl_resources.code` | Auto | **Auto-assigned on save, read-only.** See §6 Code rules. |
| Material Name | Material Name | `dwl_material_attributes.material_name` | Yes | Include the size in the name when it distinguishes the item. |
| Category | Category | `category_id` → `dwl_material_categories` | No | Managed via **+ Manage / New**. |
| Type | Type | `material_type` | No | Sub-type within the category, e.g. *Hollow Clay Brick – 4 Hole*. |
| Specification | Specification | `tech_spec_summary` | No | Free-text technical description / requirements. |
| Standard | Standard (EN/BS/ASTM) | `standard` | No | Write *Project Specification / Manufacturer Technical Data* and flag "confirm" until verified. |
| Size / Thickness | Size, Thickness | `dimension`, `thickness` | No | **Two fields.** Size e.g. `80 × 80 × 180 mm`; leave Thickness blank for units that have none. |
| Density | Density | `density` | No | **New.** Free text so ranges can be recorded (`~1,000–1,400 kg/m³`). |
| Compressive Strength | Compressive Strength | `compressive_strength` | No | **New.** Free text (`~5–10 MPa`). Grade/Strength (`grade`) remains for named grades such as C30/37. |
| Colour / Finish | Colour / Finish | `color_finish` | No | |
| Unit | Standard Unit | `dwl_resources.unit` | Yes | `pcs`, `m2`, `m3`, `kg`, … |
| Effective Date | Effective Date | `effective_date` | No | **New.** Date this record/specification takes effect. Formal revisions stay in `dwl_material_spec_revisions`, which has its own effective/expiry date. |
| Cost Code | Cost Code | `budget_code_id` → `budget_codes` | No | Pick from the budget code list (e.g. `MAS-BRK-001`). |
| Supplier | — (read-only) | current price → `current_supplier_name` | — | Not typed on the material. It comes from the active price record (Price History) or the Supplier Master → Supplier Materials link. Show "TBD" until a price exists. |
| Brand | Brand | `brand` | No | `TBD` until the brand is approved. Manufacturer is a separate optional field. |
| Status | Status | `lifecycle_status` | Yes | `draft` / `active` / `superseded` / `archived` / `obsolete`. |

Also on the form: Discipline, Specific Element, Application Scope and photo verification.

## 3. What changed

- Added **Density**, **Compressive Strength** and **Effective Date** columns to `dwl_material_attributes` (migration `20261002000001_dwl_material_master_extra_fields.sql`) and to `dwl_v_materials`.
- The Material form now captures Type, Colour / Finish, Size, Thickness, Density, Compressive Strength, Brand, Manufacturer and Effective Date.
- The material detail page shows Density, Compressive Strength and Effective Date.
- Supplier is deliberately not a material field: a material can have many suppliers and prices, so duplicating it would go stale.

## 4. Worked example

| Field | Value |
|---|---|
| Code | MAT-MASN-002 |
| Material Name | Red Clay Hollow Bricks (4-Hole 80×80×180 mm) |
| Category | Masonry & Plaster |
| Type | Hollow Clay Brick – 4 Hole |
| Specification | Machine-made fired red clay hollow brick; 4 vertical holes; nominal size 80×80×180 mm; suitable for internal/external non-load-bearing masonry subject to project design; regular shape with adequate firing and dimensional consistency. |
| Standard | Project Specification / Manufacturer Technical Data *(confirm applicable local/EN standard before procurement)* |
| Size / Thickness | Size 80 × 80 × 180 mm; Thickness — |
| Density | ~1,000–1,400 kg/m³ *(confirm manufacturer value)* |
| Compressive Strength | ~5–10 MPa *(confirm manufacturer/test certificate)* |
| Colour / Finish | Natural Red Clay / Fired Finish |
| Unit | pcs |
| Effective Date | 2026-10-02 |
| Cost Code | MAS-BRK-001 |
| Supplier | TBD / Approved Masonry Supplier *(via price record)* |
| Brand | TBD |
| Status | Active |

## 5. Open points

- The example's Cost Code `MAS-BRK-001` must exist in `budget_codes` to be selectable; confirm it is in the Budget Code list.
- The example code `MAT-MASN-002` assumes the Category code segment is `MASN`; the suggested code follows the category chosen.
- The multi-sheet workbook import (`dwl-material-import-page.tsx`, sheets cross-referenced by code) still takes codes from the sheet; the counter trigger keeps the allocator ahead of them. The Material Master **Import (Excel/CSV)** dialog and the exports use the rules in §7.

## 6. Code rules (auto-generated codes)

Implemented in migrations `20261002000002_dwl_material_code_allocator.sql` and `20261002000003_dwl_material_code_counter_sync.sql`.

1. **Format** `MAT-<GROUP>-NNN`, e.g. `MAT-MASN-002`. The code is an opaque ID: no size, brand or supplier in it.
2. **Group** comes from the Category code (`CAT-MASN` → `MASN`); otherwise the Discipline group, otherwise `GEN`. Category is required when creating, so `GEN` stops growing.
3. **Auto-assigned.** Users never type a code. `dwl_next_material_code()` takes the next number from a per-group counter atomically, so two users saving at once cannot collide. Numbers are never reused.
4. **Immutable.** A code never changes, even if the category is edited later.
5. **Same material = one code.** Identity = category + type + size + thickness + grade + compressive strength + standard + unit, compared after normalising case, spaces and `×`/`x`/`mm` spelling. When all spec fields are blank the name is used instead.
6. **Supplier, brand and price never create a code.** Another supplier or brand of the same spec is a Supplier Material link plus a price under the existing code. A **new code** is only for a different spec: size, thickness, grade/strength, type, standard or unit.
7. **On create**
   - exact match → blocked, shows the existing code ("add a supplier or price to it instead");
   - near match (same category and unit, similar name) → warning; the user must tick "This is a different material";
   - otherwise the code is allocated and the record is saved in one transaction.
8. **Lifecycle.** Obsolete or superseded materials keep their code; a replacement gets a new code.
9. **Existing data** is not renumbered or merged. *Material Master → Duplicates* lists groups sharing a fingerprint (64 on the local data at 2026-10-02, e.g. Tile adhesive 20 kg ×4, PVC conduit 20 mm ×4) for manual consolidation.

| Situation | Result |
|---|---|
| Same brick, supplier A and supplier B | One code; two supplier links and prices |
| Same brick, brand X and brand Y, same size | One code; brand held on each supplier link |
| Brick 80×80×180 vs 60×100×200 | Two codes |
| Concrete C30 vs C35 | Two codes (grade differs) |
| Same item, unit `pcs` vs `box` | Two codes (unit differs) |

## 7. Import and export

Both follow the Register column order, so an exported file can be edited and re-imported:

`Code · Name · Category · Type · Specification · Standard · Grade · Size · Thickness · Density · Compressive Strength · Colour / Finish · Unit · Effective Date · Cost Code · Brand · Manufacturer · Discipline · Application · Effective Cost`

Exports (Excel and CSV) add read-only columns the import ignores: Specific Element, Supplier (from the current price), Effective Rate, Currency, Status, Updated.

Import rules (Material Master → Import):
1. **Code is optional.** Leave it blank for new materials; the database assigns it. A code that does not exist is not reused: it is kept as the legacy code.
2. **Same spec = same material.** A row whose Category + Type + Size + Thickness + Grade + Strength + Standard + Unit already exists (even under a different code or name) is compared with that material and shows as *Has updates* / *Unchanged*. New prices and filled cells are ticked by default; overwrites need a tick. No second code is created.
3. **Category is required** for a new material (the code group comes from it). A row without a matching Category is marked *Invalid*.
4. **A repeat inside the file** (second row with the same spec) is marked *Invalid* ("Same material as row N").
5. **Supplier and brand never create a code.** Effective Cost is recorded as a new price on the matched or new material.
6. Unit `pc`/`pcs`/`piece` now map to `pcs` (previously `pc`, which is not an allowed unit).
