import { describe, expect, it } from "vitest";
import { parseActivityImport, type RawRow } from "../activity-database-import";
import { layoutLogicNetwork, RELATION_COLORS, edgeLabel } from "../logic-network-layout";
import { formatVisibleCode, normalizeDivisionCode, parseVisibleCode } from "../visible-code";

const act = (o: RawRow = {}): RawRow => ({ "Division Code": "04", "Visible Code": "", Code: "MAS-001", Name: "Block wall", Unit: "m2", Trade: "Mason", Type: "construction", "Min %": 50, "Max %": 100, Description: "", ...o });

describe("visible code", () => {
  it("formats and parses D04-001", () => {
    expect(formatVisibleCode("04", 1)).toBe("D04-001");
    expect(formatVisibleCode("16", 1234)).toBe("D16-1234");
    expect(parseVisibleCode("d04-007")).toEqual({ division: "04", n: 7 });
    expect(parseVisibleCode("X04-001")).toBeNull();
  });
  it("normalises division cells", () => {
    expect(normalizeDivisionCode(3)).toBe("03");
    expect(normalizeDivisionCode(" 12 ")).toBe("12");
    expect(normalizeDivisionCode("abc")).toBeNull();
  });
});

describe("activity import validation", () => {
  it("accepts a clean row and normalises it", () => {
    const r = parseActivityImport({ activities: [act({ "Division Code": 4, Code: "mas-001" })], links: [] });
    expect(r.errors).toEqual([]);
    expect(r.activities[0]).toMatchObject({ divisionCode: "04", code: "MAS-001", activityType: "construction", minPct: 50, maxPct: 100 });
  });
  it("rejects a bad division", () => {
    const r = parseActivityImport({ activities: [act({ "Division Code": "17" }), act({ "Division Code": "xx", Code: "B" })], links: [] });
    expect(r.activities).toHaveLength(0);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(r.errors[0].message).toMatch(/01 to 16/);
  });
  it("rejects duplicate codes", () => {
    const r = parseActivityImport({ activities: [act(), act()], links: [] });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ sheet: "Activities", row: 3 });
    expect(r.errors[0].message).toMatch(/Duplicate code/);
  });
  it("rejects min > max and out-of-range percentages", () => {
    const r = parseActivityImport({ activities: [act({ "Min %": 120, "Max %": 100 }), act({ Code: "B", "Min %": 80, "Max %": 60 }), act({ Code: "C", "Min %": -1 })], links: [] });
    expect(r.errors.map((e) => e.message).join("|")).toMatch(/exceed Max/);
    expect(r.errors.some((e) => /between 0 and 100/.test(e.message))).toBe(true);
    expect(r.activities).toHaveLength(0);
  });
  it("rejects a bad type and a visible code from another division", () => {
    const r = parseActivityImport({ activities: [act({ Type: "magic" }), act({ Code: "B", "Visible Code": "D05-001" })], links: [] });
    expect(r.errors[0].message).toMatch(/Type/);
    expect(r.errors[1].message).toMatch(/does not belong to division 04/);
  });
  it("requires a name and a code or visible code; skips blank rows", () => {
    const r = parseActivityImport({ activities: [act({ Name: "", Code: "" }), { "Division Code": "", Name: "" }], links: [] });
    expect(r.errors.map((e) => e.message)).toEqual(expect.arrayContaining(["Name is required", "Either Code or Visible Code is required"]));
    expect(r.errors.every((e) => e.row === 2)).toBe(true);
  });
  it("parses BOQ links with defaults and validates them", () => {
    const r = parseActivityImport({
      activities: [],
      links: [
        { "Activity Code": "d04-001", "Work Item Code": "WI-1", "Days/Unit": "0.5", "%": "" },
        { "Activity Code": "D04-001", "Work Item Code": "WI-2", "Days/Unit": "x", "%": 150 },
        { "Activity Code": "D04-001", "Work Item Code": "WI-1" },
      ],
    });
    expect(r.links).toEqual([{ row: 2, activityRef: "D04-001", workItemCode: "WI-1", daysPerUnit: 0.5, sharePct: 100 }]);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[2].message).toMatch(/Duplicate link/);
  });
});

describe("logic network layout", () => {
  const input = {
    center: { id: "c", label: "Centre" },
    predecessors: [
      { id: "p1", label: "P1", relation: "fs" as const, lagDays: 0 },
      { id: "p2", label: "P2", relation: "ss" as const, lagDays: 2 },
    ],
    successors: [{ id: "s1", label: "S1", relation: "ff" as const, lagDays: -1 }],
  };
  it("places three columns, one node per activity, one edge per rule", () => {
    const l = layoutLogicNetwork(input);
    expect(l.nodes).toHaveLength(4);
    expect(l.edges).toHaveLength(3);
    const x = (id: string) => l.nodes.find((n) => n.id === id)!.x;
    expect(x("p1")).toBeLessThan(x("c"));
    expect(x("c")).toBeLessThan(x("s1"));
    expect(x("p1")).toBe(x("p2"));
    const y = (id: string) => l.nodes.find((n) => n.id === id)!.y;
    expect(y("p1")).toBeLessThan(y("p2"));
    expect(y("c")).toBeCloseTo((y("p1") + y("p2")) / 2);
    expect(l.nodes.every((n) => n.x + n.w <= l.width && n.y + n.h <= l.height)).toBe(true);
  });
  it("labels edges and points them predecessor -> centre -> successor", () => {
    const l = layoutLogicNetwork(input);
    expect(l.edges.map((e) => e.label)).toEqual(["FS(0)", "SS(2)", "FF(-1)"]);
    expect(l.edges[0]).toMatchObject({ from: "p1", to: "c", relation: "fs", lag: 0 });
    expect(l.edges[2]).toMatchObject({ from: "c", to: "s1" });
    expect(l.edges[0].path.startsWith("M ")).toBe(true);
    expect(edgeLabel("sf", 3)).toBe("SF(3)");
  });
  it("handles an activity with no logic and exposes relation colours", () => {
    const l = layoutLogicNetwork({ center: { id: "c", label: "C" }, predecessors: [], successors: [] });
    expect(l.nodes).toHaveLength(1);
    expect(l.edges).toHaveLength(0);
    expect(Object.keys(RELATION_COLORS).sort()).toEqual(["ff", "fs", "sf", "ss"]);
  });
});
