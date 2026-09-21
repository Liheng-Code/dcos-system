import { createClient } from "@/lib/supabase/client";
import { depsFromArrays, scheduleProject, type EngineTask } from "./schedule-engine";
import { buildWorkCalendar, todayISO, workingDaysBetween, type PlanCalendarExceptionRow, type PlanCalendarRow, type WorkCalendar } from "./work-calendar";
import { levelResources, type LevelTask, type ResourceLevellingResult } from "./resource-levelling";
import { logScheduleAudit } from "./schedule-audit";

export interface LevellingContext {
  levelTasks: LevelTask[];
  cal: WorkCalendar;
  capacities: Record<string, number>;
  resourceNames: Record<string, string>;
  taskNamesById: Record<string, string>;
}

interface TaskRow {
  id: string;
  task_code: string;
  task_name: string;
  start_date: string | null;
  end_date: string | null;
  is_milestone: boolean | null;
  manually_scheduled: boolean | null;
  constraint_type: string | null;
  constraint_date: string | null;
  dependency_task_ids: string[] | null;
  dependency_types: string[] | null;
  dependency_lag_days: number[] | null;
  priority: string | null;
}

/** wbs_tasks.priority (critical|high|medium|low) -> the engine's 1=highest scale. */
const PRIORITY_RANK: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };

function toEngineTask(t: TaskRow, cal: WorkCalendar): EngineTask {
  let durationWd = 1;
  if (t.is_milestone) durationWd = 0;
  else if (t.start_date && t.end_date) durationWd = Math.max(1, workingDaysBetween(cal, t.start_date, t.end_date));
  return {
    id: t.id,
    start: t.start_date,
    finish: t.end_date,
    durationWd,
    manuallyScheduled: t.manually_scheduled ?? false,
    constraintType: t.constraint_type,
    constraintDate: t.constraint_date,
    deps: depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
  };
}

/**
 * Completion Plan 3.2 — gathers everything levelResources() needs for one
 * project: tasks that carry a resource assignment, their CPM float/dates
 * (computed here, client-side, same engine the rest of Planning uses), and
 * each resource's capacity (plan_resources.max_units). Percent values are
 * converted to units here (100% = 1) — the engine's contract. A task with more than
 * one assignment is levelled against its FIRST assignment only — multi-
 * resource levelling is out of scope for this pass.
 */
export async function loadLevellingContext(projectId: string): Promise<LevellingContext> {
  const supabase = createClient();
  const [taskRes, calRes, assignRes] = await Promise.all([
    supabase
      .from("wbs_tasks")
      .select(
        "id, task_code, task_name, start_date, end_date, is_milestone, manually_scheduled, constraint_type, constraint_date, dependency_task_ids, dependency_types, dependency_lag_days, priority",
      )
      .eq("project_id", projectId)
      .limit(1000),
    supabase
      .from("plan_calendars")
      .select("id, name, monday, tuesday, wednesday, thursday, friday, saturday, sunday")
      .eq("project_id", projectId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("plan_task_assignments")
      .select("task_id, resource_id, allocation_percent, plan_resources!inner(id, name, max_units, project_id)")
      .eq("plan_resources.project_id", projectId),
  ]);
  if (taskRes.error) throw new Error(taskRes.error.message);
  if (assignRes.error) throw new Error(assignRes.error.message);

  const calRow = (calRes.data ?? null) as PlanCalendarRow | null;
  let exceptions: PlanCalendarExceptionRow[] = [];
  if (calRow) {
    const exRes = await supabase.from("plan_calendar_exceptions").select("exception_date, is_working").eq("calendar_id", calRow.id);
    exceptions = (exRes.data ?? []) as PlanCalendarExceptionRow[];
  }
  const cal = buildWorkCalendar(calRow, exceptions);
  const dataDate = todayISO();

  const tasks = (taskRes.data ?? []) as TaskRow[];
  const taskNamesById: Record<string, string> = {};
  for (const t of tasks) taskNamesById[t.id] = `${t.task_code} ${t.task_name}`;

  type AssignRow = { task_id: string; resource_id: string; allocation_percent: number; plan_resources: { name: string; max_units: number } };
  const assignments = (assignRes.data ?? []) as unknown as AssignRow[];
  const firstAssignmentByTask = new Map<string, AssignRow>();
  const capacities: Record<string, number> = {};
  const resourceNames: Record<string, string> = {};
  for (const a of assignments) {
    if (!firstAssignmentByTask.has(a.task_id)) firstAssignmentByTask.set(a.task_id, a);
    // The engine works in units (1 crew = 1); the DB stores percent (100 = 1).
    capacities[a.resource_id] = Number(a.plan_resources.max_units ?? 100) / 100;
    resourceNames[a.resource_id] = a.plan_resources.name;
  }

  const result = tasks.length > 0 ? scheduleProject(tasks.map((t) => toEngineTask(t, cal)), cal, dataDate, { critical: 0, nearCritical: 5 }) : null;
  const dates = result?.ok ? result.dates : new Map();
  const float = result?.ok ? result.float : new Map();

  const levelTasks: LevelTask[] = [];
  for (const t of tasks) {
    const assignment = firstAssignmentByTask.get(t.id);
    if (!assignment) continue;
    const d = dates.get(t.id);
    const f = float.get(t.id);
    if (!d || !f) continue;
    const durationWd = t.is_milestone ? 0 : t.start_date && t.end_date ? Math.max(1, workingDaysBetween(cal, t.start_date, t.end_date)) : 1;
    levelTasks.push({
      id: t.id,
      task_code: t.task_code,
      task_name: t.task_name,
      durationWd,
      totalFloatWd: f.totalFloat,
      freeFloatWd: f.freeFloat,
      earliestStart: d.start,
      latestFinish: f.lateFinish,
      resource: assignment.resource_id,
      resourceUnits: Number(assignment.allocation_percent ?? 100) / 100,
      priority: PRIORITY_RANK[t.priority ?? "medium"] ?? 3,
    });
  }

  return { levelTasks, cal, capacities, resourceNames, taskNamesById };
}

export function runLevelling(ctx: LevellingContext): ResourceLevellingResult {
  return levelResources(ctx.levelTasks, ctx.cal, ctx.capacities);
}

/** Serializes a ResourceLevellingResult for jsonb storage — Map isn't valid JSON. */
export function serializeLevellingResult(result: ResourceLevellingResult): Record<string, unknown> {
  return {
    ok: result.ok,
    assignments: result.assignments,
    starts: Object.fromEntries(result.starts),
    overAllocationResolved: result.overAllocationResolved,
    peakBefore: result.peakBefore,
    peakAfter: result.peakAfter,
  };
}

export interface LevellingRunRow {
  id: string;
  project_id: string;
  rule: string;
  result: Record<string, unknown>;
  residual_conflicts: unknown[];
  applied: boolean;
  applied_at: string | null;
  created_at: string;
}

export async function saveLevellingRun(projectId: string, result: ResourceLevellingResult): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("plan_levelling_runs")
    .insert({
      project_id: projectId,
      rule: "priority_first",
      result: serializeLevellingResult(result),
      residual_conflicts: result.residual,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function listLevellingRuns(projectId: string): Promise<LevellingRunRow[]> {
  const { data, error } = await createClient()
    .from("plan_levelling_runs")
    .select("id, project_id, rule, result, residual_conflicts, applied, applied_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LevellingRunRow[];
}

/**
 * Applies a levelling run's moves: each moved task gets a start_no_earlier_than
 * constraint at its new start (never touches start_date/end_date directly —
 * the next Sheet/Gantt applySchedule() recomputes real dates from there, per
 * the completion plan's "preview then apply" design), and the run is marked
 * applied. Every move is audited individually via wbs_audit_log.
 */
export async function applyLevellingRun(projectId: string, runId: string, assignments: { taskId: string; oldStart: string; newStart: string }[]): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  for (const a of assignments) {
    const { error } = await supabase
      .from("wbs_tasks")
      .update({ constraint_type: "start_no_earlier_than", constraint_date: a.newStart })
      .eq("id", a.taskId);
    if (error) throw new Error(error.message);
    await logScheduleAudit(supabase, {
      projectId,
      taskId: a.taskId,
      userId: user?.id ?? null,
      action: "Constraint Changed",
      fieldName: "constraint",
      oldValue: `start_no_earlier_than n/a (was ${a.oldStart})`,
      newValue: `start_no_earlier_than ${a.newStart} (resource levelling)`,
    });
  }

  const { error: runError } = await supabase
    .from("plan_levelling_runs")
    .update({ applied: true, applied_at: new Date().toISOString() })
    .eq("id", runId);
  if (runError) throw new Error(runError.message);
}
