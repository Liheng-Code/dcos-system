import { describe, expect, it } from "vitest";
import { median, proposeFromHistory, summariseHistory, type HistoryLog } from "../productivity-learning";

let n = 0;
const log = (over: Partial<HistoryLog> = {}): HistoryLog => ({
  id: `l${++n}`, project_id: "p1", location_id: "loc1", log_date: "2026-10-01", quantity_done: 50, actual_hours: 100,
  productivity_index: 1, pi_status: "ok", ...over,
});

/** 6 logs, 3 days, 2 places, PI around 0.8 (slower than the standard) */
function good(): HistoryLog[] {
  return [
    log({ log_date: "2026-10-01", location_id: "A", productivity_index: 0.78, quantity_done: 40, actual_hours: 100 }),
    log({ log_date: "2026-10-01", location_id: "B", productivity_index: 0.82, quantity_done: 41, actual_hours: 100 }),
    log({ log_date: "2026-10-02", location_id: "A", productivity_index: 0.8, quantity_done: 40, actual_hours: 100 }),
    log({ log_date: "2026-10-02", location_id: "B", productivity_index: 0.79, quantity_done: 40, actual_hours: 100 }),
    log({ log_date: "2026-10-03", location_id: "A", productivity_index: 0.81, quantity_done: 40, actual_hours: 100 }),
    log({ log_date: "2026-10-03", location_id: "B", productivity_index: 0.8, quantity_done: 40, actual_hours: 100 }),
  ];
}

describe("median", () => {
  it("handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("summariseHistory", () => {
  it("is insufficient with no logs, and says why", () => {
    const s = summariseHistory([]);
    expect(s.sufficient).toBe(false);
    expect(s.shortfall.join(" ")).toContain("need 5");
    expect(s.medianPi).toBeNull();
  });

  it("three logs are not enough, even if they agree", () => {
    const s = summariseHistory(good().slice(0, 3));
    expect(s.sufficient).toBe(false);
    expect(s.checks.enoughLogs).toBe(false);
  });

  it("needs days and places, not just a count", () => {
    const sameDay = good().map((l) => ({ ...l, log_date: "2026-10-01" }));
    expect(summariseHistory(sameDay).checks.enoughDays).toBe(false);
    const oneSpot = good().map((l) => ({ ...l, location_id: "A" }));
    expect(summariseHistory(oneSpot).checks.enoughPlaces).toBe(false);
    // two different projects count as two places even without locations
    const twoProjects = good().map((l, i) => ({ ...l, location_id: null, project_id: i % 2 ? "p1" : "p2" }));
    expect(summariseHistory(twoProjects).checks.enoughPlaces).toBe(true);
  });

  it("a good sample is sufficient with median and observed constant", () => {
    const s = summariseHistory(good());
    expect(s.sufficient).toBe(true);
    expect(s.medianPi).toBe(0.8);
    expect(s.kept).toBe(6);
    // 600 hours / 241 units
    expect(s.observedLabourConstant).toBeCloseTo(2.4896, 3);
  });

  it("excludes and reports an outlier instead of averaging it in", () => {
    const logs = [...good(), log({ log_date: "2026-10-04", location_id: "A", productivity_index: 3.5, quantity_done: 100, actual_hours: 100 })];
    const s = summariseHistory(logs);
    expect(s.outliers).toEqual([{ id: logs[6].id, pi: 3.5 }]);
    expect(s.kept).toBe(6);
    expect(s.maxPi).toBeLessThan(1);
  });

  it("ignores logs that cannot be used", () => {
    const logs = [...good(), log({ pi_status: "no_norm", productivity_index: null }), log({ quantity_done: null }), log({ actual_hours: 0 })];
    const s = summariseHistory(logs);
    expect(s.totalLogs).toBe(9);
    expect(s.usable).toBe(6);
  });
});

describe("proposeFromHistory", () => {
  const std = { labour_constant_hr_per_unit: 2, output_per_day: 60, version: 1 };

  it("gives no proposal on thin history", () => {
    expect(proposeFromHistory(std, summariseHistory(good().slice(0, 3)))).toBeNull();
  });

  it("proposes the observed figures and scales output the other way", () => {
    const p = proposeFromHistory(std, summariseHistory(good()))!;
    expect(p.labour_constant_hr_per_unit).toBeCloseTo(2.4896, 3);
    expect(p.changeFraction).toBeGreaterThan(0.2);
    // slower than the standard, so the crew produces less per day
    expect(p.output_per_day!).toBeLessThan(60);
    expect(p.output_per_day!).toBeCloseTo((60 * 2) / 2.4896, 1);
    expect(p.nextVersion).toBe(2);
    expect(p.basisNote).toContain("CALIBRATED");
    expect(p.basisNote).toContain("Requires approval");
  });

  it("flags a large change for extra review", () => {
    const p = proposeFromHistory({ ...std, labour_constant_hr_per_unit: 1 }, summariseHistory(good()))!;
    expect(p.flaggedLarge).toBe(true);
  });

  it("keeps output null when the standard has no direct output", () => {
    const p = proposeFromHistory({ ...std, output_per_day: null }, summariseHistory(good()))!;
    expect(p.output_per_day).toBeNull();
  });
});
