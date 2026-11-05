// Pure rules for RFQ bidder selection by trade: a supplier matches a procurement package when it holds an active
// approved trade (supplier_approved_trades) whose trade_category equals the package's trade_category.

export interface ApprovedTrade {
  supplier_id: string;
  trade_category: string;
  status: string;
  approved_from: string | null;
  approved_until: string | null;
}

/** "  Fire Protection " and "fire protection" are the same trade. */
export function normalizeTrade(t: string | null | undefined): string {
  return (t ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Active on `today` (yyyy-mm-dd): status active and inside its approved dates (open ends allowed). */
export function isTradeCurrent(t: ApprovedTrade, today: string): boolean {
  return t.status === "active" && (!t.approved_from || t.approved_from <= today) && (!t.approved_until || t.approved_until >= today);
}

/** Supplier ids with a current approved trade equal to `tradeCategory`; empty when the package has no trade. */
export function suppliersMatchingTrade(trades: readonly ApprovedTrade[], tradeCategory: string | null | undefined, today: string): Set<string> {
  const want = normalizeTrade(tradeCategory);
  if (!want) return new Set();
  return new Set(trades.filter((t) => isTradeCurrent(t, today) && normalizeTrade(t.trade_category) === want).map((t) => t.supplier_id));
}
