import { describe, expect, it } from "vitest";
import {
  deriveNormFromAssembly,
  deriveNormFromWorkItem,
  isPlaceholderLabourLine,
  labourHoursPerUnit,
  type DwlWorkItem,
} from "../dwl-norm-import";

// Real rows from the local DWL: item 03.02.010 is the only curated recipe with a "gang of N" note.
const columnConcrete: DwlWorkItem = {
  id: "wi-1",
  code: "03.02.010",
  description: "Vibrated concrete C30 in columns, per m3",
  unit: "m3",
  lines: [
    { resourceId: "r-lab", resourceDescription: "General laborer", resourceUnit: "day", consumption: 0.2, basisNote: "Gang of 6 places 30 m3/day" },
    { resourceId: "r-mas", resourceDescription: "Mason (skilled)", resourceUnit: "day", consumption: 0.03, basisNote: "1 finisher per gang" },
  ],
};

describe("deriveNormFromWorkItem — the curated recipe", () => {
  it("03.02.010 gives 1.84 man-hours/m3 and the documented gang", () => {
    const r = deriveNormFromWorkItem(columnConcrete, 8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.norm.labourConstantHrPerUnit).toBe(1.84);
    expect(r.norm.unit).toBe("m3");
    expect(r.norm.source).toBe("dwl_work_item");
    expect(r.norm.dwlWorkItemId).toBe("wi-1");
    // gang of 6 anchors the laborer; the mason follows in proportion (0.24 / 1.6 x 6 = 0.9)
    expect(r.norm.crew.map((c) => [c.roleLabel, c.workersPerCrew])).toEqual([
      ["General laborer", 6],
      ["Mason (skilled)", 0.9],
    ]);
    expect(r.norm.legacyUnvalidated).toBe(false);
    expect(r.norm.basisNote).toContain("03.02.010");
    expect(r.norm.basisNote).toContain("gang of 6");
  });

  it("uses the calendar's hours per day for recipes given in days", () => {
    const r = deriveNormFromWorkItem(columnConcrete, 10);
    expect(r.ok && r.norm.labourConstantHrPerUnit).toBe(2.3);
  });
});

describe("names and notes", () => {
  const longItem: DwlWorkItem = {
    ...columnConcrete,
    description: "Vibrated concrete C30 in columns, per m3. Incl. supply and pump placement of ready-mix concrete, placing labor, mechanical vibration. Excl. formwork.",
  };

  it("the norm name is the first sentence, the full scope stays in the basis note", () => {
    const r = deriveNormFromWorkItem(longItem, 8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.norm.name).toBe("Vibrated concrete C30 in columns, per m3");
    expect(r.norm.basisNote).toContain("Incl. supply and pump placement");
  });

  it("does not double the full stop when a description already ends with one", () => {
    const r = deriveNormFromWorkItem({ ...columnConcrete, description: "Column concrete, per m3." }, 8);
    expect(r.ok && r.norm.basisNote.includes("..")).toBe(false);
  });

  it("caps a very long single sentence", () => {
    const r = deriveNormFromWorkItem({ ...columnConcrete, description: "x".repeat(200) }, 8);
    expect(r.ok && r.norm.name.length).toBeLessThanOrEqual(80);
  });
});

describe("deriveNormFromWorkItem — legacy hour-based items", () => {
  const blockwork: DwlWorkItem = {
    id: "wi-2",
    code: "LIB-BLK-001",
    description: "Blockwork 150mm in mortar, m2",
    unit: "m2",
    lines: [
      { resourceDescription: "Migrated from company_rate_library (LIB-BLK-001) labour", resourceUnit: "hr", consumption: 0.4, basisNote: "Migrated from company_rate_library.code='LIB-BLK-001'" },
    ],
  };

  it("imports hours per unit as-is, one worker, and flags it as unvalidated", () => {
    const r = deriveNormFromWorkItem(blockwork);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.norm.labourConstantHrPerUnit).toBe(0.4);
    expect(r.norm.crew).toHaveLength(1);
    expect(r.norm.crew[0].workersPerCrew).toBe(1);
    expect(r.norm.legacyUnvalidated).toBe(true);
    expect(r.norm.basisNote).toMatch(/LEGACY VALUE/);
    expect(r.norm.basisNote).toMatch(/never been validated/);
  });
});

describe("deriveNormFromWorkItem — refuses what it cannot vouch for", () => {
  it("placeholder-only recipes are not importable", () => {
    const migrated: DwlWorkItem = {
      id: "x", code: "03 30 14", description: "Concrete Columns (C30)", unit: "m3",
      lines: [{ resourceDescription: "Labor component (migrated) for Concrete Columns (C30) (source: qs_cost_items.code='03 30 14')", resourceUnit: "m3", consumption: 1 }],
    };
    const r = deriveNormFromWorkItem(migrated);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/placeholder/i);
  });

  it("flat-rate placeholders (1 day of a trade) are not importable", () => {
    const flat: DwlWorkItem = {
      id: "y", code: "PL-LAB-04", description: "Carpenter, formwork, skilled", unit: "day",
      lines: [{ resourceDescription: "Migrated flat-rate placeholder", resourceUnit: "day", consumption: 1 }],
    };
    expect(deriveNormFromWorkItem(flat).ok).toBe(false);
    expect(isPlaceholderLabourLine(flat.lines[0])).toBe(true);
  });

  it("consumption in a non-time unit (m2, tonne, no) is a rate placeholder, not time", () => {
    const rate: DwlWorkItem = {
      id: "z", code: "R-1", description: "Something", unit: "m2",
      lines: [{ resourceDescription: "Real looking labour", resourceUnit: "m2", consumption: 0.5 }],
    };
    const r = deriveNormFromWorkItem(rate);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not day or hr/);
  });

  it("an item with no labour lines is not importable", () => {
    const r = deriveNormFromWorkItem({ id: "e", code: "E", description: "Empty", unit: "m", lines: [] });
    expect(r.ok).toBe(false);
  });

  it("ignores placeholder lines when a real one exists next to them", () => {
    const mixed: DwlWorkItem = {
      ...columnConcrete,
      lines: [
        ...columnConcrete.lines,
        { resourceDescription: "Labor component (migrated) for X", resourceUnit: "m3", consumption: 1 },
      ],
    };
    const r = deriveNormFromWorkItem(mixed, 8);
    expect(r.ok && r.norm.labourConstantHrPerUnit).toBe(1.84);
  });

  it("zero or negative consumption lines are skipped", () => {
    expect(labourHoursPerUnit({ resourceDescription: "x", resourceUnit: "day", consumption: 0 }, 8)).toBeNull();
    expect(labourHoursPerUnit({ resourceDescription: "x", resourceUnit: "hr", consumption: -1 }, 8)).toBeNull();
  });
});

describe("deriveNormFromWorkItem — crew sizing without a gang note", () => {
  it("makes the smallest trade 1 worker and scales the rest", () => {
    const r = deriveNormFromWorkItem({
      id: "n", code: "N-1", description: "Two trades", unit: "m2",
      lines: [
        { resourceDescription: "Plasterer", resourceUnit: "hr", consumption: 0.6 },
        { resourceDescription: "Helper", resourceUnit: "hr", consumption: 0.3 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.norm.labourConstantHrPerUnit).toBe(0.9);
    expect(r.norm.crew.map((c) => c.workersPerCrew)).toEqual([2, 1]);
    expect(r.norm.basisNote).toMatch(/confirm the real gang size/);
  });
});

describe("deriveNormFromAssembly", () => {
  const ceiling = {
    id: "a-1", code: "ASM-CEIL-GYP-001", description: "Standard Suspended Gypsum Board Ceiling", unit: "m2",
    dailyOutput: 13.5,
    crew: [
      { resourceId: "r1", roleLabel: "Skilled Mason (Thmar)", quantity: 1 },
      { resourceId: "r2", roleLabel: "General Helper (Kon-Keng)", quantity: 1 },
    ],
  };

  it("crew x hours / daily output = labour constant", () => {
    const r = deriveNormFromAssembly(ceiling, 8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.norm.labourConstantHrPerUnit).toBe(1.1852); // 2 x 8 / 13.5
    expect(r.norm.source).toBe("dwl_assembly");
    expect(r.norm.dwlAssemblyId).toBe("a-1");
    expect(r.norm.crew).toHaveLength(2);
    expect(r.norm.basisNote).toContain("13.5 m2/day");
  });

  it("refuses an assembly without daily output or crew", () => {
    expect(deriveNormFromAssembly({ ...ceiling, dailyOutput: null }).ok).toBe(false);
    expect(deriveNormFromAssembly({ ...ceiling, dailyOutput: 0 }).ok).toBe(false);
    expect(deriveNormFromAssembly({ ...ceiling, crew: [] }).ok).toBe(false);
  });
});
