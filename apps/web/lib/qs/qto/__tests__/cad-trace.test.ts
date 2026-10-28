import { describe, expect, it } from "vitest";
import { parseDxf } from "../cad/dxf-parse";
import { buildModel } from "../cad/cad-geometry";
import { buildSheet } from "../cad/cad-sheet";
import { traceLayer, traceableLayers } from "../cad/cad-trace";
import { regionsOf } from "../cad/cad-select";

const dxf = (entities: (string | number)[]) =>
  [0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, 4, 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES", ...entities, 0, "ENDSEC", 0, "EOF"].join("\n");
const line = (h: string, layer: string, x1: number, y1: number, x2: number, y2: number) => [0, "LINE", 5, h, 8, layer, 10, x1, 20, y1, 11, x2, 21, y2];
const rect = (h: string, layer: string, x: number, y: number, w: number, hgt: number) =>
  [0, "LWPOLYLINE", 5, h, 8, layer, 90, 4, 70, 1, 10, x, 20, y, 10, x + w, 20, y, 10, x + w, 20, y + hgt, 10, x, 20, y + hgt];
/** A rectangle drawn as four loose lines (an exploded polyline). */
const lines4 = (p: string, layer: string, x: number, y: number, w: number, h: number) => [
  ...line(`${p}1`, layer, x, y, x + w, y), ...line(`${p}2`, layer, x + w, y, x + w, y + h),
  ...line(`${p}3`, layer, x + w, y + h, x, y + h), ...line(`${p}4`, layer, x, y + h, x, y),
];
const sheetOf = (ents: (string | number)[]) => buildSheet(buildModel(parseDxf(dxf(ents))));
/** 2 mm joining tolerance in sheet units. */
const tolOf = (s: ReturnType<typeof sheetOf>) => 2 * s.frame.k;
const sum = (os: { area: number | null }[]) => os.reduce((t, o) => t + (o.area ?? 0), 0);

describe("trace a layer", () => {
  it("joins loose lines into one closed area", () => {
    const s = sheetOf([...lines4("L", "A-SLAB", 0, 0, 20000, 10000), ...line("X", "A-GRID", -500, 5000, 20500, 5000)]);
    const out = traceLayer(s, "A-SLAB", "area", { tol: tolOf(s) });
    expect(out).toHaveLength(1);
    expect(out[0].area).toBeCloseTo(200_000_000, 3);
    expect(out[0].length).toBeCloseTo(60_000, 6);
    expect(out[0].handles?.sort()).toEqual(["L1", "L2", "L3", "L4"]);
    expect(traceableLayers(s)).toEqual(["A-GRID", "A-SLAB"]);
  });

  it("splits areas where lines cross, and drops lines that close nothing", () => {
    // A partition line running past both edges, and a stray line ending in the room.
    const s = sheetOf([...lines4("L", "A-RM", 0, 0, 20000, 10000), ...line("P", "A-RM", 8000, -300, 8000, 10300), ...line("S", "A-RM", 12000, 2000, 15000, 2000)]);
    const out = traceLayer(s, "A-RM", "area", { tol: tolOf(s) });
    expect(out.map((o) => Math.round(o.area!)).sort((a, b) => a - b)).toEqual([80_000_000, 120_000_000]);
  });

  it("closes small drafting gaps within the tolerance", () => {
    const s = sheetOf([
      ...line("a", "W", 0, 0, 9999, 0), ...line("b", "W", 10000, 0.5, 10000, 5000),
      ...line("c", "W", 10000, 5000, 0, 5000), ...line("d", "W", 0, 5000, 0, 1),
    ]);
    const out = traceLayer(s, "W", "area", { tol: tolOf(s) });
    expect(out).toHaveLength(1);
    expect(out[0].area! / 1e6).toBeCloseTo(50, 1);
  });

  it("subtracts openings inside an area, or keeps them as areas of their own", () => {
    const s = sheetOf([...rect("SLAB", "S-SLAB", 0, 0, 20000, 10000), ...rect("OPEN", "S-SLAB", 2000, 2000, 1000, 1000), ...lines4("O2", "S-SLAB", 6000, 2000, 2000, 1000)]);
    const net = traceLayer(s, "S-SLAB", "area", { tol: tolOf(s) });
    expect(net).toHaveLength(1);
    expect(net[0].area).toBeCloseTo(200_000_000 - 1_000_000 - 2_000_000, 3);
    expect(net[0].outline).toHaveLength(3);
    const all = traceLayer(s, "S-SLAB", "area", { tol: tolOf(s), islands: false });
    expect(all).toHaveLength(3);
    expect(sum(all)).toBeCloseTo(203_000_000, 3);
  });

  it("keeps walls touching the inner face of a core wall as areas, not openings", () => {
    // Core wall: outer and inner face (ring 20 × 10 m less 19.4 × 9.4 m); an internal wall spans the inside.
    const s = sheetOf([...rect("OUT", "A-WALL", 0, 0, 20000, 10000), ...rect("IN", "A-WALL", 300, 300, 19400, 9400), ...rect("W", "A-WALL", 300, 5000, 19400, 200)]);
    const out = traceLayer(s, "A-WALL", "area", { tol: tolOf(s) });
    expect(out.map((o) => Math.round(o.area!)).sort((a, b) => a - b)).toEqual([3_880_000, 200_000_000 - 182_360_000]);
    // The ring is saved as one outline that keeps its opening: its own area is the net area.
    const ring = regionsOf(out.find((o) => o.outline.length === 2)!)[0].pts;
    const shoelace = Math.abs(ring.reduce((a, p, i) => a + p.x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * p.y, 0)) / 2;
    expect(shoelace / s.frame.k ** 2).toBeCloseTo(17_640_000, 3);
  });

  it("takes closed polylines as drawn: crossing beams each keep their own area", () => {
    const s = sheetOf([...rect("B1", "S-BEAM", 0, 4000, 10000, 400), ...rect("B2", "S-BEAM", 4000, 0, 400, 10000)]);
    const out = traceLayer(s, "S-BEAM", "area", { tol: tolOf(s) });
    expect(out).toHaveLength(2);
    expect(out.every((o) => o.area === 4_000_000)).toBe(true);
  });

  it("keeps the exact CAD area of a boundary that touches nothing (circle)", () => {
    const s = sheetOf([0, "CIRCLE", 5, "C1", 8, "S-COL", 10, 5000, 20, 5000, 40, 300, ...rect("R", "S-COL", 10000, 0, 800, 800)]);
    const out = traceLayer(s, "S-COL", "area", { tol: tolOf(s) });
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.area!).sort((a, b) => a - b)[0]).toBeCloseTo(Math.PI * 300 * 300, 6);
  });

  it("totals every line on the layer for length tools", () => {
    const s = sheetOf([...lines4("L", "A-WALL", 0, 0, 4000, 3000), ...rect("R", "A-WALL", 10000, 0, 1000, 1000), ...line("Z", "OTHER", 0, 0, 99, 0)]);
    const out = traceLayer(s, "A-WALL", "length", { tol: tolOf(s) });
    expect(out.reduce((t, o) => t + (o.length ?? 0), 0)).toBeCloseTo(14_000 + 4_000, 6);
  });
});
