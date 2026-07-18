# Task Management Module — R1 Improvements Plan

Based on design review of `task_management_flow_R1.html` and codebase analysis.

## 1. Paused Status + Timeline Tracking

Add `paused` status and timestamp tracking for task pauses (common in construction).

- **DB**: Add columns `started_at timestamptz`, `paused_at timestamptz` to `wbs_tasks`. Add `'paused'` to status check constraint
- **Type**: Update `WbsTaskRecord` with new fields (`started_at`, `paused_at`)
- **Task edit sheet** (Phase 2): Add `paused` status option, auto-set timestamps on status change
- **Execution view**: Show paused rows with amber styling
- **Kanban**: Add "Paused" column between "In Progress" and "Pending Approval"

## 2. Workload Check on Assignment

Warn assignee if receiver already has 5+ active tasks.

- **Task edit sheet** (Phase 1): When `owner_name` changes, query count of `wbs_tasks` where `owner_name = X AND status IN ('assigned','in_progress')`
- Show inline warning: "⚠️ This person has 5 active tasks — consider redistributing"
- No hard block, just a visible advisory

## 3. Clarification Notes (Comment System)

Receiver can add notes/questions, assignee can reply — simple, no status change.

- **DB**: Add `comments jsonb` column to `wbs_tasks` (array of `{user, text, timestamp}`)
- **Task edit sheet / execution view**: Add a "Notes & Clarifications" section with a text area and submit button
- Receiver writes a note → assignee sees it → assignee replies → all in the same thread
- No status change, no notification system for R1

## 4. Progress Evidence Gate

Progress=100% mandatory to submit for approval; evidence optional but tracked.

- **Task edit sheet** (Phase 2): Block the "Submit for Approval" flow unless `progress = 100`
- Show `docs_count` and `photos_count` as read-only counters
- No hard block on evidence — just track counts
- Execution view: show evidence columns as-is (already exists)

## 5. `delay_status` Surfacing + `CANCELLED` State

Show delay indicators everywhere + add cancelled terminal state.

- **DB**: Add `'cancelled'` to status check constraint in `wbs_tasks`
- **Execution view**: Add "Delay" column badge (color-coded: on_track → green, delayed → red, at_risk → amber). Add "Cancel" action button
- **Kanban**: Add cancelled indicator for tasks that end up cancelled
- **Gantt**: Show delay status on bars
- **Task edit sheet**: Add cancelled status option, with cancellation reason field

## 6. Bulk Operations + Duplicate Task

Duplicate individual tasks.

- **Execution view**: Add a "Duplicate" button on each row (similar to WBS node duplicate)
- Clicking creates a copy of the task with `-copy` appended to `task_code`, copies all fields, resets `status` to `open`, `progress` to 0
- Future: checkboxes + bulk actions (not in R1 scope)

## Files to modify

| File | Changes |
|------|---------|
| `wbs-types.ts` | Add `started_at`, `paused_at`, `comments` to `WbsTaskRecord` |
| `wbs-task-edit-sheet.tsx` | Paused/cancelled status, workload check, clarification notes, progress gate |
| `wbs-execution-view.tsx` | Delay badge, cancelled/paused rows, duplicate button |
| `wbs-kanban-view.tsx` | Paused/cancelled columns |
| `wbs-gantt-view.tsx` | Surface delay status on bars |
| New Supabase migration | Add columns, update constraints |

## Design Decisions

- **Progress evidence**: Simple gate (progress=100% mandatory, evidence optional)
- **Clarification loop**: Simple comments/notes, no status change
- **Workload threshold**: 5 active tasks default
- **Multi-level approval**: Skipped for R1
- **Dependencies**: Skipped for R1
