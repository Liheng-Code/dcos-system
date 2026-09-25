// Resource levelling engine (3.2).
//
// Pure (no I/O, no React). Net-change leveller, bounded inside each task's
// total-float window — it can only ever push a task LATER between its current
// start and its CPM late-finish budget, so the critical path can never be
// extended and a levelled schedule is still a feasible one. When float is
// exhausted the leveller stops and reports the residual conflict rather than
// silently overrunning.
//
// Rules (per the Completion Plan continuation):
//   * tasks pinned by a "must / no earlier than" constraint or already at
//     zero float are never moved (the caller passes them with float 0);
//   * among the sharers of an over-allocated day, the LOWEST-priority task
//     (highest `priority` value) is the first to move, then the next, with
//     pushes taking place one working day at a time;
//   * ties break on task_code for determinism.
//
// Performance: demand per (resource, day) is kept incrementally — a push only
// re-registers the ONE task that moved — so a programme with hundreds of tasks
// and thousands of pushes levels in well under a second. Recomputing every
// task's working days on every push (the original approach) took ~17 s for
// 1,000 pushes on a 600-task programme.
//
// The result is a set of start-date adjustments the caller can apply to
// wbs_tasks and re-run the CPM engine on. This module never touches storage.

import {
  addWorkingDays,
  nextWorkingDay,
  parseISO,
  workingDaysBetween,
  type WorkCalendar,
} from "./work-calendar";

export interface ResourceDemand {
  resourceId: string;
  /** Concurrent units this task demands of this resource, for its whole duration (1 crew = 1; 12 workers = 12). */
  units: number;
}

export interface LevelTask {
  id: string;
  task_code: string;
  task_name: string;
  /** Working days. Milestones (0) never compete for resource days. */
  durationWd: number;
  /** Total float in working days — the leveller's soft budget. */
  totalFloatWd: number;
  freeFloatWd: number;
  earliestStart: string;
  latestFinish: string;
  /**
   * Every resource (labour AND equipment) this task demands, IN PARALLEL, for its whole
   * duration — a task with a crew and a crane demands both at once, so moving the task moves
   * it against both simultaneously; there is no notion of "the task's resource" any more.
   * Empty = the task does not compete for any resource and is never moved.
   */
  resources: ResourceDemand[];
  /** 1 = highest. Lower-priority tasks move first. */
  priority: number;
}

export interface LevelAssignment {
  taskId: string;
  oldStart: string;
  newStart: string;
  shiftedWd: number;
}

export interface ResidualConflict {
  resource: string;
  date: string;
  demand: number;
  capacity: number;
  committers: { taskId: string; task_code: string; priority: number }[];
}

export interface ResourceLevellingResult {
  ok: boolean;
  /** Every mover, in the order the algorithm pushed it. */
  assignments: LevelAssignment[];
  /** taskId → final start date (all tasks, whether moved or not). */
  starts: Map<string, string>;
  overAllocationResolved: boolean;
  residual: ResidualConflict[];
  /**
   * True when the pass limit was hit while conflicts still had float left to
   * spend — the leveller stopped early rather than running out of float.
   */
  stoppedAtLimit: boolean;
  /** Peak concurrent-unit demand per resource — before is not comparable ACROSS resources (a crew and a crane
   *  don't share a unit scale), so this is reported per resource rather than as one combined number. */
  peaks: { resourceId: string; before: number; after: number }[];
}

/** One pass = one task pushed one working day. Generous: a big programme needs thousands. */
const MAX_PASSES = 50_000;

interface Active0 {
  level: LevelTask;
  start: string;
  finish: string;
  /** Working dates currently occupied (kept in sync with start/finish). */
  days: string[];
  shiftedWd: number;
}

function finishOf(level: LevelTask, start: string, cal: WorkCalendar): string {
  if (level.durationWd <= 0) return start;
  return addWorkingDays(cal, start, level.durationWd - 1);
}

/** Inclusive working-date walk between two ISO dates. */
function datedWorkingDays(cal: WorkCalendar, from: string, to: string): string[] {
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

const KEY_SEP = "\u0000";
const keyOf = (resource: string, date: string) => `${resource}${KEY_SEP}${date}`;

/**
 * Level the resource demand of `tasks` within their float windows. Returns the
 * adjusted starts plus any residual conflict the float budgets could not pay
 * for. Never throws on empty input.
 */
export function levelResources(
  tasks: LevelTask[],
  cal: WorkCalendar,
  capacities: Record<string, number> = {},
): ResourceLevellingResult {
  const pool: Active0[] = tasks
    .filter((t) => t.resources.some((r) => r.units > 0) && t.durationWd > 0 && !!t.earliestStart)
    .map((t) => {
      const start = nextWorkingDay(cal, t.earliestStart, 1);
      const finish = finishOf(t, start, cal);
      // Only positive-unit demands compete for anything; a zero/negative row is dead weight.
      const level: LevelTask = { ...t, resources: t.resources.filter((r) => r.units > 0) };
      return { level, start, finish, days: datedWorkingDays(cal, start, finish), shiftedWd: 0 };
    })
    .sort((a, b) => a.level.id.localeCompare(b.level.id));

  const initialStarts = new Map<string, string>();
  for (const a of pool) initialStarts.set(a.level.id, a.start);

  const capacityOf = (resource: string) => Math.max(0, capacities[resource] ?? 1);
  const byId = new Map(pool.map((a) => [a.level.id, a]));

  /** A task's own demanded units of ONE resource (0 if it doesn't demand that resource at all). */
  const unitsFor = (id: string, resource: string) =>
    byId.get(id)!.level.resources.find((r) => r.resourceId === resource)?.units ?? 0;

  // ── Incremental demand: (resource, day) → the tasks occupying it ──────────
  const occupants = new Map<string, Set<string>>();
  /** Keys whose summed units exceed capacity. */
  const over = new Set<string>();
  /** Over-capacity keys where nobody could move; cleared when the key changes. */
  const stuck = new Set<string>();

  // Summed in id order so the total never depends on insertion order.
  const unitsOf = (ids: Set<string>, resource: string) =>
    [...ids].sort().reduce((n, id) => n + unitsFor(id, resource), 0);

  const refresh = (key: string, resource: string) => {
    stuck.delete(key);
    const ids = occupants.get(key);
    // Compare summed UNITS to capacity. (A task-count shortcut would hide conflicts whenever a task
    // demands more than one unit, e.g. 12 workers of a 50-worker trade.)
    if (ids && ids.size > 0 && unitsOf(ids, resource) > capacityOf(resource)) over.add(key);
    else over.delete(key);
  };

  const place = (a: Active0) => {
    for (const dem of a.level.resources) {
      for (const date of a.days) {
        const key = keyOf(dem.resourceId, date);
        let ids = occupants.get(key);
        if (!ids) occupants.set(key, (ids = new Set()));
        ids.add(a.level.id);
        refresh(key, dem.resourceId);
      }
    }
  };

  const lift = (a: Active0) => {
    for (const dem of a.level.resources) {
      for (const date of a.days) {
        const key = keyOf(dem.resourceId, date);
        const ids = occupants.get(key);
        if (ids) {
          ids.delete(a.level.id);
          if (ids.size === 0) occupants.delete(key);
        }
        refresh(key, dem.resourceId);
      }
    }
  };

  for (const a of pool) place(a);

  /** The worst over-capacity day still worth working on: biggest excess, then earliest date. */
  const worstConflict = () => {
    let best: { key: string; date: string; excess: number } | null = null;
    for (const key of over) {
      if (stuck.has(key)) continue;
      const sep = key.indexOf(KEY_SEP);
      const resource = key.slice(0, sep);
      const date = key.slice(sep + 1);
      const excess = unitsOf(occupants.get(key)!, resource) - capacityOf(resource);
      if (
        !best ||
        excess > best.excess ||
        (excess === best.excess && (date < best.date || (date === best.date && key < best.key)))
      ) {
        best = { key, date, excess };
      }
    }
    return best;
  };

  const assignments: LevelAssignment[] = [];
  let stoppedAtLimit = false;

  for (let pass = 0; ; pass++) {
    const conflict = worstConflict();
    if (!conflict) break;
    if (pass >= MAX_PASSES) {
      stoppedAtLimit = true;
      break;
    }

    const sharers = [...occupants.get(conflict.key)!]
      .map((id) => byId.get(id)!)
      .filter((a) => a.level.totalFloatWd - a.shiftedWd > 0)
      .filter((a) => {
        // Budget bound: a push must keep finish <= latestFinish (the CPM late
        // budget). A task with zero float and no room simply cannot move.
        const after = finishOf(a.level, addWorkingDays(cal, a.start, 1), cal);
        return parseISO(after).getTime() <= parseISO(a.level.latestFinish).getTime();
      })
      .sort((a, b) => {
        // Lowest-priority first, then most float remaining, then id.
        if (b.level.priority !== a.level.priority) return b.level.priority - a.level.priority;
        const f = b.level.totalFloatWd - b.shiftedWd - (a.level.totalFloatWd - a.shiftedWd);
        if (f !== 0) return f;
        return a.level.id.localeCompare(b.level.id);
      });

    const mover = sharers[0];
    if (!mover) {
      // Nobody on this day can pay for the over-allocation → it stays a residual,
      // but other conflicts may still be fixable, so carry on with them.
      stuck.add(conflict.key);
      continue;
    }

    const oldStart = mover.start;
    lift(mover);
    mover.start = addWorkingDays(cal, mover.start, 1);
    mover.finish = finishOf(mover.level, mover.start, cal);
    mover.days = datedWorkingDays(cal, mover.start, mover.finish);
    mover.shiftedWd += 1;
    place(mover);

    const existing = assignments.find((x) => x.taskId === mover.level.id);
    if (existing) {
      existing.newStart = mover.start;
      existing.shiftedWd = mover.shiftedWd;
    } else {
      assignments.push({ taskId: mover.level.id, oldStart, newStart: mover.start, shiftedWd: 1 });
    }
  }

  const starts = new Map<string, string>();
  for (const a of pool) starts.set(a.level.id, a.start);
  for (const t of tasks) {
    if (!starts.has(t.id)) starts.set(t.id, t.earliestStart);
  }

  const residual: ResidualConflict[] = [];
  for (const key of over) {
    const sep = key.indexOf(KEY_SEP);
    const resource = key.slice(0, sep);
    const active = [...occupants.get(key)!].map((id) => byId.get(id)!);
    residual.push({
      resource,
      date: key.slice(sep + 1),
      demand: unitsOf(occupants.get(key)!, resource),
      capacity: capacityOf(resource),
      committers: active
        .map((p) => ({ taskId: p.level.id, task_code: p.level.task_code, priority: p.level.priority }))
        .sort((a, b) => a.task_code.localeCompare(b.task_code)),
    });
  }
  residual.sort((a, b) => b.demand - b.capacity - (a.demand - a.capacity) || a.date.localeCompare(b.date));

  // Peak concurrent-unit demand PER RESOURCE — before and after computed against each task's own before/after
  // day range so the comparison is fair, and kept separate per resource since units aren't comparable across
  // different resources (a crew and a crane don't share a scale).
  const allResourceIds = new Set<string>();
  for (const a of pool) for (const dem of a.level.resources) allResourceIds.add(dem.resourceId);

  const bump = (map: Map<string, Map<string, number>>, resource: string, date: string, units: number) => {
    const byDate = map.get(resource) ?? new Map<string, number>();
    byDate.set(date, (byDate.get(date) ?? 0) + units);
    map.set(resource, byDate);
  };
  const beforeByResource = new Map<string, Map<string, number>>();
  const afterByResource = new Map<string, Map<string, number>>();
  for (const a of pool) {
    const s = initialStarts.get(a.level.id)!;
    const beforeDays = datedWorkingDays(cal, s, finishOf(a.level, s, cal));
    for (const dem of a.level.resources) {
      for (const date of beforeDays) bump(beforeByResource, dem.resourceId, date, dem.units);
      for (const date of a.days) bump(afterByResource, dem.resourceId, date, dem.units);
    }
  }
  const peakOf = (map: Map<string, Map<string, number>>, resource: string) =>
    Math.max(0, ...[...(map.get(resource)?.values() ?? [])]);
  const peaks = [...allResourceIds]
    .sort()
    .map((resourceId) => ({ resourceId, before: peakOf(beforeByResource, resourceId), after: peakOf(afterByResource, resourceId) }));

  return {
    ok: true,
    assignments,
    starts,
    overAllocationResolved: residual.length === 0,
    residual,
    stoppedAtLimit,
    peaks,
  };
}
