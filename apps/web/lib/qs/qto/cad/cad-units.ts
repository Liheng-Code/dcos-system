// DXF drawing units ($INSUNITS) → metres per drawing unit.

const METRES: Record<number, { m: number; label: string }> = {
  1: { m: 0.0254, label: "in" },
  2: { m: 0.3048, label: "ft" },
  3: { m: 1609.344, label: "mi" },
  4: { m: 0.001, label: "mm" },
  5: { m: 0.01, label: "cm" },
  6: { m: 1, label: "m" },
  7: { m: 1000, label: "km" },
  8: { m: 2.54e-8, label: "µin" },
  9: { m: 2.54e-5, label: "mil" },
  10: { m: 0.9144, label: "yd" },
  11: { m: 1e-10, label: "Å" },
  12: { m: 1e-9, label: "nm" },
  13: { m: 1e-6, label: "µm" },
  14: { m: 0.1, label: "dm" },
  15: { m: 10, label: "dam" },
  16: { m: 100, label: "hm" },
  17: { m: 1e9, label: "Gm" },
  21: { m: 1200 / 3937, label: "US survey ft" },
};

/** Metres per drawing unit, or null for unitless (0) and unknown codes. */
export function metresPerUnit(insUnits: number): number | null {
  return METRES[insUnits]?.m ?? null;
}

export function unitLabel(insUnits: number): string | null {
  return METRES[insUnits]?.label ?? null;
}

/** Units a user can choose for a unitless drawing (code, label). */
export const CHOOSABLE_UNITS: [number, string][] = [[4, "Millimetres"], [5, "Centimetres"], [6, "Metres"], [1, "Inches"], [2, "Feet"]];
