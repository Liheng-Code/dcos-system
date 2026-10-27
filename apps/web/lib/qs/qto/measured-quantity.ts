// The item quantity that follows the drawing: the sum of an item's measurements, recorded as a normal
// calculation run with the ruleset's measured rule (AREA-MEAS, LEN-MEAS or COUNT). A run built this
// way is marked `auto`; once the user records their own calculation, measurements no longer change it.
import { calculate, type CalculationRun, type Factor } from "./calc-engine";
import type { QtoCalculationRunRow, RulesetDefinition } from "./types";

export interface MeasurementValue {
  measure_type: string;
  area: number | null;
  length: number | null;
  count: number | null;
}

const RULE_BY_UNIT: Record<string, { code: string; input: string }> = {
  m2: { code: "AREA-MEAS", input: "A" },
  m: { code: "LEN-MEAS", input: "L" },
  "No.": { code: "COUNT", input: "N" },
};

/** True when the run was made from the measurements (not by hand). */
export function isAutoRun(run: Pick<QtoCalculationRunRow, "inputs"> | null | undefined): boolean {
  return !!run && typeof run.inputs === "object" && run.inputs !== null && (run.inputs as { auto?: unknown }).auto === true;
}

/** The measurements that count for an item in `unit`. */
export function measuredValues(unit: string, measurements: MeasurementValue[]): number[] {
  if (unit === "m2") return measurements.filter((m) => m.measure_type === "area" && m.area !== null).map((m) => Number(m.area));
  if (unit === "No.") return measurements.filter((m) => m.measure_type === "count" && m.count !== null).map((m) => Number(m.count));
  if (unit === "m") {
    return measurements
      .filter((m) => m.measure_type !== "area" && m.measure_type !== "count" && m.measure_type !== "point" && m.length !== null)
      .map((m) => Number(m.length));
  }
  return [];
}

/**
 * The calculation for "quantity = sum of the drawing measurements", or null when the unit has no
 * measured rule (e.g. m3, which needs a formula). Factors already on the item are applied.
 */
export function measuredRun(args: {
  unit: string;
  measurements: MeasurementValue[];
  ruleset: RulesetDefinition | null;
  factors?: Factor[];
}): CalculationRun | null {
  const rule = RULE_BY_UNIT[args.unit];
  if (!rule) return null;
  const values = measuredValues(args.unit, args.measurements);
  const dp = args.unit === "No." ? 0 : 4;
  const inputs = (values.length ? values : [0]).map((v, i) => ({ name: `${rule.input}${i + 1}`, value: v.toFixed(dp), unit: args.unit }));
  const def = args.ruleset?.rules.find((r) => r.code === rule.code);
  const allowed = args.ruleset
    ? (def?.allowed_factors ? args.ruleset.factors.filter((f) => def.allowed_factors!.includes(f.name)) : args.ruleset.factors)
    : null;
  return calculate({
    ruleCode: rule.code,
    expression: inputs.map((i) => i.name).join(" + "),
    inputs,
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
