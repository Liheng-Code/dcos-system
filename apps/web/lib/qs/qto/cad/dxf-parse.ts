// ASCII DXF reader for QTO: header, layers, blocks and entities, as plain data. Geometry stays in
// the entity's own coordinates (OCS, block space); cad-geometry.ts places it in the world.
// Unknown entity types are counted, never silently dropped. Binary DXF is rejected.

export interface XY { x: number; y: number }

export interface DxfLayer { name: string; color: number; trueColor: number | null; off: boolean; frozen: boolean }

interface Base {
  handle: string;
  layer: string;
  /** ACI colour: 0 = ByBlock, 256 = ByLayer. */
  color: number;
  trueColor: number | null;
  /** On a paper-space layout (group 67 = 1); model space only is measured. */
  paperSpace: boolean;
  /** Extrusion z < 0: the entity is mirrored (its OCS x axis points to -X). */
  mirrored: boolean;
}

export interface PolyVertex extends XY { bulge: number }

/** Text alignment: horizontal and vertical anchor of the insertion point. */
export interface TextAlign { h: "left" | "center" | "right"; v: "top" | "middle" | "baseline" | "bottom" }

export interface MLeaderLeader {
  /** Where the leader lines meet the landing. */
  connection: XY | null;
  dogleg: { dir: XY; length: number } | null;
  /** Each leader line's vertices, from the arrow end. */
  lines: XY[][];
}

export type HatchEdge =
  | { kind: "line"; a: XY; b: XY }
  | { kind: "arc"; c: XY; r: number; start: number; end: number; ccw: boolean }
  | { kind: "ellipse"; c: XY; major: XY; ratio: number; start: number; end: number; ccw: boolean }
  | { kind: "spline"; degree: number; knots: number[]; control: XY[]; weights: number[] | null; fit: XY[] };

export interface HatchPatternLine { angle: number; base: XY; offset: XY; dashes: number[] }

export interface HatchLoop {
  /** Bit flags (group 92): 1 external, 2 polyline, 16 outermost. */
  flags: number;
  polyline: { vertices: PolyVertex[]; closed: boolean } | null;
  edges: HatchEdge[];
}

export type DxfEntity = Base & (
  | { type: "LINE"; a: XY; b: XY }
  | { type: "LWPOLYLINE"; vertices: PolyVertex[]; closed: boolean }
  | { type: "ARC"; c: XY; r: number; start: number; end: number }
  | { type: "CIRCLE"; c: XY; r: number }
  | { type: "ELLIPSE"; c: XY; major: XY; ratio: number; start: number; end: number }
  | { type: "SPLINE"; degree: number; closed: boolean; knots: number[]; control: XY[]; weights: number[] | null; fit: XY[] }
  | { type: "POINT"; at: XY }
  | { type: "SOLID"; corners: XY[] }
  | { type: "TEXT"; at: XY; height: number; rotation: number; text: string; align: TextAlign }
  | { type: "MTEXT"; at: XY; height: number; rotation: number; text: string; width: number; align: TextAlign }
  /** A multileader: its label (plain text) and leader lines. */
  | { type: "MULTILEADER"; text: string; at: XY | null; height: number; leaders: MLeaderLeader[] }
  | { type: "INSERT"; name: string; at: XY; scale: XY; rotation: number; cols: number; rows: number; colSpacing: number; rowSpacing: number; attribs: { at: XY; height: number; rotation: number; text: string }[] }
  /** The dimension's drawn geometry is its anonymous block, placed at `at` (group 12). */
  | { type: "DIMENSION"; block: string; at: XY }
  | { type: "HATCH"; pattern: string; solid: boolean; angle: number; scale: number; loops: HatchLoop[]; patternLines: HatchPatternLine[] }
);

export interface DxfBlock { name: string; base: XY; entities: DxfEntity[] }

export interface DxfDoc {
  version: string | null;
  /** $INSUNITS (0 = unitless). */
  insUnits: number;
  extMin: XY | null;
  extMax: XY | null;
  layers: Map<string, DxfLayer>;
  blocks: Map<string, DxfBlock>;
  /** Model-space and paper-space entities (see `paperSpace`). */
  entities: DxfEntity[];
  /** Entity types that were not read, with counts. */
  skipped: Record<string, number>;
}

export class DxfError extends Error {}

type Pair = [number, string];

function readPairs(text: string): Pair[] {
  if (text.startsWith("AutoCAD Binary DXF")) throw new DxfError("Binary DXF is not supported. Save the drawing as an ASCII DXF.");
  const lines = text.split(/\r?\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isInteger(code)) throw new DxfError(`Not a DXF file (line ${i + 1})`);
    out.push([code, lines[i + 1]]);
  }
  return out;
}

const num = (v: string | undefined, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

/** Plain text from MTEXT formatting (\P new line, {\f…;}, \H…; etc.). */
export function plainMText(s: string): string {
  return s
    .replace(/\\P/g, "\n")
    .replace(/\\[ACcFfHhQTWw][^;\\{}]*;/g, "")
    .replace(/\\[LlOoKk]/g, "")
    .replace(/\\S([^;]*)[#^/]([^;]*);/g, "$1/$2")
    .replace(/\\~/g, " ")
    .replace(/\\\\/g, "\\")
    .replace(/[{}]/g, "");
}

/** Decodes \U+XXXX escapes used by older DXF versions. */
const unicode = (s: string) => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

/** Reads one entity starting at pairs[i] (the "0 TYPE" pair); returns it and the next index. */
function readEntity(pairs: Pair[], i: number, skipped: Record<string, number>): { entity: DxfEntity | null; next: number } {
  const type = pairs[i][1].trim();
  let j = i + 1;
  const body: Pair[] = [];
  while (j < pairs.length && pairs[j][0] !== 0) body.push(pairs[j++]);
  const g = (code: number) => body.find((p) => p[0] === code)?.[1];
  const base: Base = {
    handle: (g(5) ?? "").trim(),
    layer: (g(8) ?? "0").trim(),
    color: num(g(62), 256),
    trueColor: g(420) !== undefined ? num(g(420)) : null,
    paperSpace: num(g(67)) === 1,
    mirrored: num(g(230), 1) < 0,
  };
  const xy = (cx: number): XY => ({ x: num(g(cx)), y: num(g(cx + 10)) });

  // Old-style POLYLINE: VERTEX entities follow until SEQEND.
  if (type === "POLYLINE") {
    const flags = num(g(70));
    const vertices: PolyVertex[] = [];
    while (j < pairs.length && pairs[j][0] === 0 && pairs[j][1].trim() === "VERTEX") {
      let k = j + 1;
      const v: Pair[] = [];
      while (k < pairs.length && pairs[k][0] !== 0) v.push(pairs[k++]);
      const vf = num(v.find((p) => p[0] === 70)?.[1]);
      if (!(vf & 16)) { // skip spline frame control points
        vertices.push({ x: num(v.find((p) => p[0] === 10)?.[1]), y: num(v.find((p) => p[0] === 20)?.[1]), bulge: num(v.find((p) => p[0] === 42)?.[1]) });
      }
      j = k;
    }
    if (j < pairs.length && pairs[j][1].trim() === "SEQEND") { j++; while (j < pairs.length && pairs[j][0] !== 0) j++; }
    if (flags & (16 | 64)) { skipped["POLYLINE (3D mesh)"] = (skipped["POLYLINE (3D mesh)"] ?? 0) + 1; return { entity: null, next: j }; }
    return { entity: { ...base, type: "LWPOLYLINE", vertices, closed: !!(flags & 1) }, next: j };
  }

  // INSERT with attributes: ATTRIB entities follow until SEQEND.
  const attribs: { at: XY; height: number; rotation: number; text: string }[] = [];
  if (type === "INSERT" && num(g(66)) === 1) {
    while (j < pairs.length && pairs[j][0] === 0 && pairs[j][1].trim() === "ATTRIB") {
      let k = j + 1;
      const a: Pair[] = [];
      while (k < pairs.length && pairs[k][0] !== 0) a.push(pairs[k++]);
      const ag = (c: number) => a.find((p) => p[0] === c)?.[1];
      if (!(num(ag(70)) & 1)) attribs.push({ at: { x: num(ag(10)), y: num(ag(20)) }, height: num(ag(40), 1), rotation: num(ag(50)), text: unicode(ag(1) ?? "") });
      j = k;
    }
    if (j < pairs.length && pairs[j][1].trim() === "SEQEND") { j++; while (j < pairs.length && pairs[j][0] !== 0) j++; }
  }

  let entity: DxfEntity | null = null;
  switch (type) {
    case "LINE": entity = { ...base, type, a: xy(10), b: xy(11) }; break;
    case "LWPOLYLINE": {
      const vertices: PolyVertex[] = [];
      for (const [c, v] of body) {
        if (c === 10) vertices.push({ x: num(v), y: 0, bulge: 0 });
        else if (c === 20 && vertices.length) vertices[vertices.length - 1].y = num(v);
        else if (c === 42 && vertices.length) vertices[vertices.length - 1].bulge = num(v);
      }
      entity = { ...base, type, vertices, closed: !!(num(g(70)) & 1) };
      break;
    }
    case "ARC": entity = { ...base, type, c: xy(10), r: num(g(40)), start: num(g(50)), end: num(g(51)) }; break;
    case "CIRCLE": entity = { ...base, type, c: xy(10), r: num(g(40)) }; break;
    case "ELLIPSE": entity = { ...base, type, c: xy(10), major: xy(11), ratio: num(g(40), 1), start: num(g(41)), end: num(g(42), Math.PI * 2) }; break;
    case "SPLINE": {
      const knots: number[] = [], weights: number[] = [], control: XY[] = [], fit: XY[] = [];
      for (const [c, v] of body) {
        if (c === 40) knots.push(num(v));
        else if (c === 41) weights.push(num(v));
        else if (c === 10) control.push({ x: num(v), y: 0 });
        else if (c === 20 && control.length) control[control.length - 1].y = num(v);
        else if (c === 11) fit.push({ x: num(v), y: 0 });
        else if (c === 21 && fit.length) fit[fit.length - 1].y = num(v);
      }
      entity = { ...base, type, degree: num(g(71), 3), closed: !!(num(g(70)) & 1), knots, control, weights: weights.length === control.length ? weights : null, fit };
      break;
    }
    case "POINT": entity = { ...base, type, at: xy(10) }; break;
    case "SOLID": case "TRACE": {
      // DXF SOLID corner order is 1, 2, 4, 3.
      const c = [xy(10), xy(11), xy(13), xy(12)];
      entity = { ...base, type: "SOLID", corners: c[2].x === c[3].x && c[2].y === c[3].y ? c.slice(0, 3) : c };
      break;
    }
    case "TEXT": {
      const h72 = num(g(72)), v73 = num(g(73));
      const aligned = h72 !== 0 || v73 !== 0;
      const align: TextAlign = {
        h: h72 === 1 || h72 === 4 ? "center" : h72 === 2 ? "right" : "left",
        v: h72 === 4 ? "middle" : v73 === 3 ? "top" : v73 === 2 ? "middle" : v73 === 1 ? "bottom" : "baseline",
      };
      entity = { ...base, type, at: aligned && g(11) !== undefined ? xy(11) : xy(10), height: num(g(40), 1), rotation: num(g(50)), text: unicode(g(1) ?? ""), align };
      break;
    }
    case "MTEXT": {
      const text = body.filter((p) => p[0] === 3 || p[0] === 1).map((p) => p[1]).join("");
      const dir = g(11) !== undefined ? Math.atan2(num(g(21)), num(g(11))) * 180 / Math.PI : num(g(50));
      entity = { ...base, type, at: xy(10), height: num(g(40), 1), rotation: dir, text: plainMText(unicode(text)), width: num(g(41)), align: mtextAlign(num(g(71), 1)) };
      break;
    }
    case "MULTILEADER": entity = { ...base, ...readMLeader(body) }; break;
    case "INSERT":
      entity = {
        ...base, type, name: (g(2) ?? "").trim(), at: xy(10), scale: { x: num(g(41), 1), y: num(g(42), 1) }, rotation: num(g(50)),
        cols: Math.max(1, num(g(70), 1)), rows: Math.max(1, num(g(71), 1)), colSpacing: num(g(44)), rowSpacing: num(g(45)), attribs,
      };
      break;
    case "DIMENSION": entity = { ...base, type, block: (g(2) ?? "").trim(), at: xy(12) }; break;
    case "HATCH": entity = { ...base, ...readHatch(body) }; break;
    default: skipped[type] = (skipped[type] ?? 0) + 1;
  }
  return { entity, next: j };
}

/** MTEXT attachment point (1 top-left … 9 bottom-right) as an alignment. */
function mtextAlign(a: number): TextAlign {
  const col = (a - 1) % 3, row = Math.floor((a - 1) / 3);
  return { h: col === 1 ? "center" : col === 2 ? "right" : "left", v: row === 0 ? "top" : row === 1 ? "middle" : "bottom" };
}

/** MULTILEADER context data: label text, its position and height, and the leaders. */
function readMLeader(body: Pair[]): { type: "MULTILEADER"; text: string; at: XY | null; height: number; leaders: MLeaderLeader[] } {
  let text: string | null = null, at: XY | null = null, height = 0;
  let inContext = false, leader: MLeaderLeader | null = null, line: XY[] | null = null;
  const leaders: MLeaderLeader[] = [];
  let doglegDir: XY | null = null;
  for (const [c, raw] of body) {
    const v = raw.trim();
    if (c === 300 && v.startsWith("CONTEXT_DATA")) { inContext = true; continue; }
    if (c === 301) { inContext = false; continue; }
    if (!inContext) continue;
    if (c === 302 && v.startsWith("LEADER")) { leader = { connection: null, dogleg: null, lines: [] }; doglegDir = null; continue; }
    if (c === 303 && leader) { leaders.push(leader); leader = null; continue; }
    if (c === 304 && v.startsWith("LEADER_LINE")) { line = []; continue; }
    if (c === 305 && leader && line) { leader.lines.push(line); line = null; continue; }
    if (line) {
      if (c === 10) line.push({ x: num(v), y: 0 });
      else if (c === 20 && line.length) line[line.length - 1].y = num(v);
      continue;
    }
    if (leader) {
      if (c === 10) leader.connection = { x: num(v), y: 0 };
      else if (c === 20 && leader.connection) leader.connection.y = num(v);
      else if (c === 11) doglegDir = { x: num(v), y: 0 };
      else if (c === 21 && doglegDir) doglegDir.y = num(v);
      else if (c === 40 && doglegDir) leader.dogleg = { dir: doglegDir, length: num(v) };
      continue;
    }
    if (c === 41 && !height) height = num(v);
    else if (c === 304 && text === null) text = plainMText(unicode(raw));
    else if (c === 12 && text !== null && !at) at = { x: num(v), y: 0 };
    else if (c === 22 && at && at.y === 0) at.y = num(v);
  }
  return { type: "MULTILEADER", text: text ?? "", at, height: height || 1, leaders };
}

/** HATCH boundary loops are a sequence; read them with a cursor. */
function readHatch(body: Pair[]): { type: "HATCH"; pattern: string; solid: boolean; angle: number; scale: number; loops: HatchLoop[]; patternLines: HatchPatternLine[] } {
  let k = 0;
  const at = (code: number) => { while (k < body.length && body[k][0] !== code) k++; return k < body.length ? body[k++][1] : undefined; };
  const next = (code: number) => (k < body.length && body[k][0] === code ? body[k++][1] : undefined);
  const pattern = (body.find((p) => p[0] === 2)?.[1] ?? "").trim();
  const solid = num(body.find((p) => p[0] === 70)?.[1]) === 1;
  const loops: HatchLoop[] = [];
  const nLoops = num(at(91));
  for (let l = 0; l < nLoops; l++) {
    const flags = num(at(92));
    if (flags & 2) {
      const hasBulge = num(at(72)) === 1;
      const closed = num(next(73)) === 1;
      const n = num(at(93));
      const vertices: PolyVertex[] = [];
      for (let v = 0; v < n; v++) {
        const x = num(at(10)), y = num(next(20));
        const bulge = hasBulge && k < body.length && body[k][0] === 42 ? num(body[k++][1]) : 0;
        vertices.push({ x, y, bulge });
      }
      loops.push({ flags, polyline: { vertices, closed }, edges: [] });
    } else {
      const nEdges = num(at(93));
      const edges: HatchEdge[] = [];
      for (let e = 0; e < nEdges; e++) {
        const kind = num(at(72));
        if (kind === 1) {
          edges.push({ kind: "line", a: { x: num(at(10)), y: num(next(20)) }, b: { x: num(at(11)), y: num(next(21)) } });
        } else if (kind === 2) {
          const c = { x: num(at(10)), y: num(next(20)) };
          const r = num(at(40)), start = num(at(50)), end = num(at(51)), ccw = num(at(73)) === 1;
          edges.push({ kind: "arc", c, r, start, end, ccw });
        } else if (kind === 3) {
          const c = { x: num(at(10)), y: num(next(20)) };
          const major = { x: num(at(11)), y: num(next(21)) };
          const ratio = num(at(40)), start = num(at(50)), end = num(at(51)), ccw = num(at(73)) === 1;
          edges.push({ kind: "ellipse", c, major, ratio, start, end, ccw });
        } else if (kind === 4) {
          const degree = num(at(94));
          num(next(73)); num(next(74));
          const nk = num(at(95)), nc = num(next(96));
          const knots: number[] = [];
          for (let q = 0; q < nk; q++) knots.push(num(at(40)));
          const control: XY[] = [], w: number[] = [];
          for (let q = 0; q < nc; q++) {
            control.push({ x: num(at(10)), y: num(next(20)) });
            if (k < body.length && body[k][0] === 42) w.push(num(body[k++][1]));
          }
          const fit: XY[] = [];
          if (k < body.length && body[k][0] === 97) {
            const nf = num(body[k++][1]);
            for (let q = 0; q < nf; q++) fit.push({ x: num(at(11)), y: num(next(21)) });
          }
          edges.push({ kind: "spline", degree, knots, control, weights: w.length === control.length ? w : null, fit });
        }
      }
      loops.push({ flags, polyline: null, edges });
    }
    // Source boundary object references (97 count, 330 handles) end each loop.
    if (k < body.length && body[k][0] === 97) { const n = num(body[k++][1]); for (let q = 0; q < n && k < body.length && body[k][0] === 330; q++) k++; }
  }
  const angle = num(body.slice(k).find((p) => p[0] === 52)?.[1]);
  const scale = num(body.slice(k).find((p) => p[0] === 41)?.[1], 1);
  // Pattern definition lines (already scaled and rotated in the file): 53 angle, 43/44 base,
  // 45/46 offset, 79 dash count, 49 dashes.
  const patternLines: HatchPatternLine[] = [];
  const nLines = num(body.slice(k).find((p) => p[0] === 78)?.[1]);
  if (nLines > 0) {
    while (k < body.length && body[k][0] !== 78) k++;
    k++;
    for (let l = 0; l < nLines; l++) {
      const ang = num(at(53));
      const base = { x: num(next(43)), y: num(next(44)) };
      const offset = { x: num(next(45)), y: num(next(46)) };
      const nd = num(next(79));
      const dashes: number[] = [];
      for (let q = 0; q < nd; q++) dashes.push(num(next(49)));
      patternLines.push({ angle: ang, base, offset, dashes });
    }
  }
  return { type: "HATCH", pattern, solid, angle, scale, loops, patternLines };
}

export function parseDxf(text: string): DxfDoc {
  const pairs = readPairs(text.replace(/^﻿/, ""));
  const doc: DxfDoc = { version: null, insUnits: 0, extMin: null, extMax: null, layers: new Map(), blocks: new Map(), entities: [], skipped: {} };
  let section: string | null = null;
  let i = 0;
  while (i < pairs.length) {
    const [code, raw] = pairs[i];
    const v = raw.trim();
    if (code === 0 && v === "SECTION") { section = pairs[i + 1]?.[1].trim() ?? null; i += 2; continue; }
    if (code === 0 && v === "ENDSEC") { section = null; i++; continue; }
    if (code === 0 && v === "EOF") break;

    if (section === "HEADER" && code === 9) {
      const read = (c: number) => pairs.slice(i + 1, i + 5).find((p) => p[0] === c)?.[1];
      if (v === "$ACADVER") doc.version = (read(1) ?? "").trim();
      else if (v === "$INSUNITS") doc.insUnits = num(read(70));
      else if (v === "$EXTMIN") doc.extMin = { x: num(read(10)), y: num(read(20)) };
      else if (v === "$EXTMAX") doc.extMax = { x: num(read(10)), y: num(read(20)) };
      i++;
      continue;
    }
    if (section === "TABLES" && code === 0 && v === "LAYER") {
      let k = i + 1;
      const body: Pair[] = [];
      while (k < pairs.length && pairs[k][0] !== 0) body.push(pairs[k++]);
      const lg = (c: number) => body.find((p) => p[0] === c)?.[1];
      const name = (lg(2) ?? "").trim();
      const color = num(lg(62), 7);
      if (name) doc.layers.set(name, { name, color: Math.abs(color) || 7, trueColor: lg(420) !== undefined ? num(lg(420)) : null, off: color < 0, frozen: !!(num(lg(70)) & 1) });
      i = k;
      continue;
    }
    if (section === "BLOCKS" && code === 0 && v === "BLOCK") {
      let k = i + 1;
      const head: Pair[] = [];
      while (k < pairs.length && pairs[k][0] !== 0) head.push(pairs[k++]);
      const hg = (c: number) => head.find((p) => p[0] === c)?.[1];
      const block: DxfBlock = { name: (hg(2) ?? "").trim(), base: { x: num(hg(10)), y: num(hg(20)) }, entities: [] };
      while (k < pairs.length && !(pairs[k][0] === 0 && pairs[k][1].trim() === "ENDBLK")) {
        if (pairs[k][0] !== 0) { k++; continue; }
        const r = readEntity(pairs, k, doc.skipped);
        if (r.entity) block.entities.push(r.entity);
        k = r.next;
      }
      doc.blocks.set(block.name, block);
      i = k + 1;
      continue;
    }
    if (section === "ENTITIES" && code === 0) {
      const r = readEntity(pairs, i, doc.skipped);
      if (r.entity) doc.entities.push(r.entity);
      i = r.next;
      continue;
    }
    i++;
  }
  return doc;
}
