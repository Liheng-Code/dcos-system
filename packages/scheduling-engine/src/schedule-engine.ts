// MS-Project / P6-style working-day scheduling engine (doc 35 Phase E).
//
// Pure — no I/O, no React. Given a task set, a work calendar and a project start
// date it produces every task's start/finish (forward pass, honouring FS/SS/FF/SF
// links with lag) plus total/free float and the critical path (backward pass).
//
//  * Durations are working days, or calendar days for an `elapsed` task (curing,
//    lead times). A duration of 0 is a milestone (finish = start). An elapsed task
//    can finish on a non-working day; its FS successor starts on the next working day.
//  * Summary (WBS node) rows are never passed in — they roll up in the UI.
//  * Options (all optional; without them results are the same as engine v1):
//      dataDate      progress-aware scheduling: completed tasks keep their actual dates,
//                    in-progress tasks keep their actual start and resume their remaining
//                    duration no earlier than the data date, unstarted work is never
//                    scheduled before the data date (E2).
//      calendars     a calendar per task (EngineTask.calendarId); lag is counted in the
//                    predecessor's calendar unless lagCalendar says otherwise (E3).
//      mustFinishBy  late dates start from this date, so a programme that runs past it has
//                    negative float (E4). "No later than" and "must" constraints also cap
//                    the late dates. They never pull the early dates earlier.
//      completionTaskId  the activity whose longest path is "the" critical path (E5).
//  * The result also carries diagnostics (open ends, dangling and self links), the
//    driving longest path and each separate critical path (E5, E6).

import {
  addCalendarDays,
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
  /** Key into ScheduleOptions.calendars. Absent or unknown = the project calendar. */
  calendarId?: string | null;
  /** Progress; used only when ScheduleOptions.dataDate is set. */
  actualStart?: string | null;
  actualFinish?: string | null;
  /** Remaining duration at the data date, in the task's unit. Absent: from percentComplete, else from the time since the actual start. */
  remainingWd?: number | null;
  /** 0–100. */
  percentComplete?: number | null;
}

export interface ScheduleOptions {
  /** Status date: progress-aware scheduling (see file header). */
  dataDate?: string | null;
  /** Calendars by id, for tasks with a calendarId. */
  calendars?: Map<string, WorkCalendar>;
  /** Which calendar counts a link's lag. Default "predecessor" (as P6). */
  lagCalendar?: "predecessor" | "successor" | "project";
  /** Project must finish by (e.g. contract completion): the late-date anchor. Default: the calculated finish. */
  mustFinishBy?: string | null;
  /** The activity the longest path is traced back from. Default: the latest-finishing activity. */
  completionTaskId?: string | null;
}

export type TaskProgressState = "not_started" | "in_progress" | "complete";

export interface ScheduleDiagnostics {
  /** No predecessor inside the set. */
  openStart: string[];
  /** No successor inside the set. */
  openFinish: string[];
  /** Links to a task that is not in the set (deleted or filtered out); ignored by the passes. */
  danglingLinks: { taskId: string; predId: string }[];
  /** Links from a task to itself; ignored. */
  selfLinks: string[];
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
  /** On the driving path back from the completion activity (ScheduleOptions.completionTaskId). */
  onLongestPath?: boolean;
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
      diagnostics: ScheduleDiagnostics;
      /** Progress state per task (all "not_started" without a data date). */
      state: Map<string, TaskProgressState>;
      /** Activities on the driving path to the completion activity, in date order. */
      longestPath: string[];
      /** Each separate chain of critical activities linked by driving links, most critical first. */
      criticalPaths: string[][];
    }
  | { ok: false; cycle: string[] };

/** Constraints that pull a task later — enforced. */
const HARD_CONSTRAINTS = new Set([
  "start_no_earlier_than",
  "must_start_on",
  "finish_no_earlier_than",
  "must_finish_on",
]);

// "start_no_later_than" / "finish_no_later_than" never pull a task earlier: the
// forward pass flags them when missed, and the backward pass caps the late dates
// with them, so a missed deadline shows as negative float. "as_late_as_possible" is
// approximated post-backward-pass, clamped against real successor dates.

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

  // FIFO with a read index: Array.shift() is O(n) per call, O(n²) on a large network.
  const queue = tasks.filter((t) => (indegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  const order: EngineTask[] = [];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
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
  const seenSet = new Set<string>();
  let cur: string | undefined = remaining[0]?.id;
  while (cur && !seenSet.has(cur)) {
    seen.push(cur);
    seenSet.add(cur);
    cur = byId.get(cur)?.deps.find((d) => inCycle.has(d.predId) && d.predId !== cur)?.predId;
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
  opts: ScheduleOptions = {},
): ScheduleResult {
  const topo = topoOrder(tasks);
  if ("cycle" in topo) return { ok: false, cycle: topo.cycle };

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const calOf = (t: EngineTask | undefined): WorkCalendar =>
    (t?.calendarId ? opts.calendars?.get(t.calendarId) : undefined) ?? cal;
  // The calendar a link's lag is counted in.
  const lagCal = (pred: EngineTask | undefined, succ: EngineTask | undefined): WorkCalendar =>
    opts.lagCalendar === "successor" ? calOf(succ) : opts.lagCalendar === "project" ? cal : calOf(pred);

  const origin = nextWorkingDay(cal, projectStart, 1);
  const unitOf = (t: EngineTask) => (t.elapsed ? "cd" : "wd") as "cd" | "wd";
  const dur = (t: EngineTask) => Math.max(0, Math.trunc(t.durationWd));
  const fin = (t: EngineTask, start: string) => finishInUnit(calOf(t), start, dur(t), unitOf(t));
  const sta = (t: EngineTask, finish: string) => startInUnit(calOf(t), finish, dur(t), unitOf(t));
  const dates = new Map<string, TaskDates>();
  const violations = new Map<string, string>();
  const state = new Map<string, TaskProgressState>();
  const remainingOf = new Map<string, number>();
  const dataDate = opts.dataDate ?? null;
  const later = (a: string, b: string) => parseISO(a).getTime() > parseISO(b).getTime();

  // Remaining duration of a started task at the data date, in the task's unit.
  const remainingFor = (t: EngineTask, dd: string): number => {
    if (t.remainingWd != null && Number.isFinite(t.remainingWd)) return Math.max(0, Math.trunc(t.remainingWd));
    if (t.percentComplete != null && Number.isFinite(t.percentComplete)) {
      const pct = Math.min(100, Math.max(0, t.percentComplete));
      return Math.max(0, Math.round((dur(t) * (100 - pct)) / 100));
    }
    if (!t.actualStart) return dur(t);
    const dayBefore = addCalendarDays(dd, -1);
    const done = later(t.actualStart, dayBefore)
      ? 0
      : t.elapsed ? calendarDaysBetween(t.actualStart, dayBefore) : workingDaysBetween(calOf(t), t.actualStart, dayBefore);
    return Math.max(0, dur(t) - done);
  };

  // ---- Forward pass -------------------------------------------------------
  for (const t of topo.order) {
    const tc = calOf(t);

    if (dataDate && t.actualFinish) {
      // Complete: the actual dates are facts; successors are driven from them.
      const finish = t.actualFinish;
      const start = t.actualStart && !later(t.actualStart, finish) ? t.actualStart : finish;
      dates.set(t.id, { start, finish });
      state.set(t.id, "complete");
      continue;
    }

    if (t.manuallyScheduled) {
      // Pinned: keep the stored dates verbatim; successors still ripple from them.
      const start = t.start ?? origin;
      const finish = t.finish ?? fin(t, start);
      dates.set(t.id, { start, finish });
      state.set(t.id, dataDate && t.actualStart ? "in_progress" : "not_started");
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
      const lc = lagCal(byId.get(d.predId), t);
      const lag = Number.isFinite(d.lag) ? d.lag : 0;
      switch (d.type) {
        case "fs":
          start = maxISO(start, afterFinish(lc, pred.finish, lag));
          break;
        case "ss":
          start = maxISO(start, addWorkingDays(lc, pred.start, lag));
          break;
        case "ff": {
          const candFinish = nextWorkingDay(tc, addWorkingDays(lc, pred.finish, lag), 1);
          finish = finish ? maxISO(finish, candFinish) : candFinish;
          start = maxISO(start, sta(t, candFinish));
          break;
        }
        case "sf": {
          const candFinish = nextWorkingDay(tc, addWorkingDays(lc, pred.start, -1 + lag), 1);
          finish = finish ? maxISO(finish, candFinish) : candFinish;
          start = maxISO(start, sta(t, candFinish));
          break;
        }
      }
    }

    if (dataDate && t.actualStart) {
      // In progress: started on its actual start; the remaining work resumes on the data
      // date at the earliest, and no earlier than its links allow (retained logic).
      const rem = remainingFor(t, dataDate);
      const resume = maxISO(nextWorkingDay(tc, dataDate, 1), nextWorkingDay(tc, start, 1));
      let f = finishInUnit(tc, resume, rem, unitOf(t));
      if (finish) f = maxISO(f, finish);
      if (later(t.actualStart, f)) f = t.actualStart;
      dates.set(t.id, { start: t.actualStart, finish: f });
      state.set(t.id, "in_progress");
      remainingOf.set(t.id, rem);
      continue;
    }

    // Constraints. A "must"/"no earlier than" date wins over the links, but we
    // flag the clash so the planner can see that a predecessor is being ignored.
    const ct = t.constraintType;
    const cd = t.constraintDate;
    if (ct && cd) {
      const linkDrivenStart = start;
      if (ct === "start_no_earlier_than") {
        start = maxISO(start, nextWorkingDay(tc, cd, 1));
      } else if (ct === "must_start_on") {
        start = nextWorkingDay(tc, cd, 1);
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

    start = nextWorkingDay(tc, start, 1);
    if (dataDate) {
      // Work that has not started cannot be scheduled in the past.
      const floor = nextWorkingDay(tc, dataDate, 1);
      if (later(floor, start)) start = floor;
    }
    const computedFinish = fin(t, start);
    // An FF/SF link can demand a later finish than the duration implies.
    const finalFinish = finish ? maxISO(computedFinish, finish) : computedFinish;

    // "No later than" never pulls a task earlier than its links allow: flag it in
    // the forward pass; the backward pass turns it into negative float.
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
    state.set(t.id, "not_started");
  }

  // ---- Backward pass ------------------------------------------------------
  const successorsOf = new Map<string, { succId: string; type: DepType; lag: number }[]>();
  for (const t of tasks) successorsOf.set(t.id, []);
  for (const t of tasks) {
    for (const d of t.deps) {
      if (!successorsOf.has(d.predId) || d.predId === t.id) continue;
      successorsOf.get(d.predId)!.push({ succId: t.id, type: d.type, lag: d.lag });
    }
  }

  let projectFinish = origin;
  for (const { finish } of dates.values()) projectFinish = maxISO(projectFinish, finish);
  const anchor = opts.mustFinishBy ?? projectFinish;

  const lateBy = new Map<string, { ls: string; lf: string }>();
  const float = new Map<string, TaskFloat>();
  // ALAP candidates, applied to `dates` only after this whole pass finishes —
  // mutating `dates` mid-loop would corrupt the float/late-date math other
  // tasks in this same pass still need to read.
  const alapOverrides = new Map<string, TaskDates>();

  // Working-day gap of one link: how far the successor could slip before the link binds.
  const linkGap = (pred: TaskDates, succ: TaskDates, type: DepType, lag: number, lc: WorkCalendar, sc: WorkCalendar): number => {
    switch (type) {
      case "fs":
        return signedWorkingDayGap(sc, afterFinish(lc, pred.finish, lag), succ.start);
      case "ss":
        return signedWorkingDayGap(sc, addWorkingDays(lc, pred.start, lag), succ.start);
      case "ff":
        return signedWorkingDayGap(sc, addWorkingDays(lc, pred.finish, lag), succ.finish);
      case "sf":
        return signedWorkingDayGap(sc, addWorkingDays(lc, pred.start, -1 + lag), succ.finish);
    }
  };

  for (let i = topo.order.length - 1; i >= 0; i--) {
    const t = topo.order[i];
    const self = dates.get(t.id);
    if (!self) continue;
    const tc = calOf(t);
    const st = state.get(t.id);

    if (st === "complete") {
      // Done work has no float and does not constrain anything.
      lateBy.set(t.id, { ls: self.start, lf: self.finish });
      float.set(t.id, {
        totalFloat: 0, freeFloat: 0, critical: false, nearCritical: false,
        lateStart: self.start, lateFinish: self.finish,
      });
      continue;
    }

    let lf = anchor;
    let lsDirect: string | null = null;

    for (const s of successorsOf.get(t.id) ?? []) {
      if (state.get(s.succId) === "complete") continue;
      const succLate = lateBy.get(s.succId);
      if (!succLate) continue;
      const lc = lagCal(t, byId.get(s.succId));
      const lag = Number.isFinite(s.lag) ? s.lag : 0;
      switch (s.type) {
        case "fs":
          lf = minISO(lf, addWorkingDays(lc, succLate.ls, -(1 + lag)));
          break;
        case "ss": {
          const cand = addWorkingDays(lc, succLate.ls, -lag);
          lsDirect = lsDirect ? minISO(lsDirect, cand) : cand;
          break;
        }
        case "ff":
          lf = minISO(lf, addWorkingDays(lc, succLate.lf, -lag));
          break;
        case "sf": {
          const cand = addWorkingDays(lc, succLate.lf, 1 - lag);
          lsDirect = lsDirect ? minISO(lsDirect, cand) : cand;
          break;
        }
      }
    }

    // Deadlines cap the late dates (negative float when missed).
    const ct = t.constraintType;
    const cd = t.constraintDate;
    if (cd && (ct === "finish_no_later_than" || ct === "must_finish_on")) {
      lf = minISO(lf, nextWorkingDay(tc, cd, -1));
    }

    let ls: string;
    let totalFloat: number;
    if (st === "in_progress") {
      // Float of the remaining work: how late it can finish.
      const rem = remainingOf.get(t.id) ?? 0;
      ls = startInUnit(tc, lf, rem, unitOf(t));
      if (lsDirect && later(ls, lsDirect)) {
        ls = lsDirect;
        lf = finishInUnit(tc, ls, rem, unitOf(t));
      }
      lateBy.set(t.id, { ls, lf });
      totalFloat = signedWorkingDayGap(tc, self.finish, lf);
    } else {
      ls = sta(t, lf);
      if (lsDirect) ls = minISO(ls, lsDirect);
      if (cd && (ct === "start_no_later_than" || ct === "must_start_on")) {
        ls = minISO(ls, nextWorkingDay(tc, cd, -1));
      }
      lf = fin(t, ls);
      lateBy.set(t.id, { ls, lf });
      totalFloat = signedWorkingDayGap(tc, self.start, ls);
    }

    // Free float: the slack before the *earliest* successor is delayed.
    let freeFloat: number | null = null;
    for (const s of successorsOf.get(t.id) ?? []) {
      const succ = dates.get(s.succId);
      if (!succ || state.get(s.succId) === "complete") continue;
      const lag = Number.isFinite(s.lag) ? s.lag : 0;
      const gap = linkGap(self, succ, s.type, lag, lagCal(t, byId.get(s.succId)), calOf(byId.get(s.succId)));
      freeFloat = freeFloat === null ? gap : Math.min(freeFloat, gap);
    }

    float.set(t.id, {
      totalFloat,
      freeFloat: freeFloat === null ? totalFloat : Math.max(0, freeFloat),
      critical: totalFloat <= thresholds.critical,
      nearCritical: totalFloat > thresholds.critical && totalFloat <= thresholds.nearCritical,
      lateStart: st === "in_progress" ? self.start : ls,
      lateFinish: lf,
    });

    // ALAP approximation: a task with slack should sit at the end of its float
    // window rather than the start. `ls`/`lf` are the standard CPM late dates,
    // already bounded network-wide by every successor's own late-date budget,
    // so moving here can never push another task's float negative. Critical
    // tasks (totalFloat <= 0) have no room to move.
    if (t.constraintType === "as_late_as_possible" && totalFloat > 0 && st === "not_started") {
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
  {
    for (const t of topo.order) {
      // A "must" date wins over the links (flagged in the forward pass); v1 let this sweep undo it.
      if (t.manuallyScheduled || state.get(t.id) !== "not_started") continue;
      if (t.constraintType === "must_start_on" || t.constraintType === "must_finish_on") continue;
      const self = dates.get(t.id);
      if (!self) continue;
      const tc = calOf(t);
      let start = self.start;
      let finish: string | null = null;
      for (const d of t.deps) {
        const pred = dates.get(d.predId);
        if (!pred) continue;
        const lc = lagCal(byId.get(d.predId), t);
        const lag = Number.isFinite(d.lag) ? d.lag : 0;
        let candStart = start;
        switch (d.type) {
          case "fs":
            candStart = afterFinish(lc, pred.finish, lag);
            break;
          case "ss":
            candStart = addWorkingDays(lc, pred.start, lag);
            break;
          case "ff": {
            const cf = nextWorkingDay(tc, addWorkingDays(lc, pred.finish, lag), 1);
            finish = finish ? maxISO(finish, cf) : cf;
            candStart = sta(t, cf);
            break;
          }
          case "sf": {
            const cf = nextWorkingDay(tc, addWorkingDays(lc, pred.start, -1 + lag), 1);
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
      start = nextWorkingDay(tc, start, 1);
      const computedFinish = fin(t, start);
      const finalFinish = finish ? maxISO(computedFinish, finish) : computedFinish;
      if (parseISO(start).getTime() > parseISO(self.start).getTime()) {
        dates.set(t.id, { start, finish: finalFinish });
      }
    }
  }

  // ---- Driving links, longest path, critical paths (E5) --------------------
  // A link is driving when its successor sits exactly where the link puts it (zero gap).
  const drivingPreds = new Map<string, string[]>();
  for (const t of tasks) {
    const self = dates.get(t.id);
    if (!self || state.get(t.id) === "complete") continue;
    const list: string[] = [];
    for (const d of t.deps) {
      const pred = dates.get(d.predId);
      if (!pred || d.predId === t.id) continue;
      const lag = Number.isFinite(d.lag) ? d.lag : 0;
      if (linkGap(pred, self, d.type, lag, lagCal(byId.get(d.predId), t), calOf(t)) <= 0) list.push(d.predId);
    }
    drivingPreds.set(t.id, list);
  }
  const byDate = (a: string, b: string) => {
    const da = dates.get(a)!;
    const db = dates.get(b)!;
    return da.start === db.start ? (da.finish === db.finish ? (a < b ? -1 : a > b ? 1 : 0) : da.finish < db.finish ? -1 : 1) : da.start < db.start ? -1 : 1;
  };

  let completion: string | null = opts.completionTaskId && dates.has(opts.completionTaskId) ? opts.completionTaskId : null;
  if (!completion) {
    // Latest finish; on a tie prefer an open end, then a milestone, then the id (a real completion milestone).
    const rank = (id: string) => [
      (successorsOf.get(id)?.length ?? 0) === 0 ? 0 : 1,
      Math.trunc(byId.get(id)?.durationWd ?? 1) === 0 ? 0 : 1,
    ];
    for (const [id, d] of dates) {
      if (state.get(id) === "complete") continue;
      if (!completion) { completion = id; continue; }
      const c = dates.get(completion)!;
      if (d.finish !== c.finish) {
        if (d.finish > c.finish) completion = id;
        continue;
      }
      const [ra, rb] = [rank(id), rank(completion)];
      if (ra[0] < rb[0] || (ra[0] === rb[0] && (ra[1] < rb[1] || (ra[1] === rb[1] && id < completion)))) completion = id;
    }
  }
  const onPath = new Set<string>();
  if (completion) {
    const stack = [completion];
    while (stack.length) {
      const id = stack.pop() as string;
      if (onPath.has(id)) continue;
      onPath.add(id);
      for (const p of drivingPreds.get(id) ?? []) stack.push(p);
    }
  }
  const longestPath = [...onPath].sort(byDate);
  for (const id of onPath) {
    const f = float.get(id);
    if (f) f.onLongestPath = true;
  }

  const criticalIds = [...float.entries()].filter(([, f]) => f.critical).map(([id]) => id);
  const criticalSet = new Set(criticalIds);
  const neighbours = new Map<string, string[]>();
  for (const id of criticalIds) neighbours.set(id, []);
  for (const [succ, preds] of drivingPreds) {
    if (!criticalSet.has(succ)) continue;
    for (const p of preds) {
      if (!criticalSet.has(p)) continue;
      neighbours.get(succ)!.push(p);
      neighbours.get(p)!.push(succ);
    }
  }
  const seen = new Set<string>();
  const criticalPaths: string[][] = [];
  for (const id of [...criticalIds].sort(byDate)) {
    if (seen.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop() as string;
      if (seen.has(cur)) continue;
      seen.add(cur);
      comp.push(cur);
      for (const n of neighbours.get(cur) ?? []) stack.push(n);
    }
    criticalPaths.push(comp.sort(byDate));
  }
  const minFloat = (p: string[]) => Math.min(...p.map((id) => float.get(id)!.totalFloat));
  const lastFinish = (p: string[]) => p.reduce((m, id) => (dates.get(id)!.finish > m ? dates.get(id)!.finish : m), "");
  criticalPaths.sort((a, b) => minFloat(a) - minFloat(b) || (lastFinish(a) > lastFinish(b) ? -1 : lastFinish(a) < lastFinish(b) ? 1 : 0));

  return {
    ok: true, dates, float, violations,
    diagnostics: scheduleDiagnostics(tasks),
    state, longestPath, criticalPaths,
  };
}

/** Open ends and broken links (E6). Pure; scheduleProject returns the same result. */
export function scheduleDiagnostics(tasks: EngineTask[]): ScheduleDiagnostics {
  const ids = new Set(tasks.map((t) => t.id));
  const hasSucc = new Set<string>();
  const openStart: string[] = [];
  const danglingLinks: { taskId: string; predId: string }[] = [];
  const selfLinks: string[] = [];
  for (const t of tasks) {
    let hasPred = false;
    for (const d of t.deps) {
      if (d.predId === t.id) selfLinks.push(t.id);
      else if (!ids.has(d.predId)) danglingLinks.push({ taskId: t.id, predId: d.predId });
      else {
        hasPred = true;
        hasSucc.add(d.predId);
      }
    }
    if (!hasPred) openStart.push(t.id);
  }
  const openFinish = tasks.filter((t) => !hasSucc.has(t.id)).map((t) => t.id);
  return { openStart: openStart.sort(), openFinish: openFinish.sort(), danglingLinks, selfLinks: [...new Set(selfLinks)].sort() };
}

/**
 * Working-day variance of each task against a baseline (positive = later than the baseline).
 * Tasks missing from either side are left out.
 */
export function baselineVariance(
  cal: WorkCalendar,
  current: Map<string, TaskDates>,
  baseline: Map<string, TaskDates>,
): Map<string, { startVariance: number; finishVariance: number }> {
  const out = new Map<string, { startVariance: number; finishVariance: number }>();
  for (const [id, cur] of current) {
    const base = baseline.get(id);
    if (!base) continue;
    out.set(id, {
      startVariance: signedWorkingDayGap(cal, base.start, cur.start),
      finishVariance: signedWorkingDayGap(cal, base.finish, cur.finish),
    });
  }
  return out;
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
