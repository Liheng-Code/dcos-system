// Test oracle: the ORIGINAL levelling algorithm (recomputes all demand on every push).
// Slow but simple — kept only so tests can prove the fast engine decides identically.
import { addWorkingDays, nextWorkingDay, parseISO, workingDaysBetween, type WorkCalendar } from "../work-calendar";
import type { LevelTask } from "../resource-levelling";

function refFinish(level: LevelTask, start: string, c: WorkCalendar): string {
  return level.durationWd <= 0 ? start : addWorkingDays(c, start, level.durationWd - 1);
}
function refDays(c: WorkCalendar, from: string, to: string): string[] {
  if (parseISO(to).getTime() < parseISO(from).getTime()) return [];
  const days: string[] = [];
  const working = workingDaysBetween(c, from, to);
  let at = nextWorkingDay(c, from, 1);
  for (let i = 0; i < Math.max(1, working); i++) {
    days.push(at);
    at = addWorkingDays(c, at, 1);
  }
  return days;
}

export function referenceLevel(tasks: LevelTask[], c: WorkCalendar, capacities: Record<string, number>) {
  type A = { level: LevelTask; start: string; finish: string; shiftedWd: number };
  const pool: A[] = tasks
    .filter((t) => t.resource && t.resourceUnits > 0 && t.durationWd > 0 && !!t.earliestStart)
    .map((t) => {
      const start = nextWorkingDay(c, t.earliestStart, 1);
      return { level: t, start, finish: refFinish(t, start, c), shiftedWd: 0 };
    })
    .sort((a, b) => a.level.id.localeCompare(b.level.id));
  const cap = (r: string) => Math.max(0, capacities[r] ?? 1);
  const unitsById = new Map(pool.map((p) => [p.level.id, p.level.resourceUnits]));

  const demandAt = (active: A[]) => {
    const map = new Map<string, { resource: string; date: string; taskId: string }[]>();
    for (const a of active) {
      for (const date of refDays(c, a.start, a.finish)) {
        const key = `${a.level.resource}\u0000${date}`;
        const e = { resource: a.level.resource!, date, taskId: a.level.id };
        const l = map.get(key);
        if (l) l.push(e);
        else map.set(key, [e]);
      }
    }
    return map;
  };
  const worst = (active: A[]) => {
    let w: { key: string; date: string; demand: number; capacity: number } | null = null;
    for (const [key, occs] of demandAt(active)) {
      const capacity = cap(occs[0].resource);
      const demand = occs.reduce((n, o) => n + (unitsById.get(o.taskId) ?? 0), 0);
      if (demand <= capacity) continue;
      const cand = { key, date: occs[0].date, demand, capacity };
      if (!w || cand.demand - cand.capacity > w.demand - w.capacity || (cand.demand - cand.capacity === w.demand - w.capacity && cand.date < w.date)) w = cand;
    }
    return w;
  };
  const moved = new Map<string, { newStart: string; shiftedWd: number }>();
  const log: string[] = [];
  let stoppedNoMover = false;
  for (let pass = 0; pass < 100000; pass++) {
    const conflict = worst(pool);
    if (!conflict) break;
    const [resource, date] = conflict.key.split("\u0000");
    const sharers = pool
      .filter((a) => a.level.resource === resource && refDays(c, a.start, a.finish).includes(date))
      .filter((a) => a.level.totalFloatWd - a.shiftedWd > 0)
      .filter((a) => parseISO(refFinish(a.level, addWorkingDays(c, a.start, 1), c)).getTime() <= parseISO(a.level.latestFinish).getTime())
      .sort((a, b) => {
        if (b.level.priority !== a.level.priority) return b.level.priority - a.level.priority;
        const f = b.level.totalFloatWd - b.shiftedWd - (a.level.totalFloatWd - a.shiftedWd);
        return f !== 0 ? f : a.level.id.localeCompare(b.level.id);
      });
    const mover = sharers[0];
    if (!mover) {
      stoppedNoMover = true;
      break; // original behaviour: stop at the first conflict nobody can pay for
    }
    mover.start = addWorkingDays(c, mover.start, 1);
    mover.finish = refFinish(mover.level, mover.start, c);
    mover.shiftedWd += 1;
    moved.set(mover.level.id, { newStart: mover.start, shiftedWd: mover.shiftedWd });
    log.push(`${mover.level.id}@${date}`);
  }
  return {
    starts: new Map(pool.map((a) => [a.level.id, a.start])),
    moved,
    log,
    stoppedNoMover,
    unresolved: worst(pool) !== null,
  };
}
