import { describe, expect, it } from "vitest";
import { hitTest, pointInPolygon, type HitShape } from "../hit-test";

const square = (id: string, x: number, y: number, s: number, type = "area"): HitShape => ({
  id, itemId: `item-${id}`, measureType: type,
  points: [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }],
});

describe("hitTest", () => {
  it("finds a point inside an area", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square("a", 0, 0, 10).points)).toBe(true);
    expect(hitTest([square("a", 0, 0, 10)], { x: 5, y: 5 }, 1)?.id).toBe("a");
  });
  it("prefers the topmost shape and edges over interiors", () => {
    const big = square("big", 0, 0, 100);
    const line: HitShape = { id: "line", itemId: "item-line", measureType: "length", points: [{ x: 10, y: 50 }, { x: 90, y: 50 }] };
    expect(hitTest([big, line], { x: 50, y: 50.5 }, 2)?.id).toBe("line");
    expect(hitTest([big, line], { x: 50, y: 20 }, 2)?.id).toBe("big");
  });
  it("picks count markers and misses empty space", () => {
    const count: HitShape = { id: "c", itemId: "item-c", measureType: "count", points: [{ x: 200, y: 200 }] };
    expect(hitTest([count], { x: 202, y: 201 }, 2)?.id).toBe("c");
    expect(hitTest([count, square("a", 0, 0, 10)], { x: 150, y: 150 }, 2)).toBeNull();
  });
  it("selects a perimeter only near its outline", () => {
    const per = square("p", 0, 0, 10, "perimeter");
    expect(hitTest([per], { x: 5, y: 5 }, 1)).toBeNull();
    expect(hitTest([per], { x: 10.5, y: 5 }, 1)?.id).toBe("p");
  });
});
