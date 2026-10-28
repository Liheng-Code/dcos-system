import { describe, expect, it } from "vitest";
import type { Segment } from "../pdf-snap";
import { detectHatches, hatchAt, pickRegion, sameHatchRegions, signedArea } from "../smart-pick";

const seg = (ax: number, ay: number, bx: number, by: number): Segment => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const box = (x: number, y: number, w: number, h: number): Segment[] => [
  seg(x, y, x + w, y), seg(x + w, y, x + w, y + h), seg(x + w, y + h, x, y + h), seg(x, y + h, x, y),
];
/** 45° hatch lines y = x + c clipped to the box, every `step` in c. */
function hatch45(x: number, y: number, size: number, step: number): Segment[] {
  const out: Segment[] = [];
  for (let c = -size + step; c < size; c += step) {
    const x0 = Math.max(0, -c), x1 = Math.min(size, size - c);
    if (x1 - x0 > 0.5) out.push(seg(x + x0, y + x0 + c, x + x1, y + x1 + c));
  }
  return out;
}
const area = (p: { x: number; y: number }[] | null) => (p ? Math.abs(signedArea(p)) : 0);

describe("smart pick", () => {
  it("picks a closed rectangle", () => {
    expect(area(pickRegion(box(0, 0, 100, 50), { x: 30, y: 20 }))).toBeCloseTo(5000, 6);
  });

  it("picks the smallest enclosed area when a line splits a room", () => {
    const segs = [...box(0, 0, 100, 100), seg(40, 0, 40, 100)];
    expect(area(pickRegion(segs, { x: 70, y: 50 }))).toBeCloseTo(6000, 6);
    expect(area(pickRegion(segs, { x: 10, y: 50 }))).toBeCloseTo(4000, 6);
  });

  it("joins separate lines and closes small gaps", () => {
    // Four loose lines; one stops 0.3 short of the corner, one overshoots.
    const segs = [seg(0, 0, 99.7, 0), seg(100, 0, 100, 80), seg(105, 80, 0, 80), seg(0, 80, 0, 0)];
    // The closed corner moves to the line end (≤ gap), so the area is within 0.2 %.
    expect(Math.abs(area(pickRegion(segs, { x: 50, y: 40 }, { gap: 0.5 })) - 8000)).toBeLessThan(16);
  });

  it("returns null when the point is not enclosed", () => {
    expect(pickRegion([seg(0, 0, 100, 0), seg(100, 0, 100, 100)], { x: 50, y: 50 })).toBeNull();
    expect(pickRegion(box(0, 0, 10, 10), { x: 50, y: 50 })).toBeNull();
  });

  it("ignores dead ends and islands (text, columns) inside the area", () => {
    const segs = [...box(0, 0, 100, 100), seg(50, 50, 70, 50), ...box(60, 40, 10, 10)];
    // The ray first meets the island; the outer room is returned (islands are not deducted).
    expect(area(pickRegion(segs, { x: 20, y: 45 }))).toBeCloseTo(10000, 6);
  });

  it("detects a hatch and picks the hatched area as one", () => {
    const segs = [...box(0, 0, 100, 100), ...hatch45(0, 0, 100, 10)];
    const h = detectHatches(segs);
    expect([...h.hatch.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect(h.hatch.slice(4).every((v) => v === 1)).toBe(true);
    expect(area(pickRegion(segs, { x: 30, y: 60 }, { hatches: h }))).toBeCloseTo(10000, 6);
    // Without hatch detection the hatch lines cut the room into strips.
    expect(area(pickRegion(segs, { x: 30, y: 60 }))).toBeLessThan(2000);
  });

  it("does not treat wall faces (two parallel lines) as a hatch", () => {
    const h = detectHatches([seg(0, 0, 200, 0), seg(0, 6, 200, 6), seg(0, 40, 200, 40)]);
    expect([...h.hatch]).toEqual([0, 0, 0]);
  });

  it("finds every area with the same hatch pattern", () => {
    const segs = [
      ...box(0, 0, 100, 100), ...hatch45(0, 0, 100, 10),
      ...box(300, 0, 60, 60), ...hatch45(300, 0, 60, 10),
      ...box(0, 300, 80, 80), ...hatch45(0, 300, 80, 20), // different spacing
    ];
    const h = detectHatches(segs);
    const cluster = hatchAt(segs, h, { x: 50, y: 50 }, 3);
    expect(cluster).not.toBeNull();
    const regions = sameHatchRegions(segs, h, cluster!);
    expect(regions.map(area).sort((a, b) => a - b)).toEqual([3600, 10000].map((v) => expect.closeTo(v, 4)));
  });
});
