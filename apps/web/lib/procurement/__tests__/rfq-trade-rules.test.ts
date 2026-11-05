import { describe, expect, it } from "vitest";
import { isTradeCurrent, normalizeTrade, suppliersMatchingTrade, type ApprovedTrade } from "../rfq-trade-rules";

const t = (o: Partial<ApprovedTrade>): ApprovedTrade => ({ supplier_id: "s1", trade_category: "Waterproofing", status: "active", approved_from: null, approved_until: null, ...o });
const today = "2026-11-04";

describe("RFQ trade matching", () => {
  it("normalises trade names", () => {
    expect(normalizeTrade("  Fire   Protection ")).toBe("fire protection");
    expect(normalizeTrade(null)).toBe("");
  });

  it("only counts active trades inside their dates", () => {
    expect(isTradeCurrent(t({}), today)).toBe(true);
    expect(isTradeCurrent(t({ status: "suspended" }), today)).toBe(false);
    expect(isTradeCurrent(t({ approved_until: "2026-11-03" }), today)).toBe(false);
    expect(isTradeCurrent(t({ approved_from: "2026-11-05" }), today)).toBe(false);
    expect(isTradeCurrent(t({ approved_from: "2026-01-01", approved_until: "2026-11-04" }), today)).toBe(true);
  });

  it("matches suppliers to the package trade", () => {
    const trades = [
      t({ supplier_id: "a", trade_category: "waterproofing " }),
      t({ supplier_id: "b", trade_category: "Roofing" }),
      t({ supplier_id: "c", status: "revoked" }),
    ];
    expect([...suppliersMatchingTrade(trades, "Waterproofing", today)]).toEqual(["a"]);
    expect(suppliersMatchingTrade(trades, null, today).size).toBe(0);
  });
});
