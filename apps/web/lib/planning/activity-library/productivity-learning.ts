// Productivity learning from site history (Phase 3.3). Pure: no database, no AI.
// Input = the site productivity logs that belong to one productivity standard; output = honest statistics, whether the
// sample is big enough to say anything, and a *proposal* for a new standard version. A human approves it.
//
// Rules agreed in docs/.../19-Activity-Library-Phase3-Plan.md section 3.3:
//   at least 5 usable logs, on at least 3 distinct days, from at least 2 distinct places (projects or WBS locations);
//   outliers beyond 3 scaled MADs of the median are excluded and reported, never silently dropped.

export interface HistoryLog {
  id: string;
  project_id: string;
  /** WBS node (level/zone) the work was on, when known */
  location_id: string | null;
  log_date: string;
  quantity_done: number | null;
  actual_hours: number | null;
  /** earned hours at the standard's labour constant; PI = earned / actual */
  productivity_index: number | null;
  pi_status: string;
}

export interface LearningThresholds {
  minLogs: number;
  minDays: number;
  minPlaces: number;
  madK: number;
  /** a proposal that moves the standard by more than this fraction is flagged for extra review */
  largeChange: number;
}

export const DEFAULT_THRESHOLDS: LearningThresholds = { minLogs: 5, minDays: 3, minPlaces: 2, madK: 3, largeChange: 0.3 };

export interface HistoryStats {
  totalLogs: number;
  /** logs with a usable productivity index and quantity */
  usable: number;
  kept: number;
  outliers: { id: string; pi: number }[];
  days: number;
  places: number;
  from: string | null;
  to: string | null;
  medianPi: number | null;
  meanPi: number | null;
  minPi: number | null;
  maxPi: number | null;
  /** scaled median absolute deviation of the kept indices */
  spread: number | null;
  /** sum of actual hours / sum of quantity over kept logs (man-hours per unit) */
  observedLabourConstant: number | null;
  checks: { enoughLogs: boolean; enoughDays: boolean; enoughPlaces: boolean };
  sufficient: boolean;
  /** why there is no proposal yet, in words a planner can act on */
  shortfall: string[];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function summariseHistory(logs: HistoryLog[], th: LearningThresholds = DEFAULT_THRESHOLDS): HistoryStats {
  const usableLogs = logs.filter(
    (l) => l.pi_status === "ok" && l.productivity_index != null && l.productivity_index > 0 && l.quantity_done != null && l.quantity_done > 0
      && l.actual_hours != null && l.actual_hours > 0,
  );
  const pis = usableLogs.map((l) => l.productivity_index as number);
  const med = median(pis);
  // scaled MAD (x1.4826) so the cut-off is comparable to a standard deviation
  const mad = med == null ? null : (median(pis.map((p) => Math.abs(p - med))) ?? 0) * 1.4826;
  const isOutlier = (p: number) => med != null && mad != null && mad > 0 && Math.abs(p - med) > th.madK * mad;

  const kept = usableLogs.filter((l) => !isOutlier(l.productivity_index as number));
  const outliers = usableLogs.filter((l) => isOutlier(l.productivity_index as number)).map((l) => ({ id: l.id, pi: r3(l.productivity_index as number) }));
  const keptPis = kept.map((l) => l.productivity_index as number);
  const keptMed = median(keptPis);
  const keptMad = keptMed == null ? null : (median(keptPis.map((p) => Math.abs(p - keptMed))) ?? 0) * 1.4826;

  const days = new Set(kept.map((l) => l.log_date)).size;
  const places = new Set(kept.map((l) => l.location_id ?? `project:${l.project_id}`)).size;
  const projects = new Set(kept.map((l) => l.project_id)).size;
  const dates = kept.map((l) => l.log_date).sort();

  const sumHours = kept.reduce((a, l) => a + (l.actual_hours as number), 0);
  const sumQty = kept.reduce((a, l) => a + (l.quantity_done as number), 0);

  const checks = {
    enoughLogs: kept.length >= th.minLogs,
    enoughDays: days >= th.minDays,
    enoughPlaces: Math.max(places, projects) >= th.minPlaces,
  };
  const shortfall: string[] = [];
  if (!checks.enoughLogs) shortfall.push(`${kept.length} usable log${kept.length === 1 ? "" : "s"}, need ${th.minLogs}`);
  if (!checks.enoughDays) shortfall.push(`${days} distinct day${days === 1 ? "" : "s"}, need ${th.minDays}`);
  if (!checks.enoughPlaces) shortfall.push(`${Math.max(places, projects)} place${Math.max(places, projects) === 1 ? "" : "s"}, need ${th.minPlaces}`);

  return {
    totalLogs: logs.length,
    usable: usableLogs.length,
    kept: kept.length,
    outliers,
    days, places,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    medianPi: keptMed == null ? null : r3(keptMed),
    meanPi: keptPis.length ? r3(keptPis.reduce((a, b) => a + b, 0) / keptPis.length) : null,
    minPi: keptPis.length ? r3(Math.min(...keptPis)) : null,
    maxPi: keptPis.length ? r3(Math.max(...keptPis)) : null,
    spread: keptMad == null ? null : r3(keptMad),
    observedLabourConstant: sumQty > 0 ? Math.round((sumHours / sumQty) * 10000) / 10000 : null,
    checks,
    sufficient: checks.enoughLogs && checks.enoughDays && checks.enoughPlaces,
    shortfall,
  };
}

export interface StandardFigures {
  labour_constant_hr_per_unit: number;
  output_per_day: number | null;
  version: number;
}

export interface Proposal {
  labour_constant_hr_per_unit: number;
  output_per_day: number | null;
  /** (proposed - current) / current of the labour constant; positive = slower than the standard */
  changeFraction: number;
  /** output per day moves the other way: positive = faster */
  outputChangeFraction: number | null;
  flaggedLarge: boolean;
  nextVersion: number;
  basisNote: string;
}

/** A proposal exists only when the sample is sufficient. The figures are the observed ones, never an average of guesses. */
export function proposeFromHistory(
  std: StandardFigures, stats: HistoryStats, th: LearningThresholds = DEFAULT_THRESHOLDS,
): Proposal | null {
  if (!stats.sufficient || stats.observedLabourConstant == null || !(std.labour_constant_hr_per_unit > 0)) return null;
  const lc = stats.observedLabourConstant;
  const change = (lc - std.labour_constant_hr_per_unit) / std.labour_constant_hr_per_unit;
  // the crew and day length stay as they are, so output per day scales inversely with the labour constant
  const out = std.output_per_day != null ? Math.round(((std.output_per_day * std.labour_constant_hr_per_unit) / lc) * 1000) / 1000 : null;
  return {
    labour_constant_hr_per_unit: lc,
    output_per_day: out,
    changeFraction: Math.round(change * 10000) / 10000,
    outputChangeFraction: out != null && std.output_per_day ? Math.round(((out - std.output_per_day) / std.output_per_day) * 10000) / 10000 : null,
    flaggedLarge: Math.abs(change) > th.largeChange,
    nextVersion: std.version + 1,
    basisNote:
      `CALIBRATED from ${stats.kept} site log(s) on ${stats.days} day(s) at ${stats.places} place(s), ${stats.from} to ${stats.to}: ` +
      `observed ${lc} man-hours/unit vs ${std.labour_constant_hr_per_unit} on version ${std.version}; ` +
      `median PI ${stats.medianPi}${stats.outliers.length ? `; ${stats.outliers.length} outlier log(s) excluded` : ""}. Requires approval.`,
  };
}
