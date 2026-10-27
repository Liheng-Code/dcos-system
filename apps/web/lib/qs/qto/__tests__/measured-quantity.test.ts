import { describe, expect, it } from "vitest";
import { fmtQty, isAutoRun, measuredRun, measuredValues, volumeOf } from "../measured-quantity";
import type { RulesetDefinition } from "../types";

const ruleset: RulesetDefinition = {
  rounding: { stage: "final", dp: 3, mode: "half_up" },
  factors: [{ name: "Waste", min: 1, max: 1.2 }],
  rules: [{ code: "AREA-MEAS", name: "Measured area", unit: "m2", formula: "A", inputs: [{ name: "A", unit: "m2" }], allowed_factors: ["Waste"] }],
};
const area = (a: number) => ({ measure_type: "area", area: a, length: null, count: null });

describe("measured quantity", () => {
  it("sums the item's areas (17.717 m2 band beam example)", () => {
    const run = measuredRun({ unit: "m2", measurements: [area(10.2171), area(7.5)], ruleset });
    expect(run?.valid).toBe(true);
    expect(run?.result).toBe("17.717");
    expect(run?.rule_code).toBe("AREA-MEAS");
    expect(run?.expression).toBe("A1 + A2");
  });
  it("applies the item's authorised factors", () => {
    expect(measuredRun({ unit: "m2", measurements: [area(100)], ruleset, factors: [{ name: "Waste", value: "1.05" }] })?.result).toBe("105");
  });
  it("gives 0 with no measurements and null for units without a measured rule", () => {
    expect(measuredRun({ unit: "m2", measurements: [], ruleset })?.result).toBe("0");
    expect(measuredRun({ unit: "m3", measurements: [area(5)], ruleset })).toBeNull();
  });
  it("takes only the measurement types that match the unit", () => {
    const ms = [area(4), { measure_type: "polyline", area: null, length: 3, count: null }, { measure_type: "count", area: null, length: null, count: 6 }];
    expect(measuredValues("m2", ms)).toEqual([4]);
    expect(measuredValues("m", ms)).toEqual([3]);
    expect(measuredValues("No.", ms)).toEqual([6]);
  });
  it("recognises auto runs and formats to 2 decimals", () => {
    expect(isAutoRun({ inputs: { auto: true } })).toBe(true);
    expect(isAutoRun({ inputs: { values: [] } })).toBe(false);
    expect(fmtQty("17.717")).toBe((17.72).toLocaleString(undefined, { minimumFractionDigits: 2 }));
  });
});

describe("volume take-off", () => {
  const len = (l: number) => ({ measure_type: "length", area: null, length: l, count: null });
  it("drop panel: Σ areas × depth (7.34 m2 × 0.30 m = 2.202 m3)", () => {
    const run = measuredRun({ unit: "m3", measurements: [area(4), area(3.34)], ruleset, volume: { mode: "area_depth", depth: "0.30" } });
    expect(run?.valid).toBe(true);
    expect(run?.rule_code).toBe("VOL-AT");
    expect(run?.expression).toBe("(A1 + A2) * T");
    expect(run?.result).toBe("2.202");
  });
  it("band beam: Σ lengths × width × depth (35.434 m × 0.5 × 0.6 = 10.63 m3)", () => {
    const run = measuredRun({ unit: "m3", measurements: [len(20), len(15.434)], ruleset, volume: { mode: "length_width_depth", width: "0.5", depth: "0.6" } });
    expect(run?.rule_code).toBe("VOL-LWD");
    expect(run?.result).toBe("10.63");
  });
  it("needs valid dimensions and ignores the other measurement type", () => {
    expect(measuredRun({ unit: "m3", measurements: [area(5)], ruleset, volume: { mode: "area_depth", depth: "0" } })).toBeNull();
    expect(measuredRun({ unit: "m3", measurements: [area(5)], ruleset })).toBeNull();
    expect(measuredRun({ unit: "m3", measurements: [area(5), len(9)], ruleset, volume: { mode: "area_depth", depth: "0.2" } })?.result).toBe("1");
  });
  it("reads the dimensions back from an automatic run", () => {
    expect(volumeOf({ inputs: { auto: true, volume: { mode: "area_depth", depth: "0.3" } } })).toEqual({ mode: "area_depth", depth: "0.3" });
    expect(volumeOf({ inputs: { volume: { mode: "area_depth", depth: "0.3" } } })).toBeNull();
  });
});
