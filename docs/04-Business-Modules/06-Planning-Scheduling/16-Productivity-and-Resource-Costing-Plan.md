# 16 — Productivity Record & WBS → Quantity → Productivity → Resource → Cost Plan

**Status:** Phases 0 and 1 **DONE** on the local database (2026-09-21) · Phases 2–5 not started.
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
| Actual manpower | `site_manpower` (trade, workers, hours), `timesheet_entries`, `overtime_requests` | `site_manpower` has **no WBS link**; its screen inserts a random UUID as `project_id` (`components/site/site-manpower.tsx:84`) — broken. |
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
| Site diary / manpower / equipment save against the selected project, list only that project, `created_by` filled on daily reports | `components/site/site-{daily-reports,manpower,equipment}.tsx` |

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

### Phase 2 — Quantities linked to the WBS (M–L)
- Task Work grid with CSV import.
- **BOQ → WBS mapping tool** for `tender_boq_items` and `qs_boq_items` (match by `level` / name / `budget_code`; manual override; never auto-apply silently). Store `boq_item_id` on the task's work record.
- Quantity revision history (reason mandatory, as in `wbs_node_quantities`).
- Optional quantity-weighted progress for tasks with quantities.
- **Exit:** ≥ 80% of structural tasks in PRJ-2026-004-PC carry a quantity traceable to a BOQ line.

### Phase 3 — Manpower required + generated resource loading (M)
- "Generate resource loading from norms": creates `plan_task_assignments` with `source='norm'` (workers × 100, per the existing unit convention); manual assignments untouched; idempotent.
- Fixed-duration mode → crew required; fixed-crew mode → **duration preview/apply** with audit + CPM re-run.
- Dashboard: manpower **required vs available** by trade, shortage weeks flagged.
- Retire the hand-mapped regex seed for PRJ-2026-004-PC in favour of generated loading.
- **Exit:** re-running generation gives identical results; a duration change flows to the histogram.

### Phase 4 — Cost loading and WBS roll-up (L)
- Rate resolution + `plan_task_cost_lines`; use `cost_per_unit`; OT premium.
- `v_wbs_cost_rollup`, weekly phasing, cost-loaded S-curve, cash-flow card.
- Variance per node: bottom-up resource cost vs BOQ value (once mapped).
- Keep `budget_cost` as the progress weight; do **not** write money into it.
- **Exit:** every WBS node shows planned resource cost; totals reconcile to the sum of task cost lines.

### Phase 5 — Levelling v2 + actuals loop (L)
- Multi-resource levelling; cost re-phasing after Apply; cost before/after diagram.
- Site Records page; productivity index (actual ÷ norm); "propose calibrated norm" (new `calibrated` norm, never overwrites the approved one).
- Timesheet → productivity log bridge where timesheet entries carry a task.
- **Exit:** logged outputs produce a productivity index per trade; a calibrated norm can be proposed and approved.

---

## 6. Rollout on PRJ-2026-004-PC

1. Phase 0 fixes, then Phase 1 tables (local).
2. **Quantities:** source is the 841-item tender BOQ (structural quantities are per level or "All"). Map by level/name to WBS floors; many items are lump ("All") and must be **apportioned** to floors — needs a rule agreed with QS (by GFA share is the obvious default, using the existing 800 m²/floor `wbs_node_quantities`). Items without a match stay `missing_quantity` — visible, not guessed.
3. **Norms:** start from real DWL data where it exists (e.g. C30 columns). Everything else is a **draft starter norm labelled "assumption — validate"** and approved by the site/QS team; the Cambodia market-rates file has rates only, no productivity. I will not present unvalidated numbers as facts.
4. Generate assignments from norms; compare against the current hand-mapped seed to sanity-check headcounts, then replace the seed.
5. Local first; the user promotes migrations with `/dbpush`. The production project is never touched by Claude.

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
| Levelling cost | The engine is now incremental (~2.5 s for 595 tasks); multi-resource adds cost — re-measure in Phase 5. |

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
