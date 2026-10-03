import { describe, expect, it } from "vitest";
import {
  matchRule,
  missingMatchFields,
  planProvision,
  type AssignmentRule,
  type ExistingState,
  type ProvisionProfile,
} from "../assignment-rules";

function rule(over: Partial<AssignmentRule>): AssignmentRule {
  return {
    id: "r1", name: "Rule", priority: 100, is_active: true,
    m_employment_type: null, m_employment_category: null, m_labor_category: null,
    m_department_id: null, m_position_id: null, m_company_id: null,
    leave_group: null, payroll_group: null, shift_id: null, default_site_id: null,
    ot_eligible: null, tax_applicable: null, nssf_applicable: null,
    payroll_type: null, currency: null, note: null,
    ...over,
  };
}

function profile(over: Partial<ProvisionProfile> = {}): ProvisionProfile {
  return {
    id: "e1", full_name: "Test", employee_id: "EMP-1",
    employment_type: "permanent", employment_category: "site_staff", labor_category: "site_staff",
    department_id: "d1", position_id: "p1", company_id: "c1",
    leave_group: null, payroll_group: null, report_to: "m1",
    ...over,
  };
}

const NOTHING: ExistingState = {
  hasPayrollProfile: false, hasTaxProfile: false, hasNssfProfile: false,
  hasShiftAssignment: false, hasSiteAssignment: false, hasReportingLine: false,
};
const EVERYTHING: ExistingState = {
  hasPayrollProfile: true, hasTaxProfile: true, hasNssfProfile: true,
  hasShiftAssignment: true, hasSiteAssignment: true, hasReportingLine: true,
};

describe("matchRule", () => {
  it("treats null match columns as wildcards", () => {
    expect(matchRule(profile(), [rule({ id: "any" })])?.id).toBe("any");
  });

  it("requires every set match column to equal the profile value", () => {
    const r = rule({ m_employment_type: "permanent", m_labor_category: "construction_labor" });
    expect(matchRule(profile(), [r])).toBeNull();
    expect(matchRule(profile({ labor_category: "construction_labor" }), [r])).toBe(r);
  });

  it("ignores inactive rules", () => {
    expect(matchRule(profile(), [rule({ is_active: false })])).toBeNull();
  });

  it("picks the lowest priority number", () => {
    const rules = [rule({ id: "b", priority: 50 }), rule({ id: "a", priority: 10 })];
    expect(matchRule(profile(), rules)?.id).toBe("a");
  });

  it("breaks a priority tie by specificity, then name", () => {
    const wide = rule({ id: "wide", name: "A" });
    const narrow = rule({ id: "narrow", name: "B", m_employment_type: "permanent" });
    expect(matchRule(profile(), [wide, narrow])?.id).toBe("narrow");
    const x = rule({ id: "x", name: "X" });
    const y = rule({ id: "y", name: "Y" });
    expect(matchRule(profile(), [y, x])?.id).toBe("x");
  });
});

describe("missingMatchFields", () => {
  it("lists the master fields a rule could match on that are empty", () => {
    expect(missingMatchFields(profile({ labor_category: null, position_id: null }))).toEqual([
      "labor_category",
      "position_id",
    ]);
  });
});

describe("planProvision", () => {
  const full = rule({
    name: "Site staff",
    leave_group: "site_staff", payroll_group: "monthly_usd",
    shift_id: "s1", default_site_id: "site1",
    ot_eligible: true, tax_applicable: true, nssf_applicable: true,
    payroll_type: "monthly", currency: "USD",
  });

  it("creates every dependent record from a complete rule", () => {
    const plan = planProvision(profile(), [full], NOTHING);
    expect(plan.rule?.name).toBe("Site staff");
    expect(plan.actions.map((a) => a.kind)).toEqual([
      "profile_fields", "reporting_line", "payroll_profile", "tax_profile",
      "nssf_profile", "shift_assignment", "site_assignment",
    ]);
    expect(plan.issues).toEqual([]);
  });

  it("never overwrites what the master already holds", () => {
    const plan = planProvision(profile({ leave_group: "manager", payroll_group: "executive" }), [full], NOTHING);
    expect(plan.actions.find((a) => a.kind === "profile_fields")).toBeUndefined();
    const pp = plan.actions.find((a) => a.kind === "payroll_profile");
    expect(pp && pp.values.payroll_group).toBe("executive");
  });

  it("does nothing for an employee that already has everything", () => {
    const plan = planProvision(profile({ leave_group: "site_staff", payroll_group: "monthly_usd" }), [full], EVERYTHING);
    expect(plan.actions).toEqual([]);
  });

  it("reports why when no rule matches, naming the empty master fields", () => {
    const plan = planProvision(profile({ employment_type: null }), [rule({ m_employment_type: "permanent" })], NOTHING);
    expect(plan.rule).toBeNull();
    expect(plan.issues.join(" ")).toContain("employment_type");
  });

  it("skips the payroll profile and says why when the rule lacks pay settings", () => {
    const plan = planProvision(profile(), [rule({ name: "Thin", shift_id: "s1" })], NOTHING);
    expect(plan.actions.find((a) => a.kind === "payroll_profile")).toBeUndefined();
    expect(plan.issues.some((i) => i.includes("payroll"))).toBe(true);
  });

  it("flags a missing reporting manager", () => {
    const plan = planProvision(profile({ report_to: null }), [full], NOTHING);
    expect(plan.issues).toContain("No reporting manager set in Employee Master");
  });
});
