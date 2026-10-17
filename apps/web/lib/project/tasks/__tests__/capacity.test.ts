import { describe, expect, it } from "vitest";
import { checkAllocation, computeCapacity, type CapacityCalendar } from "../capacity";

// Mon–Fri calendar, 8h, to keep expected numbers simple. 2026-10-12 is a Monday.
const monFri: CapacityCalendar = { workdays: [false, true, true, true, true, true, false], hoursPerDay: 8 };
const week = { from: "2026-10-12", to: "2026-10-18", calendar: monFri };
const weekTask = (hours: number, id = "t") => [{ taskId: id, start: "2026-10-12", end: "2026-10-16", hours }];

describe("computeCapacity", () => {
  it("gives 40h for a Mon–Fri week with nothing planned", () => {
    const r = computeCapacity(week);
    expect(r.workingDays).toBe(5);
    expect(r.availableHours).toBe(40);
    expect(r.utilizationPct).toBe(0);
    expect(r.level).toBe("ok");
  });

  it("subtracts holidays and approved leave, but not pending leave", () => {
    const r = computeCapacity({
      ...week,
      holidays: new Set(["2026-10-13"]),
      leave: [
        { start: "2026-10-14", end: "2026-10-14", status: "approved" },
        { start: "2026-10-15", end: "2026-10-15", status: "submitted" },
      ],
    });
    expect(r.availableHours).toBe(24);
    expect(r.holidayHours).toBe(8);
    expect(r.leaveHours).toBe(8);
    expect(r.pendingLeaveHours).toBe(8);
    expect(r.limitations.join(" ")).toMatch(/Pending leave/);
  });

  it("handles half-day leave and working-day exceptions", () => {
    const r = computeCapacity({
      ...week,
      leave: [{ start: "2026-10-12", end: "2026-10-12", status: "approved", isHalfDay: true }],
      calendar: { ...monFri, exceptions: new Map([["2026-10-17", true]]) }, // working Saturday
    });
    expect(r.workingDays).toBe(6);
    expect(r.availableHours).toBe(44);
  });

  it("spreads task effort over working days and counts only the in-period share", () => {
    // 20h over Mon 12 – Fri 23 (10 working days); this week holds 5 of them.
    const r = computeCapacity({
      ...week,
      tasks: [{ taskId: "t1", start: "2026-10-12", end: "2026-10-23", hours: 20 }],
    });
    expect(r.plannedHours).toBe(10);
    expect(r.utilizationPct).toBe(25);
  });

  it("does not double count the same shared task", () => {
    expect(computeCapacity({ ...week, tasks: [...weekTask(20, "t1"), ...weekTask(20, "t1")] }).plannedHours).toBe(20);
  });

  it("flags warn above 85% and over above 100%", () => {
    expect(computeCapacity({ ...week, tasks: weekTask(34) }).level).toBe("ok"); // exactly 85%
    expect(computeCapacity({ ...week, tasks: weekTask(36) }).level).toBe("warn");
    expect(computeCapacity({ ...week, tasks: weekTask(41) }).level).toBe("over");
  });

  it("honours custom thresholds", () => {
    const r = computeCapacity({ ...week, thresholds: { warnPct: 50, overPct: 90 }, tasks: weekTask(24) });
    expect(r.level).toBe("warn");
  });

  it("reports unplaced tasks and a missing calendar instead of inventing data", () => {
    const r = computeCapacity({
      from: week.from,
      to: week.to,
      tasks: [{ taskId: "nodates", start: null, end: null, hours: 8 }],
    });
    expect(r.unplacedTaskIds).toEqual(["nodates"]);
    expect(r.plannedHours).toBe(0);
    expect(r.limitations.length).toBe(2);
    expect(r.workingDays).toBe(6); // fallback Mon–Sat
  });

  it("is over when work is planned but nothing is available", () => {
    const r = computeCapacity({
      ...week,
      leave: [{ start: "2026-10-12", end: "2026-10-18", status: "approved" }],
      tasks: weekTask(8),
    });
    expect(r.availableHours).toBe(0);
    expect(r.utilizationPct).toBeNull();
    expect(r.level).toBe("over");
  });

  it("warns when project allocations exceed 100%", () => {
    const r = computeCapacity({ ...week, allocationPercentTotal: 120 });
    expect(r.limitations.join(" ")).toMatch(/120%/);
  });
});

describe("checkAllocation", () => {
  it("requires an override reason when the addition pushes past the threshold", () => {
    const base = { ...week, tasks: weekTask(32, "a") };
    const small = checkAllocation(base, weekTask(2, "b")[0]);
    expect(small.needsOverrideReason).toBe(false);
    const big = checkAllocation(base, weekTask(12, "c")[0]);
    expect(big.before.level).toBe("ok");
    expect(big.after.level).toBe("over");
    expect(big.needsOverrideReason).toBe(true);
  });
});
