# Build Prompt — Price List, Unit Rate Build-Up & Tender BOQ Linking

**Module:** Quantity Surveying → Tender & Estimate → Cost Estimation
**System:** DCOS (Digital Construction Operating System)
**Stack:** Next.js 14 + React + TypeScript + Tailwind, Supabase (PostgreSQL + RLS), existing Cost Estimation page at `/dashboard/tenders/cost-estimation?tender=<uuid>`
**Ref documents:** SOP-QS-001 R3 (SOP-QS-01 Cost Library, SOP-QS-02 Tender BOQ), DCOS Gap Analysis R1 (Tender Cost Estimation module, Unit Rate Library)

---

## 1. Role & Objective

You are a senior full-stack developer building the estimation pricing engine for a construction ERP. Implement three connected features inside the existing Cost Estimation page:

1. **Price List tab** — the tender's market-price database for raw resources (materials, labor, plant, subcontract rates).
2. **Unit Rates tab (build-up mode)** — rate analysis: each unit rate is composed of lines that reference Price List items, producing a computed **net rate**. Keep the existing flat mode as a fallback.
3. **Tender BOQ linking** — BOQ items select a Unit Rate by reference (`unit_rate_id`); rate and amount auto-fill and auto-recalculate through the chain.

The core principle, one line:

```
Price List (what we buy) → Unit Rate build-up (what one unit of work costs)
→ Tender BOQ (rate × measured quantity) → Direct/Subcon cost → Bid Summary
```

A price changed once in the Price List must recalculate every unit rate that consumes it, and every BOQ item linked to those rates, and the Bid Summary totals — automatically, while the bid revision is in `draft`.

---

## 2. Database Schema (Supabase / PostgreSQL)

All tables carry `tenant_id uuid not null` with RLS policies (`tenant_id = auth.jwt() ->> 'tenant_id'`), `created_at`, `updated_at`, `created_by`. Foreign keys are `on delete restrict` unless stated.

### 2.1 `price_list_items`

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| tenant_id | uuid | RLS |
| tender_id | uuid FK → tenders | price lists are per-tender |
| code | text | unique per tender, e.g. `PL-CEM-01` |
| description | text | e.g. "Cement, bag 50kg" |
| category | text | enum: `material` \| `labor` \| `plant` \| `subcon` |
| unit | text | bag, m³, kg, hour, day, each |
| unit_price | numeric(14,4) | must be > 0 |
| currency | text | default from tender |
| supplier_name | text nullable | quote source |
| quote_ref | text nullable | supplier quotation number |
| quote_date | date nullable | |
| valid_until | date nullable | show amber badge when expired |
| is_active | boolean default true | soft deactivate; never hard delete when referenced |
| notes | text nullable | |

Constraints: `unique (tender_id, code)`; check `unit_price > 0`.

### 2.2 `unit_rates`

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| tenant_id, tender_id | uuid | as above |
| code | text | unique per tender, e.g. `UR-CON-001` |
| description | text | |
| trade | text | Concrete, Rebar, Finishes... |
| unit | text | m³, m², kg, each |
| mode | text | enum: `flat` \| `buildup` |
| base_rate | numeric(14,4) nullable | used only when mode = flat |
| wastage_pct | numeric(6,3) default 0 | flat mode only |
| productivity_factor | numeric(6,3) default 1 | applies to labor+plant subtotal in buildup mode; whole rate in flat mode; must be > 0 |
| net_rate | numeric(14,4) | **computed and stored** (see §3); recomputed by trigger or service layer |
| library_rate_id | uuid nullable | future link to company rate library |
| is_active | boolean default true | |
| notes | text nullable | |

### 2.3 `unit_rate_lines` (build-up composition)

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid | |
| unit_rate_id | uuid FK → unit_rates | on delete cascade |
| category | text | enum: `material` \| `labor` \| `plant` \| `subcon` |
| price_list_item_id | uuid FK → price_list_items | on delete **restrict** |
| qty_per_unit | numeric(14,6) | > 0; consumption per one unit of the rate |
| wastage_pct | numeric(6,3) default 0 | editable only when category = material; force 0 otherwise |
| line_total | numeric(14,4) | computed, stored |
| sort_order | int | |

### 2.4 `tender_boq_items` (modify existing table)

Add columns:

| Column | Type | Rules |
|---|---|---|
| unit_rate_id | uuid nullable FK → unit_rates | the link; null = manually rated item |
| rate | numeric(14,4) | auto-filled from unit_rates.net_rate when linked; typed when manual |
| is_manual_rate | boolean default false | true when user overrides a linked rate or types freely |
| sourcing | text | enum: `self` \| `subcon` — routes to Direct vs Subcon in Bid Summary |

Rule: `amount = quantity × rate` (generated column or service-computed).

### 2.5 Snapshot tables (bid revision freeze)

On Bid Summary revision finalize (existing `bid_revisions` flow), copy current state into:

- `snap_price_list_items`, `snap_unit_rates`, `snap_unit_rate_lines`, `snap_tender_boq_items`
- Each carries `bid_revision_id uuid FK` + all source columns. Insert-only, no update/delete policies (append-only, mirroring the audit principle in SOP-QS R3).

---

## 3. Calculation Rules (authoritative formulas)

### 3.1 Build-up mode

```
material line:      line_total = qty_per_unit × unit_price × (1 + wastage_pct/100)
labor/plant/subcon: line_total = qty_per_unit × unit_price          (no wastage)

material_subtotal  = Σ material line_totals
labor_plant_sub    = Σ (labor + plant + subcon line_totals) ÷ productivity_factor

net_rate = material_subtotal + labor_plant_sub
```

### 3.2 Flat mode (legacy fallback)

```
net_rate = base_rate × (1 + wastage_pct/100) ÷ productivity_factor
```

### 3.3 BOQ item

```
rate   = unit_rates.net_rate   (when unit_rate_id set and is_manual_rate = false)
amount = quantity × rate
```

### 3.4 Roll-up to Bid Summary

```
Direct = Σ amount where sourcing = 'self'
Subcon = Σ amount where sourcing = 'subcon'
```

(Existing Bid Summary fields — Prelims, Overhead %, Profit %, Contingency, Risk, VAT — unchanged; they consume Direct and Subcon.)

### 3.5 Rounding

Store 4 decimals; display 2. Round only at display (`Intl.NumberFormat`); never round intermediates.

---

## 4. Recalculation Chain (critical behavior)

Trigger: `price_list_items.unit_price` updated (bid revision in `draft`).

```
1. UPDATE price_list_items SET unit_price = :new
2. Recompute line_total for every unit_rate_lines row referencing that item
3. Recompute net_rate for every affected unit_rates row
4. Recompute rate + amount for every tender_boq_items row where
   unit_rate_id IN (affected) AND is_manual_rate = false
5. Bid Summary Direct/Subcon totals recompute (view or query-time aggregation)
```

Implement steps 2–4 as a PostgreSQL function `recalc_from_price_item(price_item_id uuid)` called from the API after price update (or via trigger). Must be transactional — all or nothing.

UI feedback: after a price edit, show a toast "3 unit rates and 12 BOQ items recalculated" and a subtle "updated" dot on affected rates for the session.

**Freeze rule:** when the active bid revision status = `final`/`submitted`, block edits to price_list_items, unit_rates, unit_rate_lines, and tender_boq_items for that tender (API-level guard + disabled UI). Editing requires creating a new draft revision first (existing revision flow).

---

## 5. UI Specifications

### 5.1 Price List tab

- Table: Code, Description, Category (badge), Unit, Unit Price, Supplier, Quote Date, Valid Until, Active toggle, row actions.
- Inline add row + edit; category filter chips (All / Material / Labor / Plant / Subcon); search by code/description.
- Amber badge on rows where `valid_until < today`.
- Delete button only when the item has zero `unit_rate_lines` references; otherwise show "In use by N rates — deactivate instead" tooltip and offer Deactivate.
- "Usage" expander per row: list of unit rates consuming this item.

### 5.2 Unit Rates tab

**List view:** Code, Description, Trade, Unit, Mode badge (flat/build-up), Net Rate (bold, computed), Active, actions. Header shows count. "Add rate" opens the editor.

**Editor — header:** Code*, Description*, Trade, Unit* (select), Mode toggle (Flat / Build-up), Productivity Factor, Notes.

**Editor — flat mode:** Base Rate*, Wastage % → live computed Net Rate displayed read-only (this fixes the current form's missing effective-rate display).

**Editor — build-up mode:** composition lines grid:

| Column | Behavior |
|---|---|
| Category | select: material/labor/plant/subcon |
| Resource | searchable select over active price_list_items (show code + description + unit + price); category pre-filters the list |
| Qty per unit | numeric input |
| Price | read-only, from price list; link icon; tooltip "Edit in Price List" |
| Wastage % | input, enabled only for material lines |
| Line total | read-only, live |
| Remove | trash icon |

Footer: Productivity factor input (labels "applies to labor and plant"), summary panel — Material (incl. wastage) / Labor÷prod / Plant÷prod / **Net unit rate** — all live-computed client-side, persisted server-side on save.

Validation on save: ≥1 line in buildup mode; qty > 0; unit selected; code unique.

### 5.3 Tender BOQ tab (modify existing)

- Rate cell becomes a **rate picker**: searchable dropdown of active unit_rates (code + description + unit + net_rate) plus a "Manual rate" option.
- On select: unit compatibility check — `unit_rate.unit` must equal `boq_item.unit`; if mismatch, block with message "Rate is per m³, item is measured in m² — select a matching rate or change the item unit."
- Rate auto-fills, read-only while linked; Amount = qty × rate live.
- Manual override: an "unlink" action sets `is_manual_rate = true`, makes rate editable, and shows an amber `manual` badge on the row. Manual rows are excluded from recalculation and listed in a "Manual rates" filter for review.
- Sourcing select per item (`self` / `subcon`) driving the Direct/Subcon split.

---

## 6. API Endpoints (Next.js route handlers or Supabase RPC)

```
GET/POST/PATCH/DELETE  /api/tenders/:tenderId/price-list
GET/POST/PATCH/DELETE  /api/tenders/:tenderId/unit-rates
POST                   /api/tenders/:tenderId/unit-rates/:id/lines   (batch upsert lines)
POST                   /api/tenders/:tenderId/price-list/:id/recalc  (returns affected counts)
PATCH                  /api/tenders/:tenderId/boq-items/:id/link-rate {unit_rate_id | manual_rate}
```

Guards on every mutation: tenant from JWT (never from body); reject when active bid revision is final; write audit_log entries (module_code `QS_ESTIMATE`, actions CREATE/UPDATE/DELETE/RECALC) per the existing audit engine.

---

## 7. Mock Data Templates per Tab — ARC / STR / MEP

Seed these templates so every tab renders populated on first load. They cover the three disciplines end-to-end and are internally consistent: the Price List feeds the Unit Rates, the Unit Rates feed the Tender BOQ, and the BOQ totals reconcile to the Bid Summary figures at the bottom. All computed values here are the expected system outputs — use them to verify the engine.

### 7.1 Price List tab — seed template

Note the shared resources: cement (PL-CEM-01) and sand (PL-SND-01) are consumed by STR concrete **and** ARC blockwork mortar **and** ARC plaster. This is deliberate — it demonstrates one price change rippling across disciplines (test T10).

**STR — Structural resources**

| Code | Description | Category | Unit | Unit Price | Supplier |
|---|---|---|---|---|---|
| PL-CEM-01 | Cement, bag 50kg | material | bag | 4.20 | KH Cement Co |
| PL-SND-01 | Sand, river washed | material | m³ | 12.00 | Mekong Aggregates |
| PL-AGG-01 | Aggregate 20mm | material | m³ | 14.00 | Mekong Aggregates |
| PL-REB-01 | Rebar HD deformed | material | kg | 0.72 | Steel Trading Ltd |
| PL-BWR-01 | Binding wire | material | kg | 1.10 | Steel Trading Ltd |
| PL-PLY-01 | Plywood 18mm formply | material | sheet | 18.00 | Timber House |
| PL-TMB-01 | Timber support 50×100 | material | m | 0.60 | Timber House |
| PL-NLS-01 | Nails and form ties | material | kg | 2.20 | Hardware Mart |
| PL-LAB-03 | Concrete crew | labor | hour | 22.00 | — |
| PL-LAB-04 | Steel fixer crew | labor | hour | 18.00 | — |
| PL-LAB-05 | Carpenter crew | labor | hour | 16.00 | — |
| PL-PLT-02 | Mixer 350L | plant | hour | 15.00 | — |

**ARC — Architectural resources**

| Code | Description | Category | Unit | Unit Price | Supplier |
|---|---|---|---|---|---|
| PL-BLK-01 | Concrete block 150mm | material | pc | 0.55 | Block Factory PP |
| PL-TIL-01 | Porcelain tile 600×600 | material | m² | 9.50 | Ceramic World |
| PL-ADH-01 | Tile adhesive, bag 20kg | material | bag | 6.80 | Ceramic World |
| PL-GRT-01 | Tile grout | material | kg | 3.50 | Ceramic World |
| PL-LAB-06 | Mason crew | labor | hour | 14.00 | — |
| PL-LAB-07 | Plasterer crew | labor | hour | 14.00 | — |
| PL-LAB-08 | Tiler crew | labor | hour | 16.00 | — |

**MEP — Mechanical / Electrical / Plumbing resources**

| Code | Description | Category | Unit | Unit Price | Supplier |
|---|---|---|---|---|---|
| PL-CND-01 | PVC conduit 20mm | material | m | 0.45 | Elec Supply KH |
| PL-CBL-01 | Cable 2.5mm² Cu | material | m | 0.38 | Elec Supply KH |
| PL-BOX-01 | Back box, galvanised | material | ea | 0.55 | Elec Supply KH |
| PL-SWT-01 | Switch, 1-gang | material | ea | 2.80 | Elec Supply KH |
| PL-PPR-01 | PPR pipe 25mm PN20 | material | m | 1.20 | Pipe Center |
| PL-PFT-01 | PPR fittings, average | material | ea | 0.85 | Pipe Center |
| PL-TRY-01 | Cable tray 200mm galv. | material | m | 4.50 | Elec Supply KH |
| PL-TRS-01 | Tray support set | material | set | 1.80 | Elec Supply KH |
| PL-LAB-09 | Electrician | labor | hour | 15.00 | — |
| PL-LAB-10 | Plumber | labor | hour | 14.00 | — |

### 7.2 Unit Rates tab — build-up seed template

Nine rates, three per discipline. Composition lines reference Price List codes; expected computed values shown in the summary column (display 2dp; store 4dp).

**STR rates**

| Rate | Line composition (category · resource · qty · wastage%) | Prod. | Expected net rate |
|---|---|---|---|
| UR-CON-001 — C25/30 concrete in slab, m³ | mat · PL-CEM-01 · 7.0 · 5% \| mat · PL-SND-01 · 0.45 · 5% \| mat · PL-AGG-01 · 0.90 · 5% \| lab · PL-LAB-03 · 0.80 \| plant · PL-PLT-02 · 0.30 | 1.00 | **71.87** (mat 49.77 + lab 17.60 + plant 4.50) |
| UR-REB-001 — Rebar cut, bend, fix, kg | mat · PL-REB-01 · 1.0 · 3% \| mat · PL-BWR-01 · 0.015 · 3% \| lab · PL-LAB-04 · 0.012 | 1.00 | **0.97** |
| UR-FWK-001 — Formwork to soffit, 4 reuses, m² | mat · PL-PLY-01 · 0.09 · 10% \| mat · PL-TMB-01 · 2.5 · 5% \| mat · PL-NLS-01 · 0.10 · 5% \| lab · PL-LAB-05 · 0.35 | 0.90 | **9.81** |

**ARC rates**

| Rate | Line composition | Prod. | Expected net rate |
|---|---|---|---|
| UR-BLK-001 — Blockwork 150mm in mortar, m² | mat · PL-BLK-01 · 12.5 · 5% \| mat · PL-CEM-01 · 0.20 · 5% \| mat · PL-SND-01 · 0.025 · 5% \| lab · PL-LAB-06 · 0.40 | 1.00 | **14.02** |
| UR-PLA-001 — Cement plaster 15mm internal, m² | mat · PL-CEM-01 · 0.11 · 8% \| mat · PL-SND-01 · 0.012 · 8% \| lab · PL-LAB-07 · 0.28 | 0.95 | **4.78** |
| UR-TIL-001 — Porcelain floor tile 600×600, m² | mat · PL-TIL-01 · 1.0 · 7% \| mat · PL-ADH-01 · 0.22 · 5% \| mat · PL-GRT-01 · 0.05 · 5% \| lab · PL-LAB-08 · 0.50 | 0.85 | **21.33** |

**MEP rates**

| Rate | Line composition | Prod. | Expected net rate |
|---|---|---|---|
| UR-MEP-001 — Lighting point complete, ea | mat · PL-CND-01 · 8.0 · 5% \| mat · PL-CBL-01 · 18.0 · 3% \| mat · PL-BOX-01 · 1.0 · 2% \| mat · PL-SWT-01 · 1.0 · 2% \| lab · PL-LAB-09 · 0.90 | 1.00 | **27.74** |
| UR-MEP-002 — PPR pipe 25mm installed, m | mat · PL-PPR-01 · 1.0 · 5% \| mat · PL-PFT-01 · 0.6 · 5% \| lab · PL-LAB-10 · 0.15 | 1.00 | **3.90** |
| UR-MEP-003 — Cable tray 200mm installed, m | mat · PL-TRY-01 · 1.0 · 5% \| mat · PL-TRS-01 · 0.7 · 5% \| lab · PL-LAB-09 · 0.30 | 1.00 | **10.55** |

### 7.3 Tender BOQ tab — seed template

Three sections mirroring the disciplines. All items linked by `unit_rate_id` except the last, which demonstrates the manual-rate/subcon path (rate from a sub quote, amber `manual` badge).

| Section | Item description | Unit | Qty | Linked rate | Rate | Amount | Sourcing |
|---|---|---|---|---|---|---|---|
| STR — Structure | Concrete C25/30 to slabs, L1–L10 | m³ | 500 | UR-CON-001 | 71.87 | 35,935.00 | self |
| STR — Structure | Rebar to slabs and beams | kg | 45,000 | UR-REB-001 | 0.97 | 43,650.00 | self |
| STR — Structure | Formwork to slab soffits | m² | 3,200 | UR-FWK-001 | 9.81 | 31,392.00 | self |
| ARC — Architecture | Blockwork 150mm internal walls | m² | 2,800 | UR-BLK-001 | 14.02 | 39,256.00 | self |
| ARC — Architecture | Cement plaster to internal walls | m² | 5,600 | UR-PLA-001 | 4.78 | 26,768.00 | self |
| ARC — Architecture | Porcelain floor tiling | m² | 1,900 | UR-TIL-001 | 21.33 | 40,527.00 | self |
| MEP — Services | Lighting points complete | ea | 850 | UR-MEP-001 | 27.74 | 23,579.00 | self |
| MEP — Services | PPR pipe 25mm, cold water | m | 2,400 | UR-MEP-002 | 3.90 | 9,360.00 | self |
| MEP — Services | Cable tray 200mm | m | 1,100 | UR-MEP-003 | 10.55 | 11,605.00 | self |
| MEP — Services | Fire fighting installation (sub quote FS-Q2) | lot | 1 | — manual | 18,500.00 | 18,500.00 | subcon |

### 7.4 Expected roll-up to Bid Summary

With the seed above, the Bid Summary revision must show:

```
Direct  (Σ self items)   = 262,072.00
Subcon  (Σ subcon items) =  18,500.00
```

(Prelims, Overhead %, Profit %, Contingency, Risk, VAT continue from the existing Bid Summary logic on top of these.)

## 8. Acceptance Tests (must pass exactly)

Seed the §7 mock templates, then verify:

**T1 — Build-up computation.** UR-CON-001 (m³, productivity 1.00) with lines: cement 7.0 @5% wastage, sand 0.45 @5%, aggregate 0.90 @5%, labor 0.80, plant 0.30 → material 49.77, labor 17.60, plant 4.50, **net_rate = 71.87**.

**T2 — BOQ linking.** BOQ item "Concrete slab L2", unit m³, qty 500, link UR-CON-001 → rate 71.87, **amount 35,935.00**; appears in Direct when sourcing = self.

**T3 — Recalculation chain.** Update PL-CEM-01 to $4.60 → UR-CON-001 material = 7.0×4.60×1.05 + 5.67 + 13.23 = 52.71; net_rate = **74.81**; BOQ amount = **37,405.00**; response reports affected counts.

**T4 — Flat mode.** Rate m², base 14.50, wastage 7%, productivity 0.85 → net_rate = **18.25**.

**T5 — Unit mismatch.** Linking a per-m³ rate to a per-m² BOQ item is rejected with a clear message.

**T6 — Referential lock.** Deleting PL-CEM-01 while referenced fails; deactivate succeeds; deactivated items excluded from resource picker but existing lines keep working.

**T7 — Freeze.** With revision final: price update returns 403/blocked; after "+ New Revision" (draft), the same update succeeds and recalculates.

**T8 — Manual override.** Unlink a BOQ row, set rate 80.00 → is_manual_rate = true; a later price change does not touch this row; amber badge visible.

**T9 — Snapshot.** Finalize revision → snap_* tables contain the full current state keyed by bid_revision_id; further edits to working tables do not alter the snapshot.

**T10 — Cross-discipline ripple.** Update PL-CEM-01 from 4.20 to 4.60 → exactly **3 unit rates across 2 disciplines** recompute: UR-CON-001 (STR) → **74.81**, UR-BLK-001 (ARC) → **14.10**, UR-PLA-001 (ARC) → **4.83**; their linked BOQ amounts update (concrete amount → **37,405.00**); the manual fire-fighting row and all MEP rates remain untouched; the recalc response reports 3 rates / 5 BOQ items affected.

---

## 9. Out of Scope (do not build now)

- Company-wide unit rate library and cross-tender copy ("save to library / load from library") — schema hook `library_rate_id` only.
- Margin / sell-rate application (post-award concern, SOP-QS-05A).
- Sub Quotes → subcontracted BOQ rate feed (next iteration).
- Import from Excel.

## 10. Definition of Done

All acceptance tests T1–T10 pass; the §7 mock templates are provided as a seed script (`seed_estimation_mock.sql` or equivalent) so all three tabs render populated with ARC/STR/MEP data on a fresh tender; the seeded Bid Summary shows Direct 262,072.00 / Subcon 18,500.00; RLS verified with a cross-tenant test; audit entries written for every mutation; recalculation completes < 1s for 100 rates / 1,000 BOQ items; UI matches the DCOS enterprise style (clean tables, inline computed values, badges for manual/expired states); no console errors; migration SQL is idempotent and reversible.
