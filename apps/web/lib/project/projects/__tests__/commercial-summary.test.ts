import { describe, expect, it } from "vitest";
import { summariseCommercial, type ClaimRow, type VariationRow } from "@/lib/project/projects/commercial-summary";

const vo = (status: string, total_amount: number | null): VariationRow => ({
  id: `${status}-${total_amount}`, vo_number: "VO-1", title: null, status, total_amount, submitted_at: null, approved_at: null,
});
const claim = (claim_number: number, status: string, certified_amount: number | null, current_payment_due: number | null = 0): ClaimRow => ({
  id: `${claim_number}`, claim_number, status, period_start: null, period_end: null,
  current_payment_due, certified_amount, certified_at: null, paid_at: null,
});

describe("summariseCommercial", () => {
  it("counts approved and implemented variations as approved, submitted ones as pending", () => {
    const s = summariseCommercial(100000, [vo("implemented", 9000), vo("approved", 1000), vo("submitted", 500), vo("draft", 7), vo("rejected", 3)], []);
    expect(s.approvedVariations).toEqual({ count: 2, amount: 10000 });
    expect(s.pendingVariations).toEqual({ count: 1, amount: 500 });
    expect(s.contractValue).toBe(100000);
  });

  it("totals certified claims by their certified amount, split into paid and unpaid", () => {
    const s = summariseCommercial(null, [], [claim(3, "certified", 300), claim(2, "paid", 200), claim(1, "draft", null, 999)]);
    expect(s.certifiedToDate).toBe(500);
    expect(s.paidToDate).toBe(200);
    expect(s.certifiedUnpaid).toBe(300);
  });

  it("falls back to the payment due when a paid claim has no certified amount", () => {
    expect(summariseCommercial(null, [], [claim(1, "paid", null, 1425)]).paidToDate).toBe(1425);
  });

  it("takes the first claim (newest period) as the latest", () => {
    const s = summariseCommercial(null, [], [claim(4, "draft", null), claim(1, "paid", 10)]);
    expect(s.latestClaim?.claim_number).toBe(4);
  });

  it("is all zero for a project with no commercial records", () => {
    const s = summariseCommercial(null, [], []);
    expect([s.certifiedToDate, s.paidToDate, s.certifiedUnpaid, s.approvedVariations.count]).toEqual([0, 0, 0, 0]);
    expect(s.latestClaim).toBeNull();
  });
});
