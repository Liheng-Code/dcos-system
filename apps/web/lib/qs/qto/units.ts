// Units for take-off quantities. A dimension is an exponent vector over length (L), mass (M)
// and count (N); conversion factors are exact decimal strings to the SI base (m, kg, No.).
import { type Dec, dec, div, mul } from "./decimal";

export interface Dimension {
  L: number;
  M: number;
  N: number;
}

export const DIMENSIONLESS: Dimension = { L: 0, M: 0, N: 0 };

interface UnitDef {
  dim: Dimension;
  toBase: string;
}

const UNITS: Record<string, UnitDef> = {
  mm: { dim: { L: 1, M: 0, N: 0 }, toBase: "0.001" },
  cm: { dim: { L: 1, M: 0, N: 0 }, toBase: "0.01" },
  m: { dim: { L: 1, M: 0, N: 0 }, toBase: "1" },
  mm2: { dim: { L: 2, M: 0, N: 0 }, toBase: "0.000001" },
  m2: { dim: { L: 2, M: 0, N: 0 }, toBase: "1" },
  m3: { dim: { L: 3, M: 0, N: 0 }, toBase: "1" },
  "No.": { dim: { L: 0, M: 0, N: 1 }, toBase: "1" },
  kg: { dim: { L: 0, M: 1, N: 0 }, toBase: "1" },
  tonne: { dim: { L: 0, M: 1, N: 0 }, toBase: "1000" },
  "": { dim: DIMENSIONLESS, toBase: "1" },
};

const ALIASES: Record<string, string> = {
  "m²": "m2", "m³": "m3", sqm: "m2", cum: "m3", nr: "No.", no: "No.", "no.": "No.", ea: "No.", each: "No.",
  t: "tonne", ton: "tonne", "-": "",
};

/** Units allowed on a take-off item (the qto_items.unit CHECK constraint). */
export const ITEM_UNITS = ["m", "m2", "m3", "No.", "kg", "tonne"] as const;
export type ItemUnit = (typeof ITEM_UNITS)[number];

export function normalizeUnit(unit: string | null | undefined): string | null {
  const u = (unit ?? "").trim();
  if (u in UNITS) return u;
  const alias = ALIASES[u.toLowerCase()] ?? ALIASES[u];
  return alias !== undefined ? alias : null;
}

export function isKnownUnit(unit: string | null | undefined): boolean {
  return normalizeUnit(unit) !== null;
}

export function dimensionOf(unit: string): Dimension {
  const u = normalizeUnit(unit);
  if (u === null) throw new UnitError(`Unknown unit "${unit}"`);
  return UNITS[u].dim;
}

export class UnitError extends Error {}

export function sameDimension(a: Dimension, b: Dimension): boolean {
  return a.L === b.L && a.M === b.M && a.N === b.N;
}

export function multiplyDims(a: Dimension, b: Dimension): Dimension {
  return { L: a.L + b.L, M: a.M + b.M, N: a.N + b.N };
}

export function divideDims(a: Dimension, b: Dimension): Dimension {
  return { L: a.L - b.L, M: a.M - b.M, N: a.N - b.N };
}

export function describeDimension(d: Dimension): string {
  const parts: string[] = [];
  if (d.L) parts.push(d.L === 1 ? "length" : d.L === 2 ? "area" : d.L === 3 ? "volume" : `length^${d.L}`);
  if (d.M) parts.push(d.M === 1 ? "mass" : `mass^${d.M}`);
  if (d.N) parts.push(d.N === 1 ? "count" : `count^${d.N}`);
  return parts.length ? parts.join("·") : "a plain number";
}

/** Value in `unit` → value in the SI base unit of its dimension. */
export function toBase(value: Dec, unit: string): Dec {
  const u = normalizeUnit(unit);
  if (u === null) throw new UnitError(`Unknown unit "${unit}"`);
  return mul(value, dec(UNITS[u].toBase));
}

/** Value in the SI base unit → value in `unit`. */
export function fromBase(value: Dec, unit: string): Dec {
  const u = normalizeUnit(unit);
  if (u === null) throw new UnitError(`Unknown unit "${unit}"`);
  return div(value, dec(UNITS[u].toBase));
}

/** Converts between units of the same dimension; throws on incompatible units. */
export function convert(value: Dec, from: string, to: string): Dec {
  const a = dimensionOf(from);
  const b = dimensionOf(to);
  if (!sameDimension(a, b)) {
    throw new UnitError(`Cannot convert ${from} (${describeDimension(a)}) to ${to} (${describeDimension(b)})`);
  }
  return fromBase(toBase(value, from), to);
}
