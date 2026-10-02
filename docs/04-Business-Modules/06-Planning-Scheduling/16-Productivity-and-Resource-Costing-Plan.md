# 16 — Productivity Record & WBS → Quantity → Productivity → Resource → Cost Plan

**Status:** All phases (0–4, Phase 5 parts A and B) **DONE** on the local database (2026-09-21/22). This plan is complete.
**Decisions:** confirmed by the user on 2026-09-21 — all recommendations in §7 are adopted (see §7).
**Prepared:** 2026-09-21 · **Module:** Planning & Scheduling (with QS/DWL, HR, Site touch-points)
**Target project for rollout:** `PRJ-2026-004-PC` (7 Story Mix Use Building — 802 tasks, 6-day week)
**Database rule:** all design/testing runs on the LOCAL Supabase only; production receives migrations only when the user runs `/dbpush`.

---

## 1. Summary

Today the system can *level* resources but cannot *calculate* how many are needed. A task has dates; nothing says how much work it contains or how fast a crew does it, so headcount is a guess (the `seed_prj_2026_004_pc_resources.sql` seed hand-maps regexes to crew sizes — a stopgap, not a model).

This plan adds the missing middle of the chain and ties it back to the WBS:

```
WBS node ─► Task ─► Quantity ─► Productivity norm ─► Work (man-hours)
                                                        │
                       ┌────────────────────────────────┴─────────────┐
                       ▼                                              ▼
              fixed crew  → Duration                    fixed duration → Crew required
                       └───────────────┬──────────────────────────────┘
                                       ▼
                     Resource assignments (trade × workers, equipment)
                                       ▼
                     Cost lines (rate × resource-days) ─► WBS roll-up
                                       ▼
        Resource levelling (multi-resource, within float) ─► new dates
                                       ▼
        Cost re-phased (weekly cost / cash-flow) ─► WBS ─► Actual productivity feeds back to the norm
```

Two records are introduced, and they are different things:

| Record | Meaning | Who owns it |
|---|---|---|
| **Productivity norm** (planned) | "A crew of 6 places 30 m³/day" / "0.2 labourer-days per m³" | Planning + QS, approved |
| **Productivity log** (actual) | "Today gang B placed 24 m³ with 7 workers, 8 h" | Site engineer, daily |

Norms drive the plan; logs measure reality and recalibrate the norms.

**Delivery:** 6 phases (0–5). Phase 0 fixes blockers that already exist; Phases 1–3 deliver "manpower required" from quantity; Phase 4 adds cost; Phase 5 closes the loop with levelling and actuals.

---

## 2. What already exists (verified against the local DB and code)

| Piece | Where | State |
|---|---|---|
| Task hours / cost columns | `wbs_tasks.planned_hours, actual_hours, budget_cost, actual_cost, baseline_cost, cost_code, duration_days` | Present. **`planned_hours`, `budget_cost` are empty for all 802 PRJ-2026-004-PC tasks.** No quantity or unit column exists. |
| Node quantities | `wbs_node_quantities` (`metric_code` limited to `GFA`, `SITE_AREA`, `BUILDING_FOOTPRINT`) | 12 rows, all GFA (800 m² per floor). Node-level, project metrics only. |
| **Crew + daily output** | `dwl_assembly_costing.daily_output`, `dwl_assembly_crew`, `dwl_assembly_equipment` | The closest existing "productivity record". Only **2 assemblies** exist; one has crew + output (ceiling, 13.5 m²/day, 1 mason + 1 helper). |
| **Consumption per unit** | `dwl_work_item_resources.consumption` (+ `waste_pct`, `basis_note`) | 339 work items. **Most labour rows are placeholders** ("Labor component (migrated)", consumption = 1.0). Real example: item `03.02.010`, C30 columns — 0.20 general-labourer-day/m³ and 0.03 mason-day/m³, basis "gang of 6 places 30 m³/day". |
| Labour rates | `dwl_resources`, `dwl_resource_prices` (incl. `overtime_rate_per_hr`), view `dwl_v_current_prices`; `dwl_labor_rate_attributes.standard_productivity_note` | 879 resources / 872 prices. Productivity is only a **free-text note**. |
| Parametric quantity models | `dwl_quantity_models`, `dwl_model_factors` | 1 model, **0 factors** → cannot generate quantities today. |
| BOQ | `qs_boq_items` (`quantity, unit, unit_rate, wbs_node_id, budget_code_id`) | 57 items for PRJ-2026-004-PC, **0 linked to a WBS node**. |
| Tender BOQ | `tender_boq_items` (`quantity, unit, level, dwl_work_item_id, wbs_node_id`) | One tender has **841 real items** (rebar 45,000 kg, slab formwork 3,200 m², per-level ties…), **0 linked to WBS**, 9 linked to DWL items. |
| Resources | `plan_resources` (`max_units, cost_per_unit, unit_label`), `plan_task_assignments` (`allocation_percent`) | Working; `cost_per_unit` is **stored but never used** in any calculation. |
| Allocation / levelling | RPC `get_resource_allocation`, `lib/planning/resource-levelling.ts`, dashboard cards | Working (fixed this session). |
| Actual manpower | `site_manpower` (trade, workers, hours), `timesheet_entries`, `overtime_requests` | `site_manpower` has **no WBS link**; its screen inserts a random UUID as `project_id` (`components/construction/site/site-manpower.tsx:84`) — broken. |
| Schedule engine | `lib/planning/schedule-engine.ts` (`EngineTask.durationWd`) | Duration always comes from dates. No effort-/quantity-driven mode. |
| Calendar | `plan_calendars` (Mon–Sun booleans + exceptions) | **No hours per day.** |
| Docs | Task-Management spec (§4.6, `v_task_productivity`, `task_resource_manpower`) | Spec only — never built (Planning was built on `wbs_tasks`/`plan_*` instead). Master_Prompt_10/11 are AI prompt outlines, not designs. |

## 3. Gaps and defects this plan must handle

1. **Two productivity conventions** in DWL: consumption per unit (`day/m³`) vs crew `daily_output`. The norm record must reconcile them.
2. **No task-level quantity** and **no BOQ→task/WBS link** in practice (0 of 57 / 0 of 841 mapped).
3. **`budget_cost` is overloaded**: all progress roll-ups use it as a *weight*, and the template generator writes `default_weight` into it. Do not put money there.
4. **`get_resource_allocation` spreads over calendar days** (Sundays, holidays included) and knows nothing about hours.
5. **Levelling uses only a task's first assignment**; a task needing carpenters *and* a crane is levelled against one of them.
6. **`plan_resources.cost_per_unit` is dead**; no cost roll-up exists anywhere on the schedule side.
7. **Site manpower is unusable** (random `project_id`, no WBS link) so no actuals can calibrate norms.
8. **Planning BRD lists cost loading as out of scope** (`01-Business-Requirement.md:100-101`). This plan needs that decision reversed, limited to *resource* cost loading (QS keeps commercial cost control).
9. **Real norms are sparse.** Nothing in the repo or the Cambodia market-rates file gives crew sizes or outputs. Norms must be curated by the site/QS team; any starter values are drafts.

---

## 4. Target design

### 4.1 Core formulas

Let `Q` = planned quantity, `LC` = labour constant (man-hours per unit), `H` = productive hours per day (calendar), `E` = efficiency factor.

| Quantity | Formula |
|---|---|
| Work (man-hours) | `W = Q × LC` (or `Q ÷ output_per_crew_day × crew_workers × H`) |
| Adjusted work | `W' = W ÷ E` (E from site-condition adjusters: height, weather, learning curve) |
| Duration, given a crew of `n` workers | `D_wd = ceil( W' ÷ (n × H) )` |
| Crew required, given duration `D_wd` | `n = ceil( W' ÷ (D_wd × H) )` |
| Resource-days per trade | `W'_trade ÷ H` |
| Cost | `Σ (resource-days × day rate) + OT premium` (equipment: days × rate) |

**Worked example from real data** (DWL item `03.02.010`, C30 columns; basis "gang of 6 places 30 m³/day"): `Q = 120 m³` → 24 labourer-days + 3.6 mason-days = 27.6 man-days = **220.8 man-hours** at H = 8. With the recorded gang (6 labourers + 1 finisher): duration = 120 ÷ 30 = **4 working days**. Fixed-duration check: if the programme allows only 2 days, crew required = 12 labourers.

### 4.2 Scheduling modes (per task, `plan_task_work.duration_mode`)

| Mode | Behaviour |
|---|---|
| `manual` (default, today's behaviour) | Dates are authoritative. Work and crew shown as **information** (crew implied by dates). |
| `fixed_duration` | Dates stay; system computes **crew required** and flags if it exceeds availability. |
| `fixed_crew` | Crew stays; system **proposes a duration**. Shown as a preview and applied only on user action (same preview/apply pattern as levelling), never silently. |

Guardrails for applying durations: skip locked WBS nodes, `manually_scheduled` tasks and hard constraints; audit every change through `logScheduleAudit`; re-run CPM afterwards.

### 4.3 Data model (all new tables use `is_project_member(project_id) AND has_permission('planning', …)`)

**`plan_productivity_norms`** — the norm library. `project_id` nullable: `NULL` = company library, set = project override / calibrated copy.
- `code`, `name`, `trade`/`discipline`, `activity_key` (matches task name / activity type), `unit` (m³, m², t, no…)
- **canonical `labour_constant_hr_per_unit`**; derived `output_per_crew_day` (kept in sync from crew + H). Storing man-hours per unit avoids the two-convention problem.
- `hours_per_day_basis` (default 8), `efficiency_pct` (default 100)
- `source`: `manual | dwl_work_item | dwl_assembly | calibrated`, with `dwl_work_item_id` / `dwl_assembly_id` (nullable FKs), `basis_note` (mandatory, like DWL recipes)
- `status` (`draft | approved | retired`), `valid_from/to`, `source_norm_id` (for overrides), audit columns.

**`plan_productivity_norm_resources`** — the crew per norm: `norm_id`, `kind` (`labor | equipment`), `trade_code` or `dwl_resource_id`, `role_label`, `workers_per_crew` (numeric), `hours_per_day` (equipment), `sort_order`.

**`plan_task_work`** — 1:1 with `wbs_tasks` (a new table, not new columns on the hot `wbs_tasks` table with its progress/lock triggers):
- `task_id` PK, `project_id`
- `quantity`, `quantity_unit`, `quantity_source` (`manual | boq | tender_boq | qto | import`), `boq_item_id` / `tender_boq_item_id` (nullable FKs), `quantity_revision` + reason
- `norm_id`, `crews` (parallel crews, default 1), `productivity_adjust_pct`
- `duration_mode`
- **computed & stored** (by RPC, so the Sheet needs no engine): `work_hours`, `crew_required`, `duration_wd_derived`, `planned_cost`, `calc_status` (`ok | missing_norm | missing_quantity | unit_mismatch`), `calc_at`

**`plan_productivity_logs`** — the actual record: `project_id`, `task_id`, `log_date`, `trade_code`/`resource_id`, `headcount`, `hours_normal`, `hours_ot`, `quantity_done`, `unit`, `condition_note`, `source` (`site_diary | timesheet | manual`), `site_manpower_id` (nullable). Derived: `output_per_manhour = quantity_done ÷ (headcount × hours)`.

**`plan_task_cost_lines`** — one row per task × resource kind: `task_id`, `resource_id`/`trade_code`, `kind` (`labor | equipment | material | subcontract`), `quantity_of_resource`, `unit`, `rate`, `rate_source`, `cost`.

**Changes to existing tables**
- `plan_calendars` + `hours_per_day` (default 8), optional `ot_multiplier`.
- `plan_resources` + `trade_code`, `dwl_resource_id`, `rate_basis` (`hr | day`), `ot_multiplier`; **start using `cost_per_unit`** (rate resolution: project resource rate → DWL current price via `dwl_v_current_prices` → norm default).
- `plan_task_assignments` + `source` (`manual | norm`) so generated assignments never overwrite manual ones; `work_units`/`hours` (nullable).
- `site_manpower` + `wbs_node_id`, `wbs_task_id`; fix the random-UUID insert.
- Progress: add `progress_method` per node/task later (`percent | quantity`) — quantity-weighted progress is in the WBS spec but unbuilt.

**RPCs / views**
- `recompute_task_work(task_id | project_id)` — resolves norm + quantity → work, crew/duration, cost lines, `planned_cost`.
- `get_resource_loading(project_id, from, to)` — replaces the calendar-day allocation RPC for the dashboards: **working days per project calendar, hours-aware**, includes derived crew.
- `v_wbs_cost_rollup` — planned cost per WBS node (leaf → summary), plus weekly phasing view (`v_plan_cost_by_week`).
- `v_task_productivity` — `quantity_done ÷ manhours`, actual vs norm index.

Migrations: `20260922000001…` onward (repo's latest is `20260919000021`; `20260921000001` is reserved in `supabase/proposed`). Each guarded to replay on an empty DB per CLAUDE.md.

### 4.4 Calculation engine

A pure TypeScript module `lib/planning/work-engine.ts` (no I/O), mirroring how `schedule-engine.ts` / `resource-levelling.ts` are built and tested:
- `computeTaskWork({ quantity, norm, crews, adjust, hoursPerDay, mode, durationWd })` → `{ workHours, crewRequired, durationWdDerived, tradeDays[] , warnings[] }`
- unit conversion + mismatch detection (e.g. task in m², norm in m³ → `unit_mismatch`)
- `costTaskWork(…, rates)` → cost lines
The RPC and the UI both call the same logic; the RPC is the source of stored values, the TS module powers previews and unit tests.

### 4.5 Levelling and cost feedback

- **Multi-resource levelling.** Extend `loadLevellingContext` so a task demands *every* assignment (trade + equipment), not the first one. This is required once norms generate crews.
- **After Apply** (existing preview/apply flow writes `start_no_earlier_than` constraints): re-run CPM, call `recompute_task_work` → cost re-phased by week → WBS roll-up updated; the dashboard shows cost/manpower *before vs after*.
- **"Cost levelling"** = smoothing the weekly cost/cash-flow curve. Delivered as a cost histogram beside the manpower one, with the same before/after diagram; the levelling objective stays resource-driven (cost peaks follow).

### 4.6 UI

New Planning tab **Productivity** with three pages:
1. **Norm Library** — list/filter, create/edit with crew lines, "Import from DWL" (work items and assemblies), approve workflow, "calibrate from logs".
2. **Task Work** — bulk grid (Sheet-style): WBS · task · quantity · unit · norm · crews · mode · work-hours · crew required · derived duration · cost · status; filters for `missing_norm` / `missing_quantity`; CSV import; "Map BOQ → WBS" helper.
3. **Site Records** — fast daily entry (headcount, hours, quantity done per task/trade) + productivity index chart.

Existing screens gain: Sheet columns (Qty, Unit, Work-hrs, Crew req.), Resource Loading (required vs available, source badge norm/manual), dashboard cards (manpower required vs available; productivity index; cost by phase; weekly cost).

### 4.7 Permissions
Seed `has_permission('planning', 'productivity' | 'work' | 'norms', view|edit|approve|delete)` following `20260919000007_planning_role_permissions_seed.sql`. Norm approval restricted to Planning manager / QS.

---

## 5. Phases

Effort key (rough, one engineer): **S** ≈ 1–2 days · **M** ≈ 3–5 · **L** ≈ 1–2 weeks.

### Phase 0 — Unblock (S–M) — ✅ DONE (local DB, 2026-09-21)
- Fix `site-manpower.tsx` / `site-equipment.tsx` / `site-daily-reports.tsx` (random `project_id`); add WBS link columns to `site_manpower`.
- Add `plan_calendars.hours_per_day`; show it in the Calendars UI.
- New `get_resource_loading` (working-day, calendar-aware); switch the dashboard cards and Resource Loading to it; keep the old RPC for compatibility.
- Seed planning permissions for the new areas.
- **Exit:** site diary saves against the real project; manpower histogram excludes Sundays for a Mon–Sat calendar.

**Delivered**

| Item | Where |
|---|---|
| `plan_calendars.hours_per_day` (default 8, check 0 < h ≤ 24) | migration `20260922000001`; Calendars screen (input + "Hours/day" column); `hoursPerDay` on `WorkCalendar` (`lib/planning/work-calendar.ts`) |
| `get_resource_loading(project, from, to)` — working days per the resource's or project's calendar, exceptions honoured, hours-aware, Mon–Fri/8 h fallback with no calendar | migration `20260922000002`; `getResourceAllocation()` in `lib/planning/resource-service.ts` now calls it (old `get_resource_allocation` left untouched) |
| `site_manpower.wbs_node_id` / `wbs_task_id` (optional FKs, `on delete set null`) | migration `20260922000003` |
| Permission actions `norms`, `task_work`, `productivity` (L0–L4/PE full; L5/L6 view + create/edit on `productivity`; QS norms view/create/edit/approve + task_work view/edit) | migration `20260922000004` |
| Site diary / manpower / equipment save against the selected project, list only that project, `created_by` filled on daily reports | `components/construction/site/site-{daily-reports,manpower,equipment}.tsx` |

**Verified:** old vs new function on PRJ-2026-004-PC — 2,854 → 2,466 rows, the 388 dropped rows are all Sundays, Saturdays kept (Mon–Sat calendar), peaks unchanged. Holiday and Sunday-override exceptions, hours per day, per-resource calendar, no-calendar fallback and date clipping tested in a rolled-back transaction. Via the real client as a logged-in user: 3 pages, 2,466 rows, 0 Sunday rows. Browser test of the three site screens and the calendar screen; test rows removed afterwards. Migrations re-run cleanly (idempotent). Unit tests for `hoursPerDay`.

**Findings during Phase 0 (not fixed here)**
- The same random-`project_id` bug exists in `site-progress-photos.tsx`, `site-ncrs.tsx` and `site-inspections.tsx`.
- The Construction module (which owns the site screens) is **switched off** in `module_settings`, so `/dashboard/site/*` redirects to `/dashboard`. It must be enabled by an admin before site users can use these screens.
- Site tables use fully open RLS (`using (true)` for any authenticated user) — not project-scoped.
- The full "empty database" migration replay was **not** run (it would wipe the production-cloned local tables that no migration recreates); the migrations only reference tables created by repo migrations and are idempotent.

### Phase 1 — Norms + task work data + engine (M–L) — ✅ DONE (local DB, 2026-09-21)
- Migrations for `plan_productivity_norms`, `_norm_resources`, `plan_task_work`, RLS, indexes.
- `work-engine.ts` + unit tests (formulas, both modes, unit mismatch, rounding, zero/negative guards).
- `recompute_task_work` RPC.
- Norm Library page; "Import from DWL" (map consumption → labour constant; flag placeholder rows with consumption = 1.0 as *not importable*).
- **Exit:** a norm created, a task given quantity + norm → correct work-hours, crew, duration in the UI; tests green.

**Delivered**

| Item | Where |
|---|---|
| Norm library: `plan_productivity_norms` (company library `project_id NULL` + project overrides), `plan_productivity_norm_resources` (crew), mandatory `basis_note`, draft → approved → retired, approved norms **locked** (edit blocked by trigger; retire or copy), approve needs `planning/norms/approve`, company-library writes need `configure` | migration `20260922000005` |
| Task work: `plan_task_work` (1:1 with `wbs_tasks`), `plan_compute_work()` (the formulas as one pure SQL function), compute trigger, `plan_working_days()` / `plan_project_calendar()` / `plan_norm_unit()` helpers, `recompute_task_work(project, task)` RPC, RLS on membership + `task_work` rights | migration `20260922000006` |
| Calculation engine + unit aliases (`m³`/`cum`/`m3`…) | `lib/planning/work-engine.ts` — mirrors the SQL function |
| DWL import rules (refuses placeholders; "gang of N" sizing; legacy flag) | `lib/planning/dwl-norm-import.ts` |
| Data access | `lib/planning/productivity-service.ts` |
| **Norm Library** screen (list, filters, editor with labour-constant ⇄ crew-output, approve/retire/copy, DWL import) | `/dashboard/planning/productivity` |
| **Task Work** screen (quantity, unit, norm, crews, adjustment → live man-hours / crew required / days; batch save; recalculate) | `/dashboard/planning/productivity/task-work` |
| "Productivity" group in the Planning navigation | `lib/planning-nav.ts`, sidebar icon |

**Verified**
- 18 hand-computed cases through the SQL function (incl. the DWL `03.02.010` worked example: 120 m³ → 220.80 man-hours, 14 workers for 2 days, 4 days for one 6.9-worker crew), 19 engine tests, 15 DWL-import tests, and a **TypeScript ↔ SQL parity test on 600 random inputs** (opt-in: `DCOS_PARITY=1`) — every field identical.
- Permissions tested as real users: approve guard, approved-norm lock (norm and crew lines), L6 view-only, a role-less user sees nothing, project-membership scoping, a norm from another project is refused, an approved norm cannot be deleted.
- Browser end-to-end on the real local app (22 checks): import from DWL → approve → locked → task quantity + norm → live preview equals the values the database stored → unit mismatch flagged → recalculate. Test rows removed afterwards.

**Findings during Phase 1**
- **Bug fixed:** the compute trigger ran with the *saver's* read rights, so a user who could edit task work but not read calendars (QS) would silently get the Mon–Fri / 8 h fallback. The trigger is now `SECURITY DEFINER`; a check stops a task using another project's norm.
- **Permission gap fixed (Phase 0 seed):** QS now has `can_create` on `task_work` (a row must exist before it can be edited).
- **DWL data reality:** only **20 of 117** DWL labour items are importable — `03.02.010` (the one curated recipe, with a "gang of 6" note), 18 hour-based items migrated from the legacy company rate library (source undocumented, flagged *never validated*) and 1 assembly (`ASM-CEIL-GYP-001`, 13.5 m²/day). The other 97 are placeholders (consumption 1.0 / flat-rate) and are shown as blocked. **Real norms must still come from the site and QS teams.**
- **Regression from the dark-theme change fixed:** ~93 elements used dark slate/gray backgrounds with white text (e.g. dialog headers). The slate-scale flip had turned them near-white (1.1:1 contrast). They are now pinned to dark tones in `globals.css`.
- Scope note: quantity link to BOQ/QTO (`boq_item_id` …) and the duration mode's *effect* on the schedule are Phase 2 / Phase 3. The Task Work screen deliberately has no "mode" control yet, because it would do nothing.
- Stored values are refreshed when a row is saved or via *Recalculate all*; they do not yet update automatically when a norm, a task date or the calendar changes (Phase 3 adds staleness detection).

### Phase 2 — Quantities linked to the WBS (M–L) — ✅ TOOLING DONE (local DB, 2026-09-22); exit criterion blocked on real data
- Task Work grid with CSV import.
- **BOQ → WBS mapping tool** for `tender_boq_items` and `qs_boq_items` (match by `level` / name / `budget_code`; manual override; never auto-apply silently). Store `boq_item_id` on the task's work record.
- Quantity revision history (reason mandatory, as in `wbs_node_quantities`).
- Optional quantity-weighted progress for tasks with quantities — **not built**; nothing in Phase 2 needed it and it wasn't requested.
- **Exit:** ≥ 80% of structural tasks in PRJ-2026-004-PC carry a quantity traceable to a BOQ line — **not reached; blocked on data, not on the tool.** See findings below.

**Delivered**

| Item | Where |
|---|---|
| `plan_task_work.tender_boq_item_id` / `.qs_boq_item_id` (exactly one, only when `quantity_source` is `tender_boq` / `boq` — enforced by a check constraint) + a same-project guard in the compute trigger | migration `20260922000007` |
| `plan_task_work_quantity_history` — append-only, one row per quantity/unit/source/link change; a reason is mandatory only when REVISING an already-recorded quantity (mirrors `wbs_node_quantities`'s is_current/revision pattern); written only by a `SECURITY DEFINER` trigger, no direct-write policy | migration `20260922000007` |
| Matching engine — name (Jaccard word-overlap), WBS level (parsed from the task's nearest ancestor node of type `level`, aliased against BOQ `level` text/"All"), budget code; weighted, ranked, thresholded; suggest-only | `lib/planning/boq-matching.ts` |
| CSV parser (RFC4180-ish: quotes, embedded commas/newlines, header aliases) | `lib/planning/task-work-csv.ts` |
| Data access: BOQ candidates (own `qs_boq_items` + linked tender's `tender_boq_items`), tasks with a resolved level label, apply/import writes, history reads — all paged past PostgREST's 1000-row cap | `lib/planning/boq-mapping-service.ts` |
| **BOQ Mapping** screen — per-task top suggestions with score and reasons, one-click Apply or a searchable manual override, both requiring a reason; coverage tiles | `/dashboard/planning/productivity/boq-mapping` |
| **Task Work** screen: Import CSV (preview → mandatory reason → commit), a BOQ-link badge that a manual quantity/unit edit clears, a History icon per row, and a reason-prompt dialog when a grid edit revises an already-recorded quantity | `components/planning/plan-task-work.tsx` + `-csv-dialog.tsx` + `-history-dialog.tsx` |

**Verified**
- 20 unit tests (7 matching-engine, 13 CSV parser) plus the full existing suite: 121 passed, 1 skipped (opt-in parity). `tsc` and `eslint` clean.
- SQL: a revision without a reason is rejected; a revision with one succeeds and is logged; a same-project BOQ link succeeds; a different-project BOQ link is rejected; the source/link check constraint holds.
- Browser end-to-end on PRJ-2026-004-PC's own real data (16 checks): the mapping tool suggests the real `Z.01.01.04 Setting out & ongoing survey works` line for task `03.01.02.01.01 Setting Out` → Apply copies its quantity and unit (18 Month) → the Task Work grid shows the traceability badge → editing the quantity by hand (18→20) opens the reason dialog → saved with a reason → the badge is gone (no longer traceable) → the History dialog shows both the original link and the revision with its reason → CSV-imported a row for `03.02.01.01 Site Clearance` → stored and badged "CSV import". Test rows removed afterwards.

**Findings during Phase 2**
- **The exit criterion cannot be met with the data currently in the local database, and this is a data problem, not a tool problem.** PRJ-2026-004-PC (7 Story Mix Use Building) has 181 structural tasks but **no structural BOQ**: its own `qs_boq_items` has only 57 rows, all *preliminaries* (site office, cranes, hoarding — nothing a structural task could trace to), and it has **zero** `tender_boq_items`.
- **The rich 841-line tender BOQ this plan's Phase 0 rollout notes assumed belonged to this project does not.** It belongs to a different project — the tender for PJR-2026-003-PC ("Chong Cherng Chinese School") — whose project code merely looks similar. That project separately has its own 863-line, properly categorised (`substructure`/`architectural`) `qs_boq_items` BOQ.
- **PJR-2026-003-PC, the only project with real structural BOQ data, has zero `wbs_tasks`.** So it cannot be used to prove the mapping tool either. Live verification above therefore ran on PRJ-2026-004-PC's own real (if prelims-only) BOQ — a handful of real matches (setting-out, site clearance) rather than a contrived success.
- **What this means going forward:** the BOQ Mapping tool and CSV importer work on any project's real data today. Reaching ≥ 80% coverage on PRJ-2026-004-PC needs either (a) a real structural BOQ for it, importable via the CSV path once QS/estimating supplies one, or (b) its tender record corrected to point at the right BOQ, if one exists outside the local DB. Neither is a code change.
- `writeTaskQuantity` upserts sequentially (small batches from the mapping tool / CSV import) rather than in one request — simpler and gives per-row failure reporting, at the cost of N round trips; fine at current data volumes (tens of rows per action), worth revisiting only if a project needs a large bulk import.

### Phase 3, part 1 — Generated resource loading + required-vs-available dashboard — ✅ DONE (local DB, 2026-09-22)
- "Generate resource loading from norms": creates `plan_task_assignments` with `source='norm'` (workers × 100, per the existing unit convention); manual assignments untouched; idempotent.
- Dashboard: manpower **required vs available** by trade, shortage weeks flagged.
- **Exit:** re-running generation gives identical results. ✅ Met (see Verified).

**Delivered**

| Item | Where |
|---|---|
| `plan_task_assignments.source` (`manual` default \| `norm`) + `generated_at`; `plan_resources.trade` (set only on the generator's own pooled resources) | migrations `20260922000008`, `…009` |
| `plan_norm_trade(norm_id)` — a norm's own `trade` field if set, else its largest labour crew role, else `'General'` | migration `20260922000008` |
| `plan_generate_resource_loading(project)` — one pooled labour resource per trade (find-or-create; an existing resource's capacity is never touched), full delete-then-reinsert of every `source='norm'` assignment from the project's current `plan_task_work.crew_required`; `source='manual'` rows are never selected by the delete. Runs as the caller (ordinary RLS: needs `planning/resources` edit **and** delete), not `SECURITY DEFINER` | migration `20260922000008` |
| `generateResourceLoadingFromNorms(projectId)` — thin RPC wrapper | `lib/planning/resource-generation-service.ts` |
| `aggregateByTrade` / `flagShortageWeeks` — pure, mirrors the existing `aggregateByType`; a week is "short" when a trade's peak daily demand exceeds its capacity that week | `lib/planning/resource-service.ts` |
| **Generate from Norms** button and the **Manpower Required vs Available (by trade)** card (demand/capacity histogram per trade + a shortage-week badge) on the Resource Loading page | `components/planning/plan-resource-loading.tsx` |

**Verified**
- 8 unit tests for `aggregateByTrade` / `flagShortageWeeks` (grouping, the manual-resource name fallback, inactive-resource capacity exclusion, week bucketing, zero-capacity guard, sort order). Full suite: 129 passed, 1 skipped. `tsc` and `eslint` clean.
- SQL, with a real norm + quantities entered on two real PRJ-2026-004-PC tasks: run 1 creates 1 resource and writes 2 assignments; run 2 (unchanged inputs) reuses the resource and rewrites the same 2 assignments (removes 2, writes 2) — byte-identical result, proving the idempotency exit criterion; a `source='manual'` assignment added between runs survives both a delete-then-reinsert generation pass untouched.
- Browser end-to-end on the real local app (6 checks): the button generates, the resource card and the trade-dashboard row appear with the exact expected name, a second click does not duplicate the resource card. Test rows removed afterwards.

**Findings during Phase 3, part 1**
- **A real encoding bug, caught before it reached the database:** the em dash originally used in the generated resource name (`"<Trade> — from norms"`) got corrupted into `"â€”"` when piped through PowerShell (`Get-Content -Raw | docker exec …`) to apply the migration — `Get-Content -Raw` without an explicit encoding reads as the console's codepage, not UTF-8, so non-ASCII bytes get silently re-interpreted. This is the *same bug class*, on a new surface, as the mojibake fixed in `plan-task-work.tsx` at the end of Phase 2. Fixed two ways: the pipeline now sets `$OutputEncoding` to UTF-8-no-BOM before piping SQL with non-ASCII characters, and — since this particular string is a system-generated identifier, not prose — the em dash was replaced with a plain ASCII hyphen (`"<Trade> - from norms"`) so the naming convention itself no longer depends on getting encoding right.
- **The hand-mapped regex seed (`seed_prj_2026_004_pc_resources.sql`) has *not* been retired.** Retiring it now would empty the Planning dashboard's manpower histogram and levelling diagram with nothing real to replace it, because — as found in Phase 2 — PRJ-2026-004-PC's 802 tasks have no real quantities or norms yet, so `plan_generate_resource_loading` has nothing to generate from on this project today. Retirement is deferred until real task quantities + norms exist for it (via the Phase 2 BOQ mapping/CSV tools once real data is available) and generation produces comparable real coverage.
- A newly created trade-pool resource defaults to `max_units = 100` (one worker) — a deliberate placeholder, not a guess at real crew availability; the user must size it on the Resources page. Until then, the required-vs-available dashboard will show that trade as heavily short, which is an honest reflection of "capacity not yet set", not a bug.

### Phase 3, part 2 — Duration preview/apply with CPM re-run — ✅ DONE (local DB, 2026-09-22)
- Fixed-crew mode → **duration preview/apply**: a task in `duration_mode = 'fixed_crew'` whose crew-derived duration (`plan_task_work.duration_wd_derived`) differs from its scheduled duration gets an **Apply** affordance on Task Work; it previews the reschedule (this task's new finish + every successor the CPM engine would move) before anything is written, per decision #7 (preview/apply, never live).
- **Exit:** ✅ a duration change flows to the schedule and its ripple, verified on a real 20-task dependency chain (see Verified).

**Delivered**

| Item | Where |
|---|---|
| `computeDurationApply()` — pure core: validates the task (not a milestone, no hard constraint, not under a locked WBS node, mode is `fixed_crew`, has a valid derived duration), then re-runs `scheduleProject` (the same CPM engine the Gantt/Sheet use) with the task's finish moved to match its derived duration, and reports every successor whose dates would change | `lib/planning/duration-apply-service.ts` |
| `resolveLockedNodeIds()` — same transitive-lock algorithm as `use-sheet-data.ts`'s `lockedNodeIds`, extracted so a locked branch is never written to (a locked successor is reported separately as "skipped", not silently dropped or fatal to the rest of the batch) | same file |
| `previewDurationApply()` / `applyDurationChange()` — fetch fresh state every time (never trust a stale preview), and on Apply: write the target's new `end_date` directly, write every rippled successor in one `apply_schedule_dates` call (the existing, already-audited batch-reschedule RPC), log `Duration Changed` + `Plan Finish Changed` for the target and `Task Rescheduled` for each successor to the existing `wbs_audit_log` (the Gantt/Sheet's own audit trail — no new table), then call `recompute_task_work` so `plan_task_work` stops being stale against the new dates. Never touches `baseline_start_date` / `baseline_finish_date` | same file |
| **Mode** column (Manual / Fixed duration / Fixed crew) on Task Work, and an **Apply** button in the Days-@-crew cell when there's something to apply | `components/planning/plan-task-work.tsx` |
| Preview/confirm dialog — the diff, the full ripple list, and any locked successors called out before Apply is enabled | `components/planning/plan-duration-apply-dialog.tsx` |

**Verified**
- 12 unit tests on `computeDurationApply` / `resolveLockedNodeIds`: shrinks a duration and ripples one FS successor with the right dates; reports "no change" when derived already matches current; refuses a milestone, a hard-constrained task, a locked task, a non-`fixed_crew` task, a task with no valid derived duration or no work row at all; skips (not fails on) a locked successor while still applying the rest; reports a circular dependency instead of throwing. Full suite: 141 passed, 1 skipped. `tsc` and `eslint` clean (a `no-unused-vars` warning caught a real bug during development — see Findings).
- Live, on PRJ-2026-004-PC's real 16-task `03.01.02.01.*` dependency chain, with every task's dates snapshotted first: set task `03.01.02.01.01` ("Setting Out") to `fixed_crew` with a derived duration of 13 working days (was 1) → the app previewed and then applied the change → **19 real successor tasks rescheduled correctly** through the full FS chain (verified in the database, not just the toast) → the audit log carried exactly `Duration Changed` (1→13), `Plan Finish Changed` (2027-07-01→2027-07-15), and 19 `Task Rescheduled` rows. The whole project's task dates were restored from the pre-test snapshot afterward and verified byte-identical (0 rows differing); the audit log rows were **left in place** — an audit trail that gets scrubbed of test activity isn't a trustworthy audit trail, so this test's rows now read as a real (if synthetic) entry in `03.01.02.01.01`'s history.

**Findings during Phase 3, part 2**
- **A real duration-calendar bug, caught by an ESLint "unused variable" warning:** the first version of this service's internal `toEngineTasks()` computed a task's duration from raw calendar days instead of the calendar's *working* days, silently ignoring the `cal` parameter it was passed (hence the warning). On PRJ-2026-004-PC's 6-day week this would have fed the CPM engine the wrong duration for every task whenever a Sunday fell inside its span. Fixed to call the same `workingDaysBetween(cal, …)` the real Sheet uses, matching `use-sheet-data.ts`'s `toEngineTasks` exactly.
- This tool always skips a locked successor rather than asking whether the caller is a WBS manager (who could otherwise override the lock, as the Sheet allows) — a deliberately stricter, simpler default. A manager who needs to push a change through a locked branch should do that from the Gantt.
- A task with a hard schedule constraint (`must_finish_on` etc.) is refused outright rather than silently overridden — change it in the Gantt first if the constraint itself should move.

### Phase 4 — Cost loading and WBS roll-up (L) — ✅ DONE (local DB, 2026-09-22)
- Rate resolution + `plan_task_cost_lines`; OT premium.
- `plan_wbs_cost_rollup`, weekly phasing, cost-loaded S-curve, cash-flow card.
- Variance per node: bottom-up resource cost vs BOQ value (once mapped).
- Keep `budget_cost` as the progress weight; do **not** write money into it. ✅ Untouched — only `planned_cost` is written.
- **Exit:** every WBS node shows planned resource cost; totals reconcile to the sum of task cost lines. ✅ Met (see Verified).

**Delivered**

| Item | Where |
|---|---|
| `plan_task_work.planned_cost` — finally populated (reserved NULL since Phase 1); `.ot_pct` / `.ot_type` (0–100%, default 0, at an existing HR `overtime_rates` multiplier); `.cost_calc_status` / `.cost_calc_message` (mirrors `calc_status`'s pattern: `ok` / `partial_rate` / `no_rate` / inherits `calc_status` when there's no valid work to cost) | migration `20260922000010` |
| `plan_task_cost_lines` — one computed row per task per **labour** crew role: hours split into normal/OT, the resolved daily rate, normal/OT/total cost. Rebuilt (delete+insert) inside the same `plan_task_work_compute()` trigger that computes work_hours, from that row's own just-computed value — never a second, possibly-stale pass. A companion `AFTER DELETE` trigger removes a task's lines when its `plan_task_work` row is deleted (cost lines have no FK back to it, by design — see Appendix). Read-only: no insert/update/delete policy | migration `20260922000010` |
| **Rate resolution**: `plan_resolve_labor_rate()` — a crew role's cost comes *only* from `dwl_v_labor_rates` via the role's `dwl_resource_id`, never invented or averaged; a role with none costs as NULL and is reported (`no_rate` / `partial_rate`), not guessed. `plan_resolve_ot_multiplier()` reads the existing HR `overtime_rates` table (no new rate table) | migration `20260922000010` |
| `plan_wbs_cost_rollup(project)` — a **function**, not the plan's working-name `v_wbs_cost_rollup` view (a recursive rollup as an unscoped view would recurse the whole database on every query; scoping it to one project up front is what makes it cheap). Bottom-up `planned_cost` per WBS node (own tasks + every descendant node's), the BOQ value of its Phase 2-mapped tasks, and the variance — `SECURITY INVOKER`, so it only ever shows what the caller's own RLS already lets them see | migration `20260922000010` |
| `computeTaskCost()` — pure TS mirror of the SQL cost block, for the Task Work grid's live preview (same reason work-engine.ts mirrors `plan_compute_work`) | `lib/planning/cost-engine.ts` |
| `phaseCostByWeek()` — spreads each priced task's `planned_cost` evenly across its scheduled working days (the standard BCWS/PV convention), bucketed into ISO weeks — pure, feeds one chart that is *both* the cost-loaded S-curve (the cumulative line) and the cash-flow card (the weekly bars), rather than building two near-duplicate widgets | `lib/planning/cost-phasing.ts` |
| Data access: rate/OT-multiplier lookups, the rollup RPC, cost-line reads | `lib/planning/cost-service.ts` |
| Task Work grid: **OT %** / **OT type** columns, a live **Planned cost** column (a `*` and amber tint flags `partial_rate`) | `components/planning/plan-task-work.tsx` |
| **Cost Rollup** page — KPI tiles (planned cost, BOQ value, variance), the cost-loaded-S-curve-and-cash-flow chart, and a full WBS listing (indented by depth via `full_path`, not a collapsible tree — see Findings) with planned cost / priced-of-total tasks / BOQ value / variance per node | `/dashboard/planning/productivity/cost-rollup` |

**Verified**
- 6 `cost-engine.ts` unit tests, all against the **live SQL result** for the same 03.02.010 worked example used in Phase 1 (120 m³, 6 laborers @ $12/day + 0.9 masons @ $17/day): $349.20 with no OT, $436.50 with 25% OT at a 2.0× weekend multiplier, and a `partial_rate` case (a third, unrated crew role) summing only the rated lines. 5 `cost-phasing.ts` unit tests (even split within one week, proportional split across two, multi-task accumulation, skipping milestones/unpriced/dateless tasks, a no-working-day calendar). Full suite: 152 passed, 1 skipped. `tsc` and `eslint` clean.
- SQL, on real PRJ-2026-004-PC tasks with a real DWL-linked norm: the worked example reproduced exactly live (not just in the unit test); `partial_rate` status confirmed with an unrated third role; `plan_task_work.planned_cost` reconciled **exactly** against `sum(plan_task_cost_lines.line_cost)` (the exit criterion, checked directly, not inferred); the WBS rollup propagated a task's cost correctly to its node and every ancestor; linking a real `qs_boq_items` row produced the correct variance; deleting the `plan_task_work` row cascaded its cost lines to zero.
- Browser end-to-end on the real local app (9 checks): Task Work shows the stored $349 planned cost and OT % = 0 by default → editing OT to 25%/weekend live-previews $437 → saves → the stored value matches → the Cost Rollup page's KPI tiles and WBS table show the same $437 and the correct BOQ variance. Test rows removed afterwards.

**Findings during Phase 4**
- **A real rounding bug, caught by my own test failing:** the Cost Rollup page's negative-currency formatting first negated the number *before* rounding it, to reuse `Math.round` for the "-$" sign placement. `Math.round` always rounds an exact `.5` toward +Infinity, so negating first silently shifted an exact-tie variance (-6023.50) from -$6,023 to -$6,024. Fixed to round the signed value once, then format the sign — the same lesson as Phase 3's calendar bug: a value derived by transforming an input for display convenience, then rounding, can quietly round differently than rounding the real value would.
- **The same PowerShell-encoding bug class, again, on new data:** the em dash in this migration's stored `cost_calc_message` and a `comment on column` got corrupted the same way as Phase 2's dialog text and Phase 3's resource name — `Get-Content -Raw` doesn't decode a UTF-8 file correctly by default, and `$OutputEncoding` alone (Phase 3's fix) only addresses the write side, not the read side. Both string literals were switched to a plain hyphen, and the migration was correctly re-applied using `[System.IO.File]::ReadAllText(path, [System.Text.Encoding]::UTF8)` piped with `$OutputEncoding` set — the first time both halves of this pipeline have been verified together. Every future migration containing non-ASCII text should use this exact read pattern, or just avoid non-ASCII in stored strings as this project increasingly does.
- **The WBS listing is a flat, indented table, not a collapsible tree.** Building real expand/collapse for a several-hundred-node tree was more UI than the exit criterion ("every WBS node shows planned resource cost") needed; every node is listed and correctly indented by depth (via `full_path`), just not collapsible yet.
- `plan_task_cost_lines` has no foreign key to `plan_task_work` (both key off `task_id`, a 1:1 with `wbs_tasks`) — deliberate, so a row surviving a moment between "the work row is gone" and "the cost lines are cleaned up" is never possible via cascade timing games; a dedicated `AFTER DELETE` trigger on `plan_task_work` removes them explicitly instead, verified directly.
- Rate coverage is real-world thin: of the DWL's 148 labour rates, none has `overtime_rate_per_hr` set, so OT premium always resolves through the generic HR `overtime_rates` multiplier table, never a labour-specific OT rate. This is disclosed, not hidden — `rate_source` on every cost line says exactly where its number came from.
- As with every other phase, PRJ-2026-004-PC itself currently has no real committed quantities/norms, so it has no real cost data yet; the SQL and browser verification above used the same kind of temporary, real-task test data as every other phase, removed afterward.

### Phase 5, part A — Actuals loop (site logs, productivity index, calibrated norms, timesheet bridge) — ✅ DONE (local DB, 2026-09-22)
- Site Records page; productivity index (actual ÷ norm); "propose calibrated norm" (new `calibrated` norm, never overwrites the approved one).
- Timesheet → productivity log bridge where timesheet entries carry a task.
- **Exit:** logged outputs produce a productivity index per trade; a calibrated norm can be proposed and approved. ✅ Met (see Verified).

**Delivered**

| Item | Where |
|---|---|
| `plan_productivity_logs` — one row per task/trade/day: headcount, hours (normal + OT), quantity done. `plan_productivity_log_compute()` resolves the task's norm (via `plan_task_work.norm_id`) and computes `actual_hours` (headcount × hours), `earned_hours` (quantity_done × the norm's labour constant) and `productivity_index` (earned ÷ actual — the standard Performance Factor: 1.0 = on norm, >1 faster, <1 slower), or reports why it couldn't (`pi_status`: `ok / no_task / no_norm / no_quantity / unit_mismatch / no_hours`), same `SECURITY DEFINER` rationale as `plan_task_work_compute()` | migration `20260922000011` |
| `timesheet_entries.task_id` (new, nullable FK) — "timesheet entries carry a task"; `plan_productivity_log_from_timesheet()` keeps one matching `plan_productivity_logs` row (`source='timesheet'`, headcount 1, the entry's own hours, no quantity) in sync on insert/update/delete of the entry, keyed by a unique `timesheet_entry_id` so re-saving updates rather than duplicates | migration `20260922000012` |
| `plan_propose_calibrated_norm(norm, project, min_logs)` — averages real logged performance (Σ actual_hours ÷ Σ quantity_done across `pi_status='ok'` logs) for an **approved** norm into a new project-scoped **draft** norm (`source='calibrated'`, `source_norm_id` = the original, crew copied unchanged); refuses a non-approved source norm or too few logs (default minimum 3); never writes to the approved norm | migration `20260922000012` |
| `computeProductivityLog()` — pure TS mirror of the compute trigger, for the entry form's live preview; `aggregatePiByTrade()` — weights each trade's index by actual hours, for the dashboard chart | `lib/planning/productivity-index.ts` |
| Data access: log CRUD, a task's norm/unit/suggested-trade in one round trip, the calibration preview (read-only) and the propose RPC wrapper | `lib/planning/productivity-log-service.ts` |
| **Site Records** page — fast entry form (searchable task, auto-filled trade + unit, headcount/hours/quantity/notes, live PI preview), a productivity-index-by-trade bar chart, and the log table with status badges | `/dashboard/planning/productivity/site-records`, `components/planning/plan-site-records.tsx` |
| **Propose calibrated norm** action on an approved norm's row in the Norm Library — a preview dialog (approved vs observed labour constant, sample size, date range, % faster/slower) before creating the draft | `components/planning/plan-calibrate-norm-dialog.tsx`, wired into `plan-norm-library.tsx` |

**Verified**
- 12 `productivity-index.ts` unit tests (every `pi_status`, a normal-hours-only case, an OT-inclusive case, unit aliasing, trade aggregation weighting and its zero-sample/all-non-ok edge cases). Full suite: 164 passed, 1 skipped. `tsc` and `eslint` clean.
- SQL, on a real PRJ-2026-004-PC task (`03.01.02.01.04 Column Concrete`) given the same real worked-example norm as Phases 1/4 (120 m³ job, 1.84 man-hr/m³, 6 laborers + 0.9 masons): three logged days produced `productivity_index` 0.7667 / 1.2267 / 0.9583 — matching the TS engine's unit tests exactly, including the OT-inclusive case. Every non-`ok` status reproduced live: no task, no quantity, unit mismatch (m² logged against an m³ norm), and no norm (a task with no `plan_task_work` row at all). `plan_propose_calibrated_norm` on those three logs returned an **observed** labour constant of 1.8353 hr/m³ against the 1.84 approved value (site running ~0.3% faster) as a new draft `TEST-PI-COL-CAL-20260922` with the crew correctly copied and the approved source norm completely untouched (still 1.84, still approved) — checked directly in the database, not inferred. Refusals verified: a draft (never-approved) norm is refused outright; exactly 2 usable logs against a 3-minimum is refused with the real count in the message.
- SQL, the timesheet bridge on a real `timesheet_entries` row carrying the same task: creates one `plan_productivity_logs` row (`source='timesheet'`, headcount 1, hours split from `hours_worked`/`ot_hours`, `pi_status='no_quantity'` since a timesheet carries no quantity) → editing the entry's hours updates the **same** log row, not a duplicate → clearing `task_id` removes the bridged log → deleting the entry removes it too.
- Browser end-to-end on the real local app (12 checks): Site Records lists the three real test logs with their exact productivity-index badges and every edge-case status badge rendering without error; the productivity-index-by-trade chart renders; logging a new entry through the real form (searching for the task, watching trade and unit auto-fill from its norm, typing a quantity, watching the live preview) saves and reappears in the table with the correct 5.06× index; the Norm Library's calibrate dialog shows the real observed-vs-approved comparison, sample count and date range for the approved test norm. Screenshots taken; all test data (logs, task work, norms, timesheet + entry) removed afterward and confirmed at zero.

**Findings during Phase 5, part A**
- **A test-script duplication, not an app bug:** the first attempt at the "insufficient logs" refusal test used `SET LOCAL` outside an explicit transaction block, which silently has no effect per-statement in psql's default autocommit mode — the two log inserts in that failed attempt still committed individually, so a second corrected attempt inserted two more, leaving 4 real "ok" logs (not 2) and the refusal test passed for the wrong reason. Caught by re-checking the row count before trusting the result; fixed by using session-level `SET` (not `SET LOCAL`) for these ad-hoc verification scripts and re-running the test cleanly with exactly 2 logs, which then refused correctly.
- **No timesheet entry authoring UI exists in the app to exercise the bridge in the browser.** `/dashboard/hr/timesheet` is a read-only list/review screen; its "New Entry" button has no handler. The bridge itself (schema + trigger) is complete and was verified directly against `timesheet_entries`, the same interface any future entry form or API route would use — but there is nothing yet in the UI for an employee to pick a task while filling in their hours. This is a pre-existing gap in the HR module, not something this plan introduces or was asked to close.
- The bridge trigger is `SECURITY DEFINER` so an HR employee filling in their own timesheet does not need a Planning-module `productivity` permission for it to work — the same rationale as every other compute trigger in this plan. RLS on `plan_productivity_logs` itself is unchanged and still governs who can read or hand-edit a log directly.
- A trade is a free-text field on every log, not a foreign key — a Site Records entry auto-suggests the task's norm trade (via the existing `plan_norm_trade()`) but the user can override it, and a log with no task can name any trade at all. This mirrors the norm's own free-text `trade` field; no new trade taxonomy was introduced.
- No time-trend chart (productivity index over time) was built, only the per-trade bar chart the exit criterion asked for — disclosed as a scope choice, not an oversight, matching Phase 4's one-chart decision.
- As with every other phase, PRJ-2026-004-PC has no real committed site logs yet; the SQL and browser verification above used the same kind of temporary, real-task test data as every other phase, removed afterward.

### Phase 5, part B — Multi-resource levelling + cost re-phasing (L) — ✅ DONE (local DB, 2026-09-22)
- Multi-resource levelling: extend `loadLevellingContext` so a task demands every assignment (trade + equipment), not just the first.
- Cost re-phasing after Apply: re-run `recompute_task_work` / the WBS cost rollup after a levelling run is applied, so cost and manpower reflect the post-levelling dates.
- Cost before/after diagram, alongside the existing manpower one.
- **Exit:** a task with equipment as well as labour is levelled against both; applying a levelling run re-phases cost and shows a before/after comparison. ✅ Met (see Verified) — and proven on real data, not synthetic: 104 of PRJ-2026-004-PC's 802 tasks already carry more than one real resource assignment (typically a labour crew *and* a piece of equipment, e.g. `03.01.07.01.14 Concrete Pour` = Concrete Gang + Concrete Pump).

**Delivered**

| Item | Where |
|---|---|
| `LevelTask.resources: { resourceId, units }[]` replaces the old single `resource`/`resourceUnits` pair — a task now demands every resource it holds *at once*; moving it moves it against all of them simultaneously (there is no such thing as moving a task for one resource but not another, since it's the same start date). `ResourceLevellingResult.peaks` replaces the old single `peakBefore`/`peakAfter` with one entry **per resource** — units aren't comparable across different resources (a crew and a crane don't share a scale), so a single combined peak number would have been meaningless once a task can hold both | `lib/planning/resource-levelling.ts` |
| `loadLevellingContext()` now gathers **every** `plan_task_assignments` row per task (previously only the first); duplicate rows for the same resource are summed rather than silently dropping the second | `lib/planning/levelling-service.ts` |
| `buildLevellingProfile()` (the existing manpower before/after chart's data) updated to walk `resources[]` — a task with two resources contributes to the combined demand curve once per resource, by design (it asks "how much is committed in total", not "how many tasks are running") | `lib/planning/levelling-profile.ts` |
| `buildCostLevellingProfile()` — the cost analogue: reuses Phase 4's `phaseCostByWeek()` twice (once against each priced, resourced task's current/"before" start, once against the levelling preview's "after" start) to show how the weekly cash-flow curve would shift if a preview were applied. A task's own `planned_cost` never changes by moving it (cost isn't schedule-driven in this design) — only which week it lands in does | `lib/planning/cost-levelling-profile.ts` |
| **Cost Levelling** chart card — the direct companion to the existing "Resource Levelling" manpower diagram on the Planning dashboard: weekly cost before/after as grouped bars, cumulative before/after as an S-curve pair, same preview-only convention (nothing written until Apply) | `components/planning/planning-resource-charts.tsx` (`CostLevellingDiagramCard`), wired into `app/dashboard/planning/page.tsx` |
| `listPlannedCosts(projectId)` — project-wide `task_id → planned_cost` map, paged past PostgREST's 1000-row cap | `lib/planning/cost-service.ts` |
| `applyLevellingRun()` now calls `recompute_task_work` after writing the moved tasks' constraints, keeping `plan_task_work`'s staleness bookkeeping honest (see Findings for why this doesn't change any cost *number* by itself) | `lib/planning/levelling-service.ts` |
| Resource Loading's levelling panel now shows one **peak before → after** per resource (was one combined pair) | `components/planning/plan-levelling-panel.tsx` |

**Verified**
- 11 `resource-levelling.ts` tests (every pre-existing single-resource case, rewritten onto the new `resources[]` shape, plus 3 new multi-resource cases: a task moved against two resources at once in a single shift, not two; a task that's a mover for one resource while being an untouched bystander for another it doesn't share; an empty-`resources` task never competing for anything), 4 `levelling-profile.ts` tests (incl. a new one proving a two-resource task contributes to the combined curve once per resource), 5 new `cost-levelling-profile.ts` tests (no-op when nothing moved, a full week's cost relocating when a task shifts a week, an unmoved task's cost staying put next to a moved one's relocating). The equivalence suite (`resource-levelling-equivalence.test.ts`, the fast engine vs. the slow original algorithm across 150 random single-resource programmes) still passes unchanged — the oracle is deliberately kept single-resource-only (its own `RefTask` type), since multi-resource behaviour is proven directly, not by comparison to an oracle that has no notion of it. Full suite: **173 passed, 1 skipped**. `tsc` and `eslint` clean.
- SQL: confirmed 104 of PRJ-2026-004-PC's 802 tasks carry more than one real `plan_task_assignments` row (699 assignment rows total) — this is not an edge case on this project, it's routine (a concrete pour needs both a gang and a pump).
- Browser, real local app, real project (12 checks): Resource Loading's "Run Preview" now reports a peak **for the equipment resources** (`Tower Crane TC-1`, `Concrete Pump`) alongside the labour ones — before this fix, an equipment assignment that happened not to be a task's *first* row was invisible to the leveller entirely, so a genuinely over-committed crane (per the Manpower dashboard's own "avail 1, 7 short" reading) could never have been surfaced or resolved. The Planning dashboard's new Cost Levelling card, seeded with a real quantity + norm on two of those real multi-resource tasks (`$145.50` + `$232.80` = `$378.30`), correctly showed the combined `$378` moving from its original week to its post-levelling week, with the cumulative S-curve stepping from `$0` to the full total at the right point on the axis — checked against the exact dollar figures the database itself had just computed, not inferred. Screenshots taken; all seeded test data (2 `plan_task_work` rows, 1 draft-then-approved norm + crew) removed afterward and confirmed at zero; the real `plan_task_assignments` rows on those tasks were never touched.

**Findings during Phase 5, part B**
- **A real, load-bearing bug fixed, not a hypothetical:** before this pass, `loadLevellingContext` picked a task's *first* `plan_task_assignments` row and silently ignored the rest. On real data this wasn't a rounding error — it meant equipment resources (cranes, pumps) were essentially never levelled at all, since labour rows were typically inserted first. A resource the Manpower dashboard itself flags as "avail 1, 7 short" (`Tower Crane TC-1`) was invisible to the levelling engine the whole time. This is now fixed and verified against that exact resource.
- **The dashboard got noticeably slower to compute, as the plan's own Risk table (§8) predicted it might** ("multi-resource adds cost — re-measure in Phase 5"): the full dashboard (both the manpower and the new cost diagram, each independently re-running `loadLevellingContext` + the CPM engine + the leveller over all 802 tasks) took **~9.8 s** to finish computing in the browser, measured directly, not estimated. This is slower than any other chart on the page but not a hang or a regression in the algorithm's own complexity — it reflects levelling now finding and working through real conflicts it previously never saw (this run resolved 134 shifts and still left 51 residual conflicts, most of them on the newly-visible equipment resources). Not optimised in this pass; a reasonable next step if it needs to be faster is to stop computing the manpower and cost diagrams as two independent re-runs of the same levelling context and instead compute both from one shared run.
- **Cost re-phasing after Apply turned out to need less new code than the plan bullet implied.** `applyLevellingRun` only ever writes `start_no_earlier_than` *constraints* (a deliberate, pre-existing "preview then apply" design — real dates change later, whenever the Sheet/Gantt's own reschedule runs). Since Phase 4 made `planned_cost` a function of quantity and rate, not of dates, a constraint-only Apply cannot change any cost *number* by itself — only which week a task's already-fixed cost lands in, and that already updates automatically the next time the Cost Rollup or Cost Levelling page reads the task's (by-then-current) `start_date`/`end_date`. `recompute_task_work` is still called after Apply for staleness-bookkeeping correctness, but the real "cost re-phasing" deliverable ended up being the before/after **preview** diagram itself (computed from the levelling run's proposed dates, before anything is written) rather than a live recompute step — which is also the more honest design: it shows the cash-flow impact of a change *before* asking anyone to commit to it, the same preview-first principle every other mutating feature in this plan follows.
- As with every other phase, PRJ-2026-004-PC has no real committed cost data on its own (no real quantities/norms yet) — the two real multi-resource tasks used for the Cost Levelling verification got a real quantity and norm temporarily, for this test, then had it removed. Their real resource *assignments*, unlike their cost, were never touched — those are the project's own production data.

---

## 6. Rollout on PRJ-2026-004-PC

**Status: done for 418 of 802 tasks, on the local DB (2026-09-22), at the user's explicit request to create custom data since none of the sources below turned out to exist for real.** This section originally planned to source quantities from an 841-item tender BOQ and to derive floor areas from an existing 800 m²/floor `wbs_node_quantities` record. Both assumptions were checked directly against this project when the rollout actually ran and **neither exists for PRJ-2026-004-PC**: the 841-item tender BOQ belongs to a different project (PJR-2026-003-PC, found already in Phase 2); `wbs_node_quantities` has zero rows for this project at all (its `project_id` column points to two other projects, not this one). This correction is recorded here rather than silently left as the original, wrong plan.

With no real BOQ/QTO/GFA to build from, and the user's explicit go-ahead to create custom data, the rollout instead:

1. Grouped the project's 802 tasks by discipline and found 155 have no physical unit of measure at all (QA/QC, Procurement, Shop Drawings, Design, BIM, Documentation, Handover, Commissioning) — correctly left with no quantity, not a gap.
2. Of the remaining 647 candidate tasks, found 52 distinct activity names that repeat once per floor across Structural (14 used, 2 skipped — `MEP Embedded Items` and `Structural Inspection`, neither has a natural unit), Architectural (17) and MEP (19) — 418 tasks. The other ~230 tasks are one-off items (piling, retaining walls, roof, civil, landscape, external works) that would each need individual judgement rather than a systematic model; left out of this pass, disclosed here rather than guessed at.
3. Built 50 **draft** norms (`CUST-STR-*` / `CUST-ARC-*` / `CUST-MEP-*`), one per repeated activity: real crew role names and **real DWL day-wage rates** (`dwl_v_labor_rates`, e.g. Carpenter (formwork) $18/day, Steel fixer (rebar) $18/day, Mason $17/day — never the "Labor component (migrated) for ‹cost item›" rows, which are *per-unit costs* from the old QS migration, not day wages, and would have silently corrupted the cost engine if used as a crew rate), against a **generic, published construction-industry productivity constant** for the labour hours per unit — not a real, project-specific rate. Every norm's `basis_note` says exactly this. Quantities are round, order-of-magnitude, per-floor estimates (e.g. Column Concrete 40 m³/floor, Slab Formwork 750 m²/floor), also disclosed as assumptions in `plan_task_work.quantity_reason`. The one exception: Column/Shear-Wall/Slab concrete reuse the real DWL C30 recipe (1.84 man-hr/m³) already verified live in Phases 1 and 4 of this plan — not invented.
4. Wrote this as `supabase/seeds/prj_2026_004_pc_custom_quantities_norms.sql` (idempotent, re-runnable) rather than a one-off script, so the exact assumptions are in the repo, not just in this conversation.
5. Removed the old hand-mapped regex seed's **labour** assignments on the 418 now-covered tasks (406 rows) and ran `plan_generate_resource_loading`, which wrote 418 new norm-derived assignments across 21 new pooled trade resources. The seed's **equipment** assignments (cranes, pumps — 104 rows project-wide) were left untouched: `plan_generate_resource_loading` has only ever generated labour resources (a Phase 3 design boundary, not changed here), so equipment still has no norm-based equivalent. The seed's labour resources that still cover the ~230 not-yet-modelled tasks (`Concrete Gang`, `General Labourers`, `MEP Electrical Technicians`, …) were left alone too — they weren't orphaned, they're still in real use.
6. A `pg_dump --data-only` snapshot of the affected tables was taken immediately before step 5 (`.backups/prj004_before_custom_rollout_*.sql`) in case this needs to be rolled back.

**Verified**
- SQL: every one of the 418 rows computed `calc_status = 'ok'` **and** `cost_calc_status = 'ok'` — every crew role on every norm resolved a real rate, nothing partial. Hand-checked two: `Column Concrete` (40 m³ × 1.84 hr/m³ = 73.6 man-hr; 6 laborers @ $12/day + 0.9 masons @ $17/day → $116.40) and `Setting Out` (a lump-sum survey pair + helper → $44.25) — both matched the database exactly. Total: **43,460 man-hours, $86,734.18 planned cost** across the 418 tasks. `plan_wbs_cost_rollup` propagates it correctly to every ancestor node.
- Browser, real local app: Task Work shows 418 of 802 tasks with valid work data, 0 needing attention, 384 correctly still showing "no quantity yet"; Cost Rollup's KPI tiles read **$86,734** planned cost, 418 of 819 tasks priced (819 counts every task under the rollup's root nodes, including milestones — a different denominator than Task Work's 802, both correct for what each counts), and the cost-loaded S-curve/cash-flow chart draws a sensible curve rising through 2027's structural works into 2028's finishes; the excluded design/engineering branches correctly show 0 priced throughout. Resource Loading shows 32 resources (11 original + 21 new) and 607 assigned tasks. Screenshots taken.

**What this is not, in plain terms**
This is a complete, internally-consistent, **assumed** dataset — good enough to exercise every screen this whole plan built with real-looking numbers, and a reasonable starting point for a QS/site team to correct line by line. It is **not** a quantity take-off and these are **not** validated productivity rates: every norm is `draft`, every `basis_note` and `quantity_reason` says "assumption, not validated" in those words, and none of it should be quoted as a commercial figure until QS/site review replaces the estimates with real ones (the Norm Library's approve workflow and Task Work's quantity-revision history are exactly the tools for that, already built in Phases 1 and 2).

**Not yet done:** the ~230 one-off tasks (piling, retaining walls, civil, landscape, external works) and the 155 non-physical tasks remain without a quantity, by design. Migrations are unaffected by any of this (it is data, not schema) — the usual `/dbpush` rule for schema changes doesn't apply here, but this seed has, per standing instruction, only ever been run against the local DB.

## 7. Decisions (confirmed 2026-09-21 — all recommendations adopted)

The user confirmed the six design-shaping decisions (1–5 and the lump-BOQ rule, #8) as recommended. The remaining three (#6 hours/day, #7 preview/apply, #9 site logs) proceed as recommended unless changed.

| # | Decision | Recommendation (adopted) |
|---|---|---|
| 1 | Reverse the Planning BRD "cost loading out of scope" line? | **Yes**, limited to resource cost loading; QS keeps commercial cost control. |
| 2 | Norm library scope | Company library **plus** project overrides (nullable `project_id`). |
| 3 | Canonical norm unit | **Man-hours per unit**; derive crew-day output. Reconciles both DWL conventions. |
| 4 | Where task quantity lives | New 1:1 table `plan_task_work`, not columns on `wbs_tasks`. |
| 5 | Money field | New `planned_cost`; leave `budget_cost` as the progress weight. |
| 6 | Hours/day & efficiency | 8 h/day per project calendar; efficiency default 100%, adjustable per norm/task. |
| 7 | Duration application | **Preview/apply**, never live. |
| 8 | Lump BOQ items → floors | Apportion by GFA share unless QS specifies otherwise. |
| 9 | Site actuals | New `plan_productivity_logs` linked to (fixed) `site_manpower`, not overloading it. |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Norm data quality (sparse, placeholders) | Draft/approved status, mandatory `basis_note`, "missing norm" surfaced in UI, no silent defaults. |
| BOQ→WBS mapping ambiguity (level codes differ, e.g. BOQ `04.1F` vs WBS `03.1F`) | Suggest, never auto-apply; manual override; unmapped stays visible. |
| Changing durations breaks CPM/baselines | Preview/apply, skip locked/constrained tasks, audit trail, baseline untouched. |
| `budget_cost` weight semantics | Leave it alone in this plan; separate cleanup later. |
| Performance on 800+ tasks | Store computed values via RPC; Sheet reads stored columns; engine kept O(tasks). |
| Migration replay / local drift | Take `supabase db dump --local` **before** any `stop --no-backup` replay test — the local DB holds production-cloned tables that no migration recreates, and the copied PRJ-2026-004-PC data. |
| Levelling cost | Re-measured in Phase 5 part B: ~9.8 s for the full dashboard (both diagram cards, 802 real tasks, multi-resource) — slower than before, from real conflicts the engine previously never saw (an under-capacity crane, invisible pre-fix). Not optimised further this pass; see Phase 5 part B Findings for the likely next step (share one levelling run between the two cards instead of two independent ones). |

## 9. Verification (every phase)
- Unit tests for the pure engine (`vitest`), including a randomized comparison where a reference exists.
- RLS tests: a non-member cannot read/write norms, work or logs.
- Migration replay from empty DB on local; row-count reconciliation for the rollout project.
- Real-data check in the local app (Playwright screenshot of the affected screens) — as done for the dashboard.
- `tsc`, `eslint`, full `vitest run`.

## Appendix A — Corrections to earlier assumptions
- `wbs_node_quantities` allows three metrics (`GFA`, `SITE_AREA`, `BUILDING_FOOTPRINT`), not only GFA.
- Parametric DWL models exist but have **no factors**, so they cannot seed quantities.
- Task-Management `tasks`/`task_resource_manpower`/`v_task_productivity` are **spec only**.
- `docs/planning-scheduling-completion-plan.md`, cited by `planning-session-continuation.md`, does not exist.

## Appendix B — Key references
`docs/04-Business-Modules/12-Quantity-Surveying/07-SOP_Direct_Works_Cost_Library_Module.md` (recipe/productivity rule, line ~364) · `…/04-04-Task-Management/04-Database-Schema.md` (manpower & productivity view) · `supabase/migrations/20260910000036_dwl_cost_item_library_schema.sql` (assembly output/crew) · `20260905000004_create_plan_resources.sql` · `20260919000008_planning_rls_v2.sql` · `apps/web/lib/planning/{schedule-engine,resource-levelling,levelling-service,resource-service}.ts`.
