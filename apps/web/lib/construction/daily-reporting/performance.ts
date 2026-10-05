// Module 10-01 Daily Reporting — unit performance, KPI trend and productivity
// benchmark (design §20, §22 Phase 4). The database returns counts
// (dr_performance); the rates and the score are worked out here, so the
// formula is in one place and unit tested.
//
// The score is a reading aid for management, not a contractual measure: it
// says where to look. Every component is shown beside it.

import { createClient } from "@/lib/supabase/client";

export interface UnitCounts {
  unit_id: string;
  unit_code: string;
  display_name: string;
  unit_type: string;
  /** Reports received (work and no-work). */
  reports: number;
  on_time: number;
  late: number;
  /** Working days with no report at all. */
  missing: number;
  approved: number;
  no_work: number;
  /** Reports the approver sent back at least once. */
  returned: number;
  warnings: number;
  /** Approved activity lines that carried a quantity. */
  qty_lines: number;
  /** Of those, lines where the approver changed the quantity. */
  adjusted_lines: number;
}

export interface WeekCounts {
  week_start: string;
  on_time: number;
  late: number;
  missing: number;
}

export interface BenchmarkRow {
  unit_id: string;
  unit_code: string;
  task_id: string;
  task_code: string | null;
  activity: string | null;
  uom: string;
  days: number;
  qty: number;
  worker_days: number;
  per_worker: number;
  /** The project's median daily output per worker for this activity. */
  typical_per_worker: number;
  typical_days: number;
  typical_units: number;
}

export interface PerformanceData {
  allowed: boolean;
  units: UnitCounts[];
  weeks: WeekCounts[];
  benchmark: BenchmarkRow[];
}

export async function getPerformance(projectId: string, from: string, to: string): Promise<PerformanceData> {
  const { data, error } = await createClient().rpc("dr_performance", { p_project_id: projectId, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const d = (data as PerformanceData | null) ?? { allowed: false, units: [], weeks: [], benchmark: [] };
  const n = (v: unknown) => Number(v ?? 0);
  return {
    allowed: d.allowed === true,
    units: (d.units ?? []).map((u) => ({
      ...u,
      reports: n(u.reports), on_time: n(u.on_time), late: n(u.late), missing: n(u.missing), approved: n(u.approved),
      no_work: n(u.no_work), returned: n(u.returned), warnings: n(u.warnings), qty_lines: n(u.qty_lines), adjusted_lines: n(u.adjusted_lines),
    })),
    weeks: (d.weeks ?? []).map((w) => ({ ...w, on_time: n(w.on_time), late: n(w.late), missing: n(w.missing) })),
    benchmark: (d.benchmark ?? []).map((b) => ({
      ...b,
      days: n(b.days), qty: n(b.qty), worker_days: n(b.worker_days), per_worker: n(b.per_worker),
      typical_per_worker: n(b.typical_per_worker), typical_days: n(b.typical_days), typical_units: n(b.typical_units),
    })),
  };
}

/** Fewer reports due than this and a score would say more about chance than about the unit. */
export const MIN_REPORTS_FOR_SCORE = 5;

export const SCORE_WEIGHTS = { timeliness: 40, firstTime: 30, accuracy: 30 } as const;

export interface UnitPerformance extends UnitCounts {
  /** Reports that should have been received: received plus missing. */
  due: number;
  /** On time, of those due. 0–100, or null when nothing was due. */
  timeliness_pct: number | null;
  /** Accepted without being returned, of those received. */
  first_time_pct: number | null;
  /** Quantities the approver left unchanged, of those approved. Null when no approved quantity exists yet. */
  accuracy_pct: number | null;
  /** 0–100, or null when there is too little to judge. */
  score: number | null;
  /** Why there is no score. */
  note: string | null;
}

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * Timeliness 40, first-time acceptance 30, accuracy 30. A component with no
 * data yet (no approved quantity) is left out and the others are re-weighted,
 * so a unit is not marked down for what has not been reviewed.
 */
export function unitPerformance(c: UnitCounts): UnitPerformance {
  const due = c.reports + c.missing;
  const timeliness = pct(c.on_time, due);
  const firstTime = pct(c.reports - c.returned, c.reports);
  const accuracy = pct(c.qty_lines - c.adjusted_lines, c.qty_lines);

  let score: number | null = null;
  let note: string | null = null;
  if (due < MIN_REPORTS_FOR_SCORE) {
    note = due === 0 ? "No reports due in the period" : `Too few reports to score (${due} of ${MIN_REPORTS_FOR_SCORE})`;
  } else {
    const parts: [number | null, number][] = [
      [timeliness, SCORE_WEIGHTS.timeliness],
      [firstTime, SCORE_WEIGHTS.firstTime],
      [accuracy, SCORE_WEIGHTS.accuracy],
    ];
    const used = parts.filter((p): p is [number, number] => p[0] !== null);
    const weight = used.reduce((s, [, w]) => s + w, 0);
    score = weight > 0 ? Math.round(used.reduce((s, [v, w]) => s + v * w, 0) / weight) : null;
  }
  return { ...c, due, timeliness_pct: timeliness, first_time_pct: firstTime, accuracy_pct: accuracy, score, note };
}

/** Units with a score first, lowest first: that is who needs attention. Units without one follow, by code. */
export function rankUnits(units: UnitCounts[]): UnitPerformance[] {
  return units
    .map(unitPerformance)
    .sort((a, b) => {
      if (a.score === null && b.score === null) return a.unit_code.localeCompare(b.unit_code);
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return a.score - b.score || a.unit_code.localeCompare(b.unit_code);
    });
}

export type BenchmarkBand = "below" | "typical" | "above" | "only";

/** Fewer days than this for a unit and its figure is shown without a comparison. */
export const MIN_DAYS_FOR_BENCHMARK = 3;

/**
 * How a unit's output per worker compares with the project's typical figure
 * for the activity. "only" when there is nothing to compare with: one unit
 * does the activity, or there are too few days.
 */
export function benchmarkBand(row: Pick<BenchmarkRow, "per_worker" | "typical_per_worker" | "days" | "typical_units">): { band: BenchmarkBand; ratio: number | null } {
  if (row.typical_units < 2 || row.days < MIN_DAYS_FOR_BENCHMARK || !(row.typical_per_worker > 0)) return { band: "only", ratio: null };
  const ratio = row.per_worker / row.typical_per_worker;
  return { band: ratio < 0.75 ? "below" : ratio > 1.25 ? "above" : "typical", ratio: Math.round(ratio * 100) / 100 };
}
