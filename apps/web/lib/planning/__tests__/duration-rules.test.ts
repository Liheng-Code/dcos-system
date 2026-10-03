import { describe, expect, it } from "vitest";
import {
  buildWorkCalendar,
  DEFAULT_CALENDAR,
  finishInUnit,
  formatDuration,
  parseDurationInput,
  spanInUnit,
  startInUnit,
} from "../work-calendar";
import { afterFinish, engineDuration, scheduleProject, type EngineTask } from "../schedule-engine";
import { planProjectSchedule, workWeekLabel, type ScheduleInputTask } from "../project-schedule";

const cal = DEFAULT_CALENDAR; // Mon–Sat
// 2026-10-01 is a Thursday; 2026-10-04 a Sunday.

describe("default working week", () => {
  it("is Mon–Sat, also when a calendar row leaves Saturday unset", () => {
    expect(workWeekLabel(cal)).toBe("Mon–Sat");
    const row = { id: "c", name: null, monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: null, sunday: false };
    expect(workWeekLabel(buildWorkCalendar(row, []))).toBe("Mon–Sat");
  });
});

describe("duration units", () => {
  it("working days skip Sunday; calendar days do not", () => {
    expect(finishInUnit(cal, "2026-10-01", 4, "wd")).toBe("2026-10-05");
    expect(finishInUnit(cal, "2026-10-01", 4, "cd")).toBe("2026-10-04");
    expect(spanInUnit(cal, "2026-10-01", "2026-10-05", "wd")).toBe(4);
    expect(spanInUnit(cal, "2026-10-01", "2026-10-05", "cd")).toBe(5);
    expect(startInUnit(cal, "2026-10-04", 4, "cd")).toBe("2026-10-01");
  });

  it("parses typed durations", () => {
    expect(parseDurationInput("5")).toEqual({ days: 5, unit: "wd" });
    expect(parseDurationInput("7cd")).toEqual({ days: 7, unit: "cd" });
    expect(parseDurationInput(" 7 ED ")).toEqual({ days: 7, unit: "cd" });
    expect(parseDurationInput("3d", "cd")).toEqual({ days: 3, unit: "wd" });
    expect(parseDurationInput("4", "cd")).toEqual({ days: 4, unit: "cd" });
    expect(parseDurationInput("1.5")).toBeNull();
    expect(parseDurationInput("")).toBeNull();
    expect(formatDuration(7, "cd")).toBe("7 cd");
    expect(formatDuration(7, "wd")).toBe("7");
  });
});

describe("engine duration source", () => {
  it("dates win; stored duration when undated; 1 otherwise", () => {
    expect(engineDuration(cal, { start: "2026-10-01", finish: "2026-10-05", durationDays: 99 })).toEqual({ durationWd: 4, elapsed: false });
    expect(engineDuration(cal, { start: null, finish: null, durationDays: 12 })).toEqual({ durationWd: 12, elapsed: false });
    expect(engineDuration(cal, { start: null, finish: null, durationDays: 7, unit: "cd" })).toEqual({ durationWd: 7, elapsed: true });
    expect(engineDuration(cal, { start: null, finish: null })).toEqual({ durationWd: 1, elapsed: false });
    expect(engineDuration(cal, { start: null, finish: null, isMilestone: true, durationDays: 5 }).durationWd).toBe(0);
  });

  it("a successor of a task ending on Sunday starts Monday", () => {
    expect(afterFinish(cal, "2026-10-04", 0)).toBe("2026-10-05");
    expect(afterFinish(cal, "2026-10-03", 0)).toBe("2026-10-05");
    expect(afterFinish(cal, "2026-10-02", 1)).toBe("2026-10-05");
  });
});

describe("calendar-day activities in the network", () => {
  const t = (id: string, dur: number, deps: string[] = [], elapsed = false): EngineTask => ({
    id, start: null, finish: null, durationWd: dur, elapsed, manuallyScheduled: false,
    constraintType: null, constraintDate: null, deps: deps.map((predId) => ({ predId, type: "fs" as const, lag: 0 })),
  });

  it("curing runs over Sunday and the next pour starts the following working day", () => {
    const r = scheduleProject([t("pour", 1), t("cure", 7, ["pour"], true), t("strip", 1, ["cure"])], cal, "2026-10-01");
    if (!r.ok) throw new Error("cycle");
    expect(r.dates.get("pour")).toEqual({ start: "2026-10-01", finish: "2026-10-01" });
    expect(r.dates.get("cure")).toEqual({ start: "2026-10-02", finish: "2026-10-08" });
    expect(r.dates.get("strip")).toEqual({ start: "2026-10-09", finish: "2026-10-09" });
  });
});

describe("planProjectSchedule (tender: durations + links, no dates)", () => {
  const task = (id: string, dur: number | null, preds: string[] = [], extra: Partial<ScheduleInputTask> = {}): ScheduleInputTask => ({
    id, task_code: id.toUpperCase(), start_date: null, end_date: null, duration_days: dur, duration_unit: "wd",
    is_milestone: false, manually_scheduled: false, constraint_type: null, constraint_date: null,
    dependency_task_ids: preds, dependency_types: preds.map(() => "fs"), dependency_lag_days: preds.map(() => 0),
    ...extra,
  });

  it("lays out from the project start using stored durations", () => {
    const r = planProjectSchedule([task("a", 5), task("b", 3, ["a"]), task("c", 2)], cal, "2026-10-01");
    if (!r.ok) throw new Error("cycle");
    const by = new Map(r.rows.map((x) => [x.id, x]));
    expect(by.get("a")).toEqual({ id: "a", start_date: "2026-10-01", end_date: "2026-10-06" });
    expect(by.get("b")).toEqual({ id: "b", start_date: "2026-10-07", end_date: "2026-10-09" });
    expect(by.get("c")).toEqual({ id: "c", start_date: "2026-10-01", end_date: "2026-10-02" });
    expect(r.finish).toBe("2026-10-09");
    expect(r.workingDays).toBe(8);
    expect(r.changed).toBe(3);
  });

  it("re-lays out old dates from a new start, but keeps manual ones", () => {
    const r = planProjectSchedule([
      task("a", 2, [], { start_date: "2025-01-06", end_date: "2025-01-07" }),
      task("m", null, [], { start_date: "2026-11-02", end_date: "2026-11-03", manually_scheduled: true }),
      task("b", 1, ["m"]),
    ], cal, "2026-10-01");
    if (!r.ok) throw new Error("cycle");
    const by = new Map(r.rows.map((x) => [x.id, x]));
    expect(by.get("a")!.start_date).toBe("2026-10-01");
    expect(by.get("m")).toEqual({ id: "m", start_date: "2026-11-02", end_date: "2026-11-03" });
    expect(by.get("b")!.start_date).toBe("2026-11-04");
  });

  it("reports loops by activity code", () => {
    const r = planProjectSchedule([task("a", 1, ["b"]), task("b", 1, ["a"])], cal, "2026-10-01");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(new Set(r.cycle)).toEqual(new Set(["A", "B"]));
  });
});
