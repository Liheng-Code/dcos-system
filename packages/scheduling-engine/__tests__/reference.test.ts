// Scheduling engine reference suite (doc 35 E8; PRD doc 34 §20). Every expected date below was
// worked out by hand on the calendar named in the test, so a failure means the engine changed, not
// the expectation. Unless stated: Monday–Friday calendar, project start Monday 2027-01-04.
//   January 2027: Mon 4 Tue 5 Wed 6 Thu 7 Fri 8 | Mon 11 … Fri 15 | Mon 18 …

import { describe, expect, it } from "vitest";
import { baselineVariance, scheduleProject, type ScheduleOptions, type TaskDates } from "../src/schedule-engine";
import { levelResources } from "../src/resource-levelling";
import { scheduleInputHash } from "../src/input-hash";
import { ENGINE_VERSION } from "../src/version";
import type { WorkCalendar } from "../src/work-calendar";
import { MON_FRI, ff, fs, largeNetwork, sf, ss, task } from "./fixtures";

const START = "2027-01-04";
const SEVEN_DAY: WorkCalendar = { id: "7d", name: "7-day", workdays: [true, true, true, true, true, true, true], exceptions: new Map() };

function run(tasks: Parameters<typeof scheduleProject>[0], opts: ScheduleOptions = {}, cal: WorkCalendar = MON_FRI, start = START) {
  const r = scheduleProject(tasks, cal, start, { critical: 0, nearCritical: 5 }, opts);
  if (!r.ok) throw new Error(`cycle ${r.cycle.join(" > ")}`);
  return r;
}
const d = (r: ReturnType<typeof run>, id: string) => r.dates.get(id);
const tf = (r: ReturnType<typeof run>, id: string) => r.float.get(id)!.totalFloat;

describe("1–4 relationship types", () => {
  it("1 FS: B starts the working day after A finishes", () => {
    const r = run([task("A", 3), task("B", 2, [fs("A")])]);
    expect(d(r, "A")).toEqual({ start: "2027-01-04", finish: "2027-01-06" });
    expect(d(r, "B")).toEqual({ start: "2027-01-07", finish: "2027-01-08" });
    expect(tf(r, "A")).toBe(0);
    expect(tf(r, "B")).toBe(0);
  });

  it("2 SS: B starts with A and has float to A's finish", () => {
    const r = run([task("A", 5), task("B", 3, [ss("A")])]);
    expect(d(r, "B")).toEqual({ start: "2027-01-04", finish: "2027-01-06" });
    expect(tf(r, "B")).toBe(2); // late finish Fri 8 → late start Wed 6
  });

  it("3 FF: B finishes with A", () => {
    const r = run([task("A", 5), task("B", 2, [ff("A")])]);
    expect(d(r, "B")).toEqual({ start: "2027-01-07", finish: "2027-01-08" });
    expect(tf(r, "A")).toBe(0);
    expect(tf(r, "B")).toBe(0);
  });

  it("4 SF (+5): B must finish 5 days after A starts", () => {
    // finish = A start Mon 4, minus 1 working day, plus 5 = Fri 8
    const r = run([task("A", 3), task("B", 2, [sf("A", 5)])]);
    expect(d(r, "B")).toEqual({ start: "2027-01-07", finish: "2027-01-08" });
  });
});

describe("5–6 lag", () => {
  it("5 positive lag: FS+3 skips three working days", () => {
    const r = run([task("A", 2), task("B", 1, [fs("A", 3)])]);
    expect(d(r, "A")).toEqual({ start: "2027-01-04", finish: "2027-01-05" });
    expect(d(r, "B")).toEqual({ start: "2027-01-11", finish: "2027-01-11" }); // Wed, Thu, Fri lag → Mon 11
  });

  it("6 negative lag: FS-2 overlaps the last two days", () => {
    const r = run([task("A", 5), task("B", 2, [fs("A", -2)])]);
    expect(d(r, "B")).toEqual({ start: "2027-01-07", finish: "2027-01-08" });
  });
});

describe("7–8 calendars", () => {
  const calendars = new Map([["7d", SEVEN_DAY]]);

  it("7 different calendars: a 7-day task runs through the weekend; lag follows the predecessor", () => {
    const r = run(
      [task("A", 3), task("B", 3, [fs("A")], { calendarId: "7d" }), task("C", 1, [fs("B")])],
      { calendars },
    );
    expect(d(r, "A")).toEqual({ start: "2027-01-04", finish: "2027-01-06" });
    expect(d(r, "B")).toEqual({ start: "2027-01-07", finish: "2027-01-09" }); // Thu, Fri, Sat
    expect(d(r, "C")).toEqual({ start: "2027-01-11", finish: "2027-01-11" }); // Sun is not a working day for C
  });

  it("7b lag calendar: FS+2 from a Friday finish", () => {
    const tasks = [task("A", 1, [], { constraintType: "start_no_earlier_than", constraintDate: "2027-01-08" }), task("B", 1, [fs("A", 2)], { calendarId: "7d" })];
    // predecessor calendar (Mon–Fri): lag days Mon 11, Tue 12 → start Wed 13
    expect(d(run(tasks, { calendars }), "B")?.start).toBe("2027-01-13");
    // successor calendar (7-day): lag days Sat 9, Sun 10 → start Mon 11
    expect(d(run(tasks, { calendars, lagCalendar: "successor" }), "B")?.start).toBe("2027-01-11");
  });

  it("8 weekends and holidays are skipped", () => {
    const cal: WorkCalendar = { ...MON_FRI, exceptions: new Map([["2027-01-06", false]]) };
    const r = run([task("A", 5), task("B", 1, [fs("A")])], {}, cal);
    expect(d(r, "A")).toEqual({ start: "2027-01-04", finish: "2027-01-11" }); // Mon, Tue, (Wed holiday), Thu, Fri, Mon
    expect(d(r, "B")).toEqual({ start: "2027-01-12", finish: "2027-01-12" });
  });
});

describe("9–12 network shape", () => {
  it("9 multiple critical paths are reported separately", () => {
    const r = run([task("A1", 3), task("A2", 2, [fs("A1")]), task("B1", 4), task("B2", 1, [fs("B1")]), task("C", 1)]);
    expect(d(r, "A2")?.finish).toBe("2027-01-08");
    expect(d(r, "B2")?.finish).toBe("2027-01-08");
    expect(tf(r, "C")).toBe(4);
    expect(r.criticalPaths.map((p) => [...p].sort())).toEqual(expect.arrayContaining([["A1", "A2"], ["B1", "B2"]]));
    expect(r.criticalPaths).toHaveLength(2);
  });

  it("10 open ends, dangling and self links are diagnosed", () => {
    const r = run([task("A", 1), task("B", 1, [fs("A")]), task("C", 1), task("D", 1, [fs("ghost")]), task("E", 1, [fs("E")])]);
    expect(r.diagnostics.openStart).toEqual(["A", "C", "D", "E"]);
    expect(r.diagnostics.openFinish).toEqual(["B", "C", "D", "E"]);
    expect(r.diagnostics.danglingLinks).toEqual([{ taskId: "D", predId: "ghost" }]);
    expect(r.diagnostics.selfLinks).toEqual(["E"]);
  });

  it("11 circular dependencies are refused", () => {
    const r = scheduleProject([task("A", 1, [fs("B")]), task("B", 1, [fs("A")])], MON_FRI, START);
    expect(r.ok).toBe(false);
    if (!r.ok) expect([...new Set(r.cycle)].sort()).toEqual(["A", "B"]);
  });

  it("12 multiple milestones: the longest path follows the chosen completion milestone", () => {
    const tasks = [task("A", 3), task("M1", 0, [fs("A")]), task("B", 5), task("M2", 0, [fs("B")])];
    const byDefault = run(tasks);
    expect(d(byDefault, "M1")).toEqual({ start: "2027-01-07", finish: "2027-01-07" });
    expect(d(byDefault, "M2")).toEqual({ start: "2027-01-11", finish: "2027-01-11" });
    expect(byDefault.longestPath).toEqual(["B", "M2"]);
    expect(run(tasks, { completionTaskId: "M1" }).longestPath).toEqual(["A", "M1"]);
  });
});

describe("13 constraints", () => {
  it("start no earlier than delays an unlinked task", () => {
    const r = run([task("A", 2, [], { constraintType: "start_no_earlier_than", constraintDate: "2027-01-06" })]);
    expect(d(r, "A")).toEqual({ start: "2027-01-06", finish: "2027-01-07" });
  });

  it("must start on overrides a link and is flagged", () => {
    const r = run([task("A", 3), task("B", 1, [fs("A")], { constraintType: "must_start_on", constraintDate: "2027-01-05" })]);
    expect(r.violations.get("B")).toMatch(/overrides a predecessor/);
    expect(d(r, "B")).toEqual({ start: "2027-01-05", finish: "2027-01-05" }); // the must date wins
  });

  it("finish no earlier than holds the finish", () => {
    const r = run([task("A", 2, [], { constraintType: "finish_no_earlier_than", constraintDate: "2027-01-08" })]);
    expect(d(r, "A")).toEqual({ start: "2027-01-07", finish: "2027-01-08" });
  });

  it("must finish on fixes the finish", () => {
    const r = run([task("A", 2, [], { constraintType: "must_finish_on", constraintDate: "2027-01-12" })]);
    expect(d(r, "A")).toEqual({ start: "2027-01-11", finish: "2027-01-12" });
  });

  it("start no later than is flagged when links push past it", () => {
    const r = run([task("A", 5), task("B", 1, [fs("A")], { constraintType: "start_no_later_than", constraintDate: "2027-01-08" })]);
    expect(d(r, "B")?.start).toBe("2027-01-11");
    expect(r.violations.get("B")).toMatch(/missed/);
    expect(tf(r, "B")).toBe(-1); // must start by Fri 8, starts Mon 11
  });

  it("as late as possible sits at the end of its float", () => {
    const r = run([task("A", 5), task("B", 1, [], { constraintType: "as_late_as_possible" })]);
    expect(d(r, "B")).toEqual({ start: "2027-01-08", finish: "2027-01-08" });
  });
});

describe("14–15 progress", () => {
  const DATA_DATE = "2027-01-11"; // Monday

  it("14 actual progress: complete, in progress and not started", () => {
    const r = run(
      [
        task("A", 3, [], { actualStart: "2027-01-04", actualFinish: "2027-01-06" }),
        task("B", 4, [fs("A")], { actualStart: "2027-01-07", percentComplete: 50 }),
        task("C", 2, [fs("B")]),
        task("D", 1, [], { start: "2027-01-05", finish: "2027-01-05" }),
      ],
      { dataDate: DATA_DATE },
    );
    expect(r.state.get("A")).toBe("complete");
    expect(d(r, "A")).toEqual({ start: "2027-01-04", finish: "2027-01-06" });
    expect(r.state.get("B")).toBe("in_progress");
    expect(d(r, "B")).toEqual({ start: "2027-01-07", finish: "2027-01-12" }); // 2 days left from Mon 11
    expect(d(r, "C")).toEqual({ start: "2027-01-13", finish: "2027-01-14" });
    expect(d(r, "D")).toEqual({ start: "2027-01-11", finish: "2027-01-11" }); // not started: not in the past
    expect(tf(r, "A")).toBe(0);
    expect(r.float.get("A")!.critical).toBe(false);
  });

  it("15 remaining duration: explicit, or the time since the actual start", () => {
    const explicit = run([task("B", 4, [], { actualStart: "2027-01-07", remainingWd: 3 })], { dataDate: DATA_DATE });
    expect(d(explicit, "B")?.finish).toBe("2027-01-13");
    // 4 days, started Thu 7: Thu and Fri done before the data date → 2 left → Mon 11, Tue 12
    const derived = run([task("B", 4, [], { actualStart: "2027-01-07" })], { dataDate: DATA_DATE });
    expect(d(derived, "B")?.finish).toBe("2027-01-12");
  });
});

describe("16 negative float", () => {
  it("a programme past its must-finish-by date has negative float", () => {
    const r = run([task("A", 5), task("B", 3, [fs("A")])], { mustFinishBy: "2027-01-12" });
    expect(d(r, "B")).toEqual({ start: "2027-01-11", finish: "2027-01-13" });
    expect(tf(r, "B")).toBe(-1);
    expect(tf(r, "A")).toBe(-1);
    expect(r.float.get("A")!.critical).toBe(true);
  });

  it("a missed finish-no-later-than gives negative float to the whole chain", () => {
    const r = run([task("A", 5), task("B", 3, [fs("A")], { constraintType: "finish_no_later_than", constraintDate: "2027-01-12" })]);
    expect(tf(r, "B")).toBe(-1);
    expect(tf(r, "A")).toBe(-1);
    expect(r.violations.get("B")).toMatch(/missed/);
  });
});

describe("17 resource assignment", () => {
  it("two tasks needing one crane are levelled apart within float", () => {
    const base = { task_code: "", task_name: "", latestFinish: "2027-01-15", freeFloatWd: 5 };
    const result = levelResources(
      [
        { ...base, id: "A", durationWd: 2, totalFloatWd: 0, earliestStart: "2027-01-04", resources: [{ resourceId: "crane", units: 1 }], priority: 1 },
        { ...base, id: "B", durationWd: 2, totalFloatWd: 5, earliestStart: "2027-01-04", resources: [{ resourceId: "crane", units: 1 }], priority: 2 },
      ],
      MON_FRI,
      { crane: 1 },
    );
    expect(result.overAllocationResolved).toBe(true);
    expect(result.starts.get("A")).toBe("2027-01-04");
    expect(result.starts.get("B")).toBe("2027-01-06");
  });
});

describe("18 baseline comparison", () => {
  it("variance in working days against the baseline", () => {
    const current = new Map<string, TaskDates>([["A", { start: "2027-01-05", finish: "2027-01-11" }], ["B", { start: "2027-01-07", finish: "2027-01-08" }]]);
    const baseline = new Map<string, TaskDates>([["A", { start: "2027-01-04", finish: "2027-01-07" }], ["B", { start: "2027-01-07", finish: "2027-01-08" }]]);
    const v = baselineVariance(MON_FRI, current, baseline);
    expect(v.get("A")).toEqual({ startVariance: 1, finishVariance: 2 }); // Thu 7 → Mon 11 is two working days
    expect(v.get("B")).toEqual({ startVariance: 0, finishVariance: 0 });
  });
});

describe("19 large network", () => {
  it("5,000 activities calculate in well under 10 seconds, deterministically", () => {
    const tasks = largeNetwork(5000);
    const t0 = performance.now();
    const a = run(tasks);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(10_000);
    const b = run([...tasks].reverse());
    for (const t of tasks) expect(d(b, t.id)).toEqual(d(a, t.id));
    expect(scheduleInputHash(tasks, MON_FRI, START, { critical: 0, nearCritical: 5 }))
      .toBe(scheduleInputHash([...tasks].reverse(), MON_FRI, START, { critical: 0, nearCritical: 5 }));
  });
});

describe("20 date edge cases", () => {
  it("leap day, year end and a daylight-saving weekend", () => {
    expect(d(run([task("A", 3)], {}, MON_FRI, "2028-02-28"), "A")).toEqual({ start: "2028-02-28", finish: "2028-03-01" }); // Mon, Tue 29, Wed
    expect(d(run([task("A", 3)], {}, MON_FRI, "2027-12-30"), "A")).toEqual({ start: "2027-12-30", finish: "2028-01-03" }); // Thu, Fri, Mon
    expect(d(run([task("A", 2)], {}, MON_FRI, "2027-03-26"), "A")).toEqual({ start: "2027-03-26", finish: "2027-03-29" }); // EU clocks change Sun 28
  });

  it("the fingerprint changes with any input and carries the engine version", () => {
    const t = [task("A", 3), task("B", 2, [fs("A")])];
    const h = scheduleInputHash(t, MON_FRI, START, { critical: 0, nearCritical: 5 });
    expect(h).toMatch(/^[0-9a-f]{28}$/);
    expect(scheduleInputHash([task("A", 3), task("B", 2, [fs("A", 1)])], MON_FRI, START, { critical: 0, nearCritical: 5 })).not.toBe(h);
    expect(scheduleInputHash(t, MON_FRI, START, { critical: 0, nearCritical: 5 }, { dataDate: "2027-01-05" })).not.toBe(h);
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
