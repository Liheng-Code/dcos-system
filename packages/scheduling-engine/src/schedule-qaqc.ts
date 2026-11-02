// Schedule quality checks (doc 35 Q1; PRD doc 34 MOD-10): the DCMA 14-point assessment, run on a
// calculated schedule. Pure — the caller supplies the tasks, the scheduleProject() result and the
// data date. Each check returns its metric, threshold, pass/fail, severity and the affected tasks,
// so the findings can be stored, accepted with a reason, or resolved (plan_schedule_qaqc_*).

import { scheduleProject, signedWorkingDayGap, type EngineTask, type FloatThresholds, type ScheduleOptions, type ScheduleResult } from "./schedule-engine";
import { parseISO, workingDaysBetween, type WorkCalendar } from "./work-calendar";

export interface QaqcTask extends EngineTask {
  code?: string | null;
  isMilestone?: boolean | null;
  /** Resources assigned (plan_task_assignments) — check 10. */
  resourceCount?: number | null;
  /** Budget cost, counts as loaded for check 10 when there are no resources. */
  budgetCost?: number | null;
  baselineStart?: string | null;
  baselineFinish?: string | null;
}

export type QaqcCheckCode =
  | "logic" | "leads" | "lags" | "relationship_types" | "hard_constraints" | "high_float"
  | "negative_float" | "high_duration" | "invalid_dates" | "resources" | "missed_tasks"
  | "critical_path_test" | "cpli" | "bei";

export type QaqcSeverity = "critical" | "warning";

export interface QaqcCheckResult {
  code: QaqcCheckCode;
  /** DCMA point number 1–14. */
  number: number;
  name: string;
  severity: QaqcSeverity;
  /** The measured value: a percentage for ratio checks, a count, or an index for CPLI / BEI. */
  metric: number;
  unit: "%" | "count" | "index";
  /** Pass when metric <= threshold, or >= threshold for "min" checks. */
  threshold: number;
  comparator: "max" | "min";
  pass: boolean;
  /** Not applicable (e.g. BEI before anything was due). Counts as a pass. */
  notApplicable?: boolean;
  affected: string[];
  message: string;
}

export interface QaqcOptions {
  /** High float / high duration limit in working days (DCMA: 44). */
  highDays?: number;
  /** Ratio checks' limit in % (DCMA: 5). */
  maxPercent?: number;
  /** Minimum FS share in % (DCMA: 90). */
  minFsPercent?: number;
  /** CPLI and BEI minimum (DCMA: 0.95). */
  minIndex?: number;
  /** Delay added in the critical path test, working days (DCMA: 600). */
  testDelayDays?: number;
}

const HARD = new Set(["must_start_on", "must_finish_on", "start_no_later_than", "finish_no_later_than"]);

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Run the 14 checks. `result` must be scheduleProject(tasks, cal, projectStart, thresholds, opts) for
 * the same input; it is re-run once internally for the critical path test.
 */
export function runScheduleQaqc(
  tasks: QaqcTask[],
  result: Extract<ScheduleResult, { ok: true }>,
  cal: WorkCalendar,
  projectStart: string,
  dataDate: string,
  thresholds: FloatThresholds,
  scheduleOpts: ScheduleOptions = {},
  opts: QaqcOptions = {},
): QaqcCheckResult[] {
  const highDays = opts.highDays ?? 44;
  const maxPct = opts.maxPercent ?? 5;
  const minFs = opts.minFsPercent ?? 90;
  const minIndex = opts.minIndex ?? 0.95;
  const delay = opts.testDelayDays ?? 600;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const label = (id: string) => byId.get(id)?.code || id;
  const state = (id: string) => result.state.get(id) ?? "not_started";
  const isMilestone = (t: QaqcTask) => !!t.isMilestone || Math.trunc(t.durationWd) === 0;
  // DCMA counts incomplete, non-summary activities (summaries are never passed in).
  const incomplete = tasks.filter((t) => state(t.id) !== "complete");
  const later = (a: string, b: string) => parseISO(a).getTime() > parseISO(b).getTime();
  const out: QaqcCheckResult[] = [];
  const list = (ids: string[]) => ids.slice(0, 5).map(label).join(", ") + (ids.length > 5 ? ` and ${ids.length - 5} more` : "");

  const ratio = (
    number: number, code: QaqcCheckCode, name: string, severity: QaqcSeverity,
    affected: string[], base: number, limit: number, what: string,
  ) => {
    const metric = pct(affected.length, base);
    const pass = metric <= limit;
    out.push({
      code, number, name, severity, metric, unit: "%", threshold: limit, comparator: "max", pass, affected,
      message: pass
        ? `${affected.length} of ${base} ${what} (${metric}%), within ${limit}%`
        : `${affected.length} of ${base} ${what} (${metric}%), over ${limit}%: ${list(affected)}`,
    });
  };
  const zero = (number: number, code: QaqcCheckCode, name: string, affected: string[], what: string) => {
    const pass = affected.length === 0;
    out.push({
      code, number, name, severity: "critical", metric: affected.length, unit: "count", threshold: 0, comparator: "max", pass, affected,
      message: pass ? `No ${what}` : `${affected.length} ${what}: ${list(affected)}`,
    });
  };

  // 1 Logic: open start / finish, except the project's start and finish milestones.
  const openStart = new Set(result.diagnostics.openStart);
  const openFinish = new Set(result.diagnostics.openFinish);
  const completion = result.longestPath[result.longestPath.length - 1];
  const missingLogic = incomplete
    .filter((t) => (openStart.has(t.id) && !isMilestone(t)) || (openFinish.has(t.id) && t.id !== completion))
    .map((t) => t.id);
  ratio(1, "logic", "Logic (missing predecessors or successors)", "critical", missingLogic, incomplete.length, maxPct, "incomplete activities have an open start or finish");

  // 2–4 Relationships of incomplete activities
  const links = incomplete.flatMap((t) => t.deps.filter((d) => byId.has(d.predId) && d.predId !== t.id).map((d) => ({ t, d })));
  zero(2, "leads", "Leads (negative lag)", [...new Set(links.filter(({ d }) => d.lag < 0).map(({ t }) => t.id))], "links with a lead");
  const lagged = links.filter(({ d }) => d.lag > 0);
  ratio(3, "lags", "Lags", "warning", [...new Set(lagged.map(({ t }) => t.id))], links.length, maxPct, "links have a lag");
  {
    const fsCount = links.filter(({ d }) => d.type === "fs").length;
    const metric = pct(fsCount, links.length);
    const pass = links.length === 0 || metric >= minFs;
    const nonFs = [...new Set(links.filter(({ d }) => d.type !== "fs").map(({ t }) => t.id))];
    out.push({
      code: "relationship_types", number: 4, name: "Relationship types (finish-to-start)", severity: "warning",
      metric, unit: "%", threshold: minFs, comparator: "min", pass, affected: pass ? [] : nonFs,
      message: `${fsCount} of ${links.length} links are finish-to-start (${metric}%)${pass ? "" : `, under ${minFs}%`}`,
    });
  }

  // 5 Hard constraints
  ratio(5, "hard_constraints", "Hard constraints", "warning",
    incomplete.filter((t) => t.constraintType && HARD.has(t.constraintType)).map((t) => t.id), incomplete.length, maxPct, "incomplete activities have a hard constraint");

  // 6 High float, 7 negative float
  ratio(6, "high_float", `High float (over ${highDays} days)`, "warning",
    incomplete.filter((t) => (result.float.get(t.id)?.totalFloat ?? 0) > highDays).map((t) => t.id), incomplete.length, maxPct, `incomplete activities have more than ${highDays} days of float`);
  zero(7, "negative_float", "Negative float", incomplete.filter((t) => (result.float.get(t.id)?.totalFloat ?? 0) < 0).map((t) => t.id), "activities with negative float");

  // 8 High duration (remaining, for incomplete non-milestones)
  const longOnes = incomplete.filter((t) => {
    if (isMilestone(t)) return false;
    const d = result.dates.get(t.id);
    if (!d) return false;
    const from = state(t.id) === "in_progress" && later(dataDate, d.start) ? dataDate : d.start;
    return workingDaysBetween(cal, from, d.finish) > highDays;
  }).map((t) => t.id);
  ratio(8, "high_duration", `High duration (over ${highDays} days)`, "warning", longOnes, incomplete.filter((t) => !isMilestone(t)).length, maxPct, `activities have more than ${highDays} working days left`);

  // 9 Invalid dates: actuals after the data date; forecasts before it
  const invalid = tasks.filter((t) => {
    if ((t.actualStart && later(t.actualStart, dataDate)) || (t.actualFinish && later(t.actualFinish, dataDate))) return true;
    const d = result.dates.get(t.id);
    if (!d) return false;
    if (state(t.id) === "not_started" && later(dataDate, d.start)) return true;
    if (state(t.id) !== "complete" && later(dataDate, d.finish)) return true;
    return false;
  }).map((t) => t.id);
  zero(9, "invalid_dates", "Invalid dates", invalid, "activities with actual dates after the data date or forecast dates before it");

  // 10 Resources (incomplete activities with duration and no resources or cost)
  const unloaded = incomplete.filter((t) => !isMilestone(t) && !(Number(t.resourceCount) > 0) && !(Number(t.budgetCost) > 0)).map((t) => t.id);
  ratio(10, "resources", "Resources (no resources or cost loaded)", "warning", unloaded, incomplete.filter((t) => !isMilestone(t)).length, maxPct, "activities have no resources or cost");

  // 11 Missed tasks: baselined to finish by the data date, but finished late or not at all
  const due = tasks.filter((t) => t.baselineFinish && !later(t.baselineFinish, dataDate));
  const missed = due.filter((t) => !t.actualFinish || later(t.actualFinish, t.baselineFinish!)).map((t) => t.id);
  if (due.length === 0) {
    out.push({ code: "missed_tasks", number: 11, name: "Missed tasks", severity: "warning", metric: 0, unit: "%", threshold: maxPct, comparator: "max", pass: true, notApplicable: true, affected: [], message: "No activity was due by the data date" });
  } else {
    ratio(11, "missed_tasks", "Missed tasks", "warning", missed, due.length, maxPct, "activities due by the data date finished late or not at all");
  }

  // 12 Critical path test: delay the first incomplete activity on the longest path; the finish must move as much.
  {
    // The first activity on the longest path; when the path has none (the completion is not driven by
    // any work), the most critical remaining activity.
    const movable = (id: string) => state(id) !== "complete" && !!byId.get(id) && !isMilestone(byId.get(id)!);
    const probe = result.longestPath.find(movable)
      ?? incomplete.filter((t) => movable(t.id))
        .sort((a, b) => (result.float.get(a.id)?.totalFloat ?? 0) - (result.float.get(b.id)?.totalFloat ?? 0))[0]?.id;
    // DCMA measures the project completion (the end of the longest path), not whichever activity ends last.
    const finishOf = (r: Extract<ScheduleResult, { ok: true }>) => (completion ? r.dates.get(completion)?.finish ?? null : null);
    let pass = false;
    let message = "No incomplete activity on the longest path to test";
    let moved = 0;
    if (probe) {
      const delayed = tasks.map((t) => (t.id === probe ? { ...t, durationWd: Math.trunc(t.durationWd) + delay, remainingWd: t.remainingWd != null ? t.remainingWd + delay : t.remainingWd, percentComplete: null } : t));
      const rerun = scheduleProject(delayed, cal, projectStart, thresholds, scheduleOpts);
      const before = finishOf(result);
      const after = rerun.ok ? finishOf(rerun) : null;
      moved = before && after ? signedWorkingDayGap(cal, before, after) : 0;
      pass = moved >= delay;
      message = pass
        ? `Delaying ${label(probe)} by ${delay} days moved the finish by ${moved} days: the critical path is continuous`
        : `Delaying ${label(probe)} by ${delay} days moved the finish by only ${moved} days: the critical path is broken (open ends or constraints)`;
    }
    out.push({ code: "critical_path_test", number: 12, name: "Critical path test", severity: "critical", metric: moved, unit: "count", threshold: delay, comparator: "min", pass: probe ? pass : true, notApplicable: !probe, affected: probe && !pass ? [probe] : [], message });
  }

  // 13 CPLI = (remaining critical path length + its total float) / remaining critical path length
  {
    let finish: string | null = null;
    for (const d of result.dates.values()) if (!finish || d.finish > finish) finish = d.finish;
    const from = later(dataDate, projectStart) ? dataDate : projectStart;
    const length = finish ? Math.max(0, workingDaysBetween(cal, from, finish)) : 0;
    const pathFloat = Math.min(0, ...result.longestPath.filter((id) => state(id) !== "complete").map((id) => result.float.get(id)?.totalFloat ?? 0));
    const cpli = length > 0 ? round2((length + pathFloat) / length) : 1;
    const pass = cpli >= minIndex;
    out.push({ code: "cpli", number: 13, name: "Critical path length index (CPLI)", severity: "warning", metric: cpli, unit: "index", threshold: minIndex, comparator: "min", pass, affected: [], message: `CPLI ${cpli}${pass ? "" : `: the critical path needs ${-pathFloat} days more than remain`}` });
  }

  // 14 BEI = finished / due by the data date (baseline)
  {
    if (due.length === 0) {
      out.push({ code: "bei", number: 14, name: "Baseline execution index (BEI)", severity: "warning", metric: 1, unit: "index", threshold: minIndex, comparator: "min", pass: true, notApplicable: true, affected: [], message: "No activity was due by the data date" });
    } else {
      const finished = tasks.filter((t) => t.actualFinish && !later(t.actualFinish, dataDate)).length;
      const bei = round2(finished / due.length);
      const pass = bei >= minIndex;
      out.push({ code: "bei", number: 14, name: "Baseline execution index (BEI)", severity: "warning", metric: bei, unit: "index", threshold: minIndex, comparator: "min", pass, affected: pass ? [] : missed, message: `${finished} activities finished against ${due.length} due by the data date (BEI ${bei})` });
    }
  }

  return out.sort((a, b) => a.number - b.number);
}
