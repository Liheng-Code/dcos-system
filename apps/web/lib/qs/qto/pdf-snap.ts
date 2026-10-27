// Snapping to the vector geometry of a PDF page. Segments are read from the pdf.js operator list
// (constructPath inside the current transform), converted to page units with the page's
// scale-1 viewport transform (origin top-left, the same space the viewer stores points in), and
// indexed in a grid. Curves are kept as their chord, which is enough for snapping to their ends.
import type { Pt } from "./geometry";

export type Matrix = [number, number, number, number, number, number];
export interface Segment { a: Pt; b: Pt }
export type SnapKind = "endpoint" | "intersection" | "midpoint" | "on-line";
export interface Snap { point: Pt; kind: SnapKind }

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 × m2 in PDF order: applying the result = applying m1, then m2. */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

export function apply(m: Matrix, x: number, y: number): Pt {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** The pdf.js operator codes this module needs (pdfjsLib.OPS). */
export interface OpCodes {
  save: number; restore: number; transform: number; constructPath: number;
  paintFormXObjectBegin: number; paintFormXObjectEnd: number;
  moveTo: number; lineTo: number; curveTo: number; curveTo2: number; curveTo3: number; closePath: number; rectangle: number;
}

const MAX_SEGMENTS = 80_000;

/**
 * Line segments of a page in page units. `viewport` is page.getViewport({ scale: 1 }).transform.
 * Very short segments (hatching dots, text-like strokes) are dropped.
 */
export function extractSegments(
  fnArray: number[], argsArray: unknown[], ops: OpCodes, viewport: Matrix, minLength = 0.5,
): Segment[] {
  const out: Segment[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  const push = (p: Pt, q: Pt) => {
    if (Math.hypot(q.x - p.x, q.y - p.y) >= minLength && out.length < MAX_SEGMENTS) out.push({ a: p, b: q });
  };
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[] | null;
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? IDENTITY;
    else if (fn === ops.transform && args) ctm = multiply(args as Matrix, ctm);
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0] as Matrix | null | undefined;
      if (Array.isArray(m) && m.length === 6) ctm = multiply(m, ctm);
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? IDENTITY;
    else if (fn === ops.constructPath && args) {
      const pathOps = args[0] as number[];
      const coords = args[1] as number[];
      const m = multiply(ctm, viewport);
      const toPage = (x: number, y: number) => apply(m, x, y);
      let j = 0;
      let cur: Pt | null = null;
      let start: Pt | null = null;
      for (const op of pathOps) {
        if (op === ops.rectangle) {
          const [x, y, w, h] = coords.slice(j, j + 4);
          j += 4;
          const c = [toPage(x, y), toPage(x + w, y), toPage(x + w, y + h), toPage(x, y + h)];
          for (let k = 0; k < 4; k++) push(c[k], c[(k + 1) % 4]);
          cur = start = c[0];
        } else if (op === ops.moveTo) {
          cur = start = toPage(coords[j], coords[j + 1]);
          j += 2;
        } else if (op === ops.lineTo) {
          const p = toPage(coords[j], coords[j + 1]);
          j += 2;
          if (cur) push(cur, p);
          cur = p;
        } else if (op === ops.curveTo) {
          const p = toPage(coords[j + 4], coords[j + 5]);
          j += 6;
          if (cur) push(cur, p);
          cur = p;
        } else if (op === ops.curveTo2 || op === ops.curveTo3) {
          const p = toPage(coords[j + 2], coords[j + 3]);
          j += 4;
          if (cur) push(cur, p);
          cur = p;
        } else if (op === ops.closePath) {
          if (cur && start) push(cur, start);
          cur = start;
        }
      }
    }
  }
  return out;
}

/** Grid index over segments for fast nearest-geometry queries. */
export class SnapIndex {
  private cells = new Map<string, number[]>();
  constructor(readonly segments: Segment[], private cell = 24) {
    segments.forEach((s, i) => {
      const x0 = Math.floor(Math.min(s.a.x, s.b.x) / cell), x1 = Math.floor(Math.max(s.a.x, s.b.x) / cell);
      const y0 = Math.floor(Math.min(s.a.y, s.b.y) / cell), y1 = Math.floor(Math.max(s.a.y, s.b.y) / cell);
      // Long segments are registered only in the cells they actually cross (sampled along the line).
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 16) {
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.add(x, y, i);
      } else {
        const steps = Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / (cell / 2));
        const seen = new Set<string>();
        for (let k = 0; k <= steps; k++) {
          const px = s.a.x + ((s.b.x - s.a.x) * k) / steps, py = s.a.y + ((s.b.y - s.a.y) * k) / steps;
          const key = `${Math.floor(px / cell)}:${Math.floor(py / cell)}`;
          if (!seen.has(key)) { seen.add(key); this.add(Math.floor(px / cell), Math.floor(py / cell), i); }
        }
      }
    });
  }
  private add(x: number, y: number, i: number) {
    const k = `${x}:${y}`;
    const list = this.cells.get(k);
    if (list) list.push(i); else this.cells.set(k, [i]);
  }
  near(p: Pt, radius: number): Segment[] {
    const ids = new Set<number>();
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor(p.x / this.cell), cy = Math.floor(p.y / this.cell);
    for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) {
      for (const i of this.cells.get(`${x}:${y}`) ?? []) ids.add(i);
    }
    return [...ids].map((i) => this.segments[i]);
  }
}

function closestOnSegment(p: Pt, s: Segment): Pt {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return s.a;
  const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2));
  return { x: s.a.x + t * dx, y: s.a.y + t * dy };
}

export function intersect(s: Segment, t: Segment): Pt | null {
  const d1x = s.b.x - s.a.x, d1y = s.b.y - s.a.y, d2x = t.b.x - t.a.x, d2y = t.b.y - t.a.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const u = ((t.a.x - s.a.x) * d2y - (t.a.y - s.a.y) * d2x) / den;
  const v = ((t.a.x - s.a.x) * d1y - (t.a.y - s.a.y) * d1x) / den;
  if (u < -1e-6 || u > 1 + 1e-6 || v < -1e-6 || v > 1 + 1e-6) return null;
  return { x: s.a.x + u * d1x, y: s.a.y + u * d1y };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The best snap within `tolerance` page units: endpoints and intersections first, then midpoints,
 * then the nearest point on a line. Returns null when nothing is close enough.
 */
export function findSnap(index: SnapIndex, p: Pt, tolerance: number): Snap | null {
  const segs = index.near(p, tolerance);
  if (segs.length === 0) return null;
  const st: { best: Snap | null; d: number } = { best: null, d: tolerance };
  const consider = (point: Pt, kind: SnapKind) => {
    const d = dist(point, p);
    if (d <= st.d) { st.best = { point, kind }; st.d = d; }
  };
  for (const s of segs) { consider(s.a, "endpoint"); consider(s.b, "endpoint"); }
  const close = segs.filter((s) => dist(closestOnSegment(p, s), p) <= tolerance).slice(0, 60);
  for (let i = 0; i < close.length; i++) {
    for (let j = i + 1; j < close.length; j++) {
      const x = intersect(close[i], close[j]);
      if (x) consider(x, "intersection");
    }
  }
  if (st.best) return st.best;
  for (const s of segs) consider({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, "midpoint");
  if (st.best && st.d <= tolerance / 2) return st.best;
  for (const s of close) consider(closestOnSegment(p, s), "on-line");
  return st.best;
}

/** Keeps the segment from `from` horizontal or vertical, whichever is closer. */
export function orthogonal(from: Pt, to: Pt): Pt {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
}

/** A PDF page unit is 1/72 inch; at true paper size a 1:N drawing has N × 0.3528 mm per unit. */
export const METRES_PER_PDF_UNIT = 0.0254 / 72;

export function drawingScaleFromCalibration(metresPerUnit: number): number {
  return metresPerUnit / METRES_PER_PDF_UNIT;
}
