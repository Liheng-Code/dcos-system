# 23 — Activity Database Plan (Planning › Activity Library)

> Status: approved 2026-10-23. Reference screenshots: `Activity Database/01.png`–`08.png`.

## Context
The screenshots in `docs/04-Business-Modules/06-Planning-Scheduling/Activity Database/` (01–08) show a reference "Activity Bank". It has:
- a 3-pane browser: CSI Divisions → Master Activities → BOQ items, with search across activities and BOQs;
- library tabs: Master Activity, BOQ, Method Statement, Material, Coordination, Shop Drawing, Resource, T&C;
- an activity dialog with three tabs:
  - **Details:** image, description, visible ID `D04-001`, trade, type, division, min/max duration %, linked chips;
  - **BOQs:** a grid of BOQ items with manpower (M) and equipment (E) hrs/unit, duration (days) and %;
  - **Predecessors/Successors:** list and network view with FS/SS/FF/SF and lag;
- import, add, duplicate, delete and prev/next.

DCOS already has most of the engine behind this: `plan_act_masters`, the Domain/Category/Family tree, `plan_act_logic_rules` (master-level FS/SS/FF/SF + lag), norms, and the cost library `dwl_work_items` + `dwl_work_item_resources`. What's missing is the **browse experience and a few data links**.

**Decisions made:**
- Extend the existing Activity Library (one source of truth; Generate and QS Bridge keep working).
- Add CSI 16 divisions alongside the existing tree.
- BOQ items = `dwl_work_items`.
- First release covers the **Activity + BOQ + Resource** tabs only.

## Gap summary (what this plan builds)
| Feature | Today | Build |
|---|---|---|
| CSI 16 divisions | Missing (materials use the 50-division list) | New `plan_act_divisions` + `division_id` on masters |
| Visible ID, trade, type, min/max %, image | Partial (`code`, `discipline`, `work_type`) / missing | New columns on `plan_act_masters` |
| Activity ↔ BOQ item with M/E hrs/unit | Missing (norm links only one `dwl_work_item_id`) | New link table; M/E values come from `dwl_work_item_resources` |
| Master logic list | Exists (`LogicEditor`, `plan_act_logic_rules`) | Reuse |
| Network diagram | Missing, no graph library | Custom SVG, no new dependency |
| 3-pane browser + BOQ search | Missing (2-pane tree + table) | New page |
| Excel import | Missing (`xlsx` already installed) | New import |
| Duplicate / delete / prev-next | Partial / missing | New dialog actions |

## 1. Database (`database-engineer`, one additive migration)
File: `supabase/migrations/<YYYYMMDDHHMMSS>_planning_activity_database.sql`. Additive only, guarded (`if not exists`).

- **`plan_act_divisions`** (`id`, `code` '01'..'16', `name`, `sort_order`).
  - Seed the 16 CSI divisions (01 General Requirements … 16 Electrical).
  - RLS: the library pattern (authenticated read; write needs `can_manage_master_libraries()`).
- **`plan_act_masters` add columns:**
  - `division_id` → `plan_act_divisions`
  - `visible_code` (unique, e.g. `D04-001`). Assigned by a trigger as the next number per division when null.
  - `trade`
  - `activity_type` (check: construction, procurement, design, submittal, testing, milestone)
  - `min_duration_pct`, `max_duration_pct` (check `0 ≤ min ≤ max ≤ 100`)
  - `image_path` (new storage bucket `activity-images`, same read/write policy as the library)
- **`plan_act_master_work_items`** (`id`, `master_id`, `work_item_id` → `dwl_work_items`, `duration_days_per_unit`, `share_pct` default 100, `sort_order`, unique (`master_id`, `work_item_id`)).
  - Library RLS.
  - It follows the master's frozen guard: links can only be edited while the master is a draft, like the other `plan_act_*` child tables.
- **Guard trigger:** check `trg_plan_act_master_guard`. The new catalogue columns (`division_id`, `visible_code`, `trade`, `image_path`) should be editable on approved masters, so add them to the guard's allowed list rather than forcing a new version. Duration % and type stay versioned.
- **Backfill (seed file `supabase/seeds/seed_activity_database.sql`):**
  - Map the existing Domain/Category → division (e.g. STR-RC → 03 Concrete, MEP mechanical → 15, electrical → 16).
  - Map `discipline` → `trade` and `work_type` → `activity_type`.
  - Create `plan_act_master_work_items` from each norm that already has `dwl_work_item_id`.
  - Run it with the guard escape the migrations already use.
- **Search RPC `plan_act_bank_search(q text, division uuid)`:** returns matching masters and work items with counts. This avoids pulling 11k work items to the client.
- Dry-run inside begin/rollback, then apply, as in CLAUDE.md "Migrations".

## 2. Services (`backend-engineer`, `lib/planning/activity-library/`)
- **`activity-database-service.ts`** (I/O):
  - Reads: division counts, masters by division, work items by division or master, the search RPC.
  - Link CRUD on `plan_act_master_work_items`.
  - `duplicateMaster` (new draft and new `visible_code`; copies links, logic and requirements).
  - `deleteMaster`: hard delete only for a draft that no template, kit or generation run uses. Otherwise call the existing retire action from `library-service.ts`.
  - Image upload.
  - Use the existing `in-chunks.ts` helper for every `.in()` call (PostgREST URL limit).
- **M/E hrs/unit:** read from `dwl_work_item_resources` joined to `dwl_resources` (category `labor` / `equipment`). Planning already reads `dwl_*` directly (`lib/planning/productivity-service.ts`), so this is the same pattern.
  - **Writes** to `dwl_work_item_resources` (the "+ Manpower / + Equipment" columns) change shared cost-library data. Route them through the cost library's service and raise it with the main window as a cross-module/core request if that service is QS-owned. Until then the grid is read-only for M/E and links to the cost library editor.
- **`activity-database-import.ts`** (pure parse and validate) + `import-service.ts` (I/O):
  - The workbook has two sheets: *Activities* (division, visible code, name, unit, trade, type, min %, max %, description) and *BOQ links* (activity code, work item code, days/unit, %).
  - New rows land as **draft**. Rows are upserted by `visible_code`.
  - Shows a preview report before commit. Uses the existing `xlsx` dependency.
- **`logic-network-layout.ts`** (pure): builds 3 columns (predecessors | activity | successors) from `plan_act_logic_rules`. Returns node positions and edges with type and lag, colour-keyed FS/SS/FF/SF.
- **Unit tests** in `lib/planning/activity-library/__tests__/`: import validation (bad division, duplicate code, min > max), visible-code formatting, network layout.

## 3. UI (`frontend-engineer`, `components/planning/activity-database/`)
- **Route:** `app/dashboard/planning/activity-library/database/page.tsx`.
- **Nav:** add an "Activity Database" item under Activity Library in `lib/planning/planning-nav.ts`. Its status is `development`, so it stays hidden until it is switched on in Module Settings.
- **`activity-database-view.tsx`:** header + tabs **Master Activity | BOQ | Resource**. The other tabs (Method Statement, Material, Coordination, Shop Drawing, T&C) are left for phase 2. The view also has the search bar, Refresh and "Import activities".
  - **Master Activity tab:** 3 panes (`division-pane`, `activity-pane`, `boq-pane`) with counts. Selecting a division filters the activities; selecting an activity filters its BOQ items. Long lists are paginated or virtualised.
  - **BOQ tab:** the `dwl_work_items` list, showing which activities use each item.
  - **Resource tab:** labour and equipment `dwl_resources` with the work items they appear in.
- **`activity-detail-dialog.tsx`:** a large Dialog with prev/next (within the current list), expand and close. Footer: Add activity, Duplicate, Delete, Save Changes.
  - **Details tab:** name, image, description, plus the identity and duration fields (react-hook-form + zod; min ≤ max).
  - **BOQs tab:** a grid of linked work items.
    - Dynamic M/E columns come from the resources present (header prefixed M or E). Days/unit and % are editable.
    - "+ Add BOQ" uses a work-item picker with search.
  - **Predecessors & Successors tab:**
    - **List:** reuse `LogicEditor` from `plan-act-master-editors.tsx`.
    - **Network:** a new `logic-network-view.tsx`, inline SVG from `logic-network-layout.ts`, with a relation-type legend. Clicking a node opens that activity.
- **Existing detail page:** the full page `plan-activity-detail.tsx` stays as it is, with an "Open full page" link from the dialog.

## 4. Docs and maps (`docs-writer`)
- New `docs/04-Business-Modules/06-Planning-Scheduling/23-Activity-Database-Plan.md`: the decisions above, the phase 2 scope, and the screenshot references.
- Update `.claude/skills/dcos-architecture/references/planning.md`: new tables, RPC, services and pages. Add the `dwl_work_item_resources` read and write path to `integration-map.md`.

## Phase 2 (not in this release)
- Libraries for Method Statement, Material (reuse `dwl_material_*`), Coordination, Shop Drawing and T&C (template-level `itps`).
- Each gets link tables to masters and shows as chips on the Details tab.
- Generate can use the min/max duration % to clamp durations.

## Execution
- Run as a Planning lane: `scripts/new-lane.ps1 -Module planning -Topic activity-database`.
- Pipeline: `planning-manager` (domain check of the division mapping and duration %) → `database-engineer` → `backend-engineer` ∥ `frontend-engineer` → `code-reviewer` → `docs-writer`.
- **Core requests to raise:** none expected. One possible cross-module item: writing M/E values into `dwl_work_item_resources`, if the cost library is QS-owned.

## Verification
- Migration: dry run (rollback), then apply. Query checks:
  - 16 rows in `plan_act_divisions`;
  - every master has a `division_id` after the seed;
  - links were created from the norms.
- `cd apps/web && pnpm typecheck && pnpm lint && pnpm test` (new tests pass).
- On the lane's dev port with `NEXT_PUBLIC_DCOS_SHOW_DEV_FEATURES=true`, open `/dashboard/planning/activity-library/database` and check:
  - division counts;
  - selecting a division filters activities, and an activity filters BOQ items;
  - search finds both activities and BOQ items;
  - the dialog's Details save, the BOQ grid shows M/E hrs from the cost library, and the logic list and network match `plan_act_logic_rules`;
  - duplicate creates a draft with the next `D04-xxx`;
  - delete refuses an activity that a template uses;
  - importing a sample workbook previews, then creates drafts.
- Regression: the existing Activity Library list and detail pages, Generate and QS Bridge still work.

## Implementation status (2026-10-23)

### Built (phase 1)
- Migration `20261023091500_planning_activity_database.sql`: `plan_act_divisions` (16 rows), new master columns (`division_id`, `visible_code`, `trade`, `activity_type`, `min_duration_pct`, `max_duration_pct`, `image_path`), link table `plan_act_master_work_items` (activity to QS work item), private storage bucket `activity-images`, RPCs `plan_act_bank_search` and `plan_act_division_counts`.
- Seed `supabase/seeds/seed_activity_database.sql`.
- Code: `lib/planning/activity-library/` (`activity-database-service`, `activity-import-service`, `activity-database-import`, `logic-network-layout`, `visible-code`), `components/planning/activity-database/*`, page `/dashboard/planning/activity-library/database` (nav item "Activity Database", status `development`).

### Decisions made during build
- `visible_code` is unique across root masters; new versions inherit the code of their root.
- The master guard trigger lets `division`, `visible_code`, `trade` and `image` change on active masters. `activity_type` and the min/max duration % are versioned (change through a new version).
- M/E hrs per unit are read-only in Planning. They come from `dwl_work_item_resources`; editing is done in the QS cost library page `/dashboard/qs/dwl-work-items`.
- Import creates drafts only. It copies domain, category and family from an existing master in the same division.
- Delete is allowed only for drafts that nothing references; anything else is archived.
- The work-item link table is frozen unless the master is a draft.

### Seed results
- 233 masters mapped to divisions.
- 0 work-item links seeded: no productivity norm had a `dwl_work_item_id`. Links are added manually or by import.

### Open items
- Phase 2 libraries (method statement, material, coordination, shop drawing, T&C).
- [TBD - human to confirm] Whether Planning may write `dwl_work_item_resources` (QS-owned) or stays read-only.
- Release: add the page to `lib/modules/release.ts` (core request, main lane).
