import { describe, expect, it } from "vitest";
import { buildMatcher, normaliseActivityName, templateCoreName, type MatchTemplate } from "../step-template-matching";

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
