# Task Team Planning — Plan Review and TODO

Reviewed: 2026-10-13. Source: `TASK TEAM PLANING.md` (master prompt), checked against the repo and the local DB.

## 1. Review summary

The master prompt is thorough, but it was written without knowledge of what DCOS already has. Three corrections change the plan:

1. **"Task" already exists as `wbs_tasks`** (1,498 rows locally). It already carries `department_id`, `assignee_id`, `owner_id`, `priority`, `status`, `progress`, `planned_hours`, `actual_hours`, `dependency_task_ids`/`types`/`lag`, `cross_dept_status`, baseline and actual dates. The prompt's new "Tasks" entity (and the 12-doc pack's `tasks` table) would create the second WBS-task store that the prompt itself forbids (§2, §3.2). Extend `wbs_tasks`; add side tables only.
2. **Team planning is already partly built.** `weekly_plans` + `weekly_plan_tasks` (per project, department and week, status draft/submitted/approved, with a `responsible_id` and `target_progress` per task), `components/project/tasks/team-planner-grid.tsx`, `department-workspace.tsx`, `my-tasks-dashboard.tsx` and `lib/project/tasks/{assign-task,team-planning-store,tasks-queries}.ts`. The work is to deepen these, not to build parallel screens.
3. **The existing 12-doc pack in this folder conflicts with the prompt.** `04-Database-Schema.md` specifies a multi-tenant `tasks` table with `tenant_id` and FS/SS/FF/SF dependencies, and `task_status` enums. DCOS has no `tenant_id` pattern and keeps dependencies as link arrays on `wbs_tasks`. Those docs need reconciling before any migration is written.

Other findings:

- **Reusable assets:** `departments`, `teams` (0 rows), `discipline_master`/`discipline_codes`, `skills` + `employee_skills` + `competency_levels` (0 skills rows), `employee_project_assignments`, `employee_wbs_assignments`, `leave_requests`/`leave_balances`/`leave_public_holidays`/`leave_team_capacity`, `plan_calendars`/`project_calendars`, `timesheets`/`timesheet_entries`, `plan_task_assignments` (resource allocation %), `task_escalations`, `task_alerts`, `wbs_task_progress_reviews` (propose/approve progress), `wbs_audit_log`, `document_revision_task_links`, `task_scope.ts` (viewer and department scoping), and the module RBAC key `task_management`.
- **Real gaps:** deliverables per task, a reviewer/approver and submit-review workflow, blockers, task-level progress history, task comments, a capacity engine, task types and templates beyond `task_template_master`, a staff My Day/My Week, a review queue, KPI reports and in-app notifications for tasks.
- **Data-quality risk:** `teams` and `employee_skills` are empty. Competency matching, team views and capacity depend on them, so seeding or an HR data-entry path is a prerequisite, not an afterthought.
- **Release gating:** the new pages must be added to `lib/modules/release.ts` (default is development/hidden) and to `module-boundaries.mjs`. The Project module is core-owned; a new module folder needs a manifest.
- **Prompt issues to fix:** it conflicts with its own rule 18 ("don't stop after the plan") when asking for clarification, so decisions in §3 below should be settled first. It also demands 20 screens and AI in one scope; AI (Phase 8) should be deferred. "Tenant/company isolation" does not apply as written (single-organization DB).

## 2. Decisions (settled 2026-10-13)

- [x] **D1. Ownership:** extend the core Project module. Code stays in `components/project/tasks` and `lib/project/tasks`, built on `wbs_tasks`. No new module manifest.
- [x] **D2. 12-doc pack:** add-on. Keep the existing docs and add `13-Team-Planning-Addendum.md` with the `wbs_tasks`-based data model. It supersedes conflicting parts of `04-Database-Schema.md`, `07-RBAC-Matrix.md` and `08-API-Reference.md`, which get a "see addendum" note.
- [x] **D3. Review workflow (recommended):** review is set per task type (`review_required`). Design, drawing, calculation, submittal and inspection types require an independent reviewer; admin and routine types don't. The approver is optional per task, for sign-offs beyond the reviewer (e.g. issued-for-construction drawings). The reviewer can't be the PIC or a supporting assignee on the same task. Returned work goes back to In Progress, and every submission and review record is kept.
- [x] **D4. Capacity policy (recommended):** 8 working hours per day on the existing work calendar (`plan_calendars`, Mon–Sat), minus approved leave and public holidays. Thresholds are configurable: warn above 85%, strong warning above 100%. Over-allocation is warn-only; a manager with assign permission can proceed with a required, audited reason. Capacity sums across all of the employee's projects, but other projects' task details stay hidden (hours only).
- [x] **D5. Team and skills data:** HR is the source. Team membership and skills (`teams`, `employee_skills`, `competency_levels`) are maintained in HR; planning only reads them. Phase 1 needs an HR-side entry or import path.

## 3. TODO by phase

### Phase 0 — Audit and reconcile (no code)
- [x] Audit report written: `Phase-0-Audit-Report.md`.
- [x] Employee record = `profiles` (no `employees` table).
- [x] Permissions, task-scope and RLS reviewed (wbs_tasks RLS is open; see audit finding 2).
- [x] Existing UI inventoried (team-planner-grid, department-workspace, my-tasks-dashboard).
- [x] `13-Team-Planning-Addendum.md` written; "see addendum" notes added to docs 02, 04, 07, 08.
- [x] DB backup taken (`.backups/auto/dcos_local_20261013_132501.dump`).

### Phase 1 — Foundation
- [ ] Add HR-side maintenance for `teams` membership and `employee_skills` (D5), then enter or import the real data; add team-membership table if `project_team_members` (stakeholder-based) is not suitable.
- [ ] Define permission keys for `task_management` (assign, publish, review, approve, view-all, configure) in the existing RBAC; separate from job title.
- [ ] Migration: guarded additions to `wbs_tasks` (responsible team, reviewer_id, approver_id, estimated/remaining effort, progress method, required seniority, blocked flag), idempotent.
- [ ] Unit tests for scope rules (`task-scope`).

### Phase 2 — Task engine
- [x] Task types table (slice 2); seeded 53 starter types, configurable.
- [ ] Extend `task_template_master` for template application with duplicate prevention (unique key on project + template item + WBS node).
- [~] `task_deliverables` table done (slice 2); completion gate not wired yet.
- [ ] Dependency validation: cycle detection and FS-warning on top of existing link arrays (reuse CPM helpers, no new engine).
- [ ] Task Pool page: filters, views, search, sort, pagination, bulk assign/priority.
- [~] State machine module + tests done (slice 1); server enforcement not wired yet.

### Phase 3 — Manager planning
- [x] Capacity calculation + data loader done (slice 3a, 3b); API route/UI pending.
- [x] Publish RPC with per-employee advisory locks done (slice 3b).
- [ ] Allocation: PIC, support, reviewer, approver; override with required reason.
- [~] Team plan lifecycle (publish, reopen, revisions, audit, notifications) done in DB; UI pending.
- [ ] Manager dashboard and team workload views; accessible assign dialog (drag-and-drop optional).

### Phase 4 — Staff workspace
- [x] My Dashboard, My Tasks lists, My Week (slice 4); My Day = Today tab.
- [~] Task actions done (start, progress, hours, submit, comments, evidence link); clarification and reassignment requests pending.
- [~] Blockers: table, report, resolve done; escalation notification and cross-discipline linking UI pending.
- [ ] Mobile check of critical flows.

### Phase 5 — Review and control
- [~] Review: submit/return/resubmit and decision done (slice 4); dedicated queue page pending.
- [x] Separation of duties enforced in DB functions and RLS.
- [ ] Notifications for the 12 events from §19, idempotent (dedupe key); reuse existing notification infrastructure.
- [ ] Task audit events (append-only, no ordinary delete/update); decide whether to extend `wbs_audit_log` or add `task_audit_log`.

### Phase 6 — Reporting
- [ ] Define each KPI precisely (on-time rate, overdue rate, effort variance, rejection rate, rework, utilization, blocker resolution time) in a doc before coding.
- [ ] Staff / manager / PM / management reports from real data; no raw-count rankings; weighted progress roll-up with documented weights.

### Phase 7 — Integration
- [ ] Planning module (activity links), Document Control, HR leave/holidays, Daily Reporting (`wbs_task_progress_reviews`), RFI/issues where entities exist.

### Phase 8 — AI (deferred)
- [ ] Recommendation-only assistant after Phases 1–6 are stable; data-handling decision first.

### Phase 9 — Production readiness
- [ ] RLS review on every new table; server-side checks on every route; no service-role key in client.
- [ ] Migration review: unique version numbers, replay-safe, dry-run in rolled-back transaction, then apply.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green; acceptance run of Scenarios A–D.
- [ ] Manager and staff user guides, deployment notes, known limitations; add pages to `release.ts` and `module-boundaries.mjs`.
- [ ] Promotion to production via the user's `/dbpush` only.

## 4. Suggested order of delivery

Phase 0 and the decisions first, then ship small vertical slices: (1) state machine + review fields + tests, (2) capacity service, (3) team plan publication, (4) staff My Tasks/My Week, (5) review queue, (6) reports. Each slice is one reviewable change set.

## 5. Phase 0 questions — answered 2026-10-13

- [x] Q1: `assignee_id` meaning changed. `owner_id` = person in charge; new `assigned_by`/`assigned_at`. `assignee_id` deprecated.
- [x] Q2: RLS tightening on `wbs_tasks` approved as a separate, reviewed step (compatibility check with Planning, WBS builder, Daily Reporting, Telegram first). Not started.
- [x] Q3: Bulk department backfill from `discipline` done (migration `20261013000004`): 1,266 DESIGN, 101 QA, 66 PROC, 25 CONST; 40 tasks left unmapped (27 with no discipline, 13 "Documentation"/other). Civil mapped to DESIGN; Commissioning and Handover to CONST. Adjust if wrong.
- [x] Q4: Actual hours go to a task-level effort log (`task_effort_log`), not `timesheet_entries`.

## 6. Progress log

- 2026-10-13 Slice 1 done: migration `20261013000004_task_team_planning_foundation.sql` (applied locally), `assign-task.ts` writes `assigned_by`, "my task" = `owner_id`, `lib/project/tasks/task-workflow.ts` + tests (7 new, full suite 746 pass, `tsc --noEmit` clean). Not yet wired into UI/API.
- 2026-10-13 Slice 2 done: migration `20261013000005_task_team_planning_engine.sql` (applied locally; dry-run first). Adds `task_types` (53 starter types, configurable), `wbs_tasks` columns (task_type_id, team_id, reviewer_id, approver_id, estimated/remaining hours, progress_method, required_seniority/skills, is_blocked), `task_deliverables`, `task_submissions`, `task_reviews`, `task_blockers`, `task_comments`, `task_progress_history`, `task_effort_log`, `task_audit_events`. RLS: project member + `view_task`; append-only history; DB blocks self-review (owner cannot review; only named reviewer/approver). Triggers: `is_blocked` from open blockers; `actual_hours` = sum of effort log. Verified by a rolled-back test, `supabase/tests/task_team_planning_rls.sql` (11 checks pass). `database.types.ts` not regenerated yet; no UI/API uses these tables yet.
- 2026-10-13 Slice 3a done: `lib/project/tasks/capacity.ts` (pure capacity/utilization/allocation-check, 85/100% thresholds configurable) + 11 tests; `tsc` clean. Part-time decision: not modelled; `employee_project_assignments.allocation_percent` totals above 100% only raise a limitation notice. Not yet wired to data or UI (next: loader, `capacity_overrides`, team-plan publish RPC).
- 2026-10-13 Slice 3b done: migration `20261013000006_team_plan_publication.sql` (applied locally, dry-run first). `weekly_plans` gains published/archived statuses, `published_at/by`, `revision_no`; new `team_plan_revisions` and `capacity_overrides` (append-only); RPCs `publish_team_plan` (one transaction: validates, assigns owners, audit log, de-duplicated `task_alerts`, revision snapshot, override reasons required, advisory locks per employee) and `reopen_team_plan` (reason required); a trigger blocks edits/deletes of published plans outside the RPCs. Needs `plan_team` + project membership; draft/submitted plans also need `approve_task` (otherwise the plan must be approved first). Code: `capacity-service.ts` (loader), `team-plan-service.ts` (RPC wrappers). Tests: `supabase/tests/team_plan_publication.sql` (15 checks pass, rolled back); vitest and `tsc` pass. Limits: capacity numbers passed as overrides come from the caller, the RPC does not recompute utilization; cross-project hours come via `wbs_tasks` reads and will need a hours-only RPC when `wbs_tasks` RLS is tightened; UI for publish/reopen not built yet.
- 2026-10-13 Slice 4 done (staff + reviewer workspace): migration `20261013000007_staff_task_actions.sql` (applied locally, dry-run first): functions `task_transition` (start/pause/resume/submit/complete, owner only), `record_task_progress` (progress 0-100, history, actual hours to `task_effort_log`, 31-day window, comment needed to reduce), `review_task` (named reviewer/approver, not the owner; return needs comments; reviewer+approver sign-off before completion); all write audit events and de-duplicated alerts. Note: `wbs_tasks.progress` is 0-100, so `task_progress_history` was changed to 0-100. Code: `staff-task-service.ts`, `my-work.ts` (+6 tests), `plannedHoursByDay`; UI: `my-workspace.tsx` (KPIs, My Week day grid with capacity, Today/Due this week/All open/To review/Completed lists) and `task-action-dialog.tsx` (start, pause, progress+hours, submit, deliverables, blockers, comments, review decision, history) mounted as the new default tab "My Work" on `/dashboard/my-tasks` (old dashboard kept as "Overview & approvals"). Tests: `supabase/tests/staff_task_actions.sql` (24 checks pass), vitest 763 pass, tsc and eslint clean on new files. Not done: in-browser check, reassignment requests, per-day actual-vs-planned view, support-staff roles (task_assignments), mobile review, notifications page for the new alert types.
- 2026-10-13 Slice 5 done (Manager workspace): migration `20261013000008_manager_planning.sql` (applied locally, dry-run first): `is_department_manager()` (head of the department or an ancestor, or admin); `set_task_planning(task, changes)` (owner, reviewer, approver, estimate, dates; needs `plan_team` + project membership + department manager; reviewer/approver must differ from the owner and be active; refuses finished tasks and tasks in a published plan; sets `assigned_by`; audit in `wbs_audit_log` and `task_audit_events`); a trigger so only the department manager (or admin) can publish or reopen a plan. UI: new tab "Capacity & Publish" on `/dashboard/department` (`manager-plan-panel.tsx`): week selector, team capacity table (available/planned/utilization/notes), editable plan tasks (responsible, reviewer, approver, estimate, dates), submit/approve/return-to-draft, publish dialog (a reason per over-capacity person, a reason for revisions), reopen dialog, plan history and overrides. The Team Planning drag grid now assigns and shifts dates through `set_task_planning` (previously direct table updates). Tests: `supabase/tests/manager_planning.sql` (12 checks pass), vitest 763 pass, tsc clean, eslint no new problems. Not done: in-browser check; Task Pool page with filters/bulk assign; support staff roles; capacity ignores tasks without dates (not listed as unplaced); the weekly_plans UPDATE policy still depends on the planning module's lookahead permission.
