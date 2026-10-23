# Planning (key: `planning`)

> Mapped 2026-10-22 from code, migrations and docs. Code wins if it disagrees; fix this file.

## 1. Purpose and pages
- Schedule (CPM), look-ahead, resources, delays, productivity norms and the Activity Library that generates WBS activities. It is the time side of the WBS spine.
- **Release:** `release.ts` has no `planning` key, so every page is `development` and is hidden unless switched on in Module Settings / `nav_item_settings` or with `NEXT_PUBLIC_DCOS_SHOW_DEV_FEATURES=true`.
- Nav comes from `lib/planning/planning-nav.ts`, via manifest `lib/modules/manifests/planning.ts` (prefix `/dashboard/planning`).
- **Schedule:** Overview, Dashboard, Gantt, Sheet (grid editor), Look-ahead (`/dashboard/wbs/lookahead`, with the Weekly Plans, S-Curve & EVM and Progress Reviews tabs), Calendars, Comparison, MS Project Sync (`/sync`).
- **Resources & Reports:** Resources (loading), Members, Delay Register (+ TIA), Reports.
- **Productivity:** Norm Library, Task Work, BOQ Mapping, Cost Rollup, Site Records.
- **Activity Database** (own sidebar group, `/dashboard/planning/activity-database`, doc 23).
- **Activity Library:** Activities, Templates, Kits, Step Templates (`/activity-step-templates`), Generate (+ `runs/[id]`), QS Bridge, Quantity Links, BIM Quantities, Recovery, AI Assistant.
- **Not in the nav:** `/dashboard/planning/scurve`, and the client programme portal `app/portal/programme/[projectId]`.

## 2. Data model
- **Schedule data lives on the core `wbs_tasks` table.** Planning added `duration_unit` ('wd'/'cd', `20261003000005`), `manually_scheduled`, and the link arrays `dependency_task_ids` / `dependency_types` / `dependency_lag_days` (`20260903000001`).
- **Calendars, codes, timescale:** `plan_calendars`, `plan_calendar_exceptions` (`20260531000045`), `plan_wbs_code_mask` (`20260904000003`), `plan_timescale` (`…04`).
- **Resources:** `plan_resources`, `plan_task_assignments` (`20260905000004`).
- **Schedule governance:** `plan_schedule_streams`, `plan_schedule_revisions` (`20260905100449`), `plan_schedule_settings` (`20260917000002`), `plan_schedule_state` (`20260919000005`), `plan_revision_approvals`, `plan_report_jobs`, `plan_tia_scenarios`, `plan_levelling_runs` (`20260919…`).
- **Progress and baselines:** `progress_snapshots` (`20260531000003`), `weekly_plans` + `weekly_plan_tasks` (`20260531000008`), `wbs_baselines` (`20260527000016`), `delay_register` (`20260609000002`) + `delay_register_tasks` (`20260919000011`).
- **Steps:** `activity_step_template_master`, `activity_step_template_item` (weight, duration_basis, duration_share_pct), `wbs_task_steps` (weight, progress 0–100, est_duration_days) (`20260918000001`); `activity_step_template_match` (`20261020000002`).
- **Productivity:**
  - `plan_productivity_norms` and its resources (`20260922000005`).
  - `plan_task_work` (task_id PK, quantity, quantity_source, norm_id, crews, productivity_adjust_pct) (`…06`).
  - `plan_task_work_quantity_history` (`…07`), `plan_task_cost_lines` (`…10`), `plan_productivity_logs` (`…11`).
- **Activity Library, `plan_act_*`:**
  - Masters and hierarchy (draft→archived, versioned): `20261006000001`.
  - Knowledge: `…02`. Templates, items and dependencies: `…03`.
  - Generation runs, items and overrides: `…04`. Node quantities: `…05`. Quantity links: `…08`.
  - BIM maps, AI and recovery: `20261013000001–3`.
- **Activity Database (doc 23, `20261023091500`):**
  - `plan_act_divisions` (16 rows; `code` unique).
  - `plan_act_masters` gained `division_id`, `visible_code`, `trade`, `activity_type`, `min_duration_pct`, `max_duration_pct`, `image_path`.
  - `plan_act_master_work_items` (master_id, work_item_id, unique pair) links a master to `dwl_work_items`.
  - Private storage bucket `activity-images`.
  - Triggers `trg_plan_act_master_visible_code` (assigns the code) and `trg_plan_act_master_work_items_frozen`.
  - RPCs `plan_act_bank_search(q, p_division)`, `plan_act_division_counts()` (uuid versions, now wrappers).
- **Core CSI library (2026-10-23, `20261023122000`; see `docs/01-DCOS-Foundation/DCOS-CSI-Division-Standard.md`):**
  - `plan_act_masters.csi_division_code` (FK `csi_divisions`) and `csi_section_code` (FK `csi_sections`) replace `division_id`. Trigger `trg_plan_act_master_csi_sync` keeps them consistent.
  - `visible_code` is now `D<csi division>-NNN`. `plan_act_division_counters.division_code` is keyed on the CSI division (FK).
  - New RPCs `plan_act_csi_division_counts()` and `plan_act_bank_search(q text, p_division_code text)`. The uuid overloads stay as wrappers until cleanup.
  - **Frozen:** `plan_act_divisions` (writes rejected) and `plan_act_masters.division_id` (unused). Dropped in a later cleanup migration, only when no lanes are active.
- **QS bridge and generation inputs:**
  - `plan_work_groups`, `plan_act_qs_bridge` (`20261020000003`), `plan_location_map` (`…04`).
  - `plan_act_kits` / `plan_act_kit_items` (`20261021000022`), `plan_act_attributes` (`…23`), `plan_act_generation_profiles` (project_id PK, `…25`).
- **Triggers:**
  - `trg_wbs_tasks_sync_duration`
  - `trg_wbs_tasks_lock_guard` (`20260904000002`)
  - `trg_wbs_task_steps_recalc`
  - `trg_plan_task_work_compute`
  - `trg_prevent_locked_baseline_mutation` (`20260919000004`)
  - `trg_plan_act_master_guard` and the template/kit frozen guards
  - `trg_plan_productivity_norms_guard`
  - `trg_plan_productivity_log_from_timesheet` (`20260922000012`)
- **RPCs:**
  - Baselines: `set_baseline`, `activate_baseline`, `clear_baseline`, `accept_baseline_by_client`.
  - Scheduling: `apply_schedule_dates`, `apply_wbs_codes`, `move_project`.
  - Reads for screens: `get_critical_path_tasks`, `get_lookahead_tasks`, `get_schedule_variance`, `get_scurve_series`, `get_resource_allocation`, `get_portfolio_schedule`.
  - Snapshots: `capture_progress_snapshot`, `capture_schedule_revision`.
  - Work and cost: `recompute_task_work`, `plan_generate_resource_loading`, `plan_wbs_cost_rollup`, `apply_levelling_constraints`.
  - Activity Library: `plan_act_commit_generation`, `plan_act_ai_decide`.
  - Progress and delays: `submit_progress`, `decide_progress_review`, `create_eot_notice_from_delay`.
- **View:** `v_plan_client_programme` (`20260919000017`).
- **RLS, three patterns:**
  - Library tables: any authenticated user reads; writes need `can_manage_master_libraries()`.
  - Project tables: `is_project_member(project_id)` + `has_permission('planning', <resource>, <action>)`.
  - `plan_calendars`, `plan_calendar_exceptions` and `plan_resources` use the project pattern (`is_project_member` + `has_permission`), verified 2026-10-22.
  - Still `using (true)`: `wbs_task_steps` (ALL), and the core table `wbs_tasks` (select, insert, update).
  - Because project RLS depends on `is_project_member`, and `project_members` has only 3 rows (2 of 14 projects), non-admins see no project-scoped Planning data on most projects.

## 3. Code map
- **Pure engines (`lib/planning/`):**
  - `schedule-engine.ts`: CPM forward/backward pass, float, critical path, link-array helpers, `wouldCycle`.
  - `work-calendar.ts`: working-day maths.
  - `project-schedule.ts`: whole-project scheduling from a start date.
  - `work-engine.ts`: quantity × norm → hours, crew, duration.
  - Also `resource-levelling.ts`, `time-impact-analysis.ts`, `delay-analysis.ts`, `cost-engine.ts`, `timescale.ts`, `lookahead-filters.ts`.
- **Data access:**
  - `planning-queries.ts`: the screens' main DB gateway.
  - Also `productivity-service.ts`, `resource-service.ts`, `baseline-service.ts`, `schedule-service.ts`, `boq-mapping-service.ts`, `cost-service.ts`.
- **MS Project sync (`lib/planning/sync/`):** MSPDI parse, diff, commit and export.
- **Activity Library (`lib/planning/activity-library/`):**
  - Pure: `generation-planner`, `kit-plan`, `qs-bridge`, `bridge-calc`, `location-map`, `recovery-engine`, `scenario-compare`.
  - Each has an I/O `*-service.ts`. `generation-service.ts` commits runs atomically.
  - `ai/` is advisory only: the model picks among engine-produced options.
- **Activity Database:** services `activity-database-service.ts` (divisions, masters, links, bank search, duplicate/delete), `activity-import-service.ts` + `activity-database-import.ts` (workbook import to drafts), pure `logic-network-layout.ts`, `visible-code.ts`. UI `components/planning/activity-database/*`; page `app/dashboard/planning/activity-database/page.tsx`; nav item "Activity Database" (`development`).
- **Big components:** `components/planning/plan-schedule-view.tsx`, `gantt-view.tsx`, `sheet-grid.tsx` + `use-sheet-data.ts`, `plan-resource-loading.tsx`, `plan-delay-analysis.tsx`, `sync/sync-dashboard.tsx`.
- **Planning-owned files under `components/project/wbs/`:** `wbs-lookahead-view`, `wbs-lookahead-timeline`, `wbs-scurve-chart`, `wbs-gantt-view`.
- **Public API (`PUBLIC_API.planning`):**
  - `planning-nav.ts`
  - `public.ts`: `addAssignment`, `findOrCreateResourceForProfile`, and the QS-bridge re-exports (`listBridgeRules`, `listProjectBoqLines`, `listWbsLevels`, `listSavedLocations`, `listLevelGfa`, `loadMasterRates`, `listManualPairs`, `countBridgeLinks`, `applyBridgeLinks`, `refreshTaskWorkFromLinks`, `computeBridgeLinks`, plus types)
  - `work-calendar.ts`, `schedule-service.ts`, `baseline-service.ts`, `activity-steps-service.ts`, `activity-step-spread.ts`, `step-template-matching.ts`, `step-template-bulk-service.ts`, `wbs-code-mask.ts`, `schedule-engine.ts`, `project-schedule.ts`

## 4. Invariants
- **Duration is the input; dates are calculated.** Trigger `wbs_tasks_sync_duration()` (`20261003000005`):
  - If only the duration changes, `end_date` is recalculated.
  - Otherwise the dates win and the duration is recalculated.
  - A milestone has duration 0.
  - Default calendar is Mon–Sat, with `wd`/`cd` units.
- **Links live only in the three parallel arrays.** CHECK `wbs_tasks_dep_arrays_len` keeps their lengths equal (created **NOT VALID**, so legacy rows aren't checked). Convert with `depsFromArrays` / `depsToArrays`, and check loops with `wouldCycle` (`schedule-engine.ts`).
- **Steps lock once started** (`progress > 0`, `activity-step-spread.ts`). Re-spread skips locked steps.
- **Task progress is the weighted average of its steps** (`trg_wbs_task_steps_recalc`).
- **Locked WBS node:** only WBS managers can change its tasks (`trg_wbs_tasks_lock_guard`).
- **Locked baselines are immutable;** a revised baseline needs a reason (`20260919000004`).
- **Approved or active masters, templates, kits and norms are immutable:** change them through a new version (guard triggers). Approving norms needs the planning norms approve permission.
- **`visible_code` is unique on root masters;** new versions inherit it (`trg_plan_act_master_visible_code`). It must match `csi_division_code` (`D26-…` for division 26); a division change on a root master regenerates it.
- **Master guard (doc 23):** `csi_division_code`, `csi_section_code`, `visible_code`, `trade` and `image_path` may change on active masters; `activity_type` and min/max duration % are versioned.
- **`plan_act_master_work_items` is frozen unless the master is a draft** (`trg_plan_act_master_work_items_frozen`). M/E hrs per unit are read-only in Planning: they come from `dwl_work_item_resources`.
- **Not enforced:** the "no later than" constraints (flagged only, `schedule-engine.ts`), and step weights summing to 100 (UI warning only).

## 5. Integration points
See `integration-map.md`, rows tagged **Planning**.
- **Reads and writes core WBS:** `wbs_tasks`, `wbs_nodes`, `wbs_audit_log`, `wbs_node_quantities`, `projects`.
- **Reads QS:** `qs_boq_items` and `tender_boq_items` (bridge, BOQ mapping, productivity). It serves IPC progress through `get_node_progress_asof` (`20260919000013`).
- **Reads BIM:** `bim_models`, `bim_element_takeoff`.
- **Reads cost libraries:** `dwl_*`, `overtime_rates`.
- **HR:** timesheet → productivity-log trigger; resources map to `profiles`.
- **Construction:** daily report → planning sync RPCs; the site-diary panel uses `@/lib/construction/site/public`.
- **Document Control:** programme transmittal (`create_programme_transmittal`, writes `documents` / `document_revisions`).
- **Imported by:**
  - QS: the bridge dialog via `public`, and `cost-scurve` via `schedule-service`.
  - Project: award conversion via `baseline-service`; the WBS builder and task sheet via `project-schedule`, `wbs-code-mask`, `work-calendar`, `schedule-engine` and the step services.
  - Construction: site forms via `work-calendar`.
  - Core dashboards and EVM via `schedule-service`.

## 6. Status and gaps
- Feature-complete across schedule, resources, productivity and the Activity Library (A–E plus Generate G1–G6), but **nothing is released**.
- **Tests:** 41 files.
  - `lib/planning/__tests__`: schedule engine, work engine, levelling, TIA, delay governance, duration rules, step spread and matching, look-ahead filters, calendar, cost.
  - `lib/planning/activity-library/__tests__`: generation planner, kits, qs-bridge, bridge-calc, location map, recovery, scenarios, BIM/BOQ quantity.
  - `ai/__tests__`.
- **Security:** `using (true)` RLS on `wbs_task_steps` and on core `wbs_tasks`; project RLS blocked by the empty `project_members`. Six `NOT VALID` CHECKs on `wbs_tasks` (dep arrays length, no-self, types, hours, progress method, reviewer independent). Release plan: `docs/04-Business-Modules/06-Planning-Scheduling/22-Release-Readiness-Plan.md`.
- **Docs behind the code:** doc 19 says "nothing built" but the AI, recovery, BIM and scenario code exists; doc 21 says "for decision" but bridge phases 1–3 are built; docs 13 and 14 are unverified. Doc 23 (Activity Database plan) has an implementation status section. Docs folder: `docs/04-Business-Modules/06-Planning-Scheduling/` (00–12 standard pack, 13–21 plans; doc 21 is the QS bridge).
