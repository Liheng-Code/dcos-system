// Productivity & Resource-Costing Plan, Phase 4 — spreads each task's planned_cost evenly across its
// scheduled working days (the standard BCWS/PV convention) and buckets the result into ISO weeks, for the
// cost-loaded S-curve / cash-flow card. Pure — no I/O — so it is unit-testable and reusable off the page.

import { isWorkingDay, parseISO, toISO, type WorkCalendar } from "./work-calendar";

export interface PhasableTask {
  startDate: string | null;
  endDate: string | null;
  isMilestone: boolean;
  plannedCost: number | null;
}

export interface WeeklyCostPoint {
  weekStart: string;
  /** This week's outflow — the cash-flow bar. */
  cost: number;
  /** Running total through this week — the cost-loaded S-curve line. */
  cumulative: number;
}

const DAY = 86_400_000;
function toUtc(iso: string): number {
  return parseISO(iso).getTime();
}
/** Monday of the week containing `iso`. */
function weekStartOf(iso: string): string {
  const ms = toUtc(iso);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  return toISO(new Date(ms - ((dow + 6) % 7) * DAY));
}

const MAX_SPAN_DAYS = 3660; // ~10 years — a generous, finite scan bound per task

/** Weekly planned-cost outflow and its running cumulative, across every priced, non-milestone task. */
export function phaseCostByWeek(tasks: PhasableTask[], cal: WorkCalendar): WeeklyCostPoint[] {
  const byWeek = new Map<string, number>();

  for (const t of tasks) {
    if (t.isMilestone || !t.plannedCost || t.plannedCost <= 0) continue;
    if (!t.startDate || !t.endDate) continue;
    if (toUtc(t.endDate) < toUtc(t.startDate)) continue;

    const workingDays: string[] = [];
    let cur = t.startDate;
    for (let i = 0; i < MAX_SPAN_DAYS && toUtc(cur) <= toUtc(t.endDate); i++) {
      if (isWorkingDay(cal, cur)) workingDays.push(cur);
      cur = toISO(new Date(toUtc(cur) + DAY));
    }
    if (workingDays.length === 0) continue;

    const perDay = t.plannedCost / workingDays.length;
    for (const day of workingDays) {
      const wk = weekStartOf(day);
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + perDay);
    }
  }

  const weeks = [...byWeek.keys()].sort();
  let running = 0;
  return weeks.map((weekStart) => {
    const cost = Math.round(byWeek.get(weekStart)! * 100) / 100;
    running = Math.round((running + cost) * 100) / 100;
    return { weekStart, cost, cumulative: running };
  });
}
