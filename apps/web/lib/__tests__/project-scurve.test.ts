import { describe, expect, it } from "vitest";
import { dataDatePeriod, evmFrom, scurveHealth, scurveMetrics, scurveRows, scurveTrusted, type ProjectScurveData } from "../project-scurve";

const data = (over: Partial<ProjectScurveData["meta"]> = {}, at: Partial<ProjectScurveData["at_data_date"]> = {}): ProjectScurveData => ({
  periods: [
    { period: "2027-01-01", pv: 100, forecast: 80, ev: 90, ac: 120, committed: 300, certified: 60 },
    { period: "2027-02-01", pv: 400, forecast: 350, ev: 300, ac: 330, committed: 300, certified: 260 },
    { period: "2027-03-01", pv: 1000, forecast: 1000, ev: null, ac: null, committed: null, certified: null },
  ],
  at_data_date: { pv: 400, forecast: 350, ev: 300, ac: 330, committed: 300, certified: 260, ...at },
  meta: {
    period: "month", data_date: "2027-02-15", currency: "USD", start: "2027-01-01", finish: "2027-03-31",
    bac: 1000, budget_total: 1000, boq_total: 1200, unbaselined_tasks: 0, unbaselined_budget: 0, pv_fallback_tasks: 0,
    baseline_number: 1, baseline_name: "Revised", baseline_date: "2027-01-01", snapshots: 2, ...over,
  },
});

describe("evmFrom", () => {
  it("computes indices and forecasts", () => {
    const m = evmFrom({ bac: 1000, ev: 300, pv: 400, ac: 330 });
    expect(m.spi).toBeCloseTo(0.75, 6);
    expect(m.cpi).toBeCloseTo(300 / 330, 6);
    expect(m.sv).toBe(-100);
    expect(m.cv).toBe(-30);
    expect(m.eac).toBeCloseTo(1100, 6);       // BAC / CPI
    expect(m.etc).toBeCloseTo(770, 6);        // EAC - AC
    expect(m.vac).toBeCloseTo(-100, 6);
    expect(m.tcpi).toBeCloseTo(700 / 670, 6); // (BAC - EV) / (BAC - AC)
  });
  it("returns null indices when the divisor is zero", () => {
    const m = evmFrom({ bac: 1000, ev: 0, pv: 0, ac: 0 });
    expect(m.cpi).toBeNull();
    expect(m.spi).toBeNull();
    expect(m.eac).toBeNull();
    expect(m.etc).toBeNull();
    expect(m.vac).toBeNull();
  });
});

describe("scurveMetrics", () => {
  it("adds committed, certified, percentages and the billing gap", () => {
    const m = scurveMetrics(data());
    expect(m.plannedPct).toBe(40);
    expect(m.earnedPct).toBe(30);
    expect(m.committed).toBe(300);
    expect(m.billingGap).toBe(-40); // certified 260 < earned 300: under-billed
  });
});

describe("scurveRows", () => {
  it("keeps money values and ends actual lines at the data date", () => {
    const r = scurveRows(data());
    expect(r[1]).toMatchObject({ pv: 400, ev: 300, ac: 330, certified: 260 });
    expect(r[2].ev).toBeNull();
    expect(r[2].pv).toBe(1000);
  });
  it("converts to % of BAC", () => {
    const r = scurveRows(data(), "pct");
    expect(r[1]).toMatchObject({ pv: 40, ev: 30, ac: 33, committed: 30 });
    expect(r[2].ac).toBeNull();
  });
});

describe("dataDatePeriod", () => {
  it("finds the period the data date falls in", () => {
    expect(dataDatePeriod(data())).toBe("2027-02-01");
    expect(dataDatePeriod(data({ data_date: "2026-12-01" }))).toBeNull();
  });
});

describe("scurveHealth", () => {
  const money = (n: number) => String(n);
  it("is quiet when the baseline carries the whole budget", () => {
    expect(scurveHealth(data(), money)).toEqual([]);
  });
  it("flags a baseline that carries only part of the budget, and unbaselined activities", () => {
    const w = scurveHealth(data({ bac: 2239579.82, budget_total: 3953277.11, unbaselined_tasks: 234, unbaselined_budget: 1713697.29 }), money);
    expect(w.map((x) => x.code)).toEqual(["baseline_coverage", "unbaselined_tasks"]);
    expect(w[0].message).toContain("2239579.82");
  });
  it("tolerates rounding within 0.5%", () => {
    expect(scurveHealth(data({ bac: 999 }), money)).toEqual([]);
  });
  it("asks for a baseline when there is none, and for budgets when there are none", () => {
    expect(scurveHealth(data({ baseline_number: null, bac: 0 }), money)[0].code).toBe("no_baseline");
    expect(scurveHealth(data({ budget_total: 0 }), money)[0].code).toBe("no_budget");
  });
  it("does not ask for a baseline when only the baseline name is unreadable (no Planning rights)", () => {
    expect(scurveHealth(data({ baseline_number: null, baseline_name: null }), money)).toEqual([]);
  });
  it("trusts the curve only without warnings", () => {
    expect(scurveTrusted(data())).toBe(true);
    expect(scurveTrusted(data({ bac: 2239579.82, budget_total: 3953277.11 }))).toBe(false);
    expect(scurveTrusted(data({ pv_fallback_tasks: 3 }))).toBe(true); // info only
  });
  it("notes baselines without frozen cost", () => {
    expect(scurveHealth(data({ pv_fallback_tasks: 5 }), money).map((x) => x.code)).toEqual(["pv_fallback"]);
  });
});
