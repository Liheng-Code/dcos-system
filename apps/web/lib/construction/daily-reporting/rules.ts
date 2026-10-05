// Module 10-01 Daily Reporting — rules engine (design §10).
// Deterministic and pure: the same function runs live in the form and again in
// the submit route, so what the reporter sees is what the server enforces.
// Severity and parameters come from dr_rule_definitions (data, not code); a
// project row overrides the global default for the same rule_code.

import {
  ALWAYS_REQUIRED_SECTIONS,
  type CustomField,
  type DrPayload,
  type EvidenceRef,
  type FormActivity,
  type HistoryDay,
  type ReportKind,
  type ReportingUnit,
  type RuleDefinition,
  type RuleResult,
  type RuleSeverity,
  type SectionKey,
  type UnitHistory,
} from "./types";

export interface RuleInput {
  payload: DrPayload;
  reportKind: ReportKind;
  /** yyyy-mm-dd */
  reportDate: string;
  /** Today in the project's time zone, yyyy-mm-dd. */
  todayLocal: string;
  unit: Pick<ReportingUnit, "status" | "required_sections" | "evidence_min_policy">;
  /** Activities the unit may report on (already filtered to its WBS scope). */
  activities: Pick<FormActivity, "task_id" | "quantity_unit">[];
  evidence: Pick<EvidenceRef, "target_section" | "target_line_id">[];
  rules: RuleDefinition[];
  /** A report already exists for this unit and date and this is not a correction of it. */
  duplicate?: boolean;
  /** Submitted after the unit's deadline. */
  late?: boolean;
  previousNextDay?: DrPayload["next_day"];
  approvedProgress?: Record<string, number>;
  knownUom?: Record<string, string>;
  /** Approved history of the unit. Without it the statistical rules stay silent. */
  history?: UnitHistory;
  /** The unit's custom fields; required ones must be filled and values must fit their type. */
  customFields?: CustomField[];
}

/** Global defaults overlaid with this project's overrides; inactive rules dropped. */
export function resolveRules(defs: RuleDefinition[], projectId: string | null): Map<string, RuleDefinition> {
  const out = new Map<string, RuleDefinition>();
  for (const d of defs) if (d.project_id === null) out.set(d.rule_code, d);
  for (const d of defs) if (d.project_id !== null && d.project_id === projectId) out.set(d.rule_code, d);
  for (const [code, d] of out) if (!d.is_active) out.delete(code);
  return out;
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const sameUom = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const round1 = (n: number) => Math.round(n * 10) / 10;
const positiveParam = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface Sample {
  value: number;
  headcount: number | null;
}

/**
 * What one activity produced per approved day, oldest first. Quantity is used
 * when today's line and enough history carry one in the same unit; otherwise
 * the gain in cumulative %. Days with no production are left out, so a pause
 * does not lower the baseline.
 */
function productionSeries(
  days: HistoryDay[],
  today: { qty: number | null; uom: string | null; gain: number | null; headcount: number | null },
  minSamples: number,
): { measure: "qty" | "progress"; unit: string; samples: Sample[]; today: Sample } | null {
  if (today.qty !== null && today.uom) {
    const samples = days
      .filter((d) => typeof d.qty === "number" && d.qty > 0 && !!d.uom && sameUom(d.uom, today.uom as string))
      .map((d) => ({ value: d.qty as number, headcount: d.headcount }));
    if (samples.length >= minSamples) {
      return { measure: "qty", unit: today.uom, samples, today: { value: today.qty, headcount: today.headcount } };
    }
  }
  if (today.gain === null) return null;
  const samples: Sample[] = [];
  let previous: number | null = null;
  for (const d of days) {
    if (typeof d.progress !== "number") continue;
    if (previous !== null && d.progress > previous) samples.push({ value: d.progress - previous, headcount: d.headcount });
    previous = d.progress;
  }
  if (samples.length < minSamples) return null;
  return { measure: "progress", unit: "%", samples, today: { value: today.gain, headcount: today.headcount } };
}

export function evaluateRules(input: RuleInput): RuleResult[] {
  const { payload: p, unit } = input;
  const defs = new Map(input.rules.map((r) => [r.rule_code, r]));
  const results: RuleResult[] = [];

  const fail = (
    code: string,
    message: string,
    target: RuleResult["target"] = {},
    params: Record<string, unknown> = {},
    severityOverride?: RuleSeverity,
  ) => {
    const def = defs.get(code);
    if (!def) return; // rule switched off or not defined
    results.push({
      rule_code: code,
      rule_version: def.version,
      status: "FAILED",
      severity: severityOverride ?? def.severity,
      message,
      params,
      target,
    });
  };
  /** A rule that needs history runs only once the unit has enough approved days (design §10.3). */
  const ready = (code: string) => {
    const def = defs.get(code);
    return !!def && (def.min_history_days ?? 0) <= (input.history?.approved_days ?? 0);
  };

  if (unit.status !== "Active") fail("INV_UNIT", "This reporting unit is not active.", { section: "header" });
  if (input.reportDate > input.todayLocal) {
    fail("DATE_FUTURE", "The report date is in the future.", { section: "header" });
  }
  if (input.duplicate) {
    fail("DUP_REPORT", "A report already exists for this unit and date.", { section: "header" });
  }
  if (input.late) fail("LATE_SUBMIT", "Submitted after the reporting deadline.", { section: "header" });

  if (input.reportKind === "NO_WORK") {
    if (blank(p.no_work_reason)) {
      fail("REQ_FIELD", "Give the reason there was no work today.", { section: "header" });
    }
    return results;
  }

  // ── REQ_FIELD ────────────────────────────────────────────────────────────
  const required = new Set<SectionKey>([...ALWAYS_REQUIRED_SECTIONS, ...(unit.required_sections ?? [])]);
  const need = (section: SectionKey, ok: boolean, message: string) => {
    if (required.has(section) && !ok) fail("REQ_FIELD", message, { section });
  };
  need("weather", !blank(p.weather?.condition), "Weather condition is required.");
  need("manpower", p.manpower.length > 0, "Add at least one manpower line.");
  need("activities", p.activities.length > 0, "Add at least one activity.");
  need("safety", p.safety?.toolbox_talk_held === true || p.safety?.toolbox_talk_held === false,
    "State whether a toolbox talk was held.");
  need("next_day", p.next_day.length > 0, "Add the plan for the next day.");
  need("equipment", p.equipment.length > 0, "Add at least one equipment line.");
  need("materials", p.materials.length > 0, "Add at least one material line.");

  for (const f of input.customFields ?? []) {
    const value = p.custom_fields?.[f.key];
    const target = { section: "header" as const };
    if (blank(value)) {
      if (f.required) fail("REQ_FIELD", `${f.label} is required.`, target, { field: f.key });
    } else if (f.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      fail("REQ_FIELD", `${f.label} must be a number.`, target, { field: f.key });
    } else if (f.type === "select" && !(f.options ?? []).includes(String(value))) {
      fail("REQ_FIELD", `${f.label}: choose one of the listed options.`, target, { field: f.key });
    }
  }

  for (const m of p.manpower) {
    if (blank(m.trade)) fail("REQ_FIELD", "Manpower line needs a trade.", { section: "manpower", line_id: m.line_id });
    if (m.reported_count === null || m.reported_count === undefined) {
      fail("REQ_FIELD", "Manpower line needs a headcount.", { section: "manpower", line_id: m.line_id });
    }
  }
  for (const d of p.delays) {
    if (blank(d.description)) fail("REQ_FIELD", "Describe the delay event.", { section: "delays", line_id: d.line_id });
  }
  for (const i of p.issues) {
    if (blank(i.description)) fail("REQ_FIELD", "Describe the issue.", { section: "issues", line_id: i.line_id });
  }
  for (const i of p.instructions) {
    if (blank(i.description)) {
      fail("REQ_FIELD", "Describe the instruction received.", { section: "instructions", line_id: i.line_id });
    }
  }
  for (const e of p.equipment) {
    if (blank(e.equipment_type)) fail("REQ_FIELD", "Equipment line needs a type.", { section: "equipment", line_id: e.line_id });
  }
  for (const m of p.materials) {
    if (blank(m.description)) fail("REQ_FIELD", "Material line needs a description.", { section: "materials", line_id: m.line_id });
  }

  // ── Activities ───────────────────────────────────────────────────────────
  const allowed = new Map(input.activities.map((a) => [a.task_id, a]));
  for (const a of p.activities) {
    const target = { section: "activities" as const, line_id: a.line_id };

    if (a.task_id) {
      const planned = allowed.get(a.task_id);
      if (!planned) {
        fail("INV_WBS", "This activity is outside the unit's assigned scope.", target, { task_id: a.task_id });
      } else {
        const expected = planned.quantity_unit ?? input.knownUom?.[a.task_id] ?? null;
        if (expected && !blank(a.uom) && !sameUom(expected, a.uom as string)) {
          fail("UOM_MISMATCH", `Unit of measure should be ${expected}.`, target, { expected, reported: a.uom });
        }
      }
    } else if (!a.unplanned || blank(a.unplanned_reason) || blank(a.free_text_activity)) {
      fail("UNPLANNED_REASON", "An activity that is not on the plan needs a description and a reason.", target);
    }

    if (a.progress_today === null || a.progress_today === undefined) {
      fail("REQ_FIELD", "Enter the progress for this activity.", target);
    } else if (a.progress_today > 100 || a.progress_today < 0) {
      fail("PROGRESS_MAX_100", "Cumulative progress must be between 0 and 100%.", target, { reported: a.progress_today });
    } else if (a.task_id) {
      const approved = input.approvedProgress?.[a.task_id];
      if (approved !== undefined && a.progress_today < approved && blank(a.remarks)) {
        fail("PROGRESS_REGRESS", `Progress is below the approved ${approved}% with no explanation.`, target, {
          approved,
          reported: a.progress_today,
        });
      }
    }
    if (!blank(a.reported_qty) && blank(a.uom)) {
      fail("REQ_FIELD", "A quantity needs a unit of measure.", target);
    }
  }

  // ── Statistical rules (design §10.3) ─────────────────────────────────────
  // Compared with the unit's own approved history. Deterministic, and silent
  // until the unit has the minimum number of approved days.
  const jump = defs.get("PROGRESS_JUMP")?.params ?? {};
  const band = defs.get("PRODUCTIVITY_ABNORMAL")?.params ?? {};
  const range = defs.get("QTY_RANGE")?.params ?? {};
  for (const a of p.activities) {
    const target = { section: "activities" as const, line_id: a.line_id };
    const qty = typeof a.reported_qty === "number" ? a.reported_qty : null;
    const approved = a.task_id ? input.approvedProgress?.[a.task_id] : undefined;
    const base = approved ?? (typeof a.progress_before === "number" ? a.progress_before : null);
    const gain = typeof a.progress_today === "number" && base !== null ? a.progress_today - base : null;

    if (ready("QTY_RANGE")) {
      const byUom = (range.by_uom ?? {}) as Record<string, { min?: number; max?: number }>;
      const key = a.uom ? Object.keys(byUom).find((k) => sameUom(k, a.uom as string)) : undefined;
      const limits = key ? byUom[key] : undefined;
      if (qty !== null && limits) {
        const below = typeof limits.min === "number" && qty < limits.min;
        const above = typeof limits.max === "number" && qty > limits.max;
        if (below || above) {
          fail("QTY_RANGE", `Quantity ${qty} ${a.uom} is ${below ? `below the minimum ${limits.min}` : `above the maximum ${limits.max}`} set for one day.`,
            target, { reported: qty, uom: a.uom, min: limits.min ?? null, max: limits.max ?? null });
        }
      }
      const maxGain = range.max_daily_progress_pct;
      if (typeof maxGain === "number" && gain !== null && gain > maxGain) {
        fail("QTY_RANGE", `Progress rose ${round1(gain)}% in one day; the limit set for one day is ${maxGain}%.`,
          target, { reported: round1(gain), max: maxGain, measure: "progress" });
      }
    }

    const days = a.task_id ? input.history?.tasks[a.task_id] : undefined;
    if (!days || days.length === 0) continue;
    const today = { qty, uom: a.uom ?? null, gain, headcount: typeof a.headcount === "number" ? a.headcount : null };

    if (ready("PROGRESS_JUMP")) {
      const windowDays = positiveParam(jump.window_days, 10);
      const multiplier = positiveParam(jump.multiplier, 3);
      const series = productionSeries(days.slice(-windowDays), today, positiveParam(jump.min_samples, 3));
      if (series && series.today.value > 0) {
        const baseline = series.samples.reduce((s, x) => s + x.value, 0) / series.samples.length;
        if (series.today.value > baseline * multiplier) {
          fail("PROGRESS_JUMP",
            `Reported production is ${round1(series.today.value / baseline)}x the ${windowDays}-day average for this activity.`,
            target,
            { baseline: round1(baseline), reported: round1(series.today.value), window_days: windowDays, multiplier, measure: series.measure, unit: series.unit });
        }
      }
    }

    if (ready("PRODUCTIVITY_ABNORMAL")) {
      const windowDays = positiveParam(band.window_days, 10);
      const low = positiveParam(band.low_ratio, 0.4);
      const high = positiveParam(band.high_ratio, 2.5);
      const series = productionSeries(days.slice(-windowDays), today, 1);
      const perWorker = (series?.samples ?? []).filter((s) => (s.headcount ?? 0) > 0).map((s) => s.value / (s.headcount as number));
      if (series && series.today.value > 0 && (series.today.headcount ?? 0) > 0 && perWorker.length >= positiveParam(band.min_samples, 3)) {
        const usual = median(perWorker);
        const now = series.today.value / (series.today.headcount as number);
        if (usual > 0 && (now < usual * low || now > usual * high)) {
          fail("PRODUCTIVITY_ABNORMAL",
            `Output per worker is ${round1(now)} ${series.unit}, ${now > usual ? "above" : "below"} the usual ${round1(usual)} ${series.unit} for this activity.`,
            target,
            { baseline: round1(usual), reported: round1(now), low_ratio: low, high_ratio: high, window_days: windowDays, measure: series.measure, unit: series.unit });
        }
      }
    }
  }

  // ── QTY_NEGATIVE ─────────────────────────────────────────────────────────
  const negative = (section: SectionKey, lineId: string | undefined, values: (number | null | undefined)[]) => {
    if (values.some((v) => typeof v === "number" && v < 0)) {
      fail("QTY_NEGATIVE", "Quantities and hours cannot be negative.", { section, line_id: lineId });
    }
  };
  for (const a of p.activities) negative("activities", a.line_id, [a.reported_qty, a.headcount, a.hours_normal, a.hours_ot]);
  for (const m of p.manpower) negative("manpower", m.line_id, [m.planned_count, m.reported_count, m.supervisors, m.hours]);
  for (const e of p.equipment) negative("equipment", e.line_id, [e.hours_working, e.hours_idle, e.hours_breakdown]);
  for (const m of p.materials) negative("materials", m.line_id, [m.qty_delivered, m.qty_used]);
  for (const d of p.delays) negative("delays", d.line_id, [d.hours_lost]);
  negative("weather", undefined, [p.weather?.hours_lost]);
  negative("safety", undefined, [p.safety?.incident_count, p.safety?.near_miss_count]);

  // ── EVIDENCE_MIN ─────────────────────────────────────────────────────────
  const policy = unit.evidence_min_policy ?? {};
  const perActivity = policy.per_activity ?? 0;
  const perReport = policy.per_report ?? 0;
  if (perActivity > 0) {
    for (const a of p.activities) {
      const count = input.evidence.filter((e) => e.target_section === "activities" && e.target_line_id === a.line_id).length;
      if (count < perActivity) {
        fail("EVIDENCE_MIN", `This activity needs at least ${perActivity} photo(s); ${count} attached.`,
          { section: "activities", line_id: a.line_id }, { required: perActivity, attached: count }, policy.severity);
      }
    }
  }
  if (perReport > 0 && input.evidence.length < perReport) {
    fail("EVIDENCE_MIN", `The report needs at least ${perReport} photo(s); ${input.evidence.length} attached.`,
      { section: "evidence" }, { required: perReport, attached: input.evidence.length }, policy.severity);
  }

  // ── Post-submit checks that need no history ──────────────────────────────
  const reported = p.manpower.reduce((s, m) => s + (m.reported_count ?? 0), 0);
  const plannedOnLines = p.manpower.reduce((s, m) => s + (m.planned_count ?? 0), 0);
  const plannedYesterday = (input.previousNextDay ?? []).reduce((s, n) => s + (n.planned_manpower ?? 0), 0);
  const planned = plannedOnLines > 0 ? plannedOnLines : plannedYesterday;
  const thresholdPct = Number(defs.get("MANPOWER_BELOW_PLAN")?.params?.threshold_pct ?? 80);
  if (planned > 0 && reported < (planned * thresholdPct) / 100) {
    fail("MANPOWER_BELOW_PLAN", `Reported manpower ${reported} is below ${thresholdPct}% of the planned ${planned}.`,
      { section: "manpower" }, { planned, reported, threshold_pct: thresholdPct });
  }

  for (const n of p.next_day) {
    if (!n.planned_manpower || n.planned_manpower <= 0) {
      fail("NEXT_DAY_MISSING_RESOURCE", "A next-day activity has no manpower planned.", { section: "next_day", line_id: n.line_id });
    }
  }

  const noticeCauses = (defs.get("DELAY_NO_NOTICE_FLAG")?.params?.causes as string[] | undefined) ?? [];
  for (const d of p.delays) {
    if (noticeCauses.includes(d.cause_category) && !d.notice_required) {
      fail("DELAY_NO_NOTICE_FLAG", "This delay cause usually needs a contractual notice, but \"notice required\" is not set.",
        { section: "delays", line_id: d.line_id }, { cause: d.cause_category });
    }
  }

  return results;
}

export const blockingErrors = (results: RuleResult[]) => results.filter((r) => r.severity === "ERROR");
export const warnings = (results: RuleResult[]) => results.filter((r) => r.severity === "WARNING");
