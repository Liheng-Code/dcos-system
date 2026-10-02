import { describe, expect, it } from "vitest";
import { materialFingerprint, normSpec, type MaterialIdentity } from "../material-fingerprint";

const base: MaterialIdentity = {
  category_id: "cat-1", unit: "pcs", material_type: "Hollow Clay Brick", dimension: "80 × 80 × 180 mm",
  thickness: null, grade: null, compressive_strength: "5-10 MPa", standard: null, material_name: "Red brick",
};

describe("normSpec", () => {
  it("ignores case, spacing and the multiplication sign", () => {
    expect(normSpec("80 × 80 × 180 mm")).toBe("80x80x180mm");
    expect(normSpec("80x80x180MM")).toBe("80x80x180mm");
    expect(normSpec(null)).toBe("");
  });
});

describe("materialFingerprint", () => {
  it("matches the same spec however it is written", () => {
    const b = { ...base, dimension: "80x80x180MM", material_type: "hollow clay brick", material_name: "Other name" };
    expect(materialFingerprint(b)).toBe(materialFingerprint(base));
  });

  it("differs when size, grade or unit differs", () => {
    expect(materialFingerprint({ ...base, dimension: "60x100x200mm" })).not.toBe(materialFingerprint(base));
    expect(materialFingerprint({ ...base, grade: "C30" })).not.toBe(materialFingerprint(base));
    expect(materialFingerprint({ ...base, unit: "box" })).not.toBe(materialFingerprint(base));
  });

  it("ignores brand/supplier-style differences (not part of identity)", () => {
    expect(materialFingerprint({ ...base })).toBe(materialFingerprint({ ...base }));
  });

  it("falls back to the name when every spec field is blank", () => {
    const blank = { ...base, material_type: null, dimension: null, compressive_strength: null };
    expect(materialFingerprint(blank)).toBe("cat-1|pcs|n:redbrick");
    expect(materialFingerprint({ ...blank, material_name: "Red  Brick" })).toBe(materialFingerprint(blank));
  });
});
