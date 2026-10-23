import { describe, expect, it } from "vitest";
import {
  classifyLabour, computeReadiness, labourProblem, type LocationFact, type ReadinessLine, type WorkItemFacts,
} from "../readiness";

const line = (o: Partial<ReadinessLine> & { id: string }): ReadinessLine => ({
  itemCode: o.id.toUpperCase(), description: o.id, amount: 100, buildingCode: "BA", level: "L01", workItemId: null, ...o,
});
const hours = { unit: "hr", consumption: 0.8, basisNote: "Gang output" };
const good: WorkItemFacts = { linked: true, labour: [hours] };
const loc = (o: Partial<LocationFact> = {}): LocationFact => ({
  building_code: "BA", qs_level_label: "L01", wbs_node_id: "n1", status: "confirmed", split_rule: "none", ...o,
});

describe("labour classification", () => {
  it("hours and days are time-based", () => {
    expect(classifyLabour({ unit: "hr", consumption: 0.5 })).toBe("time");
    expect(classifyLabour({ unit: "day", consumption: 0.03 })).toBe("time");
    expect(classifyLabour({ unit: "Hours", consumption: 2 })).toBe("time");
  });
  it("consumption 1 in a non-time unit is a placeholder (migrated cost items)", () => {
    expect(classifyLabour({ unit: "m2", consumption: 1, basisNote: "Migrated from qs_cost_items.code" })).toBe("placeholder");
  });
  it("a 'derived % split' note is a placeholder even in hours", () => {
    expect(classifyLabour({ unit: "hr", consumption: 0.3, basisNote: "Derived % split of unit rate" })).toBe("placeholder");
  });
  it("other non-time units are not time-based", () => {
    expect(classifyLabour({ unit: "m2", consumption: 0.4 })).toBe("non_time");
  });
  it("labourProblem names the reason", () => {
    expect(labourProblem([])).toBe("no_labour");
    expect(labourProblem([{ unit: "m2", consumption: 1 }])).toBe("labour_placeholder");
    expect(labourProblem([{ unit: "m2", consumption: 0.4 }])).toBe("labour_not_time");
    expect(labourProblem([{ unit: "m2", consumption: 1 }, hours])).toBeNull();
  });
});

describe("computeReadiness", () => {
  it("weights by value and lists blocking lines with reasons", () => {
    const lines = [
      line({ id: "a", amount: 600, workItemId: "w1" }), // ready
      line({ id: "b", amount: 300, workItemId: "w2", level: "L02" }), // mapped, not linked, placeholder labour, unlocated
      line({ id: "c", amount: 100 }), // not mapped
    ];
    const r = computeReadiness(lines, {
      workItems: new Map<string, WorkItemFacts>([
        ["w1", good],
        ["w2", { linked: false, labour: [{ unit: "m2", consumption: 1 }] }],
      ]),
      locations: [loc()],
    });
    expect(r.totalValue).toBe(1000);
    expect(r.stages.mapped).toMatchObject({ lines: 2, value: 900, pct: 90 });
    expect(r.stages.linked).toMatchObject({ lines: 1, pct: 60 });
    expect(r.stages.labour).toMatchObject({ lines: 1, pct: 60 });
    expect(r.stages.located).toMatchObject({ lines: 2, pct: 70 }); // a and c share L01
    expect(r.ready).toMatchObject({ lines: 1, pct: 60 });
    expect(r.blocking.map((b) => b.lineId)).toEqual(["b", "c"]);
    expect(r.blocking[0].reasons).toEqual(["not_linked", "labour_placeholder", "location_unmapped"]);
    expect(r.blocking[0].primary).toBe("not_linked");
    expect(r.blocking[1].reasons).toEqual(["not_mapped"]);
  });

  it("a confirmed split rule locates a project-wide line; an ignored decision does not", () => {
    const lines = [
      line({ id: "a", level: "All", workItemId: "w1" }),
      line({ id: "b", level: "Roof", workItemId: "w1" }),
    ];
    const r = computeReadiness(lines, {
      workItems: new Map([["w1", good]]),
      locations: [loc({ qs_level_label: "All", wbs_node_id: null, split_rule: "gfa" }), loc({ qs_level_label: "Roof", wbs_node_id: null, status: "ignored" })],
    });
    expect(r.stages.located.lines).toBe(1);
    expect(r.blocking).toHaveLength(1);
    expect(r.blocking[0].reasons).toEqual(["location_ignored"]);
  });

  it("matches building and level case-insensitively", () => {
    const r = computeReadiness([line({ id: "a", buildingCode: "ba", level: "l01", workItemId: "w1" })], { workItems: new Map([["w1", good]]), locations: [loc()] });
    expect(r.ready.lines).toBe(1);
  });

  it("falls back to line counts when no line has a value, and handles an empty BOQ", () => {
    const r = computeReadiness([line({ id: "a", amount: 0, workItemId: "w1" }), line({ id: "b", amount: 0 })], { workItems: new Map([["w1", good]]), locations: [loc()] });
    expect(r.stages.mapped.pct).toBe(50);
    expect(computeReadiness([], { workItems: new Map(), locations: [] }).ready.pct).toBe(0);
  });

  it("a mapped line whose item facts are missing is treated as unlinked without labour", () => {
    const r = computeReadiness([line({ id: "a", workItemId: "ghost" })], { workItems: new Map(), locations: [loc()] });
    expect(r.blocking[0].reasons).toEqual(["not_linked", "no_labour"]);
  });
});
