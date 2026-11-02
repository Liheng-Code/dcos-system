// Schedule quality check (doc 35 Q2 / Q3). Loads a project's programme, calculates it with the
// project's data date and calendars, runs the 14 DCMA checks (@dcos/scheduling-engine) and records
// the run; findings carry over between runs in plan_schedule_qaqc_findings.

import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_FLOAT_THRESHOLDS,
  ENGINE_VERSION,
  depsFromArrays,
  engineDuration,
  runScheduleQaqc,
  scheduleProject,
  todayISO,
  type QaqcCheckResult,
  type QaqcTask,
  type WorkCalendar,
} from "@dcos/scheduling-engine";
import { loadProjectCalendar } from "./project-schedule";
import { loadProjectCalendars } from "./schedule-calculation-service";

const db = () => createClient();

export type QaqcGate = "warn" | "block";

export interface QaqcFinding {
  id: string;
  check_code: string;
  check_number: number;
  check_name: string;
  severity: "critical" | "warning";
  status: "open" | "accepted" | "resolved";
  message: string;
  metric: number | null;
  threshold: number | null;
  affected_task_ids: string[];
  last_seen_at: string;
  accepted_at: string | null;
  accept_reason: string | null;
  resolved_at: string | null;
}

export interface QaqcRunSummary {
  id: string;
  created_at: string;
  engine_version: string;
  data_date: string | null;
  task_count: number;
  passed: number;
  failed: number;
  critical_failed: number;
  results: QaqcCheckResult[];
}

const COLS =
  "id, task_code, start_date, end_date, duration_days, duration_unit, is_milestone, manually_scheduled, " +
  "constraint_type, constraint_date, dependency_task_ids, dependency_types, dependency_lag_days, calendar_id, " +
  "actual_start_date, actual_finish_date, progress, budget_cost, baseline_start_date, baseline_finish_date";

interface TaskRow {
  id: string;
  task_code: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  duration_unit: string | null;
  is_milestone: boolean | null;
  manually_scheduled: boolean | null;
  constraint_type: string | null;
  constraint_date: string | null;
  dependency_task_ids: string[] | null;
  dependency_types: string[] | null;
  dependency_lag_days: number[] | null;
  calendar_id: string | null;
  actual_start_date: string | null;
  actual_finish_date: string | null;
  progress: number | null;
  budget_cost: number | null;
  baseline_start_date: string | null;
  baseline_finish_date: string | null;
}

async function loadTasks(projectId: string): Promise<TaskRow[]> {
  const out: TaskRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from("wbs_tasks").select(COLS).eq("project_id", projectId).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as TaskRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function loadResourceCounts(projectId: string): Promise<Map<string, number>> {
  const { data } = await db()
    .from("plan_task_assignments")
    .select("task_id, plan_resources!inner(project_id)")
    .eq("plan_resources.project_id", projectId)
    .limit(50000);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { task_id: string }[]) counts.set(r.task_id, (counts.get(r.task_id) ?? 0) + 1);
  return counts;
}

function toQaqcTask(t: TaskRow, cal: WorkCalendar, calendars: Map<string, WorkCalendar>, resources: Map<string, number>): QaqcTask {
  const taskCal = (t.calendar_id && calendars.get(t.calendar_id)) || cal;
  const { durationWd, elapsed } = engineDuration(taskCal, {
    start: t.start_date, finish: t.end_date, isMilestone: t.is_milestone, durationDays: t.duration_days, unit: t.duration_unit,
  });
  const pct = Number(t.progress) || 0;
  return {
    id: t.id,
    code: t.task_code,
    start: t.start_date,
    finish: t.end_date,
    durationWd,
    elapsed,
    manuallyScheduled: !!t.manually_scheduled,
    constraintType: t.constraint_type,
    constraintDate: t.constraint_date,
    deps: depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
    calendarId: t.calendar_id,
    // as the Sheet: progress without actual dates counts as started / finished as planned
    actualStart: t.actual_start_date ?? (pct > 0 ? t.start_date : null),
    actualFinish: t.actual_finish_date ?? (pct >= 100 ? t.end_date : null),
    percentComplete: pct,
    isMilestone: t.is_milestone,
    resourceCount: resources.get(t.id) ?? 0,
    budgetCost: t.budget_cost,
    baselineStart: t.baseline_start_date,
    baselineFinish: t.baseline_finish_date,
  };
}

export interface QaqcRunOutcome {
  runId: string;
  results: QaqcCheckResult[];
  dataDate: string;
  /** task id → code, for showing affected activities. */
  codes: Map<string, string>;
}

/** Calculate the programme, run the 14 checks and record the run. */
export async function runScheduleCheck(projectId: string): Promise<QaqcRunOutcome> {
  const [{ data: project }, cal, calendars, rows, resources] = await Promise.all([
    db().from("projects").select("start_date, data_date, end_date").eq("id", projectId).maybeSingle(),
    loadProjectCalendar(projectId),
    loadProjectCalendars(projectId).catch(() => new Map<string, WorkCalendar>()),
    loadTasks(projectId),
    loadResourceCounts(projectId),
  ]);
  if (rows.length === 0) throw new Error("This project has no activities to check");
  const tasks = rows.map((t) => toQaqcTask(t, cal, calendars, resources));
  const dataDate = (project?.data_date as string | null) ?? todayISO();
  const firstStart = rows.reduce<string | null>((m, t) => (t.start_date && (!m || t.start_date < m) ? t.start_date : m), null);
  const projectStart = (project?.start_date as string | null) ?? firstStart ?? dataDate;
  const opts = { dataDate, calendars, mustFinishBy: (project?.end_date as string | null) ?? null };
  const result = scheduleProject(tasks, cal, projectStart, DEFAULT_FLOAT_THRESHOLDS, opts);
  if (!result.ok) throw new Error(`The programme has a circular link (${result.cycle.length} activities): fix it before checking`);
  const results = runScheduleQaqc(tasks, result, cal, projectStart, dataDate, DEFAULT_FLOAT_THRESHOLDS, opts);

  const { data: runId, error } = await db().rpc("record_schedule_qaqc_run", {
    p_project_id: projectId,
    p_engine_version: ENGINE_VERSION,
    p_data_date: dataDate,
    p_task_count: tasks.length,
    p_results: results,
  });
  if (error) throw new Error(error.message);
  return { runId: runId as string, results, dataDate, codes: new Map(rows.map((t) => [t.id, t.task_code ?? t.id.slice(0, 8)])) };
}

export async function getLatestScheduleCheck(projectId: string): Promise<QaqcRunSummary | null> {
  const { data, error } = await db()
    .from("plan_schedule_qaqc_runs")
    .select("id, created_at, engine_version, data_date, task_count, passed, failed, critical_failed, results")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as QaqcRunSummary | null) ?? null;
}

/** Open and accepted findings, critical first. */
export async function listScheduleFindings(projectId: string): Promise<QaqcFinding[]> {
  const { data, error } = await db()
    .from("plan_schedule_qaqc_findings")
    .select("id, check_code, check_number, check_name, severity, status, message, metric, threshold, affected_task_ids, last_seen_at, accepted_at, accept_reason, resolved_at")
    .eq("project_id", projectId)
    .neq("status", "resolved")
    .order("severity")
    .order("check_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as QaqcFinding[];
}

export async function acceptScheduleFinding(findingId: string, reason: string): Promise<void> {
  const { error } = await db().rpc("accept_schedule_qaqc_finding", { p_finding_id: findingId, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function getQaqcGate(projectId: string): Promise<QaqcGate> {
  const { data } = await db().from("plan_schedule_settings").select("qaqc_gate").eq("project_id", projectId).maybeSingle();
  return ((data?.qaqc_gate as QaqcGate | null) ?? "warn");
}

export async function setQaqcGate(projectId: string, gate: QaqcGate): Promise<void> {
  const { error } = await db()
    .from("plan_schedule_settings")
    .upsert({ project_id: projectId, qaqc_gate: gate, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  if (error) throw new Error(error.message);
}
