import { describe, expect, it } from "vitest";
import {
  computeTaskWork,
  labourConstantFromOutput,
  normalizeUnit,
  outputPerCrewDay,
  roundTo,
  sameUnit,
  tradeShares,
  type WorkInput,
} from "../work-engine";

// The worked example from the plan, taken from the real DWL recipe 03.02.010 (C30 columns):
// 0.20 general-labourer-day/m3 + 0.03 mason-day/m3, "gang of 6 places 30 m3/day".
//   labour constant = (0.20 + 0.03) x 8 h = 1.84 man-hours per m3;  crew 6 + 0.9 = 6.9 workers
const NORM = { unit: "m3", labourConstantHrPerUnit: 1.84, efficiencyPct: 100 };

const base: WorkInput = {
  quantity: 120,
  quantityUnit: "m3",
  norm: NORM,
  adjustPct: 100,
  crewWorkers: 6.9,
  crews: 1,
  hoursPerDay: 8,
  currentDurationWd: 2,
};
const run = (over: Partial<WorkInput> = {}) => computeTaskWork({ ...base, ...over });

describe("computeTaskWork — the worked example", () => {
  it("120 m3 of column concrete = 220.8 man-hours, 14 workers in 2 days, 4 days for one crew", () => {
    const r = run();
    expect(r.status).toBe("ok");
    expect(r.workHours).toBe(220.8);
    expect(r.crewRequired).toBe(14);
    expect(r.crewsRequired).toBe(2.03);
    expect(r.durationWdDerived).toBe(4);
    expect(r.productivityFactor).toBe(1);
  });

  it("the recorded gang (6.9 workers x 8 h / 1.84) does 30 m3 per day", () => {
    expect(outputPerCrewDay({ labourConstantHrPerUnit: 1.84, crewWorkers: 6.9, hoursPerDay: 8 })).toBeCloseTo(30, 6);
  });

  it("with 4 scheduled days the crew needed is ceil(6.9) = 7", () => {
    expect(run({ currentDurationWd: 4 }).crewRequired).toBe(7);
  });
});

describe("computeTaskWork — factors", () => {
  it("80% norm efficiency needs 25% more work: 276 h", () => {
    const r = run({ norm: { ...NORM, efficiencyPct: 80 }, currentDurationWd: 4 });
    expect(r.workHours).toBe(276);
    expect(r.productivityFactor).toBe(0.8);
    expect(r.crewRequired).toBe(9); // 276 / 32 = 8.625
    expect(r.durationWdDerived).toBe(5); // 276 / 55.2 = 5.0 exactly? 5
  });

  it("a task adjustment that cancels the efficiency gives the plain result", () => {
    const r = run({ norm: { ...NORM, efficiencyPct: 80 }, adjustPct: 125 });
    expect(r.productivityFactor).toBe(1);
    expect(r.workHours).toBe(220.8);
  });

  it("two crews halve the derived duration", () => {
    expect(run({ crews: 2 }).durationWdDerived).toBe(2);
  });

  it("a 10-hour day: crew for 2 days = ceil(220.8 / 20) = 12", () => {
    expect(run({ hoursPerDay: 10 }).crewRequired).toBe(12);
  });

  it("falls back to 8 h when the calendar has none", () => {
    expect(run({ hoursPerDay: null, currentDurationWd: 4 }).crewRequired).toBe(7);
    expect(run({ hoursPerDay: 0, currentDurationWd: 4 }).crewRequired).toBe(7);
  });

  it("never rounds an exact division up (float guard): 80 h / (10 d x 8 h) = 1 crew", () => {
    const r = run({ quantity: 10, quantityUnit: "m2", norm: { unit: "m2", labourConstantHrPerUnit: 8, efficiencyPct: 100 }, crewWorkers: 1, currentDurationWd: 10 });
    expect(r.workHours).toBe(80);
    expect(r.crewRequired).toBe(1);
    expect(r.durationWdDerived).toBe(10);
  });
});

describe("computeTaskWork — status order and guards", () => {
  it("reports the first missing thing, in a fixed order", () => {
    expect(run({ quantity: null }).status).toBe("missing_quantity");
    expect(run({ quantityUnit: null }).status).toBe("missing_unit");
    expect(run({ quantityUnit: "  " }).status).toBe("missing_unit");
    expect(run({ norm: null }).status).toBe("missing_norm");
    // quantity is checked before the norm
    expect(run({ quantity: null, norm: null }).status).toBe("missing_quantity");
  });

  it("flags unit mismatches but accepts aliases", () => {
    const bad = run({ quantityUnit: "m2" });
    expect(bad.status).toBe("unit_mismatch");
    expect(bad.message).toContain("m2");
    for (const u of ["m³", "M3", "cum", "cbm", " m 3 "]) expect(run({ quantityUnit: u }).status).toBe("ok");
    expect(run({ quantityUnit: "sqm", norm: { ...NORM, unit: "m2" } }).status).toBe("ok");
  });

  it("zero quantity is valid work of nothing; negative is invalid", () => {
    const zero = run({ quantity: 0, currentDurationWd: 3 });
    expect(zero.status).toBe("ok");
    expect(zero.workHours).toBe(0);
    expect(zero.crewRequired).toBe(0);
    expect(zero.durationWdDerived).toBe(0);
    expect(run({ quantity: -5 }).status).toBe("invalid_input");
    expect(run({ norm: { ...NORM, labourConstantHrPerUnit: 0 } }).status).toBe("invalid_input");
  });

  it("a milestone (no duration) still derives a duration from the crew", () => {
    const r = run({ currentDurationWd: null });
    expect(r.status).toBe("ok");
    expect(r.crewRequired).toBeNull();
    expect(r.durationWdDerived).toBe(4);
    expect(r.message).toMatch(/no working-day duration/);
  });

  it("no duration AND no crew = no_duration", () => {
    const r = run({ currentDurationWd: 0, crewWorkers: 0 });
    expect(r.status).toBe("no_duration");
    expect(r.workHours).toBe(220.8);
  });

  it("no crew lines: crew required is known, derived duration is not", () => {
    const r = run({ crewWorkers: 0 });
    expect(r.status).toBe("ok");
    expect(r.crewRequired).toBe(14);
    expect(r.crewsRequired).toBeNull();
    expect(r.durationWdDerived).toBeNull();
  });
});

describe("unit normalisation", () => {
  it("maps the aliases the SQL function maps", () => {
    expect(normalizeUnit("m²")).toBe("m2");
    expect(normalizeUnit("SQM")).toBe("m2");
    expect(normalizeUnit("Nos")).toBe("no");
    expect(normalizeUnit("tonne")).toBe("t");
    expect(normalizeUnit("Lot")).toBe("ls");
    expect(normalizeUnit("")).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
    expect(sameUnit("m3", "M³")).toBe(true);
    expect(sameUnit("m3", "m2")).toBe(false);
    expect(sameUnit(null, null)).toBe(true);
  });
});

describe("norm helpers", () => {
  it("crew + daily output define the labour constant, and back", () => {
    const lc = labourConstantFromOutput({ crewWorkers: 6.9, outputPerDay: 30, hoursPerDay: 8 })!;
    expect(lc).toBeCloseTo(1.84, 6);
    expect(outputPerCrewDay({ labourConstantHrPerUnit: lc, crewWorkers: 6.9, hoursPerDay: 8 })).toBeCloseTo(30, 6);
    expect(labourConstantFromOutput({ crewWorkers: 0, outputPerDay: 30 })).toBeNull();
    expect(outputPerCrewDay({ labourConstantHrPerUnit: 0, crewWorkers: 3 })).toBeNull();
  });

  it("splits man-hours per unit across trades by crew share", () => {
    const shares = tradeShares(
      [{ roleLabel: "Laborer", workersPerCrew: 6 }, { roleLabel: "Mason", workersPerCrew: 0.9 }],
      1.84,
    );
    expect(shares[0].hrPerUnit).toBeCloseTo(1.6, 6);
    expect(shares[1].hrPerUnit).toBeCloseTo(0.24, 6);
    expect(shares.reduce((s, x) => s + x.hrPerUnit, 0)).toBeCloseTo(1.84, 9);
  });

  it("roundTo rounds half away from zero", () => {
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(-2.675, 2)).toBe(-2.68);
    expect(roundTo(0.5, 0)).toBe(1);
  });
});
