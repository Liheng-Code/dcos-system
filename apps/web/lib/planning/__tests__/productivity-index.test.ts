import { describe, expect, it } from "vitest";
import { aggregatePiByTrade, computeProductivityLog, type PiLogRow } from "../productivity-index";

// Same norm as work-engine.test.ts / cost-engine.test.ts's 03.02.010 worked example: 1.84 man-hours/m3
// (120 m3 -> 220.8 man-hours).
const norm = { unit: "m3", labourConstantHrPerUnit: 1.84 };

describe("computeProductivityLog", () => {
  it("no task selected: actual hours recorded, no index", () => {
    const r = computeProductivityLog({ hasTask: false, headcount: 6, hoursNormal: 8, hoursOt: 0, quantityDone: 20, unit: "m3", norm });
    expect(r.actualHours).toBe(48);
    expect(r.status).toBe("no_task");
    expect(r.productivityIndex).toBeNull();
  });

  it("no hours logged: zero headcount", () => {
    const r = computeProductivityLog({ hasTask: true, headcount: 0, hoursNormal: 8, hoursOt: 0, quantityDone: 20, unit: "m3", norm });
    expect(r.actualHours).toBe(0);
    expect(r.status).toBe("no_hours");
  });

  it("task has no norm assigned", () => {
    const r = computeProductivityLog({ hasTask: true, headcount: 6, hoursNormal: 8, hoursOt: 0, quantityDone: 20, unit: "m3", norm: null });
    expect(r.status).toBe("no_norm");
    expect(r.actualHours).toBe(48);
  });

  it("no quantity done yet", () => {
    const r = computeProductivityLog({ hasTask: true, headcount: 6, hoursNormal: 8, hoursOt: 0, quantityDone: null, unit: "m3", norm });
    expect(r.status).toBe("no_quantity");
  });

  it("quantity entered but no unit", () => {
    const r = computeProductivityLog({ hasTask: true, headcount: 6, hoursNormal: 8, hoursOt: 0, quantityDone: 20, unit: "", norm });
    expect(r.status).toBe("no_quantity");
  });

  it("unit mismatch against the norm", () => {
    const r = computeProductivityLog({ hasTask: true, headcount: 6, hoursNormal: 8, hoursOt: 0, quantityDone: 20, unit: "m2", norm });
    expect(r.status).toBe("unit_mismatch");
    expect(r.message).toMatch(/m2.*m3/);
  });

  it("m3/cum unit aliases still match (same normalizeUnit as work-engine)", () => {
    const r = computeProductivityLog({ hasTask: true, headcount: 6, hoursNormal: 8, hoursOt: 0, quantityDone: 20, unit: "cum", norm });
    expect(r.status).toBe("ok");
  });

  it("ok: a full 6-worker, 8-hour day placing 20 m3 (behind the 1.84 hr/m3 norm)", () => {
    const r = computeProductivityLog({ hasTask: true, headcount: 6, hoursNormal: 8, hoursOt: 0, quantityDone: 20, unit: "m3", norm });
    expect(r.actualHours).toBe(48);
    expect(r.earnedHours).toBe(36.8); // 20 x 1.84
    expect(r.productivityIndex).toBe(0.7667); // 36.8 / 48, behind the norm (< 1)
    expect(r.status).toBe("ok");
  });

  it("ok, with overtime hours included in actual_hours: 40 m3 in a 6-worker 8h+2hOT day", () => {
    const r = computeProductivityLog({ hasTask: true, headcount: 6, hoursNormal: 8, hoursOt: 2, quantityDone: 40, unit: "m3", norm });
    expect(r.actualHours).toBe(60); // 6 x (8+2)
    expect(r.earnedHours).toBe(73.6); // 40 x 1.84
    expect(r.productivityIndex).toBe(1.2267); // ahead of the norm (> 1)
  });
});

describe("aggregatePiByTrade", () => {
  it("weights each trade's index by actual hours and ignores non-ok logs", () => {
    const logs: PiLogRow[] = [
      { tradeCode: "Concreting", actualHours: 48, productivityIndex: 0.8, piStatus: "ok" },
      { tradeCode: "Concreting", actualHours: 16, productivityIndex: 1.2, piStatus: "ok" },
      { tradeCode: "Concreting", actualHours: 40, productivityIndex: null, piStatus: "no_quantity" },
      { tradeCode: "Rebar", actualHours: 24, productivityIndex: 1.0, piStatus: "ok" },
    ];
    const r = aggregatePiByTrade(logs);
    expect(r).toEqual([
      { trade: "Concreting", index: 0.9, sampleCount: 2, totalActualHours: 64 }, // (0.8*48 + 1.2*16) / 64 = 0.9
      { trade: "Rebar", index: 1, sampleCount: 1, totalActualHours: 24 },
    ]);
  });

  it("empty input gives empty output, no division by zero", () => {
    expect(aggregatePiByTrade([])).toEqual([]);
  });

  it("a trade with only non-ok logs is omitted entirely", () => {
    const logs: PiLogRow[] = [{ tradeCode: "Painting", actualHours: 8, productivityIndex: null, piStatus: "no_norm" }];
    expect(aggregatePiByTrade(logs)).toEqual([]);
  });
});
