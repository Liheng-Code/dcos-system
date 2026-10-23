import { describe, expect, it } from "vitest";
import { matchBand, scoreBoqLineToWorkItem, suggestWorkItems, type WorkItemInput } from "../boq-item-matcher";
import { normalizeUnit, numberTokens, wordTokens } from "@/lib/text-match";

const wi = (o: Partial<WorkItemInput> & { id: string; code: string; description: string }): WorkItemInput => ({ unit: "m2", ...o });

const CATALOGUE: WorkItemInput[] = [
  wi({ id: "w100", code: "WI-BRK-100", description: "Brick masonry wall 100mm thick", boqSection: "Masonry & Plaster" }),
  wi({ id: "w200", code: "WI-BRK-200", description: "Brick masonry wall 200mm thick", boqSection: "Masonry & Plaster" }),
  wi({ id: "wtile", code: "WI-TILE-01", description: "Ceramic floor tiling 600x600", boqSection: "Tiling" }),
  wi({ id: "wconc", code: "WI-CONC-30", description: "Reinforced concrete grade C30 to slabs", unit: "m3", boqSection: "Concrete" }),
  wi({ id: "wpaint", code: "WI-PAINT-1", description: "Emulsion paint to internal walls, 2 coats", boqSection: "Painting" }),
];

describe("text helpers", () => {
  it("normalises units", () => {
    for (const u of ["m2", "m²", "SQM", "sq.m"]) expect(normalizeUnit(u)).toBe("m2");
    for (const u of ["m3", "m³", "cum"]) expect(normalizeUnit(u)).toBe("m3");
    for (const u of ["nos", "No", "nr", "ea"]) expect(normalizeUnit(u)).toBe("no");
    for (const u of ["m", "lm"]) expect(normalizeUnit(u)).toBe("m");
    for (const u of ["item", "LS", "sum"]) expect(normalizeUnit(u)).toBe("item");
    expect(normalizeUnit("tonne")).toBe("t");
    expect(normalizeUnit("")).toBeNull();
  });
  it("splits numbers and words", () => {
    expect(numberTokens("Brick Masonry Wall (100mm)")).toEqual(["100mm"]);
    expect(numberTokens("Slab 200 mm and 12.5 kg")).toEqual(["200mm", "12.5kg"]);
    expect(wordTokens("Supply and install Brick Walls (100mm)")).toEqual(["brick", "wall"]);
  });
});

describe("scoreBoqLineToWorkItem", () => {
  it("an exact item code is a very strong signal", () => {
    const r = scoreBoqLineToWorkItem({ itemCode: "wi-tile-01", description: "something unrelated", unit: "m2" }, CATALOGUE[2]);
    expect(r.score).toBeGreaterThanOrEqual(0.85);
    expect(r.reasons[0]).toMatch(/item code/);
  });
  it("splits Brick Masonry Wall (100mm) from (200mm) on the number", () => {
    const line = { description: "Brick Masonry Wall (100mm)", unit: "m²" };
    const a = scoreBoqLineToWorkItem(line, CATALOGUE[0]);
    const b = scoreBoqLineToWorkItem(line, CATALOGUE[1]);
    expect(a.score).toBeGreaterThanOrEqual(0.8);
    expect(b.score).toBeLessThan(0.7);
    expect(a.score - b.score).toBeGreaterThanOrEqual(0.1);
    expect(b.reasons.join("|")).toMatch(/number differs/);
  });
  it("a unit mismatch lowers the score", () => {
    const same = scoreBoqLineToWorkItem({ description: "Reinforced concrete C30 slab", unit: "cum" }, CATALOGUE[3]);
    const diff = scoreBoqLineToWorkItem({ description: "Reinforced concrete C30 slab", unit: "m2" }, CATALOGUE[3]);
    expect(same.score).toBeGreaterThan(diff.score);
  });
  it("uses CSI section and division when the line has one", () => {
    const item = wi({ id: "x", code: "X", description: "Wall finish", csiSectionCode: "09 90 00" });
    const line = { description: "Wall finish", unit: "m2" };
    const none = scoreBoqLineToWorkItem(line, item).score;
    const sameSection = scoreBoqLineToWorkItem({ ...line, csiSectionCode: "09 90 00" }, item);
    const otherDivision = scoreBoqLineToWorkItem({ ...line, csiSectionCode: "03 30 00" }, item);
    expect(sameSection.reasons.join("|")).toMatch(/CSI section 09 90 00/);
    expect(sameSection.score).toBeGreaterThanOrEqual(none);
    expect(otherDivision.score).toBeLessThan(sameSection.score);
  });
  it("uses Element Library classification tokens", () => {
    const line = { description: "Finish", unit: "m2", discipline: "Architectural", section: "Finishes", subSection: "Painting" };
    const paint = scoreBoqLineToWorkItem(line, CATALOGUE[4]);
    const tile = scoreBoqLineToWorkItem(line, CATALOGUE[2]);
    expect(paint.score).toBeGreaterThan(tile.score);
    expect(paint.reasons.join("|")).toMatch(/classification/);
  });
});

describe("suggestWorkItems and bands", () => {
  it("auto-accepts a clear winner", () => {
    const s = suggestWorkItems({ description: "Brick Masonry Wall (100mm)", unit: "m2" }, CATALOGUE);
    expect(s[0].workItemId).toBe("w100");
    expect(matchBand(s)).toBe("auto");
  });
  it("sends two close candidates to review (no clear margin)", () => {
    const twins = [
      wi({ id: "a", code: "A", description: "Emulsion paint to walls" }),
      wi({ id: "b", code: "B", description: "Emulsion paint walls" }),
    ];
    const s = suggestWorkItems({ description: "Emulsion paint to walls", unit: "m2" }, twins);
    expect(s.length).toBe(2);
    expect(matchBand(s)).toBe("review");
  });
  it("returns nothing for an unrelated line and honours limit", () => {
    expect(suggestWorkItems({ description: "Tower crane rental", unit: "month" }, CATALOGUE)).toEqual([]);
    expect(matchBand([])).toBe("none");
    const many = Array.from({ length: 8 }, (_, i) => wi({ id: `i${i}`, code: `C${i}`, description: "Brick masonry wall" }));
    expect(suggestWorkItems({ description: "Brick masonry wall", unit: "m2" }, many, { limit: 3 })).toHaveLength(3);
  });
});
