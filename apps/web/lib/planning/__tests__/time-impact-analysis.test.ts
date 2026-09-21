import { describe, expect, it } from "vitest";
import { runTia, type FragnetActivity, type TiaTask } from "../time-impact-analysis";
import { DEFAULT_CALENDAR } from "../work-calendar";

const cal = DEFAULT_CALENDAR; // Mon–Fri

function task(id: string, overrides: Partial<TiaTask>): TiaTask {
  return {
    id,
    task_code: id,
    task_name: id,
    start_date: null,
    end_date: null,
    baseline_start: null,
    baseline_finish: null,
    progress: 0,
    is_milestone: false,
    manually_scheduled: false,
    constraint_type: null,
    constraint_date: null,
    dependency_task_ids: [],
    dependency_types: [],
    dependency_lag_days: [],
    ...overrides,
  };
}

// A(3d, done) -> B(2d) -> M(milestone). Baseline finish = Mon Jan 12.
// A pure chain: B drives M, so a delay on B propagates to the milestone.
function baseNetwork(dataDate: string): TiaTask[] {
  return [
    task("A", {
      baseline_start: "2026-01-05",
      baseline_finish: "2026-01-07",
      start_date: "2026-01-05",
      end_date: "2026-01-07",
      progress: 1,
    }),
    task("B", {
      baseline_start: "2026-01-08",
      baseline_finish: "2026-01-09",
      dependency_task_ids: ["A"],
      dependency_types: ["fs"],
      dependency_lag_days: [0],
    }),
    task("M", {
      baseline_start: "2026-01-12",
      baseline_finish: "2026-01-12",
      is_milestone: true,
      dependency_task_ids: ["B"],
      dependency_types: ["fs"],
      dependency_lag_days: [0],
    }),
  ];
}

describe("runTia — a 3-day fragment on a finished predecessor chain", () => {
  const dataDate = "2026-01-08";
  const tasks = baseNetwork(dataDate);
  const fragnet: FragnetActivity[] = [
    { id: "F", name: "Foundry delay", durationWd: 3, deps: [] },
  ];

  const result = runTia({ tasks, cal, dataDate, fragnet, impactedActivityIds: ["B"] });

  it("measures the slip on project finish and the milestone", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.baseFinish).toBe("2026-01-12");
    // F runs Jan 8 → finishes Jan 12 (Mon); B then FS-0 → Jan 13 → Jan 14; M Jan 15.
    expect(result.impactedFinish).toBe("2026-01-15");
    expect(result.slipWd).toBe(3);

    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0].taskId).toBe("M");
    expect(result.milestones[0].slipWd).toBe(3);
  });

  it("keeps the completed predecessor pinned in the base run", () => {
    if (!result.ok) return;
    const b = result.baseDates.get("B")!;
    // B is re-scheduled from its baseline, NOT yanked to the data date.
    expect(b.start).toBe("2026-01-08");
  });

  it("reports the critical path leaf drivers", () => {
    if (!result.ok) return;
    expect(result.criticalPathChanged).toBe(true);
    expect(result.impactedCritical).toContain("F");
  });
});

describe("runTia — no fragment coupling when nothing is impacted", () => {
  const dataDate = "2026-01-08";
  const result = runTia({
    tasks: baseNetwork(dataDate),
    cal,
    dataDate,
    fragnet: [{ id: "F", name: "Explore only", durationWd: 2, deps: [] }],
    impactedActivityIds: [],
  });

  it("reports slip 0 because the fragment is not linked to any activity", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slipWd).toBe(0);
    expect(result.baseFinish).toBe("2026-01-12");
  });
});

describe("runTia — cyclic fragment is rejected", () => {
  const dataDate = "2026-01-08";
  const result = runTia({
    tasks: baseNetwork(dataDate),
    cal,
    dataDate,
    fragnet: [
      { id: "F1", name: "frag root", durationWd: 1, deps: [] },
      { id: "F2", name: "frag mid", durationWd: 1, deps: [{ predId: "F1", type: "fs", lag: 0 }] },
    ],
    impactedActivityIds: ["B"],
    // force a cycle: F1 references F2
  });

  // Build a genuinely cyclic fragment.
  const cyclic = runTia({
    tasks: baseNetwork(dataDate),
    cal,
    dataDate,
    fragnet: [
      { id: "G1", name: "a", durationWd: 1, deps: [{ predId: "G2", type: "fs", lag: 0 }] },
      { id: "G2", name: "b", durationWd: 1, deps: [{ predId: "G1", type: "fs", lag: 0 }] },
    ],
    impactedActivityIds: [],
  });

  it("returns ok:false rather than hanging or writing nonsense", () => {
    expect(result.ok).toBe(true); // benign self-contained fragment is fine
    expect(cyclic.ok).toBe(false);
    if (!cyclic.ok) expect(cyclic.cycle).toBeTruthy();
  });
});