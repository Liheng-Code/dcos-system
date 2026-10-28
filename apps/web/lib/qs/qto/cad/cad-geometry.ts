// Places parsed DXF entities in the world (model space, y up): blocks are expanded through their
// nested INSERT transforms, layers and colours resolved, and every curve kept as true line / arc
// segments so areas and lengths are exact. Flattened copies are made only for drawing and snapping.
import type { DxfDoc, DxfEntity, HatchEdge, HatchPatternLine, PolyVertex, TextAlign, XY } from "./dxf-parse";
import { metresPerUnit } from "./cad-units";

export type Pt = XY;
/** x' = a·x + c·y + e, y' = b·x + d·y + f (the PDF matrix convention used in pdf-snap.ts). */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
const FLIP_X: Mat = [-1, 0, 0, 1, 0, 0];

/** m1 then m2. */
export function mul(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}
export const apply = (m: Mat, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const det = (m: Mat) => m[0] * m[3] - m[1] * m[2];

// ── Segments: lines and true arcs ────────────────────────────────────────────

export type Seg =
  | { kind: "line"; a: Pt; b: Pt }
  /** Arc from angle a0 (radians) through a signed sweep (positive = counter-clockwise). */
  | { kind: "arc"; c: Pt; r: number; a0: number; sweep: number };

const arcPoint = (c: Pt, r: number, t: number): Pt => ({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
export const segStart = (s: Seg): Pt => (s.kind === "line" ? s.a : arcPoint(s.c, s.r, s.a0));
export const segEnd = (s: Seg): Pt => (s.kind === "line" ? s.b : arcPoint(s.c, s.r, s.a0 + s.sweep));

/** The arc of a polyline segment with a bulge (tan of a quarter of the included angle). */
export function bulgeSeg(p: Pt, q: Pt, bulge: number): Seg {
  if (!bulge || (p.x === q.x && p.y === q.y)) return { kind: "line", a: p, b: q };
  const theta = 4 * Math.atan(bulge);
  const chord = Math.hypot(q.x - p.x, q.y - p.y);
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const ang = Math.atan2(q.y - p.y, q.x - p.x);
  const ca = ang + Math.sign(theta) * (Math.PI / 2 - Math.abs(theta) / 2);
  const c = { x: p.x + r * Math.cos(ca), y: p.y + r * Math.sin(ca) };
  return { kind: "arc", c, r, a0: Math.atan2(p.y - c.y, p.x - c.x), sweep: theta };
}

export function polylineSegs(vertices: PolyVertex[], closed: boolean): Seg[] {
  const out: Seg[] = [];
  const n = vertices.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p = vertices[i], q = vertices[(i + 1) % n];
    if (p.x === q.x && p.y === q.y) continue;
    out.push(bulgeSeg(p, q, p.bulge));
  }
  return out;
}

/** Signed area (counter-clockwise positive) of a closed chain of segments, exact for arcs. */
export function segsArea(segs: Seg[]): number {
  let s = 0;
  for (const g of segs) {
    if (g.kind === "line") s += g.a.x * g.b.y - g.b.x * g.a.y;
    else {
      const a1 = g.a0 + g.sweep;
      s += g.r * g.c.x * (Math.sin(a1) - Math.sin(g.a0)) - g.r * g.c.y * (Math.cos(a1) - Math.cos(g.a0)) + g.r * g.r * g.sweep;
    }
  }
  return s / 2;
}

export function segsLength(segs: Seg[]): number {
  return segs.reduce((t, g) => t + (g.kind === "line" ? Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) : g.r * Math.abs(g.sweep)), 0);
}

/** Pieces for an arc so the chord stays within `tol` of the curve (2..256). */
function arcSteps(r: number, sweep: number, tol: number): number {
  if (r <= tol) return 2;
  const step = 2 * Math.acos(Math.max(-1, 1 - tol / r));
  return Math.max(2, Math.min(256, Math.ceil(Math.abs(sweep) / step)));
}

/** Points along a chain of segments (start point once, then each segment's points). */
export function flattenSegs(segs: Seg[], tol: number): Pt[] {
  const out: Pt[] = [];
  for (const g of segs) {
    if (!out.length) out.push(segStart(g));
    if (g.kind === "line") out.push(g.b);
    else {
      const n = arcSteps(g.r, g.sweep, tol);
      for (let k = 1; k <= n; k++) out.push(arcPoint(g.c, g.r, g.a0 + (g.sweep * k) / n));
    }
  }
  return out;
}

/**
 * Segments through a transform. Arcs stay arcs under rotation, uniform scale and mirroring;
 * under non-uniform scale they are flattened to lines first.
 */
export function transformSegs(segs: Seg[], m: Mat, tol: number): Seg[] {
  const d = det(m);
  const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
  const uniform = Math.abs(sx - sy) <= 1e-9 * Math.max(sx, sy) && Math.abs(m[0] * m[2] + m[1] * m[3]) <= 1e-9 * sx * sy;
  const out: Seg[] = [];
  for (const g of segs) {
    if (g.kind === "line") { out.push({ kind: "line", a: apply(m, g.a), b: apply(m, g.b) }); continue; }
    if (!uniform) {
      const pts = flattenSegs([g], tol / Math.max(sx, sy, 1e-12));
      for (let i = 1; i < pts.length; i++) out.push({ kind: "line", a: apply(m, pts[i - 1]), b: apply(m, pts[i]) });
      continue;
    }
    const dir = { x: m[0] * Math.cos(g.a0) + m[2] * Math.sin(g.a0), y: m[1] * Math.cos(g.a0) + m[3] * Math.sin(g.a0) };
    out.push({ kind: "arc", c: apply(m, g.c), r: g.r * sx, a0: Math.atan2(dir.y, dir.x), sweep: d < 0 ? -g.sweep : g.sweep });
  }
  return out;
}

// ── Ellipses and splines (flattened; not used for exact quantities) ─────────

function ellipsePoints(c: Pt, major: Pt, ratio: number, t0: number, t1: number, ccw: boolean): Pt[] {
  let sweep = ccw ? t1 - t0 : -(t0 - t1);
  if (ccw) { while (sweep <= 0) sweep += 2 * Math.PI; } else { sweep = t1 - t0; while (sweep >= 0) sweep -= 2 * Math.PI; }
  const n = Math.max(8, Math.min(256, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 128)));
  const minor = { x: -major.y * ratio, y: major.x * ratio };
  const out: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const t = t0 + (sweep * k) / n;
    out.push({ x: c.x + major.x * Math.cos(t) + minor.x * Math.sin(t), y: c.y + major.y * Math.cos(t) + minor.y * Math.sin(t) });
  }
  return out;
}

/** NURBS curve points by de Boor (falls back to fit points or the control polygon). */
export function splinePoints(degree: number, knots: number[], control: Pt[], weights: number[] | null, fit: Pt[], samples = 64): Pt[] {
  const n = control.length;
  if (n < 2 || knots.length !== n + degree + 1) return fit.length >= 2 ? fit : control;
  const w = weights ?? control.map(() => 1);
  const lo = knots[degree], hi = knots[n];
  const out: Pt[] = [];
  const steps = Math.max(samples, n * 8);
  for (let s = 0; s <= steps; s++) {
    const u = s === steps ? hi - 1e-12 * (hi - lo || 1) : lo + ((hi - lo) * s) / steps;
    let k = degree;
    while (k < n - 1 && u >= knots[k + 1]) k++;
    const d = Array.from({ length: degree + 1 }, (_, j) => {
      const p = control[k - degree + j], wj = w[k - degree + j];
      return { x: p.x * wj, y: p.y * wj, w: wj };
    });
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = k - degree + j;
        const den = knots[i + degree - r + 1] - knots[i];
        const a = den ? (u - knots[i]) / den : 0;
        d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y, w: (1 - a) * d[j - 1].w + a * d[j].w };
      }
    }
    out.push({ x: d[degree].x / d[degree].w, y: d[degree].y / d[degree].w });
  }
  return out;
}

const linesOf = (pts: Pt[]): Seg[] => pts.slice(1).map((p, i) => ({ kind: "line" as const, a: pts[i], b: p }));

/** Hatch boundary edges as segments. Clockwise arcs store angles mirrored (360° − angle). */
function edgeSegs(e: HatchEdge): Seg[] {
  const rad = Math.PI / 180;
  if (e.kind === "line") return [{ kind: "line", a: e.a, b: e.b }];
  if (e.kind === "arc") {
    const s = e.ccw ? e.start : -e.start, t = e.ccw ? e.end : -e.end;
    let sweep = (t - s) * rad;
    if (e.ccw) { while (sweep <= 0) sweep += 2 * Math.PI; } else { while (sweep >= 0) sweep -= 2 * Math.PI; }
    if (Math.abs(Math.abs(e.end - e.start) - 360) < 1e-9) sweep = e.ccw ? 2 * Math.PI : -2 * Math.PI;
    return [{ kind: "arc", c: e.c, r: e.r, a0: s * rad, sweep }];
  }
  if (e.kind === "ellipse") {
    const s = (e.ccw ? e.start : -e.start) * rad, t = (e.ccw ? e.end : -e.end) * rad;
    return linesOf(ellipsePoints(e.c, e.major, e.ratio, s, t, e.ccw));
  }
  return linesOf(splinePoints(e.degree, e.knots, e.control, e.weights, e.fit));
}

// ── Colours ──────────────────────────────────────────────────────────────────

const ACI_BASE = ["#000000", "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ffffff", "#808080", "#c0c0c0"];

/** AutoCAD Color Index → CSS colour (7 is the "ink" colour: white on black, black on white). */
export function aciColor(i: number): string {
  if (i >= 0 && i <= 9) return ACI_BASE[i];
  if (i >= 250 && i <= 255) { const v = Math.round(51 + ((i - 250) * 204) / 5); return `rgb(${v},${v},${v})`; }
  const hue = Math.floor((i - 10) / 10) * 15;
  const j = (i - 10) % 10;
  const value = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][j];
  const sat = j % 2 === 0 ? 1 : 0.5;
  const c = value * sat, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = value - c;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `rgb(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)})`;
}
const trueColor = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;

// ── The model ────────────────────────────────────────────────────────────────

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/** Something to draw. Points are world coordinates (y up), already flattened. */
export interface CadPrim {
  /** Top-level entity handle (for block contents, the INSERT's). */
  handle: string;
  layer: string;
  /** CSS colour; "ink" = ACI 7 (white or black with the sheet). */
  color: string;
  kind: "path" | "fill" | "text" | "point" | "hatch";
  pts: Pt[];
  closed: boolean;
  /** Hatch fills: the boundary loops (even-odd) and pattern lines. */
  loops?: Pt[][];
  pattern?: HatchPatternLine[];
  solid?: boolean;
  text?: { value: string; height: number; rotation: number; align?: TextAlign };
}

/** A top-level entity that can be measured (exact quantities in drawing units). */
export interface CadObject {
  handle: string;
  type: DxfEntity["type"];
  layer: string;
  /** INSERT block name / HATCH pattern name. */
  block?: string;
  pattern?: string;
  closed: boolean;
  /** Drawing units²; null when not a closed shape. */
  area: number | null;
  /** Length or perimeter in drawing units. */
  length: number | null;
  /** Outline loops (flattened, world). For a hatch, every boundary loop. */
  outline: Pt[][];
  /** INSERT insertion point. */
  at?: Pt;
  bounds: Bounds;
}

export interface CadLayerInfo { name: string; color: string; off: boolean; frozen: boolean; count: number }

export interface CadModel {
  insUnits: number;
  metresPerUnit: number | null;
  /** Everything drawn. */
  bounds: Bounds;
  /** The extents to frame the view on: AutoCAD's own ($EXTMIN/$EXTMAX) when they hold most of the drawing, else `bounds`. */
  view: Bounds;
  prims: CadPrim[];
  objects: CadObject[];
  layers: CadLayerInfo[];
  skipped: Record<string, number>;
  version: string | null;
}

const MAX_DEPTH = 16;

function boundsOf(loops: Pt[][]): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const l of loops) for (const p of l) {
    if (p.x < b.minX) b.minX = p.x; if (p.y < b.minY) b.minY = p.y;
    if (p.x > b.maxX) b.maxX = p.x; if (p.y > b.maxY) b.maxY = p.y;
  }
  return b;
}

function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p: Pt, q: Pt, r: Pt) => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d));
}

/** Whether any two loops touch, cross or share an edge (then nesting by containment is ambiguous). */
function loopsTouch(flat: Pt[][]): boolean {
  const bs = flat.map((l) => boundsOf([l]));
  for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) {
    const a = bs[i], b = bs[j];
    if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) continue;
    const p = flat[i], q = flat[j];
    for (let u = 1; u < p.length; u++) for (let v = 1; v < q.length; v++) {
      if (segsCross(p[u - 1], p[u], q[v - 1], q[v])) return true;
    }
  }
  return false;
}

/**
 * Area filled under the even-odd rule (how AutoCAD fills hatch loops), by scanline: between
 * consecutive vertex / crossing heights the filled width is linear, so the mid-height width times
 * the slab height is exact for straight edges.
 */
export function evenOddArea(loops: Pt[][]): number {
  const edges: [Pt, Pt][] = [];
  for (const l of loops) for (let i = 1; i < l.length; i++) if (l[i - 1].y !== l[i].y) edges.push([l[i - 1], l[i]]);
  const ys = new Set<number>();
  for (const [a, b] of edges) { ys.add(a.y); ys.add(b.y); }
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const [a, b] = edges[i], [c, d] = edges[j];
    const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    if (!den) continue;
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
    const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
    if (t > 0 && t < 1 && u > 0 && u < 1) ys.add(a.y + t * (b.y - a.y));
  }
  const levels = [...ys].sort((p, q) => p - q);
  let area = 0;
  for (let k = 1; k < levels.length; k++) {
    const y0 = levels[k - 1], y1 = levels[k];
    if (y1 - y0 <= 0) continue;
    const y = (y0 + y1) / 2;
    const xs: number[] = [];
    for (const [a, b] of edges) {
      if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    let w = 0;
    for (let i = 1; i < xs.length; i += 2) w += xs[i] - xs[i - 1];
    area += w * (y1 - y0);
  }
  return area;
}

/**
 * Hatch area as AutoCAD fills it (even-odd). Cleanly nested loops are measured exactly with their
 * arcs (even depth adds, odd depth is an island); loops that touch, overlap or repeat use the
 * even-odd scanline on finely flattened loops.
 */
export function hatchArea(loops: Seg[][], tol: number): number {
  const flat = loops.map((l) => flattenSegs(l, tol));
  if (loops.length > 1 && loopsTouch(flat)) return evenOddArea(flat.map((l) => (l.length && (l[0].x !== l[l.length - 1].x || l[0].y !== l[l.length - 1].y) ? [...l, l[0]] : l)));
  return loops.reduce((sum, l, i) => {
    const depth = flat.reduce((d, other, j) => (j !== i && other.length > 2 && flat[i].length && pointInPoly(flat[i][0], other) ? d + 1 : d), 0);
    const a = Math.abs(segsArea(l));
    return sum + (depth % 2 === 0 ? a : -a);
  }, 0);
}

/** The segments of an entity in its own coordinates (OCS / block space). */
function entitySegs(e: DxfEntity): { segs: Seg[]; closed: boolean } | null {
  const rad = Math.PI / 180;
  switch (e.type) {
    case "LINE": return { segs: [{ kind: "line", a: e.a, b: e.b }], closed: false };
    case "LWPOLYLINE": return { segs: polylineSegs(e.vertices, e.closed), closed: e.closed };
    case "ARC": {
      let sweep = (e.end - e.start) * rad;
      while (sweep <= 0) sweep += 2 * Math.PI;
      return { segs: [{ kind: "arc", c: e.c, r: e.r, a0: e.start * rad, sweep }], closed: false };
    }
    case "CIRCLE": return { segs: [{ kind: "arc", c: e.c, r: e.r, a0: 0, sweep: 2 * Math.PI }], closed: true };
    case "ELLIPSE": {
      const full = Math.abs(e.end - e.start - 2 * Math.PI) < 1e-9;
      return { segs: linesOf(ellipsePoints(e.c, e.major, e.ratio, e.start, e.end, true)), closed: full };
    }
    case "SPLINE": return { segs: linesOf(splinePoints(e.degree, e.knots, e.control, e.weights, e.fit)), closed: e.closed };
    case "SOLID": return { segs: linesOf([...e.corners, e.corners[0]]), closed: true };
    default: return null;
  }
}

/** OCS entities use the arbitrary-axis frame; for extrusion (0,0,-1) that mirrors x. */
const OCS_TYPES = new Set(["LWPOLYLINE", "ARC", "CIRCLE", "SOLID", "TEXT", "INSERT", "HATCH"]);

/**
 * Builds the drawable and measurable model of the model space. `tol` is the chord tolerance for
 * drawing curves, in drawing units (default: 1/20,000 of the drawing size).
 */
export function buildModel(doc: DxfDoc, opts: { tol?: number } = {}): CadModel {
  const ext = doc.extMin && doc.extMax ? Math.hypot(doc.extMax.x - doc.extMin.x, doc.extMax.y - doc.extMin.y) : 0;
  const tol = opts.tol ?? (ext > 0 && Number.isFinite(ext) && ext < 1e12 ? ext / 20000 : 0.5);
  const prims: CadPrim[] = [];
  const objects: CadObject[] = [];
  const layerCount = new Map<string, number>();

  const layerColor = (name: string) => {
    const l = doc.layers.get(name);
    if (!l) return "ink";
    if (l.trueColor !== null) return trueColor(l.trueColor);
    return l.color === 7 ? "ink" : aciColor(l.color);
  };

  const walk = (entities: DxfEntity[], m: Mat, parentLayer: string | null, parentColor: string | null, topHandle: string | null, depth: number) => {
    for (const e of entities) {
      if (depth === 0 && e.paperSpace) continue;
      const layer = parentLayer && e.layer === "0" ? parentLayer : e.layer;
      const color = e.trueColor !== null ? trueColor(e.trueColor)
        : e.color === 0 ? parentColor ?? "ink"
        : e.color === 256 ? layerColor(layer)
        : e.color === 7 ? "ink" : aciColor(e.color);
      const handle = topHandle ?? e.handle;
      const em = e.mirrored && OCS_TYPES.has(e.type) ? mul(FLIP_X, m) : m;
      layerCount.set(layer, (layerCount.get(layer) ?? 0) + 1);

      if (e.type === "INSERT" || e.type === "DIMENSION") {
        if (depth >= MAX_DEPTH) continue;
        const block = doc.blocks.get(e.type === "INSERT" ? e.name : e.block);
        if (e.type === "DIMENSION") { if (block) walk(block.entities, mul([1, 0, 0, 1, e.at.x, e.at.y], em), layer, color, handle, depth + 1); continue; }
        const rot = e.rotation * Math.PI / 180;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const at: Pt[] = [];
        for (let r = 0; r < e.rows; r++) for (let c = 0; c < e.cols; c++) {
          const ox = c * e.colSpacing, oy = r * e.rowSpacing;
          at.push({ x: e.at.x + ox * cos - oy * sin, y: e.at.y + ox * sin + oy * cos });
        }
        for (const p of at) {
          const base = block?.base ?? { x: 0, y: 0 };
          const local: Mat = mul(mul([1, 0, 0, 1, -base.x, -base.y], [e.scale.x, 0, 0, e.scale.y, 0, 0]), [cos, sin, -sin, cos, p.x, p.y]);
          const bm = mul(local, em);
          if (block) walk(block.entities, bm, layer, color, handle, depth + 1);
          if (depth === 0) {
            const w = apply(em, p);
            objects.push({ handle: e.handle, type: "INSERT", layer, block: e.name, closed: false, area: null, length: null, outline: [[w]], at: w, bounds: { minX: w.x, minY: w.y, maxX: w.x, maxY: w.y } });
          }
        }
        for (const a of e.attribs) {
          prims.push({ handle, layer, color, kind: "text", pts: [apply(em, a.at)], closed: false, text: { value: a.text, height: a.height * Math.sqrt(Math.abs(det(em))), rotation: a.rotation } });
        }
        continue;
      }
      if (e.type === "TEXT" || e.type === "MTEXT") {
        const dir = { x: Math.cos(e.rotation * Math.PI / 180), y: Math.sin(e.rotation * Math.PI / 180) };
        const wd = { x: em[0] * dir.x + em[2] * dir.y, y: em[1] * dir.x + em[3] * dir.y };
        prims.push({ handle, layer, color, kind: "text", pts: [apply(em, e.at)], closed: false,
          text: { value: e.text, height: e.height * Math.sqrt(Math.abs(det(em))), rotation: Math.atan2(wd.y, wd.x) * 180 / Math.PI, align: e.align } });
        continue;
      }
      if (e.type === "MULTILEADER") {
        const scale = Math.sqrt(Math.abs(det(em)));
        if (e.at && e.text) prims.push({ handle, layer, color, kind: "text", pts: [apply(em, e.at)], closed: false, text: { value: e.text, height: e.height * scale, rotation: 0, align: { h: "left", v: "top" } } });
        for (const l of e.leaders) {
          for (const line of l.lines) {
            const pts = [...line, ...(l.connection ? [l.connection] : [])].map((p) => apply(em, p));
            if (pts.length > 1) prims.push({ handle, layer, color, kind: "path", pts, closed: false });
          }
          if (l.connection && l.dogleg && l.dogleg.length > 0) {
            const end = { x: l.connection.x + l.dogleg.dir.x * l.dogleg.length, y: l.connection.y + l.dogleg.dir.y * l.dogleg.length };
            prims.push({ handle, layer, color, kind: "path", pts: [apply(em, l.connection), apply(em, end)], closed: false });
          }
        }
        continue;
      }
      if (e.type === "POINT") { prims.push({ handle, layer, color, kind: "point", pts: [apply(em, e.at)], closed: false }); continue; }
      if (e.type === "HATCH") {
        const loopSegs = e.loops.map((l) => transformSegs(l.polyline ? polylineSegs(l.polyline.vertices, true) : l.edges.flatMap(edgeSegs), em, tol));
        const loops = loopSegs.map((s) => flattenSegs(s, tol)).filter((l) => l.length > 2);
        if (!loops.length) continue;
        prims.push({ handle, layer, color, kind: "hatch", pts: [], closed: true, loops, solid: e.solid,
          pattern: e.patternLines.map((pl) => ({ ...pl, base: apply(em, pl.base), offset: { x: em[0] * pl.offset.x + em[2] * pl.offset.y, y: em[1] * pl.offset.x + em[3] * pl.offset.y }, angle: pl.angle })) });
        if (depth === 0) {
          objects.push({ handle: e.handle, type: "HATCH", layer, pattern: e.pattern, closed: true, area: hatchArea(loopSegs, tol / 50),
            length: loopSegs.reduce((t, s) => t + segsLength(s), 0), outline: loops, bounds: boundsOf(loops) });
        }
        continue;
      }
      const s = entitySegs(e);
      if (!s || !s.segs.length) continue;
      const ws = transformSegs(s.segs, em, tol);
      const pts = flattenSegs(ws, tol);
      prims.push({ handle, layer, color, kind: e.type === "SOLID" ? "fill" : "path", pts, closed: s.closed });
      if (depth === 0) {
        const exact = e.type !== "ELLIPSE" && e.type !== "SPLINE";
        objects.push({ handle: e.handle, type: e.type, layer, closed: s.closed,
          area: s.closed ? Math.abs(exact ? segsArea(ws) : segsArea(linesOf(flattenSegs(ws, tol / 50))))
            : e.type === "LWPOLYLINE" && e.vertices.length >= 3 ? Math.abs(segsArea([...ws, { kind: "line", a: segEnd(ws[ws.length - 1]), b: segStart(ws[0]) }]))
            : null,
          length: segsLength(ws), outline: [pts], bounds: boundsOf([pts]) });
      }
    }
  };
  walk(doc.entities, IDENTITY, null, null, null, 0);

  const all = boundsOf(prims.flatMap((p) => (p.loops ? p.loops : [p.pts])));
  const bounds = Number.isFinite(all.minX) ? all : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let view = bounds;
  if (doc.extMin && doc.extMax && doc.extMax.x > doc.extMin.x && doc.extMax.y > doc.extMin.y && Math.abs(doc.extMax.x) < 1e15) {
    const e = { minX: doc.extMin.x, minY: doc.extMin.y, maxX: doc.extMax.x, maxY: doc.extMax.y };
    const pad = 0.01 * Math.max(e.maxX - e.minX, e.maxY - e.minY);
    const inside = prims.filter((p) => {
      const q = p.loops?.[0]?.[0] ?? p.pts[0];
      return q && q.x >= e.minX - pad && q.x <= e.maxX + pad && q.y >= e.minY - pad && q.y <= e.maxY + pad;
    }).length;
    if (prims.length && inside / prims.length >= 0.8) view = e;
  }
  const layers: CadLayerInfo[] = [...new Set([...doc.layers.keys(), ...layerCount.keys()])].map((name) => {
    const l = doc.layers.get(name);
    return { name, color: layerColor(name), off: l?.off ?? false, frozen: l?.frozen ?? false, count: layerCount.get(name) ?? 0 };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { insUnits: doc.insUnits, metresPerUnit: metresPerUnit(doc.insUnits), bounds, view, prims, objects, layers, skipped: doc.skipped, version: doc.version };
}
