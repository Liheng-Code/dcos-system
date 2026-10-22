import { describe, expect, it } from "vitest";
import { countByState, renewalsByMonth, totals, upcomingRenewals, valueByPlan, type MetricLicense } from "@/lib/metrics";

const lic = (o: Partial<MetricLicense>): MetricLicense => ({
  id: Math.random().toString(),
  number: "DCOS-L-1",
  type: "subscription",
  status: "active",
  state: "active",
  valid_until: "2026-12-31",
  limit_users: 10,
  limit_viewers: 5,
  daysToExpiry: 70,
  tenant: { id: "t1", display_name: "A" },
  plan: { code: "PRO", display_name: "Professional" },
  subscription: { net_amount: 1000, currency: "USD" },
  ...o,
});

const now = Date.parse("2026-10-19T00:00:00Z");

describe("dashboard metrics", () => {
  it("buckets renewal value by the month the term ends, next 12 months only", () => {
    const rows = renewalsByMonth(
      [lic({ valid_until: "2026-12-31" }), lic({ valid_until: "2026-12-05", subscription: { net_amount: 500, currency: "USD" } }), lic({ valid_until: "2028-01-01" })],
      now,
    );
    expect(rows).toHaveLength(12);
    expect(rows[0].key).toBe("2026-10");
    expect(rows.find((r) => r.key === "2026-12")).toMatchObject({ value: 1500, count: 2 });
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(2);
  });

  it("ignores drafts and revoked licenses in money figures", () => {
    const rows = [lic({}), lic({ status: "draft", state: "draft" }), lic({ status: "revoked", state: "revoked" })];
    expect(totals(rows).contractValue).toBe(1000);
    expect(valueByPlan(rows)).toEqual([{ plan: "Professional", value: 1000, count: 1 }]);
  });

  it("reports unlimited seats as null rather than a misleading sum", () => {
    expect(totals([lic({}), lic({ limit_users: 20 })]).seatsSold).toBe(30);
    expect(totals([lic({}), lic({ limit_users: null })]).seatsSold).toBeNull();
  });

  it("counts customers excluding trials", () => {
    const t = totals([lic({ tenant: { id: "a", display_name: "A" } }), lic({ type: "trial", tenant: { id: "b", display_name: "B" } })]);
    expect(t.customers).toBe(1);
    expect(t.trials).toBe(1);
  });

  it("lists renewals within the window, soonest first", () => {
    const rows = upcomingRenewals([lic({ daysToExpiry: 100 }), lic({ daysToExpiry: 30, valid_until: "2026-11-18" }), lic({ daysToExpiry: 5, valid_until: "2026-10-24" })], 90);
    expect(rows.map((r) => r.valid_until)).toEqual(["2026-10-24", "2026-11-18"]);
  });

  it("counts every lifecycle state, including zeros", () => {
    const counts = countByState([lic({}), lic({ state: "grace" })]);
    expect(counts.find((c) => c.state === "grace")?.count).toBe(1);
    expect(counts.find((c) => c.state === "locked")?.count).toBe(0);
  });
});
