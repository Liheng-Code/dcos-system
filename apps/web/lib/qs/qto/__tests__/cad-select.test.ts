import { describe, expect, it } from "vitest";
import { parseDxf } from "../cad/dxf-parse";
import { buildModel } from "../cad/cad-geometry";
import { buildSheet, toSheet } from "../cad/cad-sheet";
import { mainLoop, objectAt, regionsOf, similarTo } from "../cad/cad-select";

const dxf = (entities: (string | number)[], blocks: (string | number)[] = []) =>
  [0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, 4, 0, "ENDSEC", 0, "SECTION", 2, "BLOCKS", ...blocks, 0, "ENDSEC",
    0, "SECTION", 2, "ENTITIES", ...entities, 0, "ENDSEC", 0, "EOF"].join("\n");
const rect = (h: string, layer: string, x: number, y: number, w: number, hgt: number) =>
  [0, "LWPOLYLINE", 5, h, 8, layer, 90, 4, 70, 1, 10, x, 20, y, 10, x + w, 20, y, 10, x + w, 20, y + hgt, 10, x, 20, y + hgt];
const hatch = (h: string, layer: string, pattern: string, x: number, y: number, w: number, hgt: number) =>
  [0, "HATCH", 5, h, 8, layer, 2, pattern, 70, 0, 91, 1, 92, 2, 72, 0, 73, 1, 93, 4, 10, x, 20, y, 10, x + w, 20, y, 10, x + w, 20, y + hgt, 10, x, 20, y + hgt, 97, 0, 75, 0, 76, 1, 98, 0];

const ents = [
  ...rect("SLAB", "S-SLAB", 0, 0, 20000, 10000),
  ...rect("B1", "S-BEAM", 1000, 1000, 6000, 400), ...rect("B2", "S-BEAM", 1000, 5000, 6000, 400),
  ...hatch("H1", "S-BEAM", "ANSI33", 1000, 1000, 6000, 400), ...hatch("H2", "S-BEAM", "ANSI33", 1000, 5000, 6000, 400),
  ...hatch("H3", "S-DROP", "ANSI33", 12000, 2000, 2000, 2000),
  0, "LINE", 5, "W1", 8, "A-WALL", 10, 0, 20, 8000, 11, 4000, 21, 8000,
  0, "LINE", 5, "W2", 8, "A-WALL", 10, 5000, 20, 8000, 11, 9000, 21, 8000,
  0, "INSERT", 5, "D1a", 8, "A-DOOR", 2, "D1", 10, 15000, 20, 7000,
  0, "INSERT", 5, "D1b", 8, "A-DOOR", 2, "D1", 10, 17000, 20, 7000,
  0, "INSERT", 5, "D2a", 8, "A-DOOR", 2, "D2", 10, 15000, 20, 9000,
];
const blocks = [0, "BLOCK", 2, "D1", 10, 0, 20, 0, ...rect("d1", "0", 0, 0, 900, 100), 0, "ENDBLK",
  0, "BLOCK", 2, "D2", 10, 0, 20, 0, ...rect("d2", "0", 0, 0, 1200, 100), 0, "ENDBLK"];
const sheet = buildSheet(buildModel(parseDxf(dxf(ents, blocks))));
const at = (x: number, y: number) => toSheet(sheet.frame, { x, y });
const tol = 0.05;

describe("CAD selection", () => {
  it("picks the smallest closed object around the cursor with its exact area", () => {
    const o = objectAt(sheet, at(3000, 1200), "area", tol)!;
    expect(["B1", "H1"]).toContain(o.handle);
    expect(o.area).toBeCloseTo(2_400_000, 6);
    expect(objectAt(sheet, at(10000, 8000), "area", tol)!.handle).toBe("SLAB");
    expect(mainLoop(objectAt(sheet, at(10000, 8000), "area", tol)!)).toHaveLength(4);
  });

  it("selects similar: same layer and type, same hatch pattern + layer", () => {
    const b1 = sheet.objects.find((o) => o.handle === "B1")!;
    expect(similarTo(sheet, b1, "layer", "area").map((o) => o.handle).sort()).toEqual(["B1", "B2"]);
    const h1 = sheet.objects.find((o) => o.handle === "H1")!;
    // H3 has the same pattern on another layer: not included.
    expect(similarTo(sheet, h1, "hatch", "area").map((o) => o.handle).sort()).toEqual(["H1", "H2"]);
  });

  it("picks lines for lengths and totals a layer", () => {
    const w = objectAt(sheet, at(2000, 8000), "length", tol)!;
    expect(w.handle).toBe("W1");
    const all = similarTo(sheet, w, "layer", "length");
    expect(all.reduce((t, o) => t + (o.length ?? 0), 0)).toBe(8000);
  });

  it("counts every insert of the clicked block", () => {
    const d = objectAt(sheet, at(15400, 7050), "count", tol)!;
    expect(d.block).toBe("D1");
    expect(similarTo(sheet, d, "block", "count").map((o) => o.handle).sort()).toEqual(["D1a", "D1b"]);
  });

  it("ignores hidden layers", () => {
    expect(objectAt(sheet, at(2000, 8000), "length", tol, new Set(["A-WALL"]))).toBeNull();
  });

  it("splits a hatch with many boundaries into one shape per area, adding up to the exact area", () => {
    const loop = (x: number, y: number, w: number, h: number) => [92, 3, 72, 0, 73, 1, 93, 4, 10, x, 20, y, 10, x + w, 20, y, 10, x + w, 20, y + h, 10, x, 20, y + h, 97, 0];
    const cols = [0, "HATCH", 5, "COLS", 8, "S-COL", 2, "SOLID", 70, 1, 91, 4,
      ...loop(0, 0, 800, 800), ...loop(5000, 0, 800, 800), ...loop(10000, 0, 1000, 1000),
      ...loop(10200, 200, 200, 200), // island inside the third column
      75, 0, 76, 1, 98, 0];
    const sh = buildSheet(buildModel(parseDxf(dxf(cols))));
    const o = sh.objects.find((x) => x.handle === "COLS")!;
    expect(o.area).toBeCloseTo(640000 * 2 + 1000000 - 40000, 6);
    const parts = regionsOf(o);
    expect(parts).toHaveLength(3);
    expect(parts.reduce((t, p) => t + (p.area ?? 0), 0)).toBeCloseTo(o.area!, 6);
    expect(parts.map((p) => Math.round(p.area!)).sort((a, b) => a - b)).toEqual([640000, 640000, 960000]);
    expect(parts.every((p) => p.pts.length === 4)).toBe(true);
  });
});