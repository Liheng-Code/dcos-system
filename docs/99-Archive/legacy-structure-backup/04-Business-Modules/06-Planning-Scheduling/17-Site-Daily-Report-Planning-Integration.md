# DCOS Site Daily Report to Planning Activity Integration Specification

**Module:** Construction Site Management (`site_daily_reports`) $\leftrightarrow$ Planning & Scheduling (`wbs_tasks`, `wbs_task_steps`, `plan_productivity_logs`, `delay_register`)  
**Status:** Implemented & Verified (Phases 1-4 Complete)  
**Migration:** `supabase/migrations/20260928000005_daily_report_planning_integration.sql`

---

## 1. Overview & Business Objectives

In traditional construction workflows, daily site records (diaries/journals) and master scheduling tools operate in silos:
- Site supervisors fill daily reports describing field activities, trades, crew counts, and delays.
- Schedulers manually enter progress percentages into the Gantt or CPM engine days or weeks later without direct audit trails.

The **DCOS Construction $\leftrightarrow$ Planning Integration** establishes a closed-loop digital thread:
1. **Field Logging**: Site engineers select active planning activities (`wbs_tasks`) directly within the Daily Report editor.
2. **Step-Level Weighted Rollup**: If an activity uses steps (`wbs_task_steps`), updating checklists automatically calculates the overall task progress $\frac{\sum (\text{progress}_i \times \text{weight}_i)}{\sum \text{weight}_i}$.
3. **Governance-Aware Submission**: Submitting a report calls `sync_daily_report_to_planning()`:
   - When `progress_review_enabled = true`: The submission routes to the Planner Review Queue (`wbs_task_progress_reviews`) with site daily report provenance.
   - When `progress_review_enabled = false`: The submission updates `wbs_tasks.progress` directly.
4. **Field Productivity Capture**: Installed output units and crew man-hours automatically log into `plan_productivity_logs` (`source = 'site_diary'`), feeding historical productivity baselines.
5. **Contract Delay Registration**: Impediments and site stoppages automatically create records in `delay_register` with excusable/non-excusable classification.
6. **Planner Site Diary Timeline**: Planners inspecting tasks in the Sheet or Gantt drawer see the exact chronological site history without leaving the planning view.

---

## 2. Architecture & Data Flow

```
+-----------------------------------------------------------------------------------+
|                        Construction Module: Daily Report                          |
|  - site_daily_reports (header: date, weather, site conditions)                    |
|  - site_daily_report_activities (task_id, steps, output qty, crew hrs, delay flag)|
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼ Submit & Sync
                     [sync_daily_report_to_planning(UUID)]
                                         │
           ┌─────────────────────────────┼─────────────────────────────┐
           ▼                             ▼                             ▼
+---------------------+      +-----------------------+      +--------------------+
|   Progress Routing  |      |   Productivity Logs   |      |   Delay Register   |
|                     |      |                       |      |                    |
| If review enabled:  |      | plan_productivity_    |      | delay_register     |
|   wbs_task_         |      | logs:                 |      | delay_type:        |
|   progress_reviews  |      | - source: 'site_diary'|      | excusable/         |
|                     |      | - headcount & hrs     |      | non_excusable      |
| If direct mode:     |      | - quantity_done & unit|      | - cause & notes    |
|   wbs_tasks.progress|      |                       |      |                    |
+---------------------+      +-----------------------+      +--------------------+
           │
           ▼
+-----------------------------------------------------------------------------------+
|                      Planning Activity Feedback Panels                            |
|  - PlanActivitySiteDiaryPanel (historical site log timeline in drawers)           |
|  - PlanProgressReviewQueue (provenance badge with daily report link)               |
+-----------------------------------------------------------------------------------+
```

---

## 3. Database Schema Reference

### `site_daily_report_activities`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `daily_report_id` | UUID | FK to `site_daily_reports(id)` ON DELETE CASCADE |
| `task_id` | UUID | FK to `wbs_tasks(id)` ON DELETE RESTRICT |
| `activity_status` | TEXT | `not_started`, `in_progress`, `completed`, `hindered`, `stopped` |
| `progress_before` | NUMERIC | Progress % at time of report creation |
| `progress_today` | NUMERIC | Physical % achieved on report date |
| `actual_start_date`| DATE | Recorded actual start date |
| `actual_finish_date`| DATE | Recorded actual finish date (when 100%) |
| `step_progress` | JSONB | Array of `{ step_id, step_no, step_name, progress, weight, is_completed }` |
| `trade_code` | TEXT | Trade / crew craft responsible |
| `headcount` | INT | Crew size |
| `hours_normal` | NUMERIC | Normal working hours per person |
| `hours_ot` | NUMERIC | Overtime hours per person |
| `quantity_done` | NUMERIC | Measured work output installed today |
| `quantity_unit` | TEXT | Unit of measurement (e.g. m2, m3, ton, lm) |
| `work_description` | TEXT | Daily observation notes & field logs |
| `has_delay` | BOOLEAN | Flag if activity was delayed |
| `delay_reason` | TEXT | Explanation of delay |
| `delay_hours_lost` | NUMERIC | Estimated hours lost |
| `delay_category` | TEXT | `weather`, `material`, `labor`, `subcontractor`, `rfi_design`, `client`, `safety`, `other` |
| `progress_review_id`| UUID | FK to `wbs_task_progress_reviews(id)` if routed to review queue |
| `productivity_log_id`| UUID | FK to `plan_productivity_logs(id)` |
| `delay_event_id` | UUID | FK to `delay_register(id)` |
| `sync_status` | TEXT | `draft`, `synced`, `pending_approval`, `approved`, `rejected` |

---

## 4. Key Functions & RPCs

1. `sync_daily_report_to_planning(p_daily_report_id UUID) -> JSONB`:
   - Validates report status and iterates through child activity items.
   - Synchronizes steps to `wbs_task_steps`.
   - Calls `submit_progress()` respecting schedule governance settings.
   - Records actual start/finish dates on `wbs_tasks`.
   - Populates or updates `plan_productivity_logs`.
   - Creates `delay_register` entries for flagged delays.

2. `get_daily_report_planning_context(p_project_id UUID, p_date DATE) -> TABLE`:
   - Returns scheduled and in-progress WBS tasks active on or around `p_date`.
   - Includes current progress, planned dates, unit quantities, norm trades, and nested step checklists (`steps_json`).

3. `get_task_site_diary_history(p_task_id UUID) -> TABLE`:
   - Returns chronological site diary records for an individual task.

---

## 5. UI Components

- [`apps/web/components/construction/site/daily-report-editor.tsx`](file:///d:/dcos-system/apps/web/components/construction/site/daily-report-editor.tsx): Master-detail modal editor with planning activity picker and step checklists.
- [`apps/web/components/construction/site/site-daily-reports.tsx`](file:///d:/dcos-system/apps/web/components/construction/site/site-daily-reports.tsx): Construction daily reports register with status badges and quick re-sync.
- [`apps/web/components/planning/plan-activity-site-diary-panel.tsx`](file:///d:/dcos-system/apps/web/components/planning/plan-activity-site-diary-panel.tsx): Site diary timeline panel for planners.
- [`apps/web/components/planning/plan-sheet-detail-panel.tsx`](file:///d:/dcos-system/apps/web/components/planning/plan-sheet-detail-panel.tsx): Tabbed switcher in task sheet.
- [`apps/web/components/planning/gantt-task-detail-drawer.tsx`](file:///d:/dcos-system/apps/web/components/planning/gantt-task-detail-drawer.tsx): Site diary inspection drawer in Gantt view.
- [`apps/web/components/planning/plan-progress-review-queue.tsx`](file:///d:/dcos-system/apps/web/components/planning/plan-progress-review-queue.tsx): Review queue with site provenance badges.

---

## 6. Testing & Quality Assurance

- **Vitest Unit Test Suite**: [`apps/web/lib/construction/site/__tests__/daily-report-sync.test.ts`](file:///d:/dcos-system/apps/web/lib/construction/site/__tests__/daily-report-sync.test.ts)
  - 24 automated unit tests verifying weighted rollup, status derivation, man-hour calculation, productivity rate, delay categorizations, and validation.
- Full test suite: **197 passing tests**, 0 failures.
- TypeScript: Typecheck passed (`tsc --noEmit` exit code 0).
