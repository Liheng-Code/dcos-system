import { describe, expect, it } from "vitest";
import {
  scheduleProject,
  wouldCycle,
  depsFromArrays,
  depsToArrays,
  projectFinish,
  signedWorkingDayGap,
  type EngineTask,
} from "../schedule-engine";
import { DEFAULT_CALENDAR, addWorkingDays, finishFromStart } from "../work-calendar";

const cal = DEFAULT_CALENDAR; // Mon–Fri
const START = "2026-01-05"; // a Monday

function task(id: string, overrides: Partial<EngineTask> = {}): EngineTask {
  return {
    id,
    start: null,
    finish: null,
    durationWd: 3,
    manuallyScheduled: false,
    constraintType: null,
    constraintDate: null,
    deps: [],
    ...overrides,
  };
}

function mustOk(result: ReturnType<typeof scheduleProject>) {
  if (!result.ok) throw new Error(`Expected a valid schedule, got cycle: ${result.cycle.join(" -> ")}`);
  return result;
}

describe("scheduleProject — dependency types", () => {
  it("FS (lag 0): successor starts the next working day after the predecessor finishes", () => {
    const a = task("A", { start: START, durationWd: 3 });
    const b = task("B", { durationWd: 2, deps: [{ predId: "A", type: "fs", lag: 0 }] });
    const result = mustOk(scheduleProject([a, b], cal, START));

    const aDates = result.dates.get("A")!;
    const bDates = result.dates.get("B")!;
    expect(aDates.start).toBe(START);
    expect(aDates.finish).toBe(finishFromStart(cal, START, 3));
    expect(bDates.start).toBe(addWorkingDays(cal, aDates.finish, 1));
  });

  it("FS with positive lag pushes the successor further out", () => {
    const a = task("A", { start: START, durationWd: 3 });
    const b = task("B", { durationWd: 2, deps: [{ predId: "A", type: "fs", lag: 2 }] });
    const result = mustOk(scheduleProject([a, b], cal, START));
    const aFinish = result.dates.get("A")!.finish;
    expect(result.dates.get("B")!.start).toBe(addWorkingDays(cal, aFinish, 3));
  });

  it("FS with negative lag (lead) lets the successor start earlier", () => {
    const a = task("A", { start: START, durationWd: 5 });
    const b = task("B", { durationWd: 2, deps: [{ predId: "A", type: "fs", lag: -2 }] });
    const result = mustOk(scheduleProject([a, b], cal, START));
    const aFinish = result.dates.get("A")!.finish;
    expect(result.dates.get("B")!.start).toBe(addWorkingDays(cal, aFinish, -1));
  });

  it("SS (lag 0): successor starts the same day as the predecessor", () => {
    // A starts well after the project origin so a passing test can't be a
    // coincidence of both dates defaulting to the same origin value.
    const aStart = addWorkingDays(cal, START, 5);
    const a = task("A", { start: aStart, durationWd: 4 });
    const b = task("B", { durationWd: 2, deps: [{ predId: "A", type: "ss", lag: 0 }] });
    const result = mustOk(scheduleProject([a, b], cal, START));
    expect(result.dates.get("A")!.start).toBe(aStart);
    expect(result.dates.get("B")!.start).toBe(aStart);
  });

  it("FF (lag 0): successor finishes the same day as the predecessor", () => {
    const a = task("A", { start: START, durationWd: 4 });
    const b = task("B", { durationWd: 2, deps: [{ predId: "A", type: "ff", lag: 0 }] });
    const result = mustOk(scheduleProject([a, b], cal, START));
    expect(result.dates.get("B")!.finish).toBe(result.dates.get("A")!.finish);
  });

  it("SF: successor finishes one day before the predecessor starts (lag 0)", () => {
    const a = task("A", { start: addWorkingDays(cal, START, 10), durationWd: 3 });
    const b = task("B", { durationWd: 2, deps: [{ predId: "A", type: "sf", lag: 0 }] });
    const result = mustOk(scheduleProject([a, b], cal, START));
    expect(result.dates.get("B")!.finish).toBe(addWorkingDays(cal, result.dates.get("A")!.start, -1));
  });
});

describe("scheduleProject — cycle detection", () => {
  it("returns ok:false with the cycle path for a circular dependency", () => {
    const a = task("A", { deps: [{ predId: "B", type: "fs", lag: 0 }] });
    const b = task("B", { deps: [{ predId: "A", type: "fs", lag: 0 }] });
    const result = scheduleProject([a, b], cal, START);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.cycle.length).toBeGreaterThan(0);
  });

  it("wouldCycle detects a cycle before it is added", () => {
    // B already depends on A (A -> B). depsByTask maps a task to its own predecessors.
    const depsByTask = new Map([["B", [{ predId: "A", type: "fs" as const, lag: 0 }]]]);
    // Proposing "B precedes A" would close the loop A -> B -> A.
    expect(wouldCycle("B", "A", depsByTask)).toBe(true);
    // Proposing "C precedes A" introduces no cycle.
    expect(wouldCycle("C", "A", depsByTask)).toBe(false);
  });
});

describe("scheduleProject — float and critical/near-critical thresholds", () => {
  it("the longest parallel path is critical (zero float); a shorter one has positive float", () => {
    // Origin -> A (5wd) -> C (2wd)         : long path
    // Origin -> B (1wd) -> C (2wd)         : short path, slack before C
    const origin = task("Origin", { start: START, durationWd: 1 });
    const a = task("A", { durationWd: 5, deps: [{ predId: "Origin", type: "fs", lag: 0 }] });
    const b = task("B", { durationWd: 1, deps: [{ predId: "Origin", type: "fs", lag: 0 }] });
    const c = task("C", {
      durationWd: 2,
      deps: [
        { predId: "A", type: "fs", lag: 0 },
        { predId: "B", type: "fs", lag: 0 },
      ],
    });
    const result = mustOk(scheduleProject([origin, a, b, c], cal, START));
    expect(result.float.get("A")!.critical).toBe(true);
    expect(result.float.get("A")!.totalFloat).toBe(0);
    expect(result.float.get("B")!.totalFloat).toBeGreaterThan(0);
    expect(result.float.get("B")!.critical).toBe(false);
  });

  it("near-critical band sits strictly between the critical cutoff and the near-critical cutoff", () => {
    const origin = task("Origin", { start: START, durationWd: 1 });
    const a = task("A", { durationWd: 8, deps: [{ predId: "Origin", type: "fs", lag: 0 }] });
    // 3 working days shorter than the critical path -> 3 days of float.
    const b = task("B", { durationWd: 5, deps: [{ predId: "Origin", type: "fs", lag: 0 }] });
    const c = task("C", {
      durationWd: 1,
      deps: [
        { predId: "A", type: "fs", lag: 0 },
        { predId: "B", type: "fs", lag: 0 },
      ],
    });
    const result = mustOk(scheduleProject([origin, a, b, c], cal, START, { critical: 0, nearCritical: 5 }));
    const bFloat = result.float.get("B")!;
    expect(bFloat.totalFloat).toBe(3);
    expect(bFloat.critical).toBe(false);
    expect(bFloat.nearCritical).toBe(true);
  });
});

describe("scheduleProject — constraints", () => {
  it("start_no_later_than is NOT flagged when the schedule already meets it", () => {
    const a = task("A", {
      start: START,
      durationWd: 2,
      constraintType: "start_no_later_than",
      constraintDate: addWorkingDays(cal, START, 30),
    });
    const result = mustOk(scheduleProject([a], cal, START));
    expect(result.violations.has("A")).toBe(false);
  });

  it("start_no_later_than IS flagged when predecessors push the start past the deadline", () => {
    const pred = task("Pred", { start: START, durationWd: 10 });
    const a = task("A", {
      durationWd: 2,
      deps: [{ predId: "Pred", type: "fs", lag: 0 }],
      constraintType: "start_no_later_than",
      constraintDate: START, // long before Pred even finishes
    });
    const result = mustOk(scheduleProject([pred, a], cal, START));
    expect(result.violations.has("A")).toBe(true);
  });

  it("as_late_as_possible schedules a task with float at its late start, not its early start", () => {
    const origin = task("Origin", { start: START, durationWd: 1 });
    const critical = task("Critical", { durationWd: 10, deps: [{ predId: "Origin", type: "fs", lag: 0 }] });
    const alap = task("Alap", {
      durationWd: 2,
      deps: [{ predId: "Origin", type: "fs", lag: 0 }],
      constraintType: "as_late_as_possible",
    });
    const finish = task("Finish", {
      durationWd: 1,
      deps: [
        { predId: "Critical", type: "fs", lag: 0 },
        { predId: "Alap", type: "fs", lag: 0 },
      ],
    });
    const result = mustOk(scheduleProject([origin, critical, alap, finish], cal, START));
    const alapDates = result.dates.get("Alap")!;
    const alapFloat = result.float.get("Alap")!;
    expect(alapFloat.totalFloat).toBeGreaterThan(0);
    // Scheduled at its late start, not the earliest possible date right after Origin.
    expect(alapDates.start).toBe(alapFloat.lateStart);
    expect(alapDates.start).not.toBe(addWorkingDays(cal, origin.start!, 1));
  });

  it("as_late_as_possible is a no-op for a critical (zero-float) task", () => {
    const origin = task("Origin", { start: START, durationWd: 1 });
    const a = task("A", {
      durationWd: 5,
      deps: [{ predId: "Origin", type: "fs", lag: 0 }],
      constraintType: "as_late_as_possible",
    });
    const result = mustOk(scheduleProject([origin, a], cal, START));
    const aDates = result.dates.get("A")!;
    const aFloat = result.float.get("A")!;
    expect(aFloat.totalFloat).toBe(0);
    expect(aDates.start).toBe(aFloat.lateStart);
    expect(aDates.finish).toBe(aFloat.lateFinish);
  });
});

describe("dependency array (de)serialisation round-trip", () => {
  it("depsToArrays -> depsFromArrays reproduces the same links", () => {
    const deps = [
      { predId: "A", type: "fs" as const, lag: 0 },
      { predId: "B", type: "ss" as const, lag: -2 },
    ];
    const arrays = depsToArrays(deps);
    const back = depsFromArrays(
      arrays.dependency_task_ids,
      arrays.dependency_types,
      arrays.dependency_lag_days,
    );
    expect(back).toEqual(deps);
  });
});

describe("projectFinish / signedWorkingDayGap", () => {
  it("projectFinish is the latest finish across every task", () => {
    const dates = new Map([
      ["A", { start: START, finish: addWorkingDays(cal, START, 2) }],
      ["B", { start: START, finish: addWorkingDays(cal, START, 9) }],
      ["C", { start: START, finish: addWorkingDays(cal, START, 4) }],
    ]);
    expect(projectFinish(dates)).toBe(addWorkingDays(cal, START, 9));
  });

  it("projectFinish is null for an empty schedule", () => {
    expect(projectFinish(new Map())).toBeNull();
  });

  it("signedWorkingDayGap is positive when running late, negative when ahead", () => {
    const later = addWorkingDays(cal, START, 5);
    const earlier = addWorkingDays(cal, START, -5);
    expect(signedWorkingDayGap(cal, START, later)).toBeGreaterThan(0);
    expect(signedWorkingDayGap(cal, START, earlier)).toBeLessThan(0);
    expect(signedWorkingDayGap(cal, START, START)).toBe(0);
  });
});
