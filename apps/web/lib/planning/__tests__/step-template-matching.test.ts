import { describe, expect, it } from "vitest";
import { buildMatcher, groupStepTemplates, normaliseActivityName, stepTemplateRank, templateCoreName, type MatchTemplate } from "../step-template-matching";

const t = (id: string, template_name: string, is_active = true): MatchTemplate => ({ id, template_name, is_active });
const templates = [
  t("block", "Blockwork / Masonry – Typical Floor"),
  t("columns", "Columns"),
  t("slab", "Slab"),
  t("windows", "Windows / Glazing – Typical Floor"),
  t("fa-conduits", "Fire Alarm Conduits – Typical Floor"),
  t("fa-devices", "Fire Alarm Devices – Typical Floor"),
  t("plaster", "Plastering (Internal) – Typical Floor"),
  t("old", "Screed – Typical Floor", false),
];

describe("normaliseActivityName", () => {
  it("drops level markers, punctuation and plurals", () => {
    expect(normaliseActivityName("B1 Columns")).toBe("column");
    expect(normaliseActivityName("Level 3 Blockwork")).toBe("blockwork");
    expect(normaliseActivityName("Switches & Sockets")).toBe("switche socket");
    expect(templateCoreName("Plastering (Internal) – Typical Floor")).toBe("plastering");
  });
});

describe("buildMatcher", () => {
  const suggest = buildMatcher(templates, new Map());

  it("matches the same name with level prefixes or a qualifier removed", () => {
    expect(suggest("B1 Columns")).toMatchObject({ templateId: "columns", kind: "exact" });
    expect(suggest("Plastering")).toMatchObject({ templateId: "plaster", kind: "exact" });
  });

  it("matches a shorter activity name contained in one template", () => {
    expect(suggest("Windows")).toMatchObject({ templateId: "windows", kind: "partial" });
  });

  it("flags a name shared by several templates as ambiguous", () => {
    const r = suggest("Fire Alarm");
    expect(r.kind).toBe("ambiguous");
    expect([r.templateId, ...r.alternatives].sort()).toEqual(["fa-conduits", "fa-devices"]);
  });

  it("does not match design or procurement activities that merely contain a template name", () => {
    expect(suggest("Slab Design").kind).toBe("none");
    expect(suggest("Column Reinforcement").kind).toBe("none");
  });

  it("ignores inactive templates", () => {
    expect(suggest("Screed").kind).toBe("none");
  });

  it("prefers a remembered choice", () => {
    const withMemory = buildMatcher(templates, new Map([["column reinforcement", "columns"]]));
    expect(withMemory("L2 Column Reinforcement")).toMatchObject({ templateId: "columns", kind: "remembered" });
  });
});

describe("sector-aware matching", () => {
  const s = (id: string, template_name: string, template_category: string | null, building_types: string[] = [], group_name = "G"): MatchTemplate & { group_name: string } =>
    ({ id, template_name, is_active: true, template_category, building_types, group_name });
  const lighting = s("lighting", "Lighting Installation – Typical Floor", null);
  const street = s("street", "Street Lighting", "infrastructure", ["road"]);
  const villaRoof = s("villa-roof", "Pitched Roof – Truss & Tiles", "residential", ["standard_villa"]);
  const metalRoof = s("metal-roof", "Pitched Roof – Metal Sheeting", "industrial");
  const all = [lighting, street, villaRoof, metalRoof];

  it("ranks building-type fit > sector > common > same sector other type > other sector", () => {
    const villa = { sector: "residential", buildingType: "standard_villa" };
    expect(stepTemplateRank(villaRoof, villa)).toBe(4);
    expect(stepTemplateRank(metalRoof, { sector: "industrial", buildingType: "factory" })).toBe(3);
    expect(stepTemplateRank(lighting, villa)).toBe(2);
    expect(stepTemplateRank(villaRoof, { sector: "residential", buildingType: "condominium" })).toBe(1);
    expect(stepTemplateRank(street, villa)).toBe(0);
  });

  it("breaks a tie in favour of the template that suits the project", () => {
    // "Lighting" is a partial match for both; the common one wins outside infrastructure…
    expect(buildMatcher(all, new Map(), { sector: "commercial", buildingType: "hotel" })("Lighting"))
      .toMatchObject({ templateId: "lighting", kind: "partial" });
    // …and with no project context at all.
    expect(buildMatcher(all, new Map())("Lighting")).toMatchObject({ templateId: "lighting", kind: "partial" });
    // Same core name in two sectors: the project's sector decides.
    expect(buildMatcher(all, new Map(), { sector: "residential", buildingType: "standard_villa" })("RF Pitched Roof"))
      .toMatchObject({ templateId: "villa-roof", kind: "exact" });
    expect(buildMatcher(all, new Map(), { sector: "industrial", buildingType: "warehouse" })("Pitched Roof"))
      .toMatchObject({ templateId: "metal-roof", kind: "exact" });
    // Written for other sectors only: not suggested (and not for a project without a sector).
    expect(buildMatcher(all, new Map(), { sector: "institutional" })("Pitched Roof").kind).toBe("none");
    expect(buildMatcher(all, new Map())("Street Lighting").kind).toBe("none");
  });

  it("lists recommended templates first, then trade groups", () => {
    const groups = groupStepTemplates(all.map((t, i) => ({ ...t, group_name: i % 2 ? "B" : "A" })), { sector: "infrastructure", buildingType: "road" });
    expect(groups.map((g) => g.label)).toEqual(["★ Recommended for this project", "A", "B"]);
    expect(groups[0].items.map((t) => t.id)).toEqual(["street"]);
  });
});
