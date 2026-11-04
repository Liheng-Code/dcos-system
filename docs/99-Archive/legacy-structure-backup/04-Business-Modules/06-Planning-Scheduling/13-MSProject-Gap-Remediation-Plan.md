# 13-MSProject-Gap-Remediation-Plan.md

# Planning & Scheduling — MS Project Feature-Gap Remediation Plan

Status: Proposed (not yet implemented)
Source: Gantt Chart module audit against Microsoft Project's feature set (2026-09-05)
Scope: Four gaps selected for implementation, out of the full audit findings.

---

## 0. Background

A full audit of the Planning ▸ Gantt Chart module (`apps/web/components/planning/`, `apps/web/lib/planning/`) against Microsoft Project's feature set found the core engine already strong — real CPM (forward/backward pass, total/free float), all four dependency types with lag/lead, functional manual/auto scheduling, an 11-slot baseline system, and a genuine PV/EV/AC/CPI/SPI EVM implementation.

Four concrete gaps were selected to close next, ranked by value/effort:

1. **Delay Register unreachable from the nav** — a one-line config bug, same class of issue as the earlier Look-ahead tab fix.
2. **Resource assignment is a free-text field** — `owner_name` on `wbs_tasks` has no resource master, no allocation %, no over-allocation detection.
3. **Baseline variance is date-only** — no duration variance, no cost variance, despite the baseline and cost infrastructure already existing.
4. **Three constraint types are silently no-ops** — ALAP, Start No Later Than, Finish No Later Than are accepted in the UI but never enforced or meaningfully validated by the scheduling engine.

Each is written up below as an independent, separately-shippable unit of work.

---

## 1. Fix: Delay Register tab is missing from Planning nav

### Problem

`apps/web/app/dashboard/planning/delays/page.tsx` exists and renders `PlanDelayRegister` (`plan-delay-register.tsx`), but the route is never listed in `PLANNING_GROUPS` (`apps/web/lib/planning-nav.ts:12-54`). Unlike the earlier Look-ahead/Comparison bug (those *were* listed but flagged `is_active: false` in the `nav_item_settings` table), this route was never added to the tab config at all — it's unreachable from any tab bar, only accessible by typing the URL directly.

### Fix

Add one entry to the `resources_reports` group in `apps/web/lib/planning-nav.ts`, next to the existing `Reports` item:

```ts
{ label: "Delay Register", href: "/dashboard/planning/delays" },
```

### Verification

- Confirm the tab appears under Planning ▸ Resources & Reports.
- Query `nav_item_settings` for `nav_key = '/dashboard/planning/delays'` — if a row exists with `is_active: false` (unlikely, since the route was never in the nav config to be toggled), flip it to `true` the same way the Look-ahead/Comparison rows were fixed this session.

---

## 2. Feature: Resource assignment + over-allocation detection

### Problem

There is no resource entity anywhere in the schema. `PlanResourceLoading` (`apps/web/components/planning/plan-resource-loading.tsx:31-33`) groups tasks by the free-text `wbs_tasks.owner_name` string. This means:
- The same person typed two different ways ("J. Tan" vs "John Tan") becomes two separate resources.
- There's no allocation % — a task either has an owner or doesn't, with no concept of "50% on this task."
- There's no over-allocation detection — MS Project's core resource-management value (the "red person" indicator for double-booking) has no equivalent.

### Design

**New tables** (new migration, e.g. `supabase/migrations/<ts>_create_plan_resources.sql`):

```sql
create table public.plan_resources (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  name            text not null,
  resource_type   text not null default 'labor', -- labor | equipment | material | subcontractor
  max_units       numeric not null default 100,  -- MS Project's "Max Units %"
  cost_per_unit   numeric,
  unit_label      text,                           -- e.g. "hr", "day", "m3"
  calendar_id     uuid references public.plan_calendars(id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table public.plan_task_assignments (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid not null references public.wbs_tasks(id) on delete cascade,
  resource_id        uuid not null references public.plan_resources(id) on delete cascade,
  allocation_percent numeric not null default 100,
  created_at         timestamptz not null default now(),
  unique (task_id, resource_id)
);
```

RLS: same tenant-scoped pattern as `plan_calendars`/`wbs_baselines` (project membership check via existing helper policies).

Keep `wbs_tasks.owner_name` as-is for now (it's read by Look-ahead and the print table) — don't remove it in this pass. A follow-up backfill script can turn distinct `owner_name` values into `plan_resources` rows and create matching assignments, but that's optional cleanup, not required for the feature to work going forward.

**Over-allocation detection** — new RPC `get_resource_allocation(p_project_id uuid)`, security invoker, returning one row per `(resource_id, work_date)` with `total_allocation numeric`: for every task with an assignment, expand its working days (respecting the resource's calendar if set, else the project default) and sum `allocation_percent` per resource per day. A day is over-allocated when `total_allocation > max_units`. This mirrors the CPM engine's existing pattern of working-day expansion (`lib/planning/work-calendar.ts`) — reuse `addWorkingDays`/calendar logic client-side if it's simpler to compute in TypeScript from an already-fetched task+assignment list rather than in SQL; either is acceptable, but don't duplicate the calendar logic a third time — call into `work-calendar.ts`.

**UI**:
- Replace `plan-resource-loading.tsx`'s grouping key from `owner_name` string to `resource_id`, sourced from `plan_task_assignments` joined to `plan_resources`.
- Add a thin "allocation" sub-row above each resource's task bars showing daily total % as a heatmap strip — green ≤100%, red >100% — the direct equivalent of MS Project's overallocation indicator.
- New lightweight CRUD for `plan_resources` (a dialog similar to `plan-set-baseline-dialog.tsx` in structure) — add/edit/deactivate a resource, reachable from the Resources tab.
- Task detail (`gantt-task-detail-drawer.tsx`) gains a resource picker (assign one or more resources + allocation % per assignment) alongside the existing single free-text owner field.

### Files touched

- New migration: `plan_resources`, `plan_task_assignments`, `get_resource_allocation` RPC.
- `apps/web/lib/planning/` — new `resource-service.ts` (CRUD + allocation fetch, same shape as `baseline-service.ts`).
- `apps/web/components/planning/plan-resource-loading.tsx` — rework grouping + add allocation heatmap row.
- `apps/web/components/planning/gantt-task-detail-drawer.tsx` — add resource/allocation picker.
- New `apps/web/components/planning/plan-resource-dialog.tsx` — resource CRUD.

### Verification

1. Create two resources, assign both to overlapping tasks at 100% each → confirm the allocation strip shows red on the overlapping days.
2. Assign one resource at 50% across two non-overlapping tasks → confirm no over-allocation flag.
3. Confirm existing `owner_name`-based views (Look-ahead, print tables) are unaffected.

---

## 3. Feature: Baseline duration + cost variance

### Problem

`get_schedule_variance()` (`supabase/migrations/20260531000004_create_schedule_rpcs.sql:24-61`) only returns `start_variance_days`/`finish_variance_days`. Duration variance and cost variance — both standard MS Project baseline comparisons — are missing entirely. Duration variance can be derived from existing columns; cost variance can't, because `wbs_tasks.budget_cost` (`supabase/migrations/20260527000016_create_wbs_enterprise_tables.sql:39`) is a live, editable field with no frozen "as-baselined" counterpart — unlike `start_date`/`end_date`, which do have `baseline_start_date`/`baseline_finish_date` (`supabase/migrations/20260530000006_add_baseline_fields_to_wbs_tasks.sql`).

### Design

**New migration** (e.g. `<ts>_add_baseline_cost_variance.sql`):

1. `alter table public.wbs_tasks add column if not exists baseline_cost numeric;`
2. Update the three baseline RPCs in `20260904000003_planning_project_tools.sql` (`set_baseline`, `clear_baseline`, `activate_baseline`) with `create or replace function` to also snapshot/restore/clear `budget_cost` the same way they already handle `start_date`/`end_date`:
   - `set_baseline`: include `budget_cost` in the `jsonb_build_object` snapshot and in the final `update wbs_tasks ... set baseline_cost = (e->>'budget_cost')::numeric`.
   - `activate_baseline`: same pattern — read `budget_cost` back out of `snapshot_data` into `baseline_cost`.
   - `clear_baseline`: null out `baseline_cost` alongside the existing date fields when clearing an active baseline.
3. `create or replace function get_schedule_variance(...)` adding:
   - `duration_variance_days int` = `(end_date - start_date) - (baseline_finish_date - baseline_start_date)`
   - `baseline_cost numeric`, `cost_variance numeric` = `budget_cost - baseline_cost`, `cost_variance_percent numeric` = `case when baseline_cost > 0 then (budget_cost - baseline_cost) / baseline_cost * 100 else null end`

**UI**: `plan-comparison-dashboard.tsx` — add two columns/KPI tiles (Duration Variance, Cost Variance) next to the existing start/finish variance display, using the same delayed/ahead color convention already used there.

### Files touched

- New migration (schema + 3 replaced baseline RPCs + replaced `get_schedule_variance`).
- `apps/web/lib/planning/baseline-service.ts` — no signature changes needed (RPCs keep the same params); update `BaselineRow`/comparison types if the dashboard reads a typed wrapper.
- `apps/web/components/planning/plan-comparison-dashboard.tsx` — render the two new fields.

### Verification

1. Set a baseline on a project with `budget_cost` populated → confirm `baseline_cost` is populated on the tasks.
2. Edit `budget_cost` on a task after baselining (simulate a VO) → confirm `cost_variance` in the comparison dashboard reflects the delta.
3. Confirm `duration_variance_days` matches manual calculation on a task whose duration changed since baselining.
4. Re-run `activate_baseline` between two baseline slots with different costs → confirm `baseline_cost` swaps correctly, same as the existing date fields do today.

---

## 4. Fix: Enforce (or correctly flag) ALAP / SNLT / FNLT constraints

### Problem

`lib/planning/schedule-engine.ts:86-90` puts `start_no_later_than`, `finish_no_later_than`, and `as_late_as_possible` in `SOFT_CONSTRAINTS`, and unconditionally records `"<label> (<date>) is not enforced"` into the `violations` map whenever one is set (`schedule-engine.ts:215-217`) — even when the schedule already happens to satisfy it. This is a correctness trap: a planner can set "Finish No Later Than" on a task, see no error, and not realize the field does nothing.

Full MS-Project-grade enforcement of these three requires iterative resource-unconstrained leveling and is legitimately out of scope for this engine (per the existing code comment). A scoped, honest fix is achievable without that:

### Design

**SNLT / FNLT — turn "always flagged" into "flagged only when actually missed":**
The engine already computes the link-driven `start` before applying constraints. For these two:
- `start_no_later_than`: compute `impliedLatestStart = nextWorkingDay(cal, cd, -1)` direction (latest start that keeps the task starting on/before `cd`). If the link-driven `start` already satisfies `start <= cd`, no violation — the constraint is naturally met, don't flag it. If `start > cd`, record a real violation: `"Start No Later Than <cd> missed — predecessors push start to <start>"`.
- `finish_no_later_than`: same pattern against `finish <= cd`, using the already-computed `computedFinish`.

This doesn't change any dates (still can't pull a task earlier than its predecessors allow without full leveling), but it fixes the false-positive/false-negative problem: today it always warns; after this fix it warns exactly when the deadline is genuinely at risk, which is the actually useful signal for a planner.

**ALAP — implement via the existing backward pass (single-pass approximation):**
The backward pass already computes `lateStart`/`lateFinish` per task (the same values used for `totalFloat`). For a task with `constraintType === "as_late_as_possible"`, after the backward pass completes, set that task's displayed `start`/`finish` to its `lateStart`/`lateFinish` (bounded by not violating any hard-constrained successor — i.e. skip the override if the task has zero float relative to a hard-constrained successor already computed). This is the standard simplified approach lightweight schedulers use for ALAP: it is not iterative multi-pass leveling (which would be needed if moving one ALAP task could change another's optimal late date), but it correctly reproduces MS Project's basic ALAP behavior for the common case — a task with slack that should sit at the end of its float window rather than the start.

Document this scope limit explicitly in the code comment (as the file already does for the "not enforced" cases today), so a future reader doesn't assume it's full leveling.

### Files touched

- `apps/web/lib/planning/schedule-engine.ts` — rework the `SOFT_CONSTRAINTS` branch (~lines 203-227) per above; add the post-backward-pass ALAP override where `violations`/`float` are finalized (~line 327 area).
- `apps/web/components/planning/gantt-task-detail-drawer.tsx` / wherever constraint violations are surfaced in the UI — confirm the (now more accurate) violation messages are actually shown to the user; if `violations` isn't currently rendered anywhere, add a small warning badge/tooltip on the affected row (check `sheet-row.tsx` for where `is_critical`-style badges already render, and follow that pattern).

### Verification

1. Set "Finish No Later Than" to a date the schedule already meets → confirm no violation is now shown (previously always showed one).
2. Set the same constraint to a date predecessors will blow past → confirm the violation message and its computed "missed by N days" framing are correct.
3. Set ALAP on a task with 5 days of float → confirm it now schedules at the *end* of its float window (late start) instead of the earliest possible date, and that critical-path tasks are unaffected (float = 0 tasks have no room to move, so ALAP is a no-op for them — verify this doesn't crash or misbehave).

---

## Suggested sequencing

1. Delay Register nav fix (trivial, ship first).
2. Constraint enforcement fix (contained to one file, no schema change).
3. Baseline duration/cost variance (schema + RPC change, moderate).
4. Resource assignment + over-allocation (largest — new tables, new service layer, UI rework).