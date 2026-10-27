// AutoCAD-style grips for editing a drawn take-off shape: a grip on every vertex and on the middle of
// every edge. Dragging a vertex grip moves that vertex; dragging a middle grip moves the whole edge.
// Also builds the "object snap" segments of the drawn shapes and ranks snaps from several sources.
import type { Pt } from "./geometry";
import { SnapIndex, findSnap, type Segment, type Snap } from "./pdf-snap";

export interface Grip {
  kind: "vertex" | "mid";
  /** Vertex index, or the index of the edge's first vertex. */
  index: number;
  at: Pt;
  /** Edge direction in degrees (middle grips are drawn along their edge). */
  angle: number;
}

export const isClosedType = (measureType: string) => measureType === "area" || measureType === "perimeter";
export const isPointType = (measureType: string) => measureType === "count" || measureType === "point";

/** Grips of a shape: one per vertex, plus one per edge midpoint for lines and outlines. */
export function gripsOf(points: Pt[], measureType: string): Grip[] {
  const out: Grip[] = points.map((p, i) => ({ kind: "vertex", index: i, at: p, angle: 0 }));
  if (isPointType(measureType) || points.length < 2) return out;
  const closed = isClosedType(measureType) && points.length > 2;
  const edges = closed ? points.length : points.length - 1;
  for (let i = 0; i < edges; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    out.push({ kind: "mid", index: i, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
  }
  return out;
}

/**
 * The shape's points with a grip moved to `target`. A middle grip carries both ends of its edge by the
 * same offset, so the edge keeps its length and direction (a stretch).
 */
export function moveGrip(points: Pt[], grip: Pick<Grip, "kind" | "index">, target: Pt, measureType: string): Pt[] {
  const next = points.map((p) => ({ ...p }));
  if (grip.kind === "vertex") {
    next[grip.index] = { ...target };
    return next;
  }
  const j = (grip.index + 1) % points.length;
  const a = points[grip.index], b = points[j];
  const dx = target.x - (a.x + b.x) / 2, dy = target.y - (a.y + b.y) / 2;
  next[grip.index] = { x: a.x + dx, y: a.y + dy };
  if (j !== grip.index && (isClosedType(measureType) || j > grip.index)) next[j] = { x: b.x + dx, y: b.y + dy };
  return next;
}

/** Segments of drawn shapes for object snap (count markers become zero-length segments). */
export function shapeSegments(shapes: { id: string; measure_type: string; points: Pt[] }[], excludeId?: string | null): Segment[] {
  const out: Segment[] = [];
  for (const s of shapes) {
    if (s.id === excludeId || !s.points?.length) continue;
    if (isPointType(s.measure_type)) { for (const p of s.points) out.push({ a: p, b: p }); continue; }
    for (let i = 1; i < s.points.length; i++) out.push({ a: s.points[i - 1], b: s.points[i] });
    if (isClosedType(s.measure_type) && s.points.length > 2) out.push({ a: s.points[s.points.length - 1], b: s.points[0] });
  }
  return out;
}

const RANK: Record<Snap["kind"], number> = { endpoint: 0, intersection: 0, midpoint: 1, "on-line": 2 };

/** The best snap over several sources: endpoints/intersections first, then midpoints, then on-line; nearest wins a tie. */
export function bestSnap(indices: (SnapIndex | null)[], p: Pt, tolerance: number): Snap | null {
  let best: Snap | null = null;
  let bestD = Infinity;
  for (const idx of indices) {
    if (!idx) continue;
    const s = findSnap(idx, p, tolerance);
    if (!s) continue;
    const d = Math.hypot(s.point.x - p.x, s.point.y - p.y);
    if (!best || RANK[s.kind] < RANK[best.kind] || (RANK[s.kind] === RANK[best.kind] && d < bestD)) { best = s; bestD = d; }
  }
  return best;
}
