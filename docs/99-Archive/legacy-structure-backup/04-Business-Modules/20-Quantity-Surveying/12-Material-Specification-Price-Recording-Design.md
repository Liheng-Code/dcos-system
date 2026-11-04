# Material Specification & Price Recording — Design Specification

| Document Control | |
|---|---|
| Document Title | Material Specification & Price Recording (DWL Level-1 Extension) |
| Document No. | DCOS-DS-12-012 |
| Status | Draft — for review |
| Date | 2026-09-10 |
| Owner | QS Manager |
| Applies To | DCOS System (Supabase / PostgreSQL, Next.js 16 web) |
| Relationship to other docs | **Extends** `07-SOP_Direct_Works_Cost_Library_Module.md` (QS-SOP-002) Phase 1 (Level 1: Resources, Suppliers, Price History). Does **not** alter the QS-SOP-002 spine or its acceptance tests. Realises the applicable parts of `docs/DCOS Cost & Rate Library — Master Build Prompt.md` (§3–§10, §20, §29–§36, §45–§48). Operating procedure is `13-SOP_Material_Specification_Price_Recording.md` (QS-SOP-004). Row-generation prompt is `14-AI-Prompt_Material_Spec_Row_Generator.md`. |

---

## 1. Purpose & background

### 1.1 What prompted this

Two artifacts exist in `docs/`:

- **`DCOS Cost & Rate Library — Master Build Prompt.md`** — an 80-section brief for a construction "Cost & Rate Library": Material Master, a Material Specification Library with revisions, Supplier Master, Supplier–Material link, an **append-only** Price History with an effective-cost breakdown, Quotation header/items, a Draft → Submitted → Verified → Approved workflow, RBAC, and audit.
- **`DCOS_Cost_Rate_Library_Material_Spec_Price_Template.xlsx`** — a 12-sheet Excel template already populated with **ceiling-systems** demo data (`MAT-CL-001..025` systems, `MAT-CL-FRAME-001..010`, `MAT-CL-ACC-001..010`, 8 specifications, `SUP-001..010`, `SM-001..020`, `PRC-0001..0035`, `QT-2026-001..005`).

The goal is to make "ceiling" the first worked example of a **repeatable material-recording workflow**, and to give that workflow a real home in DCOS so recorded data can be stored, searched, approved, and reused for estimation — not left in a spreadsheet.

### 1.2 Key finding — this is mostly already built

The master prompt's "cost knowledge system" is substantially implemented in DCOS as the **Direct Works Cost Library (DWL)** (QS-SOP-002):

| Master-prompt concept | Already in DCOS |
|---|---|
| Supplier Master | `dwl_suppliers` (thin: 5 business columns) + richer `procurement_suppliers` |
| Material Master | `dwl_resources` where `category = 'material'` (thin: `code, category, description, unit, spec_reference, is_active`) |
| Price History — "never overwrite" | `dwl_resource_prices` — **append-only by DB design**: RLS grants SELECT + INSERT only, no UPDATE/DELETE policy exists, so edits/deletes are rejected outright |
| Current price | view `dwl_v_current_prices` (distinct-on latest `valid_from`) |
| Quotation header / items | `procurement_quotations` / `procurement_quotation_items` (migration `20260531000006`) |
| Multi-currency, original currency preserved | `dwl_resource_prices.currency`; QS multi-currency migrations |
| Rate build-up / assemblies / parametric estimate / snapshots | DWL Phases 2–5 (`dwl_work_items`, `dwl_assemblies`, `dwl_quantity_models`, `dwl_project_snapshots`) |

The template's *stated* target tables — `qs_material`, `qs_material_specification`, `qs_price_history` — **do not exist and will not be created**. This design **extends the DWL Level-1 spine** instead.

### 1.3 Design principle

> The QS-SOP-002 spine — `dwl_resources`, `dwl_suppliers`, `dwl_resource_prices`, `dwl_v_current_prices` — and its signed Phase-1 acceptance tests stay **byte-for-byte unchanged**. Everything new is (a) a companion table, (b) a *nullable* additive column, or (c) a new view. Nothing changes an existing column's type, nullability, or meaning; nothing adds an UPDATE/DELETE policy to an append-only table.

---

## 2. Scope

| In scope | Out of scope |
|---|---|
| Rich material attributes (brand, model, discipline, finish, …) as a companion to `dwl_resources` | Any change to `dwl_resources` / `dwl_suppliers` / `dwl_resource_prices` existing columns |
| Material specifications with append-only revisions | Rate build-up / assemblies / parametric models (QS-SOP-002 Phases 2–5, already built) |
| Supplier profile enrichment + supplier↔material link | Preliminaries library (`prelim_library_*`) |
| Price effective-cost breakdown (`= Basic − Discount + Delivery + Handling + Other + Tax`) as nullable columns + a generated stored column | Feeding effective cost into recipe rate views — **gated Phase I**, separate sign-off |
| Draft → Submitted → Verified → Approved price workflow via a staging table | Full Price Trend / Rate Confidence / Forecast analytics (master-prompt §11–13, §25 — deferred Phase J) |
| Lightweight quotation records (`dwl_quotations` / `_items`) + optional bridge to `procurement_quotations` | Replacing `procurement_quotations` |
| Ceiling seed (45 materials, 8 specs, 10 suppliers, 20 links, 35 prices, 5 quotations) | Document storage UI (stub only — deferred Phase J) |
| Controlled Excel import (validate → preview → confirm → audit) | Editable lookup-vocabulary admin UI (v1 = CHECK enums + TS consts) |

---

## 3. Locked decisions & documented assumptions

Per master-prompt §82 ("choose a sensible implementation and document the assumption"):

| # | Decision | Rationale / alternative |
|---|---|---|
| D1 | **Coding standard** — re-map template `MAT-CL-*` to the locked DWL standard `{M/L/E/S}-{GROUP3}-{NNN}` (QS-SOP-002 §6 D2): `M-CLG-NNN` (ceiling systems), `M-CLF-NNN` (frame/suspension), `M-CLA-NNN` (access panels/accessories). Template code is preserved in `dwl_material_attributes.legacy_code`. `MAT-CL-*` never enters `dwl_resources.code`. | `dwl_resources.code` is `UNIQUE`; QS-SOP-002 §16 forbids changing the coding standard without a new SOP version. GROUP3 is exactly 3 chars and cannot hold `FRAME`/`ACC`. **Alternative** — formally amend SOP D2 to allow a `MAT-` prefix — touches the whole locked standard and every existing `M-/L-/E-/S-` code; rejected. **Open**: QS Manager to confirm before the seed (Phase H). |
| D2 | **Rich attributes in 1:1 companion tables**, not by widening the spine. | Keeps the spine, its acceptance tests, and every existing explicit-column `SELECT` / `INSERT` in the UI frozen; fully reversible (drop table). Same "companion per phase" idiom DWL already uses. Cost: one extra join on material/supplier reads — wrapped in a view. **Alternative** — nullable columns on `dwl_resources` / `dwl_suppliers` — is lower join-cost but forces `dwl-types.ts`, every form, and every explicit select to be updated and re-tested. |
| D3 | **Effective cost does not flow into recipe rate views in this work.** `dwl_v_work_item_rates` / `dwl_v_work_item_explosion` keep multiplying by `unit_price`. Switching them to `coalesce(effective_unit_cost, unit_price)` is **Phase I**, with its own QS Manager sign-off and a re-run of the QS-SOP-002 Phase-2 cascade test. | That switch moves every work-item, assembly, model, and snapshot-benchmark number at once. Until Phase I, effective cost is informational on the price / comparison / detail screens only. |
| D4 | **Price workflow via a staging table** (`dwl_price_submissions`), not a status column on `dwl_resource_prices`. On Approve, a `SECURITY DEFINER` RPC inserts the immutable price row. | A status column would require an UPDATE policy on `dwl_resource_prices`, destroying the DB-level append-only guarantee. The staging table keeps that guarantee, keeps `dwl_v_current_prices` showing only real (approved) prices, and gives the workflow engine + audit skill a clean surface. The existing quick-entry path (`market_survey` / `purchase` / `estimate`) may still INSERT directly. |
| D5 | **Do not FK `dwl_resource_prices` to `procurement_quotations`.** Use nullable free-text `quotation_ref` now; add tenant-scoped `dwl_quotations` / `_items` in Phase F; an optional nullable `procurement_quotation_id` + auto-feed trigger is a bridge, never a hard dependency. | `procurement_quotations` has **no `tenant_id`**, ships permissive `USING(true)` RLS, and requires `rfq_id` + `total_amount` — none of which fits tenant-scoped market quotes that are often not RFQ- or project-specific (master-prompt §18). |
| D6 | **Controlled vocabularies (Excel sheet 10)** ship as CHECK constraints + TS `const` arrays in `dwl-types.ts` for v1. | Matches repo convention (`DWL_UNITS`, `DWL_CATEGORIES`). An editable `dwl_lookup_values` table (master-prompt §22/§31) is deferred. |
| D7 | **Units normalised at entry** to the locked dictionary (QS-SOP-002 §6 D3): `m²→m2`, `nr/No.→no`, `length→m`, etc. One resource = one unit, forever. | The Excel uses display units (`m²`); the DB uses the locked list. Conversion happens in the importer and is a data-entry rule in QS-SOP-004. |
| D8 | **New docs** live in `docs/04-Business-Modules/12-Quantity-Surveying/` numbered after `11-QTO-*`. New SOP number is **QS-SOP-004** (`07`=QS-SOP-002, `08`=QS-SOP-003). | Consistency with the QS module doc set. |

---

## 4. Data model

### 4.1 Overview

```
dwl_resources (spine, category='material')  1───1  dwl_material_attributes        [companion]
      │                                      1───n  dwl_material_specs             [new]
      │                                                   1───n  dwl_material_spec_revisions   [new, APPEND-ONLY]
      │
      │  n───n  via  dwl_supplier_materials  [junction]  n───n  dwl_suppliers (spine)
      │                                                              1───1  dwl_supplier_profiles  [companion]
      │
      └─ 1───n  dwl_resource_prices (spine, APPEND-ONLY)  + nullable breakdown columns
                      ▲  approved rows only, inserted by RPC
                      │
                dwl_price_submissions  [new, mutable workflow]  ── optional ──▶ dwl_price_status_events [new, APPEND-ONLY]

dwl_quotations / dwl_quotation_items  [new, Phase F]  ── nullable FK ──▶ dwl_resource_prices.dwl_quotation_id
```

### 4.2 New tables & columns

All new tables carry `id uuid pk default gen_random_uuid()` (except the two 1:1 companions, whose PK **is** the FK), `tenant_id uuid not null`, `created_by uuid references public.profiles(id)`, `created_at timestamptz not null default now()`, and (where mutable) `updated_at` + a `set_updated_at` trigger. `tenant_id` is resolved app-side from `profiles.company_id`, **never** from user input.

#### `dwl_material_attributes` — 1:1 companion to `dwl_resources` (Phase C-A)

| Column | Type | Notes |
|---|---|---|
| `resource_id` | uuid **PK**, FK → `dwl_resources(id)` ON DELETE CASCADE | one row per material |
| `tenant_id` | uuid not null | |
| `material_name` | text | display name (spine `description` carries the price-driving spec) |
| `subcategory` | text | Excel `Subcategory` (e.g. "Suspended Ceiling") |
| `discipline` | text | Excel `Discipline` (e.g. "Architectural") |
| `material_type` | text | Excel `Material Type` (e.g. "Ceiling System") |
| `tech_spec_summary` | text | Excel `Technical Specification (Summary)` |
| `standard` | text | Excel `Standard` (e.g. "EN 520 / Local") |
| `grade` | text | |
| `brand` | text | |
| `model` | text | |
| `manufacturer` | text | |
| `package_size` | text | e.g. "Sheet", "Bag" |
| `dimension` | text | e.g. "12.5mm thk", "1200×600" |
| `thickness` | text | |
| `weight` | text | |
| `color_finish` | text | Excel `Color / Finish` |
| `application_element` | text | Excel `Application / Related Element`; cross-walk to `qs_element_library` / Excel sheet `08` |
| `lifecycle_status` | text CHECK in (`draft`,`active`,`superseded`,`archived`,`obsolete`) default `active` | finer than the spine's boolean `is_active` |
| `tags` | text[] default `'{}'` | Excel `Tags` (`;`-split) |
| `legacy_code` | text | **holds the template `MAT-CL-*` code** for spreadsheet cross-reference |
| `notes` | text | spine has no notes column |
| `updated_by` | uuid FK → profiles | Excel `Modified By` |

View **`dwl_v_materials`** (`security_invoker = true`): `dwl_resources` ⋈ `dwl_material_attributes` ⋈ `dwl_v_current_prices` ⋈ `dwl_v_current_material_spec`, filtered to `category = 'material'` — powers the Materials list screen.

#### `dwl_material_specs` + `dwl_material_spec_revisions` (Phase C-B)

`dwl_material_specs` (identity — mutable):

| Column | Type | Notes |
|---|---|---|
| `spec_code` | text not null; `unique (tenant_id, spec_code)` | Excel `Specification ID` (e.g. `SPEC-CL-001`) |
| `resource_id` | uuid not null, FK → `dwl_resources(id)` ON DELETE CASCADE | a material may have many specs |
| `spec_name` | text not null | Excel `Specification Name` |
| `discipline` | text | |

`dwl_material_spec_revisions` (**append-only** — SELECT + INSERT policies only, no UPDATE/DELETE):

| Column | Type | Notes |
|---|---|---|
| `spec_id` | uuid not null, FK → `dwl_material_specs(id)` ON DELETE CASCADE | |
| `revision_no` | text not null; `unique (spec_id, revision_no)` | Excel `Revision` (`R01`, `R02`, …) |
| `standard`, `grade`, `strength_performance`, `dimension`, `thickness`, `density`, `unit`, `manufacturer`, `brand` | text | Excel spec columns |
| `technical_req`, `installation_req`, `testing_req`, `approval_req` | text | Excel `* Requirements` |
| `effective_date` | date not null | |
| `expiry_date` | date | null = open-ended |
| `status` | text CHECK in (`draft`,`active`,`superseded`,`expired`) default `active` | |
| `source_document` | text | |

View **`dwl_v_current_material_spec`** (`security_invoker = true`): `distinct on (resource_id)` the latest `effective_date` revision that is not expired, joined back through `dwl_material_specs`. Mirrors the `dwl_v_current_prices` idiom exactly.

#### `dwl_supplier_profiles` — 1:1 companion to `dwl_suppliers` (Phase C-C)

| Column | Type | Notes |
|---|---|---|
| `supplier_id` | uuid **PK**, FK → `dwl_suppliers(id)` ON DELETE CASCADE | |
| `tenant_id` | uuid not null | |
| `supplier_code` | text | Excel `Supplier Code` (e.g. `SUP-001`). **Not** uniquely constrained on the spine — see §8 open question 5 |
| `trading_name`, `supplier_type` | text | `supplier_type` values per Excel sheet 10 |
| `contact_person`, `position`, `phone`, `email` | text | |
| `address`, `country`, `province_city`, `website` | text | |
| `product_categories` | text[] default `'{}'` | |
| `payment_terms`, `delivery_terms`, `credit_terms` | text | |
| `lead_time_days` | int | |
| `moq` | numeric(14,4) | |
| `reliability_rating`, `quality_rating`, `price_competitiveness` | text | Excel rating columns (kept as text — free scale) |
| `lifecycle_status` | text default `active` | |
| `notes` | text | |

The spine `dwl_suppliers.rating` (CHECK `A`/`B`/`C`) is set by mapping the Excel 1–5 `Supplier Rating` (`≥4.5→A`, `≥3.5→B`, else `C`).

#### `dwl_supplier_materials` — junction (Phase C-C)

| Column | Type | Notes |
|---|---|---|
| `supplier_id` | uuid not null, FK → `dwl_suppliers(id)` ON DELETE CASCADE | |
| `resource_id` | uuid not null, FK → `dwl_resources(id)` ON DELETE CASCADE | |
| — | `unique (supplier_id, resource_id)` | Excel sheet 04 |
| `supplier_product_code`, `supplier_product_name` | text | |
| `brand`, `manufacturer`, `specification`, `standard`, `package_size` | text | supplier-specific overrides |
| `moq` | numeric(14,4) | |
| `lead_time_days` | int | |
| `is_active` | boolean not null default true | |
| `notes` | text | |

Normal tenant-scoped CRUD (select / insert / update / delete), like `dwl_work_item_resources`.

#### `dwl_resource_prices` — nullable additive columns (Phase C-D)

`ALTER TABLE ... ADD COLUMN` does not touch RLS, so the append-only guarantee is unaffected. All columns nullable; money columns `numeric(14,4) DEFAULT 0`.

| Column | Type | Notes |
|---|---|---|
| `quantity` | numeric(14,4) | Excel `Quantity` |
| `discount` | numeric(14,4) default 0 | |
| `delivery_cost` | numeric(14,4) default 0 | |
| `handling_cost` | numeric(14,4) default 0 | |
| `other_charges` | numeric(14,4) default 0 | |
| `tax_amount` | numeric(14,4) default 0 | |
| `effective_unit_cost` | numeric(14,4) **GENERATED ALWAYS AS** (`unit_price - coalesce(discount,0) + coalesce(delivery_cost,0) + coalesce(handling_cost,0) + coalesce(other_charges,0) + coalesce(tax_amount,0)`) **STORED** | cannot drift; no trigger |
| `payment_terms`, `delivery_terms` | text | |
| `lead_time_days` | int | |
| `source_document` | text | Excel `Source Document` |
| `quotation_ref` | text | Excel `Quotation No.` (free text; structured FK is `dwl_quotation_id`, Phase F) |
| `quotation_date` | date | Excel `Date` |
| `project_code` | text | Excel `Project Code` (nullable — market quotes need no project) |
| `price_status` | text CHECK in (`draft`,`submitted`,`verified`,`approved`,`active`,`expired`,`superseded`,`archived`,`rejected`) default `approved` | direct quick-entry rows default `approved` for backward compatibility |
| `approved_by` | uuid FK → profiles | |
| `approved_at` | timestamptz | |
| `submission_id` | uuid | back-ref to `dwl_price_submissions` (nullable — quick-entry rows have none) |
| `dwl_quotation_id` | uuid FK → `dwl_quotations(id)` ON DELETE SET NULL | Phase F |

**Backfill:** the same migration sets the five money columns to `0` on all existing rows, so legacy rows get `effective_unit_cost == unit_price`. `unit_price` **keeps its meaning** = basic / quoted price.

**View change:** `dwl_v_current_prices` gains `effective_unit_cost` + the breakdown as **new trailing SELECT columns**. Existing consumers use explicit column lists (`dwl-resources-list-page.tsx`, the recipe views) and are unaffected. The recipe views are **not** re-pointed here (D3).

#### `dwl_price_submissions` — mutable workflow surface (Phase C-E)

| Column | Type | Notes |
|---|---|---|
| `resource_id` | uuid not null, FK → `dwl_resources(id)` | |
| `supplier_id` | uuid FK → `dwl_suppliers(id)` | |
| *(all breakdown + audit fields — same names as the price columns above)* | | `unit_price`, `discount`, `delivery_cost`, `handling_cost`, `other_charges`, `tax_amount`, `quantity`, `currency`, `valid_from`, `quote_valid_until`, `source_type`, `location`, `payment_terms`, `delivery_terms`, `lead_time_days`, `source_document`, `quotation_ref`, `quotation_date`, `project_code`, `notes` |
| `status` | text CHECK in (`draft`,`submitted`,`verified`,`approved`,`rejected`) default `draft` | |
| `submitted_by`/`_at`, `verified_by`/`_at`, `approved_by`/`_at` | uuid / timestamptz | |
| `rejected_reason` | text | |
| `resulting_price_id` | uuid FK → `dwl_resource_prices(id)` | set by the approval RPC |

RPC **`dwl_approve_price_submission(p_submission_id uuid)`** — `SECURITY DEFINER`:
1. Check the caller's role (QS Manager / Commercial Manager) via the JWT role claim; raise if not permitted.
2. Verify `status = 'verified'`.
3. INSERT one `dwl_resource_prices` row carrying the breakdown + `submission_id` + `price_status = 'approved'` + `approved_by`/`approved_at`.
4. UPDATE the submission: `status = 'approved'`, `resulting_price_id = <new id>`.
5. Insert a `dwl_price_status_events` row.

Optional **`dwl_price_status_events`** (append-only): `submission_id`, `from_status`, `to_status`, `actor`, `at`, `note`.

#### `dwl_quotations` / `dwl_quotation_items` (Phase C-F)

Tenant-scoped, mirror Excel sheets 06 / 07. `dwl_quotations`: `quote_no` (unique per tenant), `supplier_id` FK, `project_code`, `rfq_ref`, `quote_date`, `valid_until`, `currency`, `payment_terms`, `delivery_terms`, `contact_person`, `source_document`, `status`, `notes`, optional `procurement_quotation_id` FK (bridge only). `dwl_quotation_items`: `quotation_id` FK, `line_no`, `resource_id` FK, `supplier_product_code`, `description`, `spec_ref`, `quantity`, `unit`, `unit_price`, `discount`, `delivery`, `tax`, `effective_price` (generated), `lead_time_days`, `remarks`.

### 4.3 RLS — every new table

Use the **current working** tenant-isolation pattern from `20260720000017_fix_dwl_tenant_isolation.sql`. The original `20260720000003` policies used `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`, but that claim is `NULL` for every real user in this deployment (schema drift — `custom_access_token_hook` never actually landed); `20260720000017` replaced every `dwl_*` policy with the `profiles` subquery below. New tables must use the same:

```sql
alter table public.<t> enable row level security;

create policy <t>_tenant_select on public.<t>
  for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));

create policy <t>_tenant_insert on public.<t>
  for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));

-- mutable tables only:
create policy <t>_tenant_update on public.<t>
  for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
      with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
```

`tenant_id` is still resolved app-side from `profiles.company_id` for INSERTs; `auth.uid()` never comes from user input.

- **No UPDATE / DELETE policy** on `dwl_material_spec_revisions` and `dwl_price_status_events` — append-only, DB-enforced.
- `dwl_supplier_materials` also gets a tenant-scoped DELETE policy (links can be removed; prefer `is_active = false`).
- All new views created `with (security_invoker = true)` from the start.
- Verify / Approve authority is enforced **inside the RPC** (role claim check), not by RLS alone. `useQsPermissions()` in the UI is the UX gate only (master-prompt §75: "frontend hiding alone is not security").

---

## 5. Excel → database mapping

Legend: **[new]** = column added by this design · **(resolve)** = look up the FK by the template's business code · **[Fx]** = Phase F.

### Sheet `01_Material_Master` → `dwl_resources` + `dwl_material_attributes` [new table]

| Excel column | Target |
|---|---|
| Material Code | `dwl_resources.code` — **remap** to `M-CLG/CLF/CLA-NNN` (D1); template value → `dwl_material_attributes.legacy_code` **[new]** |
| Material Name | `dwl_material_attributes.material_name` **[new]** (+ front of `dwl_resources.description`) |
| Category | `dwl_resources.category` — map to `material`/`labor`/`equipment`/`subcon` (ceiling = `material`) |
| Subcategory · Discipline · Material Type | `dwl_material_attributes.{subcategory, discipline, material_type}` **[new]** |
| Description | `dwl_resources.description` — must contain the price-driving spec (QS-SOP-002 §7 Step 1.4.5) |
| Technical Specification (Summary) | `dwl_material_attributes.tech_spec_summary` **[new]** |
| Standard · Grade | `dwl_material_attributes.{standard, grade}` **[new]**; a single ref may also populate `dwl_resources.spec_reference` |
| Brand · Model · Manufacturer | `dwl_material_attributes.{brand, model, manufacturer}` **[new]** |
| Unit | `dwl_resources.unit` — **normalise** to the locked dictionary (D7) |
| Package Size · Dimension / Size · Weight · Color / Finish | `dwl_material_attributes.{package_size, dimension, weight, color_finish}` **[new]** |
| Application / Related Element | `dwl_material_attributes.application_element` **[new]** |
| Status | `dwl_resources.is_active` (`Active`→true) + `dwl_material_attributes.lifecycle_status` **[new]** |
| Tags | `dwl_material_attributes.tags text[]` **[new]** |
| Notes | `dwl_material_attributes.notes` **[new]** |
| Created By / Created Date | `dwl_resources.created_by` / `created_at` |
| Modified By / Modified Date | `dwl_material_attributes.updated_by` **[new]** / `dwl_resources.updated_at` |

### Sheet `02_Material_Specification` → `dwl_material_specs` + `dwl_material_spec_revisions` [new]

| Excel column | Target |
|---|---|
| Specification ID | `dwl_material_specs.spec_code` |
| Material Code | `dwl_material_specs.resource_id` (resolve) |
| Specification Name | `dwl_material_specs.spec_name` |
| Standard · Grade · Strength / Performance · Dimension · Thickness · Density · Unit · Manufacturer · Brand | `dwl_material_spec_revisions.*` **[all new]** |
| Technical / Installation / Testing / Approval Requirements | `dwl_material_spec_revisions.{technical_req, installation_req, testing_req, approval_req}` **[new]** |
| Revision | `dwl_material_spec_revisions.revision_no` |
| Effective Date · Expiry Date · Status | `dwl_material_spec_revisions.{effective_date, expiry_date, status}` |
| Notes | `dwl_material_spec_revisions` — append to `source_document` or drop |

### Sheet `03_Supplier_Master` → `dwl_suppliers` + `dwl_supplier_profiles` [new]

| Excel column | Target |
|---|---|
| Supplier Code | `dwl_supplier_profiles.supplier_code` **[new]** |
| Company Name | `dwl_suppliers.name` |
| Trading Name · Supplier Type | `dwl_supplier_profiles.{trading_name, supplier_type}` **[new]** |
| Contact Person · Position · Phone · Email · Address · Country · Province/City · Website | `dwl_supplier_profiles.*` **[new]** (free-text `dwl_suppliers.contact` also kept) |
| Product Categories | `dwl_supplier_profiles.product_categories text[]` **[new]** |
| Payment Terms · Delivery Terms · Lead Time · Min Order Qty · Credit Terms | `dwl_supplier_profiles.*` **[new]** |
| Supplier Rating (1–5) | mapped → `dwl_suppliers.rating` (`A`/`B`/`C`) |
| Reliability · Quality · Price Competitiveness | `dwl_supplier_profiles.*` **[new]** |
| Status | `dwl_suppliers.is_active` + `dwl_supplier_profiles.lifecycle_status` **[new]** |
| Notes | `dwl_supplier_profiles.notes` **[new]** |

### Sheet `04_Supplier_Material` → `dwl_supplier_materials` [new table — whole sheet]

| Excel column | Target |
|---|---|
| Supplier Material ID | external ref / drop (surrogate `id`) |
| Supplier Code / Material Code | `supplier_id` / `resource_id` (resolve) |
| Supplier Product Code / Name | `supplier_product_code` / `supplier_product_name` |
| Brand · Manufacturer · Specification Ref · Package Size | corresponding columns |
| Min Order Qty · Lead Time (days) · Active / Inactive · Notes | `moq` / `lead_time_days` / `is_active` / `notes` |

### Sheet `05_Price_History` → `dwl_resource_prices` (extended) [+ `dwl_price_submissions` for non-approved rows]

| Excel column | Target |
|---|---|
| Price ID | `notes` prefix / external ref |
| Material Code / Supplier Code | `resource_id` / `supplier_id` (resolve) |
| Project Code | `project_code` **[new]** |
| Quotation ID / Quotation No. | `quotation_ref` **[new]** (+ `dwl_quotation_id` **[Fx]**) |
| Date | `quotation_date` **[new]** |
| Effective Date | `valid_from` *(existing)* |
| Expiry Date | `quote_valid_until` *(existing)* |
| Quantity | `quantity` **[new]** |
| Unit | validate against `dwl_resources.unit` (normalise, D7) |
| Currency | `currency` *(existing)* |
| Basic Unit Price | `unit_price` *(existing — stays "basic")* |
| Discount · Delivery Cost · Handling Cost · Tax · Other Charges | `discount` · `delivery_cost` · `handling_cost` · `tax_amount` · `other_charges` **[all new]** |
| Effective Unit Cost | `effective_unit_cost` **[new — generated STORED]** |
| Payment Terms · Delivery Terms | `payment_terms` · `delivery_terms` **[new]** |
| Location | `location` *(existing)* |
| Lead Time (days) | `lead_time_days` **[new]** |
| Price Status | `price_status` **[new enum]** |
| Source Document | `source_document` **[new]** |
| Verification Status / Approval Status | `dwl_price_submissions.status` (workflow); for pre-approved import rows, set `price_status` directly |
| Created By / Created Date | `created_by` / `created_at` *(existing)* |
| Approved By / Approved Date | `approved_by` / `approved_at` **[new]** |
| Notes | `notes` *(existing)* — must carry a **Basis** string (QS-SOP-002 §7 Step 1.4.5) |

### Sheets `06_Quotation_Header` / `07_Quotation_Items` → `dwl_quotations` / `dwl_quotation_items` [new, Phase F]

Direct column-to-column (see §4.2). `Effective Price` on items = generated column.

### Reference-only sheets (no table)

| Sheet | Use |
|---|---|
| `08_Ceiling_Systems_Ref` | drives `dwl_material_attributes.application_element` + the seed cross-walk; optional link to `qs_element_library` |
| `09_Units_Currencies` | reconcile against `DWL_UNITS` (`dwl-types.ts`) + QS-SOP-002 §6 D3 — units are a locked list, not data |
| `10_Lookup_Lists` | → CHECK enums + TS `const` arrays (D6) |
| `00_Instructions` / `99_Notes_Assumptions` | doc content only |
| `11_DB_Mapping` *(to be added to the workbook)* | machine-readable copy of this section for the importer |
| `Document_Register` *(to be added)* | future `dwl_documents` (Phase J) |

---

## 6. UI design

**A new area — not a change to the existing `/dashboard/qs/dwl-resources` screen** (its flat all-categories column contract is load-bearing for the QS-SOP-002 acceptance tests and Phases 2–7).

| Route | Component | Content |
|---|---|---|
| `app/dashboard/qs/dwl-materials/page.tsx` | `dwl-materials-list-page.tsx` (new) | `dwl_v_materials` — columns per master-prompt §45: Code, Material, Category, Specification, Brand, Unit, Latest (Basic) Price, Effective Cost, Supplier, Last Updated, Status, Actions. Client-side search / sort / filter / pagination in the style of `dwl-resources-list-page.tsx`. |
| `app/dashboard/qs/dwl-materials/[id]/page.tsx` | `dwl-material-detail-page.tsx` (new) | Tabs (master-prompt §46): **Overview** (`dwl_v_materials` row + current-price / effective-cost KPI) · **Specification** (`dwl_material_specs` + revision timeline from `dwl_v_current_material_spec`; "New revision" append dialog) · **Suppliers** (`dwl_supplier_materials`; add / deactivate link) · **Price History** (full append-only `dwl_resource_prices`, basic vs effective, breakdown expander, `price_status` badges; "Record price" and "Submit price for approval") · **Documents** (stub) · **Audit** (via `dcos-audit-notification-skill`, filtered to this material + its price ids). |
| `app/dashboard/qs/dwl-price-approvals/page.tsx` | `dwl-price-approvals-page.tsx` (new) | Cross-material `dwl_price_submissions` queue for verifiers / approvers; inline Draft→Submitted→Verified→Approved / Reject transitions. State machine via `dcos-workflow-engine`; logging + "price awaiting approval" / "quotation expiring" notifications via `dcos-audit-notification-skill` (master-prompt §52). |

New dialogs: `dwl-material-spec-form-dialog.tsx`, `dwl-material-spec-revision-form-dialog.tsx`, `dwl-supplier-material-form-dialog.tsx`. Extend `dwl-price-form-dialog.tsx` (or add `dwl-material-price-form-dialog.tsx`) with breakdown inputs + a live client-side "Effective Unit Cost" read-out (server re-derives via the generated column) — still INSERT-only.

Cross-link: an additive "Open material detail" row action on `dwl-resources-list-page.tsx` when `category === 'material'` (no column change).

Nav: add `{ label: "Materials & Specifications", href: "/dashboard/qs/dwl-materials" }` and `{ label: "Price Approvals", href: "/dashboard/qs/dwl-price-approvals" }` to the "Libraries" group in `apps/web/lib/qs-nav.ts`.

Types: append `DwlMaterialAttributes`, `DwlMaterialSpec`, `DwlMaterialSpecRevision`, `DwlSupplierProfile`, `DwlSupplierMaterial`, `DwlPriceSubmission` to `apps/web/components/qs/dwl-types.ts`; extend `DwlResourcePriceHistory` / `DwlCurrentPrice` with the breakdown + `effective_unit_cost`. Mirror the sheet-10 vocabularies as `const` arrays next to `DWL_UNITS`.

---

## 7. Workflow — Draft → Submitted → Verified → Approved

```
QS / Procurement staff
      │  create dwl_price_submissions (status = draft)  ── or ── quick-entry INSERT dwl_resource_prices (price_status = approved)
      ▼
   Submit  (status = submitted, submitted_by/at)
      ▼
  Reviewer  ── Verify  (status = verified, verified_by/at)   ── or ── Reject (status = rejected, rejected_reason)  → no price row
      ▼
 QS / Commercial Manager  ── Approve  → RPC dwl_approve_price_submission()
      ▼
  INSERT immutable dwl_resource_prices (price_status = approved, submission_id, approved_by/at)
      ▼
  dwl_v_current_prices  →  Quick Costing / rate build-up / estimation
```

Only `approved` / `active` prices should reach official estimation (master-prompt §33). Direct quick-entry (`market_survey` / `purchase` / `estimate`) stays available for speed and backward compatibility, defaulting `price_status = 'approved'`.

---

## 8. Phased build order

Each phase is independently useful and ends with a manual acceptance test + QS Manager sign-off (no test runner in the repo). Migrations start at `20260910000001`; the repo already contains duplicate-dated files, so verify apply order.

| Phase | Migration(s) | UI / code | Acceptance test |
|---|---|---|---|
| **A1** | — | this document | schema, mapping, D1 coding decision locked |
| **B** | — | finalise the Excel workbook (dropdowns, `11_DB_Mapping`, `Document_Register`, hygiene) | every dropdown rejects an off-list value; mapping covers every column of sheets `01`–`07` |
| **A3 / A2** | — | `14-*.md` prompt, `13-*.md` SOP (QS-SOP-004) | prompt generates valid rows for a ceiling material and for a second element ("Painting") that paste cleanly into the workbook |
| **C-A** | `..0001_dwl_material_attributes.sql` (+ `dwl_v_materials`) | extend `dwl-types.ts` | existing `dwl-resources` screen loads unchanged; `dwl_v_current_prices` / `dwl_v_work_item_rates` byte-identical; cross-tenant SELECT blocked |
| **C-B** | `..0002_dwl_material_specs.sql` | Specification tab | 2 revisions with different `effective_date` → `dwl_v_current_material_spec` returns only the latest non-expired; `UPDATE`/`DELETE` on a revision rejected |
| **C-C** | `..0003_dwl_supplier_profiles_and_materials.sql` | Suppliers tab; profile fields on the supplier form | link supplier↔material; duplicate link rejected by `UNIQUE`; existing price-form supplier picker still works |
| **C-D** | `..0004_dwl_resource_prices_effective_cost.sql` | breakdown inputs + live read-out; basic vs effective in Price History | DB-computed `effective_unit_cost` = formula; legacy rows `effective == basic`; `dwl_v_current_prices` still one row per resource; **`dwl_v_work_item_rates` unchanged**; `UPDATE`/`DELETE` on a price row still rejected |
| **C-E** | `..0005_dwl_price_submissions.sql` (+ approval RPC, `dwl_price_status_events`) | `/dashboard/qs/dwl-price-approvals` + inline transitions; audit + notifications | Draft→Submitted→Verified→Approved; on Approve exactly one immutable price row created + visible in `dwl_v_current_prices`; non-approver blocked **at the RPC**; rejected submission writes no price |
| **C-F** | `..0006_dwl_quotations.sql` (+ nullable `dwl_quotation_id`) | quotation header/items entry; supplier comparison view | quotation with 3 items → 3 submissions → approve → 3 prices trace back to the quotation; comparison highlights lowest effective cost |
| **C-G** | — | `/dashboard/qs/dwl-materials` + `[id]` with all tabs; cross-link from `dwl-resources` | master-prompt §76 scenario end-to-end for a ceiling material; RBAC enforced; empty / loading states; existing screen untouched |
| **C-H** | `..0010/11/12_dwl_seed_ceiling_*.sql` | — | 45 materials each with ≥1 approved price + Basis note; 8 current specs; 20 supplier-materials; 5 quotations; `effective_unit_cost` populated on all 35 price rows; codes are `M-CLG/CLF/CLA-NNN`, template codes in `legacy_code`; `PRC-0007` / `PRC-0025` not approved |
| **C-I** *(gated)* | `20260910000020_dwl_recipe_views_effective_cost.sql` — swaps `cp.unit_price` → `coalesce(cp.effective_unit_cost, cp.unit_price)` in `dwl_v_work_item_rates` + `dwl_v_work_item_explosion` (assembly / model / estimate views cascade automatically). Rollback = re-apply the pre-C-I bodies from `20260720000006` + `20260722000004`. | — | **separate QS Manager sign-off** (pre-apply checklist is in the migration header); re-run the QS-SOP-002 §8 Step 2.5 cascade test; snapshot the top-20 work-item rates before/after and record the movement |
| **C-J** *(deferred)* | future | Documents, Price Trend, Rate Confidence, Forecast (master-prompt phases 4–7) | out of scope here |

The importer (`app/api/qs/material-import/route.ts` or `apps/web/scripts/`, following master-prompt §29: Upload → Validate → Preview → Errors → Confirm → Create → Audit) is built **after C-G**, so it targets the finalised schema and reuses `11_DB_Mapping`.

### 8.1 Ceiling seed (Phase C-H) — 3 migrations

Style: `do $$ ... $$` block, resolve tenant via `companies.code = 'MCC'` (raise if null), `on conflict (code) do nothing` for resources, `where not exists (...)` guards for child rows, fully idempotent (per `20260720000004_dwl_seed_starter_catalogue.sql`).

1. `20260910000010_dwl_seed_ceiling_materials.sql` — 45 `dwl_resources` (`M-CLG-001..025`, `M-CLF-001..010`, `M-CLA-001..010`, `category = 'material'`) + 45 `dwl_material_attributes` (template `MAT-CL-*` in `legacy_code`).
2. `20260910000011_dwl_seed_ceiling_specs_suppliers.sql` — 8 `dwl_material_specs` + revisions; 10 `dwl_suppliers` + `dwl_supplier_profiles`; 20 `dwl_supplier_materials`.
3. `20260910000012_dwl_seed_ceiling_quotations_prices.sql` — 5 `dwl_quotations` + items; 35 `dwl_resource_prices` (breakdown populated; every `notes` carries a Basis; `PRC-0007` / `PRC-0025` left non-approved as `dwl_price_submissions` in `verified`).

Seed data is clearly-fictional demo data and must be labelled as such in every migration header (master-prompt §57).

---

## 9. Risks & open questions

1. **D1 coding conflict** — `MAT-CL-*` vs the locked `{M/L/E/S}-{GROUP3}-{NNN}`. Recommendation: remap to `M-CLG/CLF/CLA-NNN` + `legacy_code`. **QS Manager to confirm before Phase C-H.**
2. **Effective cost into recipes (D3 / Phase C-I)** moves every downstream number — must stay a separately gated migration with its own sign-off.
3. **Append-only vs workflow (D4)** — resolved with `dwl_price_submissions` + immutable approved insert. A status column on `dwl_resource_prices` instead would need an UPDATE policy and weaken the DB-level append-only guarantee — explicit decision required if that is preferred.
4. **`procurement_quotations` (D5)** — no `tenant_id`, permissive RLS, mandatory `rfq_id` — unsafe to FK directly. Bridge only.
5. **Supplier code** has no spine-unique home. `dwl_supplier_profiles.supplier_code` is not uniquely constrained. If it must be a hard key, add `code text unique` to `dwl_suppliers` — a spine change requiring its own decision.
6. **DB-level role gating for Verify / Approve** — the DWL RLS pattern is tenant-scoped only. Plan uses a `SECURITY DEFINER` RPC role check; confirm this vs a JWT role claim inside an UPDATE policy on `dwl_price_submissions`.
7. **`dwl_v_current_prices` picks the latest by `valid_from` regardless of status** — once the workflow lands it should also filter to `approved`/`active`; that changes a view Phase 2 depends on — gate and regression-test.
8. **Generated STORED column** needs non-null breakdown inputs — backfill legacy rows with `0` in the same migration; confirm `numeric(14,4)` covers summed values.
9. **Migration timestamp collisions** — repo already has duplicate-dated files; use a deliberate `20260910000001+` sequence and verify apply order.
10. **No test runner** — all acceptance checks are manual SQL + UI walkthroughs; budget reviewer time per phase.
11. **Scope** — Phase C is materially larger than A + B. A1 + A2 + A3 + B alone satisfy the "recording prompt + format log" requirement; C proceeds after A1 sign-off.

---

## 10. References

- `07-SOP_Direct_Works_Cost_Library_Module.md` (QS-SOP-002) — the spine this extends; coding standard §6 D2, unit dictionary §6 D3, append-only rule §7 Step 1.4.1.
- `08-SOP_Direct_Works_Library_Tender_BOQ_Integration.md` (QS-SOP-003).
- `13-SOP_Material_Specification_Price_Recording.md` (QS-SOP-004) — operating procedure (to be written).
- `14-AI-Prompt_Material_Spec_Row_Generator.md` — row-generation prompt (to be written).
- `docs/DCOS Cost & Rate Library — Master Build Prompt.md` — requirements source.
- `docs/DCOS_Cost_Rate_Library_Material_Spec_Price_Template.xlsx` — the Excel format log.
- `supabase/migrations/20260720000003_dwl_phase1_resources.sql` — spine + RLS idiom.
- `supabase/migrations/20260720000006_dwl_phase2_work_items.sql` — recipe views that must not regress.
- `supabase/migrations/20260720000004_dwl_seed_starter_catalogue.sql` — seed-migration style.
- `apps/web/components/qs/dwl-types.ts` — type definitions to extend.

*End of DCOS-DS-12-012 Draft.*
