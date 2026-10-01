import { describe, expect, it } from "vitest";
import {
  computeApprovalChainFromData,
  getTopInternalRole,
  type ProfileData,
  type RoleData,
} from "../approval-chain";

const person = (id: string, report_to: string | null = null): ProfileData => ({
  id,
  full_name: `Person ${id}`,
  email: `${id}@example.test`,
  report_to,
});
const level = (n: number): RoleData => ({ code: `L${n}`, name: `Level ${n}`, level: n, type: "internal_level" });
const functional = (code: string): RoleData => ({ code, name: code, level: null, type: "functional" });

const supervisor = person("supervisor");
const manager = person("manager");
const hr = person("hr");
const profileMap = new Map([supervisor, manager, hr].map((p) => [p.id, p]));
const roleHolders = new Map<string, ProfileData>([
  ["L4", manager],
  ["HR_Manager", hr],
]);

const chain = (
  profile: ProfileData,
  roles: RoleData[],
  a1: string | null = null,
  a2: string | null = null,
  holders = roleHolders,
) => computeApprovalChainFromData(profile, roles, a1, a2, profileMap, holders);

describe("getTopInternalRole", () => {
  it("picks the most senior internal level and ignores functional roles", () => {
    expect(getTopInternalRole([level(6), functional("HR"), level(4)])?.code).toBe("L4");
    expect(getTopInternalRole([functional("HR")])).toBeNull();
  });
});

describe("leave approval chain", () => {
  it("routes staff (L6) to their direct supervisor, then HR", () => {
    const result = chain(person("staff", "supervisor"), [level(6)]);
    expect(result.firstApprover).toMatchObject({ id: "supervisor", roleLabel: "Direct Supervisor" });
    expect(result.finalApprover).toMatchObject({ id: "hr", roleLabel: "HR Manager" });
    expect(result.source).toBe("auto");
  });

  it("routes other levels to the holder of the level above, then HR", () => {
    const result = chain(person("senior"), [level(5)]);
    expect(result.firstApprover).toMatchObject({ id: "manager", roleLabel: "L4 · Department Manager" });
    expect(result.finalApprover?.id).toBe("hr");
  });

  it("routes staff with no supervisor recorded to the level above", () => {
    const result = chain(person("staff"), [level(6)]);
    expect(result.firstApprover?.roleLabel).toBe("L5 · Senior Engineer");
    expect(result.firstApprover?.id).toBeNull();
  });

  it("keeps the approver slot, unfilled, when nobody holds the role", () => {
    const result = chain(person("senior"), [level(5)], null, null, new Map());
    expect(result.firstApprover).toEqual({ id: null, full_name: null, email: null, roleLabel: "L4 · Department Manager" });
    expect(result.finalApprover).toEqual({ id: null, full_name: null, email: null, roleLabel: "HR Manager" });
  });

  it("excludes the super admin (L0) from the approval flow", () => {
    const result = chain(person("root"), [level(0)]);
    expect(result).toMatchObject({ isExcluded: true, firstApprover: null, finalApprover: null });
  });

  it("sends people with only functional roles straight to HR", () => {
    const result = chain(person("temp"), [functional("PO")]);
    expect(result).toMatchObject({ isFunctionalOnly: true, firstApprover: null, myRoleLevel: null });
    expect(result.finalApprover?.id).toBe("hr");
  });

  it("uses manually assigned approvers when set", () => {
    const result = chain(person("staff", "supervisor"), [level(6)], "manager", "supervisor");
    expect(result.source).toBe("manual");
    expect(result.firstApprover).toMatchObject({ id: "manager", roleLabel: "Manual Assignment" });
    expect(result.finalApprover).toMatchObject({ id: "supervisor", roleLabel: "Manual Assignment" });
  });

  it("falls back to HR as final approver when only the first is assigned manually", () => {
    const result = chain(person("staff"), [level(6)], "manager", null);
    expect(result.firstApprover?.id).toBe("manager");
    expect(result.finalApprover?.id).toBe("hr");
  });
});
