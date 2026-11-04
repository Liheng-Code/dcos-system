import { describe, expect, it } from "vitest";
import { exposureTotals, milestoneStatus, type ContractMilestone, type MilestoneTask } from "../contract-milestones";

const m = (over: Partial<ContractMilestone> = {}): ContractMilestone => ({
  id: "m", project_id: "p", code: "PC", name: "Practical completion", kind: "practical_completion", contract_date: "2027-06-30",
  revised_date: null, revision_ref: null, task_id: "t", ld_rate: 1000, ld_currency: "USD", ld_cap: 25000, clause_ref: null, notes: null, sort_order: 1,
  ...over,
});
const t = (over: Partial<MilestoneTask> = {}): MilestoneTask => ({
  id: "t", task_code: "M100", task_name: "Completion", start_date: "2027-07-10", end_date: "2027-07-10", baseline_start_date: null,
  baseline_finish_date: "2027-06-25", actual_start_date: null, actual_finish_date: null, progress: 0, ...over,
});

describe("contract milestone status (doc 35 I1)", () => {
  it("forecast late: calendar days past the date, damages capped", () => {
    expect(milestoneStatus(m(), t())).toMatchObject({ due: "2027-06-30", forecast: "2027-07-10", variance: 10, exposure: 10000, state: "late", baseline: "2027-06-25" });
    expect(milestoneStatus(m(), t({ end_date: "2027-08-30" })).exposure).toBe(25000);
  });

  it("an approved extension moves the due date", () => {
    expect(milestoneStatus(m({ revised_date: "2027-07-15", revision_ref: "EOT-1" }), t())).toMatchObject({ due: "2027-07-15", variance: -5, exposure: 0, state: "at_risk" });
  });

  it("achieved, achieved late, on track, no activity", () => {
    expect(milestoneStatus(m(), t({ actual_finish_date: "2027-06-28", progress: 100 })).state).toBe("achieved");
    expect(milestoneStatus(m(), t({ actual_finish_date: "2027-07-02", progress: 100 }))).toMatchObject({ state: "achieved_late", exposure: 2000 });
    expect(milestoneStatus(m(), t({ end_date: "2027-05-01" })).state).toBe("on_track");
    expect(milestoneStatus(m({ task_id: null }), null).state).toBe("no_activity");
  });

  it("commencement and access use the activity's start", () => {
    expect(milestoneStatus(m({ kind: "access", contract_date: "2027-07-01" }), t({ start_date: "2027-07-03", end_date: "2027-09-01" })))
      .toMatchObject({ byStart: true, forecast: "2027-07-03", variance: 2 });
    expect(milestoneStatus(m({ kind: "commencement" }), t({ progress: 10, start_date: "2027-06-01" })).achieved).toBe("2027-06-01");
  });

  it("totals exposure by currency, incurred apart from forecast", () => {
    const rows = [
      { m: m(), s: milestoneStatus(m(), t()) },
      { m: m({ id: "2" }), s: milestoneStatus(m(), t({ actual_finish_date: "2027-07-02", progress: 100 })) },
    ];
    expect(exposureTotals(rows)).toEqual([{ currency: "USD", forecast: 10000, incurred: 2000 }]);
  });
});
