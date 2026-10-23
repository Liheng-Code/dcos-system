import { describe, expect, it } from "vitest";
import { linkBand, scoreWorkItemToMaster, suggestMastersForWorkItem, type LinkMaster } from "../link-suggester";

const masters: LinkMaster[] = [
  { id: "m-brick", name: "Block / brick wall construction", description: "Build masonry walls", defaultUnit: "m2", trade: "Mason", csiDivisionCode: "04", csiSectionCode: "04 20 00" },
  { id: "m-plaster", name: "Wall plastering", defaultUnit: "m2", trade: "Plasterer", csiDivisionCode: "09", csiSectionCode: "09 24 00" },
  { id: "m-conc", name: "Cast in place concrete to slabs", defaultUnit: "m3", trade: "Concrete", csiDivisionCode: "03", csiSectionCode: "03 30 00" },
  { id: "m-lump", name: "Site clearance", defaultUnit: "item", csiDivisionCode: "31" },
];

describe("suggestMastersForWorkItem", () => {
  it("a shared CSI section, unit and name make a clear winner", () => {
    const s = suggestMastersForWorkItem(
      { id: "w1", code: "WI-1", description: "Brick masonry wall 100mm", unit: "m²", csiSectionCode: "04 20 00", csiDivisionCode: "04" }, masters);
    expect(s[0].masterId).toBe("m-brick");
    expect(s[0].reasons.join("|")).toMatch(/same CSI section 04 20 00/);
    expect(linkBand(s)).toBe("auto");
  });

  it("works without any CSI, from unit and name", () => {
    const s = suggestMastersForWorkItem({ id: "w2", code: "WI-2", description: "Cement plaster wall plastering", unit: "m2" }, masters);
    expect(s[0].masterId).toBe("m-plaster");
  });

  it("division match is weaker than a section match", () => {
    const wi = { id: "w3", code: "W", description: "Wall", unit: "m2", csiDivisionCode: "04" };
    const div = scoreWorkItemToMaster(wi, masters[0]);
    const sec = scoreWorkItemToMaster({ ...wi, csiSectionCode: "04 20 00" }, masters[0]);
    expect(sec.score).toBeGreaterThan(div.score);
    expect(div.reasons.join("|")).toMatch(/same CSI division 04/);
  });

  it("penalises a different division and a different unit", () => {
    const wi = { id: "w4", code: "W", description: "Cast in place concrete slab", unit: "m3", csiDivisionCode: "03" };
    const ok = scoreWorkItemToMaster(wi, masters[2]).score;
    const wrongDivision = scoreWorkItemToMaster({ ...wi, csiDivisionCode: "09" }, masters[2]).score;
    const wrongUnit = scoreWorkItemToMaster({ ...wi, unit: "m2" }, masters[2]).score;
    expect(wrongDivision).toBeLessThan(ok);
    expect(wrongUnit).toBeLessThan(ok);
  });

  it("a lump-sum master accepts any unit at half weight", () => {
    const r = scoreWorkItemToMaster({ id: "w5", code: "W", description: "Site clearance", unit: "m2" }, masters[3]);
    expect(r.reasons.join("|")).toMatch(/item-based/);
    expect(r.score).toBeGreaterThan(0.5);
  });

  it("returns nothing below the review threshold and honours limit", () => {
    expect(suggestMastersForWorkItem({ id: "w6", code: "W", description: "Tower crane rental", unit: "month" }, masters)).toEqual([]);
    const many: LinkMaster[] = Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, name: "Brick wall", defaultUnit: "m2" }));
    expect(suggestMastersForWorkItem({ id: "w7", code: "W", description: "Brick wall", unit: "m2" }, many, { limit: 2 })).toHaveLength(2);
  });
});
