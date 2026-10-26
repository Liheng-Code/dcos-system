import { describe, expect, it } from "vitest";
import {
  planBoqProgramme, type ExistingTask, type MasterFact, type PlannerInput, type PlannerLine, type ResourceFact,
} from "../boq-programme-planner";
import type { SavedLocation, WbsLevel } from "../../activity-library/location-map";

const lvl = (id: string): WbsLevel => ({ id, wbs_code: id, wbs_name: id, building_code: "BA" });
const levels = [lvl("n1"), lvl("n2"), lvl("n3")];
const loc = (label: string, node: string | null, split: SavedLocation["split_rule"] = "none"): SavedLocation => ({
  building_code: "BA", qs_level_label: label, wbs_node_id: node, status: "confirmed", split_rule: split,
});
const locations = [loc("L01", "n1"), loc("L02", "n2"), loc("L03", "n3"), loc("All", null, "equal")];

const master = (o: Partial<MasterFact> = {}): MasterFact => ({
  code: "A", visibleCode: "D04-001", name: "Block wall", csiDivision: "04", unit: "m2", crewSize: 4, hoursPerDay: 8, minPct: null, maxPct: null, ...o,
});
const hrs = (perUnit: number, o: Partial<ResourceFact> = {}): ResourceFact => ({ resourceId: "r1", name: "Mason", kind: "labor", unit: "hr", perUnit, ...o });
const line = (o: Partial<PlannerLine> & { id: string }): PlannerLine => ({
  source: "contract", qty: 100, amount: 1000, workItemId: "w1", building: "BA", level: "L01", itemCode: o.id.toUpperCase(), description: o.id, ...o,
});

function input(o: Partial<PlannerInput> = {}): PlannerInput {
  return {
    lines: [line({ id: "a" })], locations, levels, gfaByNode: new Map(),
    linksByWorkItem: new Map([["w1", [{ masterId: "mA", sharePct: 100, daysPerUnit: null }]]]),
    resourcesByWorkItem: new Map([["w1", [hrs(0.64)]]]),
    masters: new Map([["mA", master()]]),
    existingTasks: [], logicRules: [], floorOrder: ["n1", "n2", "n3"], ...o,
  };
}

describe("planBoqProgramme", () => {
  it("splits one project-wide line over 3 floors and keeps the value", () => {
    const p = planBoqProgramme(input({ lines: [line({ id: "a", level: "All", qty: 300, amount: 1000 })] }));
    expect(p.tasks).toHaveLength(3);
    expect(p.tasks.map((t) => t.quantity)).toEqual([100, 100, 100]);
    expect(p.tasks.reduce((s, t) => s + t.budget, 0)).toBeCloseTo(1000, 6); // 333.34 + 333.33 + 333.33
    expect(p.totals.valueDriven).toBe(1000);
    expect(p.tasks.every((t) => t.boqLines.length === 1 && t.boqLines[0].sharePct > 33 && t.boqLines[0].sharePct < 34)).toBe(true);
  });

  it("two lines feeding one task accumulate quantity, amount and hours", () => {
    const p = planBoqProgramme(input({
      lines: [line({ id: "a", qty: 100, amount: 1000 }), line({ id: "b", qty: 50, amount: 600 })],
    }));
    expect(p.tasks).toHaveLength(1);
    expect(p.tasks[0]).toMatchObject({ quantity: 150, budget: 1600, labourHours: 96 });
    expect(p.tasks[0].boqLines.map((l) => l.lineId)).toEqual(["a", "b"]);
  });

  it("a 60/40 link split gives two tasks that share the line", () => {
    const p = planBoqProgramme(input({
      linksByWorkItem: new Map([["w1", [{ masterId: "mA", sharePct: 60, daysPerUnit: null }, { masterId: "mB", sharePct: 40, daysPerUnit: null }]]]),
      masters: new Map([["mA", master()], ["mB", master({ code: "B", name: "Plaster", visibleCode: "D09-001" })]]),
    }));
    const a = p.tasks.find((t) => t.masterId === "mA")!;
    const b = p.tasks.find((t) => t.masterId === "mB")!;
    expect([a.quantity, b.quantity]).toEqual([60, 40]);
    expect([a.budget, b.budget]).toEqual([600, 400]);
    expect(a.labourHours).toBeCloseTo(38.4, 4);
    expect(p.totals.valueDriven).toBe(1000);
  });

  it("man-hours become duration with the default crew when the master has none", () => {
    // 100 m2 x 0.64 h = 64 h; default crew 4 x 8 h = 32 h/day -> 2 days
    const p = planBoqProgramme(input({ masters: new Map([["mA", master({ crewSize: null })]]) }));
    expect(p.tasks[0]).toMatchObject({ durationDays: 2, basis: "labour", confidence: "review", crewSize: 4 });
    expect(p.warnings.map((w) => w.code)).toContain("no_crew");
  });

  it("a known crew gives high confidence and rounds up", () => {
    const p = planBoqProgramme(input({ masters: new Map([["mA", master({ crewSize: 5 })]]) })); // 64 / 40 = 1.6 -> 2
    expect(p.tasks[0]).toMatchObject({ durationDays: 2, confidence: "high" });
  });

  it("day-based labour counts hours per day", () => {
    // 100 x 0.04 day x 8 h = 32 h; crew 4 x 8 = 32 -> 1 day
    const p = planBoqProgramme(input({ resourcesByWorkItem: new Map([["w1", [hrs(0.04, { unit: "day" })]]]) }));
    expect(p.tasks[0].labourHours).toBe(32);
    expect(p.tasks[0].durationDays).toBe(1);
  });

  it("non-time labour is ignored with a warning; equipment hours are tracked apart", () => {
    const p = planBoqProgramme(input({
      resourcesByWorkItem: new Map([["w1", [hrs(1, { unit: "m2" }), hrs(0.1, { resourceId: "r2", name: "Mixer", kind: "equipment" })]]]),
      linksByWorkItem: new Map([["w1", [{ masterId: "mA", sharePct: 100, daysPerUnit: 0.05 }]]]),
    }));
    const codes = p.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(["labour_not_time", "no_labour"]));
    expect(p.tasks[0]).toMatchObject({ basis: "days_per_unit", durationDays: 5, labourHours: 0, confidence: "review" });
    expect(p.totals.equipmentHours).toBe(10);
    expect(p.totals.laborHours).toBe(0);
  });

  it("no basis at all means 1 day and low confidence", () => {
    const p = planBoqProgramme(input({ resourcesByWorkItem: new Map() }));
    expect(p.tasks[0]).toMatchObject({ durationDays: 1, basis: "none", confidence: "low" });
  });

  it("clamps to the master's min/max % of the project duration", () => {
    const m = master({ minPct: 10, maxPct: 20 });
    const long = planBoqProgramme(input({ masters: new Map([["mA", m]]), projectDurationDays: 10, lines: [line({ id: "a", qty: 1000 })] }));
    expect(long.tasks[0]).toMatchObject({ durationDays: 2, clamped: true }); // 640 h / 32 = 20 days -> max 20 % of 10
    const short = planBoqProgramme(input({ masters: new Map([["mA", m]]), projectDurationDays: 100 }));
    expect(short.tasks[0]).toMatchObject({ durationDays: 10, clamped: true }); // 2 days -> min 10 % of 100
    expect(short.warnings.map((w) => w.code)).toContain("clamped");
    const open = planBoqProgramme(input({ masters: new Map([["mA", master({ minPct: 10 })]]), projectDurationDays: 100 }));
    expect(open.tasks[0].clamped).toBe(false); // needs both limits
  });

  it("matches an existing task by master and node, else creates", () => {
    const ex: ExistingTask = { id: "t1", nodeId: "g1", floorNodeId: "n1", masterId: "mA", name: "Block wall", progress: 0, locked: false, sortOrder: 2 };
    const also: ExistingTask = { ...ex, id: "t2", sortOrder: 9 };
    const other: ExistingTask = { ...ex, id: "t3", floorNodeId: "n2" };
    const p = planBoqProgramme(input({
      lines: [line({ id: "a", level: "L01" }), line({ id: "b", level: "L02" })],
      existingTasks: [also, ex, other], existingBoqTaskIds: ["t1", "t9"],
    }));
    const l1 = p.tasks.find((t) => t.nodeId === "n1")!;
    expect(l1).toMatchObject({ action: "update", existingTaskId: "t1", alsoMapped: ["t2"] });
    expect(p.tasks.find((t) => t.nodeId === "n2")).toMatchObject({ action: "update", existingTaskId: "t3" });
    expect(p.clear).toEqual(["t9"]);
    expect(p.totals.counts).toMatchObject({ update: 2, create: 0, clear: 1 });
  });

  it("reports unchanged when duration and budget already match", () => {
    const ex: ExistingTask = { id: "t1", nodeId: "n1", floorNodeId: "n1", masterId: "mA", name: "x", progress: 0, locked: false, sortOrder: 1, durationDays: 2, budgetCost: 1000 };
    const p = planBoqProgramme(input({ existingTasks: [ex] }));
    expect(p.tasks[0]).toMatchObject({ action: "update", unchanged: true });
    expect(p.totals.counts.unchanged).toBe(1);
  });

  it("never changes started or locked tasks, and does not clear them", () => {
    const started: ExistingTask = { id: "s", nodeId: "n1", floorNodeId: "n1", masterId: "mA", name: "x", progress: 30, locked: false, sortOrder: 1 };
    const locked: ExistingTask = { id: "l", nodeId: "n2", floorNodeId: "n2", masterId: "mA", name: "x", progress: 0, locked: true, sortOrder: 1 };
    const gone: ExistingTask = { id: "g", nodeId: "n3", floorNodeId: "n3", masterId: "mB", name: "x", progress: 10, locked: false, sortOrder: 1 };
    const p = planBoqProgramme(input({
      lines: [line({ id: "a", level: "L01" }), line({ id: "b", level: "L02" })],
      existingTasks: [started, locked, gone], existingBoqTaskIds: ["g"],
    }));
    expect(p.tasks.find((t) => t.nodeId === "n1")!.action).toBe("skip_started");
    expect(p.tasks.find((t) => t.nodeId === "n2")!.action).toBe("skip_locked");
    expect(p.clear).toEqual([]);
  });

  it("builds floor-to-floor logic for new tasks without cycles, plus master rules inside a floor", () => {
    const links = new Map([["w1", [{ masterId: "mA", sharePct: 50, daysPerUnit: null }, { masterId: "mB", sharePct: 50, daysPerUnit: null }]]]);
    const masters = new Map([["mA", master()], ["mB", master({ code: "B", name: "Plaster", visibleCode: "D09-001" })]]);
    const p = planBoqProgramme(input({
      lines: [line({ id: "a", level: "All", qty: 300, amount: 900 })], linksByWorkItem: links, masters,
      logicRules: [
        { predMasterId: "mA", succMasterId: "mB", relation: "fs", lagDays: 1 },
        { predMasterId: "mB", succMasterId: "mA", relation: "fs", lagDays: 0 }, // would close a loop: refused
      ],
    }));
    const t = (m: string, n: string) => p.tasks.find((x) => x.key === `${m}|${n}`)!;
    expect(t("mA", "n2").predecessors).toEqual(expect.arrayContaining([{ key: "mA|n1", taskId: null, type: "fs", lagDays: 0 }]));
    expect(t("mA", "n1").predecessors).toEqual([]);
    expect(t("mB", "n1").predecessors).toEqual([{ key: "mA|n1", taskId: null, type: "fs", lagDays: 1 }]);
    // the reverse rule is refused on every floor
    for (const n of ["n1", "n2", "n3"]) expect(t("mA", n).predecessors.some((x) => x.key === `mB|${n}`)).toBe(false);
  });

  it("existing tasks get no new logic; a new task points at an existing predecessor by id", () => {
    const ex: ExistingTask = { id: "t1", nodeId: "n1", floorNodeId: "n1", masterId: "mA", name: "x", progress: 0, locked: false, sortOrder: 1 };
    const p = planBoqProgramme(input({ lines: [line({ id: "a", level: "All", qty: 200, amount: 1000 })], existingTasks: [ex], locations: [loc("All", null, "equal")], levels: [lvl("n1"), lvl("n2")], floorOrder: ["n1", "n2"] }));
    expect(p.tasks.find((t) => t.nodeId === "n1")!.predecessors).toEqual([]);
    expect(p.tasks.find((t) => t.nodeId === "n2")!.predecessors).toEqual([{ key: null, taskId: "t1", type: "fs", lagDays: 0 }]);
  });

  it("warns about unmapped, unlinked and unlocated lines and leaves them out", () => {
    const p = planBoqProgramme(input({
      lines: [line({ id: "u", workItemId: null }), line({ id: "v", workItemId: "w9" }), line({ id: "x", level: "L99" }), line({ id: "ok" })],
    }));
    expect(p.warnings.map((w) => w.code).sort()).toEqual(["item_unlinked", "line_unlocated", "line_unmapped"]);
    expect(p.totals).toMatchObject({ linesTotal: 4, linesUsed: 1, valueTotal: 4000, valueDriven: 1000 });
  });

  it("keeps floor-to-floor chains inside one building", () => {
    const levels2 = [{ ...lvl("a1"), building_code: "BA" }, { ...lvl("a2"), building_code: "BA" }, { ...lvl("b1"), building_code: "BB" }, { ...lvl("b2"), building_code: "BB" }];
    const locs = [loc("A1", "a1"), loc("A2", "a2"), { ...loc("B1", "b1"), building_code: "BB" }, { ...loc("B2", "b2"), building_code: "BB" }];
    const p = planBoqProgramme(input({
      lines: [line({ id: "1", level: "A1" }), line({ id: "2", level: "A2" }), line({ id: "3", building: "BB", level: "B1" }), line({ id: "4", building: "BB", level: "B2" })],
      levels: levels2, locations: locs, floorOrder: ["a1", "a2", "b1", "b2"],
      nodeBuilding: new Map([["a1", "BA"], ["a2", "BA"], ["b1", "BB"], ["b2", "BB"]]),
    }));
    const t = (n: string) => p.tasks.find((x) => x.nodeId === n)!;
    expect(t("a2").predecessors.map((x) => x.key)).toEqual(["mA|a1"]);
    expect(t("b1").predecessors).toEqual([]); // not chained to building A
    expect(t("b2").predecessors.map((x) => x.key)).toEqual(["mA|b1"]);
  });

  it("a new task on a locked node is skip_locked, gets no logic and is not a predecessor", () => {
    const p = planBoqProgramme(input({
      lines: [line({ id: "a", level: "All", qty: 300, amount: 900 })], lockedNodes: new Set(["n1"]),
    }));
    expect(p.tasks.find((t) => t.nodeId === "n1")!.action).toBe("skip_locked");
    expect(p.tasks.find((t) => t.nodeId === "n2")!.predecessors).toEqual([]); // its floor-below task is not written
    expect(p.tasks.find((t) => t.nodeId === "n3")!.predecessors.map((x) => x.key)).toEqual(["mA|n2"]);
  });

  it("totals count only written tasks and report skipped value and hours apart", () => {
    const started: ExistingTask = { id: "s", nodeId: "n1", floorNodeId: "n1", masterId: "mA", name: "x", progress: 10, locked: false, sortOrder: 1 };
    const p = planBoqProgramme(input({ lines: [line({ id: "a", level: "All", qty: 300, amount: 900 })], existingTasks: [started] }));
    expect(p.totals.valueDriven).toBe(600);
    expect(p.totals.valueSkipped).toBe(300);
    expect(p.totals.valueDriven + p.totals.valueSkipped).toBe(p.totals.valueTotal);
    expect(p.totals.laborHours).toBeCloseTo(128, 4);
    expect(p.totals.hoursSkipped).toBeCloseTo(64, 4);
  });

  it("reads mh, week and month units, and warns for equipment that is not time", () => {
    const p = planBoqProgramme(input({
      resourcesByWorkItem: new Map([["w1", [
        hrs(0.1, { unit: "mh" }), hrs(0.01, { resourceId: "r2", name: "Foreman", unit: "week" }),
        hrs(0.001, { resourceId: "r3", name: "Engineer", unit: "month" }), hrs(1, { resourceId: "r4", name: "Pump", kind: "equipment", unit: "m3" }),
      ]]]),
    }));
    const h = Object.fromEntries(p.tasks[0].resourceHours.map((x) => [x.name, x.hours]));
    expect(h.Mason).toBe(10); // 100 x 0.1
    expect(h.Foreman).toBe(48); // 100 x 0.01 x 48 (8 h x 6 days)
    expect(h.Engineer).toBe(20.8); // 100 x 0.001 x 208 (8 h x 26 days)
    expect(p.warnings.map((w) => w.code)).toContain("equipment_not_time");
  });

  it("rounds cents decimal-safely", () => {
    const p = planBoqProgramme(input({ lines: [line({ id: "a", amount: 1.005 })] }));
    expect(p.tasks[0].budget).toBe(1.01);
  });

  it("value driven equals the sum of the allocated amounts", () => {
    const p = planBoqProgramme(input({
      lines: [line({ id: "a", level: "All", qty: 100, amount: 100.01 }), line({ id: "b", level: "L02", amount: 55.55 })],
      linksByWorkItem: new Map([["w1", [{ masterId: "mA", sharePct: 70, daysPerUnit: null }, { masterId: "mB", sharePct: 30, daysPerUnit: null }]]]),
      masters: new Map([["mA", master()], ["mB", master({ code: "B", name: "B" })]]),
    }));
    const lineSum = p.tasks.flatMap((t) => t.boqLines).reduce((s, l) => s + Math.round(l.amount * 100), 0) / 100;
    const budgetSum = p.tasks.reduce((s, t) => s + Math.round(t.budget * 100), 0) / 100;
    expect(p.totals.valueDriven).toBe(lineSum);
    expect(budgetSum).toBe(lineSum);
    expect(lineSum).toBe(155.56); // 100.01 + 55.55
  });
});
