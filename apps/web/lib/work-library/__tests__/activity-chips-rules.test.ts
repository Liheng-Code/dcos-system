import { describe, expect, it } from "vitest";
import {
  commonPackage, countBy, countByDivision, divisionLabel, inDivision, NO_DIVISION, isHttpUrl, materialDisplayName, packageLabel, PACKAGE_TYPE_LABEL, rankPackages,
  sortByDivision, TC_TYPE_LABEL, percentLabel, sectionLabel, sortShopDrawingsForDivision, suggestNextCode,
} from "../activity-chips-rules";

describe("activity chips rules", () => {
  it("prefers the material attribute name", () => {
    expect(materialDisplayName("Facing Bricks", "Brick, facing")).toBe("Facing Bricks");
    expect(materialDisplayName("  ", "Brick, facing")).toBe("Brick, facing");
    expect(materialDisplayName(null, null)).toBe("");
  });

  it("puts the same division first", () => {
    const rows = [
      { code: "SD-03-01", csi_division_code: "03" },
      { code: "SD-04-02", csi_division_code: "04" },
      { code: "SD-04-01", csi_division_code: "04" },
      { code: "SD-X", csi_division_code: null },
    ];
    expect(sortShopDrawingsForDivision(rows, "04").map((r) => r.code)).toEqual(["SD-04-01", "SD-04-02", "SD-03-01", "SD-X"]);
    expect(sortShopDrawingsForDivision(rows, null).map((r) => r.code)).toEqual(["SD-03-01", "SD-04-01", "SD-04-02", "SD-X"]);
  });

  it("suggests the next code", () => {
    expect(suggestNextCode(["SD-04-01", "SD-04-02", "SD-03-09"], "SD-04-")).toBe("SD-04-03");
    expect(suggestNextCode([], "CO-")).toBe("CO-01");
    expect(suggestNextCode(["CO-15", "CO-xx"], "CO-")).toBe("CO-16");
  });

  it("formats display labels", () => {
    expect(divisionLabel("04", "Masonry")).toBe("Division 04 - Masonry");
    expect(divisionLabel("", null)).toBe("-");
    expect(sectionLabel("04 20 00", "Unit Masonry")).toBe("04 20 00 - Unit Masonry");
    expect(sectionLabel(null, null)).toBe("-");
    expect(percentLabel("2")).toBe("2%");
    expect(percentLabel(" ")).toBe("-");
  });

  it("detects http(s) reference links", () => {
    expect(isHttpUrl("https://example.com/ms.pdf")).toBe(true);
    expect(isHttpUrl(" http://x.io/a ")).toBe(true);
    expect(isHttpUrl("MS-DOC-12")).toBe(false);
    expect(isHttpUrl("https://a b")).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });

  it("labels T&C types, sorts method statements by division and suggests their codes", () => {
    expect(TC_TYPE_LABEL.commissioning).toBe("Commissioning");
    const rows = [{ code: "MS-04-01", csi_division_code: "04" }, { code: "MS-09-01", csi_division_code: "09" }];
    expect(sortByDivision(rows, "09").map((r) => r.code)).toEqual(["MS-09-01", "MS-04-01"]);
    expect(suggestNextCode(["MS-04-01"], "MS-04-")).toBe("MS-04-02");
    expect(suggestNextCode(["TC-03-04"], "TC-03-")).toBe("TC-03-05");
  });

  it("counts by key", () => {
    expect([...countBy(["a", "b", "a"], (x) => x)]).toEqual([["a", 2], ["b", 1]]);
  });

  it("counts items per division, with a bucket for none", () => {
    const rows = [{ d: ["03"] }, { d: ["03", "05", "03"] }, { d: [null] }, { d: [] }];
    expect(Object.fromEntries(countByDivision(rows, (r) => r.d))).toEqual({ "03": 2, "05": 1, [NO_DIVISION]: 2 });
  });

  it("matches the selected division bucket", () => {
    expect(inDivision(["03"], null)).toBe(true);
    expect(inDivision(["03", "05"], "05")).toBe(true);
    expect(inDivision(["03"], "05")).toBe(false);
    expect(inDivision([null], NO_DIVISION)).toBe(true);
    expect(inDivision(["03"], NO_DIVISION)).toBe(false);
  });
});

describe("procurement package rules", () => {
  it("labels a package by name and code", () => {
    expect(packageLabel({ code: "PKG-STR-REBAR-01", name: "Rebar Supply & Bending" })).toBe("Rebar Supply & Bending (PKG-STR-REBAR-01)");
    expect(packageLabel({ code: "PKG-X", name: "PKG-X" })).toBe("PKG-X");
    expect(PACKAGE_TYPE_LABEL.subcontract).toBe("Subcontract");
  });

  it("finds the one package all BOQ lines lead to", () => {
    expect(commonPackage([["a"], ["a"], []])).toBe("a");
    expect(commonPackage([["a", "a"], ["a"]])).toBe("a");
    expect(commonPackage([["a"], ["b"]])).toBeNull();
    expect(commonPackage([["a", "b"]])).toBeNull();
    expect(commonPackage([[], []])).toBeNull();
    expect(commonPackage([])).toBeNull();
  });

  it("ranks the PR's activity packages first", () => {
    const rows = [{ id: "1", code: "PKG-C" }, { id: "2", code: "PKG-A" }, { id: "3", code: "PKG-B" }];
    expect(rankPackages(rows, new Set(["1"])).map((r) => r.code)).toEqual(["PKG-C", "PKG-A", "PKG-B"]);
    expect(rankPackages(rows, new Set()).map((r) => r.code)).toEqual(["PKG-A", "PKG-B", "PKG-C"]);
  });
});
