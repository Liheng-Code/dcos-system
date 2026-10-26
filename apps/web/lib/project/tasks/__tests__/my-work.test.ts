import { describe, expect, it } from "vitest";
import { bucketTasks, plannedHoursByDay, weekStartOf } from "../my-work";
import type { CapacityCalendar } from "../capacity";

const monFri: CapacityCalendar = { workdays: [false, true, true, true, true, true, false], hoursPerDay: 8 };
const task = (id: string, status: string, start: string | null, end: string | null, extra = {}) => ({
  id, status, start_date: start, end_date: end, ...extra,
});

describe("weekStartOf", () => {
  it("returns Monday for any day of the week, including Sunday", () => {
    expect(weekStartOf("2026-10-14")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-12")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-18")).toBe("2026-10-12");
  });
});

describe("bucketTasks", () => {
  const today = "2026-10-14"; // Wednesday
  const tasks = [
    task("a", "in_progress", "2026-10-10", "2026-10-13"), // overdue, in progress
    task("b", "assigned", "2026-10-14", "2026-10-14"), // due today
    task("c", "assigned", "2026-10-19", "2026-10-23"), // upcoming
    task("d", "review", "2026-10-01", "2026-10-30"), // awaiting review
    task("e", "in_progress", "2026-10-01", "2026-10-16", { is_blocked: true }), // blocked, due this week
    task("f", "completed", "2026-10-01", "2026-10-05"),
    task("g", "cancelled", null, null),
  ];
  const b = bucketTasks(tasks, today, new Set(["a"]));

  it("finds overdue, due today and due this week", () => {
    expect(b.overdue.map((t) => t.id)).toEqual(["a"]);
    expect(b.dueToday.map((t) => t.id)).toEqual(["b"]);
    expect(b.dueThisWeek.map((t) => t.id).sort()).toEqual(["b", "e"]);
  });

  it("separates in progress, blocked, review and returned work", () => {
    expect(b.inProgress.map((t) => t.id).sort()).toEqual(["a", "e"]);
    expect(b.blocked.map((t) => t.id)).toEqual(["e"]);
    expect(b.awaitingReview.map((t) => t.id)).toEqual(["d"]);
    expect(b.returnedForRevision.map((t) => t.id)).toEqual(["a"]);
  });

  it("puts only work in its window into today and ignores done or cancelled tasks", () => {
    expect(b.today.map((t) => t.id).sort()).toEqual(["b", "e"]);
    expect(b.upcoming.map((t) => t.id)).toEqual(["c"]);
    expect(b.recentlyCompleted.map((t) => t.id)).toEqual(["f"]);
  });
});

describe("plannedHoursByDay", () => {
  it("spreads hours over working days, skipping weekends and holidays", () => {
    // Fri 16 – Tue 20: working days Fri, Mon, Tue (Sat/Sun off) = 3 days, 24h => 8h each
    const { days } = plannedHoursByDay(
      [{ taskId: "t", start: "2026-10-16", end: "2026-10-20", hours: 24 }],
      "2026-10-12", "2026-10-20", monFri,
    );
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.plannedHours]));
    expect(byDate["2026-10-16"]).toBe(8);
    expect(byDate["2026-10-17"]).toBe(0);
    expect(byDate["2026-10-19"]).toBe(8);
    expect(byDate["2026-10-12"]).toBe(0);

    const withHoliday = plannedHoursByDay(
      [{ taskId: "t", start: "2026-10-16", end: "2026-10-20", hours: 24 }],
      "2026-10-12", "2026-10-20", monFri, new Set(["2026-10-19"]),
    );
    expect(withHoliday.days.find((d) => d.date === "2026-10-16")?.plannedHours).toBe(12);
    expect(withHoliday.days.find((d) => d.date === "2026-10-19")?.working).toBe(false);
  });

  it("reports tasks without dates and counts a duplicate once", () => {
    const t = { taskId: "x", start: "2026-10-12", end: "2026-10-12", hours: 8 };
    const r = plannedHoursByDay(
      [t, t, { taskId: "n", start: null, end: null, hours: 4 }],
      "2026-10-12", "2026-10-12", monFri,
    );
    expect(r.days[0].plannedHours).toBe(8);
    expect(r.unplaced).toEqual(["n"]);
  });
});
