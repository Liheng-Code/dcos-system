import { describe, expect, it } from "vitest";
import {
  countBy, divisionLabel, isHttpUrl, materialDisplayName, sortByDivision, TC_TYPE_LABEL, percentLabel, sectionLabel, sortShopDrawingsForDivision, suggestNextCode,
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
});
