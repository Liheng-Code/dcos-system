import { describe, expect, it } from "vitest";
import { daysUntil, packageUrgency, urgencyCounts } from "../package-plan-rules";

const today = "2026-11-04";

describe("package plan rules", () => {
  it("counts days to a date", () => {
    expect(daysUntil("2026-11-04", today)).toBe(0);
    expect(daysUntil("2026-11-18", today)).toBe(14);
    expect(daysUntil("2026-11-01", today)).toBe(-3);
  });

  it("ranks urgency by coverage, then the order-by date", () => {
    expect(packageUrgency({ coverage: "covered", order_by: "2026-10-01" }, today)).toBe("covered");
    expect(packageUrgency({ coverage: "no_pr", order_by: "2026-11-03" }, today)).toBe("overdue");
    expect(packageUrgency({ coverage: "pr_late", order_by: "2026-11-18" }, today)).toBe("due_soon");
    expect(packageUrgency({ coverage: "no_pr", order_by: "2026-11-19" }, today)).toBe("planned");
  });

  it("summarises a plan", () => {
    expect(urgencyCounts([
      { coverage: "no_pr", order_by: "2026-11-01", is_long_lead: true },
      { coverage: "covered", order_by: "2026-11-01", is_long_lead: true },
      { coverage: "no_pr", order_by: "2027-01-01", is_long_lead: false },
    ], today)).toEqual({ overdue: 1, due_soon: 0, planned: 1, covered: 1, long_lead: 2 });
  });
});
