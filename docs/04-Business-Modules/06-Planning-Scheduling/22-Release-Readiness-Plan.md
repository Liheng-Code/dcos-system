# Planning: Release Readiness Plan

| | |
|---|---|
| Document | 06 / 22 |
| Revision | R0, 2026-10-22 |
| Status | For decision. Nothing in this plan is built. Decisions D1 to D7 (section 7) are open |
| Basis | Local DB (`pg_policies`, `pg_proc`, `pg_constraint`, row counts) and code as of commit `1cd01c5`. As-built map `.claude/skills/dcos-architecture/references/planning.md` (2026-10-22) and its Planning rows in `integration-map.md` |
| Method | The `domain-planning` skill reference files (`programme-development`, `schedule-monitoring`, `delay-analysis`) are still **stubs** ("not yet written"), so the planning-practice check in section 4 uses standard CPM / baseline / look-ahead / EOT practice from the docs 01 to 21 and not a DCOS reference. Fill the stubs after this plan (D7) |

## 1. Verdict

**Planning is feature-complete but not releasable today. Wave 1 (core scheduling) can be released after about two lane phases and one core phase.** Nothing is released: `release.ts` has no `planning` key, so every page is `development` (hidden and route-blocked) until Module Settings or `release.ts` switches it on.

Four things block Wave 1:

1. **A non-admin planner sees an empty programme on 12 of 14 projects.** Every project-scoped Planning table (baselines, calendars, resources, assignments, revisions, snapshots, weekly plans) is gated by `is_project_member(project_id)`. That function passes only admins and `project_members` rows, and only 3 rows exist (2 of 14 projects). The project with 312 dated tasks (`6e4b9ce2…`) has no members, so its Gantt would load tasks but no baseline, calendar or resource (F1).
2. **The schedule itself is writable by any signed-in user.** `wbs_tasks` has `using (true)` for select, insert and update, and `wbs_task_steps` has `ALL … true`. A browser console can change dates, links and progress, and bypass the progress-review approval (F2, F3).
3. **Integrity rules the docs promise are only partly enforced.** Three dependency CHECKs are `NOT VALID`, step weights are not enforced, and a non-contract baseline can be overwritten with no history (F4 to F6).
4. **The high-risk write paths have no tests.** There are 41 test files, all on pure engines. MS Project sync, baseline service, planning queries, and the SQL functions have none (F9).

**Corrects the as-built map:** `plan_calendars`, `plan_calendar_exceptions` and `plan_resources` are **no longer** `using (true)`. They have permission + `is_project_member` policies on all four commands (verified in `pg_policies`). Only `wbs_task_steps` is still open among the legacy four. The map section 2 and section 6 must be fixed (section 8).

What is already right (keep it): CPM engine and its tests; duration/date trigger; locked-baseline trigger; contract baselines locked (2 of 2 rows); step-lock rule; `has_permission('planning', …)` rows for all roles (resources `baseline`, `calendars`, `delays`, `levelling`, `lookahead`, `members`, `norms`, `productivity`, `programme`, `progress_review`, `resources`, `schedule`, `task_work`, `tia`); RPCs are `security invoker`, so RLS applies to them.

## 2. Platform fact this plan assumes

DCOS runs as **one dedicated deployment per customer** (own Supabase and Vercel). `projects` has no `tenant_id` or `company_id`. This plan therefore adds **no `tenant_id` columns and no tenant RLS**. The isolation boundary inside a deployment is `has_permission(module, resource, action)` plus project access (`is_project_member`). Docs 04, 07, 09 and 10 of this folder still describe a `tenant_id` and `pln_*` model (finding F11).

Settled and not reopened here: schedule data stays on `wbs_tasks`; duration is input and dates are calculated; links live only in the three arrays; Mon to Sat default calendar; no phase-based navigation (pages are hidden only by roles, Module Settings and release status).

## 3. Release slices (waves)

Nav keys are `href` strings from `lib/planning/planning-nav.ts`; a page in a group also needs its group key in `release.ts` (`group:planning:<slug>`). Sub-tabs (`?sub=`) have no own key (they follow their parent; whether `/dashboard/wbs/lookahead`, which is outside the `/dashboard/planning` route prefix, is blocked or released with the group is **unverified**, see D6).

Row counts are from the local DB (production clone) and show which features have real data.

### Wave 1: Core scheduling (a planner can run a real project)

Group key `group:planning:schedule`.

| Page | Nav key | Depends on | Evidence ready / not ready |
|---|---|---|---|
| Overview | `/dashboard/planning/overview` | RPCs `get_schedule_variance`, `get_critical_path_tasks` | Ready. Reads `wbs_tasks` (1,998 rows, 7 projects, 3 with dated tasks) |
| Dashboard | `/dashboard/planning` | `schedule-service`, `schedule-engine` | Ready. `schedule-engine.test.ts`, `schedule-kpis.test.ts` |
| Gantt Chart | `/dashboard/planning/gantt` | `schedule-engine`, `work-calendar`, critical path marking in `gantt-view.tsx` | Ready after F2. 1,074 lines, no component test (F10) |
| Sheet | `/dashboard/planning/sheet` | `use-sheet-data.ts` (1,804 lines), duration trigger, steps | Needs F3, F4, F5 first (writes steps and links). Largest file in the module (F10) |
| Look-ahead (+ Weekly Plans, S-Curve & EVM, Progress Reviews) | `/dashboard/wbs/lookahead` | `get_lookahead_tasks`, `get_scurve_series`, `submit_progress`, `decide_progress_review` | Look-ahead and S-curve: ready. **Weekly Plans: 0 rows. Progress Reviews: 0 rows, `progress_review_enabled` false on all 2 settings rows.** Never exercised with real data (F8) |
| Calendars | `/dashboard/planning/calendars` | `plan_calendars` (3 rows), exceptions (1 row) | Ready; RLS fine. Exceptions barely used (F12) |
| Comparison | `/dashboard/planning/comparison` | `wbs_baselines` (5 rows), `get_schedule_variance` | Ready for date variance; baseline governance weak (F6) |

Wave 1 also requires the **creation path** a planner uses before any of these pages matter: WBS builder / Master WBS import (core, Project module, already released). The progress path (daily report to `sync_daily_report_to_planning`) is Construction-owned and is a Wave 1 dependency (F7).

### Wave 2: Resources, delays, reports, MS Project sync

Group key `group:planning:resources_reports` plus `/dashboard/planning/sync`.

| Page | Nav key | Depends on | Evidence |
|---|---|---|---|
| Resources | `/dashboard/planning/resource-loading` | `plan_resources` (13), `plan_task_assignments` (701), `get_resource_allocation`, levelling | Ready. `resource-levelling*.test.ts`, `resource-service.test.ts`. `plan_levelling_runs` 0 rows |
| Members | `/dashboard/planning/members` | `has_permission('planning','members',…)` | Ready; verify it works once project membership is fixed (F1) |
| Delay Register (+ TIA) | `/dashboard/planning/delays` | `delay_register` (0 rows), `plan_tia_scenarios` (0), `create_eot_notice_from_delay` | Engines tested (`time-impact-analysis`, `delay-governance`). **No real data, evidence trail incomplete (P4)** |
| Reports | `/dashboard/planning/reports` | `plan_report_jobs` (0), transmittal RPC | Unverified end to end. `create_programme_transmittal` writes Document Control tables |
| MS Project Sync | `/dashboard/planning/sync` | `lib/planning/sync/*`, `apply_schedule_dates` | **No tests on parse / diff / commit / export (F9).** Release only after P3 |

### Wave 3: Productivity and costing

Group key `group:planning:productivity`.

| Page | Nav key | Depends on | Evidence |
|---|---|---|---|
| Norm Library | `/dashboard/planning/productivity` | `plan_productivity_norms` (224) | Ready; approval guard trigger. `dwl-norm-import.test.ts` |
| Task Work | `/dashboard/planning/productivity/task-work` | `plan_task_work` (97), `trg_plan_task_work_compute` | Ready. `work-engine*.test.ts` |
| BOQ Mapping | `/dashboard/planning/productivity/boq-mapping` | reads `qs_boq_items`, `tender_boq_items` | Ready; `boq-matching.test.ts`. QS read coupling (F13) |
| Cost Rollup | `/dashboard/planning/productivity/cost-rollup` | `plan_task_cost_lines` (132), `plan_wbs_cost_rollup` | Ready; `cost-engine*.test.ts` |
| Site Records | `/dashboard/planning/productivity/site-records` | `plan_productivity_logs` (**0 rows**), timesheet trigger | Never run with data (F13) |

### Wave 4: Activity Library, generation, QS bridge

Group key `group:planning:activity_library`.

| Page | Nav key | Evidence |
|---|---|---|
| Activities | `/dashboard/planning/activity-library` | 233 masters; versioned, guard triggers. Library RLS is read-all, write needs `can_manage_master_libraries()` (fine, by design) |
| Templates | `…/activity-library/templates` | 35 templates |
| Kits | `…/activity-library/kits` | 14 kits |
| Step Templates | `/dashboard/planning/activity-step-templates` | 118 masters. Tests: `step-template-matching`, `activity-step-spread` |
| Generate | `…/activity-library/generate` | Only **1** generation run ever. `generation-planner` and `kit-plan` tested; `generation-service.ts` (730 lines, atomic commit via `plan_act_commit_generation`) untested end to end |
| QS Bridge | `…/activity-library/qs-bridge` | 239 bridge rules, 13 location maps, 20 work groups. Tests: `qs-bridge`, `bridge-calc`, `location-map` |
| Quantity Links | `…/activity-library/quantity-links` | 633 links |

### Wave 5: Advisory and specialist (release last)

| Page | Nav key | Evidence |
|---|---|---|
| BIM Quantities | `…/activity-library/bim` | 9 BIM metric maps; depends on Design module's `bim_element_takeoff`. Needs real models to prove |
| Recovery | `…/activity-library/recovery` | `recovery-engine`, `scenario-compare` tested. No run data |
| AI Assistant | `…/activity-library/ai` | Advisory only (model picks among engine options). Needs model cost / key policy first (D5) |

### Not in the nav

`/dashboard/planning/scurve` (duplicate of the Look-ahead S-curve tab) and the client portal `app/portal/programme/[projectId]` (view `v_plan_client_programme`). The portal exposes the programme to clients: security-review it before Wave 2 (F14).

## 4. Findings

Severity: **Critical** = exploitable now by any signed-in user; **High** = blocks a stated rule or a wave; **Medium** = integrity, test or maintainability gap.

| # | Sev | Wave | Finding | Evidence |
|---|---|---|---|---|
| F1 | Critical | 1 | Project-scoped Planning RLS depends on `is_project_member`, which is true only for admins and `project_members` rows. 3 rows across 14 projects. Non-admins see no baselines, calendars, resources, assignments or weekly plans on 12 projects; the 312-task project has no members. Profiles: 5 admin, 30 viewer, 34 other roles | `pg_policies` for `plan_*`, `wbs_baselines`, `weekly_plans`; `pg_get_functiondef(is_project_member)`; `select count(*) from project_members` = 3 |
| F2 | Critical | 1 | `wbs_tasks`, `wbs_nodes`, `wbs_node_quantities`, `wbs_audit_log` have `true` policies for insert/update (and select). Any user can rewrite dates, links, progress, baseline fields. Only the lock-guard trigger (locked WBS nodes) stands in the way. Core-owned tables | `pg_policies` (`Authenticated users can manage/update wbs_tasks` = `true`) |
| F3 | Critical | 1 | `wbs_task_steps` has one `ALL … true / true` policy. Anyone can set step progress (which recalculates task progress via `trg_wbs_task_steps_recalc`), weights and durations. 519 rows | `pg_policies` `wbs_task_steps authenticated all` |
| F4 | High | 1 | Three dependency CHECKs are `NOT VALID`: `wbs_tasks_dep_arrays_len`, `_dep_no_self`, `_dep_types_valid`. Also `_progress_method_check`, `_hours_nonneg`, `_reviewer_independent`. **Current data has 0 violations of the array-length rule**, so `VALIDATE CONSTRAINT` is safe for it (the others to be checked in the migration dry-run) | `pg_constraint.convalidated = f`; `select count(*) … array_length mismatch` = 0 |
| F5 | High | 1 | Step weights summing to 100 are a UI warning only. All 94 tasks with steps currently sum to 100, so a deferred constraint is safe. The step lock ("started = progress > 0") is also client-side only (`activity-step-spread.ts`); the RPC path `sync_daily_report_to_planning` writes step progress directly | `select … sum(weight)` = 0 bad of 94; `activity-step-spread.ts` |
| F6 | High | 1 | Baselines: `set_baseline` overwrites any non-contract slot in place (`on conflict … do update`), keeps no history, and `revised` needs only a 10-character reason with no approval. Only slot 0 is used (3 `current` slot-0 rows unlocked, 2 `contract` locked). `plan_revision_approvals` has 0 rows and all 5 `plan_schedule_revisions` are `draft`. The snapshot stores only id, start, end, budget cost (no duration, logic, calendar) | `pg_get_functiondef(set_baseline)`; `wbs_baselines` rows; counts |
| F7 | High | 1 | Daily report to schedule: `sync_daily_report_to_planning` is `security definer`, executable by `anon` and `authenticated`. It does check `is_project_member` (good), but because of F1 only admins pass, so site engineers who are not members cannot sync progress. It writes step progress directly (bypassing any step lock). 0 tasks have `actual_start_date` or `actual_finish_date` (1,998 rows); 0 progress reviews exist | `pg_proc`/ACL; function body; `select count(*) … actual_start_date` |
| F8 | High | 1 | Look-ahead workflow was never run with data: `weekly_plans` 0, `weekly_plan_tasks` 0, `wbs_task_progress_reviews` 0, `progress_review_enabled` false everywhere | row counts |
| F9 | High | 1 / 2 | No tests on the risky paths. 41 test files, all pure engines. None for `lib/planning/sync/*` (MSPDI parse, diff, commit, export), `baseline-service.ts`, `planning-queries.ts`, `schedule-service.ts`, or any SQL function / trigger / RLS policy. Component tests: none | `find lib/planning -name "*.test.ts"` = 41; `ls lib/planning/sync` has no `__tests__` |
| F10 | Medium | 1 | Large client components: `use-sheet-data.ts` 1,804 lines, `plan-schedule-view.tsx` 1,201, `gantt-view.tsx` 1,074, `gantt-task-detail-drawer.tsx` 947, `sheet-grid.tsx` 866. **No performance measurements exist** (unverified). The largest project has 802 tasks; production size is unknown | `wc -l`; counts per project |
| F11 | Medium | all | Docs behind the code (see table below): docs 04, 07, 09, 10 describe `pln_*` + `tenant_id`; 0 `pln_*` tables exist | `information_schema.tables like 'pln\_%'` = 0 |
| F12 | Medium | 1 | "No later than" constraints (`start_no_later_than`, `finish_no_later_than`) and ALAP are flagged by the engine only (`schedule-engine.ts` ~253). Only 1 task has any constraint (`start_no_earlier_than`), so real-world risk is low today | `wbs_tasks.constraint_type` counts |
| F13 | Medium | 3 / 4 | Integration risks: (a) Planning reads `qs_boq_items`/`tender_boq_items` directly (read-only, no public contract); (b) timesheet to productivity-log trigger `trg_plan_productivity_log_from_timesheet` has produced 0 rows (`plan_productivity_logs` = 0), never proven; (c) library tables (`plan_act_*`, `plan_work_groups`) have select `true`, acceptable as shared library data | `integration-map.md`; row counts; `pg_policies` |
| F14 | Medium | 2 | Client programme view `v_plan_client_programme` and `accept_baseline_by_client` (invoker, `anon` can execute) not reviewed for what a client sees. **Unverified** | `pg_proc` ACL |
| F15 | Low | all | `anon` has `EXECUTE` on every Planning RPC (default grant). They are `security invoker` so RLS still applies, but revoke from `anon` as hygiene | `proacl` |

Docs status (item 5 of the brief):

| Doc | Says | Reality | Action |
|---|---|---|---|
| 04, 07, 09, 10 | `pln_*` tables, `tenant_id`, CLIENT role JWT claim | Real model is `wbs_tasks` + `plan_*`; 0 `pln_*` tables; roles via `role_permissions` | Rewrite 04 from the as-built map; re-base 07 on `role_permissions` rows; 09 and 10 after P5 |
| 13 | "Proposed (not yet implemented)" | `get_resource_allocation` and constraint handling exist | Mark partly done; list what remains (F12) |
| 14, 15 | "Approved, not yet implemented" | `transition_revision`, TIA, delay governance, levelling exist | Mark status per item |
| 19 | "Plan, nothing built" | AI, recovery, BIM and scenario code exists | Mark built |
| 21 | "Design, for decision" | Bridge phases 1 to 3 built (239 rules, 633 links) | Mark decided and built; list gaps (norms, templates, tagging) |
| 17 | "Implemented & Verified" | Matches code; but 0 reviews / 0 actuals in data (F7, F8) | Keep; add data-verified note |

## 5. Planning-practice check (what a planner needs at go-live)

Only real gaps, each with evidence. Items marked "ok" are not listed.

| # | Need | Gap | Evidence | Wave |
|---|---|---|---|---|
| G1 | **Baseline approval and versioning.** A baseline is a controlled document: approved by someone with authority, never edited, superseded by a numbered revision with a reason | `set_baseline` overwrites unlocked slots; no approval step on baselines; revision approval table is empty and `transition_revision` has no UI workflow (doc 15 lists the workflow UI as not built) | F6; `plan_revision_approvals` = 0 | 1 |
| G2 | **As-built (actual) dates** | `actual_start_date` / `actual_finish_date` exist but are set on 0 of 1,998 tasks. Nothing derives them from progress. Delay analysis and EOT need actuals | column counts | 1 |
| G3 | **Critical path visibility** | Computed on read (`get_critical_path_tasks`, `schedule-engine`) and marked in the Gantt. Float and criticality are not stored per revision, so "critical at the time" is lost; `delay_register` stores `float_at_open` / `critical_at_open` (good) but has 0 rows | `wbs_tasks` has no float columns; `delay_register` columns | 1 / 2 |
| G4 | **Data date / status date** | Progress snapshot and S-curve exist (`progress_snapshots` 5). No explicit data date on the schedule that locks as-of reporting. **Unverified** whether `plan_schedule_state` carries it (0 rows) | `plan_schedule_state` = 0 | 1 |
| G5 | **Look-ahead workflow** (6-week look-ahead, constraints and make-ready, weekly plan commitments, PPC) | Screens, RPC and procurement constraint feed exist; never used (0 weekly plans). No PPC measure of plan reliability is shown as a first-class KPI **(unverified)** | F8 | 1 |
| G6 | **Progress measurement rules** (physical % by agreed method, one source of truth) | Four methods allowed on `wbs_tasks.progress_method` (`percentage`, `deliverable`, `quantity`, `milestone`), but the check is NOT VALID and progress can be set three ways: direct edit (open RLS), step average, daily report. Review approval is off | F2, F3, F4, F8 | 1 |
| G7 | **Calendar exceptions** (public holidays, rain days) | Table and UI exist; 1 exception row across 3 calendars. Cambodia public-holiday set not seeded **(unverified)**; task calendar assignment on `wbs_tasks` not confirmed | `plan_calendar_exceptions` = 1 | 1 |
| G8 | **Delay / EOT evidence trail** (notice, contemporaneous record, fragnet, assessment, decision) | Register records `eot_notice_id`, float and criticality at open/close; TIA engine and `create_eot_notice_from_delay` exist. No data; no check that a delay links the daily-report record (doc 17 says hindered activities flow to delays, `v_delay_count` in sync function) | `delay_register` = 0 | 2 |
| G9 | **Schedule quality check** (open ends, negative lags, excessive float, constraints) before baseline | Not found in code as a pre-baseline gate **(unverified)** | grep not exhaustive | 1 (should) |
| G10 | **Hand-off to client / DC** | Programme transmittal RPC exists; client portal view exists; not reviewed | F14 | 2 |

## 6. Phased plan

Rules for every phase: migrations are **additive only** (guarded `add column if not exists`, new functions, `validate constraint`), timestamped `YYYYMMDDHHMMSS_planning_<what>.sql`, dry-run in a rolled-back transaction, then applied. Only `database-engineer` writes migrations. Lane = Planning lane (`/lanes start planning:<topic>`). Core = main window. Cross = Agent Team or main window with the other module. Every state change emits an audit event (`wbs_audit_log`).

### P0: Make the data safe (before any wave)

| Item | Owner | Design | Done when |
|---|---|---|---|
| P0.1 Project membership (F1) | **Core** (Project) | Decision D1. Backfill `project_members` from existing task assignments, stakeholders and `profiles` role, and auto-add the creator and role-assigned members on project create; Administration screen to manage members | Every project has at least its manager as member; a non-admin planner sees baselines, calendars and resources on every project they work on |
| P0.2 Steps RLS (F3) | Lane | Replace `wbs_task_steps authenticated all` with four policies: select = task's project member or `has_permission('planning','schedule','view')`; insert / update / delete = `has_permission('planning','schedule','edit')` and project access. `trg_wbs_task_steps_recalc` and `sync_daily_report_to_planning` run as definer or already bypass; confirm in the dry run | A non-permitted user's step update fails; Sheet and daily-report sync still work for the planner role |
| P0.3 Schedule write guard (F2) | **Core** (+ Lane design) | Do not rewrite `wbs_tasks` RLS in this plan (every module reads it; membership is the blocker). Add a guard trigger, same pattern as `trg_wbs_tasks_lock_guard`: changes to scheduling columns (`start_date`, `end_date`, `duration*`, `dependency_*`, `constraint_*`, `manually_scheduled`, `schedule_level`, baseline columns) require `has_permission('planning','schedule','edit')`; `progress` changes require `schedule` edit or the task owner when `progress_review_enabled` is false, and `submit_progress` (definer-style flag, as in Procurement's guard) when it is true | A direct console update of dates by a viewer fails with a coded error; the Gantt, Sheet and daily report still save for a planner |
| P0.4 Validate constraints (F4) | Lane | `validate constraint` for `wbs_tasks_dep_arrays_len`, `_dep_no_self`, `_dep_types_valid`, `_hours_nonneg`, `_progress_method_check`, `_reviewer_independent` (after a violation count in the dry run; fix or exclude any with violations) | `convalidated = true` for all six, or each exception recorded |
| P0.5 Step weights (F5) | Lane | Deferrable constraint trigger: step weights per task sum to 100 at commit when a task has steps; server-side step lock (progress > 0 cannot change weight / basis) | Insert of a 90-weight set fails at commit; 94 existing tasks pass |
| P0.6 Hygiene (F15) | Lane | `revoke execute … from anon` on Planning RPCs; set `search_path` on definer functions | `proacl` has no `anon` for Planning RPCs |

### P1: Baseline governance and programme controls (Wave 1 blocker)

| Item | Owner | Design | Done when |
|---|---|---|---|
| P1.1 Baselines immutable (F6, G1) | Lane | `set_baseline` for an existing slot is refused when the slot exists and is not empty; new numbers (1, 2, …) are new rows; superseded baselines stay (`is_active` false). Snapshot adds `duration`, `calendar_id`, links so logic can be compared | An existing baseline cannot change; a revised baseline appears as a new numbered slot with a reason |
| P1.2 Baseline approval (G1) | Lane | Reuse `plan_schedule_revisions` + `transition_revision` + `plan_revision_approvals` (tables exist, 0 rows). Baseline state: `draft` to `submitted` to `approved` (approver has `programme.approve`, approver is not the submitter); `rejected` returns to `draft` with a reason. Only approved baselines can be active | Rejection path tested; an unapproved baseline cannot be set active; approval and rejection write audit events |
| P1.3 Actual dates (G2) | Lane + Cross | Trigger / RPC sets `actual_start_date` when progress first exceeds 0 and `actual_finish_date` at 100 (manual override allowed with reason). Daily-report sync path included | Tasks with progress carry actual dates; backfill documented |
| P1.4 Data date (G4) | Lane | Confirm or add `data_date` in `plan_schedule_state`; S-curve and variance use it | Reports show "as at <date>" |
| P1.5 Schedule quality gate (G9) | Lane | Pure function in `lib/planning/` (open ends, negative lag, constraints, missing calendar) run before submitting a baseline; warns, doesn't block | Unit-tested; shown in the baseline dialog |
| P1.6 Calendar defaults (G7) | Lane | Seed a project calendar template with the national public holidays as a library entry (data decision D4) | A new project's calendar has holidays; scheduling skips them |

### P2: Tests for the high-risk paths (Wave 1 blocker, F9)

| Item | Owner | Done when |
|---|---|---|
| P2.1 SQL tests, run in a rolled-back transaction as `authenticated` with a test JWT: step RLS (P0.2), schedule write guard (P0.3), baseline immutability and approval (P1.1, P1.2), duration/date trigger, link-array constraint, lock guard | Lane (`database-engineer` + `backend-engineer`) | Script in `supabase/tests/planning/` documented and green; failure modes listed in section 7 of the plan are covered |
| P2.2 Vitest: `baseline-service`, `schedule-service`, `planning-queries` mappers (pure parts), actual-date rules, quality gate | Lane | `pnpm test` green; new files named in the PR |
| P2.3 Component smoke / performance check on `plan-schedule-view`, `gantt-view`, `use-sheet-data` with the 802-task project and a synthetic 5,000-task set | Lane | Measured load and edit times recorded in this doc; if a screen exceeds the target (D3 default: first paint under 3 s at 2,000 tasks) a ticket is raised before release |

### P3: MS Project sync tests (Wave 2 blocker)

| Item | Owner | Done when |
|---|---|---|
| P3.1 Fixture-based tests for MSPDI parse, diff, commit, export with real exported files (dependencies with lag, constraints, calendars, resources, 1,000+ tasks) | Lane | Round trip (export then import) yields no diff; unknown fields reported, not silently dropped |
| P3.2 Sync writes honour P0.3 guard and baseline immutability | Lane | An import by a viewer is refused; import never changes an approved baseline |

### P4: Look-ahead, progress review and delay evidence (Wave 1 to 2, process readiness)

| Item | Owner | Done when |
|---|---|---|
| P4.1 Run the Look-ahead / Weekly Plan / Progress Review flow end to end on one real project (planner, site engineer, project manager) and fix what breaks | Lane + Construction (Cross for daily report) | Two weekly plans committed and closed; PPC shown; progress reviews approved and rejected paths demonstrated |
| P4.2 Decide `progress_review_enabled` default (D2) | Core / user | Default documented in `plan_schedule_settings` and the SOP |
| P4.3 Delay evidence: a delay links to a daily-report record, stores float / criticality at open and close, and cannot reach "EOT issued" without the evidence fields (`eot_notice_id`, assessment note) | Lane | A delay can be raised from a hindered daily-report line; EOT notice created with the evidence attached; rejection returns to review with a reason |

### P5: Docs and map (every wave)

| Item | Owner | Done when |
|---|---|---|
| P5.1 Fix docs per the table in section 4; rewrite 04 and 07 from as-built; update 09 (test plan) and 10 (deployment notes) with the SQL tests and release steps | Lane (`docs-writer`) | F11 closed |
| P5.2 Update `references/planning.md` sections 2, 4 and 6 (calendar/resource RLS corrected, new guards, tests) and `integration-map.md` | Lane | Map matches the DB |
| P5.3 Fill the three `domain-planning` reference stubs (D7) | Lane / user | Stubs replaced |

### Release switch per wave (done in the main window, core)

Each edit is to `apps/web/lib/modules/release.ts` only. Alternative for a pilot customer without a code change: switch the pages on in Administration > Module Settings (`nav_item_settings`).

| Wave | Gate (all of) | `release.ts` edit |
|---|---|---|
| **1** | P0.1 to P0.6, P1.1 to P1.3, P2.1 to P2.2 done; local smoke test by a non-admin planner on 2 projects | `planning: ["group:planning:schedule", "/dashboard/planning/overview", "/dashboard/planning", "/dashboard/planning/gantt", "/dashboard/planning/sheet", "/dashboard/wbs/lookahead", "/dashboard/planning/calendars", "/dashboard/planning/comparison"]`. **Not** `"all"`; keep `/dashboard/planning/sync` out |
| **2** | P3, P4.3, F14 review | Add `group:planning:resources_reports`, `/dashboard/planning/resource-loading`, `/dashboard/planning/members`, `/dashboard/planning/delays`, `/dashboard/planning/reports`, `/dashboard/planning/sync` |
| **3** | Productivity data proven: one real project with logs from site records and a timesheet; F13(b) closed | Add `group:planning:productivity` and its 5 hrefs |
| **4** | Generate run on one real project, approved by the planner; QS bridge reviewed by QS | Add `group:planning:activity_library` and `…/activity-library`, `/templates`, `/kits`, `/dashboard/planning/activity-step-templates`, `/generate`, `/qs-bridge`, `/quantity-links` |
| **5** | AI cost / key policy (D5); real BIM model | Add `/bim`, `/recovery`, `/ai` (or switch the module to `"all"`) |

After the Wave 1 edit, the production deployment needs only the migrations (user runs `/dbpush`) and the redeploy.

## 7. Decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Project access for Planning RLS (F1). Who fills `project_members`? | A: backfill + auto-add on project create + admin screen. B: relax Planning policies to permission-only (drop `is_project_member`). C: do nothing, admins only | **A.** Keeps the project boundary and matches the Procurement D1 outcome. B is the fallback if A cannot ship before the pilot, as a temporary migration with a re-tighten date |
| D2 | `progress_review_enabled` default for new projects | A: off (direct progress, fast, no approval). B: on (site submits, planner approves) | **B for contracts with a client programme, A for tender / internal.** Reviews are the evidence trail for payment and EOT; but it needs P4.1 to prove the workflow first. Setting is per project |
| D3 | Size target for P2.3 | A: 2,000 tasks first paint under 3 s. B: 5,000 tasks | **A** for Wave 1 (largest project today is 802 tasks); raise to B before Wave 3 |
| D4 | Public holidays seed (G7) | A: seed Cambodia calendar. B: leave to each customer | **A as an optional library calendar** copied into a project; customer edits it. Needs the holiday list from the user (**do not invent dates**) |
| D5 | AI Assistant (Wave 5) key and cost policy | A: per-deployment key owned by the customer. B: not offered until a policy exists | **B** until the licensing design decides |
| D6 | Release `/dashboard/wbs/lookahead` with Planning? It sits outside the `/dashboard/planning` route prefix and belongs to the WBS routes | A: release as part of Planning Wave 1 (as the nav does). B: move the route under `/dashboard/planning` | **A now**; B later (core route change). Verify route blocking behaves after the `release.ts` edit |
| D7 | `domain-planning` reference stubs | A: fill from docs 14, 15, 17 and this plan. B: leave | **A** (P5.3); the planning-manager agent otherwise has no rules to check against |
| D8 | `wbs_tasks` open RLS (F2): guard trigger now (P0.3) or full RLS rewrite | A: guard trigger on scheduling / progress columns. B: rewrite policies (project + permission) | **A now**; B only after D1 is done, as a separate core decision for all modules that read tasks |

## 8. Open Questions

1. **Tenancy rule in the agent file.** The system-architect agent file still says every table carries `tenant_id` and RLS reads it from the JWT. That is out of date for this platform (dedicated deployment per customer, no `tenant_id` on `projects`). This plan applies permission + project access instead. Options: A: update the agent file and skill. B: keep and treat as exception per module. Recommendation: A, so future designs don't re-add `tenant_id`.
2. Who maintains `project_members` on the 12 projects without members (D1)?
3. Which baseline approver role: `programme.approve` for all, or a separate `baseline.approve` action? Only `baseline.{view,create,edit,delete}` and `programme.approve` rows exist today. Options: A: use `programme.approve`. B: add `baseline.approve`. Recommendation: B (clearer RBAC; additive `role_permissions` rows, seeded with the same roles as `programme.approve`).
4. Should a contract baseline be settable only at award (current behaviour via `award-conversion-dialog`)? Recommendation: yes.
5. Is MS Project sync required for the first customer? If yes, P3 moves into Wave 1.
6. What is the production dataset size (tasks per project)? Needed to confirm D3.
7. Does the customer need the client programme portal in Wave 1 (F14)? Recommendation: no, Wave 2.
8. Which of docs 13 to 15 items remain to build after P1 (constraint enforcement F12 is the known one)?

## 9. Hand-off Checklist

Adjusted for the platform: `tenant_id` is **not** required (see section 2).

- [ ] Verdict and wave split approved by human
- [ ] Decisions D1 to D8 answered
- [ ] P0 table list reviewed: every changed policy uses `has_permission('planning', …)` and project access, no `tenant_id`
- [ ] All rejection paths defined: baseline rejection (P1.2), progress review rejection (P4.1), delay / EOT rejection (P4.3)
- [ ] Migrations confirmed additive and timestamped; dry-run first
- [ ] Money columns unchanged (`numeric(18,2)`); no money logic added by this plan
- [ ] Integration points listed: Project (membership, award baseline), Construction (daily-report sync), QS (bridge, BOQ reads), HR (timesheet trigger), Document Control (transmittal), Procurement (constraint feed)
- [ ] Core requests listed: P0.1, P0.3, `release.ts` edits per wave, D6 route move, `module-boundaries.mjs` if new public files
- [ ] `commercial-qs` review: not needed (no money module); QS reviews the bridge before Wave 4
- [ ] `references/planning.md` and `integration-map.md` updated after each wave

## 10. Evidence index

Queries run on the local DB on 2026-10-22: `pg_policies` for `plan_*`, `wbs_*`, `weekly_plans`, `delay_register`, `progress_snapshots`; `pg_get_functiondef` for `is_project_member`, `set_baseline`, `sync_daily_report_to_planning`; `pg_constraint` for `wbs_tasks`; `proacl` of Planning RPCs; row counts for the tables named above; `role_permissions` for module `planning`. Code read: `lib/modules/release.ts`, `features.ts`, `lib/planning/planning-nav.ts`, `lib/modules/manifests/planning.ts`, `lib/planning/schedule-engine.ts` (constraint handling), `wc -l` of Planning components, test file list. **Unverified:** page-level behaviour in a browser, component performance, `plan_schedule_state` contents, the client portal view, quality-gate presence in code, and whether Weekly Plans / Progress Reviews work with real data.
