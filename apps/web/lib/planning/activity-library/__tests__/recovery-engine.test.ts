import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "../../work-calendar";
import { analyseRecovery, changeListText, type MethodAlternative, type RecoverySettings, type RecoveryTask } from "../recovery-engine";

const START = "2026-10-05"; // Monday
const cal = DEFAULT_CALENDAR;

// dates are placeholders: for auto tasks the engine lays everything out from durations; duration is taken from start..finish working days
function task(id: string, wd: number, preds: string[] = [], over: Partial<RecoveryTask> = {}): RecoveryTask {
  // finish = start + wd - 1 working days on a Mon-Sat calendar from START
  const start = "2026-10-05";
  const d = new Date(start + "T00:00:00Z");
  let left = wd - 1;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0) left--; }
  return {
    id, code: id, name: `Task ${id}`, discipline: null, start, finish: d.toISOString().slice(0, 10), progress: 0, isMilestone: false, manual: false, crewable: true,
    constraintType: null, constraintDate: null, depIds: preds, depTypes: preds.map(() => "fs"), depLags: preds.map(() => 0), ...over,
  };
}

/** A(10) -> B(10) -> C(10), and a short parallel D(5) that is not critical */
const chain = () => [task("A", 10), task("B", 10, ["A"]), task("C", 10, ["B"]), task("D", 5)];

describe("analyseRecovery", () => {
  it("reports no gap and no scenarios when the target is already met", () => {
    const a = analyseRecovery(chain(), cal, START, null);
    expect(a.ok).toBe(true);
    expect(a.gapWd).toBe(0);
    expect(a.scenarios).toEqual([]);
  });

  it("reaches a target with crew boosts on the critical chain only", () => {
    const base = analyseRecovery(chain(), cal, START, null);
    // target 4 working days earlier than the forecast
    const target = analyseRecovery(chain(), cal, START, base.liveFinish);
    expect(target.liveFinish).toBe(base.liveFinish);
    const early = analyseRecovery(chain(), cal, START, shiftWd(base.liveFinish!, -4));
    expect(early.gapWd).toBe(4);
    const a = early.scenarios.find((s) => s.key === "A")!;
    expect(a.meetsTarget).toBe(true);
    expect(a.recoveredWd).toBeGreaterThanOrEqual(4);
    expect(a.levers.every((l) => l.kind === "crew")).toBe(true);
    expect(a.levers.map((l) => l.taskId)).not.toContain("E"); // not on the critical path
    // each chosen lever is measured: 20% of 10 wd = 2 wd, so two levers are enough
    expect(a.levers).toHaveLength(2);
    expect(a.levers.every((l) => l.gainWd === 2)).toBe(true);
    expect(a.risk).toBe("low");
  });

  it("asks for just enough on the last lever instead of the full cap", () => {
    const base = analyseRecovery(chain(), cal, START, null);
    const a = analyseRecovery(chain(), cal, START, shiftWd(base.liveFinish!, -3)).scenarios.find((s) => s.key === "A")!;
    expect(a.meetsTarget).toBe(true);
    expect(a.recoveredWd).toBe(3);
    expect(a.levers).toHaveLength(2);
    expect(a.levers[0].toWd).toBe(8); // full 20% on the first
    expect(a.levers[1].toWd).toBe(9); // only 10% on the second: 1 wd was all that was needed
    expect(a.levers[1].gainWd).toBe(1);
  });

  it("never adds crews to work crews cannot speed up: expediting is a separate, smaller lever", () => {
    const tasks = [task("P", 20, [], { crewable: false, name: "Procurement" }), task("S", 10, ["P"])];
    const base = analyseRecovery(tasks, cal, START, null);
    const r = analyseRecovery(tasks, cal, START, shiftWd(base.liveFinish!, -3));
    const a = r.scenarios.find((s) => s.key === "A")!;
    const c = r.scenarios.find((s) => s.key === "C")!;
    expect(a.levers.map((l) => l.taskId)).toEqual(["S"]); // only the site activity gets crews
    expect(c.levers.map((l) => l.kind)).toEqual(["expedite"]);
    expect(c.levers[0].taskId).toBe("P");
    expect(c.levers[0].toWd).toBeGreaterThanOrEqual(18); // cap 10% of 20
    expect(c.resourceNote).toContain("expedite");
  });

  it("does not repeat a family that would give the same changes", () => {
    const base = analyseRecovery(chain(), cal, START, null);
    const keys = analyseRecovery(chain(), cal, START, shiftWd(base.liveFinish!, -4)).scenarios.map((s) => s.key);
    expect(keys).not.toContain("B"); // no method alternatives
    expect(keys).not.toContain("C"); // nothing to expedite: every task is site work
    expect(keys).not.toContain("D"); // would equal A
  });

  it("reports what is still missing when the resources alone cannot reach the target", () => {
    const base = analyseRecovery(chain(), cal, START, null);
    const a = analyseRecovery(chain(), cal, START, shiftWd(base.liveFinish!, -12)).scenarios.find((s) => s.key === "A")!;
    // 3 x 2 = 6 wd at most
    expect(a.meetsTarget).toBe(false);
    expect(a.recoveredWd).toBe(6);
    expect(a.remainingGapWd).toBe(6);
  });

  it("never compresses started, manual or milestone work", () => {
    const tasks = [task("A", 10, [], { progress: 40 }), task("B", 10, ["A"], { manual: true }), task("M", 1, ["B"], { isMilestone: true }), task("C", 10, ["M"])];
    const base = analyseRecovery(tasks, cal, START, null);
    const a = analyseRecovery(tasks, cal, START, shiftWd(base.liveFinish!, -3)).scenarios.find((s) => s.key === "A")!;
    expect(a.levers.map((l) => l.taskId)).toEqual(["C"]);
  });

  it("uses a faster method from the library and flags a draft standard as high risk", () => {
    const alts = new Map<string, MethodAlternative[]>([["B", [{ methodName: "Crane + bucket", durationWd: 6, draft: false }]], ["C", [{ methodName: "Direct", durationWd: 4, draft: true }]]]);
    const base = analyseRecovery(chain(), cal, START, null, alts);
    const b = analyseRecovery(chain(), cal, START, shiftWd(base.liveFinish!, -4), alts).scenarios.find((s) => s.key === "B")!;
    expect(b.levers.map((l) => l.kind)).toEqual(["method"]);
    expect(b.levers[0].taskId).toBe("C"); // 10 -> 4 gains the most
    expect(b.risk).toBe("high");
    expect(b.levers[0].label).toContain("draft");
  });

  it("omits the method-only scenario when no alternative exists", () => {
    const base = analyseRecovery(chain(), cal, START, null);
    const a = analyseRecovery(chain(), cal, START, shiftWd(base.liveFinish!, -2));
    expect(a.scenarios.map((s) => s.key)).not.toContain("B");
  });

  it("fast-tracking overlaps a critical finish-to-start link and is the riskiest family", () => {
    const base = analyseRecovery(chain(), cal, START, null);
    const d = analyseRecovery(chain(), cal, START, shiftWd(base.liveFinish!, -5), new Map(), { maxCompression: 0.1, expediteCompression: 0.1, minDurationWd: 3, allowFastTrack: true, maxLevers: 12, candidateLimit: 60 }).scenarios.find((s) => s.key === "E")!;
    expect(d.levers.some((l) => l.kind === "fasttrack")).toBe(true);
    expect(d.risk).toBe("high");
    const off: RecoverySettings = { maxCompression: 0.2, expediteCompression: 0.1, minDurationWd: 3, allowFastTrack: false, maxLevers: 12, candidateLimit: 60 };
    expect(analyseRecovery(chain(), cal, START, shiftWd(base.liveFinish!, -5), new Map(), off).scenarios.map((s) => s.key)).not.toContain("E");
  });

  it("is deterministic, and a loop is reported instead of analysed", () => {
    const base = analyseRecovery(chain(), cal, START, null);
    const t = shiftWd(base.liveFinish!, -4);
    expect(JSON.stringify(analyseRecovery(chain(), cal, START, t))).toBe(JSON.stringify(analyseRecovery(chain(), cal, START, t)));
    const loop = [task("X", 5, ["Y"]), task("Y", 5, ["X"])];
    expect(analyseRecovery(loop, cal, START, null).ok).toBe(false);
  });

  it("writes a pasteable change list", () => {
    const base = analyseRecovery(chain(), cal, START, null);
    const a = analyseRecovery(chain(), cal, START, shiftWd(base.liveFinish!, -4));
    const text = changeListText(a.scenarios[0], a.targetFinish);
    expect(text).toContain("Recovery scenario A");
    expect(text).toContain("1. ");
    expect(text).toContain("Resources:");
  });
});

/** the date `n` working days from `iso` on the Mon-Sat calendar (n may be negative) */
function shiftWd(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) { d.setUTCDate(d.getUTCDate() + step); if (d.getUTCDay() !== 0) left--; }
  return d.toISOString().slice(0, 10);
}
