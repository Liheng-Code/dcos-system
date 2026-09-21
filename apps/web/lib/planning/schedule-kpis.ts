// Pure — no I/O, no React. Computes the Planning dashboard's PM-facing headline
// numbers from data the caller already has (the same tasks/float/dates
// scheduleProject() produced), so nothing here re-implements CPM.

import { addWorkingDays, parseISO, type WorkCalendar } from "./work-calendar";
import { projectFinish, signedWorkingDayGap, type TaskDates, type TaskFloat } from "./schedule-engine";

export interface KpiTask {
  id: string;
  start_date: string | null;
  end_date: string | null;
  progress: number;
  status: string;
}

export type ProgrammeStatus = "on_track" | "at_risk" | "overrun";

export interface ScheduleKpis {
  overdue: number;
  startingNext14d: number;
  finishingNext14d: number;
  negativeFloat: number;
  nearCritical: number;
  /** Plan Completion Rate from the last closed weekly plan, 0–100. Null until one has been closed (1.8). */
  pcr: number | null;
  /** The live schedule's overall finish — max finish date across every task. Null for an empty schedule. */
  forecastFinish: string | null;
  /** Working days between forecastFinish and contractEnd. Positive = running late. Null if either date is missing. */
  overrunWd: number | null;
  programmeStatus: ProgrammeStatus;
}

const EXCLUDED_STATUSES = new Set(["cancelled", "on_hold"]);

/**
 * `pcr` is passed in rather than computed here — until weekly plans start
 * being closed (1.8's close_weekly_plan), there is nothing stored to read;
 * callers pass null until then.
 */
export function computeScheduleKpis(
  tasks: KpiTask[],
  floatMap: Map<string, TaskFloat>,
  dates: Map<string, TaskDates>,
  cal: WorkCalendar,
  dataDate: string,
  contractEnd: string | null,
  pcr: number | null,
): ScheduleKpis {
  const horizon = addWorkingDays(cal, dataDate, 14);
  const dataDateMs = parseISO(dataDate).getTime();
  const horizonMs = parseISO(horizon).getTime();

  let overdue = 0;
  let startingNext14d = 0;
  let finishingNext14d = 0;
  let negativeFloat = 0;
  let nearCritical = 0;

  for (const t of tasks) {
    if (EXCLUDED_STATUSES.has(t.status)) continue;

    if (t.end_date && t.progress < 100 && parseISO(t.end_date).getTime() < dataDateMs) {
      overdue++;
    }
    if (t.start_date) {
      const ms = parseISO(t.start_date).getTime();
      if (ms >= dataDateMs && ms <= horizonMs) startingNext14d++;
    }
    if (t.end_date && t.progress < 100) {
      const ms = parseISO(t.end_date).getTime();
      if (ms >= dataDateMs && ms <= horizonMs) finishingNext14d++;
    }

    const f = floatMap.get(t.id);
    if (f) {
      if (f.critical) negativeFloat++;
      else if (f.nearCritical) nearCritical++;
    }
  }

  const forecastFinish = projectFinish(dates);
  const overrunWd = forecastFinish && contractEnd ? signedWorkingDayGap(cal, contractEnd, forecastFinish) : null;

  // Note: `negativeFloat` counts tasks the engine flags `critical` — which
  // fires at totalFloat <= thresholds.critical (0 by default). That is a
  // completely normal property of the longest path through any linked
  // schedule, not itself a risk signal, so it does not drive programmeStatus
  // here — only genuine schedule slippage (overdue work, or the forecast
  // finish landing past the contract end) does.
  const programmeStatus: ProgrammeStatus =
    overrunWd !== null && overrunWd > 0 ? "overrun" : overdue > 0 ? "at_risk" : "on_track";

  return { overdue, startingNext14d, finishingNext14d, negativeFloat, nearCritical, pcr, forecastFinish, overrunWd, programmeStatus };
}
