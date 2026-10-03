// Whole-project scheduling from a project start date — used at tender stage (WBS builder
// "Schedule") when activities have durations and links but no dates yet.
//
// Rule: Duration is the input; Start/Finish are calculated. Every auto-scheduled activity is
// laid out again from the project start (old dates ignored); manually scheduled activities
// keep their dates and still drive their successors.

import { createClient } from "@/lib/supabase/client";
import { applyScheduleDates } from "./planning-queries";
import { depsFromArrays, engineDuration, scheduleProject, type EngineTask } from "./schedule-engine";
import {
  buildWorkCalendar,
  spanInUnit,
  type PlanCalendarExceptionRow,
  type PlanCalendarRow,
  type WorkCalendar,
} from "./work-calendar";

const db = () => createClient();

export interface ScheduleInputTask {
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
}

export type ProjectScheduleResult =
  | {
      ok: true;
      rows: { id: string; start_date: string; end_date: string }[];
      start: string;
      finish: string;
      /** Working days from project start to the last finish (inclusive). */
      workingDays: number;
      criticalCount: number;
      /** Activities the run moved. */
      changed: number;
    }
  | { ok: false; cycle: string[] };

/** Pure: lay every activity out from `projectStart`. */
export function planProjectSchedule(
  tasks: ScheduleInputTask[],
  cal: WorkCalendar,
  projectStart: string,
): ProjectScheduleResult {
  const engineTasks: EngineTask[] = tasks.map((t) => {
    const keep = !!t.manually_scheduled;
    // Auto tasks: duration from the stored value (dates are recalculated); manual: from their dates.
    const { durationWd, elapsed } = engineDuration(cal, {
      start: keep ? t.start_date : null,
      finish: keep ? t.end_date : null,
      isMilestone: t.is_milestone,
      durationDays: t.duration_days,
      unit: t.duration_unit,
    });
    return {
      id: t.id,
      start: keep ? t.start_date : null,
      finish: keep ? t.end_date : null,
      durationWd,
      elapsed,
      manuallyScheduled: keep,
      constraintType: t.constraint_type,
      constraintDate: t.constraint_date,
      deps: depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
    };
  });

  const result = scheduleProject(engineTasks, cal, projectStart);
  if (!result.ok) {
    const code = new Map(tasks.map((t) => [t.id, t.task_code ?? t.id.slice(0, 8)]));
    return { ok: false, cycle: result.cycle.map((id) => code.get(id) ?? id) };
  }

  const rows: { id: string; start_date: string; end_date: string }[] = [];
  let start: string | null = null;
  let finish: string | null = null;
  let changed = 0;
  for (const t of tasks) {
    const d = result.dates.get(t.id);
    if (!d) continue;
    rows.push({ id: t.id, start_date: d.start, end_date: d.finish });
    if (d.start !== t.start_date || d.finish !== t.end_date) changed++;
    if (!start || d.start < start) start = d.start;
    if (!finish || d.finish > finish) finish = d.finish;
  }
  const s = start ?? projectStart;
  const f = finish ?? projectStart;
  let criticalCount = 0;
  for (const fl of result.float.values()) if (fl.critical) criticalCount++;
  return { ok: true, rows, start: s, finish: f, workingDays: spanInUnit(cal, s, f, "wd"), criticalCount, changed };
}

/** The project's working calendar (default plan_calendars row + exceptions; Mon–Sat when none). */
export async function loadProjectCalendar(projectId: string): Promise<WorkCalendar> {
  const { data: row } = await db()
    .from("plan_calendars")
    .select("id, name, monday, tuesday, wednesday, thursday, friday, saturday, sunday, hours_per_day")
    .eq("project_id", projectId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  let exceptions: PlanCalendarExceptionRow[] = [];
  if (row?.id) {
    const { data } = await db()
      .from("plan_calendar_exceptions")
      .select("exception_date, is_working")
      .eq("calendar_id", row.id)
      .limit(5000);
    exceptions = (data ?? []) as PlanCalendarExceptionRow[];
  }
  return buildWorkCalendar((row as PlanCalendarRow | null) ?? null, exceptions);
}

/** "Mon–Sat", "Mon–Fri", or the day list. */
export function workWeekLabel(cal: WorkCalendar): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const on = [1, 2, 3, 4, 5, 6, 0].filter((i) => cal.workdays[i]);
  const idx = on.map((i) => (i === 0 ? 7 : i));
  const contiguous = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
  if (on.length > 2 && contiguous) return `${names[on[0]]}–${names[on[on.length - 1]]}`;
  return on.map((i) => names[i]).join(", ") || "No working days";
}

const COLS =
  "id, task_code, start_date, end_date, duration_days, duration_unit, is_milestone, manually_scheduled, " +
  "constraint_type, constraint_date, dependency_task_ids, dependency_types, dependency_lag_days";

async function loadScheduleTasks(projectId: string): Promise<ScheduleInputTask[]> {
  const out: ScheduleInputTask[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("wbs_tasks")
      .select(COLS)
      .eq("project_id", projectId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as ScheduleInputTask[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function getProjectStartDate(projectId: string): Promise<string | null> {
  const { data } = await db().from("projects").select("start_date").eq("id", projectId).maybeSingle();
  return (data?.start_date as string | null) ?? null;
}

/**
 * Calculate every activity's dates from `projectStart`, save them, and store the project
 * start. Nothing is written when `dryRun` is set or the links loop.
 */
export async function runProjectSchedule(
  projectId: string,
  projectStart: string,
  opts: { dryRun?: boolean } = {},
): Promise<ProjectScheduleResult> {
  const [cal, tasks] = await Promise.all([loadProjectCalendar(projectId), loadScheduleTasks(projectId)]);
  const result = planProjectSchedule(tasks, cal, projectStart);
  if (!result.ok || opts.dryRun) return result;

  const before = new Map(tasks.map((t) => [t.id, t]));
  const changedRows = result.rows.filter((r) => {
    const b = before.get(r.id);
    return !b || b.start_date !== r.start_date || b.end_date !== r.end_date;
  });
  const CHUNK = 500;
  for (let i = 0; i < changedRows.length; i += CHUNK) {
    const { error } = await applyScheduleDates({ p_project_id: projectId, p_rows: changedRows.slice(i, i + CHUNK) });
    if (error) throw error;
  }
  const { error } = await db().from("projects").update({ start_date: projectStart }).eq("id", projectId);
  if (error) throw error;
  return result;
}
