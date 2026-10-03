// Productivity & Resource-Costing Plan, Phase 3, part 2 — "fixed-crew mode -> duration preview/apply with
// audit + CPM re-run" (plan decision #7: preview/apply, never live).
//
// This mirrors components/planning/use-sheet-data.ts's applySchedule()/rescheduleTask() write path as closely
// as possible — same engine, same apply_schedule_dates RPC, same wbs_audit_log actions — rather than inventing
// a second way to reschedule a project. It is a standalone service (not a hook) so it can run from the Task
// Work page, which has no Sheet mounted. Two entry points share one pure core (computeDurationApply):
//   previewDurationApply()  — read-only, for the confirmation dialog.
//   applyDurationChange()   — writes the target task's new end_date, ripples every affected successor in one
//                              apply_schedule_dates call, logs to wbs_audit_log, then recomputes plan_task_work
//                              (whose duration_wd_current would otherwise go stale — see Phase 1 finding).
// Never touches baseline_start_date / baseline_finish_date.

import { createClient } from "@/lib/supabase/client";
import { logScheduleAudit, logScheduleFieldChanges } from "./schedule-audit";
import { getProjectCalendarRow, recomputeProjectWork } from "./productivity-service";
import { depsFromArrays, engineDuration, scheduleProject, type EngineTask } from "./schedule-engine";
import { buildWorkCalendar, finishFromStart, todayISO, type WorkCalendar } from "./work-calendar";

interface ScheduleTaskLite {
  id: string;
  wbs_node_id: string | null;
  task_code: string;
  task_name: string;
  start_date: string | null;
  end_date: string | null;
  duration_days?: number | null;
  duration_unit?: string | null;
  is_milestone: boolean;
  dependency_task_ids: string[] | null;
  dependency_types: string[] | null;
  dependency_lag_days: number[] | null;
  constraint_type: string | null;
  constraint_date: string | null;
  manually_scheduled: boolean;
}

interface NodeLite {
  id: string;
  parent_id: string | null;
  is_locked: boolean;
}

interface WorkLite {
  duration_mode: string;
  duration_wd_current: number | null;
  duration_wd_derived: number | null;
  calc_status: string;
}

export interface DurationApplyContext {
  projectId: string;
  cal: WorkCalendar;
  dataDate: string;
  tasksById: Map<string, ScheduleTaskLite>;
  allTasks: ScheduleTaskLite[];
  lockedNodeIds: Set<string>;
  workByTask: Map<string, WorkLite>;
}

/** Ancestor-locked resolution — same algorithm as use-sheet-data.ts's lockedNodeIds memo. */
export function resolveLockedNodeIds(nodes: NodeLite[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cache = new Map<string, boolean>();
  const resolve = (id: string): boolean => {
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    cache.set(id, false); // guards a malformed cycle
    const n = byId.get(id);
    const v = !!n && (n.is_locked === true || (n.parent_id ? resolve(n.parent_id) : false));
    cache.set(id, v);
    return v;
  };
  const out = new Set<string>();
  for (const n of nodes) if (resolve(n.id)) out.add(n.id);
  return out;
}

function toEngineTasks(tasks: ScheduleTaskLite[], cal: WorkCalendar): EngineTask[] {
  return tasks.map((t) => {
    const { durationWd, elapsed } = engineDuration(cal, {
      start: t.start_date,
      finish: t.end_date,
      isMilestone: t.is_milestone,
      durationDays: t.duration_days,
      unit: t.duration_unit,
    });
    return {
      id: t.id,
      start: t.start_date,
      finish: t.end_date,
      durationWd,
      elapsed,
      manuallyScheduled: t.manually_scheduled,
      constraintType: t.constraint_type,
      constraintDate: t.constraint_date,
      deps: depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
    };
  });
}

export interface RippleRow {
  id: string;
  task_code: string;
  task_name: string;
  oldStart: string | null;
  oldEnd: string | null;
  newStart: string;
  newEnd: string;
}

export type DurationApplyResult =
  | { ok: true; noChange: true; target: { id: string; task_code: string; task_name: string } }
  | {
      ok: true;
      noChange: false;
      target: { id: string; task_code: string; task_name: string; oldDurationWd: number | null; newDurationWd: number; oldEnd: string; newEnd: string };
      rippled: RippleRow[];
      skippedLocked: RippleRow[];
    }
  | { ok: false; reason: string };

const HARD_CONSTRAINTS = new Set([
  "must_start_on", "must_finish_on", "start_no_earlier_than", "start_no_later_than",
  "finish_no_earlier_than", "finish_no_later_than",
]);

/** Pure: computes what applying the derived duration to `taskId` would do, without writing anything. */
export function computeDurationApply(ctx: DurationApplyContext, taskId: string): DurationApplyResult {
  const target = ctx.tasksById.get(taskId);
  if (!target) return { ok: false, reason: "Task not found." };
  if (target.is_milestone) return { ok: false, reason: "Milestones have no duration to change." };
  if (target.constraint_type && HARD_CONSTRAINTS.has(target.constraint_type)) {
    return { ok: false, reason: `This task has a schedule constraint (${target.constraint_type.replace(/_/g, " ")}) — this tool does not override constraints; change it in the Gantt if you're sure.` };
  }
  if (target.wbs_node_id && ctx.lockedNodeIds.has(target.wbs_node_id)) {
    return { ok: false, reason: "This task is under a locked WBS node (Planning backbone) — unlock it first." };
  }
  const work = ctx.workByTask.get(taskId);
  if (!work || work.duration_mode !== "fixed_crew") {
    return { ok: false, reason: 'Set this task’s duration mode to "Fixed crew" on the Task Work page first.' };
  }
  if (work.calc_status !== "ok" || work.duration_wd_derived == null) {
    return { ok: false, reason: "No valid crew-derived duration yet — check the task's quantity, norm and unit on Task Work." };
  }
  if (!target.start_date) return { ok: false, reason: "This task has no start date yet." };

  const newEnd = finishFromStart(ctx.cal, target.start_date, work.duration_wd_derived);
  if (newEnd === target.end_date) {
    return { ok: true, noChange: true, target: { id: target.id, task_code: target.task_code, task_name: target.task_name } };
  }

  const patched = ctx.allTasks.map((t) => (t.id === taskId ? { ...t, end_date: newEnd } : t));
  const result = scheduleProject(toEngineTasks(patched, ctx.cal), ctx.cal, ctx.dataDate);
  if (!result.ok) {
    const names = result.cycle.map((id) => ctx.tasksById.get(id)?.task_code ?? id.slice(0, 8)).join(" → ");
    return { ok: false, reason: `That would create a circular dependency: ${names}` };
  }

  const rippled: RippleRow[] = [];
  const skippedLocked: RippleRow[] = [];
  for (const t of patched) {
    if (t.id === taskId) continue; // the target itself is reported separately, written as a direct patch
    const d = result.dates.get(t.id);
    if (!d) continue;
    if (d.start === t.start_date && d.finish === t.end_date) continue;
    const row: RippleRow = { id: t.id, task_code: t.task_code, task_name: t.task_name, oldStart: t.start_date, oldEnd: t.end_date, newStart: d.start, newEnd: d.finish };
    if (t.wbs_node_id && ctx.lockedNodeIds.has(t.wbs_node_id)) skippedLocked.push(row);
    else rippled.push(row);
  }

  return {
    ok: true,
    noChange: false,
    target: { id: target.id, task_code: target.task_code, task_name: target.task_name, oldDurationWd: work.duration_wd_current, newDurationWd: work.duration_wd_derived, oldEnd: target.end_date ?? "", newEnd },
    rippled,
    skippedLocked,
  };
}

/** Fetches everything computeDurationApply needs, fresh — always re-fetch right before preview/apply. */
export async function fetchDurationApplyContext(projectId: string): Promise<DurationApplyContext> {
  const supabase = createClient();
  const [tasksRes, nodesRes, workRes, projectRes] = await Promise.all([
    supabase
      .from("wbs_tasks")
      .select("id, wbs_node_id, task_code, task_name, start_date, end_date, duration_days, duration_unit, is_milestone, dependency_task_ids, dependency_types, dependency_lag_days, constraint_type, constraint_date, manually_scheduled")
      .eq("project_id", projectId)
      .limit(1000),
    supabase.from("wbs_nodes").select("id, parent_id, is_locked").eq("project_id", projectId).limit(1000),
    supabase.from("plan_task_work").select("task_id, duration_mode, duration_wd_current, duration_wd_derived, calc_status").eq("project_id", projectId).limit(1000),
    supabase.from("projects").select("data_date").eq("id", projectId).maybeSingle(),
  ]);
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (nodesRes.error) throw new Error(nodesRes.error.message);
  if (workRes.error) throw new Error(workRes.error.message);

  const { calendar, exceptions } = await getProjectCalendarRow(projectId);
  const cal = buildWorkCalendar(calendar, exceptions);

  const allTasks = ((tasksRes.data ?? []) as unknown as ScheduleTaskLite[]).map((t) => ({ ...t, is_milestone: !!t.is_milestone, manually_scheduled: !!t.manually_scheduled }));
  return {
    projectId,
    cal,
    dataDate: (projectRes.data?.data_date as string | null) ?? todayISO(),
    tasksById: new Map(allTasks.map((t) => [t.id, t])),
    allTasks,
    lockedNodeIds: resolveLockedNodeIds((nodesRes.data ?? []) as unknown as NodeLite[]),
    workByTask: new Map((workRes.data ?? []).map((w) => [w.task_id as string, w as unknown as WorkLite])),
  };
}

export async function previewDurationApply(projectId: string, taskId: string): Promise<DurationApplyResult> {
  const ctx = await fetchDurationApplyContext(projectId);
  return computeDurationApply(ctx, taskId);
}

export interface ApplyOutcome {
  applied: boolean;
  rippledCount: number;
  skippedLockedCount: number;
  reason?: string;
}

/** Re-computes fresh (never trusts a stale preview), writes, audits, then recomputes plan_task_work. */
export async function applyDurationChange(projectId: string, taskId: string): Promise<ApplyOutcome> {
  const supabase = createClient();
  const ctx = await fetchDurationApplyContext(projectId);
  const result = computeDurationApply(ctx, taskId);
  if (!result.ok) return { applied: false, rippledCount: 0, skippedLockedCount: 0, reason: result.reason };
  if (result.noChange) return { applied: false, rippledCount: 0, skippedLockedCount: 0, reason: "Already matches the crew-derived duration — nothing to apply." };

  const { target, rippled, skippedLocked } = result;

  const { error: patchError } = await supabase.from("wbs_tasks").update({ end_date: target.newEnd }).eq("id", target.id);
  if (patchError) throw new Error(patchError.message);

  if (rippled.length > 0) {
    const { error: rippleError } = await supabase.rpc("apply_schedule_dates", {
      p_project_id: projectId,
      p_rows: rippled.map((r) => ({ id: r.id, start_date: r.newStart, end_date: r.newEnd })),
    });
    if (rippleError) throw new Error(rippleError.message);
  }

  const { data: { user } } = await supabase.auth.getUser();
  await logScheduleFieldChanges(
    supabase,
    { projectId, taskId: target.id, nodeId: ctx.tasksById.get(target.id)?.wbs_node_id ?? null, userId: user?.id ?? null },
    [
      { action: "Duration Changed", fieldName: "duration_wd", oldValue: target.oldDurationWd == null ? null : String(target.oldDurationWd), newValue: String(target.newDurationWd) },
      { action: "Plan Finish Changed", fieldName: "end_date", oldValue: target.oldEnd, newValue: target.newEnd },
    ],
  );
  for (const r of rippled) {
    void logScheduleAudit(supabase, {
      projectId,
      taskId: r.id,
      nodeId: ctx.tasksById.get(r.id)?.wbs_node_id ?? null,
      userId: user?.id ?? null,
      action: "Task Rescheduled",
      fieldName: "ripple",
      oldValue: JSON.stringify({ start: r.oldStart, end: r.oldEnd }),
      newValue: JSON.stringify({ start: r.newStart, end: r.newEnd }),
    });
  }

  await recomputeProjectWork(projectId);

  return { applied: true, rippledCount: rippled.length, skippedLockedCount: skippedLocked.length };
}
