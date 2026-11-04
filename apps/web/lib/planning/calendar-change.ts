// Doc 35 I2: a calendar change is previewed first, then saved with a controlled recalculation.
// The preview runs the Sheet's own calculation (progress-aware, from the data date, locked WBS items kept) twice:
// with the calendars as they are and as they would be. It lists the activities that move, the new finish, and the
// contract milestones whose forecast moves. Pure functions here; data access in calendar-change-service.ts.

import {
  DEFAULT_FLOAT_THRESHOLDS,
  depsFromArrays,
  engineDuration,
  scheduleProject,
  type EngineTask,
  type ScheduleResult,
} from "./schedule-engine";
import {
  buildWorkCalendar,
  todayISO,
  type PlanCalendarExceptionRow,
  type PlanCalendarRow,
  type WorkCalendar,
} from "./work-calendar";

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface CalendarRow extends PlanCalendarRow {
  is_default: boolean | null;
  description?: string | null;
}
export interface CalendarException extends PlanCalendarExceptionRow {
  id: string;
  calendar_id: string;
  reason?: string | null;
}
export interface CalendarSet {
  rows: CalendarRow[];
  exceptions: CalendarException[];
}

export type CalendarPatch = Partial<Pick<CalendarRow, "name" | "description" | "is_default" | "hours_per_day" | Weekday>>;

export type CalendarEdit =
  | { kind: "update"; calendarId: string; patch: CalendarPatch }
  | { kind: "add_exception"; calendarId: string; date: string; isWorking: boolean; reason: string | null }
  | { kind: "remove_exception"; calendarId: string; exceptionId: string }
  | { kind: "delete"; calendarId: string };

/** The calendars as they would be after the edit (inputs unchanged). */
export function applyCalendarEdit(set: CalendarSet, edit: CalendarEdit): CalendarSet {
  switch (edit.kind) {
    case "update": {
      const rows = set.rows.map((r) => (r.id === edit.calendarId ? { ...r, ...edit.patch } : r));
      // one default per project: making this one the default clears the others
      const out = edit.patch.is_default ? rows.map((r) => (r.id === edit.calendarId ? r : { ...r, is_default: false })) : rows;
      return { rows: out, exceptions: set.exceptions };
    }
    case "add_exception": {
      const others = set.exceptions.filter((e) => !(e.calendar_id === edit.calendarId && e.exception_date === edit.date));
      return {
        rows: set.rows,
        exceptions: [...others, { id: "new", calendar_id: edit.calendarId, exception_date: edit.date, is_working: edit.isWorking, reason: edit.reason }],
      };
    }
    case "remove_exception":
      return { rows: set.rows, exceptions: set.exceptions.filter((e) => e.id !== edit.exceptionId) };
    case "delete":
      return { rows: set.rows.filter((r) => r.id !== edit.calendarId), exceptions: set.exceptions.filter((e) => e.calendar_id !== edit.calendarId) };
  }
}

/** The project calendar (the default row, else the first; Mon–Sat when none) and every calendar by id. */
export function buildCalendars(set: CalendarSet): { project: WorkCalendar; byId: Map<string, WorkCalendar> } {
  const exc = new Map<string, CalendarException[]>();
  for (const e of set.exceptions) exc.set(e.calendar_id, [...(exc.get(e.calendar_id) ?? []), e]);
  const byId = new Map(set.rows.map((r) => [r.id, buildWorkCalendar(r, exc.get(r.id) ?? [])]));
  const main = set.rows.find((r) => r.is_default) ?? set.rows[0] ?? null;
  return { project: main ? byId.get(main.id)! : buildWorkCalendar(null, []), byId };
}

export interface ProgrammeTask {
  id: string;
  task_code: string | null;
  task_name: string | null;
  wbs_node_id: string | null;
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
}

/**
 * As the Sheet's Calculate (use-sheet-data toEngineTasks), except that the duration of an automatically scheduled
 * activity is its stored duration, not the span of its dates: under a changed calendar the old dates span a different
 * number of working days, and the duration is the input. Manually scheduled activities keep their dates.
 */
export function toEngineTasks(tasks: ProgrammeTask[], cal: WorkCalendar, calendars: Map<string, WorkCalendar>): EngineTask[] {
  return tasks.map((t) => {
    const taskCal = (t.calendar_id && calendars.get(t.calendar_id)) || cal;
    const keep = !!t.manually_scheduled || t.duration_days == null;
    const { durationWd, elapsed } = engineDuration(taskCal, {
      start: keep ? t.start_date : null, finish: keep ? t.end_date : null,
      isMilestone: t.is_milestone, durationDays: t.duration_days, unit: t.duration_unit,
    });
    return {
      id: t.id,
      start: t.start_date,
      finish: t.end_date,
      durationWd,
      elapsed,
      manuallyScheduled: !!t.manually_scheduled,
      constraintType: t.constraint_type,
      constraintDate: t.constraint_date,
      deps: depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
      calendarId: t.calendar_id ?? null,
      actualStart: t.actual_start_date ?? (Number(t.progress) > 0 ? t.start_date : null),
      actualFinish: t.actual_finish_date ?? (Number(t.progress) >= 100 ? t.end_date : null),
      percentComplete: Number(t.progress) || 0,
    };
  });
}

export interface ProgrammeRun {
  ok: true;
  dates: Map<string, { start: string; finish: string }>;
  engineTasks: EngineTask[];
  result: Extract<ScheduleResult, { ok: true }>;
  calendar: WorkCalendar;
  calendars: Map<string, WorkCalendar>;
  start: string;
}

/** Calculate the programme under a calendar set. Tasks under a locked WBS item keep their dates. */
export function calculateProgramme(
  tasks: ProgrammeTask[],
  set: CalendarSet,
  dataDate: string | null,
  lockedNodeIds: ReadonlySet<string> = new Set(),
): ProgrammeRun | { ok: false; cycle: string[] } {
  const { project, byId } = buildCalendars(set);
  const engineTasks = toEngineTasks(tasks, project, byId);
  const start = dataDate ?? todayISO();
  const result = scheduleProject(engineTasks, project, start, DEFAULT_FLOAT_THRESHOLDS, { dataDate, calendars: byId });
  if (!result.ok) return { ok: false, cycle: result.cycle };
  const dates = new Map<string, { start: string; finish: string }>();
  for (const t of tasks) {
    const d = result.dates.get(t.id);
    if (!d) continue;
    const keep = t.wbs_node_id && lockedNodeIds.has(t.wbs_node_id) && t.start_date && t.end_date;
    dates.set(t.id, keep ? { start: t.start_date!, finish: t.end_date! } : { start: d.start, finish: d.finish });
  }
  return { ok: true, dates, engineTasks, result, calendar: project, calendars: byId, start };
}

/** Locked WBS items: is_locked, or under one that is. */
export function lockedNodes(nodes: { id: string; parent_id: string | null; is_locked: boolean | null }[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, boolean>();
  const resolve = (id: string): boolean => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    memo.set(id, false);
    const n = byId.get(id);
    const v = !!n && (n.is_locked === true || (n.parent_id ? resolve(n.parent_id) : false));
    memo.set(id, v);
    return v;
  };
  return new Set(nodes.filter((n) => resolve(n.id)).map((n) => n.id));
}

export interface MovedTask {
  id: string;
  code: string;
  name: string;
  startBefore: string;
  startAfter: string;
  finishBefore: string;
  finishAfter: string;
  /** Calendar days the finish moves (+ later). */
  finishDelta: number;
}
export interface ImpactMilestone {
  code: string;
  name: string;
  date: string;
  forecastBefore: string | null;
  forecastAfter: string | null;
}
export interface CalendarImpact {
  finishBefore: string | null;
  finishAfter: string | null;
  /** Calendar days the project finish moves (+ later). */
  finishDelta: number;
  moved: MovedTask[];
  /** Activities whose stored dates already differ from a calculation with today's calendars. */
  notCalculated: number;
  milestones: ImpactMilestone[];
}

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const maxFinish = (m: Map<string, { finish: string }>) => {
  let f: string | null = null;
  for (const d of m.values()) if (!f || d.finish > f) f = d.finish;
  return f;
};

/** What the edit moves: before = recalculated with the calendars as they are, after = as they would be. */
export function compareProgrammes(
  tasks: ProgrammeTask[],
  before: Map<string, { start: string; finish: string }>,
  after: Map<string, { start: string; finish: string }>,
  milestones: { code: string; name: string; contract_date: string; revised_date: string | null; task_id: string | null }[] = [],
): CalendarImpact {
  const moved: MovedTask[] = [];
  let notCalculated = 0;
  for (const t of tasks) {
    const b = before.get(t.id);
    const a = after.get(t.id);
    if (!b || !a) continue;
    if (b.start !== t.start_date || b.finish !== t.end_date) notCalculated++;
    if (a.start === b.start && a.finish === b.finish) continue;
    moved.push({
      id: t.id, code: t.task_code ?? "", name: t.task_name ?? "",
      startBefore: b.start, startAfter: a.start, finishBefore: b.finish, finishAfter: a.finish,
      finishDelta: days(b.finish, a.finish),
    });
  }
  moved.sort((x, y) => Math.abs(y.finishDelta) - Math.abs(x.finishDelta) || x.finishAfter.localeCompare(y.finishAfter) || x.code.localeCompare(y.code));
  const finishBefore = maxFinish(before);
  const finishAfter = maxFinish(after);
  return {
    finishBefore,
    finishAfter,
    finishDelta: finishBefore && finishAfter ? days(finishBefore, finishAfter) : 0,
    moved,
    notCalculated,
    milestones: milestones
      .filter((m) => m.task_id && (before.get(m.task_id)?.finish ?? null) !== (after.get(m.task_id)?.finish ?? null))
      .map((m) => ({
        code: m.code, name: m.name, date: m.revised_date ?? m.contract_date,
        forecastBefore: before.get(m.task_id!)?.finish ?? null, forecastAfter: after.get(m.task_id!)?.finish ?? null,
      })),
  };
}

/** One-line summary of an edit, for the dialog title. */
export function describeEdit(set: CalendarSet, edit: CalendarEdit): string {
  const name = set.rows.find((r) => r.id === edit.calendarId)?.name ?? "calendar";
  switch (edit.kind) {
    case "update": return `Change ${name}`;
    case "add_exception": return `${edit.isWorking ? "Make" : "Close"} ${edit.date} ${edit.isWorking ? "a working day" : ""} in ${name}`.replace(/\s+/g, " ");
    case "remove_exception": {
      const e = set.exceptions.find((x) => x.id === edit.exceptionId);
      return `Remove the ${e?.is_working ? "extra working day" : "holiday"} ${e?.exception_date ?? ""} from ${name}`;
    }
    case "delete": return `Delete ${name}`;
  }
}
