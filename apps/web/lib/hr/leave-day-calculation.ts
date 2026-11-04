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

// ── Overlap between leave requests ─────────────────────────────────────────
// Mirrors public.leave_request_day_portions / leave_requests_prevent_overlap
// (migration 20261102130533_hr_leave_overlap_guard.sql), which enforces the
// same rule in the database. Per calendar day: a full day clashes with
// anything, a morning with a morning, an afternoon with an afternoon; morning
// + afternoon on one day is fine. Skipped days never clash.

export type DayPortion = "full" | "morning" | "afternoon";

/** An existing active leave request, as far as the overlap rule needs it. */
export interface OccupiedLeaveRequest {
  start_date: string;
  end_date: string;
  /** Per-day choices as submitted; null/absent on requests saved before they were recorded. */
  day_selections?: Record<string, DaySelection> | null;
  is_half_day?: boolean | null;
  half_day_period?: string | null;
}

function isPortion(value: unknown): value is DayPortion {
  return value === "full" || value === "morning" || value === "afternoon";
}

/** The days, and part of each day, a request occupies. */
export function getRequestDayPortions(request: OccupiedLeaveRequest): Map<string, DayPortion> {
  const portions = new Map<string, DayPortion>();
  for (const day of getSelectedDates(request.start_date, request.end_date)) {
    const key = format(day, "yyyy-MM-dd");
    if (request.day_selections) {
      const selection = request.day_selections[key];
      if (isPortion(selection)) portions.set(key, selection);
    } else if (request.is_half_day && isPortion(request.half_day_period)) {
      portions.set(key, request.half_day_period);
    } else {
      // Legacy row without per-day choices: the whole range counts.
      portions.set(key, "full");
    }
  }
  return portions;
}

/** Which parts of each day are already taken by the given requests. */
export function buildOccupiedDayPortions(requests: OccupiedLeaveRequest[]): Map<string, Set<DayPortion>> {
  const occupied = new Map<string, Set<DayPortion>>();
  for (const request of requests) {
    for (const [key, portion] of getRequestDayPortions(request)) {
      const set = occupied.get(key) ?? new Set<DayPortion>();
      set.add(portion);
      occupied.set(key, set);
    }
  }
  return occupied;
}

export interface LeaveDayConflict {
  /** yyyy-MM-dd */
  date: string;
  /** What is already taken that day: the whole day, or one half. */
  taken: DayPortion;
}

/** Days in `selections` that clash with `occupied`, in date order. */
export function findLeaveDayConflicts(
  selections: Record<string, DaySelection>,
  occupied: Map<string, Set<DayPortion>>,
): LeaveDayConflict[] {
  const conflicts: LeaveDayConflict[] = [];
  for (const key of Object.keys(selections).sort()) {
    const wanted = selections[key];
    const taken = occupied.get(key);
    if (!isPortion(wanted) || !taken || taken.size === 0) continue;
    const clashes = wanted === "full" || taken.has("full") || taken.has(wanted);
    if (!clashes) continue;
    const wholeDay = taken.has("full") || (taken.has("morning") && taken.has("afternoon"));
    conflicts.push({ date: key, taken: wholeDay ? "full" : [...taken][0] });
  }
  return conflicts;
}

/** "14 Dec 2026", or "18 Dec 2026 (morning already taken)" when only half the day is booked. */
export function formatLeaveDayConflict(conflict: LeaveDayConflict): string {
  const day = format(parseISO(conflict.date), "dd MMM yyyy");
  return conflict.taken === "full" ? day : `${day} (${conflict.taken} already taken)`;
}

/** The selections to save with a request: only days actually requested. */
export function requestedDaySelections(selections: Record<string, DaySelection>): Record<string, DaySelection> {
  return Object.fromEntries(Object.entries(selections).filter(([, value]) => isPortion(value)));
}
