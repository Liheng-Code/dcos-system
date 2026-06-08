/**
 * Cambodia Tax on Salary (TOS) calculation.
 * Supports both DB-driven KHR brackets and legacy hardcoded mode.
 *
 * DB-driven mode: pass tos_brackets from the database.
 * Legacy mode: calculatePIT() uses hardcoded USD brackets for backward compat.
 */

// ─── DB-driven TOS calculation ────────────────────────────────────────────────

export interface TOSBracket {
  from_khr: number;
  to_khr: number | null;
  rate_percent: number;
  tolerance_khr?: number;
}

export interface DependentRelief {
  spouse: number;    // KHR per month (0 if not applicable)
  children: number;  // KHR per month per child × num_children
}

/**
 * Calculate Cambodia TOS from DB brackets using the short method:
 *   TOS = (TaxableIncome × Rate) − Tolerance
 *
 * All amounts in KHR.
 * Returns TOS amount in KHR.
 */
export function calculateTOS_KHR(
  grossIncomeKHR: number,
  brackets: TOSBracket[],
  relief: DependentRelief,
): number {
  const totalRelief = relief.spouse + relief.children;
  const taxableKHR = Math.max(0, grossIncomeKHR - totalRelief);
  if (taxableKHR <= 0) return 0;

  const sorted = [...brackets].sort((a, b) => a.from_khr - b.from_khr);

  let applicableBracket = sorted[0];
  for (const bracket of sorted) {
    applicableBracket = bracket;
    if (bracket.to_khr === null || taxableKHR <= bracket.to_khr) break;
  }

  const rate = applicableBracket.rate_percent / 100;
  const tolerance = applicableBracket.tolerance_khr ?? 0;
  const tos = taxableKHR * rate - tolerance;

  return Math.round(Math.max(0, tos));
}

/**
 * Calculate TOS for a resident employee, returning amount in USD.
 * @param grossUSD - gross salary in USD
 * @param exchangeRate - KHR per 1 USD (e.g. 4000)
 * @param brackets - active TOS brackets from tos_brackets table
 * @param relief - dependent relief object
 */
export function calculateTOS_USD(
  grossUSD: number,
  exchangeRate: number,
  brackets: TOSBracket[],
  relief: DependentRelief,
): number {
  const grossKHR = grossUSD * exchangeRate;
  const tosKHR = calculateTOS_KHR(grossKHR, brackets, relief);
  return Math.round((tosKHR / exchangeRate) * 100) / 100;
}

/**
 * Non-resident flat 20% TOS.
 */
export function calculateNonResidentTOS(grossUSD: number, ratePercent = 20): number {
  return Math.round(grossUSD * (ratePercent / 100) * 100) / 100;
}

// ─── NSSF calculation (DB-driven) ────────────────────────────────────────────

export interface NSSFRuleSimple {
  contribution_type: string;
  contributor: string;
  rate_percent: number;
  max_wage_base: number | null;
  apply_cap: boolean;
}

/**
 * Calculate NSSF contribution for one side (employee or employer).
 */
export function calculateNSSF(
  grossUSD: number,
  rules: NSSFRuleSimple[],
  contributor: "employee" | "employer",
): number {
  let total = 0;
  for (const rule of rules) {
    if (rule.contributor !== contributor) continue;
    const base = rule.apply_cap && rule.max_wage_base
      ? Math.min(grossUSD, rule.max_wage_base)
      : grossUSD;
    total += base * (rule.rate_percent / 100);
  }
  return Math.round(total * 100) / 100;
}

// ─── Legacy hardcoded mode (backward compatibility) ───────────────────────────

interface Bracket {
  upTo: number;
  rate: number;
}

/** Hardcoded USD brackets — used as fallback when DB rules not available. */
const LEGACY_BRACKETS: Bracket[] = [
  { upTo: 125,      rate: 0.00 },
  { upTo: 500,      rate: 0.05 },
  { upTo: 1250,     rate: 0.10 },
  { upTo: 8500,     rate: 0.15 },
  { upTo: Infinity, rate: 0.20 },
];

export function calculatePIT(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const bracket of LEGACY_BRACKETS) {
    const band = Math.min(taxableIncome, bracket.upTo) - prev;
    if (band <= 0) break;
    tax += band * bracket.rate;
    prev = bracket.upTo;
  }
  return Math.round(tax * 100) / 100;
}

/** Legacy NSSF — 2% of gross, capped at $450 base. */
export function calculateNSSF_EE(grossSalary: number): number {
  return Math.round(Math.min(grossSalary, 450) * 0.02 * 100) / 100;
}

/** Legacy NSSF employer — 2.6% of gross, capped at $450 base. */
export function calculateNSSF_ER(grossSalary: number): number {
  return Math.round(Math.min(grossSalary, 450) * 0.026 * 100) / 100;
}
