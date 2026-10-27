import { describe, expect, it } from "vitest";
import { bestSnap, gripsOf, moveGrip, shapeSegments } from "../grips";
import { SnapIndex } from "../pdf-snap";

const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];

describe("grips", () => {
  it("has a grip per corner and per edge middle", () => {
    const g = gripsOf(rect, "area");
    expect(g.filter((x) => x.kind === "vertex")).toHaveLength(4);
    expect(g.filter((x) => x.kind === "mid").map((x) => x.at)).toEqual([{ x: 5, y: 0 }, { x: 10, y: 4 }, { x: 5, y: 8 }, { x: 0, y: 4 }]);
    expect(gripsOf([{ x: 0, y: 0 }, { x: 4, y: 0 }], "length").filter((x) => x.kind === "mid")).toHaveLength(1);
    expect(gripsOf([{ x: 1, y: 1 }], "count")).toHaveLength(1);
  });
  it("moves one corner with a vertex grip", () => {
    expect(moveGrip(rect, { kind: "vertex", index: 2 }, { x: 12, y: 9 }, "area")[2]).toEqual({ x: 12, y: 9 });
  });
  it("stretches the whole edge with a middle grip (10 × 8 → 12 × 8)", () => {
    const next = moveGrip(rect, { kind: "mid", index: 1 }, { x: 12, y: 4 }, "area");
    expect(next).toEqual([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }]);
  });
  it("moves the closing edge of an area", () => {
    const next = moveGrip(rect, { kind: "mid", index: 3 }, { x: -2, y: 4 }, "area");
    expect(next[3]).toEqual({ x: -2, y: 8 });
    expect(next[0]).toEqual({ x: -2, y: 0 });
  });
});

describe("object snap", () => {
  it("builds segments from drawn shapes, excluding the one being edited", () => {
    const shapes = [{ id: "a", measure_type: "area", points: rect }, { id: "b", measure_type: "length", points: [{ x: 20, y: 0 }, { x: 30, y: 0 }] }];
    expect(shapeSegments(shapes)).toHaveLength(5);
    expect(shapeSegments(shapes, "a")).toHaveLength(1);
  });
  it("prefers a corner of a drawn shape over a PDF line nearby", () => {
    const pdf = new SnapIndex([{ a: { x: -50, y: 0.5 }, b: { x: 50, y: 0.5 } }]);
    const objects = new SnapIndex(shapeSegments([{ id: "a", measure_type: "area", points: rect }]));
    expect(bestSnap([pdf, objects], { x: 10.6, y: 0.4 }, 2)?.point).toEqual({ x: 10, y: 0 });
    expect(bestSnap([pdf, objects], { x: 5.2, y: 7.7 }, 1)?.kind).toBe("midpoint");
  });
});
