# QS Element Library — Design Specification
**Document Code:** DCOS-DS-12-010 | **Version:** R0 | **Date:** July 2026
**Module:** Quantity Surveying (12-10 QS Element Library) | **Domain:** Commercial

---

## 1. Overview

The QS Element Library is a standardised, admin-managed picklist of **Discipline → Section → Sub Section → Sub Element** (plus a typical unit and a linked Budget Code) that Tender BOQ line items select from, instead of estimators free-typing these classification fields.

**Problem it solves:** free-text entry on BOQ classification fields causes naming drift — e.g. an estimator typing "Interior Wall Finishes" on one line item and "Internal Wall Finishes" on another. The two spellings look identical to a human reading the BOQ, but to any cost roll-up report grouping by that text field they are two different groups, silently splitting the cost that should have rolled up together. The Element Library eliminates this by replacing free text with a cascading selection from a single controlled source.

**Source:** seeded from the user-supplied `QS_Element_Library.xlsx` (518 rows across 4 disciplines — Civil and Structure, Architecture, MEP, External Works). See `docs/03-Business-Modules/12-Quantity-Surveying/QS_Element_Library.xlsx`.

**Governance model:** the library is:
- **Global** — shared across all organisations/projects, not per-tenant. There is one canonical spelling of "Interior Wall Finishes" for the whole platform, not one per org.
- **Admin-managed only** — there is no user-submitted "add new entry" path from the BOQ form. Estimators pick from the existing list; they cannot create new Sections/Sub Sections/Sub Elements inline.

This is a deliberate governance decision, not an oversight: allowing every estimator to add their own near-spelling ("Internal Wall Finishes", "Interior Walls Finishing", …) the moment the library was missing an entry would recreate the exact drift problem the library exists to prevent. New entries go through the admin-only Element Library editor (§6), the same governance pattern already used for `budget_package_sections` (see `02-Budget-Code-Design.md`).

---

## 2. Data Model

### 2.1 `qs_element_library` — Element Picklist

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `discipline` | TEXT | NOT NULL — e.g. `Civil and Structure`, `Architecture`, `MEP`, `External Works` |
| `section` | TEXT | NOT NULL — the Budget Code element (e.g. "Interior Wall Finishes") |
| `sub_section` | TEXT | NOT NULL — the work type / trade package (e.g. "Plastering") |
| `sub_element` | TEXT | NOT NULL — the priced specification detail (e.g. "Hollow clay brick 200mm Thk.") |
| `budget_code_id` | UUID | FK → `public.budget_codes(id)` on delete set null |
| `typical_unit` | TEXT | Default unit of measure for this Sub Element (e.g. `m²`, `Nos`) — editable after selection, not enforced |
| `sort_order` | INTEGER | Display ordering within Discipline → Section → Sub Section |
| `is_active` | BOOLEAN | Whether this entry is available for new BOQ selections |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Constraint:** Unique `(discipline, section, sub_section, sub_element)` — this is the database-level enforcement of governance rule BR6 (§4): "keep one spelling forever." It is not possible to insert a second row that differs from an existing row only by spelling of the same four-part path, because the four-part path itself is the uniqueness key — a near-duplicate spelling is, by definition, a different row the constraint will not silently merge. Preventing the near-duplicate from being *typed* in the first place is what the cascading-select UI (§5, §6) does; the constraint is the backstop that stops two admins from independently seeding two spellings of the same path.

**RLS:** same open-to-authenticated pattern as `budget_codes` (see `supabase/migrations/20260711000003_budget_codes.sql`) — `select`, `insert`, `update`, and `delete` are all open to any authenticated user at the RLS layer. Actual write restriction is enforced at the UI layer: only the admin-only Settings → Naming Convention page exposes create/edit/delete controls, the same pattern used by every other Naming Convention reference table in this codebase (e.g. `budget_package_sections`). This is a deliberate consistency choice, not a gap — see `02-Budget-Code-Design.md` §2.1 for the precedent.

### 2.2 `qs_description_library` — Description (Material Type) Picklist

| Column | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `element_library_id` | UUID | FK → `public.qs_element_library(id)` on delete cascade |
| `description` | TEXT | NOT NULL — the material-type description text (e.g. "Normal Concrete, 35Mpa (Cylinder), Slump 13+-2.5") |
| `in_price_list` | BOOLEAN | Whether this description exists in the firm's price list |
| `current_rate` | NUMERIC(15,2) | Current rate if in price list (nullable) |
| `sort_order` | INTEGER | Display ordering within the parent element |
| `is_active` | BOOLEAN | Whether this entry is available for new BOQ selections |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Constraint:** Unique `(element_library_id, description)` — prevents duplicate descriptions for the same sub-element. This is the 5th level of the cascade: one Sub Element row in `qs_element_library` maps to N description rows here (1:N relationship).

**Relationship:** `qs_description_library.element_library_id` is a FK to `qs_element_library.id` with `on delete cascade` — deleting an element library row automatically removes all its descriptions.

**Source:** seeded from `Description_Library.md` (~803 rows), which is the material-type description export from the user's `QS_Element_Library (1).xlsx`.

**RLS:** same open-to-authenticated pattern as `qs_element_library`.

---

## 3. Relationship to Budget Codes

`qs_element_library.budget_code_id` resolves against the existing `public.budget_codes` table — the enterprise-wide elemental cost classification already in production (see `02-Budget-Code-Design.md` §2 and `supabase/migrations/20260711000003_budget_codes.sql`).

No separate or parallel budget code list was created for this feature. The Excel's `Budget Code` column values (e.g. `A.04`, `B.01`–`B.04`, `C.01`–`C.11`, `D.01`–`D.03`, `E.01`–`E.04`, `F.00`–`F.10`, `G.01`–`G.05`) are drawn from the same firm-standard classification already seeded in `budget_codes` (see `supabase/migrations/20260711000004_budget_codes_seed.sql`, Groups A–G). Each Element Library `section` maps to exactly one `budget_code_id` (governance rule BR1, §4).

---

## 4. Governance / Naming Standard

The following rules are transcribed verbatim from the source Excel's "Naming Standard" governance sheet and apply to any admin maintaining the Element Library. They are numbered here as business rules because they are the test anchors for the UI's cascading-select and reset behaviour (§5, §6).

- **BR1:** Section = the Budget Code element (e.g. "Interior Wall Finishes"). One Section maps to exactly one Budget Code.
- **BR2:** Sub Section = the work type / trade package (e.g. "Plastering", "Hollow clay brick", "Glass Window", "Fire alarm system").
- **BR3:** Sub Element = the priced specification detail (e.g. "Hollow clay brick 200mm Thk.", "Smoke detector"). This is what carries the rate.
- **BR4:** Structure follows a different pattern from finishes: Sub Section = structural element (e.g. "Structural Beam"), Sub Element = work type (e.g. "Concrete", "Formwork", "Rebar").
- **BR5:** Never invent a new Section. If a Section is missing, it must be added to the Budget Code master first, then to this library — the Element Library section is always a subset of, and dependent on, the Budget Code master (§3).
- **BR6:** Keep one spelling forever. Select from the library; never retype. This is the rule the unique constraint in §2.1 enforces at the database level.
- **BR7:** Typical Unit is a default, not a rule — e.g. a door may be `Nos` or `m²` depending on the specification; it remains editable after selection.
- **BR8:** Description = the material-type specification detail (the priced variant). One Sub Element maps to N descriptions (e.g. "Concrete" → "35Mpa Slump 13", "25Mpa", etc.). Descriptions are selected from the library, not free-typed. See §2.2.

### 4.1 Canonical spelling vs. variant — examples

Standardise on the left column. These are the exact kinds of drift this library prevents.

| Use this (standard) | Do NOT use (variant) | Why it matters |
|---|---|---|
| Interior Wall Finishes | Internal Wall Finishes | Two spellings = two separate roll-up groups |
| Interior Floor Finishes | Internal Floor Finishes | Two spellings = two separate roll-up groups |
| Ceiling Finishes | Ceiling Finshes | Typo breaks lookup |
| Exterior Wall and Partition | External Wall and Partition | Budget Code wording must match |
| Exterior Window and Louver | External Windows and Louvers | Budget Code wording must match |
| Interior Doors | Interior Door | Budget Code wording must match |
| Handrail | Handrail on staircase | Keep Sub Section generic; put location detail in Sub Element/Description |
| (no trailing spaces) | `"Formwork "` / `"Marble on staircase "` | Trailing spaces silently break grouping — always trim |

---

## 5. Integration Points — Tender BOQ

**Consumer:** the Tender BOQ "Add Item" form, `apps/web/components/tenders/cost-estimation/boq-tab.tsx`.

At a design level (implementation is being carried out separately from this document):

- The form presents five cascading selects, in order: **Discipline → Section → Sub Section → Sub Element → Description**, each sourced from `qs_element_library` / `qs_description_library` and filtered by the value(s) chosen upstream.
- Picking a Sub Element auto-fills **Unit** (from `typical_unit`) and **Budget Code** (from `budget_code_id`). Picking a Description fills the **Description** text field. All remain editable afterward, per BR7/BR8 — the library supplies sensible defaults, not locked values.
- Changing an upstream field (e.g. switching Discipline, or picking a different Section) resets all downstream selections (Sub Section, Sub Element, Description, and the auto-filled Unit/Budget Code), so the form can never hold a combination that doesn't actually exist in the library.

**Schema impact:** none. `tender_boq_items` already carries the target columns — `discipline`, `section`, `sub_section`, `sub_element`, `budget_code_id` — from earlier migrations (`section` from the original table definition in `supabase/migrations/20260531000055_tender_cost_estimation.sql`; `discipline`, `sub_section`, `sub_element`, `budget_code_id` from `supabase/migrations/20260711000006_tender_boq_items_qs_extension.sql`). This feature changes **how** those columns get populated — picked from a controlled list instead of typed — not the `tender_boq_items` schema itself. Today those four text fields are free-text inputs (Discipline is currently a fixed select, Section/Sub Section/Sub Element are plain text inputs); the Element Library replaces the three text inputs with library-driven cascading selects.

---

## 6. UI Design — Admin Management

**Location:** a new "Element Library" sub-tab under **Settings → Naming Convention**, alongside the existing Budget Sections editor (see `02-Budget-Code-Design.md` §5.1).

**Access:** admin-only. No separate gate is required — the existing Settings page already redirects non-admin users before this sub-tab is reachable.

**Layout:** with 518 element rows + 803 description rows, a single flat inline-editable table is not usable at this scale. Instead:
- **Search / filter** across Discipline, Section, Sub Section, Sub Element, and Description text.
- **Grouped view**, collapsed by default: Discipline → Section, expanding to reveal the Sub Section / Sub Element rows underneath. Each Sub Element row has a **Descriptions** expand/collapse button showing the count of material-type descriptions, which reveals an inline description editor when expanded. This mirrors the natural cascading structure the Tender BOQ form itself uses (§5), so an admin browsing the library sees it organised the same way an estimator will encounter it.
- Row-level actions (edit Sub Element / Typical Unit / Budget Code / active flag, deactivate, reorder) remain available once a group is expanded, consistent with the inline-editing pattern used elsewhere in Naming Convention screens.
- Description-level actions (edit description text / In Price List / Current Rate / active flag, add new description, delete) are available within the expanded description sub-table for each Sub Element.

---

## 7. Reporting

The Element Library is not itself a reporting source — it is the classification input that keeps downstream cost reports groupable. Once BOQ line items are populated by selection instead of free text, any report that groups or rolls up cost by Discipline/Section/Sub Section/Sub Element (e.g. cost-per-m² and elemental summary reporting, see `04-GFA-Site-Area-Cost-per-m2-Design.md`) stops silently splitting totals across near-duplicate spellings, because there is only one spelling per path (BR6).

`[TBD — human to confirm]` whether a dedicated "Element Library usage" report (e.g. which Sub Elements are most frequently selected, or which library entries have zero BOQ usage) is required for this phase, or deferred to a later phase.

---

## 8. Open Items

- `[TBD — human to confirm]` Whether existing `tender_boq_items` rows with legacy free-typed Discipline/Section/Sub Section/Sub Element values (pre-dating this feature) require a one-time backfill/reconciliation pass against the library, or are left as-is with the library only enforced going forward.
- `[DONE]` Seed migration for 518-row Element Library — `20260722000010_qs_element_library_seed.sql`.
- `[DONE]` Seed migration for 803-row Description Library — `20260722000012_qs_description_library_seed.sql`.
