// Drawing geometry for 2D take-off. Points are in PDF page units (viewer zoom 1), so a
// calibration stays valid at any zoom. Lengths scale by metresPerUnit, areas by its square.

export interface Pt {
  x: number;
  y: number;
}

export type CalibrationUnit = "mm" | "cm" | "m";

export interface Calibration {
  /** Metres per PDF page unit. */
  metresPerUnit: number;
}

const UNIT_TO_M: Record<CalibrationUnit, number> = { mm: 0.001, cm: 0.01, m: 1 };

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polylineLength(pts: Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += distance(pts[i - 1], pts[i]);
  return total;
}

export function perimeter(pts: Pt[]): number {
  return pts.length < 2 ? 0 : polylineLength(pts) + distance(pts[pts.length - 1], pts[0]);
}

/** Shoelace formula; absolute area of a simple polygon in page units². */
export function polygonArea(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function calibrate(p1: Pt, p2: Pt, knownDistance: number, unit: CalibrationUnit): Calibration {
  const px = distance(p1, p2);
  if (!(px > 0)) throw new Error("Pick two different points for the calibration");
  if (!(knownDistance > 0) || !Number.isFinite(knownDistance)) throw new Error("The known distance must be greater than zero");
  return { metresPerUnit: (knownDistance * UNIT_TO_M[unit]) / px };
}

export function lengthInMetres(pageUnits: number, cal: Calibration): number {
  return pageUnits * cal.metresPerUnit;
}

export function areaInSquareMetres(pageUnits2: number, cal: Calibration): number {
  return pageUnits2 * cal.metresPerUnit * cal.metresPerUnit;
}

/** Rounds a geometric measurement for use as a calculation input (storage precision). */
export function toQuantityString(v: number, dp = 4): string {
  if (!Number.isFinite(v)) throw new Error("Measurement is not a finite number");
  return v.toFixed(dp);
}
