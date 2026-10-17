// Productivity engine: pure, deterministic. The UI and the generation service call this; formulas never live in components.
//   adjusted rate = base rate x product(factors)       (units per working day)
//   duration      = quantity / adjusted rate           (rounded up to the step, default 1 working day)

import type { ProductivityFactor } from "./types";

export interface RateBasis {
  /** Direct crew output per working day (plan_productivity_norms.output_per_day). */
  output_per_day: number | null;
  /** Fallback: labour-hours per unit with the crew size and day length. */
  labour_constant_hr_per_unit: number;
  crew_workers: number;
  hours_per_day: number;
  efficiency_pct?: number;
}

/** Base output per working day, or null when it cannot be derived. */
export function baseOutputPerDay(b: RateBasis): number | null {
  if (b.output_per_day != null && b.output_per_day > 0) return b.output_per_day;
  if (b.labour_constant_hr_per_unit > 0 && b.crew_workers > 0 && b.hours_per_day > 0) {
    const eff = (b.efficiency_pct ?? 100) / 100;
    return (b.crew_workers * b.hours_per_day * eff) / b.labour_constant_hr_per_unit;
  }
  return null;
}

export function combinedFactor(factors: Pick<ProductivityFactor, "value">[]): number {
  return factors.reduce((acc, f) => acc * (f.value > 0 ? f.value : 1), 1);
}

export interface AdjustedProductivity {
  base: number;
  factor: number;
  adjusted: number;
}

export function adjustedProductivity(base: number, factors: Pick<ProductivityFactor, "value">[]): AdjustedProductivity {
  const factor = combinedFactor(factors);
  return { base, factor, adjusted: base * factor };
}

export interface DurationResult {
  raw_days: number;
  days: number;
}

/** step: 1 = whole working days (default), 0.5 = half days. Minimum one step when quantity > 0. */
export function calculateDuration(quantity: number, adjustedPerDay: number, step = 1): DurationResult | null {
  if (!(quantity >= 0) || !(adjustedPerDay > 0) || !(step > 0)) return null;
  const raw = quantity / adjustedPerDay;
  if (raw === 0) return { raw_days: 0, days: 0 };
  const days = Math.max(step, Math.ceil(raw / step - 1e-9) * step);
  return { raw_days: raw, days };
}
