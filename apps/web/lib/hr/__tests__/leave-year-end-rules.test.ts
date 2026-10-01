import { describe, expect, it } from "vitest";
import {
  applyRounding,
  findRule,
  formatDate,
  includeLeaveTypeInGeneratedPreview,
  leaveTypeAppliesToProfile,
  numeric,
  serviceYears,
} from "../leave-year-end-rules";

describe("numeric", () => {
  it("reads numbers and numeric strings, and treats missing or invalid values as zero", () => {
    expect(numeric(4.5)).toBe(4.5);
    expect(numeric("18.00")).toBe(18);
    expect(numeric(null)).toBe(0);
    expect(numeric(undefined)).toBe(0);
    expect(numeric("abc")).toBe(0);
  });
});

describe("applyRounding", () => {
  it("rounds to the nearest half day", () => {
    expect(applyRounding(7.2, "nearest_half")).toBe(7);
    expect(applyRounding(7.25, "nearest_half")).toBe(7.5);
    expect(applyRounding(7.8, "nearest_half")).toBe(8);
  });

  it("rounds to the nearest whole day, up, or down", () => {
    expect(applyRounding(7.5, "nearest_whole")).toBe(8);
    expect(applyRounding(7.4, "nearest_whole")).toBe(7);
    expect(applyRounding(7.1, "round_up")).toBe(8);
    expect(applyRounding(7.9, "round_down")).toBe(7);
  });

  it("leaves the value unchanged for 'none', an unknown rule, or no rule", () => {
    expect(applyRounding(7.33, "none")).toBe(7.33);
    expect(applyRounding(7.33, "something_else")).toBe(7.33);
    expect(applyRounding(7.33, null)).toBe(7.33);
  });
});

describe("serviceYears", () => {
  it("counts completed years on 31 December of the closing year", () => {
    expect(serviceYears("2020-03-15", 2026)).toBe(6);
    expect(serviceYears("2020-01-01", 2026)).toBe(6);
    expect(serviceYears("2020-12-31", 2026)).toBe(6);
  });

  it("gives zero for someone who joined during the closing year or later", () => {
    expect(serviceYears("2026-06-01", 2026)).toBe(0);
    expect(serviceYears("2027-02-01", 2026)).toBe(0);
  });
});

describe("findRule", () => {
  const rules = [
    { id: "a", leave_type_id: "annual", min_years: 0, max_years: 2, days_per_year: 18 },
    { id: "b", leave_type_id: "annual", min_years: "3", max_years: "5", days_per_year: 19 },
    { id: "c", leave_type_id: "annual", min_years: 6, max_years: null, days_per_year: 21 },
    { id: "s", leave_type_id: "sick", min_years: 0, max_years: null, days_per_year: 7 },
  ];

  it("finds the band containing the years of service, bounds included", () => {
    expect(findRule(rules, "annual", 0)?.id).toBe("a");
    expect(findRule(rules, "annual", 2)?.id).toBe("a");
    expect(findRule(rules, "annual", 3)?.id).toBe("b");
    expect(findRule(rules, "annual", 5)?.id).toBe("b");
  });

  it("treats a band with no maximum as open-ended", () => {
    expect(findRule(rules, "annual", 6)?.id).toBe("c");
    expect(findRule(rules, "annual", 30)?.id).toBe("c");
  });

  it("only considers rules of the requested leave type", () => {
    expect(findRule(rules, "sick", 4)?.id).toBe("s");
    expect(findRule(rules, "maternity", 4)).toBeNull();
  });

  it("returns nothing when the years fall in a gap between bands", () => {
    const gapped = [
      { leave_type_id: "annual", min_years: 0, max_years: 1 },
      { leave_type_id: "annual", min_years: 3, max_years: null },
    ];
    expect(findRule(gapped, "annual", 2)).toBeNull();
  });
});

describe("leaveTypeAppliesToProfile", () => {
  it("applies unrestricted leave types to everyone", () => {
    expect(leaveTypeAppliesToProfile({ gender_restriction: "all" }, { gender: "male" })).toBe(true);
    expect(leaveTypeAppliesToProfile({}, { gender: null })).toBe(true);
  });

  it("applies a restricted leave type only to the matching gender", () => {
    expect(leaveTypeAppliesToProfile({ gender_restriction: "female" }, { gender: "female" })).toBe(true);
    expect(leaveTypeAppliesToProfile({ gender_restriction: "female" }, { gender: "male" })).toBe(false);
  });

  it("does not apply a restricted leave type when the employee's gender is not recorded", () => {
    expect(leaveTypeAppliesToProfile({ gender_restriction: "female" }, { gender: null })).toBe(false);
  });
});

describe("includeLeaveTypeInGeneratedPreview", () => {
  const base = { is_active: true, seniority_based: false, max_days_per_year: 0, carryover_allowed: false };

  it("includes leave types with an entitlement or carryover", () => {
    expect(includeLeaveTypeInGeneratedPreview({ ...base, seniority_based: true })).toBe(true);
    expect(includeLeaveTypeInGeneratedPreview({ ...base, max_days_per_year: "18" })).toBe(true);
    expect(includeLeaveTypeInGeneratedPreview({ ...base, carryover_allowed: true })).toBe(true);
  });

  it("excludes leave types with nothing to allocate, and inactive ones", () => {
    expect(includeLeaveTypeInGeneratedPreview(base)).toBe(false);
    expect(includeLeaveTypeInGeneratedPreview({ ...base, max_days_per_year: 18, is_active: false })).toBe(false);
  });
});

describe("formatDate", () => {
  it("pads month and day", () => {
    expect(formatDate(2027, 3, 1)).toBe("2027-03-01");
    expect(formatDate(2027, 12, 31)).toBe("2027-12-31");
  });
});
