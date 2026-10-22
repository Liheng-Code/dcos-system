import { describe, expect, it } from "vitest";
import {
  EMPTY_LOOKAHEAD_FILTERS,
  LOOKAHEAD_STATUSES,
  UNASSIGNED_DISCIPLINE,
  applyLookaheadFilters,
  buildLookaheadZones,
  hasActiveLookaheadFilters,
  lookaheadDisciplineOptions,
  lookaheadStatus,
  overlapsWindow,
  parseLookaheadParams,
  writeLookaheadParams,
  type LookaheadUrlState,
} from "../lookahead-filters";

type T = Parameters<typeof lookaheadStatus>[0] & { task_code?: string };

function task(id: string, o: Partial<T> = {}): T {
  return {
    id,
    wbs_node_id: null,
    status: "not_started",
    delay_status: null,
    progress: 0,
    start_date: "2026-10-20",
    end_date: "2026-10-30",
    discipline: null,
    ...o,
  };
}

const DD = "2026-10-22";

describe("lookaheadStatus", () => {
  it("lists statuses in contract order", () => {
    expect(LOOKAHEAD_STATUSES.map((s) => s.label)).toEqual(["Not started", "In progress", "Late", "Done"]);
  });
  it("returns null for cancelled and rejected", () => {
    expect(lookaheadStatus(task("a", { status: "cancelled" }), DD)).toBeNull();
    expect(lookaheadStatus(task("a", { status: "rejected" }), DD)).toBeNull();
  });
  it("done for completed/closed, even when delayed or past end", () => {
    expect(lookaheadStatus(task("a", { status: "completed", delay_status: "delayed", end_date: "2026-01-01" }), DD)).toBe("done");
    expect(lookaheadStatus(task("a", { status: "closed" }), DD)).toBe("done");
  });
  it("late when delayed or end before data date; takes precedence over in progress", () => {
    expect(lookaheadStatus(task("a", { delay_status: "delayed" }), DD)).toBe("late");
    expect(lookaheadStatus(task("a", { end_date: "2026-10-21", progress: 50 }), DD)).toBe("late");
    expect(lookaheadStatus(task("a", { end_date: DD }), DD)).toBe("not_started");
  });
  it("in progress by progress or status", () => {
    expect(lookaheadStatus(task("a", { progress: 10 }), DD)).toBe("in_progress");
    for (const s of ["in_progress", "paused", "review", "submitted", "blocked"]) {
      expect(lookaheadStatus(task("a", { status: s }), DD)).toBe("in_progress");
    }
  });
  it("not started otherwise", () => {
    expect(lookaheadStatus(task("a", { status: "pending", end_date: null }), DD)).toBe("not_started");
  });
});

describe("overlapsWindow", () => {
  const from = "2026-10-22";
  const to = "2026-11-04";
  it("includes boundary touches", () => {
    expect(overlapsWindow(task("a", { start_date: to, end_date: "2026-11-10" }), from, to)).toBe(true);
    expect(overlapsWindow(task("a", { start_date: "2026-10-01", end_date: from }), from, to)).toBe(true);
  });
  it("excludes outside", () => {
    expect(overlapsWindow(task("a", { start_date: "2026-11-05", end_date: "2026-11-10" }), from, to)).toBe(false);
    expect(overlapsWindow(task("a", { start_date: "2026-10-01", end_date: "2026-10-21" }), from, to)).toBe(false);
  });
  it("null end is open-ended; null start is excluded", () => {
    expect(overlapsWindow(task("a", { start_date: "2026-10-01", end_date: null }), from, to)).toBe(true);
    expect(overlapsWindow(task("a", { start_date: null }), from, to)).toBe(false);
  });
});

const nodes = [
  { id: "p", parent_id: null, node_type: "project", wbs_code: "1", wbs_name: "Project", sort_order: 0 },
  { id: "b2", parent_id: "p", node_type: "building", wbs_code: "1.2", wbs_name: "Tower B", sort_order: 2 },
  { id: "b1", parent_id: "p", node_type: "building", wbs_code: "1.1", wbs_name: "Tower A", sort_order: 1 },
  { id: "l1", parent_id: "b1", node_type: "level", wbs_code: "1.1.1", wbs_name: "", sort_order: 1 },
  { id: "d1", parent_id: "l1", node_type: "discipline", wbs_code: "1.1.1.1", wbs_name: "MEP", sort_order: 1 },
  { id: "l2", parent_id: "b1", node_type: "level", wbs_code: "1.1.2", wbs_name: "Level 2", sort_order: 2 },
];

describe("buildLookaheadZones", () => {
  const tasks = [
    task("t1", { wbs_node_id: "d1" }),
    task("t2", { wbs_node_id: "b1" }),
    task("t3", { wbs_node_id: null }),
    task("t4", { wbs_node_id: "p" }),
  ];
  const { options, zonesByTaskId } = buildLookaheadZones(nodes, tasks);

  it("collects all zone ancestors including nested building > level", () => {
    expect([...zonesByTaskId.get("t1")!].sort()).toEqual(["b1", "l1"]);
    expect([...zonesByTaskId.get("t2")!]).toEqual(["b1"]);
    expect(zonesByTaskId.get("t3")!.size).toBe(0);
    expect(zonesByTaskId.get("t4")!.size).toBe(0);
  });
  it("lists only used zones in tree order with depth and label fallback", () => {
    expect(options).toEqual([
      { id: "b1", label: "Tower A", nodeType: "building", depth: 0 },
      { id: "l1", label: "1.1.1", nodeType: "level", depth: 1 },
    ]);
  });
  it("is safe against parent cycles", () => {
    const cyc = [
      { id: "x", parent_id: "y", node_type: "building", wbs_code: "x", wbs_name: "X", sort_order: 1 },
      { id: "y", parent_id: "x", node_type: "level", wbs_code: "y", wbs_name: "Y", sort_order: 1 },
      { id: "s", parent_id: "s", node_type: "phase", wbs_code: "s", wbs_name: "S", sort_order: 2 },
    ];
    const r = buildLookaheadZones(cyc, [task("a", { wbs_node_id: "x" }), task("b", { wbs_node_id: "s" })]);
    expect([...r.zonesByTaskId.get("a")!].sort()).toEqual(["x", "y"]);
    expect([...r.zonesByTaskId.get("b")!]).toEqual(["s"]);
    expect(r.options.map((o) => o.id).sort()).toEqual(["s", "x", "y"]);
  });
});

describe("lookaheadDisciplineOptions", () => {
  it("trims, counts, sorts by label with Unassigned last", () => {
    const opts = lookaheadDisciplineOptions([
      task("1", { discipline: " Civil " }),
      task("2", { discipline: "Civil" }),
      task("3", { discipline: null }),
      task("4", { discipline: "  " }),
      task("5", { discipline: "Architectural" }),
    ]);
    expect(opts).toEqual([
      { value: "Architectural", label: "Architectural", count: 1 },
      { value: "Civil", label: "Civil", count: 2 },
      { value: UNASSIGNED_DISCIPLINE, label: "Unassigned", count: 2 },
    ]);
  });
});

describe("applyLookaheadFilters", () => {
  const from = "2026-10-22";
  const to = "2026-11-04";
  const tasks = [
    task("a", { task_code: "B", start_date: "2026-10-25", discipline: "Civil", wbs_node_id: "n1" }),
    task("b", { task_code: "A", start_date: "2026-10-25", discipline: "MEP", wbs_node_id: "n2", progress: 20 }),
    task("c", { start_date: "2026-10-23", discipline: "Civil", wbs_node_id: "n2", status: "completed" }),
    task("d", { start_date: "2026-10-24", status: "cancelled" }),
    task("e", { start_date: "2026-12-01", end_date: "2026-12-05" }),
    task("f", { start_date: "2026-10-24", end_date: "2026-10-26", discipline: null, wbs_node_id: "n1" }),
  ];
  const zonesByTaskId = new Map<string, Set<string>>([
    ["a", new Set(["z1"])],
    ["b", new Set(["z2"])],
    ["c", new Set(["z2"])],
    ["f", new Set(["z1"])],
  ]);
  const run = (filters: Partial<typeof EMPTY_LOOKAHEAD_FILTERS>) =>
    applyLookaheadFilters(tasks, { from, to, dataDate: DD, filters: { ...EMPTY_LOOKAHEAD_FILTERS, ...filters }, zonesByTaskId });

  it("hides done, cancelled and out-of-window tasks; sorts by start then code", () => {
    const { windowTasks, matched } = run({});
    expect(windowTasks.map((t) => t.id)).not.toContain("d");
    expect(matched.map((t) => t.id)).toEqual(["f", "b", "a"]);
  });
  it("shows done only when the done status is selected", () => {
    const { windowTasks, matched } = run({ statuses: ["done"] });
    expect(windowTasks.map((t) => t.id)).toContain("c");
    expect(matched.map((t) => t.id)).toEqual(["c"]);
    // windowTasks is the same with or without filters, so "N of M" stays stable
    expect(run({}).windowTasks).toEqual(windowTasks);
  });
  it("ORs within a type", () => {
    expect(run({ disciplines: ["Civil", "MEP"] }).matched.map((t) => t.id)).toEqual(["b", "a"]);
    expect(run({ statuses: ["in_progress", "late"] }).matched.map((t) => t.id)).toEqual(["b"]);
    expect(run({ statuses: ["not_started", "in_progress"] }).matched.map((t) => t.id)).toEqual(["f", "b", "a"]);
  });
  it("ANDs across types", () => {
    expect(run({ disciplines: ["Civil"], zones: ["z1"] }).matched.map((t) => t.id)).toEqual(["a"]);
    expect(run({ disciplines: ["Civil"], zones: ["z2"] }).matched).toEqual([]);
    expect(run({ zones: ["z2"], statuses: ["in_progress"] }).matched.map((t) => t.id)).toEqual(["b"]);
  });
  it("matches Unassigned discipline", () => {
    expect(run({ disciplines: [UNASSIGNED_DISCIPLINE] }).matched.map((t) => t.id)).toEqual(["f"]);
  });
  it("hasActiveLookaheadFilters", () => {
    expect(hasActiveLookaheadFilters(EMPTY_LOOKAHEAD_FILTERS)).toBe(false);
    expect(hasActiveLookaheadFilters({ ...EMPTY_LOOKAHEAD_FILTERS, zones: ["z"] })).toBe(true);
  });
});

describe("lookahead URL state", () => {
  it("round-trips commas and special characters, and keeps unrelated keys", () => {
    const state: LookaheadUrlState = {
      disciplines: ["Civil, Structural", "M&E / HVAC", UNASSIGNED_DISCIPLINE, "100%"],
      zones: ["zone-1", "zone 2"],
      statuses: ["late", "done"],
      from: "2026-10-22",
      to: "2026-11-04",
    };
    const base = new URLSearchParams("sub=lookahead&x=1");
    const written = writeLookaheadParams(base, state);
    expect(base.toString()).toBe("sub=lookahead&x=1");
    expect(written.get("sub")).toBe("lookahead");
    expect(written.get("x")).toBe("1");
    const reparsed = parseLookaheadParams(new URLSearchParams(written.toString()));
    expect(reparsed).toEqual(state);
  });
  it("deletes keys for empty arrays / null", () => {
    const base = new URLSearchParams("sub=a&disc=x&zone=y&status=late&from=2026-01-01&to=2026-01-02");
    const w = writeLookaheadParams(base, { ...EMPTY_LOOKAHEAD_FILTERS, from: null, to: null });
    expect(w.toString()).toBe("sub=a");
  });
  it("drops unknown statuses, duplicates and invalid dates", () => {
    const p = parseLookaheadParams(
      new URLSearchParams("status=late,bogus,late,done&disc=A,A,B&from=2026-02-30&to=nope"),
    );
    expect(p.statuses).toEqual(["late", "done"]);
    expect(p.disciplines).toEqual(["A", "B"]);
    expect(p.from).toBeNull();
    expect(p.to).toBeNull();
  });
});
