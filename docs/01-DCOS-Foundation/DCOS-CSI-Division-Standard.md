# DCOS CSI Division Standard

Document Code: DCOS-FND-CSI-001 | Version: R0 | Date: 2026-10-23 | Status: Draft, pending domain review (see sections 8 and 9)

## 1. Purpose

CSI divisions are the shared key that connects QS to Planning. A BOQ item, a material, a cost code and an activity that carry the same division (or section) code can be found from each other, with no manual mapping table in between.

Before 2026-10-23 DCOS held four unlinked division lists (QS material divisions, QS cost divisions, the Planning Activity Database's own 16 divisions, and free text on WBS template items). They disagreed: the Activity Database used the old 16-division list, where 15 is Mechanical and 16 is Electrical, but MasterFormat 2016 numbers those 21-28. One core library now replaces all of them.

Migration: `supabase/migrations/20261023122000_core_csi_divisions.sql`. Seed: `supabase/seeds/seed_csi_remap_activities.sql`. Service: `apps/web/lib/csi-divisions.ts`.

## 2. The standard

- **MasterFormat 2016** is the single standard. 35 divisions are seeded: 00-14, 21-23, 25-28, 31-35, 40-46 and 48 (the numbers MasterFormat 2016 does not use are absent).
- Division names follow MasterFormat 2016, for example 08 is "Openings" (not "Doors and Windows").
- Divisions are grouped by `group_name`:

| Group | Divisions |
|---|---|
| Procurement and Contracting Requirements | 00 |
| General Requirements | 01 |
| Facility Construction | 02-14 |
| Facility Services | 21, 22, 23, 25, 26, 27, 28 |
| Site and Infrastructure | 31, 32, 33, 34, 35 |
| Process Equipment | 40, 41, 42, 43, 44, 45, 46, 48 |

- Sections: 118 were copied from the QS material library (eight informal titles were replaced by the official title), plus level-2 and level-3 sections added for the Planning remap, the QS cost codes and the work-item backfill.

## 3. Code formats

| Level | Format | Example | Rule |
|---|---|---|---|
| Division | two digits | `03` | CHECK `^[0-9]{2}$` |
| Section, level 2 | `NN NN 00` | `03 30 00` | CHECK `^[0-9]{2} [0-9]{2} [0-9]{2}$`, ends in ` 00` |
| Section, level 3 | `NN NN NN` | `03 30 13` | Parent is the level-2 `NN NN 00` of the same group |

- The first two digits of a section code must equal its `division_code` (CHECK `csi_sections_division_chk`).
- The text code is the key everywhere. Foreign keys are readable and import files stay simple.
- `formatSectionCode()` accepts `033000`, `03-30-00` and `03.30.00` and returns `03 30 00`.
- **Visible activity code:** `D<division>-NNN`, for example `D26-001` is the first electrical activity. The number comes from `plan_act_division_counters`. A new version of an activity keeps the code of its first version. If an activity moves division, its code is regenerated for the new division.

## 4. Ownership and editing

- **Owner:** core. Any module may import `lib/csi-divisions.ts`.
- **Edited in:** Administration > Master Libraries > CSI Divisions (tree of division, level 2, level 3, grouped by `group_name`, with a usage count per row).
- **Edit right:** `can_manage_master_libraries()`, enforced by RLS on `csi_divisions` and `csi_sections`. Every authenticated user can read.
- **Delete** is blocked by foreign keys while anything references the row. Deactivate (`is_active = false`) instead.
- Each row records `updated_at` and `updated_by`. There is no audit-log trigger, because master libraries have no audit pattern.
- The library is global (no `tenant_id`), like the other reference libraries.

## 5. Where the library is referenced

| Table | Column | Key target | Notes |
|---|---|---|---|
| `dwl_material_categories` | `division_code` | `csi_divisions` | FK added and validated. 'Site - Anti-Mite / Termite' moved from 02 to 31 (31 31 16 Termite Control) |
| `qs_cost_divisions` | `csi_division_code` | `csi_divisions` | Backfilled from `code`. Trigger `qs_cost_division_csi_default` rejects a code that is not a CSI division |
| `qs_cost_sections` | `csi_section_code` | `csi_sections` | Backfilled: `NN NN` becomes `NN NN 00`; `01 10` becomes `01 50 00` |
| `dwl_work_items` | `csi_section_code`, `csi_division_code` | `csi_sections`, `csi_divisions` | Nullable. Trigger `dwl_work_item_csi_sync` sets the division from the section |
| `plan_act_masters` | `csi_division_code`, `csi_section_code` | `csi_divisions`, `csi_sections` | Trigger `plan_act_master_csi_sync` keeps them consistent; moving the division clears a section that no longer fits |
| `plan_act_division_counters` | `division_code` | `csi_divisions` | FK added `not valid`, validated by the seed |
| `qs_wbs_template_items` | `masterformat_code` | `csi_sections` | FK added `not valid`: the 7 filled values are reported, not rewritten (`03 00 00` is a division heading) |

### Consumer screens

- **Administration > Master Libraries > CSI Divisions:** the only place the library is edited.
- **QS > Cost & Rate Library > Material Divisions:** read-only view with an "Edit in Administration" link for library managers. The material list division filter reads the core list.
- **QS cost codes** (`lib/qs/qs-service.ts`): show the CSI division name.
- **QS > Work Items** (`dwl-work-items`): CSI section picker.
- **Planning > Activity Database:** division pane (2016 divisions with group headers, empty divisions behind "Show all"), Details tab division and section selects, import validation ("Unknown CSI division 15"), bank search and counts.

## 6. Old 16-division list to MasterFormat 2016 remap

All 233 activity masters were remapped by `seed_csi_remap_activities.sql` (generated from the reviewed `master_division_remap.csv`). Every visible code was regenerated, for example `D16-004` became `D26-001`; numbers run in activity-code order per division and versions of one activity share the number.

### Rules

- Old 01, 03 to 14 keep their numbers (08 is now named "Openings").
- **Old 02 Site Works splits:** demolition and existing works to 02; earthworks and piling to 31; external paving and landscape to 32; utilities and drainage to 33. Some activities fall to 03, 01, 05, 07, 10, 13, 26, 27, 34 (see counts).
- **Old 15 Mechanical:** fire protection to 21, plumbing to 22, HVAC to 23, controls to 25, fire alarm to 28.
- **Old 16 Electrical:** power and lighting to 26, communications to 27.
- Old 13 (Special Construction) holds mixed content that moved out by trade: 04, 09, 10, 12, 21, 22, 23, 26, 27, 32 as well as 13.
- A section is stored only when it exists and belongs to the new division; otherwise the activity keeps the division only.

### Counts (old division to new division, number of masters)

| Old | New (count) |
|---|---|
| 01 | 01 (1), 31 (1) |
| 02 | 31 (17), 33 (15), 32 (14), 03 (13), 26 (3), 34 (3), 07 (2), 01 (1), 05 (1), 10 (1), 13 (1), 27 (1), 43 (1) |
| 03 | 03 (46), 09 (2), 31 (1) |
| 04 | 04 (2) |
| 05 | 05 (7), 14 (1) |
| 06 | 06 (3), 05 (1) |
| 07 | 07 (14), 06 (1), 08 (1), 11 (1) |
| 08 | 08 (5), 07 (1) |
| 09 | 09 (16), 01 (1), 03 (1) |
| 13 | 13 (5), 22 (5), 10 (3), 26 (3), 12 (2), 04 (1), 09 (1), 21 (1), 23 (1), 27 (1), 32 (1) |
| 15 | 22 (6), 23 (6), 21 (5), 25 (1), 28 (1) |
| 16 | 26 (10), 27 (1) |

Totals by new division: 01 (3), 03 (60), 04 (3), 05 (9), 06 (4), 07 (17), 08 (6), 09 (19), 10 (4), 11 (1), 12 (2), 13 (6), 14 (1), 21 (6), 22 (11), 23 (7), 25 (1), 26 (16), 27 (3), 28 (1), 31 (19), 32 (15), 33 (15), 34 (3), 43 (1). Confidence: 154 high, 65 medium, 14 low.

## 7. Low-confidence items needing human review

These 14 masters were placed by best judgement. Planning and QS domain experts must confirm or change each one in the Activity Database (changing the division regenerates the visible code).

| Master code | Name | Current | Question |
|---|---|---|---|
| CIV-BRG-008 | Bearing Installation | 05, no section | Bridge bearings have no clean 2016 home: 03, 05 or 34 |
| CIV-BRG-009 | Girder / Segment Erection | 03 (03 41 00) | Precast (03) or steel (05) |
| CIV-BRG-013 | Expansion Joints | 07 (07 95 00) | Bridge expansion joints |
| CIV-BRG-014 | Parapets / Barriers on Structure | 03 (03 30 00) | Alternative: 34 71 13 Vehicle Barriers |
| CIV-BRG-016 | Bridge Load Test | 01 (01 45 00) | Testing administration (01) or structure |
| CIV-FAC-001 | Pump & Motor Installation | 43 (43 21 00) | Division 43 was not in the originally agreed list; alternatives 22 11 23 or 33 |
| CIV-PIP-008 | Road Reinstatement | 32 (32 01 00) | Pavement repair (32) or trench restoration (33) |
| EXT-GH-001 | Guardhouse / Gatehouse | 13 (13 34 00) | No obvious division |
| IND-FLR-001 | Sub-base Proof Rolling & Vapour Barrier | 31 (31 23 23) | Mixed with vapour barrier (07 26 00) |
| ARC-RF-007 | Roof Plant Plinths & Upstands | 07 (07 71 00) | Plinths are concrete (03) |
| INS-CIV-001 | Dome / Spire / Minaret Structure | 13 (13 34 00) | 03, 05 or 13 |
| INS-CIV-002 | Ornamental Ceilings, Cladding & Mouldings | 09 (09 51 00) | Ornamental ceilings and mouldings |
| MEP-FP-006 | Fire System Testing & Commissioning | 21 (21 08 00) | Spans 21 sprinkler and 28 alarm; or 01 91 00 |
| INS-ELV-001 | PA, AV & Security Devices | 27 (27 51 00) | PA/AV (27) and security devices (28) combined |

[TBD - human to confirm] Decision for each row above. The 65 medium-confidence rows are also listed in `master_division_remap.csv` with a note and should be sampled.

## 8. Work-item backfill status (`dwl_work_items`)

Of the 305 work items, the migration classified the following using high-confidence rules only:

- **85** have a section (and therefore a division).
- **1** has a division only (its section does not exist in the library).
- **219** remain unclassified and need classification from the QS work-items page or by import.

Rules applied, in order, only where the section is still empty:

- A. Code shaped `NN NN NN`: section is the first five characters plus ` 00`, if that section exists; otherwise the division only.
- B. Dotted code such as `09.51.010`: section `09 51 00` if it exists; otherwise the division only.
- C. Assembly rows (`ASM-`) by BOQ section: Tiling 09 30 00, Painting 09 90 00, Waterproofing 07 10 00, Ceiling 09 51 00, Drywall & Partitions 09 20 00, Screeding 03 53 00, Masonry & Plaster with `ASM-MAS` 04 20 00 and with `ASM-PLS` 09 24 00.

## 9. Section titles to verify

Official MasterFormat 2016 titles must be checked by a person with the published list:

- Three titles flagged specifically: **32 12 13** (Tack Coats), **34 71 13** (Vehicle Barriers), **07 41 00** (Roof Panels).
- About 130 further level-2 and level-3 sections in the migration (sections 2b and 2c) were written from memory. Check names and parent grouping, and correct them in Administration > Master Libraries > CSI Divisions.
- The eight informal QS titles replaced with official ones (01 11 00, 01 14 00, 01 29 00, 01 54 00, 03 15 00, 03 24 00, 07 30 00, 03 31 00) should also be confirmed.

## 10. Deprecation and cleanup plan

The migration is additive because other lanes share one local database. The old structures are frozen, not dropped:

- `dwl_material_divisions`, `dwl_material_division_sections` and `plan_act_divisions` reject writes from anyone but `postgres` ("CSI divisions are managed in Administration > Master Libraries > CSI Divisions").
- `plan_act_masters.division_id` is unused.
- The old uuid overloads of `plan_act_bank_search(q, p_division uuid)` and `plan_act_division_counts()` remain as thin wrappers. The new RPCs are `plan_act_csi_division_counts()` and `plan_act_bank_search(q text, p_division_code text)`.
- An old foreign key `dwl_material_categories` to `dwl_material_divisions` still exists. It limits material categories to the old 25 division codes, so a category cannot yet use a CSI division outside that set.

**Cleanup migration (later):** drop the FK above, then `dwl_material_divisions*`, `plan_act_divisions`, `plan_act_masters.division_id`, the uuid RPC overloads and the freeze trigger functions. Run it only when no lanes are active (`/lanes status`), after a backup (`scripts/db-backup.ps1`) and a dry run in a rolled-back transaction. Promotion to production is done by the user with `/dbpush`.

## 11. Open items

- [TBD - human to confirm] The 14 low-confidence remaps (section 7).
- [TBD - human to confirm] Section titles (section 9).
- [TBD - human to confirm] Whether the 219 unclassified work items are classified by hand, by import, or by a second rule pass.
- [TBD - human to confirm] Whether Division 43 (CIV-FAC-001) stays in the library as a seeded division or the pump activity moves to 22/33.

## 12. Related documents

- `docs/04-Business-Modules/06-Planning-Scheduling/23-Activity-Database-Plan.md`
- `.claude/skills/dcos-architecture/references/planning.md`, `qs.md`, `integration-map.md`
