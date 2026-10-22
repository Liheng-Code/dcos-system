import { describe, expect, it } from "vitest";
import { checkLicenseForm, licenseFormSchema, type RuleFacts } from "@/lib/license-rules";
import { addMonths, displayState } from "@/lib/license-claims";
import { makeLicense } from "./fixtures";

const T = "00000000-0000-4000-8000-000000000002";
const D = "00000000-0000-4000-8000-000000000003";

const facts: RuleFacts = {
  deploymentTenantId: T,
  deploymentStatus: "healthy",
  deploymentBusy: false,
  tenantHadTrial: false,
  planModules: ["qs", "planning"],
  planFeatures: ["ai_qs"],
  previous: null,
};

function form(overrides: Record<string, unknown> = {}) {
  return licenseFormSchema.parse({
    tenantId: T,
    deploymentId: D,
    type: "subscription",
    planId: null,
    validFrom: "2026-10-01",
    durationMonths: 12,
    graceDays: 14,
    readonlyDays: 30,
    modules: ["qs", "planning"],
    features: ["ai_qs"],
    limitUsers: 50,
    limitViewers: 30,
    limitProjects: 20,
    supportTier: "premium",
    netAmount: "",
    ...overrides,
  });
}

describe("checkLicenseForm (design 9.1.4)", () => {
  it("calculates the end date from start and duration (V2)", () => {
    expect(checkLicenseForm(form(), facts)).toEqual({ ok: true, term: { validUntil: "2027-09-30" } });
  });

  it("V1: deployment must belong to the tenant and be free", () => {
    expect(checkLicenseForm(form(), { ...facts, deploymentTenantId: "other" }).ok).toBe(false);
    expect(checkLicenseForm(form(), { ...facts, deploymentBusy: true }).ok).toBe(false);
    expect(checkLicenseForm(form(), { ...facts, deploymentStatus: "decommissioned" }).ok).toBe(false);
  });

  it("V2: subscription up to 36 months, enterprise up to 60", () => {
    expect(checkLicenseForm(form({ durationMonths: 48 }), facts).ok).toBe(false);
    expect(checkLicenseForm(form({ type: "enterprise", durationMonths: 48 }), facts).ok).toBe(true);
    expect(checkLicenseForm(form({ type: "enterprise", validUntil: "2028-06-30" }), facts)).toEqual({
      ok: true,
      term: { validUntil: "2028-06-30" },
    });
  });

  it("V3: trials run 14-60 days, have no grace and happen once", () => {
    const trial = (o: Record<string, unknown>) => form({ type: "trial", graceDays: 0, trialDays: 30, ...o });
    expect(checkLicenseForm(trial({}), facts)).toEqual({ ok: true, term: { validUntil: "2026-10-30" } });
    expect(checkLicenseForm(trial({ trialDays: 90 }), facts).ok).toBe(false);
    expect(checkLicenseForm(trial({ graceDays: 7 }), facts).ok).toBe(false);
    expect(checkLicenseForm(trial({}), { ...facts, tenantHadTrial: true }).ok).toBe(false);
  });

  it("V4: users and projects at least 1, empty means unlimited", () => {
    expect(checkLicenseForm(form({ limitUsers: 0 }), facts).ok).toBe(false);
    expect(checkLicenseForm(form({ limitUsers: "", limitProjects: "" }), facts).ok).toBe(true);
  });

  it("V5: granting beyond the plan needs a reason", () => {
    expect(checkLicenseForm(form({ modules: ["qs", "planning", "hr"] }), facts).ok).toBe(false);
    expect(checkLicenseForm(form({ modules: ["qs", "planning", "hr"], changeReason: "Pilot of HR" }), facts).ok).toBe(true);
  });

  it("V7: API Access cannot be sold yet; unknown modules are refused", () => {
    expect(checkLicenseForm(form({ features: ["api_access"], changeReason: "x" }), facts).ok).toBe(false);
    expect(checkLicenseForm(form({ modules: ["nope"] }), facts).ok).toBe(false);
  });

  it("V8: grace and read-only within bounds", () => {
    expect(checkLicenseForm(form({ graceDays: 90 }), facts).ok).toBe(false);
    expect(checkLicenseForm(form({ type: "enterprise", graceDays: 90 }), facts).ok).toBe(true);
  });

  it("a plan change keeps the current term and needs a reason", () => {
    const prev = { validFrom: "2026-10-01", validUntil: "2027-09-30" };
    const change = form({ fromLicenseId: "00000000-0000-4000-8000-000000000009", keepTerm: true, durationMonths: 3 });
    expect(checkLicenseForm(change, { ...facts, previous: prev, deploymentBusy: true }).ok).toBe(false); // no reason
    expect(checkLicenseForm({ ...change, changeReason: "Upgrade" }, { ...facts, previous: prev, deploymentBusy: true })).toEqual({
      ok: true,
      term: { validUntil: "2027-09-30" },
    });
  });
});

describe("addMonths", () => {
  it("ends the day before the same date a period later, clamping month ends", () => {
    expect(addMonths("2026-01-01", 12)).toBe("2026-12-31");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-27");
    expect(addMonths("2026-10-19", 3)).toBe("2027-01-18");
  });
});

describe("displayState", () => {
  it("uses the tenant lifecycle for live revisions and the status otherwise", () => {
    const at = Date.parse("2027-10-05T12:00:00Z");
    expect(displayState(makeLicense({ status: "active" }), at).state).toBe("grace");
    expect(displayState(makeLicense({ status: "draft" }), at).state).toBe("draft");
    expect(displayState(makeLicense({ status: "suspended", hq_state: "suspended", suspend_mode: "readonly" }), at).state).toBe("suspended");
  });
});
