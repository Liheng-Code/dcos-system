// Commercial figures on a project's Overview, from its variation orders and progress claims.

export interface VariationRow {
  id: string;
  vo_number: string;
  title: string | null;
  status: string;
  total_amount: number | null;
  submitted_at: string | null;
  approved_at: string | null;
}

export interface ClaimRow {
  id: string;
  claim_number: number;
  status: string;
  period_start: string | null;
  period_end: string | null;
  current_payment_due: number | null;
  certified_amount: number | null;
  certified_at: string | null;
  paid_at: string | null;
}

export interface CommercialSummary {
  contractValue: number | null;
  approvedVariations: { count: number; amount: number };
  pendingVariations: { count: number; amount: number };
  /** Certified (or certified then paid) claims, using the certified amount. */
  certifiedToDate: number;
  paidToDate: number;
  certifiedUnpaid: number;
  latestClaim: ClaimRow | null;
}

const num = (v: number | null | undefined) => Number(v ?? 0);

/** Figures for the Overview, from the rows above. Pure, so it can be tested without a database. */
export function summariseCommercial(contractValue: number | null, vos: VariationRow[], claims: ClaimRow[]): CommercialSummary {
  const approved = vos.filter((v) => v.status === "approved" || v.status === "implemented");
  const pending = vos.filter((v) => v.status === "submitted");
  const certified = claims.filter((c) => c.status === "certified" || c.status === "paid");
  const certifiedAmount = (c: ClaimRow) => num(c.certified_amount ?? c.current_payment_due);
  return {
    contractValue,
    approvedVariations: { count: approved.length, amount: approved.reduce((s, v) => s + num(v.total_amount), 0) },
    pendingVariations: { count: pending.length, amount: pending.reduce((s, v) => s + num(v.total_amount), 0) },
    certifiedToDate: certified.reduce((s, c) => s + certifiedAmount(c), 0),
    paidToDate: certified.filter((c) => c.status === "paid").reduce((s, c) => s + certifiedAmount(c), 0),
    certifiedUnpaid: certified.filter((c) => c.status === "certified").reduce((s, c) => s + certifiedAmount(c), 0),
    latestClaim: claims[0] ?? null,
  };
}
