// The levelling engine keeps demand incrementally (fast). This checks it makes exactly the
// same decisions as the original algorithm (reference-levelling.ts), which recomputed
// everything on every push.
//
// One deliberate difference: the original STOPPED the whole run at the first conflict nobody
// could fix, leaving other, fixable conflicts untouched. The engine now skips such a conflict
// and carries on. So exact equality is required wherever the original did not bail out early.
import { describe, expect, it } from "vitest";
import { levelResources, type LevelTask } from "../resource-levelling";
import { DEFAULT_CALENDAR } from "../work-calendar";
import { referenceLevel } from "./reference-levelling";

const cal = DEFAULT_CALENDAR; // Mon–Fri
// The reference is the slow original, so keep the sample modest.
const SEEDS = 150;
const SLOW = 120_000;

// ── Random instances (seeded, so failures reproduce) ────────────────────────
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function instance(seed: number): { tasks: LevelTask[]; capacities: Record<string, number> } {
  const r = rng(seed);
  const pick = (n: number) => Math.floor(r() * n);
  const resources = ["Crew A", "Crew B", "Crew C"].slice(0, 1 + pick(3));
  const capacities: Record<string, number> = {};
  for (const res of resources) capacities[res] = 5 + pick(6); // 5..10 units
  const n = 4 + pick(7); // 4..10 tasks
  const tasks: LevelTask[] = Array.from({ length: n }, (_, i) => {
    const startDay = 5 + pick(12);
    return {
      id: `T${String(i).padStart(2, "0")}`,
      task_code: `T${String(i).padStart(2, "0")}`,
      task_name: `T${i}`,
      durationWd: 1 + pick(6),
      totalFloatWd: 60,
      freeFloatWd: 60,
      earliestStart: `2026-01-${String(startDay).padStart(2, "0")}`,
      latestFinish: "2026-12-31",
      resource: resources[pick(resources.length)],
      resourceUnits: 1 + pick(3), // 1..3 units per task (headcount-scale)
      priority: 1 + pick(4),
    };
  });
  return { tasks, capacities };
}

describe("levelResources — incremental engine matches the original algorithm", () => {
  it("makes identical decisions on random programmes (where the original ran to completion)", () => {
    let exact = 0;
    let exactWithMoves = 0;
    let skipped = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { tasks, capacities } = instance(seed);
      const ref = referenceLevel(tasks, cal, capacities);
      const got = levelResources(tasks, cal, capacities);
      expect(got.stoppedAtLimit, `seed ${seed}`).toBe(false);

      if (ref.stoppedNoMover) {
        skipped++; // original bailed out at an unfixable conflict — covered by the test below
        continue;
      }
      expect(got.overAllocationResolved, `seed ${seed} resolved`).toBe(!ref.unresolved);
      for (const [id, start] of ref.starts) expect(got.starts.get(id), `seed ${seed} start of ${id}`).toBe(start);
      expect(got.assignments.length, `seed ${seed} mover count`).toBe(ref.moved.size);
      for (const a of got.assignments) {
        expect(ref.moved.get(a.taskId), `seed ${seed} mover ${a.taskId}`).toEqual({ newStart: a.newStart, shiftedWd: a.shiftedWd });
      }
      exact++;
      if (ref.moved.size > 0) exactWithMoves++;
    }
    // Guard against a vacuous pass: plenty of instances compared exactly, most needing real levelling.
    expect(exact).toBeGreaterThan(SEEDS * 0.4);
    expect(exactWithMoves).toBeGreaterThan(SEEDS * 0.2);
    expect(skipped + exact).toBe(SEEDS);
  }, SLOW);

  it("where the original gave up early, the engine does at least as well", () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { tasks, capacities } = instance(seed);
      const ref = referenceLevel(tasks, cal, capacities);
      if (!ref.stoppedNoMover) continue;
      const got = levelResources(tasks, cal, capacities);
      // Every task the original moved is moved at least as far (the engine keeps pushing others too).
      for (const [id, m] of ref.moved) {
        const a = got.assignments.find((x) => x.taskId === id);
        expect(a, `seed ${seed} ${id} moved`).toBeDefined();
        expect(a!.shiftedWd, `seed ${seed} ${id} shift`).toBeGreaterThanOrEqual(m.shiftedWd);
      }
    }
  }, SLOW);

  it("keeps going past a conflict it cannot fix instead of stopping at it", () => {
    // Crew A: T1 + T2 overlap with zero float → cannot be fixed (residual).
    // Crew B: T3 + T4 overlap with float → fixable, and must still be levelled.
    const zero = { totalFloatWd: 0, freeFloatWd: 0, latestFinish: "2026-01-07" };
    const tasks: LevelTask[] = [
      { id: "T1", task_code: "T1", task_name: "T1", durationWd: 3, earliestStart: "2026-01-05", resource: "Crew A", resourceUnits: 1, priority: 1, ...zero },
      { id: "T2", task_code: "T2", task_name: "T2", durationWd: 3, earliestStart: "2026-01-05", resource: "Crew A", resourceUnits: 1, priority: 2, ...zero },
      { id: "T3", task_code: "T3", task_name: "T3", durationWd: 3, earliestStart: "2026-01-05", resource: "Crew B", resourceUnits: 1, priority: 1, totalFloatWd: 10, freeFloatWd: 10, latestFinish: "2026-01-30" },
      { id: "T4", task_code: "T4", task_name: "T4", durationWd: 3, earliestStart: "2026-01-05", resource: "Crew B", resourceUnits: 1, priority: 2, totalFloatWd: 10, freeFloatWd: 10, latestFinish: "2026-01-30" },
    ];
    const result = levelResources(tasks, cal, { "Crew A": 1, "Crew B": 1 });
    expect(result.starts.get("T4")).toBe("2026-01-08"); // Crew B was levelled
    expect(result.overAllocationResolved).toBe(false); // Crew A remains a residual
    expect(result.residual.every((r) => r.resource === "Crew A")).toBe(true);
    expect(result.residual.length).toBeGreaterThan(0);
  });

  it("reports stoppedAtLimit false when it simply runs out of float", () => {
    const tight: LevelTask = { id: "T1", task_code: "T1", task_name: "T1", durationWd: 3, totalFloatWd: 0, freeFloatWd: 0, earliestStart: "2026-01-05", latestFinish: "2026-01-07", resource: "Crew A", resourceUnits: 1, priority: 1 };
    const result = levelResources([tight, { ...tight, id: "T2", task_code: "T2", priority: 2 }], cal);
    expect(result.overAllocationResolved).toBe(false);
    expect(result.stoppedAtLimit).toBe(false);
  });
});
