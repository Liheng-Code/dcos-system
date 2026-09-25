// Productivity & Resource-Costing Plan, Phase 4 — the labour cost formulas, as one pure function mirroring
// plan_task_work_compute()'s cost block (migration 20260922000010) field for field. Rate resolution (which
// DWL rate applies) and OT-multiplier resolution are DB lookups, done by cost-service.ts before calling this;
// everything here is pure arithmetic, so it can drive a live preview in the UI without a round trip per
// keystroke, exactly like work-engine.ts does for the work/duration numbers.
//
// role_hours   = work_hours x workers_per_crew / total_crew_workers      (this role's share of the task)
// ot_hours     = role_hours x ot_pct / 100 ; normal_hours = role_hours - ot_hours
// hourly_rate  = daily_rate / hours_per_day
// normal_cost  = normal_hours x hourly_rate ; ot_cost = ot_hours x hourly_rate x ot_multiplier
// line_cost    = normal_cost + ot_cost  (NULL when daily_rate is NULL — never a guess)

import { roundTo } from "./work-engine";

export interface CostCrewLine {
  roleLabel: string;
  dwlResourceId: string | null;
  workersPerCrew: number;
  /** Already resolved (e.g. from dwl_v_labor_rates); NULL when no rate is available for this role. */
  dailyRate: number | null;
  currency: string | null;
}

export interface CostLineResult {
  roleLabel: string;
  dwlResourceId: string | null;
  rateSource: "dwl" | "none";
  workersPerCrew: number;
  hoursPerDay: number;
  dailyRate: number | null;
  hourlyRate: number | null;
  otPct: number;
  otType: string;
  otMultiplier: number;
  normalHours: number;
  otHours: number;
  normalCost: number | null;
  otCost: number | null;
  lineCost: number | null;
  currency: string | null;
}

export type CostCalcStatus = "ok" | "partial_rate" | "no_rate" | "no_work";

export interface TaskCostResult {
  lines: CostLineResult[];
  plannedCost: number | null;
  costCalcStatus: CostCalcStatus;
  costCalcMessage: string | null;
}

const NO_WORK_RESULT: TaskCostResult = {
  lines: [], plannedCost: null, costCalcStatus: "no_work",
  costCalcMessage: "No valid work calculation to cost (see Status).",
};

/**
 * `workHours` / `hasValidWork` come from work-engine's computeTaskWork() result (status 'ok' and a norm).
 * `totalCrewWorkers` is the sum of workersPerCrew across every labor line of the norm's crew (v_crew in SQL).
 */
export function computeTaskCost(args: {
  workHours: number | null;
  hasValidWork: boolean;
  crewLines: CostCrewLine[];
  totalCrewWorkers: number;
  hoursPerDay: number;
  otPct: number;
  otType: string;
  otMultiplier: number;
}): TaskCostResult {
  if (!args.hasValidWork || args.workHours == null || args.totalCrewWorkers <= 0 || args.crewLines.length === 0) {
    return NO_WORK_RESULT;
  }
  const h = args.hoursPerDay > 0 ? args.hoursPerDay : 8;
  const lines: CostLineResult[] = [];
  let total = 0;
  let anyRate = false;
  let allRate = true;

  for (const c of args.crewLines) {
    const roleHours = roundTo((args.workHours * c.workersPerCrew) / args.totalCrewWorkers, 6);
    const otHours = roundTo(roleHours * (args.otPct / 100), 6);
    const normalHours = roundTo(roleHours - otHours, 6);
    const hourlyRate = c.dailyRate != null ? c.dailyRate / h : null;
    const normalCost = hourlyRate != null ? roundTo(normalHours * hourlyRate, 2) : null;
    const otCost = hourlyRate != null ? roundTo(otHours * hourlyRate * args.otMultiplier, 2) : null;
    const lineCost = normalCost != null && otCost != null ? roundTo(normalCost + otCost, 2) : null;
    if (lineCost != null) { total += normalCost! + otCost!; anyRate = true; } else { allRate = false; }
    lines.push({
      roleLabel: c.roleLabel, dwlResourceId: c.dwlResourceId, rateSource: c.dailyRate != null ? "dwl" : "none",
      workersPerCrew: c.workersPerCrew, hoursPerDay: h, dailyRate: c.dailyRate, hourlyRate,
      otPct: args.otPct, otType: args.otType, otMultiplier: args.otMultiplier,
      normalHours, otHours, normalCost, otCost, lineCost, currency: c.currency,
    });
  }

  if (!anyRate) {
    return {
      lines, plannedCost: null, costCalcStatus: "no_rate",
      costCalcMessage: "None of this task's crew roles have a resolvable rate (link a crew role to a DWL labour resource with a rate).",
    };
  }
  if (!allRate) {
    return {
      lines, plannedCost: roundTo(total, 2), costCalcStatus: "partial_rate",
      costCalcMessage: "Some crew roles have no resolvable rate - planned_cost is a partial sum, not the full crew.",
    };
  }
  return { lines, plannedCost: roundTo(total, 2), costCalcStatus: "ok", costCalcMessage: null };
}
