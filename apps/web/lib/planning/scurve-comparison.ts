import type { ScurvePoint } from "@/lib/schedule-service";
import type { TaskSnapshot } from "@/lib/planning/schedule-comparison-service";
import { parseISO, toISO } from "@/lib/planning/work-calendar";

const DAY_MS = 86_400_000;
const MAX_PERIODS = 6000;

/** Signed calendar-day distance a − b, both "YYYY-MM-DD". */
const days = (a: string, b: string): number =>
  (parseISO(a).getTime() - parseISO(b).getTime()) / DAY_MS;

const round2 = (x: number): number => Math.round(x * 100) / 100;

/** The Monday on/before `iso` — equivalent to Postgres `date_trunc('week')`. */
function mondayOf(iso: string): string {
  const back = (parseISO(iso).getUTCDay() + 6) % 7; // days since Monday (Sun=0)
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() - back);
  return toISO(d);
}

/** Fraction of a task complete by `d` — matches the SQL `get_scurve_series` CTE. */
function fraction(d: string, bs: string, bf: string): number {
  if (days(bf, bs) <= 0) return days(d, bf) >= 0 ? 1 : 0; // milestone / zero-length
  if (days(d, bf) >= 0) return 1;
  if (days(d, bs) <= 0) return 0;
  return days(d, bs) / days(bf, bs);
}

export interface ComparisonCurve {
  /** Cumulative planned (BCWS) points — `pct` 0..100 @2dp, `value` = cumulative cost @2dp. */
  planned: ScurvePoint[];
  bacCost: number;
  /** Any task in the source carries a budget cost. */
  hasCost: boolean;
  weightBasis: "cost" | "duration" | "equal";
  windowStart: string | null;
  windowEnd: string | null;
  /** Tasks with BOTH a start and an end date. */
  taskCount: number;
}

const EMPTY: ComparisonCurve = {
  planned: [],
  bacCost: 0,
  hasCost: false,
  weightBasis: "equal",
  windowStart: null,
  windowEnd: null,
  taskCount: 0,
};

interface CurveTask {
  bs: string;
  bf: string;
  cost: number;
  w: number;
}

/**
 * Cumulative planned (BCWS) S-curve from a per-task `{ start, end, cost }` snapshot —
 * a TypeScript port of the planned CTE in SQL `get_scurve_series`
 * (supabase/migrations/20260908000001_scurve_series.sql). Used to overlay a saved
 * schedule revision / baseline onto the S-Curve & EVM chart, fed by
 * `resolveSource()` from schedule-comparison-service.
 *
 * Deviation from the live curve: the mid-weight fallback here is `end − start`
 * calendar span, because a snapshot carries no `duration_days`. Identical results
 * for cost-weighted projects (the common case).
 *
 * When `opts.sampleDates` is given, the curve is evaluated at those dates (clamped
 * to the source's window) so the overlay's x-points line up with the live planned
 * line; it falls back to generated weekly/monthly periods when fewer than 2 of the
 * sample dates land inside the window.
 */
export function buildComparisonCurve(
  map: Map<string, TaskSnapshot>,
  opts?: { sampleDates?: string[] },
): ComparisonCurve {
  const rows: CurveTask[] = [];
  for (const v of map.values()) {
    if (!v.start || !v.end) continue;
    rows.push({ bs: v.start, bf: v.end, cost: v.cost ?? 0, w: 0 });
  }
  if (rows.length === 0) return EMPTY;

  const hasCost = rows.some((t) => t.cost > 0);
  const weightBasis: ComparisonCurve["weightBasis"] = hasCost ? "cost" : "duration";
  for (const t of rows) {
    t.w = hasCost ? t.cost : Math.max(1, days(t.bf, t.bs) + 1);
  }

  const wStart = rows.reduce((m, t) => (t.bs < m ? t.bs : m), rows[0].bs);
  const wEnd = rows.reduce((m, t) => (t.bf > m ? t.bf : m), rows[0].bf);
  const sumW = rows.reduce((s, t) => s + t.w, 0);
  const bacCost = rows.reduce((s, t) => s + t.cost, 0);

  // ── period dates
  let dates: string[] = [];
  if (opts?.sampleDates && opts.sampleDates.length) {
    const set = new Set<string>();
    for (const d of [...opts.sampleDates, wEnd]) {
      if (d >= wStart && d <= wEnd) set.add(d);
    }
    dates = [...set].sort();
  }
  if (dates.length < 2) {
    const monthly = days(wEnd, wStart) > 1095;
    const out = new Set<string>();
    let cur = mondayOf(wStart);
    for (let i = 0; i < MAX_PERIODS && cur <= wEnd; i++) {
      out.add(cur);
      const d = parseISO(cur);
      if (monthly) d.setUTCMonth(d.getUTCMonth() + 1);
      else d.setUTCDate(d.getUTCDate() + 7);
      cur = toISO(d);
    }
    out.add(wEnd);
    dates = [...out].sort();
  }

  const planned: ScurvePoint[] = dates.map((d) => {
    let pw = 0;
    let pv = 0;
    for (const t of rows) {
      const f = fraction(d, t.bs, t.bf);
      pw += t.w * f;
      pv += t.cost * f;
    }
    return {
      date: d,
      pct: sumW > 0 ? round2((pw / sumW) * 100) : 0,
      value: round2(pv),
    };
  });

  return {
    planned,
    bacCost: round2(bacCost),
    hasCost,
    weightBasis,
    windowStart: wStart,
    windowEnd: wEnd,
    taskCount: rows.length,
  };
}

/** Linear-interpolate `pct` or `value` at an arbitrary ISO date; clamps to endpoints. */
export function curveValueAt(
  curve: ComparisonCurve,
  iso: string,
  field: "pct" | "value",
): number | null {
  const pts = curve.planned;
  if (pts.length === 0) return null;
  if (iso <= pts[0].date) return pts[0][field];
  if (iso >= pts[pts.length - 1].date) return pts[pts.length - 1][field];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (iso <= b.date) {
      const av = a[field] ?? 0;
      const bv = b[field] ?? 0;
      const span = days(b.date, a.date);
      if (span <= 0) return bv;
      return av + (bv - av) * (days(iso, a.date) / span);
    }
  }
  return pts[pts.length - 1][field];
}

/**
 * The date at which the comparison plan reaches `pct` — for "N days ahead/behind"
 * vs the current earned %. `null` when the curve never crosses `pct` (e.g. `pct`
 * above the plan's final value, or `pct <= 0`).
 */
export function curveDateAtPct(curve: ComparisonCurve, pct: number): string | null {
  const pts = curve.planned;
  if (pts.length === 0 || pct <= 0) return null;
  if (pct <= (pts[0].pct ?? 0)) return pts[0].date;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const ap = a.pct ?? 0;
    const bp = b.pct ?? 0;
    if (pct <= bp) {
      if (bp <= ap) return b.date;
      const t = (pct - ap) / (bp - ap);
      const ms =
        parseISO(a.date).getTime() +
        t * (parseISO(b.date).getTime() - parseISO(a.date).getTime());
      return toISO(new Date(ms));
    }
  }
  return null;
}
