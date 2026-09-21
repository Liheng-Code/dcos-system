// Demand profile behind the Planning dashboard's resource-levelling chart.
//
// Pure (no I/O, no React). `levelResources()` only reports the peak before/after
// and the new start dates; this rebuilds the daily demand curve for both from
// those starts, walking working days the same way the engine does, so the chart
// and the engine can never disagree.

import { addWorkingDays, nextWorkingDay, parseISO, workingDaysBetween, type WorkCalendar } from "./work-calendar";
import type { LevelTask, ResourceLevellingResult } from "./resource-levelling";

export interface LevellingDay {
  date: string;
  /** Total concurrent units (1 = one full resource) across all levelled resources. */
  before: number;
  after: number;
}

export interface LevellingProfile {
  daily: LevellingDay[];
  /** Sum of the capacities (units) of every resource that has a levelled task. */
  capacity: number;
  /** Resource-days where one resource's demand exceeds its own capacity. */
  overDaysBefore: number;
  overDaysAfter: number;
}

/** Inclusive working-date walk — mirrors `datedWorkingDays` in resource-levelling.ts. */
function workingDates(cal: WorkCalendar, from: string, to: string): string[] {
  if (parseISO(to).getTime() < parseISO(from).getTime()) return [];
  const days: string[] = [];
  const working = workingDaysBetween(cal, from, to);
  let at = nextWorkingDay(cal, from, 1);
  for (let i = 0; i < Math.max(1, working); i++) {
    days.push(at);
    at = addWorkingDays(cal, at, 1);
  }
  return days;
}

export function buildLevellingProfile(
  tasks: LevelTask[],
  cal: WorkCalendar,
  capacities: Record<string, number>,
  result: ResourceLevellingResult,
): LevellingProfile {
  const pool = tasks.filter((t) => t.resource && t.resourceUnits > 0 && t.durationWd > 0 && !!t.earliestStart);

  const totalBefore = new Map<string, number>();
  const totalAfter = new Map<string, number>();
  const perResBefore = new Map<string, number>();
  const perResAfter = new Map<string, number>();

  const add = (
    t: LevelTask,
    start: string,
    total: Map<string, number>,
    perRes: Map<string, number>,
  ) => {
    const finish = addWorkingDays(cal, start, t.durationWd - 1);
    for (const date of workingDates(cal, start, finish)) {
      total.set(date, (total.get(date) ?? 0) + t.resourceUnits);
      const key = `${t.resource}\u0000${date}`;
      perRes.set(key, (perRes.get(key) ?? 0) + t.resourceUnits);
    }
  };

  const resources = new Set<string>();
  for (const t of pool) {
    resources.add(t.resource!);
    const startBefore = nextWorkingDay(cal, t.earliestStart, 1);
    const startAfter = result.starts.get(t.id) ?? startBefore;
    add(t, startBefore, totalBefore, perResBefore);
    add(t, startAfter, totalAfter, perResAfter);
  }

  const overDays = (perRes: Map<string, number>) => {
    let n = 0;
    for (const [key, demand] of perRes) {
      const resource = key.slice(0, key.indexOf("\u0000"));
      if (demand > Math.max(0, capacities[resource] ?? 1)) n++;
    }
    return n;
  };

  const dates = [...new Set([...totalBefore.keys(), ...totalAfter.keys()])].sort();
  return {
    daily: dates.map((date) => ({ date, before: totalBefore.get(date) ?? 0, after: totalAfter.get(date) ?? 0 })),
    capacity: [...resources].reduce((sum, r) => sum + Math.max(0, capacities[r] ?? 0), 0),
    overDaysBefore: overDays(perResBefore),
    overDaysAfter: overDays(perResAfter),
  };
}
