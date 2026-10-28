// A CAD model as a "sheet" for the drawing viewer: the viewer works in page-like units (y down,
// origin top-left, a few hundred to a few thousand units across), the same as a PDF page. Model
// coordinates map to sheet units by a power-of-ten scale k, so the automatic calibration is exact
// (mm drawing, k = 0.01 → 0.1 m per sheet unit). The frame is stored with the revision so saved
// points never move.
import type { Segment } from "../pdf-snap";
import type { Bounds, CadModel, CadObject, CadPrim, Pt } from "./cad-geometry";

export interface CadFrame { ox: number; oy: number; k: number }

/** Frame for model bounds: origin at the top-left corner, sheet 200–2,000 units across. */
export function frameFor(b: Bounds): CadFrame {
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1e-9);
  const k = 10 ** -Math.ceil(Math.log10(size / 2000));
  return { ox: Math.floor(b.minX), oy: Math.ceil(b.maxY), k };
}

export const toSheet = (f: CadFrame, p: Pt): Pt => ({ x: (p.x - f.ox) * f.k, y: (f.oy - p.y) * f.k });
export const toModel = (f: CadFrame, p: Pt): Pt => ({ x: p.x / f.k + f.ox, y: f.oy - p.y / f.k });

export interface SheetPrim extends Omit<CadPrim, "pts" | "loops" | "pattern"> {
  pts: Pt[];
  loops?: Pt[][];
  /** Pattern line families in sheet units: direction angle (radians), a point, the step between lines, dashes. */
  pattern?: { angle: number; base: Pt; step: Pt; dashes: number[] }[];
  /** Sheet-unit bounding box (culling). */
  box: Bounds;
}

export interface SheetObject extends Omit<CadObject, "outline" | "at" | "bounds"> {
  outline: Pt[][];
  at?: Pt;
  box: Bounds;
  /** The entities a traced shape was built from (a traced area can join many lines). */
  handles?: string[];
}

export interface CadSheet {
  frame: CadFrame;
  /** Sheet size (units), from the origin to the far corner of the model. */
  size: { w: number; h: number };
  /** Metres per sheet unit (null when the drawing has no units). */
  metresPerUnit: number | null;
  prims: SheetPrim[];
  objects: SheetObject[];
  /** Lines to snap to and pick areas from, with the layer of each. */
  segments: Segment[];
  segmentLayers: string[];
  model: Pick<CadModel, "layers" | "skipped" | "version" | "insUnits" | "metresPerUnit" | "bounds" | "view">;
}

function box(loops: Pt[][]): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const l of loops) for (const p of l) {
    if (p.x < b.minX) b.minX = p.x; if (p.y < b.minY) b.minY = p.y;
    if (p.x > b.maxX) b.maxX = p.x; if (p.y > b.maxY) b.maxY = p.y;
  }
  return b;
}

export function buildSheet(model: CadModel, frame: CadFrame = frameFor(model.view)): CadSheet {
  const S = (p: Pt) => toSheet(frame, p);
  const prims: SheetPrim[] = model.prims.map((p) => {
    const pts = p.pts.map(S);
    const loops = p.loops?.map((l) => l.map(S));
    const pattern = p.pattern?.map((pl) => {
      const a = (pl.angle * Math.PI) / 180;
      return { angle: -a, base: S(pl.base), step: { x: pl.offset.x * frame.k, y: -pl.offset.y * frame.k }, dashes: pl.dashes.map((d) => d * frame.k) };
    });
    const text = p.text ? { ...p.text, height: p.text.height * frame.k, rotation: -p.text.rotation } : undefined;
    return { ...p, pts, loops, pattern, text, box: box(loops ?? [pts]) };
  });
  const objects: SheetObject[] = model.objects.map((o) => {
    const outline = o.outline.map((l) => l.map(S));
    return { ...o, outline, at: o.at ? S(o.at) : undefined, box: box(outline) };
  });
  const segments: Segment[] = [];
  const segmentLayers: string[] = [];
  for (const p of prims) {
    if (p.kind !== "path" && p.kind !== "fill") continue;
    const pts = p.closed && p.pts.length > 2 ? [...p.pts, p.pts[0]] : p.pts;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i - 1].x === pts[i].x && pts[i - 1].y === pts[i].y) continue;
      segments.push({ a: pts[i - 1], b: pts[i] });
      segmentLayers.push(p.layer);
    }
  }
  const far = S({ x: model.view.maxX, y: model.view.minY });
  return {
    frame,
    size: { w: Math.max(1, far.x), h: Math.max(1, far.y) },
    metresPerUnit: model.metresPerUnit === null ? null : model.metresPerUnit / frame.k,
    prims, objects, segments, segmentLayers,
    model: { layers: model.layers, skipped: model.skipped, version: model.version, insUnits: model.insUnits, metresPerUnit: model.metresPerUnit, bounds: model.bounds, view: model.view },
  };
}

// ── Drawing ──────────────────────────────────────────────────────────────────

export interface SheetView { zoom: number; x: number; y: number; offset: number }

/**
 * Draws the visible part of the sheet on a viewport-sized canvas. Screen = offset + view.x/y +
 * sheet × zoom (CSS pixels); `dpr` is the canvas pixel ratio.
 */
export function drawSheet(ctx: CanvasRenderingContext2D, sheet: CadSheet, view: SheetView, opts: { width: number; height: number; dpr: number; ink: string; hidden: Set<string> }) {
  const { zoom } = view;
  const tx = view.offset + view.x, ty = view.offset + view.y;
  ctx.setTransform(opts.dpr, 0, 0, opts.dpr, 0, 0);
  ctx.clearRect(0, 0, opts.width, opts.height);
  // Visible sheet rectangle.
  const vx0 = -tx / zoom, vy0 = -ty / zoom, vx1 = (opts.width - tx) / zoom, vy1 = (opts.height - ty) / zoom;
  const visible = (b: Bounds) => b.maxX >= vx0 && b.minX <= vx1 && b.maxY >= vy0 && b.minY <= vy1;
  const px = 1 / zoom;
  const colorOf = (c: string) => (c === "ink" ? opts.ink : c);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.save();
  ctx.setTransform(opts.dpr * zoom, 0, 0, opts.dpr * zoom, opts.dpr * tx, opts.dpr * ty);
  ctx.lineWidth = px;
  // Batch paths per colour.
  const paths = new Map<string, Path2D>();
  const fills = new Map<string, Path2D>();
  for (const p of opts.hidden.size ? sheet.prims.filter((q) => !opts.hidden.has(q.layer)) : sheet.prims) {
    if (!visible(p.box)) continue;
    const color = colorOf(p.color);
    if (p.kind === "path" || p.kind === "fill") {
      if (p.box.maxX - p.box.minX < px && p.box.maxY - p.box.minY < px) continue;
      const target = p.kind === "fill" ? fills : paths;
      let path = target.get(color);
      if (!path) { path = new Path2D(); target.set(color, path); }
      path.moveTo(p.pts[0].x, p.pts[0].y);
      for (let i = 1; i < p.pts.length; i++) path.lineTo(p.pts[i].x, p.pts[i].y);
      if (p.closed) path.closePath();
    } else if (p.kind === "hatch" && p.loops) {
      drawHatch(ctx, p, color, zoom);
    } else if (p.kind === "point") {
      ctx.fillStyle = color;
      ctx.fillRect(p.pts[0].x - px, p.pts[0].y - px, 2 * px, 2 * px);
    }
  }
  for (const [color, path] of fills) { ctx.fillStyle = color; ctx.fill(path); }
  for (const [color, path] of paths) { ctx.strokeStyle = color; ctx.stroke(path); }
  ctx.restore();

  // Text in screen space (font sizes in pixels).
  ctx.setTransform(opts.dpr, 0, 0, opts.dpr, 0, 0);
  ctx.textBaseline = "alphabetic";
  for (const p of sheet.prims) {
    if (p.kind !== "text" || !p.text || opts.hidden.has(p.layer)) continue;
    const size = p.text.height * zoom;
    if (size < 3) continue;
    const at = p.pts[0];
    const sx = tx + at.x * zoom, sy = ty + at.y * zoom;
    if (sx < -2000 || sy < -2000 || sx > opts.width + 2000 || sy > opts.height + 2000) continue;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((p.text.rotation * Math.PI) / 180);
    ctx.fillStyle = colorOf(p.color);
    ctx.font = `${size.toFixed(1)}px Arial, sans-serif`;
    const align = p.text.align ?? { h: "left", v: "baseline" };
    ctx.textAlign = align.h;
    const lines = p.text.value.split("\n");
    // Vertical anchor: top = first line's top, middle / bottom = the block's middle / bottom.
    const block = (lines.length - 1) * size * 1.25;
    ctx.textBaseline = align.v === "top" ? "top" : align.v === "middle" ? "middle" : align.v === "bottom" ? "bottom" : "alphabetic";
    const y0 = align.v === "middle" ? -block / 2 : align.v === "bottom" ? -block : 0;
    lines.forEach((line, i) => ctx.fillText(line, 0, y0 + i * size * 1.25));
    ctx.restore();
  }
}

/** A hatch: solid fill, or its pattern lines clipped to the boundary (even-odd). */
function drawHatch(ctx: CanvasRenderingContext2D, p: SheetPrim, color: string, zoom: number) {
  const clip = new Path2D();
  for (const l of p.loops!) {
    clip.moveTo(l[0].x, l[0].y);
    for (let i = 1; i < l.length; i++) clip.lineTo(l[i].x, l[i].y);
    clip.closePath();
  }
  if (p.solid || !p.pattern?.length) {
    ctx.fillStyle = color;
    ctx.globalAlpha = p.solid ? 1 : 0.25;
    ctx.fill(clip, "evenodd");
    ctx.globalAlpha = 1;
    return;
  }
  ctx.save();
  ctx.clip(clip, "evenodd");
  ctx.strokeStyle = color;
  const b = p.box;
  for (const pl of p.pattern) {
    const u = { x: Math.cos(pl.angle), y: Math.sin(pl.angle) };
    const n = { x: -u.y, y: u.x };
    // Line j of the family passes through base + j·step (step = offset to the next line).
    const pn = pl.step.x * n.x + pl.step.y * n.y;
    const spacing = Math.abs(pn);
    if (!(spacing > 0)) continue;
    // Too dense to draw line by line: a tint of the hatch colour instead.
    if (spacing * zoom < 1.2) {
      ctx.globalAlpha = 0.45; ctx.fillStyle = color; ctx.fill(clip, "evenodd"); ctx.globalAlpha = 1;
      continue;
    }
    const corners = [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.minX, y: b.maxY }, { x: b.maxX, y: b.maxY }];
    const js = corners.map((c) => ((c.x - pl.base.x) * n.x + (c.y - pl.base.y) * n.y) / pn);
    const j0 = Math.floor(Math.min(...js)) - 1, j1 = Math.ceil(Math.max(...js)) + 1;
    const dashes = pl.dashes.length ? pl.dashes.map((d) => Math.max(Math.abs(d), 0.6 / zoom)) : [];
    const period = dashes.reduce((t, d) => t + d, 0);
    ctx.setLineDash(dashes);
    const path = new Path2D();
    for (let j = j0; j <= j1 && j - j0 < 6000; j++) {
      const o = { x: pl.base.x + pl.step.x * j, y: pl.base.y + pl.step.y * j };
      const along = corners.map((c) => (c.x - o.x) * u.x + (c.y - o.y) * u.y);
      // Start a whole number of dash periods from the line's own origin, so dashes stay in phase.
      let a0 = Math.min(...along) - spacing;
      if (period > 0) a0 = Math.floor(a0 / period) * period;
      const a1 = Math.max(...along) + spacing;
      path.moveTo(o.x + u.x * a0, o.y + u.y * a0);
      path.lineTo(o.x + u.x * a1, o.y + u.y * a1);
    }
    ctx.stroke(path);
    ctx.setLineDash([]);
  }
  ctx.restore();
}
