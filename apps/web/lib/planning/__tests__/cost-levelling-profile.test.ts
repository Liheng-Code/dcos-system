import { describe, expect, it } from "vitest";
import { buildCostLevellingProfile, type CostLevelTask } from "../cost-levelling-profile";
import { DEFAULT_CALENDAR } from "../work-calendar";

// Mon-Fri calendar; 2026-10-05 is a Monday, 2026-10-12 the following Monday.
function task(over: Partial<CostLevelTask>): CostLevelTask {
  return { id: "T1", durationWd: 5, earliestStart: "2026-10-05", plannedCost: 500, ...over };
}

describe("buildCostLevellingProfile", () => {
  it("before equals after when nothing moved (starts map has the same date)", () => {
    const t = task({});
    const points = buildCostLevellingProfile([t], DEFAULT_CALENDAR, new Map([["T1", "2026-10-05"]]));
    expect(points).toEqual([{ weekStart: "2026-10-05", before: 500, after: 500, cumulativeBefore: 500, cumulativeAfter: 500 }]);
  });

  it("a task pushed a full week shows its cost moving from the before week to the after week", () => {
    const t = task({});
    const points = buildCostLevellingProfile([t], DEFAULT_CALENDAR, new Map([["T1", "2026-10-12"]]));
    expect(points).toEqual([
      { weekStart: "2026-10-05", before: 500, after: 0, cumulativeBefore: 500, cumulativeAfter: 0 },
      { weekStart: "2026-10-12", before: 0, after: 500, cumulativeBefore: 500, cumulativeAfter: 500 },
    ]);
  });

  it("a task with no entry in the starts map keeps its before date (never moved)", () => {
    const t = task({});
    const points = buildCostLevellingProfile([t], DEFAULT_CALENDAR, new Map());
    expect(points).toEqual([{ weekStart: "2026-10-05", before: 500, after: 500, cumulativeBefore: 500, cumulativeAfter: 500 }]);
  });

  it("skips milestones (durationWd 0) and unpriced tasks", () => {
    const points = buildCostLevellingProfile(
      [task({ id: "M", durationWd: 0 }), task({ id: "U", plannedCost: null }), task({ id: "Z", plannedCost: 0 })],
      DEFAULT_CALENDAR,
      new Map(),
    );
    expect(points).toEqual([]);
  });

  it("two tasks, only one moved: the moved one's cost relocates, the other's does not", () => {
    const stay = task({ id: "STAY", plannedCost: 100 });
    const move = task({ id: "MOVE", plannedCost: 200 });
    const points = buildCostLevellingProfile([stay, move], DEFAULT_CALENDAR, new Map([["MOVE", "2026-10-12"]]));
    expect(points).toEqual([
      { weekStart: "2026-10-05", before: 300, after: 100, cumulativeBefore: 300, cumulativeAfter: 100 },
      { weekStart: "2026-10-12", before: 0, after: 200, cumulativeBefore: 300, cumulativeAfter: 300 },
    ]);
  });
});
