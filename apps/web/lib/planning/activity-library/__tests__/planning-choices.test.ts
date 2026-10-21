import { describe, expect, it } from "vitest";
import { choiceValueLabel, choicesFor, describeUnmet, effectiveChoices, suggestedValue, type PlanningChoice } from "../planning-choices";

const c = (key: string, sectors: string[], building_types: string[], defaults: Record<string, string>, values: string[], sort_order: number): PlanningChoice => ({
  key, label: key.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase()), description: null,
  options: values.map((v) => ({ value: v, label: v.replace(/_/g, " ") })), sectors, building_types, defaults, sort_order,
});

const catalogue = [
  c("roof_type", ["residential", "industrial"], [], { industrial: "metal_sheet", luxury_villa: "pitched_tile", residential: "flat_rc" }, ["pitched_tile", "flat_rc", "metal_sheet"], 30),
  c("structure_type", ["residential", "industrial"], [], { residential: "reinforced_concrete", industrial: "steel" }, ["reinforced_concrete", "steel"], 10),
  c("pavement_type", [], ["road"], { road: "flexible_asphalt" }, ["flexible_asphalt", "rigid_concrete"], 90),
  c("medical_gases", [], ["hospital"], {}, ["yes", "no"], 80),
];

describe("choicesFor", () => {
  it("asks the choices of the sector or building type, in catalogue order", () => {
    expect(choicesFor(catalogue, { sector: "residential", buildingType: "luxury_villa" }).map((x) => x.key)).toEqual(["structure_type", "roof_type"]);
    expect(choicesFor(catalogue, { sector: "infrastructure", buildingType: "road" }).map((x) => x.key)).toEqual(["pavement_type"]);
    expect(choicesFor(catalogue, { sector: "institutional", buildingType: "hospital" }).map((x) => x.key)).toEqual(["medical_gases"]);
  });
  it("asks everything when the project has no category", () => {
    expect(choicesFor(catalogue, {})).toHaveLength(4);
  });
});

describe("suggestedValue / effectiveChoices", () => {
  it("suggests by building type before sector", () => {
    const roof = catalogue[0];
    expect(suggestedValue(roof, { sector: "residential", buildingType: "luxury_villa" })).toBe("pitched_tile");
    expect(suggestedValue(roof, { sector: "residential", buildingType: "apartment" })).toBe("flat_rc");
    expect(suggestedValue(catalogue[3], { buildingType: "hospital" })).toBeNull();
  });

  it("uses picks over suggestions, and an explicit empty pick clears a suggestion", () => {
    const kind = { sector: "industrial", buildingType: "factory" };
    expect(effectiveChoices(catalogue, kind, {})).toEqual({ sector: "industrial", building_type: "factory", structure_type: "steel", roof_type: "metal_sheet" });
    expect(effectiveChoices(catalogue, kind, { roof_type: "flat_rc", structure_type: "" })).toEqual({ sector: "industrial", building_type: "factory", roof_type: "flat_rc" });
  });
});

describe("labels", () => {
  it("names values and unmet conditions in words", () => {
    expect(choiceValueLabel(catalogue, "roof_type", "pitched_tile")).toBe("pitched tile");
    expect(choiceValueLabel(catalogue, "unknown", "a_b")).toBe("a b");
    expect(describeUnmet([
      { rule: { attribute: "roof_type", operator: "in", values: ["pitched_tile", "metal_sheet"] }, matched: false, missing: true },
      { rule: { attribute: "structure_type", operator: "neq", values: ["steel"] }, matched: false, missing: false },
      { rule: { attribute: "sector", operator: "in", values: ["residential"] }, matched: true, missing: false },
    ], catalogue)).toEqual(["Roof type: pitched tile or metal sheet (not set)", "Structure type: not steel"]);
  });
});
