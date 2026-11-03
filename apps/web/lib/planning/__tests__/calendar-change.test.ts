import { describe, expect, it } from "vitest";
import {
  applyCalendarEdit, calculateProgramme, compareProgrammes, describeEdit, lockedNodes, type CalendarSet, type ProgrammeTask,
} from "../calendar-change";

// Mon–Fri calendar; data date Mon 2 Nov 2026
const set: CalendarSet = {
  rows: [{ id: "cal", name: "Site", is_default: true, monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false, hours_per_day: 8 }],
  exceptions: [],
};
const task = (id: string, over: Partial<ProgrammeTask> = {}): ProgrammeTask => ({
  id, task_code: id, task_name: `Task ${id}`, wbs_node_id: "n1", start_date: null, end_date: null, duration_days: 5, duration_unit: "wd",
  is_milestone: false, manually_scheduled: false, constraint_type: null, constraint_date: null,
  dependency_task_ids: [], dependency_types: [], dependency_lag_days: [], calendar_id: null,
  actual_start_date: null, actual_finish_date: null, progress: 0, ...over,
});
const tasks = [task("A"), task("B", { dependency_task_ids: ["A"], dependency_types: ["FS"], dependency_lag_days: [0] })];

describe("calendar change preview (doc 35 I2)", () => {
  it("a holiday inside the work moves it and its successors", () => {
    const before = calculateProgramme(tasks, set, "2026-11-02");
    const edit = { kind: "add_exception" as const, calendarId: "cal", date: "2026-11-04", isWorking: false, reason: "Holiday" };
    const after = calculateProgramme(tasks, applyCalendarEdit(set, edit), "2026-11-02");
    if (!before.ok || !after.ok) throw new Error("cycle");
    expect(before.dates.get("A")).toEqual({ start: "2026-11-02", finish: "2026-11-06" });
    expect(after.dates.get("A")).toEqual({ start: "2026-11-02", finish: "2026-11-09" });
    const impact = compareProgrammes(tasks, before.dates, after.dates, [
      { code: "PC", name: "Completion", contract_date: "2026-11-13", revised_date: null, task_id: "B" },
    ]);
    expect(impact.finishBefore).toBe("2026-11-13");
    expect(impact.finishAfter).toBe("2026-11-16");
    expect(impact.finishDelta).toBe(3);
    expect(impact.moved.map((m) => m.code).sort()).toEqual(["A", "B"]);
    expect(impact.milestones).toEqual([{ code: "PC", name: "Completion", date: "2026-11-13", forecastBefore: "2026-11-13", forecastAfter: "2026-11-16" }]);
    // stored dates were never calculated
    expect(impact.notCalculated).toBe(2);
  });

  it("working Saturdays bring the finish in; locked WBS items keep their dates", () => {
    const sat = applyCalendarEdit(set, { kind: "update", calendarId: "cal", patch: { saturday: true } });
    const run = calculateProgramme(tasks, sat, "2026-11-02");
    if (!run.ok) throw new Error("cycle");
    expect(run.dates.get("B")?.finish).toBe("2026-11-12");
    const fixed = [task("A", { start_date: "2026-11-02", end_date: "2026-11-06" })];
    const locked = calculateProgramme(fixed, sat, "2026-11-02", lockedNodes([{ id: "n1", parent_id: null, is_locked: true }]));
    if (!locked.ok) throw new Error("cycle");
    expect(locked.dates.get("A")).toEqual({ start: "2026-11-02", finish: "2026-11-06" });
  });

  it("keeps the stored duration when the calendar changes under dated work", () => {
    // 10 working days Mon–Fri: 2–13 Nov; with Saturdays working the same 10 days end on Thu 12 Nov
    const dated = [task("A", { start_date: "2026-11-02", end_date: "2026-11-13", duration_days: 10 })];
    const sat = applyCalendarEdit(set, { kind: "update", calendarId: "cal", patch: { saturday: true } });
    const run = calculateProgramme(dated, sat, "2026-11-02");
    if (!run.ok) throw new Error("cycle");
    expect(run.dates.get("A")).toEqual({ start: "2026-11-02", finish: "2026-11-12" });
    // a manually scheduled activity keeps its dates
    const manual = calculateProgramme([{ ...dated[0], manually_scheduled: true }], sat, "2026-11-02");
    if (!manual.ok) throw new Error("cycle");
    expect(manual.dates.get("A")).toEqual({ start: "2026-11-02", finish: "2026-11-13" });
  });

  it("edits apply to a copy and read as a sentence", () => {
    const withHoliday = applyCalendarEdit(set, { kind: "add_exception", calendarId: "cal", date: "2026-11-04", isWorking: false, reason: null });
    expect(set.exceptions).toHaveLength(0);
    const exId = withHoliday.exceptions[0].id;
    expect(applyCalendarEdit(withHoliday, { kind: "remove_exception", calendarId: "cal", exceptionId: exId }).exceptions).toHaveLength(0);
    expect(applyCalendarEdit(set, { kind: "delete", calendarId: "cal" }).rows).toHaveLength(0);
    expect(describeEdit(set, { kind: "add_exception", calendarId: "cal", date: "2026-11-04", isWorking: false, reason: null })).toBe("Close 2026-11-04 in Site");
  });

  it("making one calendar the default clears the others", () => {
    const two: CalendarSet = { rows: [...set.rows, { ...set.rows[0], id: "c2", name: "Night", is_default: false }], exceptions: [] };
    const out = applyCalendarEdit(two, { kind: "update", calendarId: "c2", patch: { is_default: true } });
    expect(out.rows.map((r) => r.is_default)).toEqual([false, true]);
  });
});
