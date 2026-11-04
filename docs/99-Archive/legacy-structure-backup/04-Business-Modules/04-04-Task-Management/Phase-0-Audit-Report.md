# Task Team Planning — Phase 0 Audit Report

Date: 2026-10-13. Scope: repo and local Supabase only. Read-only except one DB backup (`.backups/auto/dcos_local_20261013_132501.dump`, 11.0 MB, projects=13).
Decisions D1–D5 are in `TASK TEAM PLANNING - Review and TODO.md`.

## 1. Current state

| Area | Finding |
|---|---|
| Framework | Next.js 16 / React 19 / Supabase; task code in `components/project/tasks`, `lib/project/tasks`, `lib/task-scope.ts`; routes `/dashboard/tasks`, `/tasks/[taskId]`, `/my-tasks`, `/department`. Manifest `lib/modules/manifests/project.ts` (RBAC key `task_management`). |
| Task record | `wbs_tasks` (80+ columns, 1,498 rows, all `status='open'`, 1 with `owner_id`, 1 with `department_id`). Status check: open, assigned, in_progress, paused, blocked, review, submitted, approved, closed, cancelled, completed, rejected. `qa_status` separate. Priority: low/medium/high/critical. |
| Dependencies | Link arrays on `wbs_tasks` (`dependency_task_ids`, `_types` fs/ss/ff/sf, `_lag_days`), loop-check helpers in planning CPM code. No separate dependency table. |
| Org | `departments` (8, with parent and `department_head`), `discipline_master` (12), `teams` (0 rows; has `department_id`, `team_lead`), `profiles` (40; has `department_id`, `team_id` (0 set), `position_id`, `grade`, `level`, `job_title`). **There is no `employees` table; `profiles` is the employee record.** |
| Skills | `skills`, `competency_levels`, `employee_skills` all empty (0 rows). |
| Capacity inputs | `plan_calendars` (working days, `hours_per_day`), `leave_requests`, `leave_balances`, `leave_public_holidays`, `leave_team_capacity` (per department max % on leave), `employee_project_assignments` (allocation_percent), `plan_task_assignments`. `timesheets`/`timesheet_entries` have `task_id` (0 entries). |
| Weekly plans | `weekly_plans` (project + department + week, status draft/submitted/approved) and `weekly_plan_tasks` (task, responsible_id, target_progress, actual_progress, met). 0 rows. Store in `lib/project/tasks/team-planning-store.ts`. |
| Existing UI | `team-planner-grid.tsx` (week grid with drag), `department-workspace.tsx`, `my-tasks-dashboard.tsx`. |
| RBAC | `role_permissions` module `task_management` has actions: view_task, view_department, create_task, assign_task, reassign_task, plan_team, update_progress, submit_task, approve_task, delete_task, export_task, accept_cross_request, configure_task_workflow. |
| Notifications / audit | `task_alerts` (recipient, type, source_key dedupe, read_at) and `task_escalations`; `wbs_audit_log`; `wbs_task_progress_reviews` (propose/approve progress). No generic notifications table. |
| Templates | `task_template_master` (22 rows): has approval_required, requires_document/photo/checklist/inspection, deliverable, discipline_id, auto_assign_role. |

## 2. Reusable assets

`wbs_tasks`; `departments`/`discipline_master`/`teams`; `profiles`; `role_permissions` + `getUserPermissions`/`hasPermission`; `task-scope.ts` viewer resolution (department-head recursion); `assignTaskToProfile`; `weekly_plans`/`weekly_plan_tasks`; `task_alerts` (+dispatch in `lib/notifications`); `wbs_task_progress_reviews`; `plan_calendars` + leave/holiday tables; `task_template_master`; `timesheet_entries.task_id`; `document_revision_task_links` for deliverable documents.

## 3. Findings that need action (conflicts and risks)

1. **`assignee_id` is overloaded and probably wrong.** `assignTaskToProfile` sets `owner_id` = the assigned person but writes `assignee_id` = the *acting user* (the assigner). `isMyTask()` and My Tasks treat `assignee_id` as "mine", so the assigner sees assigned tasks as their own. Decide the meaning (recommend: `owner_id` = PIC, `assignee_id` deprecated or renamed in semantics as "assigned_by") and fix before building staff workspace.
2. **`wbs_tasks` RLS is open.** Any authenticated user can SELECT and UPDATE every task, and INSERT; only DELETE is permission-gated. That fails Scenario D (no reading outside scope, no unauthorized assignment, no self-approval) and cannot be fixed by UI hiding. Tightening RLS is a behaviour change on a table many modules use, so it needs its own design and a compatibility check (planning, daily reporting, Telegram, WBS builder) before migration.
3. **Weekly-plan RLS uses a different permission scheme** (`planning`/`lookahead`, `is_project_member`) from `task_management`. Team-plan publication needs one consistent rule; recommend `task_management.plan_team` plus project membership.
4. **Status model is a single field mixing work state, review state and blocked.** `blocked`/`paused` are statuses, and `delay_status` and `qa_status` also exist. The state machine must define how these relate rather than adding yet another field.
5. **No data to plan with.** `teams` empty, no team assignments on profiles, no skills, 1 of 1,498 tasks has a department. Department assignment of existing tasks needs a rule (e.g. by discipline/activity type → department) agreed with the user; do not bulk-update silently.
6. **Timesheets are not wired to tasks** (0 entries); actual-hours capture needs a decision: write to `timesheet_entries` (HR, payroll-linked) or to a task-level effort log that HR timesheets can later reference. Recommend a task effort log, since timesheets feed payroll.
7. **Existing 12-doc pack** assumes a tenant-scoped `tasks` table; superseded by the addendum.
8. **Plan prompt items that do not apply:** tenant/company isolation (single organisation; `profiles.company_id` exists but is not an RLS pattern here), a separate Employee module, a new notification system.

## 4. Missing functionality

Task types with review rules; deliverables; reviewer/approver fields and review records; submit/return/resubmit flow; blockers; task progress and effort history; task comments; capacity service; team-plan publication and revision records; override records; My Day / My Week; review queue; reassignment requests; KPI reports; task-level audit events beyond `wbs_audit_log`.

## 5. Migration risks

- All writes go through `wbs_tasks`, which is used by Planning, WBS builder, Daily Reporting and Telegram; every added column must be nullable or defaulted, and status/transition enforcement must not break those writers.
- New CHECK constraints on a populated table: add `NOT VALID` first, validate after.
- Migration version numbers must be unique; apply via Git Bash `psql < file` (em-dash corruption in PowerShell).
- Do not apply to production; promotion via the user's `/dbpush`.

## 6. Recommended sequence

1. Addendum doc (done with this report).
2. Decide and fix the `assignee_id` meaning (finding 1), with tests.
3. Central status/transition module + tests (no DB change yet).
4. Additive migration: review fields, task types, deliverables, blockers, progress/effort history, comments.
5. RLS tightening design for `wbs_tasks` and the new tables (finding 2) — separate review.
6. HR-side team and skills maintenance; capacity service; team-plan publication; staff workspace; review queue; reports.

## 7. Open points for the user

- Q1. Approve changing the meaning of `assignee_id` (finding 1)?
- Q2. OK to design RLS tightening on `wbs_tasks` as a separate reviewed step (finding 2)?
- Q3. Rule for assigning the existing 1,498 tasks to departments (finding 5)?
- Q4. Actual hours: task effort log (recommended) or `timesheet_entries` (finding 6)?
