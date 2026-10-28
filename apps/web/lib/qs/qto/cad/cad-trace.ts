// Trace a layer: every closed boundary drawn on one layer becomes a shape (`pickTraced` keeps the one a picked line bounds). A closed polyline,
// circle or ellipse is taken as drawn, with its exact CAD area (overlapping beams each keep their
// own area, as AutoCAD's AREA gives). Loose lines, arcs and open polylines (exploded outlines, walls
// drawn line by line) are split where they cross or touch, joined end to end within a tolerance,
// and the bounded faces of that planar graph are the areas. A boundary lying wholly inside another
// area is an opening (even-odd, like AutoCAD's normal island detection) unless `islands` is false.
import type { Bounds, Pt } from "./cad-geometry";
import type { CadSheet, SheetObject } from "./cad-sheet";
import type { CadPickKind } from "./cad-select";

/** Entity types that are linework (texts, dimensions, hatches and inserts are not). */
const LINEWORK = new Set(["LINE", "LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE", "ELLIPSE", "SPLINE", "SOLID"]);

export interface TraceOptions {
  /** Joining tolerance in sheet units: ends closer than this meet. */
  tol: number;
  /** Subtract the boundaries inside an area (openings). Default true. */
  islands?: boolean;
}

/** Layers with linework that can be traced, by name. */
export function traceableLayers(sheet: CadSheet): string[] {
  const names = new Set<string>();
  for (const o of sheet.objects) if (LINEWORK.has(o.type)) names.add(o.layer);
  const inserts = new Set(sheet.objects.filter((o) => o.type === "INSERT").map((o) => o.handle));
  for (const p of sheet.prims) if (p.kind === "path" && inserts.has(p.handle)) names.add(p.layer);
  return [...names].sort((a, b) => a.localeCompare(b));
}

const signed = (l: Pt[]) => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p.x * q.y - q.x * p.y; } return a / 2; };
const perim = (l: Pt[]) => l.reduce((t, p, i) => t + Math.hypot(l[(i + 1) % l.length].x - p.x, l[(i + 1) % l.length].y - p.y), 0);
const boxOf = (ls: Pt[][]): Bounds => {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const l of ls) for (const p of l) { b.minX = Math.min(b.minX, p.x); b.minY = Math.min(b.minY, p.y); b.maxX = Math.max(b.maxX, p.x); b.maxY = Math.max(b.maxY, p.y); }
  return b;
};
function pointIn(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function nearEdge(p: Pt, poly: Pt[], tol: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= tol) return true;
  }
  return false;
}

/** One closed area: its boundary (sheet units), exact area and length (drawing units), and the entities drawing that boundary. */
interface Area { poly: Pt[]; outline: Pt[][]; area: number; length: number; own: string[] }

/** A traced shape: `own` lists the entities drawing its boundary (not its openings). */
export type TracedObject = SheetObject & { own?: string[] };
/** A closed object, or a group of joined lines: its areas, its outer boundary and its entities. */
interface Unit { areas: Area[]; outer: Pt[]; handles: string[] }

/** The closed areas drawn on a layer (area tools), or every line on it (length tools). */
export function traceLayer(sheet: CadSheet, layer: string, kind: CadPickKind, opts: TraceOptions): TracedObject[] {
  if (kind === "count") return [];
  if (kind === "length") return sheet.objects.filter((o) => o.layer === layer && LINEWORK.has(o.type) && o.length !== null && o.length > 0);
  const tol = Math.max(opts.tol, 1e-9);
  // Areas and lengths of CAD objects are in drawing units; the outlines are in sheet units.
  const k = sheet.frame.k, k2 = k * k;
  const units: Unit[] = [];
  const open: { pts: Pt[]; handle: string }[] = [];
  const closes = (pts: Pt[], closed: boolean) => pts.length > 2 && (closed || Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= tol);
  for (const o of sheet.objects) {
    if (o.layer !== layer || !LINEWORK.has(o.type)) continue;
    const l = o.outline[0];
    if (o.outline.length === 1 && closes(l, o.closed) && o.area) {
      units.push({ areas: [{ poly: l, outline: o.outline, area: o.area, length: o.length ?? perim(l) / k, own: [o.handle] }], outer: l, handles: [o.handle] });
    } else for (const p of o.outline) if (p.length > 1) open.push({ pts: p, handle: o.handle });
  }
  // Linework inside block inserts that is drawn on the layer (e.g. columns drawn as blocks).
  const inserts = new Set(sheet.objects.filter((o) => o.type === "INSERT").map((o) => o.handle));
  for (const p of sheet.prims) {
    if (p.layer !== layer || p.kind !== "path" || !inserts.has(p.handle) || p.pts.length < 2) continue;
    const a = Math.abs(signed(p.pts));
    if (closes(p.pts, p.closed) && a > tol * tol) units.push({ areas: [{ poly: p.pts, outline: [p.pts], area: a / k2, length: perim(p.pts) / k, own: [p.handle] }], outer: p.pts, handles: [p.handle] });
    else open.push({ pts: p.pts, handle: p.handle });
  }
  units.push(...joinLines(open, tol, k));

  // Openings: a unit wholly inside a larger area of another unit (touching its boundary counts as
  // inside, e.g. internal walls against the inner face of a core wall). Depth counts the areas around it.
  const all = units.flatMap((u, ui) => u.areas.map((a) => ({ ui, a, box: boxOf([a.poly]) })));
  const sizes = units.map((u) => Math.abs(signed(u.outer)));
  const inside = (u: Unit, a: Area, box: Bounds) => {
    const size = Math.abs(signed(a.poly));
    return sizes[units.indexOf(u)] < size - tol * tol && u.outer.every((p) => p.x >= box.minX - tol && p.x <= box.maxX + tol
      && p.y >= box.minY - tol && p.y <= box.maxY + tol && (pointIn(p, a.poly) || nearEdge(p, a.poly, tol)));
  };
  const depth = units.map((u, ui) => all.filter((x) => x.ui !== ui && inside(u, x.a, x.box)).length);
  const islands = opts.islands ?? true;
  const out: TracedObject[] = [];
  all.forEach(({ ui, a, box }) => {
    const d = depth[ui];
    if (islands && d % 2 === 1) return;
    const holes = islands ? units.filter((h, hi) => hi !== ui && depth[hi] === d + 1 && inside(h, a, box)) : [];
    const holeArea = holes.reduce((t, h) => t + (h.areas.length === 1 ? h.areas[0].area : Math.abs(signed(h.outer)) / k2), 0);
    const outline = [...a.outline, ...holes.map((h) => h.outer)];
    out.push({
      handle: `trace:${layer}:${out.length + 1}`,
      type: "LWPOLYLINE",
      layer,
      closed: true,
      area: Math.max(0, a.area - holeArea),
      length: a.length + holes.reduce((t, h) => t + (h.areas.length === 1 ? h.areas[0].length : perim(h.outer) / k), 0),
      outline,
      box: boxOf(outline),
      handles: [...new Set([...units[ui].handles, ...holes.flatMap((h) => h.handles)])],
      own: a.own,
    });
  });
  return out;
}

/** Joins loose linework into closed areas: one unit per connected group of lines. */
function joinLines(pieces: { pts: Pt[]; handle: string }[], tol: number, k: number): Unit[] {
  const k2 = k * k;
  // 1. Segments, each remembering its piece.
  const segs: { a: Pt; b: Pt; src: number; ts: number[] }[] = [];
  pieces.forEach((pc, src) => {
    for (let i = 1; i < pc.pts.length; i++) {
      const a = pc.pts[i - 1], b = pc.pts[i];
      if (Math.hypot(b.x - a.x, b.y - a.y) > tol * 1e-3) segs.push({ a, b, src, ts: [] });
    }
  });
  if (!segs.length) return [];

  // 2. Split where segments cross, and where an end touches (or nearly touches) another segment.
  const ext = boxOf(segs.map((s) => [s.a, s.b]));
  const cell = Math.max((ext.maxX - ext.minX + ext.maxY - ext.minY) / 400, tol * 4);
  const grid = new Map<string, number[]>();
  segs.forEach((s, i) => {
    const x0 = Math.floor((Math.min(s.a.x, s.b.x) - tol) / cell), x1 = Math.floor((Math.max(s.a.x, s.b.x) + tol) / cell);
    const y0 = Math.floor((Math.min(s.a.y, s.b.y) - tol) / cell), y1 = Math.floor((Math.max(s.a.y, s.b.y) + tol) / cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = `${x},${y}`;
      const list = grid.get(key);
      if (list) list.push(i); else grid.set(key, [i]);
    }
  });
  const nearOn = (p: Pt, s: { a: Pt; b: Pt }) => {
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l2 = dx * dx + dy * dy;
    const t = ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2;
    if (t <= 0 || t >= 1) return null;
    return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy)) <= tol ? t : null;
  };
  const seen = new Set<number>();
  for (const list of grid.values()) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const i = Math.min(list[x], list[y]), j = Math.max(list[x], list[y]);
      const key = i * segs.length + j;
      if (seen.has(key)) continue;
      seen.add(key);
      const s = segs[i], r = segs[j];
      const d1x = s.b.x - s.a.x, d1y = s.b.y - s.a.y, d2x = r.b.x - r.a.x, d2y = r.b.y - r.a.y;
      const den = d1x * d2y - d1y * d2x;
      if (Math.abs(den) > 1e-12) {
        const t = ((r.a.x - s.a.x) * d2y - (r.a.y - s.a.y) * d2x) / den;
        const u = ((r.a.x - s.a.x) * d1y - (r.a.y - s.a.y) * d1x) / den;
        if (t > 0 && t < 1 && u > 0 && u < 1) { s.ts.push(t); r.ts.push(u); continue; }
      }
      for (const [p, on] of [[s.a, r], [s.b, r], [r.a, s], [r.b, s]] as const) {
        const t = nearOn(p, on);
        if (t !== null) on.ts.push(t);
      }
    }
  }

  // 3. Nodes (points within tol merge) and undirected edges.
  const nodes: Pt[] = [];
  const nodeGrid = new Map<string, number[]>();
  const nodeOf = (p: Pt) => {
    const cx = Math.floor(p.x / tol), cy = Math.floor(p.y / tol);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
      for (const n of nodeGrid.get(`${x},${y}`) ?? []) if (Math.hypot(nodes[n].x - p.x, nodes[n].y - p.y) <= tol) return n;
    }
    nodes.push(p);
    const key = `${cx},${cy}`;
    const list = nodeGrid.get(key);
    if (list) list.push(nodes.length - 1); else nodeGrid.set(key, [nodes.length - 1]);
    return nodes.length - 1;
  };
  const edges = new Map<string, { u: number; v: number; srcs: Set<number> }>();
  for (const s of segs) {
    const ts = [0, ...s.ts.sort((a, b) => a - b), 1];
    let prev = nodeOf(s.a);
    for (let i = 1; i < ts.length; i++) {
      const t = ts[i];
      const n = t === 1 ? nodeOf(s.b) : nodeOf({ x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) });
      if (n !== prev) {
        const key = prev < n ? `${prev}-${n}` : `${n}-${prev}`;
        const e = edges.get(key);
        if (e) e.srcs.add(s.src); else edges.set(key, { u: Math.min(prev, n), v: Math.max(prev, n), srcs: new Set([s.src]) });
      }
      prev = n;
    }
  }

  // 4. Drop dangling ends (lines that close nothing), repeatedly.
  const adj = nodes.map(() => new Set<number>());
  for (const e of edges.values()) { adj[e.u].add(e.v); adj[e.v].add(e.u); }
  const stack = adj.map((s, i) => (s.size === 1 ? i : -1)).filter((i) => i >= 0);
  while (stack.length) {
    const n = stack.pop()!;
    if (adj[n].size !== 1) continue;
    const m = [...adj[n]][0];
    adj[n].delete(m); adj[m].delete(n);
    if (adj[m].size === 1) stack.push(m);
  }

  // 5. Faces: walk each directed edge, turning to the next edge clockwise from the one arrived on.
  // Bounded faces come out with a positive signed area, a group's outer boundary negative.
  const angle = (n: number, m: number) => Math.atan2(nodes[m].y - nodes[n].y, nodes[m].x - nodes[n].x);
  const order = adj.map((s, n) => [...s].sort((a, b) => angle(n, a) - angle(n, b)));
  const comp = nodes.map((_, i) => i);
  const find = (i: number): number => (comp[i] === i ? i : (comp[i] = find(comp[i])));
  for (let n = 0; n < nodes.length; n++) for (const m of adj[n]) comp[find(n)] = find(m);
  const used = new Set<string>();
  const groups = new Map<number, { bounded: { poly: Pt[]; srcs: Set<number> }[]; outer: Pt[] | null; srcs: Set<number> }>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (let n = 0; n < nodes.length; n++) {
    for (const m of order[n]) {
      if (used.has(`${n}>${m}`)) continue;
      const ids: number[] = [];
      const srcs = new Set<number>();
      let u = n, v = m;
      while (!used.has(`${u}>${v}`)) {
        used.add(`${u}>${v}`);
        ids.push(u);
        for (const sr of edges.get(edgeKey(u, v))?.srcs ?? []) srcs.add(sr);
        const around = order[v];
        const w = around[(around.indexOf(u) - 1 + around.length) % around.length];
        u = v; v = w;
      }
      const poly = ids.map((i) => nodes[i]);
      const a = signed(poly);
      if (Math.abs(a) <= tol * tol) continue;
      const g = groups.get(find(n)) ?? { bounded: [], outer: null, srcs: new Set<number>() };
      if (a > 0) g.bounded.push({ poly, srcs }); else g.outer = poly;
      groups.set(find(n), g);
    }
  }
  for (const e of edges.values()) if (adj[e.u].has(e.v)) for (const s of e.srcs) groups.get(find(e.u))?.srcs.add(s);

  return [...groups.values()].filter((g) => g.bounded.length).map((g) => ({
    areas: g.bounded.map(({ poly, srcs }) => ({ poly, outline: [poly], area: signed(poly) / k2, length: perim(poly) / k, own: [...new Set([...srcs].map((sr) => pieces[sr].handle))] })),
    outer: g.outer ?? g.bounded[0].poly,
    handles: [...new Set([...g.srcs].map((s) => pieces[s].handle))],
  }));
}

/**
 * The traced shape for one picked line (from `traceLayer` of its layer). Areas: the closed area
 * that line bounds; a line between two areas gives the one on the cursor's side, and a line of an
 * opening gives the area around it. Lengths: the chain of lines joined end to end with it.
 */
export function pickTraced(traced: TracedObject[], picked: SheetObject, p: Pt, kind: CadPickKind, tol: number): TracedObject[] {
  if (kind === "count") return [];
  if (kind === "length") return chainOf(traced, picked.handle, Math.max(tol, 1e-9));
  const own = traced.filter((o) => o.own?.includes(picked.handle));
  const cands = own.length ? own : traced.filter((o) => o.handles?.includes(picked.handle));
  if (!cands.length) return [];
  // The area around the cursor wins, then the one whose boundary is nearest it, then the smaller one.
  const around = (o: TracedObject) => pointIn(p, o.outline[0]) && !o.outline.slice(1).some((h) => pointIn(p, h));
  const scored = cands.map((o) => ({ o, in: around(o), d: distTo(p, o.outline[0]) }));
  const best = scored.reduce((b, x) => {
    if (x.in !== b.in) return x.in ? x : b;
    if (Math.abs(x.d - b.d) > tol) return x.d < b.d ? x : b;
    return (x.o.area ?? 0) < (b.o.area ?? 0) ? x : b;
  });
  return [best.o];
}

/** Distance from p to a closed boundary. */
function distTo(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/** The lines joined end to end (ends within `tol`) with the line `handle`. */
function chainOf(lines: SheetObject[], handle: string, tol: number): SheetObject[] {
  const start = lines.findIndex((o) => o.handle === handle);
  if (start < 0) return [];
  const ends = lines.map((o) => o.outline.filter((l) => l.length).flatMap((l) => [l[0], l[l.length - 1]]));
  const cellOf = (q: Pt) => [Math.floor(q.x / tol), Math.floor(q.y / tol)];
  const grid = new Map<string, number[]>();
  ends.forEach((es, i) => es.forEach((q) => {
    const [x, y] = cellOf(q);
    const list = grid.get(`${x},${y}`);
    if (list) list.push(i); else grid.set(`${x},${y}`, [i]);
  }));
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    for (const q of ends[i]) {
      const [cx, cy] = cellOf(q);
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
        for (const j of grid.get(`${x},${y}`) ?? []) {
          if (seen.has(j) || !ends[j].some((r) => Math.hypot(r.x - q.x, r.y - q.y) <= tol)) continue;
          seen.add(j);
          stack.push(j);
        }
      }
    }
  }
  return lines.filter((_, i) => seen.has(i));
}
