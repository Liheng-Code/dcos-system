// Which drawn take-off shape is under a click. Points are in page units; `tolerance` is in page units
// (the viewer passes a few screen pixels divided by the zoom).
import type { Pt } from "./geometry";

export interface HitShape {
  id: string;
  itemId: string;
  measureType: string;
  points: Pt[];
}

/** Ray casting; the polygon is closed implicitly. */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToPolyline(p: Pt, pts: Pt[], closed: boolean): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distanceToSegment(p, pts[i - 1], pts[i]));
  if (closed && pts.length > 2) best = Math.min(best, distanceToSegment(p, pts[pts.length - 1], pts[0]));
  if (pts.length === 1) best = Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  return best;
}

/**
 * The shape under `p`, topmost (last drawn) first. Edges and markers win over area interiors, so a
 * line drawn on top of a filled area can still be picked.
 */
export function hitTest(shapes: HitShape[], p: Pt, tolerance: number): HitShape | null {
  let interior: HitShape | null = null;
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.points.length === 0) continue;
    const closed = s.measureType === "area" || s.measureType === "perimeter";
    if (s.measureType === "count" || s.measureType === "point") {
      if (s.points.some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= tolerance * 1.5)) return s;
      continue;
    }
    if (distanceToPolyline(p, s.points, closed) <= tolerance) return s;
    if (!interior && s.measureType === "area" && s.points.length >= 3 && pointInPolygon(p, s.points)) interior = s;
  }
  return interior;
}
