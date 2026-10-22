import { describe, expect, it } from "vitest";
import {
  INVOICE_MATCH_TRANSITIONS,
  PO_TRANSITIONS,
  PR_TRANSITIONS,
  RFQ_TRANSITIONS,
  availableTransitions,
  isTerminal,
  procErrorMessage,
  validateReason,
  type ProcDocKind,
  type ProcTransition,
} from "../procurement-transitions";

const allow = () => true;
const deny = () => false;
const ctx = (over: Partial<Parameters<typeof availableTransitions>[2]> = {}) => ({
  can: allow,
  userId: "u-actor",
  createdBy: "u-creator",
  submittedBy: "u-submitter",
  ...over,
});

const pairs = (list: ProcTransition[]) =>
  list.flatMap((t) => t.from.map((f) => `${f}>${t.to}`)).sort();

describe("transition tables mirror the SQL", () => {
  it("PR edges", () => {
    expect(pairs(PR_TRANSITIONS)).toEqual(
      [
        "draft>submitted", "returned>submitted",
        "submitted>under_budget_review",
        "submitted>approved", "under_budget_review>approved",
        "submitted>returned", "under_budget_review>returned",
        "submitted>rejected", "under_budget_review>rejected",
        "draft>cancelled", "returned>cancelled", "submitted>cancelled", "under_budget_review>cancelled",
        "approved>closed",
      ].sort(),
    );
  });

  it("PR permission fields, reasons and SoD", () => {
    const find = (from: string, to: string) =>
      PR_TRANSITIONS.find((t) => t.from.includes(from) && t.to === to)!;
    expect(find("draft", "submitted")).toMatchObject({ field: "submit", reasonRequired: false, sod: false });
    expect(find("submitted", "under_budget_review")).toMatchObject({ field: "approve", reasonRequired: false, sod: false });
    expect(find("submitted", "approved")).toMatchObject({ field: "approve", reasonRequired: true, minReasonLength: 20, sod: true });
    expect(find("under_budget_review", "approved")).toMatchObject({ field: "approve", sod: true, viaRpc: "confirm_budget" });
    expect(find("submitted", "returned")).toMatchObject({ field: "reject", reasonRequired: true });
    expect(find("under_budget_review", "rejected")).toMatchObject({ field: "reject", reasonRequired: true });
    expect(find("draft", "cancelled")).toMatchObject({ field: "edit", reasonRequired: true });
    expect(find("approved", "closed")).toMatchObject({ field: "edit", reasonRequired: false });
    expect(PR_TRANSITIONS.every((t) => t.resource === "pr")).toBe(true);
  });

  it("PO edges, fields, reasons and SoD", () => {
    expect(pairs(PO_TRANSITIONS)).toEqual(
      [
        "draft>submitted", "submitted>approved", "approved>issued", "submitted>draft",
        "draft>cancelled", "submitted>cancelled", "approved>cancelled",
        "delivered>closed", "under_invoice_match>closed",
      ].sort(),
    );
    const find = (from: string, to: string) =>
      PO_TRANSITIONS.find((t) => t.from.includes(from) && t.to === to)!;
    expect(find("draft", "submitted")).toMatchObject({ field: "submit", sod: false });
    expect(find("submitted", "approved")).toMatchObject({ field: "approve", sod: true });
    expect(find("approved", "issued")).toMatchObject({ field: "submit" });
    expect(find("submitted", "draft")).toMatchObject({ field: "reject", reasonRequired: true, label: "Return" });
    expect(find("approved", "cancelled")).toMatchObject({ field: "edit", reasonRequired: true });
    expect(find("delivered", "closed")).toMatchObject({ field: "edit", reasonRequired: false });
    expect(PO_TRANSITIONS.every((t) => t.resource === "po")).toBe(true);
  });

  it("PO has no delivery-status edges (those come from the sync only)", () => {
    const targets = PO_TRANSITIONS.map((t) => t.to);
    expect(targets).not.toContain("partially_delivered");
    expect(targets).not.toContain("delivered");
    expect(targets).not.toContain("under_invoice_match");
  });

  it("invoice match edges", () => {
    expect(pairs(INVOICE_MATCH_TRANSITIONS)).toEqual(
      [
        "pending>approved", "matched>approved", "variance_detected>approved",
        "pending>rejected", "matched>rejected", "variance_detected>rejected",
      ].sort(),
    );
    const approve = INVOICE_MATCH_TRANSITIONS.find((t) => t.to === "approved")!;
    const reject = INVOICE_MATCH_TRANSITIONS.find((t) => t.to === "rejected")!;
    expect(approve).toMatchObject({ resource: "invoice", field: "approve", sod: true, reasonRequired: false });
    expect(reject).toMatchObject({ resource: "invoice", field: "reject", sod: false, reasonRequired: true });
  });

  it("RFQ edges, fields and reasons", () => {
    expect(pairs(RFQ_TRANSITIONS)).toEqual(
      [
        "draft>issued", "issued>quotations_received", "quotations_received>under_evaluation",
        "draft>cancelled", "issued>cancelled", "quotations_received>cancelled", "under_evaluation>cancelled",
        "issued>rejected_all", "quotations_received>rejected_all", "under_evaluation>rejected_all",
      ].sort(),
    );
    const find = (from: string, to: string) =>
      RFQ_TRANSITIONS.find((t) => t.from.includes(from) && t.to === to)!;
    expect(find("draft", "issued")).toMatchObject({ field: "submit", reasonRequired: false });
    expect(find("issued", "quotations_received")).toMatchObject({ field: "edit", reasonRequired: false });
    expect(find("quotations_received", "under_evaluation")).toMatchObject({ field: "edit" });
    expect(find("draft", "cancelled")).toMatchObject({ field: "edit", reasonRequired: true });
    expect(find("issued", "rejected_all")).toMatchObject({ field: "reject", reasonRequired: true });
    expect(RFQ_TRANSITIONS.map((t) => t.to)).not.toContain("awarded");
    expect(RFQ_TRANSITIONS.every((t) => t.sod === false && t.resource === "rfq")).toBe(true);
  });

  it("only the budget-review approve edge goes via the RPC", () => {
    const all = [...PR_TRANSITIONS, ...PO_TRANSITIONS, ...INVOICE_MATCH_TRANSITIONS, ...RFQ_TRANSITIONS];
    expect(all.filter((t) => t.viaRpc).map((t) => `${t.from.join(",")}>${t.to}`)).toEqual([
      "under_budget_review>approved",
    ]);
  });
});

describe("availableTransitions", () => {
  const tos = (kind: ProcDocKind, status: string, c = ctx()) =>
    availableTransitions(kind, status, c).map((t) => t.to).sort();

  it("returns every edge from the status when all permissions are held", () => {
    expect(tos("pr", "draft")).toEqual(["cancelled", "submitted"]);
    expect(tos("pr", "submitted")).toEqual(["approved", "cancelled", "rejected", "returned", "under_budget_review"]);
    expect(tos("po", "approved")).toEqual(["cancelled", "issued"]);
    expect(tos("rfq", "issued")).toEqual(["cancelled", "quotations_received", "rejected_all"]);
    expect(tos("invoice_match", "variance_detected")).toEqual(["approved", "rejected"]);
  });

  it("filters by permission resource and field", () => {
    const only = (resource: string, field: string) => ({
      can: (r: string, f: string) => r === resource && f === field,
    }) as never;
    expect(availableTransitions("pr", "draft", ctx(only("pr", "submit"))).map((t) => t.to)).toEqual(["submitted"]);
    expect(availableTransitions("pr", "draft", ctx(only("pr", "edit"))).map((t) => t.to)).toEqual(["cancelled"]);
    expect(availableTransitions("po", "submitted", ctx(only("po", "reject"))).map((t) => t.to)).toEqual(["draft"]);
    expect(availableTransitions("invoice_match", "pending", ctx(only("invoice", "reject"))).map((t) => t.to)).toEqual(["rejected"]);
    expect(tos("pr", "draft", ctx({ can: deny }))).toEqual([]);
  });

  it("SoD drops approve for the creator", () => {
    const c = ctx({ userId: "u-creator" });
    expect(tos("pr", "submitted", c)).toEqual(["cancelled", "rejected", "returned", "under_budget_review"]);
    expect(tos("po", "submitted", c)).not.toContain("approved");
    expect(tos("invoice_match", "pending", c)).toEqual(["rejected"]);
  });

  it("SoD drops approve for the submitter", () => {
    const c = ctx({ userId: "u-submitter" });
    expect(tos("pr", "submitted", c)).not.toContain("approved");
    expect(tos("pr", "under_budget_review", c)).not.toContain("approved");
    expect(tos("po", "submitted", c)).not.toContain("approved");
    // non-SoD edges stay available to them
    expect(tos("pr", "submitted", c)).toContain("under_budget_review");
    expect(tos("pr", "submitted", c)).toContain("returned");
  });

  it("SoD keeps approve for a different user, and when author/submitter are unknown", () => {
    expect(tos("pr", "submitted")).toContain("approved");
    expect(tos("po", "submitted")).toContain("approved");
    expect(tos("po", "submitted", ctx({ createdBy: null, submittedBy: undefined, userId: "u-creator" }))).toContain("approved");
    expect(tos("po", "submitted", ctx({ userId: null }))).toContain("approved");
  });

  it("includes the confirm_budget edge from under_budget_review", () => {
    const t = availableTransitions("pr", "under_budget_review", ctx()).find((x) => x.to === "approved");
    expect(t?.viaRpc).toBe("confirm_budget");
  });

  it("returns nothing for unknown, empty or terminal statuses", () => {
    expect(availableTransitions("pr", "nonsense", ctx())).toEqual([]);
    expect(availableTransitions("pr", null, ctx())).toEqual([]);
    expect(availableTransitions("pr", undefined, ctx())).toEqual([]);
    expect(availableTransitions("pr", "rejected", ctx())).toEqual([]);
    expect(availableTransitions("po", "closed", ctx())).toEqual([]);
    expect(availableTransitions("invoice_match", "approved", ctx())).toEqual([]);
    expect(availableTransitions("rfq", "awarded", ctx())).toEqual([]);
    expect(availableTransitions("po", "partially_delivered", ctx())).toEqual([]);
  });
});

describe("isTerminal", () => {
  it.each([
    ["pr", "rejected"], ["pr", "cancelled"], ["pr", "closed"],
    ["po", "cancelled"], ["po", "closed"],
    ["invoice_match", "approved"], ["invoice_match", "rejected"],
    ["rfq", "awarded"], ["rfq", "rejected_all"], ["rfq", "cancelled"],
  ] as [ProcDocKind, string][])("%s %s is terminal", (kind, status) => {
    expect(isTerminal(kind, status)).toBe(true);
  });

  it.each([
    ["pr", "draft"], ["pr", "returned"], ["pr", "approved"], ["pr", "under_budget_review"],
    ["po", "draft"], ["po", "delivered"], ["po", "under_invoice_match"],
    ["invoice_match", "pending"], ["invoice_match", "variance_detected"],
    ["rfq", "draft"], ["rfq", "under_evaluation"],
  ] as [ProcDocKind, string][])("%s %s is not terminal", (kind, status) => {
    expect(isTerminal(kind, status)).toBe(false);
  });

  it("is false for empty status, and kinds do not leak into each other", () => {
    expect(isTerminal("pr", null)).toBe(false);
    expect(isTerminal("pr", undefined)).toBe(false);
    expect(isTerminal("po", "rejected")).toBe(false);
    expect(isTerminal("pr", "approved")).toBe(false);
  });

  it("terminal statuses have no outgoing edges in any table", () => {
    const tables: [ProcDocKind, ProcTransition[]][] = [
      ["pr", PR_TRANSITIONS], ["po", PO_TRANSITIONS],
      ["invoice_match", INVOICE_MATCH_TRANSITIONS], ["rfq", RFQ_TRANSITIONS],
    ];
    for (const [kind, table] of tables) {
      for (const t of table) for (const f of t.from) expect(isTerminal(kind, f)).toBe(false);
    }
  });
});

describe("validateReason", () => {
  const plain = PR_TRANSITIONS.find((t) => t.to === "rejected")!;
  const override = PR_TRANSITIONS.find((t) => t.from.includes("submitted") && t.to === "approved")!;
  const optional = PR_TRANSITIONS.find((t) => t.to === "under_budget_review")!;

  it("accepts anything when no reason is required", () => {
    expect(validateReason(optional, null)).toBeNull();
    expect(validateReason(optional, "")).toBeNull();
  });

  it("requires a non-blank reason when required", () => {
    expect(validateReason(plain, null)).toMatch(/required/i);
    expect(validateReason(plain, undefined)).toMatch(/required/i);
    expect(validateReason(plain, "")).toMatch(/required/i);
    expect(validateReason(plain, "   \n ")).toMatch(/required/i);
    expect(validateReason(plain, "x")).toBeNull();
  });

  it("override approve needs at least 20 trimmed characters", () => {
    expect(validateReason(override, "too short")).toMatch(/at least 20/);
    expect(validateReason(override, "a".repeat(19))).toMatch(/at least 20/);
    expect(validateReason(override, "   " + "a".repeat(19) + "   ")).toMatch(/at least 20/);
    expect(validateReason(override, "a".repeat(20))).toBeNull();
    expect(validateReason(override, "  " + "a".repeat(20) + "  ")).toBeNull();
  });
});

describe("procErrorMessage", () => {
  const msg = (m: string) => procErrorMessage({ message: m });

  it("maps SoD to the friendly sentence", () => {
    expect(msg("PROC_SOD_VIOLATION: you created this purchase order, so you cannot approve it")).toBe(
      "You can't approve a document you created or submitted.",
    );
  });

  it("maps each code", () => {
    expect(msg("PROC_NOT_AUTHENTICATED: sign in to continue")).toMatch(/session/i);
    expect(msg("PROC_NOT_FOUND: purchase order not found")).toMatch(/no longer exists/i);
    expect(msg("PROC_INVALID_TRANSITION: a PR in status draft cannot move to closed")).toMatch(/current status/i);
    expect(msg("PROC_FORBIDDEN: you do not have approve permission on procurement pr")).toMatch(/permission/i);
    expect(msg("PROC_REASON_REQUIRED: a reason is required for this action")).toMatch(/reason is required/i);
    expect(msg("PROC_REASON_REQUIRED: a variance explanation is required before approving")).toMatch(/variance/i);
    expect(msg("PROC_REASON_TOO_SHORT: the reason must be at least 20 characters")).toBe(
      "The reason must be at least 20 characters.",
    );
    expect(msg("PROC_VALIDATION: scores must be between 0 and 100")).toBe("Scores must be between 0 and 100");
    expect(msg("PROC_TRANSITION_RPC_ONLY: change procurement_prs status through its procurement function")).toMatch(/workflow actions/i);
    expect(msg("PROC_LOCKED: header is locked")).toMatch(/can no longer be edited/i);
  });

  it("handles a code with no mapping by showing its detail", () => {
    expect(msg("PROC_SOMETHING_NEW: odd failure")).toBe("Odd failure");
  });

  it("falls back to the raw message for non-PROC errors", () => {
    expect(msg("The reason must be at least 20 characters because x")).toBe(
      "The reason must be at least 20 characters because x",
    );
    expect(msg("duplicate key value violates unique constraint")).toBe(
      "duplicate key value violates unique constraint",
    );
  });

  it("maps row-level security errors to a permission message", () => {
    expect(msg('new row violates row-level security policy for table "procurement_prs"')).toBe("You don't have permission to do that.");
    expect(msg("row-level security check failed")).toBe("You don't have permission to do that.");
  });

  it("handles null, undefined and empty errors", () => {
    expect(procErrorMessage(null)).toMatch(/something went wrong/i);
    expect(procErrorMessage(undefined)).toMatch(/something went wrong/i);
    expect(procErrorMessage({})).toMatch(/something went wrong/i);
    expect(procErrorMessage({ message: "  " })).toMatch(/something went wrong/i);
  });
});
