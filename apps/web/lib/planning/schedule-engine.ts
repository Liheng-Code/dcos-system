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
//  * Durations are working days, or calendar days for an `elapsed` task (curing,
//    lead times). A duration of 0 is a milestone (finish = start). An elapsed task
//    can finish on a non-working day; its FS successor starts on the next working day.
//  * Summary (WBS node) rows are never passed in — they roll up in the UI.

import {
  addWorkingDays,
  calendarDaysBetween,
  finishInUnit,
  isWorkingDay,
  maxISO,
  minISO,
  nextWorkingDay,
  parseISO,
  startInUnit,
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
  /** Working days (calendar days when `elapsed`). 0 = milestone. */
  durationWd: number;
  /** Duration counts calendar days instead of working days. */
  elapsed?: boolean;
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
  /** Float > the critical threshold but within the near-critical warning band. */
  nearCritical: boolean;
  lateStart: string;
  lateFinish: string;
}

/** A task is "critical" when totalFloat <= critical, "near-critical" when it's above that but <= nearCritical. */
export interface FloatThresholds {
  critical: number;
  nearCritical: number;
}

export const DEFAULT_FLOAT_THRESHOLDS: FloatThresholds = { critical: 0, nearCritical: 5 };

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

// "start_no_later_than" / "finish_no_later_than" and "as_late_as_possible"
// would need negative-float levelling to fully enforce (see file header) — they
// are handled separately below: the "no later than" pair is checked against the
// dates the engine actually produced (only flagged when genuinely missed), and
// ALAP is approximated post-backward-pass, clamped against real successor dates.

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
  thresholds: FloatThresholds = DEFAULT_FLOAT_THRESHOLDS,
): ScheduleResult {
  const topo = topoOrder(tasks);
  if ("cycle" in topo) return { ok: false, cycle: topo.cycle };

  const origin = nextWorkingDay(cal, projectStart, 1);
  const unitOf = (t: EngineTask) => (t.elapsed ? "cd" : "wd") as "cd" | "wd";
  const fin = (t: EngineTask, start: string) => finishInUnit(cal, start, Math.max(0, Math.trunc(t.durationWd)), unitOf(t));
  const sta = (t: EngineTask, finish: string) => startInUnit(cal, finish, Math.max(0, Math.trunc(t.durationWd)), unitOf(t));
  const dates = new Map<string, TaskDates>();
  const violations = new Map<string, string>();

  // ---- Forward pass -------------------------------------------------------
  for (const t of topo.order) {

    if (t.manuallyScheduled) {
      // Pinned: keep the stored dates verbatim; successors still ripple from them.
      const start = t.start ?? origin;
      const finish = t.finish ?? fin(t, start);
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
          start = maxISO(start, afterFinish(cal, pred.finish, lag));
          break;
        case "ss":
          start = maxISO(start, addWorkingDays(cal, pred.start, lag));
          break;
        case "ff": {
          const candFinish = addWorkingDays(cal, pred.finish, lag);
          finish = finish ? maxISO(finish, candFinish) : candFinish;
          start = maxISO(start, sta(t, candFinish));
          break;
        }
        case "sf": {
          const candFinish = addWorkingDays(cal, pred.start, -1 + lag);
          finish = finish ? maxISO(finish, candFinish) : candFinish;
          start = maxISO(start, sta(t, candFinish));
          break;
        }
      }
    }

    // Constraints. A "must"/"no earlier than" date wins over the links, but we
    // flag the clash so the planner can see that a predecessor is being ignored.
    const ct = t.constraintType;
    const cd = t.constraintDate;
    if (ct && cd) {
      const linkDrivenStart = start;
      if (ct === "start_no_earlier_than") {
        start = maxISO(start, nextWorkingDay(cal, cd, 1));
      } else if (ct === "must_start_on") {
        start = nextWorkingDay(cal, cd, 1);
      } else if (ct === "finish_no_earlier_than") {
        start = maxISO(start, sta(t, cd));
      } else if (ct === "must_finish_on") {
        start = sta(t, cd);
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
    const computedFinish = fin(t, start);
    // An FF/SF link can demand a later finish than the duration implies.
    const finalFinish = finish ? maxISO(computedFinish, finish) : computedFinish;

    // "No later than" can't be pulled earlier than the links allow (that needs
    // negative-float levelling), so only flag it when the deadline is actually
    // missed rather than reflexively warning on every task that has one set.
    if (ct === "start_no_later_than" && cd && parseISO(start).getTime() > parseISO(cd).getTime()) {
      violations.set(
        t.id,
        `${labelForConstraint(ct)} ${cd} missed — predecessors push start to ${start}`,
      );
    } else if (
      ct === "finish_no_later_than" &&
      cd &&
      parseISO(finalFinish).getTime() > parseISO(cd).getTime()
    ) {
      violations.set(
        t.id,
        `${labelForConstraint(ct)} ${cd} missed — predecessors push finish to ${finalFinish}`,
      );
    }

    dates.set(t.id, { start, finish: finalFinish });
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
  // ALAP candidates, applied to `dates` only after this whole pass finishes —
  // mutating `dates` mid-loop would corrupt the float/late-date math other
  // tasks in this same pass still need to read.
  const alapOverrides = new Map<string, TaskDates>();

  for (let i = topo.order.length - 1; i >= 0; i--) {
    const t = topo.order[i];
    const self = dates.get(t.id);
    if (!self) continue;

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

    let ls = sta(t, lf);
    if (lsDirect) ls = minISO(ls, lsDirect);
    lf = fin(t, ls);
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
          gap = signedWorkingDayGap(cal, afterFinish(cal, self.finish, lag), succ.start);
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
      critical: totalFloat <= thresholds.critical,
      nearCritical: totalFloat > thresholds.critical && totalFloat <= thresholds.nearCritical,
      lateStart: ls,
      lateFinish: lf,
    });

    // ALAP approximation: a task with slack should sit at the end of its float
    // window rather than the start. `ls`/`lf` are the standard CPM late dates,
    // already bounded network-wide by every successor's own late-date budget,
    // so moving here can never push another task's float negative. Critical
    // tasks (totalFloat <= 0) have no room to move.
    if (t.constraintType === "as_late_as_possible" && totalFloat > 0) {
      alapOverrides.set(t.id, { start: ls, finish: lf });
    }
  }

  for (const [id, d] of alapOverrides) dates.set(id, d);

  // Cascade: a linked task can't start before its predecessor finishes, so an
  // ALAP task that moved later must carry along any successor whose position
  // was purely driven by it. Capped at each successor's own late-date budget
  // (`lateBy`, already computed above and unaffected by this cascade — late
  // dates come from the successor side of the network, not the predecessor's
  // actual position), so no task is ever pushed past what its own float
  // allows. A single forward sweep suffices: `topo.order` is topologically
  // sorted, so every task sees its predecessors' final (possibly cascaded)
  // dates before it is evaluated itself.
  for (const t of topo.order) {
    if (t.manuallyScheduled) continue;
    const self = dates.get(t.id);
    if (!self) continue;
    let start = self.start;
    let finish: string | null = null;
    for (const d of t.deps) {
      const pred = dates.get(d.predId);
      if (!pred) continue;
      const lag = Number.isFinite(d.lag) ? d.lag : 0;
      let candStart = start;
      switch (d.type) {
        case "fs":
          candStart = afterFinish(cal, pred.finish, lag);
          break;
        case "ss":
          candStart = addWorkingDays(cal, pred.start, lag);
          break;
        case "ff": {
          const cf = addWorkingDays(cal, pred.finish, lag);
          finish = finish ? maxISO(finish, cf) : cf;
          candStart = sta(t, cf);
          break;
        }
        case "sf": {
          const cf = addWorkingDays(cal, pred.start, -1 + lag);
          finish = finish ? maxISO(finish, cf) : cf;
          candStart = sta(t, cf);
          break;
        }
      }
      if (parseISO(candStart).getTime() > parseISO(start).getTime()) start = candStart;
    }
    if (start === self.start) continue;
    const late = lateBy.get(t.id);
    if (late && parseISO(start).getTime() > parseISO(late.ls).getTime()) start = late.ls;
    start = nextWorkingDay(cal, start, 1);
    const computedFinish = fin(t, start);
    const finalFinish = finish ? maxISO(computedFinish, finish) : computedFinish;
    if (parseISO(start).getTime() > parseISO(self.start).getTime()) {
      dates.set(t.id, { start, finish: finalFinish });
    }
  }

  return { ok: true, dates, float, violations };
}

/** The latest finish date across every task — the project's overall finish. Null for an empty schedule. */
export function projectFinish(dates: Map<string, TaskDates>): string | null {
  let finish: string | null = null;
  for (const d of dates.values()) {
    if (finish === null || d.finish > finish) finish = d.finish;
  }
  return finish;
}

/**
 * Working days from `from` to `to`, signed: 0 when equal, positive when `to` is
 * later, negative when earlier. (`workingDaysBetween` is inclusive, so subtract 1.)
 */
export function signedWorkingDayGap(cal: WorkCalendar, from: string, to: string): number {
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

/**
 * First working day a Finish-to-Start successor may start, `lag` working days after
 * `finish`. A finish on a non-working day (calendar-day tasks) counts as ending
 * before the next working day.
 */
export function afterFinish(cal: WorkCalendar, finish: string, lag: number): string {
  return isWorkingDay(cal, finish) ? addWorkingDays(cal, finish, 1 + lag) : addWorkingDays(cal, finish, lag);
}

/** The fields a task row carries that decide its schedule duration. */
export interface DurationFields {
  start: string | null;
  finish: string | null;
  isMilestone?: boolean | null;
  /** Stored duration — used when the task has no dates yet (e.g. straight after a template). */
  durationDays?: number | string | null;
  /** "wd" (working days, default) | "cd" (calendar days). */
  unit?: string | null;
}

/**
 * The duration the engine schedules a task with. Dates win when both are set (the DB
 * keeps duration_days in step with them); otherwise the stored duration; otherwise 1.
 */
export function engineDuration(cal: WorkCalendar, f: DurationFields): { durationWd: number; elapsed: boolean } {
  const elapsed = f.unit === "cd";
  if (f.isMilestone) return { durationWd: 0, elapsed };
  if (f.start && f.finish) {
    const n = elapsed ? calendarDaysBetween(f.start, f.finish) : workingDaysBetween(cal, f.start, f.finish);
    return { durationWd: Math.max(1, n), elapsed };
  }
  const stored = Number(f.durationDays);
  if (f.durationDays != null && f.durationDays !== "" && Number.isFinite(stored) && stored >= 0) {
    return { durationWd: Math.round(stored), elapsed };
  }
  return { durationWd: 1, elapsed };
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
