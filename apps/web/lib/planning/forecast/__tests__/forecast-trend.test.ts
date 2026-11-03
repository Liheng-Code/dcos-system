import { describe, expect, it } from "vitest";
import { compareSnapshots, forecastTrend, periodMissing, type ForecastSnapshot, type SnapshotTask } from "../forecast-trend";

const snap = (over: Partial<ForecastSnapshot>): ForecastSnapshot => ({
  id: "s", period: "2027-01", label: null, data_date: null, forecast_finish: "2028-06-30", baseline_finish: "2028-06-30", contract_finish: "2028-07-31",
  variance_wd: 0, progress_pct: 10, planned_pct: 12, critical_count: 5, task_count: 100, open_delays: 0, open_delay_days: 0,
  assumptions: "assumption text", basis: {}, milestones: [], captured_by: null, captured_at: "2027-01-31T10:00:00Z", ...over,
});

describe("forecastTrend", () => {
  it("orders records and measures the drift between them", () => {
    const rows = forecastTrend([
      snap({ id: "b", period: "2027-02", forecast_finish: "2028-08-15", captured_at: "2027-02-28T10:00:00Z" }),
      snap({ id: "a" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[0].driftDays).toBeNull();
    expect(rows[1].driftDays).toBe(46);
    expect(rows[0].lateVsContractDays).toBe(-31);
    expect(rows[1].lateVsContractDays).toBe(15);
    expect(rows[1].label).toBe("2027-02");
  });
});

describe("compareSnapshots", () => {
  it("lists moved, added and removed activities, largest move first", () => {
    const a: SnapshotTask[] = [["t1", "2027-01-01", "2027-02-01", 0], ["t2", "2027-01-01", "2027-03-01", 0], ["t3", null, "2027-01-10", 0]];
    const b: SnapshotTask[] = [["t1", "2027-01-01", "2027-02-11", 0], ["t2", "2027-01-01", "2027-02-27", 0], ["t4", null, "2027-05-01", 0]];
    const r = compareSnapshots(a, b);
    expect(r).toMatchObject({ later: 1, earlier: 1, added: 1, removed: 1 });
    expect(r.moved[0]).toMatchObject({ id: "t1", days: 10, change: "moved" });
    expect(r.moved[1]).toMatchObject({ id: "t2", days: -2 });
  });
});

describe("periodMissing", () => {
  it("is true when this month has no record", () => {
    expect(periodMissing([snap({})], "2027-01-15")).toBe(false);
    expect(periodMissing([snap({})], "2027-02-01")).toBe(true);
  });
});
