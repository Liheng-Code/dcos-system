// Take-off calculation engine (Master Plan §10.1): raw inputs → validate → normalise →
// gross → deductions → net → authorised factors → rounding at the configured stage.
// Pure and deterministic: the same inputs and rules always give the same CalculationRun.
import {
  type Dec, type RoundingMode, DecimalError, ZERO, add, cmp, dec, mul, round, sub, toFixedString,
} from "./decimal";
import { type VariableInput, evaluate } from "./expression";
import { UnitError, describeDimension, dimensionOf, fromBase, normalizeUnit, sameDimension, toBase } from "./units";

export const ENGINE_VERSION = "qto-calc/1.0.0";
/** Storage precision of gross / deductions / net / result (numeric(18,4)). */
export const STORAGE_DP = 4;
const FACTOR_DP = 8;

export interface RoundingRule {
  /** "net": round net before factors; "final": round the result; "none": storage precision only. */
  stage: "net" | "final" | "none";
  dp: number;
  mode: RoundingMode;
}

export interface FactorRule {
  name: string;
  min: number;
  max: number;
}

export interface CalcInput {
  name: string;
  value: string | number;
  unit: string;
}

export interface Deduction {
  description: string;
  value: string | number;
  unit: string;
}

export interface Factor {
  name: string;
  value: string | number;
}

export interface CalculationRequest {
  ruleCode?: string | null;
  /** Formula over the input names. Without one, the single input is the gross quantity. */
  expression?: string | null;
  inputs: CalcInput[];
  deductions?: Deduction[];
  factors?: Factor[];
  outputUnit: string;
  rounding: RoundingRule;
  /** Factors the ruleset allows; when given, any other factor or value out of range is rejected. */
  allowedFactors?: FactorRule[] | null;
}

export interface CalculationRun {
  engine_version: string;
  rule_code: string | null;
  expression: string | null;
  inputs: { name: string; value: string; unit: string }[];
  deduction_lines: { description: string; value: string; unit: string }[];
  factors: { name: string; value: string }[];
  gross: string;
  deductions: string;
  net: string;
  factor_product: string;
  result: string;
  unit: string;
  rounding: RoundingRule;
  valid: boolean;
  errors: string[];
}

export function calculate(req: CalculationRequest): CalculationRun {
  const errors: string[] = [];
  const base: CalculationRun = {
    engine_version: ENGINE_VERSION,
    rule_code: req.ruleCode ?? null,
    expression: req.expression?.trim() || null,
    inputs: [],
    deduction_lines: [],
    factors: [],
    gross: "0",
    deductions: "0",
    net: "0",
    factor_product: "1",
    result: "0",
    unit: req.outputUnit,
    rounding: req.rounding,
    valid: false,
    errors,
  };
  const fail = (msg: string) => {
    errors.push(msg);
    return base;
  };

  try {
    // 1–2. Validate inputs and units.
    const unit = normalizeUnit(req.outputUnit);
    if (!unit) return fail(`Unknown output unit "${req.outputUnit}"`);
    base.unit = unit;
    const outDim = dimensionOf(unit);
    const vars: Record<string, VariableInput> = {};
    for (const i of req.inputs) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(i.name)) return fail(`Input name "${i.name}" is not valid`);
      if (i.name in vars) return fail(`Input "${i.name}" is given twice`);
      if (normalizeUnit(i.unit) === null) return fail(`Input "${i.name}" has an unknown unit "${i.unit}"`);
      let v: Dec;
      try { v = dec(i.value); } catch { return fail(`Input "${i.name}" is not a valid number`); }
      if (cmp(v, ZERO) < 0) return fail(`Input "${i.name}" cannot be negative`);
      vars[i.name] = { value: i.value, unit: i.unit };
      base.inputs.push({ name: i.name, value: toFixedString(v), unit: i.unit });
    }

    // 3–4. Normalise and calculate the gross quantity in the output unit.
    let grossBase: Dec;
    if (base.expression) {
      const r = evaluate(base.expression, vars);
      if (!r.ok) return fail(r.error);
      if (!sameDimension(r.value.dim, outDim)) {
        return fail(`The formula gives ${describeDimension(r.value.dim)} but the item is measured in ${unit} (${describeDimension(outDim)})`);
      }
      grossBase = r.value.value;
    } else {
      if (req.inputs.length !== 1) return fail("Give a formula, or exactly one measured input");
      const only = req.inputs[0];
      if (!sameDimension(dimensionOf(only.unit), outDim)) {
        return fail(`Input "${only.name}" is in ${only.unit} but the item is measured in ${unit}`);
      }
      grossBase = toBase(dec(only.value), only.unit);
    }
    const gross = round(fromBase(grossBase, unit), STORAGE_DP);
    if (cmp(gross, ZERO) < 0) return fail("The gross quantity is negative");

    // 5. Deductions, each converted to the output unit.
    let deductions = ZERO;
    for (const d of req.deductions ?? []) {
      if (normalizeUnit(d.unit) === null) return fail(`Deduction "${d.description}" has an unknown unit "${d.unit}"`);
      if (!sameDimension(dimensionOf(d.unit), outDim)) {
        return fail(`Deduction "${d.description}" is in ${d.unit}, which cannot be deducted from ${unit}`);
      }
      let v: Dec;
      try { v = dec(d.value); } catch { return fail(`Deduction "${d.description}" is not a valid number`); }
      if (cmp(v, ZERO) < 0) return fail(`Deduction "${d.description}" must be entered as a positive value`);
      const inOut = fromBase(toBase(v, d.unit), unit);
      deductions = add(deductions, inOut);
      base.deduction_lines.push({ description: d.description, value: toFixedString(v), unit: d.unit });
    }
    deductions = round(deductions, STORAGE_DP);

    // 6. Net quantity.
    let net = sub(gross, deductions);
    if (cmp(net, ZERO) < 0) return fail("Deductions exceed the gross quantity");
    base.gross = toFixedString(gross);
    base.deductions = toFixedString(deductions);
    if (req.rounding.stage === "net") net = round(net, req.rounding.dp, req.rounding.mode);

    // 7. Authorised factors only.
    let product = dec(1);
    for (const f of req.factors ?? []) {
      let v: Dec;
      try { v = dec(f.value); } catch { return fail(`Factor "${f.name}" is not a valid number`); }
      if (cmp(v, ZERO) <= 0) return fail(`Factor "${f.name}" must be greater than zero`);
      if (req.allowedFactors) {
        const rule = req.allowedFactors.find((r) => r.name.toLowerCase() === f.name.trim().toLowerCase());
        if (!rule) return fail(`Factor "${f.name}" is not authorised by the ruleset`);
        if (cmp(v, dec(rule.min)) < 0 || cmp(v, dec(rule.max)) > 0) {
          return fail(`Factor "${f.name}" = ${f.value} is outside the authorised range ${rule.min}–${rule.max}`);
        }
      }
      product = mul(product, v);
      base.factors.push({ name: f.name.trim(), value: toFixedString(v) });
    }
    product = round(product, FACTOR_DP);

    // 8. Rounding at the configured stage (and never finer than storage precision).
    let result = mul(net, product);
    if (req.rounding.stage === "final") result = round(result, req.rounding.dp, req.rounding.mode);
    result = round(result, STORAGE_DP);
    // net is stored at storage precision; gross − deductions = net holds by construction.
    base.net = toFixedString(sub(gross, deductions));
    if (req.rounding.stage === "net") base.net = toFixedString(round(net, STORAGE_DP));
    base.factor_product = toFixedString(product);
    base.result = toFixedString(result);
    base.valid = true;
    return base;
  } catch (e) {
    if (e instanceof UnitError || e instanceof DecimalError) return fail(e.message);
    throw e;
  }
}

/** The jsonb payload `qto_record_calculation` expects. */
export function toRunPayload(run: CalculationRun, meta?: Record<string, unknown>) {
  // The DB checks net = gross − deductions; with net-stage rounding the rounding difference is
  // carried as part of the deductions so the identity still holds.
  const gross = dec(run.gross);
  const net = dec(run.net);
  return {
    engine_version: run.engine_version,
    rule_code: run.rule_code,
    expression: run.expression,
    inputs: { values: run.inputs, deductions: run.deduction_lines, factors: run.factors, ...meta },
    gross: run.gross,
    deductions: toFixedString(sub(gross, net)),
    net: run.net,
    factor_product: run.factor_product,
    result: run.result,
    unit: run.unit,
    rounding: run.rounding,
    valid: run.valid,
    errors: run.errors,
  };
}
