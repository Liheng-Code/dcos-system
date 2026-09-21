import { describe, expect, it } from "vitest";
import {
  CONSTRAINT_KINDS,
  CONSTRAINT_STATUSES,
  documentStatusToConstraint,
  prApprovalStatusToConstraint,
  poStatusToConstraint,
  rfiStatusToConstraint,
  inspectionResultToConstraint,
  isHoldPoint,
} from "../constraint-feed-mapping";

describe("documentStatusToConstraint (documents → 'drawings')", () => {
  it("maps issue and approval states", () => {
    expect(documentStatusToConstraint("approved")).toEqual({ status: "ok" });
    expect(documentStatusToConstraint("ifc")).toEqual({ status: "ok" });
    expect(documentStatusToConstraint("submitted")).toEqual({ status: "pending" });
    expect(documentStatusToConstraint("under_review")).toEqual({ status: "pending" });
    expect(documentStatusToConstraint("approved_with_comment")).toEqual({ status: "pending" });
    expect(documentStatusToConstraint("draft")).toEqual({ status: "missing" });
    expect(documentStatusToConstraint("rejected")).toEqual({ status: "missing" });
  });

  it("leaves superseded and archived rows untouched (feed contract)", () => {
    expect(documentStatusToConstraint("superseded")).toBeNull();
    expect(documentStatusToConstraint("archived")).toBeNull();
  });

  it("covers every status the documents CHECK allows", () => {
    for (const s of [
      "draft",
      "submitted",
      "under_review",
      "approved",
      "approved_with_comment",
      "rejected",
      "ifc",
      "superseded",
      "archived",
    ]) {
      expect(
        documentStatusToConstraint(s) === null ||
          ["ok", "pending", "missing"].includes(documentStatusToConstraint(s)!.status),
      ).toBe(true);
    }
  });
});

describe("prApprovalStatusToConstraint (procurement_prs → 'materials')", () => {
  it("maps decisive approval states", () => {
    expect(prApprovalStatusToConstraint("approved")).toEqual({
      status: "pending",
      notes: "PR approved",
    });
    expect(prApprovalStatusToConstraint("rejected")!.status).toBe("missing");
    expect(prApprovalStatusToConstraint("cancelled")!.status).toBe("missing");
    expect(prApprovalStatusToConstraint("closed")!.status).toBe("missing");
    expect(prApprovalStatusToConstraint("returned")!.status).toBe("missing");
  });

  it("returns null while the request is still in-flight", () => {
    expect(prApprovalStatusToConstraint("draft")).toBeNull();
    expect(prApprovalStatusToConstraint("submitted")).toBeNull();
    expect(prApprovalStatusToConstraint("under_budget_review")).toBeNull();
  });
});

describe("poStatusToConstraint (procurement_pos → 'materials')", () => {
  it("maps delivery states", () => {
    expect(poStatusToConstraint("delivered")).toEqual({ status: "ok", notes: "PO delivered" });
    expect(poStatusToConstraint("issued")!.status).toBe("pending");
    expect(poStatusToConstraint("approved")!.status).toBe("pending");
    expect(poStatusToConstraint("partially_delivered")!.status).toBe("pending");
    expect(poStatusToConstraint("on_hold")!.status).toBe("missing");
    expect(poStatusToConstraint("cancelled")!.status).toBe("missing");
    expect(poStatusToConstraint("draft")).toBeNull();
    expect(poStatusToConstraint("submitted")).toBeNull();
    expect(poStatusToConstraint("closed")).toBeNull();
  });
});

describe("rfiStatusToConstraint (design_rfi → 'permits')", () => {
  it("opens the hold when an RFI is open and frees it on resolution", () => {
    expect(rfiStatusToConstraint("open")).toMatchObject({ opening: true, live: "missing" });
    for (const s of ["responded", "accepted", "closed"]) {
      expect(rfiStatusToConstraint(s)).toMatchObject({ opening: false, closing: true });
    }
  });
});

describe("inspectionResultToConstraint (inspection_results → 'permits')", () => {
  it("blocks on fail/pending, unblocks on pass/na, ignores nulls", () => {
    expect(inspectionResultToConstraint("fail")).toMatchObject({ constrains: true });
    expect(inspectionResultToConstraint("pending")).toMatchObject({ constrains: true });
    expect(inspectionResultToConstraint("pass")).toMatchObject({ constrains: false });
    expect(inspectionResultToConstraint("na")).toMatchObject({ constrains: false });
    expect(inspectionResultToConstraint(null)).toBeNull();
  });

  it("treats only hold points as gates", () => {
    expect(isHoldPoint("hold")).toBe(true);
    expect(isHoldPoint("witness")).toBe(false);
    expect(isHoldPoint("review")).toBe(false);
  });
});

describe("vocabulary stability", () => {
  it("keeps the six kinds and four statuses the readiness board relies on", () => {
    expect(CONSTRAINT_KINDS).toContain("drawings");
    expect(CONSTRAINT_KINDS).toContain("materials");
    expect(CONSTRAINT_KINDS).toContain("permits");
    expect(CONSTRAINT_STATUSES).toEqual(["ok", "missing", "unknown", "pending"]);
    expect(CONSTRAINT_KINDS).toHaveLength(6);
  });
});