# 35 — ICPS Gap Register and Roadmap

> Status: R0, 2026-11-02. Source requirements: doc 34 (Intelligent Construction Planning System PRD, ICPS-PRD-001).
> Method: three read-only code checks of `apps/web/lib/planning`, `components/planning`, `app/dashboard/planning` and `supabase/migrations`; five findings re-checked by hand.
> Use: the to-do list for the Planning module. Update **Status** as each item lands; keep evidence as `file:line` or a migration name.

## 1. Summary
DCOS Planning already covers most of the PRD. It has:
- a pure CPM engine, calendars, and an Activity Library with versioning and approval;
- the QS bridge and the BOQ-driven programme (doc 24), productivity norms, and cost and manpower loading;
- levelling, baselines with a revision approval workflow;
- delays and TIA, recovery options, MS Project sync, the project S-curve (doc 33) and an AI assistant whose actions are audited.

The gaps are mostly **correctness and control**, not missing screens:
1. **The engine ignores actual progress and the data date.** It has one calendar per project and can't produce negative float.
2. **There is no schedule QA/QC.** No DCMA-style checks, no findings register and no gate before a baseline.
3. **Progress and baselines can bypass review.** The daily-report sync writes straight to the schedule, and `set_baseline` can overwrite a baseline in place.
4. **Mapped quantities are not reconciled against the BOQ,** and nothing reviews the impact when a BOQ quantity changes.
5. **Planning sends nothing out** to Procurement, HR, QA/QC, Document Control or Finance.
6. **No Planning page is released** (`lib/modules/release.ts` has no `planning` key; blockers are in doc 22).

**Decisions (2026-11-02):**
- Release blockers and engine correctness come first.
- Guided mode is a **readiness checklist**, not a wizard; project setup wizards were removed on purpose.
- The engine moves to **`packages/scheduling-engine`**.

## 2. Gap register
Status: **done**, **partial** or **missing**. "Todo" refers to §3.

### Scheduling engine (PRD §9, §20)
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| FS/SS/FF/SF, forward and backward pass | done | `lib/planning/schedule-engine.ts:197-216`, `:304-321` | — |
| Positive and negative lag | done | `schedule-engine.ts:42`; tests `schedule-engine.test.ts:48,56` | — |
| Lag calendar | partial | lag always in project working days | E3 |
| Per-activity calendar | missing | engine takes one `WorkCalendar` (`:162`); no `wbs_tasks.calendar_id` | E3 |
| Holidays and exceptions | partial | project calendar only (`project-schedule.ts:106-124`); no engine test | E3, E8 |
| Constraints | partial | SNET/MSO/FNET/MFO enforced (`:94-99`, `:225-233`); SNLT/FNLT only flagged (`:253-267`); ALAP approximated | E4 |
| Actual dates, remaining duration, data date | missing | `EngineTask` has no actual or remaining fields (`:46-58`); data date is used only as the project start (`use-sheet-data.ts:563`) | E2 |
| Total and free float | done | `:329-362` | — |
| Negative float | missing | late finish anchored at project finish; deadlines don't feed the backward pass | E4 |
| Critical path to a chosen milestone; multiple paths | missing | threshold only (`:358`) | E5 |
| Whole-network cycle detection | done | Kahn plus `extractCycle` (`:110-155`) | — |
| Open-ended and dangling-link diagnostics | missing | dangling links silently ignored (`:121-122`) | E6 |
| Calculation-run record (version, input, warnings) | missing | `plan_schedule_state` holds only critical IDs and finish (`20260919000005`) | E6 |
| Independence from UI and database | done | engine imports only `./work-calendar` | E1 (package) |
| 5,000 activities in under 10 s | missing (untested) | `queue.shift()` (`:131`); day-by-day calendar walks (`work-calendar.ts:123,141,163`) | E7 |
| Reference test suite (20 categories) | partial | covered: link types, lags, cycles, thresholds, SNLT/ALAP; missing: calendars, holidays, multiple critical paths, open ends, milestones, actuals, remaining, negative float, large network | E8 |

### MOD-01 Project planning setup
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Calendars, working days, holidays | done | `plan_calendars`, `plan_calendar_exceptions` (`20260531000045`) | — |
| Project milestones (contractual) | done (local) | `plan_contract_milestones` + history (`20261103091800`); Planning › Contract Milestones | I1 |
| Progress calculation method | partial | `progress_method` only in task-team planning (`20261013000005`), not a schedule setting | P3 |
| Scheduling settings | done | `plan_schedule_settings` (`20260917000002`) | — |
| Calendar change → controlled recalculation | done (local) | `lib/planning/calendar-change.ts`; preview dialog on every calendar / exception edit | I2 |

### MOD-02 WBS
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Codes, hierarchy, templates, multi-building | done | `plan_wbs_code_mask`, WBS templates, Level Library | — |
| Revision history | done | `wbs_audit_log` (`20260527000016`), `wbs_baselines` | — |
| Delete restricted when records depend on a node | done (local) | trigger `wbs_node_delete_guard`, pre-check `wbs_node_delete_check` (`20261103091800`) | I8 |
| WBS responsibility | done (local) | `wbs_nodes.responsible_id` (`20261103091800`); Planning › Members | I8 |
| Import / export | done (local) | MS Project XML both ways; WBS + activities to Excel (`wbs-excel-export.ts`, MS Project Sync page) | I8 |

### MOD-03 Planning knowledge library
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Activity library, versioned and approved | done | `plan_act_masters` lifecycle (`20261006000001`), guard triggers | — |
| Productivity norms with source | done | `source`, `basis_note`, approval (`20260922000005`) | — |
| Norm version numbers | partial | lineage only through `source_norm_id` | later |
| Logic templates | done | `plan_act_template_dependencies` | — |
| Project overrides kept separate from the master library | done | `plan_act_overrides` (reason required) | — |
| Override vs standard visible to the user | missing | no comparison view | later |
| Cost benchmarks | missing | DWL cost libraries only | later |

### MOD-04 BOQ and quantity mapping
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| One-to-many and many-to-one mapping | done | `plan_task_boq_lines.share_pct` (`20261026155000`); `plan_act_quantity_links` (`20261006000008`) | — |
| Allocation by building / floor | done | `plan_location_map` (`20261020000004`) | — |
| Allocation by zone | done (local) | `plan_location_map.zone_split` (`20261102135540`), `allocateLine` zones | B5 |
| Unmapped items report | done | `bridgeCoverage()` (`qs-bridge.ts:122-198`) | — |
| Duplicate detection; shares add up to 100% | done (local) | `reconcile.ts` (counted twice, several routes, library shares) | B2 |
| Mapped vs BOQ reconciliation | done (local) | `plan_boq_mapping_facts` + BOQ Mapping Check page | B1 |
| Mapping revision history | done (local) | `plan_boq_mapping_history` (programme lines and links) | B3 |
| Quantity change → impact review | done (local) | `plan_boq_change_reviews`, `plan_decide_boq_change` | B4 |

### MOD-05 Schedule development
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Generate from templates, by building / floor, typical floors | done | Activity Library Generate (G1–G6), doc 24 | — |
| Durations from norms; overrides tracked | done | `work-engine.ts`, `plan_task_work` | — |
| Gantt, sheet, critical path, float | done | `gantt-view.tsx`, `sheet-grid.tsx` | — |
| Bulk editing | done (local) | `bulkUpdate` in `use-sheet-data.ts`, Edit selected in `schedule-view-bar.tsx` | U3 |
| Filtering and grouping | done (local) | `lib/planning/sheet-view.ts`, saved views `plan_saved_views` (`20261102144653`) | U3 |
| Undo / redo | done (local) | `lib/planning/edit-history.ts`, `history` in `use-sheet-data.ts` | U2 |
| Guided workflow for new planners | done (local) | readiness checklist on Overview, `plan_programme_readiness` (`20261102143702`) | U1 |

### MOD-06 Resource planning
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Labour / equipment / material resources | done | `plan_resources.resource_type` (`20260905000004`) | — |
| Manpower histogram | done | `plan_manpower_histogram` (`20261027081636`) | — |
| Equipment and material histograms | done (local) | equipment: `plan_manpower_histogram` (Equipment toggle); material: `plan_material_histogram` (`20261103080455`), card on Resources | C2 |
| Over-allocation; levelling that leaves the baseline alone | done | `is_overallocated`; `plan_levelling_runs`; audited | — |
| Planned vs available capacity over time | done (local) | `plan_resource_capacity` (`20261103080455`); `get_resource_loading`, levelling and the histograms use each day's capacity | C1 |

### MOD-07 Cost and cash flow
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Activity budgets, time-phased cost | done | `plan_cost_loading`; project S-curve (doc 33) | — |
| Labour / material / equipment components | done (local) | `plan_cost_components` (`20261103080455`): labour, material, equipment, subcontract per activity and per period | C3 |
| Planned cash flow | done (local) | `lib/planning/cost-plan/cash-flow.ts`; payment terms on `plan_schedule_settings` | C4 |
| Reconcile to approved budget | done (local) | `plan_budget_reconciliation` (`20261103080455`) + `lib/planning/cost-plan/budget-reconciliation.ts` | C5 |

### MOD-08 Baseline management
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Revisions, submit, approve / reject, history | done | `transition_revision` workflow (`20260919000010`); UI `plan-manage-schedules-dialog.tsx:594-599` | — |
| Approved baselines immutable | partial | contract baselines locked (`20260919000004`); `set_baseline` can overwrite non-contract slots in place | R3 |
| Full snapshot (durations, logic, calendars) | missing | stores id, start, end, cost only | R3 |
| Baseline comparison | done | `plan-comparison-dashboard.tsx:79-80` (up to three sources) | — |

### MOD-09 Progress management
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Actual dates, step progress, reviews | done | `submit_progress` / `decide_progress_review` (`20260919000009`) | — |
| Progress approved before it affects the schedule | partial | review off by default; daily-report sync writes directly (`20260928000005`) | R4 |
| Actual / remaining quantity per activity | missing | only `quantity_done` per daily-report line | P1 |
| Actual not above approved scope | missing | — | P2 |
| Weighted milestones; quantity method | missing | — | P3 |
| Progress history traceable to source | partial | `progress_snapshots`; no per-period approval link | P4 |

### MOD-10 Schedule control and QA/QC
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Variance, SPI, near-critical | done | `get_schedule_variance`, S-curve, `schedule-kpis.ts` | — |
| DCMA-style checks | missing | none | Q1 |
| Findings register | missing | none | Q2 |
| Gate before baseline submission | missing | none | Q3 |
| Dashboard "negative float" label | wrong | counts critical tasks (`schedule-kpis.ts:84`) | Q4 |

### MOD-11 Forecast and recovery
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Project forecast finish | done | `schedule-kpis.ts:81-82` | — |
| Recovery options, kept apart from the baseline | done | `plan_act_recovery_scenarios` (`20261013000003`) | — |
| What-if scenarios saved | done (local) | `plan_whatif_scenarios` (`20261103082915`), Save / Load in Generate › Compare scenarios | F1 |
| Adopted recovery applied through approval | done (local) | `plan_adopt_recovery` → draft revision; `plan_apply_recovery` after internal approval (`20261103082915`) | F2 |
| Effectiveness tracking | done (local) | `lib/planning/activity-library/recovery-effectiveness.ts` on Recovery Scenarios | F3 |
| Calendar-change simulation | done (local) | `calendarScenario` in `recovery-engine.ts` (extra working days, overtime) | F4 |
| Forecast snapshots with assumptions | done (local) | `plan_forecast_snapshots` + `plan_capture_forecast` (`20261103082915`), Planning › Forecast | F5 |

### MOD-12 Reporting and closure
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| S-curves, histograms, look-ahead, delay register, monthly | done | Reports page; `plan_report_jobs` (`20260919000014`) | — |
| Master programme, weekly, recovery reports | done (local) | `lib/planning/reports/report-builders.ts`; Planning › Reports › Report documents | M1 |
| PDF export | done (local) | `report-pdf.ts` (pdf-lib, already a dependency); Excel from the stored content | M2 |
| Data date and baseline reference on every report | done (local) | `plan_report_basis` (`20261103085210`): title block and every page footer; basis strip on Reports and S-curve | M3 |
| Reproducible historical reports | done (local) | `plan_report_snapshots` (`20261103085210`, immutable); new file and Document Control revision per generation | M4 |

### Integrations (PRD §14)
| Feed | Status | Evidence | Todo |
|---|---|---|---|
| QS → Planning (BOQ, quantities) | done | QS bridge, doc 24 | — |
| Construction → Planning (daily reports) | done | `sync_daily_report_to_planning` | R4 (review) |
| Procurement → Planning (status as constraints) | done | `task_constraints` (`20260919000019`) | — |
| Planning → Procurement (required-by dates) | done (local) | feed `materials` (`20261103091800`): order-by / on-site dates, PR coverage | I3 |
| Planning → HR (manpower demand) | done (local) | feed `manpower`: remaining hours and headcount per trade per week | I4 |
| Planning → QA/QC (upcoming inspections) | done (local) | feed `inspections`: due and request-by dates, IR match | I5 |
| Planning → Document Control (planned submissions) | done (local) | feed `submissions`: submit-by / approve-by dates, submittal match | I6 |
| Planning → Finance (cost distribution) | done (local) | feed `cost`: priced cost per month, cost code and type | I7 |

### AI (PRD part F)
| Capability | Status | Evidence | Todo |
|---|---|---|---|
| Activity matching, mapping, productivity, sequence conflicts, recovery | done | `ai/ai-core.ts:11`; human approval in `20261013000002` | — |
| QA/QC explanations, delay summaries, report drafting, natural-language queries | done (local) | `ai/ai-assist.ts`, four tools on the existing run / suggestion path (`20261103161545`) | A1–A4 |

### Non-functional and security
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| RLS project-scoped | partial | `wbs_tasks` and `wbs_task_steps` use `using (true)`; `project_members` covers 2 of 14 projects | R1, R2 |
| Data integrity checks | partial | six `NOT VALID` checks on `wbs_tasks` | R5 |
| Dashboard response | improved | perf work 2026-10-27 (`perf-check` skill) | — |
| Release | done | Wave 1 in `release.ts` (2026-11-03) after the doc 22 gate: see doc 22 section 0 | R6 |

## 3. Roadmap
Status values: `todo`, `doing`, `done`. Owner is the first agent in the pipeline; every phase ends with `code-reviewer` and `docs-writer`. "Mig" says whether a migration is needed.

### Phase R: release foundation (doc 22 P0/P1)
| ID | Todo | Done when | Mig | Owner | Status |
|---|---|---|---|---|---|
| R1 | Schedule-write guard on `wbs_tasks`: dates, links, constraints and baseline fields need Planning schedule edit; progress needs schedule edit, or Tasks update-progress when the project does not require approval. Real policies on `wbs_task_steps`. Built as a guard trigger, not an RLS rewrite (doc 22 D8-A). Workflows with their own approval (`task_transition`, `review_task`, `dr_sync_version_to_planning`) are trusted | Site staff blocked from dates; planners unaffected; tested as L4 and L6 | yes (`20261102115200`, `…120137`) | database-engineer | done (local) |
| R2 | `project_members` backfill (project managers, Planning resources, task owners / assignees / reviewers, Daily Report approvers). Auto-add only from Planning resources and Daily Report approvers: the task and project-manager triggers were removed because those tables' update rules are open, so anyone could have joined any project | Backfill ran: 3 → 7 members. Most projects still need their team added on Planning > Members (little source data) | yes (`20261102115100`, `…120904`) | database-engineer | done (local) |
| R3 | Baselines immutable and numbered, with a full snapshot (duration, links, constraints, calendar); they take effect only after approval by a second person (`approve_baseline` / `reject_baseline`). Client-approved revisions become approved baselines; award saves the contract baseline as pending | Four-eyes, immutability and activation rules tested | yes (`20261102115300`) | database-engineer | done (local) |
| R4 | Progress approval on by default for awarded projects, off for tenders (`progress_review_required`). Daily reports, the Planning sheet and Tasks progress create pending reviews when it is on; `decide_progress_review` needs approve permission and applies steps, actual dates and status | A pending report left the task unchanged; confirming applied it | yes (`20261102115400`, `…115600`) | database-engineer | done (local) |
| R5 | Six `NOT VALID` checks validated (0 violations); started steps lock their weight and duration basis on the server. Weights adding up to 100 stays a warning (steps are saved one row at a time) and is reported by Q1 | All six validated | yes (`20261102115500`) | database-engineer | done (local) |
| R6 | Release Wave 1 (core scheduling pages), after the doc 22 P2 tests pass (decision 2026-11-02) | Pages visible without the dev flag | no | frontend-engineer | done (Wave 1 released 2026-11-03; doc 22 P2 tests green, see doc 22 section 0) |

**Phase R review (2026-11-02), fixed in `20261102120904`:**
- **Baselines:** every write to `wbs_baselines` must go through the baseline RPCs; direct table writes could otherwise dodge the four-eyes check.
- **Baseline fields on tasks** change only by approving or activating a baseline. The "move baseline dates" option of Move Project was removed, and the legacy `set_project_baseline` is revoked.
- **Anonymous access:** the schedule guard refuses signed-out requests, and 21 schedule-writing RPCs are no longer executable by `anon`/`PUBLIC`.
- **Self-join removed:** the auto-add triggers on tasks and projects were dropped.
- **`decide_progress_review`** runs as definer, so approved step progress is always applied.

**Known limits, accepted for now:**
- **Tasks completion:** completing a task in Tasks (`task_transition`, `review_task`) sets 100% without planner approval; it is the Tasks module's own approval.
- **Task insert / delete** are not guarded. Only updates are. Full `wbs_tasks` RLS is doc 22 D8-B.
- **Daily reports on tenders** (approval off) write actual dates for any project member, while progress needs Tasks update-progress.
- **Tasks progress history:** `record_task_progress` records history and hours even when the progress itself is pending.
- **Client approval of a revision** needs Planning baseline edit as well as programme approve. L0–L4 and PE have both.

### Phase E: scheduling engine
| ID | Todo | Done when | Mig | Owner | Status |
|---|---|---|---|---|---|
| E1 | Engine moved to `packages/scheduling-engine` (`@dcos/scheduling-engine` 2.0.0, `ENGINE_VERSION`); the three `lib/planning` files re-export it, so no importer changed. In `transpilePackages`, the lockfile and the app's vitest run | Typecheck, lint, 1,424 tests pass; Gantt loads through the package in dev. `next build` not run yet | no | backend-engineer | done (local) |
| E2 | Progress-aware scheduling (`ScheduleOptions.dataDate`): completed tasks keep their actual dates and have no float; in-progress tasks keep their actual start and resume the remaining duration (explicit, from % complete, or from the time since the actual start) at the data date; unstarted work never before the data date. Sheet/Gantt use it when the project has a data date; progress without actual dates counts as started/finished as planned | Reference tests 14–15 pass | no | backend-engineer | done (local) |
| E3 | Activity calendar (`wbs_tasks.calendar_id`, guarded, project-checked, in baseline snapshots) and lag calendar (predecessor by default, or successor / project). Sheet and WBS builder load every project calendar | Reference tests 7–8 pass. **Follow-up:** a picker to set an activity's calendar in the Sheet | yes (`20261102130441`) | database-engineer | done (local) |
| E4 | `mustFinishBy` (Sheet passes the project end date) and SNLT / FNLT / MSO / MFO cap the late dates: missed deadlines show negative float; early dates are never pulled earlier | Test 16 and every constraint type pass | no | backend-engineer | done (local) |
| E5 | Driving links; longest path back from a chosen completion activity (default: latest finish); separate critical paths, most critical first (`longestPath`, `criticalPaths`, `TaskFloat.onLongestPath`) | Tests 9 and 12 pass. **Follow-up:** show them on the Gantt (filter / highlight) | no | backend-engineer | done (local) |
| E6 | `scheduleDiagnostics` (open start / finish, dangling and self links), `scheduleInputHash` (order-independent, includes engine version), log table `plan_schedule_calculations` (append-only) written after each saved Sheet reschedule and WBS-builder run | Same input gives the same hash and dates (test 19) | yes (`20261102130441`) | database-engineer | done (local) |
| E7 | Topological queue made O(1) per step. Measured before any change: 5,000 activities in ~0.4–0.8 s, so the day-by-day calendar walk was kept | Under 10 s in a test (~0.8 s) | no | backend-engineer | done (local) |
| E8 | `packages/scheduling-engine/__tests__/reference.test.ts`: 28 tests over the 20 PRD §20 categories, dates worked out by hand (Mon–Fri, 2027). Without options the new engine gave identical dates, float and warnings to v1 on 300 random networks (10,287 activities) | All pass | no | backend-engineer | done (local) |

### Phase Q: schedule QA/QC
| ID | Todo | Done when | Mig | Owner | Status |
|---|---|---|---|---|---|
| Q1 | `runScheduleQaqc` in `packages/scheduling-engine/src/schedule-qaqc.ts`: the 14 DCMA checks (logic, leads, lags, FS share, hard constraints, high float, negative float, high duration, invalid dates, resources, missed tasks, critical path test, CPLI, BEI) with metric, limit, severity (critical: logic, leads, negative float, invalid dates, critical path test) and affected activities. Limits configurable (DCMA defaults: 5%, 44 days, 90% FS, 0.95). Also fixed an engine v1 bug found here: the post-pass cascade undid "must start / finish on" dates (engine 2.1.0) | 14 tests in `__tests__/qaqc.test.ts`: a clean programme passes all 14, one broken programme per check fails it | no | planning-manager | done (local) |
| Q2 | `plan_schedule_qaqc_runs` and `plan_schedule_qaqc_findings`, written only by `record_schedule_qaqc_run` (one live finding per check per project; updated each run, resolved when the check passes) and `accept_schedule_qaqc_finding` (programme approve, reason ≥ 10 characters, audited) | Carry-over, resolve, accept and RLS tested in a rolled-back transaction | yes (`20261102131415`) | database-engineer | done (local) |
| Q3 | Planning > Schedule Check (`/dashboard/planning/schedule-check`, development): run the check, results table, affected activities, findings with Accept, and the project gate (`plan_schedule_settings.qaqc_gate`: warn / block). Set Baseline and revision Submit run a fresh check first; with block, the database refuses a baseline or revision submission without a check from the last 60 minutes or with open critical findings | Block, accept-then-pass and stale-run cases tested; first real run on PRJ-2026-004-PC: 7 pass, 5 fail, 2 not applicable | yes (`20261102131415`) | frontend-engineer | done (local) |
| Q4 | `ScheduleKpis.critical` (zero-float count) and `negativeFloat` (total float below zero) are now separate; dashboard card and monthly report show the critical count, and the card turns red only on negative float | KPI test updated | no | frontend-engineer | done (local) |

### Phase P: progress integrity
| ID | Todo | Mig | Status |
|---|---|---|---|
| P1 | `plan_task_quantity_progress` (one entry per installed quantity: date, source, status, approver); `task_quantity_status` gives scope (`plan_task_work.quantity`), installed, pending, remaining and %. Entries from the task drawer (`record_task_quantity`; Quantity & Method tab in the Planning Gantt drawer, panel in the WBS Gantt drawer) and from site daily reports (`sync_daily_report_to_planning`). With approval on, entries wait on the activity's progress review and follow its decision | yes (`20261102132428`) | done (local) |
| P2 | Installed + pending can never exceed scope; more needs a scope change (recorded with a reason in the quantity history). Corrections (negative entries) cannot go below zero | yes | done (local) |
| P3 | Progress method per activity (`wbs_tasks.progress_method`) with a project default (`plan_schedule_settings.progress_method_default`, on the Progress Review settings card); automatic = steps when the activity has steps, else percent. Quantity: progress follows installed quantity and cannot be typed (guard trigger). Steps drive progress only for steps / weighted milestones; milestone steps are 0 or 100 | yes | done (local) |
| P4 | `v_plan_progress_history` (security invoker): confirmed reviews (with their daily report), approved quantity entries and Tasks progress, each with source and approver; shown in the task drawer | yes | done (local) |

**Also fixed in Phase P:** the progress roll-up's temporary table (`_wbs_dirty_projects`) could belong to a security-definer function's owner and then refuse later requests on the same pooled connection ("permission denied"). Its two trigger functions now always run as the owner.
**Follow-up:** quantities from the Daily Reporting module's PM-verified reports (`dr_sync_version_to_planning`, Construction module) are not yet written to the quantity record.

### Phase B: BOQ mapping integrity
| ID | Todo | Mig | Status |
|---|---|---|---|
| B1 | Planning › BOQ Mapping Check (`/dashboard/planning/boq-check`). `plan_boq_mapping_facts(project)` (security definer, project member + Schedule view) returns, per BOQ line of the contract main-works BOQ and of the programme's tender (plus any other mapped line of the project), what each route maps: Generate from BOQ (`plan_task_boq_lines` share %), library links (`plan_act_quantity_links` factor per level and metric), and Task Work's direct BOQ link on tasks without programme lines. `reconcile.ts` classifies each line (complete, partial, counted twice, unmapped, other unit) and totals BOQ vs mapped quantity per unit | yes (`20261102135540`) | done (local) |
| B2 | Issues per line: over 100 % (counted twice), mapped by more than one route, the BOQ item's activity shares in the library not adding up to 100 %, BOQ changed since the programme or links were made, links in another unit (not compared), mapped from a BOQ the programme does not use, zero quantity. On PRJ-2026-004-PC it found 16 lines counted twice (rebar items at 700 %: one work item linked at 100 % to many reinforcement activities) and 2 partial | no | done (local) |
| B3 | `plan_boq_mapping_history`: every insert / update / delete of programme lines and library links, with old and new values and who. A regeneration's delete + re-insert in one transaction folds into one "changed" row, or none when nothing changed. Shown on the page, per line or for the project | yes | done (local) |
| B4 | `plan_boq_change_reviews`: a quantity change to a mapped QS or tender BOQ line (or its deletion) opens one review per line, kept up to date while open and closed by itself when the quantity returns. The capture triggers never block the QS edit. `plan_decide_boq_change`: **apply** finds the activities by their current link to the line and puts the new quantity on the programme lines (by share) and on Task Work, with the reason in the quantity history. Several directly linked activities share it in proportion to what they held. Activities under a locked WBS node are left unchanged unless the user is a WBS manager. It stops when an activity already has more installed than the new scope (Phase P). **Keep** needs a reason. Library links are not changed: Generate flags them "BOQ revised" for the per-activity update. The open count shows on the page (no push notification yet) | yes | done (local) |
| B5 | `plan_location_map.zone_split` (none / equal / by zone GFA): Generate from BOQ shares a level's quantity over its zone (or area) child nodes, which follow their level in floor order, so floor-to-floor logic runs zone by zone. Set in the location map's Zones column, shown only when the WBS has zones. BOQ lines have no zone of their own, and QS Bridge links stay per level | yes | done (local) |

### Phase U: planner experience
| ID | Todo | Mig | Status |
|---|---|---|---|
| U1 | **Programme readiness checklist** on Planning › Overview for the selected project: the PRD's 11 guided steps (project, project information, WBS, BOQ, BOQ mapping, activities, durations, logic, calculation, QA/QC, submission), each done / needs attention / waiting for approval / to do, with the next step highlighted and a link to the existing page. Facts from one call, `plan_programme_readiness(project)` (security definer, member + Schedule view), plus the Phase B mapping summary. Logic uses the DCMA limit (open ends ≤ 5 %); calculation and QA/QC show as needing attention when activities changed after them. No wizard | yes (`20261102143702`) | done (local) |
| U2 | Undo / Redo buttons and Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) in the Gantt and Sheet, up to 50 steps per project in the session. Covers dates, durations, links, constraints, task mode, milestone, name, code, status and priority, including bulk edits (one step each). Each step stores the fields it changed and the dates the engine moved; undo writes them back through the scheduler (or writes the moved dates directly when auto-schedule is off). Undo / redo run one at a time; deleted or locked activities and deleted predecessors are left out. Not on the stack: % complete (it goes through progress review), Calculate, data-date moves, and structure changes (add, delete, indent, move). Tested on the real project: a duration change that moved 36 activities undid exactly | no | done (local) |
| U3 | A view bar in the Gantt and Sheet. **Filters**: code or name, status, discipline, owner, critical only, incomplete only, a date window. Matching rows open up, and the selection clears when the filter changes. **Group by** status, priority, discipline, owner or criticality: read-only group rows with roll-up dates and progress; the outline cannot be changed while grouped. **Saved views** (`plan_saved_views`): name + filters + grouping per project, private or shared with the team; only the owner changes one. **Edit selected**: status, priority, duration as one undo step, or % complete through `submit_progress` (review flow and audit, like a typed value); locked activities are skipped | yes (`20261102144653`) | done (local) |

### Phase C: resources and cost
| ID | Todo | Mig | Status |
|---|---|---|---|
| C1 | **Capacity by period** per project resource (`plan_resource_capacity`: from, to or open-ended, capacity %), edited in the resource dialog; periods of one resource cannot overlap (trigger). Outside a period the capacity is Max Units. `get_resource_loading` flags over-allocation against each day's capacity; levelling (`levelResources(…, capacityPeriods)` in the engine package, `capacityOn`), the levelling profile, the type / trade histograms and the shortage weeks all use it. The dashboard histogram draws a stepped "Available" line when capacity changes | yes (`20261103080455`) | done (local) |
| C2 | **Material histogram** on Resources: quantity per period of one material (its own unit) or the cost of all materials, from each activity's BOQ lines x the QS work item's materials (with waste), spread over working days; current or baseline dates. The BOQ histogram's Equipment view is titled as such and can open on equipment | yes (RPC) | done (local) |
| C3 | **Cost by component** on the new Planning › Cost & Cash Flow page: labour, material, equipment and subcontract cost per period (stacked, with cumulative %) and per activity against its budget. Time resources come from the programme's hours, everything else from BOQ lines x work-item consumption. Rate: the project resource's own rate, else the QS costing rate, else the QS daily labour rate; unpriced lines are counted and shown, never guessed. A BOQ line mapped over 100 % counts once (its quantity, and the activity's hours weighted by amount) and the page says how many hours that left out | yes (RPC) | done (local) |
| C4 | **Planned cash flow**: money in = each month's value certified at month end, paid after the payment lag, less retention (with an optional limit) and advance recovery; the advance is paid in the first month; retention comes back part at completion and the rest after the defects period. Money out = each month's cost after the supplier lag. Shows the cumulative position, peak funding need and retention dates. Payment terms (Schedule configure) on `plan_schedule_settings`; retention and advance default to the project's terms | yes (columns) | done (local) |
| C5 | **Budget check**: approved budget = approved / locked contract BOQ + approved VOs (as QS counts it) against the activity budgets; per BOQ line: matches, partly, not in the programme, more than the BOQ, not approved yet. Also lists activities whose budget is not the sum of their BOQ lines. VOs are not mapped to activities, so they show as a known gap | yes (RPC) | done (local) |

### Phase F: forecast and recovery
| ID | Todo | Mig | Status |
|---|---|---|---|
| F1 | **Saved what-ifs** in Generate › Compare scenarios: Save keeps a variant (method per activity, productivity %, level link) with its headline figures and the reference's at the time; saved ones for the same template are listed and Load puts the variant back into the comparison, measured again on today's data. Stored variants are sanitised on load. Table `plan_whatif_scenarios` (member + Schedule view to read, Schedule edit to save; the author or Schedule delete removes) | yes (`20261103082915`) | done (local) |
| F2 | **Adopt → approve → apply.** Adopt lays the programme out with the scenario's changes (`scenarioDates`) and stores those dates as a **draft revision** of the internal stream (`plan_adopt_recovery`, Schedule edit + Programme edit). It is submitted and approved in Comparison › Manage Schedules like any revision. Only when the revision is approved internally (or later) can **Apply to programme** run (`plan_apply_recovery`): durations, overlaps (FS → SS + lag) and extra working days are written, started or locked activities are skipped and reported, each change goes to `wbs_audit_log`, and the dates are recalculated. A guard trigger stops direct writes from adopting, linking a revision or marking a scenario applied. Client approval of the revision then baselines the programme as before. The old "Mark adopted" button is gone | yes (`20261103082915`) | done (local) |
| F3 | **Did the recovery work?** For an applied scenario: planned working days against achieved (the forecast finish recorded just before apply vs the live finish now), and per change whether the programme still carries it (shortened activity within its new duration, overlap still SS, extra days still in the calendar). Achieved is the outcome, not an attribution: later progress and delays count | yes (columns) | done (local) |
| F4 | **Calendar what-if** on Recovery Scenarios: work Sundays and / or Saturdays in a window (holidays stay off) and overtime % on critical labour-driven activities starting in it; scenario F, measured with the engine like A–E, saved, adopted and applied the same way (extra days become working exceptions; a project on the built-in calendar gets its Mon–Sat calendar stored). The analysis now also names **what sets the finish** (constraints, activities without predecessors, fixed work), and a scenario that recovers nothing cannot be saved | no | done (local) |
| F5 | **Planning › Forecast**: record the live forecast with written assumptions (required), the data date, actual and planned %, critical count, open delays, the latest calculation (engine version, input hash, whether activities changed after it), calendar, applied recoveries, milestones and every activity's dates. Records cannot be changed or deleted (no grants + trigger). The page shows the forecast against baseline and contract, the trend of forecast finish across records, and which activities moved between two records. Recording is manual (one per update is suggested when the month has none) | yes (`20261103082915`) | done (local) |

### Phase M: reporting
| ID | Todo | Mig | Status |
|---|---|---|---|
| M1 | Four reports from one content model (`report-model.ts`, builders in `report-builders.ts`): **master programme** (every activity under its WBS heading with duration, dates, baseline finish, variance, total float and %, critical highlighted), **weekly** (started / finished this week, behind programme, approved progress records, the next two weeks, delays raised, milestones in 30 days), **monthly** (status, progress history, delay summary, milestones, critical work next month; replaces the old HTML-only builder) and **recovery** (position, scenarios with revision state, recovers vs achieved, the changes of adopted ones and whether they are still in the programme, open delays). Float and the critical path are recalculated from the data date with the scheduling engine. Generated from Planning › Reports › Report documents (Schedule export permission) | no | done (local) |
| M2 | **PDF** with pdf-lib (already installed): A4 portrait / landscape, tables that break across pages and repeat their header, WBS heading rows, critical rows in red, page n of m. Helvetica draws Latin text only: other characters are replaced in the PDF and kept in the HTML copy. Each report is also stored as HTML, and any generated report exports to **Excel** (a Basis sheet plus one sheet per table) from its stored content | no | done (local) |
| M3 | `plan_report_basis(project)`: data date (or "none set, as at"), the active approved baseline (number, name, type, set / approved, client accepted), the latest approved programme revision, the calculation (date, engine version, whether activities changed after it) and the last recorded forecast. Printed in every report's title block and in the footer of every page; shown as a strip on Planning › Reports and S-Curve & EVM, gaps flagged | yes (`20261103085210`) | done (local) |
| M4 | Every generation: PDF + HTML under a new file name (`upsert: false`), a **new Document Control revision** of the report's document (SCH-MP-<date>, WLY-<ISO week>, MTH-<yyyy-mm>, SCH-RCV-<date>; R00, R01…, with file size, SHA-256 and pages), and a row in `plan_report_snapshots` (content model, basis, renderer version, content hash, files) that no one can change or delete. Reopen rebuilds the report from the stored content; the same programme data gives the same content hash. Files open through a short-lived signed link after an RLS check. The monthly job route now uses the same pipeline and checks the caller can see the project (it used the admin client after a login check only, re-inserted revision 1, and overwrote the file) | yes (`20261103085210`) | done (local) |

### Phase I: setup and outbound integrations
| ID | Todo | Mig | Status |
|---|---|---|---|
| I1 | `plan_contract_milestones`: code, type (commencement, access, key date, sectional / practical completion, handover), contract date, approved extension (date + reference, required together), linked activity, damages per day, currency and cap, clause. Forecast / achieved from the activity (its start for commencement and access), variance in calendar days, exposure capped, status (achieved, achieved late, on track, at risk within 7 days, forecast late). Adding / editing needs Baseline edit; changing an agreed date or extension, and deleting, need Baseline approve (trigger). Every change in `plan_contract_milestone_history`. Page Planning › Contract Milestones | yes (`20261103091800`) | done (local) |
| I2 | Editing a calendar, deleting one, or adding / removing an exception opens a preview: the programme calculated as the Sheet does (data date, progress, links, constraints, locked WBS kept) with the calendars as they are and as they would be, so durations stay the input. Shows the finish before / after, every activity that moves, contract milestones whose forecast moves, and how many activities were already out of date. Then **Save and recalculate** (writes the moved dates, logs the calculation) or **Save, recalculate later** | no | done (local) |
| I3 | Outbound feeds (one pattern for I3–I7): `plan_feed_rows` computes each feed on the server from the programme; Planning › Outbound Feeds previews it, shows what changed since the last published version, and publishes the next numbered version (Programme approve) into `plan_feed_publications` (immutable, with data date, basis and settings). The receiving module reads `plan_latest_feed(project, feed)` with its own view permission, so programme edits reach it only when published. **Materials and equipment**: per activity and resource, on site by start − site buffer, order by that − lead time (current price's lead time, else the default), matched to purchase requests raised against the activity (covered / needed later / none). Lead times are schedule settings | yes (`20261103091800`) | done (local) |
| I4 | Feed **manpower**: remaining labour hours per trade per week (hours × remaining %, spread over the activity's working days left from the data date) and headcount = hours ÷ (hours per day × working days in the week); weekly headcount strip | yes (same) | done (local) |
| I5 | Feed **inspections**: each test / inspection an activity's library entry calls for, due at the activity finish, request by the notice days before; whether an ITP names it; inspection requests raised against the activity (requested, after due, passed) | yes (same) | done (local) |
| I6 | Feed **submissions**: each shop drawing / method statement the work still to start needs, by its first activity: approved by start − buffer, submitted by that − review period; matched to submittals naming the item (registered, target too late, submitted, approved) | yes (same) | done (local) |
| I7 | Feed **cost**: priced cost (Phase C components) per month, cost code (activity's, else its WBS item's) and type, spread over working days | yes (same) | done (local) |
| I8 | A WBS item cannot be deleted while records point at it or its activities (progress or actual dates, purchase requests / orders, requisitions, inspection requests, ITPs, NCRs, submittals, documents, daily report entries, manpower, photos, timesheets, delays, cost transactions, journal lines, subcontract items, drawings, RFIs): trigger with a message listing them; `wbs_node_delete_check` lists them for the whole subtree and the Planning Sheet checks it before confirming. BOQ / QTO links are mappings and do not block; deleting the project still removes its WBS. `wbs_nodes.responsible_id` set from project members on Planning › Members. Export WBS + activities to Excel on MS Project Sync | yes (`20261103091800`) | done (local) |

### Phase A: AI (last)
| ID | Todo | Mig | Status |
|---|---|---|---|
| A1 | Tool `explain_qaqc_findings` (Schedule Check page, "Explain with AI"): the open findings with their figures, limits and sample activities; one explanation per finding (what it means, why it matters, the first thing to check), ordered by urgency. Unknown finding ids and figures not in the data are dropped | yes (`20261103161545`: tool / kind lists) | done (local) |
| A2 | Tool `summarise_delays` (Delay Register, "Summarise with AI"): totals by responsible party and type, open days and critical-when-raised are added up in code; the model only words them, naming delays by code | yes (same) | done (local) |
| A3 | Tool `draft_report_commentary` (Report documents, "Draft with AI" for weekly / monthly): drafts the planner's commentary from the report's own content (figures, tables, basis). The planner edits it in the form; generating the report accepts the draft and prints it as **Planner's commentary** after the headline figures, with "Drafted with AI assistance … reviewed and edited by <name>". Commentary can also be written without AI | yes (same) | done (local) |
| A4 | Tool `ask_schedule` (Planning Overview, "Ask about the programme"): answers from a digest of the programme as calculated at the data date (headline figures, activities matching the question, critical, negative float, behind, next 30 days, milestones, contract milestones, open delays); cited codes outside the digest are dropped, an unanswerable question is marked so with low confidence | yes (same) | done (local) |

All AI items reuse the existing switch, monthly budget, size gate, run log and suggestion decisions (`plan_act_ai_settings`, `plan_act_ai_runs`, `plan_act_ai_suggestions`, `plan_act_ai_decide`). They are information only: none of them changes the programme or a baseline. Only codes, names, dates and figures are sent. Verified end to end on the local stack with a scripted model (no API key locally); the real model call is the existing `callClaude`.

## 4. Rules for every phase
- **Migrations:** additive, real-timestamp names. Dry-run and apply locally after `scripts/db-backup.ps1`; production only through `/dbpush`.
- **Pipeline:** `planning-manager` → `database-engineer` → `backend-engineer` ∥ `frontend-engineer` → `code-reviewer` → `docs-writer`; then `pnpm typecheck && pnpm lint && pnpm test`.
- **Core files** (`components/project/*`, `lib/modules/*`, `module-boundaries.mjs`, `packages/*`) are changed in the main lane only.
- **Performance:** run `perf-check` before and after any phase that adds data loading to shared screens.
- **Closing a phase:** update this file's Status column and `.claude/skills/dcos-architecture/references/planning.md`.
