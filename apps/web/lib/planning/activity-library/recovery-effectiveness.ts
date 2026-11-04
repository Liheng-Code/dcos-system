// Recovery effectiveness (doc 35 F3; PRD FR-118): did an applied recovery deliver what it promised? Pure, no I/O.
//   planned  = the working days the scenario was measured to recover when it was saved
//   achieved = working days between the forecast finish recorded just before the changes were applied and the live
//              forecast finish now (positive = earlier). Later progress, delays and other changes all count: this is
//              the outcome, not an attribution.
// Per change: does the programme still carry it (a shortened activity still within its new duration, an overlap still
// start-to-start, the extra working days still in the calendar)?

import { signedWorkingDayGap } from "../schedule-engine";
import { isWorkingDay, workingDaysBetween, type WorkCalendar } from "../work-calendar";
import type { RecoveryTask } from "./recovery-engine";
import type { SavedLever } from "./recovery-service";

export type LeverState = "held" | "slipped" | "removed" | "missing";

export interface LeverOutcome {
  kind: SavedLever["kind"];
  code: string;
  name: string;
  label: string;
  state: LeverState;
  /** duration changes: planned and current working days */
  plannedWd?: number;
  nowWd?: number;
  progress?: number;
  /** calendar: extra working days still in the calendar / planned */
  daysHeld?: number;
  daysPlanned?: number;
}

export interface RecoveryEffectiveness {
  plannedWd: number;
  /** null until the scenario has been applied */
  achievedWd: number | null;
  /** achieved / planned, %, null when either is missing or planned is 0 */
  achievedPct: number | null;
  forecastBefore: string | null;
  forecastNow: string | null;
  levers: LeverOutcome[];
  held: number;
  slipped: number;
}

export function recoveryEffectiveness(
  s: { recovered_wd: number; applied_forecast_finish: string | null; applied_at: string | null; levers: SavedLever[] },
  tasksNow: RecoveryTask[],
  cal: WorkCalendar,
): RecoveryEffectiveness {
  const byId = new Map(tasksNow.map((t) => [t.id, t]));
  const forecastNow = tasksNow.map((t) => t.finish).filter((f): f is string => !!f).sort().at(-1) ?? null;
  const before = s.applied_at ? s.applied_forecast_finish : null;
  const achieved = before && forecastNow ? signedWorkingDayGap(cal, forecastNow, before) : null;

  const levers: LeverOutcome[] = s.levers.map((l) => {
    const base = { kind: l.kind, code: l.code, name: l.name, label: l.label };
    if (l.kind === "calendar") {
      const dates = l.dates ?? [];
      const heldDays = dates.filter((d) => isWorkingDay(cal, d)).length;
      return { ...base, state: heldDays === dates.length ? "held" : heldDays === 0 ? "removed" : "slipped", daysHeld: heldDays, daysPlanned: dates.length };
    }
    const t = byId.get(l.taskId);
    if (!t) return { ...base, state: "missing" };
    if (l.kind === "fasttrack") {
      const i = t.depIds.indexOf(l.predId ?? "");
      const ss = i >= 0 && (t.depTypes[i] ?? "fs").toLowerCase() === "ss";
      return { ...base, state: ss ? "held" : "removed", progress: t.progress };
    }
    const nowWd = t.isMilestone ? 0 : t.start && t.finish ? Math.max(1, workingDaysBetween(cal, t.start, t.finish)) : undefined;
    const state: LeverState = nowWd == null ? "missing" : nowWd <= l.toWd ? "held" : "slipped";
    return { ...base, state, plannedWd: l.toWd, nowWd, progress: t.progress };
  });

  const planned = Number(s.recovered_wd) || 0;
  return {
    plannedWd: planned,
    achievedWd: achieved,
    achievedPct: achieved != null && planned > 0 ? Math.round((achieved / planned) * 100) : null,
    forecastBefore: before,
    forecastNow,
    levers,
    held: levers.filter((l) => l.state === "held").length,
    slipped: levers.filter((l) => l.state !== "held").length,
  };
}
