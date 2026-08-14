# SOP — Building the Direct Works Cost Library Module

| Document Control | |
|---|---|
| Document Title | SOP — Direct Works Cost Library Module (4-Level Architecture) |
| Document No. | QS-SOP-002 |
| Version | 1.0 |
| Owner | QS Manager |
| Applies To | DCOS System (Supabase/PostgreSQL) |
| Status | For Implementation |
| Relationship to Other SOPs | Supersedes SOP-QS-001 R1 §5 "SOP-QS-01: Cost Library Management" (`docs/02-Governance/01-SOP/22-SOP-Quantity-Surveying/SOP-QS-Module.md`) once this module goes live. Document number QS-SOP-001 is already in use by that SOP — this document is numbered QS-SOP-002 to avoid collision. See §12.2. |

---

## 1. Purpose

This SOP defines the step-by-step procedure to design, build, populate, test, and maintain the **Direct Works Cost Library Module** — a 4-level cost database that allows the QS team to:

1. Store market prices for basic resources (materials, labor, equipment, subcontract rates) with full price history.
2. Build unit rates as **recipes** that recalculate automatically when resource prices change.
3. Group work items into **assemblies** (complete building elements per m²) for fast estimating.
4. Generate a full elemental estimate for a new project from a few building parameters (**parametric models**).
5. Feed actual costs from completed projects back into the library (feedback loop).

**Design principle:** Prices are stored once, in one place (Level 1). Everything above Level 1 stores only *knowledge* (consumptions, productivities, design ratios) and calculates money live.

---

## 2. Scope

| In Scope | Out of Scope |
|---|---|
| Resource library + price history | Preliminaries library (already exists: `prelim_library_*`) |
| Work item recipe library | Payroll, HR, accounting modules |
| Assembly library | BIM quantity takeoff automation |
| Parametric quantity models | Client-facing portals |
| Project quick estimates + snapshots | |
| Integration mapping to existing DCOS tables | |

---

## 3. Definitions

| Term | Definition |
|---|---|
| Resource | Anything bought or hired at a market price: material, labor, equipment, subcontract rate. Priced by the market. |
| Work Item | One BOQ-line scope of work (e.g., "C30 concrete in columns, per m³"). Priced by a recipe of resources. Never stores a price. |
| Recipe | The list of (resource, consumption, waste %) lines that make up one unit of a work item. |
| Assembly | A complete building element measured the way a QS measures (e.g., "internal partition wall complete, per m²"). A recipe of work items. |
| Parametric Model | A set of quantity factors per building type that converts building inputs (GFA, storeys, etc.) into element quantities. |
| Net Direct Rate | Computed rate with NO overhead and NO profit. Markups are applied at project level only. |
| Snapshot | A frozen copy of all computed rates used in a specific tender, for audit. |
| Consumption | Quantity of a resource used per one unit of a work item (e.g., 0.20 gang-days per m³). |
| Design Ratio | Quantity of a work item per one unit of an assembly (e.g., 2.00 m² plaster per m² of wall = two faces). |

---

## 4. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| QS Manager (Owner) | Approves all coding standards, all new resources, all price entries, all recipe changes. Signs off each phase acceptance test. |
| Estimator / QS | Proposes new resources, enters supplier quotations, builds and maintains recipes and assemblies. |
| Procurement | Supplies actual purchase prices (source_type = 'purchase') monthly. |
| Site QS | Supplies actual productivity and waste records at project close-out. |
| Developer / Admin | Runs migrations, maintains views, backups, and access control (RLS). |

**Rule: one approver.** No price or recipe enters the live library without QS Manager approval. Record `created_by` on every row.

---

## 5. Prerequisites

Before Phase 1, confirm:

1. Supabase project selected (see §6, Decision D1).
2. Admin access to run migrations.
3. The QS Manager Working Instruction (tender-to-handover workflow) is adopted — BOQ section codes in this module must match it (01 Preliminaries … 08 Contingency).
4. At least the following source data collected:
   - 3 recent supplier quotations for major materials (concrete, rebar, block, cement, sand, tile, paint).
   - Current labor day-rates for at least 5 trades.
   - Current equipment hire rates for at least 5 plant types.
   - Estimators' existing rate build-up sheets (Excel) for the top 20 work items.

---

## 6. Phase 0 — Foundation Decisions (Day 1)

Record each decision in this SOP before writing any code.

**D1 — Where to build.**
Recommended: build the new tables inside **DCOS** (`dcos-system`) so it can integrate with the existing `tender_*`, `procurement_*`, and `qs_*` modules, using the `dwl_` table prefix (Direct Works Library) to avoid collision with the six existing overlapping structures verified live in the database — `qs_cost_items`, `unit_rate_library`, `rate_libraries`, `company_rate_library`/`company_rate_library_lines`, `tender_unit_rates`/`tender_unit_rate_lines`, `tender_price_list_items` (see §12 for the full reconciliation, including three of these having no migration file in the repo — resolve that drift before Phase 0 sign-off). This module consolidates and replaces all six; it does not sit alongside them. Alternative: prototype in the empty project first, then migrate. Decision: Build inside DCOS (`dcos-system`), `dwl_` table prefix, consolidating and replacing the six existing structures per §12. Schema drift for the three undocumented structures (`company_rate_library`/`_lines`, `tender_unit_rates`/`_lines`, `tender_price_list_items`) is reconciled via migration `20260720000002_reconcile_rate_library_schema_drift.sql`. — Date: 2026-07-20

**D2 — Coding standard (permanent, do not change later).**

| Entity | Format | Example |
|---|---|---|
| Resource | `{M/L/E/S}-{GROUP3}-{NNN}` | `M-CON-001` (Material, Concrete group) |
| Work item | `{BOQ section}.{trade}.{NNN}` | `03.02.010` (Superstructure, concrete trade) |
| Assembly | `ASM-{ELEMENT}-{NNN}` | `ASM-WALL-010` |
| Model | `MDL-{TYPE}-{NNN}` | `MDL-SCH-001` (School) |

Decision: Coding standard as tabulated above is locked and confirmed — no changes without a new SOP version (§16). — Date: 2026-07-20

**D3 — Unit dictionary (locked list).** Allowed units only: `m, m2, m3, kg, tonne, pcs, no, set, day, hr, ls, month, l, bag, roll, sheet, trip`. One resource = one unit, forever. Convert supplier quotes to the library unit at data entry.

Decision: Unit dictionary as listed above is locked and confirmed. — Date: 2026-07-20

**D4 — Currency.** Base currency USD. Foreign quotes converted at entry; record original in `notes`.

Decision: Base currency is USD, confirmed. — Date: 2026-07-20

**D5 — Granularity target.** 150–300 resources total. Only price-driving specification differences justify a new resource.

Decision: 150–300 resources total confirmed as the granularity target. — Date: 2026-07-20

**D6 — Multi-tenant.** Include `tenant_id uuid` on every table to match the existing DCOS pattern.

Decision: Yes — `tenant_id uuid not null` on every `dwl_*` table, with RLS enforced per §7 Step 1.1a (tenant-scoped `auth.jwt() ->> 'tenant_id'` policies, not the legacy permissive `USING (true)` pattern seen on the six existing structures per §12). — Date: 2026-07-20

**Phase 0 acceptance:** all six decisions recorded and signed by QS Manager.

---

## 7. Phase 1 — Level 1: Resources, Suppliers, Price History (Week 1)

### Step 1.1 — Create tables (migration `dwl_01_resources`)

```sql
-- Suppliers
create table dwl_suppliers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  name        text not null,
  contact     text,
  rating      text check (rating in ('A','B','C')) default 'B',
  is_active   boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- Resource catalogue (identity — changes rarely, never deleted)
create table dwl_resources (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid,
  code           text not null unique,            -- e.g. M-CON-001
  category       text not null check (category in ('material','labor','equipment','subcon')),
  description    text not null,                   -- must include price-driving spec
  unit           text not null,                   -- from locked unit dictionary
  spec_reference text,                            -- e.g. ASTM C94
  is_active      boolean not null default true,   -- deactivate, never delete
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Price history (append-only — never update, never delete)
create table dwl_resource_prices (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid,
  resource_id       uuid not null references dwl_resources(id),
  supplier_id       uuid references dwl_suppliers(id),
  unit_price        numeric(14,4) not null check (unit_price >= 0),
  currency          text not null default 'USD',
  valid_from        date not null,
  quote_valid_until date,                         -- null = open-ended (surveys, actuals)
  source_type       text not null check (source_type in
                      ('quotation','purchase','market_survey','estimate')),
  location          text default 'Phnom Penh',
  notes             text,
  created_by        uuid,
  created_at        timestamptz not null default now()
);

create index on dwl_resource_prices (resource_id, valid_from desc);
```

### Step 1.1a — RLS policies (mandatory, not optional)

Every existing rate-library table in DCOS — confirmed live via direct database inspection: `qs_cost_items`, `unit_rate_library`, `rate_libraries`, `company_rate_library`/`company_rate_library_lines`, `tender_unit_rates`/`tender_unit_rate_lines`, `prelim_library_items` — currently ships with permissive `USING (true) WITH CHECK (true)` RLS on every policy (select/insert/update/delete all unconditional for any authenticated user). No real row-level enforcement exists; access control is pushed entirely to the app layer. SOP-QS-Module.md §13 already flags this pattern as **GAP-01, Critical** ("RBAC not enforced on QS components") on the legacy tables. This module must not repeat it.

Enable RLS on all `dwl_*` tables at creation time, scoped to `tenant_id`, with price rows additionally locked against non-admin UPDATE/DELETE per the append-only rule (Step 1.4.1):

```sql
alter table dwl_suppliers        enable row level security;
alter table dwl_resources        enable row level security;
alter table dwl_resource_prices  enable row level security;

-- Read: any authenticated member of the tenant
create policy dwl_resources_tenant_select on dwl_resources
  for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy dwl_resource_prices_tenant_select on dwl_resource_prices
  for select using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Write: tenant-scoped, and only Estimator/QS Manager roles (via a role claim or membership check)
create policy dwl_resources_tenant_write on dwl_resources
  for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy dwl_resource_prices_tenant_insert on dwl_resource_prices
  for insert with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Append-only enforcement: no UPDATE/DELETE policy is created for dwl_resource_prices.
-- With RLS enabled and no matching policy, UPDATE/DELETE are rejected outright —
-- this is the DB-level guarantee behind the "prices are never edited" rule in Step 1.4.1.
```

Apply the same `tenant_id`-scoped select/insert pattern to every table introduced in Phases 2–5 (`dwl_work_items`, `dwl_assemblies`, `dwl_quantity_models`, `dwl_projects`, `dwl_project_snapshots`, etc.) — do not defer RLS to a later phase or ship any `dwl_*` table with a bare `USING (true)` policy.

### Step 1.2 — Create the "current price" view

The current price of a resource = latest `valid_from` row, preferring quotation/purchase over survey.

```sql
create or replace view dwl_v_current_prices as
select distinct on (rp.resource_id)
  rp.resource_id,
  r.code,
  r.description,
  r.unit,
  rp.unit_price,
  rp.currency,
  rp.valid_from,
  rp.quote_valid_until,
  rp.source_type,
  s.name as supplier_name,
  (rp.quote_valid_until is not null
   and rp.quote_valid_until < current_date) as is_expired
from dwl_resource_prices rp
join dwl_resources r on r.id = rp.resource_id
left join dwl_suppliers s on s.id = rp.supplier_id
where r.is_active
order by rp.resource_id, rp.valid_from desc, rp.created_at desc;
```

### Step 1.3 — Seed the starter catalogue

Enter (minimum) the resources below with one price row each, from real quotations gathered in §5:

| Code | Category | Description | Unit |
|---|---|---|---|
| M-CON-001 | material | Ready-mix concrete C30, slump 10±2cm | m3 |
| M-CON-002 | material | Ready-mix concrete C35 | m3 |
| M-STL-001 | material | Rebar deformed SD40, dia 10–25mm | tonne |
| M-BLK-001 | material | Concrete block 100mm, 390×190 | pcs |
| M-CEM-001 | material | Portland cement 50kg bag | bag |
| M-SND-001 | material | Fine sand, delivered | m3 |
| M-TIL-014 | material | Porcelain tile 600×600 standard | m2 |
| M-PNT-001 | material | Emulsion paint, interior | l |
| M-CUR-001 | material | Curing compound | kg |
| L-GEN-001 | labor | General laborer | day |
| L-MAS-001 | labor | Mason (skilled) | day |
| L-STL-001 | labor | Steel fixer | day |
| L-CAR-001 | labor | Carpenter (formwork) | day |
| E-PMP-001 | equipment | Concrete pump incl. operator | m3 |
| E-VIB-001 | equipment | Poker vibrator | day |
| E-EXC-001 | equipment | Excavator PC200 incl. operator + fuel | hr |
| S-TST-001 | subcon | Concrete cube test, set of 3 | set |
| S-WPF-001 | subcon | Waterproofing membrane, supply & apply | m2 |

### Step 1.4 — Data entry rules (enforce by procedure)

1. **Append-only prices.** A price change = a new row with a new `valid_from`. Updating or deleting price rows is prohibited.
2. **New resource test:** "Does it have a different market price than an existing resource?" If no → do not create it.
3. Every quotation entered must carry `quote_valid_until` (from the supplier's quote).
4. Every actual purchase entered by Procurement uses `source_type = 'purchase'` monthly.
5. Description must contain the price-driving spec (grade, size, class). "Concrete" alone is rejected.

### Step 1.5 — Phase 1 acceptance test

| # | Test | Pass Criteria |
|---|---|---|
| 1 | Insert two prices for M-CON-001 with different `valid_from` | `dwl_v_current_prices` shows only the later one |
| 2 | Insert a price with `quote_valid_until` in the past | `is_expired = true` in the view |
| 3 | Attempt duplicate resource `code` | Rejected by unique constraint |
| 4 | Deactivate a resource | It disappears from the view but its rows remain |
| 5 | Count seeded resources | ≥ 18, each with ≥ 1 price and a `basis` in notes |

Sign-off: QS Manager ______ Date ______

---

## 8. Phase 2 — Level 2: Work Items and Recipes (Week 2)

### Step 2.1 — Create tables (migration `dwl_02_work_items`)

```sql
create table dwl_work_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  code         text not null unique,          -- e.g. 03.02.010
  boq_section  text not null,                 -- 01..08 per QS workflow
  description  text not null,                 -- MUST state inclusions AND exclusions
  unit         text not null,
  method_note  text,                          -- e.g. 'Pump placement'
  is_active    boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table dwl_work_item_resources (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  work_item_id  uuid not null references dwl_work_items(id) on delete cascade,
  resource_id   uuid not null references dwl_resources(id),
  consumption   numeric(14,6) not null check (consumption > 0),
  waste_pct     numeric(6,4) not null default 0 check (waste_pct >= 0 and waste_pct < 1),
  basis_note    text not null,                -- audit trail: WHERE the number came from
  sort_order    int not null default 0,
  unique (work_item_id, resource_id)
);
```

Note: `waste_pct` is stored as a fraction (0.03 = 3%). `basis_note` is **mandatory** — a consumption without a basis is rejected at review.

### Step 2.2 — Create the live rate view

```sql
create or replace view dwl_v_work_item_rates as
select
  wi.id as work_item_id,
  wi.code,
  wi.boq_section,
  wi.description,
  wi.unit,
  sum(wir.consumption * (1 + wir.waste_pct) * cp.unit_price) as net_direct_rate,
  bool_or(cp.is_expired) as has_expired_price,
  count(*) as recipe_lines
from dwl_work_items wi
join dwl_work_item_resources wir on wir.work_item_id = wi.id
join dwl_v_current_prices cp on cp.resource_id = wir.resource_id
where wi.is_active
group by wi.id, wi.code, wi.boq_section, wi.description, wi.unit;
```

And the "explosion" view (one row per recipe line, for the rate build-up screen):

```sql
create or replace view dwl_v_work_item_explosion as
select
  wi.code as work_item_code,
  wir.sort_order,
  r.code as resource_code,
  r.description as resource_desc,
  r.unit as resource_unit,
  wir.consumption,
  wir.waste_pct,
  cp.unit_price,
  round(wir.consumption * (1 + wir.waste_pct) * cp.unit_price, 4) as line_cost,
  cp.source_type,
  cp.is_expired,
  wir.basis_note
from dwl_work_items wi
join dwl_work_item_resources wir on wir.work_item_id = wi.id
join dwl_resources r on r.id = wir.resource_id
join dwl_v_current_prices cp on cp.resource_id = wir.resource_id
order by wi.code, wir.sort_order;
```

### Step 2.3 — Recipe construction rules

1. **No money in recipes.** Only consumption + waste. If you find yourself typing a dollar amount, it belongs in Level 1.
2. **Labor as productivity.** Consumption = crew size ÷ daily output (6 laborers ÷ 30 m³/day = 0.20 day/m³). Record the crew and output in `basis_note`.
3. **Scope discipline.** Description states exclusions explicitly (e.g., "Excl. formwork & rebar — measured separately"). This prevents double counting against the BOQ method of measurement.
4. **No overhead, no profit.** Rates in this level are net direct rates only.
5. **Method variants = separate items** (pump vs crane-and-skip), never a note.
6. **Waste lives here** (Level 2), never in assemblies (Level 3).

### Step 2.4 — Seed the reference work item (validation example)

Item `03.02.010 — Vibrated concrete C30 in columns, per m³` with recipe:

| Resource | Consumption | Waste | Basis note |
|---|---|---|---|
| M-CON-001 | 1.00 | 3% | Spillage + column over-pour, site records |
| E-PMP-001 | 1.00 | — | Supplier rate incl. operator |
| L-GEN-001 | 0.20 day | — | Gang of 6 places 30 m³/day |
| L-MAS-001 | 0.03 day | — | 1 finisher per gang |
| E-VIB-001 | 0.04 day | — | 1 vibrator per gang |
| M-CUR-001 | 0.40 kg | — | Column surface area basis |
| S-TST-001 | 0.02 set | — | 1 set per 50 m³ per spec |

Then build the remaining top-20 items from the estimators' existing Excel build-ups (§5), in this priority order: concrete items (footing, column, beam, slab), rebar supply & fix, formwork (per element type), blockwork, plaster, screed, floor tile, painting, waterproofing, excavation, backfill.

### Step 2.5 — Phase 2 acceptance test (the cascade test)

| # | Test | Pass Criteria |
|---|---|---|
| 1 | Query `dwl_v_work_item_rates` for 03.02.010 | Rate ≈ hand-calculated value (±0.01) |
| 2 | Insert a NEW price row for M-CON-001, +$3.00 | Rate of 03.02.010 increases by ≈ $3.09 (1.00 × 1.03 × 3) with NO other change |
| 3 | Make one price row expired | `has_expired_price = true` for every item using it |
| 4 | Explosion view for 03.02.010 | 7 lines, each with basis_note, sum = header rate |
| 5 | Recipe line without basis_note | Rejected at QS Manager review |

**Test 2 is the module's reason to exist.** If it passes, the library is officially faster than Excel.

Sign-off: QS Manager ______ Date ______

---

## 9. Phase 3 — Level 3: Assemblies (Week 3)

### Step 3.1 — Create tables (migration `dwl_03_assemblies`)

```sql
create table dwl_assemblies (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid,
  code             text not null unique,        -- e.g. ASM-WALL-010
  element_group    text not null,               -- wall / slab / roof / door / finish ...
  description      text not null,               -- MUST state the measurement rule
  unit             text not null,               -- usually m2 or no
  measurement_rule text not null,               -- e.g. 'Net area, openings deducted'
  is_active        boolean not null default true,
  created_by       uuid,
  created_at       timestamptz not null default now()
);

create table dwl_assembly_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  assembly_id   uuid not null references dwl_assemblies(id) on delete cascade,
  work_item_id  uuid not null references dwl_work_items(id),
  qty_per_unit  numeric(14,6) not null check (qty_per_unit > 0),  -- DESIGN ratio, not waste
  basis_note    text not null,
  sort_order    int not null default 0,
  unique (assembly_id, work_item_id)
);

create or replace view dwl_v_assembly_rates as
select
  a.id as assembly_id,
  a.code,
  a.element_group,
  a.description,
  a.unit,
  sum(ai.qty_per_unit * wir.net_direct_rate) as net_direct_rate,
  bool_or(wir.has_expired_price) as has_expired_price
from dwl_assemblies a
join dwl_assembly_items ai on ai.assembly_id = a.id
join dwl_v_work_item_rates wir on wir.work_item_id = ai.work_item_id
where a.is_active
group by a.id, a.code, a.element_group, a.description, a.unit;
```

### Step 3.2 — Assembly construction rules

1. `qty_per_unit` is a **design ratio** (2.00 = plaster both faces), never waste — waste is already inside Level 2.
2. Hidden work is encoded once, forever (stiffeners, lintels, wall ties as small m³/m² allowances).
3. `measurement_rule` is mandatory — an assembly rate without a measurement rule is ambiguous.
4. Variants are separate assemblies sharing the same work items.
5. Assemblies are for estimating/cost planning; formal tender BOQs are produced by **exploding** assemblies back into work items.

### Step 3.3 — Seed the starter assembly set (target ≈ 25 assemblies)

Walls: ASM-WALL-010 internal partition painted, -011 wet area, -020 external 150mm, -030 fair-faced.
Slabs: ASM-SLAB-010 suspended slab complete (concrete + rebar + formwork), ASM-SLAB-020 ground slab complete.
Frame: ASM-COL-010 column complete per m³, ASM-BEAM-010 beam complete per m³.
Finishes: ASM-FLR-010 tile floor complete, ASM-FLR-020 screed only, ASM-CLG-010 ceiling complete.
Openings: ASM-DOOR-010 classroom door complete per no., ASM-WIN-010 aluminum window complete per m².
Roof / external / stairs as required.

Reference example, `ASM-WALL-010` (per m²): 1.00 × blockwork item + 0.008 × RC stiffener item + 2.00 × plaster item + 2.00 × paint item.

### Step 3.4 — Phase 3 acceptance test

| # | Test | Pass Criteria |
|---|---|---|
| 1 | `dwl_v_assembly_rates` for ASM-WALL-010 | Equals hand-calculated sum of the four lines |
| 2 | Raise cement price in Level 1 | Wall assembly rate rises with no other edit (3-level cascade) |
| 3 | Every assembly has `measurement_rule` | 100% populated |
| 4 | Explode ASM-WALL-010 | Returns the 4 work items with quantities, mapped to BOQ sections |

Sign-off: QS Manager ______ Date ______

---

## 10. Phase 4 — Level 4: Parametric Quantity Models (Week 4)

### Step 4.1 — Create tables (migration `dwl_04_models`)

```sql
create table dwl_quantity_models (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  code          text not null unique,          -- e.g. MDL-SCH-001
  building_type text not null,                 -- school / office / apartment ...
  description   text not null,
  basis_note    text not null,                 -- which completed projects calibrated it
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table dwl_model_factors (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  model_id     uuid not null references dwl_quantity_models(id) on delete cascade,
  assembly_id  uuid not null references dwl_assemblies(id),
  driver       text not null check (driver in
                 ('gfa','footprint','storeys','gfa_per_45','fixed')),
  factor       numeric(14,6) not null,         -- qty = driver_value × factor
  basis_note   text not null,
  unique (model_id, assembly_id)
);
```

Driver semantics: quantity of the assembly = (driver value from project inputs) × factor. Example: partitions driven by `gfa` with factor 0.90 → 8,000 m² GFA gives 7,200… **calibrate to your own projects**; example factors below are starting values only.

### Step 4.2 — Seed model `MDL-SCH-001` (School, RC frame, mid-rise) — indicative factors

| Assembly | Driver | Factor | Meaning |
|---|---|---|---|
| ASM-SLAB-010 suspended slab | gfa | 0.90 | slab area ≈ 90% of GFA |
| ASM-COL-010 columns (m³) | gfa | 0.045 | column concrete per m² GFA |
| ASM-BEAM-010 beams (m³) | gfa | 0.055 | beam concrete per m² GFA |
| ASM-WALL-010 partitions | gfa | 0.90 | internal wall m² per m² GFA |
| ASM-WALL-020 external wall | gfa | 0.45 | envelope m² per m² GFA |
| ASM-FLR-010 floor finish | gfa | 0.85 | net floor area |
| ASM-CLG-010 ceiling | gfa | 0.80 | |
| ASM-DOOR-010 doors (no.) | gfa | 0.022 | ≈ 1 door per 45 m² |
| ASM-WIN-010 windows | gfa | 0.12 | |

### Step 4.3 — Project estimate tables and generation

```sql
create table dwl_projects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  name        text not null,
  model_id    uuid references dwl_quantity_models(id),
  gfa         numeric(14,2),
  footprint   numeric(14,2),
  storeys     int,
  status      text not null default 'draft',
  created_at  timestamptz not null default now()
);

create or replace view dwl_v_project_estimate as
select
  p.id as project_id,
  p.name,
  a.element_group,
  a.code as assembly_code,
  a.description,
  a.unit,
  round(case mf.driver
      when 'gfa'       then p.gfa * mf.factor
      when 'footprint' then p.footprint * mf.factor
      when 'storeys'   then p.storeys * mf.factor
      when 'fixed'     then mf.factor
      else p.gfa * mf.factor end, 2) as quantity,
  ar.net_direct_rate,
  round((case mf.driver
      when 'gfa'       then p.gfa * mf.factor
      when 'footprint' then p.footprint * mf.factor
      when 'storeys'   then p.storeys * mf.factor
      when 'fixed'     then mf.factor
      else p.gfa * mf.factor end) * ar.net_direct_rate, 0) as amount
from dwl_projects p
join dwl_model_factors mf on mf.model_id = p.model_id
join dwl_assemblies a on a.id = mf.assembly_id
join dwl_v_assembly_rates ar on ar.assembly_id = a.id;
```

Markups (prelims, overheads, risk, contingency, profit, tax) are applied on top of the summed direct cost at project level, using an indicative percentage structure (10 / 3 / 4 / 3 / 5 / 8 / 10%) as a starting point, stored per project so each tender can set its own margins.

**Note:** the previous version of this SOP referred to this structure as "the Quick Cost Estimator" as though it were an existing benchmark tool. No such module exists in DCOS today — the percentages above are indicative defaults only, not a validated external benchmark. Do not rely on a "Quick Cost Estimator" comparison for Phase 4 acceptance (see corrected Step 4.4 test #2); if a real benchmarking tool is needed, scope and build it as a separate deliverable with its own owner.

### Step 4.4 — Phase 4 acceptance test

| # | Test | Pass Criteria |
|---|---|---|
| 1 | Create project: School, GFA 8,000, 10 storeys, MDL-SCH-001 | `dwl_v_project_estimate` returns a full quantity + amount list in < 1 second |
| 2 | Sum of amounts vs the pre-migration `unit_rate_library`/`qs_cost_items` rate for the same 10 common items used in §15 Test 5 | Same order of magnitude (±20%); investigate any element that diverges wildly |
| 3 | Change GFA to 9,000 | All quantities and amounts rescale |
| 4 | Raise one Level-1 price | Project estimate updates (4-level cascade) |

Sign-off: QS Manager ______ Date ______

---

## 11. Phase 5 — Snapshots (Week 5)

**Rule:** the live library moves; a submitted tender must not. Before any estimate is issued, freeze it.

```sql
create table dwl_project_snapshots (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  project_id   uuid not null references dwl_projects(id),
  label        text not null,                 -- e.g. 'Tender submission rev A'
  snapped_at   timestamptz not null default now(),
  snapped_by   uuid,
  payload      jsonb not null                 -- full estimate rows + exploded rates + prices used
);
```

Procedure: on "Issue estimate", copy `dwl_v_project_estimate` plus the full work-item explosion (including each resource price used, its supplier and `valid_from`) into `payload`. Snapshots are append-only and are the audit basis for tender clarifications, escalation claims, and final-account comparison.

**Acceptance:** issue a snapshot, then change a Level-1 price; the live estimate changes, the snapshot does not.

---

## 12. Phase 6 — Integration with Existing DCOS Tables (Week 5–6)

**Correction (v1.0 → this revision, verified against the live database on 2026-07-20):** an earlier revision of this document removed `company_rate_library` and `tender_unit_rates` from this table on the assumption they didn't exist — that assumption was based on a repo migration-file search only and was wrong. Direct inspection of the live DCOS database (project `dcos-system`) confirms **six** separate, overlapping rate/cost structures exist today, not four, and three of them have **no corresponding migration file anywhere in the repo** — real schema drift between the tracked migration history and the live database. The table below reflects verified live schema, row counts, and drift status as of 2026-07-20.

| Existing DCOS table | Live rows | Migration file | Relationship to this module |
|---|---|---|---|
| `company_rate_library` / `company_rate_library_lines` | 257 / 34 | **None found in repo or in the tracked migration history** (`list_migrations` stops at `20260717000004`) | Enterprise rate library with a `_lines` child carrying `price_list_item_code`, `price_list_item_desc`, `unit_price`, `qty_per_unit` — already structurally close to a resource/consumption recipe. Highest-volume active structure. Migrate: `company_rate_library` → `dwl_work_items`; `company_rate_library_lines` → `dwl_work_item_resources` against matched/created `dwl_resources` (using `price_list_item_code`/`unit_price` to seed `dwl_resources`/`dwl_resource_prices`). |
| `rate_libraries` | 244 | `20260717000005_create_rate_libraries.sql` (local file exists; **not** in tracked migration history either) | Discipline-scoped (STR/MEP/ARC) supplier rate list, second-largest active structure. Migrate: each row → a `dwl_resources` row (by `discipline`+`code`) plus one `dwl_resource_prices` row (source_type 'quotation' if `valid_until` is set, else 'market_survey'). Powers `/dashboard/qs/rate-libraries/page.tsx` (inline query, no service layer) — repoint per §12.1. |
| `qs_cost_items` (+ `qs_cost_divisions`/`qs_cost_sections`) | 67 | `20260531000022_create_qs_cost_library.sql` | Flat CSI-style library, `base_rate` + labor%/material%/equipment% split. Migrate: each row → `dwl_work_items`; %-split exploded into `dwl_work_item_resources` against matched/created `dwl_resources`, with `basis_note` flagging it was derived from a %-split, not a real recipe. Powers `/dashboard/qs/cost-library` and `qs-service.ts`. |
| `tender_unit_rates` / `tender_unit_rate_lines` | 9 / 34 | **None found in repo or in the tracked migration history** | Per-tender rate build-up. `tender_unit_rate_lines.price_list_item_id` → `tender_price_list_items` (below) — this trio is structurally the **closest existing analog** to the `dwl_*` recipe model already (work item → recipe lines → priced resource), just scoped per-tender rather than as an enterprise library. `tender_unit_rates.library_rate_id` → `company_rate_library.id` exists as an FK but is populated on 0 of 9 rows — the linkage is defined but not actually used yet. Migrate: `tender_unit_rates` → `dwl_work_items`, `tender_unit_rate_lines` → `dwl_work_item_resources`. |
| `tender_price_list_items` | 29 | **None found** (distinct from `tender_price_list`, which does have a tracked migration — see below) | Per-tender supplier price list feeding `tender_unit_rate_lines`. Migrate into `dwl_resources` / `dwl_resource_prices`. |
| `unit_rate_library` | 7 | `20260531000055_tender_cost_estimation.sql` | Enterprise historical rate list — effectively unused (7 rows). Migrate the few real rows for completeness; do not treat as a significant migration-effort driver. |
| `tender_price_list` | 0 (at time of writing) | `20260711000005_tender_price_list.sql` (+ `20260717000003` recreate) | *Correction (2026-07-21 investigation): this table is **live**, not dead — it backs the Price List tab (`price-list-tab.tsx` via `getPriceList`/`createPriceListItem`/`updatePriceListItem`/`deletePriceListItem` in `tender-cost-service.ts`) and feeds the BOQ import match-key logic. Zero rows in this environment reflects no tender having used the Price List tab yet, not an unused table. Do not retire it — repoint `source_unit_rate_id` the same way other rate sources are handled, or leave it as-is if no migration is actually needed for its own FK.* |
| `qs_boq_items` | 0 | `20260531000023_create_qs_boq_tables.sql` | **Empty — no live rows**, while `tender_boq_items` (below) holds 841 rows. Plausible explanation: `qs_boq_items` is the post-award locked-BOQ table and no project in this environment has reached contract award yet, so it's dormant rather than dead — **confirm this with QS Manager before assuming it's unused**, since SOP-QS-Module.md documents it as the live BOQ path. |
| `tender_boq_items` | 841, 9 with `unit_rate_id` set | `20260531000055_tender_cost_estimation.sql`, extended `20260711000006_tender_boq_items_qs_extension.sql` | The actually-populated BOQ table today. `unit_rate_id` → `tender_unit_rates.id`, populated on only 9 of 841 rows — most tender BOQ items currently carry a manually-entered rate, not one sourced from a rate library. `qs_boq_items.cost_item_id` (→ `qs_cost_items`) and `tender_boq_items.unit_rate_id` (→ `tender_unit_rates`) both get repointed to `dwl_work_items` during cutover — see §12.1. |
| `procurement_quotations` / `procurement_quotation_items` | — | `20260531000006_create_rfq_tables.sql` | Auto-feed Level 1: on quotation approval, insert `dwl_resource_prices` (source_type 'quotation') for matched resources. (Sibling items table is `procurement_quotation_items`, singular "quotation" — not `procurement_quotations_items`.) |
| `procurement_pos` / goods receipts | — | `20260531000005_create_procurement_tables.sql` | Auto-feed Level 1 actuals (source_type 'purchase'). |
| `prelim_library_*` | — | `20260718000001_prelim_cost_library.sql` | Remains the Preliminaries library (BOQ section 01); this module covers sections 02–06. Out of scope — no migration needed. |
| `qs_cost_transactions` | — | `20260531000024_create_qs_cost_transactions.sql` | Final-account actuals → feedback loop (§14). |

**Schema drift is a prerequisite risk, not just a documentation gap.** `company_rate_library`/`_lines`, `tender_unit_rates`/`_lines`, and `tender_price_list_items` — three of the six structures, together holding the majority of the real data (257+34+9+34+29 = 363 rows) — exist live with no migration file in the repo and no entry in the tracked migration history. Before Phase 0 starts, Developer/Admin must reconcile this (e.g. `supabase db pull`/`db diff` against the live project to generate the missing migration files) so the `dwl_*` migrations in Phases 1–5 are written against a schema the repo actually tracks, not a stale snapshot.

**Integration rule:** the library is the single source of rates; tender and procurement modules *consume* it, never the reverse (except the two price feeds into Level 1).

### 12.1 Phase 6b — Legacy Cutover and FK Repoint Order

All ten structures above (excluding the two empty tables) are live and read by real UI pages, service files, or downstream FKs today. Cutover must not break them mid-migration, and effort should track real usage, not table count.

**Repoint order (decided before Phase 0 starts, recorded here at sign-off) — sequenced by rising blast radius and rising schema-drift risk:**

1. `unit_rate_library` (7 rows) → `dwl_work_items` — trivial volume, validates the migration pattern end-to-end at near-zero risk.
2. `rate_libraries` (244 rows) → `dwl_resources` / `dwl_resource_prices` — one inline-query page, no FK dependents; largest volume but simplest blast radius.
3. `qs_cost_items` (67 rows) → `dwl_work_items` (%-split exploded into `dwl_work_item_resources`).
4. Reconcile schema drift for `company_rate_library`/`_lines` and `tender_unit_rates`/`_lines`/`tender_price_list_items` (generate missing migration files — see note above) **before** migrating them, so the migration itself is reproducible.
5. `company_rate_library` / `company_rate_library_lines` (257 / 34 rows) → `dwl_work_items` / `dwl_work_item_resources` — largest single structure, migrate once drift is resolved.
6. `tender_unit_rates` / `tender_unit_rate_lines` / `tender_price_list_items` (9 / 34 / 29 rows) → `dwl_work_items` / `dwl_work_item_resources` / `dwl_resources`+`dwl_resource_prices` — smallest volume among the drifted tables but structurally the richest source (real recipes, not %-splits); do last so the target schema is already proven by steps 1–5.
7. Repoint `tender_boq_items.unit_rate_id` → `dwl_work_items.id` (841 rows, only 9 currently populated — low actual FK-rewrite volume).
8. Confirm with QS Manager whether `qs_boq_items` is dormant (post-award, no project has reached that stage) or genuinely unused before deciding whether to repoint `qs_boq_items.cost_item_id` → `dwl_work_items.id` or deprecate the table.
9. Freeze legacy tables read-only (`REVOKE INSERT, UPDATE, DELETE` for the application role) once step 8 is resolved and verified against the Phase 6 acceptance test below; do not drop them — they remain the audit trail for pre-migration data. **Do not retire `tender_price_list`** — corrected 2026-07-21: it is live, backs the Price List tab, and was never actually confirmed unwritten (the "0 rows" observation just meant no tender had used that tab yet).

**Pages / services repointed to `dwl_v_*` views, in this order:**

| Page / service | Currently reads | Repoints to |
|---|---|---|
| `apps/web/lib/tender-cost-service.ts` + `/dashboard/tenders/unit-rates/page.tsx` | `unit_rate_library` | *Correction (2026-07-21): this was never actually repointed — `unit-rates-tab.tsx` still reads/writes `unit_rate_library` directly. Investigation found `dwl_v_work_item_rates` can't be a drop-in replacement here: it's a recipe-derived rate (sum of resource-line consumption × price), not a flat editable field, so "Add Rate" would need a full work-item + resource-recipe creation flow, not a form swap. Decided (session status doc, item #2): leave this page as-is on `unit_rate_library`; a real repoint is its own future-scoped redesign task, not executed as part of Phase 6.* |
| `/dashboard/qs/rate-libraries/page.tsx` | `rate_libraries` (inline query) | `dwl_v_current_prices` |
| `apps/web/lib/qs-service.ts` + `/dashboard/qs/cost-library/page.tsx` | `qs_cost_divisions/sections/items` | `dwl_v_work_item_rates` / `dwl_v_work_item_explosion` |
| `/dashboard/tenders/cost-estimation/page.tsx` (unit-rates-tab, price-list-tab) | `company_rate_library`, `tender_unit_rates`, `tender_price_list_items` | `dwl_v_work_item_rates` / `dwl_v_work_item_explosion` for new tenders; existing rows remain untouched (already-frozen per-tender data) |

**Phase 6 acceptance test:**

| # | Test | Pass Criteria |
|---|---|---|
| 1 | Migrate `unit_rate_library` row, then query `dwl_v_work_item_rates` | Matching work item appears with correct rate |
| 2 | Migrate a `qs_cost_items` row with a % split, then query `dwl_v_work_item_explosion` | Resource lines sum to the original `base_rate` within rounding tolerance; each line's `basis_note` states it was migrated from a %-split, not a real recipe |
| 3 | Generate missing migration files for `company_rate_library`/`_lines` and `tender_unit_rates`/`_lines`/`tender_price_list_items`, then migrate one `company_rate_library_lines` row | `dwl_work_item_resources` line appears with correct consumption and price |
| 4 | Repoint `tender_boq_items.unit_rate_id` for one of the 9 populated rows | Tender cost estimation UI still renders that line correctly reading `dwl_work_items` |
| 5 | Decide and act on `qs_boq_items` (repoint or deprecate per step 8) | Decision recorded here with QS Manager sign-off; if repointed, one row verified reading `dwl_work_items` |
| 6 | Attempt `INSERT`/`UPDATE` on a frozen legacy table as the application role | Rejected |

Sign-off: QS Manager ______ Developer/Admin ______ Date ______

### 12.2 Reconciliation with SOP-QS-Module.md (SOP-QS-001 R1)

`docs/02-Governance/01-SOP/22-SOP-Quantity-Surveying/SOP-QS-Module.md` is the currently approved operational SOP for the QS module and documents the 3-level Division→Section→Item flow (its §5, "SOP-QS-01: Cost Library Management") as the live process, plus an 18-item Gap Register (§13) including two Critical items: GAP-01 (RBAC not enforced on QS components) and GAP-02 (multi-step VO approval not role-wired).

Once this module (QS-SOP-002) goes live:

1. SOP-QS-Module.md §5 "SOP-QS-01: Cost Library Management" is superseded — replace its steps with a pointer to this document, or rewrite it to describe the `dwl_*` screens (Resource & price entry, Rate build-up, Assembly builder — see §13 Phase 7).
2. SOP-QS-Module.md §2 "Module Navigation" table's `Cost Library` row (`/dashboard/qs/cost-library`) is updated once that page is repointed per §12.1.
3. SOP-QS-Module.md §13 Gap Register gets a new row recording that the cost-library rebuild (this document) was sequenced **ahead of** GAP-01 and GAP-02 by QS Manager/Commercial Director decision, so that prioritization is visible and not read as an oversight.
4. GAP-01 (RBAC not enforced) is directly relevant to this module's own RLS design (§7 Step 1.1a) — the same access-control gap should not be reintroduced in `dwl_*` tables just because it was prioritized after them.

---

## 13. Phase 7 — Front-End Build Order (Week 6+)

Build screens in this order; each is useful alone:

1. **Resource & price entry** — resource form + append-only price entry + current-price list with expiry flags.
2. **Rate build-up screen** — the explosion view: recipe lines, live line costs, expired-price warnings; the screen you show the owner when asked "why is your concrete $88?"
3. **Assembly builder** — pick work items, set design ratios, see live assembly rate.
4. **Quick estimate screen** — pick model, enter GFA/storeys, view elemental estimate, apply markups, issue snapshot.
5. **Price dashboard** — expiring quotations, price trends, quotation-vs-purchase gaps.

---

## 14. Phase 8 — Population Plan and Maintenance Routine (Ongoing)

**Population targets (first 90 days):** 150–300 resources · top 60 work items (≥ 90% of a typical BOQ value) · 25 assemblies · 1 calibrated model per building type you tender.

**Routine calendar:**

| Frequency | Task | Owner |
|---|---|---|
| Weekly | Enter new supplier quotations received | Estimator |
| Monthly | Enter actual purchase prices from procurement | Procurement |
| Monthly | Review expiring-quotation dashboard | QS Manager |
| Per tender | Snapshot at submission; log win/loss rate context | Estimator |
| Per final account | Feedback loop: compare actual consumptions & prices vs recipes; update Level-2 consumptions and Level-4 factors; record in `basis_note` | Site QS + QS Manager |
| Quarterly | Library health check: items with no price update > 6 months; recipes never used; benchmark vs legacy `unit_rate_library` | QS Manager |

**The feedback loop is the module's compounding asset.** A library maintained through 3 project cycles prices tenders from evidence, not estimates.

---

## 15. End-to-End Acceptance Test (Go-Live Gate)

Run in one sitting; all must pass before the module is declared live:

1. Enter a new supplier quotation for cement (+$0.50/bag) → mortar-based work item rates rise → wall assembly rate rises → the draft school project estimate rises. Four levels, one entry, zero manual edits.
2. Issue snapshot "Tender Rev A" → repeat test 1 → snapshot unchanged, live estimate changed.
3. Open rate build-up for any concrete item → every line shows consumption, waste, current price, supplier, and basis note.
4. Expiring-quotation dashboard lists every quotation expiring within 14 days.
5. Legacy benchmark: `dwl_v_work_item_rates` vs `unit_rate_library.base_rate` for 10 common items — differences explained and documented.
6. RLS verified: users see only their tenant's data; price tables reject UPDATE/DELETE for non-admin roles.

Go-live sign-off: QS Manager ______ Date ______

---

## 16. Change Control

Changes to coding standards (D2), the unit dictionary (D3), or table schemas require a new version of this SOP approved by the QS Manager. Recipe and factor changes do not require SOP revision but must carry an updated `basis_note` and appear in the quarterly health check.

*End of SOP QS-SOP-001 v1.0*
