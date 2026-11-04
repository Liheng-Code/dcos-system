# DCOS — Module 04: Task Management
## 13 — Team Planning Addendum

| Field | Value |
|---|---|
| Document Code | DCOS-M04-ADD-001 |
| Version | R1.1 (draft) |
| Date | 2026-10-13 |
| Status | Draft for approval — supersedes conflicting sections of docs 02, 04, 07, 08 |
| Inputs | `TASK TEAM PLANING.md`, `Phase-0-Audit-Report.md`, decisions D1–D5 |

## 1. Why this addendum exists

Docs 01–12 describe a tenant-scoped `tasks` table. DCOS instead uses **`wbs_tasks`** as the single task record, the Project module owns it, and `profiles` is the employee record. Where this addendum and docs 02/04/07/08 disagree, this addendum wins. Those docs carry a "see addendum" note.

## 2. Principles

- Extend `wbs_tasks`; add side tables keyed by `wbs_task_id`. No second task or WBS store.
- Employees = `profiles`. Disciplines = `discipline_master`/`departments`. Teams = `teams`. Skills = `skills`/`employee_skills`/`competency_levels`. Team and skill data is maintained in HR; planning reads it.
- No `tenant_id`. Isolation = project membership + department scope + `task_management` permissions, enforced in RLS and server code.
- All new tables: RLS on, indexes on FKs, created/updated timestamps, `created_by`/`updated_by`.
- All schema changes are additive and idempotent; new CHECKs start `NOT VALID`.

## 3. Task fields (additions to `wbs_tasks`)

| Column | Purpose |
|---|---|
| `owner_id` (existing) | Person in charge (PIC). Source of truth for "assigned to". |
| `assignee_id` (existing) | **Deprecated meaning**: currently holds the assigning user. Pending Q1; replaced by `assigned_by`. |
| `assigned_by`, `assigned_at` | Who assigned and when. |
| `team_id` | Responsible team (`teams`). |
| `reviewer_id`, `approver_id` | Independent reviewer; optional approver. |
| `task_type_id` | FK to `task_types`. |
| `estimated_hours` / `remaining_hours` | Effort; `planned_hours`/`actual_hours` already exist (actual becomes a roll-up of the effort log). |
| `progress_method` | percentage / deliverable / quantity / milestone, defaulted from the task type. |
| `required_seniority`, `required_skill_ids` | Matching inputs (advisory). |
| `is_blocked` | Controlled flag derived from open blockers (see §6). |

## 4. New tables

| Table | Key columns |
|---|---|
| `task_types` | code, name, discipline_id, progress_method, `review_required`, `deliverable_required`, `is_active`. Seeded from the §5 task library of the master prompt; fully configurable. |
| `task_type_templates` (or extend `task_template_master`) | task_type_id, default effort, deliverables, applied selectively; unique (project, template item, wbs node) prevents duplicates. |
| `task_assignments` | wbs_task_id, profile_id, role (pic/support/reviewer/approver), planned_hours, start/end, active; unique (task, profile, role). Mirrors `owner_id`/`reviewer_id` for single-PIC fields. |
| `task_deliverables` | wbs_task_id, name, required, contributor_id, due_date, document_revision_id (Document Control link), revision, status, submitted_at. |
| `task_progress_history` | wbs_task_id, previous/new progress, hours, remaining_hours, comment, evidence, created_by, created_at. Append-only. |
| `task_effort_log` | wbs_task_id, profile_id, work_date, hours, note. Actual hours source (Q4). |
| `task_submissions` / `task_reviews` | Submission rounds and review decisions (approve/return), comments, reviewer, timestamps. Append-only. |
| `task_blockers` | wbs_task_id, title, description, category, impact, responsible_dept/profile, required_action, expected_resolution, status, resolution, linked task/RFI/doc id. |
| `task_comments` | wbs_task_id, author_id, body, created_at. |
| `task_reassign_requests` | wbs_task_id, requested_by, proposed_profile, reason, status, decided_by. |
| `team_plan_revisions` | weekly_plan_id, revision no, change summary, reason, changed_by, created_at. |
| `capacity_overrides` | weekly_plan_id / task, profile_id, period, utilization, reason, created_by. |
| `task_audit_events` | actor, wbs_task_id, action, old/new JSON, reason, created_at. Insert-only for app roles. |

Reused as is: `weekly_plans`/`weekly_plan_tasks` (extended below), `task_alerts` (notifications, dedupe via `source_key`), `task_escalations`, `wbs_task_progress_reviews` (Daily Reporting progress approvals).

## 5. Status model

Work state lives in `wbs_tasks.status`. Existing values are kept; transitions are defined once in `lib/project/tasks/task-workflow.ts` and enforced server-side (RPC/route), then mirrored in a DB trigger for tasks with review enabled.

```
open → assigned → in_progress ⇄ paused
in_progress → submitted → review → approved → completed → closed
review → in_progress   (returned for revision; the submission and review record stay)
any non-final → cancelled
blocked  = flag (is_blocked) set from open task_blockers; the status stays in_progress
rejected = legacy value; maps to a returned review
```

Rules: `submitted`/`review` need all required deliverables; the reviewer is never the PIC or a support assignee; if the task type has `review_required = false` the task may go `in_progress → completed`. The existing `blocked` status stays valid for legacy rows but new code sets the flag instead (Phase 0 finding 4). `qa_status` and `delay_status` are unchanged and not part of this machine.

## 6. Capacity (decision D4)

- Day capacity = `plan_calendars.hours_per_day` (default 8) on its working days, minus approved `leave_requests`, `leave_public_holidays`, and recorded reservations; part-time uses the employee's allocation.
- Utilization = planned effort ÷ capacity for the period, summed over all projects for the employee; shared assignments counted once; actual hours and remaining hours kept separate.
- Thresholds in a settings row: warn > 85%, strong warning > 100%. Warn-only. A manager with `plan_team` can proceed with a reason, stored in `capacity_overrides`.
- Missing calendar/leave data is shown as a limitation, not guessed.
- Computed on the server (SQL function or service); allocation writes take an advisory lock per employee to avoid double-booking races.
- Other projects' task details are never returned; only hours.

## 7. Team plan (extends `weekly_plans`)

`weekly_plans.status`: draft → submitted (manager review) → approved → published → revised/archived (values added by a widened CHECK). Adds `published_at`, `published_by`, `revision_no`. Publishing runs in one transaction: validates assignments, writes `task_assignments`, creates `task_alerts` for each affected person (dedupe key = plan id + revision + person), and writes a revision record. Editing a published plan creates a revision with a required reason and notifies affected users.

## 8. Permissions (existing `task_management` keys)

| Capability | Key |
|---|---|
| View my tasks / project tasks | `view_task` |
| View department/team tasks and workload | `view_department` |
| Create / template-apply tasks | `create_task` |
| Assign, reassign | `assign_task`, `reassign_task` |
| Build and publish team plan; capacity override | `plan_team` |
| Update progress, effort | `update_progress` |
| Submit | `submit_task` |
| Review / approve | `approve_task` (+ being the named reviewer/approver on that task) |
| Task types, thresholds, workflow config | `configure_task_workflow` |
| Reports export | `export_task` |
| Cross-department requests | `accept_cross_request` |

No new key is needed in Phase 1; `review_task` may be split from `approve_task` later if the matrix requires. Job title never grants a permission. Server routes check the permission *and* scope (project membership, department management, own task). Doc 07 matrix is updated by the user's role setup, not hard-coded.

## 9. UI placement (extends the Project module)

- `/dashboard/tasks`: Task Pool (filters, views, bulk), Task Detail extended with deliverables, reviews, blockers, history.
- `/dashboard/department`: Manager Workspace (dashboard, team workload, capacity, team plan board, publication).
- `/dashboard/my-tasks`: My Dashboard, My Tasks, My Day, My Week tabs; staff task detail actions.
- Review Queue and Blockers as tabs in the above. Reports/KPI under existing reporting areas.
- New pages are added to `lib/modules/release.ts` only when ready (default hidden).

## 10. API/service conventions

Business logic in `lib/project/tasks/*` (pure functions + Vitest); writes through Next.js route handlers or Postgres RPCs that check permission and scope, validate with Zod, and return typed errors. Multi-record operations (assign, publish, review) are single transactions (RPC). Client calculations never decide capacity or permissions.

## 11. KPI definitions (to be finalised in Phase 6)

On-time completion = tasks completed on or before the planned finish ÷ tasks completed in the period. Overdue rate = open tasks past planned finish ÷ open tasks. Effort variance = (actual − estimated) ÷ estimated, completed tasks only. Review rejection rate = returned reviews ÷ review decisions. Utilization = see §6. Blocker resolution time = resolved_at − reported_at. Progress roll-up is weighted by estimated hours (explicit, documented), never a plain average. No employee ranking by counts.

## 12. Superseded in docs 02/04/07/08

`tasks` table with `tenant_id`; `task_status` enum (replaced by §5); separate `task_dependencies` table (dependencies stay as `wbs_tasks` link arrays); `task_assignments` shape (replaced by §4); mobile sync queue tables (out of scope here); RBAC matrix columns by job title (replaced by §8).
