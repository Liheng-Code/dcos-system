// Forecast snapshots over time (doc 35 F5; PRD FR-109/110/112). Pure, no I/O.
// A snapshot is the forecast as recorded (plan_forecast_snapshots), with the planner's assumptions. The trend shows how
// the forecast finish moved between records; comparing two snapshots shows which activities moved.

export interface ForecastSnapshot {
  id: string;
  period: string;
  label: string | null;
  data_date: string | null;
  forecast_finish: string | null;
  baseline_finish: string | null;
  contract_finish: string | null;
  variance_wd: number | null;
  progress_pct: number | null;
  planned_pct: number | null;
  critical_count: number | null;
  task_count: number | null;
  open_delays: number | null;
  open_delay_days: number | null;
  assumptions: string;
  basis: {
    calculation_id?: string | null;
    calculated_at?: string | null;
    engine_version?: string | null;
    input_hash?: string | null;
    calculation_current?: boolean;
    calendar?: { name: string; hours_per_day: number | null; week: string } | null;
    recoveries_applied?: { id: string; name: string; applied_at: string }[];
  };
  milestones: { id: string; code: string; name: string; forecast: string | null; baseline: string | null }[];
  captured_by: string | null;
  captured_at: string;
}

/** [id, start, finish, progress] per activity, as stored. */
export type SnapshotTask = [string, string | null, string | null, number | null];

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export interface TrendRow {
  id: string;
  at: string;
  label: string;
  dataDate: string | null;
  forecast: string | null;
  baseline: string | null;
  contract: string | null;
  /** calendar days the forecast finish moved since the previous record (positive = later) */
  driftDays: number | null;
  /** calendar days late against the contract completion (positive = late) */
  lateVsContractDays: number | null;
  varianceWd: number | null;
  progress: number | null;
  planned: number | null;
}

export function forecastTrend(snaps: ForecastSnapshot[]): TrendRow[] {
  const sorted = [...snaps].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  return sorted.map((s, i) => {
    const prev = i > 0 ? sorted[i - 1].forecast_finish : null;
    return {
      id: s.id,
      at: s.captured_at,
      label: s.label ?? s.period,
      dataDate: s.data_date,
      forecast: s.forecast_finish,
      baseline: s.baseline_finish,
      contract: s.contract_finish,
      driftDays: prev && s.forecast_finish ? days(prev, s.forecast_finish) : null,
      lateVsContractDays: s.contract_finish && s.forecast_finish ? days(s.contract_finish, s.forecast_finish) : null,
      varianceWd: s.variance_wd,
      progress: s.progress_pct == null ? null : Number(s.progress_pct),
      planned: s.planned_pct == null ? null : Number(s.planned_pct),
    };
  });
}

export interface MovedTask {
  id: string;
  fromFinish: string | null;
  toFinish: string | null;
  /** calendar days (positive = later); null when the activity is only in one snapshot or has no finish */
  days: number | null;
  change: "moved" | "added" | "removed";
}

/** Activities whose finish moved between two snapshots (older `a`, newer `b`), largest move first. */
export function compareSnapshots(a: SnapshotTask[], b: SnapshotTask[], limit = 50): { moved: MovedTask[]; later: number; earlier: number; added: number; removed: number } {
  const before = new Map(a.map((t) => [t[0], t]));
  const after = new Map(b.map((t) => [t[0], t]));
  const moved: MovedTask[] = [];
  let later = 0, earlier = 0, added = 0, removed = 0;
  for (const [id, t] of after) {
    const o = before.get(id);
    if (!o) { added++; moved.push({ id, fromFinish: null, toFinish: t[2], days: null, change: "added" }); continue; }
    if (o[2] && t[2] && o[2] !== t[2]) {
      const d = days(o[2], t[2]);
      if (d > 0) later++; else earlier++;
      moved.push({ id, fromFinish: o[2], toFinish: t[2], days: d, change: "moved" });
    }
  }
  for (const [id, o] of before) if (!after.has(id)) { removed++; moved.push({ id, fromFinish: o[2], toFinish: null, days: null, change: "removed" }); }
  moved.sort((x, y) => Math.abs(y.days ?? 0) - Math.abs(x.days ?? 0) || x.id.localeCompare(y.id));
  return { moved: moved.slice(0, limit), later, earlier, added, removed };
}

/** True when nothing was recorded for the period of `today` (YYYY-MM): the page offers to record one. */
export function periodMissing(snaps: ForecastSnapshot[], today: string): boolean {
  const period = today.slice(0, 7);
  return !snaps.some((s) => s.period === period);
}
