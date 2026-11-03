import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "../../work-calendar";
import { recoveryEffectiveness } from "../recovery-effectiveness";
import type { RecoveryTask } from "../recovery-engine";
import type { SavedLever } from "../recovery-service";

const cal = DEFAULT_CALENDAR; // Mon-Sat
const task = (id: string, start: string, finish: string, over: Partial<RecoveryTask> = {}): RecoveryTask => ({
  id, code: id, name: id, discipline: null, start, finish, progress: 0, isMilestone: false, manual: false, crewable: true,
  constraintType: null, constraintDate: null, depIds: [], depTypes: [], depLags: [], ...over,
});
const lever = (over: Partial<SavedLever>): SavedLever => ({ kind: "crew", taskId: "A", code: "A", name: "A", label: "x", fromWd: 10, toWd: 8, gainWd: 2, risk: "low", ...over });

describe("recoveryEffectiveness", () => {
  it("compares the achieved recovery with the planned one", () => {
    // A now runs Mon 5 Oct - Tue 13 Oct = 8 wd (held); B 10 wd against a planned 8 (slipped)
    const tasks = [task("A", "2026-10-05", "2026-10-13"), task("B", "2026-10-14", "2026-10-24"), task("C", "2026-10-26", "2026-11-04", { depIds: ["B"], depTypes: ["ss"], depLags: [3] })];
    const e = recoveryEffectiveness(
      {
        recovered_wd: 6, applied_at: "2026-10-01T00:00:00Z", applied_forecast_finish: "2026-11-10",
        levers: [lever({}), lever({ taskId: "B", code: "B" }), lever({ kind: "fasttrack", taskId: "C", code: "C", predId: "B", lag: 3 })],
      },
      tasks, cal,
    );
    expect(e.forecastNow).toBe("2026-11-04");
    expect(e.achievedWd).toBe(5); // 4 Nov -> 10 Nov is 5 working days (Sunday off)
    expect(e.achievedPct).toBe(83);
    expect(e.levers.map((l) => l.state)).toEqual(["held", "slipped", "held"]);
    expect(e.levers[1]).toMatchObject({ plannedWd: 8, nowWd: 10 });
    expect(e).toMatchObject({ held: 2, slipped: 1 });
  });

  it("has no achieved figure before the scenario is applied, and reports removed calendar days", () => {
    const e = recoveryEffectiveness(
      { recovered_wd: 3, applied_at: null, applied_forecast_finish: null, levers: [lever({ kind: "calendar", taskId: "", dates: ["2026-10-11", "2026-10-18"] })] },
      [task("A", "2026-10-05", "2026-10-13")], { ...cal, exceptions: new Map([["2026-10-11", true]]) },
    );
    expect(e.achievedWd).toBeNull();
    expect(e.levers[0]).toMatchObject({ state: "slipped", daysHeld: 1, daysPlanned: 2 });
  });
});
