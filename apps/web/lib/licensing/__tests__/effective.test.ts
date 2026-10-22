import { describe, expect, it } from "vitest";
import { computeEffective } from "@/lib/licensing/effective";
import { at, makeClaims } from "./fixtures";

const usage = { users: 4, viewers: 2, projects: 1 };

describe("computeEffective lifecycle (design 5.2)", () => {
  const claims = makeClaims(); // until 2026-12-31, grace 14, read-only 30

  const cases: [string, string, string][] = [
    ["2026-06-01", "active", "full"],
    ["2026-11-15", "expiring", "full"], // within 60 days
    ["2026-12-31", "expiring", "full"], // last day of the term
    ["2027-01-01", "grace", "full"],
    ["2027-01-14", "grace", "full"], // last grace day
    ["2027-01-15", "readonly", "readonly"],
    ["2027-02-13", "readonly", "readonly"], // last read-only day
    ["2027-02-14", "locked", "locked"],
    ["2025-12-31", "unlicensed", "locked"], // before lic.from
  ];
  for (const [day, state, access] of cases) {
    it(`${day} is ${state}`, () => {
      const eff = computeEffective("enforce", claims, at(day), usage);
      expect(eff.state).toBe(state);
      expect(eff.access).toBe(access);
    });
  }

  it("reports the last day of each phase", () => {
    const eff = computeEffective("enforce", claims, at("2026-06-01"), usage);
    expect(eff.until).toBe("2026-12-31");
    expect(eff.graceUntil).toBe("2027-01-14");
    expect(eff.readonlyUntil).toBe("2027-02-13");
  });

  it("drops modules to the always-on set and features to none once locked", () => {
    const eff = computeEffective("enforce", claims, at("2027-03-01"), usage);
    expect(eff.modules).toEqual(["project", "administration"]);
    expect(eff.features).toEqual([]);
  });

  it("keeps modules but no AI features in read-only", () => {
    const eff = computeEffective("enforce", claims, at("2027-01-20"), usage);
    expect(eff.modules).toContain("qs");
    expect(eff.features).toEqual([]);
  });
});

describe("computeEffective modes and HQ state", () => {
  it("off grants everything and enforces nothing", () => {
    const eff = computeEffective("off", null, at("2026-06-01"), usage);
    expect(eff.state).toBe("off");
    expect(eff.access).toBe("full");
    expect(eff.enforced).toBe(false);
    expect(eff.modules).toContain("hr");
  });

  it("off still describes an installed license without restricting anything", () => {
    const eff = computeEffective("off", makeClaims(), at("2026-06-01"), usage);
    expect(eff.state).toBe("off");
    expect(eff.access).toBe("full");
    expect(eff.until).toBe("2026-12-31");
    expect(eff.limits.users.limit).toBe(10);
    expect(eff.modules).not.toContain("hr");
  });

  it("no valid token is locked", () => {
    const eff = computeEffective("enforce", null, at("2026-06-01"), usage, "Invalid signature.");
    expect(eff.state).toBe("unlicensed");
    expect(eff.access).toBe("locked");
    expect(eff.tokenError).toBe("Invalid signature.");
  });

  it("report mode computes the same state but does not enforce", () => {
    const eff = computeEffective("report", makeClaims(), at("2027-03-01"), usage);
    expect(eff.state).toBe("locked");
    expect(eff.enforced).toBe(false);
  });

  it("suspension follows its mode", () => {
    expect(computeEffective("enforce", makeClaims({ hq_state: "suspended", suspend_mode: "readonly" }), at("2026-06-01"), usage).access).toBe("readonly");
    expect(computeEffective("enforce", makeClaims({ hq_state: "suspended", suspend_mode: "locked" }), at("2026-06-01"), usage).access).toBe("locked");
  });

  it("revoked is locked", () => {
    expect(computeEffective("enforce", makeClaims({ hq_state: "revoked" }), at("2026-06-01"), usage).access).toBe("locked");
  });
});

describe("computeEffective limits (design 7.4, 7.5)", () => {
  it("flags at-limit and over-limit separately per seat class", () => {
    const eff = computeEffective("enforce", makeClaims(), at("2026-06-01"), { users: 10, viewers: 6, projects: 2 });
    expect(eff.limits.users).toMatchObject({ used: 10, limit: 10, atLimit: true, over: false });
    expect(eff.limits.viewers).toMatchObject({ used: 6, limit: 5, over: true });
    expect(eff.limits.projects).toMatchObject({ atLimit: false, over: false });
  });

  it("treats a null limit as unlimited", () => {
    const claims = makeClaims({}, { limits: { users: null, viewers: null, projects: null } });
    const eff = computeEffective("enforce", claims, at("2026-06-01"), { users: 999, viewers: 999, projects: 999 });
    expect(eff.limits.users.atLimit).toBe(false);
  });
});
