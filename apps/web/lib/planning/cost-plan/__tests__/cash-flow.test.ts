import { describe, expect, it } from "vitest";
import { cashFlow, DEFAULT_CASH_FLOW, type CashFlowSettings } from "../cash-flow";

const S = (over: Partial<CashFlowSettings> = {}): CashFlowSettings => ({ ...DEFAULT_CASH_FLOW, ...over });
const value = [{ month: "2027-01-01", amount: 1000 }, { month: "2027-02-01", amount: 2000 }, { month: "2027-03-01", amount: 1000 }];

describe("cashFlow", () => {
  it("pays each certificate after the payment lag", () => {
    const r = cashFlow(value, [], S({ paymentLagDays: 30 }));
    // January certified 31 Jan, paid 2 Mar; February certified 28 Feb, paid 30 Mar
    const byMonth = Object.fromEntries(r.rows.map((x) => [x.month, x.cashIn]));
    expect(byMonth["2027-01-01"]).toBe(0);
    expect(byMonth["2027-03-01"]).toBe(3000);
    expect(byMonth["2027-04-01"]).toBe(1000);
    expect(r.totalIn).toBe(4000);
  });

  it("holds retention and releases it at completion and after the defects period", () => {
    const r = cashFlow(value, [], S({ paymentLagDays: 0, retentionPct: 10, retentionReleasePct: 50, dlpMonths: 12 }));
    expect(r.retention).toBe(400);
    expect(r.retentionRelease).toEqual([{ month: "2027-03-01", amount: 200 }, { month: "2028-03-01", amount: 200 }]);
    const mar = r.rows.find((x) => x.month === "2027-03-01")!;
    expect(mar.cashIn).toBe(900 + 200); // certificate less 10 %, plus the first release
    expect(mar.retentionHeld).toBe(200);
    expect(r.rows.at(-1)!.retentionHeld).toBe(0);
    expect(r.totalIn).toBe(4000); // all of it comes back eventually
  });

  it("stops retention at the limit", () => {
    const r = cashFlow(value, [], S({ paymentLagDays: 0, retentionPct: 10, retentionLimitPct: 5 }));
    expect(r.retention).toBe(200); // 5 % of 4000
  });

  it("pays the advance first and recovers it from the certificates", () => {
    const r = cashFlow(value, [], S({ paymentLagDays: 0, advancePct: 10 }));
    expect(r.advance).toBe(400);
    const jan = r.rows.find((x) => x.month === "2027-01-01")!;
    expect(jan.cashIn).toBe(400 + 900);
    expect(r.totalIn).toBe(4000);
  });

  it("recovers what is left of the advance from the last certificate", () => {
    const r = cashFlow(value, [], S({ paymentLagDays: 0, advancePct: 20, advanceRecoveryPct: 5 }));
    // 50 + 100 recovered, 650 left: all of March's 1000 less 650
    expect(r.rows.find((x) => x.month === "2027-03-01")!.cashIn).toBe(350);
    expect(r.totalIn).toBe(4000);
  });

  it("pays costs after the cost lag and finds the funding peak", () => {
    const cost = [{ month: "2027-01-01", amount: 800 }, { month: "2027-02-01", amount: 1600 }, { month: "2027-03-01", amount: 800 }];
    const r = cashFlow(value, cost, S({ paymentLagDays: 60, costLagDays: 0 }));
    expect(r.totalOut).toBe(3200);
    expect(r.peakFunding.amount).toBe(-3200); // nothing comes in before April
    expect(r.peakFunding.month).toBe("2027-03-01");
    expect(r.rows.at(-1)!.cumulativeNet).toBe(800);
  });

  it("is empty without value or cost", () => {
    expect(cashFlow([], [], S()).rows).toEqual([]);
  });
});
