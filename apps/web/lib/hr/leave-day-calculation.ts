import { eachDayOfInterval, format, isAfter, isSunday, parseISO } from "date-fns";

/**
 * Pure day-counting logic ported from
 * `apps/web/components/hr/leave/leave-request-form.tsx` (client-side only,
 * as of this port). Both the form and `createLeaveRequest` in
 * `apps/web/lib/hr/leave.ts` must agree on how many days a date range +
 * per-day overrides amount to — this module is the single source of truth
 * for that arithmetic on the server side.
 *
 * Rules (mirrors the form's `getSelectedDates` / `getDefaultDaySelections` /
 * `requestableDates` / `daysRequested` memos exactly):
 *  - Sundays and public holidays are auto-excluded from the day count unless
 *    the caller explicitly supplies an override for that date key.
 *  - Every other day defaults to "full" (1 day) unless overridden.
 *  - "morning" / "afternoon" count as 0.5 day. "skip" counts as 0.
 */

export type DaySelection = "full" | "morning" | "afternoon" | "skip";

/** All calendar days from startDate to endDate inclusive (empty if end < start or either is missing). */
export function getSelectedDates(startDate: string, endDate: string): Date[] {
  if (!startDate || !endDate) return [];
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (isAfter(start, end)) return [];
  return eachDayOfInterval({ start, end });
}

/**
 * Builds the effective day-selection map for a date range: every non-Sunday,
 * non-holiday day defaults to "full"; Sundays/holidays are omitted (i.e.
 * auto-excluded) unless `overrides` already has an explicit entry for that
 * key — mirrors `getDefaultDaySelections` in the form exactly.
 */
export function getDefaultDaySelections(
  startDate: string,
  endDate: string,
  overrides: Record<string, DaySelection> = {},
  holidays: Set<string> = new Set(),
): Record<string, DaySelection> {
  const next: Record<string, DaySelection> = {};
  for (const day of getSelectedDates(startDate, endDate)) {
    const key = format(day, "yyyy-MM-dd");
    if ((isSunday(day) || holidays.has(key)) && overrides[key] == null) continue;
    next[key] = overrides[key] ?? "full";
  }
  return next;
}

export interface LeaveDayCalculation {
  /** yyyy-MM-dd keys of the days actually counted toward the request (mirrors `requestableDates`). */
  requestableDateKeys: string[];
  daysRequested: number;
  isHalfDay: boolean;
  isSingleHalfDayRequest: boolean;
  halfDayPeriod: "morning" | "afternoon" | null;
}

/**
 * Computes the days-requested total and half-day flags for a date range +
 * effective day-selection map — mirrors the form's `requestableDates`,
 * `halfDaySelections`, `isHalfDay`, `isSingleHalfDayRequest`, `halfDayPeriod`,
 * and `daysRequested` memos exactly.
 */
export function computeLeaveDays(
  startDate: string,
  endDate: string,
  daySelections: Record<string, DaySelection>,
  holidays: Set<string> = new Set(),
): LeaveDayCalculation {
  const requestableDateKeys = getSelectedDates(startDate, endDate)
    .filter((day) => {
      const key = format(day, "yyyy-MM-dd");
      const skip = isSunday(day) || holidays.has(key);
      return !skip || daySelections[key] != null;
    })
    .map((day) => format(day, "yyyy-MM-dd"));

  const halfDayKeys = requestableDateKeys.filter((key) => {
    const value = daySelections[key];
    return value === "morning" || value === "afternoon";
  });

  const daysRequested = requestableDateKeys.reduce((sum, key) => {
    const selection = daySelections[key] ?? "full";
    if (selection === "skip") return sum;
    if (selection === "morning" || selection === "afternoon") return sum + 0.5;
    return sum + 1;
  }, 0);

  const isHalfDay = halfDayKeys.length > 0;
  const isSingleHalfDayRequest = halfDayKeys.length === 1 && daysRequested === 0.5;
  const halfDayPeriod = isSingleHalfDayRequest ? (daySelections[halfDayKeys[0]] as "morning" | "afternoon") : null;

  return { requestableDateKeys, daysRequested, isHalfDay, isSingleHalfDayRequest, halfDayPeriod };
}
