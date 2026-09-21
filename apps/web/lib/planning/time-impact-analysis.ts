// Time Impact Analysis engine (3.1).
//
// Pure (no I/O, no React). Standard two-run TIA:
//   * BASE run is the as-planed-but-frozen picture at the data date — work
//     already done is pinned at its actual dates (manual), work still to come
//     is re-scheduled from its baseline dates plus the still-open successor
//     logic. Crucially the base run has NO delaying fragment in it.
//   * IMPACTED run re-schedules the same network with the delaying fragment
//     (a fragment network inserted at the data date) linked onto the activities
//     the delay is claimed to impact.
// The EOT figure is the difference in project finish between the two runs.
//
// Fragment semantics:
//   * Root fragment activities (no predecessors) anchor at the data date (the
//     event starts when it starts) — the engine's unlinked-task rule keeps
//     their stored start dates, so they schedule from the data date forward.
//   * Every activity named in `impactedActivityIds` gets an FS-0 link from the
//     fragment's tail, so the delay pushes its successors exactly as a real
//     network would.
//   * The fragment itself is never stored to the live schedule — a scenario is
//     a pure calculation (plan_tia_scenarios rows persist input/output only).

import {
  depsFromArrays,
  labelForConstraint,
  scheduleProject,
  signedWorkingDayGap,
  type DepType,
  type EngineDep,
  type EngineTask,
  type TaskDates,
  type TaskFloat,
  type FloatThresholds,
} from "./schedule-engine";
import { workingDaysBetween, type WorkCalendar } from "./work-calendar";

/** A fragment activity: the delaying event expressed as small network. */
export interface FragnetActivity {
  id: string;
  name: string;
  /** Working days. 0 = milestone. */
  durationWd: number;
  /** Links to other fragment IDs and/or real task IDs. */
  deps: EngineDep[];
}

export interface TiaTask {
  id: string;
  task_code: string;
  task_name: string;
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
}

export interface TiaInput {
  tasks: TiaTask[];
  cal: WorkCalendar;
  dataDate: string;
  fragnet: FragnetActivity[];
  impactedActivityIds: string[];
  thresholds?: FloatThresholds;
}

/** The single task who carries a milestone — reuses TiaTask so callers pass the same list. */
export interface ImpactedMilestone {
  taskId: string;
  task_code: string;
  task_name: string;
  baseFinish: string | null;
  impactedFinish: string | null;
  slipWd: number;
}

export type TiaResult =
  | {
      ok: true;
      dataDate: string;
      baseFinish: string | null;
      impactedFinish: string | null;
      /** Working days of slip the fragment imposes on project finish. */
      slipWd: number;
      baseDates: Map<string, TaskDates>;
      impactedDates: Map<string, TaskDates>;
      impactedFloat: Map<string, TaskFloat>;
      baseCritical: string[];
      impactedCritical: string[];
      criticalPathChanged: boolean;
      milestones: ImpactedMilestone[];
      /** Task ids that started after the data date and got pushed past their baseline. */
      setbacks: string[];
    }
  | { ok: false; cycle: string[]; dataDate: string };

// ---------------------------------------------------------------------------

/** A task is done by the data date when 100% progress or its finish precedes it. */
function isComplete(t: TiaTask, dataDate: string): boolean {
  return t.progress >= 1 || (!!t.end_date && t.end_date < dataDate);
}

function fragmentTailIds(fragnet: FragnetActivity[]): string[] {
  // Terminal fragment activities: those no OTHER fragment activity depends on.
  // A lone root-only activity is its own tail (the impact couples onto its end).
  const hasSucc = new Set<string>();
  for (const f of fragnet) {
    for (const d of f.deps) if (fragnet.some((g) => g.id === d.predId)) hasSucc.add(d.predId);
  }
  return fragnet.filter((f) => !hasSucc.has(f.id)).map((f) => f.id);
}

function baseEngineTasks(
  tasks: TiaTask[],
  cal: WorkCalendar,
  dataDate: string,
): EngineTask[] {
  return tasks.map((t) => {
    if (isComplete(t, dataDate)) {
      // As-built: pin completed work verbatim so the BASE run cannot pull it.
      let durationWd = 1;
      if (t.is_milestone) durationWd = 0;
      else if (t.start_date && t.end_date)
        durationWd = Math.max(1, workingDaysBetween(cal, t.start_date, t.end_date));
      return {
        id: t.id,
        start: t.start_date,
        finish: t.end_date,
        durationWd,
        manuallyScheduled: true,
        constraintType: null,
        constraintDate: null,
        deps: depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
      };
    }
    // Not done: as-planned, scheduled by CPM from baseline dates.
    let durationWd = 1;
    if (t.is_milestone) durationWd = 0;
    else if (t.baseline_start && t.baseline_finish && !t.start_date && !t.end_date)
      durationWd = Math.max(1, workingDaysBetween(cal, t.baseline_start, t.baseline_finish));
    else if (t.start_date && t.end_date)
      durationWd = Math.max(1, workingDaysBetween(cal, t.start_date, t.end_date));
    else if (t.baseline_start && t.baseline_finish)
      durationWd = Math.max(1, workingDaysBetween(cal, t.baseline_start, t.baseline_finish));
    return {
      id: t.id,
      start: t.baseline_start ?? t.start_date,
      finish: t.baseline_finish ?? t.end_date,
      durationWd,
      manuallyScheduled: false,
      constraintType: t.constraint_type,
      constraintDate: t.constraint_date,
      deps: depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
    };
  });
}

function impactedEngineTasks(
  base: EngineTask[],
  tasks: TiaTask[],
  dataDate: string,
  fragnet: FragnetActivity[],
  impactedActivityIds: string[],
): { tasks: EngineTask[]; tailIds: string[] } | { cycle: string[] } {
  const tail = fragmentTailIds(fragnet);
  const fragTasks: EngineTask[] = fragnet.map((f) => ({
    id: f.id,
    start: fragnetDepsPresent(f) ? null : dataDate,
    finish: f.durationWd <= 0 ? dataDate : null,
    durationWd: f.durationWd,
    manuallyScheduled: false,
    constraintType: null,
    constraintDate: null,
    deps: f.deps,
  }));

  const byId = new Map<string, EngineTask>();
  for (const t of base) byId.set(t.id, t);
  for (const f of fragTasks) byId.set(f.id, f);

  // The delayed activities pick up an FS-0 from the fragment tail (only if the
  // tail exists; a fragment that is entirely root-spanning just anchors at the
  // data date with no real-task coupling, which is a valid "event only" study).
  const delayed = new Map<string, EngineTask>();
  for (const t of base) delayed.set(t.id, t);
  for (const id of impactedActivityIds) {
    const t = delayed.get(id);
    if (!t) continue;
    for (const tailId of tail) {
      t.deps = t.deps.concat({ predId: tailId, type: "fs" as DepType, lag: 0 });
    }
  }

  const all = [...delayed.values(), ...fragTasks];
  // Guard: any tail id that never made it into fragTasks (impossible by
  // construction, but be cheap) — a stray pred would silently cycle the guard.
  return { tasks: all, tailIds: tail };
}

function fragnetDepsPresent(f: FragnetActivity): boolean {
  return f.deps.length > 0;
}

function maxFinish(dates: Map<string, TaskDates>): string | null {
  let m: string | null = null;
  for (const d of dates.values()) if (m === null || d.finish > m) m = d.finish;
  return m;
}

function criticalIds(float: Map<string, TaskFloat>): string[] {
  return [...float.entries()].filter(([, f]) => f.critical).map(([id]) => id).sort();
}

/**
 * Run a Time Impact Analysis. Returns the slip in working days between the
 * un-impacted and impacted schedules, the milestone breadcrumbs, and whether
 * the critical path moved. Never mutates the input.
 */
export function runTia(input: TiaInput): TiaResult {
  const { tasks, cal, dataDate, fragnet, impactedActivityIds, thresholds } = input;
  const base = scheduleProject(baseEngineTasks(tasks, cal, dataDate), cal, dataDate, thresholds);
  if (!base.ok) {
    return { ok: false, cycle: base.cycle, dataDate };
  }

  // Impacted run: the as-of-data-date network PLUS the delaying fragment and
  // the injected FS-0 links onto the impacted activities.
  const realBase = baseEngineTasks(tasks, cal, dataDate);
  const withFragment = impactedEngineTasks(realBase, tasks, dataDate, fragnet, impactedActivityIds);
  if ("cycle" in withFragment) return { ok: false, cycle: withFragment.cycle, dataDate };

  const impacted = scheduleProject(withFragment.tasks, cal, dataDate, thresholds);
  if (!impacted.ok) return { ok: false, cycle: impacted.cycle, dataDate };

  const baseFinish = maxFinish(base.dates);
  const impactedFinish = maxFinish(impacted.dates);
  const slipWd =
    baseFinish && impactedFinish
      ? signedWorkingDayGap(cal, baseFinish, impactedFinish)
      : 0;

  const baseCrit = criticalIds(base.float);
  const impactedCrit = criticalIds(impacted.float);

  const milestones: ImpactedMilestone[] = tasks
    .filter((t) => t.is_milestone)
    .map((t) => {
      const b = base.dates.get(t.id);
      const i = impacted.dates.get(t.id);
      const slip = b && i ? signedWorkingDayGap(cal, b.finish, i.finish) : 0;
      return {
        taskId: t.id,
        task_code: t.task_code,
        task_name: t.task_name,
        baseFinish: b?.finish ?? null,
        impactedFinish: i?.finish ?? null,
        slipWd: slip,
      };
    })
    .filter((m) => m.slipWd > 0)
    .sort((a, b) => b.slipWd - a.slipWd);

  const setbacks = tasks
    .filter((t) => !isComplete(t, dataDate))
    .map((t) => {
      const b = base.dates.get(t.id);
      const i = impacted.dates.get(t.id);
      const slip = b && i ? signedWorkingDayGap(cal, b.finish, i.finish) : 0;
      return { id: t.id, slip };
    })
    .filter((s) => s.slip > 0)
    .sort((a, b) => b.slip - a.slip)
    .map((s) => s.id);

  const criticalPathChanged =
    baseCrit.length !== impactedCrit.length ||
    baseCrit.some((id, i) => impactedCrit[i] !== id);

  return {
    ok: true,
    dataDate,
    baseFinish,
    impactedFinish,
    slipWd,
    baseDates: base.dates,
    impactedDates: impacted.dates,
    impactedFloat: impacted.float,
    baseCritical: baseCrit,
    impactedCritical: impactedCrit,
    criticalPathChanged,
    milestones,
    setbacks,
  };
}

export { labelForConstraint };