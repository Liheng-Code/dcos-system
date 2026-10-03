import { describe, expect, it } from "vitest";
import { generateLevelRange, inferLevelType, planLevelApply, sortLevels, validateLevelItems, type LevelItem } from "../level-library";

const item = (level_code: string, extra: Partial<LevelItem> = {}): LevelItem => ({
  level_code, level_name: level_code, level_type: inferLevelType(level_code), floor_height_m: null, typical_gfa_m2: null, ...extra,
});

describe("inferLevelType", () => {
  it.each([
    ["B1", "basement"], ["B01", "basement"], ["LVL-B2", "basement"], ["00.UG", "basement"],
    ["GF", "ground"], ["G00", "ground"], ["01.GF", "ground"],
    ["MZ", "mezzanine"], ["M01", "mezzanine"], ["P2", "podium"],
    ["PH01", "penthouse"], ["RF", "roof"], ["R00", "roof"],
    ["L01", "typical"], ["1F", "typical"], ["TF", "typical"],
  ])("%s -> %s", (code, type) => expect(inferLevelType(code)).toBe(type));
});

describe("generateLevelRange", () => {
  it("builds padded codes and names", () => {
    const r = generateLevelRange({ prefix: "l", from: 1, to: 3, pad: 2, nameFormat: "Level {n}", floorHeight: 3.2 });
    expect(r.map((x) => x.level_code)).toEqual(["L01", "L02", "L03"]);
    expect(r[2]).toMatchObject({ level_name: "Level 3", level_type: "typical", floor_height_m: 3.2 });
  });

  it("counts down for basements", () => {
    expect(generateLevelRange({ prefix: "B", from: 3, to: 1, pad: 0, nameFormat: "Basement {n}" }).map((x) => x.level_code))
      .toEqual(["B3", "B2", "B1"]);
  });

  it("refuses absurd ranges", () => {
    expect(generateLevelRange({ prefix: "L", from: 1, to: 1000, pad: 0, nameFormat: "" })).toEqual([]);
  });
});

describe("sortLevels", () => {
  it("orders deepest basement to roof", () => {
    const sorted = sortLevels([item("RF"), item("L02"), item("B1"), item("GF"), item("L10"), item("B2"), item("PH1")]);
    expect(sorted.map((x) => x.level_code)).toEqual(["B2", "B1", "GF", "L02", "L10", "PH1", "RF"]);
  });
});

describe("validateLevelItems", () => {
  it("flags empty, duplicate and bad values", () => {
    const errors = validateLevelItems([item("L1"), item("l1"), item("", { level_name: "" }), item("L2", { floor_height_m: 0 })]);
    expect(errors).toHaveLength(3);
    expect(validateLevelItems([])).toEqual(["Add at least one level."]);
    expect(validateLevelItems([item("GF")])).toEqual([]);
  });
});

describe("planLevelApply", () => {
  it("skips codes already under the building, case-insensitively", () => {
    const { toCreate, skipped } = planLevelApply(["gf", "L01"], [item("GF"), item("L01"), item("L02")]);
    expect(toCreate.map((x) => x.level_code)).toEqual(["L02"]);
    expect(skipped.map((x) => x.level_code)).toEqual(["GF", "L01"]);
  });
});
