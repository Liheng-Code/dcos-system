# Item Master Mapping — Material List → inv_items

Source: `docs/03-Business-Modules/31-cwims/Material_List.md`
Target: `public.inv_items` (Supabase, tenant = MCC)

---

## 1. Type-of-Materials → Category Mapping

The `inv_items.category` column accepts only: `structural`, `civil`, `mep`, `finishes`, `consumables`, `others`.

The original "Type of Materials" is stored in `sub_category`.

| # | Material List Type | category | sub_category | Item Count |
|---|---|---|---|---|
| 1 | Cable Trunking | `mep` | Cable Trunking | 4 |
| 2 | Cleaning & Hygiene | `consumables` | Cleaning & Hygiene | 4 |
| 3 | Concrete Plastering Boom | `others` | Concrete Plastering Boom | 9 |
| 4 | Construction Inventory | `structural` | Construction Inventory | 45 |
| 5 | Construction Material | `civil` | Construction Material | 5 |
| 6 | Doka Beam | `structural` | Doka Beam | 22 |
| 7 | Door Hardware | `finishes` | Door Hardware | 7 |
| 8 | Electrical & Mechanical Equipment | `mep` | Electrical & Mechanical Equipment | 7 |
| 9 | Fastener | `structural` | Fastener | 5 |
| 10 | Fencing Materials | `structural` | Fencing Materials | 2 |
| 11 | Finishing Material | `finishes` | Finishing Material | 32 |
| 12 | Formwork System | `structural` | Formwork System | 55 |
| 13 | Foundation Materials | `civil` | Foundation Materials | 1 |
| 14 | Furniture | `others` | Furniture | 30 |
| 15 | Hand Tools | `consumables` | Hand Tools | 4 |
| 16 | Join Pin | `structural` | Join Pin | 1 |
| 17 | Lighting Equipment | `mep` | Lighting Equipment | 14 |
| 18 | Machinery | `others` | Machinery | 5 |
| 19 | Machinery Spare Parts | `others` | Machinery Spare Parts | 2 |
| 20 | Marine Medical Equipment | `others` | Medical Equipment | 2 |
| 21 | Measuring Tool | `consumables` | Measuring Tool | 3 |
| 22 | Meeting Table | `others` | Meeting Table | 1 |
| 23 | Mesh Material | `structural` | Mesh Material | 3 |
| 24 | MEP Equipment | `mep` | MEP Equipment | 11 |
| 25 | Metal Material | `structural` | Metal Material | 12 |
| 26 | Networking Equipment | `others` | Networking Equipment | 2 |
| 27 | Office Equipment | `others` | Office Equipment | 4 |
| 28 | Office Supplies | `others` | Office Supplies | 1 |
| 29 | Packaging Material | `others` | Packaging Material | 1 |
| 30 | Pipe & Plumbing Materials | `mep` | Pipe & Plumbing Materials | 6 |
| 31 | Plate Material | `structural` | Plate Material | 2 |
| 32 | Power Tools | `consumables` | Power Tools | 14 |
| 33 | Prop | `structural` | Prop | 1 |
| 34 | Roofing Material | `structural` | Roofing Material | 2 |
| 35 | Scaffolding | `structural` | Scaffolding | 28 |
| 36 | Sanitary | `mep` | Sanitary | 8 |
| 37 | Sealant & Adhesives | `finishes` | Sealant & Adhesives | 5 |
| 38 | Security Devices | `others` | Security Devices | 1 |
| 39 | Site Equipment | `others` | Site Equipment | 10 |
| 40 | Steel Tube | `structural` | Steel Tube | 14 |
| 41 | Tower Crane Equipment | `structural` | Tower Crane Equipment | 10 |
| 42 | Ventilation Equipment | `mep` | Ventilation Equipment | 4 |
| 43 | Water Storage Equipment | `mep` | Water Storage Equipment | 3 |
| 44 | Wire & Cable | `mep` | Wire & Cable | 22 |
| 45 | Wood Box | `others` | Wood Box | 1 |

**Total: 460 items**

---

## 2. Typo Corrections Applied During Seed

| Original (Material_List.md) | Corrected | Row(s) |
|---|---|---|
| Aluminun lader | Aluminum Ladder | 6 |
| Aluminumim Formwork | Aluminum Formwork | 9 |
| Electrical & Mechanical Equipmen | Electrical & Mechanical Equipment | 54 |
| Electrice cable | Electric Cable | 422, 423 |
| Electrice system | Electric System | 427 |
| Meetig table | Meeting Table | 435 |
| pip whit / pip white | pipe (white) | 401-415, 421-424 |
| Meltal | Metal | 64 |
| Expansion bolt Meltal | Expansion Bolt Metal | 64 |
| Aluminumim Formwork | Aluminum Formwork | 9 |
| Construction  Inventory (double space) | Construction Inventory | 346-406 |
| Formwork Systems | Formwork System | 202 |
| plank whit | plank (white) | 413 |
| S -Srew-on handrailpost | S-Screw-on Handrail Post | 346 |
| Swivel fastener | Swivel Fastener | 347 |
| Scraw-on | Screw-on | 106-107 |
| Spindle Strut | Spindle Strut | 111 |
| Plumbing Sqindle | Plumbing Spindle | 105 |
| Planking hinge | Planking Hinge | 348 |
| S-Element holder | S-Element Holder | 349 |
| Waling to bracker holder | Waling to Bracket Holder | 350 |

---

## 3. Size/Details Handling

The `Size/Details` column is appended to `name` with a ` — ` separator.

**Examples:**
- `Air Blow Motor` + `15cm` → `Air Blow Motor — 15cm`
- `Air Conditioner LG` + `2Hp` → `Air Conditioner LG — 2Hp`
- `Round Panel LED light 18W` + `18W/240V` → `Round Panel LED light 18W — 18W/240V`

**Exception:** If the Size/Details is already part of the Item Name (e.g. "Electric Cable 2.5mm" with size "2.5mm"), it is not duplicated.

---

## 4. Fields NOT Imported

| Material List Column | Reason | Where It Belongs |
|---|---|---|
| No. (row number) | Not a data field | — |
| Location (Indoor/Outdoor) | Store-level, not item-level | `inv_stores.location_description` |
| Storeroom Racking Number | Store location hierarchy | `inv_locations` (type: rack) |
| Shelf Number | Store location hierarchy | `inv_locations` (type: bin) |
| Project | Items are tenant-wide | `inv_stock` (store × project × item) |

---

## 5. inv_items Fields Populated

| Field | Source | Notes |
|---|---|---|
| `tenant_id` | Resolved from `companies.code = 'MCC'` | Same as other seeds |
| `item_code` | ID No. (e.g. TLY-001) | Unique per tenant |
| `name` | Item Name + Size/Details | Max 200 chars |
| `category` | Mapped from Type of Materials | See §1 |
| `sub_category` | Original Type of Materials | Max 100 chars |
| `unit_of_measure` | Unit column | Pc, Roll, Set, M, Box, Sheet, Bottle, Pair |
| `is_active` | — | Always `true` |
| `is_inspection_required` | — | Always `false` |
| `is_dg` | — | Always `false` |
| `is_batch_managed` | — | Always `false` |
| `min_stock_level` | — | NULL |
| `max_stock_level` | — | NULL |
| `reorder_quantity` | — | NULL |
| `lead_time_days` | — | NULL |
| `default_cost_code` | — | NULL |
| `barcode` | — | NULL |
| `shelf_life_days` | — | NULL |
