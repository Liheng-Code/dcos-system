// Pure chart shaping for cost loading and the manpower histogram (doc 24 phase 3). Data: loading-service.ts.

import type { CostLoading, ManpowerHistogram, ResourceKind } from "./loading-service";

export const OTHER_KEY = "__other";

export interface StackSeries {
  key: string;
  label: string;
  total: number;
}

/** One chart row per period: `period`, one numeric field per series key, plus extras (cumulative, totals). */
export type StackRow = { period: string } & Record<string, number | string>;

/** The `limit` largest series, the rest folded into one "Other" series (kept only when it is non-zero). */
export function topSeries(series: StackSeries[], limit: number): { shown: StackSeries[]; other: Set<string> } {
  const sorted = [...series].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  if (sorted.length <= limit) return { shown: sorted, other: new Set() };
  const keep = sorted.slice(0, Math.max(0, limit - 1));
  const rest = sorted.slice(keep.length);
  const otherTotal = rest.reduce((s, r) => s + r.total, 0);
  return {
    shown: otherTotal !== 0 ? [...keep, { key: OTHER_KEY, label: `Other (${rest.length})`, total: otherTotal }] : keep,
    other: new Set(rest.map((r) => r.key)),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cost loading rows: value per period stacked by CSI division (top `limit`, rest as Other), with the cumulative
 * planned value and cumulative %. Cumulative comes from the RPC, so its last point equals the scheduled budget.
 */
export function costLoadingRows(data: CostLoading, limit = 8): { rows: StackRow[]; series: StackSeries[] } {
  const { shown, other } = topSeries(
    data.divisions.map((d) => ({ key: d.code, label: d.code === "--" ? "Unclassified" : `${d.code} ${d.name}`, total: Number(d.total) })),
    limit,
  );
  const total = Number(data.meta.scheduled_budget) || 0;
  const byPeriod = new Map<string, StackRow>();
  for (const p of data.periods) {
    const row: StackRow = { period: p.period, value: Number(p.value), cumulative: Number(p.cumulative), cumulativePct: total > 0 ? round2((Number(p.cumulative) / total) * 100) : 0 };
    for (const s of shown) row[s.key] = 0;
    byPeriod.set(p.period, row);
  }
  for (const c of data.cells) {
    const row = byPeriod.get(c.period);
    if (!row) continue;
    const key = other.has(c.division) ? OTHER_KEY : c.division;
    if (!(key in row)) continue;
    row[key] = round2(Number(row[key]) + Number(c.value));
  }
  return { rows: [...byPeriod.values()], series: shown };
}

/**
 * Histogram rows for one resource kind: average headcount (or hours) per period stacked by group (top `limit`,
 * rest as Other), plus the period total and its daily peak headcount.
 */
export function histogramRows(
  data: ManpowerHistogram, kind: ResourceKind, measure: "headcount" | "hours" = "headcount", limit = 8,
): { rows: StackRow[]; series: StackSeries[]; peak: number } {
  const { shown, other } = topSeries(
    data.series.filter((s) => s.kind === kind).map((s) => ({ key: s.key, label: s.label, total: Number(s.total_hours) })),
    limit,
  );
  const byPeriod = new Map<string, StackRow>();
  let peak = 0;
  for (const p of data.periods) {
    const total = kind === "labor"
      ? (measure === "headcount" ? p.labor_headcount : p.labor_hours)
      : (measure === "headcount" ? p.equipment_headcount : p.equipment_hours);
    const dailyPeak = kind === "labor" ? p.labor_peak : p.equipment_peak;
    peak = Math.max(peak, Number(total));
    const row: StackRow = { period: p.period, total: Number(total), dailyPeak: Number(dailyPeak), workingDays: Number(p.working_days) };
    for (const s of shown) row[s.key] = 0;
    byPeriod.set(p.period, row);
  }
  for (const c of data.cells) {
    if (c.kind !== kind) continue;
    const row = byPeriod.get(c.period);
    if (!row) continue;
    const key = other.has(c.key) ? OTHER_KEY : c.key;
    if (!(key in row)) continue;
    row[key] = round2(Number(row[key]) + Number(measure === "headcount" ? c.headcount : c.hours));
  }
  return { rows: [...byPeriod.values()], series: shown, peak: round2(peak) };
}

/** Labour cost vs BOQ value. Null when no labour hour could be priced (no rates). */
export function marginCheck(data: CostLoading): { labourCost: number; boqValue: number; ratioPct: number; pricedPct: number } | null {
  const m = data.margin;
  if (!m || !(Number(m.priced_hours) > 0)) return null;
  const boqValue = Number(data.meta.total_budget) || 0;
  const labourCost = Number(m.labour_cost) || 0;
  return {
    labourCost,
    boqValue,
    ratioPct: boqValue > 0 ? round2((labourCost / boqValue) * 100) : 0,
    pricedPct: Number(m.labour_hours) > 0 ? round2((Number(m.priced_hours) / Number(m.labour_hours)) * 100) : 0,
  };
}
