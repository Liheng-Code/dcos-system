import { describe, expect, it } from "vitest";
import { groupBySectorFit, groupTemplates, recommendedTemplate, sectorListFit, sectorListLabel, templateFit } from "../template-fit";

describe("template matching", () => {
  const t = (name: string, template_category: string | null, building_types: string[] = []) => ({ name, template_category, building_types });
  const villa = t("villa", "residential", ["luxury_villa", "townhouse"]);
  const tower = t("tower", "residential", ["condominium"]);
  const genericRes = t("generic", "residential");
  const office = t("office", "commercial", ["office_building", "mixed_use_building"]);
  const mixed = t("7f", "commercial", ["mixed_use_building"]);
  const custom = t("custom", "Company Specials");
  const loose = t("loose", null);
  const all = [loose, custom, office, mixed, tower, genericRes, villa];

  it("rates a building-type match above a generic sector template", () => {
    expect(templateFit(villa, { sector: "residential", buildingType: "luxury_villa" })).toBe(2);
    expect(templateFit(genericRes, { sector: "residential", buildingType: "luxury_villa" })).toBe(1);
    expect(templateFit(tower, { sector: "residential", buildingType: "luxury_villa" })).toBe(0);
    expect(templateFit(villa, {})).toBe(0);
  });

  it("recommends the best fit, else null", () => {
    expect(recommendedTemplate(all, { sector: "residential", buildingType: "townhouse" })?.name).toBe("villa");
    expect(recommendedTemplate(all, { sector: "residential", buildingType: "apartment" })?.name).toBe("generic");
    expect(recommendedTemplate(all, { sector: "industrial", buildingType: "factory" })).toBeNull();
  });

  it("groups: recommended, project sector, other sectors in order, custom A-Z, uncategorised", () => {
    const g = groupTemplates(all, { sector: "commercial", buildingType: "mixed_use_building" });
    expect(g.map((x) => x.label)).toEqual(["Recommended", "Residential", "Company Specials", "Uncategorised"]);
    expect(g[0].items.map((x) => x.name)).toEqual(["office", "7f"]);
    expect(g[1].items.map((x) => x.name)).toEqual(["tower", "generic", "villa"]);
    expect(groupTemplates(all).map((x) => x.label)).toEqual(["Residential", "Commercial", "Company Specials", "Uncategorised"]);
  });
});

describe("sector lists", () => {
  const floor = { sectors: ["residential", "commercial", "institutional"], building_types: ["condominium", "hotel"] };
  const civil = { sectors: ["infrastructure"], building_types: [] as string[] };
  const any = { sectors: [] as string[], building_types: [] as string[] };

  it("rates building type > sector (or every sector) > other sector", () => {
    expect(sectorListFit(floor, { sector: "commercial", buildingType: "hotel" })).toBe(2);
    expect(sectorListFit(floor, { sector: "residential", buildingType: "luxury_villa" })).toBe(1);
    expect(sectorListFit(any, { sector: "infrastructure", buildingType: "road" })).toBe(1);
    expect(sectorListFit(civil, { sector: "residential", buildingType: "condominium" })).toBe(0);
    expect(sectorListFit(civil, {})).toBe(1);
  });

  it("labels sector lists", () => {
    expect(sectorListLabel([])).toBe("All sectors");
    expect(sectorListLabel(["residential", "commercial", "industrial", "institutional"])).toBe("All building sectors");
    expect(sectorListLabel(["infrastructure"])).toBe("Infrastructure");
  });

  it("groups by fit and skips grouping without a project", () => {
    const g = groupBySectorFit([civil, floor, any], { sector: "commercial", buildingType: "hotel" });
    expect(g.map((x) => x.label)).toEqual(["★ Recommended for this project", "Also fits Commercial", "Other sectors"]);
    expect(groupBySectorFit([civil, floor], {})).toEqual([{ label: "", items: [civil, floor] }]);
  });
});
