// Pure PO approval value bands (doc 07 section 4).
//
// No database or React imports. Mirrors public.procurement_approval_bands, proc_po_required_band,
// proc_user_max_band and proc_validate_bands (migration 20261022150100_procurement_p2_value_bands.sql).
// A band holds amounts with min < amount <= max; band 1 also holds its own minimum (0). Band 5 is open
// ended. A PO goes up one band (cap 5) when it carries an uplift reason (award override, single
// source, over budget). The database enforces all of this; this file drives the screens.

export interface ApprovalBand {
  band: number;
  label: string;
  min_amount: number;
  max_amount: number | null;
  /** Permission action that grants approval in this band, e.g. "po_band3". */
  permission_action: string;
}

export const MAX_BAND = 5;

export type UpliftReason = "award_override" | "single_source" | "over_budget";

const byBand = (bands: readonly ApprovalBand[]) => [...bands].sort((a, b) => a.band - b.band);

/** The band an amount (in the base currency) falls in. Falls back to the top band, as the database does. */
export function bandForAmount(amount: number, bands: readonly ApprovalBand[]): number {
  for (const b of byBand(bands)) {
    const inBand =
      b.band === 1
        ? amount >= b.min_amount && b.max_amount !== null && amount <= b.max_amount
        : amount > b.min_amount && (b.max_amount === null || amount <= b.max_amount);
    if (inBand) return b.band;
  }
  return MAX_BAND;
}

/** Band needed to approve: the amount's band, plus one (capped at 5) when `uplift` is true. */
export function requiredBand(amount: number, bands: readonly ApprovalBand[], uplift: boolean): number {
  const base = bandForAmount(amount, bands);
  return uplift ? Math.min(base + 1, MAX_BAND) : base;
}

/** Highest band the user may approve (0 = none). `can` is asked (band.permission_action, "approve"). */
export function userMaxBand(
  can: (resource: string, field: "approve") => boolean,
  bands: readonly ApprovalBand[],
): number {
  let max = 0;
  for (const b of bands) if (b.band > max && can(b.permission_action, "approve")) max = b.band;
  return max;
}

export type BandInput = Pick<ApprovalBand, "band" | "min_amount" | "max_amount">;

/** Mirrors proc_validate_bands: five bands numbered 1 to 5, starting at 0, contiguous, band 5 open ended. */
export function validateBands(bands: readonly BandInput[]): string | null {
  const sorted = [...bands].sort((a, b) => a.band - b.band);
  let prev = 0;
  let n = 0;
  for (const b of sorted) {
    n += 1;
    if (b.band !== n) return "Bands must be numbered 1 to 5 without gaps.";
    if (!Number.isFinite(b.min_amount) || b.min_amount < 0) return `Band ${b.band} needs a minimum of 0 or more.`;
    if (b.min_amount !== prev) {
      return b.band === 1
        ? `Band 1 must start at 0, got ${b.min_amount}.`
        : `Band ${b.band} must start where band ${b.band - 1} ends (${prev}), got ${b.min_amount}.`;
    }
    if (b.band < MAX_BAND) {
      if (b.max_amount === null || !Number.isFinite(b.max_amount) || b.max_amount <= b.min_amount) {
        return `Band ${b.band} needs a maximum above its minimum.`;
      }
      prev = b.max_amount;
    } else if (b.max_amount !== null) {
      return "Band 5 has no maximum.";
    }
  }
  if (n !== MAX_BAND) return "Exactly 5 bands are required.";
  return null;
}

/**
 * The PO amount the band is based on, before currency conversion: the greatest of grand_total,
 * total_amount and the sum of the line totals (nulls ignored, as in SQL greatest(); 0 if all are null).
 */
export function poBandAmount(
  header: { grand_total?: number | null; total_amount?: number | null },
  lines: ReadonlyArray<{ total_price?: number | null }>,
): number {
  const lineSum = lines.reduce((sum, l) => sum + (l.total_price ?? 0), 0);
  const parts = [header.grand_total, header.total_amount, lines.length > 0 ? lineSum : null];
  return parts.reduce<number>((max, v) => (v === null || v === undefined ? max : Math.max(max, v)), 0);
}
