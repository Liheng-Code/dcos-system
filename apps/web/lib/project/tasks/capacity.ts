/**
 * Employee capacity and utilization (Task Team Planning addendum §6).
 * Pure functions: callers load the calendar, holiday, leave and assignment data.
 * Dates are "YYYY-MM-DD" strings handled in UTC so they never drift by timezone.
 *
 * Available capacity = working days (calendar) − public holidays − approved leave, × hours per day.
 * Planned effort of a task is spread evenly over the working days of its window; only the part that
 * falls inside the requested period counts. Actual hours are NOT part of this calculation.
 */

const DAY_MS = 86_400_000;
const MAX_DAYS = 3660;

export const DEFAULT_HOURS_PER_DAY = 8;
export const DEFAULT_WARN_PCT = 85;
export const DEFAULT_OVER_PCT = 100;

export interface CapacityCalendar {
  /** Index = UTC getUTCDay(): 0 = Sunday … 6 = Saturday. */
  workdays: readonly boolean[];
  /** ISO date → is_working; overrides `workdays`. */
  exceptions?: ReadonlyMap<string, boolean>;
  hoursPerDay?: number;
}

/** Built-in Mon–Sat calendar, used (and flagged) when a project has no calendar row. */
export const DEFAULT_CAPACITY_CALENDAR: CapacityCalendar = {
  workdays: [false, true, true, true, true, true, true],
  hoursPerDay: DEFAULT_HOURS_PER_DAY,
};

export interface LeaveSpan {
  start: string;
  end: string;
  /** "approved" reduces capacity; anything else is reported as pending, not deducted. */
  status: string;
  isHalfDay?: boolean;
}

export interface PlannedTask {
  taskId: string;
  start: string | null;
  end: string | null;
  hours: number;
}

export interface CapacityThresholds {
  warnPct: number;
  overPct: number;
}

export interface CapacityInput {
  from: string;
  to: string;
  calendar?: CapacityCalendar | null;
  holidays?: ReadonlySet<string>;
  leave?: readonly LeaveSpan[];
  tasks?: readonly PlannedTask[];
  /** Sum of employee_project_assignments.allocation_percent for the period, when known. */
  allocationPercentTotal?: number | null;
  thresholds?: Partial<CapacityThresholds>;
}

export type CapacityLevel = "ok" | "warn" | "over" | "unknown";

export interface CapacityResult {
  workingDays: number;
  grossHours: number;
  holidayHours: number;
  leaveHours: number;
  pendingLeaveHours: number;
  availableHours: number;
  plannedHours: number;
  /** null when available capacity is 0. */
  utilizationPct: number | null;
  level: CapacityLevel;
  /** Tasks (by id) whose hours could not be placed because they have no usable dates. */
  unplacedTaskIds: string[];
  /** Data gaps the user should see instead of invented availability. */
  limitations: string[];
}

function parse(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function* eachDay(from: string, to: string): Generator<string> {
  const start = parse(from);
  const end = parse(to);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return;
  const count = Math.min(Math.round((end - start) / DAY_MS) + 1, MAX_DAYS);
  for (let i = 0; i < count; i++) yield format(start + i * DAY_MS);
}

export function isWorkingDay(day: string, cal: CapacityCalendar): boolean {
  const override = cal.exceptions?.get(day);
  if (override !== undefined) return override;
  return cal.workdays[new Date(parse(day)).getUTCDay()] ?? false;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeCapacity(input: CapacityInput): CapacityResult {
  const limitations: string[] = [];
  const warnPct = input.thresholds?.warnPct ?? DEFAULT_WARN_PCT;
  const overPct = input.thresholds?.overPct ?? DEFAULT_OVER_PCT;
  const from = input.from.slice(0, 10);
  const to = input.to.slice(0, 10);

  let cal = input.calendar;
  if (!cal) {
    cal = DEFAULT_CAPACITY_CALENDAR;
    limitations.push("No work calendar found; Monday–Saturday, 8 hours per day assumed.");
  }
  const hoursPerDay = cal.hoursPerDay && cal.hoursPerDay > 0 ? cal.hoursPerDay : DEFAULT_HOURS_PER_DAY;
  const holidays = input.holidays ?? new Set<string>();

  const leaveFraction = (day: string, wantApproved: boolean): number => {
    let frac = 0;
    for (const l of input.leave ?? []) {
      if ((l.status === "approved") !== wantApproved) continue;
      if (day >= l.start.slice(0, 10) && day <= l.end.slice(0, 10)) {
        frac = Math.max(frac, l.isHalfDay ? 0.5 : 1);
      }
    }
    return frac;
  };

  let workingDays = 0;
  let holidayDays = 0;
  let leaveDays = 0;
  let pendingLeaveDays = 0;

  for (const day of eachDay(from, to)) {
    if (!isWorkingDay(day, cal)) continue;
    workingDays += 1;
    if (holidays.has(day)) {
      holidayDays += 1;
      continue;
    }
    const approved = leaveFraction(day, true);
    leaveDays += approved;
    pendingLeaveDays += leaveFraction(day, false) * (1 - approved);
  }

  const grossHours = workingDays * hoursPerDay;
  const holidayHours = holidayDays * hoursPerDay;
  const leaveHours = leaveDays * hoursPerDay;
  const pendingLeaveHours = pendingLeaveDays * hoursPerDay;
  const availableHours = Math.max(0, grossHours - holidayHours - leaveHours);

  // Planned effort: dedupe by task (shared assignments count once), spread over the task's
  // working days, and count only the share that falls inside the period.
  const unplaced: string[] = [];
  const seen = new Map<string, PlannedTask>();
  for (const t of input.tasks ?? []) {
    const prev = seen.get(t.taskId);
    if (!prev || t.hours > prev.hours) seen.set(t.taskId, t);
  }

  let plannedHours = 0;
  for (const t of seen.values()) {
    if (!(t.hours > 0)) continue;
    if (!t.start || !t.end || Number.isNaN(parse(t.start)) || Number.isNaN(parse(t.end)) || parse(t.end) < parse(t.start)) {
      unplaced.push(t.taskId);
      continue;
    }
    let taskDays = 0;
    let inPeriodDays = 0;
    for (const day of eachDay(t.start, t.end)) {
      if (!isWorkingDay(day, cal) || holidays.has(day)) continue;
      taskDays += 1;
      if (day >= from && day <= to) inPeriodDays += 1;
    }
    if (taskDays === 0) {
      unplaced.push(t.taskId);
      continue;
    }
    plannedHours += (t.hours * inPeriodDays) / taskDays;
  }

  if (unplaced.length > 0) {
    limitations.push(`${unplaced.length} task(s) have no usable dates and are not counted.`);
  }
  if (pendingLeaveHours > 0) {
    limitations.push("Pending leave requests are not deducted from capacity.");
  }
  if (input.allocationPercentTotal != null && input.allocationPercentTotal > 100) {
    limitations.push(`Project allocations total ${input.allocationPercentTotal}% (over 100%).`);
  }

  let utilizationPct: number | null = null;
  let level: CapacityLevel;
  if (availableHours > 0) {
    utilizationPct = round2((plannedHours / availableHours) * 100);
    level = utilizationPct > overPct ? "over" : utilizationPct > warnPct ? "warn" : "ok";
  } else if (plannedHours > 0) {
    level = "over";
  } else {
    level = workingDays === 0 ? "unknown" : "ok";
  }

  return {
    workingDays,
    grossHours: round2(grossHours),
    holidayHours: round2(holidayHours),
    leaveHours: round2(leaveHours),
    pendingLeaveHours: round2(pendingLeaveHours),
    availableHours: round2(availableHours),
    plannedHours: round2(plannedHours),
    utilizationPct,
    level,
    unplacedTaskIds: unplaced,
    limitations,
  };
}

/** Capacity before and after adding a task to an employee; a warn/over result needs an override reason. */
export function checkAllocation(
  input: CapacityInput,
  addition: PlannedTask,
): { before: CapacityResult; after: CapacityResult; needsOverrideReason: boolean } {
  const before = computeCapacity(input);
  const after = computeCapacity({ ...input, tasks: [...(input.tasks ?? []), addition] });
  return { before, after, needsOverrideReason: after.level === "over" || after.level === "warn" };
}
