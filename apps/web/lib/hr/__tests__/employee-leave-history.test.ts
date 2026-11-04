import { describe, expect, it } from "vitest";
import { canViewLeaveHistory } from "../employee-leave-history";

describe("canViewLeaveHistory", () => {
  it("allows a legacy admin profile", () => {
    expect(canViewLeaveHistory("admin", [])).toBe(true);
  });

  it("allows the admin RBAC role", () => {
    expect(canViewLeaveHistory("viewer", ["admin"])).toBe(true);
  });

  it("allows owner accounts (L0 Super Admin, L1 Managing Director)", () => {
    expect(canViewLeaveHistory("viewer", ["L0"])).toBe(true);
    expect(canViewLeaveHistory(null, ["L1"])).toBe(true);
  });

  it("denies HR managers, other levels and plain staff", () => {
    expect(canViewLeaveHistory("viewer", ["HR_Manager"])).toBe(false);
    expect(canViewLeaveHistory("project_manager", ["L2", "L3"])).toBe(false);
    expect(canViewLeaveHistory("department_manager", ["L4", "HR"])).toBe(false);
    expect(canViewLeaveHistory(undefined, [])).toBe(false);
  });
});
