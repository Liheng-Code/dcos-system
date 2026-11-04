import { describe, expect, it } from "vitest";
import { diffFeed, rowFlag, weeklyHeadcount, type ManpowerRow, type MaterialRow, type SubmissionRow } from "../feed-model";

const mat = (over: Partial<MaterialRow> = {}): MaterialRow => ({
  key: "t1:r1", task_id: "t1", task_code: "A", task_name: "Slab", wbs_code: "01", kind: "material", resource_id: "r1", resource_code: "C30",
  resource: "Concrete C30", unit: "m3", quantity: 12, start: "2026-12-01", finish: "2026-12-05", required_on_site: "2026-11-28",
  lead_time_days: 14, lead_time_source: "default", order_by: "2026-11-14", pr_numbers: null, pr_required_date: null, coverage: "no_pr", ...over,
});

describe("outbound feeds (doc 35 I3-I7)", () => {
  it("flags materials by order date and coverage", () => {
    expect(rowFlag("materials", mat(), "2026-11-03")).toBe("warn");
    expect(rowFlag("materials", mat(), "2026-11-20")).toBe("overdue");
    expect(rowFlag("materials", mat({ order_by: "2027-02-01" }), "2026-11-03")).toBeNull();
    expect(rowFlag("materials", mat({ coverage: "covered", pr_numbers: "PR-1" }), "2026-11-20")).toBe("done");
    expect(rowFlag("materials", mat({ coverage: "pr_late", order_by: "2027-02-01" }), "2026-11-03")).toBe("overdue");
  });

  it("flags submissions that are late to register or targeted too late", () => {
    const s: SubmissionRow = {
      key: "shop_drawing:x", kind: "shop_drawing", item_id: "x", item_code: "SD-1", item: "Rebar", first_task: "A", first_start: "2026-12-31",
      activities: 2, approve_by: "2026-12-24", submit_by: "2026-12-10", submittal_numbers: null, target_submission_date: null,
      actual_submission_date: null, state: "not_registered",
    };
    expect(rowFlag("submissions", s, "2026-12-11")).toBe("overdue");
    expect(rowFlag("submissions", { ...s, state: "submitted" }, "2026-12-11")).toBeNull();
    expect(rowFlag("submissions", { ...s, state: "target_late" }, "2026-11-01")).toBe("overdue");
  });

  it("diffs the programme's demands, not the receiving module's records", () => {
    const pub = [mat(), mat({ key: "t2:r1", task_id: "t2" })];
    const live = [
      mat({ coverage: "covered", pr_numbers: "PR-1", pr_required_date: "2026-11-20" }), // a PR raised: not a programme change
      mat({ key: "t3:r1", task_id: "t3" }),
    ];
    expect(diffFeed(pub, live)).toEqual({ added: ["t3:r1"], removed: ["t2:r1"], changed: [] });
    expect(diffFeed(pub, [mat({ order_by: "2026-11-21" })]).changed).toEqual(["t1:r1"]);
    expect(diffFeed(null, [mat()]).added).toEqual(["t1:r1"]);
  });

  it("adds up headcount per week", () => {
    const r = (week: string, hours: number, headcount: number): ManpowerRow =>
      ({ key: `${week}:${hours}`, week, resource_id: "x", trade_code: null, trade: null, hours, working_days: 6, headcount });
    expect(weeklyHeadcount([r("2026-11-09", 48, 1), r("2026-11-02", 96, 2), r("2026-11-02", 48, 1)]))
      .toEqual([{ week: "2026-11-02", hours: 144, headcount: 3 }, { week: "2026-11-09", hours: 48, headcount: 1 }]);
  });
});
