import { describe, expect, it } from "vitest";
import { computeScheduleKpis, type KpiTask } from "../schedule-kpis";
import { scheduleProject, type EngineTask } from "../schedule-engine";
import { DEFAULT_CALENDAR, addWorkingDays } from "../work-calendar";

const cal = DEFAULT_CALENDAR;
const DATA_DATE = "2026-01-05"; // a Monday

function engineTask(id: string, overrides: Partial<EngineTask> = {}): EngineTask {
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

describe("computeScheduleKpis", () => {
  it("counts overdue, starting-soon and finishing-soon tasks against the data date", () => {
    const overdueTask: EngineTask = engineTask("overdue", { start: addWorkingDays(cal, DATA_DATE, -10), durationWd: 2 });
    const upcomingStart: EngineTask = engineTask("upcoming", {
      start: addWorkingDays(cal, DATA_DATE, 3),
      durationWd: 2,
      deps: [],
    });
    const farOut: EngineTask = engineTask("far", { start: addWorkingDays(cal, DATA_DATE, 30), durationWd: 2 });

    const engineTasks = [overdueTask, upcomingStart, farOut];
    const result = scheduleProject(engineTasks, cal, DATA_DATE);
    if (!result.ok) throw new Error("expected a valid schedule");

    const kpiTasks: KpiTask[] = [
      { id: "overdue", start_date: result.dates.get("overdue")!.start, end_date: result.dates.get("overdue")!.finish, progress: 40, status: "in_progress" },
      { id: "upcoming", start_date: result.dates.get("upcoming")!.start, end_date: result.dates.get("upcoming")!.finish, progress: 0, status: "open" },
      { id: "far", start_date: result.dates.get("far")!.start, end_date: result.dates.get("far")!.finish, progress: 0, status: "open" },
    ];

    const kpis = computeScheduleKpis(kpiTasks, result.float, result.dates, cal, DATA_DATE, null, null);
    expect(kpis.overdue).toBe(1);
    expect(kpis.startingNext14d).toBe(1);
  });

  it("excludes cancelled/on-hold tasks from overdue and upcoming counts", () => {
    const t: EngineTask = engineTask("t", { start: addWorkingDays(cal, DATA_DATE, -10), durationWd: 2 });
    const result = scheduleProject([t], cal, DATA_DATE);
    if (!result.ok) throw new Error("expected a valid schedule");

    const kpiTasks: KpiTask[] = [
      { id: "t", start_date: result.dates.get("t")!.start, end_date: result.dates.get("t")!.finish, progress: 0, status: "cancelled" },
    ];
    const kpis = computeScheduleKpis(kpiTasks, result.float, result.dates, cal, DATA_DATE, null, null);
    expect(kpis.overdue).toBe(0);
  });

  it("counts critical (negative/zero float) and near-critical tasks from the float map", () => {
    const origin = engineTask("origin", { start: DATA_DATE, durationWd: 1 });
    const critical = engineTask("critical", { durationWd: 10, deps: [{ predId: "origin", type: "fs", lag: 0 }] });
    const slack = engineTask("slack", { durationWd: 2, deps: [{ predId: "origin", type: "fs", lag: 0 }] });
    const join = engineTask("join", {
      durationWd: 1,
      deps: [
        { predId: "critical", type: "fs", lag: 0 },
        { predId: "slack", type: "fs", lag: 0 },
      ],
    });
    const result = scheduleProject([origin, critical, slack, join], cal, DATA_DATE, { critical: 0, nearCritical: 10 });
    if (!result.ok) throw new Error("expected a valid schedule");

    const kpiTasks: KpiTask[] = ["origin", "critical", "slack", "join"].map((id) => ({
      id,
      start_date: result.dates.get(id)!.start,
      end_date: result.dates.get(id)!.finish,
      progress: 0,
      status: "open",
    }));
    const kpis = computeScheduleKpis(kpiTasks, result.float, result.dates, cal, DATA_DATE, null, null);
    // origin, critical and join are all on the critical path (zero float);
    // slack has positive float within the wide near-critical band.
    expect(kpis.negativeFloat).toBe(3);
    expect(kpis.nearCritical).toBe(1);
  });

  it("computes forecast finish and a positive overrun when the schedule runs past the contract end", () => {
    const t = engineTask("t", { start: DATA_DATE, durationWd: 20 });
    const result = scheduleProject([t], cal, DATA_DATE);
    if (!result.ok) throw new Error("expected a valid schedule");
    const contractEnd = addWorkingDays(cal, DATA_DATE, 5); // well before the 20wd task finishes

    const kpiTasks: KpiTask[] = [{ id: "t", start_date: result.dates.get("t")!.start, end_date: result.dates.get("t")!.finish, progress: 0, status: "open" }];
    const kpis = computeScheduleKpis(kpiTasks, result.float, result.dates, cal, DATA_DATE, contractEnd, null);
    expect(kpis.forecastFinish).toBe(result.dates.get("t")!.finish);
    expect(kpis.overrunWd).toBeGreaterThan(0);
    expect(kpis.programmeStatus).toBe("overrun");
  });

  it("reports on_track when finishing well ahead of the contract end with nothing overdue", () => {
    const t = engineTask("t", { start: DATA_DATE, durationWd: 2 });
    const result = scheduleProject([t], cal, DATA_DATE);
    if (!result.ok) throw new Error("expected a valid schedule");
    const contractEnd = addWorkingDays(cal, DATA_DATE, 30);

    const kpiTasks: KpiTask[] = [{ id: "t", start_date: result.dates.get("t")!.start, end_date: result.dates.get("t")!.finish, progress: 0, status: "open" }];
    const kpis = computeScheduleKpis(kpiTasks, result.float, result.dates, cal, DATA_DATE, contractEnd, null);
    expect(kpis.overrunWd).toBeLessThan(0);
    expect(kpis.programmeStatus).toBe("on_track");
  });

  it("passes the pcr argument straight through", () => {
    const kpis = computeScheduleKpis([], new Map(), new Map(), cal, DATA_DATE, null, 87.5);
    expect(kpis.pcr).toBe(87.5);
  });
});
