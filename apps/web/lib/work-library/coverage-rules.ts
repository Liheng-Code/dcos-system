// Pure helpers for the Work Library Coverage tab (wl_division_coverage): percentages and their colour band.

export interface DivisionCoverage {
  division_code: string | null; activities: number;
  quantity_based: number; with_norm: number; needs_package: number; with_package: number;
  with_boq: number; with_method_statement: number; with_tc: number; with_shop_drawing: number; with_material: number;
}

/** Columns of the Coverage table: label, part, and the base it is a share of. */
export const COVERAGE_COLUMNS: { key: string; label: string; hint: string; part: keyof DivisionCoverage; base: keyof DivisionCoverage }[] = [
  { key: "norm", label: "Norm", hint: "Quantity-based activities with a library productivity norm", part: "with_norm", base: "quantity_based" },
  { key: "package", label: "Package", hint: "Activities (not self-performed) with a procurement package", part: "with_package", base: "needs_package" },
  { key: "boq", label: "BOQ item", hint: "Activities linked to at least one BOQ item", part: "with_boq", base: "activities" },
  { key: "ms", label: "Method statement", hint: "Activities with a method statement", part: "with_method_statement", base: "activities" },
  { key: "tc", label: "T&C", hint: "Activities with a testing & commissioning item", part: "with_tc", base: "activities" },
  { key: "sd", label: "Shop drawing", hint: "Activities with a shop drawing type", part: "with_shop_drawing", base: "activities" },
  { key: "mat", label: "Material", hint: "Activities with a material", part: "with_material", base: "activities" },
];

/** Whole percent, or null when there is nothing to cover (base 0). */
export function coveragePct(part: number, base: number): number | null {
  return base > 0 ? Math.round((part / base) * 100) : null;
}

export type CoverageBand = "full" | "good" | "low" | "none" | "na";
export function coverageBand(pct: number | null): CoverageBand {
  if (pct === null) return "na";
  if (pct >= 100) return "full";
  if (pct >= 60) return "good";
  if (pct > 0) return "low";
  return "none";
}

/** Sum of every division (the Total row). */
export function totalCoverage(rows: readonly DivisionCoverage[]): DivisionCoverage {
  const keys = ["activities", "quantity_based", "with_norm", "needs_package", "with_package", "with_boq", "with_method_statement", "with_tc", "with_shop_drawing", "with_material"] as const;
  const t = { division_code: null } as DivisionCoverage;
  for (const k of keys) t[k] = rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  return t;
}
