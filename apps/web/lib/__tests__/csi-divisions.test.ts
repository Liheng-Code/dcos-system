import { describe, expect, it } from "vitest";
import {
  buildCsiTree, divisionOfSection, formatSectionCode, isValidDivisionCode, isValidSectionCode, parentSectionCode, sectionLevel,
  type CsiDivision, type CsiSection,
} from "../csi-divisions";

describe("csi code helpers", () => {
  it("validates division codes", () => {
    expect(isValidDivisionCode("03")).toBe(true);
    expect(isValidDivisionCode("48")).toBe(true);
    for (const bad of ["3", "003", "ab", "", null, 3]) expect(isValidDivisionCode(bad)).toBe(false);
  });

  it("validates section codes", () => {
    expect(isValidSectionCode("03 30 00")).toBe(true);
    for (const bad of ["033000", "03-30-00", "3 30 00", "03 30", "03 30 000", null]) expect(isValidSectionCode(bad)).toBe(false);
  });

  it("formats section codes from common spellings", () => {
    for (const v of ["033000", "03 30 00", "03-30-00", "03.30.00", " 033000 "]) {
      expect(formatSectionCode(v)).toBe("03 30 00");
    }
    expect(formatSectionCode("03 30")).toBeNull();
    expect(formatSectionCode("abc")).toBeNull();
    expect(formatSectionCode(null)).toBeNull();
  });

  it("derives division, level and parent from a section code", () => {
    expect(divisionOfSection("26 05 19")).toBe("26");
    expect(divisionOfSection("bad")).toBeNull();
    expect(sectionLevel("26 05 00")).toBe(2);
    expect(sectionLevel("25 00 00")).toBe(2);
    expect(sectionLevel("26 05 19")).toBe(3);
    expect(sectionLevel("26 05")).toBeNull();
    expect(parentSectionCode("26 05 19")).toBe("26 05 00");
    expect(parentSectionCode("26 05 00")).toBeNull();
    expect(parentSectionCode("x")).toBeNull();
  });
});

describe("buildCsiTree", () => {
  const div = (code: string, sort_order = Number(code)): CsiDivision => ({ code, name: `D${code}`, group_name: "G", sort_order, is_active: true });
  const sec = (code: string, parent_code: string | null, level: 2 | 3): CsiSection => ({
    code, division_code: code.slice(0, 2), parent_code, level, name: code, sort_order: 0, is_active: true,
  });

  it("nests division, level 2 and level 3, ordered", () => {
    const tree = buildCsiTree(
      [div("26"), div("03")],
      [sec("03 30 13", "03 30 00", 3), sec("03 30 00", null, 2), sec("26 05 00", null, 2)],
    );
    expect(tree.map((n) => n.code)).toEqual(["03", "26"]);
    expect(tree[0].children.map((n) => n.code)).toEqual(["03 30 00"]);
    expect(tree[0].children[0].children.map((n) => n.code)).toEqual(["03 30 13"]);
    expect(tree[1].children[0].level).toBe(2);
  });

  it("hangs a level-3 section with a missing parent off its division", () => {
    const tree = buildCsiTree([div("03")], [sec("03 30 13", "03 30 00", 3)]);
    expect(tree[0].children.map((n) => n.code)).toEqual(["03 30 13"]);
  });
});
