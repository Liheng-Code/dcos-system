import { describe, expect, it } from "vitest";
import { tenderValue, tenderValueCaption } from "../tender-value";

describe("tenderValue", () => {
  it("prefers the approved bid price", () => {
    const v = tenderValue({ bid_price: 3_000_000, estimated_value: 3_200_000 }, { revision_no: 4, total_bid_price: 2_900_000 });
    expect(v).toEqual({ kind: "approved", amount: 3_000_000, revisionNo: null });
    expect(tenderValueCaption(v)).toBe("Approved bid price");
  });

  it("uses the latest revision while pricing is open, over a legacy manual figure", () => {
    const v = tenderValue({ bid_price: null, estimated_value: 500_000 }, { revision_no: 2, total_bid_price: 480_000 });
    expect(v).toEqual({ kind: "estimate", amount: 480_000, revisionNo: 2 });
    expect(tenderValueCaption(v)).toBe("Current estimate · Rev 2");
  });

  it("falls back to the legacy manual estimate when no revision exists", () => {
    const v = tenderValue({ bid_price: null, estimated_value: 300_000 }, null);
    expect(v.kind).toBe("manual");
    expect(tenderValueCaption(v)).toBe("Manual estimate (legacy)");
  });

  it("reports not estimated when nothing is available", () => {
    expect(tenderValue({ bid_price: null, estimated_value: null }, { revision_no: 1, total_bid_price: null }).kind).toBe("none");
    expect(tenderValue(null, null).kind).toBe("none");
  });
});
