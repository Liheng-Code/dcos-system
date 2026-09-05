# Plan: Task Module — Personal Dashboard, Department Views & Cross-Department Integration

> Status: Implemented (2026-08-24) · Created 2026-08-24
> Scope: `apps/web` (Next.js 16 App Router) + `supabase/migrations`
>
> ## Implementation Record
> - Migrations: `supabase/migrations/20260824000001…000005` (profile dept FK + sync trigger, task dept scoping + derive trigger, cross-dept fields, weekly planning columns, RBAC seeds)
> - Shared helper: `apps/web/lib/task-scope.ts`
> - My Tasks dashboard: `apps/web/app/dashboard/my-tasks/page.tsx` + `components/tasks/my-tasks-dashboard.tsx`
> - Department workspace: `apps/web/app/dashboard/department/page.tsx` + `components/tasks/department-workspace.tsx` + `components/tasks/team-planner-grid.tsx`
> - Cross-department flow: create-form section in `wbs-task-edit-sheet.tsx`, accept/reject queues in My Tasks dashboard, kanban ⇄ badges, alerts (`cross_dept_requested/accepted/rejected`)
> - Sidebar: "My Tasks" and "Department" entries under Project group; badge shows pending incoming cross-dept requests for department heads

## Confirmed Decisions

| Topic | Decision |
|---|---|
| My Tasks | Standalone sidebar page `/dashboard/my-tasks`, cross-project |
| Department model | Normalize: FK to HR `departments` table (tasks + profiles) |
| Team Planning | Weekly workload planner (people × days grid), extends `weekly_plans` |
| Cross-department | Request + accept flow between department heads, full audit trail + alerts |
| Department view access | Members read-only; Department Manager/head full control |
| Project scoping | Mixed — personal dashboard cross-project; dept views respect selector with "All projects" option |

## Current State

- `/dashboard/tasks` → `apps/web/components/wbs/wbs-tasks-page.tsx` (tabs: My Tasks / Overdue / Pending Approval / All Tasks / Kanban / KPI). Existing "My Tasks" is a simple `owner_id/assignee_id` filter rendered in the same execution table.
- Kanban (`wbs-kanban-view.tsx`): read-only, columns Open → Assigned → In Progress → Pending Approval → Approved → Completed via `getKanbanStatus()`.
- No `department_id` on `wbs_tasks`; `profiles.department` is free TEXT; structured `departments`/`teams` tables live in HR (`20260527000030_create_hr_organization_tables.sql`, incl. `department_head`, self-referencing `parent_id`).
- RBAC ready: `role_permissions.scope = own|department|project|company`; L4 Department Manager role seeded. Helper: `apps/web/lib/permissions.ts`.
- Weekly planning infra exists: `weekly_plans` / `weekly_plan_tasks` (`20260531000008_create_weekly_plans.sql`).
- Alert infra: `task_alerts` table, `lib/task-alerts.ts`, bell menu (`TaskAlertsProvider`).

---

## Phase 1 — Data Model Foundation (SQL migrations)

**A. Normalize profile departments** — new migration:
- Add `profiles.department_id UUID REFERENCES departments(id)` (keep legacy TEXT column for now).
- Backfill by matching `profiles.department` text against `departments.name/code`.
- Keep legacy column in sync via trigger until UI fully migrated.

**B. Task department scoping**:
- `wbs_tasks.department_id UUID REFERENCES departments(id)` (executing department).
- Backfill from owner's `profiles.department_id`.
- Indexes: `(project_id, department_id)`, `(department_id, status)`.
- RLS: department-scoped visibility policies.

**C. Cross-department fields on `wbs_tasks`**:
- `requesting_department_id UUID REFERENCES departments(id)` (NULL = normal task)
- `cross_dept_status TEXT CHECK (IN 'requested','accepted','rejected')`
- `cross_dept_note TEXT`, `cross_dept_decided_by UUID`, `cross_dept_decided_at TIMESTAMPTZ`

**D. Planner support + permission seeds**:
- `weekly_plan_tasks.responsible_id UUID REFERENCES profiles(id)` (keep `responsible_name`)
- `weekly_plans.department_id UUID REFERENCES departments(id)`
- Seed `role_permissions`: module `tasks`, actions `view_department`, `plan_team`, `reassign_member`, `accept_cross_request` with scope `department`.

## Phase 2 — Shared Scope Helper

New `apps/web/lib/task-scope.ts`:
- `resolveViewer()` → `{ userId, profile, departmentId, isDeptHead, managedDepartmentIds (incl. child depts), permissions }`
- Filter builders for "my tasks" and "department tasks" queries reused across all new surfaces.

## Phase 3 — My Tasks Dashboard `/dashboard/my-tasks`

- Route `app/dashboard/my-tasks/page.tsx` + `components/tasks/my-tasks-dashboard.tsx`.
- Cross-project: all `wbs_tasks` where `owner_id = me OR assignee_id = me`.
- Widgets: KPI cards (Active / Overdue / Due this week / Completed this month); "Awaiting my approval"; Overdue & due-soon lists linking to `/dashboard/tasks/[taskId]`; status breakdown chart (recharts); recent activity feed from `wbs_audit_log`.

## Phase 4 — Department Views `/dashboard/department`

- Guard: no department → empty state; non-managers read-only.
- **My Team Tasks**: reuse `WbsExecutionView` / `WbsKanbanView` filtered by department (+ member filter). Manager can reassign/edit.
- **Team Planning** (`components/tasks/team-planner-grid.tsx`): weekly people × days grid, task chips by date overlap, capacity bars vs planned hours, manager drag-drop reassignment (`owner_id`) and day shifts (`start/end_date`), unassigned backlog column, over-capacity warnings.

## Phase 5 — Cross-Department Request Flow

- Create: `WbsTaskEditSheet` gains cross-department section (executing department picker → staff picker filtered accordingly).
- Incoming queue for dept heads in My Team Tasks + widget on My Tasks dashboard: Accept / Reject with reason.
- Both departments see task; badge (⇄ + originating dept code) on kanban/table rows.
- Alerts via `lib/task-alerts.ts` (request created, accepted/rejected, completed).
- KPI additions: open requests, acceptance time, rejection rate.

## Phase 6 — Wiring, Navigation & Verification

- `sidebar.tsx`: add "My Tasks" and "Department" entries with count badges.
- Verification: `npm run lint`, `npm run typecheck` in `apps/web`; manual role-based flows.

## Out of Scope (future)

- Kanban drag-and-drop status transitions.
- Multi-department chains (A→B→C routing).
- Department capacity settings UI (default daily capacity constant for now).
