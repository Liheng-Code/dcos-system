import { describe, expect, it } from "vitest";
import { parseDxf } from "../cad/dxf-parse";
import { buildModel } from "../cad/cad-geometry";
import { buildSheet, toSheet } from "../cad/cad-sheet";
import { deduct, openingsIn, pickTraced, traceLayer, traceOpenings, traceableLayers } from "../cad/cad-trace";
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

  it("picks only the area the picked line encloses, on the cursor's side", () => {
    const s = sheetOf([...lines4("L", "A-RM", 0, 0, 20000, 10000), ...line("P", "A-RM", 8000, -300, 8000, 10300), ...rect("R", "A-RM", 30000, 0, 1000, 1000)]);
    const all = traceLayer(s, "A-RM", "area", { tol: tolOf(s) });
    const obj = (h: string) => s.objects.find((o) => o.handle === h)!;
    const at = (x: number, y: number) => toSheet(s.frame, { x, y });
    const pick = (h: string, x: number, y: number) => pickTraced(all, obj(h), at(x, y), "area", tolOf(s)).map((o) => Math.round(o.area!));
    expect(pick("L1", 2000, 0)).toEqual([80_000_000]);
    expect(pick("L1", 15000, 0)).toEqual([120_000_000]);
    // The partition borders both rooms: the side of the cursor decides.
    expect(pick("P", 7990, 5000)).toEqual([80_000_000]);
    expect(pick("P", 8010, 5000)).toEqual([120_000_000]);
    expect(pick("R", 30000, 500)).toEqual([1_000_000]);
  });

  it("picking the inner face of a core wall gives the wall less its opening", () => {
    const s = sheetOf([...rect("OUT", "A-WALL", 0, 0, 20000, 10000), ...rect("IN", "A-WALL", 300, 300, 19400, 9400)]);
    const p = toSheet(s.frame, { x: 300, y: 5000 });
    const IN = s.objects.find((o) => o.handle === "IN")!;
    const net = pickTraced(traceLayer(s, "A-WALL", "area", { tol: tolOf(s) }), IN, p, "area", tolOf(s));
    expect(net.map((o) => Math.round(o.area!))).toEqual([17_640_000]);
    const own = pickTraced(traceLayer(s, "A-WALL", "area", { tol: tolOf(s), islands: false }), IN, p, "area", tolOf(s));
    expect(own.map((o) => Math.round(o.area!))).toEqual([182_360_000]);
  });

  it("picks a line with every line joined end to end with it, for length tools", () => {
    const s = sheetOf([...lines4("L", "A-WALL", 0, 0, 4000, 3000), ...rect("R", "A-WALL", 10000, 0, 1000, 1000)]);
    const lines = traceLayer(s, "A-WALL", "length", { tol: tolOf(s) });
    const L1 = s.objects.find((o) => o.handle === "L1")!;
    const chain = pickTraced(lines, L1, toSheet(s.frame, { x: 2000, y: 0 }), "length", tolOf(s));
    expect(chain.map((o) => o.handle).sort()).toEqual(["L1", "L2", "L3", "L4"]);
    expect(chain.reduce((t, o) => t + (o.length ?? 0), 0)).toBeCloseTo(14_000, 6);
  });

  it("deducts openings drawn on another layer, picked one by one or all at once", () => {
    // Slab 20 × 10 m on S-SLAB; on OPENING: a polyline box with an X, a box drawn as lines with an X,
    // and a box outside the slab.
    const s = sheetOf([...rect("SLAB", "S-SLAB", 0, 0, 20000, 10000),
      ...rect("O1", "OPENING", 2000, 2000, 1000, 1000), ...line("X1", "OPENING", 2000, 2000, 3000, 3000), ...line("X2", "OPENING", 3000, 2000, 2000, 3000),
      ...lines4("O2", "OPENING", 6000, 2000, 2000, 1000), ...line("Y1", "OPENING", 6000, 2000, 8000, 3000), ...line("Y2", "OPENING", 8000, 2000, 6000, 3000),
      ...rect("OUT", "OPENING", 30000, 0, 1000, 1000)]);
    const tol = tolOf(s);
    const slab = traceLayer(s, "S-SLAB", "area", { tol })[0];
    const ops = traceOpenings(s, "OPENING", { tol });
    const all = openingsIn(ops, slab, tol);
    expect(all.map((o) => Math.round(o.area!)).sort((a, b) => a - b)).toEqual([1_000_000, 2_000_000]);
    // A click on the cross line of the box drawn as lines picks that whole box.
    const at = (x: number, y: number) => toSheet(s.frame, { x, y });
    const one = openingsIn(ops, slab, tol, { handle: "Y1", p: at(6500, 2250) });
    expect(one.map((o) => Math.round(o.area!))).toEqual([2_000_000]);
    // A click on the X inside the polyline box (the X closes nothing) picks the box around the cursor.
    expect(openingsIn(ops, slab, tol, { handle: "X1", p: at(2500, 2500) }).map((o) => o.handles)).toEqual([["O1"]]);
    const net = deduct(slab, all);
    expect(net.area).toBeCloseTo(200_000_000 - 3_000_000, 3);
    expect(net.outline).toHaveLength(3);
    const ring = regionsOf(net)[0].pts;
    const shoelace = Math.abs(ring.reduce((a, p, i) => a + p.x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * p.y, 0)) / 2;
    expect(shoelace / s.frame.k ** 2).toBeCloseTo(197_000_000, 0);
    // An opening is not deducted twice: once deducted it is no longer inside the area.
    expect(openingsIn(ops, net, tol)).toHaveLength(0);
  });

  it("totals every line on the layer for length tools", () => {
    const s = sheetOf([...lines4("L", "A-WALL", 0, 0, 4000, 3000), ...rect("R", "A-WALL", 10000, 0, 1000, 1000), ...line("Z", "OTHER", 0, 0, 99, 0)]);
    const out = traceLayer(s, "A-WALL", "length", { tol: tolOf(s) });
    expect(out.reduce((t, o) => t + (o.length ?? 0), 0)).toBeCloseTo(14_000 + 4_000, 6);
  });
});
