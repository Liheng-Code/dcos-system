// MS-Project-style working-day scheduling engine for Planning ▸ Gantt Chart.
//
// Pure — no I/O, no React. Given a task set, a work calendar and a project start
// date it produces every task's start/finish (forward pass, honouring FS/SS/FF/SF
// links with lag) plus total/free float and the critical path (backward pass).
//
// Scope notes for v1:
//  * The three "no later than" constraints (start_no_later_than,
//    finish_no_later_than, as_late_as_possible) are NOT enforced — the engine
//    records them in `violations` and the view flags the row. Enforcing them
//    requires negative-float levelling, which is out of scope here.
//  * Durations are working days. A duration of 0 is a milestone (finish = start).
//  * Summary (WBS node) rows are never passed in — they roll up in the UI.

import {
  addWorkingDays,
  finishFromStart,
  maxISO,
  minISO,
  nextWorkingDay,
  parseISO,
  startFromFinish,
  workingDaysBetween,
  type WorkCalendar,
} from "./work-calendar";

export type DepType = "fs" | "ss" | "ff" | "sf";

export const DEP_TYPES: DepType[] = ["fs", "ss", "ff", "sf"];

export function isDepType(v: string): v is DepType {
  return (DEP_TYPES as string[]).includes(v.toLowerCase());
}

export interface EngineDep {
  predId: string;
  type: DepType;
  /** Lag in working days. Negative = lead. */
  lag: number;
}

export interface EngineTask {
  id: string;
  start: string | null;
  finish: string | null;
  /** Working days. 0 = milestone. */
  durationWd: number;
  manuallyScheduled: boolean;
  constraintType: string | null;
  constraintDate: string | null;
  deps: EngineDep[];
}

export interface TaskDates {
  start: string;
  finish: string;
}

export interface TaskFloat {
  totalFloat: number;
  freeFloat: number;
  critical: boolean;
  lateStart: string;
  lateFinish: string;
}

export type ScheduleResult =
  | {
      ok: true;
      dates: Map<string, TaskDates>;
      float: Map<string, TaskFloat>;
      /** Constraints the engine could not honour (id → human-readable reason). */
      violations: Map<string, string>;
    }
  | { ok: false; cycle: string[] };

/** Constraints that pull a task later — enforced. */
const HARD_CONSTRAINTS = new Set([
  "start_no_earlier_than",
  "must_start_on",
  "finish_no_earlier_than",
  "must_finish_on",
]);

/** Constraints that would pull a task earlier — recorded but not enforced in v1. */
const SOFT_CONSTRAINTS = new Set([
  "start_no_later_than",
  "finish_no_later_than",
  "as_late_as_possible",
]);

// ---------------------------------------------------------------------------
// Topological order (Kahn) — returns null when the graph contains a cycle.
// ---------------------------------------------------------------------------
function topoOrder(tasks: EngineTask[]): { order: EngineTask[] } | { cycle: string[] } {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();

  for (const t of tasks) {
    indegree.set(t.id, 0);
    successors.set(t.id, []);
  }
  for (const t of tasks) {
    for (const d of t.deps) {
      // Links to tasks outside this set (deleted, filtered out) are ignored.
      if (!byId.has(d.predId) || d.predId === t.id) continue;
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1);
      successors.get(d.predId)!.push(t.id);
    }
  }

  const queue = tasks.filter((t) => (indegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  const order: EngineTask[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    order.push(byId.get(id)!);
    for (const succId of successors.get(id) ?? []) {
      const next = (indegree.get(succId) ?? 0) - 1;
      indegree.set(succId, next);
      if (next === 0) queue.push(succId);
    }
  }

  if (order.length === tasks.length) return { order };
  return { cycle: extractCycle(tasks.filter((t) => (indegree.get(t.id) ?? 0) > 0), byId) };
}

/** Walk predecessor edges among the unresolved nodes until one repeats. */
function extractCycle(remaining: EngineTask[], byId: Map<string, EngineTask>): string[] {
  const inCycle = new Set(remaining.map((t) => t.id));
  const seen: string[] = [];
  let cur: string | undefined = remaining[0]?.id;
  while (cur && !seen.includes(cur)) {
    seen.push(cur);
    cur = byId.get(cur)?.deps.find((d) => inCycle.has(d.predId))?.predId;
  }
  if (!cur) return seen;
  return seen.slice(seen.indexOf(cur)).concat(cur);
}

// ---------------------------------------------------------------------------
// Forward + backward pass
// ---------------------------------------------------------------------------
export function scheduleProject(
  tasks: EngineTask[],
  cal: WorkCalendar,
  projectStart: string,
): ScheduleResult {
  const topo = topoOrder(tasks);
  if ("cycle" in topo) return { ok: false, cycle: topo.cycle };

  const origin = nextWorkingDay(cal, projectStart, 1);
  const dates = new Map<string, TaskDates>();
  const violations = new Map<string, string>();

  // ---- Forward pass -------------------------------------------------------
  for (const t of topo.order) {
    const dur = Math.max(0, Math.trunc(t.durationWd));

    if (t.manuallyScheduled) {
      // Pinned: keep the stored dates verbatim; successors still ripple from them.
      const start = t.start ?? origin;
      const finish = t.finish ?? finishFromStart(cal, start, dur);
      dates.set(t.id, { start, finish });
      continue;
    }

    // A task nothing drives keeps the date it already has — anchoring every
    // unlinked activity to the project start would wipe hand-entered dates.
    const driven = t.deps.some((d) => dates.has(d.predId));
    let start = driven ? origin : (t.start ?? origin);
    let finish: string | null = null;

    for (const d of t.deps) {
      const pred = dates.get(d.predId);
      if (!pred) continue; // link points outside the set
      const lag = Number.isFinite(d.lag) ? d.lag : 0;
      switch (d.type) {
        case "fs":
          start = maxISO(start, addWorkingDays(cal, pred.finish, 1 + lag));
          break;
        case "ss":
          start = maxISO(start, addWorkingDays(cal, pred.start, lag));
          break;
        case "ff": {
          const candFinish = addWorkingDays(cal, pred.finish, lag);
          finish = finish ? maxISO(finish, candFinish) : candFinish;
          start = maxISO(start, startFromFinish(cal, candFinish, dur));
          break;
        }
        case "sf": {
          const candFinish = addWorkingDays(cal, pred.start, -1 + lag);
          finish = finish ? maxISO(finish, candFinish) : candFinish;
          start = maxISO(start, startFromFinish(cal, candFinish, dur));
          break;
        }
      }
    }

    // Constraints. A "must" date wins over the links, but we flag the clash so
    // the planner can see that a predecessor is being ignored.
    const ct = t.constraintType;
    const cd = t.constraintDate;
    if (ct && cd) {
      const linkDrivenStart = start;
      if (ct === "start_no_earlier_than") {
        start = maxISO(start, nextWorkingDay(cal, cd, 1));
      } else if (ct === "must_start_on") {
        start = nextWorkingDay(cal, cd, 1);
      } else if (ct === "finish_no_earlier_than") {
        start = maxISO(start, startFromFinish(cal, cd, dur));
      } else if (ct === "must_finish_on") {
        start = startFromFinish(cal, cd, dur);
      } else if (SOFT_CONSTRAINTS.has(ct)) {
        violations.set(t.id, `${labelForConstraint(ct)} (${cd}) is not enforced`);
      }
      if (
        HARD_CONSTRAINTS.has(ct) &&
        parseISO(start).getTime() < parseISO(linkDrivenStart).getTime()
      ) {
        violations.set(
          t.id,
          `${labelForConstraint(ct)} ${cd} overrides a predecessor (link wanted ${linkDrivenStart})`,
        );
      }
    }

    start = nextWorkingDay(cal, start, 1);
    const computedFinish = finishFromStart(cal, start, dur);
    // An FF/SF link can demand a later finish than the duration implies.
    dates.set(t.id, {
      start,
      finish: finish ? maxISO(computedFinish, finish) : computedFinish,
    });
  }

  // ---- Backward pass ------------------------------------------------------
  const successorsOf = new Map<string, { succId: string; type: DepType; lag: number }[]>();
  for (const t of tasks) successorsOf.set(t.id, []);
  for (const t of tasks) {
    for (const d of t.deps) {
      if (!successorsOf.has(d.predId)) continue;
      successorsOf.get(d.predId)!.push({ succId: t.id, type: d.type, lag: d.lag });
    }
  }

  let projectFinish = origin;
  for (const { finish } of dates.values()) projectFinish = maxISO(projectFinish, finish);

  const lateBy = new Map<string, { ls: string; lf: string }>();
  const float = new Map<string, TaskFloat>();

  for (let i = topo.order.length - 1; i >= 0; i--) {
    const t = topo.order[i];
    const self = dates.get(t.id);
    if (!self) continue;
    const dur = Math.max(0, Math.trunc(t.durationWd));

    let lf = projectFinish;
    let lsDirect: string | null = null;

    for (const s of successorsOf.get(t.id) ?? []) {
      const succLate = lateBy.get(s.succId);
      if (!succLate) continue;
      const lag = Number.isFinite(s.lag) ? s.lag : 0;
      switch (s.type) {
        case "fs":
          lf = minISO(lf, addWorkingDays(cal, succLate.ls, -(1 + lag)));
          break;
        case "ss": {
          const cand = addWorkingDays(cal, succLate.ls, -lag);
          lsDirect = lsDirect ? minISO(lsDirect, cand) : cand;
          break;
        }
        case "ff":
          lf = minISO(lf, addWorkingDays(cal, succLate.lf, -lag));
          break;
        case "sf": {
          const cand = addWorkingDays(cal, succLate.lf, 1 - lag);
          lsDirect = lsDirect ? minISO(lsDirect, cand) : cand;
          break;
        }
      }
    }

    let ls = startFromFinish(cal, lf, dur);
    if (lsDirect) ls = minISO(ls, lsDirect);
    lf = finishFromStart(cal, ls, dur);
    lateBy.set(t.id, { ls, lf });

    const totalFloat = signedWorkingDayGap(cal, self.start, ls);

    // Free float: the slack before the *earliest* successor is delayed.
    let freeFloat: number | null = null;
    for (const s of successorsOf.get(t.id) ?? []) {
      const succ = dates.get(s.succId);
      if (!succ) continue;
      const lag = Number.isFinite(s.lag) ? s.lag : 0;
      let gap: number;
      switch (s.type) {
        case "fs":
          gap = signedWorkingDayGap(cal, addWorkingDays(cal, self.finish, 1 + lag), succ.start);
          break;
        case "ss":
          gap = signedWorkingDayGap(cal, addWorkingDays(cal, self.start, lag), succ.start);
          break;
        case "ff":
          gap = signedWorkingDayGap(cal, addWorkingDays(cal, self.finish, lag), succ.finish);
          break;
        case "sf":
          gap = signedWorkingDayGap(cal, addWorkingDays(cal, self.start, -1 + lag), succ.finish);
          break;
      }
      freeFloat = freeFloat === null ? gap : Math.min(freeFloat, gap);
    }

    float.set(t.id, {
      totalFloat,
      freeFloat: freeFloat === null ? totalFloat : Math.max(0, freeFloat),
      critical: totalFloat <= 0,
      lateStart: ls,
      lateFinish: lf,
    });
  }

  return { ok: true, dates, float, violations };
}

/**
 * Working days from `from` to `to`, signed: 0 when equal, positive when `to` is
 * later, negative when earlier. (`workingDaysBetween` is inclusive, so subtract 1.)
 */
function signedWorkingDayGap(cal: WorkCalendar, from: string, to: string): number {
  if (from === to) return 0;
  if (parseISO(to).getTime() > parseISO(from).getTime()) {
    return Math.max(0, workingDaysBetween(cal, from, to) - 1);
  }
  return -Math.max(0, workingDaysBetween(cal, to, from) - 1);
}

export function labelForConstraint(value: string): string {
  const map: Record<string, string> = {
    as_soon_as_possible: "As soon as possible",
    as_late_as_possible: "As late as possible",
    must_start_on: "Must start on",
    must_finish_on: "Must finish on",
    start_no_earlier_than: "Start no earlier than",
    start_no_later_than: "Start no later than",
    finish_no_earlier_than: "Finish no earlier than",
    finish_no_later_than: "Finish no later than",
  };
  return map[value] ?? value.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Dependency-array helpers — the three parallel wbs_tasks arrays are the storage
// format; EngineDep[] is the canonical in-memory shape. Always convert as a set
// so the arrays can never drift out of step.
// ---------------------------------------------------------------------------
export function depsFromArrays(
  ids: string[] | null | undefined,
  types: string[] | null | undefined,
  lags: number[] | null | undefined,
): EngineDep[] {
  const out: EngineDep[] = [];
  for (let i = 0; i < (ids?.length ?? 0); i++) {
    const predId = ids![i];
    if (!predId) continue;
    const raw = (types?.[i] ?? "fs").toLowerCase();
    out.push({
      predId,
      type: isDepType(raw) ? raw : "fs",
      lag: Number(lags?.[i] ?? 0) || 0,
    });
  }
  return out;
}

export function depsToArrays(deps: EngineDep[]): {
  dependency_task_ids: string[];
  dependency_types: string[];
  dependency_lag_days: number[];
} {
  return {
    dependency_task_ids: deps.map((d) => d.predId),
    dependency_types: deps.map((d) => d.type),
    dependency_lag_days: deps.map((d) => d.lag),
  };
}

/** True if adding `predId` as a predecessor of `succId` would close a loop. */
export function wouldCycle(
  predId: string,
  succId: string,
  depsByTask: Map<string, EngineDep[]>,
): boolean {
  if (predId === succId) return true;
  const seen = new Set<string>();
  const stack = [predId];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === succId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const d of depsByTask.get(cur) ?? []) stack.push(d.predId);
  }
  return false;
}
