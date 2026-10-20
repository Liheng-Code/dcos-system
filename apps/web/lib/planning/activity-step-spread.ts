// Spreads an activity's duration over its Activity Steps.
//
// The activity's duration is the input (it follows quantity through Task Work, or
// comes from the schedule). Steps only share it out:
//   fixed  steps take their own days on every activity (setting out, inspection, curing);
//   scaled steps share the time left after the fixed ones, by duration_share_pct.
// Steps with progress recorded are "locked": they keep their days and dates, and the
// steps after them are laid out from where they finish.
//
// Pure: no I/O, so the panel and the unit tests use the same code.

import {
  addWorkingDays,
  nextWorkingDay,
  workingDaysBetween,
  type WorkCalendar,
} from "./work-calendar";

export type DurationBasis = "fixed" | "scaled";

export const isDurationBasis = (v: unknown): v is DurationBasis => v === "fixed" || v === "scaled";

/** Every day is a working day: used for activities measured in calendar days ("cd"). */
export const ALL_DAYS_CALENDAR: WorkCalendar = {
  id: null,
  name: "All days",
  workdays: [true, true, true, true, true, true, true],
  exceptions: new Map(),
};

export interface SpreadStep {
  id: string;
  duration_basis: DurationBasis;
  duration_share_pct: number | null;
  est_duration_days: number | null;
  progress: number;
  start_date: string | null;
  end_date: string | null;
}

export interface SpreadUpdate {
  id: string;
  est_duration_days: number;
  start_date: string | null;
  end_date: string | null;
}

export interface SpreadResult {
  /** One entry per step that is not locked (progress 0), in step order. */
  updates: SpreadUpdate[];
  fixedDays: number;
  /** Time shared by the scaled steps: activity duration − fixed days, floored at 0. */
  scaledDays: number;
  /** Sum of the scaled steps' shares (they are normalised, so 100 is not required). */
  shareTotal: number;
  warnings: string[];
}

export interface TaskWorkDuration {
  quantity: number | null;
  quantity_unit: string | null;
  duration_wd_derived: number | null;
  norm_code?: string | null;
}

export interface ActivityDuration {
  days: number;
  source: "quantity" | "schedule";
  /** The activity's own scheduled duration, for comparison when the source is quantity. */
  scheduledDays: number;
  quantity: number | null;
  unit: string | null;
  normCode: string | null;
}

const EPS = 1e-6;

const num = (v: number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const isLocked = (s: { progress: number }): boolean => Number(s.progress) > 0;

/**
 * The duration to spread: Task Work's quantity-derived duration when it has one
 * (working-day activities only), else the activity's scheduled duration.
 */
export function resolveActivityDuration(
  scheduledDays: number,
  durationUnit: string | null | undefined,
  work: TaskWorkDuration | null,
): ActivityDuration {
  const derived = num(work?.duration_wd_derived);
  const base = {
    scheduledDays,
    quantity: work?.quantity ?? null,
    unit: work?.quantity_unit ?? null,
    normCode: work?.norm_code ?? null,
  };
  if (derived > 0 && durationUnit !== "cd") return { ...base, days: derived, source: "quantity" };
  return { ...base, days: scheduledDays, source: "schedule" };
}

/** Days of each step on an activity lasting `activityDays`. */
export function computeStepDays(
  steps: Pick<SpreadStep, "id" | "duration_basis" | "duration_share_pct" | "est_duration_days">[],
  activityDays: number,
): { days: Map<string, number>; fixedDays: number; scaledDays: number; shareTotal: number } {
  const fixed = steps.filter((s) => s.duration_basis === "fixed");
  const scaled = steps.filter((s) => s.duration_basis !== "fixed");
  const fixedDays = fixed.reduce((sum, s) => sum + num(s.est_duration_days), 0);
  const scaledDays = Math.max(0, activityDays - fixedDays);
  const shareTotal = scaled.reduce((sum, s) => sum + num(s.duration_share_pct), 0);

  const days = new Map<string, number>();
  for (const s of fixed) days.set(s.id, num(s.est_duration_days));
  for (const s of scaled) {
    const share = shareTotal > 0 ? num(s.duration_share_pct) / shareTotal : 1 / scaled.length;
    days.set(s.id, scaledDays * share);
  }
  return { days, fixedDays, scaledDays, shareTotal };
}

/**
 * Lays the steps out back to back from `activityStart`. Fractional days share a working
 * day with the neighbouring step, so the steps end on the activity's last day rather than
 * drifting past it through rounding. Without a start date, only days are returned.
 */
export function spreadSteps(
  steps: SpreadStep[],
  activityDays: number,
  activityStart: string | null,
  cal: WorkCalendar,
): SpreadResult {
  const { days, fixedDays, scaledDays, shareTotal } = computeStepDays(steps, activityDays);
  const warnings: string[] = [];
  if (fixedDays > activityDays + EPS) {
    warnings.push(
      `Fixed steps take ${round1(fixedDays)} d, longer than the activity's ${round1(activityDays)} d, so the scaled steps get no time.`,
    );
  }
  const scaledCount = steps.filter((s) => s.duration_basis !== "fixed").length;
  if (scaledCount > 0 && shareTotal <= 0) {
    warnings.push("No scaled step has a share, so their time is split equally.");
  }

  const start = activityStart ? nextWorkingDay(cal, activityStart, 1) : null;
  const updates: SpreadUpdate[] = [];
  let cursor = 0; // working days from `start`, fractional
  let lockedOverrun = false;

  for (const s of steps) {
    const d = days.get(s.id) ?? 0;
    if (isLocked(s)) {
      if (start && s.end_date) {
        // Working days from the activity start through this step's finish = offset of the next day.
        const through = workingDaysBetween(cal, start, s.end_date);
        cursor = Math.max(cursor, through);
      } else {
        cursor += num(s.est_duration_days);
      }
      continue;
    }
    // Trim float noise so 2.9999999 floors/ceils as 3.
    const a = Number(cursor.toFixed(6));
    const b = Number((cursor + d).toFixed(6));
    let startDate: string | null = null;
    let endDate: string | null = null;
    if (start) {
      const startOff = Math.floor(a);
      const endOff = Math.max(startOff, Math.ceil(b) - 1);
      startDate = addWorkingDays(cal, start, startOff);
      endDate = addWorkingDays(cal, start, endOff);
    }
    updates.push({ id: s.id, est_duration_days: round1(d), start_date: startDate, end_date: endDate });
    cursor += d;
    if (cursor > activityDays + EPS && steps.some(isLocked)) lockedOverrun = true;
  }

  if (lockedOverrun && fixedDays <= activityDays + EPS) {
    warnings.push("Steps already in progress run later than planned, so the remaining steps finish after the activity.");
  }
  return { updates, fixedDays, scaledDays, shareTotal, warnings };
}

/** True when not-started steps' stored days no longer match a fresh spread (activity duration changed). */
export function needsRespread(steps: SpreadStep[], activityDays: number): boolean {
  const { days } = computeStepDays(steps, activityDays);
  return steps.some((s) => !isLocked(s) && Math.abs(num(s.est_duration_days) - round1(days.get(s.id) ?? 0)) > 0.05);
}

/**
 * Scales step weights to total 100 (2 dp), keeping their proportions; the rounding remainder goes to the
 * heaviest step. All zero (e.g. only new steps) → shared equally. Used when a planner drops or adds steps.
 */
export function rebalanceWeights(weights: number[]): number[] {
  if (weights.length === 0) return [];
  const clean = weights.map((w) => Math.max(0, Number(w) || 0));
  const total = clean.reduce((a, b) => a + b, 0);
  const raw = total > 0 ? clean.map((w) => (w / total) * 100) : clean.map(() => 100 / clean.length);
  const out = raw.map((w) => Math.round(w * 100) / 100);
  const diff = Math.round((100 - out.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (diff !== 0) {
    const i = out.indexOf(Math.max(...out));
    out[i] = Math.round((out[i] + diff) * 100) / 100;
  }
  return out;
}
