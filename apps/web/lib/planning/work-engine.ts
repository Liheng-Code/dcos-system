// Work engine (Productivity plan, Phase 1) — turns QUANTITY + PRODUCTIVITY NORM into man-hours, crew and duration.
//
// Pure (no I/O, no React). It is a line-by-line mirror of the SQL function `plan_compute_work`
// (supabase/migrations/20260922000006_plan_task_work.sql), which is what the database stores. The UI uses this
// module for live previews while a user is typing, so the two MUST agree — `__tests__/work-engine.test.ts`
// pins the worked examples and `work-engine-parity` compares them on random inputs.
//
//   W  = quantity × labour constant                       man-hours (whole crew, before efficiency)
//   f  = norm efficiency × task adjustment                productivity factor
//   work_hours       = W / f
//   crew_required    = ceil( work_hours / (scheduled working days × H) )     workers to finish inside today's dates
//   duration_derived = ceil( work_hours / (crews × workers per crew × H) )   working days for the planned crew
//   crews_required   = crew_required / workers per crew
//
// H = productive hours per working day of the project calendar.

export type DurationMode = "manual" | "fixed_duration" | "fixed_crew";

export type CalcStatus =
  | "ok"
  | "missing_quantity"
  | "missing_unit"
  | "missing_norm"
  | "unit_mismatch"
  | "invalid_input"
  | "no_duration";

export interface WorkNorm {
  /** Output unit of the norm (m3, m2, kg …). */
  unit: string;
  /** Man-hours of the WHOLE crew per unit of output, before efficiency. */
  labourConstantHrPerUnit: number;
  /** Norm efficiency %, 100 = the norm as written. */
  efficiencyPct: number;
}

export interface WorkInput {
  quantity: number | null;
  quantityUnit: string | null;
  norm: WorkNorm | null;
  /** Task-level productivity adjustment %, 100 = none. */
  adjustPct: number;
  /** Labour workers in ONE standard crew of the norm (equipment excluded). */
  crewWorkers: number;
  /** Crews working in parallel. */
  crews: number;
  /** Calendar hours per working day; null/≤0 falls back to 8. */
  hoursPerDay: number | null;
  /** Scheduled duration in working days; null/0 = none (milestone or no dates). */
  currentDurationWd: number | null;
}

export interface WorkResult {
  workHours: number | null;
  productivityFactor: number | null;
  crewRequired: number | null;
  crewsRequired: number | null;
  durationWdDerived: number | null;
  status: CalcStatus;
  message: string | null;
}

export const DEFAULT_HOURS_PER_DAY = 8;
const EPS = 1e-9;

/** Round half away from zero to `dp` places (matches Postgres `round(numeric, dp)`). */
export function roundTo(n: number, dp: number): number {
  const m = 10 ** dp;
  return (Math.sign(n) * Math.round(Math.abs(n) * m + Number.EPSILON * m)) / m;
}

// ── units ────────────────────────────────────────────────────────────────────
// Must match public.plan_norm_unit().
const UNIT_ALIASES: Record<string, string> = {
  sqm: "m2", sqmt: "m2", sqmtr: "m2",
  cum: "m3", cbm: "m3", cubm: "m3",
  nos: "no", pcs: "no", pc: "no", ea: "no", each: "no", unit: "no", units: "no",
  tonne: "t", tonnes: "t", ton: "t", tons: "t", mt: "t",
  rm: "m", lm: "m", mtr: "m", meter: "m", metre: "m",
  kgs: "kg",
  lot: "ls", lumpsum: "ls", sum: "ls",
  hrs: "hr", hour: "hr", hours: "hr",
};

/** Canonical form of a unit so "m³", "M3", "cum" and "m3" all compare equal. Empty → null. */
export function normalizeUnit(unit: string | null | undefined): string | null {
  const u = (unit ?? "").trim().toLowerCase().replace(/²/g, "2").replace(/³/g, "3").replace(/[ .]/g, "");
  if (u === "") return null;
  return UNIT_ALIASES[u] ?? u;
}

export function sameUnit(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
}

// ── the calculation ──────────────────────────────────────────────────────────
const empty = (status: CalcStatus, message: string): WorkResult => ({
  workHours: null,
  productivityFactor: null,
  crewRequired: null,
  crewsRequired: null,
  durationWdDerived: null,
  status,
  message,
});

export function computeTaskWork(input: WorkInput): WorkResult {
  const { quantity, quantityUnit, norm } = input;

  if (quantity === null || quantity === undefined) return empty("missing_quantity", "No quantity entered");
  if (!quantityUnit || quantityUnit.trim() === "") return empty("missing_unit", "The quantity has no unit");
  if (!norm) return empty("missing_norm", "No productivity norm selected");
  if (normalizeUnit(quantityUnit) !== normalizeUnit(norm.unit)) {
    return empty("unit_mismatch", `Quantity is in ${quantityUnit} but the norm is per ${norm.unit}`);
  }

  const f = ((norm.efficiencyPct ?? 100) / 100) * ((input.adjustPct ?? 100) / 100);
  if (quantity < 0 || norm.labourConstantHrPerUnit <= 0 || f <= 0) {
    return empty("invalid_input", "Quantity, labour constant and efficiency must be positive");
  }

  const h = input.hoursPerDay != null && input.hoursPerDay > 0 ? input.hoursPerDay : DEFAULT_HOURS_PER_DAY;
  const w = (quantity * norm.labourConstantHrPerUnit) / f;

  // workers needed to finish inside the CURRENT scheduled duration
  const dur = input.currentDurationWd;
  const crewRequired =
    dur != null && dur > 0 ? (w === 0 ? 0 : Math.max(1, Math.ceil(w / (dur * h) - EPS))) : null;

  // working days for the PLANNED crew
  const totalWorkers = (input.crewWorkers ?? 0) * (input.crews ?? 1);
  const durationWdDerived =
    totalWorkers > 0 ? (w === 0 ? 0 : Math.max(1, Math.ceil(w / (totalWorkers * h) - EPS))) : null;

  const crewsRequired =
    crewRequired !== null && (input.crewWorkers ?? 0) > 0 ? roundTo(crewRequired / input.crewWorkers, 2) : null;

  let status: CalcStatus = "ok";
  let message: string | null = null;
  if (crewRequired === null && durationWdDerived === null) {
    status = "no_duration";
    message = "Task has no working-day duration and the norm has no labour crew";
  } else if (durationWdDerived === null) {
    message = "The norm has no labour crew lines, so a duration for a planned crew cannot be derived";
  } else if (crewRequired === null) {
    message = "Task has no working-day duration (milestone or no dates)";
  }

  return {
    workHours: roundTo(w, 2),
    productivityFactor: roundTo(f, 4),
    crewRequired,
    crewsRequired,
    durationWdDerived,
    status,
    message,
  };
}

// ── norm helpers (used by the norm editor) ───────────────────────────────────
/** Output of one standard crew per working day: crew workers × hours ÷ labour constant (× norm efficiency). */
export function outputPerCrewDay(args: {
  labourConstantHrPerUnit: number;
  crewWorkers: number;
  hoursPerDay?: number;
  efficiencyPct?: number;
}): number | null {
  const h = args.hoursPerDay && args.hoursPerDay > 0 ? args.hoursPerDay : DEFAULT_HOURS_PER_DAY;
  if (!(args.labourConstantHrPerUnit > 0) || !(args.crewWorkers > 0)) return null;
  return (args.crewWorkers * h * ((args.efficiencyPct ?? 100) / 100)) / args.labourConstantHrPerUnit;
}

/** The inverse: a crew and its daily output define the labour constant (man-hours per unit). */
export function labourConstantFromOutput(args: {
  crewWorkers: number;
  outputPerDay: number;
  hoursPerDay?: number;
}): number | null {
  const h = args.hoursPerDay && args.hoursPerDay > 0 ? args.hoursPerDay : DEFAULT_HOURS_PER_DAY;
  if (!(args.crewWorkers > 0) || !(args.outputPerDay > 0)) return null;
  return (args.crewWorkers * h) / args.outputPerDay;
}

/** Man-hours per unit split by trade, in proportion to the crew (workers of each labour line ÷ total). */
export function tradeShares(lines: { roleLabel: string; workersPerCrew: number }[], labourConstant: number) {
  const total = lines.reduce((s, l) => s + l.workersPerCrew, 0);
  return lines.map((l) => ({
    roleLabel: l.roleLabel,
    hrPerUnit: total > 0 ? (labourConstant * l.workersPerCrew) / total : 0,
  }));
}
