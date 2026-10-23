import { describe, expect, it } from "vitest";
import {
  buildRfqComparison,
  requiredReasonLength,
  type ComparisonPrLine,
  type ComparisonQuotationInput,
  type ComparisonQuotationItem,
} from "../rfq-comparison";

const TODAY = "2026-10-22";

function pr(n: number, quantity = 10): ComparisonPrLine {
  return { id: `pr${n}`, line_no: n, item_code: `C${n}`, item_description: `Item ${n}`, unit: "ea", quantity };
}

function item(q: string, n: number, unitPrice: number, over: Partial<ComparisonQuotationItem> = {}): ComparisonQuotationItem {
  const quantity = over.quantity ?? 10;
  return {
    id: `${q}-i${n}`,
    pr_item_id: `pr${n}`,
    line_no: n,
    item_code: `C${n}`,
    item_description: `Item ${n}`,
    unit: "ea",
    quantity,
    unit_price: unitPrice,
    total: quantity * unitPrice,
    delivery_date: null,
    lead_time_days: null,
    notes: null,
    ...over,
  };
}

/** Quotation covering lines 1..prices.length at the given unit prices (quantity 10). */
function quote(id: string, prices: number[], over: Partial<ComparisonQuotationInput> = {}): ComparisonQuotationInput {
  const items = prices.map((p, i) => item(id, i + 1, p));
  return {
    id,
    supplier_id: `sup-${id}`,
    supplier_name: `Supplier ${id}`,
    currency: "USD",
    total_amount: items.reduce((s, i) => s + i.total, 0),
    valid_until: "2026-12-31",
    delivery_lead_time: 14,
    received_at: "2026-10-10T08:00:00Z",
    combined_score: null,
    status: "pending",
    is_awarded: false,
    items,
    ...over,
  };
}

const LINES = [pr(1), pr(2)];

function build(quotations: ComparisonQuotationInput[], over: { method?: string | null; prLines?: ComparisonPrLine[] } = {}) {
  return buildRfqComparison({
    evaluationMethod: over.method === undefined ? "lowest_price" : over.method,
    prLines: over.prLines ?? LINES,
    quotations,
    today: TODAY,
  });
}

function sup(c: ReturnType<typeof build>, id: string) {
  const s = c.suppliers.find((x) => x.quotationId === id);
  if (!s) throw new Error(`no supplier ${id}`);
  return s;
}

describe("lowest per line", () => {
  it("highlights the cheapest cell on each line", () => {
    const c = build([quote("a", [10, 30]), quote("b", [12, 20])]);
    expect(c.lines[0].lowestUnitPrice).toBe(10);
    expect(c.lines[0].lowestQuotationIds).toEqual(["a"]);
    expect(c.lines[1].lowestQuotationIds).toEqual(["b"]);
    expect(c.lines[1].cells.b?.isLowest).toBe(true);
    expect(c.lines[1].cells.a?.isLowest).toBe(false);
  });

  it("highlights every quotation when the lowest is tied", () => {
    const c = build([quote("a", [10, 30]), quote("b", [10, 20]), quote("c", [11, 25])]);
    expect([...c.lines[0].lowestQuotationIds].sort()).toEqual(["a", "b"]);
    expect(c.lines[0].cells.c?.isLowest).toBe(false);
  });

  it("shows a missing line as null and does not count it as covered", () => {
    const c = build([quote("a", [10, 30]), quote("b", [12])]);
    expect(c.lines[1].cells.b).toBeNull();
    expect(sup(c, "b").coveredLines).toBe(1);
    expect(sup(c, "b").totalLines).toBe(2);
    expect(sup(c, "b").fullCoverage).toBe(false);
    expect(sup(c, "b").eligible).toBe(false);
  });

  it("treats a zero unit price as not covered and ignores it for the lowest", () => {
    const c = build([quote("a", [10, 30]), quote("b", [0, 20])]);
    expect(c.lines[0].cells.b).toBeNull();
    expect(c.lines[0].lowestQuotationIds).toEqual(["a"]);
    expect(sup(c, "b").fullCoverage).toBe(false);
    expect(sup(c, "b").coveredLines).toBe(1);
  });

  it("leaves the lowest empty when nobody quoted a line", () => {
    const c = build([quote("a", [10]), quote("b", [11])]);
    expect(c.lines[1].lowestUnitPrice).toBeNull();
    expect(c.lines[1].lowestQuotationIds).toEqual([]);
  });
});

describe("currency", () => {
  it("uses the most common currency as base and marks others non-comparable", () => {
    const c = build([quote("a", [10, 10]), quote("b", [11, 11]), quote("c", [1, 1], { currency: "EUR" })]);
    expect(c.baseCurrency).toBe("USD");
    expect(sup(c, "c").comparable).toBe(false);
    expect(sup(c, "c").eligible).toBe(false);
    // the cheap EUR quote neither wins a line nor the recommendation
    expect(c.lines[0].lowestQuotationIds).toEqual(["a"]);
    expect(c.lines[0].cells.c).not.toBeNull();
    expect(c.recommendedQuotationId).toBe("a");
  });

  it("breaks a currency count tie alphabetically", () => {
    const c = build([quote("a", [10, 10], { currency: "USD" }), quote("b", [11, 11], { currency: "KHR" })]);
    expect(c.baseCurrency).toBe("KHR");
    expect(sup(c, "a").comparable).toBe(false);
    expect(c.recommendedQuotationId).toBe("b");
  });
});

describe("validity", () => {
  it("marks an expired quotation as ineligible", () => {
    const c = build([quote("a", [1, 1], { valid_until: "2026-10-21" }), quote("b", [10, 10])]);
    expect(sup(c, "a").expired).toBe(true);
    expect(sup(c, "a").eligible).toBe(false);
    expect(c.recommendedQuotationId).toBe("b");
  });

  it("is not expired on the valid_until day itself", () => {
    const c = build([quote("a", [1, 1], { valid_until: TODAY })]);
    expect(sup(c, "a").expired).toBe(false);
    expect(sup(c, "a").expiringSoon).toBe(true);
  });

  it("flags expiring-soon within 7 days but stays eligible", () => {
    const c = build([quote("a", [10, 10], { valid_until: "2026-10-29" }), quote("b", [11, 11], { valid_until: "2026-10-30" })]);
    expect(sup(c, "a").expiringSoon).toBe(true);
    expect(sup(c, "a").eligible).toBe(true);
    expect(sup(c, "b").expiringSoon).toBe(false);
  });

  it("never expires a quotation without valid_until", () => {
    const c = build([quote("a", [10, 10], { valid_until: null })]);
    expect(sup(c, "a").expired).toBe(false);
    expect(sup(c, "a").expiringSoon).toBe(false);
  });
});

describe("rejected quotations", () => {
  it("excludes them from the grid, base currency, recommendation and counts", () => {
    const c = build([
      quote("a", [10, 10]),
      quote("b", [11, 11]),
      quote("r1", [1, 1], { status: "rejected", currency: "EUR" }),
      quote("r2", [1, 1], { status: "rejected", currency: "EUR" }),
    ]);
    expect(c.suppliers.map((s) => s.quotationId).sort()).toEqual(["a", "b"]);
    expect(c.baseCurrency).toBe("USD");
    expect(c.recommendedQuotationId).toBe("a");
    expect(c.quoteCountException).toBe("fewer_than_3_quotes");
    expect(c.lines[0].cells.r1).toBeUndefined();
  });

  it("keeps them when includeRejected is set (awarded RFQ)", () => {
    const c = buildRfqComparison({
      evaluationMethod: "lowest_price",
      prLines: LINES,
      quotations: [
        quote("a", [10, 10], { status: "awarded", is_awarded: true }),
        quote("b", [11, 11], { status: "rejected" }),
      ],
      today: TODAY,
      includeRejected: true,
    });
    expect(c.suppliers.map((s) => s.quotationId).sort()).toEqual(["a", "b"]);
    expect(c.lines[0].lowestQuotationIds).toEqual(["a"]);
    expect(c.recommendedQuotationId).toBe("a");
  });
});

describe("recommendation: lowest price", () => {
  it("recommends the lowest compare total among eligible", () => {
    const c = build([quote("a", [10, 20]), quote("b", [9, 20]), quote("c", [5])]);
    expect(c.recommendedQuotationId).toBe("b");
    expect(sup(c, "b").rank).toBe(1);
    expect(sup(c, "a").rank).toBe(2);
    expect(sup(c, "c").rank).toBeNull();
  });

  it("breaks a total tie by shorter delivery lead time, nulls last", () => {
    const c = build([
      quote("a", [10, 10], { delivery_lead_time: 14 }),
      quote("b", [10, 10], { delivery_lead_time: 7 }),
      quote("c", [10, 10], { delivery_lead_time: null }),
    ]);
    expect(c.recommendedQuotationId).toBe("b");
    expect(sup(c, "c").rank).toBe(3);
  });

  it("then by earlier received_at, nulls last", () => {
    const c = build([
      quote("a", [10, 10], { received_at: "2026-10-12T00:00:00Z" }),
      quote("b", [10, 10], { received_at: "2026-10-11T00:00:00Z" }),
      quote("c", [10, 10], { received_at: null }),
    ]);
    expect(c.recommendedQuotationId).toBe("b");
    expect(sup(c, "c").rank).toBe(3);
  });

  it("then by quotation id ascending", () => {
    const c = build([quote("b", [10, 10]), quote("a", [10, 10])]);
    expect(c.recommendedQuotationId).toBe("a");
  });

  it("uses the sum of lines, not the header total", () => {
    const c = build([quote("a", [10, 10], { total_amount: 1 }), quote("b", [10, 9], { total_amount: 999 })]);
    expect(c.recommendedQuotationId).toBe("b");
    expect(sup(c, "a").compareTotal).toBe(200);
    expect(sup(c, "a").totalMismatch).toBe(true);
    expect(sup(c, "b").totalMismatch).toBe(true);
  });

  it("has no recommendation when nobody is eligible", () => {
    const c = build([quote("a", [10]), quote("b", [10], { valid_until: "2026-01-01" })]);
    expect(c.recommendedQuotationId).toBeNull();
  });

  it("treats a null evaluation method as lowest price", () => {
    const c = build([quote("a", [10, 10], { combined_score: null }), quote("b", [11, 11], { combined_score: 99 })], { method: null });
    expect(c.recommendedQuotationId).toBe("a");
    expect(sup(c, "a").eligible).toBe(true);
  });
});

describe("recommendation: weighted / technical_commercial", () => {
  it("picks the highest combined score even when more expensive", () => {
    const c = build(
      [quote("a", [10, 10], { combined_score: 70 }), quote("b", [20, 20], { combined_score: 85 })],
      { method: "weighted" },
    );
    expect(c.recommendedQuotationId).toBe("b");
  });

  it("excludes quotations with a null score", () => {
    const c = build(
      [quote("a", [1, 1], { combined_score: null }), quote("b", [20, 20], { combined_score: 50 })],
      { method: "technical_commercial" },
    );
    expect(sup(c, "a").eligible).toBe(false);
    expect(sup(c, "a").rank).toBeNull();
    expect(c.recommendedQuotationId).toBe("b");
  });

  it("has no recommendation when every score is null", () => {
    const c = build([quote("a", [1, 1]), quote("b", [2, 2])], { method: "weighted" });
    expect(c.recommendedQuotationId).toBeNull();
  });

  it("keeps a zero score eligible", () => {
    const c = build([quote("a", [1, 1], { combined_score: 0 })], { method: "weighted" });
    expect(sup(c, "a").eligible).toBe(true);
  });

  it("breaks a score tie by lowest total, then lead time", () => {
    const tieTotal = build(
      [quote("a", [12, 12], { combined_score: 80 }), quote("b", [10, 10], { combined_score: 80 })],
      { method: "weighted" },
    );
    expect(tieTotal.recommendedQuotationId).toBe("b");
    const tieLead = build(
      [
        quote("a", [10, 10], { combined_score: 80, delivery_lead_time: 20 }),
        quote("b", [10, 10], { combined_score: 80, delivery_lead_time: 5 }),
      ],
      { method: "weighted" },
    );
    expect(tieLead.recommendedQuotationId).toBe("b");
  });
});

describe("line flags", () => {
  it("flags a quantity differing from the PR line", () => {
    const q = quote("a", [10, 10]);
    q.items[0] = item("a", 1, 10, { quantity: 8 });
    const c = build([q]);
    expect(c.lines[0].cells.a?.qtyMismatch).toBe(true);
    expect(c.lines[1].cells.a?.qtyMismatch).toBe(false);
  });

  it("flags a line total that is not quantity x unit price beyond 0.01", () => {
    const q = quote("a", [10, 10]);
    q.items[0] = item("a", 1, 10, { total: 100.5 });
    q.items[1] = item("a", 2, 10, { total: 100.01 });
    const c = build([q]);
    expect(c.lines[0].cells.a?.lineTotalMismatch).toBe(true);
    expect(c.lines[1].cells.a?.lineTotalMismatch).toBe(false);
  });

  it("ignores quotation lines that point at no PR line", () => {
    const q = quote("a", [10, 10]);
    q.items.push(item("a", 3, 5, { pr_item_id: "unknown" }));
    const c = build([q]);
    expect(c.lines).toHaveLength(2);
    expect(sup(c, "a").coveredLines).toBe(2);
  });
});

describe("no PR lines (line_no fallback)", () => {
  it("keys lines by line_no and requires every priced line", () => {
    const a = quote("a", [10, 10]);
    const b = quote("b", [9]);
    for (const q of [a, b]) q.items.forEach((i) => (i.pr_item_id = null));
    const c = build([a, b], { prLines: [] });
    expect(c.lines.map((l) => l.key)).toEqual(["1", "2"]);
    expect(sup(c, "b").fullCoverage).toBe(false);
    expect(c.recommendedQuotationId).toBe("a");
  });
});

describe("quote count exceptions", () => {
  it("is single_source for one valid quotation", () => {
    expect(build([quote("a", [10, 10])]).quoteCountException).toBe("single_source");
  });
  it("is fewer_than_3_quotes for two", () => {
    expect(build([quote("a", [10, 10]), quote("b", [10, 10])]).quoteCountException).toBe("fewer_than_3_quotes");
  });
  it("is null for three or more", () => {
    expect(build([quote("a", [1, 1]), quote("b", [1, 1]), quote("c", [1, 1])]).quoteCountException).toBeNull();
  });
  it("does not count expired quotations", () => {
    const c = build([quote("a", [1, 1]), quote("b", [1, 1]), quote("c", [1, 1], { valid_until: "2026-10-01" })]);
    expect(c.quoteCountException).toBe("fewer_than_3_quotes");
  });
  it("is null with no quotations at all", () => {
    expect(build([]).quoteCountException).toBeNull();
  });
});

describe("requiredReasonLength", () => {
  const three = () => [quote("a", [10, 10]), quote("b", [11, 11]), quote("c", [12, 12])];

  it("requires only 1 character when awarding the recommendation with 3+ quotes", () => {
    const c = build(three());
    expect(requiredReasonLength({ comparison: c, quotationId: "a" })).toEqual({ min: 1, why: [] });
  });

  it("requires 50 for an override", () => {
    const r = requiredReasonLength({ comparison: build(three()), quotationId: "b" });
    expect(r.min).toBe(50);
    expect(r.why).toEqual(["it differs from the system recommendation"]);
  });

  it("requires 50 and cites currency and override for a non-base currency quotation", () => {
    const c = build([...three(), quote("d", [1, 1], { currency: "EUR" })]);
    const r = requiredReasonLength({ comparison: c, quotationId: "d" });
    expect(r.min).toBe(50);
    expect(r.why).toEqual([
      "it differs from the system recommendation",
      "the quotation is not in the base currency",
    ]);
  });

  it("requires 50 (override) and cites coverage for a partial quotation", () => {
    const c = build([...three(), quote("p", [1])]);
    const r = requiredReasonLength({ comparison: c, quotationId: "p" });
    expect(r.min).toBe(50);
    expect(r.why).toContain("the quotation does not cover every line");
  });

  it("requires 20 for the recommendation when only two valid quotations exist", () => {
    const c = build([quote("a", [10, 10]), quote("b", [11, 11])]);
    expect(requiredReasonLength({ comparison: c, quotationId: "a" })).toEqual({
      min: 20,
      why: ["fewer than 3 valid quotations were received"],
    });
  });

  it("requires 50 for a single source", () => {
    const c = build([quote("a", [10, 10])]);
    expect(requiredReasonLength({ comparison: c, quotationId: "a" })).toEqual({
      min: 50,
      why: ["only one valid quotation was received (single source)"],
    });
  });

  it("requires 50 for any choice when nothing is recommended", () => {
    const c = build([quote("a", [10]), quote("b", [10]), quote("c", [10])]);
    expect(c.recommendedQuotationId).toBeNull();
    const r = requiredReasonLength({ comparison: c, quotationId: "a" });
    expect(r.min).toBe(50);
    expect(r.why).toContain("it differs from the system recommendation");
  });

  it("takes the strictest minimum when rules stack", () => {
    const c = build([quote("a", [10, 10]), quote("b", [11])]);
    const r = requiredReasonLength({ comparison: c, quotationId: "b" });
    expect(r.min).toBe(50);
    expect(r.why).toEqual([
      "it differs from the system recommendation",
      "the quotation does not cover every line",
      "fewer than 3 valid quotations were received",
    ]);
  });
});

describe("demo seed: RFQ-DEMO-CMP-001", () => {
  // A: 10/100/20/25 = 13750 | B: 12/90/18/32 = 14100 | C: 9/105/22, no line 4 = 10550
  const prLines: ComparisonPrLine[] = [
    { id: "l1", line_no: 1, item_code: "DEMO-CEM", item_description: "Cement", unit: "bag", quantity: 100 },
    { id: "l2", line_no: 2, item_code: "DEMO-REB", item_description: "Rebar", unit: "ton", quantity: 50 },
    { id: "l3", line_no: 3, item_code: "DEMO-SAN", item_description: "Sand", unit: "m3", quantity: 200 },
    { id: "l4", line_no: 4, item_code: "DEMO-GRV", item_description: "Gravel", unit: "m3", quantity: 150 },
  ];
  const qty = [100, 50, 200, 150];
  function demo(id: string, prices: number[], over: Partial<ComparisonQuotationInput>): ComparisonQuotationInput {
    const items = prices.map((p, i) => ({
      ...item(id, i + 1, p, { quantity: qty[i] }),
      pr_item_id: `l${i + 1}`,
    }));
    return {
      id,
      supplier_id: `s-${id}`,
      supplier_name: `DEMO Supplier ${id}`,
      currency: "USD",
      total_amount: items.reduce((s, i) => s + i.total, 0),
      valid_until: "2026-11-21",
      delivery_lead_time: 14,
      received_at: "2026-10-17T00:00:00Z",
      combined_score: null,
      status: "pending",
      is_awarded: false,
      items,
      ...over,
    };
  }

  const c = buildRfqComparison({
    evaluationMethod: "lowest_price",
    prLines,
    today: TODAY,
    quotations: [
      demo("A", [10, 100, 20, 25], { delivery_lead_time: 14 }),
      demo("B", [12, 90, 18, 32], { delivery_lead_time: 10 }),
      demo("C", [9, 105, 22], { delivery_lead_time: 21 }),
    ],
  });

  it("recommends A, the lowest total among fully covering quotations", () => {
    expect(c.recommendedQuotationId).toBe("A");
    expect(c.suppliers.map((s) => [s.quotationId, s.compareTotal, s.rank])).toEqual([
      ["A", 13750, 1],
      ["B", 14100, 2],
      ["C", 10550, null],
    ]);
  });

  it("marks C partial and picks the per-line lowest", () => {
    expect(sup(c, "C").coveredLines).toBe(3);
    expect(sup(c, "C").fullCoverage).toBe(false);
    expect(c.lines.map((l) => l.lowestQuotationIds)).toEqual([["C"], ["B"], ["B"], ["A"]]);
    expect(c.lines[3].cells.C).toBeNull();
  });

  it("needs no exception and no reason when awarding A", () => {
    expect(c.quoteCountException).toBeNull();
    expect(requiredReasonLength({ comparison: c, quotationId: "A" })).toEqual({ min: 1, why: [] });
    expect(requiredReasonLength({ comparison: c, quotationId: "C" }).min).toBe(50);
  });
});
