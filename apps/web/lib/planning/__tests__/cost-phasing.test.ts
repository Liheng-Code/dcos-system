import { describe, expect, it } from "vitest";
import { phaseCostByWeek, type PhasableTask } from "../cost-phasing";
import { DEFAULT_CALENDAR as DEFAULT_MON_SAT } from "../work-calendar";

// These cases are written for a Mon–Fri week.
const DEFAULT_CALENDAR = { ...DEFAULT_MON_SAT, workdays: [false, true, true, true, true, true, false] as [boolean, boolean, boolean, boolean, boolean, boolean, boolean] };

// Mon-Fri calendar; 2026-10-05 is a Monday.
function task(over: Partial<PhasableTask>): PhasableTask {
  return { startDate: "2026-10-05", endDate: "2026-10-09", isMilestone: false, plannedCost: 500, ...over };
}

describe("phaseCostByWeek", () => {
  it("spreads a task's cost evenly across its working days, all in one week", () => {
    const points = phaseCostByWeek([task({})], DEFAULT_CALENDAR); // 5 working days, $500 -> $100/day
    expect(points).toEqual([{ weekStart: "2026-10-05", cost: 500, cumulative: 500 }]);
  });

  it("splits a task spanning two weeks proportionally to working days in each", () => {
    // Thu 2026-10-08 to Wed 2026-10-14: Thu,Fri (week of 10-05) + Mon,Tue,Wed (week of 10-12) = 5 working days
    const t = task({ startDate: "2026-10-08", endDate: "2026-10-14", plannedCost: 500 });
    const points = phaseCostByWeek([t], DEFAULT_CALENDAR);
    expect(points).toEqual([
      { weekStart: "2026-10-05", cost: 200, cumulative: 200 },  // 2 of 5 days
      { weekStart: "2026-10-12", cost: 300, cumulative: 500 },  // 3 of 5 days
    ]);
  });

  it("accumulates multiple tasks in the same week and keeps a running cumulative across weeks", () => {
    const t1 = task({ startDate: "2026-10-05", endDate: "2026-10-09", plannedCost: 500 });
    const t2 = task({ startDate: "2026-10-05", endDate: "2026-10-09", plannedCost: 100 });
    const t3 = task({ startDate: "2026-10-12", endDate: "2026-10-16", plannedCost: 200 });
    const points = phaseCostByWeek([t1, t2, t3], DEFAULT_CALENDAR);
    expect(points).toEqual([
      { weekStart: "2026-10-05", cost: 600, cumulative: 600 },
      { weekStart: "2026-10-12", cost: 200, cumulative: 800 },
    ]);
  });

  it("skips milestones, unpriced tasks and tasks with no dates", () => {
    const points = phaseCostByWeek([
      task({ isMilestone: true }),
      task({ plannedCost: null }),
      task({ plannedCost: 0 }),
      task({ startDate: null }),
      task({ endDate: null }),
    ], DEFAULT_CALENDAR);
    expect(points).toEqual([]);
  });

  it("skips a task with no working days in its span rather than dividing by zero", () => {
    const noWorkCal = { ...DEFAULT_CALENDAR, workdays: [false, false, false, false, false, false, false] as const };
    const points = phaseCostByWeek([task({})], noWorkCal);
    expect(points).toEqual([]);
  });
});
