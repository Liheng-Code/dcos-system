import { describe, expect, it } from "vitest";
import { costLoadingRows, histogramRows, marginCheck, OTHER_KEY, topSeries } from "../loading-view";
import type { CostLoading, ManpowerHistogram } from "../loading-service";

const cost = (over: Partial<CostLoading> = {}): CostLoading => ({
  meta: {
    period: "month", basis: "current", hours_per_day: 8, start: "2026-11-02", finish: "2026-12-20",
    task_count: 3, total_budget: 600, scheduled_budget: 600, unscheduled_budget: 0, unscheduled_tasks: 0,
  },
  periods: [
    { period: "2026-11-01", value: 400, cumulative: 400 },
    { period: "2026-12-01", value: 200, cumulative: 600 },
  ],
  divisions: [
    { code: "03", name: "Concrete", total: 450 },
    { code: "04", name: "Masonry", total: 100 },
    { code: "--", name: "Unclassified", total: 50 },
  ],
  cells: [
    { period: "2026-11-01", division: "03", value: 350 },
    { period: "2026-11-01", division: "04", value: 50 },
    { period: "2026-12-01", division: "03", value: 100 },
    { period: "2026-12-01", division: "04", value: 50 },
    { period: "2026-12-01", division: "--", value: 50 },
  ],
  margin: { labour_hours: 100, priced_hours: 0, labour_cost: 0, currency: null },
  ...over,
});

describe("topSeries", () => {
  it("keeps all series under the limit, largest first", () => {
    const r = topSeries([{ key: "a", label: "A", total: 1 }, { key: "b", label: "B", total: 5 }], 3);
    expect(r.shown.map((s) => s.key)).toEqual(["b", "a"]);
    expect(r.other.size).toBe(0);
  });
  it("folds the tail into Other", () => {
    const r = topSeries([1, 2, 3, 4].map((n) => ({ key: `k${n}`, label: `K${n}`, total: n })), 3);
    expect(r.shown.map((s) => s.key)).toEqual(["k4", "k3", OTHER_KEY]);
    expect(r.shown[2].total).toBe(3);
    expect([...r.other].sort()).toEqual(["k1", "k2"]);
  });
});

describe("costLoadingRows", () => {
  it("stacks value by division and carries the cumulative %", () => {
    const { rows, series } = costLoadingRows(cost());
    expect(series.map((s) => s.key)).toEqual(["03", "04", "--"]);
    expect(series[2].label).toBe("Unclassified");
    expect(rows[0]).toMatchObject({ period: "2026-11-01", "03": 350, "04": 50, "--": 0, cumulativePct: 66.67 });
    expect(rows[1]).toMatchObject({ "03": 100, "04": 50, "--": 50, cumulative: 600, cumulativePct: 100 });
  });
  it("puts small divisions into Other and the stack still sums to the period value", () => {
    const { rows } = costLoadingRows(cost(), 2);
    expect(rows[1]).toMatchObject({ "03": 100, [OTHER_KEY]: 100 });
    for (const r of rows) expect(Number(r["03"]) + Number(r[OTHER_KEY])).toBe(r.value);
  });
});

describe("marginCheck", () => {
  it("is null without priced hours", () => {
    expect(marginCheck(cost())).toBeNull();
  });
  it("compares labour cost with BOQ value", () => {
    const m = marginCheck(cost({ margin: { labour_hours: 100, priced_hours: 80, labour_cost: 150, currency: "USD" } }));
    expect(m).toEqual({ labourCost: 150, boqValue: 600, ratioPct: 25, pricedPct: 80 });
  });
});

describe("histogramRows", () => {
  const hist: ManpowerHistogram = {
    meta: {
      period: "week", group: "trade", basis: "current", hours_per_day: 8, start: "2026-11-02", finish: "2026-11-14",
      labour_hours: 192, equipment_hours: 16, unscheduled_hours: 0, task_count: 2,
    },
    periods: [
      { period: "2026-11-02", working_days: 6, labor_hours: 144, equipment_hours: 16, labor_headcount: 3, equipment_headcount: 0.33, labor_peak: 4, equipment_peak: 1 },
      { period: "2026-11-09", working_days: 6, labor_hours: 48, equipment_hours: 0, labor_headcount: 1, equipment_headcount: 0, labor_peak: 1, equipment_peak: 0 },
    ],
    series: [
      { key: "Mason", label: "Mason", kind: "labor", total_hours: 144 },
      { key: "Helper", label: "Helper", kind: "labor", total_hours: 48 },
      { key: "Pump", label: "Pump", kind: "equipment", total_hours: 16 },
    ],
    cells: [
      { period: "2026-11-02", key: "Mason", kind: "labor", hours: 96, headcount: 2 },
      { period: "2026-11-02", key: "Helper", kind: "labor", hours: 48, headcount: 1 },
      { period: "2026-11-09", key: "Mason", kind: "labor", hours: 48, headcount: 1 },
      { period: "2026-11-02", key: "Pump", kind: "equipment", hours: 16, headcount: 0.33 },
    ],
  };
  it("stacks labour headcount by trade with total, peak and working days", () => {
    const r = histogramRows(hist, "labor");
    expect(r.series.map((s) => s.key)).toEqual(["Mason", "Helper"]);
    expect(r.rows[0]).toMatchObject({ Mason: 2, Helper: 1, total: 3, dailyPeak: 4, workingDays: 6 });
    expect(r.rows[1]).toMatchObject({ Mason: 1, Helper: 0, total: 1 });
    expect(r.peak).toBe(3);
  });
  it("shows hours and filters by kind", () => {
    const r = histogramRows(hist, "equipment", "hours");
    expect(r.series.map((s) => s.key)).toEqual(["Pump"]);
    expect(r.rows[0]).toMatchObject({ Pump: 16, total: 16 });
    expect(r.rows[0]).not.toHaveProperty("Mason");
  });
});
