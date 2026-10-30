import { describe, expect, it } from "vitest";
import {
  commissioningState, coordinationLogState, itpInspectionType, itpState, overallState, stateCounts, submittalState,
} from "../requirement-status";

describe("requirement status", () => {
  it("groups submittal consultant statuses", () => {
    expect(submittalState("code_a_approved")).toBe("done");
    expect(submittalState("code_b_approved_as_noted")).toBe("done");
    expect(submittalState("code_c_revise_resubmit")).toBe("resubmit");
    expect(submittalState("code_d_rejected")).toBe("resubmit");
    expect(submittalState("under_review")).toBe("in_progress");
    expect(submittalState("draft")).toBe("in_progress");
    expect(submittalState("code_e_for_information")).toBe("in_progress");
  });

  it("an ITP line is done when its ITP is closed", () => {
    expect(itpState("closed")).toBe("done");
    expect(itpState("active")).toBe("in_progress");
    expect(itpState("draft")).toBe("in_progress");
  });

  it("groups Design commissioning and coordination log statuses", () => {
    expect(commissioningState("passed")).toBe("done");
    expect(commissioningState("closed")).toBe("done");
    expect(commissioningState("failed")).toBe("resubmit");
    expect(commissioningState("scheduled")).toBe("in_progress");
    expect(coordinationLogState("resolved")).toBe("done");
    expect(coordinationLogState("open")).toBe("in_progress");
    expect(coordinationLogState("cancelled")).toBeNull();
  });

  it("takes the best state of the records", () => {
    expect(overallState([])).toBe("missing");
    expect(overallState(["resubmit"])).toBe("resubmit");
    expect(overallState(["resubmit", "in_progress"])).toBe("in_progress");
    expect(overallState(["resubmit", "done", "in_progress"])).toBe("done");
  });

  it("counts states", () => {
    expect(stateCounts(["done", "missing", "missing"])).toEqual({ missing: 2, resubmit: 0, in_progress: 0, done: 1 });
  });

  it("maps T&C types to ITP inspection types", () => {
    expect(itpInspectionType("inspection")).toBe("hold");
    expect(itpInspectionType("test")).toBe("witness");
    expect(itpInspectionType("commissioning")).toBe("witness");
  });
});
