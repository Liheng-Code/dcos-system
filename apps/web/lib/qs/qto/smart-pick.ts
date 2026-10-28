// Smart pick: the closed area around a clicked point, traced from the PDF's vector lines.
// Lines are noded (split where they cross, small gaps closed) into a planar graph, dead ends are
// pruned, and the face containing the point is walked. Hatch patterns (runs of evenly spaced
// parallel lines) are detected first and left out, so a hatched region picks as one area; the same
// detection finds every region drawn with one hatch pattern.
import type { Pt } from "./geometry";
import type { Segment } from "./pdf-snap";

/** Uniform grid of segment ids (each segment registered in the cells along it). */
class SegGrid {
  private cells = new Map<number, number[]>();
  constructor(private segs: Segment[], private cell: number, ids?: Iterable<number>) {
    for (const i of ids ?? segs.keys()) for (const k of this.cellsOf(segs[i])) {
      const list = this.cells.get(k);
      if (list) list.push(i); else this.cells.set(k, [i]);
    }
  }
  private key(x: number, y: number) { return (x + 100_000) * 200_003 + (y + 100_000); }
  private cellsOf(s: Segment): Set<number> {
    const out = new Set<number>();
    const steps = Math.max(1, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / (this.cell / 2)));
    for (let k = 0; k <= steps; k++) {
      const x = s.a.x + ((s.b.x - s.a.x) * k) / steps, y = s.a.y + ((s.b.y - s.a.y) * k) / steps;
      out.add(this.key(Math.floor(x / this.cell), Math.floor(y / this.cell)));
    }
    return out;
  }
  /** Ids of segments near segment s (its cells and their neighbours). */
  nearSegment(s: Segment): Set<number> {
    const ids = new Set<number>();
    const steps = Math.max(1, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / (this.cell / 2)));
    const seen = new Set<number>();
    for (let k = 0; k <= steps; k++) {
      const cx = Math.floor((s.a.x + ((s.b.x - s.a.x) * k) / steps) / this.cell);
      const cy = Math.floor((s.a.y + ((s.b.y - s.a.y) * k) / steps) / this.cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const key = this.key(cx + dx, cy + dy);
        if (seen.has(key)) continue;
        seen.add(key);
        for (const i of this.cells.get(key) ?? []) ids.add(i);
      }
    }
    return ids;
  }
  /** Ids of segments with a cell inside the box. */
  inBox(x0: number, y0: number, x1: number, y1: number): Set<number> {
    const ids = new Set<number>();
    for (let x = Math.floor(x0 / this.cell); x <= Math.floor(x1 / this.cell); x++) {
      for (let y = Math.floor(y0 / this.cell); y <= Math.floor(y1 / this.cell); y++) {
        for (const i of this.cells.get(this.key(x, y)) ?? []) ids.add(i);
      }
    }
    return ids;
  }
}

// ── Hatch detection ──────────────────────────────────────────────────────────

export interface HatchInfo {
  /** 1 when the segment is part of a hatch pattern. */
  hatch: Uint8Array;
  /** Hatch cluster of each segment (-1 = none). */
  cluster: Int32Array;
  /** Pattern of each cluster: angle in whole degrees [0, 180) and line spacing in page units. */
  patterns: Map<number, { angle: number; spacing: number; members: number[] }>;
}

const MIN_HATCH_LINES = 4;
const SPACING_TOL = 0.15;

/**
 * Finds hatch lines: segments with parallel neighbours at an even spacing (≤ maxSpacing page
 * units) on both sides, joined into clusters of at least four lines. Two or three parallel lines
 * (wall faces) are not a hatch.
 */
export function detectHatches(segs: Segment[], maxSpacing = 24): HatchInfo {
  const n = segs.length;
  const len = new Float64Array(n), ang = new Int16Array(n);
  const ux = new Float64Array(n), uy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = segs[i];
    let dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    const l = Math.hypot(dx, dy);
    len[i] = l;
    if (l === 0) { ang[i] = -1; continue; }
    if (dy < 0 || (dy === 0 && dx < 0)) { dx = -dx; dy = -dy; }
    ux[i] = dx / l; uy[i] = dy / l;
    ang[i] = Math.round((Math.atan2(dy, dx) * 180) / Math.PI) % 180;
  }
  const usable = (i: number) => len[i] >= 1 && ang[i] >= 0;
  const grid = new SegGrid(segs, Math.max(4, maxSpacing), [...segs.keys()].filter(usable));
  const gapP = new Float64Array(n).fill(Infinity), gapN = new Float64Array(n).fill(Infinity);
  const nbP = new Int32Array(n).fill(-1), nbN = new Int32Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    if (!usable(i)) continue;
    const s = segs[i];
    const nx = -uy[i], ny = ux[i];
    const o = nx * s.a.x + ny * s.a.y;
    const a0 = ux[i] * s.a.x + uy[i] * s.a.y, a1 = ux[i] * s.b.x + uy[i] * s.b.y;
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    for (const j of grid.nearSegment(s)) {
      if (j === i) continue;
      const d = Math.abs(ang[i] - ang[j]);
      if (Math.min(d, 180 - d) > 1) continue;
      const t = segs[j];
      const b0 = ux[i] * t.a.x + uy[i] * t.a.y, b1 = ux[i] * t.b.x + uy[i] * t.b.y;
      const overlap = Math.min(hi, Math.max(b0, b1)) - Math.max(lo, Math.min(b0, b1));
      if (overlap < 0.25 * Math.min(len[i], len[j])) continue;
      const off = nx * (t.a.x + t.b.x) / 2 + ny * (t.a.y + t.b.y) / 2 - o;
      if (Math.abs(off) < 0.2 || Math.abs(off) > maxSpacing) continue;
      if (off > 0 && off < gapP[i]) { gapP[i] = off; nbP[i] = j; }
      if (off < 0 && -off < gapN[i]) { gapN[i] = -off; nbN[i] = j; }
    }
  }

  const same = (a: number, b: number) => Math.abs(a - b) <= SPACING_TOL * Math.max(a, b);
  const strong = new Uint8Array(n);
  const spacing = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(gapP[i]) && Number.isFinite(gapN[i]) && same(gapP[i], gapN[i])) {
      strong[i] = 1;
      spacing[i] = (gapP[i] + gapN[i]) / 2;
    } else spacing[i] = Math.min(gapP[i], gapN[i]);
  }
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const linked = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!strong[i]) continue;
    for (const j of [nbP[i], nbN[i]]) {
      if (j < 0 || !Number.isFinite(spacing[j]) || !same(spacing[i], spacing[j])) continue;
      parent[find(i)] = find(j);
      linked[i] = linked[j] = 1;
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) if (linked[i]) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i); else groups.set(r, [i]);
  }
  const hatch = new Uint8Array(n);
  const cluster = new Int32Array(n).fill(-1);
  const patterns: HatchInfo["patterns"] = new Map();
  for (const [r, members] of groups) {
    if (members.length < MIN_HATCH_LINES) continue;
    const sp = members.map((i) => spacing[i]).sort((a, b) => a - b)[Math.floor(members.length / 2)];
    for (const i of members) { hatch[i] = 1; cluster[i] = r; }
    patterns.set(r, { angle: ang[members[0]], spacing: sp, members });
  }
  return { hatch, cluster, patterns };
}

// ── Planar graph and face tracing ────────────────────────────────────────────

function segIntersect(s: Segment, t: Segment): [number, number] | null {
  const d1x = s.b.x - s.a.x, d1y = s.b.y - s.a.y, d2x = t.b.x - t.a.x, d2y = t.b.y - t.a.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const u = ((t.a.x - s.a.x) * d2y - (t.a.y - s.a.y) * d2x) / den;
  const v = ((t.a.x - s.a.x) * d1y - (t.a.y - s.a.y) * d1x) / den;
  if (u < -1e-9 || u > 1 + 1e-9 || v < -1e-9 || v > 1 + 1e-9) return null;
  return [Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))];
}

/** Parameter of the projection of p on s, and its distance. */
function project(p: Pt, s: Segment): { t: number; d: number } {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2)) : 0;
  return { t, d: Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy)) };
}

interface Graph { pts: Pt[]; adj: number[][] }

/** Nodes the segments into a planar graph; points closer than `gap` merge, ends near a line join it. */
function buildGraph(segs: Segment[], gap: number): Graph {
  const pts: Pt[] = [];
  const vcell = Math.max(gap, 1e-6);
  const vgrid = new Map<string, number[]>();
  const vertexAt = (q: Pt): number => {
    const cx = Math.floor(q.x / vcell), cy = Math.floor(q.y / vcell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const v of vgrid.get(`${cx + dx}:${cy + dy}`) ?? []) {
        if (Math.hypot(pts[v].x - q.x, pts[v].y - q.y) <= gap) return v;
      }
    }
    pts.push(q);
    const k = `${cx}:${cy}`;
    const list = vgrid.get(k);
    if (list) list.push(pts.length - 1); else vgrid.set(k, [pts.length - 1]);
    return pts.length - 1;
  };

  const ts = segs.map(() => [0, 1]);
  const grid = new SegGrid(segs, Math.max(8, gap * 4));
  for (let i = 0; i < segs.length; i++) {
    for (const j of grid.nearSegment(segs[i])) {
      if (j <= i) continue;
      const x = segIntersect(segs[i], segs[j]);
      if (x) { ts[i].push(x[0]); ts[j].push(x[1]); }
      // Close small gaps: an end of one line that stops just short of (or just past) another.
      for (const [from, to] of [[i, j], [j, i]] as const) {
        for (const e of [segs[from].a, segs[from].b]) {
          const pr = project(e, segs[to]);
          if (pr.d <= gap && pr.t > 0 && pr.t < 1) ts[to].push(pr.t);
        }
      }
    }
  }
  const edgeSet = new Set<string>();
  const adj: number[][] = [];
  const addEdge = (u: number, v: number) => {
    if (u === v) return;
    const k = u < v ? `${u}:${v}` : `${v}:${u}`;
    if (edgeSet.has(k)) return;
    edgeSet.add(k);
    (adj[u] ??= []).push(v);
    (adj[v] ??= []).push(u);
  };
  segs.forEach((s, i) => {
    const list = [...new Set(ts[i])].sort((a, b) => a - b);
    let prev = vertexAt(s.a);
    for (let k = 1; k < list.length; k++) {
      const t = list[k];
      const v = vertexAt({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t });
      addEdge(prev, v);
      prev = v;
    }
  });
  for (let v = 0; v < pts.length; v++) adj[v] ??= [];
  // Prune dead ends (text strokes, leader lines, open polylines) so faces close cleanly.
  const deg = adj.map((a) => a.length);
  const queue = deg.flatMap((d, v) => (d === 1 ? [v] : []));
  const removed = new Uint8Array(pts.length);
  while (queue.length) {
    const v = queue.pop()!;
    if (removed[v] || deg[v] > 1) continue;
    removed[v] = 1;
    for (const w of adj[v]) if (!removed[w]) { deg[w]--; if (deg[w] === 1) queue.push(w); }
  }
  for (let v = 0; v < pts.length; v++) adj[v] = removed[v] ? [] : adj[v].filter((w) => !removed[w]);
  return { pts, adj };
}

export function signedArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Walks the face to the left of the directed edge u→v (turning the sharpest way at each vertex). */
function walkFace(g: Graph, u: number, v: number): number[] | null {
  const out: number[] = [u];
  let a = u, b = v;
  for (let step = 0; step < 50_000; step++) {
    const back = Math.atan2(g.pts[a].y - g.pts[b].y, g.pts[a].x - g.pts[b].x);
    let best = -1, bestTurn = Infinity;
    for (const w of g.adj[b]) {
      let turn = back - Math.atan2(g.pts[w].y - g.pts[b].y, g.pts[w].x - g.pts[b].x);
      turn = ((turn % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (turn < 1e-12) turn = 2 * Math.PI;
      if (turn < bestTurn) { bestTurn = turn; best = w; }
    }
    if (best < 0) return null;
    a = b; b = best;
    if (a === u && b === v) return out;
    out.push(a);
  }
  return null;
}

/** Drops vertices that lie on a straight run (left over from noding). */
function simplify(poly: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[(i - 1 + poly.length) % poly.length], q = poly[i], r = poly[(i + 1) % poly.length];
    const cross = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
    const scale = Math.hypot(q.x - p.x, q.y - p.y) * Math.hypot(r.x - q.x, r.y - q.y);
    if (Math.abs(cross) > 1e-6 * scale) out.push(q);
  }
  return out.length >= 3 ? out : poly;
}

/** The bounded face containing p, from a ray cast to the right; null when p is not enclosed. */
function faceAt(g: Graph, p: Pt): Pt[] | null {
  const py = p.y + 1e-7;
  const hits: { x: number; u: number; v: number }[] = [];
  for (let u = 0; u < g.pts.length; u++) for (const v of g.adj[u]) {
    if (v < u) continue;
    const a = g.pts[u], b = g.pts[v];
    if ((a.y - py) * (b.y - py) >= 0) continue;
    const x = a.x + ((py - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (x > p.x) hits.push({ x, u, v });
  }
  hits.sort((h, k) => h.x - k.x);
  // The nearest boundary may belong to an island inside the area (a column, text); walking it from
  // outside gives a negative face, so try the next hit.
  for (const h of hits.slice(0, 40)) {
    const a = g.pts[h.u], b = g.pts[h.v];
    const left = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0;
    const ids = left ? walkFace(g, h.u, h.v) : walkFace(g, h.v, h.u);
    if (!ids || ids.length < 3) continue;
    const poly = ids.map((i) => g.pts[i]);
    if (signedArea(poly) > 0 && pointInPolygon(p, poly)) return simplify(poly);
  }
  return null;
}

export interface PickOptions {
  /** Gaps up to this size (page units) are closed. */
  gap?: number;
  /** Hatch info for the segments; hatch lines are ignored. */
  hatches?: HatchInfo | null;
  /** Search windows (half-size, page units), tried in order until the area fits inside one. */
  windows?: number[];
}

const DEFAULT_WINDOWS = [120, 400, 1200, 5000];
/** Page-wide grid per segment list, built on the first pick. */
const pageGrids = new WeakMap<Segment[], SegGrid>();

/**
 * The closed area around p traced from the segments, or null when p is not enclosed. The search
 * window grows until the found area lies inside it, so lines outside the window cannot change it.
 */
export function pickRegion(segs: Segment[], p: Pt, opts: PickOptions = {}): Pt[] | null {
  const gap = opts.gap ?? 0.5;
  let grid = pageGrids.get(segs);
  if (!grid) { grid = new SegGrid(segs, 32); pageGrids.set(segs, grid); }
  for (const r of opts.windows ?? DEFAULT_WINDOWS) {
    const ids = [...grid.inBox(p.x - r, p.y - r, p.x + r, p.y + r)].filter((i) => !opts.hatches?.hatch[i]);
    if (!ids.length) continue;
    const poly = faceAt(buildGraph(ids.map((i) => segs[i]), gap), p);
    if (!poly) continue;
    const inside = poly.every((q) => q.x > p.x - r && q.x < p.x + r && q.y > p.y - r && q.y < p.y + r);
    if (inside) return poly;
  }
  return null;
}

/** The hatch cluster of the hatch line nearest p (within tolerance), or null. */
export function hatchAt(segs: Segment[], hatches: HatchInfo, p: Pt, tolerance: number): number | null {
  let best: number | null = null, bestD = tolerance;
  for (let i = 0; i < segs.length; i++) {
    if (!hatches.hatch[i]) continue;
    const d = project(p, segs[i]).d;
    if (d <= bestD) { bestD = d; best = hatches.cluster[i]; }
  }
  return best;
}

/** The hatch cluster drawn inside an area (a hatch line whose midpoint lies in it), or null. */
export function hatchInside(segs: Segment[], hatches: HatchInfo, poly: Pt[]): number | null {
  for (const [id, c] of hatches.patterns) {
    for (const i of c.members) {
      const s = segs[i];
      if (pointInPolygon({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, poly)) return id;
    }
  }
  return null;
}

/**
 * Every area on the page hatched with the same pattern (angle and spacing) as the cluster.
 * Each hatch line's midpoint seeds a pick unless it already lies in a found area.
 */
export function sameHatchRegions(segs: Segment[], hatches: HatchInfo, clusterId: number, opts: Omit<PickOptions, "hatches"> = {}, limit = 200): Pt[][] {
  const ref = hatches.patterns.get(clusterId);
  if (!ref) return [];
  const match = [...hatches.patterns.values()].filter((c) => {
    const d = Math.abs(c.angle - ref.angle);
    return Math.min(d, 180 - d) <= 1 && Math.abs(c.spacing - ref.spacing) <= 0.12 * Math.max(c.spacing, ref.spacing);
  });
  const found: Pt[][] = [];
  for (const c of match) {
    for (const i of c.members) {
      if (found.length >= limit) return found;
      const s = segs[i];
      const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      if (found.some((f) => pointInPolygon(mid, f))) continue;
      const poly = pickRegion(segs, mid, { ...opts, hatches });
      if (poly) found.push(poly);
    }
  }
  return found;
}
