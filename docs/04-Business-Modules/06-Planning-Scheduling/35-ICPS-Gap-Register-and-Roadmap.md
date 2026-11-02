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
| Project milestones (contractual) | partial | only `wbs_tasks.is_milestone`; no contract milestones table | I1 |
| Progress calculation method | partial | `progress_method` only in task-team planning (`20261013000005`), not a schedule setting | P3 |
| Scheduling settings | done | `plan_schedule_settings` (`20260917000002`) | — |
| Calendar change → controlled recalculation | missing | manual F9 (`schedule-toolbar.tsx:541`), no impact preview | I2 |

### MOD-02 WBS
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Codes, hierarchy, templates, multi-building | done | `plan_wbs_code_mask`, WBS templates, Level Library | — |
| Revision history | done | `wbs_audit_log` (`20260527000016`), `wbs_baselines` | — |
| Delete restricted when records depend on a node | partial | lock guard on locked nodes (`20260904000001`); unlocked nodes cascade | I8 |
| WBS responsibility | missing | only tasks have `owner_id` | I8 |
| Import / export | partial | MS Project XML import and export; no Excel/CSV export | I8 |

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
| Allocation by zone | missing | no zone dimension | B5 |
| Unmapped items report | done | `bridgeCoverage()` (`qs-bridge.ts:122-198`) | — |
| Duplicate detection; shares add up to 100% | missing | — | B2 |
| Mapped vs BOQ reconciliation | missing | coverage counts lines, not quantities | B1 |
| Mapping revision history | partial | `plan_task_work_quantity_history` covers the main link only | B3 |
| Quantity change → impact review | partial | drift flag (`boq-quantity.ts:45-55`); no review | B4 |

### MOD-05 Schedule development
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Generate from templates, by building / floor, typical floors | done | Activity Library Generate (G1–G6), doc 24 | — |
| Durations from norms; overrides tracked | done | `work-engine.ts`, `plan_task_work` | — |
| Gantt, sheet, critical path, float | done | `gantt-view.tsx`, `sheet-grid.tsx` | — |
| Bulk editing | partial | multi-select and chain-link only (`sheet-grid.tsx:89,104,374`) | U3 |
| Filtering and grouping | partial | text search only (`gantt-toolbar.tsx:85-92`) | U3 |
| Undo / redo | missing | — | U2 |
| Guided workflow for new planners | missing | Overview page is a static diagram | U1 |

### MOD-06 Resource planning
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Labour / equipment / material resources | done | `plan_resources.resource_type` (`20260905000004`) | — |
| Manpower histogram | done | `plan_manpower_histogram` (`20261027081636`) | — |
| Equipment and material histograms | partial | equipment is a series in the same RPC; no material | C2 |
| Over-allocation; levelling that leaves the baseline alone | done | `is_overallocated`; `plan_levelling_runs`; audited | — |
| Planned vs available capacity over time | partial | one constant `max_units` | C1 |

### MOD-07 Cost and cash flow
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| Activity budgets, time-phased cost | done | `plan_cost_loading`; project S-curve (doc 33) | — |
| Labour / material / equipment components | partial | labour only (`plan_task_cost_lines`) | C3 |
| Planned cash flow | missing | no payment lag or retention | C4 |
| Reconcile to approved budget | missing | checks task budgets only | C5 |

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
| What-if scenarios saved | missing | `scenario-compare.ts` results live in memory only | F1 |
| Adopted recovery applied through approval | missing | "adopted" changes nothing | F2 |
| Effectiveness tracking | missing | — | F3 |
| Calendar-change simulation | missing | — | F4 |
| Forecast snapshots with assumptions | missing | live dates only | F5 |

### MOD-12 Reporting and closure
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| S-curves, histograms, look-ahead, delay register, monthly | done | Reports page; `plan_report_jobs` (`20260919000014`) | — |
| Master programme, weekly, recovery reports | missing | — | M1 |
| PDF export | missing | XLSX and browser print only | M2 |
| Data date and baseline reference on every report | partial | monthly report shows the data date only (`monthly-report-html.ts:93`) | M3 |
| Reproducible historical reports | missing | monthly upload uses `upsert: true` (`app/api/planning/reports/monthly/[projectId]/route.ts:194`) | M4 |

### Integrations (PRD §14)
| Feed | Status | Evidence | Todo |
|---|---|---|---|
| QS → Planning (BOQ, quantities) | done | QS bridge, doc 24 | — |
| Construction → Planning (daily reports) | done | `sync_daily_report_to_planning` | R4 (review) |
| Procurement → Planning (status as constraints) | done | `task_constraints` (`20260919000019`) | — |
| Planning → Procurement (required-by dates) | missing | — | I3 |
| Planning → HR (manpower demand) | missing | — | I4 |
| Planning → QA/QC (upcoming inspections) | partial | Requirements Tracker shows status, not dates | I5 |
| Planning → Document Control (planned submissions) | partial | same | I6 |
| Planning → Finance (cost distribution) | missing | — | I7 |

### AI (PRD part F)
| Capability | Status | Evidence | Todo |
|---|---|---|---|
| Activity matching, mapping, productivity, sequence conflicts, recovery | done | `ai/ai-core.ts:11`; human approval in `20261013000002` | — |
| QA/QC explanations, delay summaries, report drafting, natural-language queries | missing | — | A1–A4 |

### Non-functional and security
| Requirement | Status | Evidence | Todo |
|---|---|---|---|
| RLS project-scoped | partial | `wbs_tasks` and `wbs_task_steps` use `using (true)`; `project_members` covers 2 of 14 projects | R1, R2 |
| Data integrity checks | partial | six `NOT VALID` checks on `wbs_tasks` | R5 |
| Dashboard response | improved | perf work 2026-10-27 (`perf-check` skill) | — |
| Release | missing | no `planning` key in `release.ts` | R6 |

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
| R6 | Release Wave 1 (core scheduling pages), after the doc 22 P2 tests pass (decision 2026-11-02) | Pages visible without the dev flag | no | frontend-engineer | todo (after P2) |

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
| P1 | Actual and remaining quantity per activity; physical % from quantity | yes | todo |
| P2 | Actual quantity capped at scope unless a scope adjustment is approved | yes | todo |
| P3 | Progress methods (percent, steps, quantity, weighted milestones) as a schedule setting | yes | todo |
| P4 | Each period's progress links to its approved report | yes | todo |

### Phase B: BOQ mapping integrity
| ID | Todo | Mig | Status |
|---|---|---|---|
| B1 | Reconciliation report: mapped vs BOQ quantity per line and in total | no | todo |
| B2 | Detect quantities counted twice and shares/factors not adding up to 100% | no | todo |
| B3 | History for `plan_act_quantity_links` and `plan_task_boq_lines` | yes | todo |
| B4 | BOQ quantity change → impact review queue (notify; accept or re-plan) | yes | todo |
| B5 | Zone below level in `plan_location_map` | yes | todo |

### Phase U: planner experience
| ID | Todo | Mig | Status |
|---|---|---|---|
| U1 | **Programme readiness checklist** per project: the 11 guided steps (WBS, BOQ mapped %, activities generated, durations from norms, logic complete, QA/QC clean, submitted) with live status and a link to each existing page. No wizard | no | todo |
| U2 | Undo / redo in Sheet and Gantt (command stack in `use-sheet-data.ts`) | no | todo |
| U3 | Bulk field edit, group-by and saved filters | no | todo |

### Phase C: resources and cost
| ID | Todo | Mig | Status |
|---|---|---|---|
| C1 | Resource capacity that varies by date | yes | todo |
| C2 | Equipment and material histograms | no | todo |
| C3 | Material and equipment cost components | yes | todo |
| C4 | Cash-flow curve (payment lag, retention), separate from the cost curve | maybe | todo |
| C5 | Reconcile cost loading to the QS approved budget | no | todo |

### Phase F: forecast and recovery
| ID | Todo | Mig | Status |
|---|---|---|---|
| F1 | Save what-if scenarios | yes | todo |
| F2 | Adopting a recovery creates a draft revision for approval | maybe | todo |
| F3 | Recovery effectiveness: planned vs achieved | yes | todo |
| F4 | Calendar-change simulation (overtime, extra shifts) | no | todo |
| F5 | Forecast snapshot each period, with assumptions and data date | yes | todo |

### Phase M: reporting
| ID | Todo | Mig | Status |
|---|---|---|---|
| M1 | Master programme, weekly and recovery reports | no | todo |
| M2 | PDF export | no | todo |
| M3 | Data date and baseline reference on every report | no | todo |
| M4 | Report snapshots that are never overwritten | maybe | todo |

### Phase I: setup and outbound integrations
| ID | Todo | Mig | Status |
|---|---|---|---|
| I1 | Contract milestones table linked to tasks | yes | todo |
| I2 | Calendar change → impact preview, then controlled recalculation | no | todo |
| I3 | Material required-by dates → Procurement | maybe | todo |
| I4 | Manpower demand → HR | no | todo |
| I5 | Planned inspections → QA/QC | maybe | todo |
| I6 | Planned submission dates → Document Control | maybe | todo |
| I7 | Cost distribution → Finance | no | todo |
| I8 | WBS: block deleting a node with dependents; node responsibility; Excel export | yes | todo |

### Phase A: AI (last)
| ID | Todo | Mig | Status |
|---|---|---|---|
| A1 | Explain QA/QC findings | no | todo |
| A2 | Summarise delays | no | todo |
| A3 | Draft weekly and monthly reports | no | todo |
| A4 | Natural-language questions about the schedule | no | todo |

All AI items reuse the existing human approval and audit (`plan_act_ai_runs`, `plan_act_overrides`) and never change a baseline.

## 4. Rules for every phase
- **Migrations:** additive, real-timestamp names. Dry-run and apply locally after `scripts/db-backup.ps1`; production only through `/dbpush`.
- **Pipeline:** `planning-manager` → `database-engineer` → `backend-engineer` ∥ `frontend-engineer` → `code-reviewer` → `docs-writer`; then `pnpm typecheck && pnpm lint && pnpm test`.
- **Core files** (`components/project/*`, `lib/modules/*`, `module-boundaries.mjs`, `packages/*`) are changed in the main lane only.
- **Performance:** run `perf-check` before and after any phase that adds data loading to shared screens.
- **Closing a phase:** update this file's Status column and `.claude/skills/dcos-architecture/references/planning.md`.
