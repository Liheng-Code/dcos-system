/**
 * Pure helpers for the staff workspace (My Dashboard / My Day / My Week).
 * Dates are "YYYY-MM-DD" strings in UTC; callers pass "today" so results are testable.
 */
import {
  DEFAULT_CAPACITY_CALENDAR,
  eachDay,
  isWorkingDay,
  type CapacityCalendar,
  type PlannedTask,
} from "./capacity";

export interface WorkTask {
  id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  is_blocked?: boolean | null;
}

const DONE = new Set(["completed", "closed", "approved", "cancelled", "rejected"]);

export function isDone(status: string): boolean {
  return DONE.has(status);
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

export interface WorkBuckets<T> {
  today: T[];
  dueToday: T[];
  dueThisWeek: T[];
  overdue: T[];
  inProgress: T[];
  blocked: T[];
  awaitingReview: T[];
  returnedForRevision: T[];
  upcoming: T[];
  recentlyCompleted: T[];
}

/**
 * Groups my tasks. `returnedIds` = tasks whose latest review decision was "returned".
 * A task can appear in several buckets (e.g. overdue and in progress).
 */
export function bucketTasks<T extends WorkTask>(
  tasks: readonly T[],
  today: string,
  returnedIds: ReadonlySet<string> = new Set(),
): WorkBuckets<T> {
  const weekEnd = addDays(weekStartOf(today), 6);
  const out: WorkBuckets<T> = {
    today: [], dueToday: [], dueThisWeek: [], overdue: [], inProgress: [], blocked: [],
    awaitingReview: [], returnedForRevision: [], upcoming: [], recentlyCompleted: [],
  };
  for (const t of tasks) {
    if (isDone(t.status)) {
      if (t.status === "completed" || t.status === "closed") out.recentlyCompleted.push(t);
      continue;
    }
    const start = t.start_date?.slice(0, 10) ?? null;
    const end = t.end_date?.slice(0, 10) ?? null;
    if (t.status === "review" || t.status === "submitted") out.awaitingReview.push(t);
    if (t.status === "in_progress") out.inProgress.push(t);
    if (t.is_blocked || t.status === "blocked") out.blocked.push(t);
    if (returnedIds.has(t.id) && t.status === "in_progress") out.returnedForRevision.push(t);
    if (end && end < today) out.overdue.push(t);
    if (end === today) out.dueToday.push(t);
    if (end && end >= today && end <= weekEnd) out.dueThisWeek.push(t);
    if (start && start > today) out.upcoming.push(t);
    const inWindow = (!start || start <= today) && (!end || end >= today);
    if (inWindow && (t.status === "in_progress" || t.status === "assigned" || t.status === "open")) out.today.push(t);
  }
  return out;
}

export interface DayLoad {
  date: string;
  working: boolean;
  plannedHours: number;
  taskIds: string[];
}

/**
 * Planned hours per day: each task's hours are spread evenly over its working days
 * (holidays excluded). Tasks without dates or hours are returned in `unplaced`.
 */
export function plannedHoursByDay(
  tasks: readonly PlannedTask[],
  from: string,
  to: string,
  calendar: CapacityCalendar = DEFAULT_CAPACITY_CALENDAR,
  holidays: ReadonlySet<string> = new Set(),
): { days: DayLoad[]; unplaced: string[] } {
  const days = new Map<string, DayLoad>();
  for (const d of eachDay(from, to)) {
    days.set(d, { date: d, working: isWorkingDay(d, calendar) && !holidays.has(d), plannedHours: 0, taskIds: [] });
  }
  const unplaced: string[] = [];
  const seen = new Set<string>();
  for (const t of tasks) {
    if (seen.has(t.taskId)) continue;
    seen.add(t.taskId);
    if (!(t.hours > 0)) continue;
    if (!t.start || !t.end || t.end < t.start) {
      unplaced.push(t.taskId);
      continue;
    }
    const working = [...eachDay(t.start, t.end)].filter((d) => isWorkingDay(d, calendar) && !holidays.has(d));
    if (working.length === 0) {
      unplaced.push(t.taskId);
      continue;
    }
    const perDay = t.hours / working.length;
    for (const d of working) {
      const load = days.get(d);
      if (!load) continue;
      load.plannedHours += perDay;
      load.taskIds.push(t.taskId);
    }
  }
  for (const d of days.values()) d.plannedHours = Math.round(d.plannedHours * 100) / 100;
  return { days: [...days.values()], unplaced };
}
