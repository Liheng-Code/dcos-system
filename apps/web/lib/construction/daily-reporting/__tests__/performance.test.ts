import { describe, expect, it } from "vitest";
import { benchmarkBand, MIN_REPORTS_FOR_SCORE, rankUnits, unitPerformance, type UnitCounts } from "../performance";

const counts = (over: Partial<UnitCounts> = {}): UnitCounts => ({
  unit_id: "u1",
  unit_code: "SC-01",
  display_name: "ABC Masonry",
  unit_type: "SUBCONTRACTOR",
  reports: 20,
  on_time: 20,
  late: 0,
  missing: 0,
  approved: 20,
  no_work: 0,
  returned: 0,
  warnings: 0,
  qty_lines: 40,
  adjusted_lines: 0,
  ...over,
});

describe("unit performance", () => {
  it("a unit that reports on time, is never returned and never adjusted scores 100", () => {
    expect(unitPerformance(counts())).toMatchObject({ due: 20, timeliness_pct: 100, first_time_pct: 100, accuracy_pct: 100, score: 100, note: null });
  });

  it("weighs timeliness 40, first-time acceptance 30 and accuracy 30", () => {
    // 16 received of 20 due, 12 on time: 60%. 4 of 16 returned: 75%. 10 of 40 quantities changed: 75%.
    const p = unitPerformance(counts({ reports: 16, on_time: 12, late: 4, missing: 4, returned: 4, adjusted_lines: 10 }));
    expect(p).toMatchObject({ due: 20, timeliness_pct: 60, first_time_pct: 75, accuracy_pct: 75 });
    expect(p.score).toBe(Math.round((60 * 40 + 75 * 30 + 75 * 30) / 100));
  });

  it("a missing report counts against timeliness, a late one too", () => {
    expect(unitPerformance(counts({ reports: 10, on_time: 10, missing: 10 })).timeliness_pct).toBe(50);
    expect(unitPerformance(counts({ reports: 20, on_time: 10, late: 10 })).timeliness_pct).toBe(50);
  });

  it("leaves out accuracy when no quantity has been approved yet, and re-weights the rest", () => {
    const p = unitPerformance(counts({ reports: 10, on_time: 5, late: 5, approved: 0, qty_lines: 0, adjusted_lines: 0 }));
    expect(p.accuracy_pct).toBeNull();
    // 50% timeliness (40) and 100% first-time (30) over a weight of 70.
    expect(p.score).toBe(Math.round((50 * 40 + 100 * 30) / 70));
  });

  it("gives no score on too few reports, and says why", () => {
    const few = unitPerformance(counts({ reports: MIN_REPORTS_FOR_SCORE - 1, on_time: MIN_REPORTS_FOR_SCORE - 1 }));
    expect(few.score).toBeNull();
    expect(few.note).toBe(`Too few reports to score (${MIN_REPORTS_FOR_SCORE - 1} of ${MIN_REPORTS_FOR_SCORE})`);
    expect(few.timeliness_pct).toBe(100);

    const none = unitPerformance(counts({ reports: 0, on_time: 0, approved: 0, qty_lines: 0 }));
    expect(none).toMatchObject({ due: 0, score: null, timeliness_pct: null, first_time_pct: null, note: "No reports due in the period" });
  });

  it("a unit that never reports is scored on its missing days", () => {
    expect(unitPerformance(counts({ reports: 0, on_time: 0, approved: 0, qty_lines: 0, missing: 10 }))).toMatchObject({
      due: 10,
      timeliness_pct: 0,
      first_time_pct: null,
      score: 0,
    });
  });

  it("ranks the weakest unit first and units without a score last", () => {
    const ranked = rankUnits([
      counts({ unit_code: "SC-GOOD" }),
      counts({ unit_code: "SC-NEW", reports: 2, on_time: 2 }),
      counts({ unit_code: "SC-WEAK", reports: 10, on_time: 5, late: 5, missing: 10 }),
      counts({ unit_code: "SC-MID", returned: 10 }),
    ]);
    expect(ranked.map((u) => u.unit_code)).toEqual(["SC-WEAK", "SC-MID", "SC-GOOD", "SC-NEW"]);
  });
});

describe("productivity against the project's typical day", () => {
  const row = (per_worker: number, over: Partial<Parameters<typeof benchmarkBand>[0]> = {}) => ({
    per_worker,
    typical_per_worker: 4,
    days: 5,
    typical_units: 3,
    ...over,
  });

  it("bands a unit as below, typical or above", () => {
    expect(benchmarkBand(row(2.9))).toEqual({ band: "below", ratio: 0.73 });
    expect(benchmarkBand(row(3))).toEqual({ band: "typical", ratio: 0.75 });
    expect(benchmarkBand(row(4))).toEqual({ band: "typical", ratio: 1 });
    expect(benchmarkBand(row(5))).toEqual({ band: "typical", ratio: 1.25 });
    expect(benchmarkBand(row(5.2))).toEqual({ band: "above", ratio: 1.3 });
  });

  it("makes no comparison when only one unit does the activity or there are too few days", () => {
    expect(benchmarkBand(row(9, { typical_units: 1 }))).toEqual({ band: "only", ratio: null });
    expect(benchmarkBand(row(9, { days: 2 }))).toEqual({ band: "only", ratio: null });
    expect(benchmarkBand(row(9, { typical_per_worker: 0 }))).toEqual({ band: "only", ratio: null });
  });
});
