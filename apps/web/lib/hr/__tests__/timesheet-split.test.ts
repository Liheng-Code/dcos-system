import { describe, expect, it } from "vitest";
import {
  checkDays,
  entriesForDay,
  normaliseAllocations,
  planWeek,
  splitHours,
  type Allocation,
  type DayFact,
} from "../timesheet-split";

const alloc = (project_id: string | null, percent: number): Allocation => ({ project_id, wbs_node_id: null, task_id: null, percent });
const fact = (over: Partial<DayFact> = {}): DayFact => ({
  date: "2026-10-05", status: "PRESENT", regular_hours: 8, ot_hours_actual: 0, ot: null, ...over,
});
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe("splitHours", () => {
  it("splits by weight and always adds up exactly", () => {
    expect(splitHours(8, [50, 50])).toEqual([4, 4]);
    expect(splitHours(8, [60, 40])).toEqual([4.8, 3.2]);
    const thirds = splitHours(8, [1, 1, 1]);
    expect(sum(thirds)).toBe(8);
    expect(thirds).toEqual([2.67, 2.67, 2.66]);
  });

  it("handles zero hours, one share, and all-zero weights", () => {
    expect(splitHours(0, [50, 50])).toEqual([0, 0]);
    expect(splitHours(7.5, [100])).toEqual([7.5]);
    expect(splitHours(8, [0, 0])).toEqual([8, 0]);
    expect(splitHours(8, [])).toEqual([]);
  });
});

describe("normaliseAllocations", () => {
  it("falls back to one share when the employee has no project assignment", () => {
    expect(normaliseAllocations([], "p1")).toEqual([alloc("p1", 100)]);
    expect(normaliseAllocations([], null)).toEqual([alloc(null, 100)]);
  });

  it("sends the unassigned remainder to overhead", () => {
    expect(normaliseAllocations([alloc("p1", 60)], null)).toEqual([alloc("p1", 60), alloc(null, 40)]);
  });

  it("scales shares that add up to more than 100", () => {
    const out = normaliseAllocations([alloc("p1", 100), alloc("p2", 100)], null);
    expect(out.map((a) => a.percent)).toEqual([50, 50]);
  });
});

describe("entriesForDay", () => {
  it("splits regular hours across projects", () => {
    const out = entriesForDay(fact(), [alloc("p1", 60), alloc("p2", 40)]);
    expect(out.map((e) => [e.project_id, e.hours_worked, e.ot_hours])).toEqual([["p1", 4.8, 0], ["p2", 3.2, 0]]);
    expect(out.every((e) => e.source === "auto")).toBe(true);
  });

  it("puts overhead on a null project", () => {
    const out = entriesForDay(fact(), [alloc("p1", 75)]);
    expect(out.map((e) => [e.project_id, e.hours_worked])).toEqual([["p1", 6], [null, 2]]);
  });

  it("splits OT with the regular hours, counting it inside hours_worked", () => {
    const out = entriesForDay(
      fact({ regular_hours: 8, ot_hours_actual: 2, ot: { project_id: null, wbs_node_id: null, task_id: null, ot_type: "weekday" } }),
      [alloc("p1", 50), alloc("p2", 50)],
    );
    expect(out.map((e) => [e.hours_worked, e.ot_hours, e.ot_type])).toEqual([[5, 1, "weekday"], [5, 1, "weekday"]]);
  });

  it("books OT on the project its request was raised for", () => {
    const out = entriesForDay(
      fact({ ot_hours_actual: 2, ot: { project_id: "pOT", wbs_node_id: "w1", task_id: null, ot_type: "weekend" } }),
      [alloc("p1", 100)],
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ project_id: "p1", hours_worked: 8, ot_hours: 0, ot_type: null });
    expect(out[1]).toMatchObject({ project_id: "pOT", wbs_node_id: "w1", hours_worked: 2, ot_hours: 2, ot_type: "weekend" });
  });

  it("creates nothing for a day without payable hours", () => {
    expect(entriesForDay(fact({ status: "LEAVE", regular_hours: 0 }), [alloc("p1", 100)])).toEqual([]);
  });
});

describe("planWeek", () => {
  const facts = [fact({ date: "2026-10-05" }), fact({ date: "2026-10-06" })];
  const allocs = () => [alloc("p1", 100)];

  it("replaces auto entries and inserts fresh ones", () => {
    const plan = planWeek(facts, [{ id: "old", entry_date: "2026-10-05", source: "auto" }], allocs);
    expect(plan.deleteIds).toEqual(["old"]);
    expect(plan.insert.map((e) => e.entry_date)).toEqual(["2026-10-05", "2026-10-06"]);
    expect(plan.keptManualDates).toEqual([]);
  });

  it("leaves a day alone once a person has entered or edited it", () => {
    const plan = planWeek(
      facts,
      [{ id: "m", entry_date: "2026-10-05", source: "manual" }, { id: "a", entry_date: "2026-10-05", source: "auto" }],
      allocs,
    );
    expect(plan.keptManualDates).toEqual(["2026-10-05"]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.insert.map((e) => e.entry_date)).toEqual(["2026-10-06"]);
  });

  it("clears auto entries on a day that no longer has a fact", () => {
    const plan = planWeek([], [{ id: "stale", entry_date: "2026-10-07", source: "auto" }], allocs);
    expect(plan.deleteIds).toEqual(["stale"]);
  });
});

describe("checkDays", () => {
  const facts = [fact({ date: "2026-10-05", ot_hours_actual: 2 }), fact({ date: "2026-10-06", status: "LEAVE", regular_hours: 0 })];

  it("is quiet when booked hours match regular plus approved OT", () => {
    expect(checkDays(facts, [{ entry_date: "2026-10-05", hours_worked: 6, ot_hours: 1 }, { entry_date: "2026-10-05", hours_worked: 4, ot_hours: 1 }])).toEqual([]);
  });

  it("flags short, missing and out-of-place hours", () => {
    const issues = checkDays(facts, [
      { entry_date: "2026-10-05", hours_worked: 7, ot_hours: 0 },
      { entry_date: "2026-10-06", hours_worked: 8, ot_hours: 0 },
      { entry_date: "2026-10-09", hours_worked: 8, ot_hours: 0 },
    ]);
    expect(issues.map((i) => i.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-09"]);
    expect(issues[0].message).toContain("7h booked but attendance recorded 10h");
    expect(issues[1].message).toContain("leave day");
    expect(issues[2].message).toContain("no attendance record");
  });

  it("flags a day with attendance but nothing booked", () => {
    expect(checkDays([fact()], [])[0].message).toContain("No hours booked");
  });
});
