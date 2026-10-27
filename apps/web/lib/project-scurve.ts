// The project S-curve (doc 33): cost and time on one chart. Data comes from the read-only RPC project_scurve
// (migration 20261027105053_core_project_scurve.sql); this module is the pure part: EVM indices, chart rows and the
// baseline health warnings. The same EVM formulas back lib/evm-service.ts, so every screen shows the same numbers.

export interface ScurvePeriod {
  period: string;
  pv: number;
  forecast: number;
  /** Null after the data date (not reached yet). */
  ev: number | null;
  ac: number | null;
  committed: number | null;
  certified: number | null;
}

export interface ProjectScurveData {
  periods: ScurvePeriod[];
  /** ev is measured on the baseline (baselined tasks x baseline cost) so it compares with pv; ev_total on the whole budget. */
  at_data_date: { pv: number; forecast: number; ev: number; ev_total?: number; ac: number; committed: number; certified: number };
  meta: {
    period: "week" | "month";
    data_date: string;
    currency: string | null;
    start: string | null;
    finish: string | null;
    bac: number;
    budget_total: number;
    boq_total: number;
    unbaselined_tasks: number;
    unbaselined_budget: number;
    pv_fallback_tasks: number;
    baseline_number: number | null;
    baseline_name: string | null;
    baseline_date: string | null;
    snapshots: number;
  };
}

export interface EvmMetrics {
  bac: number;
  ev: number;
  pv: number;
  ac: number;
  cpi: number | null;
  spi: number | null;
  cv: number;
  sv: number;
  eac: number | null;
  /** Estimate to complete: EAC - AC. */
  etc: number | null;
  vac: number | null;
  tcpi: number | null;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Standard EVM indices. CPI and SPI are null when their divisor is 0; EAC = BAC / CPI (= AC + (BAC - EV) / CPI). */
export function evmFrom(input: { bac: number; ev: number; pv: number; ac: number }): EvmMetrics {
  const { bac, ev, pv, ac } = input;
  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv > 0 ? ev / pv : null;
  const eac = cpi && cpi > 0 ? bac / cpi : null;
  const remainingBudget = bac - ac;
  return {
    bac, ev, pv, ac, cpi, spi,
    cv: ev - ac,
    sv: ev - pv,
    eac,
    etc: eac != null ? eac - ac : null,
    vac: eac != null ? bac - eac : null,
    tcpi: remainingBudget > 0 ? (bac - ev) / remainingBudget : null,
  };
}

export interface ScurveMetrics extends EvmMetrics {
  committed: number;
  certified: number;
  /** Share of BAC planned / earned by the data date, 0-100. */
  plannedPct: number;
  earnedPct: number;
  /** Certified - EV: above 0 the client has certified more than was earned (over-billed), below 0 under-billed. */
  billingGap: number;
}

export function scurveMetrics(data: ProjectScurveData): ScurveMetrics {
  const d = data.at_data_date;
  const bac = num(data.meta.bac);
  const evm = evmFrom({ bac, ev: num(d.ev), pv: num(d.pv), ac: num(d.ac) });
  return {
    ...evm,
    committed: num(d.committed),
    certified: num(d.certified),
    plannedPct: bac > 0 ? round2((num(d.pv) / bac) * 100) : 0,
    earnedPct: bac > 0 ? round2((num(d.ev) / bac) * 100) : 0,
    billingGap: num(d.certified) - num(d.ev),
  };
}

export type ScurveMode = "value" | "pct";

export interface ScurveRow {
  period: string;
  pv: number;
  forecast: number;
  ev: number | null;
  ac: number | null;
  committed: number | null;
  certified: number | null;
}

/** Chart rows, in money or as % of BAC. Lines after the data date stay null so they end there. */
export function scurveRows(data: ProjectScurveData, mode: ScurveMode = "value"): ScurveRow[] {
  const bac = num(data.meta.bac);
  const f = (v: number | null): number | null => {
    if (v == null) return null;
    if (mode === "value") return num(v);
    return bac > 0 ? round2((num(v) / bac) * 100) : 0;
  };
  return data.periods.map((p) => ({
    period: p.period,
    pv: f(p.pv) ?? 0,
    forecast: f(p.forecast) ?? 0,
    ev: f(p.ev),
    ac: f(p.ac),
    committed: f(p.committed),
    certified: f(p.certified),
  }));
}

/** The period row the data date falls in (for the "Data date" marker). */
export function dataDatePeriod(data: ProjectScurveData): string | null {
  const dd = data.meta.data_date;
  let hit: string | null = null;
  for (const p of data.periods) if (p.period <= dd) hit = p.period;
  return hit;
}

export type ScurveWarningCode = "no_baseline" | "baseline_coverage" | "unbaselined_tasks" | "pv_fallback" | "no_budget";

export interface ScurveWarning {
  code: ScurveWarningCode;
  severity: "warning" | "info";
  message: string;
}

/** True when PV, EV and BAC share one basis, so SPI / CPI / EAC can be shown without a caveat. */
export function scurveTrusted(data: ProjectScurveData): boolean {
  return !scurveHealth(data).some((w) => w.severity === "warning");
}

/**
 * Whether the baseline (planned value) can be trusted. The usual case after Generate from BOQ: tasks got budgets
 * but the baseline was set before, so PV covers only part of the budget until a new baseline is set.
 */
export function scurveHealth(data: ProjectScurveData, money: (n: number) => string = (n) => Math.round(n).toLocaleString()): ScurveWarning[] {
  const m = data.meta;
  const bac = num(m.bac);
  const budget = num(m.budget_total);
  const out: ScurveWarning[] = [];
  if (budget <= 0) {
    out.push({ code: "no_budget", severity: "info", message: "No activity carries a budget yet. Generate the programme from the BOQ to cost-load it." });
    return out;
  }
  // bac, not baseline_number: a user without Planning baseline rights cannot read wbs_baselines but still gets PV
  if (bac <= 0) {
    out.push({ code: "no_baseline", severity: "warning", message: "No baseline is set, so there is no planned value. Set a baseline in Planning." });
    return out;
  }
  if (Math.abs(bac - budget) > Math.max(1, budget * 0.005)) {
    out.push({
      code: "baseline_coverage",
      severity: "warning",
      message: `The baseline carries ${money(bac)} of the current budget ${money(budget)}. Set a new baseline so planned value matches the budget.`,
    });
  }
  if (num(m.unbaselined_tasks) > 0) {
    out.push({
      code: "unbaselined_tasks",
      severity: "warning",
      message: `${m.unbaselined_tasks} activities with a budget (${money(num(m.unbaselined_budget))}) are not in the baseline.`,
    });
  }
  if (num(m.pv_fallback_tasks) > 0) {
    out.push({
      code: "pv_fallback",
      severity: "info",
      message: `${m.pv_fallback_tasks} baselined activities have no frozen baseline cost; their current budget is used.`,
    });
  }
  return out;
}
