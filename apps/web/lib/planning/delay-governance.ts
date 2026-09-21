// Delay governance — float capture at a freeze point (R2.5).
//
// Pure (no I/O, no React). Runs the CPM engine on the live and baseline date
// sets and, for EVERY task, reports the float position plus how much of the
// baseline total float has been consumed by the data date — the figure that
// triggers delay-register events ("concurrent delay / float consumption" logic
// from the Completion Plan continuation).
//
// The consumed-float story is the as-built one: a task that started today
// consumed total float even though it might not have slipped *yet*; the freeze
// point (data date) is what makes "consumed" comparable across a project.

import {
  depsFromArrays,
  scheduleProject,
  signedWorkingDayGap,
  type EngineTask,
  type TaskDates,
  type TaskFloat,
} from "./schedule-engine";
import {
  workingDaysBetween,
  type WorkCalendar,
} from "./work-calendar";
import type { DelayTask } from "./delay-analysis";

export interface DelayFloatByTask {
  task_code: string;
  task_name: string;
  discipline: string | null;
  /** Live total float in working days at the data date. */
  totalFloatWd: number;
  freeFloatWd: number;
  /** Baseline total float − live total float. Consumed, not necessarily *lost* yet. */
  consumedFloatWd: number;
  critical: boolean;
  becameCritical: boolean;
  /** Live finish vs baseline finish in working days. */
  finishSlipWd: number;
  hitsProjectFinish: boolean;
  lateStart: string;
  lateFinish: string;
}

export interface DelayCandidate extends DelayFloatByTask {
  taskId: string;
  reason: string;
}

export interface DelayFloatCapture {
  dataDate: string;
  projectFinishBaseline: string | null;
  projectFinishLive: string | null;
  projectSlipWd: number;
  ok: boolean;
  cycle?: string[];
  byTask: Map<string, DelayFloatByTask>;
  /** Tasks the governance rule flags: critical, became critical, or consumed past threshold. */
  candidates: DelayCandidate[];
}

function toEngineTasks(tasks: DelayTask[], cal: WorkCalendar, which: "live" | "baseline"): EngineTask[] {
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

function maxFinish(dates: Map<string, TaskDates>): string | null {
  let m: string | null = null;
  for (const d of dates.values()) if (m === null || d.finish > m) m = d.finish;
  return m;
}

/**
 * Capture the float arithmetic at `dataDate`. `tasks` carries both the live
 * dates (the as-of-now schedule) and `baseline_*` (the sanctioned baseline —
 * whichever snapshot the caller chose, per the plan). Tasks with no baseline
 * pair simply keep `totalFloatWd` as their live float and consumed 0.
 */
export function captureDelayFloat(
  tasks: DelayTask[],
  cal: WorkCalendar,
  projectStart: string,
  dataDate: string,
  thresholdWd = 5,
): DelayFloatCapture {
  const live = scheduleProject(toEngineTasks(tasks, cal, "live"), cal, projectStart);
  if (!live.ok) {
    return {
      dataDate,
      projectFinishBaseline: null,
      projectFinishLive: null,
      projectSlipWd: 0,
      ok: false,
      cycle: live.cycle,
      byTask: new Map(),
      candidates: [],
    };
  }

  const withBaseline = tasks.filter((t) => t.baseline_start && t.baseline_finish);
  const base = scheduleProject(toEngineTasks(withBaseline, cal, "baseline"), cal, projectStart);
  const baseFloat = base.ok ? base.float : new Map<string, TaskFloat>();

  const projectFinishLive = maxFinish(live.dates);
  const projectFinishBaseline = maxFinish(base.ok ? base.dates : new Map<string, TaskDates>());
  const projectSlipWd =
    projectFinishBaseline && projectFinishLive
      ? signedWorkingDayGap(cal, projectFinishBaseline, projectFinishLive)
      : 0;

  const byTask = new Map<string, DelayFloatByTask>();
  for (const t of tasks) {
    const lf = live.float.get(t.id);
    if (!lf) continue;
    const bf = baseFloat.get(t.id);
    const baselineFloat = bf?.totalFloat ?? 0;
    const consumed = Math.max(0, Math.round((baselineFloat - lf.totalFloat) * 10) / 10);
    const finishSlip =
      t.baseline_finish && t.end_date
        ? signedWorkingDayGap(cal, t.baseline_finish, t.end_date)
        : 0;

    byTask.set(t.id, {
      task_code: t.task_code,
      task_name: t.task_name,
      discipline: t.discipline,
      totalFloatWd: round1(lf.totalFloat),
      freeFloatWd: round1(lf.freeFloat),
      consumedFloatWd: consumed,
      critical: lf.critical,
      becameCritical: lf.critical && !(bf?.critical ?? false),
      finishSlipWd: finishSlip,
      hitsProjectFinish: lf.critical,
      lateStart: lf.lateStart,
      lateFinish: lf.lateFinish,
    });
  }

  const candidates: DelayCandidate[] = [];
  for (const [taskId, f] of byTask) {
    const reasons: string[] = [];
    if (f.critical) reasons.push("on the critical path");
    if (f.becameCritical) reasons.push("became critical at data date");
    if (f.consumedFloatWd >= thresholdWd) reasons.push(`consumed ${f.consumedFloatWd}wd of float`);
    if (!f.critical && !f.becameCritical && f.consumedFloatWd < thresholdWd) continue;
    candidates.push({ taskId, ...f, reason: reasons.join("; ") });
  }

  candidates.sort(
    (a, b) => b.consumedFloatWd - a.consumedFloatWd || Number(b.critical) - Number(a.critical),
  );

  return {
    dataDate,
    projectFinishBaseline,
    projectFinishLive,
    projectSlipWd,
    ok: true,
    byTask,
    candidates,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}