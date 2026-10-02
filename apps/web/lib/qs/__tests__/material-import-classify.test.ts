import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseSimpleMaterialSheet } from "@/components/qs/dwl-import-lib";
import { classifyMaterialRows, type ExistingMaterial, type MaterialCatalogSnapshot } from "@/components/qs/dwl-material-import-compare";
import { materialFingerprint } from "../material-fingerprint";

const CAT = { id: "cat-masn", code: "CAT-MASN", name: "Masonry & Plaster", specific_element: null };

const existing: ExistingMaterial = {
  id: "r1", code: "MAT-MASN-001", unit: "pcs", hasAttributes: true, legacy_code: null,
  material_name: "Red brick", tech_spec_summary: null, standard: null, grade: null, brand: null, discipline: null,
  application_scope: null, material_type: "Hollow Clay Brick", dimension: "80 x 80 x 180 mm", thickness: null,
  density: null, compressive_strength: null, color_finish: null, manufacturer: null, effective_date: null,
  category_id: CAT.id, budget_code_id: null, current_price: null, current_price_date: null,
};

function snapshot(): MaterialCatalogSnapshot {
  return {
    materials: [existing],
    byCode: new Map([[existing.code, existing]]),
    byLegacy: new Map(),
    byName: new Map([["red brick", [existing]]]),
    byFingerprint: new Map([[materialFingerprint({ ...existing, material_name: existing.material_name }), existing]]),
    categories: [CAT],
    budgetCodes: [],
  };
}

function parse(aoa: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
  return parseSimpleMaterialSheet(wb);
}

const HEADER = ["Code", "Name", "Category", "Type", "Size", "Unit", "Density", "Effective Date"];

describe("material import — auto codes and same-spec matching", () => {
  it("accepts rows with a blank Code and reads the new columns", () => {
    const { rows, issues } = parse([HEADER, ["", "Brick B", "Masonry & Plaster", "Solid", "60x100x200", "pcs", "1,800 kg/m3", "2026-10-02"]]);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: "", dimension: "60x100x200", density: "1,800 kg/m3", effective_date: "2026-10-02" });
  });

  it("matches a code-less row with the same spec to the existing material (no second code)", () => {
    const { rows } = parse([HEADER, ["", "Another name", "Masonry & Plaster", "hollow clay brick", "80×80×180MM", "pcs", "~1,400 kg/m3", ""]]);
    const [c] = classifyMaterialRows(rows, snapshot());
    expect(c.status).toBe("update");
    expect(c.matchedBy).toBe("spec");
    expect(c.match?.code).toBe("MAT-MASN-001");
    expect(c.changes.map((x) => x.key)).toContain("density");
  });

  it("creates a new material for a different spec, and flags a repeat in the same file", () => {
    const { rows } = parse([
      HEADER,
      ["", "Brick B", "Masonry & Plaster", "Solid", "60x100x200", "pcs", "", ""],
      ["", "Brick B again", "Masonry & Plaster", "solid", "60 × 100 × 200", "pcs", "", ""],
    ]);
    const out = classifyMaterialRows(rows, snapshot());
    expect(out[0].status).toBe("new");
    expect(out[1].status).toBe("invalid");
    expect(out[1].note).toMatch(/Same material as row/);
  });

  it("rejects a new material with no usable Category", () => {
    const { rows } = parse([HEADER, ["", "Brick C", "", "Solid", "1x1x1", "pcs", "", ""]]);
    const [c] = classifyMaterialRows(rows, snapshot());
    expect(c.status).toBe("invalid");
  });

  it("still matches an existing code directly", () => {
    const { rows } = parse([HEADER, ["MAT-MASN-001", "Red brick", "Masonry & Plaster", "Hollow Clay Brick", "80 x 80 x 180 mm", "pcs", "", ""]]);
    const [c] = classifyMaterialRows(rows, snapshot());
    expect(c.matchedBy).toBe("code");
    expect(c.status).toBe("unchanged");
  });
});
