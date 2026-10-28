// CAD-native take-off selection on a sheet: the object under the cursor, and "select similar"
// (same layer and type, same hatch pattern and layer, same block). Quantities come from the exact
// model geometry (CadObject.area / length), not from the drawn outline.
import type { Bounds, Pt } from "./cad-geometry";
import type { CadSheet, SheetObject } from "./cad-sheet";

/** What the active tool measures: an area (or perimeter), a length, or a count of blocks. */
export type CadPickKind = "area" | "length" | "count";
export type CadSimilar = "layer" | "hatch" | "block";

const inBox = (b: Bounds, p: Pt, pad = 0) => p.x >= b.minX - pad && p.x <= b.maxX + pad && p.y >= b.minY - pad && p.y <= b.maxY + pad;

function inLoops(p: Pt, loops: Pt[][]): boolean {
  let inside = false;
  for (const poly of loops) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

function distToPolyline(p: Pt, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/** Whether an object can be measured by the tool. */
export function eligible(o: SheetObject, kind: CadPickKind): boolean {
  if (kind === "count") return o.type === "INSERT";
  if (kind === "area") return o.type !== "INSERT" && o.area !== null && o.area > 0 && (o.closed || o.type === "HATCH" || o.type === "LWPOLYLINE");
  return o.type !== "INSERT" && o.type !== "HATCH" && o.length !== null && o.length > 0;
}

/** Bounding boxes of block inserts, from the primitives they draw (an insert has only a point). */
export function insertBoxes(sheet: CadSheet): Map<string, Bounds> {
  const out = new Map<string, Bounds>();
  const inserts = new Set(sheet.objects.filter((o) => o.type === "INSERT").map((o) => o.handle));
  for (const p of sheet.prims) {
    if (!inserts.has(p.handle)) continue;
    const b = out.get(p.handle);
    out.set(p.handle, b ? { minX: Math.min(b.minX, p.box.minX), minY: Math.min(b.minY, p.box.minY), maxX: Math.max(b.maxX, p.box.maxX), maxY: Math.max(b.maxY, p.box.maxY) } : { ...p.box });
  }
  return out;
}

/**
 * The object the tool would take at p (sheet units): for areas the smallest closed object around
 * p, for lengths the nearest line within `tol`, for counts the smallest block insert around p.
 */
export function objectAt(sheet: CadSheet, p: Pt, kind: CadPickKind, tol: number, hidden: Set<string> = new Set(), boxes?: Map<string, Bounds>): SheetObject | null {
  let best: SheetObject | null = null, bestScore = Infinity;
  if (kind === "count") {
    const bx = boxes ?? insertBoxes(sheet);
    for (const o of sheet.objects) {
      if (o.type !== "INSERT" || hidden.has(o.layer)) continue;
      const b = bx.get(o.handle) ?? o.box;
      if (!inBox(b, p, tol)) continue;
      const score = (b.maxX - b.minX) * (b.maxY - b.minY);
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best;
  }
  for (const o of sheet.objects) {
    if (hidden.has(o.layer) || !eligible(o, kind) || !inBox(o.box, p, tol)) continue;
    if (kind === "area") {
      const near = Math.min(...o.outline.map((l) => distToPolyline(p, l)));
      if (!inLoops(p, o.outline) && near > tol) continue;
      // Smallest area under the cursor wins (for a hatch with many boundaries, the one around p, not
      // the whole hatch); a boundary right under the cursor wins over one around it.
      const around = o.outline.filter((l) => l.length > 2 && pointIn(p, l)).map(shoelace);
      const size = around.length ? Math.min(...around) : Math.min(...o.outline.filter((l) => l.length > 2).map(shoelace));
      const score = size * (near <= tol ? 0.5 : 1);
      if (score < bestScore) { bestScore = score; best = o; }
    } else {
      const d = Math.min(...o.outline.map((l) => distToPolyline(p, l)));
      if (d <= tol && d < bestScore) { bestScore = d; best = o; }
    }
  }
  return best;
}

/** Objects like `o`: same layer and type, same hatch pattern and layer, or same block name. */
export function similarTo(sheet: CadSheet, o: SheetObject, by: CadSimilar, kind: CadPickKind, hidden: Set<string> = new Set()): SheetObject[] {
  return sheet.objects.filter((x) => {
    if (hidden.has(x.layer) || !eligible(x, kind)) return false;
    if (by === "block") return x.type === "INSERT" && x.block === o.block;
    if (by === "hatch") return x.type === "HATCH" && x.pattern === o.pattern && x.layer === o.layer;
    return x.layer === o.layer && x.type === o.type;
  });
}

/** The largest loop of an outline (what a measurement shape stores). */
export function mainLoop(o: SheetObject): Pt[] {
  let best = o.outline[0] ?? [], bestA = -1;
  for (const l of o.outline) {
    let a = 0;
    for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p.x * q.y - q.x * p.y; }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = l; }
  }
  // Drop the repeated closing point of closed outlines.
  const n = best.length;
  return n > 2 && best[0].x === best[n - 1].x && best[0].y === best[n - 1].y ? best.slice(0, -1) : best;
}

function shoelace(l: Pt[]): number {
  let a = 0;
  for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

function pointIn(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const openLoop = (l: Pt[]) => (l.length > 2 && l[0].x === l[l.length - 1].x && l[0].y === l[l.length - 1].y ? l.slice(0, -1) : l);

/**
 * One outline for an area with openings: each opening is joined to the boundary by a zero-width
 * bridge and runs the other way round, so the outline's own area is the net area and it draws
 * with the holes open.
 */
export function keyhole(outer: Pt[], holes: Pt[][]): Pt[] {
  const sign = (l: Pt[]) => Math.sign(l.reduce((a, p, i) => a + p.x * l[(i + 1) % l.length].y - l[(i + 1) % l.length].x * p.y, 0));
  let ring = openLoop(outer);
  const s = sign(ring);
  for (const h0 of holes) {
    let h = openLoop(h0);
    if (h.length < 3) continue;
    if (sign(h) === s) h = [...h].reverse();
    // Bridge between the closest pair of vertices.
    let bi = 0, bj = 0, best = Infinity;
    for (let i = 0; i < ring.length; i++) for (let j = 0; j < h.length; j++) {
      const d = (ring[i].x - h[j].x) ** 2 + (ring[i].y - h[j].y) ** 2;
      if (d < best) { best = d; bi = i; bj = j; }
    }
    ring = [...ring.slice(0, bi + 1), ...h.slice(bj), ...h.slice(0, bj + 1), ...ring.slice(bi)];
  }
  return ring;
}

/**
 * The separate areas of an object, each with its share of the exact area. A hatch can hold many
 * boundaries (e.g. every column in one SOLID hatch): each outer loop becomes its own shape, minus
 * the islands inside it. The shares are scaled so they add up to the object's exact area.
 * A traced area with openings is one shape whose outline keeps the openings (see `keyhole`).
 */
export function regionsOf(o: SheetObject): { pts: Pt[]; area: number | null; length: number | null }[] {
  const loops = o.outline.filter((l) => l.length > 2);
  if (o.handles && loops.length > 1) return [{ pts: keyhole(loops[0], loops.slice(1)), area: o.area, length: o.length }];
  if (o.type !== "HATCH" || loops.length < 2) return [{ pts: mainLoop(o), area: o.area, length: o.length }];
  const depth = loops.map((l, i) => loops.reduce((d, other, j) => (j !== i && pointIn(l[0], other) ? d + 1 : d), 0));
  const regions = loops.map((l, i) => ({ l, i })).filter(({ i }) => depth[i] % 2 === 0).map(({ l, i }) => {
    const holes = loops.filter((h, j) => depth[j] === depth[i] + 1 && pointIn(h[0], l));
    return { l, net: Math.max(0, shoelace(l) - holes.reduce((t, h) => t + shoelace(h), 0)), perim: [l, ...holes] };
  });
  const sum = regions.reduce((t, r) => t + r.net, 0);
  const perimeterOf = (ls: Pt[][]) => ls.reduce((t, l) => t + l.reduce((s, p, k) => s + Math.hypot(l[(k + 1) % l.length].x - p.x, l[(k + 1) % l.length].y - p.y), 0), 0);
  const perimSum = regions.reduce((t, r) => t + perimeterOf(r.perim), 0);
  return regions.map((r) => {
    return {
      pts: keyhole(r.l, r.perim.slice(1)),
      area: o.area === null ? null : sum > 0 ? (o.area * r.net) / sum : o.area / regions.length,
      length: o.length === null ? null : perimSum > 0 ? (o.length * perimeterOf(r.perim)) / perimSum : o.length / regions.length,
    };
  });
}
