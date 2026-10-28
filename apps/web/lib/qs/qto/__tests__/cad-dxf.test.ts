import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { DxfError, parseDxf, plainMText } from "../cad/dxf-parse";
import { buildModel, bulgeSeg, segsArea, segsLength } from "../cad/cad-geometry";
import { metresPerUnit } from "../cad/cad-units";

/** A minimal ASCII DXF from group-code pairs. */
const dxf = (header: (string | number)[], entities: (string | number)[], blocks: (string | number)[] = [], layers: (string | number)[] = []) =>
  [
    0, "SECTION", 2, "HEADER", ...header, 0, "ENDSEC",
    0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LAYER", ...layers, 0, "ENDTAB", 0, "ENDSEC",
    0, "SECTION", 2, "BLOCKS", ...blocks, 0, "ENDSEC",
    0, "SECTION", 2, "ENTITIES", ...entities, 0, "ENDSEC", 0, "EOF",
  ].join("\n");

const MM = [9, "$INSUNITS", 70, 4];
const rect = (h: string, layer: string, x: number, y: number, w: number, hgt: number) =>
  [0, "LWPOLYLINE", 5, h, 8, layer, 90, 4, 70, 1, 10, x, 20, y, 10, x + w, 20, y, 10, x + w, 20, y + hgt, 10, x, 20, y + hgt];

describe("DXF reader", () => {
  it("reads units, layers and a closed polyline with its exact area", () => {
    const doc = parseDxf(dxf(MM, rect("A1", "SLAB", 0, 0, 4000, 3000), [], [0, "LAYER", 2, "SLAB", 70, 0, 62, 3]));
    expect(doc.insUnits).toBe(4);
    expect(metresPerUnit(doc.insUnits)).toBe(0.001);
    expect(doc.layers.get("SLAB")?.color).toBe(3);
    const m = buildModel(doc);
    const o = m.objects.find((x) => x.handle === "A1")!;
    expect(o.area).toBeCloseTo(12_000_000, 6);
    expect(o.length).toBeCloseTo(14_000, 6);
    expect(m.layers.find((l) => l.name === "SLAB")?.count).toBe(1);
  });

  it("computes bulged polylines, circles and arcs exactly", () => {
    // Semicircle of radius 1000: (0,0)→(2000,0) bulge 1 (180° ccw, below), back along the diameter.
    const half = [0, "LWPOLYLINE", 5, "B1", 8, "0", 90, 2, 70, 1, 10, 0, 20, 0, 42, 1, 10, 2000, 20, 0];
    const circle = [0, "CIRCLE", 5, "C1", 8, "0", 10, 0, 20, 0, 40, 500];
    const arc = [0, "ARC", 5, "R1", 8, "0", 10, 0, 20, 0, 40, 1000, 50, 0, 51, 90];
    const m = buildModel(parseDxf(dxf(MM, [...half, ...circle, ...arc])));
    const by = (h: string) => m.objects.find((x) => x.handle === h)!;
    expect(by("B1").area).toBeCloseTo((Math.PI * 1000 ** 2) / 2, 6);
    expect(by("B1").length).toBeCloseTo(Math.PI * 1000 + 2000, 6);
    expect(by("C1").area).toBeCloseTo(Math.PI * 250_000, 6);
    expect(by("R1").length).toBeCloseTo((Math.PI * 1000) / 2, 6);
    expect(Math.abs(segsArea([bulgeSeg({ x: 0, y: 0 }, { x: 2000, y: 0 }, -1), { kind: "line", a: { x: 2000, y: 0 }, b: { x: 0, y: 0 } }]))).toBeCloseTo((Math.PI * 1e6) / 2, 6);
    expect(segsLength([bulgeSeg({ x: 0, y: 0 }, { x: 2000, y: 0 }, 1)])).toBeCloseTo(Math.PI * 1000, 6);
  });

  it("places nested, rotated, scaled and arrayed blocks and counts inserts", () => {
    const blocks = [
      0, "BLOCK", 2, "DOOR", 10, 0, 20, 0, ...rect("D0", "0", 0, 0, 900, 100), 0, "ENDBLK",
      0, "BLOCK", 2, "PAIR", 10, 0, 20, 0,
      0, "INSERT", 5, "P1", 8, "0", 2, "DOOR", 10, 0, 20, 0,
      0, "INSERT", 5, "P2", 8, "0", 2, "DOOR", 10, 2000, 20, 0, 0, "ENDBLK",
    ];
    const ents = [
      0, "INSERT", 5, "I1", 8, "A-DOOR", 2, "DOOR", 10, 1000, 20, 1000, 41, 2, 42, 2, 50, 90,
      0, "INSERT", 5, "I2", 8, "A-DOOR", 2, "PAIR", 10, 0, 20, 5000,
      0, "INSERT", 5, "I3", 8, "A-DOOR", 2, "DOOR", 10, 0, 20, 9000, 70, 3, 71, 2, 44, 1000, 45, 500,
    ];
    const m = buildModel(parseDxf(dxf(MM, ents, blocks)));
    const doors = m.objects.filter((o) => o.type === "INSERT" && o.block === "DOOR");
    expect(doors).toHaveLength(1 + 6); // I1 + the 3 × 2 array (the PAIR's doors are inside a block)
    expect(m.objects.filter((o) => o.block === "PAIR")).toHaveLength(1);
    // I1: rotated 90°, scaled 2 → the 900 × 100 door spans x 800..1000, y 1000..2800.
    const i1 = m.prims.find((p) => p.handle === "I1")!;
    const xs = i1.pts.map((p) => p.x), ys = i1.pts.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(800, 6);
    expect(Math.max(...ys)).toBeCloseTo(2800, 6);
    // Block contents on layer 0 take the insert's layer.
    expect(i1.layer).toBe("A-DOOR");
  });

  it("measures a hatch with an island as outer minus inner", () => {
    const hatch = [
      0, "HATCH", 5, "H1", 8, "A-FLOR", 2, "ANSI31", 70, 0, 91, 2,
      92, 7, 72, 0, 73, 1, 93, 4, 10, 0, 20, 0, 10, 10000, 20, 0, 10, 10000, 20, 8000, 10, 0, 20, 8000, 97, 0,
      92, 1, 93, 4,
      72, 1, 10, 2000, 20, 2000, 11, 4000, 21, 2000,
      72, 1, 10, 4000, 20, 2000, 11, 4000, 21, 4000,
      72, 1, 10, 4000, 20, 4000, 11, 2000, 21, 4000,
      72, 1, 10, 2000, 20, 4000, 11, 2000, 21, 2000, 97, 0,
      75, 0, 76, 1, 52, 0, 41, 1, 77, 0, 78, 1, 53, 45, 43, 0, 44, 0, 45, -2.2, 46, 2.2, 79, 0, 98, 0,
    ];
    const circleHatch = [
      0, "HATCH", 5, "H2", 8, "A-FLOR", 2, "SOLID", 70, 1, 91, 1,
      92, 1, 93, 1, 72, 2, 10, 0, 20, 0, 40, 1000, 50, 0, 51, 360, 73, 1, 97, 0, 75, 0, 76, 1, 98, 0,
    ];
    const m = buildModel(parseDxf(dxf(MM, [...hatch, ...circleHatch])));
    const h1 = m.objects.find((o) => o.handle === "H1")!;
    expect(h1.pattern).toBe("ANSI31");
    expect(h1.area).toBeCloseTo(80_000_000 - 4_000_000, 3);
    expect(m.prims.find((p) => p.handle === "H1")?.pattern).toHaveLength(1);
    expect(m.objects.find((o) => o.handle === "H2")!.area).toBeCloseTo(Math.PI * 1e6, 3);
  });

  it("mirrors OCS entities with extrusion -Z", () => {
    const arc = [0, "ARC", 5, "M1", 8, "0", 10, 100, 20, 0, 40, 10, 50, 0, 51, 90, 210, 0, 220, 0, 230, -1];
    const m = buildModel(parseDxf(dxf(MM, arc)));
    const xs = m.prims[0].pts.map((p) => p.x);
    expect(Math.max(...xs)).toBeCloseTo(-100 + 0, 0);
    expect(Math.min(...xs)).toBeCloseTo(-110, 6);
  });

  it("skips paper space, counts unknown entities and reads text", () => {
    const ents = [
      ...rect("PS", "0", 0, 0, 10, 10).slice(0, 6), 67, 1, ...rect("PS", "0", 0, 0, 10, 10).slice(6),
      0, "ACAD_PROXY_ENTITY", 5, "PX", 8, "0",
      0, "MTEXT", 5, "T1", 8, "0", 10, 0, 20, 0, 40, 250, 1, "{\\fArial|b1;SLAB}\\PL19",
    ];
    const doc = parseDxf(dxf(MM, ents));
    expect(doc.skipped.ACAD_PROXY_ENTITY).toBe(1);
    const m = buildModel(doc);
    expect(m.objects.find((o) => o.handle === "PS")).toBeUndefined();
    expect(m.prims.find((p) => p.kind === "text")?.text?.value).toBe("SLAB\nL19");
    expect(plainMText("\\H2.5;A\\~B")).toBe("A B");
  });

  it("draws a dimension's block at its insertion point (group 12), inside a block insert", () => {
    const blocks = [
      0, "BLOCK", 2, "*D1", 10, 0, 20, 0, 0, "LINE", 5, "DL", 8, "DIM", 10, 1000, 20, 1000, 11, 2000, 21, 1000, 0, "ENDBLK",
      0, "BLOCK", 2, "GRID", 10, 0, 20, 0, 0, "DIMENSION", 5, "DM", 8, "DIM", 2, "*D1", 12, -500, 22, 300, 0, "ENDBLK",
    ];
    const m = buildModel(parseDxf(dxf(MM, [0, "INSERT", 5, "G1", 8, "0", 2, "GRID", 10, 10000, 20, 20000], blocks)));
    const line = m.prims.find((p) => p.layer === "DIM")!;
    expect(line.pts[0]).toEqual({ x: 10500, y: 21300 });
  });

  it("frames the view on AutoCAD's extents when they hold most of the drawing", () => {
    const far = rect("FAR", "0", 900000, 900000, 10, 10);
    const ents = [...rect("A", "0", 0, 0, 100, 100), ...rect("B", "0", 200, 0, 100, 100), ...rect("C", "0", 400, 0, 100, 100), ...rect("D", "0", 600, 0, 100, 100), ...rect("E", "0", 800, 0, 100, 100), ...far];
    const m = buildModel(parseDxf(dxf([...MM, 9, "$EXTMIN", 10, 0, 20, 0, 9, "$EXTMAX", 10, 900, 20, 100], ents)));
    expect(m.view).toEqual({ minX: 0, minY: 0, maxX: 900, maxY: 100 });
    expect(m.bounds.maxX).toBe(900010);
  });

  it("draws multileader labels and leader lines", () => {
    const ml = [0, "MULTILEADER", 5, "ML", 8, "NOTE", 300, "CONTEXT_DATA{", 40, 1, 10, 0, 20, 0, 41, 300, 304, "RB3 (200x300)", 12, 1000, 22, 2000,
      302, "LEADER{", 10, 900, 20, 2000, 11, 1, 21, 0, 40, 75, 304, "LEADER_LINE{", 10, 900, 20, 500, 305, "}", 303, "}", 301, "}"];
    const m = buildModel(parseDxf(dxf(MM, ml)));
    const t = m.prims.find((p) => p.kind === "text")!;
    expect(t.text).toMatchObject({ value: "RB3 (200x300)", height: 300, align: { h: "left", v: "top" } });
    expect(t.pts[0]).toEqual({ x: 1000, y: 2000 });
    const paths = m.prims.filter((p) => p.kind === "path").map((p) => p.pts);
    expect(paths).toContainEqual([{ x: 900, y: 500 }, { x: 900, y: 2000 }]);
    expect(paths).toContainEqual([{ x: 900, y: 2000 }, { x: 975, y: 2000 }]);
  });

  it("rejects binary DXF and non-DXF text", () => {
    expect(() => parseDxf("AutoCAD Binary DXF\r\n\u001a\u0000")).toThrow(DxfError);
    expect(() => parseDxf("hello\nworld")).toThrow(DxfError);
  });

  it("treats unitless drawings as unknown scale", () => {
    expect(buildModel(parseDxf(dxf([9, "$INSUNITS", 70, 0], []))).metresPerUnit).toBeNull();
  });
});

// Real drawing check: DCOS_CAD_SAMPLE=<file.dxf> and DCOS_CAD_TRUTH=<AutoCAD areas JSON>.
const sample = process.env.DCOS_CAD_SAMPLE, truth = process.env.DCOS_CAD_TRUTH;
describe.skipIf(!sample || !truth)("real drawing vs AutoCAD", () => {
  it("matches AutoCAD's area and perimeter for every hatch and closed polyline", () => {
    const t0 = performance.now();
    const m = buildModel(parseDxf(fs.readFileSync(sample!, "utf8")));
    const ms = performance.now() - t0;
    const ref: { handle: string; type: string; area?: number; perimeter?: number }[] = JSON.parse(fs.readFileSync(truth!, "utf8"));
    const byHandle = new Map(m.objects.map((o) => [o.handle, o]));
    const bad: string[] = [];
    let checked = 0;
    for (const r of ref) {
      if (r.area == null) continue;
      const o = byHandle.get(r.handle);
      if (!o) { bad.push(`${r.handle} ${r.type} missing`); continue; }
      checked++;
      if (Math.abs((o.area ?? 0) - r.area) > Math.max(0.01, r.area * 1e-6)) bad.push(`${r.handle} ${r.type} area ${o.area} vs ${r.area}`);
      if (r.perimeter != null && Math.abs((o.length ?? 0) - r.perimeter) > Math.max(0.01, r.perimeter * 1e-6)) bad.push(`${r.handle} ${r.type} perimeter ${o.length} vs ${r.perimeter}`);
    }
    console.log(`checked ${checked} objects in ${ms.toFixed(0)} ms; ${m.prims.length} prims; skipped ${JSON.stringify(m.skipped)}`);
    expect(bad).toEqual([]);
  });
});
