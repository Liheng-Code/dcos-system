// Module 10-01 Daily Reporting — what the Setup screen needs to show and edit
// a rule: its plain-language name, which of its parameters can be changed, and
// how the values typed into the form become the stored parameters. Pure.
//
// What a rule checks lives in rules.ts; its severity and parameters live in
// dr_rule_definitions. A project row overrides the global default.

import type { RuleSeverity } from "./types";

export interface RuleParamField {
  key: string;
  label: string;
  hint?: string;
  min: number;
  max?: number;
  step?: number;
  /** May be left empty, which stores null (the check is then off). */
  optional?: boolean;
}

export interface RuleSpec {
  code: string;
  label: string;
  description: string;
  /** Checked when the report is sent and blocks it. Shown, never editable per project. */
  intake?: boolean;
  fields?: RuleParamField[];
  /** Compares with the unit's approved history, so it has a minimum number of approved days. */
  usesHistory?: boolean;
  /** The project may choose between a warning and a blocking error. */
  severityEditable?: boolean;
  /** Has a list of allowed ranges per unit of measure. */
  uomRanges?: boolean;
}

export const RULE_CATALOG: RuleSpec[] = [
  { code: "REQ_FIELD", label: "Required fields", description: "A required section or field is empty.", intake: true },
  { code: "INV_UNIT", label: "Active unit", description: "The reporting unit is not active.", intake: true },
  { code: "INV_WBS", label: "Scope", description: "An activity is outside the unit's assigned scope.", intake: true },
  { code: "PROGRESS_MAX_100", label: "Progress 0–100%", description: "Cumulative progress is below 0 or above 100%.", intake: true },
  { code: "QTY_NEGATIVE", label: "No negative figures", description: "A quantity or a number of hours is negative.", intake: true },
  { code: "UOM_MISMATCH", label: "Unit of measure", description: "The unit of measure differs from the activity's.", intake: true },
  { code: "DATE_FUTURE", label: "Report date", description: "The report date is in the future.", intake: true },
  { code: "DUP_REPORT", label: "One report per day", description: "A report already exists for the unit and date.", intake: true },
  { code: "UNPLANNED_REASON", label: "Unplanned activity", description: "An activity that is not on the plan has no description or reason.", intake: true },
  { code: "EVIDENCE_MIN", label: "Minimum photos", description: "Fewer photos than the unit's policy. The number and severity are set on each reporting unit.", intake: true },
  { code: "LATE_SUBMIT", label: "Late report", description: "Submitted after the reporting deadline." },
  {
    code: "MANPOWER_BELOW_PLAN",
    label: "Manpower below plan",
    description: "Manpower on site is below a share of what was planned.",
    fields: [{ key: "threshold_pct", label: "Warn below (% of plan)", min: 1, max: 100 }],
  },
  { code: "PROGRESS_REGRESS", label: "Progress went down", description: "Progress is below the last approved figure and no remark explains it." },
  { code: "NEXT_DAY_MISSING_RESOURCE", label: "Next-day plan without manpower", description: "An activity planned for the next day has no manpower." },
  { code: "DELAY_NO_NOTICE_FLAG", label: "Delay without notice flag", description: "A delay with an employer-related cause is not marked as needing a contractual notice." },
  {
    code: "PROGRESS_JUMP",
    label: "Production jump",
    description: "The day's production is far above the activity's recent average.",
    usesHistory: true,
    fields: [
      { key: "multiplier", label: "Warn above (× average)", min: 1.1, step: 0.1 },
      { key: "window_days", label: "Days averaged", min: 2, max: 30 },
      { key: "min_samples", label: "Days of production needed", min: 1, max: 30 },
    ],
  },
  {
    code: "PRODUCTIVITY_ABNORMAL",
    label: "Abnormal productivity",
    description: "Output per worker is far from the activity's usual.",
    usesHistory: true,
    fields: [
      { key: "low_ratio", label: "Warn below (× usual)", min: 0.05, max: 1, step: 0.05 },
      { key: "high_ratio", label: "Warn above (× usual)", min: 1.1, step: 0.1 },
      { key: "window_days", label: "Days compared", min: 2, max: 30 },
      { key: "min_samples", label: "Days of production needed", min: 1, max: 30 },
    ],
  },
  {
    code: "QTY_RANGE",
    label: "Quantity range",
    description: "A quantity is outside the range set for its unit of measure, or progress rose by more than the daily limit. Does nothing until a limit is set.",
    severityEditable: true,
    uomRanges: true,
    fields: [{ key: "max_daily_progress_pct", label: "Largest rise in progress in one day (%)", hint: "Empty = no limit", min: 1, max: 100, optional: true }],
  },
  {
    code: "PHOTO_REUSE",
    label: "Photo reuse",
    description: "A new photo is the same as, or looks the same as, one the unit sent on an earlier report.",
    fields: [
      { key: "max_distance", label: "Sensitivity (0 = identical only, 10 = loose)", min: 0, max: 16 },
      { key: "lookback_days", label: "Days looked back", min: 1, max: 365 },
    ],
  },
];

export const ruleSpec = (code: string): RuleSpec | undefined => RULE_CATALOG.find((r) => r.code === code);

export interface UomRange {
  uom: string;
  min: string;
  max: string;
}

export interface RuleFormValues {
  is_active: boolean;
  severity: RuleSeverity;
  min_history_days: string;
  /** Field key -> what was typed. */
  fields: Record<string, string>;
  ranges: UomRange[];
}

const parse = (v: string): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** The form for a rule, filled from its stored definition. */
export function ruleFormValues(
  spec: RuleSpec,
  def: { is_active: boolean; severity: RuleSeverity; params: Record<string, unknown>; min_history_days?: number },
): RuleFormValues {
  const byUom = (def.params.by_uom ?? {}) as Record<string, { min?: number | null; max?: number | null }>;
  return {
    is_active: def.is_active,
    severity: def.severity,
    min_history_days: String(def.min_history_days ?? 0),
    fields: Object.fromEntries((spec.fields ?? []).map((f) => [f.key, def.params[f.key] === null || def.params[f.key] === undefined ? "" : String(def.params[f.key])])),
    ranges: Object.entries(byUom).map(([uom, r]) => ({ uom, min: r?.min == null ? "" : String(r.min), max: r?.max == null ? "" : String(r.max) })),
  };
}

export type RuleFormResult =
  | { ok: true; severity: RuleSeverity; is_active: boolean; min_history_days: number; params: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Checks what was typed and turns it into the stored definition. Parameters
 * the form does not show (for example the delay causes) are kept from `base`.
 */
export function ruleFormResult(spec: RuleSpec, values: RuleFormValues, base: Record<string, unknown> = {}): RuleFormResult {
  const params: Record<string, unknown> = { ...base };
  for (const f of spec.fields ?? []) {
    const n = parse(values.fields[f.key] ?? "");
    if (n === null) {
      if (!f.optional) return { ok: false, error: `${f.label}: enter a number.` };
      params[f.key] = null;
      continue;
    }
    if (Number.isNaN(n) || n < f.min || (f.max !== undefined && n > f.max)) {
      return { ok: false, error: `${f.label}: enter a number ${f.max !== undefined ? `between ${f.min} and ${f.max}` : `of ${f.min} or more`}.` };
    }
    params[f.key] = n;
  }

  if (spec.code === "PRODUCTIVITY_ABNORMAL" && Number(params.low_ratio) >= Number(params.high_ratio)) {
    return { ok: false, error: "The lower limit must be below the upper limit." };
  }

  if (spec.uomRanges) {
    const byUom: Record<string, { min: number | null; max: number | null }> = {};
    for (const r of values.ranges) {
      const uom = r.uom.trim();
      const min = parse(r.min);
      const max = parse(r.max);
      if (uom === "" && min === null && max === null) continue; // an empty row
      if (uom === "") return { ok: false, error: "A quantity range needs a unit of measure." };
      if (Object.keys(byUom).some((k) => k.toLowerCase() === uom.toLowerCase())) return { ok: false, error: `The unit ${uom} is listed twice.` };
      if (min === null && max === null) return { ok: false, error: `${uom}: enter a minimum, a maximum or both.` };
      if (Number.isNaN(min) || Number.isNaN(max) || (min !== null && min < 0) || (max !== null && max < 0)) {
        return { ok: false, error: `${uom}: the limits must be numbers of 0 or more.` };
      }
      if (min !== null && max !== null && min > max) return { ok: false, error: `${uom}: the minimum is above the maximum.` };
      byUom[uom] = { min, max };
    }
    params.by_uom = byUom;
  }

  let minHistory = 0;
  if (spec.usesHistory) {
    const n = parse(values.min_history_days);
    if (n === null || Number.isNaN(n) || !Number.isInteger(n) || n < 0 || n > 365) {
      return { ok: false, error: "Approved days needed: enter a whole number from 0 to 365." };
    }
    minHistory = n;
  }

  return {
    ok: true,
    severity: values.severity,
    is_active: values.is_active,
    min_history_days: minHistory,
    params,
  };
}
