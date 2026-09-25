import { describe, expect, it } from "vitest";
import { computeTaskCost, type CostCrewLine } from "../cost-engine";

// Same worked example as work-engine.test.ts's 03.02.010 case, hand-verified live against the real SQL
// function (plan_task_work_compute) on 2026-09-22: 120 m3 x 1.84 = 220.8 man-hours, crew 6 laborers ($12/day)
// + 0.9 masons ($17/day) = 6.9 workers, 8 h/day calendar.
const laborer: CostCrewLine = { roleLabel: "General laborer", dwlResourceId: "lab-1", workersPerCrew: 6, dailyRate: 12, currency: "USD" };
const mason: CostCrewLine = { roleLabel: "Mason (skilled)", dwlResourceId: "mas-1", workersPerCrew: 0.9, dailyRate: 17, currency: "USD" };

describe("computeTaskCost — the real 03.02.010 worked example", () => {
  it("with no overtime: $349.20 total, matching the live SQL result", () => {
    const r = computeTaskCost({
      workHours: 220.8, hasValidWork: true, crewLines: [laborer, mason], totalCrewWorkers: 6.9,
      hoursPerDay: 8, otPct: 0, otType: "weekday", otMultiplier: 1.5,
    });
    expect(r.costCalcStatus).toBe("ok");
    expect(r.plannedCost).toBe(349.2);
    expect(r.lines[0]).toMatchObject({ normalHours: 192, otHours: 0, normalCost: 288, otCost: 0, lineCost: 288 });
    expect(r.lines[1]).toMatchObject({ normalHours: 28.8, otHours: 0, normalCost: 61.2, otCost: 0, lineCost: 61.2 });
  });

  it("with 25% overtime at a 2.0x weekend multiplier: $436.50 total, matching the live SQL result", () => {
    const r = computeTaskCost({
      workHours: 220.8, hasValidWork: true, crewLines: [laborer, mason], totalCrewWorkers: 6.9,
      hoursPerDay: 8, otPct: 25, otType: "weekend", otMultiplier: 2.0,
    });
    expect(r.plannedCost).toBe(436.5);
    expect(r.lines[0]).toMatchObject({ normalHours: 144, otHours: 48, normalCost: 216, otCost: 144, lineCost: 360 });
    expect(r.lines[1]).toMatchObject({ normalHours: 21.6, otHours: 7.2, normalCost: 45.9, otCost: 30.6, lineCost: 76.5 });
  });

  it("a crew role with no resolvable rate: status partial_rate, planned_cost is the sum of the rated lines only", () => {
    // Same scenario live-verified in SQL, but with ot_pct reset to 0 for a clean number (the live run that
    // produced $407.01 still had the previous case's 25%/weekend OT active — see work-engine parity notes).
    const foreman: CostCrewLine = { roleLabel: "Site foreman (unrated)", dwlResourceId: null, workersPerCrew: 0.5, dailyRate: null, currency: null };
    const r = computeTaskCost({
      workHours: 220.8, hasValidWork: true, crewLines: [laborer, mason, foreman], totalCrewWorkers: 7.4,
      hoursPerDay: 8, otPct: 0, otType: "weekday", otMultiplier: 1.5,
    });
    expect(r.costCalcStatus).toBe("partial_rate");
    expect(r.plannedCost).toBe(325.6);
    expect(r.lines[2]).toMatchObject({ rateSource: "none", dailyRate: null, hourlyRate: null, normalCost: null, otCost: null, lineCost: null });
    expect(r.costCalcMessage).toMatch(/no resolvable rate/);
  });

  it("no crew role has a rate: status no_rate, planned_cost is NULL, not zero", () => {
    const unrated: CostCrewLine = { roleLabel: "X", dwlResourceId: null, workersPerCrew: 1, dailyRate: null, currency: null };
    const r = computeTaskCost({ workHours: 100, hasValidWork: true, crewLines: [unrated], totalCrewWorkers: 1, hoursPerDay: 8, otPct: 0, otType: "weekday", otMultiplier: 1.5 });
    expect(r.costCalcStatus).toBe("no_rate");
    expect(r.plannedCost).toBeNull();
  });

  it("no valid work calculation: status no_work, no lines, nothing costed", () => {
    const r = computeTaskCost({ workHours: null, hasValidWork: false, crewLines: [laborer], totalCrewWorkers: 6, hoursPerDay: 8, otPct: 0, otType: "weekday", otMultiplier: 1.5 });
    expect(r.costCalcStatus).toBe("no_work");
    expect(r.plannedCost).toBeNull();
    expect(r.lines).toEqual([]);
  });

  it("no crew lines at all: also no_work, not a division by zero", () => {
    const r = computeTaskCost({ workHours: 100, hasValidWork: true, crewLines: [], totalCrewWorkers: 0, hoursPerDay: 8, otPct: 0, otType: "weekday", otMultiplier: 1.5 });
    expect(r.costCalcStatus).toBe("no_work");
  });
});
