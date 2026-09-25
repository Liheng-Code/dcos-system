// Productivity index engine (Productivity plan, Phase 5, part A).
//
// Pure (no I/O, no React). A line-by-line mirror of the SQL trigger `plan_productivity_log_compute()`
// (supabase/migrations/20260922000011_plan_productivity_logs.sql) — the UI uses this module for the Site
// Records entry form's live preview, so the two MUST agree. `aggregatePiByTrade` has no SQL counterpart; it
// only shapes already-computed, already-fetched rows for the dashboard chart.
//
//   actual_hours = headcount × (hours_normal + hours_ot)
//   earned_hours = quantity_done × the task's norm labour constant (man-hours per unit)
//   productivity_index = earned_hours ÷ actual_hours     — the standard "Performance Factor":
//       1.0 = matches the norm, > 1 = faster than the norm, < 1 = slower than the norm.

import { normalizeUnit, roundTo } from "./work-engine";

export type PiStatus = "ok" | "no_task" | "no_norm" | "no_quantity" | "unit_mismatch" | "no_hours";

export interface PiNorm {
  unit: string;
  /** Man-hours of the WHOLE crew per unit of output (plan_productivity_norms.labour_constant_hr_per_unit). */
  labourConstantHrPerUnit: number;
}

export interface ProductivityLogInput {
  /** Whether a task is selected at all (a log can be trade-only, with no task). */
  hasTask: boolean;
  headcount: number;
  hoursNormal: number;
  hoursOt: number;
  quantityDone: number | null;
  unit: string | null;
  /** The selected task's norm, or null when the task has none (or no task is selected). */
  norm: PiNorm | null;
}

export interface ProductivityLogResult {
  actualHours: number;
  earnedHours: number | null;
  productivityIndex: number | null;
  status: PiStatus;
  message: string | null;
}

const noIndex = (actualHours: number, status: PiStatus, message: string): ProductivityLogResult => ({
  actualHours,
  earnedHours: null,
  productivityIndex: null,
  status,
  message,
});

export function computeProductivityLog(input: ProductivityLogInput): ProductivityLogResult {
  const actualHours = Math.max(0, input.headcount || 0) * (Math.max(0, input.hoursNormal || 0) + Math.max(0, input.hoursOt || 0));

  if (!input.hasTask) {
    return noIndex(actualHours, "no_task", "No task selected - actual hours are recorded, but there is no norm to compare against.");
  }
  if (actualHours <= 0) {
    return noIndex(actualHours, "no_hours", "No hours logged.");
  }
  if (!input.norm) {
    return noIndex(actualHours, "no_norm", "This task has no productivity norm assigned yet (set one on Task Work).");
  }
  if (input.quantityDone === null || input.quantityDone === undefined) {
    return noIndex(actualHours, "no_quantity", "No quantity done entered yet.");
  }
  if (!input.unit || input.unit.trim() === "") {
    return noIndex(actualHours, "no_quantity", "Enter the unit the quantity was measured in.");
  }
  if (normalizeUnit(input.unit) !== normalizeUnit(input.norm.unit)) {
    return noIndex(actualHours, "unit_mismatch", `Logged in ${input.unit} but the norm is per ${input.norm.unit}`);
  }

  const earnedHours = roundTo(input.quantityDone * input.norm.labourConstantHrPerUnit, 4);
  const productivityIndex = roundTo(earnedHours / actualHours, 4);
  return { actualHours, earnedHours, productivityIndex, status: "ok", message: null };
}

// ── dashboard aggregation ────────────────────────────────────────────────────
export interface PiLogRow {
  tradeCode: string;
  actualHours: number;
  productivityIndex: number | null;
  piStatus: PiStatus;
}

export interface TradePiSummary {
  trade: string;
  /** Weighted by each log's actual_hours, so a big crew-day counts more than a one-worker top-up. */
  index: number;
  sampleCount: number;
  totalActualHours: number;
}

/** One row per trade, ok-status logs only, sorted by trade name. Empty input → empty output. */
export function aggregatePiByTrade(logs: PiLogRow[]): TradePiSummary[] {
  const byTrade = new Map<string, { weightedSum: number; totalHours: number; count: number }>();
  for (const l of logs) {
    if (l.piStatus !== "ok" || l.productivityIndex === null || !(l.actualHours > 0)) continue;
    const acc = byTrade.get(l.tradeCode) ?? { weightedSum: 0, totalHours: 0, count: 0 };
    acc.weightedSum += l.productivityIndex * l.actualHours;
    acc.totalHours += l.actualHours;
    acc.count += 1;
    byTrade.set(l.tradeCode, acc);
  }
  return [...byTrade.entries()]
    .map(([trade, acc]) => ({
      trade,
      index: roundTo(acc.weightedSum / acc.totalHours, 3),
      sampleCount: acc.count,
      totalActualHours: roundTo(acc.totalHours, 2),
    }))
    .sort((a, b) => a.trade.localeCompare(b.trade));
}
