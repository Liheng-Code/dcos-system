// Working-day calendar math for the Planning schedule engine.
//
// All dates are UTC-pinned "YYYY-MM-DD" strings so they never drift by timezone
// (the same convention as components/planning/sheet-utils.ts). Deliberately NOT
// using the helpers in gantt-utils.ts — those mix UTC and local-time parsing.
//
// Every scan loop is bounded by MAX_SCAN so a calendar with zero working days
// can never hang the browser; on overflow we fall back to plain calendar days.

const DAY_MS = 86_400_000;

/** Safety bound on day-by-day scans (~10 years). */
const MAX_SCAN = 3650;

export interface WorkCalendar {
  /** `null` = the built-in Mon–Fri fallback (no plan_calendars row for the project). */
  id: string | null;
  name: string;
  /** Index = UTC getUTCDay(): 0 = Sunday … 6 = Saturday. */
  workdays: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
  /** ISO date → is_working. Overrides `workdays` for that day. */
  exceptions: Map<string, boolean>;
}

export const DEFAULT_CALENDAR: WorkCalendar = {
  id: null,
  name: "Mon–Fri (default)",
  workdays: [false, true, true, true, true, true, false],
  exceptions: new Map(),
};

// ---------------------------------------------------------------------------
// Date primitives (UTC-pinned)
// ---------------------------------------------------------------------------
export const parseISO = (s: string): Date => new Date(s + "T00:00:00Z");

export const toISO = (d: Date): string => d.toISOString().slice(0, 10);

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

export function addCalendarDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Inclusive calendar-day span, floored at 1. */
export function calendarDaysBetween(startISO: string, endISO: string): number {
  const n =
    Math.round((parseISO(endISO).getTime() - parseISO(startISO).getTime()) / DAY_MS) + 1;
  return Math.max(1, n);
}

export function isValidISO(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISO(s).getTime());
}

// ---------------------------------------------------------------------------
// Working-day math
// ---------------------------------------------------------------------------

/** True if the calendar has at least one working weekday (guards infinite scans). */
export function hasWorkingDays(cal: WorkCalendar): boolean {
  return cal.workdays.some(Boolean) || [...cal.exceptions.values()].some(Boolean);
}

export function isWorkingDay(cal: WorkCalendar, iso: string): boolean {
  const override = cal.exceptions.get(iso);
  if (override !== undefined) return override;
  return cal.workdays[parseISO(iso).getUTCDay()] ?? false;
}

/**
 * The nearest working day at or after (`dir = 1`) / at or before (`dir = -1`)
 * `iso`. Returns `iso` unchanged if it is already a working day, or if the
 * calendar has no working days at all.
 */
export function nextWorkingDay(cal: WorkCalendar, iso: string, dir: 1 | -1 = 1): string {
  if (!hasWorkingDays(cal)) return iso;
  let cur = iso;
  for (let i = 0; i < MAX_SCAN; i++) {
    if (isWorkingDay(cal, cur)) return cur;
    cur = addCalendarDays(cur, dir);
  }
  return iso;
}

/**
 * Move `n` working days from `iso`. `n = 0` snaps `iso` forward to the next
 * working day. Negative `n` walks backwards. The result is always a working day
 * (unless the calendar has none, in which case plain calendar days are used).
 */
export function addWorkingDays(cal: WorkCalendar, iso: string, n: number): string {
  if (!hasWorkingDays(cal)) return addCalendarDays(iso, n);
  const dir: 1 | -1 = n < 0 ? -1 : 1;
  let cur = nextWorkingDay(cal, iso, dir);
  let remaining = Math.abs(Math.trunc(n));
  let guard = 0;
  while (remaining > 0 && guard < MAX_SCAN) {
    cur = addCalendarDays(cur, dir);
    guard++;
    if (isWorkingDay(cal, cur)) remaining--;
  }
  return cur;
}

/**
 * Inclusive count of working days from `startISO` to `endISO`.
 * Returns 0 when the range is inverted or contains no working days.
 */
export function workingDaysBetween(
  cal: WorkCalendar,
  startISO: string,
  endISO: string,
): number {
  if (parseISO(endISO).getTime() < parseISO(startISO).getTime()) return 0;
  if (!hasWorkingDays(cal)) return calendarDaysBetween(startISO, endISO);
  let count = 0;
  let cur = startISO;
  const end = parseISO(endISO).getTime();
  for (let i = 0; i < MAX_SCAN && parseISO(cur).getTime() <= end; i++) {
    if (isWorkingDay(cal, cur)) count++;
    cur = addCalendarDays(cur, 1);
  }
  return count;
}

/**
 * Finish date for a task starting on `startISO` and lasting `durationWd`
 * working days. `durationWd <= 0` is a milestone — finish equals start.
 */
export function finishFromStart(
  cal: WorkCalendar,
  startISO: string,
  durationWd: number,
): string {
  const start = nextWorkingDay(cal, startISO, 1);
  if (durationWd <= 0) return start;
  return addWorkingDays(cal, start, durationWd - 1);
}

/** Start date for a task finishing on `finishISO` and lasting `durationWd` working days. */
export function startFromFinish(
  cal: WorkCalendar,
  finishISO: string,
  durationWd: number,
): string {
  const finish = nextWorkingDay(cal, finishISO, -1);
  if (durationWd <= 0) return finish;
  return addWorkingDays(cal, finish, -(durationWd - 1));
}

/** Later of two ISO dates. */
export function maxISO(a: string, b: string): string {
  return parseISO(a).getTime() >= parseISO(b).getTime() ? a : b;
}

/** Earlier of two ISO dates. */
export function minISO(a: string, b: string): string {
  return parseISO(a).getTime() <= parseISO(b).getTime() ? a : b;
}

// ---------------------------------------------------------------------------
// Building a calendar from plan_calendars / plan_calendar_exceptions rows
// ---------------------------------------------------------------------------
export interface PlanCalendarRow {
  id: string;
  name: string | null;
  monday: boolean | null;
  tuesday: boolean | null;
  wednesday: boolean | null;
  thursday: boolean | null;
  friday: boolean | null;
  saturday: boolean | null;
  sunday: boolean | null;
}

export interface PlanCalendarExceptionRow {
  exception_date: string;
  is_working: boolean | null;
}

export function buildWorkCalendar(
  row: PlanCalendarRow | null,
  exceptions: PlanCalendarExceptionRow[],
): WorkCalendar {
  if (!row) {
    if (exceptions.length === 0) return DEFAULT_CALENDAR;
    return {
      ...DEFAULT_CALENDAR,
      exceptions: new Map(exceptions.map((e) => [e.exception_date, e.is_working ?? false])),
    };
  }
  return {
    id: row.id,
    name: row.name ?? "Project calendar",
    // Index by getUTCDay(): 0 = Sunday.
    workdays: [
      row.sunday ?? false,
      row.monday ?? true,
      row.tuesday ?? true,
      row.wednesday ?? true,
      row.thursday ?? true,
      row.friday ?? true,
      row.saturday ?? false,
    ],
    exceptions: new Map(exceptions.map((e) => [e.exception_date, e.is_working ?? false])),
  };
}
