import { describe, expect, it } from "vitest";
import { effectiveRate, QS_CATEGORY, rateLabel } from "../resource-rate";

const qs = { rate: 22.482, unit: "day", currency: "USD" };

describe("resource rate", () => {
  it("uses the override when set", () => {
    expect(effectiveRate({ cost_per_unit: 12, unit_label: "worker" }, qs)).toEqual({ rate: 12, unit: "worker", currency: "USD", source: "override" });
  });

  it("falls back to the QS rate and its unit", () => {
    expect(effectiveRate({ cost_per_unit: null, unit_label: "worker" }, qs)).toEqual({ rate: 22.482, unit: "day", currency: "USD", source: "qs" });
  });

  it("has no rate when unlinked or the QS resource is unpriced", () => {
    expect(effectiveRate({ cost_per_unit: null, unit_label: "hr" }, null).source).toBe("none");
    expect(effectiveRate({ cost_per_unit: null, unit_label: "hr" }, { ...qs, rate: null }).source).toBe("none");
  });

  it("an override of 0 is still an override", () => {
    expect(effectiveRate({ cost_per_unit: 0, unit_label: null }, qs).source).toBe("override");
  });

  it("formats the rate", () => {
    expect(rateLabel({ rate: 22.482, unit: "day", currency: "USD" })).toBe("22.48 USD/day");
    expect(rateLabel({ rate: 12, unit: null, currency: null })).toBe("12");
    expect(rateLabel({ rate: null, unit: "day", currency: "USD" })).toBe("-");
  });

  it("maps resource types to QS categories", () => {
    expect(QS_CATEGORY.subcontractor).toBe("subcon");
    expect(QS_CATEGORY.labor).toBe("labor");
  });
});
