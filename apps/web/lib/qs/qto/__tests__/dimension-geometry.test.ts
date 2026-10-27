import { describe, expect, it } from "vitest";
import {
  decodeDimensionPoints,
  dimensionGeometry,
  encodeDimensionPoints,
} from "../dimension-geometry";

describe("dimensionGeometry", () => {
  it("places aligned dimensions parallel to the measured points", () => {
    const geometry = dimensionGeometry({ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 0, y: 10 }, "aligned");

    expect(geometry.orientation).toBe("aligned");
    expect(geometry.measuredPageUnits).toBe(5);
    expect(geometry.end.x - geometry.start.x).toBeCloseTo(3);
    expect(geometry.end.y - geometry.start.y).toBeCloseTo(4);
  });

  it("projects linear dimensions horizontally or vertically from their location", () => {
    const a = { x: 2, y: 3 };
    const b = { x: 8, y: 4 };

    const horizontal = dimensionGeometry(a, b, { x: 5, y: 20 }, "linear");
    expect(horizontal.orientation).toBe("horizontal");
    expect(horizontal.measuredPageUnits).toBe(6);
    expect(horizontal.start).toEqual({ x: 2, y: 20 });
    expect(horizontal.end).toEqual({ x: 8, y: 20 });

    const vertical = dimensionGeometry(a, { x: 4, y: 11 }, { x: 20, y: 5 }, "linear");
    expect(vertical.orientation).toBe("vertical");
    expect(vertical.measuredPageUnits).toBe(8);
    expect(vertical.start).toEqual({ x: 20, y: 3 });
    expect(vertical.end).toEqual({ x: 20, y: 11 });
  });

  it("round-trips dimension annotation metadata in the measurement points JSON", () => {
    const encoded = encodeDimensionPoints(
      [{ x: 1, y: 2 }, { x: 4, y: 6 }],
      { mode: "aligned", location: { x: 3, y: 9 } },
    );

    expect(decodeDimensionPoints(encoded)).toEqual({ mode: "aligned", location: { x: 3, y: 9 } });
  });

  it("keeps linear dimensions straight on the dominant X or Y axis", () => {
    const horizontal = dimensionGeometry({ x: 0, y: 0 }, { x: 10, y: 2 }, { x: 10, y: 2 }, "linear");
    const vertical = dimensionGeometry({ x: 0, y: 0 }, { x: 2, y: 10 }, { x: 2, y: 10 }, "linear");

    expect(horizontal.orientation).toBe("horizontal");
    expect(horizontal.measuredPageUnits).toBe(10);
    expect(horizontal.start.y).toBe(horizontal.end.y);
    expect(vertical.orientation).toBe("vertical");
    expect(vertical.measuredPageUnits).toBe(10);
    expect(vertical.start.x).toBe(vertical.end.x);
  });
});
