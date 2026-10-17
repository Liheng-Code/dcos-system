// Project duration is stored in whole months (projects.duration, text) next to the start and end dates.

/** Whole months from start to end, or "" when either date is missing or the range is empty. */
export function calcMonths(start: string, end: string): string {
  if (!start || !end) return "";
  const s = new Date(start);
  const e = new Date(end);
  if (e <= s) return "";
  const m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return m > 0 ? `${m}` : "";
}

interface DatedProject {
  start_date: string | null;
  end_date: string | null;
  duration: string | null;
}

/**
 * The duration to store after a date change. A duration that was derived from the old dates (or
 * empty) follows the new ones; one entered by hand is kept.
 */
export function durationAfterDateChange(before: DatedProject, start: string | null, end: string | null): string | null {
  const wasDerived = !before.duration || before.duration === calcMonths(before.start_date ?? "", before.end_date ?? "");
  if (!wasDerived) return before.duration;
  return calcMonths(start ?? "", end ?? "") || null;
}
