# Company Rate Library — Implementation Plan

## Objective
Build a global Company Rate Library so users create rates once and reuse them across tenders. Each tender gets an independent copy — edits after import don't affect the library.

## Existing State
- `unit_rate_library` — old flat-rate table (no build-up lines), not compatible with new pricing engine
- `library_rate_id` column on `tender_unit_rates` — schema hook, always `null`, no FK
- QS cost library (`qs_cost_items`) — different purpose (measurement-side, not tender-side)

## Approach
New dedicated tables: `company_rate_library` + `company_rate_library_lines`, mirroring the tender unit rate structure for 1:1 copy-in/copy-out.

---

## Phase 1: Database Migration

### New table `company_rate_library`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid | RLS |
| code | text | unique per tenant, e.g. `LIB-CON-001` |
| description | text | |
| trade | text nullable | Concrete, Rebar, Tiling... |
| unit | text | m³, m², kg, ea... |
| mode | text | `flat` or `buildup` |
| base_rate | numeric(14,4) nullable | flat mode only |
| wastage_pct | numeric(6,3) default 0 | flat mode |
| productivity_factor | numeric(6,3) default 1 | |
| net_rate | numeric(14,4) | computed, stored |
| category_tags | text[] | e.g. `{structural,concrete}` for search |
| region | text nullable | price region |
| source_project_id | uuid nullable FK → projects | which project it came from |
| is_active | boolean default true | |
| notes | text nullable | |
| created_by | uuid | |
| created_at/updated_at | timestamptz | |

### New table `company_rate_library_lines`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid | |
| library_rate_id | uuid FK → company_rate_library | cascade delete |
| category | text | material/labor/plant/subcon |
| price_list_item_code | text nullable | reference code |
| price_list_item_desc | text | description (denormalized) |
| unit_price | numeric(14,4) | snapshot of price at save time |
| qty_per_unit | numeric(14,6) | |
| wastage_pct | numeric(6,3) default 0 | |
| line_total | numeric(14,4) | computed |
| sort_order | int | |

### FK on tender_unit_rates.library_rate_id
```sql
ALTER TABLE tender_unit_rates 
  ADD CONSTRAINT fk_tur_library 
  FOREIGN KEY (library_rate_id) REFERENCES company_rate_library(id) ON DELETE SET NULL;
```

### RLS
Authenticated users can CRUD; tenant-scoped.

### Seed
Copy 9 existing tender build-up rates into library as starter data.

---

## Phase 2: Service Layer

New file `lib/company-rate-library.ts`:

| Function | Purpose |
|---|---|
| getLibraryRates() | List all library rates (with filters: trade, category, search) |
| getLibraryRate(id) | Get single rate with lines |
| createLibraryRate(rate, lines) | Create rate + lines |
| updateLibraryRate(id, rate, lines) | Update rate + replace lines |
| deleteLibraryRate(id) | Delete rate + lines |
| importFromLibrary(libraryRateId, tenderId) | Copy library rate → tender unit rate + lines, set library_rate_id |
| saveToLibrary(tenderRateId) | Copy tender rate + lines → new library rate |

---

## Phase 3: Library Management UI

New page: `/dashboard/qs/rate-library`

| Feature | Detail |
|---|---|
| Table | Code, Description, Trade, Unit, Mode badge, Net Rate, Active, actions |
| Search/filter | By trade, mode, code/description |
| Create/edit form | Same as unit rate editor (header + flat/buildup + lines) |
| Usage counter | Show how many tenders reference each library rate |

---

## Phase 4: Integration into Tender Unit Rates Tab

Modify `unit-rates-tab.tsx`:

| Action | Detail |
|---|---|
| "Import from Library" button | Opens picker dialog showing library rates; click one to import |
| "Save to Library" icon | On each rate row; calls saveToLibrary(tenderRateId) |
| Library link badge | When library_rate_id is set, show "from library" badge |
| Override detection | If net_rate differs from library's, show amber "modified" indicator |

---

## Phase 5: Verification

- `tsc --noEmit` — zero new errors
- Seed data loads correctly
- Import from library creates tender rate with library_rate_id set
- Save to library creates library rate from tender rate
- Editing tender rate after import doesn't affect library

---

## File Summary

| File | Action |
|---|---|
| `supabase/migrations/20260714000002_company_rate_library.sql` | Create |
| `supabase/seeds/seed_rate_library.sql` | Create |
| `lib/company-rate-library.ts` | Create |
| `app/dashboard/qs/rate-library/page.tsx` | Create |
| `components/qs/rate-library-page.tsx` | Create |
| `components/tenders/cost-estimation/unit-rates-tab.tsx` | Modify |
| `lib/tender-cost-service.ts` | Modify |
| `components/dashboard/sidebar.tsx` | Modify |
