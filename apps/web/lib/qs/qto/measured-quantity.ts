// The item quantity that follows the drawing: the sum of an item's measurements, recorded as a normal
// calculation run with the ruleset's measured rule (AREA-MEAS, LEN-MEAS, COUNT), or for volumes
// VOL-AT (Σ areas × depth) and VOL-LWD (Σ lengths × width × depth). A run built this way is marked
// `auto` and carries its volume dimensions, so later measurements reuse them; once the user records
// their own calculation, measurements no longer change it.
import { calculate, type CalculationRun, type Factor } from "./calc-engine";
import type { QtoCalculationRunRow, RulesetDefinition } from "./types";

export interface MeasurementValue {
  measure_type: string;
  area: number | null;
  length: number | null;
  count: number | null;
}

/** How a volume item turns drawing measurements into m³. Dimensions are in metres, as decimal strings. */
export type VolumeSpec =
  | { mode: "area_depth"; depth: string }
  | { mode: "length_width_depth"; width: string; depth: string };

export const VOLUME_LABEL: Record<VolumeSpec["mode"], string> = {
  area_depth: "Volume: area × depth",
  length_width_depth: "Volume: length × width × depth",
};

const RULE_BY_UNIT: Record<string, { code: string; input: string }> = {
  m2: { code: "AREA-MEAS", input: "A" },
  m: { code: "LEN-MEAS", input: "L" },
  "No.": { code: "COUNT", input: "N" },
};

/** True when the run was made from the measurements (not by hand). */
export function isAutoRun(run: Pick<QtoCalculationRunRow, "inputs"> | null | undefined): boolean {
  return !!run && typeof run.inputs === "object" && run.inputs !== null && (run.inputs as { auto?: unknown }).auto === true;
}

/** The volume dimensions recorded on an automatic run, if any. */
export function volumeOf(run: Pick<QtoCalculationRunRow, "inputs"> | null | undefined): VolumeSpec | null {
  if (!isAutoRun(run)) return null;
  const v = (run!.inputs as { volume?: VolumeSpec }).volume;
  return v && (v.mode === "area_depth" || v.mode === "length_width_depth") ? v : null;
}

const isPositive = (s: string | undefined) => !!s && Number.isFinite(Number(s)) && Number(s) > 0;

export function validVolume(v: VolumeSpec | null | undefined): v is VolumeSpec {
  if (!v) return false;
  return v.mode === "area_depth" ? isPositive(v.depth) : isPositive(v.width) && isPositive(v.depth);
}

/** The measurements that count for an item in `unit` (for m³, the volume mode decides). */
export function measuredValues(unit: string, measurements: MeasurementValue[], volume?: VolumeSpec | null): number[] {
  const areas = () => measurements.filter((m) => m.measure_type === "area" && m.area !== null).map((m) => Number(m.area));
  const lengths = () => measurements
    .filter((m) => m.measure_type !== "area" && m.measure_type !== "count" && m.measure_type !== "point" && m.length !== null)
    .map((m) => Number(m.length));
  if (unit === "m2") return areas();
  if (unit === "m") return lengths();
  if (unit === "No.") return measurements.filter((m) => m.measure_type === "count" && m.count !== null).map((m) => Number(m.count));
  if (unit === "m3" && volume) return volume.mode === "area_depth" ? areas() : lengths();
  return [];
}

/** Sum of the measurements that drive an item (areas or lengths for a volume), for display. */
export function measuredBase(unit: string, measurements: MeasurementValue[], volume?: VolumeSpec | null): number {
  return measuredValues(unit, measurements, volume).reduce((a, b) => a + b, 0);
}

/**
 * The calculation for "quantity follows the drawing", or null when it cannot be built (a unit with
 * no measured rule, or a volume without valid dimensions). Factors already on the item are applied.
 */
export function measuredRun(args: {
  unit: string;
  measurements: MeasurementValue[];
  ruleset: RulesetDefinition | null;
  factors?: Factor[];
  volume?: VolumeSpec | null;
}): CalculationRun | null {
  let ruleCode: string;
  let prefix: string;
  let baseUnit: string;
  let extra: { name: string; value: string; unit: string }[] = [];
  let wrap = (sum: string) => sum;
  if (args.unit === "m3") {
    if (!validVolume(args.volume)) return null;
    const v = args.volume;
    if (v.mode === "area_depth") {
      ruleCode = "VOL-AT"; prefix = "A"; baseUnit = "m2";
      extra = [{ name: "T", value: v.depth, unit: "m" }];
      wrap = (sum) => `(${sum}) * T`;
    } else {
      ruleCode = "VOL-LWD"; prefix = "L"; baseUnit = "m";
      extra = [{ name: "W", value: v.width, unit: "m" }, { name: "D", value: v.depth, unit: "m" }];
      wrap = (sum) => `(${sum}) * W * D`;
    }
  } else {
    const rule = RULE_BY_UNIT[args.unit];
    if (!rule) return null;
    ruleCode = rule.code; prefix = rule.input; baseUnit = args.unit;
  }
  const values = measuredValues(args.unit, args.measurements, args.volume);
  const dp = baseUnit === "No." ? 0 : 4;
  const inputs = (values.length ? values : [0]).map((v, i) => ({ name: `${prefix}${i + 1}`, value: v.toFixed(dp), unit: baseUnit }));
  const def = args.ruleset?.rules.find((r) => r.code === ruleCode);
  const allowed = args.ruleset
    ? (def?.allowed_factors ? args.ruleset.factors.filter((f) => def.allowed_factors!.includes(f.name)) : args.ruleset.factors)
    : null;
  return calculate({
    ruleCode,
    expression: wrap(inputs.map((i) => i.name).join(" + ")),
    inputs: [...inputs, ...extra],
    factors: args.factors ?? [],
    outputUnit: args.unit,
    rounding: args.ruleset?.rounding ?? { stage: "final", dp: 3, mode: "half_up" },
    allowedFactors: allowed,
  });
}

/** Quantities are shown to 2 decimals (stored values keep the ruleset precision). */
export function fmtQty(n: number | string | null | undefined, dp = 2): string {
  const v = Number(n ?? 0);
  return (Number.isFinite(v) ? v : 0).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
