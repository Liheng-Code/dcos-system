# DCOS Task Module — Architecture Analysis (2026-05-30)

## Overview

This document is a full audit of the DCOS task management module against the DCOS architect standard. It covers what has been built, what is missing, and a prioritised gap list for next implementation.

---

## ✅ WHAT IS DONE (Strong Foundation)

### Database Layer (Supabase / PostgreSQL)

| Table | Status | Notes |
|-------|--------|-------|
| `wbs_nodes` | ✅ Done | Hierarchical tree, full_path trigger, status, progress_percent |
| `wbs_tasks` | ✅ Done | Full task record — 30+ fields covering status, progress, QA, schedule, cost, hours, dependencies, attachments |
| `wbs_audit_log` | ✅ Done | Field-level change tracking per task and per node |
| `task_alerts` | ✅ Done | In-app notification queue, 7 alert types, real-time subscription |
| `wbs_baselines` | ✅ Done | Snapshot table with `baseline_type` (contract/revised/current) and `snapshot_data` JSONB |
| `wbs_subscriptions` | ✅ Done | Follow a node without being assigned; selective notify flags |
| `documents` | ✅ Done | Document control table linked to wbs_node_id; status workflow |
| `task-attachments` bucket | ✅ Done | File storage with `{task_id}/documents/` and `{task_id}/photos/` paths |

### `wbs_tasks` Field Coverage

| Category | Fields Present |
|----------|---------------|
| Identity | `id`, `task_code` (unique per project), `task_name`, `description` |
| Workflow | `status` (8 values), `qa_status` (6 values), `delay_status` (4 values) |
| Assignment | `owner_id`, `owner_name` (denormalized) |
| Schedule | `start_date`, `end_date`, `started_at`, `paused_at` |
| Classification | `discipline` (8 codes), `task_type` (8 types), `category` (8 categories), `priority` |
| Dependency | `dependency_task_id`, `dependency_type` (fs/ss/ff/sf), `dependency_text` |
| Cost & Hours | `budget_cost`, `actual_cost`, `planned_hours`, `actual_hours` |
| Attachments | `docs_count`, `photos_count` |
| Comments | `comments` (JSONB array) |
| Metadata | `sort_order`, `created_at`, `updated_at` |

### Task Status Workflow

```
open → in_progress → paused
          ↓
       blocked → review
          ↓
       submitted  ← auto-triggered at progress=100%
          ↓
    approved/completed   ←→   rejected (back to open)
          ↓
        closed / cancelled
```

### Frontend Components

| Component | Status | Notes |
|-----------|--------|-------|
| `wbs-task-edit-sheet.tsx` (1110 lines) | ✅ Done | Full CRUD: create, edit, assign, accept/reject assignment, progress update, file upload, approve, reject, audit trail display |
| `wbs-tasks-page.tsx` | ✅ Done | Task list landing with Execution and Kanban view toggle |
| `wbs-execution-view.tsx` | ✅ Done | Table view — status, receiver, assignee, progress, delay, dependencies, docs/photos counts |
| `wbs-kanban-view.tsx` | ✅ Done | 6-column Kanban: Open → Assigned → In Progress → Pending Approval → Approved/Rejected → Completed |
| `wbs-node-detail-panel.tsx` | ✅ Done | Node context panel — linked docs, QA checks, RFIs, approvals, 10-item activity timeline |
| `task-alerts-provider.tsx` + `task-alerts-menu.tsx` | ✅ Done | Real-time alert bell with unread count, mark-read, 15-second polling fallback |

### Business Logic / RBAC

| Feature | Status |
|---------|--------|
| Dual-actor model (Assigner sets plan; Receiver updates progress) | ✅ Done |
| RBAC permission checks — assign, update_progress, approve, reject | ✅ Done |
| Task locking after approval (non-L0 users) | ✅ Done |
| Assignment acceptance / rejection by receiver with reason | ✅ Done |
| Auto-submit at 100% progress | ✅ Done |
| Approval + rejection with reason and optional attachments | ✅ Done |
| Audit trail displayed in task edit sheet | ✅ Done |
| Node-level activity feed | ✅ Done |
| Supabase real-time subscription on `task_alerts` | ✅ Done |

---

## ❌ WHAT IS MISSING (Gap Analysis)

### GAP 1 — Dependency Management UI (Critical for scheduling)
- `dependency_task_id`, `dependency_type`, `dependency_text` fields exist in DB
- **No UI controls** to set or edit dependencies in `wbs-task-edit-sheet.tsx`
- No dependency picker (search for predecessor task by code/name)
- No cycle detection enforcement in UI
- No **lag/lead time** field (needed for realistic CPM)
- **Impact:** Dependencies stored as dead data. Cannot build a real schedule or critical path.

### GAP 2 — Gantt Chart Incomplete
- `wbs-gantt-view.tsx` is only ~50 lines — stub or partial
- No working drag-to-reschedule
- No baseline vs. actual comparison (baseline table exists but not used in Gantt)
- No critical path highlight in Gantt
- **Impact:** Planning/scheduling module is missing its primary view.

### GAP 3 — No Baseline Per Task (schedule baseline gap)
- `wbs_baselines` table stores a JSONB snapshot — **not per-task fields**
- `wbs_tasks` has NO `baseline_start_date` / `baseline_finish_date` columns
- Delay detection compares `end_date < today` — this breaks after any reschedule
- No `SET BASELINE` operation that locks planned dates
- **Impact:** Cannot calculate schedule variance (SV), cannot detect true delays vs. re-baselined tasks.

### GAP 4 — No Assignee / Receiver Separation
- `owner_id` / `owner_name` conflates both the "assigner" and "assignee/receiver"
- No `assigned_by_id` field on `wbs_tasks` (who made the assignment)
- No `receiver_id` field separate from the assigner
- **Impact:** Unclear accountability. Audit log tracks "Assignee Changed" but the task table does not cleanly separate who owns vs. who assigned.

### GAP 5 — Weighted Progress Rollup Broken
- `wbs_tasks` has no `weight` field
- `wbs_nodes.progress_percent` is computed using simple average
- Without weight, a 1-hour task and a 100-hour task contribute equally to node progress
- **Impact:** WBS-level progress is incorrect on real projects.

### GAP 6 — No Proper Comment/Discussion System
- `comments` is a JSONB array on `wbs_tasks` — no dedicated table
- UI in `wbs-task-edit-sheet.tsx` does NOT render comments (data exists, UI doesn't show it)
- No threading, no @mention, no edit/delete per comment
- "Note" on progress update is logged to audit, not to the comment array
- **Impact:** Collaboration on tasks is silent — no real discussion trail.

### GAP 7 — Multi-Level Approval Not Wired to Tasks
- HR module has a full `approval-chain.ts` with L0–L6 role hierarchy resolver
- Task approval is single-step only (submit → one approver)
- No `current_approver_id`, no `approval_step`, no delegated approval
- The HR `resolveApprovalChain()` function is not used for tasks
- **Impact:** Enterprise construction requires multi-level approval for critical tasks.

### GAP 8 — No Email / External Notifications
- Alert system is in-app only (7 alert types via `task_alerts`)
- No email dispatch on `task_assigned`, `task_approved`, `task_rejected`, `task_overdue`
- No Telegram/push notifications
- No escalation rules (e.g., approval pending >48h → escalate to L3)
- No "task overdue" scheduled alert
- **Impact:** Users who are not logged in miss critical assignments and approvals.

### GAP 9 — No Module Linkage
Tasks exist in isolation. Missing links to:

| Link | Status |
|------|--------|
| Document Control — link a task to formal document revisions | ❌ Missing |
| RFI — link a task to open RFIs blocking it | ❌ Missing |
| QA/QC Inspection — link a task to its required inspection | ❌ Missing |
| Procurement PO/Material — link a task to required materials | ❌ Missing |
| BOQ Line Item — link a task to its cost code in budget | ❌ Missing |
| Drawing — link a task to the IFC drawing it executes | ❌ Missing |

### GAP 10 — No `tenant_id` on `wbs_tasks`
- `wbs_tasks` only has `project_id`, no `tenant_id`
- Multi-tenant isolation relies entirely on project_id → projects.tenant_id join
- **Impact:** Potential cross-tenant data leak if RLS policy has a bug.

### GAP 11 — Hard Delete Only (No Soft Delete)
- `wbs_tasks` has no `deleted_at` / `archived_at` column
- Deletes are permanent — audit log entry is orphaned after delete
- **Impact:** Accidental task deletion is unrecoverable.

### GAP 12 — Resource Management View Incomplete
- `wbs-resources-view.tsx` is partial (~50 lines)
- No resource capacity vs. allocation tracking
- No overallocation detection
- **Impact:** Project managers cannot see if they are over-allocating people.

### GAP 13 — No EVM Metrics or S-Curve
- No `ProgressSnapshot` model for time-series data
- Cannot compute CPI, SPI, EAC, VAC (needs GAP 3 baseline first)
- No S-Curve chart (planned vs. actual cumulative progress)
- 2/4/6-week lookahead view not implemented
- **Impact:** Commercial reporting and earned value tracking is missing.

### GAP 14 — Stakeholder Staff Not Assignable to Tasks
- `wbs-task-edit-sheet.tsx` loads `profiles` table only (internal HR employees)
- External stakeholder staff (`stakeholder_staff` table) cannot be assigned to tasks
- **Impact:** Subcontractors and consultants cannot receive task assignments.

---

## Priority Order for Next Implementation

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| 🔴 P1 | GAP 3 — Baseline fields on `wbs_tasks` + set-baseline operation | Medium | Fixes delay detection + enables EVM |
| 🔴 P2 | GAP 5 — Weight field + weighted progress rollup | Medium | Fixes WBS progress accuracy |
| 🔴 P3 | GAP 1 — Dependency management UI (picker + validation) | Medium | Makes scheduling functional |
| 🔴 P4 | GAP 2 — Gantt chart with drag-reschedule + baseline overlay | High | Primary scheduling view |
| 🟡 P5 | GAP 6 — Task comments table + UI | Low | Collaboration quality |
| 🟡 P6 | GAP 4 — Add `assigned_by_id` + `receiver_id` to `wbs_tasks` | Low | Data model clarity |
| 🟡 P7 | GAP 8 — Email notifications for assigned/approved/rejected | Medium | Missed-notification problem |
| 🟠 P8 | GAP 10 — Add `tenant_id` to `wbs_tasks` | Low | Security hardening |
| 🟠 P9 | GAP 11 — Soft delete (`deleted_at`) | Low | Data safety |
| 🟠 P10 | GAP 9 — Link tasks to documents, RFIs, BOQ | High | Cross-module integration |
| 🔵 P11 | GAP 7 — Multi-level approval chain for tasks | High | Enterprise compliance |
| 🔵 P12 | GAP 13 — EVM metrics + S-Curve (needs P1 first) | High | Commercial reporting |
| 🔵 P13 | GAP 14 — Stakeholder staff assignable to tasks | Medium | External team management |
| 🔵 P14 | GAP 12 — Resource management / overallocation detection | High | Capacity planning |

---

## Recommended Next Sprint (3 Surgical Changes)

These three items have the highest value-to-effort ratio and unblock everything downstream:

### 1. Baseline fields on `wbs_tasks` (Migration + UI)
Add to `wbs_tasks`:
- `baseline_start_date DATE`
- `baseline_finish_date DATE`
- `baseline_set_at TIMESTAMPTZ`
- `baseline_set_by UUID`

Add "Set Baseline" button in `wbs-task-edit-sheet.tsx` that copies `start_date`/`end_date` → baseline fields (one-time lock). Show schedule variance badge (`start_date - baseline_start_date` days).

**Unlocks:** True delay detection, schedule variance, Gantt baseline overlay, EVM.

### 2. Weight field + weighted progress rollup
Add `weight NUMERIC DEFAULT 1` to `wbs_tasks`. Update the progress rollup trigger on `wbs_nodes` to compute `SUM(progress * weight) / SUM(weight)` instead of simple average.

**Unlocks:** Accurate WBS progress at every level.

### 3. Dependency picker UI
In `wbs-task-edit-sheet.tsx`, add a dependency section:
- Task code search input → resolves to `dependency_task_id`
- Dropdown for `dependency_type` (FS / SS / FF / SF)
- Numeric input for lag days
- Visual badge showing predecessor code in execution view

**Unlocks:** Meaningful dependency data for Gantt and critical path.
