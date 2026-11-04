# 24 — BOQ-Driven Programme Plan (approved BOQ → programme, cost loading, manpower histogram)

> Status: approved 2026-10-23. Builds on doc 23 (Activity Database) and DCOS-CSI-Division-Standard.

## Context
The Activity Database, the CSI library and the BOQ item dialog were built so that **one shared data chain** links QS and Planning:

```
BOQ line (tender / contract) ──dwl_work_item_id──► BOQ item (dwl_work_items)
     qty, amount, building/level                    ├─ manpower/equipment hrs per unit (dwl_work_item_resources)
                                                    └─ plan_act_master_work_items (share %, days/unit)
                                                              ▼
                                                    Master activity (CSI division, logic rules, crew)
```

**The goal:** once QS approves the BOQ, the system proposes the construction programme on its own:
- tasks per location, with quantity, duration and logic;
- cost loading;
- a manpower histogram.

The planner reviews it and commits.

**Today the chain is not joined up:**
- **Approval:** approval and award are client-side only (`setTenderStage`, `decideApprovalStep`), with no hook.
- **BOQ → BOQ item:** only 9 of 887 tender lines have `dwl_work_item_id`, and `carryOverBoq` (`lib/qs/qs-service.ts:2708`) drops it, along with location and classification, when it creates the contract BOQ.
- **BOQ item → activity:** `plan_act_master_work_items` has 0 rows, and no engine reads it.
- **Generator:** template/kit-driven (`generation-planner.ts`); it gets quantities through classification bridge rules, and never uses BOQ item links or master logic rules.
- **Cost and manpower:** `wbs_tasks.budget_cost` = 0 everywhere, so the S-curve falls back to duration weighting. The histogram uses only manual `allocation_percent` assignments, and the resource-hours data is mostly placeholders.

**Decisions (from the user):**
- **When:** offer generation when management approves the tender BOQ, and carry it into the contract at award. Every run shows a **preview first**.
- **Duration:** from **man-hours** = qty × hrs/unit, ÷ (crew × hours/day). The fallback is days/unit × qty.
- **Cost loading:** **BOQ value** (line amount × share %), spread over each task's dates, so the total always equals the approved BOQ.

## Phase 1: Complete the data chain (QS + Planning, additive migrations)
1. **Contract BOQ keeps the mapping.**
   - Add to `qs_boq_items`: `dwl_work_item_id`, `building_code`, `level`, `discipline`, `section`, `sub_section`, `sub_element` (all nullable).
   - `carryOverBoq` copies them and sets `source_tender_boq_item_id`.
2. **BOQ line → BOQ item mapping in QS.**
   - A "Map to BOQ item" column and bulk tool in the tender BOQ / cost estimation screens, plus a pure suggester `lib/qs/boq-item-matcher.ts`. It scores candidates by:
     - an exact `item_code` / work-item code match;
     - unit equality;
     - CSI section;
     - Element Library classification (reusing the `qs-bridge.ts` `classifyLine` fields);
     - name token similarity.
   - High-confidence matches are auto-accepted on request; the rest go to a review list.
   - Reuse the existing quick-assign path from Cost Library → Tender BOQ (memory: `rate_build_up.basis`).
3. **BOQ item → master activity links.**
   - An "Auto-suggest links" action in the Activity Database proposes links by:
     - CSI section, then division;
     - unit compatibility;
     - name similarity.
   - The planner accepts suggestions in bulk (draft masters only; for active masters a new version is offered).
   - Pure helper: `lib/planning/activity-library/link-suggester.ts`.
4. **Crew data on masters.** Add `crew_size` (default workers per crew) and `hours_per_day` (default 8) to `plan_act_masters`. They are editable catalogue fields in the Details tab's Identify grid.
5. **Data readiness report** (pure `lib/planning/boq-programme/readiness.ts` plus a panel), per project. It shows the share of BOQ **value** that is:
   - mapped to a BOQ item;
   - linked to an activity;
   - carrying time-based labour hours (hr/unit, not placeholders);
   - located (building/level resolved through `plan_location_map`).

   It lists the blocking lines with a one-click jump to fix each.

## Phase 2: BOQ-driven programme generator (Planning)
- **Pure engine `lib/planning/boq-programme/boq-programme-planner.ts`.**
  - **Inputs:**
    - approved BOQ lines (qty, amount, `dwl_work_item_id`, building/level);
    - the confirmed location map with split rules (`location-map.ts`, `plan_location_map`);
    - work item → master links (share %, days/unit);
    - resource consumption per work item;
    - masters (crew, hours/day, min/max duration %, CSI);
    - `plan_act_logic_rules`;
    - the project calendar and planned project duration.
  - **For each line**:
    1. Resolve the level node(s), splitting "All" or typical-floor lines by GFA share (as `bridge-calc.ts` `allocateLine` does).
    2. For each linked master, accumulate into a task keyed **(master × level node)**:
       - quantity += qty × share;
       - man-hours per resource += qty × share × consumption (time units only);
       - budget += amount × share;
       - traceability rows (line, share, qty, amount).
  - **Duration:**
    - labour man-hours ÷ (crew_size × hours/day), rounded up to working days;
    - fallback: qty × days/unit;
    - then clamped to the master's min/max duration % of the planned project duration, when both are set.
  - **Logic:**
    - master logic rules applied within each level node;
    - the same master on consecutive levels linked FS (floor-to-floor, reusing the inter-level setting from `generation-planner.ts`);
    - dependency arrays built with `depsToArrays` / `wouldCycle` (`schedule-engine.ts`).
  - **Output:** a preview of tasks with quantity, duration, budget, man-hours by resource and confidence, plus warnings: unmapped lines, missing links, non-time hours, unresolved locations.
- **Commit RPC `plan_boq_commit_programme(jsonb)`**, one transaction, modelled on `plan_act_commit_generation`. It:
  - inserts `wbs_tasks` under the level nodes, with `activity_master_id`, `duration_days`, `budget_cost` and dependency arrays;
  - writes `plan_task_work` (quantity, unit, source 'boq');
  - writes a new traceability table `plan_task_boq_lines(task_id, tender_boq_item_id | qs_boq_item_id, share_pct, quantity, amount)`;
  - writes a new table `plan_task_resource_hours(task_id, dwl_resource_id, hours)`;
  - records a run in `plan_act_generation_runs` (source 'boq').
  - Dates are then calculated by the existing CPM (`project-schedule.ts` / `apply_schedule_dates`).
- **Re-run when the BOQ changes.** The preview shows a diff of added, changed and removed tasks. Started or locked tasks are never changed (`trg_wbs_tasks_lock_guard`, `progress > 0`). Changed quantities update the work, budget and hours of unstarted tasks.
- **Page:** Planning › Activity Database › "Generate from BOQ" (or `/dashboard/planning/boq-programme`). It holds the readiness panel, the preview table grouped by building → level → CSI division, then commit.

## Phase 3: Cost loading and manpower histogram
- **Cost loading:**
  - `budget_cost` is now filled, so `get_scurve_series` weights by BOQ value as it is.
  - Add RPC `plan_cost_loading(project, period 'week'|'month')`: budget spread evenly over each task's working days (`work-calendar.ts` rules in SQL). It returns the planned value per period, plus cumulative totals by CSI division.
  - Show it in Planning reports and in the S-Curve & EVM tab.
- **Manpower histogram:**
  - Add RPC `plan_manpower_histogram(project, period, group 'resource'|'trade'|'division')`: `plan_task_resource_hours` spread over each task's working days, giving man-hours and headcount (hours ÷ hours/day) per period. Equipment hours come the same way.
  - Feed `ManpowerHistogramCard` (`planning-resource-charts.tsx`) and the resource loading page (`plan-resource-loading.tsx`), using BOQ-based hours when present and the existing allocation % otherwise.
- **Margin check (secondary):** man-hours × labour rates (`plan_resolve_labor_rate`) as a second line against BOQ value, shown only where rates exist.

**Status (2026-10-27): built.**
- **Migration `20261027081636_boq_programme_phase3.sql`** (read-only, SECURITY INVOKER) adds:
  - `plan_project_workdays` (the default calendar plus exceptions; Mon–Sat when the project has none);
  - `plan_period_start` and `plan_trade_label`;
  - `plan_cost_loading(project, period, basis 'current'|'baseline')`. It returns `periods` with value and cumulative, `divisions`, `cells` (period × division), the budget left out because it has no dates, and `margin` (labour hours × daily rate ÷ calendar hours/day);
  - `plan_manpower_histogram(project, period, group, basis)`. It returns `periods` with hours, average headcount (hours ÷ (hours/day × working days in the period)) and daily peak per kind, plus `series` and `cells` per group.
- **How it spreads:** each task's value is split evenly over its working days. A task with no working day in its span is booked on its start date.
- **Code:**
  - `lib/planning/boq-programme/loading-service.ts` holds the RPC wrappers;
  - `loading-view.ts` is the pure chart shaping (top 8 groups plus Other, cumulative %, margin) and has tests;
  - `components/planning/boq-programme/loading-charts.tsx` holds `CostLoadingCard`, `BoqManpowerHistogramCard` and `useHasBoqHours`.
- **Where it shows:**
  - **S-Curve & EVM:** cost loading;
  - **Schedule Reports:** both charts;
  - **Resource Loading:** the BOQ histogram, when the project has BOQ hours;
  - **Planning dashboard:** `ManpowerHistogramCard` uses BOQ hours when present, and otherwise the allocation-% chart as before.

## Phase 4: Hook into approval and award
- **Approval:** when management approval completes (`lib/qs/tender-approval.ts` `decideApprovalStep` → bid `final`), QS shows a "Generate tender programme from BOQ" call-to-action. It opens the Phase 2 page with the readiness panel.
- **Award:** the award dialog (`components/project/projects/award-conversion-dialog.tsx`) gets a step "Refresh programme from contract BOQ" before `setBaseline`. It re-runs the generator in diff mode against the contract BOQ (`qs_boq_items`, which now carries the mapping), so the baseline includes BOQ-based quantities, cost and hours.
- No DB trigger writes the schedule automatically; it is always preview → commit, as decided.

**Status (2026-10-27): built, without migrations.**
- **Approval:** once the bid is approved, Bid Approval (`precontract/control-sections.tsx`, `TenderProgrammeCta`) shows how many tender lines are mapped. It links to `/dashboard/planning/boq-programme?project=<id>&source=tender`, and the page now reads `project` and `source` from the URL.
- **Award:** `award-conversion-dialog.tsx` has the option "Refresh programme from contract BOQ". It is shown when tender lines are mapped and the BOQ is carried over.
  - When the dialog opens, it runs a read-only preview on the tender BOQ: activities added, updated and kept, plus budget.
  - On award, it runs after the BOQ carry-over and before the baseline: `previewBoqProgramme` (contract) → `commitBoqProgramme`, which uses the default scheduling rule.
  - If that step fails, it lands in the dialog's "not carried forward" list. For example, it fails when the person awarding has no Planning schedule edit permission or isn't a project member.
- **Public API:** `lib/planning/boq-programme/boq-programme-service.ts` was added to the Planning `PUBLIC_API`.

## Modules and execution
- This is cross-module (QS, Planning, and the core award dialog under `components/project`), so it runs from the main window.
- Phases ship in order: each one is usable on its own, and Phase 1 data quality decides how good Phase 2 output is.
- Per phase:
  1. `qs-manager` / `planning-manager` check the rules (matching, splitting, duration clamp, logic);
  2. `database-engineer` writes the additive migration with a real timestamp;
  3. `backend-engineer` builds the pure engines and tests, then the services;
  4. `frontend-engineer` builds the screens;
  5. `code-reviewer`;
  6. `docs-writer`: new doc `docs/04-Business-Modules/06-Planning-Scheduling/24-BOQ-Driven-Programme-Plan.md` and architecture maps.
- **Test project:** `PJR-2026-003`. It has 887 tender lines, a confirmed location map and bridge links. First fix its half-run award state (stage 'awarded', type 'tender'): either re-run award or use it as a tender.

## Verification
- **Unit tests (pure engines):**
  - **Matcher scoring.**
  - **Planner:**
    - one line split over 3 levels;
    - two lines feeding one task;
    - share % sum;
    - man-hour duration with the crew fallback;
    - min/max clamp;
    - floor-to-floor logic without cycles.
  - **Readiness percentages.**
  - **Cost and hours spread over the calendar**, with Mon–Sat and holidays.
- **Invariants checked in SQL after a commit on `PJR-2026-003`:**
  - Σ `wbs_tasks.budget_cost` of generated tasks = Σ mapped BOQ amount;
  - Σ `plan_task_resource_hours` = Σ qty × share × consumption;
  - every generated task has ≥ 1 `plan_task_boq_lines` row;
  - there are no dependency cycles.
- **UI:**
  1. Map the BOQ lines and check the readiness panel.
  2. Preview, then commit.
  3. Check the Gantt has dates and logic.
  4. Check the S-curve total equals the BOQ total.
  5. Check the histogram shows man-hours by trade per week.
  6. Change a BOQ quantity, re-run, and check the diff updates only unstarted tasks.
  7. Award the project and check the contract BOQ keeps the mapping and the baseline captures it.
- `pnpm typecheck && pnpm lint && pnpm test` after each phase.
