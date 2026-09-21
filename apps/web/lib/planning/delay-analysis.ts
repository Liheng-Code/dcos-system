// Schedule delay analysis — As-Planned vs As-Built cause-and-effect.
//
// Pure (no I/O, no React). Given the project's tasks + work calendar it runs the
// CPM engine on the live and baseline date sets, ranks the activities that have
// slipped, and — for a chosen activity — traces the driving-predecessor chain
// back to the root cause and every downstream activity the delay pushes.
//
// NOT the full Time Impact Analysis engine (fragnets, scenarios, EOT workflow):
// this is a lightweight client-side trace built on the existing schedule engine.

import {
  depsFromArrays,
  labelForConstraint,
  scheduleProject,
  signedWorkingDayGap,
  type DepType,
  type EngineTask,
  type TaskDates,
  type TaskFloat,
} from "./schedule-engine";
import {
  addWorkingDays,
  parseISO,
  startFromFinish,
  workingDaysBetween,
  type WorkCalendar,
} from "./work-calendar";

const DAY_MS = 86_400_000;

const HARD_CONSTRAINT = new Set([
  "start_no_earlier_than",
  "must_start_on",
  "finish_no_earlier_than",
  "must_finish_on",
]);

/** Minimal task shape the analysis needs. `baseline_*` come from the chosen source. */
export interface DelayTask {
  id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  start_date: string | null;
  end_date: string | null;
  baseline_start: string | null;
  baseline_finish: string | null;
  progress: number;
  is_milestone: boolean;
  manually_scheduled: boolean;
  constraint_type: string | null;
  constraint_date: string | null;
  dependency_task_ids: string[];
  dependency_types: string[];
  dependency_lag_days: number[];
  delay_reason: string | null;
  field_observation_notes: string | null;
}

export interface DelayRow {
  id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  baselineFinish: string | null;
  liveFinish: string | null;
  startSlipWd: number;
  finishSlipWd: number;
  totalFloatWd: number;
  freeFloatWd: number;
  critical: boolean;
  becameCritical: boolean;
  floatConsumedWd: number;
  drivingPredId: string | null;
  predSlippedCount: number;
  predCount: number;
  impactedCount: number;
  hitsProjectFinish: boolean;
}

export interface CauseHop {
  taskId: string;
  task_code: string;
  task_name: string;
  /** Link from this hop to the next one toward the delayed activity. */
  linkType: DepType | null;
  lag: number | null;
  finishSlipWd: number;
  totalFloatWd: number;
  isRoot: boolean;
  rootReason: string | null;
}

export interface ImpactNode {
  taskId: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  pushedWd: number;
  nowCritical: boolean;
  depth: number;
}

export interface DelayAnalysis {
  rows: DelayRow[];
  projectFinishBaseline: string | null;
  projectFinishLive: string | null;
  projectSlipWd: number;
  ok: boolean;
  cycle?: string[];
  /** Precomputed graph + CPM context — pass to `traceCause` / `traceImpact`. */
  ctx: DelayContext | null;
}

export interface DelayContext {
  byId: Map<string, DelayTask>;
  cal: WorkCalendar;
  liveDates: Map<string, TaskDates>;
  liveFloat: Map<string, TaskFloat>;
  baseFloat: Map<string, TaskFloat>;
  depsByTask: Map<string, ReturnType<typeof depsFromArrays>>;
  successorsOf: Map<string, { succId: string; type: DepType; lag: number }[]>;
  drivingPredById: Map<string, string | null>;
}

// ---------------------------------------------------------------------------

function toEngineTasks(
  tasks: DelayTask[],
  cal: WorkCalendar,
  which: "live" | "baseline",
): EngineTask[] {
  return tasks.map((t) => {
    const start = which === "live" ? t.start_date : t.baseline_start;
    const finish = which === "live" ? t.end_date : t.baseline_finish;
    let durationWd = 1;
    if (t.is_milestone) durationWd = 0;
    else if (start && finish) durationWd = Math.max(1, workingDaysBetween(cal, start, finish));
    return {
      id: t.id,
      start,
      finish,
      durationWd,
      manuallyScheduled: t.manually_scheduled,
      constraintType: t.constraint_type,
      constraintDate: t.constraint_date,
      deps: depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
    };
  });
}

function maxISO(values: (string | null | undefined)[]): string | null {
  let m: string | null = null;
  for (const v of values) if (v && (m === null || v > m)) m = v;
  return m;
}

function taskDurationWd(t: DelayTask, cal: WorkCalendar, dates: TaskDates | undefined): number {
  if (t.is_milestone) return 0;
  if (dates) return Math.max(1, workingDaysBetween(cal, dates.start, dates.finish));
  if (t.start_date && t.end_date) return Math.max(1, workingDaysBetween(cal, t.start_date, t.end_date));
  return 1;
}

/** The predecessor whose link constraint produces this task's live start, or null. */
function computeDrivingPred(taskId: string, ctx: DelayContext): string | null {
  const self = ctx.liveDates.get(taskId);
  const task = ctx.byId.get(taskId);
  if (!self || !task) return null;
  const dur = taskDurationWd(task, ctx.cal, self);

  let best: { predId: string; imposed: string } | null = null;
  for (const d of ctx.depsByTask.get(taskId) ?? []) {
    const pred = ctx.liveDates.get(d.predId);
    if (!pred) continue;
    const lag = Number.isFinite(d.lag) ? d.lag : 0;
    let imposed: string;
    switch (d.type) {
      case "fs":
        imposed = addWorkingDays(ctx.cal, pred.finish, 1 + lag);
        break;
      case "ss":
        imposed = addWorkingDays(ctx.cal, pred.start, lag);
        break;
      case "ff":
        imposed = startFromFinish(ctx.cal, addWorkingDays(ctx.cal, pred.finish, lag), dur);
        break;
      case "sf":
        imposed = startFromFinish(ctx.cal, addWorkingDays(ctx.cal, pred.start, -1 + lag), dur);
        break;
    }
    if (!best || parseISO(imposed).getTime() > parseISO(best.imposed).getTime()) {
      best = { predId: d.predId, imposed };
    }
  }
  if (!best) return null;
  // Only a driver if it actually determines the start — a hard constraint or a
  // late self-start would put `self.start` well after any predecessor's demand.
  const drift = parseISO(self.start).getTime() - parseISO(best.imposed).getTime();
  return drift <= 3 * DAY_MS ? best.predId : null;
}

function buildContext(
  tasks: DelayTask[],
  cal: WorkCalendar,
  liveDates: Map<string, TaskDates>,
  liveFloat: Map<string, TaskFloat>,
  baseFloat: Map<string, TaskFloat>,
): DelayContext {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depsByTask = new Map<string, ReturnType<typeof depsFromArrays>>();
  const successorsOf = new Map<string, { succId: string; type: DepType; lag: number }[]>();
  for (const t of tasks) {
    successorsOf.set(t.id, []);
    depsByTask.set(
      t.id,
      depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
    );
  }
  for (const t of tasks) {
    for (const d of depsByTask.get(t.id) ?? []) {
      if (!successorsOf.has(d.predId)) continue;
      successorsOf.get(d.predId)!.push({ succId: t.id, type: d.type, lag: d.lag });
    }
  }
  const ctx: DelayContext = {
    byId,
    cal,
    liveDates,
    liveFloat,
    baseFloat,
    depsByTask,
    successorsOf,
    drivingPredById: new Map(),
  };
  for (const t of tasks) ctx.drivingPredById.set(t.id, computeDrivingPred(t.id, ctx));
  return ctx;
}

function finishSlipOf(t: DelayTask, cal: WorkCalendar): number {
  return t.baseline_finish && t.end_date
    ? signedWorkingDayGap(cal, t.baseline_finish, t.end_date)
    : 0;
}
function startSlipOf(t: DelayTask, cal: WorkCalendar): number {
  return t.baseline_start && t.start_date
    ? signedWorkingDayGap(cal, t.baseline_start, t.start_date)
    : 0;
}
function durationSlipOf(t: DelayTask, cal: WorkCalendar): number {
  if (!t.baseline_start || !t.baseline_finish || !t.start_date || !t.end_date) return 0;
  return (
    workingDaysBetween(cal, t.start_date, t.end_date) -
    workingDaysBetween(cal, t.baseline_start, t.baseline_finish)
  );
}

/** True when this hop's slip started here rather than being inherited from `driverId`. */
function isLocalRoot(curId: string, driverId: string, ctx: DelayContext): boolean {
  const cur = ctx.byId.get(curId);
  if (!cur) return true;
  if (cur.manually_scheduled) return true;
  if (cur.constraint_type && HARD_CONSTRAINT.has(cur.constraint_type) && cur.constraint_date) {
    return true;
  }
  const driver = ctx.byId.get(driverId);
  const driverSlip = driver ? finishSlipOf(driver, ctx.cal) : 0;
  return driverSlip <= 0;
}

function rootReason(id: string, ctx: DelayContext): string {
  const t = ctx.byId.get(id);
  if (!t) return "slipped locally";
  if (t.manually_scheduled) return "manually scheduled to a later date";
  if (t.constraint_type && HARD_CONSTRAINT.has(t.constraint_type) && t.constraint_date) {
    return `${labelForConstraint(t.constraint_type)} ${t.constraint_date}`;
  }
  if ((ctx.depsByTask.get(id) ?? []).length === 0) return "no predecessors — slipped locally";
  const startSlip = startSlipOf(t, ctx.cal);
  if (startSlip > 0) return `started ${startSlip}d later than baseline`;
  const durSlip = durationSlipOf(t, ctx.cal);
  if (durSlip > 0) return `ran ${durSlip}d longer than baseline duration`;
  return "slipped locally";
}

// ---------------------------------------------------------------------------

export function analyzeDelays(
  tasks: DelayTask[],
  cal: WorkCalendar,
  projectStart: string,
): DelayAnalysis {
  const live = scheduleProject(toEngineTasks(tasks, cal, "live"), cal, projectStart);
  if (!live.ok) {
    return {
      rows: [],
      projectFinishBaseline: null,
      projectFinishLive: null,
      projectSlipWd: 0,
      ok: false,
      cycle: live.cycle,
      ctx: null,
    };
  }

  const withBaseline = tasks.filter((t) => t.baseline_start && t.baseline_finish);
  const base = scheduleProject(toEngineTasks(withBaseline, cal, "baseline"), cal, projectStart);
  const baseFloat = base.ok ? base.float : new Map<string, TaskFloat>();
  const baseDates = base.ok ? base.dates : new Map<string, TaskDates>();

  const projectFinishLive = maxISO([...live.dates.values()].map((d) => d.finish));
  const projectFinishBaseline = maxISO([...baseDates.values()].map((d) => d.finish));
  const projectSlipWd =
    projectFinishBaseline && projectFinishLive
      ? signedWorkingDayGap(cal, projectFinishBaseline, projectFinishLive)
      : 0;

  const ctx = buildContext(tasks, cal, live.dates, live.float, baseFloat);

  const rows: DelayRow[] = [];
  for (const t of tasks) {
    if (!t.baseline_finish || !t.end_date) continue;
    const finishSlipWd = finishSlipOf(t, cal);
    if (finishSlipWd <= 0) continue;

    const lf = live.float.get(t.id);
    const bf = baseFloat.get(t.id);
    const totalFloatWd = lf?.totalFloat ?? 0;
    const critical = lf?.critical ?? false;
    const deps = ctx.depsByTask.get(t.id) ?? [];
    const predSlippedCount = deps.filter((d) => {
      const p = ctx.byId.get(d.predId);
      return p ? finishSlipOf(p, cal) > 0 : false;
    }).length;

    rows.push({
      id: t.id,
      task_code: t.task_code,
      task_name: t.task_name,
      discipline: t.discipline,
      baselineFinish: t.baseline_finish,
      liveFinish: t.end_date,
      startSlipWd: startSlipOf(t, cal),
      finishSlipWd,
      totalFloatWd,
      freeFloatWd: lf?.freeFloat ?? 0,
      critical,
      becameCritical: critical && !(bf?.critical ?? false),
      floatConsumedWd: (bf?.totalFloat ?? totalFloatWd) - totalFloatWd,
      drivingPredId: ctx.drivingPredById.get(t.id) ?? null,
      predSlippedCount,
      predCount: deps.length,
      impactedCount: traceImpact(t.id, ctx).length,
      hitsProjectFinish: critical,
    });
  }
  rows.sort(
    (a, b) => b.finishSlipWd - a.finishSlipWd || Number(b.critical) - Number(a.critical),
  );

  return { rows, projectFinishBaseline, projectFinishLive, projectSlipWd, ok: true, ctx };
}

/** Driving-predecessor chain from the root cause down to `selectedId`. */
export function traceCause(selectedId: string, ctx: DelayContext): CauseHop[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = selectedId;
  while (cur && !seen.has(cur)) {
    const here: string = cur;
    seen.add(here);
    chain.push(here);
    const driver: string | null = ctx.drivingPredById.get(here) ?? null;
    if (!driver || isLocalRoot(here, driver, ctx)) break;
    cur = driver;
  }
  chain.reverse(); // [root, …, selected]

  return chain.map((id, i) => {
    const t = ctx.byId.get(id)!;
    const childId = chain[i + 1]; // the hop this one drives, toward the selected activity
    const dep = childId
      ? (ctx.depsByTask.get(childId) ?? []).find((d) => d.predId === id)
      : undefined;
    return {
      taskId: id,
      task_code: t.task_code,
      task_name: t.task_name,
      linkType: dep?.type ?? null,
      lag: dep ? (Number.isFinite(dep.lag) ? dep.lag : 0) : null,
      finishSlipWd: finishSlipOf(t, ctx.cal),
      totalFloatWd: ctx.liveFloat.get(id)?.totalFloat ?? 0,
      isRoot: i === 0,
      rootReason: i === 0 ? rootReason(id, ctx) : null,
    };
  });
}

/** Every downstream activity driven later by the delay at `taskId`. */
export function traceImpact(taskId: string, ctx: DelayContext): ImpactNode[] {
  const out: ImpactNode[] = [];
  const seen = new Set<string>([taskId]);
  const queue: { id: string; depth: number }[] = [{ id: taskId, depth: 0 }];
  while (queue.length) {
    const { id, depth } = queue.shift()!;
    for (const s of ctx.successorsOf.get(id) ?? []) {
      if (seen.has(s.succId)) continue;
      if (ctx.drivingPredById.get(s.succId) !== id) continue;
      const st = ctx.byId.get(s.succId);
      if (!st || !st.baseline_finish || !st.end_date) continue;
      const pushedWd = signedWorkingDayGap(ctx.cal, st.baseline_finish, st.end_date);
      if (pushedWd <= 0) continue;
      seen.add(s.succId);
      out.push({
        taskId: s.succId,
        task_code: st.task_code,
        task_name: st.task_name,
        discipline: st.discipline,
        pushedWd,
        nowCritical: ctx.liveFloat.get(s.succId)?.critical ?? false,
        depth: depth + 1,
      });
      queue.push({ id: s.succId, depth: depth + 1 });
    }
  }
  return out.sort((a, b) => a.depth - b.depth || b.pushedWd - a.pushedWd);
}
