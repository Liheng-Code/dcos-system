// Which figure represents a pre-contract project's value. Our value is never typed at project
// creation; it comes from Cost Estimation (tender_bid_summaries):
//   1. approved  – the bid price locked on approval (project_precontract_details.bid_price)
//   2. estimate  – the latest bid summary revision's total, while pricing is still open
//   3. manual    – an estimated_value typed before this rule existed (legacy, shown as such)
//   4. none      – not estimated yet
// The client's budget (tender_register.budget_range) is the client's figure, not ours, and is
// shown separately as "Client Budget".

export type TenderValueKind = "approved" | "estimate" | "manual" | "none";

export interface TenderValue {
  kind: TenderValueKind;
  amount: number | null;
  revisionNo: number | null;
}

export interface LatestBidRevision {
  revision_no: number;
  total_bid_price: number | null;
}

export function tenderValue(
  details: { bid_price: number | null; estimated_value: number | null } | null | undefined,
  latest: LatestBidRevision | null | undefined,
): TenderValue {
  if (details?.bid_price != null) return { kind: "approved", amount: Number(details.bid_price), revisionNo: null };
  if (latest && latest.total_bid_price != null) {
    return { kind: "estimate", amount: Number(latest.total_bid_price), revisionNo: latest.revision_no };
  }
  if (details?.estimated_value != null) return { kind: "manual", amount: Number(details.estimated_value), revisionNo: null };
  return { kind: "none", amount: null, revisionNo: null };
}

/** Short caption explaining where the figure comes from. */
export function tenderValueCaption(v: TenderValue): string {
  switch (v.kind) {
    case "approved": return "Approved bid price";
    case "estimate": return `Current estimate · Rev ${v.revisionNo}`;
    case "manual": return "Manual estimate (legacy)";
    default: return "Not yet estimated";
  }
}
