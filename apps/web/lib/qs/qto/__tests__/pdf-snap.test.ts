import { describe, expect, it } from "vitest";
import {
  IDENTITY, METRES_PER_PDF_UNIT, SnapIndex, drawingScaleFromCalibration, extractSegments, findSnap, orthogonal,
  type Matrix, type OpCodes,
} from "../pdf-snap";

// The pdf.js OPS codes (pdfjs-dist 4.x).
const OPS: OpCodes = {
  save: 10, restore: 11, transform: 12, constructPath: 91, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75,
  moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18, rectangle: 19,
};
// Scale-1 viewport of a 595 × 842 page: flips y so the origin is top-left.
const VIEWPORT: Matrix = [1, 0, 0, -1, 0, 842];

describe("extractSegments", () => {
  it("reads lines and rectangles in page units, top-left origin", () => {
    const segs = extractSegments(
      [OPS.constructPath, OPS.constructPath],
      [[[OPS.moveTo, OPS.lineTo], [100, 700, 300, 700]], [[OPS.rectangle], [100, 100, 200, 160]]],
      OPS, VIEWPORT,
    );
    expect(segs).toHaveLength(5);
    expect(segs[0]).toEqual({ a: { x: 100, y: 142 }, b: { x: 300, y: 142 } });
    expect(segs[1].a).toEqual({ x: 100, y: 742 });
  });
  it("applies transforms and restores the graphics state", () => {
    const segs = extractSegments(
      [OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.constructPath],
      [null, [2, 0, 0, 2, 10, 0], [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]], null, [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]]],
      OPS, IDENTITY,
    );
    expect(segs[0]).toEqual({ a: { x: 10, y: 0 }, b: { x: 30, y: 0 } });
    expect(segs[1]).toEqual({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
  });
});

describe("findSnap", () => {
  // A cross: horizontal 0..100 at y=50, vertical 0..100 at x=50, plus a long diagonal.
  const index = new SnapIndex([
    { a: { x: 0, y: 50 }, b: { x: 100, y: 50 } },
    { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } },
    { a: { x: 0, y: 0 }, b: { x: 1000, y: 1000 } },
  ]);
  it("snaps to an endpoint", () => {
    expect(findSnap(index, { x: 98, y: 52 }, 5)).toEqual({ point: { x: 100, y: 50 }, kind: "endpoint" });
  });
  it("snaps to an intersection", () => {
    expect(findSnap(index, { x: 52, y: 48 }, 5)).toMatchObject({ point: { x: 50, y: 50 }, kind: "intersection" });
  });
  it("snaps onto a line far from its ends", () => {
    const s = findSnap(index, { x: 703, y: 700 }, 5);
    expect(s?.kind).toBe("on-line");
    expect(s!.point.x).toBeCloseTo(701.5, 6);
    expect(s!.point.y).toBeCloseTo(701.5, 6);
  });
  it("returns nothing when no geometry is near", () => {
    expect(findSnap(index, { x: 300, y: 20 }, 5)).toBeNull();
  });
});

describe("ortho and drawing scale", () => {
  it("keeps the dominant direction", () => {
    expect(orthogonal({ x: 0, y: 0 }, { x: 10, y: 2 })).toEqual({ x: 10, y: 0 });
    expect(orthogonal({ x: 0, y: 0 }, { x: 1, y: -9 })).toEqual({ x: 0, y: -9 });
  });
  it("converts a calibration back to its drawing scale", () => {
    expect(drawingScaleFromCalibration(100 * METRES_PER_PDF_UNIT)).toBeCloseTo(100, 9);
  });
});
